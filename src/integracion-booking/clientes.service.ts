import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { Cuenta } from '../cuentas/cuenta.entity.js';
import { hashContrasena } from '../cuentas/password.util.js';
import { idCliente, normalizarCliente, type SolicitudCliente } from './booking.util.js';
import { ProblemaV3Exception } from './problema-v3.js';
import { RegistroService } from './registro.service.js';

/**
 * Clientes del contrato v3.1 (/api/v3/clientes). Reutilizan la tabla `cuentas`: un conductor de Booking es una cuenta
 * de cliente más (sin duplicarse por correo ni por identificación). Se crean con una contraseña aleatoria, así que
 * no pueden iniciar sesión hasta que un administrador les asigne una desde el panel.
 */
@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cuenta) private readonly cuentas: Repository<Cuenta>,
    private readonly registro: RegistroService,
  ) {}

  private vista(c: Cuenta) {
    return { client_id: idCliente(c.id), nombre: c.nombre, email: c.email, identificacion: c.identificacion };
  }

  /** La cédula identifica al cliente antes que el correo: así una misma persona no se duplica aunque reserve con otro correo. */
  private existente(email: string | undefined, identificacion: string | undefined): Promise<Cuenta | null> {
    return (async () => {
      const ident = identificacion?.trim();
      if (ident) {
        const porCedula = await this.cuentas.findOne({ where: { identificacion: ident }, order: { id: 'ASC' } });
        if (porCedula) return porCedula;
      }
      return email ? this.cuentas.findOneBy({ email: email.trim().toLowerCase() }) : null;
    })();
  }

  /**
   * Borra una cuenta duplicada que la propia integración creó antes de conocer la cédula (origen BOOKING, rol cliente, sin cédula
   * distinta). Nunca toca cuentas creadas desde la web ni administradores. El llamador comprueba que ya no tenga reservas.
   */
  async eliminarDuplicadoDeIntegracion(cuentaId: number, cedula: string): Promise<boolean> {
    const c = await this.cuentas.findOneBy({ id: cuentaId });
    if (!c || c.origen !== 'BOOKING' || c.rol !== 'cliente' || (c.identificacion && c.identificacion !== cedula)) return false;
    await this.cuentas.delete(cuentaId);
    this.registro.registrar('info', 'cliente.duplicado-unificado', { eliminado: idCliente(cuentaId), cedula });
    return true;
  }

  async buscar(email?: string, identificacion?: string) {
    if (!email?.trim() && !identificacion?.trim()) {
      throw new ProblemaV3Exception(422, 'INVALID_PAYLOAD', 'Petición inválida', 'Indique email o identificacion.', [
        { name: 'email', reason: 'Obligatorio si no envía identificacion.' },
      ]);
    }
    const cuenta = await this.existente(email, identificacion);
    this.registro.registrar('info', 'cliente.consultado', { email: email?.trim().toLowerCase(), identificacion: identificacion?.trim(), encontrado: !!cuenta });
    if (!cuenta) throw new ProblemaV3Exception(404, 'NOT_FOUND', 'Cliente no encontrado', 'No existe un cliente con esos datos.');
    return this.vista(cuenta);
  }

  /** Devuelve la cuenta existente (completando los datos que faltaban) o crea una nueva. */
  private async obtenerOCrear(datos: SolicitudCliente): Promise<{ cuenta: Cuenta; creada: boolean }> {
    const previa = await this.existente(datos.email, datos.identificacion);
    if (previa) {
      const faltantes: Partial<Cuenta> = {};
      if (!previa.identificacion && datos.identificacion) faltantes.identificacion = datos.identificacion;
      if (!previa.telefono && datos.telefono) faltantes.telefono = datos.telefono;
      if (!previa.licencia && datos.licencia) faltantes.licencia = datos.licencia;
      if (Object.keys(faltantes).length > 0) await this.cuentas.update(previa.id, faltantes);
      return { cuenta: { ...previa, ...faltantes }, creada: false };
    }

    const nueva = this.cuentas.create({
      nombre: datos.nombre,
      email: datos.email,
      passwordHash: await hashContrasena(randomBytes(24).toString('hex')),
      rol: 'cliente',
      identificacion: datos.identificacion ?? null,
      telefono: datos.telefono ?? null,
      licencia: datos.licencia ?? null,
      origen: 'BOOKING',
    });
    try {
      const guardada = await this.cuentas.save(nueva);
      this.registro.registrar('info', 'cliente.creado', { client_id: idCliente(guardada.id), origen: 'BOOKING' });
      return { cuenta: guardada, creada: true };
    } catch (error) {
      // UNIQUE de correo: otra petición lo creó a la vez; se devuelve esa cuenta.
      if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === '23505') {
        const ganadora = await this.cuentas.findOneBy({ email: datos.email });
        if (ganadora) return { cuenta: ganadora, creada: false };
      }
      throw error;
    }
  }

  async crear(cuerpo: unknown): Promise<{ status: number; body: unknown }> {
    const norm = normalizarCliente(cuerpo);
    if (!norm.ok) {
      throw new ProblemaV3Exception(422, norm.codigo, 'Petición inválida', norm.errores.map((e) => `${e.name}: ${e.reason}`).join(' '), norm.errores);
    }
    const { cuenta, creada } = await this.obtenerOCrear(norm.valor);
    return { status: creada ? 201 : 200, body: { ...this.vista(cuenta), ya_existia: !creada } };
  }

  /** Garantiza que el conductor de una orden de Booking exista como cliente y devuelve su client_id. */
  async asegurar(datos: { nombre: string; email: string; identificacion?: string; telefono?: string; licencia?: string }): Promise<string> {
    return (await this.asegurarCuenta(datos))?.clientId ?? '';
  }

  /** Igual que `asegurar`, pero también devuelve el id interno de la cuenta para ligarla a la reserva. */
  async asegurarCuenta(datos: { nombre: string; email: string; identificacion?: string; telefono?: string; licencia?: string }) {
    const norm = normalizarCliente(datos);
    if (!norm.ok) return null;
    const { cuenta } = await this.obtenerOCrear(norm.valor);
    return { clientId: idCliente(cuenta.id), cuentaId: cuenta.id };
  }
}
