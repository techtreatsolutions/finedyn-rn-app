import axios from 'axios';
import { getToken, clearAll } from '../services/storage';
import Toast from 'react-native-toast-message';

const API_BASE_URL = 'https://finedyn.com/api/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

// Track auth failure callback (set by AuthContext)
let onAuthFailure = null;
export function setOnAuthFailure(cb) { onAuthFailure = cb; }

api.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (config.data instanceof FormData || (config.data && config.data._parts)) {
      config.headers['Content-Type'] = undefined;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Convert MySQL datetime strings ("2026-03-23 13:00:00") to ISO with IST offset
// so that new Date() anywhere in the app produces correct IST times.
const MYSQL_DT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
function tagISTDates(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string' && MYSQL_DT_RE.test(obj)) {
    return obj.replace(' ', 'T') + '+05:30';
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) obj[i] = tagISTDates(obj[i]);
    return obj;
  }
  if (typeof obj === 'object') {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        obj[key] = tagISTDates(obj[key]);
      }
    }
  }
  return obj;
}

api.interceptors.response.use(
  (response) => {
    if (response.data) tagISTDates(response.data);
    return response.data;
  },
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || 'Something went wrong.';

    if (status === 401) {
      clearAll();
      if (onAuthFailure) onAuthFailure();
      Toast.show({ type: 'error', text1: 'Session Expired', text2: message });
    } else if (status === 403) {
      Toast.show({ type: 'error', text1: 'Access Denied', text2: message });
    } else if (status >= 500) {
      Toast.show({ type: 'error', text1: 'Server Error', text2: 'Please try again later.' });
    }
    return Promise.reject(error);
  }
);

export default api;

export function apiGet(url, params) { return api.get(url, { params }); }
export function apiPost(url, data, config) { return api.post(url, data, config); }
export function apiPut(url, data) { return api.put(url, data); }
export function apiPatch(url, data) { return api.patch(url, data); }
export function apiDelete(url) { return api.delete(url); }

/**
 * Upload FormData using fetch (bypasses Axios header issues in React Native).
 */
export async function apiUpload(url, formData) {
  const token = await getToken();
  const res = await fetch(`${API_BASE_URL}${url}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Upload failed: invalid server response');
  }
  if (!res.ok) throw new Error(json?.message || 'Upload failed');
  return json;
}
