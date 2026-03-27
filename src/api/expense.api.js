import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './client';

export const expenseApi = {
  getExpenses: (params) => apiGet('/expenses', params),
  getSummary: () => apiGet('/expenses/summary'),
  createExpense: (data) => apiPost('/expenses', data),
  updateExpense: (id, data) => apiPut(`/expenses/${id}`, data),
  deleteExpense: (id) => apiDelete(`/expenses/${id}`),
  approveExpense: (id, data) => apiPatch(`/expenses/${id}/approve`, data),
  getCategories: () => apiGet('/expenses/categories'),
  createCategory: (data) => apiPost('/expenses/categories', data),
  updateCategory: (id, data) => apiPut(`/expenses/categories/${id}`, data),
  deleteCategory: (id) => apiDelete(`/expenses/categories/${id}`),
};
