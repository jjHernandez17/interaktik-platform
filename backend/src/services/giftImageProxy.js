// tiktokinteractik/backend/src/services/giftImageProxy.js
//
// Las imagenes de los regalos viven en el CDN de TikTok, que no permite usarlas en un <canvas> desde otra pagina (el navegador marca el
// canvas como "contaminado" y no deja exportar el PNG). La pagina las pide aqui, por nuestro propio servidor, para poder armar la imagen
// descargable de las reglas de regalos. Solo se aceptan https hacia los dominios de imagenes de TikTok/ByteDance (nada de direcciones
// internas) y solo se devuelven imagenes de tamano razonable.

'use strict';

const ALLOWED_HOST_SUFFIXES = ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'ibyteimg.com', 'byteimg.com', 'ibytedtos.com'];
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;

function isAllowedImageUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch (error) {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

// Devuelve { buffer, contentType }; lanza un error con .status si no se puede
async function fetchImage(value, fetchImpl = fetch) {
  if (!isAllowedImageUrl(value)) {
    const error = new Error('Imagen no permitida.');
    error.status = 400;
    throw error;
  }
  const response = await fetchImpl(String(value), { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'image/*' } });
  if (!response.ok) {
    const error = new Error('No se pudo descargar la imagen del regalo.');
    error.status = 502;
    throw error;
  }
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!/^image\/(png|jpe?g|webp|gif|avif)$/.test(contentType)) {
    const error = new Error('El archivo no es una imagen.');
    error.status = 502;
    throw error;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    const error = new Error('La imagen del regalo es demasiado grande.');
    error.status = 502;
    throw error;
  }
  return { buffer, contentType };
}

module.exports = { isAllowedImageUrl, fetchImage, ALLOWED_HOST_SUFFIXES };
