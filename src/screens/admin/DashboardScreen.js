import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Dimensions,
  Modal as RNModal,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restaurantApi } from '../../api/restaurant.api';
import { orderApi } from '../../api/order.api';
import { notificationApi } from '../../api/notification.api';
import Header from '../../components/common/Header';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { colors, spacing, radius, typography } from '../../theme';
import { formatCurrency, formatDateTime, capitalize, getStatusColor } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_TABLET = SCREEN_WIDTH >= 768;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [orderDetail, setOrderDetail] = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const {
    data: stats,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const res = await restaurantApi.getDashboardStats();
      return res.data || res;
    },
  });

  // Notifications
  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => { const r = await notificationApi.getNotifications(); return r.data || r; },
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const notifs = notifData?.notifications || [];
  const unreadCount = notifData?.unreadCount || 0;

  const markReadMut = useMutation({
    mutationFn: (id) => notificationApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAllReadMut = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // Subscription data
  const { data: subData } = useQuery({
    queryKey: ['subscription-info'],
    queryFn: async () => { const r = await restaurantApi.getSubscription(); return r.data || r; },
    staleTime: 5 * 60 * 1000,
  });
  const subscription = subData?.subscription;
  const daysLeft = subscription?.subscription_end
    ? Math.ceil((new Date(subscription.subscription_end) - new Date()) / 86400000)
    : null;

  const handleOrderPress = useCallback(async (order) => {
    setShowOrderDetail(true);
    setOrderDetail(order);
    setLoadingOrder(true);
    try {
      const res = await orderApi.getOrder(order.id);
      setOrderDetail(res.data || res);
    } catch {
      // keep basic data
    } finally {
      setLoadingOrder(false);
    }
  }, []);

  const closeOrderDetail = useCallback(() => {
    setShowOrderDetail(false);
    setOrderDetail(null);
  }, []);

  const today = stats?.today || {};
  const salesLast7Days = stats?.salesLast7Days || [];
  const popularItems = stats?.popularItems || [];
  const recentOrders = stats?.recentOrders || [];
  const todayCollection = useMemo(() => {
    const raw = stats?.todayCollection || [];
    const map = {};
    raw.forEach(item => { map[item.payment_mode] = Number(item.total) || 0; });
    return map;
  }, [stats?.todayCollection]);

  const maxRevenue = useMemo(() => {
    if (!salesLast7Days.length) return 1;
    return Math.max(...salesLast7Days.map((d) => d.revenue), 1);
  }, [salesLast7Days]);

  const formatShortDate = useCallback((dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }, []);

  const renderSalesBar = useCallback(
    ({ item }) => {
      const barHeight = Math.max((item.revenue / maxRevenue) * 100, 4);
      return (
        <View style={styles.barItem}>
          <Text style={styles.barValue}>{formatCurrency(item.revenue)}</Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { height: barHeight },
              ]}
            />
          </View>
          <Text style={styles.barLabel}>{formatShortDate(item.date)}</Text>
          <Text style={styles.barOrders}>{item.orders} orders</Text>
        </View>
      );
    },
    [maxRevenue, formatShortDate],
  );

  const renderPopularItem = useCallback(({ item, index }) => (
    <View style={styles.popularRow}>
      <View style={styles.popularRank}>
        <Text style={styles.rankText}>{index + 1}</Text>
      </View>
      <View style={styles.popularInfo}>
        <Text style={styles.popularName} numberOfLines={1}>{item.item_name}</Text>
        <Text style={styles.popularMeta}>
          {item.total_qty} sold
        </Text>
      </View>
      <Text style={styles.popularRevenue}>{formatCurrency(item.total_revenue)}</Text>
    </View>
  ), []);

  const renderOrderItem = useCallback(({ item }) => (
    <Card style={styles.orderCard} onPress={() => handleOrderPress(item)}>
      <View style={styles.orderTop}>
        <View style={styles.orderLeft}>
          <Text style={styles.orderNumber}>#{item.order_number}</Text>
          {item.table_number ? (
            <Text style={styles.orderTable}>Table {item.table_number}</Text>
          ) : null}
        </View>
        <Badge status={item.status} />
      </View>
      <View style={styles.orderBottom}>
        <View style={styles.orderMeta}>
          <View style={styles.orderMetaItem}>
            <Icon name="clock" size={12} color={colors.textMuted} />
            <Text style={styles.orderMetaText}>{formatDateTime(item.created_at)}</Text>
          </View>
          {item.order_type ? (
            <View style={styles.orderMetaItem}>
              <Icon name="tag" size={12} color={colors.textMuted} />
              <Text style={styles.orderMetaText}>{capitalize(item.order_type)}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.orderAmountWrap}>
          <Text style={styles.orderAmount}>{formatCurrency(item.total_amount)}</Text>
          {item.payment_status ? (
            <Text
              style={[
                styles.paymentStatus,
                { color: getStatusColor(item.payment_status) },
              ]}
            >
              {capitalize(item.payment_status)}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  ), []);

  const QUICK_ACTIONS = [
    { icon: 'monitor', label: 'Go to POS', screen: 'POSDashboard', bg: colors.primary, color: colors.white },
    { icon: 'grid', label: 'Tables', screen: 'Floor', bg: colors.white, color: colors.text, border: true },
    { icon: 'book', label: 'Menu', screen: 'Menu', bg: colors.white, color: colors.text, border: true },
    { icon: 'calendar', label: 'Reservations', screen: 'Reservations', bg: colors.white, color: colors.text, border: true },
  ];

  const ListHeader = useMemo(() => {
    return (
      <View style={styles.content}>
        {/* Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingText}>{getGreeting()}, {user?.name || 'Owner'}</Text>
          <Text style={styles.greetingSub}>Here's your restaurant overview</Text>
        </View>

        {/* Subscription Alert */}
        {daysLeft !== null && daysLeft <= 30 && (
          <View style={styles.subAlert}>
            <Icon name="alert-circle" size={18} color="#D97706" style={{ marginRight: spacing.md }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.subAlertTitle}>Subscription Expiring Soon</Text>
              <Text style={styles.subAlertText}>
                Your {subscription?.plan_name || 'plan'} expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}. Renew to avoid service interruption.
              </Text>
            </View>
          </View>
        )}

        {/* Stat Cards Grid */}
        <View style={styles.statsGrid}>
          <StatCard
            icon={<Icon name="shopping-bag" size={20} color={colors.primary} />}
            label="Total Orders"
            value={String(today.total_orders || 0)}
            color={colors.primary}
            style={styles.statCard}
          />
          <StatCard
            icon={<Icon name="dollar-sign" size={20} color={colors.success} />}
            label="Revenue"
            value={formatCurrency(today.total_revenue || 0)}
            color={colors.success}
            style={styles.statCard}
          />
          <StatCard
            icon={<Icon name="clock" size={20} color={colors.warning} />}
            label="Pending"
            value={String((today.pending_orders || 0) + (today.preparing_orders || 0))}
            color={colors.warning}
            style={styles.statCard}
          />
          <StatCard
            icon={<Icon name="grid" size={20} color={colors.info} />}
            label="Active Tables"
            value={String(today.activeTables || 0)}
            color={colors.info}
            style={styles.statCard}
          />
        </View>

        {/* Today's Collection Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Collection</Text>
          <Card style={styles.collectionCard}>
            {(() => {
              const modes = [
                { key: 'cash', label: 'Cash', color: '#22C55E', icon: 'dollar-sign' },
                { key: 'card', label: 'Card', color: '#3B82F6', icon: 'credit-card' },
                { key: 'upi', label: 'UPI', color: '#A855F7', icon: 'smartphone' },
                { key: 'online', label: 'Online', color: '#F59E0B', icon: 'globe' },
              ];
              const grandTotal = modes.reduce((s, m) => s + (todayCollection[m.key] || 0), 0);
              return (
                <>
                  <View style={styles.collectionTotal}>
                    <Text style={styles.collectionTotalLabel}>Total Collected</Text>
                    <Text style={styles.collectionTotalValue}>{formatCurrency(grandTotal)}</Text>
                  </View>
                  <View style={styles.collectionBar}>
                    {grandTotal > 0 ? modes.filter(m => (todayCollection[m.key] || 0) > 0).map(m => (
                      <View key={m.key} style={{ flex: todayCollection[m.key] / grandTotal, height: 8, backgroundColor: m.color, borderRadius: 4 }} />
                    )) : <View style={{ flex: 1, height: 8, backgroundColor: colors.surfaceDark, borderRadius: 4 }} />}
                  </View>
                  <View style={styles.collectionRows}>
                    {modes.map(m => (
                      <View key={m.key} style={styles.collectionRow}>
                        <View style={styles.collectionRowLeft}>
                          <View style={[styles.collectionDot, { backgroundColor: m.color }]} />
                          <Icon name={m.icon} size={14} color={m.color} style={{ marginRight: spacing.xs }} />
                          <Text style={styles.collectionLabel}>{m.label}</Text>
                        </View>
                        <Text style={styles.collectionAmount}>{formatCurrency(todayCollection[m.key] || 0)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              );
            })()}
          </Card>
        </View>

        {/* Sales Last 7 Days */}
        {salesLast7Days.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sales Last 7 Days</Text>
            <Card style={styles.chartCard}>
              <FlatList
                data={salesLast7Days}
                keyExtractor={(item) => item.date}
                renderItem={renderSalesBar}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.barContainer}
              />
            </Card>
          </View>
        ) : null}

        {/* Popular Items */}
        {popularItems.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Popular Items</Text>
            <Card style={styles.popularCard}>
              {popularItems.slice(0, 5).map((item, index) => (
                <React.Fragment key={item.item_name + index}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  {renderPopularItem({ item, index })}
                </React.Fragment>
              ))}
            </Card>
          </View>
        ) : null}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActions}>
            {QUICK_ACTIONS.map(action => (
              <TouchableOpacity
                key={action.label}
                style={[styles.quickAction, { backgroundColor: action.bg }, action.border && styles.quickActionBorder]}
                onPress={() => navigation.navigate(action.screen)}
                activeOpacity={0.7}
              >
                <Icon name={action.icon} size={16} color={action.color} />
                <Text style={[styles.quickActionText, { color: action.color }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Recent Orders Header */}
        {recentOrders.length > 0 ? (
          <Text style={[styles.sectionTitle, styles.sectionTitleMargin]}>
            Recent Orders
          </Text>
        ) : null}
      </View>
    );
  }, [today, salesLast7Days, popularItems, recentOrders.length, maxRevenue, daysLeft, subscription, user, renderSalesBar, renderPopularItem, todayCollection]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header
          title="Dashboard"
          onMenu={() => navigation.openDrawer()}
        />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Dashboard"
        subtitle={`${getGreeting()}, ${user?.name || 'Owner'}`}
        onMenu={() => navigation.openDrawer()}
        rightComponent={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <TouchableOpacity
              onPress={() => setShowNotifications(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="bell" size={20} color={colors.text} />
              {unreadCount > 0 && (
                <View style={{ position: 'absolute', top: -4, right: -6, backgroundColor: colors.error, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                  <Text style={{ color: colors.white, fontSize: 9, fontWeight: '800' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => refetch()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="refresh-cw" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />
      <FlatList
        data={recentOrders}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderOrderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          recentOrders.length === 0 && !isLoading ? (
            <View style={styles.emptyOrders}>
              <Icon name="inbox" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No recent orders</Text>
            </View>
          ) : null
        }
      />

      {/* Order Detail Modal */}
      <RNModal visible={showOrderDetail} transparent animationType="slide" onRequestClose={closeOrderDetail}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalBackdropTouch} onPress={closeOrderDetail} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Order #{orderDetail?.order_number}</Text>
                <Text style={styles.modalSubtitle}>
                  {orderDetail?.order_type ? capitalize(orderDetail.order_type.replace('_', ' ')) : ''}
                  {orderDetail?.table_name || orderDetail?.table_number ? ` · Table ${orderDetail.table_name || orderDetail.table_number}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={closeOrderDetail} style={styles.modalCloseBtn}>
                <Icon name="x" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {loadingOrder ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : orderDetail ? (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* Status row */}
                <View style={styles.detailRow}>
                  <Badge status={orderDetail.payment_status === 'paid' ? 'paid' : orderDetail.status || 'pending'} />
                  <Text style={styles.detailTime}>{formatDateTime(orderDetail.created_at)}</Text>
                </View>

                {/* Customer info */}
                {(orderDetail.customer_name || orderDetail.customer_phone) && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Customer</Text>
                    <Text style={styles.detailText}>{orderDetail.customer_name || 'Walk-in'}</Text>
                    {orderDetail.customer_phone && <Text style={styles.detailTextSm}>{orderDetail.customer_phone}</Text>}
                  </View>
                )}

                {/* Items */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Items</Text>
                  {(orderDetail.items || orderDetail.order_items || []).map((item, idx) => {
                    const unitPrice = parseFloat(item.item_price || item.price || 0);
                    const addonPerUnit = parseFloat(item.addon_per_unit || 0);
                    const lineTotal = (unitPrice + addonPerUnit) * (item.quantity || 1);
                    return (
                      <View key={item.id || idx} style={styles.detailItemRow}>
                        <View style={styles.detailItemInfo}>
                          <Text style={styles.detailItemName}>{item.item_name || item.name || item.menu_item_name}</Text>
                          {item.variant_name ? <Text style={styles.detailItemMeta}>{item.variant_name}</Text> : null}
                          {item.addon_details ? <Text style={styles.detailItemMeta}>{typeof item.addon_details === 'string' ? JSON.parse(item.addon_details || '[]').map(a => a.name).join(', ') : (item.addon_details || []).map(a => a.name).join(', ')}</Text> : null}
                        </View>
                        <Text style={styles.detailItemQty}>×{item.quantity}</Text>
                        <Text style={styles.detailItemPrice}>{formatCurrency(lineTotal)}</Text>
                      </View>
                    );
                  })}
                  {(orderDetail.items || orderDetail.order_items || []).length === 0 && (
                    <Text style={styles.detailTextSm}>No items</Text>
                  )}
                </View>

                {/* Totals */}
                <View style={styles.detailTotals}>
                  {orderDetail.subtotal != null && (
                    <View style={styles.detailTotalRow}>
                      <Text style={styles.detailTotalLabel}>Subtotal</Text>
                      <Text style={styles.detailTotalVal}>{formatCurrency(orderDetail.subtotal)}</Text>
                    </View>
                  )}
                  {orderDetail.tax_amount > 0 && (
                    <>
                      <View style={styles.detailTotalRow}>
                        <Text style={styles.detailTotalLabel}>CGST</Text>
                        <Text style={styles.detailTotalVal}>{formatCurrency(parseFloat(orderDetail.tax_amount) / 2)}</Text>
                      </View>
                      <View style={styles.detailTotalRow}>
                        <Text style={styles.detailTotalLabel}>SGST</Text>
                        <Text style={styles.detailTotalVal}>{formatCurrency(parseFloat(orderDetail.tax_amount) / 2)}</Text>
                      </View>
                    </>
                  )}
                  {orderDetail.discount_amount > 0 && (
                    <View style={styles.detailTotalRow}>
                      <Text style={styles.detailTotalLabel}>Discount</Text>
                      <Text style={[styles.detailTotalVal, { color: colors.success }]}>-{formatCurrency(orderDetail.discount_amount)}</Text>
                    </View>
                  )}
                  <View style={[styles.detailTotalRow, styles.detailGrandTotal]}>
                    <Text style={styles.detailGrandLabel}>Total</Text>
                    <Text style={styles.detailGrandVal}>{formatCurrency(orderDetail.total || orderDetail.grand_total || orderDetail.total_amount || 0)}</Text>
                  </View>
                </View>

                {/* Payment info */}
                {orderDetail.payment_status && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Payment</Text>
                    <View style={styles.detailRow}>
                      <Badge status={orderDetail.payment_status} />
                      {orderDetail.payment_method && <Text style={styles.detailTextSm}>{capitalize(orderDetail.payment_method)}</Text>}
                    </View>
                  </View>
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </RNModal>

      {/* Notifications Modal */}
      <RNModal visible={showNotifications} transparent animationType="slide" onRequestClose={() => setShowNotifications(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.base, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ ...typography.h4, color: colors.text }}>Notifications</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                {unreadCount > 0 && (
                  <TouchableOpacity onPress={() => markAllReadMut.mutate()}>
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowNotifications(false)}>
                  <Icon name="x" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={{ padding: spacing.sm }} showsVerticalScrollIndicator={false}>
              {notifs.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: spacing.xl * 2 }}>
                  <Icon name="bell-off" size={36} color={colors.textMuted} />
                  <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.sm }}>No notifications</Text>
                </View>
              ) : notifs.map(n => (
                <TouchableOpacity
                  key={n.id}
                  onPress={() => !n.is_read && markReadMut.mutate(n.id)}
                  style={{ flexDirection: 'row', padding: spacing.sm, marginBottom: 1, backgroundColor: n.is_read ? 'transparent' : '#EFF6FF', borderRadius: radius.md }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...typography.captionBold, color: n.is_read ? colors.textSecondary : colors.text }}>{n.title}</Text>
                    {n.message ? <Text style={{ ...typography.tiny, color: colors.textMuted, marginTop: 2 }} numberOfLines={2}>{n.message}</Text> : null}
                    <Text style={{ ...typography.tiny, color: colors.textMuted, marginTop: 4 }}>{formatDateTime(n.created_at)}</Text>
                  </View>
                  {!n.is_read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 4, marginLeft: spacing.sm }} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </RNModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  list: {
    paddingBottom: spacing['2xl'],
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },

  /* Greeting */
  greetingSection: {
    marginBottom: spacing.lg,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  greetingSub: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 4,
  },

  /* Subscription Alert */
  subAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  subAlertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  subAlertText: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 18,
  },

  /* Quick Actions */
  quickActions: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  quickActionBorder: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
  },

  /* Stat Cards */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.sm / 2,
  },
  statCard: {
    width: IS_TABLET ? '23%' : '47%',
    marginHorizontal: IS_TABLET ? '1%' : '1.5%',
    marginBottom: spacing.md,
  },

  /* Section */
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionTitleMargin: {
    marginTop: spacing.lg,
  },

  /* Collection Breakdown */
  collectionCard: {
    padding: spacing.base,
  },
  collectionTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  collectionTotalLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  collectionTotalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  collectionBar: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: spacing.base,
    borderRadius: 4,
    overflow: 'hidden',
  },
  collectionRows: {
    gap: spacing.sm,
  },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  collectionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  collectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  collectionLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  collectionAmount: {
    ...typography.bodyBold,
    color: colors.text,
  },

  /* Sales Chart */
  chartCard: {
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.sm,
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xs,
    minWidth: '100%',
    justifyContent: 'space-between',
  },
  barItem: {
    alignItems: 'center',
    marginHorizontal: spacing.sm,
    minWidth: 52,
  },
  barValue: {
    ...typography.tiny,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  barTrack: {
    width: 28,
    height: 100,
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
  },
  barLabel: {
    ...typography.tiny,
    color: colors.text,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  barOrders: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
  },

  /* Popular Items */
  popularCard: {
    paddingVertical: spacing.sm,
  },
  popularRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  popularRank: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  rankText: {
    ...typography.captionBold,
    color: colors.primary,
  },
  popularInfo: {
    flex: 1,
  },
  popularName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  popularMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  popularRevenue: {
    ...typography.bodyBold,
    color: colors.success,
    marginLeft: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },

  /* Recent Orders */
  orderCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  orderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  orderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderNumber: {
    ...typography.bodyBold,
    color: colors.text,
  },
  orderTable: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    backgroundColor: colors.surfaceDark,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  orderBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  orderMeta: {
    flex: 1,
  },
  orderMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  orderMetaText: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: spacing.xs,
  },
  orderAmountWrap: {
    alignItems: 'flex-end',
  },
  orderAmount: {
    ...typography.h4,
    color: colors.text,
  },
  paymentStatus: {
    ...typography.tiny,
    fontWeight: '600',
    marginTop: 2,
  },

  /* Empty */
  emptyOrders: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },

  /* Order Detail Modal */
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBackdropTouch: { flex: 1 },
  modalSheet: {
    backgroundColor: colors.white, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalTitle: { ...typography.h3, color: colors.text },
  modalSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  modalCloseBtn: { padding: spacing.xs },
  modalLoading: { paddingVertical: spacing['3xl'], alignItems: 'center' },
  modalBody: { paddingHorizontal: spacing.xl, paddingVertical: spacing.base },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  detailTime: { ...typography.caption, color: colors.textSecondary },
  detailSection: { marginBottom: spacing.lg },
  detailLabel: { ...typography.captionBold, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  detailText: { ...typography.body, color: colors.text },
  detailTextSm: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  detailItemRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  detailItemInfo: { flex: 1 },
  detailItemName: { ...typography.body, color: colors.text },
  detailItemMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  detailItemQty: { ...typography.bodyBold, color: colors.textSecondary, marginHorizontal: spacing.md },
  detailItemPrice: { ...typography.bodyBold, color: colors.text, minWidth: 70, textAlign: 'right' },
  detailTotals: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, marginBottom: spacing.lg },
  detailTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  detailTotalLabel: { ...typography.body, color: colors.textSecondary },
  detailTotalVal: { ...typography.body, color: colors.text },
  detailGrandTotal: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs, paddingTop: spacing.sm },
  detailGrandLabel: { ...typography.h4, color: colors.text },
  detailGrandVal: { ...typography.h4, color: colors.primary },
});
