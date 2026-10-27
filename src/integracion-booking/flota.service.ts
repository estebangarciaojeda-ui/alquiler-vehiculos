import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { Reserva } from '../reservas/reserva.entity.js';
import { Sucursal } from '../sucursales/sucursal.entity.js';
import { Vehiculo } from '../vehiculos/vehiculo.entity.js';
import {
  calcularTarifa,
  categoriaContrato,
  categoriasInternas,
  claveModelo,
  COBERTURAS,
  COOLDOWN_MINUTOS,
  diasEntre,
  enLimpiezaActiva,
  estadoEfectivo,
  fechaYSlotLocal,
  idPublico,
  MONEDA,
  parsearIdPublico,
  resolverSucursales,
  segundosRestantesCooldown,
  transmisionContrato,
  type EstadoVehiculo,
  type ErrorCampo,
  type SolicitudBusqueda,
} from './booking.util.js';
import { AutoBitacora, AutoPromoContrato } from './entities.js';
import { EventosService } from './eventos.service.js';
import { ProblemaV3Exception } from './problema-v3.js';
import { RegistroService } from './registro.service.js';
import { StockSyncService } from './stock-sync.service.js';

type Contexto = { base: string; dias?: number; edad?: number };
const ESTADOS_NO_PUBLICABLES: EstadoVehiculo[] = ['RESERVADO', 'LISTO_PARA_ENTREGAR', 'ENTREGADO', 'EN_LIMPIEZA', 'EN_MANTENIMIENTO'];

@Injectable()
export class FlotaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Flota');
  private temporizador?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Vehiculo) private readonly vehiculos: Repository<Vehiculo>,
    @InjectRepository(Reserva) private readonly reservas: Repository<Reserva>,
    @InjectRepository(Sucursal) private readonly sucursales: Repository<Sucursal>,
    @InjectRepository(AutoBitacora) private readonly bitacora: Repository<AutoBitacora>,
    @InjectRepository(AutoPromoContrato) private readonly promo: Repository<AutoPromoContrato>,
    private readonly sync: StockSyncService,
    private readonly eventos: EventosService,
    private readonly registro: RegistroService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    // Libera los autos cuyo cooldown de limpieza de 2 h ya terminó y avisa a Booking (available_units = 1).
    this.temporizador = setInterval(() => void this.liberarVencidos(), 30_000);
    this.temporizador.unref();
    setTimeout(() => void this.liberarVencidos(), 5000).unref();
  }

  onModuleDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  // ── Lectura ───────────────────────────────────────────────────────────

  async buscarVehiculo(idPub: string): Promise<Vehiculo> {
    const id = parsearIdPublico(idPub);
    const v = id === null ? null : await this.vehiculos.findOneBy({ id });
    if (!v) throw new ProblemaV3Exception(404, 'NOT_FOUND', 'Vehículo no encontrado', `El vehículo ${idPub} no existe en la flota.`);
    return v;
  }

  private async reservasVivasPorVehiculo(ids: number[]): Promise<Map<number, Reserva[]>> {
    const mapa = new Map<number, Reserva[]>();
    if (ids.length === 0) return mapa;
    const filas = await this.reservas.find({ where: { vehiculoId: In(ids), estado: 'CONFIRMADA' }, loadEagerRelations: false });
    for (const r of filas) mapa.set(r.vehiculoId, [...(mapa.get(r.vehiculoId) ?? []), r]);
    return mapa;
  }

  estadoDe(v: Vehiculo, reservas: Reserva[] = []): EstadoVehiculo {
    return estadoEfectivo(v, reservas);
  }

  /** AutoVehiculoCardV2: campos canónicos + alias en español/inglés que tolera Booking. */
  tarjeta(v: Vehiculo, estado: EstadoVehiculo, ctx: Contexto) {
    const dias = ctx.dias ?? 1;
    const tarifa = calcularTarifa(v.precioPorDia, dias, 'BASICA', ctx.edad);
    const id = idPublico(v.id);
    const foto = `${ctx.base}/img/autos/${claveModelo(v.marca, v.modelo)}.jpg`;
    const categoria = categoriaContrato(v.categoria);
    const transmision = transmisionContrato(v.transmision);
    const grandes = Math.ceil(v.maletas / 2);
    const cooldown = this.cooldownInfo(v);
    const cobertura = v.sucursal ? `${v.sucursal.nombre}, ${v.sucursal.ciudad}` : 'AutoSpot';
    return {
      vehicle_id: id,
      marca: v.marca,
      modelo: v.modelo,
      categoria,
      precio_diario: v.precioPorDia,
      precio_total: tarifa.total,
      moneda: MONEDA,
      transmision,
      asientos: v.pasajeros,
      puertas: v.puertas,
      maletas_grandes: grandes,
      maletas_pequenas: v.maletas - grandes,
      aire_acondicionado: v.aireAcondicionado,
      kilometraje_ilimitado: true,
      politica_combustible: 'LLENO_A_LLENO',
      cancelacion_gratuita: true,
      proveedor: { nombre: 'AutoSpot', rating: 4.6, ubicacion: cobertura },
      estado,
      kilometraje_actual: v.kilometrajeActual,
      proximo_mantenimiento_km: v.proximoMantenimientoKm,
      mantenimiento_requerido: v.kilometrajeActual >= v.proximoMantenimientoKm,
      foto_url: foto,
      images: [foto],
      auto_id: id,
      id,
      brand: v.marca,
      model: v.modelo,
      category: categoria,
      daily_price: v.precioPorDia,
      total_price_usd: tarifa.total,
      currency: MONEDA,
      transmission: transmision,
      seats: v.pasajeros,
      doors: v.puertas,
      air_conditioning: v.aireAcondicionado,
      unlimited_mileage: true,
      fuel_policy: 'Lleno a Lleno (Full-to-Full)',
      free_cancellation: true,
      total_price: tarifa.total,
      status: estado,
      cleaning_cooldown: cooldown,
    };
  }

  private cooldownInfo(v: Vehiculo) {
    const activo = enLimpiezaActiva(v);
    return {
      cooldown_horas: COOLDOWN_MINUTOS / 60,
      cooldown_minutos: COOLDOWN_MINUTOS,
      activo,
      inicio_cooldown: activo && v.disponibleDesde ? new Date(v.disponibleDesde.getTime() - COOLDOWN_MINUTOS * 60_000).toISOString() : null,
      fin_cooldown: activo && v.disponibleDesde ? v.disponibleDesde.toISOString() : null,
      proximo_estado: 'DISPONIBLE',
    };
  }

  async catalogo(filtros: { categoria?: string; transmision?: string; limit: number }, base: string) {
    const qb = this.vehiculos.createQueryBuilder('v').leftJoinAndSelect('v.sucursal', 's').orderBy('v.id', 'ASC');
    if (filtros.categoria && filtros.categoria !== 'ALL') {
      qb.andWhere('v.categoria IN (:...cats)', { cats: categoriasInternas(filtros.categoria).length ? categoriasInternas(filtros.categoria) : [filtros.categoria] });
    }
    if (filtros.transmision && filtros.transmision !== 'ALL') {
      qb.andWhere('v.transmision = :t', { t: filtros.transmision === 'AUTOMATICO' ? 'AUTOMATICA' : filtros.transmision });
    }
    const todos = await qb.getMany();
    const vivas = await this.reservasVivasPorVehiculo(todos.map((v) => v.id));
    const publicables = todos
      .map((v) => ({ v, estado: this.estadoDe(v, vivas.get(v.id)) }))
      .filter((x) => !ESTADOS_NO_PUBLICABLES.includes(x.estado));
    return {
      total: publicables.length,
      limit: filtros.limit,
      data: publicables.slice(0, filtros.limit).map((x) => this.tarjeta(x.v, x.estado, { base })),
    };
  }

  async detalle(idPub: string, base: string) {
    const v = await this.buscarVehiculo(idPub);
    const vivas = await this.reservasVivasPorVehiculo([v.id]);
    return this.tarjeta(v, this.estadoDe(v, vivas.get(v.id)), { base });
  }

  async buscar(sol: SolicitudBusqueda, base: string) {
    const sucursales = await this.sucursales.find();
    const ids = resolverSucursales(sol.lugarRecogida, sucursales);

    const qb = this.vehiculos.createQueryBuilder('v').leftJoinAndSelect('v.sucursal', 's').orderBy('v.precioPorDia', 'ASC').addOrderBy('v.id', 'ASC');
    if (ids) qb.andWhere('v.sucursalId IN (:...ids)', { ids });
    if (sol.categoria !== 'ALL') qb.andWhere('v.categoria IN (:...cats)', { cats: categoriasInternas(sol.categoria) });
    if (sol.transmision !== 'ALL') qb.andWhere('v.transmision = :t', { t: sol.transmision });
    qb.andWhere(
      `NOT EXISTS (
        SELECT 1 FROM reservas r
        WHERE r."vehiculoId" = v.id AND r.estado = 'CONFIRMADA'
          AND r."fechaRecogida" < :hasta AND r."fechaDevolucion" > :desde
      )`,
      { desde: sol.recogida, hasta: sol.devolucion },
    );

    const candidatos = (await qb.getMany()).filter((v) => v.estadoOperativo !== 'EN_MANTENIMIENTO' && !enLimpiezaActiva(v));
    const dias = diasEntre(sol.recogida, sol.devolucion);
    const data = candidatos.map((v) => this.tarjeta(v, 'DISPONIBLE', { base, dias, edad: sol.edad }));
    const recargo = data.length > 0 ? calcularTarifa(candidatos[0].precioPorDia, dias, 'BASICA', sol.edad).surcharge : 0;
    return {
      request_id: `req-autos-${randomBytes(3).toString('hex')}`,
      metadata: {
        total_results: data.length,
        surcharge_applied: recargo > 0,
        surcharge_amount: recargo,
        pickup_location: sol.lugarRecogida,
        pickup_date: sol.recogida,
        dropoff_date: sol.devolucion,
      },
      data,
    };
  }

  async flota(base: string) {
    const todos = await this.vehiculos.find({ order: { id: 'ASC' } });
    const vivas = await this.reservasVivasPorVehiculo(todos.map((v) => v.id));
    return todos.map((v) => {
      const estado = this.estadoDe(v, vivas.get(v.id));
      return {
        id: idPublico(v.id),
        marca: v.marca,
        modelo: v.modelo,
        categoria: categoriaContrato(v.categoria),
        precio_diario: v.precioPorDia,
        estado_operativo: estado,
        cooldown_activo: enLimpiezaActiva(v),
        segundos_restantes_cooldown: segundosRestantesCooldown(v),
        disponible_estimado_at: enLimpiezaActiva(v) && v.disponibleDesde ? v.disponibleDesde.toISOString() : null,
        kilometraje_actual: v.kilometrajeActual,
        umbral_mantenimiento_km: v.proximoMantenimientoKm,
        alerta_mantenimiento: v.kilometrajeActual >= v.proximoMantenimientoKm,
        foto_url: `${base}/img/autos/${claveModelo(v.marca, v.modelo)}.jpg`,
      };
    });
  }

  async coberturas(idPub: string) {
    const v = await this.buscarVehiculo(idPub);
    const b = COBERTURAS.BASICA;
    const t = COBERTURAS.TOTAL;
    return {
      auto_id: idPublico(v.id),
      vehiculo: `${v.marca} ${v.modelo}`,
      opciones: [
        {
          tipo: 'BASICA',
          nombre: 'Protección Básica (incluida)',
          costo_adicional_diario: b.costoDiario,
          franquicia: b.franquicia,
          deposito_garantia: b.deposito,
          descripcion: 'Cobertura obligatoria con franquicia y retención de depósito de garantía en tarjeta de crédito.',
          beneficios: ['Responsabilidad civil', 'Asistencia en carretera'],
        },
        {
          tipo: 'TOTAL',
          nombre: 'Cobertura Total / Protección Premium',
          costo_adicional_diario: t.costoDiario,
          franquicia: t.franquicia,
          deposito_garantia: t.deposito,
          descripcion: 'Elimina la franquicia ante daños en carrocería, cristales, neumáticos y llaves.',
          beneficios: ['Franquicia $0', 'Sin depósito de garantía', 'Cristales, neumáticos y bajos', 'Pérdida de llaves'],
        },
      ],
    };
  }

  // ── Máquina de estados ────────────────────────────────────────────────

  /** Auto devuelto: EN_LIMPIEZA durante 120 min (excluido de búsquedas y reservas; Booking recibe 0 unidades). */
  async iniciarCooldown(v: Vehiculo, correlationId?: string): Promise<Date> {
    const hasta = new Date(Date.now() + COOLDOWN_MINUTOS * 60_000);
    await this.vehiculos.update(v.id, { estadoOperativo: 'EN_LIMPIEZA', disponibleDesde: hasta });
    this.sync.empujarAhoraEnSegundoPlano(v.id, false, 'cooldown-limpieza');
    await this.eventos
      .emitir('cooldown.started', { auto_id: idPublico(v.id), estado: 'EN_LIMPIEZA', cooldown_minutos: COOLDOWN_MINUTOS, disponible_desde: hasta.toISOString() }, correlationId)
      .catch((e) => this.logger.warn(`No se pudo registrar el evento de cooldown: ${(e as Error).message}`));
    this.registro.registrar('info', 'flota.cooldown.inicio', { correlation_id: correlationId, auto_id: idPublico(v.id), disponible_desde: hasta.toISOString() });
    return hasta;
  }

  async devolucionDirecta(idPub: string, correlationId?: string) {
    const v = await this.buscarVehiculo(idPub);
    const hasta = await this.iniciarCooldown(v, correlationId);
    return {
      auto_id: idPublico(v.id),
      vehiculo: `${v.marca} ${v.modelo}`,
      estado: 'EN_LIMPIEZA',
      cooldown_horas: COOLDOWN_MINUTOS / 60,
      disponible_desde: hasta.toISOString(),
      mensaje: 'Vehículo en ciclo de limpieza y desinfección. Estará disponible en 2 horas.',
    };
  }

  async liberarVencidos(): Promise<number> {
    try {
      const vencidos = await this.vehiculos.find({
        where: { estadoOperativo: 'EN_LIMPIEZA', disponibleDesde: LessThanOrEqual(new Date()) },
        loadEagerRelations: false,
      });
      for (const v of vencidos) {
        await this.vehiculos.update(v.id, { estadoOperativo: 'DISPONIBLE', disponibleDesde: null });
        this.sync.empujarAhoraEnSegundoPlano(v.id, true, 'fin-cooldown');
        this.registro.registrar('info', 'flota.cooldown.fin', { auto_id: idPublico(v.id) });
      }
      return vencidos.length;
    } catch (e) {
      this.logger.warn(`No se pudo liberar autos en limpieza: ${(e as Error).message}`);
      return 0;
    }
  }

  async cambiarEstado(idPub: string, estado: unknown) {
    if (estado !== 'DISPONIBLE' && estado !== 'EN_MANTENIMIENTO' && estado !== 'EN_LIMPIEZA') {
      throw new ProblemaV3Exception(422, 'INVALID_PAYLOAD', 'Estado inválido', 'Valores permitidos: DISPONIBLE, EN_MANTENIMIENTO, EN_LIMPIEZA.', [
        { name: 'estado', reason: 'Debe ser DISPONIBLE, EN_MANTENIMIENTO o EN_LIMPIEZA.' },
      ]);
    }
    const v = await this.buscarVehiculo(idPub);
    if (estado === 'EN_LIMPIEZA') {
      const hasta = await this.iniciarCooldown(v);
      return { auto_id: idPublico(v.id), estado, disponible_desde: hasta.toISOString() };
    }
    await this.vehiculos.update(v.id, { estadoOperativo: estado, disponibleDesde: null });
    this.sync.empujarAhoraEnSegundoPlano(v.id, estado === 'DISPONIBLE', `estado-${estado.toLowerCase()}`);
    this.registro.registrar('info', 'flota.estado', { auto_id: idPublico(v.id), estado });
    return { auto_id: idPublico(v.id), estado, disponible_desde: null };
  }

  async registrarMantenimiento(idPub: string, cuerpo: unknown, correlationId?: string) {
    const v = await this.buscarVehiculo(idPub);
    const b = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>;
    const errores: ErrorCampo[] = [];
    const tecnico = typeof b.tecnico_id === 'string' && b.tecnico_id.trim() ? b.tecnico_id.trim() : undefined;
    const km = b.kilometraje_registrado;
    const combustible = b.nivel_combustible;
    if (!tecnico) errores.push({ name: 'tecnico_id', reason: 'Obligatorio.' });
    if (typeof km !== 'number' || !Number.isInteger(km) || km < 0) errores.push({ name: 'kilometraje_registrado', reason: 'Entero >= 0 obligatorio.' });
    if (typeof combustible !== 'number' || !Number.isInteger(combustible) || combustible < 0 || combustible > 100) {
      errores.push({ name: 'nivel_combustible', reason: 'Entero entre 0 y 100 obligatorio.' });
    }
    const nuevoUmbral = b.nuevo_proximo_mantenimiento_km;
    if (nuevoUmbral !== undefined && (typeof nuevoUmbral !== 'number' || !Number.isInteger(nuevoUmbral) || (typeof km === 'number' && nuevoUmbral <= km))) {
      errores.push({ name: 'nuevo_proximo_mantenimiento_km', reason: 'Debe ser un entero mayor al kilometraje registrado.' });
    }
    if (errores.length > 0) throw new ProblemaV3Exception(422, 'INVALID_PAYLOAD', 'Registro de mantenimiento inválido', 'Revise los campos indicados.', errores);

    const kilometraje = km as number;
    const realizado = b.mantenimiento_realizado === true;
    const proximo = realizado ? ((nuevoUmbral as number | undefined) ?? kilometraje + 10_000) : v.proximoMantenimientoKm;
    const cambios: Partial<Vehiculo> = { kilometrajeActual: kilometraje, proximoMantenimientoKm: proximo };
    const volvioAServicio = realizado && v.estadoOperativo === 'EN_MANTENIMIENTO';
    if (volvioAServicio) {
      cambios.estadoOperativo = 'DISPONIBLE';
      cambios.disponibleDesde = null;
    }
    await this.vehiculos.update(v.id, cambios);
    if (volvioAServicio) this.sync.empujarAhoraEnSegundoPlano(v.id, true, 'fin-mantenimiento');

    const fila = await this.bitacora.save(
      this.bitacora.create({
        vehiculoId: v.id,
        tecnicoId: tecnico as string,
        kilometraje,
        nivelCombustible: combustible as number,
        carroceria: typeof b.condiciones_carroceria === 'string' ? b.condiciones_carroceria.slice(0, 300) : null,
        neumaticos: typeof b.estado_neumaticos === 'string' ? b.estado_neumaticos.slice(0, 100) : null,
        observaciones: typeof b.observaciones === 'string' ? b.observaciones.slice(0, 500) : null,
        mantenimientoRealizado: realizado,
        alerta: kilometraje >= proximo,
      }),
    );

    const alerta = kilometraje >= proximo;
    if (alerta) {
      await this.eventos
        .emitir('mantenimiento.alerta', { auto_id: idPublico(v.id), kilometraje_actual: kilometraje, proximo_mantenimiento_km: proximo, severidad: 'WARNING' }, correlationId)
        .catch(() => undefined);
      this.registro.registrar('warn', 'mantenimiento.alerta', { correlation_id: correlationId, auto_id: idPublico(v.id), kilometraje_actual: kilometraje, proximo_mantenimiento_km: proximo });
    }
    return {
      auto_id: idPublico(v.id),
      marca_modelo: `${v.marca} ${v.modelo}`,
      kilometraje_actual: kilometraje,
      proximo_mantenimiento_km: proximo,
      mantenimiento_requerido: alerta,
      alerta_preventiva: alerta
        ? `ALERTA PREVENTIVA: El vehículo ha superado el límite de ${proximo} km. Mantenimiento requerido.`
        : 'Kilometraje en rango normal.',
      nivel_combustible: `${combustible as number}%`,
      bitacora_id: `BIT-AUTO-${fila.id}`,
      timestamp: new Date().toISOString(),
    };
  }

  /** Empuja a Booking el estado actual de toda la flota (turno vigente en hora de Ecuador). */
  async sincronizarFlota() {
    const todos = await this.vehiculos.find({ order: { id: 'ASC' }, loadEagerRelations: false });
    const vivas = await this.reservasVivasPorVehiculo(todos.map((v) => v.id));
    let enviados = 0;
    let fallidos = 0;
    let ultimoDetalle: string | undefined;
    const { fecha, slot } = fechaYSlotLocal(new Date());
    for (let i = 0; i < todos.length; i += 4) {
      const lote = todos.slice(i, i + 4);
      const resultados = await Promise.all(
        lote.map((v) => this.sync.empujar(v.id, fecha, slot, this.estadoDe(v, vivas.get(v.id)) === 'DISPONIBLE', 'sincronizacion-manual')),
      );
      for (const r of resultados) {
        if (r.ok) enviados++;
        else {
          fallidos++;
          ultimoDetalle = r.detalle ?? r.codigo;
        }
      }
    }
    return {
      node_id: this.sync.nodeId,
      habilitado: this.sync.habilitado,
      circuit_breaker_estado: this.sync.estadoCircuito(),
      total: todos.length,
      enviados,
      fallidos,
      ultimo_error: ultimoDetalle,
    };
  }

  // ── Acuerdo B2B de promociones ────────────────────────────────────────

  private async contratoPromo(): Promise<AutoPromoContrato> {
    let fila = await this.promo.findOneBy({ id: 1 });
    if (!fila) {
      const ciudades = [...new Set((await this.sucursales.find()).map((s) => s.ciudad))];
      fila = await this.promo.save(
        this.promo.create({
          id: 1,
          permitePromociones: true,
          porcentajeDescuentoMaximo: 15,
          destinosHabilitados: ciudades,
          vigenciaHasta: '2026-12-31',
          condicionesCombo: 'Descuento autorizado del 15% en combos multivertical con hotel o vuelo.',
        }),
      );
    }
    return fila;
  }

  private contratoARespuesta(c: AutoPromoContrato) {
    return {
      proveedor_codigo: this.sync.nodeId,
      nombre_socio: 'AutoSpot (Flota Partner)',
      vertical: 'AUTOS',
      permite_promociones: c.permitePromociones,
      porcentaje_descuento_maximo: c.porcentajeDescuentoMaximo,
      destinos_habilitados: c.destinosHabilitados,
      vigencia_hasta: c.vigenciaHasta,
      condiciones_combo: c.condicionesCombo,
    };
  }

  async obtenerContratoPromo() {
    return this.contratoARespuesta(await this.contratoPromo());
  }

  async actualizarContratoPromo(cuerpo: unknown) {
    const b = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>;
    const errores: ErrorCampo[] = [];
    if (typeof b.permite_promociones !== 'boolean') errores.push({ name: 'permite_promociones', reason: 'Booleano obligatorio.' });
    const pct = b.porcentaje_descuento_maximo;
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      errores.push({ name: 'porcentaje_descuento_maximo', reason: 'Número obligatorio entre 0 y 100.' });
    }
    if (b.destinos_habilitados !== undefined && (!Array.isArray(b.destinos_habilitados) || b.destinos_habilitados.some((d) => typeof d !== 'string'))) {
      errores.push({ name: 'destinos_habilitados', reason: 'Debe ser un arreglo de textos.' });
    }
    if (b.vigencia_hasta !== undefined && (typeof b.vigencia_hasta !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.vigencia_hasta))) {
      errores.push({ name: 'vigencia_hasta', reason: 'Formato YYYY-MM-DD.' });
    }
    if (errores.length > 0) throw new ProblemaV3Exception(400, 'MALFORMED_REQUEST', 'Acuerdo B2B inválido', 'Revise los campos indicados.', errores);

    const actual = await this.contratoPromo();
    actual.permitePromociones = b.permite_promociones as boolean;
    actual.porcentajeDescuentoMaximo = pct as number;
    if (b.destinos_habilitados !== undefined) actual.destinosHabilitados = b.destinos_habilitados as string[];
    if (b.vigencia_hasta !== undefined) actual.vigenciaHasta = b.vigencia_hasta as string;
    if (typeof b.condiciones_combo === 'string') actual.condicionesCombo = b.condiciones_combo.slice(0, 500);
    const guardado = await this.promo.save(actual);
    return {
      success: true,
      mensaje: 'Acuerdo B2B de promociones y combos actualizado exitosamente.',
      contrato: this.contratoARespuesta(guardado),
    };
  }

  // ── Salud ─────────────────────────────────────────────────────────────

  async salud() {
    const t0 = Date.now();
    try {
      await this.vehiculos.query('SELECT 1');
      const latencia = Date.now() - t0;
      const todos = await this.vehiculos.find({ loadEagerRelations: false });
      return {
        status: 'HEALTHY',
        nodo_id: this.sync.nodeId,
        nombre_proveedor: 'AutoSpot',
        vertical: 'AUTOS',
        version: '3.0.0',
        uptime_seconds: Math.floor(process.uptime()),
        latencia_ms: latencia,
        circuit_breaker_estado: this.sync.estadoCircuito(),
        cooldown_activo_count: todos.filter((v) => enLimpiezaActiva(v)).length,
        total_vehiculos: todos.length,
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      this.logger.error(`Healthcheck falló: ${(e as Error).message}`);
      throw new ProblemaV3Exception(503, 'SERVICE_UNAVAILABLE', 'Nodo no disponible', 'No hay conexión con la base de datos.');
    }
  }
}
