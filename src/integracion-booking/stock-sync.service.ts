import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fechaYSlotLocal, idPublico, slotDeHora, slotId } from './booking.util.js';
import { RegistroService } from './registro.service.js';

// Booking (Azure) puede tardar en responder si estaba dormido: plazo amplio y reintentos con espera creciente.
const DEADLINE_MS = 15_000;
const ESPERAS_REINTENTO_MS = [2_000, 6_000];
const REINTENTO_PENDIENTES_MS = 60_000;
const MAX_INTENTOS_PENDIENTE = 30;
const UMBRAL_FALLOS = 5;
const PAUSA_BREAKER_MS = 60_000;

export interface ResultadoSync {
  ok: boolean;
  canal: 'grpc' | 'rest' | 'ninguno';
  codigo?: string;
  detalle?: string;
  /** Fallo de red, tiempo agotado o HTTP 408/429/5xx: vale la pena reintentar. Un rechazo definitivo (4xx, acuse con código) no. */
  reintentable?: boolean;
}

interface PushPendiente {
  vehiculoId: number;
  fecha: string;
  hora: string;
  disponible: boolean;
  motivo: string;
  intentos: number;
}

function rutaProto(): string {
  const candidatas = [
    fileURLToPath(new URL('../../src/proto/inventory.proto', import.meta.url)),
    join(process.cwd(), 'src/proto/inventory.proto'),
  ];
  return candidatas.find((c) => existsSync(c)) ?? candidatas[1];
}

/**
 * Cliente del contrato inventory.proto: cada cambio de disponibilidad de un auto se notifica a
 * Booking con PushStockUpdate (gRPC, puerto 50051). Si el canal gRPC no está disponible (p. ej. un
 * host que solo expone HTTP) se usa el respaldo REST (POST /api/v3/inventory/push-stock, la ruta publicada en el OpenAPI de Booking).
 * Nunca hace fallar la operación de negocio que lo dispara.
 */
@Injectable()
export class StockSyncService implements OnModuleDestroy {
  private readonly logger = new Logger('StockSync');
  private cliente: any;
  private ultimoTimestamp = 0;
  private fallosSeguidos = 0;
  private abiertoHasta = 0;

  /** Esperas entre reintentos inmediatos (ajustable en pruebas). */
  esperasMs: number[] = ESPERAS_REINTENTO_MS;
  /** Avisos que no pudieron entregarse: se reintentan cada minuto hasta que Booking los acepte. */
  private readonly pendientes = new Map<string, PushPendiente>();
  private temporizador?: ReturnType<typeof setInterval>;

  constructor(private readonly registro: RegistroService) {
    if (process.env.NODE_ENV !== 'test') {
      this.temporizador = setInterval(() => void this.reintentarPendientes(), REINTENTO_PENDIENTES_MS);
      this.temporizador.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  get cantidadPendientes(): number {
    return this.pendientes.size;
  }

  async reintentarPendientes(): Promise<void> {
    if (this.pendientes.size === 0 || this.estadoCircuito() === 'OPEN') return;
    for (const [clave, p] of [...this.pendientes]) {
      if (p.intentos >= MAX_INTENTOS_PENDIENTE) {
        this.pendientes.delete(clave);
        this.registro.registrar('error', 'stock.push.abandonado', { clave, motivo: p.motivo, intentos: p.intentos });
        continue;
      }
      await this.empujar(p.vehiculoId, p.fecha, p.hora, p.disponible, `${p.motivo}:reintento`);
    }
  }

  get habilitado(): boolean {
    return process.env.BOOKING_SYNC_ENABLED !== 'false' && process.env.NODE_ENV !== 'test';
  }
  get nodeId(): string {
    return process.env.NODE_ID ?? 'NODE_AUT_AUTOSPOT';
  }
  private get grpcHost(): string {
    return process.env.BOOKING_GRPC_HOST ?? 'rda1-backend-integracion-sistemas.onrender.com:50051';
  }
  private get restUrl(): string {
    return (process.env.BOOKING_REST_URL ?? 'https://rda1-backend-integracion-sistemas.onrender.com').replace(/\/+$/, '');
  }

  estadoCircuito(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    if (this.fallosSeguidos < UMBRAL_FALLOS) return 'CLOSED';
    return Date.now() < this.abiertoHasta ? 'OPEN' : 'HALF_OPEN';
  }

  /** Estrictamente creciente: Booking descarta timestamps menores al último procesado (regla monotónica). */
  private siguienteTimestamp(): number {
    this.ultimoTimestamp = Math.max(Date.now(), this.ultimoTimestamp + 1);
    return this.ultimoTimestamp;
  }

  private obtenerCliente(): any {
    if (!this.cliente) {
      const def = protoLoader.loadSync(rutaProto(), { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
      const paquete = (grpc.loadPackageDefinition(def) as any).inventory;
      const tls = this.grpcHost.endsWith(':443') || /^(1|true)$/i.test(process.env.BOOKING_GRPC_TLS ?? '');
      this.cliente = new paquete.InventoryStockService(this.grpcHost, tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure());
    }
    return this.cliente;
  }

  /** PushStockUpdate: available_units = 1 si el auto está disponible en ese turno, 0 si no. */
  async empujar(vehiculoId: number, fecha: string, hora: string, disponible: boolean, motivo: string): Promise<ResultadoSync> {
    if (!this.habilitado) return { ok: false, canal: 'ninguno', detalle: 'sincronización deshabilitada' };
    if (this.estadoCircuito() === 'OPEN') return { ok: false, canal: 'ninguno', detalle: 'circuit breaker abierto' };

    const slot = slotDeHora(hora);
    const mensaje = {
      service_id: this.nodeId,
      item_id: idPublico(vehiculoId),
      date: fecha,
      time_slot: slot,
      available_units: disponible ? 1 : 0,
      timestamp: String(this.siguienteTimestamp()),
      slot_id: slotId(fecha, slot),
    };

    // Si hay URL REST de stock (guía de socios en Azure) se usa ese canal; si no, gRPC con respaldo REST.
    const urlGuia = process.env.BOOKING_REST_STOCK_URL;
    const intentar = async (): Promise<ResultadoSync> => {
      let r = urlGuia ? await this.viaRestGuia(urlGuia, mensaje, motivo) : await this.viaGrpc(mensaje);
      if (!urlGuia && !r.ok && !r.codigo) r = await this.viaRest(mensaje, r.detalle);
      return r;
    };
    let resultado = await intentar();
    for (let i = 0; i < this.esperasMs.length && !resultado.ok && !resultado.codigo && resultado.reintentable !== false; i++) {
      await new Promise((r) => setTimeout(r, this.esperasMs[i]));
      resultado = await intentar();
    }

    // Si no se pudo entregar, queda pendiente y se reintenta solo; un aviso más nuevo del mismo turno reemplaza al anterior.
    const clavePendiente = `${mensaje.item_id}|${mensaje.slot_id}`;
    if (resultado.ok || resultado.codigo || resultado.reintentable === false) this.pendientes.delete(clavePendiente);
    else this.pendientes.set(clavePendiente, { vehiculoId, fecha, hora, disponible, motivo: motivo.replace(/:reintento$/, ''), intentos: (this.pendientes.get(clavePendiente)?.intentos ?? 0) + 1 });

    if (resultado.ok || resultado.codigo) this.fallosSeguidos = 0;
    else {
      this.fallosSeguidos++;
      if (this.fallosSeguidos >= UMBRAL_FALLOS) this.abiertoHasta = Date.now() + PAUSA_BREAKER_MS;
    }

    this.registro.registrar(resultado.ok ? 'info' : 'warn', 'stock.push', {
      motivo,
      item_id: mensaje.item_id,
      slot_id: mensaje.slot_id,
      available_units: mensaje.available_units,
      canal: resultado.canal,
      ok: resultado.ok,
      codigo: resultado.codigo,
      detalle: resultado.detalle,
      pendientes: this.pendientes.size,
    });
    return resultado;
  }

  /** Versión "dispara y olvida" para no retrasar la respuesta HTTP de la operación de negocio. */
  empujarEnSegundoPlano(vehiculoId: number, fecha: string, hora: string, disponible: boolean, motivo: string): void {
    this.empujar(vehiculoId, fecha, hora, disponible, motivo).catch((e) => this.logger.warn(`stock.push falló: ${(e as Error).message}`));
  }

  /** Turno actual en hora de Ecuador (para cambios de limpieza / mantenimiento / liberación). */
  empujarAhoraEnSegundoPlano(vehiculoId: number, disponible: boolean, motivo: string): void {
    const { fecha, slot } = fechaYSlotLocal(new Date());
    this.empujarEnSegundoPlano(vehiculoId, fecha, slot, disponible, motivo);
  }

  private viaGrpc(mensaje: Record<string, unknown>): Promise<ResultadoSync> {
    return new Promise((resolve) => {
      try {
        this.obtenerCliente().PushStockUpdate(mensaje, { deadline: Date.now() + DEADLINE_MS }, (err: Error | null, ack: any) => {
          if (err) return resolve({ ok: false, canal: 'grpc', detalle: err.message });
          if (ack?.success) return resolve({ ok: true, canal: 'grpc', codigo: ack.error_code || 'OK' });
          // Acuse con código estándar (STALE_TIMESTAMP_IGNORED, ITEM_NOT_FOUND, INVALID_SLOT): no se reintenta por REST.
          resolve({ ok: false, canal: 'grpc', codigo: ack?.error_code || 'REJECTED', detalle: ack?.message });
        });
      } catch (e) {
        resolve({ ok: false, canal: 'grpc', detalle: (e as Error).message });
      }
    });
  }

  /** POST {item_id, available_units, date, reason} con X-API-Key, tal como lo describe la guía de socios de Booking. */
  private async viaRestGuia(url: string, mensaje: Record<string, unknown>, motivo: string): Promise<ResultadoSync> {
    try {
      const clave = process.env.BOOKING_API_KEY;
      const razon = /cancel|liber/i.test(motivo) ? 'ORDER_CANCELLED' : /reserva|orden|order|creada/i.test(motivo) ? 'ORDER_CREATED' : 'STOCK_UPDATED';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(clave ? { 'X-API-Key': clave } : {}) },
        body: JSON.stringify({ item_id: mensaje.item_id, available_units: mensaje.available_units, date: mensaje.date, reason: razon }),
        signal: AbortSignal.timeout(DEADLINE_MS),
      });
      if (res.ok) return { ok: true, canal: 'rest', codigo: 'OK' };
      return { ok: false, canal: 'rest', detalle: `REST HTTP ${res.status}`, reintentable: res.status === 408 || res.status === 429 || res.status >= 500 };
    } catch (e) {
      return { ok: false, canal: 'rest', detalle: `REST: ${(e as Error).message}`, reintentable: true };
    }
  }

  private async viaRest(mensaje: Record<string, unknown>, errorGrpc?: string): Promise<ResultadoSync> {
    try {
      const ruta = process.env.BOOKING_REST_STOCK_PATH ?? '/api/v3/inventory/push-stock';
      const clave = process.env.BOOKING_API_KEY;
      const res = await fetch(`${this.restUrl}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(clave ? { 'X-Api-Key': clave } : {}) },
        body: JSON.stringify({ ...mensaje, timestamp: Number(mensaje.timestamp) }),
        signal: AbortSignal.timeout(DEADLINE_MS),
      });
      if (res.ok) return { ok: true, canal: 'rest', codigo: 'OK' };
      return { ok: false, canal: 'rest', detalle: `gRPC: ${errorGrpc ?? 's/d'} · REST HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, canal: 'rest', detalle: `gRPC: ${errorGrpc ?? 's/d'} · REST: ${(e as Error).message}` };
    }
  }
}
