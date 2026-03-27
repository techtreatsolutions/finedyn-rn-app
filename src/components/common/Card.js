import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../../theme';

export default function Card({ children, style, onPress }) {
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {children}
    </Wrapper>
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
  },
});
