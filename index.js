import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './src/App';
import { name as appName } from './app.json';

// Register background message handler — must be at top level before AppRegistry
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('[Notifications] Background message received:', remoteMessage.notification?.title);
  // Background messages are handled by the OS notification tray.
  // Navigation happens when user taps the notification (onNotificationOpenedApp).
});

AppRegistry.registerComponent(appName, () => App);
