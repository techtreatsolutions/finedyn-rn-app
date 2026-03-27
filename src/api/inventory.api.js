import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './client';

export const inventoryApi = {
  getCategories: () => apiGet('/inventory/categories'),
  createCategory: (data) => apiPost('/inventory/categories', data),
  updateCategory: (id, data) => apiPut(`/inventory/categories/${id}`, data),
  deleteCategory: (id) => apiDelete(`/inventory/categories/${id}`),
  getItems: (params) => apiGet('/inventory/items', params),
  createItem: (data) => apiPost('/inventory/items', data),
  updateItem: (id, data) => apiPut(`/inventory/items/${id}`, data),
  deleteItem: (id) => apiDelete(`/inventory/items/${id}`),
  stockIn: (id, data) => apiPost(`/inventory/items/${id}/stock-in`, data),
  stockOut: (id, data) => apiPost(`/inventory/items/${id}/stock-out`, data),
  getTransactions: (id, params) => apiGet(`/inventory/items/${id}/transactions`, params),
  getTickets: (params) => apiGet('/inventory/tickets', params),
  createTicket: (data) => apiPost('/inventory/tickets', data),
  updateTicketStatus: (id, data) => apiPatch(`/inventory/tickets/${id}/status`, data),
};
