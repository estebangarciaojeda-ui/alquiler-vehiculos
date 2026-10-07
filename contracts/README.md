# Contratos de API

Esta carpeta contiene las especificaciones independientes de la implementación.
Su objetivo es que consumidores, frontend y backend puedan acordar la interfaz
HTTP antes de modificar el código de NestJS.

## Contrato disponible

- [`autos-openapi.yaml`](./autos-openapi.yaml): contrato OpenAPI 3.0.3 de la API
  B2B/GDS implementada por `src/gds-autos/`.
- [`cuentas-openapi.yaml`](./cuentas-openapi.yaml): registro, inicio y cierre de
  sesión de clientes, implementados por `src/cuentas/`.

## Relación con el código

| Contrato | Implementación |
| --- | --- |
| Rutas y métodos | `src/gds-autos/gds-autos.controller.ts` |
| Esquemas de entrada y salida | `src/gds-autos/dto/` |
| Errores HTTP | `src/common/dto/problem-details.dto.ts` |
| Documentación interactiva | `/swagger` y `/swagger-json` |

El archivo YAML es documentación estática y no se carga durante el arranque de
la aplicación. Por tanto, añadir o consultar esta carpeta no cambia el
comportamiento del backend ni de los frontends.

## Flujo API First recomendado

1. Proponer primero el cambio en `autos-openapi.yaml`.
2. Revisar si es compatible con los consumidores existentes.
3. Actualizar DTO, controlador y servicio.
4. Comprobar el contrato en Swagger y ejecutar las pruebas.
