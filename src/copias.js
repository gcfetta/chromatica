// Copias de seguridad: locales (automática diaria, manual, al cerrar caja), carpeta sincronizada y restauración.
// Historial completo: ninguna copia se borra automáticamente.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { db, DATA_DIR, VERSION_MAX, audit } = require('./db');
const { ApiError, cfg } = require('./util');

const router = express.Router();
const DIR = path.join(DATA_DIR, 'copias');
fs.mkdirSync(DIR, { recursive: true });

const RE = /^chromatica-(\d{8})-(\d{6})(?:_\d+)?-(auto|manual|cierre|pre-restauracion)\.db$/;
const pad = (n) => String(n).padStart(2, '0');
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };

function listar(dir = DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((nombre) => {
    const m = RE.exec(nombre); if (!m) return null;
    const st = fs.statSync(path.join(dir, nombre));
    return { nombre, motivo: m[3], fecha: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)} ${m[2].slice(0, 2)}:${m[2].slice(2, 4)}`, tam: st.size, t: st.mtimeMs };
  }).filter(Boolean).sort((a, b) => b.t - a.t || b.nombre.localeCompare(a.nombre));
}

const carpetaSync = () => cfg('carpeta_sync') || null;
const sincronizable = (c) => { try { fs.accessSync(c, fs.constants.W_OK); return fs.statSync(c).isDirectory(); } catch { return false; } };

function crear(motivo) {
  let nombre = `chromatica-${stamp()}-${motivo}.db`, n = 1;
  while (fs.existsSync(path.join(DIR, nombre))) nombre = `chromatica-${stamp()}_${n++}-${motivo}.db`;
  const dest = path.join(DIR, nombre);
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  let sync = null;
  const c = carpetaSync();
  if (c) { try { fs.copyFileSync(dest, path.join(c, nombre)); sync = true; } catch { sync = false; } }
  return { nombre, sync };
}

function auto() {
  try {
    const hoy = stamp().slice(0, 8);
    if (!listar().some((x) => x.motivo === 'auto' && x.fecha.replaceAll('-', '').startsWith(hoy))) crear('auto');
  } catch (e) { console.error('Copia automática falló:', e.message); }
}
function iniciarAuto() { auto(); setInterval(auto, 3600000).unref(); }

function validar(archivo) {
  let t;
  try { t = new DatabaseSync(archivo, { readOnly: true }); } catch { throw new ApiError(400, 'La copia no se puede abrir'); }
  try {
    const ok = t.prepare('PRAGMA integrity_check').get().integrity_check;
    const v = t.prepare('PRAGMA user_version').get().user_version;
    const tabla = t.prepare("SELECT 1 FROM sqlite_master WHERE name = 'turno'").get();
    if (ok !== 'ok' || !tabla) throw new ApiError(400, 'La copia está dañada o no es de Chromatica');
    if (v > VERSION_MAX) throw new ApiError(400, 'La copia es de una versión más nueva del sistema');
  } finally { t.close(); }
}

router.get('/', (_req, res) => {
  const c = carpetaSync();
  res.json({ copias: listar().map(({ t, ...x }) => x), carpeta_sync: c, sync_ok: c ? sincronizable(c) : null });
});

router.post('/', (_req, res) => {
  const r = crear('manual');
  audit('copia', null, 'crear', { nombre: r.nombre });
  res.status(201).json(r);
});

router.put('/config', (req, res) => {
  const c = String(req.body?.carpeta || '').trim();
  if (c && !sincronizable(c)) throw new ApiError(400, 'La carpeta no existe o no se puede escribir en ella');
  if (c) db.prepare('INSERT INTO config(clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run('carpeta_sync', c);
  else db.prepare("DELETE FROM config WHERE clave = 'carpeta_sync'").run();
  audit('copia', null, 'carpeta', { carpeta: c || null });
  res.json({ carpeta_sync: c || null });
});

// CSV legible (separador ";" y BOM para que Excel en español lo abra bien)
const TIPOS = {
  cobros: `SELECT t.id AS cobro, t.fecha, c.nombre AS clienta, t.metodo_cobro AS metodo, t.cuotas, ts.recorrido AS servicio, ts.precio_lista, ts.precio_cobrado,
      e.nombre AS profesional, ts.horas, ts.pago_monto AS pago_profesional, t.total AS total_cobro, t.sena, CASE t.anulado WHEN 1 THEN 'si' ELSE 'no' END AS anulado
    FROM turno t JOIN turno_servicio ts ON ts.turno_id = t.id LEFT JOIN cliente c ON c.id = t.cliente_id LEFT JOIN empleado e ON e.id = ts.empleado_id ORDER BY t.fecha, t.id, ts.id`,
  auditoria: 'SELECT id, fecha, entidad, entidad_id, accion, detalle FROM auditoria ORDER BY id',
  clientas: 'SELECT id, nombre, contacto, ficha, observacion, notas_importantes, activo FROM cliente ORDER BY nombre',
  movimientos: `SELECT m.id, m.fecha, m.tipo, e.nombre AS empleado, m.monto, m.concepto, CASE m.anulado WHEN 1 THEN 'si' ELSE 'no' END AS anulado
    FROM movimiento m LEFT JOIN empleado e ON e.id = m.empleado_id ORDER BY m.fecha`,
};
router.get('/exportar/:tipo', (req, res) => {
  const sql = TIPOS[req.params.tipo];
  if (!sql) throw new ApiError(404, 'Tipo de exportación inexistente');
  const filas = db.prepare(sql).all();
  const celda = (v) => { const s = v == null ? '' : String(v); return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
  const cols = filas.length ? Object.keys(filas[0]) : (sql.match(/AS (\w+)/g) || []).map((x) => x.slice(3));
  const csv = '\ufeff' + [cols.join(';'), ...filas.map((f) => cols.map((c) => celda(f[c])).join(';'))].join('\r\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="chromatica-${req.params.tipo}-${stamp().slice(0, 8)}.csv"` }).send(csv);
});

router.post('/:nombre/restaurar', (req, res) => {
  const nombre = req.params.nombre;
  if (!RE.test(nombre)) throw new ApiError(400, 'Nombre de copia inválido');
  const origen = path.join(DIR, nombre);
  if (!fs.existsSync(origen)) throw new ApiError(404, 'La copia no existe');
  validar(origen);
  const pre = crear('pre-restauracion');            // antes de pisar nada, se guarda el estado actual
  try { db.reemplazar(origen); }
  catch (e) {
    db.reemplazar(path.join(DIR, pre.nombre));
    throw new ApiError(500, 'No se pudo restaurar; se volvió al estado anterior');
  }
  audit('copia', null, 'restaurar', { nombre });
  res.json({ ok: true, copia_previa: pre.nombre });
});

module.exports = { router, crear, iniciarAuto };