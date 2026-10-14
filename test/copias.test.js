// Pruebas de copias de seguridad: manual, rotación, carpeta sincronizada, al cerrar caja y restauración
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iniciar, dia } = require('./helper');

(async () => {
  const { api, prueba, entrar, cerrar, DIR } = await iniciar();
  console.log('Copias de seguridad');
  const sync = fs.mkdtempSync(path.join(os.tmpdir(), 'chromatica-sync-'));
  try {
    const { vid } = await entrar();
    const CORTE = vid('Corte completo (cabello largo)');
    const cobro = () => api('POST', '/api/cobros', { metodo_cobro: 'efectivo', servicios: [{ variante_id: CORTE }] });
    const copias = async () => (await api('GET', '/api/copias')).data;

    await prueba('copia manual: queda en la lista y como archivo', async () => {
      const r = await api('POST', '/api/copias');
      assert.equal(r.status, 201);
      const l = (await copias()).copias;
      assert.ok(l.some((c) => c.nombre === r.data.nombre && c.motivo === 'manual'));
      assert.ok(fs.existsSync(path.join(DIR, 'copias', r.data.nombre)));
    });
    await prueba('carpeta sincronizada: valida la ruta y copia ahí', async () => {
      assert.equal((await api('PUT', '/api/copias/config', { carpeta: path.join(sync, 'no-existe') })).status, 400);
      assert.equal((await api('PUT', '/api/copias/config', { carpeta: sync })).status, 200);
      const r = await api('POST', '/api/copias');
      assert.equal(r.data.sync, true);
      assert.ok(fs.existsSync(path.join(sync, r.data.nombre)));
    });
        await prueba('historial completo: no se borra ninguna copia', async () => {
      const antes = (await copias()).copias.length, enSync = fs.readdirSync(sync).length;
      for (let i = 0; i < 33; i++) await api('POST', '/api/copias');
      assert.equal((await copias()).copias.length, antes + 33);
      assert.equal(fs.readdirSync(sync).length, enSync + 33);
    });
    await prueba('cerrar la caja genera una copia', async () => {
      await cobro();
      assert.equal((await api('POST', '/api/cierres', { hasta: dia(0) })).status, 201);
      assert.ok((await copias()).copias.some((c) => c.motivo === 'cierre'));
    });
    await prueba('restaurar: vuelve al estado de la copia y guarda el estado previo', async () => {
      await cobro();                                                       // cobro A
      const { nombre } = (await api('POST', '/api/copias')).data;
      await cobro();                                                       // cobro B, posterior a la copia
      const antes = (await api('GET', '/api/cobros')).data.length;
      const r = await api('POST', `/api/copias/${nombre}/restaurar`);
      assert.equal(r.status, 200);
      assert.equal((await api('GET', '/api/cobros')).data.length, antes - 1);
      assert.ok((await copias()).copias.some((c) => c.motivo === 'pre-restauracion'));
      assert.equal((await cobro()).status, 201);                           // el sistema sigue funcionando
    });
    await prueba('restaurar: rechaza nombres inválidos o inexistentes', async () => {
      assert.equal((await api('POST', `/api/copias/${encodeURIComponent('../chromatica.db')}/restaurar`)).status, 400);
      assert.equal((await api('POST', '/api/copias/chromatica-20200101-000000-manual.db/restaurar')).status, 404);
    });
    await prueba('exportar: tipo inexistente da 404', async () => {
      assert.equal((await api('GET', '/api/copias/exportar/otra')).status, 404);
    });
  } finally { fs.rmSync(sync, { recursive: true, force: true }); cerrar('Copias'); }
})();