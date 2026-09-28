// Orden fijo para que supplier_id sea estable entre peticiones (no depende del orden de la BD).
const MARCAS = [
  'Chevrolet', 'Kia', 'Hyundai', 'Toyota', 'Honda', 'Volkswagen',
  'Renault', 'BMW', 'Tesla', 'Jeep', 'Mercedes-Benz', 'Nissan',
  'Mitsubishi', 'Suzuki', 'Mazda', 'Ford',
] as const;

export function idDeMarca(marca: string): number {
  const indice = MARCAS.findIndex((m) => m.toLowerCase() === marca.toLowerCase());
  return indice === -1 ? 0 : indice + 1;
}

export function marcaDeId(id: number): string | undefined {
  return MARCAS[id - 1];
}

export function todosLosProveedores(): Array<{ supplier_id: number; name: string }> {
  return MARCAS.map((name, i) => ({ supplier_id: i + 1, name }));
}
