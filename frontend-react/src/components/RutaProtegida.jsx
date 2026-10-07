import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Ruta protegida: si no hay sesión (JWT) válida, redirige al login.
export default function RutaProtegida({ children, rolRequerido }) {
  const { auth } = useAuth();

  if (!auth) return <Navigate to="/login" replace />;
  if (rolRequerido && auth.role !== rolRequerido) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
