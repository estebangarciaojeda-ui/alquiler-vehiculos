import { Fragment, useEffect, useState } from 'react';
import api, { adminApi } from '../api.js';
import FotoVehiculo from '../components/FotoVehiculo.jsx';
import Nav from '../components/Nav.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Estado que ve el operador de mostrador. ENTREGADO equivale a CONFIRMADO_ASISTIDO en el contrato con Booking.
const ESTADOS = {
  RESERVADO: { texto: 'RESERVADO', detalle: 'pendiente de entrega' },
  CONFIRMADO_ASISTIDO: { texto: 'ENTREGADO', detalle: 'CONFIRMADO_ASISTIDO' },
  COMPLETADA: { texto: 'COMPLETADA', detalle: 'auto devuelto' },
  CANCELADA: { texto: 'CANCELADA', detalle: '' },
};

const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-EC') : '—');
const dinero = (v) => `$${Number(v ?? 0).toFixed(2)}`;

export default function Reservas() {
  const { auth, logout } = useAuth();
  const [reservas, setReservas] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [verId, setVerId] = useState(null);

  async function cargar(q = busqueda, p = pagina) {
    setCargando(true);
    try {
      const { data } = await adminApi.get('/reservas/buscar', { params: { q: q.trim(), page: p, limit: 10 } });
      setReservas(data.items);
      setTotal(data.total);
      setPagina(data.page);
      setPaginas(data.paginas);
      setError('');
    } catch {
      setError('No se pudo cargar la información.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar('', 1);
  }, []);

  const mensajeError = (e, defecto) => e.response?.data?.message ?? defecto;

  async function eliminar(id) {
    if (!confirm('¿Borrar esta reserva permanentemente?')) return;
    try {
      await api.delete(`/reservas/${id}`);
      await cargar();
    } catch {
      setError('No se pudo borrar la reserva.');
    }
  }

  // Cancelación antes de entregar las llaves: libera el auto y repone el stock.
  async function cancelar(r) {
    if (!confirm(`¿Cancelar la reserva ${r.codigo}? Se libera el auto y se procesa el reembolso.`)) return;
    try {
      await adminApi.post(`/reservas/${r.id}/cancelar`, { motivo: 'Cancelada por el administrador' });
      setAviso({ tipo: 'success', texto: `Reserva ${r.codigo} cancelada. El auto quedó libre de nuevo.` });
      setError('');
    } catch (e) {
      setError(mensajeError(e, 'No se pudo cancelar la reserva.'));
    }
    await cargar();
  }

  // Check-in de entrega: registra la entrega y, si la reserva vino de Booking, se lo notifica.
  async function confirmarEntrega(r) {
    const cedula = prompt(`Confirme la cédula / identificación del cliente (${r.nombreCliente}):`, r.identificacion ?? '');
    if (!cedula?.trim()) return;
    const licencia = prompt('Número de licencia del conductor:', r.conductor?.license_number ?? '');
    if (!licencia?.trim()) return;
    const km = prompt('Kilometraje de salida:', r.vehiculo?.kilometrajeActual ?? 0);
    if (km === null) return;
    try {
      const { data } = await adminApi.post(`/reservas/${r.id}/entrega`, { identificacion: cedula.trim(), licencia_conducir: licencia.trim(), km_salida: Number(km) });
      const n = data.notificacion_booking;
      if (n?.enviada) {
        setAviso({ tipo: 'success', texto: `Entrega confirmada y Booking Central respondió acknowledged=${n.respuesta?.acknowledged ?? true}.` });
      } else if (r.origen === 'BOOKING') {
        setAviso({ tipo: 'warning', texto: `Entrega confirmada, pero Booking NO fue notificado: ${n?.detalle ?? 'sin detalle'}` });
      } else {
        setAviso({ tipo: 'success', texto: 'Entrega confirmada (reserva propia, no requiere avisar a Booking).' });
      }
      setError('');
    } catch (e) {
      setError(mensajeError(e, 'No se pudo registrar la entrega.'));
    }
    await cargar();
  }

  // Check-in de devolución: km de retorno y combustible; el auto pasa 2 h a limpieza.
  async function confirmarDevolucion(r) {
    const km = prompt(`Kilometraje de retorno (salida: ${r.kmSalida ?? 0}):`, r.kmSalida ?? 0);
    if (km === null) return;
    const combustible = prompt('Nivel de combustible al devolver (0-100):', '100');
    if (combustible === null) return;
    try {
      const { data } = await adminApi.post(`/reservas/${r.id}/devolucion`, { km_retorno: Number(km), nivel_combustible: Number(combustible) });
      setAviso({ tipo: 'success', texto: `Vehículo devuelto. Recorrió ${data.km_recorridos} km. ${data.cooldown?.mensaje ?? ''}` });
      setError('');
    } catch (e) {
      setError(mensajeError(e, 'No se pudo registrar la devolución.'));
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
          cargar(busqueda, 1);
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
              cargar('', 1);
            }}
          >
            Limpiar
          </button>
        )}
      </form>

      {error && <div className="alert alert-danger">{error}</div>}
      {aviso && (
        <div className={`alert alert-${aviso.tipo} d-flex justify-content-between align-items-center`}>
          <span>{aviso.texto}</span>
          <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setAviso(null)} />
        </div>
      )}

      {cargando ? (
        <p>Cargando…</p>
      ) : reservas.length === 0 ? (
        <p className="text-muted">{busqueda ? 'No hay reservas que coincidan con la búsqueda.' : 'Todavía no hay reservas.'}</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-striped table-hover align-middle">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Código</th>
                <th>Cliente</th>
                <th>Vehículo</th>
                <th>Fechas</th>
                <th>Sucursal</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Creada</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reservas.map((r) => {
                const est = ESTADOS[r.estado_mostrador] ?? { texto: r.estado_mostrador, detalle: '' };
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td>
                        <FotoVehiculo marca={r.vehiculo?.marca} modelo={r.vehiculo?.modelo} />
                      </td>
                      <td>
                        {r.codigo}
                        {r.origen === 'BOOKING' && (
                          <>
                            <br />
                            <small className="text-muted">Booking</small>
                          </>
                        )}
                      </td>
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
                      <td>{r.sucursalRecogida?.nombre ?? '—'}</td>
                      <td>{dinero(r.total)}</td>
                      <td>
                        <strong>{est.texto}</strong>
                        {est.detalle && (
                          <>
                            <br />
                            <small className="text-muted">{est.detalle}</small>
                          </>
                        )}
                      </td>
                      <td>
                        <small>{fechaHora(r.creadaEn)}</small>
                      </td>
                      <td className="text-nowrap">
                        <button className="btn btn-sm btn-link" onClick={() => setVerId(verId === r.id ? null : r.id)}>
                          {verId === r.id ? 'Ocultar' : 'Ver'}
                        </button>
                        {r.estado_mostrador === 'RESERVADO' && (
                          <>
                            <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => cancelar(r)}>
                              Cancelar
                            </button>
                            <button className="btn btn-sm btn-primary me-1" onClick={() => confirmarEntrega(r)}>
                              Confirmar Entrega de Llaves / Check-in
                            </button>
                          </>
                        )}
                        {r.estado_mostrador === 'CONFIRMADO_ASISTIDO' && (
                          <>
                            <small className="text-success me-2">Entrega confirmada</small>
                            <button className="btn btn-sm btn-success me-1" onClick={() => confirmarDevolucion(r)}>
                              Devolver vehículo
                            </button>
                          </>
                        )}
                        {r.estado_mostrador === 'COMPLETADA' && <small className="text-success me-2">Entrega confirmada · Vehículo devuelto</small>}
                        <button className="btn btn-sm btn-outline-danger" onClick={() => eliminar(r.id)}>
                          Borrar
                        </button>
                      </td>
                    </tr>
                    {verId === r.id && (
                      <tr>
                        <td colSpan={10} className="bg-light">
                          <div className="row small py-2">
                            <div className="col-md-4">
                              <strong>Cliente</strong>
                              <br />
                              {r.nombreCliente} · {r.telefono}
                              <br />
                              {r.email}
                              <br />
                              C.I.: {r.identificacion ?? '—'} · {r.client_id ?? 'sin client_id'}
                              <br />
                              Licencia: {r.conductor?.license_number ?? '—'}
                            </div>
                            <div className="col-md-4">
                              <strong>Alquiler</strong>
                              <br />
                              Recogida: {r.fechaRecogida} {r.horaRecogida} · {r.sucursalRecogida?.nombre ?? '—'}
                              <br />
                              Devolución: {r.fechaDevolucion} {r.horaDevolucion}
                              <br />
                              {r.dias} día(s) · {dinero(r.total)} · cobertura {r.cobertura}
                              <br />
                              Depósito de garantía: {dinero(r.depositoGarantia)}
                            </div>
                            <div className="col-md-4">
                              <strong>Seguimiento</strong>
                              <br />
                              Entrega: {fechaHora(r.entregadaEn)} · km salida: {r.kmSalida ?? '—'}
                              <br />
                              Devolución: {fechaHora(r.devueltaEn)} · km retorno: {r.kmRetorno ?? '—'}
                              <br />
                              Origen: {r.origen}
                              {r.reembolso && (
                                <>
                                  <br />
                                  Reembolso: {dinero(r.reembolso.amount)} ({r.reembolso.status})
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="d-flex align-items-center gap-3 mt-3">
        <button className="btn btn-sm btn-outline-secondary" disabled={pagina <= 1 || cargando} onClick={() => cargar(busqueda, pagina - 1)}>
          Anterior
        </button>
        <small className="text-muted">
          {total} reservas · página {pagina} de {paginas}
        </small>
        <button className="btn btn-sm btn-outline-secondary" disabled={pagina >= paginas || cargando} onClick={() => cargar(busqueda, pagina + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
