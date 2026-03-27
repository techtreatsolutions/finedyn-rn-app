import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';

export default function Input({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry = false,
  leftIcon,
  rightIcon,
  multiline = false,
  editable = true,
  keyboardType = 'default',
  style,
  inputStyle,
  ...rest
}) {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? colors.error
    : focused
    ? colors.primary
    : colors.border;

  return (
    <View style={[styles.container, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          { borderColor },
          multiline && styles.multilineWrap,
          !editable && styles.disabled,
        ]}
      >
        {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}
        <TextInput
          style={[
            styles.input,
            leftIcon && { paddingLeft: 0 },
            rightIcon && { paddingRight: 0 },
            multiline && styles.multilineInput,
            inputStyle,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          editable={editable}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          textAlignVertical={multiline ? 'top' : 'center'}
          {...rest}
        />
        {rightIcon ? <View style={styles.rightIcon}>{rightIcon}</View> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    minHeight: 44,
  },
  multilineWrap: {
    minHeight: 100,
    alignItems: 'flex-start',
  },
  disabled: {
    backgroundColor: colors.surface,
    opacity: 0.7,
  },
  leftIcon: {
    paddingLeft: spacing.md,
  },
  rightIcon: {
    paddingRight: spacing.md,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  multilineInput: {
    minHeight: 90,
    paddingTop: spacing.md,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
