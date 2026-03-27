import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, spacing, radius, typography } from '../../theme';

export default function Select({
  label,
  value,
  options = [],
  onChange,
  placeholder = 'Select an option',
  error,
  style,
}) {
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === value);
  const displayText = selectedOption ? selectedOption.label : placeholder;

  const handleSelect = (option) => {
    onChange(option.value);
    setOpen(false);
  };

  return (
    <View style={[styles.container, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        style={[
          styles.selector,
          error && { borderColor: colors.error },
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.selectorText,
            !selectedOption && { color: colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {displayText}
        </Text>
        <Icon name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{label || 'Select'}</Text>
                <TouchableOpacity onPress={() => setOpen(false)}>
                  <Icon name="x" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={options}
                keyExtractor={(item) => String(item.value)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.option,
                      item.value === value && styles.optionActive,
                    ]}
                    onPress={() => handleSelect(item)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        item.value === value && styles.optionTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.value === value && (
                      <Icon name="check" size={18} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                style={styles.list}
              />
            </View>
          </SafeAreaView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
  },
  label: {
    ...typography.captionBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  selectorText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    maxHeight: '70%',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.text,
  },
  list: {
    maxHeight: 350,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  optionActive: {
    backgroundColor: colors.primaryLight,
  },
  optionText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  optionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderLight,
  },
});
