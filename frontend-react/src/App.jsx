import { Navigate, Route, Routes } from 'react-router-dom';
import RutaProtegida from './components/RutaProtegida.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Vehiculos from './pages/Vehiculos.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/vehiculos"
          element={
            <RutaProtegida>
              <Vehiculos />
            </RutaProtegida>
          }
        />
        <Route path="*" element={<Navigate to="/vehiculos" replace />} />
      </Routes>
    </AuthProvider>
  );
}
