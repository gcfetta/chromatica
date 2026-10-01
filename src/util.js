const { db } = require('./db');

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const cfg = (clave) => db.prepare('SELECT valor FROM config WHERE clave = ?').get(clave)?.valor;

module.exports = { ApiError, cfg };