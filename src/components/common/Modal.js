import React from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, spacing, radius, typography } from '../../theme';

const SIZE_MAP = {
  sm: '75%',
  md: '88%',
  lg: '95%',
};

export default function Modal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
}) {
  const width = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* Tap-to-close layer — absolutely positioned behind content */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          {/* Content — plain View, no touchable wrapper, so ScrollView works freely */}
          <View style={[styles.content, { width }]}>
            {(title || onClose) && (
              <View style={styles.header}>
                <View style={styles.headerText}>
                  {title ? <Text style={styles.title}>{title}</Text> : null}
                  {subtitle ? (
                    <Text style={styles.subtitle}>{subtitle}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Icon name="x" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
            <ScrollView
              style={styles.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerText: {
    flex: 1,
    marginRight: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  body: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
});
