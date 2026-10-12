import axios from 'axios';

function conAutenticacion(instancia) {
  // Interceptor: adjunta el JWT guardado en localStorage a cada petición saliente.
  instancia.interceptors.request.use((config) => {
    const token = localStorage.getItem('autospot_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  // Interceptor: si el token expiró o es inválido, limpia sesión para forzar re-login.
  instancia.interceptors.response.use(
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
  return instancia;
}

const api = conAutenticacion(axios.create({ baseURL: '/api/v1' }));

// Rutas del panel admin clásico (gestión de cuentas/roles), con prefijo propio.
export const adminApi = conAutenticacion(axios.create({ baseURL: '/admin/api' }));

export default api;
