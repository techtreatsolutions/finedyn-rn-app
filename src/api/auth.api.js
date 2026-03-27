import { apiPost, apiGet } from './client';

export const authApi = {
  login: (email, password) => apiPost('/auth/login', { email, password, rememberMe: true }),
  pinLogin: (email, pin) => apiPost('/auth/pin-login', { email, pin }),
  logout: () => apiPost('/auth/logout'),
  getProfile: () => apiGet('/auth/profile'),
  forgotPassword: (email) => apiPost('/auth/forgot-password', { email }),
  resetPassword: (token, password) => apiPost('/auth/reset-password', { token, password }),
  changePassword: (currentPassword, newPassword) => apiPost('/auth/change-password', { currentPassword, newPassword }),
  registerDevice: (fcmToken) => apiPost('/auth/register-device', { fcmToken, platform: 'android' }),
  unregisterDevice: (fcmToken) => apiPost('/auth/unregister-device', { fcmToken }),
};
