import { createContext, useContext, useState } from 'react';
import api from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem('autospot_token');
    const role = localStorage.getItem('autospot_role');
    const nombre = localStorage.getItem('autospot_nombre');
    return token ? { token, role, nombre } : null;
  });

  async function login(identificador, contrasena) {
    const { data } = await api.post('/auth/login', { identificador, contrasena });
    if (data.role !== 'admin') {
      throw new Error('Esta cuenta no tiene privilegios de administrador.');
    }
    localStorage.setItem('autospot_token', data.accessToken);
    localStorage.setItem('autospot_role', data.role);
    localStorage.setItem('autospot_nombre', data.nombre);
    setAuth({ token: data.accessToken, role: data.role, nombre: data.nombre });
  }

  function logout() {
    localStorage.removeItem('autospot_token');
    localStorage.removeItem('autospot_role');
    localStorage.removeItem('autospot_nombre');
    setAuth(null);
  }

  return <AuthContext.Provider value={{ auth, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
