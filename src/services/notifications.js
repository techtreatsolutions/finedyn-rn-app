import messaging from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid } from 'react-native';
import Toast from 'react-native-toast-message';
import { authApi } from '../api/auth.api';

let _navigationRef = null;
let _currentFcmToken = null;
let _pendingNotification = null;

/**
 * Set the navigation reference so we can navigate from notifications.
 */
export function setNotificationNavigationRef(ref) {
  _navigationRef = ref;

  // If there was a pending notification (app opened from quit state before nav was ready),
  // handle it now
  if (_pendingNotification && ref?.current) {
    setTimeout(() => {
      handleNotificationTap(_pendingNotification);
      _pendingNotification = null;
    }, 1000); // Small delay to ensure navigation is fully mounted
  }
}

/**
 * Get the current FCM token (cached).
 */
export function getCurrentFcmToken() {
  return _currentFcmToken;
}

/**
 * Request notification permissions and get FCM token.
 * Returns the token or null if permissions denied.
 */
export async function requestNotificationPermission() {
  try {
    // Android 13+ requires runtime permission
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.log('[Notifications] Permission denied');
        return null;
      }
    }

    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.log('[Notifications] Authorization denied');
      return null;
    }

    const token = await messaging().getToken();
    _currentFcmToken = token;
    console.log('[Notifications] FCM Token:', token?.substring(0, 20) + '...');
    return token;
  } catch (err) {
    console.error('[Notifications] Failed to get token:', err.message);
    return null;
  }
}

/**
 * Register the device token with the backend.
 */
export async function registerDeviceWithBackend() {
  try {
    const token = await requestNotificationPermission();
    if (!token) return;

    await authApi.registerDevice(token);
    console.log('[Notifications] Device registered with backend.');
  } catch (err) {
    console.error('[Notifications] Failed to register device:', err.message);
  }
}

/**
 * Unregister the device token from the backend (on logout).
 */
export async function unregisterDevice() {
  try {
    if (_currentFcmToken) {
      await authApi.unregisterDevice(_currentFcmToken);
      _currentFcmToken = null;
      console.log('[Notifications] Device unregistered.');
    }
  } catch (_) { /* non-critical */ }
}

/**
 * Navigate to the appropriate screen based on notification data.
 */
function navigateToScreen(nav, screenName, params) {
  try {
    // Use navigate which works across all navigator levels
    nav.navigate(screenName, params);
  } catch (err) {
    console.warn('[Notifications] Navigation failed:', err.message);
  }
}

/**
 * Handle notification tap (when user taps on a notification).
 */
function handleNotificationTap(remoteMessage) {
  if (!remoteMessage?.data) return;

  const { type, orderId, orderNumber, reservationId } = remoteMessage.data;
  const nav = _navigationRef?.current;

  if (!nav) {
    // Navigation not ready yet, store for later
    _pendingNotification = remoteMessage;
    return;
  }

  switch (type) {
    case 'new_order':
    case 'order':
    case 'order_update':
      // Navigate to POS — try tab name first, then drawer name
      if (orderId) {
        navigateToScreen(nav, 'POS / Billing', { orderId: parseInt(orderId) });
      } else {
        navigateToScreen(nav, 'Orders');
      }
      break;

    case 'kot':
    case 'kot_update':
    case 'new_kot':
      // Navigate to KDS for kitchen staff
      navigateToScreen(nav, 'KDS');
      break;

    case 'order_ready':
    case 'ready':
      // Navigate to orders list to see ready orders
      navigateToScreen(nav, 'Orders');
      break;

    case 'qr_order':
    case 'new_qr_order':
      // Navigate to POS Dashboard (QR orders panel)
      navigateToScreen(nav, 'POS / Billing');
      break;

    case 'reservation':
    case 'new_reservation':
    case 'reservation_reminder':
      // Navigate to reservations screen
      if (reservationId) {
        navigateToScreen(nav, 'Reservations', { reservationId: parseInt(reservationId) });
      } else {
        navigateToScreen(nav, 'Reservations');
      }
      break;

    case 'low_stock':
    case 'inventory_alert':
      navigateToScreen(nav, 'Inventory');
      break;

    case 'expense':
    case 'expense_approval':
      navigateToScreen(nav, 'Expenses');
      break;

    case 'payment':
    case 'payment_received':
      if (orderId) {
        navigateToScreen(nav, 'POSDashboard', { orderId: parseInt(orderId) });
      }
      break;

    default:
      // For unknown types, just go to dashboard
      console.log('[Notifications] Unhandled notification type:', type);
      break;
  }
}

/**
 * Set up all notification listeners. Call once on app start.
 * Returns a cleanup function.
 */
export function setupNotificationListeners() {
  // Foreground messages - show a toast with navigation on tap
  const unsubscribeForeground = messaging().onMessage(async (remoteMessage) => {
    const { title, body } = remoteMessage.notification || {};
    if (title) {
      Toast.show({
        type: 'info',
        text1: title,
        text2: body || '',
        visibilityTime: 5000,
        onPress: () => {
          Toast.hide();
          handleNotificationTap(remoteMessage);
        },
      });
    }
  });

  // Background/quit notification tap
  messaging().onNotificationOpenedApp((remoteMessage) => {
    console.log('[Notifications] App opened from background via notification');
    handleNotificationTap(remoteMessage);
  });

  // App was opened from a quit state via notification
  messaging()
    .getInitialNotification()
    .then((remoteMessage) => {
      if (remoteMessage) {
        console.log('[Notifications] App opened from quit state via notification');
        handleNotificationTap(remoteMessage);
      }
    });

  // Token refresh listener
  const unsubscribeTokenRefresh = messaging().onTokenRefresh(async (newToken) => {
    _currentFcmToken = newToken;
    try {
      await authApi.registerDevice(newToken);
      console.log('[Notifications] Token refreshed and re-registered.');
    } catch (_) { /* non-critical */ }
  });

  // Return cleanup function
  return () => {
    unsubscribeForeground();
    unsubscribeTokenRefresh();
  };
}
