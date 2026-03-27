import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, spacing, radius, typography } from '../../theme';

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'delete'],
];

export default function PinKeypad({ value = '', onChange, maxLen = 6, onComplete }) {
  const handlePress = (key) => {
    if (key === 'delete') {
      const next = value.slice(0, -1);
      onChange(next);
      return;
    }
    if (key === '' || value.length >= maxLen) return;

    const next = value + key;
    onChange(next);
    if (next.length === maxLen && onComplete) {
      onComplete(next);
    }
  };

  return (
    <View style={styles.container}>
      {/* Dot indicators */}
      <View style={styles.dotsRow}>
        {Array.from({ length: maxLen }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < value.length && styles.dotFilled,
            ]}
          />
        ))}
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYS.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((key, ci) => {
              if (key === '') {
                return <View key={ci} style={styles.keyEmpty} />;
              }
              return (
                <TouchableOpacity
                  key={ci}
                  style={styles.key}
                  onPress={() => handlePress(key)}
                  activeOpacity={0.6}
                >
                  {key === 'delete' ? (
                    <Icon name="delete" size={24} color={colors.text} />
                  ) : (
                    <Text style={styles.keyText}>{key}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing['2xl'],
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    marginHorizontal: spacing.sm,
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  keypad: {
    width: '100%',
    maxWidth: 300,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  keyEmpty: {
    width: 72,
    height: 72,
    marginHorizontal: spacing.md,
  },
  keyText: {
    ...typography.h1,
    color: colors.text,
  },
});
