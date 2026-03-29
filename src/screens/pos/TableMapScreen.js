import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Dimensions, Alert,
  StyleSheet, RefreshControl, Modal as RNModal, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { floorApi } from '../../api/floor.api';
import { tableApi } from '../../api/table.api';
import { orderApi } from '../../api/order.api';
import { reservationApi } from '../../api/reservation.api';
import Header from '../../components/common/Header';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { colors, spacing, radius, typography } from '../../theme';
import { capitalize, formatCurrency, timeAgo } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TABLE_CARD_MARGIN = spacing.sm;
const NUM_COLUMNS = 3;
const TABLE_CARD_SIZE =
  (SCREEN_WIDTH - spacing.base * 2 - TABLE_CARD_MARGIN * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

const STATUS_OPTIONS = ['available', 'occupied', 'reserved', 'cleaning'];
const STATUS_ICONS = {
  available: 'check-circle',
  occupied: 'users',
  reserved: 'clock',
  cleaning: 'refresh-cw',
};

export default function TableMapScreen({ navigation }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const posScreen = (user?.role === 'owner' || user?.role === 'manager') ? 'POS / Billing' : 'POS';
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch floors
  const { data: floors = [], isLoading: floorsLoading, refetch: refetchFloors } = useQuery({
    queryKey: ['floors'],
    queryFn: async () => {
      const res = await floorApi.getFloors();
      const list = res.data || res;
      if (list.length > 0 && !selectedFloor) setSelectedFloor(list[0].id);
      return list;
    },
  });

  // Fetch tables for selected floor (use floor map for reservation info)
  const { data: tables = [], isLoading: tablesLoading, refetch: refetchTables } = useQuery({
    queryKey: ['floorMap', selectedFloor],
    queryFn: async () => {
      if (!selectedFloor) return [];
      const res = await tableApi.getFloorMap(selectedFloor);
      return res.data || res;
    },
    enabled: !!selectedFloor,
    refetchInterval: 30000,
  });

  // === MUTATIONS ===
  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }) => tableApi.updateStatus(id, status),
    onSuccess: () => {
      invalidateAll();
      Alert.alert('Success', 'Table status updated');
      closePanel();
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to update status'),
  });

  const resetSessionMut = useMutation({
    mutationFn: (id) => tableApi.resetSession(id),
    onSuccess: (res) => {
      invalidateAll();
      const newPin = res?.data?.pin || res?.pin;
      Alert.alert('Session Reset', newPin ? `New PIN: ${newPin}` : 'QR session has been reset.');
      closePanel();
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to reset session'),
  });

  const startReservationOrderMut = useMutation({
    mutationFn: (reservationId) => reservationApi.startOrder(reservationId),
    onSuccess: (res) => {
      invalidateAll();
      const order = res?.data || res;
      Alert.alert('Success', `Order #${order.orderNumber || order.order_number || ''} created. Guest seated.`);
      closePanel();
      // Navigate to POS with this order
      if (order.id) {
        navigation.navigate(posScreen, { orderId: order.id });
      }
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to seat guest'),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['floorMap'] });
    queryClient.invalidateQueries({ queryKey: ['tables'] });
    queryClient.invalidateQueries({ queryKey: ['posOrders'] });
    queryClient.invalidateQueries({ queryKey: ['posTables'] });
  };

  const closePanel = () => { setShowPanel(false); setSelectedTable(null); };

  const handleTablePress = (table) => {
    setSelectedTable(table);
    setShowPanel(true);
  };

  const handleGoToOrder = useCallback(async (table) => {
    const orderId = table.order_id || table.current_order_id;
    if (!orderId) {
      Alert.alert('No Order', 'No active order found for this table.');
      return;
    }
    closePanel();
    navigation.navigate(posScreen, { orderId, tableId: table.id });
  }, [navigation]);

  const handleStartOrder = useCallback((table) => {
    closePanel();
    navigation.navigate(posScreen, { tableId: table.id, tableNumber: table.table_number, startNew: true });
  }, [navigation]);

  const handleSeatReservation = useCallback((table) => {
    const reservationId = table.reservation_id;
    if (!reservationId) {
      Alert.alert('Error', 'No reservation found for this table.');
      return;
    }
    Alert.alert(
      'Seat Guest',
      `Seat ${table.reservation_customer || 'guest'} and start order for Table ${table.table_number}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Seat & Start Order', onPress: () => startReservationOrderMut.mutate(reservationId) },
      ],
    );
  }, [startReservationOrderMut]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchFloors(), refetchTables()]);
    setRefreshing(false);
  }, [refetchFloors, refetchTables]);

  const isLoading = floorsLoading || (tablesLoading && !!selectedFloor);

  if (isLoading && !refreshing) {
    return (
      <View style={styles.container}>
        <Header title="Table Map" onMenu={() => navigation.openDrawer()} />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Table Map"
        onMenu={() => navigation.openDrawer()}
        rightComponent={
          <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
            <Icon name="refresh-cw" size={20} color={colors.text} />
          </TouchableOpacity>
        }
      />

      {/* Floor Tabs */}
      {floors.length > 0 && (
        <View style={styles.floorTabsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.floorTabs}>
            {floors.map((floor) => {
              const isActive = selectedFloor === floor.id;
              return (
                <TouchableOpacity
                  key={floor.id}
                  style={[styles.floorPill, isActive && styles.floorPillActive]}
                  onPress={() => setSelectedFloor(floor.id)}
                  activeOpacity={0.7}
                >
                  <Icon name="layers" size={14} color={isActive ? colors.white : colors.textSecondary} style={styles.floorPillIcon} />
                  <Text style={[styles.floorPillText, isActive && styles.floorPillTextActive]}>{floor.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Status Legend */}
      <View style={styles.legendRow}>
        {STATUS_OPTIONS.map((status) => (
          <View key={status} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.status[status]?.text || colors.textMuted }]} />
            <Text style={styles.legendText}>{capitalize(status)}</Text>
          </View>
        ))}
      </View>

      {/* Table Grid */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {floors.length === 0 ? (
          <EmptyState icon={<Icon name="layers" size={48} color={colors.textMuted} />} title="No floors" message="Add floors from the admin panel to get started" />
        ) : tables.length === 0 ? (
          <EmptyState icon={<Icon name="grid" size={48} color={colors.textMuted} />} title="No tables" message="Add tables to this floor from the admin panel" />
        ) : (
          <View style={styles.grid}>
            {tables.map((table) => {
              const statusColor = colors.status[table.status] || colors.status.available;
              const textColor = statusColor.text;
              return (
                <TouchableOpacity
                  key={table.id}
                  style={[styles.tableCard, { backgroundColor: statusColor.bg, borderColor: statusColor.border }]}
                  onPress={() => handleTablePress(table)}
                  activeOpacity={0.7}
                >
                  <Icon name={STATUS_ICONS[table.status] || 'circle'} size={18} color={textColor} />
                  <Text style={[styles.tableNumber, { color: textColor }]}>{table.table_number}</Text>

                  {/* Occupied: show order total + time */}
                  {table.status === 'occupied' && table.order_total != null && (
                    <Text style={[styles.tableMeta, { color: textColor }]}>{formatCurrency(table.order_total)}</Text>
                  )}
                  {table.status === 'occupied' && table.minutes_occupied != null && (
                    <View style={styles.tableMetaRow}>
                      <Icon name="clock" size={9} color={textColor} />
                      <Text style={[styles.tableMetaSm, { color: textColor }]}>{table.minutes_occupied}m</Text>
                    </View>
                  )}

                  {/* Reserved: show customer + time */}
                  {table.status === 'reserved' && table.reservation_customer && (
                    <Text style={[styles.tableMetaSm, { color: textColor }]} numberOfLines={1}>
                      {table.reservation_time?.toString().slice(0, 5)} · {table.reservation_customer}
                    </Text>
                  )}

                  {/* Table PIN */}
                  {table.table_pin && (
                    <View style={styles.pinRow}>
                      <Icon name="key" size={8} color={textColor} />
                      <Text style={[styles.pinText, { color: textColor }]}>{table.table_pin}</Text>
                    </View>
                  )}

                  <View style={styles.tableCapacity}>
                    <Icon name="users" size={10} color={textColor} />
                    <Text style={[styles.capacityText, { color: textColor }]}>{table.capacity}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* === Table Action Panel (Bottom Sheet) === */}
      <RNModal visible={showPanel} transparent animationType="slide" onRequestClose={closePanel}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={styles.sheetBackdropTouch} onPress={closePanel} />
          <View style={styles.sheetContainer}>
            {selectedTable && (
              <>
                <View style={styles.sheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>Table {selectedTable.table_number}</Text>
                    <Text style={styles.sheetSubtitle}>
                      {capitalize(selectedTable.status)} · {selectedTable.capacity} seats
                      {selectedTable.floor_name ? ` · ${selectedTable.floor_name}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={closePanel} style={styles.sheetClose}>
                    <Icon name="x" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
                  {/* TABLE PIN */}
                  {selectedTable.table_pin && (
                    <View style={styles.pinCard}>
                      <View>
                        <Text style={styles.pinCardLabel}>Table PIN</Text>
                        <Text style={styles.pinCardValue}>{selectedTable.table_pin}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.resetPinBtn}
                        onPress={() => {
                          Alert.alert('Reset PIN & Session', 'This will reset the table PIN and expire any active QR sessions. Continue?', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Reset', onPress: () => resetSessionMut.mutate(selectedTable.id) },
                          ]);
                        }}
                        disabled={resetSessionMut.isPending}
                      >
                        {resetSessionMut.isPending ? (
                          <ActivityIndicator size="small" color={colors.warning} />
                        ) : (
                          <>
                            <Icon name="rotate-ccw" size={12} color={colors.warning} />
                            <Text style={styles.resetPinText}>Reset PIN</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* OCCUPIED TABLE */}
                  {selectedTable.status === 'occupied' && (
                    <View style={styles.actionSection}>
                      {selectedTable.order_number && (
                        <View style={styles.orderInfoCard}>
                          <View style={styles.orderInfoRow}>
                            <Icon name="file-text" size={14} color={colors.primary} />
                            <Text style={styles.orderInfoLabel}>Order #{selectedTable.order_number}</Text>
                          </View>
                          {selectedTable.order_total != null && (
                            <Text style={styles.orderInfoTotal}>{formatCurrency(selectedTable.order_total)}</Text>
                          )}
                          {selectedTable.order_status && (
                            <Badge status={selectedTable.order_status} style={{ marginTop: spacing.xs }} />
                          )}
                        </View>
                      )}
                      <Button
                        title="Go to Order"
                        onPress={() => handleGoToOrder(selectedTable)}
                        fullWidth
                        icon={<Icon name="arrow-right" size={16} color={colors.white} />}
                        style={styles.actionBtn}
                      />
                    </View>
                  )}

                  {/* RESERVED TABLE */}
                  {selectedTable.status === 'reserved' && (
                    <View style={styles.actionSection}>
                      <View style={styles.reservationCard}>
                        <Text style={styles.reservationTitle}>Reservation Details</Text>
                        {selectedTable.reservation_customer && (
                          <View style={styles.resInfoRow}>
                            <Icon name="user" size={13} color={colors.textSecondary} />
                            <Text style={styles.resInfoText}>{selectedTable.reservation_customer}</Text>
                          </View>
                        )}
                        {selectedTable.reservation_phone && (
                          <View style={styles.resInfoRow}>
                            <Icon name="phone" size={13} color={colors.textSecondary} />
                            <Text style={styles.resInfoText}>{selectedTable.reservation_phone}</Text>
                          </View>
                        )}
                        {selectedTable.reservation_guest_count && (
                          <View style={styles.resInfoRow}>
                            <Icon name="users" size={13} color={colors.textSecondary} />
                            <Text style={styles.resInfoText}>{selectedTable.reservation_guest_count} guests</Text>
                          </View>
                        )}
                        {selectedTable.reservation_time && (
                          <View style={styles.resInfoRow}>
                            <Icon name="clock" size={13} color={colors.textSecondary} />
                            <Text style={styles.resInfoText}>{selectedTable.reservation_time?.toString().slice(0, 5)}</Text>
                          </View>
                        )}
                        {selectedTable.reservation_notes && (
                          <View style={styles.resInfoRow}>
                            <Icon name="message-square" size={13} color={colors.textSecondary} />
                            <Text style={styles.resInfoText}>{selectedTable.reservation_notes}</Text>
                          </View>
                        )}
                      </View>
                      <Button
                        title="Seat Guest & Start Order"
                        onPress={() => handleSeatReservation(selectedTable)}
                        loading={startReservationOrderMut.isPending}
                        fullWidth
                        icon={<Icon name="log-in" size={16} color={colors.white} />}
                        style={styles.actionBtn}
                      />
                    </View>
                  )}

                  {/* AVAILABLE / CLEANING TABLE */}
                  {(selectedTable.status === 'available' || selectedTable.status === 'cleaning') && (
                    <View style={styles.actionSection}>
                      <Button
                        title="Start New Order"
                        onPress={() => handleStartOrder(selectedTable)}
                        fullWidth
                        icon={<Icon name="plus" size={16} color={colors.white} />}
                        style={styles.actionBtn}
                      />
                    </View>
                  )}

                  {/* CHANGE STATUS (only if not occupied) */}
                  {selectedTable.status !== 'occupied' && (
                    <View style={styles.statusSection}>
                      <Text style={styles.statusSectionTitle}>Change Status</Text>
                      <View style={styles.statusBtns}>
                        {STATUS_OPTIONS.filter(s => s !== 'occupied' && s !== selectedTable.status).map((status) => {
                          const sc = colors.status[status];
                          return (
                            <TouchableOpacity
                              key={status}
                              style={[styles.statusBtn, { backgroundColor: sc.bg, borderColor: sc.border }]}
                              onPress={() => updateStatusMut.mutate({ id: selectedTable.id, status })}
                              disabled={updateStatusMut.isPending}
                            >
                              <Icon name={STATUS_ICONS[status]} size={14} color={sc.text} />
                              <Text style={[styles.statusBtnText, { color: sc.text }]}>{capitalize(status)}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </RNModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  refreshBtn: { padding: spacing.xs },

  // Floor Tabs
  floorTabsWrapper: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  floorTabs: { paddingHorizontal: spacing.base, paddingVertical: spacing.md, gap: spacing.sm },
  floorPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.surfaceDark,
    borderWidth: 1, borderColor: colors.border,
  },
  floorPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  floorPillIcon: { marginRight: spacing.xs },
  floorPillText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  floorPillTextActive: { color: colors.white },

  // Legend
  legendRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.base, gap: spacing.base,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.xs },
  legendText: { ...typography.tiny, color: colors.textSecondary },

  // Grid
  scrollArea: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: spacing['2xl'], flexGrow: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TABLE_CARD_MARGIN },

  // Table Card
  tableCard: {
    width: TABLE_CARD_SIZE, borderRadius: radius.lg, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', padding: spacing.sm, paddingVertical: spacing.md,
  },
  tableNumber: { ...typography.bodyBold, fontSize: 16, marginTop: 2 },
  tableMeta: { ...typography.captionBold, marginTop: 2 },
  tableMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  tableMetaSm: { ...typography.tiny, marginTop: 1 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3, opacity: 0.8 },
  pinText: { fontFamily: 'monospace', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  tableCapacity: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  capacityText: { ...typography.tiny, marginLeft: 3, fontWeight: '600' },

  // Bottom Sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetBackdropTouch: { flex: 1 },
  sheetContainer: {
    backgroundColor: colors.white, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
    maxHeight: '75%',
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetTitle: { ...typography.h3, color: colors.text },
  sheetSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  sheetClose: { padding: spacing.xs },
  sheetBody: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },

  // PIN Card
  pinCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFD54F',
    borderRadius: radius.lg, padding: spacing.base, marginTop: spacing.base,
  },
  pinCardLabel: { ...typography.caption, color: '#F57F17', fontWeight: '600' },
  pinCardValue: { fontFamily: 'monospace', fontSize: 24, fontWeight: '700', color: '#E65100', letterSpacing: 4 },
  resetPinBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderWidth: 1, borderColor: '#FFD54F', borderRadius: radius.md,
  },
  resetPinText: { ...typography.caption, color: '#F57F17', fontWeight: '600' },

  // Action sections
  actionSection: { marginTop: spacing.base },
  actionBtn: { marginTop: spacing.sm },

  // Order info (occupied)
  orderInfoCard: {
    backgroundColor: colors.primaryLight, borderRadius: radius.lg, padding: spacing.base,
  },
  orderInfoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  orderInfoLabel: { ...typography.bodyBold, color: colors.primary },
  orderInfoTotal: { ...typography.h3, color: colors.primary, marginTop: spacing.xs },

  // Reservation info (reserved)
  reservationCard: {
    backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFD54F',
    borderRadius: radius.lg, padding: spacing.base,
  },
  reservationTitle: { ...typography.captionBold, color: '#F57F17', marginBottom: spacing.sm },
  resInfoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  resInfoText: { ...typography.body, color: colors.text },

  // Status change
  statusSection: { marginTop: spacing.lg, paddingTop: spacing.base, borderTopWidth: 1, borderTopColor: colors.border },
  statusSectionTitle: { ...typography.captionBold, color: colors.text, marginBottom: spacing.md },
  statusBtns: { flexDirection: 'row', gap: spacing.sm },
  statusBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1.5,
  },
  statusBtnText: { ...typography.captionBold },
});
