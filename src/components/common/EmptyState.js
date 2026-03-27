import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, spacing, radius, typography } from '../../theme';
import Button from './Button';

export default function EmptyState({
  icon,
  title = 'Nothing here',
  message,
  actionLabel,
  onAction,
  style,
}) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrap}>
        {icon || <Icon name="inbox" size={48} color={colors.textMuted} />}
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          variant="primary"
          onPress={onAction}
          style={styles.actionBtn}
          size="md"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['3xl'],
  },
  iconWrap: {
    marginBottom: spacing.base,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    marginTop: spacing.sm,
  },
});
