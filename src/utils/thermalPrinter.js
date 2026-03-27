'use strict';

import { Platform, PermissionsAndroid, NativeEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BluetoothManager,
  BluetoothEscposPrinter,
  ALIGN,
} from 'tp-react-native-bluetooth-printer';

// ── Storage keys ─────────────────────────────────────────────────────────────
const BILL_PRINTER_KEY = '@dinesys_bill_printer';
const KOT_PRINTER_KEY = '@dinesys_kot_printer';

// ── Character widths by paper size ───────────────────────────────────────────
// Standard thermal printers: 58mm ≈ 32 chars, 80mm ≈ 48 chars (Font A)
function getCharsPerLine(sizeMm) {
  if (sizeMm <= 58) return 32;
  return 48;
}

// ── Permission helpers ───────────────────────────────────────────────────────
async function requestBluetoothPermissions() {
  if (Platform.OS !== 'android') return true;
  try {
    const apiLevel = Platform.Version;
    if (apiLevel >= 31) {
      // Android 12+
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(results).every(
        r => r === PermissionsAndroid.RESULTS.GRANTED,
      );
    } else {
      // Android < 12
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
  } catch {
    return false;
  }
}

// ── Bluetooth state ──────────────────────────────────────────────────────────
async function ensureBluetoothEnabled() {
  const isEnabled = await BluetoothManager.isBluetoothEnabled();
  if (!isEnabled) {
    await BluetoothManager.enableBluetooth();
  }
  return true;
}

// ── Scan for devices ─────────────────────────────────────────────────────────
async function scanDevices() {
  const hasPermission = await requestBluetoothPermissions();
  if (!hasPermission) throw new Error('Bluetooth permissions not granted');

  await ensureBluetoothEnabled();
  const result = await BluetoothManager.scanDevices();
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;

  const paired = (parsed.paired || []).map(d =>
    typeof d === 'string' ? JSON.parse(d) : d,
  );
  const found = (parsed.found || []).map(d =>
    typeof d === 'string' ? JSON.parse(d) : d,
  );

  // Filter out devices without names or addresses
  const allDevices = [...paired, ...found].filter(d => d.address && d.name);
  // Deduplicate by address
  const seen = new Set();
  const unique = [];
  for (const d of allDevices) {
    if (!seen.has(d.address)) {
      seen.add(d.address);
      unique.push({ ...d, paired: paired.some(p => p.address === d.address) });
    }
  }
  return unique;
}

// ── Connect to a device ──────────────────────────────────────────────────────
async function connectPrinter(address) {
  const hasPermission = await requestBluetoothPermissions();
  if (!hasPermission) throw new Error('Bluetooth permissions not granted');

  await ensureBluetoothEnabled();
  await BluetoothManager.connect(address);
  return true;
}

// ── Check if connected ───────────────────────────────────────────────────────
async function isConnected() {
  try {
    const device = await BluetoothManager.getConnectedDevice();
    return !!device;
  } catch {
    return false;
  }
}

// ── Save / load printer config ───────────────────────────────────────────────
async function savePrinter(type, device) {
  const key = type === 'kot' ? KOT_PRINTER_KEY : BILL_PRINTER_KEY;
  await AsyncStorage.setItem(key, JSON.stringify(device));
}

async function getSavedPrinter(type) {
  const key = type === 'kot' ? KOT_PRINTER_KEY : BILL_PRINTER_KEY;
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

async function removeSavedPrinter(type) {
  const key = type === 'kot' ? KOT_PRINTER_KEY : BILL_PRINTER_KEY;
  await AsyncStorage.removeItem(key);
}

// ── Auto-connect to saved printer ────────────────────────────────────────────
async function autoConnect(type) {
  const saved = await getSavedPrinter(type);
  if (!saved?.address) return false;
  try {
    await connectPrinter(saved.address);
    return true;
  } catch {
    return false;
  }
}

// ── Text formatting helpers ──────────────────────────────────────────────────
function padRight(str, len) {
  str = String(str);
  if (str.length >= len) return str.substring(0, len);
  return str + ' '.repeat(len - str.length);
}

function padLeft(str, len) {
  str = String(str);
  if (str.length >= len) return str.substring(str.length - len);
  return ' '.repeat(len - str.length) + str;
}

function padCenter(str, len) {
  str = String(str);
  if (str.length >= len) return str.substring(0, len);
  const leftPad = Math.floor((len - str.length) / 2);
  const rightPad = len - str.length - leftPad;
  return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
}

function dashLine(lineWidth) {
  return '-'.repeat(lineWidth);
}

function fc(amt) {
  return parseFloat(amt || 0).toFixed(2);
}

// Wraps text into multiple lines if it exceeds maxWidth
function wrapText(text, maxWidth) {
  text = String(text || '');
  if (text.length <= maxWidth) return [text];
  const lines = [];
  let remaining = text;
  while (remaining.length > maxWidth) {
    // Try to break at last space within maxWidth
    let breakPoint = remaining.lastIndexOf(' ', maxWidth);
    if (breakPoint <= 0) breakPoint = maxWidth; // no space found, hard break
    lines.push(remaining.substring(0, breakPoint));
    remaining = remaining.substring(breakPoint).trimStart();
  }
  if (remaining.length > 0) lines.push(remaining);
  return lines;
}

// ── Print bill via ESC/POS ───────────────────────────────────────────────────
async function printBill(bill, restaurantName, sizeMm = 80) {
  if (!bill) return;

  const order = bill.order || {};
  const items = bill.items || [];
  const adjs = bill.adjustments || [];
  const bf = bill.billFormat || {};
  const taxBreakdown = bill.taxBreakdown || [];
  const enableTax = bill.enableTax !== false;

  const showName = bf.show_restaurant_name !== 0;
  const showAddr = bf.show_address !== 0;
  const showContact = bf.show_contact !== 0;
  const showGst = bf.show_gst !== 0;
  const showWaiter = bf.show_waiter_name !== 0;
  const showTable = bf.show_table_number !== 0;
  const showDate = bf.show_date_time !== 0;
  const showPayMode = bf.show_payment_mode !== 0;
  const showCustomer =
    bf.show_customer_details !== 0 ||
    !!(order.customer_name || order.customer_phone);
  const thankMsg = bf.thank_you_message || 'Thank you for dining with us!';
  const customHeader = bf.custom_header || '';
  const customFooter = bf.custom_footer || '';

  const W = getCharsPerLine(sizeMm);
  // Column widths for items table: Item | Qty | Rate | Total
  const colQty = 4;
  const colRate = sizeMm <= 58 ? 7 : 8;
  const colTotal = sizeMm <= 58 ? 8 : 9;
  const colItem = W - colQty - colRate - colTotal;

  await BluetoothEscposPrinter.printerInit();
  await BluetoothEscposPrinter.printerAlign(ALIGN.CENTER);

  // ── Header ──
  if (showName) {
    await BluetoothEscposPrinter.setBold(1);
    await BluetoothEscposPrinter.printText(
      `${restaurantName || order.restaurant_name || 'Restaurant'}\n`,
      { widthtimes: 1, heigthtimes: 1 },
    );
    await BluetoothEscposPrinter.setBold(0);
  }
  if (showAddr && order.address) {
    await BluetoothEscposPrinter.printText(`${order.address}\n`, {});
  }
  if (showContact && order.phone) {
    await BluetoothEscposPrinter.printText(`Ph: ${order.phone}\n`, {});
  }
  if (showGst && order.gstin) {
    await BluetoothEscposPrinter.printText(`GSTIN: ${order.gstin}\n`, {});
  }
  if (customHeader) {
    await BluetoothEscposPrinter.printText(`${customHeader}\n`, {});
  }

  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});

  // ── Delivery badge ──
  if (order.order_type === 'delivery') {
    await BluetoothEscposPrinter.setBold(1);
    await BluetoothEscposPrinter.printText('** DELIVERY **\n', {
      widthtimes: 1,
    });
    await BluetoothEscposPrinter.setBold(0);
  }

  // ── Order info ──
  await BluetoothEscposPrinter.printerAlign(ALIGN.LEFT);

  if (order.bill_number) {
    await BluetoothEscposPrinter.printText(
      `Bill #  : ${order.bill_number}\n`,
      {},
    );
  }
  await BluetoothEscposPrinter.printText(
    `Order   : ${order.order_number || ''}\n`,
    {},
  );
  if (showTable && order.table_number) {
    await BluetoothEscposPrinter.printText(
      `Table   : ${order.table_number}${order.floor_name ? ' - ' + order.floor_name : ''}\n`,
      {},
    );
  }
  if (showWaiter && order.waiter_name) {
    const role = order.waiter_role === 'waiter' ? 'Waiter' : 'Staff';
    await BluetoothEscposPrinter.printText(
      `${padRight(role, 8)}: ${order.waiter_name}\n`,
      {},
    );
  }
  if (showDate) {
    await BluetoothEscposPrinter.printText(
      `Date    : ${new Date(order.created_at).toLocaleString('en-IN')}\n`,
      {},
    );
  }
  if (showPayMode && order.payment_mode) {
    await BluetoothEscposPrinter.printText(
      `Paid via: ${(order.payment_mode || '').toUpperCase()}\n`,
      {},
    );
  }

  // ── Customer info ──
  if (showCustomer && (order.customer_name || order.customer_phone)) {
    await BluetoothEscposPrinter.printText(
      `Bill To : ${order.customer_name || 'Cash Customer'}\n`,
      {},
    );
    if (order.customer_phone) {
      await BluetoothEscposPrinter.printText(
        `Ph      : ${order.customer_phone}\n`,
        {},
      );
    }
  }

  // ── Delivery address ──
  if (order.order_type === 'delivery' && order.delivery_address) {
    await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});
    await BluetoothEscposPrinter.printText('Delivery Address:\n', {});
    const addrLines = wrapText(order.delivery_address, W);
    for (const line of addrLines) {
      await BluetoothEscposPrinter.printText(`${line}\n`, {});
    }
  }

  // ── Items header ──
  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});
  await BluetoothEscposPrinter.setBold(1);
  await BluetoothEscposPrinter.printColumn(
    [colItem, colQty, colRate, colTotal],
    [ALIGN.LEFT, ALIGN.CENTER, ALIGN.RIGHT, ALIGN.RIGHT],
    ['Item', 'Qty', 'Rate', 'Total'],
    {},
  );
  await BluetoothEscposPrinter.setBold(0);
  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});

  // ── Items ──
  for (const item of items) {
    const addons =
      typeof item.addon_details === 'string'
        ? JSON.parse(item.addon_details || '[]')
        : item.addon_details || [];
    const effectiveRate =
      parseFloat(item.item_price || 0) + parseFloat(item.addon_per_unit || 0);
    const itemName = item.item_name || '';
    const qtyStr = String(item.quantity);
    const rateStr = fc(effectiveRate);
    const totalStr = fc(item.line_total);

    // Wrap long item names
    const nameLines = wrapText(itemName, colItem);
    // First line with all columns
    await BluetoothEscposPrinter.printColumn(
      [colItem, colQty, colRate, colTotal],
      [ALIGN.LEFT, ALIGN.CENTER, ALIGN.RIGHT, ALIGN.RIGHT],
      [nameLines[0], qtyStr, rateStr, totalStr],
      {},
    );
    // Continuation lines for long names
    for (let k = 1; k < nameLines.length; k++) {
      await BluetoothEscposPrinter.printText(`  ${nameLines[k]}\n`, {});
    }

    // Addon line
    if (addons.length > 0) {
      const addonText = `  + ${addons.map(a => a.name).join(', ')}`;
      const addonLines = wrapText(addonText, W);
      for (const al of addonLines) {
        await BluetoothEscposPrinter.printText(`${al}\n`, {});
      }
    }
  }

  // ── Summary ──
  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});

  const summaryLabelW = W - colTotal;
  await BluetoothEscposPrinter.printColumn(
    [summaryLabelW, colTotal],
    [ALIGN.LEFT, ALIGN.RIGHT],
    ['Subtotal', fc(order.subtotal)],
    {},
  );

  for (const a of adjs || []) {
    const isDiscount = a.adjustment_type === 'discount';
    const label = `${a.label}${a.value_type === 'percentage' ? ` (${a.value}%)` : ''}`;
    const val = `${isDiscount ? '-' : '+'}${fc(a.applied_amount)}`;
    await BluetoothEscposPrinter.printColumn(
      [summaryLabelW, colTotal],
      [ALIGN.LEFT, ALIGN.RIGHT],
      [label, val],
      {},
    );
  }

  if (enableTax) {
    for (const t of taxBreakdown) {
      const label = `${t.label}${t.rate ? ` @ ${t.rate}%` : ''}`;
      await BluetoothEscposPrinter.printColumn(
        [summaryLabelW, colTotal],
        [ALIGN.LEFT, ALIGN.RIGHT],
        [label, fc(t.taxAmount)],
        {},
      );
    }
  }

  // ── Total ──
  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});
  await BluetoothEscposPrinter.setBold(1);
  await BluetoothEscposPrinter.printColumn(
    [summaryLabelW, colTotal],
    [ALIGN.LEFT, ALIGN.RIGHT],
    ['TOTAL', `Rs.${fc(order.total_amount)}`],
    { widthtimes: 1 },
  );
  await BluetoothEscposPrinter.setBold(0);
  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});

  // ── Footer ──
  await BluetoothEscposPrinter.printerAlign(ALIGN.CENTER);
  if (customFooter) {
    await BluetoothEscposPrinter.printText(`${customFooter}\n`, {});
  }
  await BluetoothEscposPrinter.printText(`${thankMsg}\n`, {});
  await BluetoothEscposPrinter.printText('\n\n', {});

  // Cut paper (if supported)
  try {
    await BluetoothEscposPrinter.cutLine(1);
  } catch {
    // Not all printers support auto-cut
  }
}

// ── Print KOT via ESC/POS ────────────────────────────────────────────────────
async function printKOT(orderNumber, tableLabel, items, orderType = '', floorName = '', sizeMm = 80) {
  if (!items || !items.length) return;

  const W = getCharsPerLine(sizeMm);
  const colQty = 5;
  const colItem = W - colQty;

  await BluetoothEscposPrinter.printerInit();
  await BluetoothEscposPrinter.printerAlign(ALIGN.CENTER);

  // ── KOT Header (large, bold) ──
  await BluetoothEscposPrinter.setBold(1);
  await BluetoothEscposPrinter.printText('-- KOT --\n', {
    widthtimes: 1,
    heigthtimes: 1,
  });
  await BluetoothEscposPrinter.setBold(0);

  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});
  await BluetoothEscposPrinter.printerAlign(ALIGN.LEFT);

  // ── Order info ──
  await BluetoothEscposPrinter.printText(
    `Order : ${orderNumber || ''}\n`,
    {},
  );
  if (orderType) {
    await BluetoothEscposPrinter.setBold(1);
    await BluetoothEscposPrinter.printText(
      `Type  : ${(orderType || '').replace('_', ' ').toUpperCase()}\n`,
      {},
    );
    await BluetoothEscposPrinter.setBold(0);
  }
  if (tableLabel) {
    await BluetoothEscposPrinter.setBold(1);
    await BluetoothEscposPrinter.printText(
      `Table : ${floorName ? floorName + ' - ' : ''}T${tableLabel}\n`,
      {},
    );
    await BluetoothEscposPrinter.setBold(0);
  }
  await BluetoothEscposPrinter.printText(
    `Time  : ${new Date().toLocaleString('en-IN')}\n`,
    {},
  );

  // ── Items header ──
  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});
  await BluetoothEscposPrinter.setBold(1);
  await BluetoothEscposPrinter.printColumn(
    [colItem, colQty],
    [ALIGN.LEFT, ALIGN.CENTER],
    ['Item', 'Qty'],
    {},
  );
  await BluetoothEscposPrinter.setBold(0);
  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});

  // ── Items (large font for kitchen readability) ──
  for (const item of items) {
    const name = item.name || item.item_name || '';
    const qty = String(item.qty || item.quantity || 0);

    const nameLines = wrapText(name, colItem);
    await BluetoothEscposPrinter.setBold(1);
    await BluetoothEscposPrinter.printColumn(
      [colItem, colQty],
      [ALIGN.LEFT, ALIGN.CENTER],
      [nameLines[0], qty],
      {},
    );
    await BluetoothEscposPrinter.setBold(0);
    for (let k = 1; k < nameLines.length; k++) {
      await BluetoothEscposPrinter.printText(`  ${nameLines[k]}\n`, {});
    }

    // Addons
    const addons =
      typeof item.addon_details === 'string'
        ? JSON.parse(item.addon_details || '[]')
        : item.addon_details || [];
    if (addons.length > 0) {
      const addonText = `  + ${addons.map(a => a.name).join(', ')}`;
      const addonLines = wrapText(addonText, W);
      for (const al of addonLines) {
        await BluetoothEscposPrinter.printText(`${al}\n`, {});
      }
    }

    // Notes
    if (item.notes) {
      const noteLines = wrapText(`  ** ${item.notes}`, W);
      for (const nl of noteLines) {
        await BluetoothEscposPrinter.printText(`${nl}\n`, {});
      }
    }
  }

  // ── Footer ──
  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});
  await BluetoothEscposPrinter.printerAlign(ALIGN.CENTER);
  await BluetoothEscposPrinter.printText('--- Kitchen Order Ticket ---\n', {});
  await BluetoothEscposPrinter.printText('\n\n', {});

  try {
    await BluetoothEscposPrinter.cutLine(1);
  } catch {
    // Not all printers support auto-cut
  }
}

// ── Test print ───────────────────────────────────────────────────────────────
async function testPrint(sizeMm = 80) {
  const W = getCharsPerLine(sizeMm);
  await BluetoothEscposPrinter.printerInit();
  await BluetoothEscposPrinter.printerAlign(ALIGN.CENTER);
  await BluetoothEscposPrinter.setBold(1);
  await BluetoothEscposPrinter.printText('FineDyn POS\n', {
    widthtimes: 1,
    heigthtimes: 1,
  });
  await BluetoothEscposPrinter.setBold(0);
  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});
  await BluetoothEscposPrinter.printText('Printer Connected!\n', {});
  await BluetoothEscposPrinter.printText(`Paper: ${sizeMm}mm (${W} chars)\n`, {});
  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});

  // Test column alignment
  await BluetoothEscposPrinter.printColumn(
    [W - 12, 4, 8],
    [ALIGN.LEFT, ALIGN.CENTER, ALIGN.RIGHT],
    ['Sample Item', '2', '199.00'],
    {},
  );
  await BluetoothEscposPrinter.printColumn(
    [W - 12, 4, 8],
    [ALIGN.LEFT, ALIGN.CENTER, ALIGN.RIGHT],
    ['Another Item', '1', '99.50'],
    {},
  );

  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});
  await BluetoothEscposPrinter.setBold(1);
  await BluetoothEscposPrinter.printColumn(
    [W - 10, 10],
    [ALIGN.LEFT, ALIGN.RIGHT],
    ['TOTAL', 'Rs.497.50'],
    {},
  );
  await BluetoothEscposPrinter.setBold(0);
  await BluetoothEscposPrinter.printText(`${dashLine(W)}\n`, {});
  await BluetoothEscposPrinter.printerAlign(ALIGN.CENTER);
  await BluetoothEscposPrinter.printText('Test print successful!\n\n\n', {});

  try {
    await BluetoothEscposPrinter.cutLine(1);
  } catch {}
}

export default {
  scanDevices,
  connectPrinter,
  isConnected,
  savePrinter,
  getSavedPrinter,
  removeSavedPrinter,
  autoConnect,
  requestBluetoothPermissions,
  ensureBluetoothEnabled,
  printBill,
  printKOT,
  testPrint,
  getCharsPerLine,
};
