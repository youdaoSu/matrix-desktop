import axios from 'axios';

const TOKEN_KEY = 'matrix_token';
const ADMIN_TOKEN_KEY = 'matrix_admin_token';
const USER_KEY = 'matrix_user';
const ADMIN_USER_KEY = 'matrix_admin_user';

function readCookie(name: string): string | undefined {
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie.split('; ').find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

export const logger = {
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
  debug: (...args: unknown[]) => console.debug(...args),
};

export const axiosForBackend = axios.create({
  baseURL: '/',
  timeout: 30000,
  withCredentials: true,
});

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  sessionStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event('matrix:auth-updated'));
}

export function setSessionAuthToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event('matrix:auth-updated'));
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('matrix:auth-updated'));
}

export function setUser(user: any, remember = Boolean(localStorage.getItem(TOKEN_KEY) || !sessionStorage.getItem(TOKEN_KEY))) {
  const storage = remember ? localStorage : sessionStorage;
  const otherStorage = remember ? sessionStorage : localStorage;
  storage.setItem(USER_KEY, JSON.stringify(user));
  otherStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('matrix:auth-updated'));
}

export function getUser(): any {
  const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
}

export function setAdminUser(user: any) {
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
}

export function getAdminUser(): any {
  const raw = localStorage.getItem(ADMIN_USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

axiosForBackend.interceptors.request.use((config: any) => {
  const csrfToken = readCookie('suda-csrf-token');
  if (csrfToken) {
    config.headers = config.headers || {};
    config.headers['x-suda-csrf-token'] = decodeURIComponent(csrfToken);
  }
  const token = getAuthToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosForBackend.interceptors.response.use(
  (response: any) => response,
  (error: any) => {
    if (error.response?.status === 401) {
      clearAuthToken();
    }
    return Promise.reject(error);
  }
);

export const adminAxios = axios.create({
  baseURL: '/',
  timeout: 30000,
  withCredentials: true,
});

adminAxios.interceptors.request.use((config: any) => {
  const csrfToken = readCookie('suda-csrf-token');
  if (csrfToken) {
    config.headers = config.headers || {};
    config.headers['x-suda-csrf-token'] = decodeURIComponent(csrfToken);
  }
  const token = getAdminToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminAxios.interceptors.response.use(
  (response: any) => response,
  (error: any) => {
    if (error.response?.status === 401) clearAdminToken();
    return Promise.reject(error);
  },
);
