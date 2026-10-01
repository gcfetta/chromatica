// Prueba automática del paso 2. Uso: npm test
// Arranca el servidor con una base temporal (no toca tus datos reales).
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatica-test-'));
const PORT = 3900 + Math.floor(Math.random() * 90);
const env = { ...process.env, PELU_DATA: DIR, PORT: String(PORT), PELU_MAIL_TEST: '1' };
const root = path.join(__dirname, '..');
const BASE = `http://127.0.0.1:${PORT}`;
let cookie = '';

async function api(metodo, ruta, body) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: r.status, data: await r.json().catch(() => null) };
}

let ok = 0;
async function prueba(nombre, fn) {
  try { await fn(); ok++; console.log('  ✓', nombre); }
  catch (e) { console.error('  ✗', nombre, '\n   ', e.message); process.exitCode = 1; }
}

(async () => {
  spawnSync(process.execPath, ['db/seed.js'], { cwd: root, env, stdio: 'ignore' });
  const srv = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { await fetch(BASE + '/api/health'); break; } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  try {
    console.log('Paso 2 · API de cobros');
    await prueba('sin login, las rutas dan 401', async () => {
      assert.equal((await api('GET', '/api/cobros/1')).status, 401);
    });
    await api('POST', '/api/auth/setup', { usuario: 'admin', password: 'clave123', mail: 'a@b.com' });
    await api('POST', '/api/auth/login', { usuario: 'admin', password: 'clave123' });

    const serv = (await api('GET', '/api/servicios')).data;
    const vid = (nombre, etiqueta) => serv.find((s) => s.nombre === nombre && (!etiqueta || s.etiqueta === etiqueta)).variante_id;
    const CORTE = vid('Corte completo (cabello largo)');
    const BABY = vid('Babylights', 'Plus · Hasta media espalda');
    const RITUAL = vid('Ritual CHROMATICA de 5 pasos', 'XS/S');

    let emp;
    await prueba('crear empleado con 40% por categoría', async () => {
      const r = await api('POST', '/api/empleados', { nombre: 'Peluquero' });
      assert.equal(r.status, 201);
      emp = r.data;
      assert.deepEqual(emp.comisiones, { corte: 40, color: 40, nutri: 40, otro: 40 });
    });

    let c1;
    await prueba('cobro en efectivo: descuento 20% en color y otro, no en cortes; seña; comisión de corte', async () => {
      const r = await api('POST', '/api/cobros', {
        metodo_cobro: 'efectivo', sena: true,
        servicios: [
          { variante_id: CORTE },
          { variante_id: BABY },
          { categoria: 'otro', descripcion: 'Peinado', monto: 30000 },
        ],
      });
      assert.equal(r.status, 201);
      c1 = r.data;
      const [corte, baby, otro] = c1.servicios;
      assert.equal(corte.precio_cobrado, 40000);
      assert.equal(corte.empleado_id, emp.id, 'el corte se asigna solo al único empleado');
      assert.equal(corte.comision_monto, 16000);
      assert.equal(baby.precio_lista, 130000);
      assert.equal(baby.precio_cobrado, 104000);
      assert.equal(baby.empleado_id, null);
      assert.equal(baby.comision_monto, 0);
      assert.equal(otro.precio_cobrado, 24000);
      assert.equal(c1.total, 168000);
      assert.equal(c1.sena, 10000);
      assert.equal(c1.saldo, 158000);
      assert.equal(c1.comision_total, 16000);
      assert.equal(c1.cliente, null);
    });

    await prueba('cobro con tarjeta: sin descuento', async () => {
      const r = await api('POST', '/api/cobros', {
        metodo_cobro: 'tarjeta',
        servicios: [{ variante_id: CORTE }, { variante_id: BABY }, { categoria: 'otro', descripcion: 'Peinado', monto: 30000 }],
      });
      assert.equal(r.data.total, 200000);
      assert.equal(r.data.sena, 0);
    });

    await prueba('nutri asociada al empleado usa su % y se calcula sobre el precio final', async () => {
      const r = await api('POST', '/api/cobros', {
        metodo_cobro: 'transferencia', servicios: [{ variante_id: RITUAL, empleado_id: emp.id }],
      });
      const l = r.data.servicios[0];
      assert.equal(l.precio_lista, 75000);
      assert.equal(l.precio_cobrado, 60000);
      assert.equal(l.comision_pct, 40);
      assert.equal(l.comision_monto, 24000);
    });

    await prueba('cambiar el % después no altera cobros anteriores', async () => {
      await api('PUT', `/api/empleados/${emp.id}`, { comisiones: { corte: 50 } });
      const viejo = (await api('GET', `/api/cobros/${c1.id}`)).data;
      assert.equal(viejo.servicios[0].comision_monto, 16000);
      const nuevo = (await api('POST', '/api/cobros', { metodo_cobro: 'efectivo', servicios: [{ variante_id: CORTE }] })).data;
      assert.equal(nuevo.servicios[0].comision_monto, 20000);
      await api('PUT', `/api/empleados/${emp.id}`, { comisiones: { corte: 40 } });
    });

    await prueba('precio editado a mano queda marcado', async () => {
      const r = await api('POST', '/api/cobros', {
        metodo_cobro: 'efectivo', servicios: [{ variante_id: BABY, precio_cobrado: 90000 }],
      });
      assert.equal(r.data.servicios[0].editado, 1);
      assert.equal(r.data.servicios[0].precio_cobrado, 90000);
    });

    await prueba('validaciones', async () => {
      const base = { metodo_cobro: 'efectivo', servicios: [{ variante_id: CORTE }] };
      assert.equal((await api('POST', '/api/cobros', { ...base, sena: 99999999 })).status, 400);
      assert.equal((await api('POST', '/api/cobros', { ...base, metodo_cobro: 'cheque' })).status, 400);
      assert.equal((await api('POST', '/api/cobros', { ...base, servicios: [] })).status, 400);
      assert.equal((await api('POST', '/api/cobros', { ...base, servicios: [{ variante_id: 999999 }] })).status, 400);
      assert.equal((await api('POST', '/api/cobros', { ...base, servicios: [{ variante_id: CORTE, empleado_id: 999 }] })).status, 400);
      assert.equal((await api('POST', '/api/cobros', { ...base, cliente_id: 999 })).status, 400);
    });

    await prueba('con dos empleados, el corte queda sin asignar hasta elegir', async () => {
      const e2 = (await api('POST', '/api/empleados', { nombre: 'Otra' })).data;
      const r = await api('POST', '/api/cobros', { metodo_cobro: 'efectivo', servicios: [{ variante_id: CORTE }] });
      assert.equal(r.data.servicios[0].empleado_id, null);
      await api('PUT', `/api/empleados/${e2.id}`, { activo: false });
    });

    await prueba('asociar, cambiar y quitar clienta/ficha (también después de cobrar)', async () => {
      const cl = (await api('POST', '/api/clientes', { nombre: 'Sofía Martínez', contacto: '299 555 0000' })).data;
      let r = await api('PATCH', `/api/cobros/${c1.id}`, { cliente_id: cl.id, ficha: 'Base 6.1 + oxidante 20 vol' });
      assert.equal(r.data.cliente.nombre, 'Sofía Martínez');
      assert.equal(r.data.ficha, 'Base 6.1 + oxidante 20 vol');
      r = await api('PATCH', `/api/cobros/${c1.id}`, { cliente_id: null, ficha: null });
      assert.equal(r.data.cliente, null);
      assert.equal(r.data.ficha, null);
      await api('PATCH', `/api/cobros/${c1.id}`, { cliente_id: cl.id });
      const h = (await api('GET', `/api/clientes/${cl.id}`)).data.historial;
      assert.equal(h.length, 3);
      assert.equal((await api('GET', '/api/clientes?q=sof')).data.length, 1);
    });

    await prueba('anular: no se borra, queda registrado y no se puede editar', async () => {
      const r = await api('POST', `/api/cobros/${c1.id}/anular`, { motivo: 'Error de carga' });
      assert.equal(r.data.anulado, 1);
      assert.equal((await api('POST', `/api/cobros/${c1.id}/anular`)).status, 409);
      assert.equal((await api('PATCH', `/api/cobros/${c1.id}`, { ficha: 'x' })).status, 409);
      assert.equal((await api('GET', `/api/cobros/${c1.id}`)).status, 200);
    });

    await prueba('auditoría registra las acciones', async () => {
      const { DatabaseSync } = require('node:sqlite');
      const d = new DatabaseSync(path.join(DIR, 'chromatica.db'));
      const acc = d.prepare("SELECT accion, COUNT(*) n FROM auditoria WHERE entidad='turno' GROUP BY accion").all();
      const n = Object.fromEntries(acc.map((a) => [a.accion, a.n]));
      assert.ok(n.crear >= 5 && n.editar >= 3 && n.anular === 1, JSON.stringify(n));
      d.close();
    });

    console.log(`\n${ok} pruebas OK${process.exitCode ? ' (hay fallas)' : ''}`);
  } finally {
    srv.kill();
    setTimeout(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {} }, 500);
  }
})();