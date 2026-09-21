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

const FLOTA: Datos[][] = [
  [
    v('Chevrolet', 'Spark GT', 'ECONOMICO', 'MANUAL', 4, 1, 5, 'GASOLINA', 24),
    v('Kia', 'Rio', 'COMPACTO', 'AUTOMATICA', 5, 2, 4, 'GASOLINA', 32),
    v('Hyundai', 'Tucson', 'SUV', 'AUTOMATICA', 5, 3, 5, 'GASOLINA', 68),
    v('Toyota', 'Hilux', 'CAMIONETA', 'MANUAL', 5, 3, 4, 'DIESEL', 85, 2023),
  ],
  [
    v('Renault', 'Kwid', 'ECONOMICO', 'MANUAL', 4, 1, 5, 'GASOLINA', 22),
    v('Chevrolet', 'Onix', 'COMPACTO', 'MANUAL', 5, 2, 4, 'GASOLINA', 30),
    v('Kia', 'Sportage', 'SUV', 'AUTOMATICA', 5, 3, 5, 'HIBRIDO', 74),
    v('Hyundai', 'H1', 'VAN', 'MANUAL', 9, 5, 5, 'DIESEL', 95, 2023),
    v('BMW', 'Serie 3', 'LUJO', 'AUTOMATICA', 5, 3, 4, 'GASOLINA', 150),
  ],
  [
    v('Kia', 'Picanto', 'ECONOMICO', 'AUTOMATICA', 4, 1, 5, 'GASOLINA', 26),
    v('Toyota', 'Corolla', 'INTERMEDIO', 'AUTOMATICA', 5, 3, 4, 'GASOLINA', 45),
    v('Chevrolet', 'Captiva', 'SUV', 'AUTOMATICA', 7, 3, 5, 'GASOLINA', 70),
    v('Mercedes-Benz', 'Clase C', 'LUJO', 'AUTOMATICA', 5, 3, 4, 'GASOLINA', 140),
  ],
  [
    v('Chevrolet', 'Sail', 'ECONOMICO', 'MANUAL', 5, 2, 4, 'GASOLINA', 23, 2023),
    v('Nissan', 'Kicks', 'SUV', 'AUTOMATICA', 5, 2, 5, 'GASOLINA', 58),
    v('Toyota', 'Fortuner', 'SUV', 'AUTOMATICA', 7, 3, 5, 'DIESEL', 98, 2023),
  ],
  [
    v('Suzuki', 'Swift', 'COMPACTO', 'MANUAL', 5, 2, 5, 'GASOLINA', 28),
    v('Mazda', 'CX-5', 'SUV', 'AUTOMATICA', 5, 3, 5, 'GASOLINA', 72),
    v('Hyundai', 'Staria', 'VAN', 'AUTOMATICA', 9, 5, 5, 'DIESEL', 120),
  ],
  [
    v('Kia', 'Soluto', 'ECONOMICO', 'MANUAL', 5, 2, 4, 'GASOLINA', 25),
    v('Toyota', 'Corolla Cross', 'SUV', 'AUTOMATICA', 5, 3, 5, 'HIBRIDO', 76),
    v('Ford', 'Ranger', 'CAMIONETA', 'MANUAL', 5, 3, 4, 'DIESEL', 88, 2023),
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
    if ((await this.sucursales.count()) > 0) return;

    const creadas = await this.sucursales.save(SUCURSALES.map((s) => this.sucursales.create(s)));
    const vehiculos = creadas.flatMap((sucursal, i) =>
      FLOTA[i].map((datos) => this.vehiculos.create({ ...datos, sucursalId: sucursal.id })),
    );
    await this.vehiculos.save(vehiculos);
    this.logger.log(`Datos iniciales cargados: ${creadas.length} sucursales, ${vehiculos.length} vehículos`);
  }
}
