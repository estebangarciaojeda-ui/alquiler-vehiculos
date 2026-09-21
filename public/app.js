'use strict';

const API = '/api/v1';
const dinero = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const ETIQUETAS = {
  categoria: { ECONOMICO: 'Económico', COMPACTO: 'Compacto', INTERMEDIO: 'Intermedio', SUV: 'SUV', CAMIONETA: 'Camioneta', VAN: 'Van', LUJO: 'Lujo' },
  transmision: { MANUAL: 'Manual', AUTOMATICA: 'Automática' },
  combustible: { GASOLINA: 'Gasolina', DIESEL: 'Diésel', HIBRIDO: 'Híbrido', ELECTRICO: 'Eléctrico' },
};

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const esc = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------- Iconos y dibujo de autos (SVG propios) ---------- */

const ICONOS = {
  usuario: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  maleta: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  puertas: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 12h16"/>',
  cambios: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  aire: '<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>',
  combustible: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
};
const icono = (nombre) =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre]}</svg>`;

const CARROCERIAS = {
  sedan: {
    cuerpo: 'M14 72 L14 60 Q14 54 22 52 L44 48 Q56 30 82 28 L134 28 Q156 30 168 48 L196 54 Q206 56 206 64 L206 72 Z',
    ventanas: ['M60 48 Q68 36 84 35 L108 35 L108 48 Z', 'M114 35 L134 35 Q148 37 156 48 L114 48 Z'],
    ruedas: [52, 168],
  },
  lujo: {
    cuerpo: 'M12 72 L12 62 Q12 56 22 54 L50 50 Q66 34 92 32 L128 32 Q152 34 166 50 L198 56 Q208 58 208 66 L208 72 Z',
    ventanas: ['M64 50 Q72 40 92 39 L110 39 L110 50 Z', 'M116 39 L130 39 Q146 41 154 50 L116 50 Z'],
    ruedas: [54, 166],
  },
  suv: {
    cuerpo: 'M12 72 L12 54 Q12 48 20 46 L38 42 L50 20 Q53 15 62 15 L152 15 Q164 15 170 24 L184 44 L200 49 Q208 51 208 60 L208 72 Z',
    ventanas: ['M58 42 L65 24 L106 24 L106 42 Z', 'M112 24 L150 24 L162 42 L112 42 Z'],
    ruedas: [52, 166],
  },
  van: {
    cuerpo: 'M10 72 L10 40 Q10 30 20 28 L150 26 Q170 26 178 40 L196 48 Q206 50 206 58 L206 72 Z',
    ventanas: ['M22 36 L60 34 L60 46 L22 46 Z', 'M66 34 L104 34 L104 46 L66 46 Z', 'M110 34 L148 33 L148 46 L110 46 Z', 'M154 34 Q168 34 174 44 L154 46 Z'],
    ruedas: [50, 164],
  },
  pickup: {
    cuerpo: 'M12 72 L12 56 Q12 52 18 50 L40 48 Q50 32 72 30 L110 30 Q120 30 126 40 L130 50 L204 50 Q210 50 210 56 L210 72 Z',
    ventanas: ['M58 48 Q64 38 76 37 L100 37 L100 48 Z', 'M106 37 L114 37 Q120 40 124 48 L106 48 Z'],
    ruedas: [52, 168],
  },
};
const TIPO_POR_CATEGORIA = { ECONOMICO: 'sedan', COMPACTO: 'sedan', INTERMEDIO: 'sedan', SUV: 'suv', CAMIONETA: 'pickup', VAN: 'van', LUJO: 'lujo' };
const COLORES = ['#1d4ed8', '#0f766e', '#b91c1c', '#334155', '#a16207', '#6d28d9', '#0369a1', '#166534'];

const claveModelo = (v) =>
  `${v.marca} ${v.modelo}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function fotoAuto(v, credito) {
  const autor = credito.autor || 'Wikimedia Commons';
  return `<img class="auto-foto" src="img/autos/${esc(claveModelo(v))}.jpg" alt="${esc(v.marca)} ${esc(v.modelo)}" width="960" height="600" loading="lazy" data-id="${v.id}">
    <a class="foto-credito" href="${esc(credito.pagina)}" target="_blank" rel="noopener" title="Foto: ${esc(autor)} · ${esc(credito.licencia)}">Foto: ${esc(autor)} · ${esc(credito.licencia)}</a>`;
}

function dibujarAuto(v) {
  const c = CARROCERIAS[TIPO_POR_CATEGORIA[v.categoria] ?? 'sedan'];
  const color = COLORES[v.id % COLORES.length];
  const ventanas = c.ventanas.map((d) => `<path d="${d}" fill="#dbeafe"/>`).join('');
  const ruedas = c.ruedas
    .map((x) => `<circle cx="${x}" cy="72" r="13" fill="#0f172a"/><circle cx="${x}" cy="72" r="5.5" fill="#cbd5e1"/>`)
    .join('');
  return `<svg class="auto-img" viewBox="0 0 220 100" role="img" aria-label="${esc(v.marca)} ${esc(v.modelo)}">
    <ellipse cx="110" cy="88" rx="88" ry="5" fill="rgba(15,23,42,.14)"/>
    <path d="${c.cuerpo}" fill="${color}"/>${ventanas}
    <rect x="198" y="58" width="9" height="5" rx="2" fill="#fde68a"/><rect x="12" y="58" width="6" height="5" rx="2" fill="#fca5a5"/>
    ${ruedas}</svg>`;
}

/* ---------- Utilidades de fecha ---------- */

const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const partes = (iso) => iso.split('-').map(Number);
const sumarDias = (iso, n) => {
  const [y, m, d] = partes(iso);
  return aISO(new Date(y, m - 1, d + n));
};
const diasEntre = (a, b) => {
  const [ya, ma, da] = partes(a);
  const [yb, mb, db] = partes(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
};
const fechaCorta = (iso) => {
  const [y, m, d] = partes(iso);
  return new Date(y, m - 1, d).toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};
const hoy = () => aISO(new Date());

/* ---------- Acceso a la API ---------- */

async function api(ruta, opciones = {}) {
  const aviso = $('#aviso');
  const temporizador = setTimeout(() => { aviso.hidden = false; }, 3500);
  try {
    let res;
    try {
      res = await fetch(API + ruta, { headers: { 'Content-Type': 'application/json' }, ...opciones });
    } catch {
      throw new Error('No pudimos conectar con el servidor. Inténtalo de nuevo en unos segundos.');
    }
    const texto = await res.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch { datos = null; }
    if (!res.ok) {
      const mensaje = Array.isArray(datos?.message) ? datos.message.join('. ') : datos?.message;
      throw new Error(mensaje || `El servidor respondió con un error (${res.status}).`);
    }
    return datos;
  } finally {
    clearTimeout(temporizador);
    aviso.hidden = true;
  }
}

const guardar = (clave, valor) => { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } };
const leer = (clave) => { try { return localStorage.getItem(clave) ?? ''; } catch { return ''; } };

function mostrarError(selector, mensaje) {
  const el = $(selector);
  el.textContent = mensaje;
  el.hidden = !mensaje;
}

/* ---------- Estado ---------- */

const estado = {
  marcas: [],
  creditos: {},
  creditosListos: Promise.resolve(),
  sucursales: [],
  busqueda: null,
  filtros: { marca: '', categoria: '', transmision: '', pasajeros: '', precioMax: 200, orden: 'precio_asc' },
  vehiculos: [],
  peticion: 0,
};

/* ---------- Formulario de búsqueda ---------- */

function llenarHoras() {
  let opciones = '';
  for (let h = 0; h < 24; h++) {
    for (const m of ['00', '30']) {
      const valor = `${String(h).padStart(2, '0')}:${m}`;
      opciones += `<option value="${valor}"${valor === '10:00' ? ' selected' : ''}>${valor}</option>`;
    }
  }
  $('#hora-recogida').innerHTML = opciones;
  $('#hora-devolucion').innerHTML = opciones;
}

function configurarFechas() {
  const recogida = $('#fecha-recogida');
  const devolucion = $('#fecha-devolucion');
  recogida.min = hoy();
  recogida.value = sumarDias(hoy(), 1);
  devolucion.min = sumarDias(recogida.value, 1);
  devolucion.value = sumarDias(recogida.value, 4);
  recogida.addEventListener('change', () => {
    if (!recogida.value) return;
    devolucion.min = sumarDias(recogida.value, 1);
    if (!devolucion.value || devolucion.value <= recogida.value) devolucion.value = sumarDias(recogida.value, 3);
  });
}

function pintarSucursales() {
  const porCiudad = {};
  for (const s of estado.sucursales) (porCiudad[s.ciudad] ??= []).push(s);
  const opciones = Object.entries(porCiudad)
    .map(([ciudad, lista]) => `<optgroup label="${esc(ciudad)}">${lista.map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join('')}</optgroup>`)
    .join('');
  $('#sucursal').innerHTML = opciones;
  $('#sucursal-devolucion').innerHTML = opciones;
}

function pintarDestinos() {
  const porCiudad = {};
  for (const s of estado.sucursales) (porCiudad[s.ciudad] ??= []).push(s);
  $('#destinos').innerHTML = Object.entries(porCiudad)
    .map(([ciudad, lista]) => {
      const clave = claveMarca(ciudad);
      const credito = estado.creditos[`ciudad-${clave}`];
      const foto = `<img class="destino-foto" src="img/ciudades/${esc(clave)}.jpg" alt="" width="900" height="600" loading="lazy">`;
      const autor = credito ? `<span class="destino-credito">Foto: ${esc(credito.autor || 'Wikimedia Commons')} · ${esc(credito.licencia)}</span>` : '';
      return `<button type="button" class="destino" data-ciudad="${esc(ciudad)}">${foto}${autor}<strong>${esc(ciudad)}</strong><span class="destino-sub">${lista.length} ${lista.length === 1 ? 'sucursal' : 'sucursales'}</span></button>`;
    })
    .join('');
}

function validarBusqueda() {
  const sucursalId = Number($('#sucursal').value);
  const recogida = $('#fecha-recogida').value;
  const devolucion = $('#fecha-devolucion').value;
  if (!sucursalId) return 'Elige un lugar de recogida.';
  if (!recogida || !devolucion) return 'Elige las fechas de recogida y devolución.';
  if (recogida < hoy()) return 'La fecha de recogida no puede estar en el pasado.';
  if (devolucion <= recogida) return 'La devolución debe ser al menos un día después de la recogida.';
  return '';
}

async function buscar(evento) {
  evento?.preventDefault();
  const problema = validarBusqueda();
  mostrarError('#error-busqueda', problema);
  if (problema) return;

  const sucursalId = Number($('#sucursal').value);
  const recogida = $('#fecha-recogida').value;
  const devolucion = $('#fecha-devolucion').value;
  estado.busqueda = {
    sucursalId,
    recogida,
    devolucion,
    horaRecogida: $('#hora-recogida').value,
    horaDevolucion: $('#hora-devolucion').value,
    devolucionId: $('#otra-devolucion').checked ? Number($('#sucursal-devolucion').value) : sucursalId,
    dias: diasEntre(recogida, devolucion),
  };

  $('#promos').hidden = true;
  $('#resultados').hidden = false;
  if (matchMedia('(min-width: 1001px)').matches) $('#filtros').open = true;
  await cargarResultados();
  $('#res-titulo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#res-titulo').focus({ preventScroll: true });
}

/* ---------- Resultados ---------- */

async function cargarResultados() {
  const b = estado.busqueda;
  const f = estado.filtros;
  const consulta = new URLSearchParams({ sucursalId: b.sucursalId, desde: b.recogida, hasta: b.devolucion, orden: f.orden });
  if (f.marca) consulta.set('marca', f.marca);
  if (f.categoria) consulta.set('categoria', f.categoria);
  if (f.transmision) consulta.set('transmision', f.transmision);
  if (f.pasajeros) consulta.set('pasajeros', f.pasajeros);
  if (f.precioMax < 200) consulta.set('precioMax', f.precioMax);

  const turno = ++estado.peticion;
  $('#lista').innerHTML = '<div class="cargando"></div><div class="cargando"></div><div class="cargando"></div>';
  try {
    const vehiculos = await api(`/vehiculos?${consulta}`);
    await estado.creditosListos;
    if (turno !== estado.peticion) return;
    estado.vehiculos = vehiculos;
    pintarResultados();
  } catch (error) {
    if (turno !== estado.peticion) return;
    $('#lista').innerHTML = `<p class="vacio error">${esc(error.message)}</p>`;
  }
}

function pintarResultados() {
  const b = estado.busqueda;
  const sucursal = estado.sucursales.find((s) => s.id === b.sucursalId);
  const n = estado.vehiculos.length;
  $('#res-titulo').textContent = n === 1 ? '1 vehículo disponible' : `${n} vehículos disponibles`;
  $('#res-sub').textContent = `${sucursal ? `${sucursal.nombre}, ${sucursal.ciudad} · ` : ''}${fechaCorta(b.recogida)} → ${fechaCorta(b.devolucion)} (${b.dias} ${b.dias === 1 ? 'día' : 'días'})`;

  if (n === 0) {
    $('#lista').innerHTML = '<div class="vacio"><strong>No encontramos vehículos con esos filtros.</strong><br>Prueba con otras fechas, otra sucursal o quita algunos filtros.</div>';
    return;
  }

  $('#lista').innerHTML = estado.vehiculos
    .map((v) => {
      const total = v.precioPorDia * b.dias;
      return `<article class="auto">
        <div class="auto-media${estado.creditos[claveModelo(v)] ? ' auto-media--foto' : ''}">${estado.creditos[claveModelo(v)] ? fotoAuto(v, estado.creditos[claveModelo(v)]) : dibujarAuto(v)}<span class="chip">${esc(ETIQUETAS.categoria[v.categoria] ?? v.categoria)}</span></div>
        <div class="auto-info">
          <h3>${esc(v.marca)} ${esc(v.modelo)} <small>o similar · ${v.anio}</small></h3>
          <p class="auto-suc">${icono('pin')} ${esc(v.sucursal.nombre)}, ${esc(v.sucursal.ciudad)}</p>
          <ul class="specs">
            <li>${icono('usuario')} ${v.pasajeros} pasajeros</li>
            <li>${icono('maleta')} ${v.maletas} ${v.maletas === 1 ? 'maleta' : 'maletas'}</li>
            <li>${icono('puertas')} ${v.puertas} puertas</li>
            <li>${icono('cambios')} ${esc(ETIQUETAS.transmision[v.transmision] ?? v.transmision)}</li>
            <li>${icono('combustible')} ${esc(ETIQUETAS.combustible[v.combustible] ?? v.combustible)}</li>
            ${v.aireAcondicionado ? `<li>${icono('aire')} Aire acondicionado</li>` : ''}
          </ul>
          <ul class="ventajas"><li>${icono('check')} Cancelación gratuita</li><li>${icono('check')} Kilometraje ilimitado</li></ul>
        </div>
        <div class="auto-precio">
          <p class="total">${dinero.format(total)}</p>
          <p class="detalle">${b.dias} ${b.dias === 1 ? 'día' : 'días'} · ${dinero.format(v.precioPorDia)} por día</p>
          <button type="button" class="btn btn-primario" data-reservar="${v.id}">Reservar</button>
        </div>
      </article>`;
    })
    .join('');
}

function limpiarFiltros() {
  estado.filtros = { marca: '', categoria: '', transmision: '', pasajeros: '', precioMax: 200, orden: estado.filtros.orden };
  $('#filtro-marca').value = '';
  for (const nombre of ['categoria', 'transmision', 'pasajeros']) {
    $(`input[name="${nombre}"][value=""]`).checked = true;
  }
  $('#precio-max').value = 200;
  $('#precio-max-valor').textContent = 'Sin límite';
  cargarResultados();
}

/* ---------- Reserva ---------- */

const dlg = () => $('#dlg-reserva');

function abrirReserva(id) {
  const v = estado.vehiculos.find((x) => x.id === id);
  const b = estado.busqueda;
  if (!v || !b) return;
  const total = v.precioPorDia * b.dias;
  const devolucion = estado.sucursales.find((s) => s.id === b.devolucionId);

  $('#dlg-contenido').innerHTML = `<div class="dlg">
    <div class="dlg-cab"><h2 id="dlg-titulo">Confirma tu reserva</h2><button type="button" class="cerrar" data-cerrar aria-label="Cerrar">&times;</button></div>
    <div class="resumen">
      <strong>${esc(v.marca)} ${esc(v.modelo)} <span style="font-weight:500">o similar</span></strong>
      <p>Recogida: ${esc(v.sucursal.nombre)}, ${esc(v.sucursal.ciudad)}<br>${fechaCorta(b.recogida)} · ${b.horaRecogida}</p>
      <p>Devolución: ${esc(devolucion ? `${devolucion.nombre}, ${devolucion.ciudad}` : v.sucursal.nombre)}<br>${fechaCorta(b.devolucion)} · ${b.horaDevolucion}</p>
      <div class="total-linea"><span>${b.dias} ${b.dias === 1 ? 'día' : 'días'}</span><span>${dinero.format(total)}</span></div>
    </div>
    <form id="form-reserva" class="form-reserva">
      <label class="campo"><span>Nombre completo</span><input type="text" name="nombre" required maxlength="120" autocomplete="name" value="${esc(leer('ar-nombre'))}"></label>
      <label class="campo"><span>Correo electrónico</span><input type="email" name="email" required autocomplete="email" value="${esc(leer('ar-email'))}"></label>
      <label class="campo"><span>Teléfono</span><input type="tel" name="telefono" required pattern="[0-9+\\-\\s()]{7,20}" autocomplete="tel" value="${esc(leer('ar-telefono'))}"></label>
      <p id="error-reserva" class="error" role="alert" hidden></p>
      <button type="submit" class="btn btn-primario">Confirmar reserva · ${dinero.format(total)}</button>
    </form>
  </div>`;

  $('#form-reserva').addEventListener('submit', (e) => enviarReserva(e, v));
  dlg().showModal();
}

async function enviarReserva(evento, vehiculo) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const boton = $('button[type="submit"]', form);
  const b = estado.busqueda;
  const datos = new FormData(form);
  const cuerpo = {
    vehiculoId: vehiculo.id,
    fechaRecogida: b.recogida,
    horaRecogida: b.horaRecogida,
    fechaDevolucion: b.devolucion,
    horaDevolucion: b.horaDevolucion,
    nombreCliente: String(datos.get('nombre')).trim(),
    email: String(datos.get('email')).trim(),
    telefono: String(datos.get('telefono')).trim(),
  };
  if (b.devolucionId !== vehiculo.sucursalId) cuerpo.sucursalDevolucionId = b.devolucionId;

  boton.disabled = true;
  mostrarError('#error-reserva', '');
  try {
    const reserva = await api('/reservas', { method: 'POST', body: JSON.stringify(cuerpo) });
    guardar('ar-nombre', cuerpo.nombreCliente);
    guardar('ar-email', cuerpo.email);
    guardar('ar-telefono', cuerpo.telefono);
    mostrarConfirmacion(reserva);
    cargarResultados();
  } catch (error) {
    mostrarError('#error-reserva', error.message);
    boton.disabled = false;
    if (/no está disponible/i.test(error.message)) cargarResultados();
  }
}

function mostrarConfirmacion(r) {
  $('#dlg-contenido').innerHTML = `<div class="dlg exito">
    <div class="sello">${icono('check')}</div>
    <h2 id="dlg-titulo">¡Reserva confirmada!</h2>
    <p>Guarda tu código para consultar o cancelar tu reserva.</p>
    <div class="codigo-grande">${esc(r.codigo)}</div>
    <div class="resumen">
      <strong>${esc(r.vehiculo.marca)} ${esc(r.vehiculo.modelo)}</strong>
      <p>${fechaCorta(r.fechaRecogida)} → ${fechaCorta(r.fechaDevolucion)} (${r.dias} ${r.dias === 1 ? 'día' : 'días'})</p>
      <p>Recogida en ${esc(r.sucursalRecogida.nombre)}, ${esc(r.sucursalRecogida.ciudad)}</p>
      <div class="total-linea"><span>Total</span><span>${dinero.format(r.total)}</span></div>
    </div>
    <div class="acciones">
      <button type="button" class="btn btn-secundario" data-cerrar>Seguir buscando</button>
      <button type="button" class="btn btn-primario" data-ver-reservas="${esc(r.email)}">Ver mis reservas</button>
    </div>
  </div>`;
}

/* ---------- Mis reservas ---------- */

async function consultarReservas(evento) {
  evento?.preventDefault();
  const email = $('#consulta-email').value.trim();
  const codigo = $('#consulta-codigo').value.trim();
  mostrarError('#error-consulta', '');
  if (!email && !codigo) {
    mostrarError('#error-consulta', 'Escribe tu correo o tu código de reserva.');
    return;
  }
  const consulta = new URLSearchParams(codigo ? { codigo } : { email });
  $('#lista-reservas').innerHTML = '<div class="cargando"></div>';
  try {
    pintarReservas(await api(`/reservas?${consulta}`));
  } catch (error) {
    $('#lista-reservas').innerHTML = '';
    mostrarError('#error-consulta', error.message);
  }
}

function pintarReservas(reservas) {
  if (reservas.length === 0) {
    $('#lista-reservas').innerHTML = '<div class="vacio">No encontramos reservas con esos datos.</div>';
    return;
  }
  $('#lista-reservas').innerHTML = reservas
    .map(
      (r) => `<article class="reserva">
        <div>
          <p class="codigo">${esc(r.codigo)} <span class="estado estado-${esc(r.estado)}">${r.estado === 'CONFIRMADA' ? 'Confirmada' : 'Cancelada'}</span></p>
          <h3>${esc(r.vehiculo.marca)} ${esc(r.vehiculo.modelo)}</h3>
          <p>${fechaCorta(r.fechaRecogida)} · ${esc(r.horaRecogida)} → ${fechaCorta(r.fechaDevolucion)} · ${esc(r.horaDevolucion)}</p>
          <p>Recogida: ${esc(r.sucursalRecogida.nombre)}, ${esc(r.sucursalRecogida.ciudad)}<br>Devolución: ${esc(r.sucursalDevolucion.nombre)}, ${esc(r.sucursalDevolucion.ciudad)}</p>
          <p>A nombre de ${esc(r.nombreCliente)}</p>
        </div>
        <div class="lado">
          <span class="monto">${dinero.format(r.total)}</span>
          ${r.estado === 'CONFIRMADA' ? `<button type="button" class="btn btn-peligro" data-cancelar="${r.id}" data-codigo="${esc(r.codigo)}">Cancelar reserva</button>` : ''}
        </div>
      </article>`,
    )
    .join('');
}

async function cancelarReserva(id, codigo) {
  if (!confirm(`¿Cancelar la reserva ${codigo}? Esta acción no se puede deshacer.`)) return;
  try {
    await api(`/reservas/${id}/cancelar`, { method: 'PATCH' });
    await consultarReservas();
  } catch (error) {
    mostrarError('#error-consulta', error.message);
  }
}

/* ---------- Marcas (carrusel) ---------- */

const MARCAS_POPULARES = ['Kia', 'Toyota', 'Chevrolet', 'Hyundai', 'Suzuki', 'Nissan', 'Ford', 'Volkswagen', 'Mazda', 'Renault', 'Honda', 'Jeep', 'Mitsubishi', 'BMW', 'Mercedes-Benz', 'Tesla'];
const claveMarca = (m) => m.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function ordenarMarcas(marcas) {
  const posicion = (m) => { const i = MARCAS_POPULARES.indexOf(m); return i === -1 ? 999 : i; };
  return [...marcas].sort((a, b) => posicion(a) - posicion(b) || a.localeCompare(b, 'es'));
}

function tarjetaMarca(marca) {
  const logo = `<img src="img/marcas/${esc(claveMarca(marca))}.svg" alt="" width="70" height="56" loading="lazy" data-logo="${esc(marca)}">`;
  return `<button type="button" class="marca" data-marca="${esc(marca)}" aria-label="Ver autos ${esc(marca)}">
    <span class="marca-logo">${logo}</span><span class="marca-nombre">${esc(marca)}</span></button>`;
}

function pintarMarcas() {
  const marcas = ordenarMarcas(estado.marcas);
  $('#marcas-pista').innerHTML = marcas.map(tarjetaMarca).join('');
  $('#filtro-marca').insertAdjacentHTML('beforeend', [...estado.marcas].sort((a, b) => a.localeCompare(b, 'es')).map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join(''));
  actualizarFlechas();
}

function actualizarFlechas() {
  const pista = $('#marcas-pista');
  $('#marcas-prev').disabled = pista.scrollLeft <= 2;
  $('#marcas-next').disabled = pista.scrollLeft + pista.clientWidth >= pista.scrollWidth - 2;
}

function desplazarMarcas(direccion) {
  const pista = $('#marcas-pista');
  pista.scrollBy({ left: direccion * Math.max(240, pista.clientWidth * 0.8), behavior: 'smooth' });
}

function abrirTodasLasMarcas() {
  $('#dlg-contenido').innerHTML = `<div class="dlg">
    <div class="dlg-cab"><h2 id="dlg-titulo">Todas las marcas</h2><button type="button" class="cerrar" data-cerrar aria-label="Cerrar">&times;</button></div>
    <p class="sub">Elige una marca para ver sus vehículos disponibles.</p>
    <div class="marcas-grid">${ordenarMarcas(estado.marcas).map(tarjetaMarca).join('')}</div>
  </div>`;
  dlg().showModal();
}

async function elegirMarca(marca) {
  estado.filtros.marca = marca;
  $('#filtro-marca').value = marca;
  if (dlg().open) dlg().close();
  await buscar();
}

/* ---------- Créditos de las fotos ---------- */

function abrirCreditos() {
  const enlace = (url) => (String(url).startsWith('https://') ? esc(url) : '#');
  const filas = Object.values(estado.creditos)
    .sort((a, b) => a.modelo.localeCompare(b.modelo, 'es'))
    .map(
      (c) => `<li><strong>${esc(c.modelo)}</strong><br>
        <a href="${enlace(c.pagina)}" target="_blank" rel="noopener">${esc(c.foto)}</a> · ${esc(c.autor || 'Autor desconocido')} ·
        <a href="${enlace(c.licenciaUrl)}" target="_blank" rel="noopener">${esc(c.licencia)}</a></li>`,
    )
    .join('');
  $('#dlg-contenido').innerHTML = `<div class="dlg">
    <div class="dlg-cab"><h2 id="dlg-titulo">Créditos de las fotos</h2><button type="button" class="cerrar" data-cerrar aria-label="Cerrar">&times;</button></div>
    <p class="sub">Fotografías de <a href="https://commons.wikimedia.org/" target="_blank" rel="noopener">Wikimedia Commons</a> con licencias Creative Commons. Los vehículos mostrados son ilustrativos ("o similar"). Logos de marcas: <a href="https://simpleicons.org/" target="_blank" rel="noopener">Simple Icons</a> (CC0); las marcas y logotipos pertenecen a sus respectivos dueños y se usan solo para identificar cada marca.</p>
    <ul class="creditos">${filas || '<li>No hay créditos disponibles.</li>'}</ul>
  </div>`;
  dlg().showModal();
}

/* ---------- Navegación y eventos ---------- */

function enrutar() {
  const enReservas = location.hash === '#mis-reservas';
  $('#vista-inicio').hidden = enReservas;
  $('#vista-reservas').hidden = !enReservas;
  for (const enlace of $$('[data-nav]')) {
    enlace.setAttribute('aria-current', enlace.dataset.nav === (enReservas ? 'mis-reservas' : 'inicio') ? 'page' : 'false');
  }
  if (location.hash === '#inicio' && estado.busqueda) {
    estado.busqueda = null;
    $('#resultados').hidden = true;
    $('#promos').hidden = false;
  }
  window.scrollTo({ top: 0 });
}

function enlazarEventos() {
  $('#form-busqueda').addEventListener('submit', buscar);
  $('#form-reservas').addEventListener('submit', consultarReservas);
  $('#otra-devolucion').addEventListener('change', (e) => { $('#wrap-devolucion').hidden = !e.target.checked; });
  window.addEventListener('hashchange', enrutar);

  $('#orden').addEventListener('change', (e) => { estado.filtros.orden = e.target.value; cargarResultados(); });
  for (const radio of $$('#filtros input[type="radio"]')) {
    radio.addEventListener('change', () => { estado.filtros[radio.name] = radio.value; cargarResultados(); });
  }
  let temporizador;
  $('#precio-max').addEventListener('input', (e) => {
    const valor = Number(e.target.value);
    estado.filtros.precioMax = valor;
    $('#precio-max-valor').textContent = valor >= 200 ? 'Sin límite' : `Hasta ${dinero.format(valor)} por día`;
    clearTimeout(temporizador);
    temporizador = setTimeout(cargarResultados, 300);
  });
  $('#limpiar-filtros').addEventListener('click', limpiarFiltros);
  $('#filtro-marca').addEventListener('change', (e) => { estado.filtros.marca = e.target.value; cargarResultados(); });
  $('#marcas-prev').addEventListener('click', () => desplazarMarcas(-1));
  $('#marcas-next').addEventListener('click', () => desplazarMarcas(1));
  $('#marcas-todas').addEventListener('click', abrirTodasLasMarcas);
  $('#marcas-pista').addEventListener('scroll', actualizarFlechas, { passive: true });
  window.addEventListener('resize', actualizarFlechas);

  document.addEventListener('click', (e) => {
    const objetivo = e.target.closest('button');
    if (!objetivo) return;
    if (objetivo.dataset.marca) elegirMarca(objetivo.dataset.marca);
    else if (objetivo.dataset.reservar) abrirReserva(Number(objetivo.dataset.reservar));
    else if (objetivo.dataset.cancelar) cancelarReserva(Number(objetivo.dataset.cancelar), objetivo.dataset.codigo);
    else if ('cerrar' in objetivo.dataset) dlg().close();
    else if (objetivo.dataset.verReservas !== undefined) {
      dlg().close();
      $('#consulta-email').value = objetivo.dataset.verReservas;
      $('#consulta-codigo').value = '';
      location.hash = '#mis-reservas';
      consultarReservas();
    } else if (objetivo.dataset.ciudad) {
      const primera = estado.sucursales.find((s) => s.ciudad === objetivo.dataset.ciudad);
      if (primera) $('#sucursal').value = String(primera.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      $('#fecha-recogida').focus({ preventScroll: true });
    }
  });
  dlg().addEventListener('click', (e) => { if (e.target === dlg()) dlg().close(); });
  $('#ver-creditos').addEventListener('click', (e) => { e.preventDefault(); abrirCreditos(); });
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (img instanceof HTMLImageElement && img.classList.contains('destino-foto')) {
        img.closest('.destino')?.querySelector('.destino-credito')?.remove();
        img.remove();
        return;
      }
      if (img instanceof HTMLImageElement && img.dataset.logo) {
        img.outerHTML = `<span class="marca-inicial">${esc(img.dataset.logo.charAt(0))}</span>`;
        return;
      }
      if (!(img instanceof HTMLImageElement) || !img.classList.contains('auto-foto')) return;
      const vehiculo = estado.vehiculos.find((x) => x.id === Number(img.dataset.id));
      const media = img.closest('.auto-media');
      if (!vehiculo || !media) return;
      media.classList.remove('auto-media--foto');
      media.querySelector('.foto-credito')?.remove();
      img.outerHTML = dibujarAuto(vehiculo);
    },
    true,
  );
  $('#consulta-email').value = leer('ar-email');
}

async function iniciar() {
  if (matchMedia('(max-width: 1000px)').matches) $('#filtros').open = false;
  estado.creditosListos = fetch('img/creditos.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((datos) => { estado.creditos = datos; })
    .catch(() => {});
  llenarHoras();
  configurarFechas();
  enlazarEventos();
  enrutar();
  api('/vehiculos/marcas')
    .then((marcas) => { estado.marcas = marcas; pintarMarcas(); })
    .catch(() => { $('#carrusel-marcas').closest('#promos').querySelector('.marcas-cab').hidden = true; $('#carrusel-marcas').hidden = true; });
  try {
    estado.sucursales = await api('/sucursales');
    pintarSucursales();
    await estado.creditosListos;
    pintarDestinos();
  } catch (error) {
    $('#sucursal').innerHTML = '<option value="">No se pudieron cargar las sucursales</option>';
    mostrarError('#error-busqueda', error.message);
  }
}

iniciar();
