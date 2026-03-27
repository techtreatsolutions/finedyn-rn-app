import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { authApi } from '../../api/auth.api';
import Header from '../../components/common/Header';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { colors, spacing, typography } from '../../theme';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert('Validation', 'Please enter your email.');
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to send reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header title="Forgot Password" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {sent ? (
          <View style={styles.successSection}>
            <View style={styles.successIcon}>
              <Icon name="check-circle" size={48} color={colors.success} />
            </View>
            <Text style={styles.successTitle}>Email Sent!</Text>
            <Text style={styles.successText}>
              If an account exists with that email, we've sent a password reset link. Please check your inbox.
            </Text>
            <Button
              title="Back to Login"
              onPress={() => navigation.goBack()}
              fullWidth
              style={styles.btn}
            />
          </View>
        ) : (
          <>
            <Text style={styles.description}>
              Enter your registered email address and we'll send you a link to reset your password.
            </Text>
            <Input
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon={<Icon name="mail" size={18} color={colors.textMuted} />}
            />
            <Button
              title="Send Reset Link"
              onPress={handleSubmit}
              loading={loading}
              fullWidth
              style={styles.btn}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.xl, flexGrow: 1 },
  description: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl, lineHeight: 22 },
  btn: { marginTop: spacing.lg },
  successSection: { alignItems: 'center', paddingTop: spacing['3xl'] },
  successIcon: { marginBottom: spacing.lg },
  successTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.md },
  successText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 22 },
});
