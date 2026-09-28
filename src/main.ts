import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';

function igual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Protege /swagger y /swagger-json con Basic Auth: la documentación no debe ser pública.
function protegerSwagger(usuario: string, contrasena: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cabecera = req.headers.authorization;
    if (cabecera?.startsWith('Basic ')) {
      const [u, p] = Buffer.from(cabecera.slice(6), 'base64').toString().split(':');
      if (u !== undefined && p !== undefined && igual(u, usuario) && igual(p, contrasena)) {
        return next();
      }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="AutoSpot Swagger"');
    res.status(401).send('Autenticación requerida');
  };
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerUser = process.env.SWAGGER_USER;
  const swaggerPassword = process.env.SWAGGER_PASSWORD;
  if (swaggerUser && swaggerPassword) {
    app.use(['/swagger', '/swagger-json'], protegerSwagger(swaggerUser, swaggerPassword));
  }

  app.useStaticAssets(join(process.cwd(), 'public'));

  const config = new DocumentBuilder()
    .setTitle('AutoSpot · API de alquiler de vehículos')
    .setDescription('Sucursales, flota y reservas. Persistencia en PostgreSQL con TypeORM. Incluye la API de distribución (GDS) de contracts/autos-openapi.yaml.')
    .setVersion('1.0')
    .addOAuth2(
      {
        type: 'oauth2',
        flows: {
          authorizationCode: {
            authorizationUrl: 'https://auth.booking-hub.com/oauth2/authorize',
            tokenUrl: 'https://auth.booking-hub.com/oauth2/token',
            scopes: {
              'autos:read': 'Leer información de autos, catálogos y reservas',
              'autos:book': 'Crear, mantener en hold y alterar reservas',
              'autos:cancel': 'Cancelar reservas',
              'autos:webhooks': 'Gestionar webhooks',
            },
          },
          clientCredentials: {
            tokenUrl: 'https://auth.booking-hub.com/oauth2/token',
            scopes: {
              'autos:read': '(B2B) Leer',
              'autos:book': '(B2B) Comprar',
              'autos:cancel': '(B2B) Cancelar',
              'autos:webhooks': '(B2B) Webhooks',
            },
          },
        },
      },
      'OAuth2Security',
    )
    .build();
  SwaggerModule.setup('swagger', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
