import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../../theme';

export default function FAB({ icon = 'plus', onPress, style, color = colors.white, bgColor = colors.primary }) {
  return (
    <TouchableOpacity style={[styles.fab, { backgroundColor: bgColor }, style]} onPress={onPress} activeOpacity={0.8}>
      <Icon name={icon} size={24} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27, shadowRadius: 4.65,
  },
});
