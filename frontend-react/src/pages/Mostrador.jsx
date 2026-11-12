import { useState } from 'react';
import { adminApi } from '../api.js';
import FotoVehiculo from '../components/FotoVehiculo.jsx';
import Nav from '../components/Nav.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const ESTADOS = {
  RESERVADO: { texto: 'Reservado · pendiente de entrega', clase: 'bg-warning text-dark' },
  CONFIRMADO_ASISTIDO: { texto: 'Entregado · confirmado asistido', clase: 'bg-success' },
  COMPLETADA: { texto: 'Completada · auto devuelto', clase: 'bg-secondary' },
  CANCELADA: { texto: 'Cancelada', clase: 'bg-danger' },
};

// Detecta qué tipo de dato escribió el operador para mostrarlo bajo el buscador.
function tipoBusqueda(q) {
  const t = q.trim();
  if (!t) return '';
  if (t.includes('@')) return 'Email';
  if (/^\d{6,13}$/.test(t)) return 'Cédula / identificación';
  if (/^[A-Za-z]{2,4}[A-Za-z0-9]{3,}$/.test(t)) return 'Código de reserva (PNR)';
  return 'Nombre o dato del cliente';
}

const enLimpieza = (r) => r.vehiculo?.estadoOperativo === 'EN_LIMPIEZA' && !!r.vehiculo?.disponibleDesde && new Date(r.vehiculo.disponibleDesde) > new Date();
const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-EC') : '—');
const sinSegundos = (fecha, hora) => `${fecha} ${hora ?? ''}`.trim();
const idPublico = (id) => `auto-${String(id).padStart(3, '0')}`;

export default function Mostrador() {
  const { auth, logout } = useAuth();
  const [q, setQ] = useState('');
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState(null);

  async function buscar(texto = q) {
    const termino = texto.trim();
    setCargando(true);
    try {
      const { data } = await adminApi.get('/reservas/buscar', { params: { q: termino, limit: 50 } });
      setResultados(data);
      setConsulta(termino);
      setError('');
    } catch (e) {
      setError(e.response?.data?.message ?? 'No se pudo buscar.');
    } finally {
      setCargando(false);
    }
  }

  const refrescar = () => buscar(consulta);

  async function entregar(r) {
    const cedula = prompt(`Confirme la cédula / identificación del cliente (${r.nombreCliente}):`, r.identificacion ?? '');
    if (!cedula?.trim()) return;
    const licencia = prompt('Verifique la licencia física del conductor y escriba su número:', r.conductor?.license_number ?? '');
    if (!licencia?.trim()) return;
    const km = prompt('Kilometraje de salida:', r.vehiculo?.kilometrajeActual ?? 0);
    if (km === null) return;
    try {
      const { data } = await adminApi.post(`/reservas/${r.id}/entrega`, { identificacion: cedula.trim(), licencia_conducir: licencia.trim(), km_salida: Number(km) });
      const n = data.notificacion_booking;
      if (n?.enviada) setAviso({ tipo: 'success', texto: `Entrega confirmada y Booking Central respondió acknowledged=${n.respuesta?.acknowledged ?? true}.` });
      else if (r.origen === 'BOOKING') setAviso({ tipo: 'warning', texto: `Entrega confirmada, pero Booking NO fue notificado: ${n?.detalle ?? 'sin detalle'}` });
      else setAviso({ tipo: 'success', texto: 'Entrega confirmada (reserva propia, no requiere avisar a Booking).' });
      setError('');
    } catch (e) {
      setError(e.response?.data?.message ?? 'No se pudo registrar la entrega.');
    }
    await refrescar();
  }

  async function devolver(r) {
    const km = prompt(`Kilometraje de retorno (salida: ${r.kmSalida ?? 0}):`, r.kmSalida ?? 0);
    if (km === null) return;
    const combustible = prompt('Nivel de combustible al devolver (0-100):', '100');
    if (combustible === null) return;
    try {
      const { data } = await adminApi.post(`/reservas/${r.id}/devolucion`, { km_retorno: Number(km), nivel_combustible: Number(combustible) });
      const n = data.notificacion_booking;
      const avisoBooking = n?.enviada
        ? ` Booking Central respondió acknowledged=${n.respuesta?.acknowledged ?? true}.`
        : r.origen === 'BOOKING'
          ? ` Pero Booking NO fue notificado: ${n?.detalle ?? 'sin detalle'}`
          : '';
      setAviso({ tipo: n?.enviada || r.origen !== 'BOOKING' ? 'success' : 'warning', texto: `Vehículo devuelto. Recorrió ${data.km_recorridos} km. ${data.cooldown?.mensaje ?? ''}${avisoBooking}` });
      setError('');
    } catch (e) {
      setError(e.response?.data?.message ?? 'No se pudo registrar la devolución.');
    }
    await refrescar();
  }

  async function habilitarAuto(r) {
    if (!confirm(`¿El ${r.vehiculo?.marca} ${r.vehiculo?.modelo} ya está limpio? Quedará DISPONIBLE ahora y volverá a aparecer en Booking, sin esperar el fin de las 2 horas.`)) return;
    try {
      const { data } = await adminApi.post(`/reservas/${r.id}/disponible`);
      setAviso({ tipo: 'success', texto: data.mensaje });
      setError('');
    } catch (e) {
      setError(e.response?.data?.message ?? 'No se pudo habilitar el auto.');
    }
    await refrescar();
  }

  async function cancelar(r) {
    if (!confirm(`¿Cancelar la reserva ${r.codigo}?`)) return;
    try {
      await adminApi.post(`/reservas/${r.id}/cancelar`, { motivo: 'Cancelada por el administrador' });
      setAviso({ tipo: 'success', texto: `Reserva ${r.codigo} cancelada. El auto quedó libre de nuevo.` });
      setError('');
    } catch (e) {
      setError(e.response?.data?.message ?? 'No se pudo cancelar.');
    }
    await refrescar();
  }

  const items = resultados?.items ?? [];

  return (
    <div className="container py-4">
      <Nav auth={auth} logout={logout} />

      <div className="text-uppercase text-muted small fw-bold">Mostrador · Check-in físico</div>
      <h2 className="mb-1">Entrega de llaves</h2>
      <p className="text-muted">
        Busca la reserva del cliente que llegó al mostrador, verifica su licencia y confirma la entrega. Si la reserva vino de Booking, Booking Central es
        notificado automáticamente. Cuando el cliente trae el auto de vuelta, registra la devolución desde la misma tarjeta.
      </p>
      <p className="small text-muted">
        Reglas de mostrador: no hay reembolso por devolución anticipada, y los extras (upgrade, días adicionales, GPS, silla de bebé, conductor adicional) se cobran en un
        contrato anexo independiente, sin modificar la reserva original ni la orden de Booking.
      </p>

      <form
        className="card card-body mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <label className="form-label fw-bold" htmlFor="busqueda-mostrador">
          Código de reserva (PNR), cédula o email del cliente
        </label>
        <div className="d-flex gap-2">
          <input
            id="busqueda-mostrador"
            className="form-control"
            placeholder="Ej: RFBVXJNN, 1726874926 o cliente@correo.com"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={cargando}>
            {cargando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        {q.trim() && (
          <small className="text-muted mt-2">
            Buscando por <strong>{tipoBusqueda(q)}</strong>
          </small>
        )}
      </form>

      {error && <div className="alert alert-danger">{error}</div>}
      {aviso && (
        <div className={`alert alert-${aviso.tipo} d-flex justify-content-between align-items-center`}>
          <span>{aviso.texto}</span>
          <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setAviso(null)} />
        </div>
      )}

      {resultados && (
        <p className="text-muted">
          {resultados.total} {resultados.total === 1 ? 'reserva' : 'reservas'}
          {consulta ? (
            <>
              {' '}
              para <strong>{consulta}</strong> · {tipoBusqueda(consulta)}
            </>
          ) : (
            ' recientes'
          )}
          {resultados.total > items.length && ` (se muestran ${items.length})`}
        </p>
      )}

      <div className="row g-3">
        {items.map((r) => {
          const est = ESTADOS[r.estado_mostrador] ?? { texto: r.estado_mostrador, clase: 'bg-secondary' };
          return (
            <div className="col-lg-6" key={r.id}>
              <div className="card h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <div className="text-uppercase text-muted small">Código de reserva</div>
                      <div className="fs-4 fw-bold font-monospace">{r.codigo}</div>
                    </div>
                    <span className={`badge ${est.clase}`}>{est.texto}</span>
                  </div>

                  <div className="d-flex align-items-center gap-3 mb-3">
                    <FotoVehiculo marca={r.vehiculo?.marca} modelo={r.vehiculo?.modelo} />
                    <div>
                      <div className="fw-bold">
                        {r.vehiculo?.marca} {r.vehiculo?.modelo} {r.vehiculo?.anio}
                      </div>
                      <small className="text-muted">
                        {idPublico(r.vehiculoId)} · {r.origen === 'BOOKING' ? 'Reserva de Booking' : 'Reserva propia'}
                      </small>
                    </div>
                  </div>

                  <div className="row small g-2">
                    <div className="col-6">
                      <div className="text-uppercase text-muted">Cliente</div>
                      {r.nombreCliente}
                    </div>
                    <div className="col-6">
                      <div className="text-uppercase text-muted">Cédula / ID</div>
                      {r.identificacion ?? <span className="text-warning">Sin registrar: se pedirá al entregar</span>}
                    </div>
                    <div className="col-6">
                      <div className="text-uppercase text-muted">Email</div>
                      {r.email}
                    </div>
                    <div className="col-6">
                      <div className="text-uppercase text-muted">Teléfono</div>
                      {r.telefono}
                    </div>
                    <div className="col-6">
                      <div className="text-uppercase text-muted">Retiro</div>
                      {sinSegundos(r.fechaRecogida, r.horaRecogida)} · {r.sucursalRecogida?.ciudad ?? r.sucursalRecogida?.nombre ?? ''}
                    </div>
                    <div className="col-6">
                      <div className="text-uppercase text-muted">Devolución</div>
                      {sinSegundos(r.fechaDevolucion, r.horaDevolucion)}
                    </div>
                  </div>

                  {r.entregadaEn && (
                    <div className="alert alert-success py-2 small mt-3 mb-0">
                      Entregado {fechaHora(r.entregadaEn)} · km salida {r.kmSalida ?? 0} km
                      {r.devueltaEn && (
                        <>
                          <br />
                          Devuelto {fechaHora(r.devueltaEn)} · km retorno {r.kmRetorno ?? 0} km
                        </>
                      )}
                    </div>
                  )}

                  <div className="d-flex gap-2 mt-3">
                    {r.estado_mostrador === 'RESERVADO' && (
                      <>
                        <button className="btn btn-primary" onClick={() => entregar(r)}>
                          Confirmar Entrega de Llaves / Check-in
                        </button>
                        <button className="btn btn-outline-secondary" onClick={() => cancelar(r)}>
                          Cancelar reserva
                        </button>
                      </>
                    )}
                    {r.estado_mostrador === 'COMPLETADA' && enLimpieza(r) && (
                      <button className="btn btn-warning" onClick={() => habilitarAuto(r)}>
                        Disponible (limpieza terminada)
                      </button>
                    )}
                    {r.estado_mostrador === 'CONFIRMADO_ASISTIDO' && (
                      <button className="btn btn-success" onClick={() => devolver(r)}>
                        Registrar devolución del vehículo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {resultados && items.length === 0 && <div className="alert alert-light border">No hay reservas que coincidan. Revisa el código, la cédula o el correo.</div>}
    </div>
  );
}
