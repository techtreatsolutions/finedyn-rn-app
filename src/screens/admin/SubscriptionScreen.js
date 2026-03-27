import React from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useQuery } from '@tanstack/react-query';
import { restaurantApi } from '../../api/restaurant.api';
import Header from '../../components/common/Header';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { colors, spacing, radius, typography } from '../../theme';
import { formatCurrency, formatDate } from '../../utils/formatters';

const FEATURE_LABELS = {
  feature_waiter_app: { label: 'Waiter App', desc: 'Mobile ordering for waiters' },
  feature_digital_menu: { label: 'Digital Menu', desc: 'QR code based digital menu' },
  feature_edine_in_orders: { label: 'E-Dine In Orders', desc: 'Customers place orders via QR' },
  feature_reservations: { label: 'Reservations', desc: 'Table reservation management' },
  feature_inventory: { label: 'Inventory Management', desc: 'Track stock and supplies' },
  feature_expense_management: { label: 'Expense Management', desc: 'Bills payable and expense tracking' },
  feature_employee_management: { label: 'Employee Management', desc: 'Payroll, attendance and advances' },
  feature_kds: { label: 'Kitchen Display (KDS)', desc: 'Real-time kitchen order display' },
  feature_analytics: { label: 'Advanced Analytics', desc: 'Reports and business insights' },
};

const LIMIT_LABELS = {
  max_floors: { label: 'Floors', usageKey: 'floors' },
  max_tables: { label: 'Tables', usageKey: 'tables' },
  max_menu_items: { label: 'Menu Items', usageKey: 'menuItems' },
  max_staff: { label: 'Staff Users', usageKey: 'staff' },
  max_bills_per_day: { label: 'Bills / Day', usageKey: 'billsToday' },
  max_bills_per_month: { label: 'Bills / Month', usageKey: 'billsMonth' },
};

const STATUS_VARIANT = {
  active: 'success',
  trial: 'info',
  expired: 'danger',
  suspended: 'danger',
};

export default function SubscriptionScreen({ navigation }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['subscription-info'],
    queryFn: async () => {
      const r = await restaurantApi.getSubscription();
      return r.data || r;
    },
  });

  if (isLoading) return <LoadingSpinner fullScreen />;

  const sub = data?.subscription;
  const features = data?.features || {};
  const usage = data?.usage || {};

  const planName = sub?.name || 'No Plan';
  const status = sub?.subscription_status || 'expired';
  const startDate = sub?.subscription_start;
  const endDate = sub?.subscription_end;
  const daysLeft = endDate ? Math.ceil((new Date(endDate) - new Date()) / 86400000) : 0;

  const planFeatures = Object.keys(FEATURE_LABELS)
    .filter(key => sub?.[key] !== undefined || features[key] !== undefined)
    .map(key => {
      const effectiveVal = features[key] === true || features[key] === 1;
      const planVal = sub?.[key] === 1 || sub?.[key] === true;
      return {
        key,
        ...FEATURE_LABELS[key],
        enabled: effectiveVal,
        overridden: sub?.[key] !== undefined && effectiveVal !== planVal,
      };
    });

  const planLimits = Object.keys(LIMIT_LABELS)
    .filter(key => sub?.[key] !== undefined || features[key] !== undefined)
    .map(key => {
      const limit = features[key];
      const meta = LIMIT_LABELS[key];
      const current = meta.usageKey ? (usage[meta.usageKey] ?? null) : null;
      const isUnlimited = limit === -1;
      const overridden = sub?.[key] !== undefined && features[key] !== sub[key];
      return { key, label: meta.label, limit, current, isUnlimited, overridden };
    });

  const expiryColor = daysLeft <= 7 ? colors.error : daysLeft <= 30 ? '#D97706' : colors.success;
  const expiryBg = daysLeft <= 7 ? colors.errorBg : daysLeft <= 30 ? '#FFFBEB' : colors.successBg;

  return (
    <View style={styles.container}>
      <Header
        title="Subscription"
        onMenu={() => navigation.openDrawer()}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
      >
        {/* Plan Overview */}
        <Card style={styles.planCard}>
          <View style={styles.planHeader}>
            <View style={styles.planIcon}>
              <Icon name="award" size={28} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planName}>{planName}</Text>
              <View style={styles.planMeta}>
                <Badge text={status} variant={STATUS_VARIANT[status] || 'warning'} />
                {sub?.price_monthly && (
                  <Text style={styles.priceText}>{formatCurrency(sub.price_monthly)}/mo</Text>
                )}
              </View>
            </View>
          </View>

          {/* Expiry */}
          {endDate && (
            <View style={[styles.expiryBox, { backgroundColor: expiryBg }]}>
              <Icon name="calendar" size={16} color={expiryColor} />
              <View style={{ flex: 1 }}>
                <Text style={styles.expiryLabel}>Plan Expiry</Text>
                <Text style={[styles.expiryDate, { color: expiryColor }]}>
                  {formatDate(endDate)} ({daysLeft > 0 ? `${daysLeft} days left` : 'Expired'})
                </Text>
              </View>
            </View>
          )}

          {startDate && (
            <Text style={styles.startDate}>Subscription started on {formatDate(startDate)}</Text>
          )}
        </Card>

        {/* Usage & Limits */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Icon name="activity" size={16} color={colors.textSecondary} />
            <Text style={styles.sectionTitle}>Usage & Limits</Text>
          </View>

          {planLimits.map(item => {
            const pct = !item.isUnlimited && item.current !== null && item.limit > 0
              ? Math.min(100, Math.round((item.current / item.limit) * 100))
              : null;
            const isCritical = pct !== null && pct >= 90;
            const isHigh = pct !== null && pct >= 75;
            const barColor = isCritical ? colors.error : isHigh ? '#D97706' : colors.primary;
            const valueColor = isCritical ? colors.error : isHigh ? '#D97706' : colors.text;

            return (
              <View key={item.key} style={styles.limitItem}>
                <View style={styles.limitHeader}>
                  <Text style={styles.limitLabel}>{item.label}</Text>
                  {item.overridden && (
                    <Badge text="Override" variant="info" small />
                  )}
                </View>
                <View style={styles.limitValues}>
                  {item.current !== null && (
                    <Text style={[styles.limitCurrent, { color: valueColor }]}>{item.current}</Text>
                  )}
                  <Text style={styles.limitMax}>
                    {item.current !== null ? '/ ' : ''}
                    {item.isUnlimited ? 'Unlimited' : item.limit}
                  </Text>
                </View>
                {pct !== null && (
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                  </View>
                )}
              </View>
            );
          })}
        </Card>

        {/* Features */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Icon name="shield" size={16} color={colors.textSecondary} />
            <Text style={styles.sectionTitle}>Features</Text>
          </View>

          {planFeatures.map(f => (
            <View
              key={f.key}
              style={[
                styles.featureItem,
                { backgroundColor: f.enabled ? colors.successBg : colors.surfaceHover },
                { borderColor: f.enabled ? colors.success + '40' : colors.border },
              ]}
            >
              <View style={[styles.featureIcon, { backgroundColor: f.enabled ? colors.success + '20' : colors.surfaceHover }]}>
                <Icon
                  name={f.enabled ? 'check' : 'x'}
                  size={14}
                  color={f.enabled ? colors.success : colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.featureLabelRow}>
                  <Text style={[styles.featureLabel, !f.enabled && { color: colors.textMuted }]}>{f.label}</Text>
                  {f.overridden && <Badge text="Override" variant="info" small />}
                </View>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* Note */}
        <View style={styles.noteBox}>
          <Icon name="alert-triangle" size={16} color="#D97706" style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noteTitle}>Need to upgrade or change your plan?</Text>
            <Text style={styles.noteDesc}>Contact your DineSys administrator to upgrade, downgrade, or renew your subscription.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.base, paddingBottom: 30 },

  // Plan card
  planCard: { marginBottom: spacing.md },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  planIcon: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: colors.primary + '15',
    justifyContent: 'center', alignItems: 'center',
  },
  planName: { ...typography.h3, color: colors.text },
  planMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  priceText: { ...typography.caption, color: colors.textSecondary },
  expiryBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm,
  },
  expiryLabel: { ...typography.tiny, color: colors.textMuted },
  expiryDate: { ...typography.captionBold, marginTop: 2 },
  startDate: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.xs },

  // Section cards
  sectionCard: { marginBottom: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { ...typography.bodyBold, color: colors.text },

  // Limits
  limitItem: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  limitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  limitLabel: { ...typography.body, color: colors.textSecondary, fontWeight: '500' },
  limitValues: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  limitCurrent: { fontSize: 24, fontWeight: '700' },
  limitMax: { ...typography.body, color: colors.textMuted },
  progressBar: {
    height: 5, backgroundColor: colors.surfaceHover, borderRadius: 3,
    overflow: 'hidden', marginTop: spacing.sm,
  },
  progressFill: { height: '100%', borderRadius: 3 },

  // Features
  featureItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1,
    marginBottom: spacing.sm,
  },
  featureIcon: {
    width: 32, height: 32, borderRadius: radius.sm,
    justifyContent: 'center', alignItems: 'center',
  },
  featureLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  featureLabel: { ...typography.body, fontWeight: '500', color: colors.text },
  featureDesc: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },

  // Note
  noteBox: {
    flexDirection: 'row', gap: spacing.md, padding: spacing.md,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: radius.md,
  },
  noteTitle: { ...typography.captionBold, color: '#92400E' },
  noteDesc: { ...typography.tiny, color: '#B45309', marginTop: 2 },
});
