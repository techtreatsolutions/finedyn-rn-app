import { apiGet, apiPost, apiPatch } from './client';

export const qrOrdersApi = {
  // POSS model — staff accept/reject QR orders into table bills
  getPending: (params) => apiGet('/qr-orders/pending', params),
  getMyPending: (params) => apiGet('/qr-orders/my-pending', params),
  accept: (id) => apiPost(`/qr-orders/${id}/accept`),
  reject: (id, data) => apiPost(`/qr-orders/${id}/reject`, data),

  // QR Ordering plan model — standalone QR order management
  getList: (params) => apiGet('/qr-orders/list', params),
  updateStatus: (id, data) => apiPatch(`/qr-orders/${id}/update-status`, data),
  updatePayment: (id, data) => apiPatch(`/qr-orders/${id}/payment`, data),
};
