import { apiGet, apiPost } from './client';

export const paymentApi = {
  getGatewaySettings: () => apiGet('/payments/gateway-settings'),
  saveGatewaySettings: (data) => apiPost('/payments/gateway-settings', data),
};
