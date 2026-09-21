import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sucursal } from '../sucursales/sucursal.entity.js';
import { Vehiculo } from '../vehiculos/vehiculo.entity.js';

type Datos = Omit<Vehiculo, 'id' | 'sucursal' | 'sucursalId'>;

const SUCURSALES = [
  { nombre: 'Aeropuerto Mariscal Sucre', ciudad: 'Quito', direccion: 'Aeropuerto Internacional Mariscal Sucre, Tababela', esAeropuerto: true },
  { nombre: 'Quito La Carolina', ciudad: 'Quito', direccion: 'Av. República del Salvador y Naciones Unidas', esAeropuerto: false },
  { nombre: 'Aeropuerto José Joaquín de Olmedo', ciudad: 'Guayaquil', direccion: 'Av. de las Américas, Guayaquil', esAeropuerto: true },
  { nombre: 'Guayaquil Centro', ciudad: 'Guayaquil', direccion: 'Av. 9 de Octubre y Malecón Simón Bolívar', esAeropuerto: false },
  { nombre: 'Cuenca Centro', ciudad: 'Cuenca', direccion: 'Av. Remigio Crespo y Av. Solano, Cuenca', esAeropuerto: false },
  { nombre: 'Aeropuerto Eloy Alfaro', ciudad: 'Manta', direccion: 'Aeropuerto Eloy Alfaro, Manta', esAeropuerto: true },
];

function v(
  marca: string,
  modelo: string,
  categoria: string,
  transmision: string,
  pasajeros: number,
  maletas: number,
  puertas: number,
  combustible: string,
  precioPorDia: number,
  anio = 2024,
): Datos {
  return { marca, modelo, anio, categoria, transmision, pasajeros, maletas, puertas, combustible, aireAcondicionado: true, precioPorDia };
}

// Un arreglo por sucursal, en el mismo orden que SUCURSALES.
const FLOTA: Datos[][] = [
  [
    v('Chevrolet', 'Spark GT', 'ECONOMICO', 'MANUAL', 4, 1, 5, 'GASOLINA', 24),
    v('Kia', 'Rio', 'COMPACTO', 'AUTOMATICA', 5, 2, 4, 'GASOLINA', 32),
    v('Hyundai', 'Tucson', 'SUV', 'AUTOMATICA', 5, 3, 5, 'GASOLINA', 68),
    v('Toyota', 'Hilux', 'CAMIONETA', 'MANUAL', 5, 3, 4, 'DIESEL', 85, 2023),
    v('Toyota', 'Land Cruiser Prado', 'SUV', 'AUTOMATICA', 7, 4, 5, 'DIESEL', 135, 2023),
    v('Honda', 'Civic', 'INTERMEDIO', 'AUTOMATICA', 5, 3, 4, 'GASOLINA', 52),
    v('Volkswagen', 'Gol', 'ECONOMICO', 'MANUAL', 5, 2, 5, 'GASOLINA', 25, 2023),
  ],
  [
    v('Renault', 'Kwid', 'ECONOMICO', 'MANUAL', 4, 1, 5, 'GASOLINA', 22),
    v('Chevrolet', 'Onix', 'COMPACTO', 'MANUAL', 5, 2, 4, 'GASOLINA', 30),
    v('Kia', 'Sportage', 'SUV', 'AUTOMATICA', 5, 3, 5, 'HIBRIDO', 74),
    v('Hyundai', 'H1', 'VAN', 'MANUAL', 9, 5, 5, 'DIESEL', 95, 2023),
    v('BMW', 'Serie 3', 'LUJO', 'AUTOMATICA', 5, 3, 4, 'GASOLINA', 150),
    v('Tesla', 'Model 3', 'LUJO', 'AUTOMATICA', 5, 3, 4, 'ELECTRICO', 125),
    v('Kia', 'Carnival', 'VAN', 'AUTOMATICA', 8, 5, 5, 'DIESEL', 118),
    v('Jeep', 'Compass', 'SUV', 'AUTOMATICA', 5, 3, 5, 'GASOLINA', 82),
  ],
  [
    v('Kia', 'Picanto', 'ECONOMICO', 'AUTOMATICA', 4, 1, 5, 'GASOLINA', 26),
    v('Toyota', 'Corolla', 'INTERMEDIO', 'AUTOMATICA', 5, 3, 4, 'GASOLINA', 45),
    v('Chevrolet', 'Captiva', 'SUV', 'AUTOMATICA', 7, 3, 5, 'GASOLINA', 70),
    v('Mercedes-Benz', 'Clase C', 'LUJO', 'AUTOMATICA', 5, 3, 4, 'GASOLINA', 140),
    v('Toyota', 'RAV4', 'SUV', 'AUTOMATICA', 5, 4, 5, 'HIBRIDO', 88),
    v('Volkswagen', 'Amarok', 'CAMIONETA', 'AUTOMATICA', 5, 4, 4, 'DIESEL', 110, 2023),
    v('Hyundai', 'Accent', 'COMPACTO', 'MANUAL', 5, 2, 4, 'GASOLINA', 29),
  ],
  [
    v('Chevrolet', 'Sail', 'ECONOMICO', 'MANUAL', 5, 2, 4, 'GASOLINA', 23, 2023),
    v('Nissan', 'Kicks', 'SUV', 'AUTOMATICA', 5, 2, 5, 'GASOLINA', 58),
    v('Toyota', 'Fortuner', 'SUV', 'AUTOMATICA', 7, 3, 5, 'DIESEL', 98, 2023),
    v('Chevrolet', 'Tracker', 'SUV', 'AUTOMATICA', 5, 3, 5, 'GASOLINA', 56),
    v('Kia', 'Cerato', 'INTERMEDIO', 'AUTOMATICA', 5, 3, 4, 'GASOLINA', 44),
    v('Mitsubishi', 'L200', 'CAMIONETA', 'MANUAL', 5, 3, 4, 'DIESEL', 86, 2023),
    v('Toyota', 'Yaris', 'COMPACTO', 'AUTOMATICA', 5, 2, 4, 'GASOLINA', 34),
  ],
  [
    v('Suzuki', 'Swift', 'COMPACTO', 'MANUAL', 5, 2, 5, 'GASOLINA', 28),
    v('Mazda', 'CX-5', 'SUV', 'AUTOMATICA', 5, 3, 5, 'GASOLINA', 72),
    v('Hyundai', 'Staria', 'VAN', 'AUTOMATICA', 9, 5, 5, 'DIESEL', 120),
    v('Hyundai', 'Santa Fe', 'SUV', 'AUTOMATICA', 7, 4, 5, 'DIESEL', 105),
    v('Volkswagen', 'T-Cross', 'SUV', 'AUTOMATICA', 5, 3, 5, 'GASOLINA', 62),
    v('Mazda', '3', 'INTERMEDIO', 'AUTOMATICA', 5, 3, 4, 'GASOLINA', 48),
    v('Nissan', 'Frontier', 'CAMIONETA', 'MANUAL', 5, 3, 4, 'DIESEL', 84, 2023),
  ],
  [
    v('Kia', 'Soluto', 'ECONOMICO', 'MANUAL', 5, 2, 4, 'GASOLINA', 25),
    v('Toyota', 'Corolla Cross', 'SUV', 'AUTOMATICA', 5, 3, 5, 'HIBRIDO', 76),
    v('Ford', 'Ranger', 'CAMIONETA', 'MANUAL', 5, 3, 4, 'DIESEL', 88, 2023),
    v('Honda', 'HR-V', 'SUV', 'AUTOMATICA', 5, 3, 5, 'GASOLINA', 66),
    v('Hyundai', 'Creta', 'SUV', 'AUTOMATICA', 5, 3, 5, 'GASOLINA', 60),
    v('Kia', 'Seltos', 'SUV', 'AUTOMATICA', 5, 3, 5, 'GASOLINA', 64),
  ],
];

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Sucursal) private readonly sucursales: Repository<Sucursal>,
    @InjectRepository(Vehiculo) private readonly vehiculos: Repository<Vehiculo>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const porNombre = new Map((await this.sucursales.find()).map((s) => [s.nombre, s]));
    for (const datos of SUCURSALES) {
      if (!porNombre.has(datos.nombre)) {
        porNombre.set(datos.nombre, await this.sucursales.save(this.sucursales.create(datos)));
      }
    }

    const existentes = new Set((await this.vehiculos.find({ loadEagerRelations: false })).map((x) => `${x.marca}|${x.modelo}`));
    const nuevos = SUCURSALES.flatMap((sucursal, i) =>
      FLOTA[i]
        .filter((datos) => !existentes.has(`${datos.marca}|${datos.modelo}`))
        .map((datos) => this.vehiculos.create({ ...datos, sucursalId: porNombre.get(sucursal.nombre)!.id })),
    );
    if (nuevos.length > 0) {
      await this.vehiculos.save(nuevos);
      this.logger.log(`Flota base: se agregaron ${nuevos.length} vehículos`);
    }
  }
}
