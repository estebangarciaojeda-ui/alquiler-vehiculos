export const TARJETA_APROBADA = '4111111111111111';
export const TARJETA_RECHAZADA = '4000000000000002';

export function luhnValido(numero: string): boolean {
  let suma = 0;
  let doble = false;
  for (let i = numero.length - 1; i >= 0; i--) {
    let digito = Number(numero[i]);
    if (doble) {
      digito *= 2;
      if (digito > 9) digito -= 9;
    }
    suma += digito;
    doble = !doble;
  }
  return suma % 10 === 0;
}

export function vencimientoVigente(vencimiento: string, ahora: Date = new Date()): boolean {
  const coincide = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(vencimiento);
  if (!coincide) return false;
  const mes = Number(coincide[1]);
  const anio = 2000 + Number(coincide[2]);
  const finDeVigencia = new Date(anio, mes, 1);
  return ahora < finDeVigencia;
}
