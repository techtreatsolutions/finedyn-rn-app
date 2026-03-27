import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, spacing, radius, typography } from '../../theme';

export default function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search...',
  style,
}) {
  return (
    <View style={[styles.container, style]}>
      <Icon name="search" size={18} color={colors.textMuted} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value ? (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          style={styles.clearBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="x" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 42,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  clearBtn: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
});
