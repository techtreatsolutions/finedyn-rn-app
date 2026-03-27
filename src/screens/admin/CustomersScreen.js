import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery } from '@tanstack/react-query';
import { orderApi } from '../../api/order.api';
import Header from '../../components/common/Header';
import SearchBar from '../../components/common/SearchBar';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { colors, spacing, radius, typography } from '../../theme';
import { formatCurrency, formatDate, formatDateTime, capitalize } from '../../utils/formatters';

function groupOrderItems(items) {
  const map = {};
  items.forEach(oi => {
    const name = oi.name || oi.item_name || oi.menu_item_name || 'Item';
    const variant = oi.variant_name || '';
    const key = `${name}|||${variant}`;
    if (!map[key]) {
      map[key] = { name, variant_name: variant, quantity: 0, totalPrice: 0 };
    }
    map[key].quantity += (oi.quantity || 1);
    map[key].totalPrice += (oi.total_price || (oi.price || 0) * (oi.quantity || 1));
  });
  return Object.values(map);
}

function toDateString(d) {
  if (!d) return '';
  return d.toISOString().split('T')[0];
}

export default function CustomersScreen({ navigation }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [showDateFrom, setShowDateFrom] = useState(false);
  const [showDateTo, setShowDateTo] = useState(false);

  // Detail view state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [expandedOrder, setExpandedOrder] = useState(null);

  // ── Customer list query ──
  const { data: customerData, isLoading, refetch } = useQuery({
    queryKey: ['crm-customers', page, search, toDateString(dateFrom), toDateString(dateTo)],
    queryFn: async () => {
      const params = { page, limit: 20 };
      if (search) params.search = search;
      if (dateFrom) params.dateFrom = toDateString(dateFrom);
      if (dateTo) params.dateTo = toDateString(dateTo);
      const r = await orderApi.getCustomers(params);
      return r.data || r;
    },
    keepPreviousData: true,
    enabled: !selectedCustomer,
  });

  const customers = customerData?.customers || (Array.isArray(customerData) ? customerData : []);
  const totalCustomers = customerData?.total || customers.length;

  // ── Customer order history query ──
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['crm-history', selectedCustomer?.customer_phone || selectedCustomer?.phone, historyPage],
    queryFn: async () => {
      const phone = selectedCustomer.customer_phone || selectedCustomer.phone;
      const r = await orderApi.getCustomerHistory(encodeURIComponent(phone));
      return r.data || r;
    },
    keepPreviousData: true,
    enabled: !!(selectedCustomer?.customer_phone || selectedCustomer?.phone),
  });

  const historyOrders = historyData?.orders || (Array.isArray(historyData) ? historyData : []);
  const historyTotal = historyData?.total || historyOrders.length;

  // Order detail query (items)
  const { data: orderDetailData } = useQuery({
    queryKey: ['orderDetail', expandedOrder],
    queryFn: async () => {
      const r = await orderApi.getOrder(expandedOrder);
      return r.data || r;
    },
    enabled: !!expandedOrder,
  });

  // ── Handlers ──
  const handleSearch = (text) => {
    setSearch(text);
    setPage(1);
  };

  const openCustomer = (customer) => {
    setSelectedCustomer(customer);
    setHistoryPage(1);
  };

  const goBack = () => {
    setSelectedCustomer(null);
    setHistoryPage(1);
  };

  // ── Render: Customer card ──
  const renderCustomer = useCallback(({ item }) => (
    <Card style={styles.card}>
      <TouchableOpacity style={styles.cardContent} onPress={() => openCustomer(item)} activeOpacity={0.7}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(item.customer_name || item.name || item.customer_phone || item.phone || '?')[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{item.customer_name || item.name || 'Guest'}</Text>
          <View style={styles.phoneRow}>
            <Icon name="phone" size={10} color={colors.textMuted} />
            <Text style={styles.phone}>{item.customer_phone || item.phone || '—'}</Text>
          </View>
        </View>
        <View style={styles.statsCol}>
          <View style={styles.statRow}>
            <Icon name="shopping-bag" size={11} color={colors.textSecondary} />
            <Text style={styles.statText}>{item.total_orders || 0} orders</Text>
          </View>
          <Text style={styles.amount}>{formatCurrency(item.total_spent || 0)}</Text>
          {item.last_visit && (
            <View style={styles.statRow}>
              <Icon name="calendar" size={10} color={colors.textMuted} />
              <Text style={styles.lastVisit}>{formatDate(item.last_visit)}</Text>
            </View>
          )}
        </View>
        <Icon name="chevron-right" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </Card>
  ), []);

  // ── Render: Order history item ──
  const renderHistoryItem = useCallback(({ item }) => {
    const isExpanded = expandedOrder === item.id;
    const detail = isExpanded ? orderDetailData : null;
    const orderItems = detail?.items || detail?.orderItems || detail?.order_items || [];

    return (
      <Card style={styles.historyCard}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setExpandedOrder(isExpanded ? null : item.id)}
        >
          <View style={styles.historyTop}>
            <View>
              <Text style={styles.historyOrder}>#{item.order_number}</Text>
              <Text style={styles.historyType}>{capitalize((item.order_type || '').replace('_', ' '))}</Text>
            </View>
            <View style={styles.historyAmountCol}>
              <Text style={styles.historyAmount}>{formatCurrency(item.total_amount || 0)}</Text>
              <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
            </View>
          </View>
          <View style={styles.historyMeta}>
            {item.table_number ? (
              <View style={styles.historyMetaItem}>
                <Icon name="grid" size={10} color={colors.textMuted} />
                <Text style={styles.historyMetaText}>Table {item.table_number}{item.floor_name ? ` · ${item.floor_name}` : ''}</Text>
              </View>
            ) : null}
            <View style={styles.historyMetaItem}>
              <Icon name="clock" size={10} color={colors.textMuted} />
              <Text style={styles.historyMetaText}>{formatDateTime(item.created_at)}</Text>
            </View>
          </View>
          <View style={styles.historyBadges}>
            <Badge text={capitalize((item.status || 'pending').replace('_', ' '))} variant={
              item.status === 'completed' ? 'success' : item.status === 'cancelled' ? 'danger' : 'warning'
            } small />
            <Badge text={capitalize((item.payment_status || 'unpaid').replace('_', ' '))} variant={
              item.payment_status === 'paid' ? 'success' : item.payment_status === 'partial' ? 'warning' : 'danger'
            } small />
            {item.payment_mode && (
              <Badge text={capitalize(item.payment_mode)} variant="info" small />
            )}
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.orderDetail}>
            {orderItems.length > 0 ? (
              <>
                <Text style={styles.orderDetailTitle}>Order Items</Text>
                {groupOrderItems(orderItems).map((oi, idx) => (
                  <View key={idx} style={styles.orderItemRow}>
                    <Text style={styles.orderItemName} numberOfLines={1}>
                      {oi.name}
                      {oi.variant_name ? ` (${oi.variant_name})` : ''}
                    </Text>
                    <Text style={styles.orderItemQty}>x{oi.quantity}</Text>
                    <Text style={styles.orderItemPrice}>{formatCurrency(oi.totalPrice)}</Text>
                  </View>
                ))}
                {(detail?.subtotal || detail?.sub_total) ? (
                  <View style={[styles.orderItemRow, styles.orderTotalRow]}>
                    <Text style={styles.orderTotalLabel}>Subtotal</Text>
                    <Text style={styles.orderTotalValue}>{formatCurrency(detail.subtotal || detail.sub_total)}</Text>
                  </View>
                ) : null}
                {(detail?.tax_amount || detail?.taxAmount) > 0 ? (
                  <View style={styles.orderItemRow}>
                    <Text style={styles.orderItemName}>Tax</Text>
                    <Text style={styles.orderItemPrice}>{formatCurrency(detail.tax_amount || detail.taxAmount)}</Text>
                  </View>
                ) : null}
                {(detail?.discount_amount || detail?.discountAmount) > 0 ? (
                  <View style={styles.orderItemRow}>
                    <Text style={styles.orderItemName}>Discount</Text>
                    <Text style={[styles.orderItemPrice, { color: colors.success }]}>-{formatCurrency(detail.discount_amount || detail.discountAmount)}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.orderDetailEmpty}>Loading order details...</Text>
            )}
          </View>
        )}
      </Card>
    );
  }, [expandedOrder, orderDetailData]);

  // ── Detail View (order history) ──
  if (selectedCustomer) {
    const customerName = selectedCustomer.customer_name || selectedCustomer.name || 'Customer';
    const customerPhone = selectedCustomer.customer_phone || selectedCustomer.phone;

    return (
      <View style={styles.container}>
        <Header
          title={customerName}
          subtitle={`${customerPhone} — ${historyTotal} order${historyTotal !== 1 ? 's' : ''}`}
          onBack={goBack}
        />

        {historyLoading ? <LoadingSpinner fullScreen /> : (
          <FlatList
            data={historyOrders}
            keyExtractor={(item, idx) => String(item.id || idx)}
            renderItem={renderHistoryItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refetchHistory} />}
            ListEmptyComponent={
              <EmptyState
                icon={<Icon name="shopping-bag" size={48} color={colors.textMuted} />}
                title="No orders"
                message="No order history for this customer"
              />
            }
          />
        )}
      </View>
    );
  }

  // ── List View ──
  return (
    <View style={styles.container}>
      <Header
        title="Customers"
        subtitle={`${totalCustomers} customer${totalCustomers !== 1 ? 's' : ''}`}
        onMenu={() => navigation.openDrawer()}
      />

      {/* Search & Date Filters */}
      <View style={styles.filterSection}>
        <SearchBar
          value={search}
          onChangeText={handleSearch}
          placeholder="Search name or phone..."
        />
        <View style={styles.dateFilterRow}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDateFrom(true)}>
            <Icon name="calendar" size={13} color={colors.textSecondary} />
            <Text style={styles.dateBtnText}>
              {dateFrom ? formatDate(dateFrom) : 'From date'}
            </Text>
          </TouchableOpacity>
          <Icon name="arrow-right" size={12} color={colors.textMuted} />
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDateTo(true)}>
            <Icon name="calendar" size={13} color={colors.textSecondary} />
            <Text style={styles.dateBtnText}>
              {dateTo ? formatDate(dateTo) : 'To date'}
            </Text>
          </TouchableOpacity>
          {(dateFrom || dateTo) && (
            <TouchableOpacity onPress={() => { setDateFrom(null); setDateTo(null); setPage(1); }} style={styles.clearBtn}>
              <Icon name="x" size={14} color={colors.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {showDateFrom && (
        <DateTimePicker
          value={dateFrom || new Date()}
          mode="date"
          display="spinner"
          onChange={(e, date) => {
            setShowDateFrom(Platform.OS === 'ios');
            if (date) { setDateFrom(date); setPage(1); }
          }}
          maximumDate={dateTo || new Date()}
        />
      )}
      {showDateTo && (
        <DateTimePicker
          value={dateTo || new Date()}
          mode="date"
          display="spinner"
          onChange={(e, date) => {
            setShowDateTo(Platform.OS === 'ios');
            if (date) { setDateTo(date); setPage(1); }
          }}
          minimumDate={dateFrom || undefined}
          maximumDate={new Date()}
        />
      )}

      {isLoading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={customers}
          keyExtractor={(item, idx) => item.customer_phone || item.phone || String(idx)}
          renderItem={renderCustomer}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="users" size={48} color={colors.textMuted} />}
              title="No customers"
              message="Customers will appear here after orders"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  filterSection: { paddingHorizontal: spacing.base, paddingTop: spacing.md, gap: spacing.sm },
  list: { padding: spacing.base, paddingBottom: 20 },

  // Date filter
  dateFilterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  dateBtnText: { ...typography.caption, color: colors.textSecondary },
  clearBtn: { padding: spacing.sm },

  // Customer card
  card: { marginBottom: spacing.md },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.infoBg,
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  avatarText: { ...typography.bodyBold, color: colors.info },
  info: { flex: 1 },
  name: { ...typography.bodyBold, color: colors.text },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  phone: { ...typography.caption, color: colors.textMuted },
  statsCol: { alignItems: 'flex-end', marginRight: spacing.sm },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { ...typography.caption, color: colors.textSecondary },
  amount: { ...typography.captionBold, color: colors.primary, marginVertical: 2 },
  lastVisit: { ...typography.tiny, color: colors.textMuted },

  // History card
  historyCard: { marginBottom: spacing.sm },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  historyOrder: { ...typography.bodyBold, color: colors.text },
  historyType: { ...typography.caption, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  historyAmountCol: { alignItems: 'flex-end' },
  historyAmount: { ...typography.bodyBold, color: colors.text },
  historyMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  historyMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyMetaText: { ...typography.caption, color: colors.textMuted },
  historyBadges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },

  // Order detail (expanded)
  orderDetail: {
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  orderDetailTitle: { ...typography.captionBold, color: colors.text, marginBottom: spacing.sm },
  orderDetailEmpty: { ...typography.caption, color: colors.textMuted, fontStyle: 'italic' },
  orderItemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 3,
  },
  orderItemName: { ...typography.caption, color: colors.text, flex: 1 },
  orderItemQty: { ...typography.caption, color: colors.textSecondary, marginHorizontal: spacing.sm },
  orderItemPrice: { ...typography.captionBold, color: colors.text, minWidth: 60, textAlign: 'right' },
  orderTotalRow: {
    marginTop: spacing.xs, paddingTop: spacing.xs,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  orderTotalLabel: { ...typography.captionBold, color: colors.text, flex: 1 },
  orderTotalValue: { ...typography.captionBold, color: colors.primary },
});
