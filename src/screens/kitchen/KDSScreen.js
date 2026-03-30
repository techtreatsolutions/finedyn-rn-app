import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert, Vibration,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orderApi } from '../../api/order.api';
import Header from '../../components/common/Header';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { colors, spacing, radius, typography } from '../../theme';
import { timeAgo, capitalize } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import { playNewOrderAlert, releaseAlertSound } from '../../utils/alertSound';

const STATUS_FLOW = { pending: 'preparing', preparing: 'ready', ready: 'served' };
const STATUS_COLORS = {
  pending: { color: '#6B7280', bg: '#374151', text: '#E5E7EB', label: 'Pending' },
  preparing: { color: '#D97706', bg: '#92400E', text: '#FDE68A', label: 'Preparing' },
  ready: { color: '#059669', bg: '#065F46', text: '#A7F3D0', label: 'Ready' },
  served: { color: '#6B7280', bg: '#374151', text: '#D1D5DB', label: 'Served' },
};

const OVERDUE_MINUTES = 15;

function getElapsedMinutes(dateVal) {
  if (!dateVal) return null;
  let str = String(dateVal).trim();
  // If no timezone indicator, treat as IST
  if (!str.endsWith('Z') && !str.endsWith('z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
    str = str.replace('T', ' ').replace(/\.\d+$/, '');
    const [datePart, timePart] = str.split(' ');
    str = `${datePart}T${timePart || '00:00:00'}+05:30`;
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

export default function KDSScreen({ navigation }) {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const isKitchenStaff = user?.role === 'kitchen_staff';

  // Refresh elapsed times every 30s
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const prevOrderCountRef = useRef(null);

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['kitchenOrders'],
    queryFn: async () => { const r = await orderApi.getKitchenOrders(); return r.data || r; },
    refetchInterval: 10000,
  });

  // Vibration + sound alert when new orders arrive
  useEffect(() => {
    if (prevOrderCountRef.current !== null && orders.length > prevOrderCountRef.current) {
      Vibration.vibrate([0, 300, 200, 300, 200, 300]);
      playNewOrderAlert();
    }
    prevOrderCountRef.current = orders.length;
  }, [orders.length]);

  // Release sound on unmount
  useEffect(() => {
    return () => releaseAlertSound();
  }, []);

  const updateItemMut = useMutation({
    mutationFn: ({ itemId, status }) => orderApi.updateKitchenItemStatus(itemId, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kitchenOrders'] }),
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['kitchenOrders'] });
      Alert.alert('Cannot Update', err?.response?.data?.message || 'Failed to update item status');
    },
  });

  const handleLogout = useCallback(() => {
    if (logout) logout();
  }, [logout]);

  const renderOrder = useCallback(({ item: order }) => {
    let items = order.items;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch { items = []; }
    }
    items = items || [];

    const elapsed = getElapsedMinutes(order.created_at);
    const isOverdue = elapsed !== null && elapsed > OVERDUE_MINUTES;

    const pendingCount = items.filter(i => i.status === 'pending').length;
    const preparingCount = items.filter(i => i.status === 'preparing').length;
    const readyCount = items.filter(i => i.status === 'ready').length;
    const allReady = items.length > 0 && items.every(i => i.status === 'ready' || i.status === 'served');

    return (
      <Card style={[styles.orderCard, allReady && styles.orderCardDone, isOverdue && styles.orderCardOverdue]}>
        {/* Header */}
        <View style={styles.orderHeader}>
          <View style={styles.orderHeaderLeft}>
            <Text style={styles.orderNumber}>#{order.order_number}</Text>
            <Text style={styles.orderMeta}>
              {order.order_type === 'dine_in' ? `Table ${order.table_number || ''}` : capitalize(order.order_type || '')}
              {order.floor_name ? ` · ${order.floor_name}` : ''}
            </Text>
          </View>
          <View style={styles.orderHeaderRight}>
            {isOverdue && (
              <Icon name="alert-triangle" size={14} color={colors.error} style={{ marginRight: 4 }} />
            )}
            <View style={[styles.timeBadge, isOverdue && styles.timeBadgeOverdue]}>
              <Icon name="clock" size={10} color={isOverdue ? '#FCA5A5' : colors.textMuted} />
              <Text style={[styles.timeText, isOverdue && styles.timeTextOverdue]}>
                {elapsed !== null ? `${elapsed}m` : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Status summary bar */}
        <View style={styles.statusSummary}>
          {pendingCount > 0 && (
            <View style={[styles.statusChip, { backgroundColor: '#374151' }]}>
              <Text style={[styles.statusChipText, { color: '#E5E7EB' }]}>{pendingCount} pending</Text>
            </View>
          )}
          {preparingCount > 0 && (
            <View style={[styles.statusChip, { backgroundColor: '#92400E' }]}>
              <Text style={[styles.statusChipText, { color: '#FDE68A' }]}>{preparingCount} preparing</Text>
            </View>
          )}
          {readyCount > 0 && (
            <View style={[styles.statusChip, { backgroundColor: '#065F46' }]}>
              <Text style={[styles.statusChipText, { color: '#A7F3D0' }]}>{readyCount} ready</Text>
            </View>
          )}
          {allReady && (
            <View style={[styles.statusChip, { backgroundColor: '#065F46' }]}>
              <Icon name="check-circle" size={10} color="#A7F3D0" />
              <Text style={[styles.statusChipText, { color: '#A7F3D0' }]}>All Done</Text>
            </View>
          )}
        </View>

        {/* Items */}
        <View style={styles.kdsItems}>
          {items.map(item => {
            const sc = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
            const nextStatus = STATUS_FLOW[item.status];
            const isServed = item.status === 'served';
            const prepTime = item.preparation_time;

            // Parse addons
            let addons = [];
            if (item.addon_details) {
              addons = typeof item.addon_details === 'string'
                ? JSON.parse(item.addon_details || '[]')
                : (item.addon_details || []);
            }

            return (
              <View key={item.id} style={styles.kdsItem}>
                {/* Status button */}
                <TouchableOpacity
                  style={[styles.statusCircle, {
                    backgroundColor: item.status === 'pending' ? 'transparent' : sc.bg,
                    borderWidth: item.status === 'pending' ? 2 : 0,
                    borderColor: item.status === 'pending' ? '#6B7280' : 'transparent',
                  }]}
                  onPress={() => nextStatus && updateItemMut.mutate({ itemId: item.id, status: nextStatus })}
                  disabled={!nextStatus}
                >
                  {item.status === 'ready' || item.status === 'served' ? (
                    <Icon name="check" size={12} color={sc.text} />
                  ) : item.status === 'preparing' ? (
                    <Text style={{ color: sc.text, fontSize: 12, fontWeight: '700' }}>!</Text>
                  ) : (
                    <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: '#6B7280' }} />
                  )}
                </TouchableOpacity>

                {/* Item info */}
                <View style={styles.kdsItemInfo}>
                  <Text style={[styles.kdsItemName, isServed && styles.kdsItemDone]}>
                    <Text style={styles.kdsItemQty}>{item.quantity}x </Text>
                    {item.item_name}
                  </Text>
                  {item.variant_name && (
                    <Text style={styles.kdsItemVariant}>{item.variant_name}</Text>
                  )}
                  {addons.length > 0 && (
                    <Text style={styles.kdsItemAddons}>+ {addons.map(a => a.name).join(', ')}</Text>
                  )}
                  <View style={styles.kdsItemMetaRow}>
                    <View style={[styles.kdsStatusTag, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.kdsStatusTagText, { color: sc.text }]}>{sc.label}</Text>
                    </View>
                    {prepTime && prepTime > 0 && (
                      <View style={styles.prepTimeBadge}>
                        <Icon name="clock" size={9} color={colors.textMuted} />
                        <Text style={styles.prepTimeText}>{prepTime}m</Text>
                      </View>
                    )}
                  </View>
                  {item.notes && (
                    <Text style={styles.kdsItemNotes}>{item.notes}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </Card>
    );
  }, [now]);

  const hasDrawer = navigation.openDrawer !== undefined;

  return (
    <View style={styles.container}>
      <Header
        title="Kitchen Display"
        subtitle={`${orders.length} active order${orders.length !== 1 ? 's' : ''}`}
        onMenu={hasDrawer ? () => navigation.openDrawer() : undefined}
        rightComponent={
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={refetch} style={styles.refreshBtn}>
              <Icon name="refresh-cw" size={18} color={colors.primary} />
            </TouchableOpacity>
            {isKitchenStaff && (
              <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                <Icon name="log-out" size={18} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Legend bar */}
      <View style={styles.legendBar}>
        <View style={styles.legendDot}>
          <View style={[styles.dot, { backgroundColor: '#059669' }]} />
          <Text style={styles.legendText}>Live</Text>
        </View>
        <Text style={styles.legendSep}>·</Text>
        <Text style={styles.legendText}>Auto-refresh: 10s</Text>
        <View style={styles.legendRight}>
          <View style={styles.legendDot}>
            <View style={[styles.dot, { backgroundColor: '#6B7280' }]} />
            <Text style={styles.legendText}>Pending</Text>
          </View>
          <View style={styles.legendDot}>
            <View style={[styles.dot, { backgroundColor: '#D97706' }]} />
            <Text style={styles.legendText}>Preparing</Text>
          </View>
          <View style={styles.legendDot}>
            <View style={[styles.dot, { backgroundColor: '#059669' }]} />
            <Text style={styles.legendText}>Ready</Text>
          </View>
        </View>
      </View>

      {isLoading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={orders}
          keyExtractor={item => String(item.id || item.order_id)}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="check-circle" size={56} color={colors.success} />}
              title="Kitchen is clear!"
              message="No pending orders right now"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  refreshBtn: { padding: spacing.sm },
  logoutBtn: { padding: spacing.sm },
  list: { padding: spacing.base, paddingBottom: 20 },

  // Legend bar
  legendBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.sm, backgroundColor: '#1F2937', borderBottomWidth: 1, borderBottomColor: '#374151' },
  legendDot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 10, color: '#9CA3AF' },
  legendSep: { marginHorizontal: 6, color: '#6B7280' },
  legendRight: { marginLeft: 'auto', flexDirection: 'row', gap: spacing.md },

  // Order card
  orderCard: { marginBottom: spacing.base, backgroundColor: '#1F2937', borderWidth: 1.5, borderColor: '#374151' },
  orderCardDone: { borderColor: '#065F46' },
  orderCardOverdue: { borderColor: '#EF4444', backgroundColor: '#1C1917' },

  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#374151' },
  orderHeaderLeft: {},
  orderHeaderRight: { flexDirection: 'row', alignItems: 'center' },
  orderNumber: { fontSize: 16, fontWeight: '700', color: colors.white },
  orderMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, backgroundColor: '#374151' },
  timeBadgeOverdue: { backgroundColor: '#7F1D1D' },
  timeText: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  timeTextOverdue: { color: '#FCA5A5' },

  // Status summary bar
  statusSummary: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#374151' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  statusChipText: { fontSize: 10, fontWeight: '600' },

  // Items
  kdsItems: {},
  kdsItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#374151' },

  statusCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },

  kdsItemInfo: { flex: 1 },
  kdsItemName: { fontSize: 14, fontWeight: '500', color: colors.white, lineHeight: 20 },
  kdsItemQty: { fontWeight: '700', color: colors.primary },
  kdsItemDone: { textDecorationLine: 'line-through', color: '#6B7280' },
  kdsItemVariant: { fontSize: 11, color: '#93C5FD', marginTop: 1 },
  kdsItemAddons: { fontSize: 11, color: '#60A5FA', marginTop: 1 },

  kdsItemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  kdsStatusTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  kdsStatusTagText: { fontSize: 10, fontWeight: '600' },

  prepTimeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  prepTimeText: { fontSize: 10, color: '#9CA3AF' },

  kdsItemNotes: { fontSize: 11, color: '#FBBF24', fontStyle: 'italic', marginTop: 4 },
});
