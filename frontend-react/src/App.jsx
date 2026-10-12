import { Navigate, Route, Routes } from 'react-router-dom';
import RutaProtegida from './components/RutaProtegida.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import Clientes from './pages/Clientes.jsx';
import Login from './pages/Login.jsx';
import Reservas from './pages/Reservas.jsx';
import Sucursales from './pages/Sucursales.jsx';
import Vehiculos from './pages/Vehiculos.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/vehiculos"
          element={
            <RutaProtegida rolRequerido="admin">
              <Vehiculos />
            </RutaProtegida>
          }
        />
        <Route
          path="/sucursales"
          element={
            <RutaProtegida rolRequerido="admin">
              <Sucursales />
            </RutaProtegida>
          }
        />
        <Route
          path="/reservas"
          element={
            <RutaProtegida rolRequerido="admin">
              <Reservas />
            </RutaProtegida>
          }
        />
        <Route
          path="/clientes"
          element={
            <RutaProtegida rolRequerido="admin">
              <Clientes />
            </RutaProtegida>
          }
        />
        <Route path="*" element={<Navigate to="/vehiculos" replace />} />
      </Routes>
    </AuthProvider>
  );
}
