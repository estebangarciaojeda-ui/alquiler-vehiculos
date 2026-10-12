// Mismo esquema de nombres que usa el sitio público (public/app.js) para
// resolver la foto de cada modelo en public/img/autos/<marca-modelo>.jpg.
// Esas imágenes las sirve el backend NestJS en la raíz del dominio, no Vite,
// así que la ruta es absoluta y no lleva el prefijo /app/ del router.
export function claveModelo(marca, modelo) {
  return `${marca} ${modelo}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function rutaFotoVehiculo(marca, modelo) {
  return `/img/autos/${claveModelo(marca, modelo)}.jpg`;
}
