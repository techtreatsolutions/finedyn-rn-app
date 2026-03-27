import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './client';

export const reservationApi = {
  getReservations: (params) => apiGet('/reservations', params),
  createReservation: (data) => apiPost('/reservations', data),
  updateReservation: (id, data) => apiPut(`/reservations/${id}`, data),
  deleteReservation: (id) => apiDelete(`/reservations/${id}`),
  updateStatus: (id, status) => apiPatch(`/reservations/${id}/status`, { status }),
  getAvailableTables: (params) => apiGet('/reservations/available-tables', params),
  startOrder: (id) => apiPost(`/reservations/${id}/start-order`),
};
