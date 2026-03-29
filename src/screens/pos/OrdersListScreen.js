import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
  Modal as RNModal, ScrollView, ActivityIndicator, Alert, TextInput, Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orderApi } from '../../api/order.api';
import { floorApi } from '../../api/floor.api';
import { tableApi } from '../../api/table.api';
import { restaurantApi } from '../../api/restaurant.api';
import { useAuth } from '../../hooks/useAuth';
import RNPrint from 'react-native-print';
import ThermalPrinter from '../../utils/thermalPrinter';
import Header from '../../components/common/Header';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Select from '../../components/common/Select';
import DateRangePicker from '../../components/common/DateRangePicker';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import { colors, spacing, radius, typography } from '../../theme';
import { formatCurrency, formatDateTime, timeAgo, capitalize } from '../../utils/formatters';

function groupItems(items) {
  const map = {};
  items.forEach(oi => {
    const name = oi.name || oi.menu_item_name || oi.item_name || 'Item';
    const variant = oi.variant_name || '';
    const addons = oi.addons_text || '';
    const key = `${name}|||${variant}|||${addons}`;
    if (!map[key]) {
      map[key] = { name, variant_name: variant || null, addons_text: addons || null, quantity: 0, totalPrice: 0 };
    }
    map[key].quantity += (oi.quantity || 1);
    map[key].totalPrice += (oi.total_price || oi.price || 0);
  });
  return Object.values(map);
}

const FILTER_CHIPS = [
  { value: '', label: 'All' },
  { value: 'paid', label: 'Paid', type: 'payment' },
  { value: 'unpaid', label: 'Unpaid', type: 'payment' },
  { value: 'partial', label: 'Partial', type: 'payment' },
  { value: 'dine_in', label: 'Dine-In', type: 'order_type' },
  { value: 'takeaway', label: 'Takeaway', type: 'order_type' },
  { value: 'delivery', label: 'Delivery', type: 'order_type' },
  { value: 'preparing', label: 'Preparing', type: 'status' },
  { value: 'completed', label: 'Completed', type: 'status' },
  { value: 'ready', label: 'Ready', type: 'status' },
  { value: 'cancelled', label: 'Cancelled', type: 'status' },
];

const ORDER_TYPE_ICONS = {
  'dine-in': 'coffee', dine_in: 'coffee',
  takeaway: 'shopping-bag', delivery: 'truck',
};
const ORDER_TYPE_LABELS = {
  'dine-in': 'Dine-In', dine_in: 'Dine-In',
  takeaway: 'Takeaway', delivery: 'Delivery',
};

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'pending_payment'];
const PAGE_SIZE = 20;

export default function OrdersListScreen({ navigation }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // ── Filter state ───────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [filterOrderType, setFilterOrderType] = useState('');
  const [filterFloor, setFilterFloor] = useState('');
  const [filterTable, setFilterTable] = useState('');
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  // ── Detail modal state ─────────────────────────────────────────────────
  const [detailOrder, setDetailOrder] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ── Bill preview state ─────────────────────────────────────────────────
  const [billPreviewId, setBillPreviewId] = useState(null);

  // ── Split payment state ────────────────────────────────────────────────
  const [payOrderId, setPayOrderId] = useState(null);
  const [payMode, setPayMode] = useState('cash');
  const [payAmount, setPayAmount] = useState('');
  const [payReceived, setPayReceived] = useState('');
  const [addedPayments, setAddedPayments] = useState([]);

  // ── Customer edit state ───────────────────────────────────────────────
  const [editCustomerOrderId, setEditCustomerOrderId] = useState(null);
  const [editCustName, setEditCustName] = useState('');
  const [editCustPhone, setEditCustPhone] = useState('');

  // ── Close order confirm ────────────────────────────────────────────────
  const [closeOrderId, setCloseOrderId] = useState(null);

  // ── Queries ────────────────────────────────────────────────────────────
  const { data: floorsData } = useQuery({
    queryKey: ['pos-floors'],
    queryFn: async () => { const r = await floorApi.getFloors(); return r.data || r; },
    staleTime: 5 * 60 * 1000,
  });
  const floors = Array.isArray(floorsData) ? floorsData : [];

  const { data: tablesData } = useQuery({
    queryKey: ['pos-tables-list', filterFloor],
    queryFn: async () => {
      const params = filterFloor ? { floorId: filterFloor } : {};
      const r = await tableApi.getTables(params);
      return r.data || r;
    },
    staleTime: 2 * 60 * 1000,
  });
  const tablesList = Array.isArray(tablesData) ? tablesData : [];

  const queryParams = useMemo(() => {
    const p = { page, limit: PAGE_SIZE };
    if (filterStatus) p.status = filterStatus;
    if (filterPayment) p.paymentStatus = filterPayment;
    if (filterOrderType) p.orderType = filterOrderType;
    if (search) p.search = search;
    if (filterFloor) p.floorId = filterFloor;
    if (filterTable) p.tableId = filterTable;
    if (dateFrom) p.dateFrom = dateFrom.toISOString().split('T')[0];
    if (dateTo) p.dateTo = dateTo.toISOString().split('T')[0];
    return p;
  }, [page, filterStatus, filterPayment, filterOrderType, search, filterFloor, filterTable, dateFrom, dateTo]);

  const { data: response, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders', queryParams],
    queryFn: () => orderApi.getOrders(queryParams),
    keepPreviousData: true,
    refetchInterval: 30000,
  });

  const orders = response?.data?.orders || [];
  const total = response?.data?.total || 0;

  // ── Bill preview query ─────────────────────────────────────────────────
  const { data: billPreviewData, isLoading: billPreviewLoading } = useQuery({
    queryKey: ['bill-preview', billPreviewId],
    queryFn: async () => { const r = await orderApi.generateBill(billPreviewId); return r.data || r; },
    enabled: !!billPreviewId,
  });

  // ── Bill format (for print) ──────────────────────────────────────────
  const { data: billFormatData } = useQuery({
    queryKey: ['billFormat'],
    queryFn: async () => { const r = await restaurantApi.getBillFormat(); return r.data || r; },
    staleTime: 5 * 60000,
  });

  // ── Print bill handler ──────────────────────────────────────────────
  const handlePrintBill = useCallback(async (bill) => {
    if (!bill) return;
    try {
      const bf = bill.billFormat || billFormatData || {};
      const sizeMm = parseInt(bf.bill_printer_size_mm) || 80;
      const restName = user?.restaurantName || '';

      // Try Bluetooth first
      const savedPrinter = await ThermalPrinter.getSavedPrinter('bill');
      if (savedPrinter?.address) {
        try {
          await ThermalPrinter.connectPrinter(savedPrinter.address);
          await ThermalPrinter.printBill(bill, restName, sizeMm);
          return;
        } catch (btErr) {
          console.warn('[Print] Bluetooth failed, falling back:', btErr.message);
        }
      }

      // Fallback: system print dialog
      const order = bill.order || {};
      const items = bill.items || [];
      const adjs = bill.adjustments || [];
      const taxBreakdown = bill.taxBreakdown || [];
      const enableTax = bill.enableTax !== false;
      const showLogo = bf.show_logo !== 0 && (order.logo_url || bf.logo_url);
      const logoUrl = order.logo_url || bf.logo_url;
      const showName = bf.show_restaurant_name !== 0;
      const showAddr = bf.show_address !== 0;
      const showContact = bf.show_contact !== 0;
      const showGst = bf.show_gst !== 0;
      const showWaiter = bf.show_waiter_name !== 0;
      const showTable = bf.show_table_number !== 0;
      const showDate = bf.show_date_time !== 0;
      const showPayMode = bf.show_payment_mode !== 0;
      const showCustomer = bf.show_customer_details !== 0 || !!(order.customer_name || order.customer_phone);
      const thankMsg = bf.thank_you_message || 'Thank you for dining with us!';
      const customHeader = bf.custom_header || '';
      const customFooter = bf.custom_footer || '';
      const headerImageUrl = bf.header_image_url || '';
      const footerImageUrl = bf.footer_image_url || '';
      const fs = sizeMm <= 58 ? '10px' : '11px';
      const fsSmall = sizeMm <= 58 ? '8px' : '9px';
      const fsTd = sizeMm <= 58 ? '9px' : '10px';
      const fsBig = sizeMm <= 58 ? '13px' : '15px';
      const fsTot = sizeMm <= 58 ? '11px' : '12px';
      const colQty = sizeMm <= 58 ? '12%' : '10%';
      const colRate = sizeMm <= 58 ? '22%' : '20%';
      const colTotal = sizeMm <= 58 ? '24%' : '22%';
      const fc = (amt) => `${parseFloat(amt || 0).toFixed(2)}`;
      const itemRows = items.map(i => {
        const addons = typeof i.addon_details === 'string' ? JSON.parse(i.addon_details || '[]') : (i.addon_details || []);
        const addonLine = addons.length > 0 ? `<tr><td colspan="4" style="font-size:${fsSmall};color:#666;padding-left:8px">+ ${addons.map(a => a.name).join(', ')}</td></tr>` : '';
        const effectiveRate = parseFloat(i.item_price || 0) + parseFloat(i.addon_per_unit || 0);
        return `<tr><td>${i.item_name}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">${fc(effectiveRate)}</td><td style="text-align:right">${fc(i.line_total)}</td></tr>${addonLine}`;
      }).join('');
      const summaryRows = [];
      summaryRows.push(`<tr><td colspan="3">Subtotal</td><td style="text-align:right">${fc(order.subtotal)}</td></tr>`);
      (adjs || []).forEach(a => {
        const isDiscount = a.adjustment_type === 'discount';
        summaryRows.push(`<tr><td colspan="3">${a.label}${a.value_type === 'percentage' ? ` (${a.value}%)` : ''}</td><td style="text-align:right">${isDiscount ? '-' : '+'}${fc(a.applied_amount)}</td></tr>`);
      });
      if (enableTax) taxBreakdown.forEach(t => { summaryRows.push(`<tr><td colspan="3">${t.label}${t.rate ? ` @ ${t.rate}%` : ''}</td><td style="text-align:right">${fc(t.taxAmount)}</td></tr>`); });
      const billToHtml = showCustomer && (order.customer_name || order.customer_phone)
        ? `<div style="margin:6px 0;font-size:${fs}"><div><b>Bill To:</b> ${order.customer_name || 'Cash Customer'}</div>${order.customer_phone ? `<div><b>Ph:</b> ${order.customer_phone}</div>` : ''}</div>` : '';
      const deliveryHtml = order.order_type === 'delivery' && order.delivery_address
        ? `<div style="margin:4px 0;padding:4px 0;border-top:1px dashed #000;font-size:${fs}"><div><b>Delivery Address:</b></div><div style="margin-top:2px">${order.delivery_address}</div></div>` : '';
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',Courier,monospace;font-size:${fs};width:100%;max-width:${sizeMm}mm;padding:3mm;color:#000;word-break:break-word;overflow-wrap:break-word;line-height:1.3}b{font-weight:bold}.ct{text-align:center}hr{border:none;border-top:1px dashed #000;margin:4px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{padding:1px 0;vertical-align:top;font-size:${fsTd};overflow:hidden;text-overflow:ellipsis}img{max-height:60px}.items-tbl th:nth-child(1),.items-tbl td:nth-child(1){text-align:left;word-break:break-word;overflow-wrap:break-word;white-space:normal}.items-tbl th:nth-child(2),.items-tbl td:nth-child(2){text-align:center;width:${colQty}}.items-tbl th:nth-child(3),.items-tbl td:nth-child(3){text-align:right;width:${colRate}}.items-tbl th:nth-child(4),.items-tbl td:nth-child(4){text-align:right;width:${colTotal}}.summary-tbl td{font-size:${fsTd}}.summary-tbl td:last-child{text-align:right}.tot td{font-weight:bold;font-size:${fsTot};padding-top:3px;border-top:1px dashed #000}@media print{@page{size:${sizeMm}mm auto;margin:0}body{padding:2mm 3mm}html,body{width:${sizeMm}mm}}</style></head><body>
${headerImageUrl ? `<div class="ct" style="margin-bottom:4px"><img src="${headerImageUrl}" style="max-width:90%;object-fit:contain"></div>` : ''}
${showLogo && logoUrl ? `<div class="ct" style="margin-bottom:6px"><img src="${logoUrl}" style="max-width:60%;max-height:50px;object-fit:contain"></div>` : ''}
${showName ? `<div class="ct" style="font-weight:bold;font-size:${fsBig}">${order.restaurant_name || 'Restaurant'}</div>` : ''}
${showAddr && order.address ? `<div class="ct" style="font-size:${fsSmall}">${order.address}</div>` : ''}
${showContact && order.phone ? `<div class="ct" style="font-size:${fsSmall}">Ph: ${order.phone}</div>` : ''}
${showGst && order.gstin ? `<div class="ct" style="font-size:${fsSmall}">GSTIN: ${order.gstin}</div>` : ''}
${customHeader ? `<div class="ct" style="font-size:${fsSmall};margin-top:2px">${customHeader}</div>` : ''}
<hr>
${order.order_type === 'delivery' ? `<div class="ct" style="font-weight:bold;font-size:${sizeMm <= 58 ? '12px' : '14px'};margin:4px 0">** DELIVERY **</div>` : ''}
<table>
${order.bill_number ? `<tr><td style="width:45%"><b>Bill #</b></td><td><b>${order.bill_number}</b></td></tr>` : ''}
<tr><td style="width:45%">Order</td><td>${order.order_number || ''}</td></tr>
${showTable && order.table_number ? `<tr><td>Table</td><td>${order.table_number}${order.floor_name ? ' - ' + order.floor_name : ''}</td></tr>` : ''}
${showWaiter && order.waiter_name ? `<tr><td>Staff</td><td>${order.waiter_name}</td></tr>` : ''}
${showDate ? `<tr><td>Date</td><td>${new Date(order.created_at).toLocaleString('en-IN')}</td></tr>` : ''}
${showPayMode && order.payment_mode ? `<tr><td>Paid via</td><td>${(order.payment_mode || '').toUpperCase()}</td></tr>` : ''}
</table>
${billToHtml}${deliveryHtml}
<hr>
<table class="items-tbl"><thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Total</th></tr></thead><tbody>${itemRows}</tbody></table>
<hr>
<table class="summary-tbl">${summaryRows.join('')}<tr class="tot"><td colspan="3">TOTAL</td><td style="text-align:right">&#8377;${parseFloat(order.total_amount || 0).toFixed(2)}</td></tr></table>
<hr>
${customFooter ? `<div class="ct" style="margin-top:2px;font-size:${fsSmall}">${customFooter}</div>` : ''}
${footerImageUrl ? `<div class="ct" style="margin-top:4px"><img src="${footerImageUrl}" style="max-width:90%;object-fit:contain"></div>` : ''}
<div class="ct" style="margin-top:4px">${thankMsg}</div>
</body></html>`;
      await RNPrint.print({ html, width: sizeMm * 2.83 });
    } catch (err) {
      Alert.alert('Error', 'Failed to print bill');
    }
  }, [billFormatData, user]);

  // ── Pay order query (get full order for payment) ───────────────────────
  const { data: payOrderData } = useQuery({
    queryKey: ['pay-order', payOrderId],
    queryFn: async () => { const r = await orderApi.getOrder(payOrderId); return r.data || r; },
    enabled: !!payOrderId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────
  const reopenMut = useMutation({
    mutationFn: (id) => orderApi.reopenOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setShowDetail(false);
      Alert.alert('Success', 'Order reopened');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to reopen'),
  });

  const closeMut = useMutation({
    mutationFn: (id) => orderApi.closeOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setCloseOrderId(null);
      Alert.alert('Success', 'Order closed');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to close'),
  });

  const payMut = useMutation({
    mutationFn: ({ orderId, payments }) => orderApi.addPayment(orderId, { payments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['pay-order'] });
      setPayOrderId(null);
      setAddedPayments([]);
      Alert.alert('Success', 'Payment recorded');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Payment failed'),
  });

  const customerMut = useMutation({
    mutationFn: ({ orderId, customerName, customerPhone }) => orderApi.updateCustomer(orderId, { customerName, customerPhone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setEditCustomerOrderId(null);
      Alert.alert('Success', 'Customer details updated');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to update customer'),
  });

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleChipPress = useCallback((chip) => {
    if (!chip.value) {
      // "All" chip — clear all filters
      setFilterStatus('');
      setFilterPayment('');
      setFilterOrderType('');
    } else if (chip.type === 'payment') {
      setFilterPayment(prev => prev === chip.value ? '' : chip.value);
      setFilterStatus('');
      setFilterOrderType('');
    } else if (chip.type === 'order_type') {
      setFilterOrderType(prev => prev === chip.value ? '' : chip.value);
      setFilterStatus('');
      setFilterPayment('');
    } else {
      setFilterStatus(prev => prev === chip.value ? '' : chip.value);
      setFilterPayment('');
      setFilterOrderType('');
    }
    setPage(1);
  }, []);

  const handleEndReached = useCallback(() => {
    if (page * PAGE_SIZE < total) setPage(prev => prev + 1);
  }, [page, total]);

  // Detect if we're inside POSTabs (tab name 'POS') or AdminDrawer (screen name 'POS / Billing')
  const posScreenName = navigation.getParent()?.getState?.()?.routeNames?.includes?.('POS') ? 'POS' : 'POS / Billing';

  const handleOrderPress = useCallback(async (order) => {
    const isActive = ACTIVE_STATUSES.includes(order.status) && order.payment_status !== 'paid';
    if (isActive) {
      navigation.navigate(posScreenName, { orderId: order.id });
    } else {
      setLoadingDetail(true);
      setShowDetail(true);
      try {
        const res = await orderApi.getOrder(order.id);
        setDetailOrder(res.data || res);
      } catch {
        setDetailOrder(order);
      } finally {
        setLoadingDetail(false);
      }
    }
  }, [navigation]);

  const closeDetail = () => { setShowDetail(false); setDetailOrder(null); };

  const isActive = (row) => ACTIVE_STATUSES.includes(row.status) && row.payment_status !== 'paid';
  const isReopenable = (row) => row.status === 'completed' && row.payment_status !== 'paid';

  const hasActiveFilters = search || filterStatus || filterPayment || filterOrderType || filterFloor || filterTable || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch('');
    setFilterStatus('');
    setFilterFloor('');
    setFilterTable('');
    setDateFrom(null);
    setDateTo(null);
    setPage(1);
  };

  // ── Payment helpers ────────────────────────────────────────────────────
  const payOrder = payOrderData;
  const payTotal = parseFloat(payOrder?.total_amount || 0);
  const alreadyPaid = parseFloat(payOrder?.total_paid || payOrder?.total_collected || 0);
  const existingPayments = payOrder?.payments || [];
  const newPaymentsTotal = addedPayments.reduce((s, p) => s + p.amount, 0);
  const remainingDue = Math.max(0, payTotal - alreadyPaid - newPaymentsTotal);

  const addPaymentLine = () => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) return Alert.alert('Invalid', 'Enter a valid amount');
    setAddedPayments(prev => [...prev, { mode: payMode, amount: amt, received: payMode === 'cash' ? parseFloat(payReceived || amt) : amt }]);
    setPayAmount('');
    setPayReceived('');
  };

  const removePaymentLine = (idx) => {
    setAddedPayments(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitPayments = () => {
    if (addedPayments.length === 0) return Alert.alert('No Payments', 'Add at least one payment');
    payMut.mutate({
      orderId: payOrderId,
      payments: addedPayments.map(p => ({
        paymentMode: p.mode,
        amount: p.amount,
        amountReceived: p.received,
      })),
    });
  };

  // ── Render order card ──────────────────────────────────────────────────
  const renderOrderCard = useCallback(({ item: order }) => {
    const active = ACTIVE_STATUSES.includes(order.status) && order.payment_status !== 'paid';
    const totalAmt = parseFloat(order.total_amount || 0);
    const totalCollected = parseFloat(order.total_collected || 0);
    const isPartial = totalCollected > 0 && totalCollected < totalAmt;
    const isMixed = order.payment_mode === 'mixed';

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => handleOrderPress(order)}
        activeOpacity={0.7}
      >
        {/* Top row: order info + badges */}
        <View style={styles.topRow}>
          <View style={styles.orderNumberRow}>
            <View style={styles.typeIconContainer}>
              <Icon name={ORDER_TYPE_ICONS[order.order_type] || 'shopping-bag'} size={16} color={colors.primary} />
            </View>
            <View>
              {order.bill_number && (
                <Text style={styles.billNumber}>{order.bill_number}</Text>
              )}
              <Text style={styles.orderNumber}>#{order.order_number}</Text>
              <Text style={styles.orderType}>{ORDER_TYPE_LABELS[order.order_type] || capitalize(order.order_type)}</Text>
            </View>
          </View>
          <View style={styles.badges}>
            <Badge status={order.status} />
          </View>
        </View>

        {/* Details row */}
        <View style={styles.detailsRow}>
          {(order.order_type === 'dine-in' || order.order_type === 'dine_in') && order.table_number ? (
            <View style={styles.detailItem}>
              <Icon name="map-pin" size={12} color={colors.textSecondary} />
              <Text style={styles.detailText}>T{order.table_number}</Text>
            </View>
          ) : null}
          {order.floor_name ? (
            <View style={styles.detailItem}>
              <Icon name="layers" size={12} color={colors.textSecondary} />
              <Text style={styles.detailText}>{order.floor_name}</Text>
            </View>
          ) : null}
          {order.customer_name ? (
            <View style={styles.detailItem}>
              <Icon name="user" size={12} color={colors.textSecondary} />
              <Text style={styles.detailText} numberOfLines={1}>{order.customer_name}</Text>
            </View>
          ) : null}
          <View style={styles.detailItem}>
            <Icon name="clock" size={12} color={colors.textSecondary} />
            <Text style={styles.detailText}>{timeAgo(order.created_at)}</Text>
          </View>
        </View>

        {/* Bottom row: amount + payment status + actions */}
        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.totalAmount}>{formatCurrency(totalAmt)}</Text>
            {/* Payment status */}
            <View style={styles.payStatusRow}>
              <View style={[styles.payChip, {
                backgroundColor: order.payment_status === 'paid' ? colors.successBg :
                  isPartial ? colors.infoBg : colors.warningBg
              }]}>
                <Text style={[styles.payChipText, {
                  color: order.payment_status === 'paid' ? colors.successText :
                    isPartial ? colors.infoText : colors.warningText
                }]}>
                  {order.payment_status === 'paid' ? 'Paid' : isPartial ? 'Partial' : 'Unpaid'}
                </Text>
              </View>
              {isMixed && (
                <View style={[styles.payChip, { backgroundColor: '#F3E8FF' }]}>
                  <Text style={[styles.payChipText, { color: '#7C3AED' }]}>Split</Text>
                </View>
              )}
            </View>
            {totalCollected > 0 && order.payment_status !== 'paid' && (
              <Text style={styles.dueText}>Due: {formatCurrency(Math.max(0, totalAmt - totalCollected))}</Text>
            )}
          </View>

          {/* Action buttons */}
          <View style={styles.actionCol}>
            {/* Bill preview */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => { e.stopPropagation?.(); setBillPreviewId(order.id); }}
            >
              <Icon name="file-text" size={13} color={colors.primary} />
              <Text style={styles.actionBtnText}>Bill</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                setEditCustomerOrderId(order.id);
                setEditCustName(order.customer_name || '');
                setEditCustPhone(order.customer_phone || '');
              }}
            >
              <Icon name="user" size={13} color={colors.textMuted} />
            </TouchableOpacity>

            {active ? (
              <>
                {/* Bill & Pay */}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnPay]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    setPayOrderId(order.id);
                    setAddedPayments([]);
                    setPayAmount('');
                    setPayReceived('');
                    setPayMode('cash');
                  }}
                >
                  <Icon name="credit-card" size={13} color={colors.white} />
                  <Text style={[styles.actionBtnText, { color: colors.white }]}>Pay</Text>
                </TouchableOpacity>
                {/* Close */}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnClose]}
                  onPress={(e) => { e.stopPropagation?.(); setCloseOrderId(order.id); }}
                >
                  <Icon name="check-square" size={13} color={colors.warning} />
                </TouchableOpacity>
              </>
            ) : isReopenable(order) ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnReopen]}
                onPress={(e) => { e.stopPropagation?.(); reopenMut.mutate(order.id); }}
              >
                <Icon name="rotate-ccw" size={13} color={colors.info} />
                <Text style={[styles.actionBtnText, { color: colors.info }]}>Reopen</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [handleOrderPress]);

  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Header
        title="Orders"
        subtitle={`${total} order${total !== 1 ? 's' : ''}`}
        onMenu={() => navigation.openDrawer?.()}
        rightComponent={
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => setShowFilters(!showFilters)}
              style={[styles.filterToggle, hasActiveFilters && styles.filterToggleActive]}
            >
              <Icon name="filter" size={16} color={hasActiveFilters ? colors.primary : colors.textSecondary} />
              {hasActiveFilters && <View style={styles.filterDot} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={refetch} style={styles.refreshBtn}>
              <Icon name="refresh-cw" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Search bar (always visible) */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Icon name="search" size={14} color={colors.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={v => { setSearch(v); setPage(1); }}
            placeholder="Search name, phone, order #..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(''); setPage(1); }}>
              <Icon name="x" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusTabs} contentContainerStyle={styles.statusTabsContent}>
        {FILTER_CHIPS.map(chip => {
          const isActive = !chip.value
            ? (!filterStatus && !filterPayment && !filterOrderType)
            : (chip.type === 'payment' ? filterPayment === chip.value
              : chip.type === 'order_type' ? filterOrderType === chip.value
              : filterStatus === chip.value);
          return (
            <TouchableOpacity
              key={chip.value || 'all'}
              style={[styles.statusTab, isActive && styles.statusTabActive]}
              onPress={() => handleChipPress(chip)}
            >
              <Text style={[styles.statusTabText, isActive && styles.statusTabTextActive]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Expanded filters */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onFromChange={d => { setDateFrom(d); setPage(1); }}
            onToChange={d => { setDateTo(d); setPage(1); }}
            style={styles.dateRange}
          />
          <View style={styles.filterRow}>
            <Select
              value={filterFloor}
              options={[{ value: '', label: 'All Floors' }, ...floors.map(f => ({ value: String(f.id), label: f.name }))]}
              onChange={v => { setFilterFloor(v); setFilterTable(''); setPage(1); }}
              placeholder="All Floors"
              style={styles.filterSelect}
            />
            <Select
              value={filterTable}
              options={[{ value: '', label: 'All Tables' }, ...tablesList.map(t => ({ value: String(t.id), label: `Table ${t.table_number}` }))]}
              onChange={v => { setFilterTable(v); setPage(1); }}
              placeholder="All Tables"
              style={styles.filterSelect}
            />
          </View>
          {hasActiveFilters && (
            <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
              <Icon name="x-circle" size={14} color={colors.error} />
              <Text style={styles.clearBtnText}>Clear Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Orders list */}
      {isLoading ? (
        <LoadingSpinner fullScreen />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => String(item.id)}
          renderItem={renderOrderCard}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[colors.primary]} tintColor={colors.primary} />}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="file-text" size={48} color={colors.textMuted} />}
              title="No orders found"
              message={hasActiveFilters ? 'Try adjusting your filters' : 'Orders will appear here once placed'}
            />
          }
        />
      )}

      {/* ── Bill Preview Modal ─────────────────────────────────────────── */}
      <Modal
        visible={!!billPreviewId}
        onClose={() => setBillPreviewId(null)}
        title="Bill Preview"
        size="lg"
      >
        {billPreviewLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading bill...</Text>
          </View>
        ) : billPreviewData ? (
          <View>
            {renderBillPreview(billPreviewData)}
          </View>
        ) : (
          <Text style={styles.emptyBillText}>Could not load bill.</Text>
        )}
        <View style={styles.billFooterActions}>
          <Button
            title="Print"
            onPress={() => handlePrintBill(billPreviewData)}
            icon={<Icon name="printer" size={14} color={colors.white} />}
            style={{ flex: 1 }}
            size="sm"
            disabled={!billPreviewData}
          />
          <Button
            title="E-Bill"
            variant="outline"
            onPress={async () => {
              try {
                await orderApi.sendEBill(billPreviewId);
                Alert.alert('Success', 'E-bill sent via WhatsApp');
              } catch (err) {
                Alert.alert('Error', err?.response?.data?.message || 'Failed to send e-bill');
              }
            }}
            icon={<Icon name="send" size={14} color={colors.primary} />}
            style={{ flex: 1 }}
            size="sm"
          />
          <Button
            title="Close"
            variant="ghost"
            onPress={() => setBillPreviewId(null)}
            style={{ flex: 1 }}
            size="sm"
          />
        </View>
      </Modal>

      {/* ── Payment Modal (Split Payment) ──────────────────────────────── */}
      <Modal
        visible={!!payOrderId}
        onClose={() => { setPayOrderId(null); setAddedPayments([]); }}
        title={`Bill & Pay — #${payOrder?.order_number || ''}`}
        size="lg"
      >
        {payOrder ? (
          <View>
            {/* Order summary */}
            <View style={styles.paySummary}>
              <View style={styles.paySummaryRow}>
                <Text style={styles.paySummaryLabel}>Total</Text>
                <Text style={styles.paySummaryValue}>{formatCurrency(payTotal)}</Text>
              </View>
              {alreadyPaid > 0 && (
                <View style={styles.paySummaryRow}>
                  <Text style={styles.paySummaryLabel}>Already Paid</Text>
                  <Text style={[styles.paySummaryValue, { color: colors.success }]}>{formatCurrency(alreadyPaid)}</Text>
                </View>
              )}
              {newPaymentsTotal > 0 && (
                <View style={styles.paySummaryRow}>
                  <Text style={styles.paySummaryLabel}>New Payments</Text>
                  <Text style={[styles.paySummaryValue, { color: colors.info }]}>{formatCurrency(newPaymentsTotal)}</Text>
                </View>
              )}
              <View style={[styles.paySummaryRow, styles.payDueRow]}>
                <Text style={styles.payDueLabel}>Remaining Due</Text>
                <Text style={styles.payDueValue}>{formatCurrency(remainingDue)}</Text>
              </View>
            </View>

            {/* Existing payments */}
            {existingPayments.length > 0 && (
              <View style={styles.paySection}>
                <Text style={styles.paySectionTitle}>EXISTING PAYMENTS</Text>
                {existingPayments.map((p, i) => {
                  const received = parseFloat(p.amount_received || p.amount || 0);
                  const amount = parseFloat(p.amount || 0);
                  return (
                    <View key={p.id || i} style={styles.payLine}>
                      <View>
                        <Text style={styles.payLineMode}>{capitalize(p.payment_mode || 'cash')}</Text>
                        {p.payment_mode === 'cash' && received !== amount && (
                          <Text style={{ fontSize: 10, color: received < amount ? colors.error : colors.success }}>
                            (received: {formatCurrency(received)})
                          </Text>
                        )}
                      </View>
                      <Text style={styles.payLineAmt}>{formatCurrency(amount)}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* New payments queue */}
            {addedPayments.length > 0 && (
              <View style={styles.paySection}>
                <Text style={[styles.paySectionTitle, { color: colors.info }]}>NEW PAYMENTS</Text>
                {addedPayments.map((p, i) => (
                  <View key={i} style={styles.payLine}>
                    <Text style={styles.payLineMode}>{capitalize(p.mode)}</Text>
                    <Text style={styles.payLineAmt}>{formatCurrency(p.amount)}</Text>
                    <TouchableOpacity onPress={() => removePaymentLine(i)} style={styles.payRemove}>
                      <Icon name="x" size={14} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Add payment form */}
            {remainingDue > 0 && (
              <View style={styles.payForm}>
                <Text style={styles.paySectionTitle}>ADD PAYMENT</Text>
                {/* Payment mode selector */}
                <View style={styles.payModes}>
                  {['cash', 'card', 'upi', 'online'].map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.payModeBtn, payMode === m && styles.payModeBtnActive]}
                      onPress={() => setPayMode(m)}
                    >
                      <Text style={[styles.payModeBtnText, payMode === m && styles.payModeBtnTextActive]}>
                        {capitalize(m)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.payAmountRow}>
                  <View style={styles.payAmountInput}>
                    <Text style={styles.payInputLabel}>Amount</Text>
                    <TextInput
                      style={styles.payInput}
                      value={payAmount}
                      onChangeText={setPayAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.maxBtn}
                    onPress={() => setPayAmount(remainingDue.toFixed(2))}
                  >
                    <Text style={styles.maxBtnText}>MAX</Text>
                  </TouchableOpacity>
                </View>
                {payMode === 'cash' && (
                  <View style={styles.payAmountInput}>
                    <Text style={styles.payInputLabel}>Received</Text>
                    <TextInput
                      style={styles.payInput}
                      value={payReceived}
                      onChangeText={setPayReceived}
                      keyboardType="decimal-pad"
                      placeholder={payAmount || '0.00'}
                      placeholderTextColor={colors.textMuted}
                    />
                    {payMode === 'cash' && payReceived && parseFloat(payReceived) > parseFloat(payAmount || 0) && (
                      <Text style={styles.changeText}>
                        Change: {formatCurrency(parseFloat(payReceived) - parseFloat(payAmount || 0))}
                      </Text>
                    )}
                  </View>
                )}
                <Button
                  title="Add Payment"
                  onPress={addPaymentLine}
                  variant="secondary"
                  fullWidth
                  size="sm"
                  icon={<Icon name="plus" size={14} color={colors.primary} />}
                  style={{ marginTop: spacing.sm }}
                />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        {addedPayments.length > 0 && (
          <View style={styles.payFooter}>
            <Button
              title="Submit Payments"
              onPress={handleSubmitPayments}
              loading={payMut.isPending}
              fullWidth
              icon={<Icon name="check" size={16} color={colors.white} />}
            />
          </View>
        )}
      </Modal>

      {/* ── Order Detail Modal (bottom sheet for closed orders) ─────────── */}
      <RNModal visible={showDetail} transparent animationType="slide" onRequestClose={closeDetail}>
        <View style={styles.sheetRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDetail} />
          <View style={styles.sheetContainer}>
            {loadingDetail ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : detailOrder ? (
              <>
                <View style={styles.sheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>Order #{detailOrder.order_number}</Text>
                    <Text style={styles.sheetSubtitle}>
                      {capitalize(detailOrder.order_type?.replace('_', ' ') || '')}
                      {detailOrder.table_number ? ` · Table ${detailOrder.table_number}` : ''}
                      {detailOrder.customer_name ? ` · ${detailOrder.customer_name}` : ''}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    <Badge status={detailOrder.status} />
                    <Badge status={detailOrder.payment_status} />
                  </View>
                  <TouchableOpacity onPress={closeDetail} style={styles.sheetClose}>
                    <Icon name="x" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                  {/* Items */}
                  {(detailOrder.items || []).length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Items ({groupItems(detailOrder.items || []).length})</Text>
                      {groupItems(detailOrder.items || []).map((item, idx) => (
                        <View key={idx} style={styles.itemRow}>
                          <View style={styles.itemInfo}>
                            <Text style={styles.itemName}>{item.name}</Text>
                            {item.variant_name ? <Text style={styles.itemMeta}>{item.variant_name}</Text> : null}
                            {item.addons_text ? <Text style={styles.itemMeta}>{item.addons_text}</Text> : null}
                          </View>
                          <Text style={styles.itemQty}>x{item.quantity}</Text>
                          <Text style={styles.itemPrice}>{formatCurrency(item.totalPrice)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Adjustments */}
                  {(detailOrder.adjustments || []).length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Adjustments</Text>
                      {detailOrder.adjustments.map(adj => (
                        <View key={adj.id} style={styles.totalRow}>
                          <Text style={styles.totalLabel}>
                            {adj.label}{adj.value_type === 'percentage' ? ` (${adj.value}%)` : ''}
                          </Text>
                          <Text style={[styles.totalValue, { color: adj.adjustment_type === 'discount' ? colors.success : colors.text }]}>
                            {adj.adjustment_type === 'discount' ? '-' : '+'}{formatCurrency(adj.applied_amount)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Totals */}
                  <View style={styles.totalsSection}>
                    {detailOrder.subtotal != null && (
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Subtotal</Text>
                        <Text style={styles.totalValue}>{formatCurrency(detailOrder.subtotal)}</Text>
                      </View>
                    )}
                    {detailOrder.tax_amount > 0 && (
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Tax</Text>
                        <Text style={styles.totalValue}>{formatCurrency(detailOrder.tax_amount)}</Text>
                      </View>
                    )}
                    {detailOrder.discount_amount > 0 && (
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Discount</Text>
                        <Text style={[styles.totalValue, { color: colors.success }]}>-{formatCurrency(detailOrder.discount_amount)}</Text>
                      </View>
                    )}
                    <View style={[styles.totalRow, styles.grandTotalRow]}>
                      <Text style={styles.grandTotalLabel}>Total</Text>
                      <Text style={styles.grandTotalValue}>{formatCurrency(detailOrder.total_amount)}</Text>
                    </View>
                    {detailOrder.total_paid > 0 && (
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Paid</Text>
                        <Text style={[styles.totalValue, { color: colors.success }]}>{formatCurrency(detailOrder.total_paid)}</Text>
                      </View>
                    )}
                  </View>

                  {/* Payments */}
                  {(detailOrder.payments || []).length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Payments</Text>
                      {detailOrder.payments.map((p, idx) => {
                        const received = parseFloat(p.amount_received || p.amount || 0);
                        const amount = parseFloat(p.amount || 0);
                        const isShort = p.payment_mode === 'cash' && received < amount;
                        return (
                          <View key={p.id || idx} style={styles.paymentRow}>
                            <View style={styles.paymentInfo}>
                              <Text style={styles.paymentMode}>{capitalize(p.payment_mode || 'cash')}</Text>
                              {p.payment_mode === 'cash' && received !== amount && (
                                <Text style={{ fontSize: 10, color: isShort ? colors.error : colors.success, marginTop: 1 }}>
                                  (received: {formatCurrency(received)})
                                </Text>
                              )}
                            </View>
                            <Text style={styles.paymentAmount}>{formatCurrency(amount)}</Text>
                            <Badge status={p.status || 'paid'} />
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Customer */}
                  {(detailOrder.customer_name || detailOrder.customer_phone) && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Customer</Text>
                      {detailOrder.customer_name && (
                        <View style={styles.infoRow}>
                          <Icon name="user" size={14} color={colors.textSecondary} />
                          <Text style={styles.infoText}>{detailOrder.customer_name}</Text>
                        </View>
                      )}
                      {detailOrder.customer_phone && (
                        <View style={styles.infoRow}>
                          <Icon name="phone" size={14} color={colors.textSecondary} />
                          <Text style={styles.infoText}>{detailOrder.customer_phone}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </ScrollView>

                {/* Actions */}
                <View style={styles.sheetFooter}>
                  <View style={styles.actionRow}>
                    <Button
                      title="View Bill"
                      onPress={() => { closeDetail(); setBillPreviewId(detailOrder.id); }}
                      variant="secondary"
                      icon={<Icon name="file-text" size={14} color={colors.primary} />}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                    <Button
                      title="Print Bill"
                      onPress={async () => {
                        try {
                          const r = await orderApi.generateBill(detailOrder.id);
                          await handlePrintBill(r.data || r);
                        } catch (err) {
                          Alert.alert('Error', 'Failed to print bill');
                        }
                      }}
                      variant="outline"
                      icon={<Icon name="printer" size={14} color={colors.primary} />}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                    {detailOrder.payment_status === 'paid' && (
                      <Button
                        title="Send E-Bill"
                        onPress={async () => {
                          try {
                            await orderApi.sendEBill(detailOrder.id);
                            Alert.alert('Success', 'E-bill sent');
                          } catch (err) {
                            Alert.alert('Error', err?.response?.data?.message || 'Failed to send e-bill');
                          }
                        }}
                        icon={<Icon name="send" size={14} color={colors.white} />}
                        style={{ flex: 1 }}
                        size="sm"
                      />
                    )}
                  </View>
                  {(detailOrder.status === 'completed' || detailOrder.status === 'cancelled') && (
                    <Button
                      title="Reopen Order"
                      onPress={() => reopenMut.mutate(detailOrder.id)}
                      loading={reopenMut.isPending}
                      variant="secondary"
                      icon={<Icon name="rotate-ccw" size={14} color={colors.primary} />}
                      fullWidth
                      size="sm"
                      style={{ marginTop: spacing.sm }}
                    />
                  )}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </RNModal>

      {/* ── Close Order Confirm ────────────────────────────────────────── */}
      <ConfirmModal
        visible={!!closeOrderId}
        onClose={() => setCloseOrderId(null)}
        onConfirm={() => closeMut.mutate(closeOrderId)}
        title="Close Order"
        message="Are you sure you want to close this order? This will mark it as completed."
        confirmText="Close Order"
        confirmVariant="primary"
        loading={closeMut.isPending}
      />

      {/* Customer Edit Modal */}
      <Modal
        visible={!!editCustomerOrderId}
        onClose={() => setEditCustomerOrderId(null)}
        title="Update Customer"
      >
        <View style={{ padding: spacing.base }}>
          <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>Mobile Number *</Text>
          <TextInput
            value={editCustPhone}
            onChangeText={(phone) => {
              setEditCustPhone(phone);
              const digits = phone.replace(/\D/g, '');
              if (digits.length === 10) {
                orderApi.lookupCustomer(digits).then(r => {
                  const name = r?.data?.customer_name || r?.customer_name;
                  if (name) {
                    setEditCustName(prev => (!prev || prev.trim().toLowerCase() === 'cash customer') ? name : prev);
                  }
                }).catch(() => {});
              }
            }}
            placeholder="Enter mobile number"
            keyboardType="phone-pad"
            style={styles.custInput}
          />
          <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4, marginTop: spacing.md }}>Customer Name</Text>
          <TextInput
            value={editCustName}
            onChangeText={setEditCustName}
            placeholder="Enter name"
            style={styles.custInput}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
            <TouchableOpacity
              style={[styles.custBtn, { backgroundColor: colors.gray100 }]}
              onPress={() => setEditCustomerOrderId(null)}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.custBtn, { backgroundColor: colors.primary, flex: 2 }]}
              onPress={() => customerMut.mutate({
                orderId: editCustomerOrderId,
                customerName: editCustName || null,
                customerPhone: editCustPhone || null,
              })}
              disabled={customerMut.isPending}
            >
              {customerMut.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={{ color: colors.white, fontWeight: '600' }}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Bill Preview Renderer ──────────────────────────────────────────────────
function renderBillPreview(bill) {
  if (!bill) return null;
  const o = bill.order || {};
  const items = bill.items || [];
  const adjustments = bill.adjustments || [];
  const taxBreakdown = bill.taxBreakdown || [];
  const enableTax = bill.enableTax !== false;
  const bf = bill.billFormat || {};
  const thankMsg = bf.thank_you_message || 'Thank you for dining with us!';

  return (
    <View style={billStyles.container}>
      {/* Restaurant header */}
      <View style={billStyles.header}>
        {(bf.show_restaurant_name !== 0) && (
          <Text style={billStyles.restaurantName}>{o.restaurant_name || 'Restaurant'}</Text>
        )}
        {(bf.show_address !== 0) && o.address && (
          <Text style={billStyles.headerDetail}>{o.address}</Text>
        )}
        {(bf.show_contact !== 0) && o.phone && (
          <Text style={billStyles.headerDetail}>Ph: {o.phone}</Text>
        )}
        {(bf.show_gst !== 0) && o.gstin && (
          <Text style={billStyles.headerDetail}>GSTIN: {o.gstin}</Text>
        )}
        {bf.custom_header && (
          <Text style={billStyles.headerDetail}>{bf.custom_header}</Text>
        )}
      </View>

      {/* Order info */}
      <View style={billStyles.separator} />
      <View style={billStyles.infoBlock}>
        {o.bill_number && (
          <View style={billStyles.infoRow}>
            <Text style={billStyles.infoLabel}>Bill #</Text>
            <Text style={billStyles.infoValue}>{o.bill_number}</Text>
          </View>
        )}
        <View style={billStyles.infoRow}>
          <Text style={billStyles.infoLabel}>Order</Text>
          <Text style={billStyles.infoValue}>{o.order_number || ''}</Text>
        </View>
        {(bf.show_table_number !== 0) && o.table_number && (
          <View style={billStyles.infoRow}>
            <Text style={billStyles.infoLabel}>Table</Text>
            <Text style={billStyles.infoValue}>{o.table_number}{o.floor_name ? ` · ${o.floor_name}` : ''}</Text>
          </View>
        )}
        {(bf.show_waiter_name !== 0) && o.waiter_name && (
          <View style={billStyles.infoRow}>
            <Text style={billStyles.infoLabel}>{o.waiter_role === 'waiter' ? 'Waiter' : 'Staff'}</Text>
            <Text style={billStyles.infoValue}>{o.waiter_name}</Text>
          </View>
        )}
        {(bf.show_date_time !== 0) && (
          <View style={billStyles.infoRow}>
            <Text style={billStyles.infoLabel}>Date</Text>
            <Text style={billStyles.infoValue}>{formatDateTime(o.created_at)}</Text>
          </View>
        )}
        {(bf.show_payment_mode !== 0) && o.payment_mode && (
          <View style={billStyles.infoRow}>
            <Text style={billStyles.infoLabel}>Paid via</Text>
            <Text style={[billStyles.infoValue, { textTransform: 'uppercase' }]}>{o.payment_mode}</Text>
          </View>
        )}
      </View>

      {/* Customer */}
      {(o.customer_name || o.customer_phone) && (
        <>
          <View style={billStyles.separator} />
          <View style={billStyles.infoBlock}>
            <Text style={billStyles.infoLabel}>Bill To: {o.customer_name || 'Cash Customer'}</Text>
            {o.customer_phone && <Text style={billStyles.infoLabel}>Ph: {o.customer_phone}</Text>}
          </View>
        </>
      )}

      {/* Items table */}
      <View style={billStyles.separator} />
      <View style={billStyles.itemsHeader}>
        <Text style={[billStyles.itemCol, { flex: 3 }]}>Item</Text>
        <Text style={[billStyles.itemCol, { flex: 1, textAlign: 'center' }]}>Qty</Text>
        <Text style={[billStyles.itemCol, { flex: 1.5, textAlign: 'right' }]}>Rate</Text>
        <Text style={[billStyles.itemCol, { flex: 1.5, textAlign: 'right' }]}>Total</Text>
      </View>
      {items.map((item, i) => {
        const addons = typeof item.addon_details === 'string'
          ? JSON.parse(item.addon_details || '[]')
          : (item.addon_details || []);
        const effectiveRate = parseFloat(item.item_price || 0) + parseFloat(item.addon_per_unit || 0);
        return (
          <View key={i}>
            <View style={billStyles.itemRow}>
              <Text style={[billStyles.itemText, { flex: 3 }]} numberOfLines={2}>{item.item_name}</Text>
              <Text style={[billStyles.itemText, { flex: 1, textAlign: 'center' }]}>{item.quantity}</Text>
              <Text style={[billStyles.itemText, { flex: 1.5, textAlign: 'right' }]}>{formatCurrency(effectiveRate)}</Text>
              <Text style={[billStyles.itemText, { flex: 1.5, textAlign: 'right' }]}>{formatCurrency(item.line_total)}</Text>
            </View>
            {addons && addons.length > 0 && (
              <Text style={billStyles.addonText}>+ {addons.map(a => a.name).join(', ')}</Text>
            )}
          </View>
        );
      })}

      {/* Summary */}
      <View style={billStyles.separator} />
      <View style={billStyles.summaryRow}>
        <Text style={billStyles.summaryLabel}>Subtotal</Text>
        <Text style={billStyles.summaryValue}>{formatCurrency(o.subtotal)}</Text>
      </View>
      {adjustments.map((adj, i) => (
        <View key={i} style={billStyles.summaryRow}>
          <Text style={[billStyles.summaryLabel, adj.adjustment_type === 'discount' && { color: colors.success }]}>
            {adj.label}{adj.value_type === 'percentage' ? ` (${adj.value}%)` : ''}
          </Text>
          <Text style={[billStyles.summaryValue, adj.adjustment_type === 'discount' && { color: colors.success }]}>
            {adj.adjustment_type === 'discount' ? '-' : '+'}{formatCurrency(adj.applied_amount)}
          </Text>
        </View>
      ))}
      {enableTax && taxBreakdown.map((t, i) => (
        <View key={i} style={billStyles.summaryRow}>
          <Text style={billStyles.summaryLabel}>{t.label}{t.rate ? ` @ ${t.rate}%` : ''}</Text>
          <Text style={billStyles.summaryValue}>{formatCurrency(t.taxAmount)}</Text>
        </View>
      ))}
      <View style={[billStyles.summaryRow, billStyles.totalRow]}>
        <Text style={billStyles.totalLabel}>TOTAL</Text>
        <Text style={billStyles.totalValue}>{formatCurrency(o.total_amount)}</Text>
      </View>

      {/* Footer */}
      {bf.custom_footer && (
        <>
          <View style={billStyles.separator} />
          <Text style={billStyles.footerText}>{bf.custom_footer}</Text>
        </>
      )}
      <View style={billStyles.separator} />
      <Text style={billStyles.thankYou}>{thankMsg}</Text>
    </View>
  );
}

const billStyles = StyleSheet.create({
  container: { paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  header: { alignItems: 'center', marginBottom: spacing.sm },
  restaurantName: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  headerDetail: { fontSize: 11, color: colors.textSecondary, textAlign: 'center', marginTop: 1 },
  separator: { borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.border, marginVertical: spacing.sm },
  infoBlock: { marginVertical: 2 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 },
  infoLabel: { fontSize: 11, color: colors.textSecondary },
  infoValue: { fontSize: 11, color: colors.text, fontWeight: '500' },
  itemsHeader: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemCol: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },
  itemRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  itemText: { fontSize: 11, color: colors.text },
  addonText: { fontSize: 10, color: colors.textMuted, paddingLeft: spacing.sm, paddingBottom: 2 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  summaryLabel: { fontSize: 11, color: colors.textSecondary },
  summaryValue: { fontSize: 11, color: colors.text },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 4 },
  totalLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: 13, fontWeight: '700', color: colors.primary },
  footerText: { fontSize: 10, color: colors.textSecondary, textAlign: 'center' },
  thankYou: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
});

// ── Main Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterToggle: { padding: spacing.sm },
  filterToggleActive: { backgroundColor: colors.primaryLight, borderRadius: radius.md },
  filterDot: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  refreshBtn: { padding: spacing.sm },

  // Search
  searchRow: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, backgroundColor: colors.white },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 38 },
  searchInput: { flex: 1, ...typography.body, fontSize: 13, color: colors.text, paddingVertical: 0 },

  // Status tabs
  statusTabs: { minHeight: 44, maxHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: colors.white },
  statusTabsContent: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, gap: spacing.sm },
  statusTab: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surface },
  statusTabActive: { backgroundColor: colors.primary },
  statusTabText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  statusTabTextActive: { color: colors.white },

  // Filters panel
  filtersPanel: { backgroundColor: colors.white, paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  dateRange: { marginBottom: spacing.md },
  filterRow: { flexDirection: 'row', gap: spacing.md },
  filterSelect: { flex: 1, marginBottom: 0 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.md },
  clearBtnText: { fontSize: 13, color: colors.error, fontWeight: '500' },

  // List
  list: { padding: spacing.base, paddingBottom: 80 },

  // Order card
  orderCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.base, marginBottom: spacing.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderNumberRow: { flexDirection: 'row', alignItems: 'center' },
  typeIconContainer: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  billNumber: { fontSize: 11, fontWeight: '700', color: colors.primary },
  orderNumber: { ...typography.bodyBold, color: colors.text },
  orderType: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  detailsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', marginTop: spacing.md },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  detailText: { fontSize: 12, color: colors.textSecondary },

  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: spacing.md, marginTop: spacing.md },
  totalAmount: { fontSize: 16, fontWeight: '700', color: colors.primary },
  payStatusRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  payChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  payChipText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  dueText: { fontSize: 11, color: colors.error, fontWeight: '500', marginTop: 2 },

  // Action buttons on card
  actionCol: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  actionBtnText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  actionBtnPay: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionBtnClose: { borderColor: colors.warningBg, backgroundColor: colors.warningBg },
  actionBtnReopen: { borderColor: colors.infoBg, backgroundColor: colors.infoBg },

  // Sheet (order detail)
  sheetRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetBackdropTouch: { flex: 1 },
  sheetContainer: { backgroundColor: colors.white, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  sheetTitle: { ...typography.h3, color: colors.text },
  sheetSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  sheetClose: { padding: spacing.xs },
  sheetBody: { paddingHorizontal: spacing.xl, paddingBottom: spacing.base },
  sheetFooter: { paddingHorizontal: spacing.xl, paddingVertical: spacing.base, borderTopWidth: 1, borderTopColor: colors.border },

  // Loading
  loadingWrap: { padding: spacing['3xl'], alignItems: 'center' },
  loadingText: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md },

  // Sections in detail modal
  section: { marginTop: spacing.base, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  sectionTitle: { ...typography.captionBold, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },

  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  itemInfo: { flex: 1 },
  itemName: { ...typography.body, color: colors.text, fontWeight: '500' },
  itemMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  itemQty: { ...typography.bodyBold, color: colors.textSecondary, marginHorizontal: spacing.md },
  itemPrice: { ...typography.bodyBold, color: colors.text, minWidth: 70, textAlign: 'right' },

  totalsSection: { marginTop: spacing.base, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  totalLabel: { ...typography.body, color: colors.textSecondary },
  totalValue: { ...typography.body, color: colors.text },
  grandTotalRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs, paddingTop: spacing.sm },
  grandTotalLabel: { ...typography.h4, color: colors.text },
  grandTotalValue: { ...typography.h4, color: colors.primary },

  paymentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight, gap: spacing.sm },
  paymentInfo: { flex: 1 },
  paymentMode: { ...typography.body, color: colors.text, fontWeight: '500' },
  paymentAmount: { ...typography.bodyBold, color: colors.text },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  infoText: { ...typography.body, color: colors.text },

  actionRow: { flexDirection: 'row', gap: spacing.sm },

  // Bill preview
  billScroll: { maxHeight: 450 },
  emptyBillText: { textAlign: 'center', ...typography.body, color: colors.textMuted, paddingVertical: spacing['3xl'] },
  billFooterActions: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },

  // Payment modal
  payScroll: { maxHeight: 400 },
  paySummary: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  paySummaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  paySummaryLabel: { fontSize: 13, color: colors.textSecondary },
  paySummaryValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  payDueRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 6 },
  payDueLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  payDueValue: { fontSize: 14, fontWeight: '700', color: colors.primary },

  paySection: { marginBottom: spacing.md },
  paySectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.textMuted, marginBottom: spacing.sm },
  payLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  payLineMode: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '500' },
  payLineAmt: { fontSize: 13, fontWeight: '600', color: colors.text, marginRight: spacing.md },
  payRemove: { padding: 4 },

  payForm: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  payModes: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  payModeBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  payModeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  payModeBtnText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  payModeBtnTextActive: { color: colors.white },

  payAmountRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  payAmountInput: { flex: 1, marginBottom: spacing.sm },
  payInputLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  payInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, fontSize: 14, color: colors.text, backgroundColor: colors.white },
  maxBtn: { paddingHorizontal: spacing.md, justifyContent: 'flex-end', paddingBottom: 10 },
  maxBtnText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  changeText: { fontSize: 12, color: colors.success, fontWeight: '600', marginTop: 4 },

  payFooter: { paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },

  // Customer edit
  custInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, color: colors.text, backgroundColor: colors.white },
  custBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
