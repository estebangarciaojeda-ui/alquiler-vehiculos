import { CallHandler, CanActivate, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { tap, type Observable } from 'rxjs';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { asegurarCorrelacion, ProblemaV3Exception } from './problema-v3.js';
import { RegistroService } from './registro.service.js';

/**
 * - publico:       health, catálogo y búsqueda (sin datos de clientes): no piden clave.
 * - escritura:     (por defecto) crear/consultar/cancelar órdenes, check-ins y clientes: exigen admin o X-API-Key
 *                  (401 si falta o es inválida). Solo se relaja con B2B_REQUIRE_API_KEY=false.
 * - admin_o_clave: datos sensibles (listado de órdenes, eventos): siempre admin o X-API-Key.
 * - mantenimiento: RBAC del contrato (cabecera X-Role = MANTENIMIENTO | ADMIN) o sesión admin.
 */
export type ModoAcceso = 'escritura' | 'admin_o_clave' | 'mantenimiento' | 'publico';
const CLAVE_META = 'acceso-b2b';
export const Acceso = (modo: ModoAcceso) => SetMetadata(CLAVE_META, modo);

const igual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

@Injectable()
export class B2bAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly admin: AdminAuthGuard,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const modo = this.reflector.get<ModoAcceso>(CLAVE_META, contexto.getHandler()) ?? 'escritura';
    const req = contexto.switchToHttp().getRequest<Request>();

    const esAdmin = await Promise.resolve(this.admin.canActivate(contexto)).then(() => true, () => false);
    if (esAdmin) return true;

    if (modo === 'publico') return true;

    // Claves válidas: la propia (TIENDA_AUTOS_API_KEY) y la acordada con Booking (BOOKING_API_KEY).
    const claves = [process.env.TIENDA_AUTOS_API_KEY, process.env.BOOKING_API_KEY].filter((c): c is string => !!c?.trim()).map((c) => c.trim());
    const recibida = req.headers['x-api-key'];
    const claveOk = typeof recibida === 'string' && claves.some((c) => igual(recibida.trim(), c));
    // La clave se exige por defecto en toda operación que no sea pública. Solo se relaja con B2B_REQUIRE_API_KEY=false
    // o si no hay ninguna clave configurada (para no dejar el servicio inaccesible por una mala configuración).
    const exigirClave = claves.length > 0 && !/^(0|false)$/i.test(process.env.B2B_REQUIRE_API_KEY ?? '');

    if (modo === 'admin_o_clave') {
      if (claveOk) return true;
      throw new ProblemaV3Exception(401, 'UNAUTHORIZED', 'No autenticado', 'Se requiere sesión de administrador o la cabecera X-API-Key.');
    }

    if (modo === 'mantenimiento') {
      const rolCrudo = req.headers['x-role'];
      const rol = (Array.isArray(rolCrudo) ? rolCrudo[0] : rolCrudo)?.trim().toUpperCase();
      if (!rol) throw new ProblemaV3Exception(401, 'UNAUTHORIZED', 'No autenticado', 'Se requiere la cabecera X-Role (MANTENIMIENTO o ADMIN) o sesión de administrador.');
      if (rol !== 'MANTENIMIENTO' && rol !== 'ADMIN') {
        throw new ProblemaV3Exception(403, 'FORBIDDEN', 'Rol insuficiente', 'Este endpoint requiere el rol MANTENIMIENTO o ADMIN.');
      }
      if (exigirClave && !claveOk) throw new ProblemaV3Exception(401, 'UNAUTHORIZED', 'No autenticado', 'Falta o es inválida la cabecera X-API-Key.');
      return true;
    }

    if (!exigirClave || claveOk) return true;
    throw new ProblemaV3Exception(401, 'UNAUTHORIZED', 'No autenticado', 'Falta o es inválida la cabecera X-API-Key.');
  }
}

/** Asigna X-Correlation-Id y deja una línea de bitácora por petición atendida con éxito. */
@Injectable()
export class TrazaInterceptor implements NestInterceptor {
  constructor(private readonly registro: RegistroService) {}

  intercept(contexto: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = contexto.switchToHttp().getRequest<Request>();
    const res = contexto.switchToHttp().getResponse<Response>();
    const correlationId = asegurarCorrelacion(req, res);
    const inicio = Date.now();
    return next.handle().pipe(
      tap(() =>
        this.registro.registrar('info', 'http.ok', {
          correlation_id: correlationId,
          idempotency_key: req.headers['idempotency-key'],
          metodo: req.method,
          ruta: req.originalUrl,
          status: res.statusCode,
          ms: Date.now() - inicio,
        }),
      ),
    );
  }
}
