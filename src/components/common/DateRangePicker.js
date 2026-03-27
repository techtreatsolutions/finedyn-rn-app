import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from 'react-native-vector-icons/Feather';
import { colors, spacing, radius, typography } from '../../theme';
import { formatDate } from '../../utils/formatters';

export default function DateRangePicker({ from, to, onFromChange, onToChange, style }) {
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);

  const handleFromChange = (event, date) => {
    setShowFrom(Platform.OS === 'ios');
    if (date) onFromChange(date);
  };

  const handleToChange = (event, date) => {
    setShowTo(Platform.OS === 'ios');
    if (date) onToChange(date);
  };

  return (
    <View style={[styles.container, style]}>
      {/* From */}
      <TouchableOpacity
        style={styles.dateBtn}
        onPress={() => setShowFrom(true)}
        activeOpacity={0.7}
      >
        <Icon name="calendar" size={16} color={colors.textSecondary} />
        <View style={styles.dateInfo}>
          <Text style={styles.dateLabel}>From</Text>
          <Text style={styles.dateValue}>
            {from ? formatDate(from) : 'Select date'}
          </Text>
        </View>
      </TouchableOpacity>

      <Icon name="arrow-right" size={16} color={colors.textMuted} style={styles.arrow} />

      {/* To */}
      <TouchableOpacity
        style={styles.dateBtn}
        onPress={() => setShowTo(true)}
        activeOpacity={0.7}
      >
        <Icon name="calendar" size={16} color={colors.textSecondary} />
        <View style={styles.dateInfo}>
          <Text style={styles.dateLabel}>To</Text>
          <Text style={styles.dateValue}>
            {to ? formatDate(to) : 'Select date'}
          </Text>
        </View>
      </TouchableOpacity>

      {showFrom && (
        <DateTimePicker
          value={from || new Date()}
          mode="date"
          display="spinner"
          onChange={handleFromChange}
          maximumDate={to || new Date()}
        />
      )}

      {showTo && (
        <DateTimePicker
          value={to || new Date()}
          mode="date"
          display="spinner"
          onChange={handleToChange}
          minimumDate={from || undefined}
          maximumDate={new Date()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dateInfo: {
    marginLeft: spacing.sm,
  },
  dateLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    marginBottom: 2,
  },
  dateValue: {
    ...typography.captionBold,
    color: colors.text,
  },
  arrow: {
    marginHorizontal: spacing.sm,
  },
});
