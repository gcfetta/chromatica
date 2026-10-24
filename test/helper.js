// Utilidades de prueba: arranca el servidor con una base temporal (no toca tus datos reales).
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function iniciar() {
  const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatica-test-'));
  const PORT = 3900 + Math.floor(Math.random() * 90);
  const env = { ...process.env, PELU_DATA=/tmp/, PORT: String(PORT), PELU_MAIL_TEST: '1' };
  const root = path.join(__dirname, '..');
  const BASE = `http://127.0.0.1:${PORT}`;
  let cookie = '';

  spawnSync(process.execPath, ['db/seed.js'], { cwd: root, env, stdio: 'ignore' });
  const srv = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { await fetch(BASE + '/api/health'); break; } catch { await new Promise((r) => setTimeout(r, 150)); }
  }

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

  async function entrar() {
    await api('POST', '/api/auth/setup', { mail: 'a@b.com', usuario: 'admin', password: 'clave123' });
    const serv = (await api('GET', '/api/servicios')).data;
    const vid = (nombre, etiqueta) => serv.find((s) => s.nombre === nombre && (!etiqueta || s.etiqueta === etiqueta)).variante_id;
    return { serv, vid };
  }

  function cerrar(titulo) {
    console.log(`\n${titulo}: ${ok} pruebas OK${process.exitCode ? ' (hay fallas)' : ''}`);
    srv.kill();
    setTimeout(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {} }, 500);
  }

  return { api, prueba, entrar, cerrar, DIR };
}

// Fecha local AAAA-MM-DD desplazada N días
const dia = (n = 0) => {
  const d = new Date(Date.now() + n * 86400000);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

module.exports = { iniciar, dia };