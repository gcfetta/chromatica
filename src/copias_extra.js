// Explorador de carpetas (para elegir la carpeta de Drive/iCloud) y restauración desde un archivo .db del disco.
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { db, audit } = require('./db');
const { ApiError } = require('./util');
const { crear, validar, DIR } = require('./copias');

const router = express.Router();
const esDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

function atajos() {
  const home = os.homedir(), l = [{ nombre: 'Inicio', ruta: home }];
  for (const n of ['Desktop', 'Escritorio', 'Documents', 'Documentos']) if (esDir(path.join(home, n))) l.push({ nombre: n, ruta: path.join(home, n) });
  const nube = path.join(home, 'Library', 'CloudStorage');                       // macOS: Google Drive / iCloud / OneDrive
  if (esDir(nube)) for (const n of fs.readdirSync(nube)) if (esDir(path.join(nube, n))) l.push({ nombre: n.replace(/^GoogleDrive-/, 'Google Drive · '), ruta: path.join(nube, n) });
  const icloud = path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  if (esDir(icloud)) l.push({ nombre: 'iCloud Drive', ruta: icloud });
  for (const n of ['Google Drive', 'Mi unidad']) if (esDir(path.join(home, n))) l.push({ nombre: n, ruta: path.join(home, n) });
  if (process.platform === 'win32') for (const d of 'CDEFGHIJKLMNOPQRSTUVWXYZ') if (esDir(`${d}:\\`)) l.push({ nombre: `Disco ${d}:`, ruta: `${d}:\\` });
  return l;
}

router.get('/explorar', (req, res) => {
  const ruta = path.resolve(String(req.query.ruta || os.homedir()));
  if (!esDir(ruta)) throw new ApiError(400, 'La carpeta no existe');
  let carpetas = [];
  try {
    carpetas = fs.readdirSync(ruta, { withFileTypes: true })
      .filter((d) => d.name[0] !== '.' && (d.isDirectory() || (d.isSymbolicLink() && esDir(path.join(ruta, d.name)))))
      .map((d) => ({ nombre: d.name, ruta: path.join(ruta, d.name) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  } catch { /* sin permiso: se muestra vacía */ }
  const padre = path.dirname(ruta);
  res.json({ ruta, padre: padre === ruta ? null : padre, carpetas, atajos: atajos() });
});

router.post('/carpeta-nueva', (req, res) => {
  const base = String(req.body?.ruta || ''), nombre = String(req.body?.nombre || '').trim();
  if (!esDir(base)) throw new ApiError(400, 'La carpeta base no existe');
  if (!nombre || /[\\/:*?"<>|]/.test(nombre)) throw new ApiError(400, 'Nombre de carpeta inválido');
  const dest = path.join(base, nombre);
  try { fs.mkdirSync(dest); } catch { throw new ApiError(400, 'No se pudo crear la carpeta (¿ya existe?)'); }
  res.status(201).json({ ruta: dest });
});

// Restaurar desde un archivo elegido con el explorador del sistema (el navegador manda los bytes)
router.post('/restaurar-archivo', express.raw({ type: () => true, limit: '500mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length < 100) throw new ApiError(400, 'No se recibió ningún archivo');
  const tmp = path.join(DIR, `subida-${Date.now()}.tmp`);
  fs.writeFileSync(tmp, req.body);
  try {
    validar(tmp);
    const pre = crear('pre-restauracion');
    try { db.reemplazar(tmp); }
    catch { db.reemplazar(path.join(DIR, pre.nombre)); throw new ApiError(500, 'No se pudo restaurar; se volvió al estado anterior'); }
    audit('copia', null, 'restaurar_archivo', { bytes: req.body.length });
    res.json({ ok: true, copia_previa: pre.nombre });
  } finally { fs.rmSync(tmp, { force: true }); }
});

module.exports = { router };