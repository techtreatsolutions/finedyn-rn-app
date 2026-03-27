import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, spacing, radius, typography } from '../../theme';
import Modal from './Modal';
import Button from './Button';

export default function ConfirmModal({
  visible,
  onClose,
  onConfirm,
  title = 'Confirm',
  message = 'Are you sure?',
  confirmText = 'Confirm',
  confirmVariant = 'primary',
  loading = false,
}) {
  return (
    <Modal visible={visible} onClose={onClose} title={title} size="sm">
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Icon
            name={confirmVariant === 'danger' ? 'alert-triangle' : 'help-circle'}
            size={36}
            color={confirmVariant === 'danger' ? colors.error : colors.primary}
          />
        </View>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          <Button
            title="Cancel"
            variant="ghost"
            onPress={onClose}
            style={styles.cancelBtn}
            disabled={loading}
          />
          <Button
            title={confirmText}
            variant={confirmVariant}
            onPress={onConfirm}
            loading={loading}
            style={styles.confirmBtn}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  iconWrap: {
    marginBottom: spacing.base,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    marginRight: spacing.sm,
  },
  confirmBtn: {
    flex: 1,
    marginLeft: spacing.sm,
  },
});
