import { apiGet, apiPost, apiPut, apiDelete } from './client';

export const floorApi = {
  getFloors: () => apiGet('/floors'),
  createFloor: (data) => apiPost('/floors', data),
  updateFloor: (id, data) => apiPut(`/floors/${id}`, data),
  deleteFloor: (id) => apiDelete(`/floors/${id}`),
  reorder: (ids) => apiPost('/floors/reorder', { floorIds: ids }),
};
