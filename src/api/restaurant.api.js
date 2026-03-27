import { apiGet, apiPut, apiPost, apiUpload } from './client';

export const restaurantApi = {
  getProfile: () => apiGet('/restaurant/profile'),
  updateProfile: (data) => apiPut('/restaurant/profile', data),
  uploadLogo: (formData) => apiUpload('/restaurant/upload-logo', formData),
  getDashboardStats: () => apiGet('/restaurant/dashboard-stats'),
  getSubscription: () => apiGet('/restaurant/subscription'),
  getBillFormat: () => apiGet('/restaurant/bill-format'),
  updateBillFormat: (data) => apiPut('/restaurant/bill-format', data),
  uploadBillImage: (type, formData) => apiUpload(`/restaurant/bill-format/upload-image/${type}`, formData),
  getWASettings: () => apiGet('/restaurant/wa-messaging-settings'),
  updateWASettings: (data) => apiPut('/restaurant/wa-messaging-settings', data),
  getQRSettings: () => apiGet('/restaurant/qr-settings'),
  updateQRSettings: (data) => apiPut('/restaurant/qr-settings', data),
  generateStandaloneQR: () => apiPost('/restaurant/generate-standalone-qr'),
  getUsers: () => apiGet('/restaurant/users'),
  createUser: (data) => apiPost('/restaurant/users', data),
  updateUser: (id, data) => apiPut(`/restaurant/users/${id}`, data),
  deleteUser: (id) => apiGet(`/restaurant/users/${id}`, { _method: 'DELETE' }),
  resetStaffPassword: (id, newPassword) => apiPost(`/restaurant/users/${id}/reset-password`, { newPassword }),
};
