import axios from 'axios';

const api = axios.create({ baseURL: '/api/v1' });

// Interceptor: adjunta el JWT guardado en localStorage a cada petición saliente.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('autospot_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Interceptor: si el token expiró o es inválido, limpia sesión para forzar re-login.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('autospot_token');
      localStorage.removeItem('autospot_role');
      localStorage.removeItem('autospot_nombre');
    }
    return Promise.reject(error);
  },
);

export default api;
