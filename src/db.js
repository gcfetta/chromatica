const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.PELU_DATA || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'chromatica.db');

// SQLite integrado en Node (no requiere compilar nada). Pequeño adaptador para
// mantener una API simple: prepare / exec / pragma / transaction.
const raw = new DatabaseSync(DB_FILE);
const db = {
  exec: (sql) => raw.exec(sql),
  prepare: (sql) => raw.prepare(sql),
  pragma(texto, { simple } = {}) {
    if (texto.includes('=')) return void raw.exec(`PRAGMA ${texto}`);
    const filas = raw.prepare(`PRAGMA ${texto}`).all();
    return simple ? (filas[0] ? Object.values(filas[0])[0] : undefined) : filas;
  },
  transaction: (fn) => (...args) => {
    raw.exec('BEGIN');
    try { const r = fn(...args); raw.exec('COMMIT'); return r; }
    catch (e) { raw.exec('ROLLBACK'); throw e; }
  },
};
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = FULL'); // prioriza no perder datos

// ---- migraciones (PRAGMA user_version) ----
const MIG_DIR = path.join(__dirname, '..', 'db', 'migrations');
const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
const actual = db.pragma('user_version', { simple: true });
const pendientes = files.filter((f) => parseInt(f, 10) > actual);

if (pendientes.length && actual > 0) {
  // copia de seguridad automática antes de migrar una base con datos
  const dest = path.join(DATA_DIR, 'backups', `pre-migracion-v${actual}-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
}
for (const f of pendientes) {
  const n = parseInt(f, 10);
  db.transaction(() => {
    db.exec(fs.readFileSync(path.join(MIG_DIR, f), 'utf8'));
    db.pragma(`user_version = ${n}`);
  })();
  console.log(`Migración aplicada: ${f}`);
}

const check = db.pragma('integrity_check', { simple: true });
if (check !== 'ok') console.error('⚠ integrity_check falló:', check);

function audit(entidad, entidad_id, accion, detalle) {
  db.prepare('INSERT INTO auditoria(entidad, entidad_id, accion, detalle) VALUES (?,?,?,?)')
    .run(entidad, entidad_id ?? null, accion, detalle ? JSON.stringify(detalle) : null);
}

module.exports = { db, DB_FILE, DATA_DIR, audit };