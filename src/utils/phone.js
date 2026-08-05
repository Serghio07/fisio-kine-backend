const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

const normalizePhoneNumber = (value) => {
  if (value === null || value === undefined) return '';
  let digits = String(value).replace(/\D/g, '');
  if (digits.startsWith('00591') && digits.length === 13) digits = digits.slice(2);
  if (digits.length === 8) digits = `591${digits}`;
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) return '';
  return digits;
};

const maskPhoneNumber = (value) => {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return '';
  if (normalized.length <= 6) return '*'.repeat(normalized.length);
  return `${normalized.slice(0, 3)}${'*'.repeat(normalized.length - 6)}${normalized.slice(-3)}`;
};

module.exports = { normalizePhoneNumber, maskPhoneNumber };
