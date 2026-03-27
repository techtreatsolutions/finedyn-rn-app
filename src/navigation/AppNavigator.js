import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import AdminDrawer from './AdminDrawer';
import POSTabs from './POSTabs';
import WaiterDashboardScreen from '../screens/waiter/WaiterDashboardScreen';
import KDSScreen from '../screens/kitchen/KDSScreen';
import { colors } from '../theme';

function withSafeArea(WrappedComponent, bg = colors.surface) {
  return function SafeScreen(props) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['left', 'right', 'bottom']}>
        <WrappedComponent {...props} />
      </SafeAreaView>
    );
  };
}

const SafeWaiterDashboard = withSafeArea(WaiterDashboardScreen);
const SafeKDS = withSafeArea(KDSScreen, '#111827');

const Stack = createStackNavigator();

// Fallback screen shown briefly during logout transition
function EmptyScreen() {
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.white }}><ActivityIndicator color={colors.primary} /></View>;
}

export default function AppNavigator() {
  const { user } = useAuth();
  const role = user?.role;

  const getScreen = () => {
    if (role === 'owner' || role === 'manager') return { name: 'AdminDrawer', component: AdminDrawer };
    if (role === 'cashier') return { name: 'POSTabs', component: POSTabs };
    if (role === 'waiter') return { name: 'WaiterDashboard', component: SafeWaiterDashboard };
    if (role === 'kitchen_staff') return { name: 'KDS', component: SafeKDS };
    return { name: 'Empty', component: EmptyScreen };
  };

  const screen = getScreen();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name={screen.name} component={screen.component} />
    </Stack.Navigator>
  );
}
