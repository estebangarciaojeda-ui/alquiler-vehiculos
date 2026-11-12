import { useEffect, useState } from 'react';
import api, { adminApi } from '../api.js';
import FotoVehiculo from '../components/FotoVehiculo.jsx';
import Nav from '../components/Nav.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const ETIQUETA_ESTADO = {
  RESERVADO: 'RESERVADO (pendiente de entrega)',
  CONFIRMADO_ASISTIDO: 'CONFIRMADO_ASISTIDO (llaves entregadas)',
  COMPLETADA: 'COMPLETADA (auto devuelto)',
  CANCELADA: 'Cancelada',
};

export default function Reservas() {
  const { auth, logout } = useAuth();
  const [reservas, setReservas] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  async function cargar(q = busqueda) {
    setCargando(true);
    try {
      const { data } = await adminApi.get('/reservas/buscar', { params: { q: q.trim() } });
      setReservas(data);
      setError('');
    } catch {
      setError('No se pudo cargar la información.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar('');
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

  // Check-in de entrega en el mostrador: registra la entrega y, si la reserva vino de Booking, se lo notifica.
  async function confirmarEntrega(r) {
    const licencia = prompt('Número de licencia del conductor:', r.conductor?.license_number ?? '');
    if (!licencia?.trim()) return;
    const km = prompt('Kilometraje de salida:', r.vehiculo?.kilometrajeActual ?? 0);
    if (km === null) return;
    try {
      const { data } = await adminApi.post(`/reservas/${r.id}/entrega`, { licencia_conducir: licencia.trim(), km_salida: Number(km) });
      const n = data.notificacion_booking;
      alert(`Entrega registrada. ${n?.enviada ? 'Booking fue notificado (CONFIRMADO_ASISTIDO).' : `Booking NO fue notificado: ${n?.detalle ?? 'sin detalle'}`}`);
    } catch (e) {
      setError(e.response?.data?.message ?? 'No se pudo registrar la entrega.');
    }
    await cargar();
  }

  // Check-in de devolución: el cliente trae el auto; se registran km de retorno y combustible, y el auto pasa 2 h a limpieza.
  async function confirmarDevolucion(r) {
    const km = prompt(`Kilometraje de retorno (salida: ${r.kmSalida ?? 0}):`, r.kmSalida ?? 0);
    if (km === null) return;
    const combustible = prompt('Nivel de combustible al devolver (0-100):', '100');
    if (combustible === null) return;
    try {
      const { data } = await adminApi.post(`/reservas/${r.id}/devolucion`, { km_retorno: Number(km), nivel_combustible: Number(combustible) });
      alert(`Devolución registrada. Recorrió ${data.km_recorridos} km. ${data.cooldown?.mensaje ?? ''}`);
      setError('');
    } catch (e) {
      setError(e.response?.data?.message ?? 'No se pudo registrar la devolución.');
    }
    await cargar();
  }

  return (
    <div className="container py-4">
      <Nav auth={auth} logout={logout} />

      <form
        className="d-flex gap-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          cargar();
        }}
      >
        <input
          className="form-control"
          placeholder="Buscar por código de reserva, cédula/identificación o correo"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button className="btn btn-primary" type="submit">
          Buscar
        </button>
        {busqueda && (
          <button
            className="btn btn-outline-secondary"
            type="button"
            onClick={() => {
              setBusqueda('');
              cargar('');
            }}
          >
            Limpiar
          </button>
        )}
      </form>

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
                  {r.identificacion && (
                    <>
                      <br />
                      <small className="text-muted">C.I. {r.identificacion}</small>
                    </>
                  )}
                </td>
                <td>
                  {r.vehiculo?.marca} {r.vehiculo?.modelo}
                </td>
                <td>
                  {r.fechaRecogida} → {r.fechaDevolucion}
                </td>
                <td>
                  {ETIQUETA_ESTADO[r.estado_mostrador] ?? r.estado_mostrador}
                  {r.origen === 'BOOKING' && <small className="text-muted"> (Booking)</small>}
                </td>
                <td>
                  {r.estado_mostrador === 'RESERVADO' && (
                    <button className="btn btn-sm btn-primary me-1" onClick={() => confirmarEntrega(r)}>
                      Confirmar Entrega de Llaves / Check-in
                    </button>
                  )}
                  {r.estado_mostrador === 'CONFIRMADO_ASISTIDO' && (
                    <button className="btn btn-sm btn-success me-1" onClick={() => confirmarDevolucion(r)}>
                      Registrar devolución
                    </button>
                  )}
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
