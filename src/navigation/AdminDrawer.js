import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert } from 'react-native';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useAuth } from '../hooks/useAuth';
import { colors, typography, spacing } from '../theme';

// Import all screens
import DashboardScreen from '../screens/admin/DashboardScreen';
import POSDashboardScreen from '../screens/pos/POSDashboardScreen';
import TableMapScreen from '../screens/pos/TableMapScreen';
import OrdersListScreen from '../screens/pos/OrdersListScreen';
import MenuScreen from '../screens/admin/MenuScreen';
import FloorScreen from '../screens/admin/FloorScreen';
import ReservationsScreen from '../screens/admin/ReservationsScreen';
import InventoryScreen from '../screens/admin/InventoryScreen';
import ExpensesScreen from '../screens/admin/ExpensesScreen';
import EmployeesScreen from '../screens/admin/EmployeesScreen';
import CustomersScreen from '../screens/admin/CustomersScreen';
import StaffScreen from '../screens/admin/StaffScreen';
import QROrdersScreen from '../screens/admin/QROrdersScreen';
import SubscriptionScreen from '../screens/admin/SubscriptionScreen';
import SettingsScreen from '../screens/admin/SettingsScreen';
import KDSScreen from '../screens/kitchen/KDSScreen';

const Drawer = createDrawerNavigator();

// Map drawer keys to plan feature flags
const FEATURE_MAP = {
  reservations: 'feature_reservations',
  inventory: 'feature_inventory',
  expenses: 'feature_expense_management',
  employees: 'feature_employee_management',
  kds: 'feature_kds',
  qr_orders: 'feature_edine_in_orders',
};

// All possible drawer screens with their access keys
const ALL_SCREENS = [
  { name: 'Dashboard',      key: 'dashboard',    icon: 'home',          component: DashboardScreen },
  { name: 'POS / Billing',  key: 'pos',          icon: 'shopping-cart', component: POSDashboardScreen },
  { name: 'Table Map',      key: 'tables',       icon: 'grid',         component: TableMapScreen },
  { name: 'Orders',         key: 'orders',       icon: 'list',         component: OrdersListScreen },
  { name: 'QR Orders',      key: 'qr_orders',    icon: 'smartphone',   component: QROrdersScreen },
  { name: 'Menu',           key: 'menu',         icon: 'book-open',    component: MenuScreen },
  { name: 'Floors & Tables',key: 'floor',        icon: 'layers',       component: FloorScreen },
  { name: 'Reservations',   key: 'reservations', icon: 'calendar',     component: ReservationsScreen },
  { name: 'Inventory',      key: 'inventory',    icon: 'package',      component: InventoryScreen },
  { name: 'Expenses',       key: 'expenses',     icon: 'credit-card',  component: ExpensesScreen },
  { name: 'Employees',      key: 'employees',    icon: 'users',        component: EmployeesScreen },
  { name: 'Customers',      key: 'customers',    icon: 'user-check',   component: CustomersScreen },
  { name: 'Staff',          key: 'staff',        icon: 'user-plus',    component: StaffScreen },
  { name: 'KDS',            key: 'kds',          icon: 'monitor',      component: KDSScreen },
  { name: 'Subscription',   key: 'subscription', icon: 'award',        component: SubscriptionScreen },
  { name: 'Settings',       key: 'settings',     icon: 'settings',     component: SettingsScreen },
];

function CustomDrawerContent(props) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={[styles.drawerContainer, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[styles.drawerHeader, { paddingTop: insets.top + 16 }]}>
        <View style={styles.logoContainer}>
          <Image source={require('../assets/icon.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <View style={styles.headerTextContainer}>
          <Text style={styles.restaurantName} numberOfLines={1}>{user?.restaurantName || 'FineDyn'}</Text>
          <Text style={styles.userName} numberOfLines={1}>{user?.name} · {user?.role?.replace('_', ' ')}</Text>
        </View>
      </View>

      {/* Menu Items */}
      <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerScroll}>
        <DrawerItemList {...props} />
      </DrawerContentScrollView>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Icon name="log-out" size={18} color={colors.error} />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const drawerScreenOptions = {
  headerShown: false,
  drawerActiveBackgroundColor: 'rgba(200, 16, 46, 0.15)',
  drawerActiveTintColor: colors.primary,
  drawerInactiveTintColor: '#94A3B8',
  drawerLabelStyle: { fontSize: 13.5, fontWeight: '500', marginLeft: -16 },
  drawerItemStyle: { borderRadius: 10, marginHorizontal: 8, marginVertical: 1, paddingVertical: 0 },
  drawerStyle: { backgroundColor: colors.sidebar, width: 270 },
};

function makeIcon(name) {
  return ({ color, size }) => <Icon name={name} size={size - 3} color={color} />;
}

function withSafeArea(WrappedComponent) {
  return function SafeScreen(props) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['left', 'right', 'bottom']}>
        <WrappedComponent {...props} />
      </SafeAreaView>
    );
  };
}

export default function AdminDrawer() {
  const { hasFeature, hasAccess, isQR } = useAuth();

  const visibleScreens = useMemo(() => {
    return ALL_SCREENS.filter((screen) => {
      // QR Orders screen only visible for QR Ordering plan restaurants
      if (screen.key === 'qr_orders' && !isQR) return false;

      // Hide POS-specific screens for QR Ordering model restaurants
      const qrHiddenKeys = ['pos', 'tables', 'orders', 'customers'];
      if (isQR && qrHiddenKeys.includes(screen.key)) return false;

      // 1. Check plan feature gate
      const featureKey = FEATURE_MAP[screen.key];
      if (featureKey && !hasFeature(featureKey)) return false;

      // 2. Check user section access
      if (!hasAccess(screen.key)) return false;

      return true;
    });
  }, [hasFeature, hasAccess, isQR]);

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={drawerScreenOptions}
    >
      {visibleScreens.map((screen) => (
        <Drawer.Screen
          key={screen.key}
          name={screen.name}
          component={withSafeArea(screen.component)}
          options={{ drawerIcon: makeIcon(screen.icon) }}
        />
      ))}
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  drawerContainer: { flex: 1, backgroundColor: colors.sidebar },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  logoContainer: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  logo: { width: 32, height: 32 },
  headerTextContainer: { flex: 1, marginLeft: 12 },
  restaurantName: { color: colors.white, fontSize: 15, fontWeight: '700' },
  userName: { color: '#94A3B8', fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  drawerScroll: { paddingTop: 8 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  logoutText: { color: colors.error, fontSize: 14, fontWeight: '500', marginLeft: 12 },
});
