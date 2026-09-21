export const CATEGORIAS = ['ECONOMICO', 'COMPACTO', 'INTERMEDIO', 'SUV', 'CAMIONETA', 'VAN', 'LUJO'] as const;
export const TRANSMISIONES = ['MANUAL', 'AUTOMATICA'] as const;
export const COMBUSTIBLES = ['GASOLINA', 'DIESEL', 'HIBRIDO', 'ELECTRICO'] as const;
export const ESTADOS_RESERVA = ['CONFIRMADA', 'CANCELADA'] as const;
export const ORDENES = ['precio_asc', 'precio_desc'] as const;

export const numericTransformer = {
  to: (value: number) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};
