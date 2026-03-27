import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';

const SIZES = {
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: 12, iconSize: 14, height: 32 },
  md: { paddingVertical: spacing.md, paddingHorizontal: spacing.base, fontSize: 14, iconSize: 16, height: 40 },
  lg: { paddingVertical: spacing.base, paddingHorizontal: spacing.xl, fontSize: 16, iconSize: 20, height: 48 },
};

const VARIANTS = {
  primary: {
    bg: colors.primary,
    bgDisabled: '#E5A5AD',
    text: colors.white,
    border: 'transparent',
  },
  secondary: {
    bg: 'transparent',
    bgDisabled: colors.surface,
    text: colors.primary,
    border: colors.primary,
  },
  ghost: {
    bg: 'transparent',
    bgDisabled: 'transparent',
    text: colors.primary,
    border: 'transparent',
  },
  danger: {
    bg: colors.error,
    bgDisabled: '#F5A3A3',
    text: colors.white,
    border: 'transparent',
  },
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  size = 'md',
  fullWidth = false,
  style,
}) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        {
          backgroundColor: isDisabled ? v.bgDisabled : v.bg,
          borderColor: isDisabled ? colors.border : v.border,
          paddingVertical: s.paddingVertical,
          paddingHorizontal: s.paddingHorizontal,
          minHeight: s.height,
        },
        variant === 'secondary' && styles.outlined,
        fullWidth && styles.fullWidth,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.iconWrap}>{icon}</View>}
          <Text
            style={[
              styles.text,
              { color: isDisabled ? colors.textMuted : v.text, fontSize: s.fontSize },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  outlined: {
    borderWidth: 1.5,
  },
  fullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    marginRight: spacing.sm,
  },
  text: {
    ...typography.button,
  },
});
