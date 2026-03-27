import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
  ScrollView, TextInput, Switch, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qrOrdersApi } from '../../api/qrOrders.api';
import Header from '../../components/common/Header';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import { colors, spacing, radius, typography } from '../../theme';
import { formatCurrency, formatDateTime, capitalize } from '../../utils/formatters';
import Toast from 'react-native-toast-message';

const STATUS_FILTERS = ['all', 'pending', 'accepted', 'fulfilled', 'rejected'];
const PAYMENT_FILTERS = ['all', 'paid', 'unpaid'];
const TYPE_FILTERS = ['all', 'dine_in', 'takeaway', 'delivery'];

const ORDER_TYPE_LABEL = { dine_in: 'Dine-In', takeaway: 'Takeaway', delivery: 'Delivery' };

const STATUS_VARIANT = {
  pending: 'warning',
  accepted: 'info',
  rejected: 'danger',
  fulfilled: 'success',
};

function getPaymentLabel(order) {
  if (order.status === 'rejected') return null;
  if (order.status === 'pending') {
    const isPrepaid = order.payment_preference === 'online' && order.razorpay_payment_id;
    return {
      text: isPrepaid ? 'Prepaid' : order.payment_preference === 'online' ? 'Online' : 'Pay at Counter',
      variant: isPrepaid ? 'success' : 'warning',
    };
  }
  const isPaid = order.payment_status === 'paid';
  return { text: isPaid ? 'Paid' : 'Unpaid', variant: isPaid ? 'success' : 'danger' };
}

function computeOrderTotals(order, items) {
  const itemSubtotal = items.reduce((s, i) => s + (i.itemPrice + (i.addonPerUnit || 0)) * i.quantity, 0);

  if (order.linked_order_id && order.order_total != null) {
    return {
      subtotal: Number(order.order_subtotal) || itemSubtotal,
      taxTotal: Number(order.order_tax) || 0,
      grandTotal: Number(order.order_total),
      taxEnabled: !!order.linked_tax_enabled,
    };
  }

  const wasTaxEnabled = !!order.tax_enabled;
  if (!wasTaxEnabled) return { subtotal: itemSubtotal, taxTotal: 0, grandTotal: itemSubtotal, taxEnabled: false };

  const taxTotal = items.reduce((s, i) => {
    const linePrice = (i.itemPrice + (i.addonPerUnit || 0)) * i.quantity;
    return s + (linePrice * (i.taxRate || 0)) / 100;
  }, 0);
  return { subtotal: itemSubtotal, taxTotal, grandTotal: itemSubtotal + taxTotal, taxEnabled: taxTotal > 0 };
}

export default function QROrdersScreen({ navigation }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Reject modal
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectRefund, setRejectRefund] = useState(true);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['qr-orders', statusFilter, typeFilter, paymentFilter, page],
    queryFn: async () => {
      const params = { page, limit: 20 };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.orderType = typeFilter;
      if (paymentFilter !== 'all') params.paymentStatus = paymentFilter;
      const r = await qrOrdersApi.getList(params);
      return r.data || r;
    },
    refetchInterval: 15000,
  });

  const orders = data?.orders || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);
  const pendingCount = orders.filter(o => o.status === 'pending').length;

  // ── Actions ──
  const handleAction = async (orderId, action, extra = {}) => {
    setActionLoading(true);
    try {
      if (action === 'mark_paid') {
        await qrOrdersApi.updatePayment(orderId, { paymentStatus: 'paid' });
        Toast.show({ type: 'success', text1: 'Payment marked as received' });
      } else if (action === 'rejected') {
        await qrOrdersApi.updateStatus(orderId, {
          status: 'rejected',
          reason: extra.reason || undefined,
          initiateRefund: extra.initiateRefund || false,
        });
        Toast.show({ type: 'success', text1: extra.initiateRefund ? 'Order rejected & refund initiated' : 'Order rejected' });
      } else {
        await qrOrdersApi.updateStatus(orderId, { status: action });
        Toast.show({ type: 'success', text1: action === 'accepted' ? 'Order accepted' : 'Order fulfilled' });
      }
      qc.invalidateQueries(['qr-orders']);
      setSelectedOrder(null);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Action failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const openRejectModal = (order) => {
    const isPrepaid = !!order.razorpay_payment_id || order.payment_preference === 'online';
    setRejectModal({ orderId: order.id, isPrepaid });
    setRejectReason('');
    setRejectRefund(true);
    setSelectedOrder(null);
  };

  const confirmReject = () => {
    if (!rejectModal) return;
    handleAction(rejectModal.orderId, 'rejected', {
      reason: rejectReason,
      initiateRefund: rejectModal.isPrepaid && rejectRefund,
    });
    setRejectModal(null);
  };

  // ── Filter chips ──
  const renderChips = (label, options, value, setValue, labelMap) => (
    <View style={styles.chipGroup}>
      <Text style={styles.chipLabel}>{label}:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, value === opt && styles.chipActive]}
            onPress={() => { setValue(opt); setPage(1); }}
          >
            <Text style={[styles.chipText, value === opt && styles.chipTextActive]}>
              {opt === 'all' ? 'All' : (labelMap?.[opt] || capitalize(opt))}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // ── Order card ──
  const renderOrder = useCallback(({ item: order }) => {
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
    const itemCount = items.reduce((s, i) => s + (i.quantity || 1), 0);
    const { grandTotal } = computeOrderTotals(order, items);
    const payInfo = getPaymentLabel(order);

    return (
      <Card style={[styles.orderCard, order.status === 'pending' && styles.pendingCard]}>
        <TouchableOpacity onPress={() => setSelectedOrder(order)} activeOpacity={0.7}>
          {/* Top row: ID + badges */}
          <View style={styles.orderTopRow}>
            <Text style={styles.orderId}>#{order.id}</Text>
            <Badge text={capitalize(order.status)} variant={STATUS_VARIANT[order.status] || 'default'} small />
            {payInfo && <Badge text={payInfo.text} variant={payInfo.variant} small />}
            <Badge text={ORDER_TYPE_LABEL[order.order_type] || order.order_type} variant="default" small />
          </View>

          {/* Table info */}
          {order.table_number ? (
            <View style={styles.metaRow}>
              <Icon name="grid" size={10} color={colors.textMuted} />
              <Text style={styles.metaText}>Table {order.table_number}{order.floor_name ? ` · ${order.floor_name}` : ''}</Text>
            </View>
          ) : null}

          {/* Customer + items + amount + time */}
          <View style={styles.orderBottomRow}>
            {order.customer_name ? <Text style={styles.metaText}>{order.customer_name}</Text> : null}
            {order.customer_phone ? <Text style={styles.metaText}>{order.customer_phone}</Text> : null}
            <Text style={styles.metaText}>{itemCount} items</Text>
            <Text style={styles.orderAmount}>{formatCurrency(grandTotal)}</Text>
            <Text style={styles.metaText}>{formatDateTime(order.created_at)}</Text>
          </View>

          {/* Quick action buttons */}
          <View style={styles.quickActions}>
            {order.status === 'pending' && (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.acceptBtn]}
                  onPress={() => handleAction(order.id, 'accepted')}
                  disabled={actionLoading}
                >
                  <Icon name="check" size={12} color={colors.white} />
                  <Text style={styles.actionBtnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => openRejectModal(order)}
                  disabled={actionLoading}
                >
                  <Icon name="x" size={12} color={colors.error} />
                  <Text style={[styles.actionBtnText, { color: colors.error }]}>Reject</Text>
                </TouchableOpacity>
              </>
            )}
            {order.status === 'accepted' && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.fulfillBtn]}
                onPress={() => handleAction(order.id, 'fulfilled')}
                disabled={actionLoading}
              >
                <Icon name="package" size={12} color={colors.white} />
                <Text style={styles.actionBtnText}>Fulfill</Text>
              </TouchableOpacity>
            )}
            {(order.status === 'accepted' || order.status === 'fulfilled') && order.payment_status !== 'paid' && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.markPaidBtn]}
                onPress={() => handleAction(order.id, 'mark_paid')}
                disabled={actionLoading}
              >
                <Icon name="dollar-sign" size={12} color={colors.success} />
                <Text style={[styles.actionBtnText, { color: colors.success }]}>Mark Paid</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Card>
    );
  }, [actionLoading]);

  // ── Detail Modal ──
  const renderDetailModal = () => {
    if (!selectedOrder) return null;
    const items = typeof selectedOrder.items === 'string' ? JSON.parse(selectedOrder.items) : (selectedOrder.items || []);
    const { subtotal, taxTotal, grandTotal, taxEnabled } = computeOrderTotals(selectedOrder, items);
    const payInfo = getPaymentLabel(selectedOrder);

    return (
      <Modal visible onClose={() => setSelectedOrder(null)} title={`Order #${selectedOrder.id}`}>
        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          {/* Badges */}
          <View style={styles.badgeRow}>
            <Badge text={capitalize(selectedOrder.status)} variant={STATUS_VARIANT[selectedOrder.status] || 'default'} />
            {payInfo && <Badge text={payInfo.text} variant={payInfo.variant} />}
            <Badge text={ORDER_TYPE_LABEL[selectedOrder.order_type] || selectedOrder.order_type} variant="default" />
          </View>

          {/* Table */}
          {selectedOrder.table_number ? (
            <Text style={styles.detailMeta}>
              Table {selectedOrder.table_number}{selectedOrder.floor_name ? ` · ${selectedOrder.floor_name}` : ''}
            </Text>
          ) : null}

          {/* Customer info */}
          {(selectedOrder.customer_name || selectedOrder.customer_phone) && (
            <View style={styles.customerSection}>
              {selectedOrder.customer_name && (
                <View style={styles.metaRow}>
                  <Icon name="user" size={12} color={colors.textMuted} />
                  <Text style={styles.detailText}>{selectedOrder.customer_name}</Text>
                </View>
              )}
              {selectedOrder.customer_phone && (
                <View style={styles.metaRow}>
                  <Icon name="phone" size={12} color={colors.textMuted} />
                  <Text style={styles.detailText}>{selectedOrder.customer_phone}</Text>
                </View>
              )}
            </View>
          )}

          {/* Delivery address */}
          {selectedOrder.delivery_address && (
            <View style={styles.addressBox}>
              <Icon name="map-pin" size={12} color={colors.textMuted} style={{ marginTop: 2 }} />
              <Text style={styles.addressText}>{selectedOrder.delivery_address}</Text>
            </View>
          )}

          {/* Special instructions */}
          {selectedOrder.special_instructions && (
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>
                <Text style={{ fontWeight: '700' }}>Note: </Text>
                {selectedOrder.special_instructions}
              </Text>
            </View>
          )}

          {/* Items */}
          <Text style={styles.sectionLabel}>Items</Text>
          <View style={styles.itemsContainer}>
            {items.map((item, idx) => (
              <View key={idx} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>
                    <Text style={styles.itemQty}>{item.quantity}× </Text>
                    {item.itemName}
                    {item.variantName ? <Text style={styles.variantText}> ({item.variantName})</Text> : null}
                  </Text>
                  {item.addonSummary ? <Text style={styles.addonText}>{item.addonSummary}</Text> : null}
                </View>
                <Text style={styles.itemPrice}>
                  {formatCurrency((item.itemPrice + (item.addonPerUnit || 0)) * item.quantity)}
                </Text>
              </View>
            ))}
          </View>

          {/* Totals */}
          <View style={styles.totalsSection}>
            {taxEnabled && taxTotal > 0 && (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                  <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Taxes</Text>
                  <Text style={styles.totalValue}>{formatCurrency(taxTotal)}</Text>
                </View>
              </>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(grandTotal)}</Text>
            </View>
          </View>

          {/* Linked order */}
          {selectedOrder.order_number && (
            <View style={styles.linkedOrderBox}>
              <Text style={styles.linkedText}>Order: <Text style={{ fontWeight: '700' }}>{selectedOrder.order_number}</Text></Text>
              {selectedOrder.order_total && (
                <Text style={styles.linkedAmount}>{formatCurrency(Number(selectedOrder.order_total))}</Text>
              )}
            </View>
          )}

          <Text style={styles.timestamp}>{formatDateTime(selectedOrder.created_at)}</Text>

          {/* Actions */}
          {selectedOrder.status === 'pending' && (
            <View style={styles.modalActions}>
              <Button
                title="Accept"
                onPress={() => handleAction(selectedOrder.id, 'accepted')}
                loading={actionLoading}
                style={[styles.modalBtn, { backgroundColor: colors.success }]}
                icon={<Icon name="check-circle" size={14} color={colors.white} />}
              />
              <Button
                title="Reject"
                onPress={() => openRejectModal(selectedOrder)}
                loading={actionLoading}
                variant="danger"
                style={styles.modalBtn}
                icon={<Icon name="x-circle" size={14} color={colors.white} />}
              />
            </View>
          )}
          {selectedOrder.status === 'accepted' && (
            <Button
              title="Mark Fulfilled"
              onPress={() => handleAction(selectedOrder.id, 'fulfilled')}
              loading={actionLoading}
              style={{ marginTop: spacing.md }}
              icon={<Icon name="package" size={14} color={colors.white} />}
            />
          )}
          {(selectedOrder.status === 'accepted' || selectedOrder.status === 'fulfilled') && selectedOrder.payment_status !== 'paid' && (
            <Button
              title="Mark Payment Received"
              onPress={() => handleAction(selectedOrder.id, 'mark_paid')}
              loading={actionLoading}
              variant="outline"
              style={{ marginTop: spacing.sm, borderColor: colors.success }}
              textStyle={{ color: colors.success }}
              icon={<Icon name="dollar-sign" size={14} color={colors.success} />}
            />
          )}
        </ScrollView>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <Header
        title="QR Orders"
        subtitle={`${total} total${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}`}
        onMenu={() => navigation.openDrawer()}
        rightComponent={
          <TouchableOpacity onPress={() => refetch()} disabled={isFetching} style={styles.refreshBtn}>
            <Icon name="refresh-cw" size={18} color={isFetching ? colors.textMuted : colors.textSecondary} />
          </TouchableOpacity>
        }
      />

      {/* Filters */}
      <View style={styles.filterSection}>
        {renderChips('Status', STATUS_FILTERS, statusFilter, setStatusFilter, STATUS_VARIANT)}
        {renderChips('Payment', PAYMENT_FILTERS, paymentFilter, setPaymentFilter)}
        {renderChips('Type', TYPE_FILTERS, typeFilter, setTypeFilter, ORDER_TYPE_LABEL)}
      </View>

      {/* Orders list */}
      {isLoading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="shopping-bag" size={48} color={colors.textMuted} />}
              title="No orders"
              message="Orders from QR scanning will appear here"
            />
          }
          ListFooterComponent={totalPages > 1 ? (
            <View style={styles.pagination}>
              <TouchableOpacity
                onPress={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
              >
                <Icon name="chevron-left" size={16} color={page === 1 ? colors.textMuted : colors.text} />
              </TouchableOpacity>
              <Text style={styles.pageText}>Page {page} of {totalPages}</Text>
              <TouchableOpacity
                onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
              >
                <Icon name="chevron-right" size={16} color={page === totalPages ? colors.textMuted : colors.text} />
              </TouchableOpacity>
            </View>
          ) : null}
        />
      )}

      {/* Detail modal */}
      {renderDetailModal()}

      {/* Reject confirmation modal */}
      {rejectModal && (
        <Modal visible onClose={() => setRejectModal(null)} title="Reject Order">
          <View style={styles.rejectContent}>
            <View style={styles.rejectWarning}>
              <Icon name="alert-triangle" size={20} color={colors.error} />
              <Text style={styles.rejectTitle}>Are you sure you want to reject this order?</Text>
            </View>

            <Text style={styles.inputLabel}>Reason (optional)</Text>
            <TextInput
              style={styles.rejectInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Enter reason for rejection..."
              placeholderTextColor={colors.textMuted}
            />

            {rejectModal.isPrepaid && (
              <View style={styles.refundToggle}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.refundLabel}>Initiate refund</Text>
                  <Text style={styles.refundDesc}>
                    This order was paid online. Toggle to initiate a full refund.
                  </Text>
                </View>
                <Switch
                  value={rejectRefund}
                  onValueChange={setRejectRefund}
                  trackColor={{ true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>
            )}

            <View style={styles.rejectActions}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setRejectModal(null)}
                style={{ flex: 1 }}
              />
              <Button
                title={actionLoading ? 'Rejecting...' : 'Reject Order'}
                variant="danger"
                onPress={confirmReject}
                loading={actionLoading}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.base, paddingBottom: 20 },
  refreshBtn: { padding: spacing.sm },

  // Filters
  filterSection: { paddingHorizontal: spacing.base, paddingTop: spacing.sm, gap: 4 },
  chipGroup: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  chipLabel: { ...typography.caption, color: colors.textMuted, width: 62 },
  chipScroll: { gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderRadius: radius.md, backgroundColor: colors.surfaceHover,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: colors.white },

  // Order card
  orderCard: { marginBottom: spacing.sm },
  pendingCard: { borderWidth: 1, borderColor: '#FDE68A' },
  orderTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.xs },
  orderId: { ...typography.bodyBold, color: colors.text },
  orderBottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.caption, color: colors.textMuted },
  orderAmount: { ...typography.captionBold, color: colors.text },

  // Quick actions
  quickActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md,
  },
  actionBtnText: { ...typography.caption, fontWeight: '600', color: colors.white },
  acceptBtn: { backgroundColor: colors.success },
  rejectBtn: { backgroundColor: colors.errorBg, borderWidth: 1, borderColor: colors.error },
  fulfillBtn: { backgroundColor: colors.primary },
  markPaidBtn: { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.success },

  // Modal
  modalScroll: { maxHeight: 500 },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.md },
  detailMeta: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  customerSection: { gap: spacing.xs, marginBottom: spacing.sm },
  detailText: { ...typography.body, color: colors.text },
  addressBox: {
    flexDirection: 'row', gap: spacing.sm, padding: spacing.md,
    backgroundColor: colors.surfaceHover, borderRadius: radius.md, marginBottom: spacing.sm,
  },
  addressText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  noteBox: {
    padding: spacing.md, backgroundColor: '#FFFBEB',
    borderWidth: 1, borderColor: '#FDE68A', borderRadius: radius.md, marginBottom: spacing.sm,
  },
  noteText: { ...typography.caption, color: '#92400E' },
  sectionLabel: { ...typography.captionBold, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm, marginTop: spacing.sm },
  itemsContainer: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceHover,
  },
  itemName: { ...typography.body, color: colors.text },
  itemQty: { fontWeight: '700', color: colors.primary },
  variantText: { ...typography.caption, color: colors.textMuted },
  addonText: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  itemPrice: { ...typography.bodyBold, color: colors.text },
  totalsSection: { marginTop: spacing.sm, paddingHorizontal: spacing.md },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalLabel: { ...typography.body, color: colors.textSecondary },
  totalValue: { ...typography.body, color: colors.textSecondary },
  grandTotalLabel: { ...typography.bodyBold, color: colors.text },
  grandTotalValue: { ...typography.bodyBold, color: colors.text },
  linkedOrderBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, backgroundColor: colors.infoBg, borderRadius: radius.md, marginTop: spacing.sm,
  },
  linkedText: { ...typography.body, color: colors.info },
  linkedAmount: { ...typography.bodyBold, color: colors.info },
  timestamp: { ...typography.caption, color: colors.textMuted, textAlign: 'right', marginTop: spacing.sm },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  modalBtn: { flex: 1 },

  // Reject modal
  rejectContent: { gap: spacing.md },
  rejectWarning: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rejectTitle: { ...typography.bodyBold, color: colors.text, flex: 1 },
  inputLabel: { ...typography.captionBold, color: colors.textSecondary },
  rejectInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    ...typography.body, color: colors.text,
  },
  refundToggle: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, backgroundColor: '#FFFBEB',
    borderWidth: 1, borderColor: '#FDE68A', borderRadius: radius.md,
  },
  refundLabel: { ...typography.bodyBold, color: '#92400E' },
  refundDesc: { ...typography.caption, color: '#B45309', marginTop: 2 },
  rejectActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },

  // Pagination
  pagination: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.md, paddingVertical: spacing.md,
  },
  pageBtn: {
    padding: spacing.sm, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, backgroundColor: colors.white,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageText: { ...typography.caption, color: colors.textSecondary },
});
