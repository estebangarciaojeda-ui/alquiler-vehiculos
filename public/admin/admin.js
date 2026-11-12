const API = '/api/v1';
const ADMIN_API = '/admin/api';

const CATEGORIAS = ['ECONOMICO', 'COMPACTO', 'INTERMEDIO', 'SUV', 'CAMIONETA', 'VAN', 'LUJO'];
const TRANSMISIONES = ['MANUAL', 'AUTOMATICA'];
const COMBUSTIBLES = ['GASOLINA', 'DIESEL', 'HIBRIDO', 'ELECTRICO'];

const el = (id) => document.getElementById(id);
const esc = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Mismo esquema de nombres que usa el sitio público (public/app.js) para
// resolver la foto de cada modelo en public/img/autos/<marca-modelo>.jpg.
const claveModelo = (v) =>
  `${v.marca} ${v.modelo}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function fotoVehiculo(v) {
  return `<img class="miniatura-auto" src="../img/autos/${esc(claveModelo(v))}.jpg" alt="${esc(v.marca)} ${esc(v.modelo)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'miniatura-auto miniatura-auto--vacia',textContent:'Sin foto'}))">`;
}

async function api(ruta, opciones = {}) {
  const res = await fetch(ruta, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opciones,
  });
  if (res.status === 401) {
    mostrarLogin();
    const error = new Error('sesión expirada');
    error.status = 401;
    throw error;
  }
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({}));
    const error = new Error(cuerpo.detail || cuerpo.message || `Error HTTP ${res.status}`);
    error.status = res.status;
    throw error;
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
  // Evita que varios clics/Enter mientras la petición está en vuelo disparen
  // peticiones duplicadas (eso puede agotar el límite de intentos sin que
  // el usuario haya escrito nada mal).
  const boton = el('login-form').querySelector('button[type="submit"]');
  if (boton.disabled) return;
  boton.disabled = true;
  try {
    await api(`${ADMIN_API}/login`, {
      method: 'POST',
      body: JSON.stringify({ usuario: el('login-usuario').value, contrasena: el('login-contrasena').value }),
    });
    mostrarPanel();
  } catch (err) {
    el('login-error').textContent =
      err.status === 429 ? 'Demasiados intentos. Espera un minuto antes de volver a intentar.' : 'Usuario o contraseña incorrectos.';
    el('login-error').hidden = false;
  } finally {
    boton.disabled = false;
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

el('form-buscar-reserva')?.addEventListener('submit', (e) => {
  e.preventDefault();
  cargarReservas();
});

function cargarTodo() {
  cargarSucursales();
  cargarVehiculos();
  cargarReservas();
  cargarClientes();
  cargarOrdenes();
  cargarWebhooks();
}

// ── Clientes y roles ─────────────────────────────────────────────────

async function cargarClientes() {
  const tbody = el('tabla-clientes');
  const error = el('clientes-error');
  error.hidden = true;
  tbody.innerHTML = '<tr><td colspan="6" class="vacio">Cargando…</td></tr>';

  try {
    const lista = await api(`${ADMIN_API}/cuentas`);
    if (lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="vacio">Todavía no hay clientes registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = lista
      .map(
        (cuenta) => `<tr>
          <td>${cuenta.id}</td>
          <td>${esc(cuenta.nombre)}</td>
          <td>${esc(cuenta.email)}</td>
          <td><span class="rol rol-${cuenta.rol}">${cuenta.rol === 'admin' ? 'Administrador' : 'Cliente'}</span></td>
          <td>${new Date(cuenta.creadaEn).toLocaleString('es-EC')}</td>
          <td><button data-editar-cuenta="${cuenta.id}" class="secundario">Editar</button><button data-cuenta-id="${cuenta.id}" data-nuevo-rol="${cuenta.rol === 'admin' ? 'cliente' : 'admin'}" class="${cuenta.rol === 'admin' ? 'secundario' : ''}">${cuenta.rol === 'admin' ? 'Quitar admin' : 'Dar admin'}</button></td>
        </tr>`,
      )
      .join('');

    tbody.querySelectorAll('[data-editar-cuenta]').forEach((boton) =>
      boton.addEventListener('click', () => {
        const cuenta = lista.find((item) => item.id === Number(boton.dataset.editarCuenta));
        abrirModal(
          'Editar cliente',
          [
            { nombre: 'nombre', etiqueta: 'Nombre completo', requerido: true },
            { nombre: 'email', etiqueta: 'Correo electrónico', tipo: 'email', requerido: true },
            { nombre: 'contrasena', etiqueta: 'Nueva contraseña (opcional, mín. 8 caracteres)', tipo: 'password' },
          ],
          cuenta,
          async (datos) => {
            if (!datos.contrasena) delete datos.contrasena;
            await api(`${ADMIN_API}/cuentas/${cuenta.id}`, {
              method: 'PATCH',
              body: JSON.stringify(datos),
            });
            await cargarClientes();
          },
        );
      }),
    );

    tbody.querySelectorAll('[data-cuenta-id]').forEach((boton) =>
      boton.addEventListener('click', async () => {
        const cuenta = lista.find((item) => item.id === Number(boton.dataset.cuentaId));
        const nuevoRol = boton.dataset.nuevoRol;
        const accion = nuevoRol === 'admin' ? 'dar privilegios de administrador a' : 'quitar los privilegios de administrador a';
        if (!confirm(`¿Confirmas que deseas ${accion} ${cuenta.nombre} (${cuenta.email})?`)) return;

        boton.disabled = true;
        try {
          await api(`${ADMIN_API}/cuentas/${cuenta.id}/rol`, {
            method: 'PATCH',
            body: JSON.stringify({ rol: nuevoRol }),
          });
          await cargarClientes();
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
          boton.disabled = false;
        }
      }),
    );
  } catch (err) {
    tbody.innerHTML = '';
    error.textContent = err.message;
    error.hidden = false;
  }
}

el('btn-recargar-clientes').addEventListener('click', cargarClientes);

el('btn-nuevo-cliente').addEventListener('click', () => {
  abrirModal(
    'Nuevo usuario',
    [
      { nombre: 'nombre', etiqueta: 'Nombre completo', requerido: true },
      { nombre: 'email', etiqueta: 'Correo electrónico', tipo: 'email', requerido: true },
      { nombre: 'contrasena', etiqueta: 'Contraseña (mín. 8 caracteres)', tipo: 'password', requerido: true },
      { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', opciones: ['cliente', 'admin'] },
    ],
    { rol: 'cliente' },
    async (datos) => {
      await api(`${ADMIN_API}/cuentas`, { method: 'POST', body: JSON.stringify(datos) });
      await cargarClientes();
    },
  );
});

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
      const opciones = campo.opciones
        .map((o) => {
          const valor = typeof o === 'object' ? o.valor : o;
          const etiqueta = typeof o === 'object' ? o.etiqueta : o;
          const sel = String(valores[campo.nombre]) === String(valor) ? 'selected' : '';
          return `<option value="${valor}" ${sel}>${esc(etiqueta)}</option>`;
        })
        .join('');
      label.innerHTML = `${campo.etiqueta}<select id="campo-${campo.nombre}">${opciones}</select>`;
    } else {
      const val = esc(valores[campo.nombre] ?? '');
      label.innerHTML = `${campo.etiqueta}<input type="${campo.tipo || 'text'}" id="campo-${campo.nombre}" value="${val}" ${campo.requerido ? 'required' : ''} />`;
    }
    cont.appendChild(label);
  }

  alGuardar = async () => {
    const datos = {};
    for (const campo of campos) {
      const input = el(`campo-${campo.nombre}`);
      if (campo.tipo === 'checkbox') datos[campo.nombre] = input.checked;
      else if (campo.tipo === 'numero' || campo.numerico) datos[campo.nombre] = Number(input.value);
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
  // Fin anticipado de la limpieza: el auto queda DISPONIBLE y se repone el stock en Booking.
  tbody.querySelectorAll('[data-disponible]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm(`¿El ${b.dataset.auto} ya está limpio? Quedará DISPONIBLE ahora y volverá a aparecer en Booking, sin esperar el fin de las 2 horas.`)) return;
      try {
        const res = await api(`${ADMIN_API}/reservas/${b.dataset.disponible}/disponible`, { method: 'POST', body: '{}' });
        alert(res.mensaje);
      } catch (e) {
        alert(e.message);
      }
      cargarReservas();
    }),
  );

  tbody.querySelectorAll('[data-cancelar]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm(`¿Cancelar la reserva ${b.dataset.codigo}? Se libera el auto y se procesa el reembolso.`)) return;
      try {
        await api(`${ADMIN_API}/reservas/${b.dataset.cancelar}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo: 'Cancelada por el administrador' }) });
      } catch (e) {
        alert(e.message);
      }
      cargarReservas();
    }),
  );

  // Check-in de devolución: km de retorno y combustible; el auto pasa 2 h a limpieza.
  tbody.querySelectorAll('[data-devolver]').forEach((b) =>
    b.addEventListener('click', async () => {
      const km = prompt(`Kilometraje de retorno (salida: ${b.dataset.km}):`, b.dataset.km);
      if (km === null) return;
      const combustible = prompt('Nivel de combustible al devolver (0-100):', '100');
      if (combustible === null) return;
      try {
        const res = await api(`${ADMIN_API}/reservas/${b.dataset.devolver}/devolucion`, {
          method: 'POST',
          body: JSON.stringify({ km_retorno: Number(km), nivel_combustible: Number(combustible) }),
        });
        alert(`Devolución registrada. Recorrió ${res.km_recorridos} km. ${res.cooldown?.mensaje ?? ''} ${res.notificacion_booking?.enviada ? `Booking Central respondió acknowledged=${res.notificacion_booking.respuesta?.acknowledged ?? true}.` : res.notificacion_booking?.detalle?.startsWith('Reserva propia') ? '' : `Booking NO fue notificado: ${res.notificacion_booking?.detalle ?? 'sin detalle'}`}`);
      } catch (e) {
        alert(e.message);
      }
      cargarReservas();
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
        <td>${fotoVehiculo(v)}</td>
        <td>${v.id}</td><td>${v.marca}</td><td>${v.modelo}</td><td>${v.anio}</td><td>${v.categoria}</td>
        <td>$${v.precioPorDia}</td><td>${v.sucursal?.nombre ?? v.sucursalId}</td>
        <td>${
          v.estadoOperativo === 'EN_MANTENIMIENTO'
            ? 'EN MANTENIMIENTO'
            : v.estadoOperativo === 'EN_LIMPIEZA' && v.disponibleDesde && new Date(v.disponibleDesde) > new Date()
              ? `EN LIMPIEZA<br><small>hasta las ${new Date(v.disponibleDesde).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</small>`
              : 'DISPONIBLE'
        }</td>
        <td>${
          v.estadoOperativo === 'EN_MANTENIMIENTO' || (v.estadoOperativo === 'EN_LIMPIEZA' && v.disponibleDesde && new Date(v.disponibleDesde) > new Date())
            ? `<button data-habilitar="${v.id}" data-auto="${esc(v.marca + ' ' + v.modelo)}">Disponible</button>`
            : ''
        }<button data-editar="${v.id}">Editar</button><button data-borrar="${v.id}" class="peligro">Borrar</button></td>
      </tr>`,
    )
    .join('');

  // Deja el auto DISPONIBLE: termina la limpieza antes de las 2 h o lo saca de mantenimiento.
  tbody.querySelectorAll('[data-habilitar]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm(`¿Dejar el ${b.dataset.auto} DISPONIBLE ahora? Volverá a aparecer en Booking.`)) return;
      try {
        const res = await api(`${ADMIN_API}/vehiculos/${b.dataset.habilitar}/disponible`, { method: 'POST', body: '{}' });
        alert(res.mensaje);
      } catch (e) {
        alert(e.message);
      }
      cargarVehiculos();
    }),
  );

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
    {
      nombre: 'sucursalId',
      etiqueta: 'Sucursal',
      tipo: 'select',
      numerico: true,
      opciones: sucursalesCache.map((s) => ({ valor: s.id, etiqueta: s.nombre })),
    },
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
  const q = el('buscar-reserva')?.value.trim() ?? '';
  const { items: lista, total } = await api(`${ADMIN_API}/reservas/buscar?q=${encodeURIComponent(q)}&limit=100`);
  if (el('total-reservas')) el('total-reservas').textContent = `${total} reservas`;
  const tbody = el('tabla-reservas');
  tbody.innerHTML = lista
    .map(
      (r) => `<tr>
        <td>${r.vehiculo ? fotoVehiculo(r.vehiculo) : ''}</td>
        <td>${r.id}</td><td>${r.codigo}</td><td>${esc(r.nombreCliente)}<br><small>${esc(r.email)}</small>${r.identificacion ? `<br><small>C.I. ${esc(r.identificacion)}</small>` : ''}</td>
        <td>${r.vehiculo?.marca ?? ''} ${r.vehiculo?.modelo ?? ''}</td>
        <td>${r.fechaRecogida} → ${r.fechaDevolucion}</td>
        <td>${esc(r.estado_mostrador === 'CONFIRMADO_ASISTIDO' ? 'ENTREGADO' : r.estado_mostrador)}${r.origen === 'BOOKING' ? ' <small>(Booking)</small>' : ''}</td>
        <td>${
          r.estado_mostrador === 'RESERVADO'
            ? `<button data-cancelar="${r.id}" data-codigo="${esc(r.codigo)}" class="secundario">Cancelar</button> `
            : ''
        }${
          r.estado_mostrador === 'RESERVADO'
            ? `<button data-entregar="${r.id}" data-nombre="${esc(r.nombreCliente)}" data-cedula="${esc(r.identificacion ?? '')}" data-licencia="${esc(r.conductor?.license_number ?? '')}" data-km="${r.vehiculo?.kilometrajeActual ?? 0}">Confirmar Entrega de Llaves / Check-in</button> `
            : ''
        }${
          r.estado_mostrador === 'COMPLETADA' && r.vehiculo?.estadoOperativo === 'EN_LIMPIEZA' && r.vehiculo?.disponibleDesde && new Date(r.vehiculo.disponibleDesde) > new Date()
            ? `<button data-disponible="${r.id}" data-auto="${esc((r.vehiculo?.marca ?? '') + ' ' + (r.vehiculo?.modelo ?? ''))}">Disponible</button> `
            : ''
        }${
          r.estado_mostrador === 'CONFIRMADO_ASISTIDO'
            ? `<button data-devolver="${r.id}" data-km="${r.kmSalida ?? 0}">Registrar devolución</button> `
            : ''
        }<button data-borrar="${r.id}" class="peligro">Borrar</button></td>
      </tr>`,
    )
    .join('');

  // Check-in de entrega en el mostrador: registra la entrega y, si la reserva vino de Booking, se lo notifica.
  tbody.querySelectorAll('[data-entregar]').forEach((b) =>
    b.addEventListener('click', async () => {
      const cedula = prompt(`Confirme la cédula / identificación del cliente (${b.dataset.nombre}):`, b.dataset.cedula);
      if (!cedula?.trim()) return;
      const licencia = prompt('Número de licencia del conductor:', b.dataset.licencia);
      if (!licencia?.trim()) return;
      const km = prompt('Kilometraje de salida:', b.dataset.km);
      if (km === null) return;
      try {
        const res = await api(`${ADMIN_API}/reservas/${b.dataset.entregar}/entrega`, {
          method: 'POST',
          body: JSON.stringify({ identificacion: cedula.trim(), licencia_conducir: licencia.trim(), km_salida: Number(km) }),
        });
        const n = res.notificacion_booking;
        alert(`Entrega confirmada. ${n?.enviada ? `Booking Central respondió acknowledged=${n.respuesta?.acknowledged ?? true}.` : `Booking NO fue notificado: ${n?.detalle ?? 'sin detalle'}`}`);
      } catch (e) {
        alert(e.message);
      }
      cargarReservas();
    }),
  );

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
