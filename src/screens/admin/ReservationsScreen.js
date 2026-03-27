import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Alert, StyleSheet, RefreshControl, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reservationApi } from '../../api/reservation.api';
import { floorApi } from '../../api/floor.api';
import { tableApi } from '../../api/table.api';
import Header from '../../components/common/Header';
import FAB from '../../components/common/FAB';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import TabBar from '../../components/common/TabBar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { colors, spacing, radius, typography } from '../../theme';
import { formatDate, formatTime, formatCurrency, capitalize } from '../../utils/formatters';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'seated', label: 'Seated' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'no_show', label: 'No Show' },
];

const PAYMENT_MODES = [
  { label: 'Select mode', value: '' },
  { label: 'Cash', value: 'cash' },
  { label: 'Card', value: 'card' },
  { label: 'UPI', value: 'upi' },
  { label: 'Online', value: 'online' },
];

const INITIAL_FORM = { customer_name: '', customer_phone: '', party_size: '2', date: '', time: '', table_id: '', notes: '', advance_amount: '', advance_payment_mode: '' };

// Helper to format a Date object as YYYY-MM-DD
const toDateString = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Helper to format a Date object as HH:MM
const toTimeString = (d) => {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

// Parse YYYY-MM-DD string to Date
const parseDateString = (s) => {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Parse HH:MM string to Date (today with that time)
const parseTimeString = (s) => {
  const now = new Date();
  if (!s) return now;
  const [h, m] = s.split(':').map(Number);
  now.setHours(h, m, 0, 0);
  return now;
};

export default function ReservationsScreen({ navigation }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [startOrderTarget, setStartOrderTarget] = useState(null);

  // Date/time picker visibility states for form
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Date filter state
  const [filterDate, setFilterDate] = useState('');
  const [showFilterDatePicker, setShowFilterDatePicker] = useState(false);

  const { data: reservations = [], isLoading, refetch } = useQuery({
    queryKey: ['reservations', statusFilter, filterDate],
    queryFn: async () => {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (filterDate) params.date = filterDate;
      const r = await reservationApi.getReservations(params);
      const d = r.data || r;
      return d.reservations || d || [];
    },
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['allTables'],
    queryFn: async () => { const r = await tableApi.getTables(); return r.data || r; },
  });

  // Smart available tables for reservation form (conflict detection)
  const { data: availableTables = [] } = useQuery({
    queryKey: ['reservation-tables', form.date, form.time],
    queryFn: async () => {
      const params = {};
      if (form.date) params.date = form.date;
      if (form.time) params.time = form.time;
      const r = await reservationApi.getAvailableTables(params);
      return r.data || r;
    },
    enabled: showModal && !!(form.date && form.time),
  });

  const saveMut = useMutation({
    mutationFn: (data) => editing ? reservationApi.updateReservation(editing.id, data) : reservationApi.createReservation(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reservations'] }); closeModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to save'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => reservationApi.deleteReservation(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reservations'] }); closeDelete(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to delete'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => reservationApi.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations'] }),
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to update'),
  });

  const startOrderMut = useMutation({
    mutationFn: (id) => reservationApi.startOrder(id),
    onSuccess: (res) => {
      const d = res.data || res;
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      setStartOrderTarget(null);
      Alert.alert('Success', 'Order started!');
      if (d.id) navigation.navigate('POSDashboard', { orderId: d.id });
    },
    onError: (err) => { Alert.alert('Error', err?.response?.data?.message || 'Failed to start order'); setStartOrderTarget(null); },
  });

  const closeModal = () => { setShowModal(false); setEditing(null); setForm(INITIAL_FORM); setShowDatePicker(false); setShowTimePicker(false); };
  const closeDelete = () => { setShowDeleteConfirm(false); setDeleteTarget(null); };

  const openAdd = () => { setEditing(null); setForm(INITIAL_FORM); setShowModal(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({
      customer_name: item.customer_name || '',
      customer_phone: item.customer_phone || '',
      party_size: String(item.party_size || item.guest_count || 2),
      date: item.date || item.reservation_date || '',
      time: item.time || item.reservation_time || '',
      table_id: item.table_id ? String(item.table_id) : '',
      notes: item.notes || '',
      advance_amount: item.advance_amount ? String(item.advance_amount) : '',
      advance_payment_mode: item.advance_payment_mode || '',
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.customer_name.trim() || !form.date || !form.time) {
      Alert.alert('Validation', 'Name, date and time are required');
      return;
    }
    const payload = {
      customerName: form.customer_name,
      customerPhone: form.customer_phone,
      guestCount: parseInt(form.party_size) || 2,
      reservationDate: form.date,
      reservationTime: form.time,
      tableId: form.table_id || undefined,
      notes: form.notes || undefined,
    };
    if (form.advance_amount && parseFloat(form.advance_amount) > 0) {
      payload.advanceAmount = parseFloat(form.advance_amount);
      payload.advancePaymentMode = form.advance_payment_mode || 'cash';
    }
    saveMut.mutate(payload);
  };

  // Date picker handlers for form
  const onFormDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setForm(p => ({ ...p, date: toDateString(selectedDate) }));
    }
  };

  const onFormTimeChange = (event, selectedDate) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setForm(p => ({ ...p, time: toTimeString(selectedDate) }));
    }
  };

  // Date filter picker handler
  const onFilterDateChange = (event, selectedDate) => {
    setShowFilterDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setFilterDate(toDateString(selectedDate));
    }
  };

  // Use smart available tables when form has date+time, otherwise all tables
  const smartTables = (showModal && form.date && form.time && availableTables.length > 0)
    ? availableTables
    : tables;
  const tableOptions = smartTables.map(t => ({
    label: `Table ${t.table_number} (${t.floor_name || 'No floor'})${t.conflict ? ' ⚠ Conflict' : ''}${t.status === 'occupied' ? ' [Occ]' : ''}`,
    value: String(t.id),
  }));
  const statusVariant = (s) => {
    if (s === 'confirmed') return 'info';
    if (s === 'completed') return 'success';
    if (s === 'cancelled' || s === 'no_show') return 'danger';
    return 'warning';
  };

  const renderItem = useCallback(({ item }) => (
    <Card style={styles.card}>
      <TouchableOpacity style={styles.cardContent} onPress={() => openEdit(item)}>
        <View style={styles.cardTop}>
          <View style={styles.cardInfo}>
            <Text style={styles.name}>{item.customer_name}</Text>
            {item.customer_phone ? <Text style={styles.phone}>{item.customer_phone}</Text> : null}
          </View>
          <Badge text={capitalize((item.status || 'pending').replace('_', ' '))} variant={statusVariant(item.status)} />
        </View>
        <View style={styles.details}>
          <View style={styles.detailItem}>
            <Icon name="calendar" size={13} color={colors.textSecondary} />
            <Text style={styles.detailText}>{formatDate(item.reservation_date || item.date)}</Text>
          </View>
          <View style={styles.detailItem}>
            <Icon name="clock" size={13} color={colors.textSecondary} />
            <Text style={styles.detailText}>{item.reservation_time || item.time}</Text>
          </View>
          <View style={styles.detailItem}>
            <Icon name="users" size={13} color={colors.textSecondary} />
            <Text style={styles.detailText}>{item.guest_count || item.party_size} guests</Text>
          </View>
          {item.table_number ? (
            <View style={styles.detailItem}>
              <Icon name="grid" size={13} color={colors.textSecondary} />
              <Text style={styles.detailText}>T-{item.table_number}</Text>
            </View>
          ) : null}
        </View>
        {/* Advance payment display */}
        {item.advance_amount && parseFloat(item.advance_amount) > 0 && (
          <View style={styles.advanceRow}>
            <Icon name="credit-card" size={12} color={colors.success} />
            <Text style={styles.advanceText}>Advance: {formatCurrency(item.advance_amount)}</Text>
            {item.advance_payment_mode && <Text style={styles.advanceMode}>({capitalize(item.advance_payment_mode)})</Text>}
          </View>
        )}

        {/* Order reference */}
        {item.order_number && (
          <Text style={styles.orderRef}>Order #{item.order_number}</Text>
        )}

        {/* Action buttons for all active statuses */}
        {!['completed', 'cancelled', 'no_show'].includes(item.status) && (
          <View style={styles.actionRow}>
            {item.status === 'pending' && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => statusMut.mutate({ id: item.id, status: 'confirmed' })}>
                <Icon name="check" size={14} color={colors.success} />
                <Text style={[styles.actionText, { color: colors.success }]}>Confirm</Text>
              </TouchableOpacity>
            )}
            {['pending', 'confirmed'].includes(item.status) && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => statusMut.mutate({ id: item.id, status: 'seated' })}>
                <Icon name="log-in" size={14} color={colors.info} />
                <Text style={[styles.actionText, { color: colors.info }]}>Seat</Text>
              </TouchableOpacity>
            )}
            {['confirmed', 'seated'].includes(item.status) && !item.order_id && (
              <TouchableOpacity style={[styles.actionBtn, styles.startOrderBtn]} onPress={() => setStartOrderTarget(item)}>
                <Icon name="shopping-bag" size={14} color={colors.white} />
                <Text style={[styles.actionText, { color: colors.white }]}>Start Order</Text>
              </TouchableOpacity>
            )}
            {item.order_id && !['completed', 'cancelled'].includes(item.order_status) && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('POSDashboard', { orderId: item.order_id })}>
                <Icon name="eye" size={14} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.primary }]}>View Order</Text>
              </TouchableOpacity>
            )}
            {['confirmed', 'seated'].includes(item.status) && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => statusMut.mutate({ id: item.id, status: 'no_show' })}>
                <Icon name="user-x" size={14} color={colors.warning} />
                <Text style={[styles.actionText, { color: colors.warning }]}>No Show</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionBtn} onPress={() => statusMut.mutate({ id: item.id, status: 'cancelled' })}>
              <Icon name="x" size={14} color={colors.error} />
              <Text style={[styles.actionText, { color: colors.error }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => { setDeleteTarget(item); setShowDeleteConfirm(true); }}>
              <Icon name="trash-2" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    </Card>
  ), []);

  return (
    <View style={styles.container}>
      <Header title="Reservations" onMenu={() => navigation.openDrawer()} />
      <TabBar tabs={STATUS_TABS} activeTab={statusFilter} onTabChange={setStatusFilter} scrollable />

      {/* Date filter */}
      <View style={styles.dateFilterRow}>
        <TouchableOpacity style={styles.dateFilterBtn} onPress={() => setShowFilterDatePicker(true)}>
          <Icon name="calendar" size={16} color={colors.primary} />
          <Text style={styles.dateFilterText}>
            {filterDate ? filterDate : 'All dates'}
          </Text>
          <Icon name="chevron-down" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
        {filterDate ? (
          <TouchableOpacity style={styles.dateFilterClear} onPress={() => setFilterDate('')}>
            <Icon name="x-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {showFilterDatePicker && (
        <DateTimePicker
          value={filterDate ? parseDateString(filterDate) : new Date()}
          mode="date"
          display="spinner"
          onChange={onFilterDateChange}
        />
      )}

      {isLoading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={reservations}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
          ListEmptyComponent={<EmptyState icon={<Icon name="calendar" size={48} color={colors.textMuted} />} title="No reservations" message="Add your first reservation" actionLabel="Add Reservation" onAction={openAdd} />}
        />
      )}

      <FAB onPress={openAdd} />

      {/* Date/time pickers rendered OUTSIDE the Modal to avoid Android native dialog crash */}
      {showDatePicker && (
        <DateTimePicker
          value={parseDateString(form.date)}
          mode="date"
          display="spinner"
          onChange={onFormDateChange}
          minimumDate={new Date()}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={parseTimeString(form.time)}
          mode="time"
          display="spinner"
          is24Hour
          onChange={onFormTimeChange}
        />
      )}

      <Modal visible={showModal} onClose={closeModal} title={editing ? 'Edit Reservation' : 'New Reservation'} size="lg">
        <Input label="Customer Name" value={form.customer_name} onChangeText={v => setForm(p => ({ ...p, customer_name: v }))} placeholder="Name" />
        <Input label="Phone" value={form.customer_phone} onChangeText={v => setForm(p => ({ ...p, customer_phone: v }))} placeholder="Phone number" keyboardType="phone-pad" />
        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.pickerLabel}>Date</Text>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
              <Icon name="calendar" size={16} color={colors.primary} />
              <Text style={[styles.pickerBtnText, !form.date && styles.pickerPlaceholder]}>
                {form.date || 'Select date'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.half}>
            <Text style={styles.pickerLabel}>Time</Text>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTimePicker(true)}>
              <Icon name="clock" size={16} color={colors.primary} />
              <Text style={[styles.pickerBtnText, !form.time && styles.pickerPlaceholder]}>
                {form.time || 'Select time'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <Input label="Party Size" value={form.party_size} onChangeText={v => setForm(p => ({ ...p, party_size: v }))} placeholder="2" keyboardType="numeric" />
        <Select label="Table (optional)" value={form.table_id} options={[{ label: 'Auto assign', value: '' }, ...tableOptions]} onChange={v => setForm(p => ({ ...p, table_id: v }))} />

        {/* Overlap / conflict warning */}
        {form.table_id && smartTables.find(t => String(t.id) === form.table_id && t.conflict) && (
          <Card style={styles.warningCard}>
            <View style={styles.warningContent}>
              <Icon name="alert-triangle" size={18} color={colors.warning} />
              <Text style={styles.warningText}>This table has a reservation conflict at the selected time. Consider choosing another table.</Text>
            </View>
          </Card>
        )}

        <Input label="Notes" value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))} placeholder="Special requests" multiline />
        {/* Advance Payment */}
        <View style={styles.advanceSection}>
          <Text style={styles.advanceSectionTitle}>Advance Payment (optional)</Text>
          <View style={styles.row}>
            <Input label="Amount" value={form.advance_amount} onChangeText={v => setForm(p => ({ ...p, advance_amount: v }))} placeholder="0.00" keyboardType="decimal-pad" style={styles.half} />
            <Select label="Payment Mode" value={form.advance_payment_mode} options={PAYMENT_MODES} onChange={v => setForm(p => ({ ...p, advance_payment_mode: v }))} style={styles.half} />
          </View>
        </View>
        <Button title={editing ? 'Update' : 'Create Reservation'} onPress={handleSave} loading={saveMut.isPending} fullWidth style={styles.modalBtn} />
      </Modal>

      <ConfirmModal visible={showDeleteConfirm} onClose={closeDelete} onConfirm={() => deleteMut.mutate(deleteTarget?.id)} title="Delete Reservation" message="Are you sure?" confirmText="Delete" confirmVariant="danger" loading={deleteMut.isPending} />

      <ConfirmModal
        visible={!!startOrderTarget}
        onClose={() => setStartOrderTarget(null)}
        onConfirm={() => startOrderMut.mutate(startOrderTarget?.id)}
        title="Start Order"
        message="This will create a dine-in order with customer details from this reservation. If advance payment was recorded, it will be added as a payment line."
        confirmText="Start Order"
        confirmVariant="primary"
        loading={startOrderMut.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.base, paddingBottom: 80 },
  card: { marginBottom: spacing.md },
  cardContent: {},
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  cardInfo: { flex: 1 },
  name: { ...typography.bodyBold, color: colors.text },
  phone: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: { ...typography.caption, color: colors.textSecondary },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6, borderRadius: radius.sm },
  actionText: { ...typography.captionBold },
  startOrderBtn: { backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.md },
  advanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  advanceText: { fontSize: 12, fontWeight: '600', color: colors.success },
  advanceMode: { fontSize: 11, color: colors.textSecondary },
  orderRef: { fontSize: 12, fontWeight: '600', color: colors.primary, marginTop: 4 },
  advanceSection: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  advanceSectionTitle: { ...typography.captionBold, color: colors.textSecondary, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  modalBtn: { marginTop: spacing.base },
  // Date/time picker styles
  pickerLabel: { ...typography.captionBold, color: colors.textSecondary, marginBottom: 6 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12 },
  pickerBtnText: { ...typography.body, color: colors.text, flex: 1 },
  pickerPlaceholder: { color: colors.textMuted },
  // Date filter styles
  dateFilterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.sm, gap: spacing.sm },
  dateFilterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  dateFilterText: { ...typography.caption, color: colors.text },
  dateFilterClear: { padding: 4 },
  // Warning card styles
  warningCard: { backgroundColor: '#FFF8E1', borderColor: colors.warning, borderWidth: 1, marginTop: spacing.sm, marginBottom: spacing.sm },
  warningContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  warningText: { ...typography.caption, color: '#6D4C00', flex: 1 },
});
