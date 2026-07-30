const clean = (value) => String(value || '').trim();
const bool = (value, fallback = false) => {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return fallback;
  return normalized === 'true';
};
const normalizedPhone = (value) => clean(value).replace(/\D/g, '');

const whatsappConfig = Object.freeze({
  provider: clean(process.env.WHATSAPP_PROVIDER || 'META').toUpperCase(),
  appointmentsEnabled: bool(process.env.WHATSAPP_APPOINTMENTS_ENABLED),
  webhookEnabled: bool(process.env.WHATSAPP_WEBHOOK_ENABLED),
  testMode: bool(process.env.WHATSAPP_TEST_MODE, true),
  testNumbers: Object.freeze(
    clean(process.env.WHATSAPP_TEST_NUMBERS)
      .split(',')
      .map(normalizedPhone)
      .filter(Boolean)
  ),
  phoneNumber: normalizedPhone(process.env.WHATSAPP_PHONE_NUMBER || '59162295637'),
  phoneNumberId: clean(process.env.WHATSAPP_PHONE_NUMBER_ID),
  businessAccountId: clean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
  accessToken: clean(process.env.WHATSAPP_ACCESS_TOKEN),
  verifyToken: clean(process.env.WHATSAPP_VERIFY_TOKEN),
  webhookSecret: clean(process.env.WHATSAPP_WEBHOOK_SECRET || process.env.WHATSAPP_APP_SECRET),
  apiVersion: clean(process.env.WHATSAPP_API_VERSION || 'v23.0')
});

const validateBaseConfig = () => {
  const errors = [];
  if (!/^\d{8,15}$/.test(whatsappConfig.phoneNumber)) errors.push('WHATSAPP_PHONE_NUMBER_INVALID');
  if (!/^v\d+\.\d+$/.test(whatsappConfig.apiVersion)) errors.push('WHATSAPP_API_VERSION_INVALID');
  if (whatsappConfig.testMode && whatsappConfig.webhookEnabled && !whatsappConfig.testNumbers.length) {
    errors.push('WHATSAPP_TEST_NUMBERS_REQUIRED');
  }
  return errors;
};

const validateWhatsappConfig = (purpose = 'send') => {
  if (!whatsappConfig.webhookEnabled) return { ready: false, reason: 'DISABLED' };
  const baseErrors = validateBaseConfig();
  if (baseErrors.length) return { ready: false, reason: 'INVALID_CONFIGURATION', errors: baseErrors };

  const required = purpose === 'verify'
    ? ['verifyToken']
    : purpose === 'signature'
      ? ['webhookSecret']
      : ['phoneNumberId', 'businessAccountId', 'accessToken'];
  const missing = required
    .filter((field) => !whatsappConfig[field]);
  return missing.length ? { ready: false, reason: 'MISSING_CONFIGURATION', missing } : { ready: true };
};

const isTestNumberAllowed = (phone) => (
  !whatsappConfig.testMode || whatsappConfig.testNumbers.includes(normalizedPhone(phone))
);

const validateRuntimeSafety = () => {
  if (!whatsappConfig.webhookEnabled) return { ready: true, disabled: true };
  const errors = validateBaseConfig();
  const databaseName = clean(process.env.DB_NAME);
  if (
    whatsappConfig.testMode
    && (databaseName === 'fisio_kine_db' || !/test/i.test(databaseName))
  ) {
    errors.push('WHATSAPP_TEST_DATABASE_REQUIRED');
  }
  if (whatsappConfig.testMode && whatsappConfig.appointmentsEnabled) {
    errors.push('WHATSAPP_APPOINTMENTS_MUST_BE_DISABLED_IN_TEST');
  }
  for (const purpose of ['verify', 'signature', 'send']) {
    const validation = validateWhatsappConfig(purpose);
    if (!validation.ready && validation.reason !== 'INVALID_CONFIGURATION') {
      for (const missing of validation.missing || []) errors.push(`MISSING_${missing.toUpperCase()}`);
    }
  }
  return errors.length
    ? { ready: false, errors: [...new Set(errors)] }
    : { ready: true, disabled: false };
};

const validateSimulatorSafety = () => {
  const errors = [];
  const databaseName = clean(process.env.DB_NAME);
  if (whatsappConfig.provider !== 'SIMULATOR') errors.push('WHATSAPP_PROVIDER_MUST_BE_SIMULATOR');
  if (!whatsappConfig.testMode) errors.push('WHATSAPP_TEST_MODE_REQUIRED');
  if (databaseName === 'fisio_kine_db' || !/test/i.test(databaseName)) {
    errors.push('WHATSAPP_TEST_DATABASE_REQUIRED');
  }
  if (whatsappConfig.appointmentsEnabled) errors.push('WHATSAPP_APPOINTMENTS_MUST_BE_DISABLED');
  return errors.length ? { ready: false, errors } : { ready: true };
};

const safeConfigSummary = () => ({
  configurationLoaded: validateRuntimeSafety().ready,
  webhookEnabled: whatsappConfig.webhookEnabled,
  testMode: whatsappConfig.testMode,
  authorizedNumbers: whatsappConfig.testNumbers.length,
  appointmentsEnabled: whatsappConfig.appointmentsEnabled
});

module.exports = {
  whatsappConfig,
  validateWhatsappConfig,
  validateBaseConfig,
  validateRuntimeSafety,
  validateSimulatorSafety,
  safeConfigSummary,
  isTestNumberAllowed,
  normalizedPhone
};
