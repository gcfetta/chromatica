const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.PELU_DATA || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'chromatica.db');

// SQLite integrado en Node (no requiere compilar nada). Pequeño adaptador para
// mantener una API simple: prepare / exec / pragma / transaction.
let raw = new DatabaseSync(DB_FILE);
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
  // Restauración: reemplaza la base completa por otra copia, reabre y migra si la copia es más vieja
  reemplazar(origen) {
    raw.close();
    for (const x of ['-wal', '-shm']) fs.rmSync(DB_FILE + x, { force: true });
    fs.copyFileSync(origen, DB_FILE);
    raw = new DatabaseSync(DB_FILE);
    configurar(); migrar();
  },
};

function configurar() {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL'); // prioriza no perder datos
}
configurar();

// ---- migraciones (PRAGMA user_version) ----
const MIG_DIR = path.join(__dirname, '..', 'db', 'migrations');
const archivos = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
const VERSION_MAX = Math.max(...archivos.map((f) => parseInt(f, 10)));

function existeTabla(nombre) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(nombre);
}

function migrar() {
  let actual = db.pragma('user_version', { simple: true });
  // Base creada con una versión anterior de las migraciones (dice v2 pero le faltan las tablas de la 002):
  // se vuelve a v1 y se reaplican las migraciones, salteando lo que ya exista.
  if (actual >= 2 && !existeTabla('pago_empleado')) { db.pragma('user_version = 1'); actual = 1; console.log('Base con esquema viejo: se reaplican las migraciones'); }
  const pendientes = archivos.filter((f) => parseInt(f, 10) > actual);
  if (pendientes.length && actual > 0) {
    // copia de seguridad automática antes de migrar una base con datos
    const dest = path.join(DATA_DIR, 'backups', `pre-migracion-v${actual}-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  }
  for (const f of pendientes) {
    const n = parseInt(f, 10);
    const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
    try {
      db.transaction(() => { db.exec(sql); db.pragma(`user_version = ${n}`); })();
    } catch (e) {
      if (!/duplicate column name/i.test(e.message)) throw e;
      // la base ya tenía alguna columna de esta migración: se aplican las sentencias una por una, salteando las repetidas
      db.transaction(() => {
        for (const st of sql.split(/;\s*(?:\r?\n|$)/).map((x) => x.trim()).filter(Boolean)) {
          try { db.exec(st); } catch (e2) { if (!/duplicate column name/i.test(e2.message)) throw e2; }
        }
        db.pragma(`user_version = ${n}`);
      })();
    }
    console.log(`Migración aplicada: ${f}`);
  }
}
migrar();

const check = db.pragma('integrity_check', { simple: true });
if (check !== 'ok') console.error('⚠ integrity_check falló:', check);

function audit(entidad, entidad_id, accion, detalle) {
  db.prepare('INSERT INTO auditoria(entidad, entidad_id, accion, detalle) VALUES (?,?,?,?)')
    .run(entidad, entidad_id ?? null, accion, detalle ? JSON.stringify(detalle) : null);
}

module.exports = { db, DB_FILE, DATA_DIR, VERSION_MAX, audit };