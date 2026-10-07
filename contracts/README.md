# Contratos OpenAPI (referencia)

Esta carpeta contiene los contratos OpenAPI de la plantilla del curso
(`semestre5grupal-ops/Plantilla-Integracion-Sistemas`), copiados tal cual
para tenerlos a mano como referencia. No son usados por el código en
tiempo de ejecución; AutoSpot implementa `autos-openapi.yaml` siguiendo
este archivo, pero no lo lee ni lo carga desde aquí.

- `autos-openapi.yaml` — el contrato que le corresponde a este equipo
  (dominio Autos), implementado en `src/gds-autos/`.
- `alojamientos-openapi.yaml`, `atracciones-openapi.yaml`,
  `vuelos-openapi.yaml` — contratos de los otros tres dominios del
  proyecto integrador, incluidos solo como referencia para una futura
  integración entre equipos.
