const express = require('express');
const { db, audit } = require('./db');
const { ApiError, cfg } = require('./util');
const { normalizarFecha } = require('./fechas');

const router = express.Router();
const CAT_LABEL = { corte: 'Corte', color: 'Color', nutri: 'Nutri', otro: 'Otro' };

const entero = (v, msg) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, msg);
  return n;
};

function empleadoDeLinea(linea, categoria) {
  let id = linea.empleado_id;
  // cortes: por defecto, el único empleado activo; el resto queda sin asignar
  if (id === undefined && categoria === 'corte') {
    const def = Number(cfg('empleado_corte'));
    if (def && db.prepare('SELECT 1 FROM empleado WHERE id = ? AND activo = 1').get(def)) id = def;
    else {
      const activos = db.prepare('SELECT id FROM empleado WHERE activo = 1').all();
      id = activos.length === 1 ? activos[0].id : null;
    }
  }
  if (id == null) return null;
  if (!db.prepare('SELECT 1 FROM empleado WHERE id = ? AND activo = 1').get(Number(id)))
    throw new ApiError(400, 'Empleado inexistente o inactivo');
  return Number(id);
}

const MODO_DEFECTO = (cat) => (cat === 'color'
  ? { modo: 'hora', valor: 0 }
  : { modo: 'porcentaje', valor: Number(cfg('comision_default_pct') || 0) });

function horasValidas(h) {
  if (h == null || h === '') return null;
  const n = Number(h);
  if (!(n > 0 && n <= 24)) throw new ApiError(400, 'Horas inválidas (entre 0 y 24)');
  return Math.round(n * 100) / 100;
}

// Cuánto se le paga al empleado por esta línea:
//  - porcentaje: % del precio final cobrado
//  - hora: horas reales x valor por hora (si faltan las horas, queda pendiente en 0)
function pagoDeLinea(empleadoId, categoria, cobrado, horas) {
  if (!empleadoId) return { pago_modo: null, pago_valor: 0, pago_monto: 0, horas: null };
  const r = db.prepare('SELECT modo, valor FROM pago_empleado WHERE empleado_id = ? AND categoria = ?').get(empleadoId, categoria);
  const { modo, valor } = r || MODO_DEFECTO(categoria);
  if (modo === 'porcentaje') return { pago_modo: modo, pago_valor: valor, pago_monto: Math.round(cobrado * valor / 100), horas: null };
  return { pago_modo: modo, pago_valor: valor, pago_monto: horas == null ? 0 : Math.round(horas * valor), horas };
}

// Calcula una línea: precio de lista, precio final (con descuento de efectivo) y comisión
function calcularLinea(l, metodo, descPct) {
  let categoria, recorrido, lista, variante_id = null, automatico;

  if (l.variante_id != null) {
    const v = db.prepare(`SELECT v.id, v.etiqueta, v.precio_tarjeta, v.precio_efectivo, s.nombre, s.categoria, s.subgrupo
      FROM servicio_variante v JOIN servicio s ON s.id = v.servicio_id
      WHERE v.id = ? AND v.activo = 1 AND s.activo = 1`).get(Number(l.variante_id));
    if (!v) throw new ApiError(400, `Servicio inexistente (variante ${l.variante_id})`);
    categoria = v.categoria; variante_id = v.id; lista = v.precio_tarjeta;
    recorrido = [CAT_LABEL[categoria], categoria === 'corte' ? v.subgrupo : null, v.nombre, ['Único', 'Desde'].includes(v.etiqueta) ? null : v.etiqueta].filter(Boolean).join(' › ');

    // cortes: precio fijo; color y nutri: efectivo/transferencia llevan descuento
    automatico = metodo === 'tarjeta' || categoria === 'corte' ? lista : v.precio_efectivo;
  } else if (l.categoria === 'otro') {
    const descripcion = String(l.descripcion || '').trim();
    if (!descripcion) throw new ApiError(400, 'Falta la descripción del servicio "Otro"');
    lista = entero(l.monto, 'Monto inválido en "Otro"');
    if (lista <= 0) throw new ApiError(400, 'El monto de "Otro" debe ser mayor a 0');
    categoria = 'otro'; recorrido = `Otro › ${descripcion}`;
    automatico = metodo === 'tarjeta' || l.aplicar_descuento === false
      ? lista : Math.round(lista * (100 - descPct) / 100);
  } else {
    throw new ApiError(400, 'Cada servicio necesita variante_id, o categoria "otro" con descripcion y monto');
  }

  // Precio editado = precio de LISTA nuevo; el descuento de efectivo se calcula sobre él
  const listaOriginal = lista, automaticoOriginal = automatico;
  let editado = 0;
  if (l.precio_lista != null) {
    const p = entero(l.precio_lista, 'Precio de lista inválido');
    if (p <= 0) throw new ApiError(400, 'El precio de lista debe ser mayor a 0');
    if (p !== lista) {
      lista = p; editado = 1;
      const conDescuento = metodo === 'efectivo' && categoria !== 'corte' && !(categoria === 'otro' && l.aplicar_descuento === false);
      automatico = conDescuento ? Math.round(lista * (100 - descPct) / 100) : lista;
    }
  }
  const cobrado = automatico;

  const empleado_id = empleadoDeLinea(l, categoria);
  return {
    variante_id, categoria, recorrido, empleado_id,
    precio_lista: lista, lista_original: listaOriginal, precio_automatico: automaticoOriginal, precio_cobrado: cobrado, editado,
    ...pagoDeLinea(empleado_id, categoria, cobrado, horasValidas(l.horas)),
  };
}

function detalle(id) {
  const t = db.prepare('SELECT * FROM turno WHERE id = ?').get(id);
  if (!t) return null;
  const servicios = db.prepare(`SELECT ts.*, e.nombre AS empleado FROM turno_servicio ts
    LEFT JOIN empleado e ON e.id = ts.empleado_id WHERE ts.turno_id = ? ORDER BY ts.id`).all(id);
  const cliente = t.cliente_id
    ? db.prepare('SELECT id, nombre, contacto, ficha, observacion, notas_importantes FROM cliente WHERE id = ?').get(t.cliente_id)
    : null;
  return {
    ...t, cliente,
    servicios: servicios.map((s) => ({
      ...s,
      descuento: s.precio_lista - s.precio_cobrado,
      horas_pendientes: s.pago_modo === 'hora' && s.horas == null ? 1 : 0,
    })),
    saldo: t.total - t.sena,
    pago_empleados: servicios.reduce((a, s) => a + s.pago_monto, 0),
    horas_pendientes: servicios.filter((s) => s.pago_modo === 'hora' && s.horas == null).length,
  };
}

// Valida y calcula un cobro completo (lo usan la vista previa y el guardado)
function armar(b, { permitirVacio = false } = {}) {
  const metodo = b.metodo_cobro === 'transferencia' ? 'efectivo' : b.metodo_cobro;   // son lo mismo
  if (!['efectivo', 'tarjeta'].includes(metodo)) throw new ApiError(400, 'Método de pago inválido');
  let cuotas = null;
  if (metodo === 'tarjeta') {
    const opciones = String(cfg('cuotas_opciones') || '1').split(',').map(Number);
    cuotas = Number(b.cuotas);
    if (!opciones.includes(cuotas)) throw new ApiError(400, `Cuotas inválidas (opciones: ${opciones.join(', ')})`);
  }
  if (!Array.isArray(b.servicios) || (!b.servicios.length && !permitirVacio))
    throw new ApiError(400, 'Agregá al menos un servicio');
  if (b.cliente_id != null && !db.prepare('SELECT 1 FROM cliente WHERE id = ?').get(Number(b.cliente_id)))
    throw new ApiError(400, 'Clienta inexistente');

  const descPct = Number(cfg('descuento_efectivo_pct') || 0);
  const lineas = b.servicios.map((l) => calcularLinea(l, metodo, descPct));
  const total = lineas.reduce((a, l) => a + l.precio_cobrado, 0);

  let sena = 0;
  if (b.sena === true) sena = Number(cfg('sena_default') || 0);
  else if (b.sena != null && b.sena !== false) sena = entero(b.sena, 'Seña inválida');
  if (sena > total && !(permitirVacio && !lineas.length)) throw new ApiError(400, 'La seña no puede ser mayor al total');
  return { metodo, cuotas, lineas, total, sena };
}

// Vista previa sin guardar: el resumen de la pantalla Cobrar sale de acá (una sola fuente de cálculo)
router.post('/calcular', (req, res) => {
  const r = armar(req.body || {}, { permitirVacio: true });
  res.json({
    metodo_cobro: r.metodo, cuotas: r.cuotas, total: r.total, sena: r.sena, saldo: r.total - r.sena,
    servicios: r.lineas.map((l) => ({ ...l, descuento: l.precio_lista - l.precio_cobrado,
      horas_pendientes: l.pago_modo === 'hora' && l.horas == null ? 1 : 0 })),
    pago_empleados: r.lineas.reduce((a, l) => a + l.pago_monto, 0),
    horas_pendientes: r.lineas.filter((l) => l.pago_modo === 'hora' && l.horas == null).length,
  });
});

// Crea el cobro (= "turno")
router.post('/', (req, res) => {
  const b = req.body || {};
  const { metodo, cuotas, lineas, total, sena } = armar(b);
  const fecha = normalizarFecha(b.fecha);
  const id = db.transaction(() => {
    const id = db.prepare(`INSERT INTO turno(cliente_id, fecha, metodo_cobro, cuotas, total, sena, ficha, notas)
      VALUES (?, COALESCE(?, datetime('now','localtime')), ?, ?, ?, ?, ?, ?)`)
      .run(b.cliente_id != null ? Number(b.cliente_id) : null, fecha, metodo, cuotas, total, sena,
        b.ficha ?? null, b.notas ?? null).lastInsertRowid;
    const ins = db.prepare(`INSERT INTO turno_servicio(turno_id, variante_id, categoria, recorrido, empleado_id,
      precio_lista, precio_cobrado, editado, pago_modo, pago_valor, pago_monto, horas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const l of lineas)
      ins.run(id, l.variante_id, l.categoria, l.recorrido, l.empleado_id, l.precio_lista, l.precio_cobrado,
        l.editado, l.pago_modo, l.pago_valor, l.pago_monto, l.horas);
    audit('turno', id, 'crear', { total, sena, metodo, cuotas, servicios: lineas.length });
    return id;
  })();
  res.status(201).json(detalle(id));
});

// Historial: cobros entre dos fechas (AAAA-MM-DD), con sus servicios
router.get('/', (req, res) => {
  const desde = normalizarFecha(req.query.desde) || '0000-01-01 00:00:00';
  const hasta = normalizarFecha(req.query.hasta, true) || '9999-12-31 23:59:59';
  const cobros = db.prepare(`SELECT t.id, t.fecha, t.metodo_cobro, t.cuotas, t.total, t.sena, t.anulado, t.cierre_id,
      c.nombre AS clienta FROM turno t LEFT JOIN cliente c ON c.id = t.cliente_id
      WHERE t.fecha BETWEEN ? AND ? ORDER BY t.fecha DESC, t.id DESC`).all(desde, hasta);
  const ls = db.prepare(`SELECT ts.id, ts.turno_id, ts.recorrido, ts.precio_cobrado, ts.pago_modo, ts.horas, e.nombre AS empleado
      FROM turno_servicio ts LEFT JOIN empleado e ON e.id = ts.empleado_id
      WHERE ts.turno_id IN (SELECT id FROM turno WHERE fecha BETWEEN ? AND ?) ORDER BY ts.id`).all(desde, hasta);
  for (const c of cobros) {
    c.servicios = ls.filter((l) => l.turno_id === c.id);
    c.horas_pendientes = c.servicios.filter((l) => l.pago_modo === 'hora' && l.horas == null).length;
  }
  res.json(cobros);
});

router.get('/:id', (req, res) => {
  const d = detalle(Number(req.params.id));
  if (!d) throw new ApiError(404, 'Cobro inexistente');
  res.json(d);
});

// Agregar / quitar clienta y ficha, notas o corregir la fecha (queda en auditoría)
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT * FROM turno WHERE id = ?').get(id);
  if (!t) throw new ApiError(404, 'Cobro inexistente');
  if (t.anulado) throw new ApiError(409, 'El cobro está anulado');
  if (t.cierre_id) throw new ApiError(409, 'El cobro ya está en un cierre de caja');
  const b = req.body || {};
  const cambios = {};
  if ('cliente_id' in b) {
    if (b.cliente_id != null && !db.prepare('SELECT 1 FROM cliente WHERE id = ?').get(Number(b.cliente_id)))
      throw new ApiError(400, 'Clienta inexistente');
    cambios.cliente_id = b.cliente_id != null ? Number(b.cliente_id) : null;
  }
  if ('ficha' in b) cambios.ficha = b.ficha || null;
  if ('notas' in b) cambios.notas = b.notas || null;
  if ('fecha' in b) cambios.fecha = normalizarFecha(b.fecha) || t.fecha;
  if (!Object.keys(cambios).length) throw new ApiError(400, 'Nada para cambiar');

  db.transaction(() => {
    for (const [k, v] of Object.entries(cambios)) db.prepare(`UPDATE turno SET ${k} = ? WHERE id = ?`).run(v, id);
    const antes = Object.fromEntries(Object.keys(cambios).map((k) => [k, t[k]]));
    audit('turno', id, 'editar', { antes, despues: cambios });
  })();
  res.json(detalle(id));
});

// Los cobros no se borran: se anulan
router.post('/:id/anular', (req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT anulado, cierre_id FROM turno WHERE id = ?').get(id);
  if (!t) throw new ApiError(404, 'Cobro inexistente');
  if (t.anulado) throw new ApiError(409, 'Ya estaba anulado');
  if (t.cierre_id) throw new ApiError(409, 'El cobro ya está en un cierre de caja (anulá el cierre para corregirlo)');
  db.transaction(() => {
    db.prepare('UPDATE turno SET anulado = 1 WHERE id = ?').run(id);
    audit('turno', id, 'anular', { motivo: req.body?.motivo ?? null });
  })();
  res.json(detalle(id));
});

// Un cobro anulado se puede eliminar definitivamente (uno vigente primero se anula)
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT * FROM turno WHERE id = ?').get(id);
  if (!t) throw new ApiError(404, 'Cobro inexistente');
  if (!t.anulado) throw new ApiError(409, 'Solo se pueden eliminar cobros anulados');
  if (t.cierre_id) throw new ApiError(409, 'El cobro está en un cierre de caja');
  db.transaction(() => {
    db.prepare('DELETE FROM turno_servicio WHERE turno_id = ?').run(id);
    db.prepare('DELETE FROM turno WHERE id = ?').run(id);
    audit('turno', id, 'eliminar', { total: t.total, fecha: t.fecha, cliente_id: t.cliente_id });
  })();
  res.json({ ok: true });
});

// Completar o corregir las horas (color) o el empleado de un servicio ya cobrado
router.put('/:id/servicios/:sid', (req, res) => {
  const id = Number(req.params.id), sid = Number(req.params.sid);
  const t = db.prepare('SELECT anulado, cierre_id FROM turno WHERE id = ?').get(id);
  if (!t) throw new ApiError(404, 'Cobro inexistente');
  if (t.anulado) throw new ApiError(409, 'El cobro está anulado');
  if (t.cierre_id) throw new ApiError(409, 'El cobro ya está en un cierre de caja');
  const l = db.prepare('SELECT * FROM turno_servicio WHERE id = ? AND turno_id = ?').get(sid, id);
  if (!l) throw new ApiError(404, 'Servicio inexistente en ese cobro');
  const b = req.body || {};
  const empleado_id = 'empleado_id' in b ? empleadoDeLinea({ empleado_id: b.empleado_id ?? null }, l.categoria) : l.empleado_id;
  const horas = 'horas' in b ? horasValidas(b.horas) : l.horas;
  const p = pagoDeLinea(empleado_id, l.categoria, l.precio_cobrado, horas);
  db.transaction(() => {
    db.prepare(`UPDATE turno_servicio SET empleado_id = ?, pago_modo = ?, pago_valor = ?, pago_monto = ?, horas = ? WHERE id = ?`)
      .run(empleado_id, p.pago_modo, p.pago_valor, p.pago_monto, p.horas, sid);
    audit('turno', id, 'editar_servicio', {
      servicio: sid, antes: { empleado_id: l.empleado_id, horas: l.horas, pago: l.pago_monto },
      despues: { empleado_id, horas: p.horas, pago: p.pago_monto },
    });
  })();
  res.json(detalle(id));
});

module.exports = { router };