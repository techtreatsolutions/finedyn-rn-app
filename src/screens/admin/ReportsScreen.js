import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Alert, Share, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useQuery } from '@tanstack/react-query';
import { reportApi } from '../../api/report.api';
import Header from '../../components/common/Header';
import TabBar from '../../components/common/TabBar';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import DateRangePicker from '../../components/common/DateRangePicker';
import { colors, spacing, radius, typography } from '../../theme';
import { formatCurrency, formatDate, capitalize } from '../../utils/formatters';

const TABS = [
  { key: 'sales', label: 'Sales' },
  { key: 'items', label: 'Items' },
  { key: 'payments', label: 'Payments' },
  { key: 'tax', label: 'Tax' },
  { key: 'waiters', label: 'Waiters' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'export', label: 'Export' },
];

const EXPORT_TYPES = [
  { key: 'customers', label: 'Customers', icon: 'users', color: colors.primary },
  { key: 'orders', label: 'Orders', icon: 'shopping-bag', color: '#F59E0B' },
  { key: 'employees', label: 'Employees', icon: 'user-check', color: '#8B5CF6' },
  { key: 'salaries', label: 'Salaries', icon: 'credit-card', color: '#10B981' },
  { key: 'inventory', label: 'Inventory', icon: 'package', color: '#3B82F6' },
  { key: 'expenses', label: 'Expenses', icon: 'dollar-sign', color: '#EF4444' },
  { key: 'attendance', label: 'Attendance', icon: 'clock', color: '#6366F1' },
];

function getDefaultDates() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  return { from: start, to: now };
}

function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

export default function ReportsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('sales');
  const [dates, setDates] = useState(getDefaultDates);
  const [exporting, setExporting] = useState(null);

  const params = { start_date: toDateStr(dates.from), end_date: toDateStr(dates.to) };

  // --- Queries ---

  const { data: salesData, isLoading: salesLoading, refetch: refetchSales } = useQuery({
    queryKey: ['report-sales', params],
    queryFn: async () => { const r = await reportApi.getSalesSummary(params); return r.data || r; },
    enabled: activeTab === 'sales',
  });

  const { data: itemsData, isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['report-items', params],
    queryFn: async () => { const r = await reportApi.getItemWise(params); return r.data || r; },
    enabled: activeTab === 'items',
  });

  const { data: payData, isLoading: payLoading, refetch: refetchPay } = useQuery({
    queryKey: ['report-payments', params],
    queryFn: async () => { const r = await reportApi.getPaymentModes(params); return r.data || r; },
    enabled: activeTab === 'payments',
  });

  const { data: taxData, isLoading: taxLoading, refetch: refetchTax } = useQuery({
    queryKey: ['report-tax', params],
    queryFn: async () => { const r = await reportApi.getTaxReport(params); return r.data || r; },
    enabled: activeTab === 'tax',
  });

  const { data: waiterData, isLoading: waiterLoading, refetch: refetchWaiters } = useQuery({
    queryKey: ['report-waiters', params],
    queryFn: async () => { const r = await reportApi.getWaiterPerformance(params); return r.data || r; },
    enabled: activeTab === 'waiters',
  });

  const { data: expenseData, isLoading: expenseLoading, refetch: refetchExpenses } = useQuery({
    queryKey: ['report-expenses', params],
    queryFn: async () => { const r = await reportApi.getExpenseReport(params); return r.data || r; },
    enabled: activeTab === 'expenses',
  });

  // Determine current loading/refetch
  const loadingMap = {
    sales: salesLoading, items: itemsLoading, payments: payLoading,
    tax: taxLoading, waiters: waiterLoading, expenses: expenseLoading, export: false,
  };
  const refetchMap = {
    sales: refetchSales, items: refetchItems, payments: refetchPay,
    tax: refetchTax, waiters: refetchWaiters, expenses: refetchExpenses, export: () => {},
  };
  const isLoading = loadingMap[activeTab];
  const refetch = refetchMap[activeTab];

  // --- Export handler ---

  const handleExport = useCallback(async (type) => {
    try {
      setExporting(type);
      const response = await reportApi.exportReport(type);
      // On mobile, we can't easily save blobs. Use Share API.
      if (Platform.OS !== 'web' && response?.data) {
        // If the response has a download URL, share it
        const url = response?.config?.baseURL
          ? `${response.config.baseURL}/reports/export/${type}`
          : `/reports/export/${type}`;
        await Share.share({
          title: `${capitalize(type)} Report`,
          message: `Download ${capitalize(type)} report from DineSys`,
          url,
        });
      } else {
        Alert.alert('Success', `${capitalize(type)} report downloaded successfully.`);
      }
    } catch (err) {
      Alert.alert('Error', `Failed to export ${type} report. Please try again.`);
    } finally {
      setExporting(null);
    }
  }, []);

  // --- Tab Renderers ---

  const renderSales = () => {
    const s = salesData;
    if (!s) {
      return <EmptyState icon={<Icon name="bar-chart-2" size={48} color={colors.textMuted} />} title="No data" message="No sales data for this period" />;
    }

    const summary = Array.isArray(s) ? null : s;
    const breakdown = Array.isArray(s) ? s : (s.breakdown || s.daily || []);

    return (
      <View>
        {summary && (
          <View style={styles.statsGrid}>
            <StatCard
              icon={<Icon name="dollar-sign" size={20} color={colors.primary} />}
              label="Total Revenue"
              value={formatCurrency(summary.total_revenue || 0)}
              color={colors.primary}
              style={styles.statCard}
            />
            <StatCard
              icon={<Icon name="shopping-bag" size={20} color="#F59E0B" />}
              label="Total Orders"
              value={String(summary.total_orders || 0)}
              color="#F59E0B"
              style={styles.statCard}
            />
            <StatCard
              icon={<Icon name="trending-up" size={20} color="#10B981" />}
              label="Avg Order Value"
              value={formatCurrency(summary.avg_order_value || 0)}
              color="#10B981"
              style={styles.statCard}
            />
            <StatCard
              icon={<Icon name="users" size={20} color="#8B5CF6" />}
              label="Dine-In Orders"
              value={String(summary.dine_in_count || summary.dine_in_orders || 0)}
              color="#8B5CF6"
              style={styles.statCard}
            />
          </View>
        )}

        {breakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Daily Breakdown</Text>
            {breakdown.map((row, i) => (
              <Card key={i} style={styles.rowCard}>
                <View style={styles.rowMain}>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{formatDate(row.date)}</Text>
                    <Text style={styles.rowSub}>{row.total_orders || row.orders || 0} orders</Text>
                  </View>
                  <Text style={styles.rowValue}>{formatCurrency(row.total_revenue || row.revenue || 0)}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderItems = () => {
    const items = Array.isArray(itemsData) ? itemsData : (itemsData?.items || []);
    if (!items.length) {
      return <EmptyState icon={<Icon name="package" size={48} color={colors.textMuted} />} title="No data" message="No item-wise data for this period" />;
    }

    return (
      <View>
        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 2 }]}>Item</Text>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>Qty</Text>
          <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Revenue</Text>
        </View>
        {items.map((row, i) => (
          <Card key={i} style={styles.rowCard}>
            <View style={styles.rowMain}>
              <View style={{ flex: 2 }}>
                <Text style={styles.rowLabel}>{row.item_name || 'Unknown'}</Text>
                {row.category_name && <Text style={styles.rowSub}>{row.category_name}</Text>}
              </View>
              <Text style={[styles.rowQty, { flex: 1 }]}>{row.total_qty || row.quantity_sold || 0}</Text>
              <Text style={[styles.rowValue, { flex: 1, textAlign: 'right' }]}>{formatCurrency(row.total_revenue || 0)}</Text>
            </View>
          </Card>
        ))}
      </View>
    );
  };

  const renderPayments = () => {
    const payments = Array.isArray(payData) ? payData : (payData?.modes || []);
    if (!payments.length) {
      return <EmptyState icon={<Icon name="credit-card" size={48} color={colors.textMuted} />} title="No data" message="No payment data for this period" />;
    }

    return (
      <View>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 2 }]}>Payment Mode</Text>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>Count</Text>
          <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Revenue</Text>
        </View>
        {payments.map((row, i) => (
          <Card key={i} style={styles.rowCard}>
            <View style={styles.rowMain}>
              <View style={{ flex: 2 }}>
                <Text style={styles.rowLabel}>{capitalize(row.payment_mode || 'Unknown')}</Text>
              </View>
              <Text style={[styles.rowQty, { flex: 1 }]}>{row.total_orders || row.transaction_count || 0}</Text>
              <Text style={[styles.rowValue, { flex: 1, textAlign: 'right' }]}>{formatCurrency(row.total_revenue || 0)}</Text>
            </View>
          </Card>
        ))}
      </View>
    );
  };

  const renderTax = () => {
    const tax = taxData;
    if (!tax) {
      return <EmptyState icon={<Icon name="file-text" size={48} color={colors.textMuted} />} title="No data" message="No tax data for this period" />;
    }

    const summary = tax.summary || tax;
    const breakdown = tax.breakdown || tax.rates || [];

    return (
      <View>
        <View style={styles.statsGrid}>
          <StatCard
            icon={<Icon name="file-text" size={20} color="#3B82F6" />}
            label="Taxable Amount"
            value={formatCurrency(summary.taxable_amount || 0)}
            color="#3B82F6"
            style={styles.statCard}
          />
          <StatCard
            icon={<Icon name="percent" size={20} color="#EF4444" />}
            label="Tax Collected"
            value={formatCurrency(summary.tax_collected || summary.total_tax || 0)}
            color="#EF4444"
            style={styles.statCard}
          />
          <StatCard
            icon={<Icon name="dollar-sign" size={20} color="#10B981" />}
            label="Gross Amount"
            value={formatCurrency(summary.gross_amount || 0)}
            color="#10B981"
            style={styles.statCard}
          />
        </View>

        {breakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Breakdown by Tax Rate</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Tax Rate</Text>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Taxable</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Tax</Text>
            </View>
            {breakdown.map((row, i) => (
              <Card key={i} style={styles.rowCard}>
                <View style={styles.rowMain}>
                  <Text style={[styles.rowLabel, { flex: 1 }]}>{row.tax_rate || row.rate || 0}%</Text>
                  <Text style={[styles.rowQty, { flex: 1 }]}>{formatCurrency(row.taxable_amount || 0)}</Text>
                  <Text style={[styles.rowValue, { flex: 1, textAlign: 'right' }]}>{formatCurrency(row.tax_amount || row.tax_collected || 0)}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderWaiters = () => {
    const waiters = Array.isArray(waiterData) ? waiterData : (waiterData?.waiters || []);
    if (!waiters.length) {
      return <EmptyState icon={<Icon name="user" size={48} color={colors.textMuted} />} title="No data" message="No waiter data for this period" />;
    }

    return (
      <View>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 2 }]}>Waiter</Text>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>Orders</Text>
          <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Revenue</Text>
        </View>
        {waiters.map((row, i) => (
          <Card key={i} style={styles.rowCard}>
            <View style={styles.rowMain}>
              <View style={{ flex: 2 }}>
                <Text style={styles.rowLabel}>{row.waiter_name || 'Unknown'}</Text>
              </View>
              <Text style={[styles.rowQty, { flex: 1 }]}>{row.total_orders || 0}</Text>
              <Text style={[styles.rowValue, { flex: 1, textAlign: 'right' }]}>{formatCurrency(row.total_revenue || 0)}</Text>
            </View>
          </Card>
        ))}
      </View>
    );
  };

  const renderExpenses = () => {
    const expenses = Array.isArray(expenseData) ? expenseData : (expenseData?.expenses || []);
    if (!expenses.length) {
      return <EmptyState icon={<Icon name="dollar-sign" size={48} color={colors.textMuted} />} title="No data" message="No expense data for this period" />;
    }

    return (
      <View>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 2 }]}>Category</Text>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>Count</Text>
          <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Amount</Text>
        </View>
        {expenses.map((row, i) => (
          <Card key={i} style={styles.rowCard}>
            <View style={styles.rowMain}>
              <View style={{ flex: 2 }}>
                <Text style={styles.rowLabel}>{row.category || row.expense_category || 'Unknown'}</Text>
              </View>
              <Text style={[styles.rowQty, { flex: 1 }]}>{row.count || row.total_count || 0}</Text>
              <Text style={[styles.rowValue, { flex: 1, textAlign: 'right' }]}>{formatCurrency(row.total_amount || row.amount || 0)}</Text>
            </View>
          </Card>
        ))}
      </View>
    );
  };

  const renderExport = () => {
    return (
      <View>
        <Text style={styles.sectionTitle}>Download Reports</Text>
        <Text style={styles.sectionSub}>Export data as Excel files</Text>
        {EXPORT_TYPES.map((item) => (
          <Card key={item.key} style={styles.exportCard}>
            <View style={styles.exportRow}>
              <View style={[styles.exportIcon, { backgroundColor: item.color + '15' }]}>
                <Icon name={item.icon} size={20} color={item.color} />
              </View>
              <View style={styles.exportInfo}>
                <Text style={styles.exportLabel}>{item.label}</Text>
                <Text style={styles.exportSub}>Export as .xlsx</Text>
              </View>
              <Button
                variant="secondary"
                size="sm"
                icon={<Icon name="download" size={14} color={colors.primary} />}
                title="Download"
                onPress={() => handleExport(item.key)}
                loading={exporting === item.key}
                disabled={!!exporting}
              />
            </View>
          </Card>
        ))}
      </View>
    );
  };

  const showDatePicker = activeTab !== 'export';

  return (
    <View style={styles.container}>
      <Header title="Reports" onMenu={() => navigation.openDrawer()} />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} scrollable />

      {showDatePicker && (
        <DateRangePicker
          from={dates.from}
          to={dates.to}
          onFromChange={(d) => setDates((prev) => ({ ...prev, from: d }))}
          onToChange={(d) => setDates((prev) => ({ ...prev, to: d }))}
          style={styles.datePicker}
        />
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
      >
        {isLoading ? <LoadingSpinner /> : (
          <>
            {activeTab === 'sales' && renderSales()}
            {activeTab === 'items' && renderItems()}
            {activeTab === 'payments' && renderPayments()}
            {activeTab === 'tax' && renderTax()}
            {activeTab === 'waiters' && renderWaiters()}
            {activeTab === 'expenses' && renderExpenses()}
            {activeTab === 'export' && renderExport()}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  datePicker: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  content: {
    padding: spacing.base,
    paddingBottom: 40,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
  },

  // Sections
  section: {
    marginTop: spacing.base,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.base,
  },

  // Table header
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  tableHeaderText: {
    ...typography.captionBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },

  // Rows
  rowCard: {
    marginBottom: spacing.sm,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    ...typography.bodyBold,
    color: colors.text,
  },
  rowSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowQty: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  rowValue: {
    ...typography.bodyBold,
    color: colors.primary,
  },

  // Export
  exportCard: {
    marginBottom: spacing.md,
  },
  exportRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exportIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  exportInfo: {
    flex: 1,
  },
  exportLabel: {
    ...typography.bodyBold,
    color: colors.text,
  },
  exportSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
