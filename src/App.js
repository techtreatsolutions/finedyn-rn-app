import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StatusBar, Modal, View, Text, TouchableOpacity, Linking, BackHandler, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import SplashScreen from 'react-native-splash-screen';
import { AuthProvider } from './contexts/AuthContext';
import RootNavigator from './navigation/RootNavigator';
import { setupNotificationListeners, setNotificationNavigationRef } from './services/notifications';
import { colors, spacing, radius, typography } from './theme';
import { apiGet } from './api/client';
import { version as appVersion } from '../package.json';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000, refetchOnWindowFocus: false },
  },
});

function AppUpdateGate({ children }) {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  const checkVersion = useCallback(async () => {
    try {
      const res = await apiGet('/auth/check-app-version', { currentVersion: appVersion });
      const data = res?.data || res;
      if (data?.updateRequired) {
        setUpdateInfo(data);
      }
    } catch {
      // Non-critical — don't block app if check fails
    }
  }, []);

  useEffect(() => {
    checkVersion();
  }, [checkVersion]);

  const isMandatory = updateInfo?.updateType === 'mandatory';
  const showModal = updateInfo?.updateRequired && (!dismissed || isMandatory);

  useEffect(() => {
    if (showModal && isMandatory) {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }
  }, [showModal, isMandatory]);

  const handleUpdate = () => {
    if (updateInfo?.playstoreUrl) {
      Linking.openURL(updateInfo.playstoreUrl).catch(() => {});
    }
  };

  if (showModal) {
    return (
      <>
        {children}
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <View style={updateStyles.backdrop}>
            <View style={updateStyles.card}>
              <View style={updateStyles.iconCircle}>
                <Text style={updateStyles.iconText}>↑</Text>
              </View>
              <Text style={updateStyles.title}>Update Available</Text>
              <Text style={updateStyles.version}>Version {updateInfo.latestVersion} is now available</Text>
              {updateInfo.updateMessage ? (
                <Text style={updateStyles.message}>{updateInfo.updateMessage}</Text>
              ) : null}
              {isMandatory && (
                <View style={updateStyles.mandatoryBadge}>
                  <Text style={updateStyles.mandatoryText}>This update is required to continue using the app</Text>
                </View>
              )}
              <TouchableOpacity style={updateStyles.updateBtn} onPress={handleUpdate} activeOpacity={0.8}>
                <Text style={updateStyles.updateBtnText}>Update Now</Text>
              </TouchableOpacity>
              {!isMandatory && (
                <TouchableOpacity style={updateStyles.skipBtn} onPress={() => setDismissed(true)} activeOpacity={0.7}>
                  <Text style={updateStyles.skipBtnText}>Not Now</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      </>
    );
  }

  return children;
}

const updateStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight || '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  iconText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  version: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  message: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  mandatoryBadge: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  mandatoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
    textAlign: 'center',
  },
  updateBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.sm,
    elevation: 2,
  },
  updateBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  skipBtn: {
    paddingVertical: spacing.md,
  },
  skipBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default function App() {
  const navigationRef = useRef(null);

  useEffect(() => {
    setNotificationNavigationRef(navigationRef);
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <NavigationContainer ref={navigationRef} onReady={() => SplashScreen.hide()}>
              <AppUpdateGate>
                <RootNavigator />
              </AppUpdateGate>
            </NavigationContainer>
            <Toast />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
