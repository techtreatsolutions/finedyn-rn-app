import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Switch, Alert, StyleSheet, RefreshControl, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restaurantApi } from '../../api/restaurant.api';
import Header from '../../components/common/Header';
import FAB from '../../components/common/FAB';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import SearchBar from '../../components/common/SearchBar';
import Badge from '../../components/common/Badge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { colors, spacing, radius, typography } from '../../theme';
import { capitalize, formatDateTime } from '../../utils/formatters';

const ROLE_OPTIONS = [
  { label: 'Manager', value: 'manager' },
  { label: 'Cashier', value: 'cashier' },
  { label: 'Waiter', value: 'waiter' },
  { label: 'Kitchen Staff', value: 'kitchen_staff' },
];

const ROLE_FILTER_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Manager', value: 'manager' },
  { label: 'Cashier', value: 'cashier' },
  { label: 'Waiter', value: 'waiter' },
  { label: 'Kitchen Staff', value: 'kitchen_staff' },
];

const ALL_SECTIONS = [
  { key: 'pos', label: 'POS / Billing' },
  { key: 'tables', label: 'Table Map' },
  { key: 'menu', label: 'Menu' },
  { key: 'staff', label: 'Staff' },
  { key: 'floor', label: 'Floor & Tables' },
  { key: 'reservations', label: 'Reservations' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'employees', label: 'Employees' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
];

const ROLE_LABELS = { owner: 'Owner', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter', kitchen_staff: 'Kitchen Staff' };

const INITIAL_FORM = { name: '', email: '', phone: '', role: 'waiter', password: '', pinCode: '' };

export default function StaffScreen({ navigation }) {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [permissionsTarget, setPermissionsTarget] = useState(null);
  const [selectedSections, setSelectedSections] = useState([]);

  const { data: staff = [], isLoading, refetch } = useQuery({
    queryKey: ['staffUsers'],
    queryFn: async () => { const r = await restaurantApi.getUsers(); return r.data || r; },
  });

  const saveMut = useMutation({
    mutationFn: (data) => editing ? restaurantApi.updateUser(editing.id, data) : restaurantApi.createUser(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['staffUsers'] }); closeModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to save'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => restaurantApi.deleteUser(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['staffUsers'] }); closeDelete(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to delete'),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }) => restaurantApi.updateUser(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staffUsers'] }),
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to toggle'),
  });

  const resetMut = useMutation({
    mutationFn: ({ id, pw }) => restaurantApi.resetStaffPassword(id, pw),
    onSuccess: () => { setShowResetModal(false); setResetTarget(null); setNewPassword(''); Alert.alert('Success', 'Password reset.'); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to reset'),
  });

  const permissionsMut = useMutation({
    mutationFn: ({ id, sectionAccess }) => restaurantApi.updateUser(id, { sectionAccess: sectionAccess.length > 0 ? sectionAccess : null }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['staffUsers'] }); setShowPermissionsModal(false); setPermissionsTarget(null); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to update permissions'),
  });

  // Derived data
  const activeCount = useMemo(() => staff.filter(s => s.is_active).length, [staff]);
  const roleCounts = useMemo(() => {
    const counts = {};
    staff.forEach(s => { if (s.role && s.role !== 'owner') counts[s.role] = (counts[s.role] || 0) + 1; });
    return counts;
  }, [staff]);

  const filteredStaff = useMemo(() => {
    return staff.filter(s => {
      const matchSearch = !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === 'all' || s.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [staff, search, roleFilter]);

  const openPermissions = (member) => {
    const current = Array.isArray(member.section_access) ? member.section_access : [];
    setSelectedSections(current);
    setPermissionsTarget(member);
    setShowPermissionsModal(true);
  };

  const toggleSection = (key) => {
    setSelectedSections(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const closeModal = () => { setShowModal(false); setEditing(null); setForm(INITIAL_FORM); };
  const closeDelete = () => { setShowDeleteConfirm(false); setDeleteTarget(null); };

  const openAdd = () => { setEditing(null); setForm(INITIAL_FORM); setShowModal(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ name: item.name || '', email: item.email || '', phone: item.phone || '', role: item.role || 'waiter', password: '', pinCode: '' });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.email.trim()) { Alert.alert('Validation', 'Name and email required'); return; }
    const payload = { ...form };
    if (editing) { delete payload.password; delete payload.email; }
    saveMut.mutate(payload);
  };

  const roleColor = (role) => {
    const map = { owner: 'primary', manager: 'info', cashier: 'success', waiter: 'warning', kitchen_staff: 'default' };
    return map[role] || 'default';
  };

  const renderItem = useCallback(({ item }) => (
    <Card style={styles.card}>
      <TouchableOpacity style={styles.cardContent} onPress={() => item.role !== 'owner' ? openEdit(item) : null}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.sub}>{item.email}</Text>
          <View style={styles.metaRow}>
            <Badge text={capitalize(item.role)} variant={roleColor(item.role)} small />
            <View style={styles.pinBadge}>
              <Icon name="hash" size={10} color={item.has_pin ? colors.success : colors.textMuted} />
              <Text style={[styles.pinText, { color: item.has_pin ? colors.success : colors.textMuted }]}>
                {item.has_pin ? 'PIN set' : 'No PIN'}
              </Text>
            </View>
          </View>
          {Array.isArray(item.section_access) && item.section_access.length > 0 && (
            <Text style={styles.accessText}>{item.section_access.length} section{item.section_access.length !== 1 ? 's' : ''} access</Text>
          )}
        </View>
        {item.role !== 'owner' && (
          <View style={styles.right}>
            <Switch
              value={!!item.is_active}
              onValueChange={(val) => toggleMut.mutate({ id: item.id, isActive: val })}
              trackColor={{ false: colors.border, true: colors.success + '50' }}
              thumbColor={item.is_active ? colors.success : colors.textMuted}
            />
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => openPermissions(item)} style={styles.iconBtn}>
                <Icon name="shield" size={14} color={colors.info} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setResetTarget(item); setNewPassword(''); setShowResetModal(true); }} style={styles.iconBtn}>
                <Icon name="key" size={14} color={colors.warning} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setDeleteTarget(item); setShowDeleteConfirm(true); }} style={styles.iconBtn}>
                <Icon name="trash-2" size={14} color={colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    </Card>
  ), []);

  return (
    <View style={styles.container}>
      <Header title="Staff" onMenu={() => navigation.openDrawer()} subtitle={`${staff.length} members`} />

      {isLoading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={filteredStaff}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
          ListHeaderComponent={
            <View>
              {/* Stats Row */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroll} contentContainerStyle={styles.statsRow}>
                <StatCard
                  icon={<Icon name="users" size={20} color={colors.primary} />}
                  label="Total Staff"
                  value={staff.length}
                  color={colors.primary}
                  style={styles.statCard}
                />
                <StatCard
                  icon={<Icon name="check-circle" size={20} color={colors.success} />}
                  label="Active"
                  value={activeCount}
                  trend={`${staff.length - activeCount} inactive`}
                  color={colors.success}
                  style={styles.statCard}
                />
              </ScrollView>

              {/* Search + Role Filter */}
              <SearchBar
                value={search}
                onChangeText={setSearch}
                placeholder="Search staff..."
                style={styles.searchBar}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
                {ROLE_FILTER_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.filterChip, roleFilter === opt.value && styles.filterChipActive]}
                    onPress={() => setRoleFilter(opt.value)}
                  >
                    <Text style={[styles.filterChipText, roleFilter === opt.value && styles.filterChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          }
          ListEmptyComponent={<EmptyState icon={<Icon name="user-plus" size={48} color={colors.textMuted} />} title={search || roleFilter !== 'all' ? 'No matches' : 'No staff'} message={search || roleFilter !== 'all' ? 'Try a different search or filter' : 'Add staff members'} actionLabel={!search && roleFilter === 'all' ? 'Add Staff' : undefined} onAction={!search && roleFilter === 'all' ? openAdd : undefined} />}
        />
      )}

      <FAB onPress={openAdd} />

      <Modal visible={showModal} onClose={closeModal} title={editing ? 'Edit Staff' : 'Add Staff'} size="lg">
        <Input label="Name" value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} placeholder="Full name" />
        {!editing && <Input label="Email" value={form.email} onChangeText={v => setForm(p => ({ ...p, email: v }))} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />}
        <Input label="Phone" value={form.phone} onChangeText={v => setForm(p => ({ ...p, phone: v }))} placeholder="Phone" keyboardType="phone-pad" />
        <Select label="Role" value={form.role} options={ROLE_OPTIONS} onChange={v => setForm(p => ({ ...p, role: v }))} />
        {!editing && <Input label="Password" value={form.password} onChangeText={v => setForm(p => ({ ...p, password: v }))} placeholder="Default: FineDyn@123" secureTextEntry />}
        <Input label="PIN Code" value={form.pinCode} onChangeText={v => setForm(p => ({ ...p, pinCode: v }))} placeholder="4-digit PIN (optional)" keyboardType="numeric" maxLength={4} />
        <Button title={editing ? 'Update' : 'Add Staff'} onPress={handleSave} loading={saveMut.isPending} fullWidth style={styles.modalBtn} />
      </Modal>

      <Modal visible={showResetModal} onClose={() => setShowResetModal(false)} title={`Reset Password: ${resetTarget?.name || ''}`}>
        <Input label="New Password" value={newPassword} onChangeText={setNewPassword} placeholder="Min 8 characters" secureTextEntry />
        <Button title="Reset Password" onPress={() => { if (!newPassword || newPassword.length < 8) { Alert.alert('Validation', 'Min 8 characters'); return; } resetMut.mutate({ id: resetTarget.id, pw: newPassword }); }} loading={resetMut.isPending} fullWidth style={styles.modalBtn} />
      </Modal>

      <ConfirmModal visible={showDeleteConfirm} onClose={closeDelete} onConfirm={() => deleteMut.mutate(deleteTarget?.id)} title="Delete Staff" message={`Delete ${deleteTarget?.name}?`} confirmText="Delete" confirmVariant="danger" loading={deleteMut.isPending} />

      {/* Section Access Permissions Modal */}
      <Modal visible={showPermissionsModal} onClose={() => { setShowPermissionsModal(false); setPermissionsTarget(null); }} title={`Section Access: ${permissionsTarget?.name || ''}`} size="lg">
        <Text style={styles.permDesc}>Select which admin sections this user can access. Leave all unchecked for full access based on role.</Text>
        {ALL_SECTIONS.map(section => (
          <TouchableOpacity
            key={section.key}
            style={styles.sectionRow}
            onPress={() => toggleSection(section.key)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, selectedSections.includes(section.key) && styles.checkboxChecked]}>
              {selectedSections.includes(section.key) && <Icon name="check" size={14} color={colors.white} />}
            </View>
            <Text style={styles.sectionLabel}>{section.label}</Text>
          </TouchableOpacity>
        ))}
        {selectedSections.length > 0 && (
          <Text style={styles.permHint}>{selectedSections.length} section{selectedSections.length !== 1 ? 's' : ''} selected — dashboard always visible.</Text>
        )}
        <Button
          title={permissionsMut.isPending ? 'Saving...' : 'Save Permissions'}
          onPress={() => permissionsMut.mutate({ id: permissionsTarget.id, sectionAccess: selectedSections })}
          loading={permissionsMut.isPending}
          fullWidth
          style={styles.modalBtn}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.base, paddingBottom: 80 },
  card: { marginBottom: spacing.md },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  avatarText: { ...typography.bodyBold, color: colors.primary },
  info: { flex: 1 },
  name: { ...typography.bodyBold, color: colors.text },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  lastLogin: { ...typography.tiny, color: colors.textMuted },
  right: { alignItems: 'center', marginLeft: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  iconBtn: { padding: spacing.xs },
  modalBtn: { marginTop: spacing.base },
  // Stats row
  statsScroll: { marginBottom: spacing.md },
  statsRow: { gap: spacing.md, paddingRight: spacing.base },
  statCard: { width: 160 },
  // Search + filter
  searchBar: { marginBottom: spacing.md },
  filterScroll: { marginBottom: spacing.base },
  filterRow: { gap: spacing.sm },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  // PIN badge
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceDark,
  },
  pinText: {
    ...typography.tiny,
    fontWeight: '600',
  },
  // Access text
  accessText: {
    ...typography.tiny,
    color: colors.info,
    fontWeight: '600',
    marginTop: 2,
  },
  // Permissions modal
  permDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sectionLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  permHint: {
    ...typography.caption,
    color: colors.info,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
});
