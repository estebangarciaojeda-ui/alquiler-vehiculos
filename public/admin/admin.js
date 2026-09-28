const API = '/api/v1';
const ADMIN_API = '/admin/api';

const CATEGORIAS = ['ECONOMICO', 'COMPACTO', 'INTERMEDIO', 'SUV', 'CAMIONETA', 'VAN', 'LUJO'];
const TRANSMISIONES = ['MANUAL', 'AUTOMATICA'];
const COMBUSTIBLES = ['GASOLINA', 'DIESEL', 'HIBRIDO', 'ELECTRICO'];

const el = (id) => document.getElementById(id);

async function api(ruta, opciones = {}) {
  const res = await fetch(ruta, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opciones,
  });
  if (res.status === 401) {
    mostrarLogin();
    throw new Error('sesión expirada');
  }
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({}));
    throw new Error(cuerpo.detail || cuerpo.message || `Error HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function mostrarLogin() {
  el('panel-view').hidden = true;
  el('login-view').hidden = false;
}

function mostrarPanel() {
  el('login-view').hidden = true;
  el('panel-view').hidden = false;
  cargarTodo();
}

// ── Login ──────────────────────────────────────────────────────────────

el('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('login-error').hidden = true;
  try {
    await api(`${ADMIN_API}/login`, {
      method: 'POST',
      body: JSON.stringify({ usuario: el('login-usuario').value, contrasena: el('login-contrasena').value }),
    });
    mostrarPanel();
  } catch (err) {
    el('login-error').textContent = 'Usuario o contraseña incorrectos.';
    el('login-error').hidden = false;
  }
});

el('btn-logout').addEventListener('click', async () => {
  await fetch(`${ADMIN_API}/logout`, { method: 'POST', credentials: 'same-origin' });
  mostrarLogin();
});

(async function inicio() {
  try {
    await api(`${ADMIN_API}/whoami`);
    mostrarPanel();
  } catch {
    mostrarLogin();
  }
})();

// ── Tabs ───────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('activo'));
    document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = true));
    btn.classList.add('activo');
    el(`tab-${btn.dataset.tab}`).hidden = false;
  });
});

function cargarTodo() {
  cargarSucursales();
  cargarVehiculos();
  cargarReservas();
  cargarOrdenes();
  cargarWebhooks();
}

// ── Modal genérico ────────────────────────────────────────────────────

let alGuardar = null;

function abrirModal(titulo, campos, valores, onGuardar) {
  el('modal-titulo').textContent = titulo;
  el('modal-error').hidden = true;
  const cont = el('modal-campos');
  cont.innerHTML = '';

  for (const campo of campos) {
    const label = document.createElement('label');
    if (campo.tipo === 'checkbox') {
      label.className = 'checkbox-linea';
      label.innerHTML = `<input type="checkbox" id="campo-${campo.nombre}" ${valores[campo.nombre] ? 'checked' : ''} /> ${campo.etiqueta}`;
    } else if (campo.tipo === 'select') {
      const opciones = campo.opciones.map((o) => `<option value="${o}" ${valores[campo.nombre] === o ? 'selected' : ''}>${o}</option>`).join('');
      label.innerHTML = `${campo.etiqueta}<select id="campo-${campo.nombre}">${opciones}</select>`;
    } else {
      const val = valores[campo.nombre] ?? '';
      label.innerHTML = `${campo.etiqueta}<input type="${campo.tipo || 'text'}" id="campo-${campo.nombre}" value="${val}" ${campo.requerido ? 'required' : ''} />`;
    }
    cont.appendChild(label);
  }

  alGuardar = async () => {
    const datos = {};
    for (const campo of campos) {
      const input = el(`campo-${campo.nombre}`);
      if (campo.tipo === 'checkbox') datos[campo.nombre] = input.checked;
      else if (campo.tipo === 'numero') datos[campo.nombre] = Number(input.value);
      else datos[campo.nombre] = input.value;
    }
    try {
      await onGuardar(datos);
      cerrarModal();
    } catch (err) {
      el('modal-error').textContent = err.message;
      el('modal-error').hidden = false;
    }
  };

  el('modal-overlay').hidden = false;
}

function cerrarModal() {
  el('modal-overlay').hidden = true;
  alGuardar = null;
}

el('modal-cancelar').addEventListener('click', cerrarModal);
el('modal-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (alGuardar) alGuardar();
});

// ── Sucursales ────────────────────────────────────────────────────────

async function cargarSucursales() {
  const lista = await api(`${API}/sucursales`);
  const tbody = el('tabla-sucursales');
  tbody.innerHTML = lista
    .map(
      (s) => `<tr>
        <td>${s.id}</td><td>${s.nombre}</td><td>${s.ciudad}</td><td>${s.direccion}</td><td>${s.esAeropuerto ? 'Sí' : 'No'}</td>
        <td><button data-editar="${s.id}">Editar</button><button data-borrar="${s.id}" class="peligro">Borrar</button></td>
      </tr>`,
    )
    .join('');

  tbody.querySelectorAll('[data-editar]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = lista.find((x) => x.id == b.dataset.editar);
      abrirModal('Editar sucursal', camposSucursal(), s, async (datos) => {
        await api(`${API}/sucursales/${s.id}`, { method: 'PUT', body: JSON.stringify(datos) });
        cargarSucursales();
      });
    }),
  );
  tbody.querySelectorAll('[data-borrar]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta sucursal?')) return;
      await api(`${API}/sucursales/${b.dataset.borrar}`, { method: 'DELETE' });
      cargarSucursales();
    }),
  );
}

function camposSucursal() {
  return [
    { nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
    { nombre: 'ciudad', etiqueta: 'Ciudad', requerido: true },
    { nombre: 'direccion', etiqueta: 'Dirección', requerido: true },
    { nombre: 'esAeropuerto', etiqueta: 'Es aeropuerto', tipo: 'checkbox' },
  ];
}

el('btn-nueva-sucursal').addEventListener('click', () => {
  abrirModal('Nueva sucursal', camposSucursal(), {}, async (datos) => {
    await api(`${API}/sucursales`, { method: 'POST', body: JSON.stringify(datos) });
    cargarSucursales();
  });
});

// ── Vehículos ─────────────────────────────────────────────────────────

let sucursalesCache = [];

async function cargarVehiculos() {
  const [vehiculos, sucursales] = await Promise.all([api(`${API}/vehiculos`), api(`${API}/sucursales`)]);
  sucursalesCache = sucursales;
  const tbody = el('tabla-vehiculos');
  tbody.innerHTML = vehiculos
    .map(
      (v) => `<tr>
        <td>${v.id}</td><td>${v.marca}</td><td>${v.modelo}</td><td>${v.anio}</td><td>${v.categoria}</td>
        <td>$${v.precioPorDia}</td><td>${v.sucursal?.nombre ?? v.sucursalId}</td>
        <td><button data-editar="${v.id}">Editar</button><button data-borrar="${v.id}" class="peligro">Borrar</button></td>
      </tr>`,
    )
    .join('');

  tbody.querySelectorAll('[data-editar]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = vehiculos.find((x) => x.id == b.dataset.editar);
      abrirModal('Editar vehículo', camposVehiculo(), v, async (datos) => {
        await api(`${API}/vehiculos/${v.id}`, { method: 'PUT', body: JSON.stringify(datos) });
        cargarVehiculos();
      });
    }),
  );
  tbody.querySelectorAll('[data-borrar]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('¿Borrar este vehículo?')) return;
      await api(`${API}/vehiculos/${b.dataset.borrar}`, { method: 'DELETE' });
      cargarVehiculos();
    }),
  );
}

function camposVehiculo() {
  return [
    { nombre: 'marca', etiqueta: 'Marca', requerido: true },
    { nombre: 'modelo', etiqueta: 'Modelo', requerido: true },
    { nombre: 'anio', etiqueta: 'Año', tipo: 'numero', requerido: true },
    { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'select', opciones: CATEGORIAS },
    { nombre: 'transmision', etiqueta: 'Transmisión', tipo: 'select', opciones: TRANSMISIONES },
    { nombre: 'pasajeros', etiqueta: 'Pasajeros', tipo: 'numero', requerido: true },
    { nombre: 'maletas', etiqueta: 'Maletas', tipo: 'numero', requerido: true },
    { nombre: 'puertas', etiqueta: 'Puertas', tipo: 'numero', requerido: true },
    { nombre: 'combustible', etiqueta: 'Combustible', tipo: 'select', opciones: COMBUSTIBLES },
    { nombre: 'aireAcondicionado', etiqueta: 'Aire acondicionado', tipo: 'checkbox' },
    { nombre: 'precioPorDia', etiqueta: 'Precio por día (USD)', tipo: 'numero', requerido: true },
    { nombre: 'sucursalId', etiqueta: 'ID de sucursal', tipo: 'numero', requerido: true },
  ];
}

el('btn-nuevo-vehiculo').addEventListener('click', () => {
  abrirModal('Nuevo vehículo', camposVehiculo(), { aireAcondicionado: true }, async (datos) => {
    await api(`${API}/vehiculos`, { method: 'POST', body: JSON.stringify(datos) });
    cargarVehiculos();
  });
});

// ── Reservas (solo lectura + cancelar/borrar) ────────────────────────

async function cargarReservas() {
  const lista = await api(`${API}/reservas`);
  const tbody = el('tabla-reservas');
  tbody.innerHTML = lista
    .map(
      (r) => `<tr>
        <td>${r.id}</td><td>${r.codigo}</td><td>${r.nombreCliente}<br><small>${r.email}</small></td>
        <td>${r.vehiculo?.marca ?? ''} ${r.vehiculo?.modelo ?? ''}</td>
        <td>${r.fechaRecogida} → ${r.fechaDevolucion}</td>
        <td>${r.estado}</td>
        <td><button data-borrar="${r.id}" class="peligro">Borrar</button></td>
      </tr>`,
    )
    .join('');

  tbody.querySelectorAll('[data-borrar]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta reserva permanentemente?')) return;
      await api(`${API}/reservas/${b.dataset.borrar}`, { method: 'DELETE' });
      cargarReservas();
    }),
  );
}

// ── Órdenes del contrato Autos (solo lectura) ────────────────────────

async function cargarOrdenes() {
  const lista = await api(`${ADMIN_API}/gds-orders`);
  const tbody = el('tabla-ordenes');
  tbody.innerHTML = lista
    .map((o) => {
      const veh = o.vehiculoSnapshot ?? {};
      return `<tr>
        <td>${o.locator}</td><td>${o.estado}</td>
        <td>${veh.marca ?? ''} ${veh.modelo ?? ''}</td>
        <td>${o.fechaRecogida} → ${o.fechaDevolucion}</td>
        <td>${o.precioTotal} ${o.moneda}</td>
        <td>${new Date(o.creadoEn).toLocaleString()}</td>
      </tr>`;
    })
    .join('');
}

// ── Webhooks (solo lectura) ───────────────────────────────────────────

async function cargarWebhooks() {
  const lista = await api(`${ADMIN_API}/gds-webhooks`);
  const tbody = el('tabla-webhooks');
  tbody.innerHTML = lista.map((w) => `<tr><td>${w.id}</td><td>${w.url}</td><td>${w.events.join(', ')}</td></tr>`).join('');
}
