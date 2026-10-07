import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identificador, setIdentificador] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      await login(identificador, contrasena);
      navigate('/vehiculos');
    } catch {
      setError('Usuario o contraseña incorrectos.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
      <form onSubmit={enviar} className="card p-4 shadow-sm" style={{ width: 360 }}>
        <h1 className="h4 mb-3">AutoSpot admin (React)</h1>
        <p className="text-muted small">Autenticación con JWT.</p>

        <div className="mb-3">
          <label className="form-label">Usuario / correo</label>
          <input
            className="form-control"
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            placeholder="admin"
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Contraseña</label>
          <input
            type="password"
            className="form-control"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            required
          />
        </div>

        {error && <div className="alert alert-danger py-2">{error}</div>}

        <button type="submit" className="btn btn-primary" disabled={cargando}>
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="text-muted small mt-3 mb-0">
          Admin: usuario del panel admin. También acepta una cuenta de cliente
          (cliente1@correo.com / cliente1).
        </p>
      </form>
    </div>
  );
}
