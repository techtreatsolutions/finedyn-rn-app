import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, spacing, radius, typography } from '../../theme';

export default function StatCard({ icon, label, value, trend, trendUp, color = colors.primary, style }) {
  return (
    <View style={[styles.card, style]}>
      <View style={[styles.iconWrap, { backgroundColor: color + '15' }]}>
        {icon || <View style={styles.iconPlaceholder} />}
      </View>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
      {trend ? (
        <View style={styles.trendRow}>
          <Icon
            name={trendUp ? 'trending-up' : 'trending-down'}
            size={14}
            color={trendUp ? colors.success : colors.error}
          />
          <Text
            style={[
              styles.trendText,
              { color: trendUp ? colors.success : colors.error },
            ]}
          >
            {trend}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.base,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    minWidth: 140,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconPlaceholder: {
    width: 20,
    height: 20,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  value: {
    ...typography.h2,
    color: colors.text,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  trendText: {
    ...typography.caption,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
});
