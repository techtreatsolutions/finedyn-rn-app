import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Alert, StyleSheet,
  RefreshControl, ScrollView, TextInput, Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tableApi } from '../../api/table.api';
import { orderApi } from '../../api/order.api';
import { menuApi } from '../../api/menu.api';
import { qrOrdersApi } from '../../api/qrOrders.api';
import { restaurantApi } from '../../api/restaurant.api';
import Header from '../../components/common/Header';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { colors, spacing, radius, typography } from '../../theme';
import { formatCurrency, timeAgo, capitalize, formatTime } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function WaiterDashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  // ── State ───────────────────────────────────────────────────────────────
  const [selectedTable, setSelectedTable] = useState(null);
  const [activeFloor, setActiveFloor] = useState('all');
  const [cart, setCart] = useState([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [selectingItem, setSelectingItem] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [showQROrders, setShowQROrders] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [view, setView] = useState('tables'); // 'tables' | 'menu'

  // ── Feature flags ──────────────────────────────────────────────────────
  const { data: subData } = useQuery({
    queryKey: ['subscription-features'],
    queryFn: async () => { const r = await restaurantApi.getSubscription(); return r.data || r; },
    staleTime: 5 * 60 * 1000,
  });
  const planFeatures = subData?.features || {};
  const edineInEnabled = planFeatures.feature_edine_in_orders === true || planFeatures.feature_edine_in_orders === 1;

  // ── Fetch my tables ────────────────────────────────────────────────────
  const { data: myTables = [], isLoading: tablesLoading, refetch: refetchTables } = useQuery({
    queryKey: ['waiter-my-tables'],
    queryFn: async () => { const r = await tableApi.getMyTables(); return r.data || r; },
    refetchInterval: 15000,
  });

  // ── Fetch menu ─────────────────────────────────────────────────────────
  const { data: allItems = [], isLoading: menuLoading } = useQuery({
    queryKey: ['waiter-menu'],
    queryFn: async () => {
      const r = await menuApi.getItems({ available: true });
      return r.data || r;
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: rawCategories = [] } = useQuery({
    queryKey: ['waiter-categories'],
    queryFn: async () => {
      const r = await menuApi.getCategories();
      return r.data || r;
    },
    staleTime: 5 * 60 * 1000,
  });
  const categories = useMemo(() => [{ id: 'all', name: 'All' }, ...rawCategories], [rawCategories]);

  // ── Fetch order detail when table has an order ─────────────────────────
  const { data: orderDetail, refetch: refetchOrder } = useQuery({
    queryKey: ['waiter-order-detail', selectedTable?.order_id],
    queryFn: async () => {
      const r = await orderApi.getOrder(selectedTable.order_id);
      return r.data || r;
    },
    enabled: !!selectedTable?.order_id,
    staleTime: 10 * 1000,
  });

  // ── QR orders ──────────────────────────────────────────────────────────
  const { data: pendingQROrders = [] } = useQuery({
    queryKey: ['waiter-qr-orders'],
    queryFn: async () => { const r = await qrOrdersApi.getMyPending(); return r.data || r; },
    refetchInterval: 10000,
    enabled: edineInEnabled,
  });

  // ── Derived data ───────────────────────────────────────────────────────
  const floors = useMemo(() => {
    const map = new Map();
    for (const t of myTables) {
      if (t.floor_id && t.floor_name && !map.has(t.floor_id)) {
        map.set(t.floor_id, t.floor_name);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [myTables]);

  const filteredTables = useMemo(() =>
    activeFloor === 'all' ? myTables : myTables.filter(t => String(t.floor_id) === String(activeFloor)),
    [myTables, activeFloor]
  );

  const filteredItems = useMemo(() =>
    allItems.filter(item => {
      if (activeCat !== 'all' && String(item.category_id) !== String(activeCat)) return false;
      if (menuSearch && !item.name.toLowerCase().includes(menuSearch.toLowerCase())) return false;
      return true;
    }),
    [allItems, activeCat, menuSearch]
  );

  const savedItems = useMemo(() =>
    (orderDetail?.items || []).filter(i => i.status !== 'cancelled'),
    [orderDetail]
  );

  const cartSubtotal = useMemo(() =>
    cart.reduce((s, c) => s + c.price * c.qty, 0),
    [cart]
  );

  const cartCount = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);

  // ── Cart helpers ───────────────────────────────────────────────────────
  function cartKey(menuItemId, variantId, addons) {
    const addonSig = (addons || []).map(a => a.id).sort().join(',');
    return `${menuItemId}_${variantId || 0}_${addonSig}`;
  }

  function handleItemClick(item) {
    if (!selectedTable) { Alert.alert('Select a Table', 'Please select a table first'); return; }
    const hasVariants = item.variants && item.variants.length > 0;
    const hasAddons = item.addons && item.addons.length > 0;
    if (hasVariants || hasAddons) {
      setSelectingItem(item);
      setSelectedVariantId(hasVariants ? null : undefined);
      setSelectedAddons([]);
    } else {
      addToCartDirect(item, null, null, []);
    }
  }

  function addToCartDirect(item, variantId, variantObj, addons) {
    const key = cartKey(item.id, variantId, addons);
    const basePrice = variantObj ? parseFloat(variantObj.price) : parseFloat(item.price);
    const addonTotal = addons.reduce((s, a) => s + parseFloat(a.price), 0);
    const effectivePrice = basePrice + addonTotal;
    setCart(prev => {
      const idx = prev.findIndex(c => c._key === key);
      if (idx >= 0) {
        const c = [...prev]; c[idx] = { ...c[idx], qty: c[idx].qty + 1 };
        return c;
      }
      return [...prev, {
        _key: key, menuItemId: item.id, name: item.name,
        variantId: variantId || null, variantName: variantObj?.name || null,
        addons: addons.length > 0 ? addons.map(a => ({ id: a.id, name: a.name, price: parseFloat(a.price) })) : [],
        basePrice, addonTotal, price: effectivePrice,
        tax_rate: parseFloat(item.tax_rate || 0), qty: 1,
        item_type: item.item_type,
      }];
    });
  }

  function confirmSelection() {
    if (!selectingItem) return;
    const item = selectingItem;
    const hasVariants = item.variants && item.variants.length > 0;
    if (hasVariants && !selectedVariantId) { Alert.alert('Required', 'Please select a variant'); return; }
    const variantObj = hasVariants ? item.variants.find(v => v.id === selectedVariantId) : null;
    addToCartDirect(item, selectedVariantId || null, variantObj, selectedAddons);
    setSelectingItem(null);
  }

  function adjustQty(key, delta) {
    setCart(prev => prev.map(c => c._key === key ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0));
  }

  // ── Mutations ──────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (data) => orderApi.createOrder(data),
  });
  const addItemsMut = useMutation({
    mutationFn: ({ orderId, items }) => orderApi.addItem(orderId, { items }),
  });
  const kotMut = useMutation({
    mutationFn: (orderId) => orderApi.sendKOT(orderId),
    onSuccess: () => {
      Alert.alert('Success', 'KOT sent to kitchen!');
      queryClient.invalidateQueries({ queryKey: ['waiter-my-tables'] });
    },
    onError: (e) => Alert.alert('Error', e?.response?.data?.message || 'KOT failed'),
  });

  const cancelItemMut = useMutation({
    mutationFn: ({ orderId, itemId }) => orderApi.updateItem(orderId, itemId, { status: 'cancelled' }),
    onSuccess: () => { Alert.alert('Success', 'Item cancelled'); refetchOrder(); },
    onError: (e) => Alert.alert('Error', e?.response?.data?.message || 'Failed to cancel'),
  });

  const acceptQRMut = useMutation({
    mutationFn: (id) => qrOrdersApi.accept(id),
    onSuccess: () => {
      Alert.alert('Success', 'QR order accepted & sent to kitchen');
      queryClient.invalidateQueries({ queryKey: ['waiter-qr-orders'] });
      queryClient.invalidateQueries({ queryKey: ['waiter-my-tables'] });
      queryClient.invalidateQueries({ queryKey: ['waiter-order-detail'] });
    },
    onError: (e) => Alert.alert('Error', e?.response?.data?.message || 'Failed to accept'),
  });

  const rejectQRMut = useMutation({
    mutationFn: (id) => qrOrdersApi.reject(id),
    onSuccess: () => {
      Alert.alert('Success', 'QR order rejected');
      queryClient.invalidateQueries({ queryKey: ['waiter-qr-orders'] });
    },
    onError: (e) => Alert.alert('Error', e?.response?.data?.message || 'Failed to reject'),
  });

  const resetSessionMut = useMutation({
    mutationFn: (tableId) => tableApi.waiterResetSession(tableId),
    onSuccess: (res) => {
      const data = res.data || res;
      const pin = data?.pin;
      Alert.alert('Success', `Session reset.${pin ? ` New PIN: ${pin}` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['waiter-my-tables'] });
      setShowResetConfirm(null);
    },
    onError: (e) => Alert.alert('Error', e?.response?.data?.message || 'Failed to reset session'),
  });

  const markAvailableMut = useMutation({
    mutationFn: (tableId) => tableApi.updateStatus(tableId, 'available'),
    onSuccess: () => {
      Alert.alert('Success', 'Table marked available');
      queryClient.invalidateQueries({ queryKey: ['waiter-my-tables'] });
      setSelectedTable(prev => prev ? { ...prev, status: 'available' } : prev);
    },
    onError: (e) => Alert.alert('Error', e?.response?.data?.message || 'Failed to update status'),
  });

  // ── Send KOT flow ─────────────────────────────────────────────────────
  async function handleSendKOT() {
    if (!cart.length) return Alert.alert('Empty', 'Cart is empty');
    if (!selectedTable) return Alert.alert('Error', 'Select a table');
    try {
      let orderId = selectedTable.order_id;
      if (!orderId) {
        const res = await createMut.mutateAsync({
          tableId: selectedTable.id,
          orderType: 'dine_in',
        });
        const d = res.data || res;
        orderId = d.id;
        setSelectedTable(prev => ({ ...prev, order_id: orderId, order_number: d.orderNumber || d.order_number }));
      }
      await addItemsMut.mutateAsync({
        orderId,
        items: cart.map(c => ({
          menuItemId: c.menuItemId,
          variantId: c.variantId || undefined,
          addonIds: c.addons?.length > 0 ? c.addons.map(a => a.id) : undefined,
          quantity: c.qty,
        })),
      });
      await kotMut.mutateAsync(orderId);
      setCart([]);
      setShowCart(false);
      refetchOrder();
      refetchTables();
    } catch { /* toasted in mutations */ }
  }

  // ── Table selection ────────────────────────────────────────────────────
  function handleTableSelect(table) {
    setSelectedTable(table);
    setCart([]);
    setMenuSearch('');
    setActiveCat('all');
    setView('menu');
  }

  function handleBackToTables() {
    setSelectedTable(null);
    setCart([]);
    setView('tables');
    setShowCart(false);
  }

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  // ── RENDER: Tables View ────────────────────────────────────────────────
  const renderTablesView = () => (
    <View style={styles.flex}>
      {/* Floor filter tabs */}
      {floors.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.floorTabs} contentContainerStyle={styles.floorTabsContent}>
          <TouchableOpacity
            style={[styles.floorTab, activeFloor === 'all' && styles.floorTabActive]}
            onPress={() => setActiveFloor('all')}
          >
            <Text style={[styles.floorTabText, activeFloor === 'all' && styles.floorTabTextActive]}>All</Text>
          </TouchableOpacity>
          {floors.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[styles.floorTab, String(activeFloor) === String(f.id) && styles.floorTabActive]}
              onPress={() => setActiveFloor(f.id)}
            >
              <Text style={[styles.floorTabText, String(activeFloor) === String(f.id) && styles.floorTabTextActive]}>{f.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {tablesLoading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={filteredTables}
          keyExtractor={i => String(i.id)}
          numColumns={2}
          columnWrapperStyle={styles.tableRow}
          contentContainerStyle={styles.tableGrid}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetchTables} />}
          renderItem={({ item: table }) => {
            const sc = colors.status[table.status] || colors.status.cleaning;
            return (
              <TouchableOpacity
                style={[styles.tableCard, { backgroundColor: sc.bg, borderColor: sc.border }]}
                onPress={() => handleTableSelect(table)}
                activeOpacity={0.7}
              >
                <View style={styles.tableCardHeader}>
                  <Text style={[styles.tableNum, { color: sc.text }]}>T{table.table_number}</Text>
                  {table.table_pin && (
                    <View style={styles.pinBadge}>
                      <Icon name="lock" size={8} color={colors.textMuted} />
                      <Text style={styles.pinText}>{table.table_pin}</Text>
                    </View>
                  )}
                </View>
                {table.floor_name && <Text style={styles.tableFloor}>{table.floor_name}</Text>}
                <View style={styles.tableStatusRow}>
                  <View style={[styles.statusChip, { backgroundColor: sc.border }]}>
                    <Text style={[styles.statusChipText, { color: sc.text }]}>{table.status}</Text>
                  </View>
                  {table.status === 'cleaning' && (
                    <TouchableOpacity
                      style={styles.freeBtn}
                      onPress={(e) => { e.stopPropagation?.(); markAvailableMut.mutate(table.id); }}
                    >
                      <Icon name="check-circle" size={10} color={colors.success} />
                      <Text style={styles.freeBtnText}>Free</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {table.order_id && (
                  <View style={styles.tableOrderInfo}>
                    <View style={styles.tableOrderRow}>
                      <Text style={styles.tableOrderNum}>#{table.order_number}</Text>
                      <Text style={styles.tableOrderAmt}>{formatCurrency(table.order_total || 0)}</Text>
                    </View>
                    {table.minutes_occupied > 0 && (
                      <View style={styles.timeRow}>
                        <Icon name="clock" size={9} color={colors.textMuted} />
                        <Text style={styles.timeText}>{table.minutes_occupied}m</Text>
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="grid" size={48} color={colors.textMuted} />}
              title="No tables"
              message={myTables.length === 0 ? 'No tables assigned to you' : 'No tables on this floor'}
            />
          }
        />
      )}

      {/* QR Orders button */}
      {edineInEnabled && (
        <TouchableOpacity style={styles.qrButton} onPress={() => setShowQROrders(true)}>
          <Icon name="smartphone" size={16} color="#7C3AED" />
          <Text style={styles.qrButtonText}>QR Orders</Text>
          {pendingQROrders.length > 0 && (
            <View style={styles.qrBadge}>
              <Text style={styles.qrBadgeText}>{pendingQROrders.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  // ── RENDER: Menu View (when table selected) ────────────────────────────
  const renderMenuView = () => (
    <View style={styles.flex}>
      {/* Table info bar */}
      <View style={styles.tableBar}>
        <TouchableOpacity onPress={handleBackToTables} style={styles.backBtn}>
          <Icon name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.tableBarInfo}>
          <Text style={styles.tableBarTitle}>Table {selectedTable?.table_number}</Text>
          {selectedTable?.order_id && (
            <Text style={styles.tableBarSub}>Order #{selectedTable.order_number}</Text>
          )}
        </View>
        <View style={styles.tableBarActions}>
          {selectedTable?.status === 'cleaning' && (
            <TouchableOpacity
              style={styles.tableBarBtn}
              onPress={() => markAvailableMut.mutate(selectedTable.id)}
            >
              <Icon name="check-circle" size={14} color={colors.success} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.tableBarBtn}
            onPress={() => setShowResetConfirm(selectedTable)}
          >
            <Icon name="rotate-ccw" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tableBarBtn}
            onPress={() => setShowCart(true)}
          >
            <Icon name="shopping-bag" size={14} color={colors.primary} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.menuSearchBar}>
        <View style={styles.searchWrap}>
          <Icon name="search" size={14} color={colors.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            value={menuSearch}
            onChangeText={setMenuSearch}
            placeholder="Search menu..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          {menuSearch ? (
            <TouchableOpacity onPress={() => setMenuSearch('')}>
              <Icon name="x" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Category tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catTabs} contentContainerStyle={styles.catTabsContent}>
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.catTab, String(activeCat) === String(cat.id) && styles.catTabActive]}
            onPress={() => setActiveCat(cat.id)}
          >
            <Text style={[styles.catTabText, String(activeCat) === String(cat.id) && styles.catTabTextActive]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Menu items grid */}
      {menuLoading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={filteredItems}
          keyExtractor={i => String(i.id)}
          numColumns={2}
          columnWrapperStyle={styles.menuRow}
          contentContainerStyle={styles.menuGrid}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => handleItemClick(item)}
              activeOpacity={0.7}
            >
              <View style={styles.menuCardTop}>
                <Text style={styles.menuItemName} numberOfLines={2}>{item.name}</Text>
                <View style={[styles.typeDot, { backgroundColor: item.item_type === 'veg' ? '#16A34A' : item.item_type === 'egg' ? '#D97706' : '#DC2626' }]} />
              </View>
              <View style={styles.menuCardBottom}>
                <Text style={styles.menuItemPrice}>{formatCurrency(item.price)}</Text>
                {item.variants?.length > 0 && (
                  <Text style={styles.variantCount}>{item.variants.length} var</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="coffee" size={48} color={colors.textMuted} />}
              title="No items"
              message="No menu items match your search"
            />
          }
        />
      )}

      {/* Cart summary bar (floating) */}
      {(cart.length > 0 || savedItems.length > 0) && (
        <TouchableOpacity style={styles.cartBar} onPress={() => setShowCart(true)} activeOpacity={0.8}>
          <View style={styles.cartBarLeft}>
            <Icon name="shopping-bag" size={16} color={colors.white} />
            <Text style={styles.cartBarText}>
              {cart.length > 0 ? `${cartCount} new item${cartCount > 1 ? 's' : ''}` : 'View order'}
            </Text>
          </View>
          <Text style={styles.cartBarPrice}>
            {cart.length > 0 ? formatCurrency(cartSubtotal) : formatCurrency(orderDetail?.total_amount || 0)}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Main render ────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Header
        title={`Hi, ${user?.name || 'Waiter'}`}
        subtitle="Waiter Dashboard"
        rightComponent={
          <View style={styles.headerRight}>
            {edineInEnabled && pendingQROrders.length > 0 && view === 'menu' && (
              <TouchableOpacity onPress={() => setShowQROrders(true)} style={styles.headerQR}>
                <Icon name="smartphone" size={16} color="#7C3AED" />
                <View style={styles.headerQRBadge}>
                  <Text style={styles.headerQRBadgeText}>{pendingQROrders.length}</Text>
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
              <Icon name="log-out" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        }
      />

      {view === 'tables' ? renderTablesView() : renderMenuView()}

      {/* ── Cart / Order Modal ──────────────────────────────────────────── */}
      <Modal visible={showCart} onClose={() => setShowCart(false)} title={`Table ${selectedTable?.table_number || ''} — Order`} size="lg">
        <ScrollView style={styles.cartModalScroll}>
          {/* Saved order items */}
          {savedItems.length > 0 && (
            <View style={styles.cartSection}>
              <Text style={styles.cartSectionTitle}>CURRENT ORDER</Text>
              {savedItems.map(item => {
                const addons = typeof item.addon_details === 'string'
                  ? JSON.parse(item.addon_details || '[]')
                  : (item.addon_details || []);
                const canCancel = item.kot_sent && item.status === 'pending';
                const stColor = getItemStatusColor(item.status, item.kot_sent);
                return (
                  <View key={item.id} style={styles.cartItem}>
                    <View style={styles.cartItemLeft}>
                      <Text style={styles.cartItemName}>{item.item_name}</Text>
                      {item.variant_name && (
                        <Text style={styles.cartItemSub}>({item.variant_name})</Text>
                      )}
                      {addons?.length > 0 && (
                        <Text style={styles.cartItemSub}>+ {addons.map(a => a.name).join(', ')}</Text>
                      )}
                      <View style={styles.cartItemMeta}>
                        <Text style={styles.cartItemQty}>x{item.quantity}</Text>
                        <View style={[styles.itemStatusChip, { backgroundColor: stColor.bg }]}>
                          <Text style={[styles.itemStatusText, { color: stColor.text }]}>
                            {item.kot_sent ? (item.status === 'pending' ? 'KOT Sent' : capitalize(item.status)) : 'In Cart'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.cartItemRight}>
                      <Text style={styles.cartItemPrice}>{formatCurrency(item.total_price)}</Text>
                      {canCancel && (
                        <TouchableOpacity onPress={() => {
                          Alert.alert('Cancel Item', `Cancel "${item.item_name}"?`, [
                            { text: 'No', style: 'cancel' },
                            { text: 'Yes', style: 'destructive', onPress: () => cancelItemMut.mutate({ orderId: selectedTable.order_id, itemId: item.id }) },
                          ]);
                        }}>
                          <Text style={styles.cancelItemText}>Cancel</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* New cart items */}
          {cart.length > 0 && (
            <View style={styles.cartSection}>
              <Text style={[styles.cartSectionTitle, { color: '#EA580C' }]}>NEW ITEMS (UNSENT)</Text>
              {cart.map(c => (
                <View key={c._key} style={styles.cartItem}>
                  <View style={styles.cartItemLeft}>
                    <Text style={styles.cartItemName}>
                      {c.name}
                      {c.variantName ? ` (${c.variantName})` : ''}
                    </Text>
                    {c.addons?.length > 0 && (
                      <Text style={styles.cartItemSub}>+ {c.addons.map(a => a.name).join(', ')}</Text>
                    )}
                  </View>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQty(c._key, -1)}>
                      <Icon name="minus" size={12} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{c.qty}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQty(c._key, 1)}>
                      <Icon name="plus" size={12} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.cartItemPrice}>{formatCurrency(c.price * c.qty)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {savedItems.length === 0 && cart.length === 0 && (
            <EmptyState
              icon={<Icon name="coffee" size={40} color={colors.textMuted} />}
              title="No items"
              message="Tap menu items to add to order"
            />
          )}
        </ScrollView>

        {/* Summary footer */}
        <View style={styles.cartFooter}>
          {orderDetail && (
            <View style={styles.cartFooterRow}>
              <Text style={styles.cartFooterLabel}>Saved Total</Text>
              <Text style={styles.cartFooterValue}>{formatCurrency(orderDetail.total_amount)}</Text>
            </View>
          )}
          {cart.length > 0 && (
            <>
              <View style={styles.cartFooterRow}>
                <Text style={styles.cartFooterLabel}>New Items</Text>
                <Text style={[styles.cartFooterValue, { color: '#EA580C' }]}>+ {formatCurrency(cartSubtotal)}</Text>
              </View>
              <Button
                title="Send to Kitchen (KOT)"
                onPress={handleSendKOT}
                loading={createMut.isPending || addItemsMut.isPending || kotMut.isPending}
                fullWidth
                style={{ marginTop: spacing.md }}
                icon={<Icon name="send" size={16} color={colors.white} />}
              />
            </>
          )}
        </View>
      </Modal>

      {/* ── Variant/Addon Selection Modal ──────────────────────────────── */}
      <Modal
        visible={!!selectingItem}
        onClose={() => setSelectingItem(null)}
        title={selectingItem?.name || ''}
        size="md"
      >
        {selectingItem && (
          <ScrollView>
            {selectingItem.variants?.length > 0 && (
              <View style={styles.selectionSection}>
                <Text style={styles.selectionLabel}>Select Variant *</Text>
                {selectingItem.variants.map(v => (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.selectionOption, selectedVariantId === v.id && styles.selectionOptionActive]}
                    onPress={() => setSelectedVariantId(v.id)}
                  >
                    <View style={styles.radioRow}>
                      <View style={[styles.radio, selectedVariantId === v.id && styles.radioActive]}>
                        {selectedVariantId === v.id && <View style={styles.radioDot} />}
                      </View>
                      <Text style={styles.selectionOptionText}>{v.name}</Text>
                    </View>
                    <Text style={styles.selectionOptionPrice}>{formatCurrency(v.price)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {selectingItem.addons?.length > 0 && (
              <View style={styles.selectionSection}>
                <Text style={styles.selectionLabel}>Add-ons</Text>
                {selectingItem.addons.map(a => {
                  const checked = selectedAddons.find(sa => sa.id === a.id);
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.selectionOption, checked && styles.selectionOptionActive]}
                      onPress={() => {
                        setSelectedAddons(prev => checked ? prev.filter(s => s.id !== a.id) : [...prev, a]);
                      }}
                    >
                      <View style={styles.radioRow}>
                        <View style={[styles.checkbox, checked && styles.checkboxActive]}>
                          {checked && <Icon name="check" size={10} color={colors.white} />}
                        </View>
                        <Text style={styles.selectionOptionText}>{a.name}</Text>
                      </View>
                      <Text style={styles.selectionOptionPrice}>+ {formatCurrency(a.price)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <View style={styles.selectionActions}>
              <Button title="Cancel" variant="ghost" onPress={() => setSelectingItem(null)} style={styles.selectionBtn} />
              <Button title="Add to Order" onPress={confirmSelection} style={styles.selectionBtn} />
            </View>
          </ScrollView>
        )}
      </Modal>

      {/* ── QR Orders Modal ────────────────────────────────────────────── */}
      <Modal visible={showQROrders} onClose={() => setShowQROrders(false)} title="Pending QR Orders" size="lg">
        <ScrollView style={styles.qrModalScroll}>
          {pendingQROrders.length === 0 ? (
            <EmptyState
              icon={<Icon name="smartphone" size={40} color={colors.textMuted} />}
              title="No pending orders"
              message="No QR orders waiting"
            />
          ) : (
            pendingQROrders.map(qr => {
              const items = typeof qr.items === 'string' ? JSON.parse(qr.items) : (qr.items || []);
              return (
                <View key={qr.id} style={styles.qrCard}>
                  <View style={styles.qrCardHeader}>
                    <View>
                      <Text style={styles.qrCardTitle}>Table {qr.table_number}</Text>
                      {qr.floor_name && <Text style={styles.qrCardFloor}>{qr.floor_name}</Text>}
                    </View>
                    <Text style={styles.qrCardTime}>
                      {formatTime(qr.created_at)}
                    </Text>
                  </View>
                  {qr.customer_name && (
                    <Text style={styles.qrCustomer}>
                      {qr.customer_name}{qr.customer_phone ? ` · ${qr.customer_phone}` : ''}
                    </Text>
                  )}
                  {items.map((item, idx) => (
                    <View key={idx} style={styles.qrItem}>
                      <Text style={styles.qrItemName}>{item.itemName} x{item.quantity}</Text>
                      <Text style={styles.qrItemPrice}>
                        {formatCurrency((item.itemPrice + (item.addonPerUnit || 0)) * item.quantity)}
                      </Text>
                    </View>
                  ))}
                  {qr.special_instructions && (
                    <Text style={styles.qrNote}>Note: {qr.special_instructions}</Text>
                  )}
                  <View style={styles.qrActions}>
                    <Button
                      title="Accept"
                      onPress={() => acceptQRMut.mutate(qr.id)}
                      loading={acceptQRMut.isPending}
                      style={styles.qrActionBtn}
                      icon={<Icon name="check" size={14} color={colors.white} />}
                    />
                    <Button
                      title="Reject"
                      variant="outline"
                      onPress={() => {
                        Alert.alert('Reject Order', 'Are you sure?', [
                          { text: 'No', style: 'cancel' },
                          { text: 'Yes', style: 'destructive', onPress: () => rejectQRMut.mutate(qr.id) },
                        ]);
                      }}
                      loading={rejectQRMut.isPending}
                      style={styles.qrActionBtn}
                    />
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </Modal>

      {/* ── Reset Session Confirm ──────────────────────────────────────── */}
      <ConfirmModal
        visible={!!showResetConfirm}
        onClose={() => setShowResetConfirm(null)}
        onConfirm={() => showResetConfirm && resetSessionMut.mutate(showResetConfirm.id)}
        title="Reset Session & PIN"
        message={`This will deactivate all QR sessions and generate a new PIN for Table ${showResetConfirm?.table_number || ''}. Any pending QR orders will be expired.`}
        confirmText="Reset"
        confirmVariant="danger"
        loading={resetSessionMut.isPending}
      />
    </View>
  );
}

// ── Helper ─────────────────────────────────────────────────────────────────
function getItemStatusColor(status, kotSent) {
  if (!kotSent) return { bg: '#FEF3C7', text: '#92400E' }; // in cart
  switch (status) {
    case 'pending': return { bg: '#FFF7ED', text: '#9A3412' }; // kot sent
    case 'preparing': return { bg: '#DBEAFE', text: '#1E40AF' };
    case 'ready': return { bg: '#ECFDF5', text: '#065F46' };
    case 'served': return { bg: '#F3F4F6', text: '#374151' };
    default: return { bg: '#F3F4F6', text: '#6B7280' };
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────
const CARD_GAP = spacing.sm;
const CARD_WIDTH = (SCREEN_WIDTH - spacing.base * 2 - CARD_GAP) / 2;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },

  // Header
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoutBtn: { padding: spacing.sm },
  headerQR: { padding: spacing.sm, position: 'relative' },
  headerQRBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: colors.error, borderRadius: 99, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  headerQRBadgeText: { color: colors.white, fontSize: 9, fontWeight: '700' },

  // Floor tabs
  floorTabs: { maxHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: colors.white },
  floorTabsContent: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, gap: spacing.sm },
  floorTab: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surface },
  floorTabActive: { backgroundColor: colors.primary },
  floorTabText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  floorTabTextActive: { color: colors.white },

  // Table grid
  tableGrid: { padding: spacing.base, paddingBottom: 80 },
  tableRow: { gap: CARD_GAP, marginBottom: CARD_GAP },
  tableCard: { width: CARD_WIDTH, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5 },
  tableCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  tableNum: { fontSize: 15, fontWeight: '700' },
  pinBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pinText: { fontSize: 9, color: colors.textMuted },
  tableFloor: { fontSize: 10, color: colors.textMuted, marginBottom: 4 },
  tableStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  statusChipText: { fontSize: 10, fontWeight: '600' },
  freeBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, backgroundColor: '#ECFDF5' },
  freeBtnText: { fontSize: 9, fontWeight: '600', color: colors.success },
  tableOrderInfo: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  tableOrderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tableOrderNum: { fontSize: 10, color: colors.textSecondary },
  tableOrderAmt: { fontSize: 10, fontWeight: '600', color: colors.text },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  timeText: { fontSize: 9, color: colors.textMuted },

  // QR button (on tables view)
  qrButton: { position: 'absolute', bottom: spacing.lg, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#F5F3FF', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.xl, borderWidth: 1, borderColor: '#DDD6FE', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  qrButtonText: { fontSize: 14, fontWeight: '600', color: '#7C3AED' },
  qrBadge: { position: 'absolute', top: -6, right: -6, backgroundColor: colors.error, borderRadius: 99, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  qrBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },

  // Table bar (menu view header)
  tableBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  backBtn: { padding: spacing.sm, marginRight: spacing.sm },
  tableBarInfo: { flex: 1 },
  tableBarTitle: { ...typography.bodyBold, color: colors.text },
  tableBarSub: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  tableBarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tableBarBtn: { padding: spacing.sm, position: 'relative' },
  cartBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: colors.primary, borderRadius: 99, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  cartBadgeText: { color: colors.white, fontSize: 9, fontWeight: '700' },

  // Search bar
  menuSearchBar: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, backgroundColor: colors.white },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 38 },
  searchInput: { flex: 1, ...typography.body, fontSize: 13, color: colors.text, paddingVertical: 0 },

  // Category tabs
  catTabs: { maxHeight: 42, borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: colors.white },
  catTabsContent: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, gap: spacing.sm },
  catTab: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surface },
  catTabActive: { backgroundColor: colors.primary },
  catTabText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  catTabTextActive: { color: colors.white },

  // Menu grid
  menuGrid: { padding: spacing.base, paddingBottom: 80 },
  menuRow: { gap: CARD_GAP, marginBottom: CARD_GAP },
  menuCard: { width: CARD_WIDTH, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md },
  menuCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 },
  menuItemName: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.text, lineHeight: 18 },
  typeDot: { width: 10, height: 10, borderRadius: 2, marginTop: 3 },
  menuCardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  menuItemPrice: { fontSize: 12, fontWeight: '700', color: colors.primary },
  variantCount: { fontSize: 10, color: colors.textMuted },

  // Cart bar (floating)
  cartBar: { position: 'absolute', bottom: spacing.base, left: spacing.base, right: spacing.base, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.xl, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6 },
  cartBarLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cartBarText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  cartBarPrice: { color: colors.white, fontSize: 14, fontWeight: '700' },

  // Cart modal
  cartModalScroll: { maxHeight: 400 },
  cartSection: { paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  cartSectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: colors.textMuted, marginBottom: spacing.md },
  cartItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  cartItemLeft: { flex: 1, marginRight: spacing.md },
  cartItemName: { fontSize: 13, fontWeight: '500', color: colors.text },
  cartItemSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  cartItemMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  cartItemQty: { fontSize: 11, color: colors.textSecondary },
  itemStatusChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  itemStatusText: { fontSize: 10, fontWeight: '600' },
  cartItemRight: { alignItems: 'flex-end' },
  cartItemPrice: { fontSize: 13, fontWeight: '600', color: colors.text, marginLeft: spacing.sm },
  cancelItemText: { fontSize: 11, color: colors.error, fontWeight: '500', marginTop: 4 },

  // Qty controls
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 24, height: 24, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  qtyText: { fontSize: 13, fontWeight: '600', color: colors.text, minWidth: 16, textAlign: 'center' },

  // Cart footer
  cartFooter: { paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderLight },
  cartFooterRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cartFooterLabel: { fontSize: 12, color: colors.textSecondary },
  cartFooterValue: { fontSize: 13, fontWeight: '600', color: colors.text },

  // Selection modal
  selectionSection: { marginBottom: spacing.lg },
  selectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.md },
  selectionOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  selectionOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectionOptionText: { fontSize: 14, color: colors.text },
  selectionOptionPrice: { fontSize: 14, fontWeight: '600', color: colors.text },
  selectionActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  selectionBtn: { flex: 1 },

  // QR modal
  qrModalScroll: { maxHeight: 450 },
  qrCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  qrCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  qrCardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  qrCardFloor: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  qrCardTime: { fontSize: 10, color: colors.textMuted },
  qrCustomer: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
  qrItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  qrItemName: { fontSize: 12, color: colors.text },
  qrItemPrice: { fontSize: 12, color: colors.textSecondary },
  qrNote: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.sm, marginBottom: spacing.sm },
  qrActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  qrActionBtn: { flex: 1 },
});
