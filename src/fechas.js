const { ApiError } = require('./util');

// Acepta "AAAA-MM-DD", "AAAA-MM-DD HH:MM" o con "T". Devuelve "AAAA-MM-DD HH:MM:SS".
function normalizarFecha(f, finDeDia = false) {
  if (f == null) return null;
  const m = String(f).trim().replace('T', ' ').match(/^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2})(?::(\d{2}))?)?$/);
  if (!m) throw new ApiError(400, 'Fecha inválida (usá AAAA-MM-DD HH:MM)');
  if (!m[2]) return `${m[1]} ${finDeDia ? '23:59:59' : '00:00:00'}`;
  return `${m[1]} ${m[2]}:${m[3] || (finDeDia ? '59' : '00')}`;
}

module.exports = { normalizarFecha };