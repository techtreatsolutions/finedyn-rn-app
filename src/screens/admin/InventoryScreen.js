import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Alert, StyleSheet, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../api/inventory.api';
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
import { formatCurrency, capitalize } from '../../utils/formatters';

const TABS = [
  { key: 'items', label: 'Items' },
  { key: 'requests', label: 'Stock Requests' },
];

const INITIAL_ITEM = { name: '', currentStock: '', minStockLevel: '', costPerUnit: '' };
const INITIAL_CAT = { name: '' };
const INITIAL_TICKET = { inventoryItemId: '', quantityRequested: '', priority: 'normal', notes: '' };

const PRIORITY_OPTIONS = [
  { label: 'Low', value: 'low' },
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' },
];

const PRIORITY_VARIANT = { urgent: 'danger', high: 'warning', normal: 'info', low: 'default' };
const TICKET_STATUS_VARIANT = { fulfilled: 'success', rejected: 'danger', pending: 'warning' };

export default function InventoryScreen({ navigation }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('items');

  // Item state
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState(INITIAL_ITEM);

  // Stock in/out state
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockForm, setStockForm] = useState({ quantity: '', notes: '' });
  const [stockTarget, setStockTarget] = useState(null);
  const [stockType, setStockType] = useState('in');

  // Category state
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState(INITIAL_CAT);

  // Ticket state
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketForm, setTicketForm] = useState(INITIAL_TICKET);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ---------- Queries ----------

  const { data: items = [], isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: async () => { const r = await inventoryApi.getItems(); return r.data || r; },
  });

  const { data: categories = [], isLoading: catsLoading, refetch: refetchCats } = useQuery({
    queryKey: ['inventoryCategories'],
    queryFn: async () => { const r = await inventoryApi.getCategories(); return r.data || r; },
  });

  const { data: tickets = [], isLoading: ticketsLoading, refetch: refetchTickets } = useQuery({
    queryKey: ['inventoryTickets'],
    queryFn: async () => { const r = await inventoryApi.getTickets(); return r.data || r; },
  });

  // ---------- Low stock ----------

  const lowStockItems = useMemo(
    () => items.filter(i => i.min_stock_level > 0 && i.current_stock <= i.min_stock_level),
    [items],
  );

  const isLowStock = (item) => item.min_stock_level > 0 && item.current_stock <= item.min_stock_level;

  // ---------- Mutations ----------

  const saveItemMut = useMutation({
    mutationFn: (data) => editingItem ? inventoryApi.updateItem(editingItem.id, data) : inventoryApi.createItem(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventoryItems'] }); closeItemModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to save item'),
  });

  const saveCatMut = useMutation({
    mutationFn: (data) => editingCat ? inventoryApi.updateCategory(editingCat.id, data) : inventoryApi.createCategory(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventoryCategories'] }); closeCatModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to save category'),
  });

  const stockMut = useMutation({
    mutationFn: ({ id, type, data }) => type === 'in' ? inventoryApi.stockIn(id, data) : inventoryApi.stockOut(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventoryItems'] }); closeStockModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to update stock'),
  });

  const createTicketMut = useMutation({
    mutationFn: (data) => inventoryApi.createTicket(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventoryTickets'] }); closeTicketModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to create request'),
  });

  const updateTicketMut = useMutation({
    mutationFn: ({ id, data }) => inventoryApi.updateTicketStatus(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventoryTickets'] }); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to update request'),
  });

  const deleteItemMut = useMutation({
    mutationFn: (id) => inventoryApi.deleteItem(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventoryItems'] }); closeDelete(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to delete'),
  });

  const deleteCatMut = useMutation({
    mutationFn: (id) => inventoryApi.deleteCategory(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventoryCategories'] }); closeDelete(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to delete'),
  });

  // ---------- Modal helpers ----------

  const closeItemModal = () => { setShowItemModal(false); setEditingItem(null); setItemForm(INITIAL_ITEM); };
  const closeCatModal = () => { setShowCatModal(false); setEditingCat(null); setCatForm(INITIAL_CAT); };
  const closeStockModal = () => { setShowStockModal(false); setStockTarget(null); setStockForm({ quantity: '', notes: '' }); };
  const closeTicketModal = () => { setShowTicketModal(false); setTicketForm(INITIAL_TICKET); };
  const closeDelete = () => { setShowDeleteConfirm(false); setDeleteTarget(null); };

  const openAddItem = () => { setEditingItem(null); setItemForm(INITIAL_ITEM); setShowItemModal(true); };

  const openStock = (item, type) => {
    setStockTarget(item);
    setStockType(type);
    setStockForm({ quantity: '', notes: '' });
    setShowStockModal(true);
  };

  const openAddTicket = () => { setTicketForm(INITIAL_TICKET); setShowTicketModal(true); };

  // ---------- Handlers ----------

  const handleSaveItem = () => {
    if (!itemForm.name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    saveItemMut.mutate({
      name: itemForm.name,
      currentStock: parseFloat(itemForm.currentStock) || 0,
      minStockLevel: parseFloat(itemForm.minStockLevel) || 0,
      costPerUnit: parseFloat(itemForm.costPerUnit) || 0,
    });
  };

  const handleStock = () => {
    const qty = parseFloat(stockForm.quantity);
    if (!qty || qty <= 0) { Alert.alert('Validation', 'Enter a valid quantity'); return; }
    stockMut.mutate({ id: stockTarget.id, type: stockType, data: { quantity: qty, notes: stockForm.notes } });
  };

  const handleCreateTicket = () => {
    if (!ticketForm.inventoryItemId) { Alert.alert('Validation', 'Select an item'); return; }
    const qty = parseFloat(ticketForm.quantityRequested);
    if (!qty || qty <= 0) { Alert.alert('Validation', 'Enter a valid quantity'); return; }
    createTicketMut.mutate({
      inventoryItemId: parseInt(ticketForm.inventoryItemId, 10),
      quantityRequested: qty,
      priority: ticketForm.priority,
      notes: ticketForm.notes,
    });
  };

  const handleTicketAction = (ticket, status) => {
    updateTicketMut.mutate({ id: ticket.id, data: { status } });
  };

  // ---------- Options ----------

  const itemOptions = items.map(i => ({
    label: `${i.name} (Stock: ${i.current_stock})`,
    value: String(i.id),
  }));

  // ---------- Render: Items ----------

  const renderItem = useCallback(({ item }) => (
    <Card style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.itemInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.itemName}>{item.name}</Text>
            {isLowStock(item) && <Badge text="Low" variant="danger" small />}
          </View>
        </View>
        <View style={styles.stockSection}>
          <Text style={[styles.stockValue, isLowStock(item) && { color: colors.error }]}>
            {item.current_stock} {item.unit || 'pcs'}
          </Text>
          <Text style={styles.itemSub}>Min: {item.min_stock_level}</Text>
          <Text style={styles.itemSub}>{formatCurrency(item.cost_per_unit)}/unit</Text>
          <View style={styles.stockActions}>
            <TouchableOpacity
              style={[styles.stockBtn, { backgroundColor: colors.successBg || '#ECFDF5' }]}
              onPress={() => openStock(item, 'in')}
            >
              <Icon name="plus" size={14} color={colors.success} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.stockBtn, { backgroundColor: colors.errorBg || '#FEF2F2' }]}
              onPress={() => openStock(item, 'out')}
            >
              <Icon name="minus" size={14} color={colors.error} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.stockBtn, { backgroundColor: '#F3F4F6' }]}
              onPress={() => { setDeleteTarget({ type: 'item', item }); setShowDeleteConfirm(true); }}
            >
              <Icon name="trash-2" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Card>
  ), [items]);

  // ---------- Render: Tickets ----------

  const renderTicket = useCallback(({ item: ticket }) => (
    <Card style={styles.card}>
      <View style={styles.ticketContent}>
        <View style={styles.ticketHeader}>
          <Text style={styles.itemName}>{ticket.item_name}</Text>
          <View style={styles.badgeRow}>
            <Badge text={capitalize(ticket.priority)} variant={PRIORITY_VARIANT[ticket.priority] || 'default'} small />
            <Badge text={capitalize(ticket.status)} variant={TICKET_STATUS_VARIANT[ticket.status] || 'default'} small />
          </View>
        </View>
        <Text style={styles.itemSub}>
          Qty: {ticket.quantity_requested} {ticket.unit || 'pcs'}
        </Text>
        {ticket.requested_by_name ? (
          <Text style={styles.itemSub}>By: {ticket.requested_by_name}</Text>
        ) : null}
        {ticket.notes ? (
          <Text style={styles.itemSub}>{ticket.notes}</Text>
        ) : null}
        {ticket.status === 'pending' && (
          <View style={styles.ticketActions}>
            <Button
              title="Fulfill"
              variant="success"
              size="small"
              onPress={() => handleTicketAction(ticket, 'fulfilled')}
              loading={updateTicketMut.isPending}
            />
            <Button
              title="Reject"
              variant="danger"
              size="small"
              onPress={() => handleTicketAction(ticket, 'rejected')}
              loading={updateTicketMut.isPending}
            />
          </View>
        )}
      </View>
    </Card>
  ), [updateTicketMut.isPending]);

  // ---------- Render: Categories ----------

  const renderCatItem = useCallback(({ item }) => (
    <Card style={styles.card}>
      <View style={styles.cardContent}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.cardActions}>
          <TouchableOpacity
            onPress={() => { setEditingCat(item); setCatForm({ name: item.name }); setShowCatModal(true); }}
            style={styles.iconBtn}
          >
            <Icon name="edit-2" size={16} color={colors.info} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setDeleteTarget({ type: 'category', item }); setShowDeleteConfirm(true); }}
            style={styles.iconBtn}
          >
            <Icon name="trash-2" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    </Card>
  ), []);

  // ---------- Tab-specific loading / refetch ----------

  const isLoading = activeTab === 'items' ? itemsLoading : ticketsLoading;
  const refetchCurrent = activeTab === 'items' ? refetchItems : refetchTickets;

  // ---------- FAB handler ----------

  const handleFAB = () => {
    if (activeTab === 'items') openAddItem();
    else openAddTicket();
  };

  const fabIcon = activeTab === 'requests' ? 'send' : 'plus';

  // ---------- Selected item for ticket modal ----------

  const selectedTicketItem = useMemo(() => {
    if (!ticketForm.inventoryItemId) return null;
    return items.find(i => String(i.id) === ticketForm.inventoryItemId) || null;
  }, [ticketForm.inventoryItemId, items]);

  // ---------- Render ----------

  return (
    <View style={styles.container}>
      <Header title="Inventory" onMenu={() => navigation.openDrawer()} />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Low stock alert banner */}
      {lowStockItems.length > 0 && activeTab === 'items' && (
        <View style={styles.alertBanner}>
          <Icon name="alert-triangle" size={16} color="#92400E" />
          <Text style={styles.alertText}>
            {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} with low stock
          </Text>
        </View>
      )}

      {isLoading ? (
        <LoadingSpinner fullScreen />
      ) : activeTab === 'items' ? (
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetchItems} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="package" size={48} color={colors.textMuted} />}
              title="No inventory items"
              message="Add items to track your inventory"
              actionLabel="Add Item"
              onAction={openAddItem}
            />
          }
        />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={i => String(i.id)}
          renderItem={renderTicket}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetchTickets} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="clipboard" size={48} color={colors.textMuted} />}
              title="No stock requests"
              message="Raise a request to restock items"
              actionLabel="Raise Request"
              onAction={openAddTicket}
            />
          }
        />
      )}

      <FAB onPress={handleFAB} icon={fabIcon} />

      {/* Add / Edit Item Modal */}
      <Modal visible={showItemModal} onClose={closeItemModal} title={editingItem ? 'Edit Item' : 'Add Item'} size="lg">
        <Input
          label="Name"
          value={itemForm.name}
          onChangeText={v => setItemForm(p => ({ ...p, name: v }))}
          placeholder="Item name"
        />
        <Input
          label="Opening Stock"
          value={itemForm.currentStock}
          onChangeText={v => setItemForm(p => ({ ...p, currentStock: v }))}
          keyboardType="numeric"
          placeholder="0"
        />
        <Input
          label="Min Stock Level"
          value={itemForm.minStockLevel}
          onChangeText={v => setItemForm(p => ({ ...p, minStockLevel: v }))}
          keyboardType="numeric"
          placeholder="0"
        />
        <Input
          label="Cost per Unit"
          value={itemForm.costPerUnit}
          onChangeText={v => setItemForm(p => ({ ...p, costPerUnit: v }))}
          keyboardType="numeric"
          placeholder="0.00"
        />
        <Button
          title={editingItem ? 'Update Item' : 'Add Item'}
          onPress={handleSaveItem}
          loading={saveItemMut.isPending}
          fullWidth
          style={styles.modalBtn}
        />
      </Modal>

      {/* Stock In / Out Modal */}
      <Modal visible={showStockModal} onClose={closeStockModal} title={`${stockType === 'in' ? 'Add Stock' : 'Remove Stock'}: ${stockTarget?.name || ''}`}>
        {stockTarget && (
          <View style={styles.currentStockInfo}>
            <Text style={styles.currentStockLabel}>Current Stock</Text>
            <Text style={styles.currentStockValue}>{stockTarget.current_stock} {stockTarget.unit || 'pcs'}</Text>
          </View>
        )}
        <Input
          label="Quantity"
          value={stockForm.quantity}
          onChangeText={v => setStockForm(p => ({ ...p, quantity: v }))}
          keyboardType="numeric"
          placeholder="0"
        />
        <Input
          label="Notes"
          value={stockForm.notes}
          onChangeText={v => setStockForm(p => ({ ...p, notes: v }))}
          placeholder="Optional notes"
          multiline
        />
        <Button
          title={stockType === 'in' ? 'Add Stock' : 'Remove Stock'}
          onPress={handleStock}
          loading={stockMut.isPending}
          fullWidth
          variant={stockType === 'out' ? 'danger' : 'primary'}
          style={styles.modalBtn}
        />
      </Modal>

      {/* Raise Stock Request Modal */}
      <Modal visible={showTicketModal} onClose={closeTicketModal} title="Raise Stock Request" size="lg">
        <Select
          label="Item"
          value={ticketForm.inventoryItemId}
          options={itemOptions}
          onChange={v => setTicketForm(p => ({ ...p, inventoryItemId: v }))}
          placeholder="Select item"
        />
        {selectedTicketItem && (
          <View style={styles.currentStockInfo}>
            <Text style={styles.currentStockLabel}>Current Stock</Text>
            <Text style={[
              styles.currentStockValue,
              isLowStock(selectedTicketItem) && { color: colors.error },
            ]}>
              {selectedTicketItem.current_stock} {selectedTicketItem.unit || 'pcs'}
            </Text>
          </View>
        )}
        <Input
          label="Quantity"
          value={ticketForm.quantityRequested}
          onChangeText={v => setTicketForm(p => ({ ...p, quantityRequested: v }))}
          keyboardType="numeric"
          placeholder="0"
        />
        <Select
          label="Priority"
          value={ticketForm.priority}
          options={PRIORITY_OPTIONS}
          onChange={v => setTicketForm(p => ({ ...p, priority: v }))}
        />
        <Input
          label="Notes"
          value={ticketForm.notes}
          onChangeText={v => setTicketForm(p => ({ ...p, notes: v }))}
          placeholder="Optional notes"
          multiline
        />
        <Button
          title="Raise Request"
          onPress={handleCreateTicket}
          loading={createTicketMut.isPending}
          fullWidth
          style={styles.modalBtn}
        />
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        visible={showDeleteConfirm}
        onClose={closeDelete}
        onConfirm={() => {
          if (deleteTarget?.type === 'category') deleteCatMut.mutate(deleteTarget.item.id);
          else deleteItemMut.mutate(deleteTarget?.item?.id);
        }}
        title="Delete"
        message="Are you sure you want to delete this? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
        loading={deleteItemMut.isPending || deleteCatMut.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.base, paddingBottom: 80 },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: radius.md,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  alertText: {
    ...typography.caption,
    color: '#92400E',
    fontWeight: '600',
  },
  card: { marginBottom: spacing.md },
  cardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemName: { ...typography.bodyBold, color: colors.text },
  itemSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  stockSection: { alignItems: 'flex-end' },
  stockValue: { ...typography.bodyBold, color: colors.text, marginBottom: 2 },
  stockActions: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  stockBtn: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cardActions: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: { padding: spacing.sm },
  ticketContent: { gap: spacing.xs },
  ticketHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badgeRow: { flexDirection: 'row', gap: spacing.xs },
  ticketActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  currentStockInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt || '#F8FAFC',
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  currentStockLabel: { ...typography.caption, color: colors.textSecondary },
  currentStockValue: { ...typography.bodyBold, color: colors.text },
  modalBtn: { marginTop: spacing.base },
});
