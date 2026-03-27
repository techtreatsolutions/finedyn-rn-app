import { apiGet } from './client';
import api from './client';

export const reportApi = {
  getSalesSummary: (params) => apiGet('/reports/sales-summary', params),
  getItemWise: (params) => apiGet('/reports/item-wise', params),
  getCategoryWise: (params) => apiGet('/reports/category-wise', params),
  getPaymentModes: (params) => apiGet('/reports/payment-modes', params),
  getWaiterPerformance: (params) => apiGet('/reports/waiter-performance', params),
  getTaxReport: (params) => apiGet('/reports/tax', params),
  getHourlyReport: (params) => apiGet('/reports/hourly', params),
  getExpenseReport: (params) => apiGet('/reports/expenses', params),
  exportReport: (type) => api.get(`/reports/export/${type}`, { responseType: 'blob' }),
};
