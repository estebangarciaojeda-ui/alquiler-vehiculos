import { useEffect, useState } from 'react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Nav from '../components/Nav.jsx';

const VACIO = { nombre: '', ciudad: '', direccion: '', esAeropuerto: false };

export default function Sucursales() {
  const { auth, logout } = useAuth();
  const [sucursales, setSucursales] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    try {
      const { data } = await api.get('/sucursales');
      setSucursales(data);
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

  function abrirEditar(s) {
    setForm({ nombre: s.nombre, ciudad: s.ciudad, direccion: s.direccion, esAeropuerto: s.esAeropuerto });
    setEditandoId(s.id);
    setMostrarForm(true);
    setError('');
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    try {
      if (editandoId) {
        await api.put(`/sucursales/${editandoId}`, form);
      } else {
        await api.post('/sucursales', form);
      }
      setMostrarForm(false);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.message?.toString() || 'No se pudo guardar.');
    }
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar esta sucursal?')) return;
    try {
      await api.delete(`/sucursales/${id}`);
      await cargar();
    } catch {
      setError('No se pudo eliminar (puede tener vehículos o reservas asociadas).');
    }
  }

  return (
    <div className="container py-4">
      <Nav auth={auth} logout={logout} />

      {error && <div className="alert alert-danger">{error}</div>}

      <button className="btn btn-primary mb-3" onClick={abrirNuevo}>
        + Nueva sucursal
      </button>

      {mostrarForm && (
        <form onSubmit={guardar} className="card card-body mb-4">
          <h2 className="h6">{editandoId ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
          <div className="row g-2">
            <div className="col-md-4">
              <label className="form-label">Nombre</label>
              <input className="form-control" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Ciudad</label>
              <input className="form-control" required value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} />
            </div>
            <div className="col-md-5">
              <label className="form-label">Dirección</label>
              <input className="form-control" required value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            </div>
          </div>
          <div className="form-check mt-3">
            <input
              type="checkbox"
              className="form-check-input"
              id="aeropuerto"
              checked={form.esAeropuerto}
              onChange={(e) => setForm({ ...form, esAeropuerto: e.target.checked })}
            />
            <label className="form-check-label" htmlFor="aeropuerto">
              Es aeropuerto
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
              <th>Nombre</th>
              <th>Ciudad</th>
              <th>Dirección</th>
              <th>Aeropuerto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sucursales.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.nombre}</td>
                <td>{s.ciudad}</td>
                <td>{s.direccion}</td>
                <td>{s.esAeropuerto ? 'Sí' : 'No'}</td>
                <td>
                  <button className="btn btn-sm btn-outline-primary me-2" onClick={() => abrirEditar(s)}>
                    Editar
                  </button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => eliminar(s.id)}>
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
