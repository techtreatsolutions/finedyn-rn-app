import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ScrollView, TextInput,
  Alert, StyleSheet, RefreshControl, Dimensions, BackHandler,
  Modal as RNModal, ActivityIndicator, Pressable, Vibration,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orderApi } from '../../api/order.api';
import { menuApi } from '../../api/menu.api';
import { tableApi } from '../../api/table.api';
import { floorApi } from '../../api/floor.api';
import { reservationApi } from '../../api/reservation.api';
import { restaurantApi } from '../../api/restaurant.api';
import { qrOrdersApi } from '../../api/qrOrders.api';
import Header from '../../components/common/Header';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import SearchBar from '../../components/common/SearchBar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ConfirmModal from '../../components/common/ConfirmModal';
import { colors, spacing, radius, typography } from '../../theme';
import { formatCurrency, formatDateTime, timeAgo, capitalize } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import RNPrint from 'react-native-print';
import ThermalPrinter from '../../utils/thermalPrinter';
import { generateBillHtml, generateKotHtml } from '../../utils/printHtml';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MENU_CARD_W = (SCREEN_W - spacing.base * 2 - spacing.md) / 2;
const TABLE_CARD_W = (SCREEN_W - spacing.base * 2 - spacing.md * 2) / 3;

/** Reusable bottom-sheet wrapper: backdrop tap closes, content scrolls freely */
function BottomSheet({ visible, onClose, maxHeight, children }) {
  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetRoot}>
        {/* Backdrop — tap to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {/* Content — plain View, no Pressable, so ScrollView works perfectly */}
        <View style={[s.sheetContainer, maxHeight ? { maxHeight } : null]}>
          {children}
        </View>
      </View>
    </RNModal>
  );
}

function cartKey(menuItemId, variantId, addons) {
  const addonSig = (addons || []).map(a => a.id).sort().join(',');
  return `${menuItemId}_${variantId || 0}_${addonSig}`;
}

const ORDER_TYPES = [
  { key: 'dine_in', label: 'Dine-in', icon: 'home' },
  { key: 'takeaway', label: 'Takeaway', icon: 'shopping-bag' },
  { key: 'delivery', label: 'Delivery', icon: 'truck' },
];

const PAYMENT_MODES = [
  { label: 'Cash', value: 'cash', icon: 'dollar-sign' },
  { label: 'Card', value: 'card', icon: 'credit-card' },
  { label: 'UPI', value: 'upi', icon: 'smartphone' },
  { label: 'Online', value: 'online', icon: 'globe' },
];

const ITEM_STATUS_COLORS = {
  pending: { bg: '#FEF3C7', text: '#92400E', label: 'Pending' },
  preparing: { bg: '#DBEAFE', text: '#1E40AF', label: 'Preparing' },
  ready: { bg: '#ECFDF5', text: '#065F46', label: 'Ready' },
  served: { bg: '#F3F4F6', text: '#374151', label: 'Served' },
  cancelled: { bg: '#FEF2F2', text: '#991B1B', label: 'Cancelled' },
};

export default function POSDashboardScreen({ navigation, route }) {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const prevQRCountRef = useRef(null);

  // === SCREEN MODE ===
  const [screen, setScreen] = useState('orders');

  // === ORDER STATE ===
  const [activeOrder, setActiveOrder] = useState(null);
  const [orderType, setOrderType] = useState('dine_in');
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedFloorId, setSelectedFloorId] = useState(null);

  // === CART ===
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);

  // === MENU ===
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCategoryFilter, setMenuCategoryFilter] = useState('');
  const [hideUnavailable, setHideUnavailable] = useState(false);

  // === VARIANT/ADDON ===
  const [selectingItem, setSelectingItem] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState([]);

  // === PAYMENT (Split Payment) ===
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMode, setPayMode] = useState('cash');
  const [payAmount, setPayAmount] = useState('');
  const [payReceived, setPayReceived] = useState('');
  const [addedPayments, setAddedPayments] = useState([]);

  // === BILL PREVIEW ===
  const [showBillPreview, setShowBillPreview] = useState(false);
  const [billData, setBillData] = useState(null);
  const [billLoading, setBillLoading] = useState(false);

  // === QR ORDERS ===
  const [showQROrders, setShowQROrders] = useState(false);

  // === CLOSE/CANCEL ===
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // === CUSTOMER ===
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [showCustomerFields, setShowCustomerFields] = useState(false);
  const lookupTimerRef = useRef(null);

  // === ADJUSTMENTS ===
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjForm, setAdjForm] = useState({ label: '', type: 'discount', value: '', isPercentage: true });

  // === E-BILL ===
  const [ebillSending, setEbillSending] = useState(false);

  // Auto-lookup customer name when phone reaches 10 digits
  useEffect(() => {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    if (customerPhone.length === 10) {
      lookupTimerRef.current = setTimeout(async () => {
        try {
          const res = await orderApi.lookupCustomer(customerPhone);
          const custName = res?.data?.customer_name || res?.customer_name;
          if (custName && (!customerName.trim() || customerName.toLowerCase() === 'cash customer')) {
            setCustomerName(custName);
          }
        } catch {}
      }, 300);
    }
    return () => { if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current); };
  }, [customerPhone]);

  // Handle route params (from TableMap or OrdersList navigation)
  useEffect(() => {
    const params = route?.params;
    if (params?.orderId) {
      (async () => {
        try {
          const res = await orderApi.getOrder(params.orderId);
          const o = res.data || res;
          openExistingOrder(o);
        } catch {}
      })();
      // Clear params
      navigation.setParams({ orderId: undefined, tableId: undefined, type: undefined });
    } else if (params?.tableId) {
      setOrderType(params.type || 'dine_in');
      const tableId = params.tableId;
      setScreen('pos_view');
      // Find the table to set selectedTable
      (async () => {
        try {
          const res = await tableApi.getTable(tableId);
          setSelectedTable(res.data || res);
        } catch {
          setSelectedTable({ id: tableId });
        }
      })();
      navigation.setParams({ orderId: undefined, tableId: undefined, type: undefined });
    }
  }, [route?.params?.orderId, route?.params?.tableId]);

  // === ANDROID BACK HANDLER ===
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showAdjModal) { setShowAdjModal(false); return true; }
      if (showCloseConfirm) { setShowCloseConfirm(false); return true; }
      if (showCancelConfirm) { setShowCancelConfirm(false); return true; }
      if (showPayModal) { setShowPayModal(false); return true; }
      if (showBillPreview) { setShowBillPreview(false); return true; }
      if (showQROrders) { setShowQROrders(false); return true; }
      if (selectingItem) { setSelectingItem(null); return true; }
      if (showCart) { setShowCart(false); return true; }
      if (screen === 'pos_view' || screen === 'table_picker') {
        goBackToOrders();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [screen, showCart, selectingItem, showPayModal, showBillPreview, showQROrders, showCancelConfirm, showCloseConfirm, showAdjModal]);

  // =============================================
  // QUERIES
  // =============================================
  const { data: subscriptionData } = useQuery({
    queryKey: ['subscription-features'],
    queryFn: async () => {
      const res = await restaurantApi.getSubscription();
      return res.data || res;
    },
    staleTime: 5 * 60000,
  });
  const edineInEnabled = !!subscriptionData?.features?.feature_edine_in_orders;

  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ['posOrders'],
    queryFn: async () => {
      const res = await orderApi.getOrders();
      return res.data || res;
    },
    refetchInterval: 15000,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['posMenuCategories'],
    queryFn: async () => {
      const res = await menuApi.getCategories();
      return res.data || res;
    },
    staleTime: 5 * 60000,
  });

  const { data: menuItemsData, refetch: refetchMenu } = useQuery({
    queryKey: ['posMenuItems'],
    queryFn: async () => {
      const res = await menuApi.getItems();
      return res.data || res;
    },
    staleTime: 2 * 60000,
  });

  const { data: floorsData } = useQuery({
    queryKey: ['posFloors'],
    queryFn: async () => {
      const res = await floorApi.getFloors();
      return res.data || res;
    },
    staleTime: 5 * 60000,
  });

  const { data: tablesData, refetch: refetchTables } = useQuery({
    queryKey: ['posTables', selectedFloorId],
    queryFn: async () => {
      if (selectedFloorId) {
        const res = await tableApi.getFloorMap(selectedFloorId);
        return res.data || res;
      }
      const res = await tableApi.getTables();
      return res.data || res;
    },
    staleTime: 30000,
  });

  const { data: orderDetail, refetch: refetchOrder } = useQuery({
    queryKey: ['pos-order-detail', activeOrder?.id],
    queryFn: async () => {
      const res = await orderApi.getOrder(activeOrder.id);
      return res.data || res;
    },
    enabled: !!activeOrder?.id,
    staleTime: 10000,
  });

  // QR Orders polling
  const { data: qrOrdersData } = useQuery({
    queryKey: ['qr-orders-pending'],
    queryFn: async () => {
      const res = await qrOrdersApi.getPending();
      return res.data || res;
    },
    refetchInterval: 10000,
    enabled: edineInEnabled,
  });
  const pendingQROrders = Array.isArray(qrOrdersData) ? qrOrdersData : qrOrdersData?.orders || [];

  // QR Orders notification with vibration
  useEffect(() => {
    if (prevQRCountRef.current !== null && pendingQROrders.length > prevQRCountRef.current) {
      Vibration.vibrate([0, 300, 200, 300, 200, 300]); // triple vibration pattern
      Alert.alert(
        'New QR Order',
        `A new order from Table ${pendingQROrders[0]?.table_number || '?'} has been received!`,
        [
          { text: 'View', onPress: () => setShowQROrders(true), style: 'default' },
          { text: 'Dismiss', style: 'cancel' },
        ],
      );
    }
    prevQRCountRef.current = pendingQROrders.length;
  }, [pendingQROrders.length]);

  // Sync order detail to activeOrder
  useEffect(() => {
    if (orderDetail && activeOrder?.id) {
      setActiveOrder(orderDetail);
      if (orderDetail.customer_phone && !customerPhone) setCustomerPhone(orderDetail.customer_phone);
      if (orderDetail.customer_name && !customerName) setCustomerName(orderDetail.customer_name);
      if (orderDetail.delivery_address && !deliveryAddress) setDeliveryAddress(orderDetail.delivery_address);
    }
  }, [orderDetail]);

  // Auto-close if order is paid
  useEffect(() => {
    if (activeOrder?.payment_status === 'paid') {
      Alert.alert('Payment Complete', 'This order has been paid.');
      goBackToOrders();
    }
  }, [activeOrder?.payment_status]);

  const allOrders = Array.isArray(ordersData) ? ordersData : ordersData?.orders || [];
  const orders = allOrders.filter(o => !['completed', 'cancelled'].includes(o.status) && o.payment_status !== 'paid');
  const categories = Array.isArray(categoriesData) ? categoriesData : [];
  const menuItems = Array.isArray(menuItemsData) ? menuItemsData : menuItemsData?.items || [];
  const floors = Array.isArray(floorsData) ? floorsData : [];
  const tables = Array.isArray(tablesData) ? tablesData : [];

  // =============================================
  // MUTATIONS
  // =============================================
  const addItemMut = useMutation({
    mutationFn: ({ orderId, items }) => orderApi.addItem(orderId, { items }),
    onSuccess: async (_, variables) => {
      setCart([]);
      try { await orderApi.sendKOT(variables.orderId); } catch {}
      queryClient.invalidateQueries({ queryKey: ['posOrders'] });
      queryClient.invalidateQueries({ queryKey: ['posTables'] });
      queryClient.invalidateQueries({ queryKey: ['pos-order-detail', variables.orderId] });
      Alert.alert('Success', 'KOT sent to kitchen');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to add items'),
  });

  const payOrderMut = useMutation({
    mutationFn: ({ orderId, payments }) => orderApi.addPayment(orderId, { payments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posOrders'] });
      queryClient.invalidateQueries({ queryKey: ['posTables'] });
      queryClient.invalidateQueries({ queryKey: ['pos-order-detail'] });
      setShowPayModal(false);
      setAddedPayments([]);
      Alert.alert('Success', 'Payment recorded');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Payment failed'),
  });

  const closeOrderMut = useMutation({
    mutationFn: (orderId) => orderApi.closeOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posOrders'] });
      queryClient.invalidateQueries({ queryKey: ['posTables'] });
      setShowCloseConfirm(false);
      goBackToOrders();
      Alert.alert('Success', 'Order closed');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to close order'),
  });

  const cancelOrderMut = useMutation({
    mutationFn: (orderId) => orderApi.cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posOrders'] });
      queryClient.invalidateQueries({ queryKey: ['posTables'] });
      setShowCancelConfirm(false);
      goBackToOrders();
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to cancel'),
  });

  const cancelItemMut = useMutation({
    mutationFn: ({ orderId, itemId }) => orderApi.updateItem(orderId, itemId, { status: 'cancelled' }),
    onSuccess: () => {
      if (activeOrder?.id) {
        queryClient.invalidateQueries({ queryKey: ['pos-order-detail', activeOrder.id] });
      }
      Alert.alert('Success', 'Item cancelled');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to cancel item'),
  });

  const addAdjMut = useMutation({
    mutationFn: ({ orderId, ...data }) => orderApi.addAdjustment(orderId, data),
    onSuccess: () => {
      setShowAdjModal(false);
      setAdjForm({ label: '', type: 'discount', value: '', isPercentage: true });
      if (activeOrder?.id) {
        queryClient.invalidateQueries({ queryKey: ['pos-order-detail', activeOrder.id] });
      }
      Alert.alert('Success', 'Adjustment added');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to add adjustment'),
  });

  const removeAdjMut = useMutation({
    mutationFn: ({ orderId, adjId }) => orderApi.removeAdjustment(orderId, adjId),
    onSuccess: () => {
      if (activeOrder?.id) {
        queryClient.invalidateQueries({ queryKey: ['pos-order-detail', activeOrder.id] });
      }
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to remove adjustment'),
  });

  const acceptQRMut = useMutation({
    mutationFn: (id) => qrOrdersApi.accept(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['qr-orders-pending'] });
      queryClient.invalidateQueries({ queryKey: ['posOrders'] });
      queryClient.invalidateQueries({ queryKey: ['posTables'] });
      queryClient.invalidateQueries({ queryKey: ['pos-order-detail'] });
      const orderId = res?.data?.orderId;
      if (orderId && !activeOrder) {
        // Auto-open the order if no order is currently active
        (async () => {
          try {
            const orderRes = await orderApi.getOrder(orderId);
            openExistingOrder(orderRes.data || orderRes);
          } catch {}
        })();
      }
      Alert.alert('Success', 'QR order accepted & sent to kitchen');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to accept'),
  });

  const rejectQRMut = useMutation({
    mutationFn: (id) => qrOrdersApi.reject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qr-orders-pending'] });
      Alert.alert('Success', 'QR order rejected');
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to reject'),
  });

  const customerMut = useMutation({
    mutationFn: ({ orderId, ...data }) => orderApi.updateCustomer(orderId, data),
  });

  // =============================================
  // DERIVED DATA
  // =============================================
  const floorTabs = useMemo(() => [{ id: null, name: 'All' }, ...floors], [floors]);
  const filteredTables = useMemo(() => {
    if (!selectedFloorId) return tables;
    return tables.filter(t => String(t.floor_id) === String(selectedFloorId));
  }, [tables, selectedFloorId]);

  const categoryTabs = useMemo(() => {
    return [{ id: '', name: 'All' }, ...categories.map(c => ({ id: String(c.id), name: c.name }))];
  }, [categories]);

  function isItemUnavailable(item) {
    if (!item.is_available) return true;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const cur = `${hh}:${mm}:${ss}`;
    if (item.available_from && item.available_to && (cur < item.available_from || cur > item.available_to)) return true;
    if (item.category_available_from && item.category_available_to && (cur < item.category_available_from || cur > item.category_available_to)) return true;
    return false;
  }

  const filteredMenuItems = useMemo(() => {
    let items = [...menuItems];
    if (hideUnavailable) items = items.filter(i => !isItemUnavailable(i));
    if (menuCategoryFilter) items = items.filter(i => String(i.category_id) === menuCategoryFilter);
    if (menuSearch.trim()) {
      const q = menuSearch.toLowerCase().trim();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }
    return items;
  }, [menuItems, menuCategoryFilter, menuSearch, hideUnavailable]);

  const getCartQty = useCallback((menuItemId) => {
    return cart.filter(c => c.menuItemId === menuItemId).reduce((sum, c) => sum + c.qty, 0);
  }, [cart]);

  const cartTotal = useMemo(() => cart.reduce((sum, c) => sum + c.price * c.qty, 0), [cart]);
  const cartItemCount = useMemo(() => cart.reduce((sum, c) => sum + c.qty, 0), [cart]);

  const orderItems = useMemo(() => {
    if (!activeOrder) return [];
    return (activeOrder.items || activeOrder.order_items || []).filter(i => i.status !== 'cancelled');
  }, [activeOrder]);

  const orderSubtotal = useMemo(() => activeOrder ? parseFloat(activeOrder.subtotal || 0) : 0, [activeOrder]);
  const orderTax = useMemo(() => activeOrder ? parseFloat(activeOrder.tax_amount || 0) : 0, [activeOrder]);
  const orderAdjustments = useMemo(() => activeOrder?.adjustments || [], [activeOrder]);
  const orderTotal = useMemo(() => {
    if (!activeOrder) return 0;
    return parseFloat(activeOrder.total_amount || activeOrder.total || activeOrder.grand_total || activeOrder.subtotal || 0);
  }, [activeOrder]);

  const alreadyPaid = useMemo(() => parseFloat(activeOrder?.total_collected || activeOrder?.total_paid || 0), [activeOrder]);
  const remainingDue = useMemo(() => Math.max(0, orderTotal - alreadyPaid), [orderTotal, alreadyPaid]);

  const cartTaxEstimate = useMemo(() => {
    return cart.reduce((sum, c) => {
      const mi = menuItems.find(m => m.id === c.menuItemId);
      const taxRate = mi ? parseFloat(mi.tax_rate || 0) : 0;
      return sum + (c.price * c.qty * taxRate / 100);
    }, 0);
  }, [cart, menuItems]);

  const grandTotal = useMemo(() => orderTotal + cartTotal + cartTaxEstimate, [orderTotal, cartTotal, cartTaxEstimate]);

  // =============================================
  // NAVIGATION HELPERS
  // =============================================
  const goBackToOrders = useCallback(() => {
    setScreen('orders');
    setActiveOrder(null);
    setCart([]);
    setSelectedTable(null);
    setMenuSearch('');
    setMenuCategoryFilter('');
    setShowCart(false);
    setCustomerPhone('');
    setCustomerName('');
    setDeliveryAddress('');
    setShowCustomerFields(false);
    setAddedPayments([]);
    refetchOrders();
  }, [refetchOrders]);

  const startNewOrder = useCallback((type) => {
    setOrderType(type);
    setCart([]);
    setActiveOrder(null);
    setMenuSearch('');
    setMenuCategoryFilter('');
    setCustomerPhone('');
    setCustomerName('');
    setDeliveryAddress('');
    setShowCustomerFields(type === 'delivery');
    if (type === 'dine_in') {
      setSelectedFloorId(null);
      setScreen('table_picker');
    } else {
      setSelectedTable(null);
      setScreen('pos_view');
    }
  }, []);

  const selectTable = useCallback((table) => {
    if (table.status === 'occupied' && (table.order_id || table.current_order_id)) {
      const orderId = table.order_id || table.current_order_id;
      (async () => {
        try {
          const res = await orderApi.getOrder(orderId);
          openExistingOrder(res.data || res);
        } catch {
          Alert.alert('Error', 'Could not load order for this table');
        }
      })();
      return;
    }
    if (table.status === 'reserved' && table.reservation_id) {
      Alert.alert(
        'Reserved Table',
        `This table is reserved for ${table.reservation_customer || 'a guest'}${table.reservation_time ? ` at ${table.reservation_time.toString().slice(0, 5)}` : ''}.\n\nSeat the guest and start an order?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Seat & Start Order',
            onPress: async () => {
              try {
                const res = await reservationApi.startOrder(table.reservation_id);
                const order = res.data || res;
                queryClient.invalidateQueries({ queryKey: ['posTables'] });
                queryClient.invalidateQueries({ queryKey: ['posOrders'] });
                if (order.id) {
                  const fullOrder = await orderApi.getOrder(order.id);
                  openExistingOrder(fullOrder.data || fullOrder);
                } else { goBackToOrders(); }
                Alert.alert('Success', 'Guest seated. Order started.');
              } catch (err) {
                Alert.alert('Error', err?.response?.data?.message || 'Failed to seat guest');
              }
            },
          },
        ],
      );
      return;
    }
    setSelectedTable(table);
    setScreen('pos_view');
  }, [openExistingOrder, queryClient, goBackToOrders]);

  const openExistingOrder = useCallback((order) => {
    setActiveOrder(order);
    setOrderType(order.order_type || 'dine_in');
    setCart([]);
    setMenuSearch('');
    setMenuCategoryFilter('');
    setCustomerPhone(order.customer_phone || '');
    setCustomerName(order.customer_name || '');
    setDeliveryAddress(order.delivery_address || '');
    setShowCustomerFields(!!(order.customer_phone || order.customer_name || order.order_type === 'delivery'));
    setScreen('pos_view');
  }, []);

  // =============================================
  // CART MANAGEMENT
  // =============================================
  const addToCart = useCallback((item, variantId, variantObj, addons) => {
    const basePrice = variantObj ? parseFloat(variantObj.price) : parseFloat(item.price);
    const addonTotal = (addons || []).reduce((s, a) => s + parseFloat(a.price), 0);
    const key = cartKey(item.id, variantId, addons);
    setCart(prev => {
      const idx = prev.findIndex(c => c._key === key);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...prev, {
        _key: key, menuItemId: item.id, name: item.name,
        variantId: variantId || null, variantName: variantObj?.name || null,
        addons: (addons || []).map(a => ({ id: a.id, name: a.name, price: parseFloat(a.price) })),
        basePrice, addonTotal, price: basePrice + addonTotal, tax_rate: parseFloat(item.tax_rate || 0), qty: 1,
      }];
    });
  }, []);

  const updateCartQty = useCallback((key, delta) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c._key === key);
      if (idx < 0) return prev;
      const newQty = prev[idx].qty + delta;
      if (newQty <= 0) return prev.filter((_, i) => i !== idx);
      const copy = [...prev];
      copy[idx] = { ...copy[idx], qty: newQty };
      return copy;
    });
  }, []);

  // =============================================
  // ITEM HANDLERS
  // =============================================
  const handleItemClick = useCallback((item) => {
    const hasVariants = item.variants && item.variants.length > 0;
    const hasAddons = item.addons && item.addons.length > 0;
    if (hasVariants || hasAddons) {
      setSelectingItem(item);
      setSelectedVariantId(null);
      setSelectedAddons([]);
    } else {
      addToCart(item, null, null, []);
    }
  }, [addToCart]);

  const confirmVariantSelection = useCallback(() => {
    if (!selectingItem) return;
    const hasVariants = selectingItem.variants && selectingItem.variants.length > 0;
    if (hasVariants && !selectedVariantId) {
      Alert.alert('Required', 'Please select a variant');
      return;
    }
    const variantObj = hasVariants ? selectingItem.variants.find(v => v.id === selectedVariantId) : null;
    addToCart(selectingItem, selectedVariantId || null, variantObj, selectedAddons);
    setSelectingItem(null);
  }, [selectingItem, selectedVariantId, selectedAddons, addToCart]);

  const toggleAddon = useCallback((addon) => {
    setSelectedAddons(prev => {
      const exists = prev.find(a => a.id === addon.id);
      if (exists) return prev.filter(a => a.id !== addon.id);
      return [...prev, addon];
    });
  }, []);

  // =============================================
  // ORDER ACTIONS
  // =============================================
  const [sendingToKitchen, setSendingToKitchen] = useState(false);

  const handleSendToKitchen = useCallback(async () => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Add items before sending to kitchen');
      return;
    }
    const items = cart.map(c => ({
      menuItemId: c.menuItemId,
      variantId: c.variantId || undefined,
      addonIds: c.addons.length > 0 ? c.addons.map(a => a.id) : undefined,
      quantity: c.qty,
    }));

    if (!activeOrder) {
      setSendingToKitchen(true);
      try {
        const orderData = { orderType };
        if (orderType === 'dine_in' && selectedTable) orderData.tableId = selectedTable.id;
        if (customerPhone.trim()) orderData.customerPhone = customerPhone.trim();
        if (customerName.trim()) orderData.customerName = customerName.trim();
        if (deliveryAddress.trim()) orderData.deliveryAddress = deliveryAddress.trim();
        const createRes = await orderApi.createOrder(orderData);
        const order = createRes.data || createRes;
        setActiveOrder(order);
        queryClient.invalidateQueries({ queryKey: ['posOrders'] });
        queryClient.invalidateQueries({ queryKey: ['posTables'] });
        addItemMut.mutate({ orderId: order.id, items });
      } catch (err) {
        Alert.alert('Error', err?.response?.data?.message || 'Failed to create order');
      } finally {
        setSendingToKitchen(false);
      }
    } else {
      addItemMut.mutate({ orderId: activeOrder.id, items });
    }
    setShowCart(false);
  }, [cart, activeOrder, orderType, selectedTable, customerPhone, customerName, deliveryAddress, queryClient, addItemMut]);

  // === PAYMENT ===
  const addPaymentLine = useCallback(() => {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) return;
    const line = {
      paymentMode: payMode,
      amount: amt,
      amountReceived: payMode === 'cash' ? parseFloat(payReceived || amt) : amt,
    };
    setAddedPayments(prev => [...prev, line]);
    setPayAmount('');
    setPayReceived('');
  }, [payMode, payAmount, payReceived]);

  const removePaymentLine = useCallback((idx) => {
    setAddedPayments(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleConfirmPayment = useCallback(() => {
    if (addedPayments.length === 0) {
      Alert.alert('No Payment', 'Add at least one payment line');
      return;
    }
    payOrderMut.mutate({ orderId: activeOrder.id, payments: addedPayments });
  }, [activeOrder, addedPayments, payOrderMut]);

  const openPayModal = useCallback(() => {
    setAddedPayments([]);
    setPayMode('cash');
    setPayAmount(String(remainingDue));
    setPayReceived('');
    setShowCart(false);
    setShowPayModal(true);
  }, [remainingDue]);

  // === BILL PREVIEW ===
  const handleViewBill = useCallback(async () => {
    if (!activeOrder?.id) return;
    setBillLoading(true);
    setShowBillPreview(true);
    try {
      const res = await orderApi.generateBill(activeOrder.id);
      setBillData(res.data || res);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to load bill');
      setShowBillPreview(false);
    } finally {
      setBillLoading(false);
    }
  }, [activeOrder]);

  // === E-BILL ===
  const handleSendEBill = useCallback(async () => {
    if (!activeOrder?.id || customerPhone.length < 10) return;
    setEbillSending(true);
    try {
      await orderApi.sendEBill(activeOrder.id);
      Alert.alert('Success', 'E-bill sent via WhatsApp');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to send e-bill');
    } finally {
      setEbillSending(false);
    }
  }, [activeOrder, customerPhone]);

  // === BILL FORMAT ===
  const { data: billFormatData } = useQuery({
    queryKey: ['billFormat'],
    queryFn: async () => { const r = await restaurantApi.getBillFormat(); return r.data || r; },
    staleTime: 5 * 60000,
  });

  // === PRINT BILL ===
  const handlePrintBill = useCallback(async () => {
    if (!activeOrder?.id) return;
    try {
      const res = await orderApi.generateBill(activeOrder.id);
      const bill = res.data || res;
      const bf = bill.billFormat || billFormatData || {};
      const sizeMm = parseInt(bf.bill_printer_size_mm) || 80;
      const restName = user?.restaurantName || '';

      // Try direct Bluetooth printing first
      const savedPrinter = await ThermalPrinter.getSavedPrinter('bill');
      if (savedPrinter?.address) {
        try {
          await ThermalPrinter.connectPrinter(savedPrinter.address);
          await ThermalPrinter.printBill(bill, restName, sizeMm);
          return; // Success — silent print done
        } catch (btErr) {
          console.warn('[Print] Bluetooth bill print failed, falling back to system dialog:', btErr.message);
        }
      }

      // Fallback: system print dialog via RNPrint
      await printBillViaRNPrint(bill, bf, sizeMm);
    } catch (err) {
      Alert.alert('Error', 'Failed to print bill');
    }
  }, [activeOrder, billFormatData, user]);

  // Fallback HTML print for bill (when no Bluetooth printer configured)
  const printBillViaRNPrint = async (bill, bf, sizeMm) => {
    const restName = user?.restaurantName || '';
    const html = generateBillHtml(bill, restName, sizeMm);
    await RNPrint.print({ html, width: sizeMm * 2.83 });
  };

  // === PRINT KOT ===
  const handlePrintKOT = useCallback(async () => {
    if (!activeOrder?.id) return;
    try {
      const bf = billFormatData || {};
      const sizeMm = parseInt(bf.kot_printer_size_mm) || 80;
      const order = orderDetail || activeOrder;
      const kitchenItems = (order?.items || []).filter(i => i.status !== 'cancelled' && i.kot_sent === 1);
      if (!kitchenItems.length) { Alert.alert('Info', 'No KOT items to print'); return; }

      const tableLabel = order.table_number || activeOrder.table_number || '';
      const floorName = order.floor_name || activeOrder.floor_name || '';
      const orderNumber = order.order_number || activeOrder.order_number || '';
      const orderType = order.order_type || '';

      // Try direct Bluetooth printing first
      const savedPrinter = await ThermalPrinter.getSavedPrinter('kot');
      if (savedPrinter?.address) {
        try {
          await ThermalPrinter.connectPrinter(savedPrinter.address);
          await ThermalPrinter.printKOT(orderNumber, tableLabel, kitchenItems, orderType, floorName, sizeMm);
          return; // Success — silent print done
        } catch (btErr) {
          console.warn('[Print] Bluetooth KOT print failed, falling back to system dialog:', btErr.message);
        }
      }

      // Fallback: system print dialog via RNPrint
      const html = generateKotHtml(orderNumber, tableLabel, kitchenItems, orderType, floorName, sizeMm);
      await RNPrint.print({ html, width: sizeMm * 2.83 });
    } catch (err) {
      Alert.alert('Error', 'Failed to print KOT');
    }
  }, [activeOrder, orderDetail, billFormatData]);

  // === CUSTOMER SAVE ON BLUR ===
  const saveCustomerOnBlur = useCallback(() => {
    if (activeOrder?.id) {
      customerMut.mutate({
        orderId: activeOrder.id,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        deliveryAddress: deliveryAddress.trim() || undefined,
      });
    }
  }, [activeOrder, customerName, customerPhone, deliveryAddress]);

  // =============================================
  // RENDER: Orders List (default screen)
  // =============================================
  const renderOrderCard = useCallback(({ item: order }) => {
    const status = order.payment_status === 'paid' ? 'paid' : order.status;
    const total = order.total_amount || order.total || order.grand_total || order.subtotal || 0;
    const itemCount = order.item_count != null ? order.item_count : (order.items || order.order_items || []).length;
    return (
      <Card style={s.orderCard} onPress={() => openExistingOrder(order)}>
        <View style={s.orderCardTop}>
          <Text style={s.orderNum}>#{order.order_number}</Text>
          <Badge status={status || 'pending'} />
        </View>
        {(order.table_name || order.table_number) ? (
          <View style={s.orderInfoRow}>
            <Icon name="grid" size={12} color={colors.textSecondary} />
            <Text style={s.orderInfoText}>Table {order.table_name || order.table_number}</Text>
          </View>
        ) : null}
        <View style={s.orderInfoRow}>
          <Icon name={order.order_type === 'dine_in' ? 'home' : order.order_type === 'takeaway' ? 'shopping-bag' : 'truck'} size={12} color={colors.textSecondary} />
          <Text style={s.orderInfoText}>{capitalize(order.order_type?.replace('_', ' ') || 'dine in')}</Text>
        </View>
        <View style={s.orderCardBottom}>
          <Text style={s.orderItemCount}>{itemCount} item(s)</Text>
          <Text style={s.orderCardTotal}>{formatCurrency(total)}</Text>
        </View>
        <Text style={s.orderTime}>{timeAgo(order.created_at)}</Text>
      </Card>
    );
  }, [openExistingOrder]);

  const renderOrdersScreen = () => (
    <View style={s.container}>
      <Header
        title="POS / Billing"
        onMenu={navigation.openDrawer ? () => navigation.openDrawer() : undefined}
        rightComponent={
          <View style={s.headerActions}>
            {edineInEnabled && pendingQROrders.length > 0 && (
              <TouchableOpacity onPress={() => setShowQROrders(true)} style={s.headerBtn}>
                <Icon name="smartphone" size={20} color={colors.primary} />
                <View style={s.qrBadge}>
                  <Text style={s.qrBadgeText}>{pendingQROrders.length}</Text>
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => { refetchOrders(); refetchMenu(); refetchTables(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="refresh-cw" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        }
      />
      <FlatList
        data={orders}
        keyExtractor={item => String(item.id)}
        renderItem={renderOrderCard}
        contentContainerStyle={s.ordersList}
        numColumns={2}
        columnWrapperStyle={s.columnWrapper}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetchOrders} />}
        ListHeaderComponent={
          <>
            <View style={s.quickButtons}>
              {ORDER_TYPES.map(type => (
                <TouchableOpacity key={type.key} style={s.quickBtn} onPress={() => startNewOrder(type.key)} activeOpacity={0.7}>
                  <View style={s.quickBtnIcon}>
                    <Icon name={type.icon} size={22} color={colors.primary} />
                  </View>
                  <Text style={s.quickBtnLabel}>{type.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {orders.length > 0 && <Text style={s.sectionTitle}>Active Orders</Text>}
          </>
        }
        ListEmptyComponent={
          !ordersLoading ? (
            <View style={s.emptyState}>
              <Icon name="inbox" size={48} color={colors.textMuted} />
              <Text style={s.emptyTitle}>No active orders</Text>
              <Text style={s.emptyMsg}>Create a new order above</Text>
            </View>
          ) : null
        }
      />
    </View>
  );

  // =============================================
  // RENDER: Table Picker
  // =============================================
  const renderTablePicker = () => (
    <View style={s.container}>
      <Header title="Select Table" onBack={goBackToOrders} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
        {floorTabs.map(floor => {
          const isActive = selectedFloorId === floor.id;
          return (
            <TouchableOpacity key={floor.id || 'all'} style={[s.tab, isActive && s.tabActive]} onPress={() => setSelectedFloorId(floor.id)}>
              <Text style={[s.tabText, isActive && s.tabTextActive]}>{floor.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <FlatList
        data={filteredTables}
        keyExtractor={item => String(item.id)}
        numColumns={3}
        renderItem={({ item: table }) => {
          const isAvailable = table.status === 'available' || table.status === 'free' || table.status === 'cleaning';
          const isOccupied = table.status === 'occupied';
          const isReserved = table.status === 'reserved';
          const isClickable = isAvailable || isOccupied || isReserved;
          const sc = colors.status[table.status] || colors.status.available;
          const total = table.current_order_total || table.order_total;
          return (
            <TouchableOpacity
              style={[s.tableCard, { borderColor: sc.border, backgroundColor: sc.bg }]}
              onPress={() => isClickable && selectTable(table)}
              disabled={!isClickable}
              activeOpacity={0.7}
            >
              <Text style={[s.tableName, { color: sc.text }]}>
                {table.name || `T-${table.table_number}`}
              </Text>
              <Icon
                name={isAvailable ? 'check-circle' : isOccupied ? 'user' : isReserved ? 'calendar' : 'clock'}
                size={20} color={sc.text}
              />
              {isOccupied && total > 0 && (
                <Text style={[s.tableMetaText, { color: sc.text }]}>{formatCurrency(total)}</Text>
              )}
              {isReserved && table.reservation_customer && (
                <Text style={[s.tableMetaText, { color: sc.text }]} numberOfLines={1}>
                  {table.reservation_time?.toString().slice(0, 5)} · {table.reservation_customer}
                </Text>
              )}
              {table.table_pin && (
                <View style={s.tablePinRow}>
                  <Icon name="key" size={8} color={sc.text} />
                  <Text style={[s.tablePinText, { color: sc.text }]}>{table.table_pin}</Text>
                </View>
              )}
              <Text style={[s.tableCapacity, { color: sc.text }]}>{table.capacity || 4} seats</Text>
              <Text style={[s.tableStatus, { color: sc.text }]}>{capitalize(table.status || 'available')}</Text>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={s.tableGrid}
        columnWrapperStyle={s.tableColumnWrapper}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Icon name="grid" size={40} color={colors.textMuted} />
            <Text style={s.emptyTitle}>No tables found</Text>
          </View>
        }
      />
    </View>
  );

  // =============================================
  // RENDER: POS View
  // =============================================
  const renderMenuItem = useCallback(({ item }) => {
    const qty = getCartQty(item.id);
    const hasVariants = item.variants && item.variants.length > 0;
    const foodColor = item.item_type === 'veg' ? '#059669' : item.item_type === 'egg' ? '#D97706' : '#DC2626';
    const unavailable = isItemUnavailable(item);
    return (
      <TouchableOpacity
        style={[s.menuCard, qty > 0 && !unavailable && { borderColor: colors.primary, borderWidth: 1.5 }, unavailable && { opacity: 0.45 }]}
        onPress={() => !unavailable && handleItemClick(item)}
        activeOpacity={unavailable ? 1 : 0.7}
      >
        <View style={s.menuCardTop}>
          <View style={[s.vegBadge, { borderColor: foodColor }]}>
            <View style={[s.vegDot, { backgroundColor: foodColor }]} />
          </View>
          {unavailable ? (
            <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: colors.error }}>UNAVAILABLE</Text>
            </View>
          ) : qty > 0 ? (
            <View style={s.menuQtyBadge}>
              <Text style={s.menuQtyText}>{qty}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[s.menuCardName, unavailable && { color: colors.textMuted }]} numberOfLines={2}>{item.name}</Text>
        {hasVariants && (
          <Text style={s.menuCardVariants}>{item.variants.length} variant{item.variants.length > 1 ? 's' : ''}</Text>
        )}
        <View style={s.menuCardBottom}>
          <Text style={[s.menuCardPrice, unavailable && { color: colors.textMuted }]}>
            {hasVariants ? formatCurrency(Math.min(...item.variants.map(v => parseFloat(v.price)))) : formatCurrency(item.price)}
          </Text>
          {!unavailable && (
            <View style={s.menuAddBtn}>
              <Icon name="plus" size={16} color={colors.white} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [getCartQty, handleItemClick]);

  const renderPOSView = () => {
    const title = activeOrder ? `Order #${activeOrder.order_number}` : 'New Order';
    const subtitle = activeOrder
      ? `${capitalize(activeOrder.order_type?.replace('_', ' ') || '')}${activeOrder.table_name || activeOrder.table_number ? ` · Table ${activeOrder.table_name || activeOrder.table_number}` : ''}`
      : `${capitalize(orderType.replace('_', ' '))}${selectedTable ? ` · ${selectedTable.name || 'Table ' + selectedTable.table_number}` : ''}`;

    return (
      <View style={s.container}>
        <Header
          title={title}
          subtitle={subtitle}
          onBack={goBackToOrders}
          rightComponent={
            <View style={s.headerActions}>
              <TouchableOpacity onPress={() => setShowCustomerFields(v => !v)} style={s.headerBtn}>
                <Icon name="user" size={18} color={showCustomerFields ? colors.primary : colors.textSecondary} />
              </TouchableOpacity>
              {edineInEnabled && pendingQROrders.length > 0 && (
                <TouchableOpacity onPress={() => setShowQROrders(true)} style={s.headerBtn}>
                  <Icon name="smartphone" size={18} color={colors.info} />
                  <View style={s.qrBadgeSm}>
                    <Text style={s.qrBadgeSmText}>{pendingQROrders.length}</Text>
                  </View>
                </TouchableOpacity>
              )}
              {activeOrder && (
                <TouchableOpacity onPress={() => setShowCart(true)} style={s.headerBtn}>
                  <Icon name="file-text" size={18} color={colors.text} />
                </TouchableOpacity>
              )}
            </View>
          }
        />

        {/* Menu grid with customer bar, category tabs, and search as header */}
        <FlatList
          data={filteredMenuItems}
          keyExtractor={item => String(item.id)}
          numColumns={2}
          renderItem={renderMenuItem}
          contentContainerStyle={s.menuGrid}
          columnWrapperStyle={s.menuColumnWrapper}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              {/* Customer details — always show for delivery orders */}
              {(showCustomerFields || orderType === 'delivery' || activeOrder?.order_type === 'delivery') && (
                <View style={s.customerBar}>
                  <View style={s.customerRow}>
                    <View style={s.customerField}>
                      <Icon name="phone" size={14} color={colors.textMuted} style={s.customerIcon} />
                      <TextInput
                        style={s.customerInput}
                        value={customerPhone}
                        onChangeText={setCustomerPhone}
                        placeholder="Mobile"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="phone-pad"
                        maxLength={10}
                        onBlur={saveCustomerOnBlur}
                      />
                    </View>
                    <View style={s.customerField}>
                      <Icon name="user" size={14} color={colors.textMuted} style={s.customerIcon} />
                      <TextInput
                        style={s.customerInput}
                        value={customerName}
                        onChangeText={setCustomerName}
                        placeholder="Name"
                        placeholderTextColor={colors.textMuted}
                        onBlur={saveCustomerOnBlur}
                      />
                    </View>
                  </View>
                  {(orderType === 'delivery' || activeOrder?.order_type === 'delivery') && (
                    <View style={[s.customerField, { marginTop: spacing.xs }]}>
                      <Icon name="map-pin" size={14} color={colors.textMuted} style={s.customerIcon} />
                      <TextInput
                        style={s.customerInput}
                        value={deliveryAddress}
                        onChangeText={setDeliveryAddress}
                        placeholder="Delivery address"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        onBlur={saveCustomerOnBlur}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Category tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
                {categoryTabs.map(cat => {
                  const isActive = menuCategoryFilter === cat.id;
                  return (
                    <TouchableOpacity key={cat.id} style={[s.tab, isActive && s.tabActive]} onPress={() => setMenuCategoryFilter(cat.id)}>
                      <Text style={[s.tabText, isActive && s.tabTextActive]}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Search + hide unavailable toggle */}
              <View style={[s.searchWrap, { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }]}>
                <View style={{ flex: 1 }}>
                  <SearchBar value={menuSearch} onChangeText={setMenuSearch} placeholder="Search menu items..." />
                </View>
                <TouchableOpacity
                  onPress={() => setHideUnavailable(v => !v)}
                  style={{ width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: hideUnavailable ? colors.primary : colors.border, backgroundColor: hideUnavailable ? colors.primary : colors.white, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="eye-off" size={18} color={hideUnavailable ? colors.white : colors.textMuted} />
                </TouchableOpacity>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Icon name="search" size={32} color={colors.textMuted} />
              <Text style={s.emptyTitle}>No items found</Text>
            </View>
          }
        />

        {/* Sticky cart bar */}
        {(cartItemCount > 0 || (activeOrder && orderItems.length > 0)) && (
          <TouchableOpacity style={[s.cartBar, { paddingBottom: spacing.md + insets.bottom }]} onPress={() => setShowCart(true)} activeOpacity={0.8}>
            <View style={s.cartBarLeft}>
              <View style={s.cartBadge}>
                <Text style={s.cartBadgeText}>{cartItemCount + orderItems.length}</Text>
              </View>
              <Text style={s.cartBarText}>
                {cartItemCount > 0 ? `${cartItemCount} pending` : ''}
                {cartItemCount > 0 && orderItems.length > 0 ? ' · ' : ''}
                {orderItems.length > 0 ? `${orderItems.length} in order` : ''}
              </Text>
            </View>
            <View style={s.cartBarRight}>
              <Text style={s.cartBarTotal}>{formatCurrency(grandTotal)}</Text>
              <Icon name="chevron-up" size={20} color={colors.white} />
            </View>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // =============================================
  // RENDER: Cart / Order Detail Sheet
  // =============================================
  const renderCartSheet = () => {
    const allItems = activeOrder?.items || activeOrder?.order_items || [];
    const sentItems = allItems.filter(i => i.status !== 'cancelled');
    const cancelledItems = allItems.filter(i => i.status === 'cancelled');

    return (
      <BottomSheet visible={showCart} onClose={() => setShowCart(false)}>
            <View style={s.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>{activeOrder ? `Order #${activeOrder.order_number}` : 'New Order'}</Text>
                <Text style={s.sheetSubtitle}>
                  {capitalize(orderType.replace('_', ' '))}
                  {selectedTable ? ` · ${selectedTable.name || 'Table ' + selectedTable.table_number}` : ''}
                  {activeOrder?.table_name ? ` · Table ${activeOrder.table_name}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCart(false)} style={s.sheetClose}>
                <Icon name="x" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={s.sheetBody} showsVerticalScrollIndicator={false} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
              {/* Sent items with status badges and cancel button */}
              {sentItems.length > 0 && (
                <View style={s.cartSection}>
                  <Text style={s.cartSectionTitle}>Sent to Kitchen</Text>
                  {sentItems.map((item, idx) => {
                    const statusInfo = ITEM_STATUS_COLORS[item.status] || ITEM_STATUS_COLORS.pending;
                    const canCancel = item.kot_sent && item.status === 'pending';
                    const effectivePrice = parseFloat(item.price || item.item_price || 0) + parseFloat(item.addon_per_unit || 0);
                    return (
                      <View key={item.id || idx} style={s.cartItemRow}>
                        <View style={s.cartItemInfo}>
                          <Text style={s.cartItemName}>{item.name || item.menu_item_name || item.item_name}</Text>
                          {item.variant_name ? <Text style={s.cartItemMeta}>{item.variant_name}</Text> : null}
                          {item.addons_text ? <Text style={s.cartItemMeta}>+ {item.addons_text}</Text> : null}
                          <View style={[s.itemStatusBadge, { backgroundColor: statusInfo.bg }]}>
                            <Text style={[s.itemStatusText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
                          </View>
                        </View>
                        <Text style={s.cartItemQty}>×{item.quantity}</Text>
                        <Text style={s.cartItemPrice}>{formatCurrency(effectivePrice * (item.quantity || 1))}</Text>
                        {canCancel && (
                          <TouchableOpacity
                            onPress={() => cancelItemMut.mutate({ orderId: activeOrder.id, itemId: item.id })}
                            style={s.cancelItemBtn}
                          >
                            <Icon name="x-circle" size={16} color={colors.error} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Pending cart items */}
              {cart.length > 0 && (
                <View style={s.cartSection}>
                  <View style={s.pendingHeader}>
                    <Icon name="clock" size={14} color={colors.warning} />
                    <Text style={[s.cartSectionTitle, { color: colors.warning, marginBottom: 0, marginLeft: spacing.xs }]}>
                      New Items (KOT)
                    </Text>
                  </View>
                  {cart.map(item => (
                    <View key={item._key} style={s.cartItemRow}>
                      <View style={s.cartItemInfo}>
                        <Text style={s.cartItemName}>{item.name}</Text>
                        {item.variantName && <Text style={s.cartItemMeta}>{item.variantName}</Text>}
                        {item.addons.length > 0 && (
                          <Text style={s.cartItemMeta}>+ {item.addons.map(a => a.name).join(', ')}</Text>
                        )}
                        <Text style={s.cartItemPriceEach}>{formatCurrency(item.price)} each</Text>
                      </View>
                      <View style={s.cartQtyControls}>
                        <TouchableOpacity onPress={() => updateCartQty(item._key, -1)} style={s.cartQtyBtn}>
                          <Icon name="minus" size={14} color={colors.primary} />
                        </TouchableOpacity>
                        <Text style={s.cartQtyText}>{item.qty}</Text>
                        <TouchableOpacity onPress={() => updateCartQty(item._key, 1)} style={s.cartQtyBtn}>
                          <Icon name="plus" size={14} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                      <Text style={s.cartItemPrice}>{formatCurrency(item.price * item.qty)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Empty state */}
              {sentItems.length === 0 && cart.length === 0 && (
                <View style={s.cartEmpty}>
                  <Icon name="shopping-cart" size={40} color={colors.textMuted} />
                  <Text style={s.cartEmptyText}>No items yet</Text>
                  <Text style={s.cartEmptyHint}>Tap menu items to add them</Text>
                </View>
              )}

              {/* Adjustments */}
              {orderAdjustments.length > 0 && (
                <View style={s.cartSection}>
                  <Text style={s.cartSectionTitle}>Adjustments</Text>
                  {orderAdjustments.map((adj) => (
                    <View key={adj.id} style={s.cartItemRow}>
                      <View style={s.cartItemInfo}>
                        <Text style={s.cartItemName}>{adj.label}</Text>
                        <Text style={s.cartItemMeta}>
                          {capitalize(adj.adjustment_type)} · {adj.value_type === 'percentage' ? `${adj.value}%` : formatCurrency(adj.value)}
                        </Text>
                      </View>
                      <Text style={[s.cartItemPrice, { color: adj.adjustment_type === 'discount' ? colors.success : colors.text }]}>
                        {adj.adjustment_type === 'discount' ? '-' : '+'}{formatCurrency(adj.applied_amount)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => removeAdjMut.mutate({ orderId: activeOrder.id, adjId: adj.id })}
                        style={{ padding: 4, marginLeft: 4 }}
                      >
                        <Icon name="x" size={14} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Totals */}
              {(cart.length > 0 || sentItems.length > 0) && (
                <View style={s.cartTotals}>
                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>Subtotal</Text>
                    <Text style={s.totalValue}>{formatCurrency(orderSubtotal + cartTotal)}</Text>
                  </View>
                  {cartTotal > 0 && orderSubtotal > 0 && (
                    <View style={s.totalRow}>
                      <Text style={[s.totalLabel, { color: colors.warning, fontSize: 12 }]}>  (Pending: +{formatCurrency(cartTotal)})</Text>
                    </View>
                  )}
                  {orderAdjustments.map((adj) => (
                    <View key={adj.id} style={s.totalRow}>
                      <Text style={s.totalLabel}>{adj.label}{adj.value_type === 'percentage' ? ` (${adj.value}%)` : ''}</Text>
                      <Text style={[s.totalValue, { color: adj.adjustment_type === 'discount' ? colors.success : colors.text }]}>
                        {adj.adjustment_type === 'discount' ? '-' : '+'}{formatCurrency(adj.applied_amount)}
                      </Text>
                    </View>
                  ))}
                  {(orderTax > 0 || cartTaxEstimate > 0) && (
                    <>
                      <View style={s.totalRow}>
                        <Text style={s.totalLabel}>CGST{cart.length > 0 ? ' (Est.)' : ''}</Text>
                        <Text style={s.totalValue}>{formatCurrency((orderTax + cartTaxEstimate) / 2)}</Text>
                      </View>
                      <View style={s.totalRow}>
                        <Text style={s.totalLabel}>SGST{cart.length > 0 ? ' (Est.)' : ''}</Text>
                        <Text style={s.totalValue}>{formatCurrency((orderTax + cartTaxEstimate) / 2)}</Text>
                      </View>
                    </>
                  )}
                  {alreadyPaid > 0 && (
                    <View style={s.totalRow}>
                      <Text style={[s.totalLabel, { color: colors.success }]}>Paid</Text>
                      <Text style={[s.totalValue, { color: colors.success }]}>-{formatCurrency(alreadyPaid)}</Text>
                    </View>
                  )}
                  <View style={[s.totalRow, s.grandTotal]}>
                    <Text style={s.grandTotalLabel}>{alreadyPaid > 0 ? 'Balance Due' : 'Total'}</Text>
                    <Text style={s.grandTotalValue}>{formatCurrency(alreadyPaid > 0 ? remainingDue : grandTotal)}</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Actions */}
            <View style={s.cartActions}>
              {cart.length > 0 && (
                <Button
                  title={`Send to Kitchen (${cartItemCount} items)`}
                  onPress={handleSendToKitchen}
                  loading={addItemMut.isPending || sendingToKitchen}
                  fullWidth
                  icon={<Icon name="send" size={16} color={colors.white} />}
                  style={s.actionBtn}
                />
              )}
              {activeOrder && cart.length === 0 && (
                <>
                  {/* Row 1: E-bill + Charge */}
                  <View style={s.actionRow}>
                    <Button
                      title={ebillSending ? 'Sending...' : 'E-bill'}
                      onPress={handleSendEBill}
                      loading={ebillSending}
                      variant="secondary"
                      disabled={customerPhone.length < 10}
                      icon={<Icon name="send" size={14} color={customerPhone.length >= 10 ? colors.primary : colors.textMuted} />}
                      style={[s.actionBtn, { flex: 1 }]}
                      size="sm"
                    />
                    <Button
                      title={`Charge ${formatCurrency(remainingDue > 0 ? remainingDue : orderTotal)}`}
                      onPress={openPayModal}
                      icon={<Icon name="credit-card" size={14} color={colors.white} />}
                      style={[s.actionBtn, { flex: 1 }]}
                      size="sm"
                    />
                  </View>
                  {/* Row 2: Bill + Adjust */}
                  <View style={s.actionRow}>
                    <Button
                      title="Bill"
                      onPress={handleViewBill}
                      loading={billLoading}
                      variant="secondary"
                      icon={<Icon name="file-text" size={14} color={colors.primary} />}
                      style={[s.actionBtn, { flex: 1 }]}
                      size="sm"
                    />
                    <Button
                      title="Adjust"
                      onPress={() => { setShowCart(false); setShowAdjModal(true); }}
                      variant="secondary"
                      icon={<Icon name="sliders" size={14} color={colors.primary} />}
                      style={[s.actionBtn, { flex: 1 }]}
                      size="sm"
                    />
                  </View>
                  {/* Row 2b: Print Bill + Print KOT */}
                  <View style={s.actionRow}>
                    <TouchableOpacity
                      style={[s.actionBtnOutline, { borderColor: colors.textSecondary }]}
                      onPress={handlePrintBill}
                    >
                      <Icon name="printer" size={14} color={colors.textSecondary} />
                      <Text style={[s.actionBtnOutlineText, { color: colors.textSecondary }]}>Print Bill</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtnOutline, { borderColor: colors.textSecondary }]}
                      onPress={handlePrintKOT}
                    >
                      <Icon name="printer" size={14} color={colors.textSecondary} />
                      <Text style={[s.actionBtnOutlineText, { color: colors.textSecondary }]}>Print KOT</Text>
                    </TouchableOpacity>
                  </View>
                  {/* Row 3: Save + Close + Cancel */}
                  <View style={s.actionRow}>
                    <TouchableOpacity
                      style={[s.actionBtnOutline, { borderColor: colors.info }]}
                      onPress={() => { setShowCart(false); goBackToOrders(); }}
                    >
                      <Icon name="save" size={14} color={colors.info} />
                      <Text style={[s.actionBtnOutlineText, { color: colors.info }]}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtnOutline, { borderColor: colors.warning }]}
                      onPress={() => { setShowCart(false); setShowCloseConfirm(true); }}
                    >
                      <Icon name="check-square" size={14} color={colors.warning} />
                      <Text style={[s.actionBtnOutlineText, { color: colors.warning }]}>Close</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtnOutline, { borderColor: colors.error }]}
                      onPress={() => { setShowCart(false); setShowCancelConfirm(true); }}
                    >
                      <Icon name="x-circle" size={14} color={colors.error} />
                      <Text style={[s.actionBtnOutlineText, { color: colors.error }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
      </BottomSheet>
    );
  };

  // =============================================
  // RENDER: Variant/Addon Sheet
  // =============================================
  const renderVariantSheet = () => {
    if (!selectingItem) return null;
    const item = selectingItem;
    const hasVariants = item.variants && item.variants.length > 0;
    const hasAddons = item.addons && item.addons.length > 0;
    const selectedVariant = hasVariants ? item.variants.find(v => v.id === selectedVariantId) : null;
    const totalPrice = (selectedVariant ? parseFloat(selectedVariant.price) : parseFloat(item.price)) +
      selectedAddons.reduce((sum, a) => sum + parseFloat(a.price), 0);

    return (
      <BottomSheet visible={!!selectingItem} onClose={() => setSelectingItem(null)} maxHeight="70%">
            <View style={s.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>{item.name}</Text>
                <Text style={s.sheetSubtitle}>Customize your order</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectingItem(null)} style={s.sheetClose}>
                <Icon name="x" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.sheetBody} showsVerticalScrollIndicator={false} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
              {hasVariants && (
                <View style={s.optionSection}>
                  <Text style={s.optionTitle}>Select Variant <Text style={{ color: colors.error }}>*</Text></Text>
                  {item.variants.filter(v => v.is_available !== 0).map(v => (
                    <TouchableOpacity key={v.id} style={[s.optionRow, selectedVariantId === v.id && s.optionRowActive]} onPress={() => setSelectedVariantId(v.id)}>
                      <View style={[s.radioOuter, selectedVariantId === v.id && s.radioOuterActive]}>
                        {selectedVariantId === v.id && <View style={s.radioInner} />}
                      </View>
                      <Text style={s.optionName}>{v.name}</Text>
                      <Text style={s.optionPrice}>{formatCurrency(v.price)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {hasAddons && (
                <View style={s.optionSection}>
                  <Text style={s.optionTitle}>Add-ons (optional)</Text>
                  {item.addons.filter(a => a.is_available !== 0).map(a => {
                    const isChecked = selectedAddons.some(sa => sa.id === a.id);
                    return (
                      <TouchableOpacity key={a.id} style={[s.optionRow, isChecked && s.optionRowActive]} onPress={() => toggleAddon(a)}>
                        <View style={[s.checkbox, isChecked && s.checkboxActive]}>
                          {isChecked && <Icon name="check" size={12} color={colors.white} />}
                        </View>
                        <Text style={s.optionName}>{a.name}</Text>
                        <Text style={s.optionPrice}>+{formatCurrency(a.price)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
            <View style={s.sheetFooter}>
              <Button title={`Add to Cart · ${formatCurrency(totalPrice)}`} onPress={confirmVariantSelection} fullWidth icon={<Icon name="plus" size={16} color={colors.white} />} />
            </View>
      </BottomSheet>
    );
  };

  // =============================================
  // RENDER: Split Payment Modal
  // =============================================
  const renderPaymentModal = () => {
    const payNewTotal = addedPayments.reduce((s, p) => s + p.amount, 0);
    const payRemaining = Math.max(0, remainingDue - payNewTotal);
    const cashChange = payMode === 'cash' && parseFloat(payReceived || 0) > parseFloat(payAmount || 0)
      ? parseFloat(payReceived) - parseFloat(payAmount) : 0;

    return (
      <BottomSheet visible={showPayModal} onClose={() => setShowPayModal(false)} maxHeight="85%">
            <View style={s.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>Process Payment</Text>
                <Text style={s.sheetSubtitle}>Order #{activeOrder?.order_number}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPayModal(false)} style={s.sheetClose}>
                <Icon name="x" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={s.sheetBody} showsVerticalScrollIndicator={false} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
              {/* Payment breakdown */}
              <View style={s.payBreakdown}>
                <View style={s.payBreakdownRow}>
                  <Text style={s.payBreakdownLabel}>Order Total</Text>
                  <Text style={s.payBreakdownValue}>{formatCurrency(orderTotal)}</Text>
                </View>
                {alreadyPaid > 0 && (
                  <View style={s.payBreakdownRow}>
                    <Text style={[s.payBreakdownLabel, { color: colors.success }]}>Already Paid</Text>
                    <Text style={[s.payBreakdownValue, { color: colors.success }]}>-{formatCurrency(alreadyPaid)}</Text>
                  </View>
                )}
                {payNewTotal > 0 && (
                  <View style={s.payBreakdownRow}>
                    <Text style={[s.payBreakdownLabel, { color: colors.info }]}>Adding Now</Text>
                    <Text style={[s.payBreakdownValue, { color: colors.info }]}>-{formatCurrency(payNewTotal)}</Text>
                  </View>
                )}
                <View style={[s.payBreakdownRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs }]}>
                  <Text style={s.payBreakdownLabelBold}>Remaining</Text>
                  <Text style={[s.payBreakdownValueBold, { color: payRemaining === 0 ? colors.success : colors.primary }]}>
                    {formatCurrency(payRemaining)}
                  </Text>
                </View>
              </View>

              {/* Payment mode selector */}
              <Text style={s.payMethodLabel}>Payment Mode</Text>
              <View style={s.payMethods}>
                {PAYMENT_MODES.map(m => (
                  <TouchableOpacity key={m.value} style={[s.payMethodBtn, payMode === m.value && s.payMethodBtnActive]} onPress={() => setPayMode(m.value)}>
                    <Icon name={m.icon} size={18} color={payMode === m.value ? colors.white : colors.text} />
                    <Text style={[s.payMethodText, payMode === m.value && s.payMethodTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Amount input */}
              <Text style={s.payMethodLabel}>Amount</Text>
              <View style={s.payAmountRow}>
                <TextInput
                  style={[s.adjInput, { flex: 1 }]}
                  value={payAmount}
                  onChangeText={setPayAmount}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                />
                <TouchableOpacity style={s.maxBtn} onPress={() => setPayAmount(String(payRemaining))}>
                  <Text style={s.maxBtnText}>MAX</Text>
                </TouchableOpacity>
              </View>

              {/* Cash received (only for cash) */}
              {payMode === 'cash' && (
                <>
                  <Text style={s.payMethodLabel}>Cash Received</Text>
                  <TextInput
                    style={s.adjInput}
                    value={payReceived}
                    onChangeText={setPayReceived}
                    placeholder={payAmount || '0.00'}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                  {cashChange > 0 && (
                    <View style={s.changeBox}>
                      <Text style={s.changeLabel}>Return Change</Text>
                      <Text style={s.changeValue}>{formatCurrency(cashChange)}</Text>
                    </View>
                  )}
                </>
              )}

              {/* Add payment button */}
              <Button
                title="Add Payment"
                onPress={addPaymentLine}
                variant="secondary"
                fullWidth
                icon={<Icon name="plus" size={16} color={colors.primary} />}
                style={{ marginTop: spacing.base }}
                disabled={!payAmount || parseFloat(payAmount) <= 0}
              />

              {/* Payment lines added */}
              {addedPayments.length > 0 && (
                <View style={s.cartSection}>
                  <Text style={s.cartSectionTitle}>Payment Lines ({addedPayments.length})</Text>
                  {addedPayments.map((p, idx) => (
                    <View key={idx} style={s.payLineRow}>
                      <View style={s.payLineMode}>
                        <Text style={s.payLineModeText}>{capitalize(p.paymentMode)}</Text>
                      </View>
                      <Text style={s.payLineAmount}>{formatCurrency(p.amount)}</Text>
                      <TouchableOpacity onPress={() => removePaymentLine(idx)} style={{ padding: 4 }}>
                        <Icon name="x" size={16} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={s.sheetFooter}>
              <Button
                title={`Confirm Payment${addedPayments.length > 0 ? ` (${addedPayments.length})` : ''}`}
                onPress={handleConfirmPayment}
                loading={payOrderMut.isPending}
                fullWidth
                icon={<Icon name="check-circle" size={18} color={colors.white} />}
                disabled={addedPayments.length === 0}
              />
            </View>
      </BottomSheet>
    );
  };

  // =============================================
  // RENDER: Bill Preview Modal
  // =============================================
  const renderBillPreview = () => {
    const bill = billData;
    const order = bill?.order || bill;
    const billItems = bill?.items || order?.items || [];
    const billAdj = bill?.adjustments || order?.adjustments || [];
    const taxBreakdown = bill?.taxBreakdown || [];
    const bf = bill?.billFormat || {};

    return (
      <BottomSheet visible={showBillPreview} onClose={() => setShowBillPreview(false)} maxHeight="90%">
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Bill Preview</Text>
              <TouchableOpacity onPress={() => setShowBillPreview(false)} style={s.sheetClose}>
                <Icon name="x" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.sheetBody} showsVerticalScrollIndicator={false} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
              {billLoading ? (
                <View style={s.cartEmpty}><ActivityIndicator size="large" color={colors.primary} /></View>
              ) : bill ? (
                <View style={s.billContainer}>
                  {/* Restaurant header */}
                  {bf.show_restaurant_name !== false && (
                    <Text style={s.billRestaurantName}>{order.restaurant_name || 'Restaurant'}</Text>
                  )}
                  {bf.show_address !== false && order.restaurant_address && (
                    <Text style={s.billMeta}>{order.restaurant_address}</Text>
                  )}
                  {bf.show_contact !== false && order.restaurant_phone && (
                    <Text style={s.billMeta}>{order.restaurant_phone}</Text>
                  )}
                  {bf.show_gst !== false && order.gstin && (
                    <Text style={s.billMeta}>GSTIN: {order.gstin}</Text>
                  )}
                  {bf.custom_header && <Text style={s.billMeta}>{bf.custom_header}</Text>}

                  <View style={s.billDivider} />

                  {/* Order info */}
                  {order.bill_number && <Text style={s.billInfoText}>Bill #: {order.bill_number}</Text>}
                  <Text style={s.billInfoText}>Order #: {order.order_number}</Text>
                  {bf.show_table_number !== false && order.table_number && (
                    <Text style={s.billInfoText}>Table: {order.table_number}{order.floor_name ? ` (${order.floor_name})` : ''}</Text>
                  )}
                  {bf.show_waiter_name !== false && order.waiter_name && (
                    <Text style={s.billInfoText}>Waiter: {order.waiter_name}</Text>
                  )}
                  {bf.show_date_time !== false && (
                    <Text style={s.billInfoText}>{formatDateTime(order.created_at)}</Text>
                  )}
                  {bf.show_customer_details !== false && order.customer_name && (
                    <Text style={s.billInfoText}>Customer: {order.customer_name}{order.customer_phone ? ` (${order.customer_phone})` : ''}</Text>
                  )}
                  {order.delivery_address && (
                    <Text style={s.billInfoText}>Delivery: {order.delivery_address}</Text>
                  )}

                  <View style={s.billDivider} />

                  {/* Items */}
                  <View style={s.billItemHeader}>
                    <Text style={[s.billItemCol, { flex: 2 }]}>Item</Text>
                    <Text style={[s.billItemCol, { flex: 0.5, textAlign: 'center' }]}>Qty</Text>
                    <Text style={[s.billItemCol, { flex: 1, textAlign: 'right' }]}>Rate</Text>
                    <Text style={[s.billItemCol, { flex: 1, textAlign: 'right' }]}>Total</Text>
                  </View>
                  {billItems.map((item, idx) => {
                    const rate = parseFloat(item.price || item.item_price || 0) + parseFloat(item.addon_per_unit || 0);
                    return (
                      <View key={idx}>
                        <View style={s.billItemRow}>
                          <Text style={[s.billItemText, { flex: 2 }]} numberOfLines={2}>{item.name || item.item_name}</Text>
                          <Text style={[s.billItemText, { flex: 0.5, textAlign: 'center' }]}>{item.quantity}</Text>
                          <Text style={[s.billItemText, { flex: 1, textAlign: 'right' }]}>{formatCurrency(rate)}</Text>
                          <Text style={[s.billItemText, { flex: 1, textAlign: 'right' }]}>{formatCurrency(rate * item.quantity)}</Text>
                        </View>
                        {item.addons_text && (
                          <Text style={s.billAddonText}>  + {item.addons_text}</Text>
                        )}
                      </View>
                    );
                  })}

                  <View style={s.billDivider} />

                  {/* Totals */}
                  <View style={s.billTotalRow}>
                    <Text style={s.billTotalLabel}>Subtotal</Text>
                    <Text style={s.billTotalValue}>{formatCurrency(order.subtotal)}</Text>
                  </View>
                  {billAdj.map((adj, idx) => (
                    <View key={idx} style={s.billTotalRow}>
                      <Text style={s.billTotalLabel}>{adj.label}{adj.value_type === 'percentage' ? ` (${adj.value}%)` : ''}</Text>
                      <Text style={s.billTotalValue}>
                        {adj.adjustment_type === 'discount' ? '-' : '+'}{formatCurrency(adj.applied_amount)}
                      </Text>
                    </View>
                  ))}
                  {taxBreakdown.length > 0 ? (
                    taxBreakdown.map((t, idx) => (
                      <View key={idx} style={s.billTotalRow}>
                        <Text style={s.billTotalLabel}>{t.label}{t.rate ? ` (${t.rate}%)` : ''}</Text>
                        <Text style={s.billTotalValue}>{formatCurrency(t.taxAmount || t.amount || 0)}</Text>
                      </View>
                    ))
                  ) : order.tax_amount > 0 ? (
                    <>
                      <View style={s.billTotalRow}>
                        <Text style={s.billTotalLabel}>CGST</Text>
                        <Text style={s.billTotalValue}>{formatCurrency(parseFloat(order.tax_amount) / 2)}</Text>
                      </View>
                      <View style={s.billTotalRow}>
                        <Text style={s.billTotalLabel}>SGST</Text>
                        <Text style={s.billTotalValue}>{formatCurrency(parseFloat(order.tax_amount) / 2)}</Text>
                      </View>
                    </>
                  ) : null}
                  <View style={[s.billTotalRow, { borderTopWidth: 1, borderTopColor: colors.text, paddingTop: spacing.sm, marginTop: spacing.xs }]}>
                    <Text style={s.billGrandLabel}>Total</Text>
                    <Text style={s.billGrandValue}>{formatCurrency(order.total_amount || order.grand_total)}</Text>
                  </View>
                  {bf.show_payment_mode !== false && order.payment_mode && (
                    <Text style={[s.billMeta, { marginTop: spacing.sm }]}>Payment: {capitalize(order.payment_mode)}</Text>
                  )}

                  {bf.custom_footer && (
                    <Text style={[s.billMeta, { marginTop: spacing.md }]}>{bf.custom_footer}</Text>
                  )}
                  {bf.thank_you_message && (
                    <Text style={[s.billMeta, { marginTop: spacing.sm, fontStyle: 'italic' }]}>{bf.thank_you_message}</Text>
                  )}
                </View>
              ) : (
                <View style={s.cartEmpty}><Text style={s.cartEmptyText}>No bill data</Text></View>
              )}
            </ScrollView>
      </BottomSheet>
    );
  };

  // =============================================
  // RENDER: QR Orders Modal
  // =============================================
  const renderQROrdersModal = () => (
    <BottomSheet visible={showQROrders} onClose={() => setShowQROrders(false)} maxHeight="85%">
          <View style={s.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>QR Orders</Text>
              <Text style={s.sheetSubtitle}>{pendingQROrders.length} pending</Text>
            </View>
            <TouchableOpacity onPress={() => setShowQROrders(false)} style={s.sheetClose}>
              <Icon name="x" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.sheetBody} showsVerticalScrollIndicator={false} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
            {pendingQROrders.length === 0 ? (
              <View style={s.cartEmpty}>
                <Icon name="smartphone" size={40} color={colors.textMuted} />
                <Text style={s.cartEmptyText}>No pending QR orders</Text>
              </View>
            ) : (
              pendingQROrders.map((qo) => {
                const items = typeof qo.items === 'string' ? JSON.parse(qo.items) : (qo.items || []);
                return (
                  <View key={qo.id} style={s.qrOrderCard}>
                    <View style={s.qrOrderHeader}>
                      <View style={s.qrOrderTableBadge}>
                        <Text style={s.qrOrderTableText}>
                          Table {qo.table_number || '?'}{qo.floor_name ? ` · ${qo.floor_name}` : ''}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <View style={[s.qrPayBadge, { backgroundColor: qo.payment_preference === 'online' ? '#DBEAFE' : '#FEF3C7' }]}>
                          <Text style={[s.qrPayBadgeText, { color: qo.payment_preference === 'online' ? '#1D4ED8' : '#92400E' }]}>
                            {qo.payment_preference === 'online' ? 'Paid Online' : 'Pay at Counter'}
                          </Text>
                        </View>
                        <Text style={s.qrOrderTime}>{timeAgo(qo.created_at)}</Text>
                      </View>
                    </View>
                    {(qo.customer_name || qo.customer_phone) && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                        {qo.customer_name ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Icon name="user" size={11} color={colors.textMuted} />
                            <Text style={s.qrOrderCustomer}>{qo.customer_name}</Text>
                          </View>
                        ) : null}
                        {qo.customer_phone ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Icon name="phone" size={11} color={colors.textMuted} />
                            <Text style={s.qrOrderCustomer}>{qo.customer_phone}</Text>
                          </View>
                        ) : null}
                      </View>
                    )}
                    <View style={s.qrItemsList}>
                      {items.map((item, idx) => {
                        const itemName = item.itemName || item.name || item.item_name;
                        const itemPrice = parseFloat(item.itemPrice || item.price || 0);
                        const addonPerUnit = parseFloat(item.addonPerUnit || item.addon_per_unit || 0);
                        const addons = item.addonDetails || item.addons || [];
                        return (
                          <View key={idx} style={s.qrOrderItem}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.qrOrderItemName}>
                                <Text style={{ color: colors.primary, fontWeight: '700' }}>{item.quantity}× </Text>
                                {itemName}
                              </Text>
                              {addons.length > 0 && (
                                <Text style={s.qrOrderItemAddons}>
                                  {addons.map(a => a.name || a.addonName).join(', ')}
                                </Text>
                              )}
                            </View>
                            <Text style={s.qrOrderItemPrice}>
                              {formatCurrency((itemPrice + addonPerUnit) * item.quantity)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    {qo.special_instructions && (
                      <View style={s.qrNotesRow}>
                        <Icon name="message-square" size={12} color={colors.textMuted} />
                        <Text style={s.qrOrderNotes}>{qo.special_instructions}</Text>
                      </View>
                    )}
                    <View style={[s.actionRow, { marginTop: spacing.md }]}>
                      <Button
                        title="Reject"
                        onPress={() => rejectQRMut.mutate(qo.id)}
                        loading={rejectQRMut.isPending}
                        variant="secondary"
                        icon={<Icon name="x-circle" size={14} color={colors.error} />}
                        style={{ flex: 1 }}
                        size="sm"
                      />
                      <Button
                        title="Accept & Send to Kitchen"
                        onPress={() => acceptQRMut.mutate(qo.id)}
                        loading={acceptQRMut.isPending}
                        icon={<Icon name="check" size={14} color={colors.white} />}
                        style={{ flex: 2, backgroundColor: '#059669' }}
                        size="sm"
                      />
                    </View>
                  </View>
                );
              }))
            }
          </ScrollView>
    </BottomSheet>
  );

  // =============================================
  // RENDER: Adjustment Modal
  // =============================================
  const renderAdjustmentModal = () => (
    <BottomSheet visible={showAdjModal} onClose={() => setShowAdjModal(false)} maxHeight="70%">
          <View style={s.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>Add Adjustment</Text>
              <Text style={s.sheetSubtitle}>Order #{activeOrder?.order_number}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowAdjModal(false)} style={s.sheetClose}>
              <Icon name="x" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.sheetBody} showsVerticalScrollIndicator={false} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
            <Text style={s.adjSectionLabel}>Quick Add</Text>
            <View style={s.adjPresets}>
              {[
                { label: 'Service Charge 10%', type: 'charge', value: '10', isPercentage: true },
                { label: 'GST 5%', type: 'tax', value: '5', isPercentage: true },
                { label: 'Discount 10%', type: 'discount', value: '10', isPercentage: true },
                { label: 'Packing ₹20', type: 'charge', value: '20', isPercentage: false },
              ].map(p => (
                <TouchableOpacity key={p.label} style={s.adjPresetBtn} onPress={() => setAdjForm(p)}>
                  <Text style={s.adjPresetText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.adjSectionLabel}>Label</Text>
            <TextInput
              style={s.adjInput}
              value={adjForm.label}
              onChangeText={v => setAdjForm(f => ({ ...f, label: v }))}
              placeholder="e.g. Service Charge, Discount"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={s.adjSectionLabel}>Type</Text>
            <View style={s.adjTypeRow}>
              {['discount', 'charge', 'tax'].map(t => (
                <TouchableOpacity key={t} style={[s.adjTypeBtn, adjForm.type === t && s.adjTypeBtnActive]} onPress={() => setAdjForm(f => ({ ...f, type: t }))}>
                  <Text style={[s.adjTypeText, adjForm.type === t && s.adjTypeTextActive]}>{capitalize(t)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.adjSectionLabel}>{adjForm.isPercentage ? 'Percentage (%)' : 'Amount (₹)'}</Text>
            <View style={s.adjValueRow}>
              <TextInput
                style={[s.adjInput, { flex: 1 }]}
                value={adjForm.value}
                onChangeText={v => setAdjForm(f => ({ ...f, value: v }))}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
              <TouchableOpacity style={[s.adjToggleBtn, adjForm.isPercentage && s.adjToggleBtnActive]} onPress={() => setAdjForm(f => ({ ...f, isPercentage: true }))}>
                <Text style={[s.adjToggleText, adjForm.isPercentage && s.adjToggleTextActive]}>%</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.adjToggleBtn, !adjForm.isPercentage && s.adjToggleBtnActive]} onPress={() => setAdjForm(f => ({ ...f, isPercentage: false }))}>
                <Text style={[s.adjToggleText, !adjForm.isPercentage && s.adjToggleTextActive]}>₹</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          <View style={s.sheetFooter}>
            <Button
              title="Add Adjustment"
              onPress={() => {
                if (!adjForm.label.trim()) { Alert.alert('Required', 'Enter a label'); return; }
                if (!adjForm.value || isNaN(parseFloat(adjForm.value))) { Alert.alert('Required', 'Enter a valid value'); return; }
                addAdjMut.mutate({
                  orderId: activeOrder.id,
                  label: adjForm.label.trim(),
                  type: adjForm.type,
                  value: parseFloat(adjForm.value),
                  isPercentage: adjForm.isPercentage,
                });
              }}
              loading={addAdjMut.isPending}
              fullWidth
              icon={<Icon name="plus" size={16} color={colors.white} />}
            />
          </View>
    </BottomSheet>
  );

  // =============================================
  // MAIN RENDER
  // =============================================
  if (ordersLoading && screen === 'orders') {
    return (
      <View style={s.container}>
        <Header title="POS / Billing" onMenu={navigation.openDrawer ? () => navigation.openDrawer() : undefined} />
        <LoadingSpinner fullScreen />
      </View>
    );
  }

  return (
    <>
      {screen === 'orders' && renderOrdersScreen()}
      {screen === 'table_picker' && renderTablePicker()}
      {screen === 'pos_view' && renderPOSView()}

      {renderCartSheet()}
      {renderVariantSheet()}
      {renderPaymentModal()}
      {renderBillPreview()}
      {renderQROrdersModal()}
      {renderAdjustmentModal()}

      <ConfirmModal
        visible={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        onConfirm={() => closeOrderMut.mutate(activeOrder.id)}
        title="Close Order"
        message={`Mark Order #${activeOrder?.order_number || ''} as closed and completed? No further items or adjustments can be added after closing.`}
        confirmText="Close Order"
        confirmVariant="warning"
        loading={closeOrderMut.isPending}
      />

      <ConfirmModal
        visible={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={() => cancelOrderMut.mutate(activeOrder.id)}
        title="Cancel Order"
        message={`Are you sure you want to cancel Order #${activeOrder?.order_number || ''}? This action cannot be undone.`}
        confirmText="Cancel Order"
        confirmVariant="danger"
        loading={cancelOrderMut.isPending}
      />
    </>
  );
}

// =============================================
// STYLES
// =============================================
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  // Orders screen
  ordersList: { padding: spacing.base, paddingBottom: 40 },
  columnWrapper: { justifyContent: 'space-between' },
  quickButtons: { flexDirection: 'row', marginBottom: spacing.lg, gap: spacing.md },
  quickBtn: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.lg,
    paddingVertical: spacing.base, alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3,
  },
  quickBtnIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm,
  },
  quickBtnLabel: { ...typography.captionBold, color: colors.text },
  sectionTitle: { ...typography.h4, color: colors.text, marginBottom: spacing.md },
  orderCard: { width: '48.5%', marginBottom: spacing.md },
  orderCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.xs, flexWrap: 'wrap' },
  orderNum: { ...typography.bodyBold, color: colors.text, flexShrink: 1 },
  orderInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  orderInfoText: { ...typography.caption, color: colors.textSecondary, marginLeft: spacing.xs },
  orderCardBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: spacing.sm, marginTop: spacing.sm,
  },
  orderItemCount: { ...typography.caption, color: colors.textSecondary },
  orderCardTotal: { ...typography.bodyBold, color: colors.primary },
  orderTime: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.xs },
  emptyState: { alignItems: 'center', paddingVertical: spacing['3xl'] },
  emptyTitle: { ...typography.h4, color: colors.text, marginTop: spacing.base },
  emptyMsg: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },

  // Tab bar
  tabBar: { maxHeight: 48, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBarContent: { paddingHorizontal: spacing.base, gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.xs },
  tab: {
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: radius.full,
    backgroundColor: colors.surfaceDark, borderWidth: 1, borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.captionBold, color: colors.textSecondary },
  tabTextActive: { color: colors.white },

  // Table picker
  tableGrid: { padding: spacing.base },
  tableColumnWrapper: { justifyContent: 'flex-start', gap: spacing.md },
  tableCard: {
    width: TABLE_CARD_W, aspectRatio: 1, borderRadius: radius.lg, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md, padding: spacing.sm,
  },
  tableName: { ...typography.bodyBold, marginBottom: spacing.xs },
  tableMetaText: { ...typography.tiny, marginTop: 2, textAlign: 'center' },
  tablePinRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2, opacity: 0.8 },
  tablePinText: { fontFamily: 'monospace', fontSize: 9, fontWeight: '700', letterSpacing: 2 },
  tableCapacity: { ...typography.tiny, marginTop: spacing.xs },
  tableStatus: { ...typography.tiny, fontWeight: '600', marginTop: 2 },

  // Header
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerBtn: { padding: spacing.xs, position: 'relative' },
  qrBadge: {
    position: 'absolute', top: -4, right: -6, backgroundColor: colors.error,
    borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  qrBadgeText: { ...typography.tiny, color: colors.white, fontWeight: '700', fontSize: 10 },
  qrBadgeSm: {
    position: 'absolute', top: -2, right: -4, backgroundColor: colors.error,
    borderRadius: 8, minWidth: 14, height: 14, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2,
  },
  qrBadgeSmText: { fontSize: 8, color: colors.white, fontWeight: '700' },

  // Customer
  customerBar: {
    backgroundColor: colors.white, paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  customerRow: { flexDirection: 'row', gap: spacing.sm },
  customerField: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm,
  },
  customerIcon: { marginRight: spacing.xs },
  customerInput: { flex: 1, ...typography.caption, color: colors.text, paddingVertical: spacing.sm },
  searchWrap: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm, backgroundColor: colors.white },
  menuGrid: { paddingBottom: 100, paddingTop: spacing.sm },
  menuColumnWrapper: { justifyContent: 'space-between', paddingHorizontal: spacing.base },

  // Menu cards
  menuCard: {
    width: MENU_CARD_W, backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3,
  },
  menuCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  vegBadge: { width: 16, height: 16, borderWidth: 1.5, borderRadius: 3, justifyContent: 'center', alignItems: 'center' },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  menuQtyBadge: {
    backgroundColor: colors.primary, borderRadius: radius.full, minWidth: 22, height: 22,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  menuQtyText: { ...typography.tiny, color: colors.white, fontWeight: '700' },
  menuCardName: { ...typography.bodyBold, color: colors.text, marginBottom: spacing.xs, minHeight: 36 },
  menuCardVariants: { ...typography.tiny, color: colors.info, marginBottom: spacing.xs },
  menuCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  menuCardPrice: { ...typography.captionBold, color: colors.primary },
  menuAddBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },

  // Cart bar
  cartBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.2, shadowRadius: 6,
  },
  cartBarLeft: { flexDirection: 'row', alignItems: 'center' },
  cartBadge: {
    backgroundColor: colors.white, borderRadius: radius.full, minWidth: 24, height: 24,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, marginRight: spacing.sm,
  },
  cartBadgeText: { ...typography.captionBold, color: colors.primary },
  cartBarText: { ...typography.caption, color: 'rgba(255,255,255,0.85)' },
  cartBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cartBarTotal: { ...typography.h4, color: colors.white },

  // Sheets
  sheetRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetBackdropTouch: { flex: 1 },
  sheetContainer: {
    backgroundColor: colors.white, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
    maxHeight: '85%', overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetTitle: { ...typography.h3, color: colors.text },
  sheetSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  sheetClose: { padding: spacing.xs },
  sheetBody: { paddingHorizontal: spacing.xl },
  sheetFooter: {
    paddingHorizontal: spacing.xl, paddingVertical: spacing.base,
    borderTopWidth: 1, borderTopColor: colors.border,
  },

  // Cart section
  cartSection: { marginTop: spacing.base },
  cartSectionTitle: {
    ...typography.captionBold, color: colors.text,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm,
  },
  pendingHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  cartItemRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  cartItemInfo: { flex: 1 },
  cartItemName: { ...typography.bodyBold, color: colors.text },
  cartItemMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  cartItemPriceEach: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  cartItemQty: { ...typography.bodyBold, color: colors.textSecondary, marginHorizontal: spacing.md },
  cartItemPrice: { ...typography.bodyBold, color: colors.text, minWidth: 70, textAlign: 'right' },
  cartQtyControls: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.sm },
  cartQtyBtn: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  cartQtyText: { ...typography.bodyBold, color: colors.text, minWidth: 28, textAlign: 'center' },
  cartEmpty: { alignItems: 'center', paddingVertical: spacing['3xl'] },
  cartEmptyText: { ...typography.body, color: colors.textMuted, marginTop: spacing.md },
  cartEmptyHint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  cartTotals: { marginTop: spacing.base, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, marginBottom: spacing.base },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  totalLabel: { ...typography.body, color: colors.textSecondary },
  totalValue: { ...typography.body, color: colors.text },
  grandTotal: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs, paddingTop: spacing.sm },
  grandTotalLabel: { ...typography.h4, color: colors.text },
  grandTotalValue: { ...typography.h4, color: colors.primary },
  cartActions: { paddingHorizontal: spacing.xl, paddingVertical: spacing.base, borderTopWidth: 1, borderTopColor: colors.border },
  actionBtn: { marginBottom: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  actionBtnOutline: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, gap: spacing.xs, borderRadius: radius.md,
    borderWidth: 1.5,
  },
  actionBtnOutlineText: { ...typography.captionBold },

  // Item status badge
  itemStatusBadge: { marginTop: 4, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm, alignSelf: 'flex-start' },
  itemStatusText: { fontSize: 10, fontWeight: '600' },
  cancelItemBtn: { padding: 6, marginLeft: 4 },

  // Variant/Addon
  optionSection: { marginTop: spacing.base, marginBottom: spacing.sm },
  optionTitle: { ...typography.bodyBold, color: colors.text, marginBottom: spacing.md },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.md, marginBottom: spacing.sm, backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.border,
  },
  optionRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  radioOuterActive: { borderColor: colors.primary },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionName: { ...typography.body, color: colors.text, flex: 1 },
  optionPrice: { ...typography.bodyBold, color: colors.primary, marginLeft: spacing.sm },

  // Payment modal
  payBreakdown: {
    backgroundColor: colors.primaryLight, borderRadius: radius.lg, padding: spacing.base, marginBottom: spacing.base, marginTop: spacing.md,
  },
  payBreakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  payBreakdownLabel: { ...typography.body, color: colors.text },
  payBreakdownValue: { ...typography.bodyBold, color: colors.text },
  payBreakdownLabelBold: { ...typography.bodyBold, color: colors.text },
  payBreakdownValueBold: { ...typography.h4 },
  payMethodLabel: { ...typography.captionBold, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.base },
  payMethods: { flexDirection: 'row', gap: spacing.sm },
  payMethodBtn: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, gap: spacing.xs,
  },
  payMethodBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  payMethodText: { ...typography.tiny, color: colors.text, fontWeight: '600' },
  payMethodTextActive: { color: colors.white },
  payAmountRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  maxBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary,
  },
  maxBtnText: { ...typography.captionBold, color: colors.primary },
  changeBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.successBg, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm,
  },
  changeLabel: { ...typography.caption, color: colors.success },
  changeValue: { ...typography.bodyBold, color: colors.success },
  payLineRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  payLineMode: {
    backgroundColor: colors.primaryLight, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.sm, marginRight: spacing.md,
  },
  payLineModeText: { ...typography.captionBold, color: colors.primary },
  payLineAmount: { ...typography.bodyBold, color: colors.text, flex: 1 },

  // Bill preview
  billContainer: { paddingVertical: spacing.base },
  billRestaurantName: { ...typography.h3, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  billMeta: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  billDivider: { borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: colors.border, marginVertical: spacing.md },
  billInfoText: { ...typography.caption, color: colors.text, marginBottom: 2 },
  billItemHeader: { flexDirection: 'row', paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  billItemCol: { ...typography.captionBold, color: colors.textSecondary },
  billItemRow: { flexDirection: 'row', paddingVertical: spacing.xs },
  billItemText: { ...typography.caption, color: colors.text },
  billAddonText: { ...typography.tiny, color: colors.textSecondary, marginLeft: spacing.sm, marginBottom: 2 },
  billTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  billTotalLabel: { ...typography.body, color: colors.textSecondary },
  billTotalValue: { ...typography.body, color: colors.text },
  billGrandLabel: { ...typography.h4, color: colors.text },
  billGrandValue: { ...typography.h4, color: colors.primary },

  // QR Orders
  qrPayBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  qrPayBadgeText: { fontSize: 10, fontWeight: '700' },
  qrItemsList: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.xs },
  qrOrderItemAddons: { ...typography.tiny, color: colors.textMuted, marginTop: 1 },
  qrNotesRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginTop: spacing.xs },
  qrOrderCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.base,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  qrOrderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  qrOrderTableBadge: { backgroundColor: colors.infoBg, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.sm },
  qrOrderTableText: { ...typography.captionBold, color: colors.info },
  qrOrderTime: { ...typography.caption, color: colors.textSecondary },
  qrOrderCustomer: { ...typography.caption, color: colors.textSecondary },
  qrOrderItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  qrOrderItemName: { ...typography.caption, color: colors.text },
  qrOrderItemPrice: { ...typography.captionBold, color: colors.text, marginLeft: spacing.sm },
  qrOrderNotes: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic', flex: 1 },

  // Adjustment modal
  adjSectionLabel: { ...typography.captionBold, color: colors.text, marginTop: spacing.base, marginBottom: spacing.sm },
  adjPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  adjPresetBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  adjPresetText: { ...typography.caption, color: colors.textSecondary },
  adjInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, ...typography.body, color: colors.text,
  },
  adjTypeRow: { flexDirection: 'row', gap: spacing.sm },
  adjTypeBtn: {
    flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
  },
  adjTypeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  adjTypeText: { ...typography.captionBold, color: colors.textSecondary },
  adjTypeTextActive: { color: colors.white },
  adjValueRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  adjToggleBtn: {
    width: 44, height: 44, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
  },
  adjToggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  adjToggleText: { ...typography.bodyBold, color: colors.textSecondary },
  adjToggleTextActive: { color: colors.white },
});
