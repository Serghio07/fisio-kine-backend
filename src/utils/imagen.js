const MAX_IMAGE_LENGTH = 1_500_000;
const DATA_IMAGE_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i;

const validarImagen = (imagen) => {
  if (imagen === undefined || imagen === null || imagen === '') return null;
  if (typeof imagen !== 'string' || !DATA_IMAGE_PATTERN.test(imagen)) {
    return 'La foto debe ser una imagen JPG, PNG o WebP valida.';
  }
  if (imagen.length > MAX_IMAGE_LENGTH) {
    return 'La foto es demasiado grande. Selecciona una imagen de menor tamano.';
  }
  return null;
};

module.exports = { validarImagen };
