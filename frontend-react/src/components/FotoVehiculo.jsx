import { useState } from 'react';
import { rutaFotoVehiculo } from '../utils/fotoVehiculo.js';

export default function FotoVehiculo({ marca, modelo }) {
  const [fallo, setFallo] = useState(false);
  if (!marca || !modelo || fallo) {
    return (
      <span className="miniatura-auto miniatura-auto--vacia" aria-hidden="true">
        Sin foto
      </span>
    );
  }
  return (
    <img
      className="miniatura-auto"
      src={rutaFotoVehiculo(marca, modelo)}
      alt={`${marca} ${modelo}`}
      loading="lazy"
      onError={() => setFallo(true)}
    />
  );
}
