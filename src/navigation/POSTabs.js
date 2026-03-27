import React, { useMemo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useAuth } from '../hooks/useAuth';
import POSDashboardScreen from '../screens/pos/POSDashboardScreen';
import TableMapScreen from '../screens/pos/TableMapScreen';
import OrdersListScreen from '../screens/pos/OrdersListScreen';
import KDSScreen from '../screens/kitchen/KDSScreen';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();

const ALL_TABS = [
  { name: 'POS',    key: 'pos',    icon: 'shopping-cart', component: POSDashboardScreen },
  { name: 'Tables', key: 'tables', icon: 'grid',          component: TableMapScreen },
  { name: 'Orders', key: 'orders', icon: 'list',          component: OrdersListScreen },
  { name: 'KDS',    key: 'kds',    icon: 'monitor',       component: KDSScreen, feature: 'feature_kds' },
];

function withSafeArea(WrappedComponent) {
  return function SafeScreen(props) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['left', 'right', 'bottom']}>
        <WrappedComponent {...props} />
      </SafeAreaView>
    );
  };
}

export default function POSTabs() {
  const { hasFeature, hasAccess } = useAuth();

  const visibleTabs = useMemo(() => {
    return ALL_TABS.filter((tab) => {
      if (tab.feature && !hasFeature(tab.feature)) return false;
      if (!hasAccess(tab.key)) return false;
      return true;
    });
  }, [hasFeature, hasAccess]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {visibleTabs.map((tab) => (
        <Tab.Screen
          key={tab.key}
          name={tab.name}
          component={withSafeArea(tab.component)}
          options={{
            tabBarIcon: ({ color, size }) => <Icon name={tab.icon} size={size} color={color} />,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}
