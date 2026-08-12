const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Usuario } = require('../models');
const emailService = require('./email.service');

const TOKEN_DURATION_MS = 60 * 60 * 1000;
const hashToken = (token) => crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');

const requestPasswordReset = async (email, options = {}) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return;

  const usuario = await Usuario.findOne({ where: { email: { [Op.iLike]: normalizedEmail } } });
  if (!usuario) return;

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  await usuario.update({
    reset_password_token_hash: tokenHash,
    reset_password_expires_at: new Date(Date.now() + TOKEN_DURATION_MS)
  });

  try {
    const sendEmail = options.sendEmail || emailService.sendPasswordResetEmail;
    await sendEmail(usuario.email, token);
  } catch (error) {
    await Usuario.update(
      { reset_password_token_hash: null, reset_password_expires_at: null },
      { where: { id: usuario.id, reset_password_token_hash: tokenHash } }
    );
    throw error;
  }
};

const resetPassword = async (token, newPassword) => {
  const tokenHash = hashToken(token);

  return sequelize.transaction(async (transaction) => {
    const usuario = await Usuario.findOne({
      where: {
        reset_password_token_hash: tokenHash,
        reset_password_expires_at: { [Op.gt]: new Date() }
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!usuario) return false;

    usuario.password = newPassword;
    usuario.reset_password_token_hash = null;
    usuario.reset_password_expires_at = null;
    usuario.intentos_fallidos = 0;
    usuario.bloqueado_hasta = null;
    await usuario.save({ transaction });
    return true;
  });
};

module.exports = { TOKEN_DURATION_MS, hashToken, requestPasswordReset, resetPassword };
