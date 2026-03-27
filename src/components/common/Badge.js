import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';
import { capitalize } from '../../utils/formatters';

// Map variant shorthand names to colors.status keys
const VARIANT_MAP = {
  success: 'completed',
  danger: 'cancelled',
  warning: 'pending',
  info: 'confirmed',
  primary: 'reserved',
  default: 'cleaning',
};

export default function Badge({ status, label, text, variant, style, small }) {
  // Support both (status, label) and (variant, text) prop styles
  const resolvedStatus = status || VARIANT_MAP[variant] || variant;
  const statusColors = colors.status[resolvedStatus] || {
    bg: '#F3F4F6',
    text: '#374151',
    border: '#D1D5DB',
  };

  const displayText = label || text || capitalize(resolvedStatus || '');

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: statusColors.bg,
          borderColor: statusColors.border,
        },
        small && styles.small,
        style,
      ]}
    >
      <Text style={[styles.text, { color: statusColors.text }, small && styles.smallText]}>
        {displayText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  small: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: {
    ...typography.tiny,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  smallText: {
    fontSize: 10,
  },
});
