import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Alert, StyleSheet, RefreshControl, ScrollView,
  Image, Modal as RNModal, ActivityIndicator, Share,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { floorApi } from '../../api/floor.api';
import { tableApi } from '../../api/table.api';
import { orderApi } from '../../api/order.api';
import Header from '../../components/common/Header';
import TabBar from '../../components/common/TabBar';
import FAB from '../../components/common/FAB';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { colors, spacing, radius, typography } from '../../theme';
import { capitalize } from '../../utils/formatters';

const TABS = [
  { key: 'floors', label: 'Floors' },
  { key: 'tables', label: 'Tables' },
];

const STATUS_OPTIONS = ['available', 'occupied', 'reserved', 'cleaning'];
const STATUS_ICONS = {
  available: 'check-circle',
  occupied: 'users',
  reserved: 'clock',
  cleaning: 'refresh-cw',
};

export default function FloorScreen({ navigation }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('floors');
  const [floorFilter, setFloorFilter] = useState('');
  const [showFloorModal, setShowFloorModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingFloor, setEditingFloor] = useState(null);
  const [editingTable, setEditingTable] = useState(null);
  const [floorForm, setFloorForm] = useState({ name: '' });
  const [tableForm, setTableForm] = useState({ table_number: '', capacity: '4', floor_id: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);

  // QR/PIN modal
  const [qrModal, setQrModal] = useState({ open: false, table: null });
  const [qrData, setQrData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

  // Table actions modal
  const [actionTable, setActionTable] = useState(null);
  const [showActionModal, setShowActionModal] = useState(false);

  // Waiter assignment modal
  const [showWaiterModal, setShowWaiterModal] = useState(false);
  const [waiterTable, setWaiterTable] = useState(null);
  const [selectedWaiterId, setSelectedWaiterId] = useState('');

  // View order modal
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderTable, setOrderTable] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [orderItemsLoading, setOrderItemsLoading] = useState(false);

  const { data: floors = [], isLoading: floorsLoading, refetch: refetchFloors } = useQuery({
    queryKey: ['floors'],
    queryFn: async () => { const r = await floorApi.getFloors(); return r.data || r; },
  });

  const { data: tables = [], isLoading: tablesLoading, refetch: refetchTables } = useQuery({
    queryKey: ['tables', floorFilter],
    queryFn: async () => {
      const params = floorFilter ? { floor_id: floorFilter } : {};
      const r = await tableApi.getTables(params);
      return r.data || r;
    },
  });

  const { data: waiters = [] } = useQuery({
    queryKey: ['waiters'],
    queryFn: async () => { const r = await tableApi.getWaiters(); return r.data || r; },
  });

  const assignWaiterMut = useMutation({
    mutationFn: ({ id, waiterId }) => tableApi.assignWaiter(id, waiterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setShowWaiterModal(false);
      setWaiterTable(null);
      Alert.alert('Success', selectedWaiterId ? 'Waiter assigned' : 'Waiter removed');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to assign waiter'),
  });

  const saveFloorMut = useMutation({
    mutationFn: (data) => editingFloor ? floorApi.updateFloor(editingFloor.id, data) : floorApi.createFloor(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['floors'] }); closeFloorModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to save floor'),
  });

  const deleteFloorMut = useMutation({
    mutationFn: (id) => floorApi.deleteFloor(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['floors'] }); closeDelete(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to delete'),
  });

  const saveTableMut = useMutation({
    mutationFn: (data) => editingTable ? tableApi.updateTable(editingTable.id, data) : tableApi.createTable(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tables'] }); closeTableModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to save table'),
  });

  const deleteTableMut = useMutation({
    mutationFn: (id) => tableApi.deleteTable(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tables'] }); closeDelete(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to delete'),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }) => tableApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setShowActionModal(false);
      setActionTable(null);
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to update status'),
  });

  const resetSessionMut = useMutation({
    mutationFn: (id) => tableApi.resetSession(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      const newPin = res?.data?.pin || res?.pin;
      Alert.alert('Session Reset', newPin ? `New PIN: ${newPin}` : 'QR session has been reset.');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to reset session'),
  });

  const closeFloorModal = () => { setShowFloorModal(false); setEditingFloor(null); setFloorForm({ name: '' }); };
  const closeTableModal = () => { setShowTableModal(false); setEditingTable(null); setTableForm({ table_number: '', capacity: '4', floor_id: '' }); };
  const closeDelete = () => { setShowDeleteConfirm(false); setDeleteTarget(null); };

  const openAddFloor = () => { setEditingFloor(null); setFloorForm({ name: '' }); setShowFloorModal(true); };
  const openEditFloor = (f) => { setEditingFloor(f); setFloorForm({ name: f.name }); setShowFloorModal(true); };
  const openAddTable = () => { setEditingTable(null); setTableForm({ table_number: '', capacity: '4', floor_id: floors[0]?.id ? String(floors[0].id) : '' }); setShowTableModal(true); };
  const openEditTable = (t) => { setEditingTable(t); setTableForm({ table_number: t.table_number || '', capacity: String(t.capacity || 4), floor_id: t.floor_id ? String(t.floor_id) : '' }); setShowTableModal(true); };

  const confirmDelete = (type, item) => { setDeleteTarget({ type, item }); setShowDeleteConfirm(true); };
  const handleDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'floor') deleteFloorMut.mutate(deleteTarget.item.id);
    else deleteTableMut.mutate(deleteTarget.item.id);
  };

  const handleSaveFloor = () => {
    if (!floorForm.name.trim()) { Alert.alert('Validation', 'Floor name is required'); return; }
    saveFloorMut.mutate(floorForm);
  };

  const handleSaveTable = () => {
    if (!tableForm.table_number.trim() || !tableForm.floor_id) { Alert.alert('Validation', 'Table number and floor are required'); return; }
    saveTableMut.mutate({ ...tableForm, capacity: parseInt(tableForm.capacity) || 4 });
  };

  // QR Code handlers
  const handleGenerateQR = async (tableId) => {
    setQrLoading(true);
    try {
      const res = await tableApi.generateQR(tableId);
      const data = res.data || res;
      setQrData(data);
      Alert.alert('Success', 'QR code generated');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to generate QR');
    } finally {
      setQrLoading(false);
    }
  };

  const handleResetSession = async (tableId) => {
    resetSessionMut.mutate(tableId);
  };

  const openQRModal = (table) => {
    setQrModal({ open: true, table });
    // Check if table already has QR code
    const isValidQR = table.qr_code && table.qr_code.startsWith('data:image/png;base64,') && table.qr_code.length > 1000;
    if (isValidQR) {
      setQrData({ qrCodeDataUrl: table.qr_code });
    } else {
      setQrData(null);
    }
  };

  const closeQRModal = () => { setQrModal({ open: false, table: null }); setQrData(null); };

  const openTableActions = (table) => { setActionTable(table); setShowActionModal(true); };

  const openWaiterModal = (table) => {
    setWaiterTable(table);
    setSelectedWaiterId(table.assigned_waiter_id ? String(table.assigned_waiter_id) : '');
    setShowWaiterModal(true);
  };

  const handleAssignWaiter = () => {
    if (!waiterTable) return;
    assignWaiterMut.mutate({ id: waiterTable.id, waiterId: selectedWaiterId || null });
  };

  const openOrderModal = async (table) => {
    setOrderTable(table);
    setOrderItems([]);
    setShowOrderModal(true);
    if (table.current_order_id) {
      setOrderItemsLoading(true);
      try {
        const res = await orderApi.getOrder(table.current_order_id);
        const data = res.data || res;
        setOrderItems(data.items || []);
      } catch { /* ignore */ } finally { setOrderItemsLoading(false); }
    }
  };

  const floorOptions = floors.map(f => ({ label: f.name, value: String(f.id) }));
  const filterOptions = [{ label: 'All Floors', value: '' }, ...floorOptions];
  const statusColors = { available: colors.success, occupied: colors.warning, reserved: colors.info, cleaning: colors.textMuted };

  const renderFloorItem = useCallback(({ item }) => (
    <Card style={styles.card}>
      <TouchableOpacity style={styles.cardContent} onPress={() => openEditFloor(item)}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardSub}>{item.table_count || 0} tables</Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => openEditFloor(item)} style={styles.iconBtn}>
            <Icon name="edit-2" size={16} color={colors.info} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => confirmDelete('floor', item)} style={styles.iconBtn}>
            <Icon name="trash-2" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Card>
  ), [floors]);

  const renderTableItem = useCallback(({ item }) => (
    <Card style={styles.tableCard}>
      <TouchableOpacity style={styles.tableContent} onPress={() => openTableActions(item)}>
        <View style={[styles.statusDot, { backgroundColor: statusColors[item.status] || colors.textMuted }]} />
        <View style={styles.tableInfo}>
          <Text style={styles.cardTitle}>Table {item.table_number}</Text>
          <Text style={styles.cardSub}>
            {item.floor_name || 'No floor'} · {item.capacity} seats
            {item.table_pin ? ` · PIN: ${item.table_pin}` : ''}
          </Text>
        </View>
        <Badge text={capitalize(item.status || 'available')} variant={item.status === 'available' ? 'success' : item.status === 'occupied' ? 'warning' : 'default'} />
      </TouchableOpacity>

      {/* Occupied table details: waiter, amount, time */}
      {item.status === 'occupied' && item.order_total ? (
        <View style={styles.occupiedInfo}>
          <View style={styles.occupiedRow}>
            {item.minutes_occupied != null && (
              <View style={styles.occupiedDetail}>
                <Icon name="clock" size={11} color={colors.textSecondary} />
                <Text style={styles.occupiedDetailText}>{item.minutes_occupied} min</Text>
              </View>
            )}
            <Text style={styles.occupiedAmount}>
              {'\u20B9'}{Number(item.order_total).toLocaleString()}
            </Text>
          </View>
          {item.waiter_name && (
            <Text style={styles.occupiedWaiter}>Waiter: {item.waiter_name}</Text>
          )}
        </View>
      ) : item.waiter_name ? (
        <Text style={styles.waiterLabel}>Waiter: {item.waiter_name}</Text>
      ) : null}

      {/* Quick action buttons */}
      <View style={styles.tableActions}>
        <TouchableOpacity style={styles.tableActionBtn} onPress={() => openQRModal(item)}>
          <Icon name="camera" size={14} color={colors.info} />
          <Text style={styles.tableActionText}>QR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tableActionBtn} onPress={() => openWaiterModal(item)}>
          <Icon name="user-check" size={14} color={colors.success} />
          <Text style={styles.tableActionText}>Waiter</Text>
        </TouchableOpacity>
        {item.status === 'occupied' && (
          <TouchableOpacity style={styles.tableActionBtn} onPress={() => openOrderModal(item)}>
            <Icon name="eye" size={14} color="#7C3AED" />
            <Text style={[styles.tableActionText, { color: '#7C3AED' }]}>Order</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.tableActionBtn} onPress={() => openEditTable(item)}>
          <Icon name="edit-2" size={14} color={colors.info} />
          <Text style={styles.tableActionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tableActionBtn} onPress={() => confirmDelete('table', item)}>
          <Icon name="trash-2" size={14} color={colors.error} />
          <Text style={[styles.tableActionText, { color: colors.error }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </Card>
  ), []);

  const isLoading = activeTab === 'floors' ? floorsLoading : tablesLoading;

  return (
    <View style={styles.container}>
      <Header title="Floors & Tables" onMenu={() => navigation.openDrawer()} />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'tables' && (
        <View style={styles.filterRow}>
          <Select value={floorFilter} options={filterOptions} onChange={setFloorFilter} placeholder="All Floors" style={styles.filterSelect} />
        </View>
      )}

      {isLoading ? <LoadingSpinner fullScreen /> : activeTab === 'floors' ? (
        <FlatList
          data={floors}
          keyExtractor={i => String(i.id)}
          renderItem={renderFloorItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetchFloors} />}
          ListEmptyComponent={<EmptyState icon={<Icon name="layers" size={48} color={colors.textMuted} />} title="No floors" message="Add your first floor" actionLabel="Add Floor" onAction={openAddFloor} />}
        />
      ) : (
        <FlatList
          data={tables}
          keyExtractor={i => String(i.id)}
          renderItem={renderTableItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetchTables} />}
          ListEmptyComponent={<EmptyState icon={<Icon name="grid" size={48} color={colors.textMuted} />} title="No tables" message="Add your first table" actionLabel="Add Table" onAction={openAddTable} />}
        />
      )}

      <FAB onPress={activeTab === 'floors' ? openAddFloor : openAddTable} />

      {/* Floor Modal */}
      <Modal visible={showFloorModal} onClose={closeFloorModal} title={editingFloor ? 'Edit Floor' : 'Add Floor'}>
        <Input label="Floor Name" value={floorForm.name} onChangeText={v => setFloorForm({ name: v })} placeholder="e.g. Ground Floor" />
        <Button title={editingFloor ? 'Update Floor' : 'Add Floor'} onPress={handleSaveFloor} loading={saveFloorMut.isPending} fullWidth style={styles.modalBtn} />
      </Modal>

      {/* Table Modal */}
      <Modal visible={showTableModal} onClose={closeTableModal} title={editingTable ? 'Edit Table' : 'Add Table'}>
        <Input label="Table Number" value={tableForm.table_number} onChangeText={v => setTableForm(p => ({ ...p, table_number: v }))} placeholder="e.g. T1" />
        <Select label="Floor" value={tableForm.floor_id} options={floorOptions} onChange={v => setTableForm(p => ({ ...p, floor_id: v }))} placeholder="Select floor" />
        <Input label="Capacity" value={tableForm.capacity} onChangeText={v => setTableForm(p => ({ ...p, capacity: v }))} placeholder="4" keyboardType="numeric" />
        <Button title={editingTable ? 'Update Table' : 'Add Table'} onPress={handleSaveTable} loading={saveTableMut.isPending} fullWidth style={styles.modalBtn} />
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal visible={showDeleteConfirm} onClose={closeDelete} onConfirm={handleDelete} title="Delete" message={`Are you sure you want to delete this ${deleteTarget?.type}?`} confirmText="Delete" confirmVariant="danger" loading={deleteFloorMut.isPending || deleteTableMut.isPending} />

      {/* QR Code Modal */}
      <RNModal visible={qrModal.open} transparent animationType="slide" onRequestClose={closeQRModal}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={styles.sheetBackdropTouch} onPress={closeQRModal} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>QR Code — Table {qrModal.table?.table_number || ''}</Text>
              </View>
              <TouchableOpacity onPress={closeQRModal} style={styles.sheetClose}>
                <Icon name="x" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
              {/* Table PIN */}
              {qrModal.table?.table_pin && (
                <View style={styles.pinCard}>
                  <View>
                    <Text style={styles.pinCardLabel}>Table PIN (share with customer)</Text>
                    <Text style={styles.pinCardValue}>{qrModal.table.table_pin}</Text>
                  </View>
                  <Icon name="key" size={28} color="#FFD54F" />
                </View>
              )}

              {/* QR Code Image */}
              {qrData?.qrCodeDataUrl ? (
                <View style={styles.qrSection}>
                  <View style={styles.qrImageWrap}>
                    <Image source={{ uri: qrData.qrCodeDataUrl }} style={styles.qrImage} resizeMode="contain" />
                  </View>
                  {qrData.qrUrl && (
                    <View style={styles.qrUrlBox}>
                      <Text style={styles.qrUrlLabel}>QR URL</Text>
                      <Text style={styles.qrUrlText} selectable numberOfLines={2}>{qrData.qrUrl}</Text>
                    </View>
                  )}
                  <View style={styles.qrActions}>
                    <Button
                      title="Regenerate"
                      onPress={() => handleGenerateQR(qrModal.table.id)}
                      loading={qrLoading}
                      variant="secondary"
                      icon={<Icon name="refresh-cw" size={14} color={colors.primary} />}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                    <Button
                      title="Share QR URL"
                      onPress={() => {
                        if (qrData?.qrUrl) {
                          Share.share({ message: `Scan to order: ${qrData.qrUrl}` });
                        }
                      }}
                      icon={<Icon name="share-2" size={14} color={colors.white} />}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                  </View>
                  <Button
                    title="Reset PIN & Session"
                    onPress={() => {
                      Alert.alert('Reset PIN & Session', 'This will reset the table PIN and expire any active QR sessions. Continue?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Reset', style: 'destructive', onPress: () => handleResetSession(qrModal.table.id) },
                      ]);
                    }}
                    loading={resetSessionMut.isPending}
                    variant="secondary"
                    icon={<Icon name="rotate-ccw" size={14} color={colors.error} />}
                    style={styles.resetBtn}
                    size="sm"
                    textStyle={{ color: colors.error }}
                  />
                </View>
              ) : (
                <View style={styles.noQrSection}>
                  <Icon name="camera" size={40} color={colors.textMuted} />
                  <Text style={styles.noQrText}>No QR code generated for this table yet.</Text>
                  <Button
                    title="Generate QR Code"
                    onPress={() => handleGenerateQR(qrModal.table.id)}
                    loading={qrLoading}
                    icon={<Icon name="camera" size={16} color={colors.white} />}
                    style={styles.generateBtn}
                  />
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </RNModal>

      {/* Table Actions Modal (Status change, PIN, etc.) */}
      <RNModal visible={showActionModal} transparent animationType="slide" onRequestClose={() => setShowActionModal(false)}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={styles.sheetBackdropTouch} onPress={() => setShowActionModal(false)} />
          <View style={styles.sheetContainer}>
            {actionTable && (
              <>
                <View style={styles.sheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>Table {actionTable.table_number}</Text>
                    <Text style={styles.sheetSubtitle}>
                      {capitalize(actionTable.status)} · {actionTable.capacity} seats
                      {actionTable.floor_name ? ` · ${actionTable.floor_name}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowActionModal(false)} style={styles.sheetClose}>
                    <Icon name="x" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
                  {/* PIN Display */}
                  {actionTable.table_pin && (
                    <View style={styles.pinCard}>
                      <View>
                        <Text style={styles.pinCardLabel}>Table PIN</Text>
                        <Text style={styles.pinCardValue}>{actionTable.table_pin}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.resetPinBtn}
                        onPress={() => {
                          Alert.alert('Reset PIN & Session', 'Reset the table PIN and expire QR sessions?', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Reset', onPress: () => resetSessionMut.mutate(actionTable.id) },
                          ]);
                        }}
                        disabled={resetSessionMut.isPending}
                      >
                        <Icon name="rotate-ccw" size={12} color={colors.warning} />
                        <Text style={styles.resetPinText}>Reset</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Change Status */}
                  <Text style={styles.statusSectionTitle}>Change Status</Text>
                  <View style={styles.statusGrid}>
                    {STATUS_OPTIONS.map((status) => {
                      const isCurrentStatus = actionTable.status === status;
                      const sc = colors.status[status] || colors.status.available;
                      return (
                        <TouchableOpacity
                          key={status}
                          style={[
                            styles.statusOption,
                            { backgroundColor: sc.bg, borderColor: isCurrentStatus ? sc.text : sc.border, borderWidth: isCurrentStatus ? 2 : 1 },
                          ]}
                          onPress={() => {
                            if (isCurrentStatus) return;
                            updateStatusMut.mutate({ id: actionTable.id, status });
                          }}
                          disabled={updateStatusMut.isPending || isCurrentStatus}
                        >
                          <Icon name={STATUS_ICONS[status]} size={16} color={sc.text} />
                          <Text style={[styles.statusOptionText, { color: sc.text }]}>{capitalize(status)}</Text>
                          {isCurrentStatus && <Icon name="check" size={14} color={sc.text} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Quick Actions */}
                  <View style={styles.quickActions}>
                    <Button
                      title="QR Code"
                      onPress={() => { setShowActionModal(false); setTimeout(() => openQRModal(actionTable), 300); }}
                      variant="secondary"
                      icon={<Icon name="camera" size={14} color={colors.primary} />}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                    <Button
                      title="Waiter"
                      onPress={() => { setShowActionModal(false); setTimeout(() => openWaiterModal(actionTable), 300); }}
                      variant="secondary"
                      icon={<Icon name="user-check" size={14} color={colors.success} />}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                  </View>
                  <View style={[styles.quickActions, { marginTop: spacing.sm }]}>
                    {actionTable.status === 'occupied' && (
                      <Button
                        title="View Order"
                        onPress={() => { setShowActionModal(false); setTimeout(() => openOrderModal(actionTable), 300); }}
                        variant="secondary"
                        icon={<Icon name="eye" size={14} color="#7C3AED" />}
                        style={{ flex: 1 }}
                        size="sm"
                      />
                    )}
                    <Button
                      title="Edit Table"
                      onPress={() => { setShowActionModal(false); setTimeout(() => openEditTable(actionTable), 300); }}
                      variant="secondary"
                      icon={<Icon name="edit-2" size={14} color={colors.primary} />}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </RNModal>

      {/* Assign Waiter Modal */}
      <RNModal visible={showWaiterModal} transparent animationType="slide" onRequestClose={() => setShowWaiterModal(false)}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={styles.sheetBackdropTouch} onPress={() => setShowWaiterModal(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Assign Waiter</Text>
                <Text style={styles.sheetSubtitle}>Table {waiterTable?.table_number}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowWaiterModal(false)} style={styles.sheetClose}>
                <Icon name="x" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
              {/* No waiter option */}
              <TouchableOpacity
                style={[styles.waiterOption, selectedWaiterId === '' && styles.waiterOptionSelected]}
                onPress={() => setSelectedWaiterId('')}
              >
                <View style={styles.waiterAvatar}>
                  <Icon name="user-x" size={16} color={colors.textMuted} />
                </View>
                <Text style={[styles.waiterOptionText, { color: colors.textMuted, fontStyle: 'italic' }]}>No waiter assigned</Text>
                {selectedWaiterId === '' && <Icon name="check-circle" size={16} color={colors.primary} />}
              </TouchableOpacity>

              {waiters.map(w => (
                <TouchableOpacity
                  key={w.id}
                  style={[styles.waiterOption, selectedWaiterId === String(w.id) && styles.waiterOptionSelected]}
                  onPress={() => setSelectedWaiterId(String(w.id))}
                >
                  <View style={[styles.waiterAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.waiterAvatarText}>
                      {w.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </Text>
                  </View>
                  <Text style={styles.waiterOptionText}>{w.name}</Text>
                  {selectedWaiterId === String(w.id) && <Icon name="check-circle" size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}

              {waiters.length === 0 && (
                <Text style={styles.noWaitersText}>No waiters found. Add waiter staff from the Staff page.</Text>
              )}

              <View style={styles.waiterActions}>
                <Button
                  title="Cancel"
                  onPress={() => setShowWaiterModal(false)}
                  variant="secondary"
                  style={{ flex: 1 }}
                />
                <Button
                  title={assignWaiterMut.isPending ? 'Saving...' : 'Confirm'}
                  onPress={handleAssignWaiter}
                  loading={assignWaiterMut.isPending}
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </RNModal>

      {/* View Order Modal */}
      <RNModal visible={showOrderModal} transparent animationType="slide" onRequestClose={() => setShowOrderModal(false)}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={styles.sheetBackdropTouch} onPress={() => setShowOrderModal(false)} />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Table {orderTable?.table_number} — Current Order</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowOrderModal(false); setOrderTable(null); setOrderItems([]); }} style={styles.sheetClose}>
                <Icon name="x" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
              {orderTable?.order_total ? (
                <>
                  {/* Order summary grid */}
                  <View style={styles.orderGrid}>
                    <View style={styles.orderGridItem}>
                      <Text style={styles.orderGridLabel}>Order #</Text>
                      <Text style={styles.orderGridValue}>{orderTable.order_number || '—'}</Text>
                    </View>
                    <View style={styles.orderGridItem}>
                      <Text style={styles.orderGridLabel}>Order Total</Text>
                      <Text style={styles.orderGridValue}>{'\u20B9'}{Number(orderTable.order_total).toLocaleString()}</Text>
                    </View>
                    <View style={styles.orderGridItem}>
                      <Text style={styles.orderGridLabel}>Waiter</Text>
                      <Text style={styles.orderGridValue}>{orderTable.waiter_name || '—'}</Text>
                    </View>
                    <View style={styles.orderGridItem}>
                      <Text style={styles.orderGridLabel}>Seated</Text>
                      <Text style={styles.orderGridValue}>{orderTable.minutes_occupied != null ? `${orderTable.minutes_occupied} min` : '—'}</Text>
                    </View>
                  </View>

                  {/* Order items */}
                  <Text style={styles.orderItemsTitle}>Items Ordered</Text>
                  {orderItemsLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.base }} />
                  ) : orderItems.length > 0 ? (
                    <View style={styles.orderItemsList}>
                      {orderItems.map((oi) => (
                        <View key={oi.id} style={styles.orderItemRow}>
                          <Text style={styles.orderItemName}>
                            <Text style={styles.orderItemQty}>{oi.quantity}x</Text> {oi.item_name}
                          </Text>
                          <Text style={styles.orderItemPrice}>{'\u20B9'}{Number(oi.total_price).toLocaleString()}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.noOrderItemsText}>No items loaded</Text>
                  )}

                  {/* Quick status actions */}
                  <View style={[styles.quickActions, { marginTop: spacing.lg }]}>
                    <Button
                      title="Mark Cleaning"
                      onPress={() => {
                        updateStatusMut.mutate({ id: orderTable.id, status: 'cleaning' });
                        setShowOrderModal(false); setOrderTable(null); setOrderItems([]);
                      }}
                      variant="secondary"
                      icon={<Icon name="refresh-cw" size={14} color={colors.textSecondary} />}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                    <Button
                      title="Mark Available"
                      onPress={() => {
                        updateStatusMut.mutate({ id: orderTable.id, status: 'available' });
                        setShowOrderModal(false); setOrderTable(null); setOrderItems([]);
                      }}
                      icon={<Icon name="check-circle" size={14} color={colors.white} />}
                      style={{ flex: 1, backgroundColor: colors.success }}
                      size="sm"
                    />
                  </View>
                </>
              ) : (
                <Text style={styles.noOrderText}>No active order for this table.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </RNModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.base, paddingBottom: 80 },
  filterRow: { paddingHorizontal: spacing.base, paddingTop: spacing.md },
  filterSelect: { marginBottom: 0 },
  card: { marginBottom: spacing.md },
  cardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardInfo: { flex: 1 },
  cardTitle: { ...typography.bodyBold, color: colors.text },
  cardSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: { padding: spacing.sm },
  tableCard: { marginBottom: spacing.md },
  tableContent: { flexDirection: 'row', alignItems: 'center' },
  tableInfo: { flex: 1, marginLeft: spacing.md },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  modalBtn: { marginTop: spacing.base },

  // Table quick actions
  tableActions: {
    flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderLight, gap: spacing.sm,
  },
  tableActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  tableActionText: { ...typography.tiny, color: colors.textSecondary, fontWeight: '600' },

  // Bottom Sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetBackdropTouch: { flex: 1 },
  sheetContainer: {
    backgroundColor: colors.white, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
    maxHeight: '80%',
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
  pinCardLabel: { ...typography.caption, color: '#F57F17', fontWeight: '600', marginBottom: spacing.xs },
  pinCardValue: { fontFamily: 'monospace', fontSize: 28, fontWeight: '700', color: '#E65100', letterSpacing: 6 },
  resetPinBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderWidth: 1, borderColor: '#FFD54F', borderRadius: radius.md,
  },
  resetPinText: { ...typography.caption, color: '#F57F17', fontWeight: '600' },

  // QR Section
  qrSection: { marginTop: spacing.base },
  qrImageWrap: {
    alignItems: 'center', padding: spacing.base,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  qrImage: { width: 200, height: 200, borderRadius: radius.md },
  qrUrlBox: {
    marginTop: spacing.md, padding: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
  },
  qrUrlLabel: { ...typography.tiny, color: colors.textMuted, marginBottom: spacing.xs },
  qrUrlText: { ...typography.caption, color: colors.text, fontFamily: 'monospace' },
  qrActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  resetBtn: { marginTop: spacing.md, borderColor: colors.error },
  noQrSection: { alignItems: 'center', paddingVertical: spacing['3xl'] },
  noQrText: { ...typography.body, color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.lg, textAlign: 'center' },
  generateBtn: { minWidth: 200 },

  // Status section
  statusSectionTitle: { ...typography.captionBold, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.md },
  statusGrid: { gap: spacing.sm },
  statusOption: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.base,
    borderRadius: radius.md, gap: spacing.md,
  },
  statusOptionText: { ...typography.body, fontWeight: '600', flex: 1 },

  // Quick Actions
  quickActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },

  // Occupied table info on card
  occupiedInfo: {
    marginTop: spacing.md, padding: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: radius.lg,
    borderWidth: 1, borderColor: '#FECACA',
  },
  occupiedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  occupiedDetail: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },
  occupiedDetailText: { ...typography.caption, color: colors.textSecondary },
  occupiedAmount: { ...typography.bodyBold, color: colors.text },
  occupiedWaiter: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  waiterLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },

  // Waiter assignment modal
  waiterOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.base, borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.border, marginTop: spacing.sm,
  },
  waiterOptionSelected: {
    borderColor: colors.primary, backgroundColor: '#FEF2F2',
  },
  waiterAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  waiterAvatarText: { ...typography.captionBold, color: colors.white },
  waiterOptionText: { ...typography.body, color: colors.text, flex: 1 },
  noWaitersText: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.base },
  waiterActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.base },

  // View order modal
  orderGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.base,
  },
  orderGridItem: {
    width: '48%', padding: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
  },
  orderGridLabel: { ...typography.tiny, color: colors.textMuted, marginBottom: spacing.xs },
  orderGridValue: { ...typography.bodyBold, color: colors.text },
  orderItemsTitle: {
    ...typography.captionBold, color: colors.textMuted,
    textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.md,
  },
  orderItemsList: {
    borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.lg, overflow: 'hidden',
  },
  orderItemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  orderItemName: { ...typography.body, color: colors.text, flex: 1 },
  orderItemQty: { fontWeight: '700', color: colors.primary },
  orderItemPrice: { ...typography.bodyBold, color: colors.text },
  noOrderItemsText: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },
  noOrderText: { ...typography.body, color: colors.textSecondary, paddingVertical: spacing.xl, textAlign: 'center' },
});
