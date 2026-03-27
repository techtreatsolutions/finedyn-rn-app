import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './client';

export const tableApi = {
  getTables: (params) => apiGet('/tables', params),
  getTable: (id) => apiGet(`/tables/${id}`),
  createTable: (data) => apiPost('/tables', data),
  updateTable: (id, data) => apiPut(`/tables/${id}`, data),
  deleteTable: (id) => apiDelete(`/tables/${id}`),
  updateStatus: (id, status) => apiPatch(`/tables/${id}/status`, { status }),
  assignWaiter: (id, waiterId) => apiPatch(`/tables/${id}/assign-waiter`, { waiterId }),
  getFloorMap: (floorId) => apiGet(`/tables/floor/${floorId}/map`),
  generateQR: (id) => apiPost(`/tables/${id}/generate-qr`),
  resetSession: (id) => apiPost(`/tables/${id}/reset-session`),
  waiterResetSession: (id) => apiPost(`/tables/${id}/waiter-reset-session`),
  getWaiters: () => apiGet('/tables/waiters/list'),
  getMyTables: () => apiGet('/tables/my-tables'),
};
