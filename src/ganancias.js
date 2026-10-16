const express = require('express');
const { db } = require('./db');

const router = express.Router();
const iso = (d) => d.toLocaleDateString('en-CA');

// Semana calendario (lunes a domingo) o mes, como [desde, hasta]; offset 0 = actual, -1 = el anterior
function rango(tipo, offset = 0) {
  const hoy = new Date();
  let d, h;
  if (tipo === 'mes') { d = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1); h = new Date(hoy.getFullYear(), hoy.getMonth() + offset + 1, 0); }
  else { d = new Date(hoy); d.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7) + 7 * offset); h = new Date(d); h.setDate(d.getDate() + 6); }
  return [`${iso(d)} 00:00:00`, `${iso(h)} 23:59:59`];
}

function periodo([d, h]) {
  const c = db.prepare('SELECT COALESCE(SUM(total),0) total, COUNT(*) n FROM turno WHERE anulado = 0 AND fecha BETWEEN ? AND ?').get(d, h);
  const pagos = db.prepare(`SELECT COALESCE(SUM(ts.pago_monto),0) p FROM turno_servicio ts JOIN turno t ON t.id = ts.turno_id
    WHERE t.anulado = 0 AND t.fecha BETWEEN ? AND ?`).get(d, h).p;
  const gastos = db.prepare("SELECT COALESCE(SUM(monto),0) g FROM movimiento WHERE anulado = 0 AND tipo = 'gasto' AND fecha BETWEEN ? AND ?").get(d, h).g;
  return { desde: d.slice(0, 10), hasta: h.slice(0, 10), cobros: c.n, total: c.total, pagos_empleados: pagos, gastos, ganancia: c.total - pagos - gastos };
}

router.get('/resumen', (req, res) => {
  const tipo = req.query.tipo === 'mes' ? 'mes' : 'semana';
  const offset = Math.min(0, Math.max(-120, parseInt(req.query.offset, 10) || 0));
  const per = rango(tipo, offset);
  const sem = rango('semana');
  // lo que se le debe a cada empleado = pagos de cobros sin cerrar - adelantos sin cerrar
  const pagos = db.prepare(`SELECT ts.empleado_id id, SUM(ts.pago_monto) m FROM turno_servicio ts JOIN turno t ON t.id = ts.turno_id
    WHERE t.cierre_id IS NULL AND t.anulado = 0 AND ts.empleado_id IS NOT NULL GROUP BY ts.empleado_id`).all();
  const adel = db.prepare(`SELECT empleado_id id, SUM(monto) m FROM movimiento
    WHERE tipo = 'adelanto' AND cierre_id IS NULL AND anulado = 0 GROUP BY empleado_id`).all();
  const a_pagar = db.prepare('SELECT id, nombre FROM empleado WHERE activo = 1 ORDER BY nombre').all().map((e) => {
    const p = pagos.find((x) => x.id === e.id)?.m || 0, a = adel.find((x) => x.id === e.id)?.m || 0;
    return { empleado_id: e.id, empleado: e.nombre, pagos: p, adelantos: a, neto: p - a };
  });
  const porDia = db.prepare('SELECT substr(fecha,1,10) dia, SUM(total) total FROM turno WHERE anulado = 0 AND fecha BETWEEN ? AND ? GROUP BY dia').all(...per);
  const dias = [];
  for (let f = new Date(per[0].slice(0, 10) + 'T12:00:00'); iso(f) <= per[1].slice(0, 10); f.setDate(f.getDate() + 1)) {
    const dia = iso(f); dias.push({ dia, total: porDia.find((x) => x.dia === dia)?.total || 0 });
  }
  const pendientes = db.prepare(`SELECT COUNT(*) n FROM turno_servicio ts JOIN turno t ON t.id = ts.turno_id
    WHERE t.anulado = 0 AND ts.pago_modo = 'hora' AND ts.horas IS NULL`).get().n;
  res.json({ periodo: { tipo, offset, ...periodo(per) }, semana: periodo(sem), mes: periodo(rango('mes')), a_pagar, dias, horas_pendientes: pendientes });
});

module.exports = { router };