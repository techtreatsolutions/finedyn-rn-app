import React, { useState, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, KeyboardAvoidingView,
  ScrollView, Platform, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useAuth } from '../../hooks/useAuth';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import PinKeypad from '../../components/common/PinKeypad';
import { colors, spacing, radius, typography } from '../../theme';

export default function LoginScreen({ navigation }) {
  const { login, pinLogin } = useAuth();
  const [mode, setMode] = useState('password'); // 'password' | 'pin'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Validation', 'Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      Alert.alert('Login Failed', err?.response?.data?.message || err.message || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async (pinValue) => {
    if (!email.trim()) {
      Alert.alert('Validation', 'Please enter your email first.');
      return;
    }
    setLoading(true);
    try {
      await pinLogin(email.trim(), pinValue);
    } catch (err) {
      Alert.alert('Login Failed', err?.response?.data?.message || err.message || 'Invalid PIN.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handlePinChange = (newPin) => {
    setPin(newPin);
    if (newPin.length === 4) {
      handlePinLogin(newPin);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo & branding */}
          <View style={styles.logoSection}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.appName}>FineDyn</Text>
            <Text style={styles.tagline}>Restaurant POS System</Text>
          </View>

          {/* Toggle password / pin */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'password' && styles.modeBtnActive]}
              onPress={() => setMode('password')}
            >
              <Icon name="lock" size={16} color={mode === 'password' ? colors.white : colors.textSecondary} />
              <Text style={[styles.modeBtnText, mode === 'password' && styles.modeBtnTextActive]}>Password</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'pin' && styles.modeBtnActive]}
              onPress={() => setMode('pin')}
            >
              <Icon name="grid" size={16} color={mode === 'pin' ? colors.white : colors.textSecondary} />
              <Text style={[styles.modeBtnText, mode === 'pin' && styles.modeBtnTextActive]}>PIN</Text>
            </TouchableOpacity>
          </View>

          {/* Email (always visible) */}
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon={<Icon name="mail" size={18} color={colors.textMuted} />}
          />

          {mode === 'password' ? (
            <>
              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry={!showPassword}
                leftIcon={<Icon name="lock" size={18} color={colors.textMuted} />}
                rightIcon={
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                }
              />

              <Button
                title="Login"
                onPress={handlePasswordLogin}
                loading={loading}
                fullWidth
                style={styles.loginBtn}
              />

              <TouchableOpacity
                style={styles.forgotLink}
                onPress={() => navigation.navigate('ForgotPassword')}
              >
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.pinSection}>
              <Text style={styles.pinLabel}>Enter your 4-digit PIN</Text>
              <View style={styles.pinDots}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[styles.pinDot, pin.length > i && styles.pinDotFilled]}
                  />
                ))}
              </View>
              <PinKeypad
                value={pin}
                onChange={handlePinChange}
                maxLength={4}
                disabled={loading}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, paddingBottom: 40 },
  logoSection: { alignItems: 'center', marginBottom: spacing['2xl'] },
  logo: { width: 80, height: 80, marginBottom: spacing.md },
  appName: { ...typography.h1, color: colors.primary, marginBottom: spacing.xs },
  tagline: { ...typography.caption, color: colors.textSecondary },
  modeToggle: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 4, marginBottom: spacing.xl,
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, borderRadius: radius.md, gap: spacing.sm,
  },
  modeBtnActive: { backgroundColor: colors.primary },
  modeBtnText: { ...typography.bodyBold, color: colors.textSecondary },
  modeBtnTextActive: { color: colors.white },
  loginBtn: { marginTop: spacing.lg },
  forgotLink: { alignSelf: 'center', marginTop: spacing.base },
  forgotText: { ...typography.body, color: colors.primary },
  pinSection: { alignItems: 'center', marginTop: spacing.lg },
  pinLabel: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg },
  pinDots: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  pinDot: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white,
  },
  pinDotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
});
