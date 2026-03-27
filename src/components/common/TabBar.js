import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';

export default function TabBar({ tabs = [], activeTab, onTabChange, style }) {
  return (
    <View style={[styles.container, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onTabChange(tab.key)}
              activeOpacity={0.7}
            >
              {tab.icon ? (
                <View style={styles.tabIcon}>{tab.icon}</View>
              ) : null}
              <Text
                style={[styles.tabText, isActive && styles.tabTextActive]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    marginRight: spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabIcon: {
    marginRight: spacing.sm,
  },
  tabText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
  },
});
