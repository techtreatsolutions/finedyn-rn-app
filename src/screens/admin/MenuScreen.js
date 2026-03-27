import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Switch,
  Image,
  Alert,
  StyleSheet,
  RefreshControl,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { launchImageLibrary } from 'react-native-image-picker';
import { menuApi } from '../../api/menu.api';
import { restaurantApi } from '../../api/restaurant.api';
import Header from '../../components/common/Header';
import TabBar from '../../components/common/TabBar';
import FAB from '../../components/common/FAB';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { colors, spacing, radius, typography } from '../../theme';
import { formatCurrency } from '../../utils/formatters';

const TABS = [
  { key: 'categories', label: 'Categories' },
  { key: 'items', label: 'Items' },
];

const TYPE_OPTIONS = [
  { label: 'Veg', value: 'veg' },
  { label: 'Non-Veg', value: 'non_veg' },
  { label: 'Egg', value: 'egg' },
];

function timeStrToDate(str) {
  if (!str) return new Date(2000, 0, 1, 0, 0);
  const [h, m] = str.split(':').map(Number);
  return new Date(2000, 0, 1, h || 0, m || 0);
}
function dateToTimeStr(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const INITIAL_CATEGORY = { name: '', description: '', available_from: '', available_to: '' };
const INITIAL_ITEM = {
  name: '',
  price: '',
  category_id: '',
  type: 'veg',
  description: '',
  tax_rate: '',
  preparation_time: '',
  available_from: '',
  available_to: '',
  is_featured: false,
  variants: [],
  addons: [],
};

export default function MenuScreen({ navigation }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('categories');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showCatModal, setShowCatModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [catForm, setCatForm] = useState(INITIAL_CATEGORY);
  const [itemForm, setItemForm] = useState(INITIAL_ITEM);
  const [itemImage, setItemImage] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [variantName, setVariantName] = useState('');
  const [variantPrice, setVariantPrice] = useState('');
  const [addonName, setAddonName] = useState('');
  const [addonPrice, setAddonPrice] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');

  // Time picker state for category & item modals
  const [showCatFromPicker, setShowCatFromPicker] = useState(false);
  const [showCatToPicker, setShowCatToPicker] = useState(false);
  const [showItemFromPicker, setShowItemFromPicker] = useState(false);
  const [showItemToPicker, setShowItemToPicker] = useState(false);

  // Queries
  const { data: categories = [], isLoading: catsLoading, refetch: refetchCats } = useQuery({
    queryKey: ['menuCategories'],
    queryFn: async () => {
      const res = await menuApi.getCategories();
      return res.data || res;
    },
  });

  const { data: items = [], isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['menuItems', categoryFilter],
    queryFn: async () => {
      const params = categoryFilter ? { category_id: categoryFilter } : {};
      const res = await menuApi.getItems(params);
      return res.data || res;
    },
  });

  const { data: subscriptionData } = useQuery({
    queryKey: ['restaurantSubscription'],
    queryFn: async () => {
      const res = await restaurantApi.getSubscription();
      return res.data || res;
    },
  });

  const planLimit = useMemo(() => {
    if (!subscriptionData) return { max: 0, used: 0 };
    const max = subscriptionData.features?.max_menu_items || subscriptionData.subscription?.max_menu_items || 0;
    const used = subscriptionData.usage?.menuItems ?? items.length;
    return { max, used };
  }, [subscriptionData, items.length]);

  const filteredItems = useMemo(() => {
    if (availabilityFilter === 'all') return items;
    if (availabilityFilter === 'available') return items.filter((i) => i.is_available !== false && i.is_available !== 0);
    return items.filter((i) => i.is_available === false || i.is_available === 0);
  }, [items, availabilityFilter]);

  // Mutations
  const saveCategoryMut = useMutation({
    mutationFn: (data) =>
      editingCategory
        ? menuApi.updateCategory(editingCategory.id, data)
        : menuApi.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuCategories'] });
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      closeCatModal();
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to save category'),
  });

  const deleteCategoryMut = useMutation({
    mutationFn: (id) => menuApi.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuCategories'] });
      closeDeleteConfirm();
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to delete'),
  });

  const saveItemMut = useMutation({
    mutationFn: async (data) => {
      let imageUrl = editingItem?.image_url || editingItem?.image;
      if (itemImage) {
        const formData = new FormData();
        formData.append('image', {
          uri: itemImage.uri,
          type: itemImage.type || 'image/jpeg',
          name: itemImage.fileName || 'image.jpg',
        });
        const uploadRes = await menuApi.uploadImage(formData);
        imageUrl = uploadRes?.imageUrl || uploadRes?.data?.imageUrl;
      }
      const payload = { ...data, imageUrl };
      return editingItem
        ? menuApi.updateItem(editingItem.id, payload)
        : menuApi.createItem(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      queryClient.invalidateQueries({ queryKey: ['menuCategories'] });
      closeItemModal();
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || err?.message || 'Failed to save item'),
  });

  const deleteItemMut = useMutation({
    mutationFn: (id) => menuApi.deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      queryClient.invalidateQueries({ queryKey: ['menuCategories'] });
      closeDeleteConfirm();
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.message || 'Failed to delete'),
  });

  const toggleAvailMut = useMutation({
    mutationFn: (id) => menuApi.toggleAvailability(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['menuItems', categoryFilter] });
      const prev = queryClient.getQueryData(['menuItems', categoryFilter]);
      queryClient.setQueryData(['menuItems', categoryFilter], (old) =>
        old?.map((item) =>
          item.id === id ? { ...item, is_available: item.is_available ? 0 : 1 } : item
        )
      );
      return { prev };
    },
    onError: (err, id, context) => {
      queryClient.setQueryData(['menuItems', categoryFilter], context?.prev);
      Alert.alert('Error', err?.response?.data?.message || 'Failed to toggle');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['menuItems'] }),
  });

  const toggleFeaturedMut = useMutation({
    mutationFn: (id) => menuApi.toggleFeatured(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['menuItems', categoryFilter] });
      const prev = queryClient.getQueryData(['menuItems', categoryFilter]);
      queryClient.setQueryData(['menuItems', categoryFilter], (old) =>
        old?.map((item) =>
          item.id === id ? { ...item, is_featured: item.is_featured ? 0 : 1 } : item
        )
      );
      return { prev };
    },
    onError: (err, id, context) => {
      queryClient.setQueryData(['menuItems', categoryFilter], context?.prev);
      Alert.alert('Error', err?.response?.data?.message || 'Failed to toggle featured');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['menuItems'] }),
  });

  // Handlers
  const openAddCategory = () => {
    setEditingCategory(null);
    setCatForm(INITIAL_CATEGORY);
    setShowCatModal(true);
  };

  const openEditCategory = (cat) => {
    setEditingCategory(cat);
    setCatForm({
      name: cat.name,
      description: cat.description || '',
      available_from: cat.available_from || '',
      available_to: cat.available_to || '',
    });
    setShowCatModal(true);
  };

  const closeCatModal = () => {
    setShowCatModal(false);
    setEditingCategory(null);
    setCatForm(INITIAL_CATEGORY);
  };

  const openAddItem = () => {
    setEditingItem(null);
    setItemForm(INITIAL_ITEM);
    setItemImage(null);
    setShowItemModal(true);
  };

  const openEditItem = (item) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      price: String(item.price || ''),
      category_id: item.category_id ? String(item.category_id) : '',
      type: item.item_type || 'veg',
      description: item.description || '',
      tax_rate: item.tax_rate != null ? String(item.tax_rate) : '',
      preparation_time: item.preparation_time != null ? String(item.preparation_time) : '',
      available_from: item.available_from || '',
      available_to: item.available_to || '',
      is_featured: !!item.is_featured,
      variants: item.variants || [],
      addons: item.addons || [],
    });
    setItemImage(null);
    setShowItemModal(true);
  };

  const closeItemModal = () => {
    setShowItemModal(false);
    setEditingItem(null);
    setItemForm(INITIAL_ITEM);
    setItemImage(null);
  };

  const confirmDelete = (type, item) => {
    setDeleteTarget({ type, item });
    setShowDeleteConfirm(true);
  };

  const closeDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'category') {
      deleteCategoryMut.mutate(deleteTarget.item.id);
    } else {
      deleteItemMut.mutate(deleteTarget.item.id);
    }
  };

  const handleSaveCategory = () => {
    if (!catForm.name.trim()) {
      Alert.alert('Validation', 'Category name is required');
      return;
    }
    const payload = {
      name: catForm.name,
      description: catForm.description,
      availableFrom: catForm.available_from || null,
      availableTo: catForm.available_to || null,
    };
    saveCategoryMut.mutate(payload);
  };

  const handleSaveItem = () => {
    if (!itemForm.name.trim() || !itemForm.price || !itemForm.category_id) {
      Alert.alert('Validation', 'Name, price and category are required');
      return;
    }
    const payload = {
      name: itemForm.name,
      price: parseFloat(itemForm.price),
      categoryId: itemForm.category_id,
      itemType: itemForm.type,
      description: itemForm.description,
      taxRate: itemForm.tax_rate ? parseFloat(itemForm.tax_rate) : undefined,
      preparationTime: itemForm.preparation_time ? parseInt(itemForm.preparation_time) : undefined,
      availableFrom: itemForm.available_from || null,
      availableTo: itemForm.available_to || null,
      isFeatured: !!itemForm.is_featured,
      variants: itemForm.variants,
      addons: itemForm.addons,
    };
    saveItemMut.mutate(payload);
  };

  const pickImage = () => {
    launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, (response) => {
      if (!response.didCancel && !response.errorCode && response.assets?.[0]) {
        setItemImage(response.assets[0]);
      }
    });
  };

  const addVariant = () => {
    if (!variantName.trim() || !variantPrice) return;
    setItemForm((prev) => ({
      ...prev,
      variants: [...prev.variants, { name: variantName.trim(), price: parseFloat(variantPrice) }],
    }));
    setVariantName('');
    setVariantPrice('');
  };

  const removeVariant = (index) => {
    setItemForm((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }));
  };

  const addAddon = () => {
    if (!addonName.trim() || !addonPrice) return;
    setItemForm((prev) => ({
      ...prev,
      addons: [...prev.addons, { name: addonName.trim(), price: parseFloat(addonPrice) }],
    }));
    setAddonName('');
    setAddonPrice('');
  };

  const removeAddon = (index) => {
    setItemForm((prev) => ({
      ...prev,
      addons: prev.addons.filter((_, i) => i !== index),
    }));
  };

  const categoryOptions = categories.map((c) => ({ label: c.name, value: String(c.id) }));
  const filterOptions = [{ label: 'All Categories', value: '' }, ...categoryOptions];

  // Renders
  const renderCategoryItem = useCallback(({ item }) => (
    <Card style={styles.catCard}>
      <TouchableOpacity
        style={styles.catContent}
        onPress={() => openEditCategory(item)}
        onLongPress={() => confirmDelete('category', item)}
      >
        <View style={styles.catInfo}>
          <Text style={styles.catName}>{item.name}</Text>
          <Text style={styles.catCount}>{item.item_count || 0} items</Text>
          {(item.available_from || item.available_to) ? (
            <Text style={styles.timeText}>
              <Icon name="clock" size={11} color={colors.textMuted} />{' '}
              {item.available_from || '--:--'} - {item.available_to || '--:--'}
            </Text>
          ) : null}
        </View>
        <View style={styles.catActions}>
          <TouchableOpacity onPress={() => openEditCategory(item)} style={styles.iconBtn}>
            <Icon name="edit-2" size={16} color={colors.info} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => confirmDelete('category', item)} style={styles.iconBtn}>
            <Icon name="trash-2" size={16} color={colors.error} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Card>
  ), []);

  const renderMenuItemList = useCallback(({ item }) => (
    <Card style={styles.itemCard}>
      <TouchableOpacity style={styles.itemContent} onPress={() => openEditItem(item)}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.itemImage} />
        ) : (
          <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
            <Icon name="image" size={24} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.itemInfo}>
          <View style={styles.itemNameRow}>
            <View
              style={[
                styles.typeDot,
                { backgroundColor: item.item_type === 'veg' ? '#059669' : item.item_type === 'egg' ? '#D97706' : '#DC2626' },
              ]}
            />
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            {item.is_featured ? (
              <Icon name="star" size={14} color="#F59E0B" style={{ marginLeft: 4 }} />
            ) : null}
          </View>
          <Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>
          {item.category_name ? (
            <Text style={styles.itemCategory}>{item.category_name}</Text>
          ) : null}
          {(item.available_from || item.available_to) ? (
            <Text style={styles.timeText}>
              <Icon name="clock" size={11} color={colors.textMuted} />{' '}
              {item.available_from || '--:--'} - {item.available_to || '--:--'}
            </Text>
          ) : null}
        </View>
        <View style={styles.itemRight}>
          <TouchableOpacity onPress={() => toggleFeaturedMut.mutate(item.id)} style={styles.iconBtn}>
            <Icon name="star" size={16} color={item.is_featured ? '#F59E0B' : colors.textMuted} />
          </TouchableOpacity>
          <Switch
            value={item.is_available !== false && item.is_available !== 0}
            onValueChange={() => toggleAvailMut.mutate(item.id)}
            trackColor={{ false: colors.border, true: colors.success + '50' }}
            thumbColor={item.is_available !== false && item.is_available !== 0 ? colors.success : colors.textMuted}
          />
          <View style={styles.itemActions}>
            <TouchableOpacity onPress={() => openEditItem(item)} style={styles.iconBtn}>
              <Icon name="edit-2" size={14} color={colors.info} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDelete('item', item)} style={styles.iconBtn}>
              <Icon name="trash-2" size={14} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Card>
  ), []);

  const renderMenuItemGrid = useCallback(({ item }) => (
    <Card style={styles.gridCard}>
      <TouchableOpacity onPress={() => openEditItem(item)}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.gridImage} />
        ) : (
          <View style={[styles.gridImage, styles.gridImagePlaceholder]}>
            <Icon name="image" size={32} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.gridBody}>
          <View style={styles.itemNameRow}>
            <View
              style={[
                styles.typeDot,
                { backgroundColor: item.item_type === 'veg' ? '#059669' : item.item_type === 'egg' ? '#D97706' : '#DC2626' },
              ]}
            />
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          </View>
          <Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>
          {item.category_name ? (
            <Text style={styles.itemCategory} numberOfLines={1}>{item.category_name}</Text>
          ) : null}
          <View style={styles.gridActions}>
            <TouchableOpacity onPress={() => toggleFeaturedMut.mutate(item.id)} style={styles.iconBtn}>
              <Icon name="star" size={14} color={item.is_featured ? '#F59E0B' : colors.textMuted} />
            </TouchableOpacity>
            <Switch
              value={item.is_available !== false && item.is_available !== 0}
              onValueChange={() => toggleAvailMut.mutate(item.id)}
              trackColor={{ false: colors.border, true: colors.success + '50' }}
              thumbColor={item.is_available !== false && item.is_available !== 0 ? colors.success : colors.textMuted}
              style={{ transform: [{ scale: 0.8 }] }}
            />
          </View>
        </View>
      </TouchableOpacity>
    </Card>
  ), []);

  const isLoading = activeTab === 'categories' ? catsLoading : itemsLoading;

  return (
    <View style={styles.container}>
      <Header
        title="Menu"
        onMenu={() => navigation.openDrawer()}
      />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'items' && (
        <View style={styles.itemsToolbar}>
          <View style={styles.filterRow}>
            <Select
              value={categoryFilter}
              options={filterOptions}
              onChange={setCategoryFilter}
              placeholder="All Categories"
              style={styles.filterSelect}
            />
            <View style={styles.viewToggle}>
              <TouchableOpacity
                onPress={() => setViewMode('list')}
                style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
              >
                <Icon name="list" size={18} color={viewMode === 'list' ? '#fff' : colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setViewMode('grid')}
                style={[styles.viewToggleBtn, viewMode === 'grid' && styles.viewToggleBtnActive]}
              >
                <Icon name="grid" size={18} color={viewMode === 'grid' ? '#fff' : colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.availPills}>
            {['all', 'available', 'unavailable'].map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => setAvailabilityFilter(f)}
                style={[styles.pill, availabilityFilter === f && styles.pillActive]}
              >
                <Text style={[styles.pillText, availabilityFilter === f && styles.pillTextActive]}>
                  {f === 'all' ? 'All' : f === 'available' ? 'Available' : 'Unavailable'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {planLimit.max > 0 && (
            <View style={styles.planLimitBar}>
              <View style={styles.planLimitTrack}>
                <View
                  style={[
                    styles.planLimitFill,
                    {
                      width: `${Math.min(100, (planLimit.used / planLimit.max) * 100)}%`,
                      backgroundColor:
                        planLimit.used / planLimit.max > 0.9
                          ? colors.error
                          : planLimit.used / planLimit.max > 0.7
                          ? '#F59E0B'
                          : colors.success,
                    },
                  ]}
                />
              </View>
              <Text style={styles.planLimitText}>
                {planLimit.used}/{planLimit.max} items
              </Text>
            </View>
          )}
        </View>
      )}

      {isLoading ? (
        <LoadingSpinner fullScreen />
      ) : activeTab === 'categories' ? (
        <FlatList
          data={categories}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderCategoryItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetchCats} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="grid" size={48} color={colors.textMuted} />}
              title="No categories"
              message="Add your first menu category"
              actionLabel="Add Category"
              onAction={openAddCategory}
            />
          }
        />
      ) : (
        <FlatList
          key={viewMode}
          data={filteredItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={viewMode === 'grid' ? renderMenuItemGrid : renderMenuItemList}
          numColumns={viewMode === 'grid' ? 2 : 1}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetchItems} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="coffee" size={48} color={colors.textMuted} />}
              title="No items"
              message="Add your first menu item"
              actionLabel="Add Item"
              onAction={openAddItem}
            />
          }
        />
      )}

      <FAB
        onPress={activeTab === 'categories' ? openAddCategory : openAddItem}
      />

      {/* ── Time pickers rendered OUTSIDE modals (Android crash fix) ── */}
      {showCatFromPicker && (
        <DateTimePicker
          value={timeStrToDate(catForm.available_from)}
          mode="time"
          is24Hour
          display="spinner"
          onChange={(e, d) => {
            setShowCatFromPicker(false);
            if (d) setCatForm(p => ({ ...p, available_from: dateToTimeStr(d) }));
          }}
        />
      )}
      {showCatToPicker && (
        <DateTimePicker
          value={timeStrToDate(catForm.available_to)}
          mode="time"
          is24Hour
          display="spinner"
          onChange={(e, d) => {
            setShowCatToPicker(false);
            if (d) setCatForm(p => ({ ...p, available_to: dateToTimeStr(d) }));
          }}
        />
      )}
      {showItemFromPicker && (
        <DateTimePicker
          value={timeStrToDate(itemForm.available_from)}
          mode="time"
          is24Hour
          display="spinner"
          onChange={(e, d) => {
            setShowItemFromPicker(false);
            if (d) setItemForm(p => ({ ...p, available_from: dateToTimeStr(d) }));
          }}
        />
      )}
      {showItemToPicker && (
        <DateTimePicker
          value={timeStrToDate(itemForm.available_to)}
          mode="time"
          is24Hour
          display="spinner"
          onChange={(e, d) => {
            setShowItemToPicker(false);
            if (d) setItemForm(p => ({ ...p, available_to: dateToTimeStr(d) }));
          }}
        />
      )}

      {/* Category Modal */}
      <Modal
        visible={showCatModal}
        onClose={closeCatModal}
        title={editingCategory ? 'Edit Category' : 'Add Category'}
      >
        <Input
          label="Name"
          value={catForm.name}
          onChangeText={(v) => setCatForm((p) => ({ ...p, name: v }))}
          placeholder="Category name"
        />
        <Input
          label="Description"
          value={catForm.description}
          onChangeText={(v) => setCatForm((p) => ({ ...p, description: v }))}
          placeholder="Optional description"
          multiline
        />
        <Text style={styles.sectionLabel}>Time Availability</Text>
        <View style={styles.row}>
          <View style={styles.halfInput}>
            <Text style={styles.timeLabel}>Available From</Text>
            <TouchableOpacity style={styles.timePickerBtn} onPress={() => setShowCatFromPicker(true)}>
              <Icon name="clock" size={14} color={colors.textSecondary} />
              <Text style={styles.timePickerText}>{catForm.available_from || 'Not set'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.halfInput}>
            <Text style={styles.timeLabel}>Available To</Text>
            <TouchableOpacity style={styles.timePickerBtn} onPress={() => setShowCatToPicker(true)}>
              <Icon name="clock" size={14} color={colors.textSecondary} />
              <Text style={styles.timePickerText}>{catForm.available_to || 'Not set'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Button
          title={editingCategory ? 'Update Category' : 'Add Category'}
          onPress={handleSaveCategory}
          loading={saveCategoryMut.isPending}
          fullWidth
          style={styles.modalBtn}
        />
      </Modal>

      {/* Item Modal */}
      <Modal
        visible={showItemModal}
        onClose={closeItemModal}
        title={editingItem ? 'Edit Item' : 'Add Item'}
        size="lg"
      >
        <TouchableOpacity onPress={pickImage} style={styles.imageUpload}>
          {itemImage ? (
            <Image source={{ uri: itemImage.uri }} style={styles.uploadPreview} />
          ) : editingItem?.image ? (
            <Image source={{ uri: editingItem.image }} style={styles.uploadPreview} />
          ) : (
            <View style={styles.uploadPlaceholder}>
              <Icon name="camera" size={24} color={colors.textMuted} />
              <Text style={styles.uploadText}>Upload Image</Text>
            </View>
          )}
        </TouchableOpacity>

        <Input
          label="Name"
          value={itemForm.name}
          onChangeText={(v) => setItemForm((p) => ({ ...p, name: v }))}
          placeholder="Item name"
        />
        <Input
          label="Price"
          value={itemForm.price}
          onChangeText={(v) => setItemForm((p) => ({ ...p, price: v }))}
          placeholder="0.00"
          keyboardType="numeric"
        />
        <Select
          label="Category"
          value={itemForm.category_id}
          options={categoryOptions}
          onChange={(v) => setItemForm((p) => ({ ...p, category_id: v }))}
          placeholder="Select category"
        />
        <Select
          label="Type"
          value={itemForm.type}
          options={TYPE_OPTIONS}
          onChange={(v) => setItemForm((p) => ({ ...p, type: v }))}
        />
        <Input
          label="Description"
          value={itemForm.description}
          onChangeText={(v) => setItemForm((p) => ({ ...p, description: v }))}
          placeholder="Optional description"
          multiline
        />
        <View style={styles.row}>
          <Input
            label="Tax Rate (%)"
            value={itemForm.tax_rate}
            onChangeText={(v) => setItemForm((p) => ({ ...p, tax_rate: v }))}
            placeholder="0"
            keyboardType="numeric"
            style={styles.halfInput}
          />
          <Input
            label="Prep Time (min)"
            value={itemForm.preparation_time}
            onChangeText={(v) => setItemForm((p) => ({ ...p, preparation_time: v }))}
            placeholder="0"
            keyboardType="numeric"
            style={styles.halfInput}
          />
        </View>
        <Text style={styles.sectionLabel}>Time Availability</Text>
        <View style={styles.row}>
          <View style={styles.halfInput}>
            <Text style={styles.timeLabel}>Available From</Text>
            <TouchableOpacity style={styles.timePickerBtn} onPress={() => setShowItemFromPicker(true)}>
              <Icon name="clock" size={14} color={colors.textSecondary} />
              <Text style={styles.timePickerText}>{itemForm.available_from || 'Not set'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.halfInput}>
            <Text style={styles.timeLabel}>Available To</Text>
            <TouchableOpacity style={styles.timePickerBtn} onPress={() => setShowItemToPicker(true)}>
              <Icon name="clock" size={14} color={colors.textSecondary} />
              <Text style={styles.timePickerText}>{itemForm.available_to || 'Not set'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Featured Toggle */}
        <View style={styles.featuredRow}>
          <Text style={styles.sectionLabel}>Featured Item</Text>
          <Switch
            value={!!itemForm.is_featured}
            onValueChange={(v) => setItemForm((p) => ({ ...p, is_featured: v }))}
            trackColor={{ false: colors.border, true: '#F59E0B50' }}
            thumbColor={itemForm.is_featured ? '#F59E0B' : colors.textMuted}
          />
        </View>

        {/* Variants */}
        <Text style={styles.sectionLabel}>Variants</Text>
        {itemForm.variants.map((v, i) => (
          <View key={i} style={styles.chipRow}>
            <Text style={styles.chipText}>{v.name} - {formatCurrency(v.price)}</Text>
            <TouchableOpacity onPress={() => removeVariant(i)}>
              <Icon name="x" size={16} color={colors.error} />
            </TouchableOpacity>
          </View>
        ))}
        <View style={styles.addRow}>
          <Input
            value={variantName}
            onChangeText={setVariantName}
            placeholder="Variant name"
            style={styles.addInput}
          />
          <Input
            value={variantPrice}
            onChangeText={setVariantPrice}
            placeholder="Price"
            keyboardType="numeric"
            style={styles.addInputSmall}
          />
          <TouchableOpacity onPress={addVariant} style={styles.addBtn}>
            <Icon name="plus" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Addons */}
        <Text style={styles.sectionLabel}>Addons</Text>
        {itemForm.addons.map((a, i) => (
          <View key={i} style={styles.chipRow}>
            <Text style={styles.chipText}>{a.name} - {formatCurrency(a.price)}</Text>
            <TouchableOpacity onPress={() => removeAddon(i)}>
              <Icon name="x" size={16} color={colors.error} />
            </TouchableOpacity>
          </View>
        ))}
        <View style={styles.addRow}>
          <Input
            value={addonName}
            onChangeText={setAddonName}
            placeholder="Addon name"
            style={styles.addInput}
          />
          <Input
            value={addonPrice}
            onChangeText={setAddonPrice}
            placeholder="Price"
            keyboardType="numeric"
            style={styles.addInputSmall}
          />
          <TouchableOpacity onPress={addAddon} style={styles.addBtn}>
            <Icon name="plus" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <Button
          title={editingItem ? 'Update Item' : 'Add Item'}
          onPress={handleSaveItem}
          loading={saveItemMut.isPending}
          fullWidth
          style={styles.modalBtn}
        />
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        visible={showDeleteConfirm}
        onClose={closeDeleteConfirm}
        onConfirm={handleDelete}
        title="Delete"
        message={`Are you sure you want to delete this ${deleteTarget?.type}?`}
        confirmText="Delete"
        confirmVariant="danger"
        loading={deleteCategoryMut.isPending || deleteItemMut.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  list: { padding: spacing.base, paddingBottom: 80 },
  itemsToolbar: { paddingHorizontal: spacing.base, paddingTop: spacing.md },
  filterRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  filterSelect: { flex: 1, marginBottom: 0 },
  catCard: { marginBottom: spacing.md },
  catContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catInfo: { flex: 1 },
  catName: { ...typography.bodyBold, color: colors.text },
  catCount: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  catActions: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: { padding: spacing.sm },
  itemCard: { marginBottom: spacing.md },
  itemContent: { flexDirection: 'row', alignItems: 'center' },
  itemImage: { width: 56, height: 56, borderRadius: radius.md, marginRight: spacing.md },
  itemImagePlaceholder: { backgroundColor: colors.surfaceDark, justifyContent: 'center', alignItems: 'center' },
  itemInfo: { flex: 1 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center' },
  typeDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  itemName: { ...typography.bodyBold, color: colors.text, flex: 1 },
  itemPrice: { ...typography.captionBold, color: colors.primary, marginTop: 2 },
  itemCategory: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  timeText: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  itemRight: { alignItems: 'center', marginLeft: spacing.sm },
  itemActions: { flexDirection: 'row', marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  halfInput: { flex: 1 },
  sectionLabel: { ...typography.captionBold, color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  chipRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  chipText: { ...typography.caption, color: colors.text },
  addRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  addInput: { flex: 1, marginBottom: spacing.sm },
  addInputSmall: { width: 80, marginBottom: spacing.sm },
  addBtn: {
    width: 40, height: 44, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginTop: 20,
  },
  imageUpload: {
    width: '100%', height: 140, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
    overflow: 'hidden', marginBottom: spacing.base,
  },
  uploadPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  uploadPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface },
  uploadText: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  modalBtn: { marginTop: spacing.base },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: 20,
    alignSelf: 'flex-start',
  },
  viewToggleBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.primary,
  },
  availPills: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full || 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: '#fff',
  },
  planLimitBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  planLimitTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  planLimitFill: {
    height: '100%',
    borderRadius: 3,
  },
  planLimitText: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 0,
  },
  featuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  gridCard: {
    width: '48%',
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  gridImagePlaceholder: {
    backgroundColor: colors.surfaceDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridBody: {
    padding: spacing.sm,
  },
  gridActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  // Time picker
  timeLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600', marginBottom: 4 },
  timePickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.white,
  },
  timePickerText: { ...typography.body, color: colors.text },
  pickerDone: { ...typography.captionBold, color: colors.primary, textAlign: 'right', paddingVertical: spacing.xs },
});
