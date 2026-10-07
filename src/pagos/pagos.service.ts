import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PagoTarjetaDto } from './dto/pago-tarjeta.dto.js';
import { luhnValido, TARJETA_RECHAZADA, vencimientoVigente } from './pagos.util.js';

export interface ResultadoPago {
  referencia: string;
  tarjetaUltimos4: string;
}

@Injectable()
export class PagosService {
  simularCobro(pago: PagoTarjetaDto): ResultadoPago {
    const numero = pago.numero.replace(/[\s-]/g, '');
    if (numero.length < 13 || numero.length > 19 || !luhnValido(numero)) {
      throw new BadRequestException('Pago rechazado: número de tarjeta no válido');
    }
    if (!vencimientoVigente(pago.vencimiento)) {
      throw new BadRequestException('Pago rechazado: la tarjeta está vencida');
    }
    if (numero === TARJETA_RECHAZADA) {
      throw new BadRequestException('Pago rechazado por el banco (simulación)');
    }
    return {
      referencia: `SIM-${randomBytes(6).toString('hex').toUpperCase()}`,
      tarjetaUltimos4: numero.slice(-4),
    };
  }
}
