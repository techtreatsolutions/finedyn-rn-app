import { apiGet, apiPost, apiPut, apiPatch, apiDelete, apiUpload } from './client';

export const menuApi = {
  getCategories: () => apiGet('/menu/categories'),
  createCategory: (data) => apiPost('/menu/categories', data),
  updateCategory: (id, data) => apiPut(`/menu/categories/${id}`, data),
  deleteCategory: (id) => apiDelete(`/menu/categories/${id}`),
  reorderCategories: (ids) => apiPost('/menu/categories/reorder', { categoryIds: ids }),
  getItems: (params) => apiGet('/menu/items', params),
  getItemsByRestaurant: () => apiGet('/menu/items'),
  createItem: (data) => apiPost('/menu/items', data),
  updateItem: (id, data) => apiPut(`/menu/items/${id}`, data),
  deleteItem: (id) => apiDelete(`/menu/items/${id}`),
  toggleAvailability: (id) => apiPatch(`/menu/items/${id}/toggle`),
  toggleFeatured: (id) => apiPatch(`/menu/items/${id}/featured`),
  uploadImage: (formData) => apiUpload('/menu/items/upload-image', formData),
  addVariant: (itemId, data) => apiPost(`/menu/items/${itemId}/variants`, data),
  updateVariant: (itemId, variantId, data) => apiPut(`/menu/items/${itemId}/variants/${variantId}`, data),
  deleteVariant: (itemId, variantId) => apiDelete(`/menu/items/${itemId}/variants/${variantId}`),
};
