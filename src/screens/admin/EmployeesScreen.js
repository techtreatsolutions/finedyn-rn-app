import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Alert, StyleSheet, RefreshControl, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeApi } from '../../api/employee.api';
import Header from '../../components/common/Header';
import TabBar from '../../components/common/TabBar';
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
import SearchBar from '../../components/common/SearchBar';
import { colors, spacing, radius, typography } from '../../theme';
import { formatCurrency, formatDate, formatTime, capitalize } from '../../utils/formatters';

// ── Constants ──────────────────────────────────────────────────────────
const TABS = [
  { key: 'employees', label: 'Employees' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'salary', label: 'Salary Slips' },
  { key: 'advances', label: 'Advances' },
];

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
];

const ATT_STATUS_OPTIONS = [
  { label: 'Present', value: 'present' },
  { label: 'Absent', value: 'absent' },
  { label: 'Half Day', value: 'half_day' },
  { label: 'Leave', value: 'leave' },
  { label: 'Holiday', value: 'holiday' },
];

const ADVANCE_TYPE_OPTIONS = [
  { label: 'Advance', value: 'advance' },
  { label: 'Outstanding', value: 'outstanding' },
];

const ADVANCE_STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Adjusted', value: 'adjusted' },
  { label: 'Cancelled', value: 'cancelled' },
];

const STATUS_BADGE_MAP = {
  present: 'completed',
  absent: 'cancelled',
  half_day: 'pending',
  leave: 'pending',
  holiday: 'confirmed',
};

const ADVANCE_BADGE_MAP = {
  advance: 'pending',
  outstanding: 'cancelled',
};

const ADVANCE_STATUS_BADGE_MAP = {
  pending: 'pending',
  adjusted: 'completed',
  cancelled: 'cancelled',
};

const SALARY_STATUS_BADGE_MAP = {
  paid: 'paid',
  pending: 'pending',
  unpaid: 'unpaid',
};

const INITIAL_EMP = { name: '', phone: '', department: '', designation: '', baseSalary: '', joiningDate: new Date() };
const INITIAL_ATT = { employeeId: '', date: new Date(), status: 'present', checkIn: null, checkOut: null, notes: '' };
const freshSalForm = () => ({ employeeId: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), basicSalary: '', bonus: '0', deduction: '0', advanceAdjustment: '0', outstandingAdjustment: '0', notes: '' });
const INITIAL_ADVANCE = { employeeId: '', type: 'advance', amount: '', date: new Date(), notes: '' };

function formatDateStr(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTimeStr(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function currentYear() {
  return new Date().getFullYear();
}

function yearOptions() {
  const y = currentYear();
  return Array.from({ length: 5 }, (_, i) => ({ value: y - 2 + i, label: String(y - 2 + i) }));
}

// ── Main Component ─────────────────────────────────────────────────────
export default function EmployeesScreen({ navigation }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('employees');

  // ── Employee state ──
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [empForm, setEmpForm] = useState(INITIAL_EMP);
  const [showJoiningPicker, setShowJoiningPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── Attendance state ──
  const [showAttModal, setShowAttModal] = useState(false);
  const [attForm, setAttForm] = useState(INITIAL_ATT);
  const [showAttDatePicker, setShowAttDatePicker] = useState(false);
  const [showAttCheckInPicker, setShowAttCheckInPicker] = useState(false);
  const [showAttCheckOutPicker, setShowAttCheckOutPicker] = useState(false);
  const [attFilterEmp, setAttFilterEmp] = useState('');
  const [attFilterDate, setAttFilterDate] = useState(null);
  const [showAttFilterDatePicker, setShowAttFilterDatePicker] = useState(false);
  const [attFilterMonth, setAttFilterMonth] = useState(new Date().getMonth() + 1);
  const [attFilterYear, setAttFilterYear] = useState(currentYear());

  // ── Salary state ──
  const [showSalModal, setShowSalModal] = useState(false);
  const [salForm, setSalForm] = useState(freshSalForm());
  const [salEditing, setSalEditing] = useState(null);
  const [showSalDeleteConfirm, setShowSalDeleteConfirm] = useState(false);
  const [salDeleteTarget, setSalDeleteTarget] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payDate, setPayDate] = useState(new Date());
  const [showPayDatePicker, setShowPayDatePicker] = useState(false);
  const [salFilterEmp, setSalFilterEmp] = useState('');
  const [salFilterMonth, setSalFilterMonth] = useState('');
  const [salFilterYear, setSalFilterYear] = useState(currentYear());

  // ── Advance state ──
  const [showAdvModal, setShowAdvModal] = useState(false);
  const [advForm, setAdvForm] = useState(INITIAL_ADVANCE);
  const [advEditing, setAdvEditing] = useState(null);
  const [showAdvDatePicker, setShowAdvDatePicker] = useState(false);
  const [showAdvDeleteConfirm, setShowAdvDeleteConfirm] = useState(false);
  const [advDeleteTarget, setAdvDeleteTarget] = useState(null);
  const [advFilterEmp, setAdvFilterEmp] = useState('');
  const [advFilterStatus, setAdvFilterStatus] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────
  const { data: employees = [], isLoading: empLoading, refetch: refetchEmp } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => { const r = await employeeApi.getEmployees(); return r.data || r; },
  });

  const attParams = useMemo(() => {
    const p = {};
    if (attFilterEmp) p.employeeId = attFilterEmp;
    if (attFilterDate) {
      p.date = formatDateStr(attFilterDate);
    } else {
      p.month = attFilterMonth;
      p.year = attFilterYear;
    }
    return p;
  }, [attFilterEmp, attFilterDate, attFilterMonth, attFilterYear]);

  const { data: attendance = [], isLoading: attLoading, refetch: refetchAtt } = useQuery({
    queryKey: ['attendance', attParams],
    queryFn: async () => { const r = await employeeApi.getAttendance(attParams); return r.data || r; },
    enabled: activeTab === 'attendance',
  });

  const salParams = useMemo(() => {
    const p = { year: salFilterYear };
    if (salFilterEmp) p.employeeId = salFilterEmp;
    if (salFilterMonth) p.month = salFilterMonth;
    return p;
  }, [salFilterEmp, salFilterMonth, salFilterYear]);

  const { data: salaries = [], isLoading: salLoading, refetch: refetchSal } = useQuery({
    queryKey: ['salaryRecords', salParams],
    queryFn: async () => { const r = await employeeApi.getSalaryRecords(salParams); return r.data || r; },
    enabled: activeTab === 'salary',
  });

  const advParams = useMemo(() => {
    const p = {};
    if (advFilterEmp) p.employeeId = advFilterEmp;
    if (advFilterStatus) p.status = advFilterStatus;
    return p;
  }, [advFilterEmp, advFilterStatus]);

  const { data: advances = [], isLoading: advLoading, refetch: refetchAdv } = useQuery({
    queryKey: ['advances', advParams],
    queryFn: async () => { const r = await employeeApi.getAdvances(advParams); return r.data || r; },
    enabled: activeTab === 'advances',
  });

  // Advance summary for salary modal
  const salFormEmpId = salForm.employeeId;
  const { data: advanceSummary } = useQuery({
    queryKey: ['advanceSummary', salFormEmpId],
    queryFn: async () => { const r = await employeeApi.getAdvanceSummary(salFormEmpId); return r.data || r; },
    enabled: showSalModal && !!salFormEmpId,
  });

  // Auto-fill advance/outstanding amounts when advanceSummary loads
  useEffect(() => {
    if (advanceSummary && showSalModal && !salEditing) {
      const pendingAdv = advanceSummary.total_advances || advanceSummary.pendingAdvance || advanceSummary.pending_advance || 0;
      const pendingOut = advanceSummary.total_outstanding || advanceSummary.pendingOutstanding || advanceSummary.pending_outstanding || 0;
      setSalForm(p => ({
        ...p,
        advanceAdjustment: String(pendingAdv),
        outstandingAdjustment: String(pendingOut),
      }));
    }
  }, [advanceSummary, showSalModal, salEditing]);

  // Attendance summary for salary modal
  const salFormMonth = salForm.month;
  const salFormYear = salForm.year;
  const { data: attSummaryData = [] } = useQuery({
    queryKey: ['attSummaryForSalary', salFormEmpId, salFormMonth, salFormYear],
    queryFn: async () => {
      const r = await employeeApi.getAttendance({ employeeId: salFormEmpId, month: salFormMonth, year: salFormYear });
      return r.data || r;
    },
    enabled: showSalModal && !!salFormEmpId && !!salFormMonth && !!salFormYear,
  });

  const attSummary = useMemo(() => {
    const counts = { present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0 };
    (Array.isArray(attSummaryData) ? attSummaryData : []).forEach(a => {
      if (counts[a.status] !== undefined) counts[a.status]++;
    });
    return counts;
  }, [attSummaryData]);

  // ── Mutations ────────────────────────────────────────────────────────
  const saveEmpMut = useMutation({
    mutationFn: (data) => editing ? employeeApi.updateEmployee(editing.id, data) : employeeApi.createEmployee(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['employees'] }); closeEmpModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to save employee'),
  });

  const deleteEmpMut = useMutation({
    mutationFn: (id) => employeeApi.deleteEmployee(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['employees'] }); closeDeleteConfirm(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to deactivate employee'),
  });

  const markAttMut = useMutation({
    mutationFn: ({ employeeId, ...data }) => employeeApi.markAttendance(employeeId, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['attendance'] }); closeAttModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to mark attendance'),
  });

  const processSalMut = useMutation({
    mutationFn: ({ employeeId, ...data }) => {
      if (salEditing) return employeeApi.updateSalary(employeeId, salEditing.id, data);
      return employeeApi.processSalary(employeeId, data);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['salaryRecords'] }); closeSalModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to process salary'),
  });

  const salStatusMut = useMutation({
    mutationFn: ({ employeeId, salaryId, ...data }) => employeeApi.updateSalaryStatus(employeeId, salaryId, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['salaryRecords'] }); setShowPayModal(false); setPayTarget(null); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to update status'),
  });

  const deleteSalMut = useMutation({
    mutationFn: ({ employeeId, salaryId }) => employeeApi.deleteSalary(employeeId, salaryId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['salaryRecords'] }); queryClient.invalidateQueries({ queryKey: ['advances'] }); queryClient.invalidateQueries({ queryKey: ['advanceSummary'] }); setShowSalDeleteConfirm(false); setSalDeleteTarget(null); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to delete salary'),
  });

  const saveAdvMut = useMutation({
    mutationFn: (data) => advEditing ? employeeApi.updateAdvance(advEditing.id, data) : employeeApi.createAdvance(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['advances'] }); queryClient.invalidateQueries({ queryKey: ['advanceSummary'] }); closeAdvModal(); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to save'),
  });

  const deleteAdvMut = useMutation({
    mutationFn: (id) => employeeApi.deleteAdvance(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['advances'] }); queryClient.invalidateQueries({ queryKey: ['advanceSummary'] }); queryClient.invalidateQueries({ queryKey: ['salaryRecords'] }); setShowAdvDeleteConfirm(false); setAdvDeleteTarget(null); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to delete'),
  });

  // ── Helpers / Openers / Closers ──────────────────────────────────────
  const empOptions = useMemo(() => employees
    .filter(e => e.isActive !== false && e.is_active !== false)
    .map(e => ({ label: e.name, value: String(e.id) })), [employees]);

  const allEmpOptions = useMemo(() => [{ label: 'All Employees', value: '' }, ...empOptions], [empOptions]);

  // Employee
  const closeEmpModal = () => { setShowEmpModal(false); setEditing(null); setEmpForm(INITIAL_EMP); };
  const openAddEmp = () => { setEditing(null); setEmpForm(INITIAL_EMP); setShowEmpModal(true); };
  const openEditEmp = (item) => {
    setEditing(item);
    setEmpForm({
      name: item.name || '',
      phone: item.phone || '',
      department: item.department || '',
      designation: item.designation || '',
      baseSalary: String(item.baseSalary || item.base_salary || ''),
      joiningDate: item.joiningDate || item.joining_date ? new Date(item.joiningDate || item.joining_date) : new Date(),
    });
    setShowEmpModal(true);
  };
  const closeDeleteConfirm = () => { setShowDeleteConfirm(false); setDeleteTarget(null); };

  const handleSaveEmp = () => {
    if (!empForm.name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    saveEmpMut.mutate({
      name: empForm.name.trim(),
      phone: empForm.phone.trim(),
      department: empForm.department.trim(),
      designation: empForm.designation.trim(),
      baseSalary: parseFloat(empForm.baseSalary) || 0,
      joiningDate: formatDateStr(empForm.joiningDate),
    });
  };

  // Attendance
  const closeAttModal = () => { setShowAttModal(false); setAttForm(INITIAL_ATT); };
  const openMarkAtt = (emp) => {
    setAttForm({
      ...INITIAL_ATT,
      employeeId: emp ? String(emp.id) : '',
      date: new Date(),
    });
    setShowAttModal(true);
  };

  const handleMarkAtt = () => {
    if (!attForm.employeeId || !attForm.date) { Alert.alert('Validation', 'Employee and date are required'); return; }
    const payload = {
      employeeId: attForm.employeeId,
      date: formatDateStr(attForm.date),
      status: attForm.status,
      notes: attForm.notes,
    };
    if ((attForm.status === 'present' || attForm.status === 'half_day') && attForm.checkIn) {
      payload.checkIn = formatTimeStr(attForm.checkIn);
    }
    if ((attForm.status === 'present' || attForm.status === 'half_day') && attForm.checkOut) {
      payload.checkOut = formatTimeStr(attForm.checkOut);
    }
    markAttMut.mutate(payload);
  };

  // Salary
  const closeSalModal = () => { setShowSalModal(false); setSalEditing(null); setSalForm(freshSalForm()); };
  const openProcessSal = (emp) => {
    const baseSal = emp ? String(emp.baseSalary || emp.base_salary || '') : '';
    setSalEditing(null);
    setSalForm({
      ...freshSalForm(),
      employeeId: emp ? String(emp.id) : '',
      basicSalary: baseSal,
    });
    setShowSalModal(true);
  };
  const openEditSal = (sal) => {
    setSalEditing(sal);
    setSalForm({
      employeeId: String(sal.employeeId || sal.employee_id),
      month: sal.month,
      year: sal.year,
      basicSalary: String(sal.basicSalary || sal.basic_salary || ''),
      bonus: String(sal.bonuses || sal.bonus || '0'),
      deduction: String(sal.deductions || sal.deduction || '0'),
      advanceAdjustment: String(sal.adjusted_advances || sal.advanceAdjustment || '0'),
      outstandingAdjustment: String(sal.adjusted_outstanding || sal.outstandingAdjustment || '0'),
      notes: sal.notes || '',
    });
    setShowSalModal(true);
  };

  const netSalaryCalc = useMemo(() => {
    const basic = parseFloat(salForm.basicSalary) || 0;
    const bonus = parseFloat(salForm.bonus) || 0;
    const deduction = parseFloat(salForm.deduction) || 0;
    const advAdj = parseFloat(salForm.advanceAdjustment) || 0;
    const outAdj = parseFloat(salForm.outstandingAdjustment) || 0;
    const net = basic + bonus - deduction;
    const amountToPay = net - advAdj + outAdj;
    return { basic, bonus, deduction, net, advAdj, outAdj, amountToPay };
  }, [salForm.basicSalary, salForm.bonus, salForm.deduction, salForm.advanceAdjustment, salForm.outstandingAdjustment]);

  const handleProcessSal = () => {
    if (!salForm.employeeId || !salForm.month || !salForm.year) {
      Alert.alert('Validation', 'Employee, month, and year are required');
      return;
    }
    processSalMut.mutate({
      employeeId: salForm.employeeId,
      month: salForm.month,
      year: salForm.year,
      basicSalary: parseFloat(salForm.basicSalary) || 0,
      bonuses: parseFloat(salForm.bonus) || 0,
      deductions: parseFloat(salForm.deduction) || 0,
      adjustAdvances: parseFloat(salForm.advanceAdjustment) || 0,
      adjustOutstanding: parseFloat(salForm.outstandingAdjustment) || 0,
      notes: salForm.notes,
    });
  };

  // Advances
  const closeAdvModal = () => { setShowAdvModal(false); setAdvEditing(null); setAdvForm(INITIAL_ADVANCE); };
  const openAddAdv = () => { setAdvEditing(null); setAdvForm(INITIAL_ADVANCE); setShowAdvModal(true); };
  const openEditAdv = (item) => {
    setAdvEditing(item);
    setAdvForm({
      employeeId: String(item.employeeId || item.employee_id),
      type: item.type,
      amount: String(item.amount || ''),
      date: item.date ? new Date(item.date) : new Date(),
      notes: item.notes || '',
    });
    setShowAdvModal(true);
  };

  const handleSaveAdv = () => {
    if (!advForm.employeeId || !advForm.amount) {
      Alert.alert('Validation', 'Employee and amount are required');
      return;
    }
    saveAdvMut.mutate({
      employeeId: advForm.employeeId,
      type: advForm.type,
      amount: parseFloat(advForm.amount) || 0,
      date: formatDateStr(advForm.date),
      notes: advForm.notes,
    });
  };

  // ── FAB action per tab ──
  const fabAction = () => {
    if (activeTab === 'employees') openAddEmp();
    else if (activeTab === 'attendance') openMarkAtt(null);
    else if (activeTab === 'salary') openProcessSal(null);
    else openAddAdv();
  };

  const fabLabel = activeTab === 'employees' ? 'Add Employee'
    : activeTab === 'attendance' ? 'Mark Attendance'
    : activeTab === 'salary' ? 'Process Salary'
    : 'Add Record';

  // ── Employee list item ──
  const renderEmpItem = useCallback(({ item }) => (
    <Card style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
        </View>
        <View style={styles.empInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.empName}>{item.name}</Text>
            <Badge
              status={item.isActive === false || item.is_active === false ? 'cancelled' : 'completed'}
              label={item.isActive === false || item.is_active === false ? 'Inactive' : 'Active'}
            />
          </View>
          <Text style={styles.empSub}>
            {item.department || 'No dept'} {item.designation ? `· ${item.designation}` : ''}
          </Text>
          <Text style={styles.empSub}>
            {item.phone || 'No phone'} · Joined {formatDate(item.joiningDate || item.joining_date)}
          </Text>
          <Text style={styles.empSalary}>{formatCurrency(item.baseSalary || item.base_salary)}/mo</Text>
        </View>
      </View>
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickBtn} onPress={() => openMarkAtt(item)}>
          <Icon name="check-circle" size={14} color={colors.success} />
          <Text style={[styles.quickBtnText, { color: colors.success }]}>Attendance</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => openProcessSal(item)}>
          <Icon name="dollar-sign" size={14} color={colors.info} />
          <Text style={[styles.quickBtnText, { color: colors.info }]}>Salary</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => openEditEmp(item)}>
          <Icon name="edit-2" size={14} color={colors.warning} />
          <Text style={[styles.quickBtnText, { color: colors.warning }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => { setDeleteTarget(item); setShowDeleteConfirm(true); }}>
          <Icon name="trash-2" size={14} color={colors.error} />
          <Text style={[styles.quickBtnText, { color: colors.error }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </Card>
  ), [employees]);

  // ── Attendance filters + list item ──
  // Quick attendance mark (one-tap)
  const quickMarkAtt = (empId, status) => {
    markAttMut.mutate({
      employeeId: String(empId),
      date: formatDateStr(new Date()),
      status,
    });
  };

  const renderAttFilters = () => (
    <View style={styles.filterContainer}>
      {/* Quick Mark Today */}
      <Text style={styles.sectionTitle}>Quick Mark Today</Text>
      <View style={styles.quickMarkGrid}>
        {employees.filter(e => e.isActive !== false && e.is_active !== false).map(emp => (
          <View key={emp.id} style={styles.quickMarkCard}>
            <Text style={styles.quickMarkName} numberOfLines={1}>{emp.name}</Text>
            <View style={styles.quickMarkBtns}>
              <TouchableOpacity style={[styles.quickMarkBtn, { backgroundColor: colors.success + '20' }]} onPress={() => quickMarkAtt(emp.id, 'present')}>
                <Icon name="check" size={12} color={colors.success} />
                <Text style={[styles.quickMarkBtnText, { color: colors.success }]}>P</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickMarkBtn, { backgroundColor: colors.error + '20' }]} onPress={() => quickMarkAtt(emp.id, 'absent')}>
                <Icon name="x" size={12} color={colors.error} />
                <Text style={[styles.quickMarkBtnText, { color: colors.error }]}>A</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickMarkBtn, { backgroundColor: colors.warning + '20' }]} onPress={() => quickMarkAtt(emp.id, 'half_day')}>
                <Icon name="minus" size={12} color={colors.warning} />
                <Text style={[styles.quickMarkBtnText, { color: colors.warning }]}>H</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickMarkBtn, { backgroundColor: colors.info + '20' }]} onPress={() => quickMarkAtt(emp.id, 'leave')}>
                <Icon name="calendar" size={12} color={colors.info} />
                <Text style={[styles.quickMarkBtnText, { color: colors.info }]}>L</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: spacing.base }]}>Attendance Records</Text>
      <Select
        label="Employee"
        value={attFilterEmp}
        options={allEmpOptions}
        onChange={setAttFilterEmp}
        placeholder="All Employees"
        style={styles.filterSelect}
      />
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={styles.datePickerBtn}
          onPress={() => setShowAttFilterDatePicker(true)}
        >
          <Icon name="calendar" size={16} color={colors.textSecondary} />
          <Text style={styles.datePickerText}>
            {attFilterDate ? formatDate(attFilterDate) : 'Pick date'}
          </Text>
        </TouchableOpacity>
        {attFilterDate && (
          <TouchableOpacity
            style={styles.clearDateBtn}
            onPress={() => setAttFilterDate(null)}
          >
            <Icon name="x" size={16} color={colors.error} />
            <Text style={[styles.quickBtnText, { color: colors.error }]}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
      {showAttFilterDatePicker && (
        <DateTimePicker
          value={attFilterDate || new Date()}
          mode="date"
          display="spinner"
          onChange={(e, d) => {
            if (Platform.OS === 'android') setShowAttFilterDatePicker(false);
            if (d) setAttFilterDate(d);
          }}
        />
      )}
      {Platform.OS === 'ios' && showAttFilterDatePicker && (
        <Button title="Done" size="sm" variant="ghost" onPress={() => setShowAttFilterDatePicker(false)} />
      )}
      {!attFilterDate && (
        <View style={styles.filterRow}>
          <Select
            label="Month"
            value={attFilterMonth}
            options={MONTHS}
            onChange={setAttFilterMonth}
            style={styles.filterHalf}
          />
          <Select
            label="Year"
            value={attFilterYear}
            options={yearOptions()}
            onChange={setAttFilterYear}
            style={styles.filterHalf}
          />
        </View>
      )}
    </View>
  );

  const renderAttItem = useCallback(({ item }) => (
    <Card style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.empInfo}>
          <Text style={styles.empName}>{item.employeeName || item.employee_name || `Employee #${item.employeeId || item.employee_id}`}</Text>
          <Text style={styles.empSub}>{formatDate(item.date || item.attendance_date)}</Text>
          {(item.checkIn || item.check_in) && (
            <Text style={styles.empSub}>
              In: {formatTime(item.checkIn || item.check_in)}
              {(item.checkOut || item.check_out) ? ` · Out: ${formatTime(item.checkOut || item.check_out)}` : ''}
            </Text>
          )}
          {item.notes ? <Text style={styles.empSub}>{item.notes}</Text> : null}
        </View>
        <Badge
          status={STATUS_BADGE_MAP[item.status] || 'pending'}
          label={capitalize(item.status)}
        />
      </View>
    </Card>
  ), []);

  // ── Salary filters + list item ──
  const renderSalFilters = () => (
    <View style={styles.filterContainer}>
      <Select
        label="Employee"
        value={salFilterEmp}
        options={allEmpOptions}
        onChange={setSalFilterEmp}
        placeholder="All Employees"
        style={styles.filterSelect}
      />
      <View style={styles.filterRow}>
        <Select
          label="Month"
          value={salFilterMonth}
          options={[{ label: 'All Months', value: '' }, ...MONTHS]}
          onChange={setSalFilterMonth}
          style={styles.filterHalf}
        />
        <Select
          label="Year"
          value={salFilterYear}
          options={yearOptions()}
          onChange={setSalFilterYear}
          style={styles.filterHalf}
        />
      </View>
    </View>
  );

  const renderSalItem = useCallback(({ item }) => {
    const empId = item.employeeId || item.employee_id;
    const salId = item.id;
    const status = item.paymentStatus || item.payment_status || item.status || 'pending';
    const isPaid = status === 'paid';
    const netSal = parseFloat(item.net_salary) || 0;
    const adjAdv = parseFloat(item.adjusted_advances) || 0;
    const adjOut = parseFloat(item.adjusted_outstanding) || 0;
    const amountToPay = netSal - adjAdv + adjOut;
    return (
      <Card style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.empInfo}>
            <Text style={styles.empName}>{item.employeeName || item.employee_name || `Employee #${empId}`}</Text>
            <Text style={styles.empSub}>
              {MONTHS.find(m => m.value === item.month)?.label || item.month} {item.year}
            </Text>
          </View>
          <Badge
            status={SALARY_STATUS_BADGE_MAP[status] || 'pending'}
            label={capitalize(status)}
          />
        </View>
        <View style={styles.salDetails}>
          <View style={styles.salRow}>
            <Text style={styles.salLabel}>Net Salary</Text>
            <Text style={styles.salValue}>{formatCurrency(netSal)}</Text>
          </View>
          {parseFloat(item.bonuses) > 0 && (
            <View style={styles.salRow}>
              <Text style={styles.salLabel}>Bonus</Text>
              <Text style={[styles.salValue, { color: colors.success }]}>+{formatCurrency(item.bonuses)}</Text>
            </View>
          )}
          {parseFloat(item.deductions) > 0 && (
            <View style={styles.salRow}>
              <Text style={styles.salLabel}>Deductions</Text>
              <Text style={[styles.salValue, { color: colors.error }]}>-{formatCurrency(item.deductions)}</Text>
            </View>
          )}
          {adjAdv > 0 && (
            <View style={styles.salRow}>
              <Text style={styles.salLabel}>Advance Adj.</Text>
              <Text style={[styles.salValue, { color: colors.error }]}>-{formatCurrency(adjAdv)}</Text>
            </View>
          )}
          {adjOut > 0 && (
            <View style={styles.salRow}>
              <Text style={styles.salLabel}>Outstanding Adj.</Text>
              <Text style={[styles.salValue, { color: colors.success }]}>+{formatCurrency(adjOut)}</Text>
            </View>
          )}
          <View style={[styles.salRow, styles.salRowTotal]}>
            <Text style={styles.salTotalLabel}>Amount to Pay</Text>
            <Text style={styles.salTotalValue}>{formatCurrency(amountToPay)}</Text>
          </View>
          {item.paymentDate || item.payment_date ? (
            <Text style={styles.empSub}>Paid on {formatDate(item.paymentDate || item.payment_date)}</Text>
          ) : null}
        </View>
        <View style={styles.quickActions}>
          {!isPaid && (
            <TouchableOpacity style={styles.quickBtn} onPress={() => { setPayTarget(item); setPayDate(new Date()); setShowPayModal(true); }}>
              <Icon name="check" size={14} color={colors.success} />
              <Text style={[styles.quickBtnText, { color: colors.success }]}>Mark Paid</Text>
            </TouchableOpacity>
          )}
          {isPaid && (
            <TouchableOpacity style={styles.quickBtn} onPress={() => {
              salStatusMut.mutate({ employeeId: empId, salaryId: salId, paymentStatus: 'pending' });
            }}>
              <Icon name="rotate-ccw" size={14} color={colors.warning} />
              <Text style={[styles.quickBtnText, { color: colors.warning }]}>Mark Pending</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.quickBtn} onPress={() => openEditSal(item)}>
            <Icon name="edit-2" size={14} color={colors.info} />
            <Text style={[styles.quickBtnText, { color: colors.info }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => { setSalDeleteTarget(item); setShowSalDeleteConfirm(true); }}>
            <Icon name="trash-2" size={14} color={colors.error} />
            <Text style={[styles.quickBtnText, { color: colors.error }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  }, []);

  // ── Advance filters + list item ──
  const renderAdvFilters = () => (
    <View style={styles.filterContainer}>
      <Select
        label="Employee"
        value={advFilterEmp}
        options={allEmpOptions}
        onChange={setAdvFilterEmp}
        placeholder="All Employees"
        style={styles.filterSelect}
      />
      <Select
        label="Status"
        value={advFilterStatus}
        options={ADVANCE_STATUS_OPTIONS}
        onChange={setAdvFilterStatus}
        style={styles.filterSelect}
      />
    </View>
  );

  const renderAdvItem = useCallback(({ item }) => {
    const amt = parseFloat(item.amount) || 0;
    const rem = parseFloat(item.remaining) || 0;
    const adjusted = amt - rem;
    const canEdit = item.status === 'pending' || item.status === 'active';
    return (
      <Card style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.empInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.empName}>{item.employeeName || item.employee_name || `Employee #${item.employeeId || item.employee_id}`}</Text>
              <Badge
                status={ADVANCE_BADGE_MAP[item.type] || 'pending'}
                label={capitalize(item.type)}
              />
            </View>
            <Text style={styles.empSub}>{formatDate(item.date)}</Text>
            <View style={styles.salRow}>
              <Text style={styles.salLabel}>Amount</Text>
              <Text style={styles.salValue}>{formatCurrency(amt)}</Text>
            </View>
            {adjusted > 0 && (
              <View style={styles.salRow}>
                <Text style={styles.salLabel}>Adjusted</Text>
                <Text style={[styles.salValue, { color: colors.success }]}>{formatCurrency(adjusted)} of {formatCurrency(amt)}</Text>
              </View>
            )}
            {rem > 0 && item.status !== 'adjusted' && (
              <View style={styles.salRow}>
                <Text style={styles.salLabel}>Remaining</Text>
                <Text style={[styles.salValue, { color: colors.warning }]}>{formatCurrency(rem)}</Text>
              </View>
            )}
            {item.notes ? <Text style={styles.empSub}>{item.notes}</Text> : null}
          </View>
          <Badge
            status={ADVANCE_STATUS_BADGE_MAP[item.status] || 'pending'}
            label={capitalize(item.status || 'pending')}
          />
        </View>
        <View style={styles.quickActions}>
          {canEdit && (
            <TouchableOpacity style={styles.quickBtn} onPress={() => openEditAdv(item)}>
              <Icon name="edit-2" size={14} color={colors.info} />
              <Text style={[styles.quickBtnText, { color: colors.info }]}>Edit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.quickBtn} onPress={() => { setAdvDeleteTarget(item); setShowAdvDeleteConfirm(true); }}>
            <Icon name="trash-2" size={14} color={colors.error} />
            <Text style={[styles.quickBtnText, { color: colors.error }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  }, []);

  // ── Select render/data per tab ──
  const isLoading = activeTab === 'employees' ? empLoading
    : activeTab === 'attendance' ? attLoading
    : activeTab === 'salary' ? salLoading
    : advLoading;

  const data = activeTab === 'employees' ? employees
    : activeTab === 'attendance' ? attendance
    : activeTab === 'salary' ? salaries
    : advances;

  const renderItem = activeTab === 'employees' ? renderEmpItem
    : activeTab === 'attendance' ? renderAttItem
    : activeTab === 'salary' ? renderSalItem
    : renderAdvItem;

  const refetch = activeTab === 'employees' ? refetchEmp
    : activeTab === 'attendance' ? refetchAtt
    : activeTab === 'salary' ? refetchSal
    : refetchAdv;

  const renderListHeader = () => {
    if (activeTab === 'attendance') return renderAttFilters();
    if (activeTab === 'salary') return renderSalFilters();
    if (activeTab === 'advances') return renderAdvFilters();
    return null;
  };

  const emptyIcon = activeTab === 'employees' ? 'users'
    : activeTab === 'attendance' ? 'check-circle'
    : activeTab === 'salary' ? 'dollar-sign'
    : 'credit-card';

  // ── Pre-fill base salary when employee changes in salary modal ──
  const onSalEmpChange = (v) => {
    const emp = employees.find(e => String(e.id) === v);
    setSalForm(p => ({
      ...p,
      employeeId: v,
      basicSalary: emp ? String(emp.baseSalary || emp.base_salary || '') : p.basicSalary,
    }));
  };

  // ── Main Render ──────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Header title="Employees" onMenu={() => navigation.openDrawer()} />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {isLoading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={data}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name={emptyIcon} size={48} color={colors.textMuted} />}
              title={`No ${capitalize(activeTab)}`}
              message={`Add ${activeTab} records to get started`}
              actionLabel={fabLabel}
              onAction={fabAction}
            />
          }
        />
      )}

      <FAB onPress={fabAction} />

      {/* ── Date/Time pickers rendered OUTSIDE modals (Android crash fix) ── */}
      {showJoiningPicker && (
        <DateTimePicker
          value={empForm.joiningDate instanceof Date ? empForm.joiningDate : new Date(empForm.joiningDate)}
          mode="date"
          display="spinner"
          onChange={(e, d) => {
            setShowJoiningPicker(false);
            if (d) setEmpForm(p => ({ ...p, joiningDate: d }));
          }}
        />
      )}
      {showAttDatePicker && (
        <DateTimePicker
          value={attForm.date instanceof Date ? attForm.date : new Date(attForm.date)}
          mode="date"
          display="spinner"
          onChange={(e, d) => {
            setShowAttDatePicker(false);
            if (d) setAttForm(p => ({ ...p, date: d }));
          }}
        />
      )}
      {showAttCheckInPicker && (
        <DateTimePicker
          value={attForm.checkIn instanceof Date ? attForm.checkIn : new Date()}
          mode="time"
          display="spinner"
          onChange={(e, d) => {
            setShowAttCheckInPicker(false);
            if (d) setAttForm(p => ({ ...p, checkIn: d }));
          }}
        />
      )}
      {showAttCheckOutPicker && (
        <DateTimePicker
          value={attForm.checkOut instanceof Date ? attForm.checkOut : new Date()}
          mode="time"
          display="spinner"
          onChange={(e, d) => {
            setShowAttCheckOutPicker(false);
            if (d) setAttForm(p => ({ ...p, checkOut: d }));
          }}
        />
      )}

      {/* ── Employee Modal ── */}
      <Modal visible={showEmpModal} onClose={closeEmpModal} title={editing ? 'Edit Employee' : 'Add Employee'} size="lg">
        <Input label="Name" value={empForm.name} onChangeText={v => setEmpForm(p => ({ ...p, name: v }))} placeholder="Full name" />
        <Input label="Phone" value={empForm.phone} onChangeText={v => setEmpForm(p => ({ ...p, phone: v }))} placeholder="Phone number" keyboardType="phone-pad" />
        <Input label="Department" value={empForm.department} onChangeText={v => setEmpForm(p => ({ ...p, department: v }))} placeholder="e.g. Kitchen, Service" />
        <Input label="Designation" value={empForm.designation} onChangeText={v => setEmpForm(p => ({ ...p, designation: v }))} placeholder="e.g. Chef, Waiter" />
        <Input label="Base Salary" value={empForm.baseSalary} onChangeText={v => setEmpForm(p => ({ ...p, baseSalary: v }))} keyboardType="numeric" placeholder="Monthly salary" />

        <Text style={styles.fieldLabel}>Joining Date</Text>
        <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowJoiningPicker(true)}>
          <Icon name="calendar" size={16} color={colors.textSecondary} />
          <Text style={styles.datePickerText}>{formatDate(empForm.joiningDate)}</Text>
        </TouchableOpacity>

        <Button title={editing ? 'Update Employee' : 'Add Employee'} onPress={handleSaveEmp} loading={saveEmpMut.isPending} fullWidth style={styles.modalBtn} />
      </Modal>

      {/* ── Attendance Modal ── */}
      <Modal visible={showAttModal} onClose={closeAttModal} title="Mark Attendance" size="lg">
        <Select label="Employee" value={attForm.employeeId} options={empOptions} onChange={v => setAttForm(p => ({ ...p, employeeId: v }))} placeholder="Select employee" />

        <Text style={styles.fieldLabel}>Date</Text>
        <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowAttDatePicker(true)}>
          <Icon name="calendar" size={16} color={colors.textSecondary} />
          <Text style={styles.datePickerText}>{formatDate(attForm.date)}</Text>
        </TouchableOpacity>

        <Select label="Status" value={attForm.status} options={ATT_STATUS_OPTIONS} onChange={v => setAttForm(p => ({ ...p, status: v }))} />

        {(attForm.status === 'present' || attForm.status === 'half_day') && (
          <>
            <Text style={styles.fieldLabel}>Check-in Time</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowAttCheckInPicker(true)}>
              <Icon name="clock" size={16} color={colors.textSecondary} />
              <Text style={styles.datePickerText}>
                {attForm.checkIn ? formatTimeStr(attForm.checkIn) : 'Select time'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Check-out Time</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowAttCheckOutPicker(true)}>
              <Icon name="clock" size={16} color={colors.textSecondary} />
              <Text style={styles.datePickerText}>
                {attForm.checkOut ? formatTimeStr(attForm.checkOut) : 'Select time'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <Input label="Notes" value={attForm.notes} onChangeText={v => setAttForm(p => ({ ...p, notes: v }))} placeholder="Optional notes" multiline />

        <Button title="Mark Attendance" onPress={handleMarkAtt} loading={markAttMut.isPending} fullWidth style={styles.modalBtn} />
      </Modal>

      {/* ── Salary Process/Edit Modal ── */}
      <Modal visible={showSalModal} onClose={closeSalModal} title={salEditing ? 'Edit Salary' : 'Process Salary'} size="lg">
        <Select label="Employee" value={salForm.employeeId} options={empOptions} onChange={onSalEmpChange} placeholder="Select employee" />

        <View style={styles.filterRow}>
          <Select label="Month" value={salForm.month} options={MONTHS} onChange={v => setSalForm(p => ({ ...p, month: v }))} style={styles.filterHalf} />
          <Select label="Year" value={salForm.year} options={yearOptions()} onChange={v => setSalForm(p => ({ ...p, year: v }))} style={styles.filterHalf} />
        </View>

        {/* Attendance summary */}
        {salForm.employeeId && salForm.month && salForm.year && (
          <View style={styles.summarySection}>
            <Text style={styles.sectionTitle}>Attendance Summary</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: colors.success }]}>{attSummary.present}</Text>
                <Text style={styles.summaryLabel}>Present</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: colors.error }]}>{attSummary.absent}</Text>
                <Text style={styles.summaryLabel}>Absent</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: colors.warning }]}>{attSummary.half_day}</Text>
                <Text style={styles.summaryLabel}>Half Day</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: colors.warning }]}>{attSummary.leave}</Text>
                <Text style={styles.summaryLabel}>Leave</Text>
              </View>
            </View>
          </View>
        )}

        <Input label="Basic Salary" value={salForm.basicSalary} onChangeText={v => setSalForm(p => ({ ...p, basicSalary: v }))} keyboardType="numeric" placeholder="0" />
        <View style={styles.filterRow}>
          <Input label="Bonus" value={salForm.bonus} onChangeText={v => setSalForm(p => ({ ...p, bonus: v }))} keyboardType="numeric" placeholder="0" style={styles.filterHalf} />
          <Input label="Deduction" value={salForm.deduction} onChangeText={v => setSalForm(p => ({ ...p, deduction: v }))} keyboardType="numeric" placeholder="0" style={styles.filterHalf} />
        </View>

        {/* Advance/Outstanding Adjustment */}
        {salForm.employeeId && advanceSummary && (
          <View style={styles.summarySection}>
            <Text style={styles.sectionTitle}>Advance/Outstanding Adjustment</Text>
            <Text style={styles.empSub}>
              Pending Advances: {formatCurrency(advanceSummary.total_advances || advanceSummary.pendingAdvance || advanceSummary.pending_advance || 0)}
            </Text>
            <Text style={styles.empSub}>
              Pending Outstanding: {formatCurrency(advanceSummary.total_outstanding || advanceSummary.pendingOutstanding || advanceSummary.pending_outstanding || 0)}
            </Text>
          </View>
        )}
        <View style={styles.filterRow}>
          <Input label="Advance Deduct" value={salForm.advanceAdjustment} onChangeText={v => setSalForm(p => ({ ...p, advanceAdjustment: v }))} keyboardType="numeric" placeholder="0" style={styles.filterHalf} />
          <Input label="Outstanding Add" value={salForm.outstandingAdjustment} onChangeText={v => setSalForm(p => ({ ...p, outstandingAdjustment: v }))} keyboardType="numeric" placeholder="0" style={styles.filterHalf} />
        </View>

        {/* Net salary display */}
        <View style={styles.netSalaryBox}>
          <Text style={styles.sectionTitle}>Net Calculation</Text>
          <View style={styles.salRow}>
            <Text style={styles.salLabel}>Salary ({formatCurrency(netSalaryCalc.basic)} + {formatCurrency(netSalaryCalc.bonus)} - {formatCurrency(netSalaryCalc.deduction)})</Text>
            <Text style={styles.salValue}>{formatCurrency(netSalaryCalc.net)}</Text>
          </View>
          {netSalaryCalc.advAdj > 0 && (
            <View style={styles.salRow}>
              <Text style={styles.salLabel}>Advance Deducted</Text>
              <Text style={[styles.salValue, { color: colors.error }]}>-{formatCurrency(netSalaryCalc.advAdj)}</Text>
            </View>
          )}
          {netSalaryCalc.outAdj > 0 && (
            <View style={styles.salRow}>
              <Text style={styles.salLabel}>Outstanding Added</Text>
              <Text style={[styles.salValue, { color: colors.success }]}>+{formatCurrency(netSalaryCalc.outAdj)}</Text>
            </View>
          )}
          <View style={[styles.salRow, styles.salRowTotal]}>
            <Text style={styles.salTotalLabel}>Amount to Pay</Text>
            <Text style={styles.salTotalValue}>{formatCurrency(netSalaryCalc.amountToPay)}</Text>
          </View>
        </View>

        <Input label="Notes" value={salForm.notes} onChangeText={v => setSalForm(p => ({ ...p, notes: v }))} placeholder="Optional notes" multiline />

        <Button title={salEditing ? 'Update Salary' : 'Process Salary'} onPress={handleProcessSal} loading={processSalMut.isPending} fullWidth style={styles.modalBtn} />
      </Modal>

      {/* ── Pay date & advance date pickers OUTSIDE modals ── */}
      {showPayDatePicker && (
        <DateTimePicker
          value={payDate}
          mode="date"
          display="spinner"
          onChange={(e, d) => {
            setShowPayDatePicker(false);
            if (d) setPayDate(d);
          }}
        />
      )}
      {showAdvDatePicker && (
        <DateTimePicker
          value={advForm.date instanceof Date ? advForm.date : new Date(advForm.date)}
          mode="date"
          display="spinner"
          onChange={(e, d) => {
            setShowAdvDatePicker(false);
            if (d) setAdvForm(p => ({ ...p, date: d }));
          }}
        />
      )}

      {/* ── Mark Paid Modal ── */}
      <Modal visible={showPayModal} onClose={() => { setShowPayModal(false); setPayTarget(null); }} title="Mark Salary as Paid" size="sm">
        <Text style={styles.fieldLabel}>Payment Date</Text>
        <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowPayDatePicker(true)}>
          <Icon name="calendar" size={16} color={colors.textSecondary} />
          <Text style={styles.datePickerText}>{formatDate(payDate)}</Text>
        </TouchableOpacity>
        <Button
          title="Mark Paid"
          onPress={() => {
            if (!payTarget) return;
            salStatusMut.mutate({
              employeeId: payTarget.employeeId || payTarget.employee_id,
              salaryId: payTarget.id,
              paymentStatus: 'paid',
              paymentDate: formatDateStr(payDate),
            });
          }}
          loading={salStatusMut.isPending}
          fullWidth
          style={styles.modalBtn}
        />
      </Modal>

      {/* ── Advance/Outstanding Modal ── */}
      <Modal visible={showAdvModal} onClose={closeAdvModal} title={advEditing ? 'Edit Record' : 'Add Advance/Outstanding'} size="lg">
        <Select label="Employee" value={advForm.employeeId} options={empOptions} onChange={v => setAdvForm(p => ({ ...p, employeeId: v }))} placeholder="Select employee" />
        <Select label="Type" value={advForm.type} options={ADVANCE_TYPE_OPTIONS} onChange={v => setAdvForm(p => ({ ...p, type: v }))} />
        <Input label="Amount" value={advForm.amount} onChangeText={v => setAdvForm(p => ({ ...p, amount: v }))} keyboardType="numeric" placeholder="0" />

        <Text style={styles.fieldLabel}>Date</Text>
        <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowAdvDatePicker(true)}>
          <Icon name="calendar" size={16} color={colors.textSecondary} />
          <Text style={styles.datePickerText}>{formatDate(advForm.date)}</Text>
        </TouchableOpacity>

        <Input label="Notes" value={advForm.notes} onChangeText={v => setAdvForm(p => ({ ...p, notes: v }))} placeholder="Optional notes" multiline />

        <Button title={advEditing ? 'Update' : 'Add Record'} onPress={handleSaveAdv} loading={saveAdvMut.isPending} fullWidth style={styles.modalBtn} />
      </Modal>

      {/* ── Confirm Modals ── */}
      <ConfirmModal
        visible={showDeleteConfirm}
        onClose={closeDeleteConfirm}
        onConfirm={() => deleteEmpMut.mutate(deleteTarget?.id)}
        title="Deactivate Employee"
        message={`Are you sure you want to deactivate ${deleteTarget?.name || 'this employee'}? This action can be undone later.`}
        confirmText="Deactivate"
        confirmVariant="danger"
        loading={deleteEmpMut.isPending}
      />

      <ConfirmModal
        visible={showSalDeleteConfirm}
        onClose={() => { setShowSalDeleteConfirm(false); setSalDeleteTarget(null); }}
        onConfirm={() => {
          if (!salDeleteTarget) return;
          deleteSalMut.mutate({
            employeeId: salDeleteTarget.employeeId || salDeleteTarget.employee_id,
            salaryId: salDeleteTarget.id,
          });
        }}
        title="Delete Salary Record"
        message="Are you sure you want to delete this salary record? This cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
        loading={deleteSalMut.isPending}
      />

      <ConfirmModal
        visible={showAdvDeleteConfirm}
        onClose={() => { setShowAdvDeleteConfirm(false); setAdvDeleteTarget(null); }}
        onConfirm={() => deleteAdvMut.mutate(advDeleteTarget?.id)}
        title="Delete Record"
        message="Are you sure you want to delete this advance/outstanding record?"
        confirmText="Delete"
        confirmVariant="danger"
        loading={deleteAdvMut.isPending}
      />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.base, paddingBottom: 80 },
  card: { marginBottom: spacing.md },
  cardContent: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: { ...typography.bodyBold, color: colors.primary },
  empInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  empName: { ...typography.bodyBold, color: colors.text },
  empSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  empSalary: { ...typography.captionBold, color: colors.text, marginTop: 4 },
  quickActions: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    marginTop: spacing.md, paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    borderRadius: radius.sm, backgroundColor: colors.surface,
  },
  quickBtnText: { ...typography.tiny, fontWeight: '600', marginLeft: 4 },

  // Filters
  filterContainer: { marginBottom: spacing.md },
  filterSelect: { marginBottom: spacing.sm },
  filterRow: { flexDirection: 'row', gap: spacing.md },
  filterHalf: { flex: 1 },

  // Date picker button
  datePickerBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    marginBottom: spacing.base,
  },
  datePickerText: { ...typography.body, color: colors.text, marginLeft: spacing.sm },
  clearDateBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.md,
  },

  // Field label (for date pickers outside Input)
  fieldLabel: { ...typography.captionBold, color: colors.text, marginBottom: spacing.xs },

  // Salary details
  salDetails: {
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  salRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  salLabel: { ...typography.caption, color: colors.textSecondary },
  salValue: { ...typography.captionBold, color: colors.text },
  salRowTotal: {
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  salTotalLabel: { ...typography.bodyBold, color: colors.text },
  salTotalValue: { ...typography.bodyBold, color: colors.primary },

  // Summary section in salary modal
  summarySection: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.base,
  },
  sectionTitle: { ...typography.captionBold, color: colors.text, marginBottom: spacing.sm },
  summaryGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center' },
  summaryCount: { ...typography.h3, fontWeight: '700' },
  summaryLabel: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },

  // Net salary box
  netSalaryBox: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.base,
  },

  modalBtn: { marginTop: spacing.base },

  // Quick mark attendance
  quickMarkGrid: { gap: spacing.sm, marginBottom: spacing.md },
  quickMarkCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  quickMarkName: { ...typography.captionBold, color: colors.text, flex: 1, marginRight: spacing.sm },
  quickMarkBtns: { flexDirection: 'row', gap: 6 },
  quickMarkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm,
  },
  quickMarkBtnText: { ...typography.tiny, fontWeight: '700' },
});
