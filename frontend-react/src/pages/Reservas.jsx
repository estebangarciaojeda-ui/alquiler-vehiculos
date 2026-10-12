import { useEffect, useState } from 'react';
import api from '../api.js';
import FotoVehiculo from '../components/FotoVehiculo.jsx';
import Nav from '../components/Nav.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const ETIQUETA_ESTADO = { CONFIRMADA: 'Confirmada', CANCELADA: 'Cancelada' };

export default function Reservas() {
  const { auth, logout } = useAuth();
  const [reservas, setReservas] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    try {
      const { data } = await api.get('/reservas');
      setReservas(data);
    } catch {
      setError('No se pudo cargar la información.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function eliminar(id) {
    if (!confirm('¿Borrar esta reserva permanentemente?')) return;
    try {
      await api.delete(`/reservas/${id}`);
      await cargar();
    } catch {
      setError('No se pudo borrar la reserva.');
    }
  }

  return (
    <div className="container py-4">
      <Nav auth={auth} logout={logout} />

      {error && <div className="alert alert-danger">{error}</div>}

      {cargando ? (
        <p>Cargando…</p>
      ) : reservas.length === 0 ? (
        <p className="text-muted">Todavía no hay reservas.</p>
      ) : (
        <table className="table table-striped table-hover align-middle">
          <thead>
            <tr>
              <th>Foto</th>
              <th>ID</th>
              <th>Código</th>
              <th>Cliente</th>
              <th>Vehículo</th>
              <th>Fechas</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reservas.map((r) => (
              <tr key={r.id}>
                <td>
                  <FotoVehiculo marca={r.vehiculo?.marca} modelo={r.vehiculo?.modelo} />
                </td>
                <td>{r.id}</td>
                <td>{r.codigo}</td>
                <td>
                  {r.nombreCliente}
                  <br />
                  <small className="text-muted">{r.email}</small>
                </td>
                <td>
                  {r.vehiculo?.marca} {r.vehiculo?.modelo}
                </td>
                <td>
                  {r.fechaRecogida} → {r.fechaDevolucion}
                </td>
                <td>{ETIQUETA_ESTADO[r.estado] ?? r.estado}</td>
                <td>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => eliminar(r.id)}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
