import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Alert, StyleSheet,
  RefreshControl, Platform, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expenseApi } from '../../api/expense.api';
import Header from '../../components/common/Header';
import FAB from '../../components/common/FAB';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { colors, spacing, radius, typography } from '../../theme';
import { formatCurrency, formatDate, capitalize } from '../../utils/formatters';

// Single tab - no categories

const PAYMENT_MODES = [
  { label: 'Cash', value: 'cash' },
  { label: 'Card', value: 'card' },
  { label: 'UPI', value: 'upi' },
  { label: 'Cheque', value: 'cheque' },
  { label: 'Bank Transfer', value: 'bank_transfer' },
];

const STATUS_VARIANT = {
  approved: 'success',
  rejected: 'danger',
  pending: 'warning',
};

const PAGE_SIZE = 15;

const INITIAL_EXPENSE = {
  title: '',
  amount: '',
  paymentMode: 'cash',
  expenseDate: new Date(),
  notes: '',
};

export default function ExpensesScreen({ navigation }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  // Modal state
  const [showExpModal, setShowExpModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Edit state
  const [expForm, setExpForm] = useState(INITIAL_EXPENSE);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── Queries ────────────────────────────────────────────────────────────

  const {
    data: expensesData,
    isLoading: expLoading,
    refetch: refetchExp,
  } = useQuery({
    queryKey: ['expenses', page],
    queryFn: async () => {
      const r = await expenseApi.getExpenses({ page, limit: PAGE_SIZE });
      const d = r.data || r;
      return {
        expenses: Array.isArray(d) ? d : d?.expenses || [],
        total: d?.total || (Array.isArray(d) ? d.length : 0),
      };
    },
  });

  const expenses = expensesData?.expenses || [];
  const totalExpenseRecords = expensesData?.total || 0;

  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['expenseSummary'],
    queryFn: async () => {
      const r = await expenseApi.getSummary();
      return r.data || r;
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────

  const invalidateExpenses = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['expenseSummary'] });
  };

  const createExpMut = useMutation({
    mutationFn: (data) => expenseApi.createExpense(data),
    onSuccess: () => { invalidateExpenses(); closeExpModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to save expense'),
  });

  const deleteExpMut = useMutation({
    mutationFn: (id) => expenseApi.deleteExpense(id),
    onSuccess: () => { invalidateExpenses(); closeDelete(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to delete'),
  });

  const approveExpMut = useMutation({
    mutationFn: ({ id, data }) => expenseApi.approveExpense(id, data),
    onSuccess: () => { invalidateExpenses(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to update status'),
  });

  // ── Modal helpers ──────────────────────────────────────────────────────

  const closeExpModal = () => {
    setShowExpModal(false);
    setExpForm(INITIAL_EXPENSE);
  };

  const closeDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  const openAddExp = () => {
    setExpForm(INITIAL_EXPENSE);
    setShowExpModal(true);
  };

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSaveExp = () => {
    if (!expForm.title.trim() || !expForm.amount) {
      Alert.alert('Validation', 'Title and amount are required');
      return;
    }
    const payload = {
      title: expForm.title.trim(),
      amount: parseFloat(expForm.amount),
      paymentMode: expForm.paymentMode,
      expenseDate: expForm.expenseDate.toISOString().split('T')[0],
      notes: expForm.notes.trim(),
    };
    createExpMut.mutate(payload);
  };

  const handleApprove = (id) => {
    approveExpMut.mutate({ id, data: { status: 'approved' } });
  };

  const handleReject = (id) => {
    approveExpMut.mutate({ id, data: { status: 'rejected' } });
  };

  const handleDeleteConfirm = () => {
    deleteExpMut.mutate(deleteTarget?.item?.id);
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setExpForm((p) => ({ ...p, expenseDate: selectedDate }));
    }
  };

  const handleEndReached = () => {
    if (page * PAGE_SIZE < totalExpenseRecords) {
      setPage((prev) => prev + 1);
    }
  };

  // ── Render items ───────────────────────────────────────────────────────

  const renderExpItem = useCallback(({ item }) => {
    const status = item.status || 'pending';
    const isPending = status === 'pending';
    const isApproved = status === 'approved';

    return (
      <Card style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.expIcon}>
            <Icon name="credit-card" size={18} color={colors.primary} />
          </View>
          <View style={styles.expInfo}>
            <Text style={styles.expTitle} numberOfLines={1}>{item.title}</Text>
            {item.category_name ? <Text style={styles.expSub} numberOfLines={1}>{item.category_name}</Text> : null}
            <View style={styles.metaRow}>
              <Badge label={capitalize(item.payment_mode || item.paymentMode || 'cash')} variant="info" size="sm" />
              <Text style={styles.metaDate}>{formatDate(item.expense_date || item.expenseDate || item.date)}</Text>
            </View>
            {item.notes ? <Text style={styles.expNotes} numberOfLines={2}>{item.notes}</Text> : null}
          </View>
          <View style={styles.expRight}>
            <Text style={styles.expAmount}>{formatCurrency(item.amount)}</Text>
            <Badge
              label={capitalize(status)}
              variant={STATUS_VARIANT[status] || 'default'}
              size="sm"
            />
            <View style={styles.expActions}>
              {isPending && (
                <>
                  <TouchableOpacity
                    onPress={() => handleApprove(item.id)}
                    style={styles.actionBtn}
                  >
                    <Icon name="check" size={14} color={colors.success} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleReject(item.id)}
                    style={styles.actionBtn}
                  >
                    <Icon name="x" size={14} color={colors.error} />
                  </TouchableOpacity>
                </>
              )}
              {!isApproved && (
                <TouchableOpacity
                  onPress={() => {
                    setDeleteTarget({ type: 'expense', item });
                    setShowDeleteConfirm(true);
                  }}
                  style={styles.actionBtn}
                >
                  <Icon name="trash-2" size={14} color={colors.error} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Card>
    );
  }, []);

  // ── Summary cards ──────────────────────────────────────────────────────

  const renderSummary = () => (
    <View style={styles.summaryRow}>
      <StatCard
        icon={<Icon name="check-circle" size={20} color={colors.success} />}
        label="Approved Expenses"
        value={formatCurrency(summary?.approvedTotal || summary?.approved_total || 0)}
        color={colors.success}
        style={styles.statCard}
      />
      <StatCard
        icon={<Icon name="clock" size={20} color={colors.warning} />}
        label="Pending Approval"
        value={formatCurrency(summary?.pendingTotal || summary?.pending_total || 0)}
        color={colors.warning}
        style={styles.statCard}
      />
    </View>
  );

  // ── Main render ────────────────────────────────────────────────────────

  const isLoading = expLoading || summaryLoading;

  return (
    <View style={styles.container}>
      <Header title="Expenses" onMenu={() => navigation.openDrawer()} />

      {isLoading ? (
        <LoadingSpinner fullScreen />
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderExpItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={renderSummary}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => { refetchExp(); refetchSummary(); }}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="credit-card" size={48} color={colors.textMuted} />}
              title="No expenses"
              message="Track your restaurant expenses"
              actionLabel="Add Expense"
              onAction={openAddExp}
            />
          }
        />
      )}

      <FAB onPress={openAddExp} />

      {/* ── Date picker rendered OUTSIDE modal (Android crash fix) ── */}
      {showDatePicker && (
        <DateTimePicker
          value={expForm.expenseDate}
          mode="date"
          display="spinner"
          onChange={handleDateChange}
          maximumDate={new Date()}
        />
      )}

      {/* ── Add Expense Modal ────────────────────────────────────────────── */}
      <Modal
        visible={showExpModal}
        onClose={closeExpModal}
        title="Add Expense"
        size="lg"
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <Input
            label="Title"
            value={expForm.title}
            onChangeText={(v) => setExpForm((p) => ({ ...p, title: v }))}
            placeholder="Expense title"
          />
          <Input
            label="Amount"
            value={expForm.amount}
            onChangeText={(v) => setExpForm((p) => ({ ...p, amount: v }))}
            keyboardType="numeric"
            placeholder="0.00"
          />
          <Select
            label="Payment Mode"
            value={expForm.paymentMode}
            options={PAYMENT_MODES}
            onChange={(v) => setExpForm((p) => ({ ...p, paymentMode: v }))}
          />

          {/* Date Picker */}
          <Text style={styles.dateLabel}>Date</Text>
          <TouchableOpacity
            style={styles.datePickerBtn}
            onPress={() => setShowDatePicker(true)}
          >
            <Icon name="calendar" size={16} color={colors.textSecondary} />
            <Text style={styles.datePickerText}>
              {formatDate(expForm.expenseDate)}
            </Text>
          </TouchableOpacity>

          <Input
            label="Notes"
            value={expForm.notes}
            onChangeText={(v) => setExpForm((p) => ({ ...p, notes: v }))}
            placeholder="Optional notes"
            multiline
            numberOfLines={3}
          />
          <Button
            title="Add Expense"
            onPress={handleSaveExp}
            loading={createExpMut.isPending}
            fullWidth
            style={styles.modalBtn}
          />
        </ScrollView>
      </Modal>

      {/* ── Delete Confirm ───────────────────────────────────────────────── */}
      <ConfirmModal
        visible={showDeleteConfirm}
        onClose={closeDelete}
        onConfirm={handleDeleteConfirm}
        title="Delete Expense"
        message="Are you sure you want to delete this expense? This action cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
        loading={deleteExpMut.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  list: {
    padding: spacing.base,
    paddingBottom: 80,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  statCard: {
    flex: 1,
  },
  card: {
    marginBottom: spacing.md,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  expInfo: {
    flex: 1,
  },
  expTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  expSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  expNotes: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  metaDate: {
    ...typography.caption,
    color: colors.textMuted,
  },
  expRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  expAmount: {
    ...typography.bodyBold,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  expActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionBtn: {
    padding: spacing.xs,
  },
  dateLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  datePickerText: {
    ...typography.body,
    color: colors.text,
  },
  modalBtn: {
    marginTop: spacing.base,
  },
});
