import { useEffect, useState } from 'react';
import api from '../api.js';
import Nav from '../components/Nav.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { validarVehiculo } from '../utils/validarVehiculo.js';

const CATEGORIAS = ['ECONOMICO', 'COMPACTO', 'INTERMEDIO', 'SUV', 'CAMIONETA', 'VAN', 'LUJO'];
const TRANSMISIONES = ['MANUAL', 'AUTOMATICA'];
const COMBUSTIBLES = ['GASOLINA', 'DIESEL', 'HIBRIDO', 'ELECTRICO'];

const VACIO = {
  marca: '',
  modelo: '',
  anio: 2024,
  categoria: 'ECONOMICO',
  transmision: 'MANUAL',
  pasajeros: 5,
  maletas: 2,
  puertas: 4,
  combustible: 'GASOLINA',
  aireAcondicionado: true,
  precioPorDia: 30,
  sucursalId: 1,
};

export default function Vehiculos() {
  const { auth, logout } = useAuth();
  const [vehiculos, setVehiculos] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    try {
      const [vRes, sRes] = await Promise.all([api.get('/vehiculos'), api.get('/sucursales')]);
      setVehiculos(vRes.data);
      setSucursales(sRes.data);
    } catch {
      setError('No se pudo cargar la información.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrirNuevo() {
    setForm(VACIO);
    setEditandoId(null);
    setMostrarForm(true);
    setError('');
  }

  function abrirEditar(v) {
    setForm({
      marca: v.marca,
      modelo: v.modelo,
      anio: v.anio,
      categoria: v.categoria,
      transmision: v.transmision,
      pasajeros: v.pasajeros,
      maletas: v.maletas,
      puertas: v.puertas,
      combustible: v.combustible,
      aireAcondicionado: v.aireAcondicionado,
      precioPorDia: v.precioPorDia,
      sucursalId: v.sucursalId,
    });
    setEditandoId(v.id);
    setMostrarForm(true);
    setError('');
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');

    const errores = validarVehiculo(form);
    if (errores.length > 0) {
      setError(errores.join(' '));
      return;
    }

    const cuerpo = {
      ...form,
      anio: Number(form.anio),
      pasajeros: Number(form.pasajeros),
      maletas: Number(form.maletas),
      puertas: Number(form.puertas),
      precioPorDia: Number(form.precioPorDia),
      sucursalId: Number(form.sucursalId),
    };
    try {
      if (editandoId) {
        await api.put(`/vehiculos/${editandoId}`, cuerpo);
      } else {
        await api.post('/vehiculos', cuerpo);
      }
      setMostrarForm(false);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.message?.toString() || 'No se pudo guardar.');
    }
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este vehículo?')) return;
    try {
      await api.delete(`/vehiculos/${id}`);
      await cargar();
    } catch {
      setError('No se pudo eliminar (puede tener reservas asociadas).');
    }
  }

  return (
    <div className="container py-4">
      <Nav auth={auth} logout={logout} />

      {error && <div className="alert alert-danger">{error}</div>}

      <button className="btn btn-primary mb-3" onClick={abrirNuevo}>
        + Nuevo vehículo
      </button>

      {mostrarForm && (
        <form onSubmit={guardar} className="card card-body mb-4">
          <h2 className="h6">{editandoId ? 'Editar vehículo' : 'Nuevo vehículo'}</h2>
          <div className="row g-2">
            <div className="col-md-3">
              <label className="form-label">Marca</label>
              <input className="form-control" required value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Modelo</label>
              <input className="form-control" required value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Año</label>
              <input type="number" className="form-control" required value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Precio/día</label>
              <input type="number" step="0.01" className="form-control" required value={form.precioPorDia} onChange={(e) => setForm({ ...form, precioPorDia: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Sucursal</label>
              <select className="form-select" value={form.sucursalId} onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-2">
              <label className="form-label">Categoría</label>
              <select className="form-select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Transmisión</label>
              <select className="form-select" value={form.transmision} onChange={(e) => setForm({ ...form, transmision: e.target.value })}>
                {TRANSMISIONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Combustible</label>
              <select className="form-select" value={form.combustible} onChange={(e) => setForm({ ...form, combustible: e.target.value })}>
                {COMBUSTIBLES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Pasajeros</label>
              <input type="number" className="form-control" required value={form.pasajeros} onChange={(e) => setForm({ ...form, pasajeros: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Maletas</label>
              <input type="number" className="form-control" required value={form.maletas} onChange={(e) => setForm({ ...form, maletas: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Puertas</label>
              <input type="number" className="form-control" required value={form.puertas} onChange={(e) => setForm({ ...form, puertas: e.target.value })} />
            </div>
          </div>

          <div className="form-check mt-3">
            <input
              type="checkbox"
              className="form-check-input"
              id="aire"
              checked={form.aireAcondicionado}
              onChange={(e) => setForm({ ...form, aireAcondicionado: e.target.checked })}
            />
            <label className="form-check-label" htmlFor="aire">
              Aire acondicionado
            </label>
          </div>

          <div className="mt-3">
            <button type="submit" className="btn btn-success me-2">
              Guardar
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setMostrarForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {cargando ? (
        <p>Cargando…</p>
      ) : (
        <table className="table table-striped table-hover">
          <thead>
            <tr>
              <th>ID</th>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Año</th>
              <th>Categoría</th>
              <th>Precio/día</th>
              <th>Sucursal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vehiculos.map((v) => (
              <tr key={v.id}>
                <td>{v.id}</td>
                <td>{v.marca}</td>
                <td>{v.modelo}</td>
                <td>{v.anio}</td>
                <td>{v.categoria}</td>
                <td>${v.precioPorDia}</td>
                <td>{v.sucursal?.nombre}</td>
                <td>
                  <button className="btn btn-sm btn-outline-primary me-2" onClick={() => abrirEditar(v)}>
                    Editar
                  </button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => eliminar(v.id)}>
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
