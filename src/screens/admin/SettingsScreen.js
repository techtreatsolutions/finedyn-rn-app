import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, Switch, TouchableOpacity, Alert, StyleSheet, Image, Share,
  ActivityIndicator, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Feather';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { launchImageLibrary } from 'react-native-image-picker';
import { restaurantApi } from '../../api/restaurant.api';
import { paymentApi } from '../../api/payment.api';
import { authApi } from '../../api/auth.api';
import Header from '../../components/common/Header';
import TabBar from '../../components/common/TabBar';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { colors, spacing, radius, typography } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import ThermalPrinter from '../../utils/thermalPrinter';

const NOTIF_STORAGE_KEY = '@dinesys_push_notifications_enabled';

const PAYMENT_ACCEPTANCE_OPTIONS = [
  { label: 'Online + Pay at Counter', value: 'both' },
  { label: 'Online Payment Only', value: 'online' },
  { label: 'Pay at Counter Only', value: 'counter' },
];

const GATEWAY_OPTIONS = [
  { label: 'Razorpay', value: 'razorpay' },
  { label: 'Instamojo', value: 'instamojo' },
];

export default function SettingsScreen({ navigation }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isQR = user?.restaurantType === 'qr';

  // Build tabs dynamically based on restaurant type
  const TABS = useMemo(() => {
    const tabs = [{ key: 'profile', label: 'Profile' }];
    if (isQR) {
      tabs.push({ key: 'qr-ordering', label: 'QR Ordering' });
      tabs.push({ key: 'payments', label: 'Payment' });
    } else {
      tabs.push({ key: 'billing', label: 'Bill Format' });
    }
    tabs.push({ key: 'printer', label: 'Printer' });
    tabs.push({ key: 'whatsapp', label: 'WhatsApp' });
    tabs.push({ key: 'notifications', label: 'Notifications' });
    tabs.push({ key: 'account', label: 'Account' });
    return tabs;
  }, [isQR]);

  const [activeTab, setActiveTab] = useState('profile');
  const [profileForm, setProfileForm] = useState(null);
  const [billForm, setBillForm] = useState(null);
  const [waForm, setWAForm] = useState(null);
  const [qrForm, setQRForm] = useState({ enable_dine_in: true, enable_takeaway: true, enable_delivery: false, payment_acceptance: 'both', require_otp: true, is_accepting_orders: true });
  const [gatewayForm, setGatewayForm] = useState({ gatewayName: 'razorpay', apiKey: '', apiSecret: '', _exists: false, maskedKey: '', maskedSecret: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pushEnabled, setPushEnabled] = useState(true);
  const [standaloneQR, setStandaloneQR] = useState(null);
  const [qrGenerating, setQrGenerating] = useState(false);

  // Printer state
  const [printerScanning, setPrinterScanning] = useState(false);
  const [printerDevices, setPrinterDevices] = useState([]);
  const [savedBillPrinter, setSavedBillPrinter] = useState(null);
  const [savedKOTPrinter, setSavedKOTPrinter] = useState(null);
  const [printerConnecting, setPrinterConnecting] = useState(null); // address of connecting device
  const [printerTesting, setPrinterTesting] = useState(null); // 'bill' | 'kot'
  const [printerType, setPrinterType] = useState('bill'); // which printer we're configuring: 'bill' | 'kot'
  const [billImageUploading, setBillImageUploading] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_STORAGE_KEY).then(val => {
      if (val !== null) setPushEnabled(val === 'true');
    });
  }, []);

  // ── Queries ──

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['restaurantProfile'],
    queryFn: async () => {
      const r = await restaurantApi.getProfile();
      const d = r.data || r;
      setProfileForm({
        name: d.name || '', phone: d.phone || '', address: d.address || '',
        city: d.city || '', state: d.state || '', pincode: d.pincode || '',
        gstin: d.gstin || '', fssaiNumber: d.fssai_number || '',
        timezone: d.timezone || 'Asia/Kolkata', billPrefix: d.bill_prefix || '',
      });
      return d;
    },
    enabled: activeTab === 'profile' || activeTab === 'whatsapp',
  });

  const { isLoading: billLoading } = useQuery({
    queryKey: ['billFormat'],
    queryFn: async () => {
      const r = await restaurantApi.getBillFormat();
      const d = r.data || r;
      setBillForm({
        showRestaurantName: !!d.show_restaurant_name, showLogo: !!d.show_logo,
        showAddress: !!d.show_address, showContact: !!d.show_contact,
        showGst: !!d.show_gst, showWaiterName: !!d.show_waiter_name,
        showTableNumber: !!d.show_table_number, showDateTime: !!d.show_date_time,
        showPaymentMode: !!d.show_payment_mode, showCustomerDetails: !!d.show_customer_details,
        enableTax: !!d.enable_tax, customHeader: d.custom_header || '',
        customFooter: d.custom_footer || '', thankYouMessage: d.thank_you_message || '',
        headerImageUrl: d.header_image_url || '', footerImageUrl: d.footer_image_url || '',
        billPrinterSizeMm: String(d.bill_printer_size_mm || 80),
        kotPrinterSizeMm: String(d.kot_printer_size_mm || 80),
      });
      return d;
    },
    enabled: activeTab === 'billing' || activeTab === 'qr-ordering',
  });

  const { isLoading: waLoading } = useQuery({
    queryKey: ['waSettings'],
    queryFn: async () => {
      const r = await restaurantApi.getWASettings();
      const d = r.data || r;
      setWAForm({
        wa_messaging_mode: String(d.wa_messaging_mode || 1),
        google_review_url: d.google_review_url || '',
      });
      return d;
    },
    enabled: activeTab === 'whatsapp',
  });

  const { isLoading: qrLoading } = useQuery({
    queryKey: ['qrSettings'],
    queryFn: async () => {
      const r = await restaurantApi.getQRSettings();
      const d = r.data || r;
      setQRForm({
        enable_dine_in: !!d.enable_dine_in,
        enable_takeaway: !!d.enable_takeaway,
        enable_delivery: !!d.enable_delivery,
        payment_acceptance: d.payment_acceptance || 'both',
        require_otp: d.require_otp !== undefined ? !!d.require_otp : true,
        is_accepting_orders: d.is_accepting_orders !== undefined ? !!d.is_accepting_orders : true,
      });
      return d;
    },
    enabled: activeTab === 'qr-ordering',
  });

  const { isLoading: gwLoading } = useQuery({
    queryKey: ['gatewaySettings'],
    queryFn: async () => {
      const r = await paymentApi.getGatewaySettings();
      const d = r.data || r;
      if (Array.isArray(d) && d.length > 0) {
        const g = d[0];
        setGatewayForm({
          gatewayName: g.gateway_name || g.gateway || 'razorpay',
          apiKey: '', apiSecret: '',
          _exists: true,
          maskedKey: g.maskedKey || '',
          maskedSecret: g.maskedSecret || '',
        });
      }
      return d;
    },
    enabled: activeTab === 'payments' || activeTab === 'qr-ordering',
  });

  // ── Mutations ──

  const updateProfileMut = useMutation({
    mutationFn: (data) => restaurantApi.updateProfile(data),
    onSuccess: () => { Alert.alert('Success', 'Profile updated'); queryClient.invalidateQueries({ queryKey: ['restaurantProfile'] }); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed'),
  });

  const updateBillMut = useMutation({
    mutationFn: (data) => restaurantApi.updateBillFormat(data),
    onSuccess: () => { Alert.alert('Success', 'Bill format updated'); queryClient.invalidateQueries({ queryKey: ['billFormat'] }); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed'),
  });

  const updateWAMut = useMutation({
    mutationFn: (data) => restaurantApi.updateWASettings(data),
    onSuccess: () => { Alert.alert('Success', 'WA settings updated'); queryClient.invalidateQueries({ queryKey: ['waSettings'] }); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed'),
  });

  const changePassMut = useMutation({
    mutationFn: (data) => authApi.changePassword(data.currentPassword, data.newPassword),
    onSuccess: () => { Alert.alert('Success', 'Password changed'); setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed'),
  });

  const updateQRSettingsMut = useMutation({
    mutationFn: (s) => restaurantApi.updateQRSettings({
      enableDineIn: s.enable_dine_in,
      enableTakeaway: s.enable_takeaway,
      enableDelivery: s.enable_delivery,
      paymentAcceptance: s.payment_acceptance,
      requireOtp: s.require_otp,
      isAcceptingOrders: s.is_accepting_orders,
    }),
    onSuccess: () => { Alert.alert('Success', 'QR settings saved'); queryClient.invalidateQueries({ queryKey: ['qrSettings'] }); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed'),
  });

  const saveGatewayMut = useMutation({
    mutationFn: (data) => paymentApi.saveGatewaySettings(data),
    onSuccess: () => { Alert.alert('Success', 'Gateway settings saved'); queryClient.invalidateQueries({ queryKey: ['gatewaySettings'] }); },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed'),
  });

  // ── Bill image upload helper ──

  const handleBillImageUpload = async (type) => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (result.didCancel || !result.assets?.length) return;
    const asset = result.assets[0];
    if (asset.fileSize > 5 * 1024 * 1024) { Alert.alert('Error', 'Max 5MB allowed'); return; }
    setBillImageUploading(type);
    try {
      const formData = new FormData();
      formData.append('image', { uri: asset.uri, type: asset.type || 'image/jpeg', name: asset.fileName || `${type}.jpg` });
      const r = await restaurantApi.uploadBillImage(type, formData);
      const imageUrl = r?.data?.imageUrl || r?.imageUrl || '';
      if (type === 'header') setBillForm(p => ({ ...p, headerImageUrl: imageUrl }));
      else setBillForm(p => ({ ...p, footerImageUrl: imageUrl }));
      Alert.alert('Success', 'Image uploaded');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Upload failed');
    } finally {
      setBillImageUploading(null);
    }
  };

  // ── Logo upload helper ──

  const handleLogoUpload = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (result.didCancel || !result.assets?.length) return;
    const asset = result.assets[0];
    if (asset.fileSize > 5 * 1024 * 1024) { Alert.alert('Error', 'Max 5MB allowed'); return; }
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', { uri: asset.uri, type: asset.type || 'image/jpeg', name: asset.fileName || 'logo.jpg' });
      const r = await restaurantApi.uploadLogo(formData);
      const logoUrl = r?.data?.imageUrl || r?.imageUrl || '';
      if (logoUrl) {
        // Save the logo URL to the restaurant profile
        await restaurantApi.updateProfile({ ...profileForm, logoUrl });
        queryClient.invalidateQueries({ queryKey: ['restaurantProfile'] });
        Alert.alert('Success', 'Logo uploaded successfully');
      }
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
    }
  };

  // ── Standalone QR ──

  const handleGenerateStandaloneQR = async () => {
    setQrGenerating(true);
    try {
      const res = await restaurantApi.generateStandaloneQR();
      setStandaloneQR(res.data || res);
      Alert.alert('Success', 'Standalone QR code generated');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to generate QR');
    } finally {
      setQrGenerating(false);
    }
  };

  const handleShareStandaloneQR = async () => {
    const url = standaloneQR?.qrUrl;
    if (!url) return;
    try {
      await Share.share({ message: `Order from our restaurant: ${url}`, url });
    } catch {}
  };

  // ── WA mode options ──

  const waModeOptions = [
    { label: '1. Send Only E-bill (1 token)', value: '1' },
    { label: '2. E-bill + Review in same message (3.5 tokens)', value: '2' },
    { label: '3. E-bill + Review as separate messages (4.5 tokens)', value: '3' },
  ];

  // ── Render: Profile ──

  const renderProfile = () => {
    if (profileLoading || !profileForm) return <LoadingSpinner />;
    return (
      <View>
        <Input label="Restaurant Name" value={profileForm.name} onChangeText={v => setProfileForm(p => ({ ...p, name: v }))} />
        <Input label="Phone" value={profileForm.phone} onChangeText={v => setProfileForm(p => ({ ...p, phone: v }))} keyboardType="phone-pad" />
        <Input label="Address" value={profileForm.address} onChangeText={v => setProfileForm(p => ({ ...p, address: v }))} multiline />
        <View style={styles.row}>
          <Input label="City" value={profileForm.city} onChangeText={v => setProfileForm(p => ({ ...p, city: v }))} style={styles.half} />
          <Input label="State" value={profileForm.state} onChangeText={v => setProfileForm(p => ({ ...p, state: v }))} style={styles.half} />
        </View>
        <View style={styles.row}>
          <Input label="Pincode" value={profileForm.pincode} onChangeText={v => setProfileForm(p => ({ ...p, pincode: v }))} keyboardType="numeric" style={styles.half} />
          <Input label="Bill Prefix" value={profileForm.billPrefix} onChangeText={v => setProfileForm(p => ({ ...p, billPrefix: v }))} style={styles.half} />
        </View>
        <Input label="GSTIN" value={profileForm.gstin} onChangeText={v => setProfileForm(p => ({ ...p, gstin: v }))} />
        <Input label="FSSAI Number" value={profileForm.fssaiNumber} onChangeText={v => setProfileForm(p => ({ ...p, fssaiNumber: v }))} />

        {/* Restaurant Logo */}
        <View style={styles.imageField}>
          <Text style={styles.imageFieldLabel}>Restaurant Logo</Text>
          {profile?.logo_url ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image source={{ uri: profile.logo_url }} style={styles.logoPreview} resizeMode="contain" />
              <TouchableOpacity style={styles.logoChangeBtn} onPress={handleLogoUpload} disabled={logoUploading}>
                {logoUploading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.logoChangeBtnText}>Change Logo</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.imageUploadBtn} onPress={handleLogoUpload} disabled={logoUploading}>
              {logoUploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Icon name="upload" size={14} color={colors.textMuted} />
                  <Text style={styles.imageUploadText}>Upload Logo</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <Button title="Save Profile" onPress={() => updateProfileMut.mutate(profileForm)} loading={updateProfileMut.isPending} fullWidth style={styles.saveBtn} />
      </View>
    );
  };

  // ── Render: Bill Format ──

  const renderBillImageField = (label, value, type) => (
    <View style={styles.imageField}>
      <Text style={styles.imageFieldLabel}>{label}</Text>
      {value ? (
        <View style={styles.imagePreviewRow}>
          <Image source={{ uri: value }} style={styles.imagePreview} resizeMode="contain" />
          <TouchableOpacity
            style={styles.imageRemoveBtn}
            onPress={() => {
              if (type === 'header') setBillForm(p => ({ ...p, headerImageUrl: '' }));
              else setBillForm(p => ({ ...p, footerImageUrl: '' }));
            }}
          >
            <Icon name="x" size={14} color={colors.white} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.imageUploadBtn} onPress={() => handleBillImageUpload(type)} disabled={billImageUploading === type}>
          {billImageUploading === type ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Icon name="upload" size={14} color={colors.textMuted} />
              <Text style={styles.imageUploadText}>Upload Image</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  const renderBilling = () => {
    if (billLoading || !billForm) return <LoadingSpinner />;
    const toggles = [
      { key: 'showRestaurantName', label: 'Show Restaurant Name' },
      { key: 'showLogo', label: 'Show Logo' },
      { key: 'showAddress', label: 'Show Address' },
      { key: 'showContact', label: 'Show Contact' },
      { key: 'showGst', label: 'Show GST' },
      { key: 'showWaiterName', label: 'Show Waiter Name' },
      { key: 'showTableNumber', label: 'Show Table Number' },
      { key: 'showDateTime', label: 'Show Date/Time' },
      { key: 'showPaymentMode', label: 'Show Payment Mode' },
      { key: 'showCustomerDetails', label: 'Show Customer Details' },
      { key: 'enableTax', label: 'Enable Tax' },
    ];
    return (
      <View>
        {renderBillImageField('Header Image', billForm.headerImageUrl, 'header')}
        <Input label="Custom Header" value={billForm.customHeader} onChangeText={v => setBillForm(p => ({ ...p, customHeader: v }))} multiline />
        <Input label="Custom Footer" value={billForm.customFooter} onChangeText={v => setBillForm(p => ({ ...p, customFooter: v }))} multiline />
        {renderBillImageField('Footer Image', billForm.footerImageUrl, 'footer')}
        <Input label="Thank You Message" value={billForm.thankYouMessage} onChangeText={v => setBillForm(p => ({ ...p, thankYouMessage: v }))} />

        <Card style={styles.toggleCard}>
          {toggles.map(t => (
            <View key={t.key} style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t.label}</Text>
              <Switch
                value={billForm[t.key]}
                onValueChange={v => setBillForm(p => ({ ...p, [t.key]: v }))}
                trackColor={{ false: colors.border, true: colors.success + '50' }}
                thumbColor={billForm[t.key] ? colors.success : colors.textMuted}
              />
            </View>
          ))}
        </Card>

        <Text style={styles.sectionTitle}>Printer Paper Size</Text>
        <View style={styles.row}>
          <Input label="Bill Printer (mm)" value={billForm.billPrinterSizeMm} onChangeText={v => setBillForm(p => ({ ...p, billPrinterSizeMm: v }))} keyboardType="numeric" style={styles.half} />
          <Input label="KOT Printer (mm)" value={billForm.kotPrinterSizeMm} onChangeText={v => setBillForm(p => ({ ...p, kotPrinterSizeMm: v }))} keyboardType="numeric" style={styles.half} />
        </View>
        <Text style={styles.hintText}>Common sizes: 58mm (2 inch), 80mm (3 inch)</Text>

        <Button title="Save Bill Format" onPress={() => updateBillMut.mutate(billForm)} loading={updateBillMut.isPending} fullWidth style={styles.saveBtn} />
      </View>
    );
  };

  // ── Render: QR Ordering ──

  const renderQROrdering = () => {
    if (qrLoading) return <LoadingSpinner />;
    const orderTypes = [
      { key: 'enable_dine_in', label: 'Dine-In', desc: 'Customers scan QR at their table to order', icon: 'coffee' },
      { key: 'enable_takeaway', label: 'Takeaway', desc: 'Customers can place takeaway orders via QR', icon: 'shopping-bag' },
      { key: 'enable_delivery', label: 'Delivery', desc: 'Customers can place delivery orders with address', icon: 'truck' },
    ];

    return (
      <View>
        {/* Restaurant on/off toggle */}
        <View style={[styles.acceptingOrdersToggle, { backgroundColor: qrForm.is_accepting_orders ? '#f0fdf4' : '#fef2f2', borderColor: qrForm.is_accepting_orders ? '#bbf7d0' : '#fecaca' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: qrForm.is_accepting_orders ? '#166534' : '#991b1b' }}>
              {qrForm.is_accepting_orders ? 'Restaurant is Open' : 'Restaurant is Closed'}
            </Text>
            <Text style={{ fontSize: 11, marginTop: 2, color: qrForm.is_accepting_orders ? '#16a34a' : '#dc2626' }}>
              {qrForm.is_accepting_orders ? 'Customers can place orders via QR' : 'Only digital menu is accessible — no orders or payments'}
            </Text>
          </View>
          <Switch
            value={qrForm.is_accepting_orders}
            onValueChange={v => setQRForm(p => ({ ...p, is_accepting_orders: v }))}
            trackColor={{ false: '#d1d5db', true: '#22c55e' }}
            thumbColor={colors.white}
          />
        </View>

        <Text style={styles.sectionTitle}>Enabled Order Types</Text>
        {orderTypes.map(ot => (
          <TouchableOpacity
            key={ot.key}
            style={[styles.qrToggleItem, qrForm[ot.key] && styles.qrToggleItemActive]}
            onPress={() => setQRForm(p => ({ ...p, [ot.key]: !p[ot.key] }))}
            activeOpacity={0.7}
          >
            <View style={[styles.qrCheckbox, qrForm[ot.key] && styles.qrCheckboxActive]}>
              {qrForm[ot.key] && <Icon name="check" size={12} color={colors.white} />}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Icon name={ot.icon} size={14} color={qrForm[ot.key] ? colors.primary : colors.textMuted} />
                <Text style={[styles.qrToggleLabel, qrForm[ot.key] && { color: colors.text }]}>{ot.label}</Text>
              </View>
              <Text style={styles.qrToggleDesc}>{ot.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Payment Acceptance</Text>
        <Select
          value={qrForm.payment_acceptance}
          options={PAYMENT_ACCEPTANCE_OPTIONS}
          onChange={v => setQRForm(p => ({ ...p, payment_acceptance: v }))}
        />
        <Text style={styles.hintText}>How customers pay when ordering via QR</Text>

        {/* OTP verification toggle — only relevant when counter payment is enabled */}
        {(qrForm.payment_acceptance === 'counter' || qrForm.payment_acceptance === 'both') && (
          <TouchableOpacity
            style={[styles.qrToggleItem, qrForm.require_otp && styles.qrToggleItemActive, { marginTop: spacing.lg }]}
            onPress={() => setQRForm(p => ({ ...p, require_otp: !p.require_otp }))}
            activeOpacity={0.7}
          >
            <View style={[styles.qrCheckbox, qrForm.require_otp && styles.qrCheckboxActive]}>
              {qrForm.require_otp && <Icon name="check" size={12} color={colors.white} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.qrToggleLabel, qrForm.require_otp && { color: colors.text }]}>Require OTP Verification</Text>
              <Text style={styles.qrToggleDesc}>When enabled, customers must verify their phone via OTP for pay-at-counter orders</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Tax toggle */}
        <TouchableOpacity
          style={[styles.qrToggleItem, billForm?.enableTax && styles.qrToggleItemActive, { marginTop: spacing.lg }]}
          onPress={() => setBillForm(p => p ? ({ ...p, enableTax: !p.enableTax }) : p)}
          activeOpacity={0.7}
        >
          <View style={[styles.qrCheckbox, billForm?.enableTax && styles.qrCheckboxActive]}>
            {billForm?.enableTax && <Icon name="check" size={12} color={colors.white} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.qrToggleLabel, billForm?.enableTax && { color: colors.text }]}>Charge Taxes</Text>
            <Text style={styles.qrToggleDesc}>When enabled, applicable taxes will be added to customer orders</Text>
          </View>
        </TouchableOpacity>

        <Button
          title="Save QR Settings"
          onPress={() => {
            const needsGateway = qrForm.payment_acceptance === 'online' || qrForm.payment_acceptance === 'both';
            if (needsGateway && !gatewayForm._exists) {
              Alert.alert('Payment Gateway Required', 'Please configure a payment gateway in Payment tab to accept online payments.');
              return;
            }
            updateQRSettingsMut.mutate(qrForm);
            if (billForm) updateBillMut.mutate(billForm);
          }}
          loading={updateQRSettingsMut.isPending}
          fullWidth
          style={styles.saveBtn}
        />

        {/* Standalone QR Code */}
        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Standalone QR Code</Text>
        <Text style={styles.hintText}>Generate a QR code for customers to access your ordering page directly (for takeaway & delivery).</Text>

        {standaloneQR?.qrCodeDataUrl ? (
          <View style={{ marginTop: spacing.md }}>
            <View style={styles.qrImageContainer}>
              <Image source={{ uri: standaloneQR.qrCodeDataUrl }} style={styles.qrImage} resizeMode="contain" />
            </View>
            {standaloneQR.qrUrl && (
              <Card style={styles.qrUrlCard}>
                <Text style={styles.qrUrlLabel}>Ordering URL</Text>
                <Text style={styles.qrUrlText} selectable>{standaloneQR.qrUrl}</Text>
              </Card>
            )}
            <View style={[styles.row, { marginTop: spacing.md }]}>
              <Button
                title="Share QR"
                icon={<Icon name="share-2" size={16} color={colors.white} />}
                onPress={handleShareStandaloneQR}
                style={styles.half}
              />
              <Button
                title="Regenerate"
                icon={<Icon name="refresh-cw" size={16} color={colors.primary} />}
                variant="outline"
                onPress={handleGenerateStandaloneQR}
                loading={qrGenerating}
                style={styles.half}
              />
            </View>
          </View>
        ) : (
          <Button
            title="Generate Standalone QR Code"
            icon={<Icon name="maximize" size={16} color={colors.primary} />}
            variant="outline"
            onPress={handleGenerateStandaloneQR}
            loading={qrGenerating}
            style={{ marginTop: spacing.md }}
          />
        )}
      </View>
    );
  };

  // ── Render: Payment Gateway ──

  const renderPaymentGateway = () => {
    if (gwLoading) return <LoadingSpinner />;
    return (
      <View>
        <Text style={styles.sectionTitle}>Payment Gateway</Text>

        {gatewayForm._exists && (
          <Card style={styles.gwConfiguredCard}>
            <View style={styles.gwConfiguredDot} />
            <Text style={styles.gwConfiguredText}>
              {gatewayForm.gatewayName === 'razorpay' ? 'Razorpay' : gatewayForm.gatewayName === 'instamojo' ? 'Instamojo' : gatewayForm.gatewayName} is configured
            </Text>
          </Card>
        )}

        <Select
          label="Gateway"
          value={gatewayForm.gatewayName}
          options={GATEWAY_OPTIONS}
          onChange={v => setGatewayForm(p => ({ ...p, gatewayName: v }))}
        />

        <Input
          label={gatewayForm._exists ? 'API Key (leave blank to keep current)' : 'API Key *'}
          value={gatewayForm.apiKey}
          onChangeText={v => setGatewayForm(p => ({ ...p, apiKey: v }))}
          placeholder={gatewayForm._exists ? (gatewayForm.maskedKey || '•••••••• (unchanged)') : 'Enter API key...'}
        />

        <Input
          label={gatewayForm._exists ? 'API Secret (leave blank to keep current)' : 'API Secret *'}
          value={gatewayForm.apiSecret}
          onChangeText={v => setGatewayForm(p => ({ ...p, apiSecret: v }))}
          placeholder={gatewayForm._exists ? (gatewayForm.maskedSecret || '•••••••• (unchanged)') : 'Enter API secret...'}
          secureTextEntry
        />

        <Button
          title="Save Gateway"
          onPress={() => saveGatewayMut.mutate(gatewayForm)}
          loading={saveGatewayMut.isPending}
          fullWidth
          style={styles.saveBtn}
        />
      </View>
    );
  };

  // ── Render: WhatsApp ──

  const renderWhatsApp = () => {
    if (waLoading || !waForm) return <LoadingSpinner />;
    return (
      <View>
        <Text style={styles.sectionTitle}>WhatsApp Messaging</Text>

        {/* Token display */}
        <Card style={styles.waTokenCard}>
          <View style={styles.waTokenIcon}>
            <Icon name="message-circle" size={24} color={colors.success} />
          </View>
          <View>
            <Text style={styles.waTokenLabel}>Available Tokens</Text>
            <Text style={styles.waTokenValue}>{profile?.wa_tokens ?? 0}</Text>
          </View>
        </Card>

        {!isQR && (
          <View>
            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>E-bill Messaging Mode</Text>
            <Text style={styles.hintText}>Choose what to send when you click E-bill on the POS dashboard.</Text>

            {[
              { value: '1', label: 'Send Only E-bill', cost: '1 token', desc: 'Sends the e-bill link to the customer via WhatsApp.' },
              { value: '2', label: 'E-bill + Google Review (Same Message)', cost: '3.5 tokens', desc: 'Sends e-bill and Google review link in a single WhatsApp message.' },
              { value: '3', label: 'E-bill + Google Review (Separate Messages)', cost: '4.5 tokens', desc: 'Sends e-bill and Google review link as two separate WhatsApp messages.' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.waModeOption, waForm.wa_messaging_mode === opt.value && styles.waModeOptionActive]}
                onPress={() => setWAForm(p => ({ ...p, wa_messaging_mode: opt.value }))}
                activeOpacity={0.7}
              >
                <View style={[styles.waRadio, waForm.wa_messaging_mode === opt.value && styles.waRadioActive]}>
                  {waForm.wa_messaging_mode === opt.value && <View style={styles.waRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text style={styles.waModeLabel}>{opt.label}</Text>
                    <View style={styles.waCostBadge}>
                      <Text style={styles.waCostText}>{opt.cost}</Text>
                    </View>
                  </View>
                  <Text style={styles.waModeDesc}>{opt.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}

            {Number(waForm.wa_messaging_mode) > 1 && (
              <Input
                label="Google Maps Review URL"
                value={waForm.google_review_url}
                onChangeText={v => setWAForm(p => ({ ...p, google_review_url: v }))}
                placeholder="https://g.page/r/your-restaurant/review"
              />
            )}

            <Button
              title="Save WA Settings"
              onPress={() => updateWAMut.mutate({ wa_messaging_mode: Number(waForm.wa_messaging_mode), google_review_url: waForm.google_review_url })}
              loading={updateWAMut.isPending}
              fullWidth
              style={styles.saveBtn}
            />
          </View>
        )}

        <Card style={styles.infoCard}>
          <Icon name="info" size={16} color={colors.info} />
          <Text style={styles.infoText}>Tokens are managed by the platform admin. Contact support to recharge your WA messaging tokens.</Text>
        </Card>
      </View>
    );
  };

  // ── Printer: load saved printers ──
  useEffect(() => {
    if (activeTab === 'printer') {
      ThermalPrinter.getSavedPrinter('bill').then(d => setSavedBillPrinter(d)).catch(() => {});
      ThermalPrinter.getSavedPrinter('kot').then(d => setSavedKOTPrinter(d)).catch(() => {});
    }
  }, [activeTab]);

  const handleScanPrinters = async () => {
    setPrinterScanning(true);
    try {
      const devices = await ThermalPrinter.scanDevices();
      setPrinterDevices(devices);
      if (devices.length === 0) Alert.alert('No Devices', 'No Bluetooth devices found. Make sure your printer is turned on and discoverable.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to scan for devices');
    }
    setPrinterScanning(false);
  };

  const handleSelectPrinter = async (device) => {
    setPrinterConnecting(device.address);
    try {
      await ThermalPrinter.connectPrinter(device.address);
      await ThermalPrinter.savePrinter(printerType, device);
      if (printerType === 'bill') setSavedBillPrinter(device);
      else setSavedKOTPrinter(device);
      Alert.alert('Connected', `${device.name} saved as ${printerType === 'bill' ? 'Bill' : 'KOT'} printer.`);
    } catch (err) {
      Alert.alert('Connection Failed', err.message || 'Could not connect to printer. Make sure the printer is on and paired.');
    }
    setPrinterConnecting(null);
  };

  const handleTestPrint = async (type) => {
    setPrinterTesting(type);
    try {
      const saved = type === 'bill' ? savedBillPrinter : savedKOTPrinter;
      if (!saved?.address) { Alert.alert('No Printer', `No ${type === 'bill' ? 'Bill' : 'KOT'} printer configured.`); setPrinterTesting(null); return; }
      await ThermalPrinter.connectPrinter(saved.address);
      const bf = billForm || {};
      const sizeMm = type === 'bill' ? parseInt(bf.bill_printer_size_mm) || 80 : parseInt(bf.kot_printer_size_mm) || 80;
      await ThermalPrinter.testPrint(sizeMm);
      Alert.alert('Success', 'Test print sent successfully!');
    } catch (err) {
      Alert.alert('Print Failed', err.message || 'Failed to print. Check printer connection.');
    }
    setPrinterTesting(null);
  };

  const handleRemovePrinter = async (type) => {
    Alert.alert('Remove Printer', `Remove saved ${type === 'bill' ? 'Bill' : 'KOT'} printer?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await ThermalPrinter.removeSavedPrinter(type);
          if (type === 'bill') setSavedBillPrinter(null);
          else setSavedKOTPrinter(null);
        },
      },
    ]);
  };

  // ── Render: Printer ──

  const renderPrinterSlot = (type, saved) => (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
        <Icon name={type === 'bill' ? 'file-text' : 'clipboard'} size={18} color={colors.primary} />
        <Text style={{ ...typography.subtitle, marginLeft: spacing.sm, flex: 1 }}>
          {type === 'bill' ? 'Bill Printer' : 'KOT Printer'}
        </Text>
      </View>
      {saved ? (
        <View>
          <View style={{ backgroundColor: colors.primary + '10', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }}>
            <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>{saved.name}</Text>
            <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 2 }}>{saved.address}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity
              style={[styles.printerActionBtn, { backgroundColor: colors.primary, flex: 1 }]}
              onPress={() => handleTestPrint(type)}
              disabled={printerTesting === type}
            >
              {printerTesting === type
                ? <ActivityIndicator size="small" color={colors.white} />
                : <><Icon name="printer" size={14} color={colors.white} /><Text style={{ color: colors.white, fontSize: 12, fontWeight: '600', marginLeft: 4 }}>Test Print</Text></>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.printerActionBtn, { backgroundColor: '#f3f4f6', flex: 1 }]}
              onPress={() => { setPrinterType(type); handleScanPrinters(); }}
            >
              <Icon name="refresh-cw" size={14} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginLeft: 4 }}>Change</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.printerActionBtn, { backgroundColor: '#fef2f2' }]}
              onPress={() => handleRemovePrinter(type)}
            >
              <Icon name="trash-2" size={14} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={{ borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.md, padding: spacing.lg, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => { setPrinterType(type); handleScanPrinters(); }}
        >
          <Icon name="plus-circle" size={24} color={colors.textMuted} />
          <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: spacing.xs }}>
            Tap to setup {type === 'bill' ? 'Bill' : 'KOT'} printer
          </Text>
        </TouchableOpacity>
      )}
    </Card>
  );

  const renderPrinter = () => (
    <View>
      <Text style={styles.sectionTitle}>Thermal Printers</Text>
      <Text style={[styles.hintText, { marginBottom: spacing.md }]}>
        Connect Bluetooth thermal printers for instant silent printing. No print dialog needed once configured.
      </Text>

      {renderPrinterSlot('bill', savedBillPrinter)}
      {renderPrinterSlot('kot', savedKOTPrinter)}

      {/* Use same printer for both */}
      {savedBillPrinter && !savedKOTPrinter && (
        <TouchableOpacity
          style={{ padding: spacing.md, alignItems: 'center' }}
          onPress={async () => {
            await ThermalPrinter.savePrinter('kot', savedBillPrinter);
            setSavedKOTPrinter(savedBillPrinter);
            Alert.alert('Done', 'KOT printer set to same as Bill printer.');
          }}
        >
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Use same printer for KOT</Text>
        </TouchableOpacity>
      )}

      {/* Scanned devices list */}
      {(printerScanning || printerDevices.length > 0) && (
        <Card style={{ marginTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <Icon name="bluetooth" size={16} color="#3b82f6" />
            <Text style={{ ...typography.subtitle, marginLeft: spacing.sm, flex: 1 }}>
              {printerScanning ? 'Scanning...' : `Select ${printerType === 'bill' ? 'Bill' : 'KOT'} Printer`}
            </Text>
            {printerScanning && <ActivityIndicator size="small" color={colors.primary} />}
          </View>

          {printerDevices.map(device => (
            <TouchableOpacity
              key={device.address}
              style={{
                flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                backgroundColor: printerConnecting === device.address ? colors.primary + '10' : 'transparent',
                borderRadius: radius.md, marginBottom: 4,
              }}
              onPress={() => handleSelectPrinter(device)}
              disabled={!!printerConnecting}
            >
              <Icon name={device.paired ? 'link' : 'bluetooth'} size={16} color={device.paired ? '#22c55e' : '#3b82f6'} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={{ ...typography.body, fontWeight: '500' }}>{device.name}</Text>
                <Text style={{ ...typography.caption, color: colors.textMuted }}>{device.address}{device.paired ? ' (Paired)' : ''}</Text>
              </View>
              {printerConnecting === device.address ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Icon name="chevron-right" size={16} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          ))}

          {!printerScanning && printerDevices.length > 0 && (
            <TouchableOpacity style={{ alignItems: 'center', paddingTop: spacing.sm }} onPress={handleScanPrinters}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Scan Again</Text>
            </TouchableOpacity>
          )}
        </Card>
      )}

      <Text style={[styles.hintText, { marginTop: spacing.lg }]}>
        Tip: Make sure your thermal printer is turned on and paired via Bluetooth settings before scanning.
      </Text>
    </View>
  );

  // ── Render: Notifications ──

  const renderNotifications = () => (
    <View>
      <Text style={styles.sectionTitle}>Push Notifications</Text>
      <Card style={styles.toggleCard}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Enable Push Notifications</Text>
            <Text style={styles.notifDesc}>Receive alerts for new orders, KOT updates, and other important events on this device.</Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={async (value) => {
              setPushEnabled(value);
              await AsyncStorage.setItem(NOTIF_STORAGE_KEY, String(value));
              Alert.alert(
                value ? 'Notifications Enabled' : 'Notifications Disabled',
                value
                  ? 'You will receive push notifications for new orders, KOT updates and alerts on this device.'
                  : 'Push notifications are turned off for this device. You can re-enable them anytime.',
              );
            }}
            trackColor={{ false: colors.border, true: colors.success + '50' }}
            thumbColor={pushEnabled ? colors.success : colors.textMuted}
          />
        </View>
      </Card>
      <Card style={styles.infoCard}>
        <Icon name="info" size={16} color={colors.info} />
        <Text style={styles.infoText}>This setting only affects this device. Other devices logged into the same account are not affected.</Text>
      </Card>
    </View>
  );

  // ── Render: Account ──

  const renderAccount = () => (
    <View>
      <Text style={styles.sectionTitle}>Change Password</Text>
      <Input label="Current Password" value={passwordForm.currentPassword} onChangeText={v => setPasswordForm(p => ({ ...p, currentPassword: v }))} secureTextEntry />
      <Input label="New Password" value={passwordForm.newPassword} onChangeText={v => setPasswordForm(p => ({ ...p, newPassword: v }))} secureTextEntry />
      <Input label="Confirm Password" value={passwordForm.confirmPassword} onChangeText={v => setPasswordForm(p => ({ ...p, confirmPassword: v }))} secureTextEntry />
      <Button title="Change Password" onPress={() => {
        if (!passwordForm.currentPassword || !passwordForm.newPassword) { Alert.alert('Validation', 'All fields required'); return; }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) { Alert.alert('Validation', 'Passwords do not match'); return; }
        if (passwordForm.newPassword.length < 8) { Alert.alert('Validation', 'Min 8 characters'); return; }
        changePassMut.mutate(passwordForm);
      }} loading={changePassMut.isPending} fullWidth style={styles.saveBtn} />
    </View>
  );

  // ── Main render ──

  return (
    <View style={styles.container}>
      <Header title="Settings" onMenu={() => navigation.openDrawer()} />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} scrollable />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {activeTab === 'profile' && renderProfile()}
        {activeTab === 'billing' && renderBilling()}
        {activeTab === 'qr-ordering' && renderQROrdering()}
        {activeTab === 'payments' && renderPaymentGateway()}
        {activeTab === 'printer' && renderPrinter()}
        {activeTab === 'whatsapp' && renderWhatsApp()}
        {activeTab === 'notifications' && renderNotifications()}
        {activeTab === 'account' && renderAccount()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.base, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  saveBtn: { marginTop: spacing.lg },
  sectionTitle: { ...typography.h4, color: colors.text, marginBottom: spacing.md },
  hintText: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xl },

  // Toggle card
  toggleCard: { marginBottom: spacing.base },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  toggleLabel: { ...typography.body, color: colors.text },

  // Info card
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.infoBg, marginVertical: spacing.md },
  infoText: { ...typography.caption, color: colors.infoText, flex: 1 },
  notifDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  // Bill image fields
  imageField: { marginBottom: spacing.md },
  imageFieldLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '500', marginBottom: spacing.xs },
  imagePreviewRow: { position: 'relative', alignSelf: 'flex-start' },
  imagePreview: { height: 60, width: 120, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  imageRemoveBtn: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' },
  imageUploadBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.lg },
  imageUploadText: { ...typography.caption, color: colors.textMuted },
  logoPreview: { height: 72, width: 72, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  logoChangeBtn: { marginLeft: spacing.md, justifyContent: 'center' },
  logoChangeBtnText: { ...typography.caption, color: colors.primary, fontWeight: '600' },

  // QR ordering toggles
  acceptingOrdersToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 2, borderRadius: radius.lg, marginBottom: spacing.lg },
  qrToggleItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, marginBottom: spacing.sm },
  qrToggleItemActive: { borderColor: colors.primary + '40', backgroundColor: colors.primary + '08' },
  qrCheckbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  qrCheckboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  qrToggleLabel: { ...typography.body, fontWeight: '500', color: colors.textSecondary },
  qrToggleDesc: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  // Printer
  printerActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, minHeight: 36 },

  // QR code display
  qrImageContainer: { alignItems: 'center', padding: spacing.lg },
  qrImage: { width: 180, height: 180, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  qrUrlCard: { backgroundColor: colors.surfaceHover, marginTop: spacing.md },
  qrUrlLabel: { ...typography.caption, color: colors.textMuted, marginBottom: 4 },
  qrUrlText: { ...typography.caption, color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Payment gateway
  gwConfiguredCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', marginBottom: spacing.base },
  gwConfiguredDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  gwConfiguredText: { ...typography.body, color: '#166534', fontWeight: '500' },

  // WhatsApp
  waTokenCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, backgroundColor: colors.surfaceHover, marginBottom: spacing.md },
  waTokenIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  waTokenLabel: { ...typography.caption, color: colors.textMuted, fontWeight: '500' },
  waTokenValue: { fontSize: 28, fontWeight: '700', color: colors.text },

  waModeOption: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, marginBottom: spacing.sm },
  waModeOptionActive: { borderColor: colors.primary, backgroundColor: colors.primary + '08' },
  waRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  waRadioActive: { borderColor: colors.primary },
  waRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  waModeLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  waCostBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  waCostText: { fontSize: 9, fontWeight: '700', color: '#92400E' },
  waModeDesc: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
