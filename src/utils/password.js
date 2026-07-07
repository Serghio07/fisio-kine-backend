const validarPasswordSegura = (password) => {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'La contraseña debe tener entre 8 y 128 caracteres.';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe incluir mayúscula, minúscula y número.';
  }
  return null;
};

module.exports = { validarPasswordSegura };
