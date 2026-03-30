/**
 * Shared thermal-print HTML generators for Bill and KOT.
 * Supports any paper width (2-inch / 58mm, 3-inch / 80mm, 76mm, etc.)
 * Font sizes and column widths scale proportionally to the paper width.
 */

// ── Proportional sizing helper ──────────────────────────────────────────────
function getPrintSizes(sizeMm) {
  const s = Math.max(48, Math.min(sizeMm, 80));
  const scale = s / 80;
  const round = (base) => Math.max(7, Math.round(base * scale));

  return {
    fs:      round(11) + 'px',
    fsSmall: round(9)  + 'px',
    fsTd:    round(10) + 'px',
    fsBig:   round(15) + 'px',
    fsTot:   round(12) + 'px',
    fsDelivery: round(14) + 'px',
    fsKot:     round(12) + 'px',
    fsKotSmall: round(10) + 'px',
    fsKotBig:   round(18) + 'px',
    fsKotItem:  round(13) + 'px',
    colQty:   s <= 60 ? '14%' : '10%',
    colRate:  s <= 60 ? '22%' : '20%',
    colTotal: s <= 60 ? '24%' : '22%',
  };
}

function fc(amt) {
  return parseFloat(amt || 0).toFixed(2);
}

// ── Bill HTML generator ──────────────────────────────────────────────────────
export function generateBillHtml(bill, restaurantName, sizeMm = 80) {
  if (!bill) return '';
  const order = bill.order || {};
  const items = bill.items || [];
  const adjs = bill.adjustments || [];
  const bf = bill.billFormat || {};
  const taxBreakdown = bill.taxBreakdown || [];
  const enableTax = bill.enableTax !== false;
  const showLogo = bf.show_logo !== 0 && (order.logo_url || bf.logo_url);
  const logoUrl = order.logo_url || bf.logo_url;

  const showName    = bf.show_restaurant_name !== 0;
  const showAddr    = bf.show_address !== 0;
  const showContact = bf.show_contact !== 0;
  const showGst     = bf.show_gst !== 0;
  const showWaiter  = bf.show_waiter_name !== 0;
  const showTable   = bf.show_table_number !== 0;
  const showDate    = bf.show_date_time !== 0;
  const showPayMode = bf.show_payment_mode !== 0;
  const showCustomer = bf.show_customer_details !== 0 || !!(order.customer_name || order.customer_phone);
  const thankMsg     = bf.thank_you_message || 'Thank you for dining with us!';
  const customHeader = bf.custom_header || '';
  const customFooter = bf.custom_footer || '';
  const headerImageUrl = bf.header_image_url || '';
  const footerImageUrl = bf.footer_image_url || '';

  const sz = getPrintSizes(sizeMm);

  const itemRows = items.map(i => {
    const addons = typeof i.addon_details === 'string' ? JSON.parse(i.addon_details || '[]') : (i.addon_details || []);
    const addonLine = addons && addons.length > 0
      ? `<tr><td colspan="4" style="font-size:${sz.fsSmall};color:#666;padding-left:8px">+ ${addons.map(a => a.name).join(', ')}</td></tr>`
      : '';
    const effectiveRate = parseFloat(i.item_price || 0) + parseFloat(i.addon_per_unit || 0);
    return `<tr><td>${i.item_name}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">${fc(effectiveRate)}</td><td style="text-align:right">${fc(i.line_total)}</td></tr>${addonLine}`;
  }).join('');

  const summaryRows = [];
  summaryRows.push(`<tr><td colspan="3">Subtotal</td><td style="text-align:right">${fc(order.subtotal)}</td></tr>`);
  (adjs || []).forEach(a => {
    const isDiscount = a.adjustment_type === 'discount';
    summaryRows.push(`<tr><td colspan="3">${a.label}${a.value_type === 'percentage' ? ` (${a.value}%)` : ''}</td><td style="text-align:right">${isDiscount ? '-' : '+'}${fc(a.applied_amount)}</td></tr>`);
  });
  if (enableTax) {
    taxBreakdown.forEach(t => {
      summaryRows.push(`<tr><td colspan="3">${t.label}${t.rate ? ` @ ${t.rate}%` : ''}</td><td style="text-align:right">${fc(t.taxAmount)}</td></tr>`);
    });
  }

  const billToHtml = showCustomer && (order.customer_name || order.customer_phone)
    ? `<div style="margin:6px 0;font-size:${sz.fs}"><div><b>Bill To:</b> ${order.customer_name || 'Cash Customer'}</div>${order.customer_phone ? `<div><b>Ph:</b> ${order.customer_phone}</div>` : ''}</div>`
    : '';

  const deliveryHtml = order.order_type === 'delivery' && order.delivery_address
    ? `<div style="margin:4px 0;padding:4px 0;border-top:1px dashed #000;font-size:${sz.fs}"><div><b>Delivery Address:</b></div><div style="margin-top:2px">${order.delivery_address}</div></div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',Courier,monospace;font-size:${sz.fs};width:${sizeMm}mm;max-width:${sizeMm}mm;padding:2mm 3mm;color:#000;word-break:break-word;overflow-wrap:break-word;line-height:1.3}
  b{font-weight:bold}
  .ct{text-align:center}
  hr{border:none;border-top:1px dashed #000;margin:4px 0}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  td,th{padding:1px 0;vertical-align:top;font-size:${sz.fsTd}}
  img{max-height:60px}
  .items-tbl th:nth-child(1),.items-tbl td:nth-child(1){text-align:left;word-break:break-word;overflow-wrap:break-word;white-space:normal}
  .items-tbl th:nth-child(2),.items-tbl td:nth-child(2){text-align:center;width:${sz.colQty};white-space:nowrap}
  .items-tbl th:nth-child(3),.items-tbl td:nth-child(3){text-align:right;width:${sz.colRate};white-space:nowrap}
  .items-tbl th:nth-child(4),.items-tbl td:nth-child(4){text-align:right;width:${sz.colTotal};white-space:nowrap}
  .summary-tbl td{font-size:${sz.fsTd}}
  .summary-tbl td:last-child{text-align:right;white-space:nowrap}
  .tot td{font-weight:bold;font-size:${sz.fsTot};padding-top:3px;border-top:1px dashed #000}
  @media print{@page{size:${sizeMm}mm auto;margin:0}body{padding:2mm 3mm}html,body{width:${sizeMm}mm}}
</style></head><body>
${headerImageUrl ? `<div class="ct" style="margin-bottom:4px"><img src="${headerImageUrl}" style="max-width:90%;object-fit:contain"></div>` : ''}
${showLogo && logoUrl ? `<div class="ct" style="margin-bottom:6px"><img src="${logoUrl}" style="max-width:60%;max-height:50px;object-fit:contain"></div>` : ''}
${showName ? `<div class="ct" style="font-weight:bold;font-size:${sz.fsBig}">${restaurantName || order.restaurant_name || 'Restaurant'}</div>` : ''}
${showAddr && order.address ? `<div class="ct" style="font-size:${sz.fsSmall}">${order.address}</div>` : ''}
${showContact && order.phone ? `<div class="ct" style="font-size:${sz.fsSmall}">Ph: ${order.phone}</div>` : ''}
${showGst && order.gstin ? `<div class="ct" style="font-size:${sz.fsSmall}">GSTIN: ${order.gstin}</div>` : ''}
${customHeader ? `<div class="ct" style="font-size:${sz.fsSmall};margin-top:2px">${customHeader}</div>` : ''}
<hr>
${order.order_type === 'delivery' ? `<div class="ct" style="font-weight:bold;font-size:${sz.fsDelivery};margin:4px 0">** DELIVERY **</div>` : ''}
<table>
${order.bill_number ? `<tr><td style="width:45%"><b>Bill #</b></td><td><b>${order.bill_number}</b></td></tr>` : ''}
<tr><td style="width:45%">Order</td><td>${order.order_number || ''}</td></tr>
${showTable && order.table_number ? `<tr><td>Table</td><td>${order.table_number}${order.floor_name ? ' - ' + order.floor_name : ''}</td></tr>` : ''}
${showWaiter && order.waiter_name ? `<tr><td>${order.waiter_role === 'waiter' ? 'Waiter' : 'Staff'}</td><td>${order.waiter_name}</td></tr>` : ''}
${showDate ? `<tr><td>Date</td><td>${new Date(order.created_at).toLocaleString('en-IN')}</td></tr>` : ''}
${showPayMode && order.payment_mode ? `<tr><td>Paid via</td><td>${(order.payment_mode || '').toUpperCase()}</td></tr>` : ''}
</table>
${billToHtml}${deliveryHtml}
<hr>
<table class="items-tbl"><thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Total</th></tr></thead><tbody>${itemRows}</tbody></table>
<hr>
<table class="summary-tbl">${summaryRows.join('')}<tr class="tot"><td colspan="3">TOTAL</td><td style="text-align:right">&#8377;${fc(order.total_amount)}</td></tr></table>
<hr>
${customFooter ? `<div class="ct" style="margin-top:2px;font-size:${sz.fsSmall}">${customFooter}</div>` : ''}
${footerImageUrl ? `<div class="ct" style="margin-top:4px"><img src="${footerImageUrl}" style="max-width:90%;object-fit:contain"></div>` : ''}
<div class="ct" style="margin-top:4px">${thankMsg}</div>
</body></html>`;
}

// ── KOT HTML generator ───────────────────────────────────────────────────────
export function generateKotHtml(orderNumber, tableLabel, items, orderType = '', floorName = '', sizeMm = 80) {
  if (!items || !items.length) return '';
  const sz = getPrintSizes(sizeMm);

  const itemRows = items.map(i => {
    const addons = typeof i.addon_details === 'string' ? JSON.parse(i.addon_details || '[]') : (i.addon_details || []);
    const addonLine = addons && addons.length > 0
      ? `</tr><tr><td colspan="2" style="font-size:${sz.fsKotSmall};color:#444;padding-left:8px">+ ${addons.map(a => a.name).join(', ')}</td>`
      : '';
    const notesLine = i.notes
      ? `</tr><tr><td colspan="2" style="font-size:${sz.fsKotSmall};color:#666;padding-left:8px">** ${i.notes}</td>`
      : '';
    return `<tr><td style="font-size:${sz.fsKotItem}">${i.name || i.item_name}</td><td style="text-align:center;font-size:${sz.fsKotItem};font-weight:bold">${i.qty || i.quantity}</td>${addonLine}${notesLine}</tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',Courier,monospace;font-size:${sz.fsKot};width:${sizeMm}mm;max-width:${sizeMm}mm;padding:2mm 3mm;color:#000;word-break:break-word;overflow-wrap:break-word;line-height:1.3}
  .ct{text-align:center}
  hr{border:none;border-top:1px dashed #000;margin:5px 0}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  td,th{padding:2px 0;vertical-align:top;font-size:${sz.fsKot}}
  td:first-child,th:first-child{text-align:left;word-break:break-word;overflow-wrap:break-word;white-space:normal}
  td:last-child,th:last-child{text-align:center;width:15%;white-space:nowrap}
  @media print{@page{size:${sizeMm}mm auto;margin:0}body{padding:2mm 3mm}html,body{width:${sizeMm}mm}}
</style></head><body>
<div class="ct" style="font-weight:bold;font-size:${sz.fsKotBig}">-- KOT --</div>
<hr>
<table>
  <tr><td style="width:45%">Order</td><td>${orderNumber || ''}</td></tr>
  ${orderType ? `<tr><td>Type</td><td style="font-weight:bold">${(orderType || '').replace('_', ' ').toUpperCase()}</td></tr>` : ''}
  ${tableLabel ? `<tr><td>Table</td><td style="font-weight:bold">${floorName ? floorName + ' - ' : ''}T${tableLabel}</td></tr>` : ''}
  <tr><td>Time</td><td>${new Date().toLocaleString('en-IN')}</td></tr>
</table>
<hr>
<table>
  <thead><tr><th style="text-align:left">Item</th><th style="text-align:center;width:15%">Qty</th></tr></thead>
  <tbody>${itemRows}</tbody>
</table>
<hr>
<div class="ct" style="margin-top:4px;font-size:${sz.fsKotSmall}">--- Kitchen Order Ticket ---</div>
</body></html>`;
}
