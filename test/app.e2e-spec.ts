import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('API de alquiler (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const creadas: number[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    for (const id of creadas) await request(http).delete(`/api/v1/reservas/${id}`);
    await app.close();
  });

  it('lista las sucursales cargadas por el seed', async () => {
    const res = await request(http).get('/api/v1/sucursales').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('filtra vehículos por categoría y responde 400 con filtros inválidos', async () => {
    const res = await request(http).get('/api/v1/vehiculos?categoria=SUV').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((x: { categoria: string }) => x.categoria === 'SUV')).toBe(true);
    await request(http).get('/api/v1/vehiculos?categoria=NAVE').expect(400);
    await request(http).get('/api/v1/vehiculos?desde=2030-01-01').expect(400);
  });

  it('lista las marcas y filtra vehículos por marca sin distinguir mayúsculas', async () => {
    const marcas = await request(http).get('/api/v1/vehiculos/marcas').expect(200);
    expect(marcas.body).toEqual(expect.arrayContaining(['Toyota', 'Kia', 'Tesla']));
    expect(new Set(marcas.body).size).toBe(marcas.body.length);

    const res = await request(http).get('/api/v1/vehiculos?marca=tOYOTA').expect(200);
    expect(res.body.length).toBeGreaterThan(3);
    expect(res.body.every((x: { marca: string }) => x.marca === 'Toyota')).toBe(true);
    const ninguno = await request(http).get('/api/v1/vehiculos?marca=Inexistente').expect(200);
    expect(ninguno.body).toEqual([]);
  });

  it('devuelve 404 para vehículos y reservas inexistentes', async () => {
    await request(http).get('/api/v1/vehiculos/999999').expect(404);
    await request(http).get('/api/v1/reservas/999999').expect(404);
  });

  it('crea una reserva, bloquea el solape con 409 y libera al cancelar', async () => {
    const lista = await request(http).get('/api/v1/vehiculos').expect(200);
    const vehiculo = lista.body[0];
    const base = {
      vehiculoId: vehiculo.id,
      fechaRecogida: '2030-05-10',
      fechaDevolucion: '2030-05-13',
      nombreCliente: 'Cliente de prueba',
      email: 'Prueba@Correo.com',
      telefono: '0991234567',
    };

    const creada = await request(http).post('/api/v1/reservas').send(base).expect(201);
    creadas.push(creada.body.id);
    expect(creada.headers.location).toBe(`/api/v1/reservas/${creada.body.id}`);
    expect(creada.body.dias).toBe(3);
    expect(creada.body.total).toBeCloseTo(3 * vehiculo.precioPorDia, 2);
    expect(creada.body.email).toBe('prueba@correo.com');
    expect(creada.body.codigo).toMatch(/^AS-[A-Z0-9]{6}$/);

    const disponibles = await request(http)
      .get(`/api/v1/vehiculos?sucursalId=${vehiculo.sucursalId}&desde=2030-05-11&hasta=2030-05-12`)
      .expect(200);
    expect(disponibles.body.some((x: { id: number }) => x.id === vehiculo.id)).toBe(false);

    await request(http)
      .post('/api/v1/reservas')
      .send({ ...base, fechaRecogida: '2030-05-12', fechaDevolucion: '2030-05-15' })
      .expect(409);

    await request(http).patch(`/api/v1/reservas/${creada.body.id}/cancelar`).expect(200);

    const otra = await request(http).post('/api/v1/reservas').send(base).expect(201);
    creadas.push(otra.body.id);
  });

  it('valida los datos de la reserva', async () => {
    await request(http)
      .post('/api/v1/reservas')
      .send({ vehiculoId: 1, fechaRecogida: '2030-05-10', fechaDevolucion: '2030-05-09', nombreCliente: 'X', email: 'no-es-correo', telefono: '0991234567' })
      .expect(400);
    await request(http)
      .post('/api/v1/reservas')
      .send({ vehiculoId: 1, fechaRecogida: '2020-01-01', fechaDevolucion: '2020-01-03', nombreCliente: 'X', email: 'x@x.com', telefono: '0991234567' })
      .expect(400);
  });
});
