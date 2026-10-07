import { NavLink } from 'react-router-dom';

export default function Nav({ auth, logout }) {
  return (
    <nav className="d-flex justify-content-between align-items-center mb-4">
      <div>
        <div className="marca-react mb-2">
          <img src={`${import.meta.env.BASE_URL}img/logo.webp`} alt="AutoSpot" />
          <span className="subtitulo">Panel administrativo</span>
        </div>
        <div className="btn-group btn-group-sm">
          <NavLink to="/vehiculos" className={({ isActive }) => `btn btn-outline-primary ${isActive ? 'active' : ''}`}>
            Vehículos
          </NavLink>
          <NavLink to="/sucursales" className={({ isActive }) => `btn btn-outline-primary ${isActive ? 'active' : ''}`}>
            Sucursales
          </NavLink>
        </div>
      </div>
      <div>
        <span className="text-muted me-3">
          {auth?.nombre} · <span className="badge bg-secondary">{auth?.role}</span>
        </span>
        <button className="btn btn-outline-secondary btn-sm" onClick={logout}>
          Salir
        </button>
      </div>
    </nav>
  );
}
