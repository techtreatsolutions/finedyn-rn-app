import { apiGet, apiPut } from './client';

export const notificationApi = {
  getNotifications: (params) => apiGet('/notifications', params),
  markRead: (id) => apiPut(`/notifications/${id}/read`),
  markAllRead: () => apiPut('/notifications/read-all'),
  getUnreadCount: () => apiGet('/notifications/unread-count'),
};
