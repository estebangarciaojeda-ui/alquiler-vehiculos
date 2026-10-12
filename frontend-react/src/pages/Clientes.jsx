import { useEffect, useState } from 'react';
import { adminApi } from '../api.js';
import Nav from '../components/Nav.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const VACIO = { nombre: '', email: '', contrasena: '', rol: 'cliente' };

export default function Clientes() {
  const { auth, logout } = useAuth();
  const [cuentas, setCuentas] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    try {
      const { data } = await adminApi.get('/cuentas');
      setCuentas(data);
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

  function abrirEditar(c) {
    setForm({ nombre: c.nombre, email: c.email, contrasena: '', rol: c.rol });
    setEditandoId(c.id);
    setMostrarForm(true);
    setError('');
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');
    try {
      if (editandoId) {
        await adminApi.patch(`/cuentas/${editandoId}`, { nombre: form.nombre, email: form.email });
      } else {
        await adminApi.post('/cuentas', form);
      }
      setMostrarForm(false);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.message?.toString() || 'No se pudo guardar.');
    }
  }

  async function cambiarRol(c) {
    const nuevoRol = c.rol === 'admin' ? 'cliente' : 'admin';
    const accion = nuevoRol === 'admin' ? 'dar privilegios de administrador a' : 'quitar los privilegios de administrador a';
    if (!confirm(`¿Confirmas que deseas ${accion} ${c.nombre} (${c.email})?`)) return;
    try {
      await adminApi.patch(`/cuentas/${c.id}/rol`, { rol: nuevoRol });
      await cargar();
    } catch {
      setError('No se pudo actualizar el rol.');
    }
  }

  return (
    <div className="container py-4">
      <Nav auth={auth} logout={logout} />

      {error && <div className="alert alert-danger">{error}</div>}

      <button className="btn btn-primary mb-3" onClick={abrirNuevo}>
        + Nuevo usuario
      </button>

      {mostrarForm && (
        <form onSubmit={guardar} className="card card-body mb-4">
          <h2 className="h6">{editandoId ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <div className="row g-2">
            <div className="col-md-4">
              <label className="form-label">Nombre completo</label>
              <input className="form-control" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Correo electrónico</label>
              <input type="email" className="form-control" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            {!editandoId && (
              <>
                <div className="col-md-2">
                  <label className="form-label">Contraseña</label>
                  <input
                    type="password"
                    className="form-control"
                    required
                    minLength={8}
                    value={form.contrasena}
                    onChange={(e) => setForm({ ...form, contrasena: e.target.value })}
                  />
                </div>
                <div className="col-md-2">
                  <label className="form-label">Rol</label>
                  <select className="form-select" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
                    <option value="cliente">cliente</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </>
            )}
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
        <table className="table table-striped table-hover align-middle">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Registro</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{c.nombre}</td>
                <td>{c.email}</td>
                <td>
                  <span className={`badge ${c.rol === 'admin' ? 'bg-warning text-dark' : 'bg-info text-dark'}`}>
                    {c.rol === 'admin' ? 'Administrador' : 'Cliente'}
                  </span>
                </td>
                <td>{new Date(c.creadaEn).toLocaleString('es-EC')}</td>
                <td>
                  <button className="btn btn-sm btn-outline-primary me-2" onClick={() => abrirEditar(c)}>
                    Editar
                  </button>
                  <button
                    className={`btn btn-sm ${c.rol === 'admin' ? 'btn-outline-secondary' : 'btn-outline-primary'}`}
                    onClick={() => cambiarRol(c)}
                  >
                    {c.rol === 'admin' ? 'Quitar admin' : 'Dar admin'}
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
