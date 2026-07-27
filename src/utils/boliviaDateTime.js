const BOLIVIA_TIME_ZONE = 'America/La_Paz';
const BOLIVIA_UTC_OFFSET = '-04:00';

const partsFor = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOLIVIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
};

const boliviaDate = (value = new Date()) => {
  const parts = partsFor(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : '';
};

const boliviaTime = (value = new Date(), includeSeconds = true) => {
  const parts = partsFor(value);
  if (!parts) return '';
  return `${parts.hour}:${parts.minute}${includeSeconds ? `:${parts.second}` : ''}`;
};

const boliviaDateTime = (value = new Date()) => ({
  fecha: boliviaDate(value),
  hora: boliviaTime(value),
  zonaHoraria: BOLIVIA_TIME_ZONE
});

module.exports = {
  BOLIVIA_TIME_ZONE,
  BOLIVIA_UTC_OFFSET,
  boliviaDate,
  boliviaTime,
  boliviaDateTime
};
