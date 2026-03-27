import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { colors, spacing, typography } from '../../theme';

export default function Header({ title, subtitle, onBack, onMenu, rightComponent, style }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[
      styles.container,
      {
        paddingTop: insets.top + spacing.md,
        paddingLeft: Math.max(insets.left, spacing.base),
        paddingRight: Math.max(insets.right, spacing.base),
      },
      style,
    ]}>
      <StatusBar backgroundColor={colors.white} barStyle="dark-content" />
      <View style={styles.row}>
        {onMenu ? (
          <TouchableOpacity
            onPress={onMenu}
            style={styles.menuBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="menu" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        {rightComponent ? (
          <View style={styles.right}>{rightComponent}</View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  menuBtn: {
    marginRight: spacing.md,
    padding: spacing.xs,
  },
  backBtn: {
    marginRight: spacing.md,
    padding: spacing.xs,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  right: {
    marginLeft: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
