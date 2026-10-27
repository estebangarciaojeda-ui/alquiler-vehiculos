import { Injectable, Logger } from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Bitácora estructurada de la integración: una línea JSON por evento, en un archivo
 * físico (logs/integracion-autos.log) con correlation_id e idempotency_key (rúbrica RDA2).
 */
@Injectable()
export class RegistroService {
  private readonly logger = new Logger('Integracion');
  private readonly directorio = process.env.LOG_DIR ?? join(process.cwd(), 'logs');
  private readonly archivo = join(this.directorio, 'integracion-autos.log');
  private listo = false;

  registrar(nivel: 'info' | 'warn' | 'error', evento: string, datos: Record<string, unknown> = {}): void {
    const linea = JSON.stringify({ ts: new Date().toISOString(), nivel, evento, ...datos });
    if (nivel === 'error') this.logger.error(linea);
    else if (nivel === 'warn') this.logger.warn(linea);
    else this.logger.log(linea);
    if (process.env.NODE_ENV === 'test') return;
    void this.escribir(linea);
  }

  private async escribir(linea: string): Promise<void> {
    try {
      if (!this.listo) {
        await mkdir(this.directorio, { recursive: true });
        this.listo = true;
      }
      await appendFile(this.archivo, `${linea}\n`);
    } catch {
      // El sistema de archivos puede ser de solo lectura: el log por consola ya quedó registrado.
    }
  }
}
