import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockSyncService } from './stock-sync.service.js';

// El servicio se deshabilita con NODE_ENV=test; en estas pruebas se habilita a propósito.
const entorno = { ...process.env };
let servicio: StockSyncService;
const registro = { registrar: vi.fn() };

beforeEach(() => {
  process.env.NODE_ENV = 'development';
  process.env.BOOKING_REST_STOCK_URL = 'https://booking.test/api/v3/inventory/stock';
  process.env.BOOKING_API_KEY = 'clave';
  servicio = new StockSyncService(registro as never);
  servicio.esperasMs = [0, 0];
});

afterEach(() => {
  servicio.onModuleDestroy();
  vi.unstubAllGlobals();
  process.env = { ...entorno };
  registro.registrar.mockClear();
});

const respuesta = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response;

describe('aviso de stock a Booking', () => {
  it('reintenta tras un tiempo agotado y termina entregando sin dejar pendientes', async () => {
    const fetchSimulado = vi.fn().mockRejectedValueOnce(new Error('The operation was aborted due to timeout')).mockResolvedValueOnce(respuesta(503)).mockResolvedValueOnce(respuesta(200));
    vi.stubGlobal('fetch', fetchSimulado);
    const r = await servicio.empujar(44, '2026-11-12', '09:00', true, 'vehiculo.creado');
    expect(r.ok).toBe(true);
    expect(fetchSimulado).toHaveBeenCalledTimes(3);
    expect(servicio.cantidadPendientes).toBe(0);
  });

  it('si Booking sigue caído deja el aviso pendiente y lo reenvía solo después', async () => {
    const fetchSimulado = vi.fn().mockRejectedValue(new Error('timeout'));
    vi.stubGlobal('fetch', fetchSimulado);
    const r = await servicio.empujar(44, '2026-11-12', '09:00', true, 'vehiculo.creado');
    expect(r.ok).toBe(false);
    expect(servicio.cantidadPendientes).toBe(1);

    fetchSimulado.mockReset().mockResolvedValue(respuesta(200));
    await servicio.reintentarPendientes();
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    expect(servicio.cantidadPendientes).toBe(0);
  });

  it('un rechazo definitivo (4xx) no se reintenta ni queda pendiente', async () => {
    const fetchSimulado = vi.fn().mockResolvedValue(respuesta(404));
    vi.stubGlobal('fetch', fetchSimulado);
    const r = await servicio.empujar(44, '2026-11-12', '09:00', true, 'vehiculo.creado');
    expect(r.ok).toBe(false);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    expect(servicio.cantidadPendientes).toBe(0);
  });

  it('un aviso más nuevo del mismo turno reemplaza al pendiente anterior', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await servicio.empujar(44, '2026-11-12', '09:00', true, 'vehiculo.creado');
    await servicio.empujar(44, '2026-11-12', '09:00', false, 'orden-confirmada');
    expect(servicio.cantidadPendientes).toBe(1);
  });
});
