const express = require('express');
const path = require('path');
const { db, DB_FILE } = require('./src/db');
const { router: authRouter, requireAuth } = require('./src/auth');
const { router: empleadosRouter } = require('./src/empleados');
const { router: clientesRouter } = require('./src/clientes');
const { router: cobrosRouter } = require('./src/cobros');
const { router: movimientosRouter } = require('./src/movimientos');
const { router: cierresRouter } = require('./src/cierres');
const { router: gananciasRouter } = require('./src/ganancias');
const { router: copiasRouter, iniciarAuto } = require('./src/copias');
const { router: serviciosRouter } = require('./src/servicios');
const { ApiError, cfg } = require('./src/util');
const { router: copiasExtraRouter } = require('./src/copias_extra');

const app = express();
app.use(express.json());
// interfaz y fuentes locales (no dependen de internet)
app.use('/fonts', express.static(path.join(__dirname, 'node_modules', '@fontsource'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    db: DB_FILE,
    version_esquema: db.pragma('user_version', { simple: true }),
    integridad: db.pragma('integrity_check', { simple: true }),
  });
});

app.use('/api/auth', authRouter);

// configuración del envío de mail (Gmail + contraseña de aplicación)
app.put('/api/config/mail', requireAuth, (req, res) => {
  const { smtp_user, smtp_pass } = req.body || {};
  if (!smtp_user || !smtp_pass) return res.status(400).json({ error: 'Faltan datos' });
  const up = db.prepare('INSERT INTO config(clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
  up.run('smtp_user', smtp_user);
  up.run('smtp_pass', smtp_pass);
  res.json({ ok: true });
});

app.get('/api/servicios', requireAuth, (_req, res) => {
  res.json(db.prepare(`
    SELECT s.id, s.nombre, s.categoria, s.grupo, s.subgrupo, s.duracion_texto,
           v.id AS variante_id, v.etiqueta, v.precio_tarjeta, v.precio_efectivo, v.duracion_min, v.precio_desde
    FROM servicio s JOIN servicio_variante v ON v.servicio_id = s.id
    WHERE s.activo = 1 AND v.activo = 1
    ORDER BY s.orden, s.id, v.orden, v.id`).all());
});

app.put('/api/config/empleado-corte', requireAuth, (req, res) => {
  const id = req.body?.empleado_id;
  if (id == null) db.prepare("DELETE FROM config WHERE clave = 'empleado_corte'").run();
  else {
    if (!db.prepare('SELECT 1 FROM empleado WHERE id = ? AND activo = 1').get(Number(id))) return res.status(400).json({ error: 'Empleado inválido' });
    db.prepare('INSERT INTO config(clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').run('empleado_corte', String(Number(id)));
  }
  res.json({ ok: true });
});

app.get('/api/config', requireAuth, (_req, res) => {
  res.json({
    descuento_efectivo_pct: Number(cfg('descuento_efectivo_pct')),
    sena_default: Number(cfg('sena_default')),     empleado_corte: Number(cfg('empleado_corte')) || null,
    comision_default_pct: Number(cfg('comision_default_pct')),
    niveles: (() => { try { return JSON.parse(cfg('niveles') || '[]'); } catch { return []; } })(),
    cuotas_opciones: String(cfg('cuotas_opciones') || '1').split(',').map(Number),
  });
});

app.use('/api/servicios', requireAuth, serviciosRouter);
app.use('/api/empleados', requireAuth, empleadosRouter);
app.use('/api/clientes', requireAuth, clientesRouter);
app.use('/api/cobros', requireAuth, cobrosRouter);
app.use('/api/movimientos', requireAuth, movimientosRouter);
app.use('/api/cierres', requireAuth, cierresRouter);
app.use('/api/cierres', requireAuth, cierresRouter);
app.use('/api/ganancias', requireAuth, gananciasRouter);
app.use('/api/copias', requireAuth, copiasExtraRouter);
app.use('/api/copias', requireAuth, copiasRouter);

// errores de validación -> JSON claro
app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => { console.log(`Chromatica en http://localhost:${PORT}`); iniciarAuto(); });