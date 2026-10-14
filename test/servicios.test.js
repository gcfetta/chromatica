// Pruebas de edición de precios y "actualizar precios %"
const assert = require('node:assert/strict');
const { iniciar } = require('./helper');

(async () => {
  const { api, prueba, entrar, cerrar } = await iniciar();
  console.log('Servicios y precios');
  try {
    const { vid } = await entrar();
    const fila = async (id) => (await api('GET', '/api/servicios')).data.find((s) => s.variante_id === id);
    const BABY = vid('Babylights', 'Plus · Hasta media espalda');   // 130.000 / efectivo 104.000
    const CORTE = vid('Corte completo (cabello largo)');             // 40.000 fijo
    const cobro = (v) => api('POST', '/api/cobros', { metodo_cobro: 'efectivo', servicios: [{ variante_id: v }] });
    const viejo = (await cobro(BABY)).data;                          // cobro con el precio actual

    await prueba('valida precios', async () => {
      assert.equal((await api('PUT', `/api/servicios/variantes/${BABY}`, { precio: 0 })).status, 400);
      assert.equal((await api('PUT', `/api/servicios/variantes/${BABY}`, { precio: 12.5 })).status, 400);
      assert.equal((await api('PUT', '/api/servicios/variantes/99999', { precio: 1000 })).status, 404);
    });
    await prueba('editar un precio recalcula el de efectivo; los cortes no tienen descuento', async () => {
      await api('PUT', `/api/servicios/variantes/${BABY}`, { precio: 150000 });
      const f = await fila(BABY);
      assert.equal(f.precio_tarjeta, 150000); assert.equal(f.precio_efectivo, 120000);
      await api('PUT', `/api/servicios/variantes/${CORTE}`, { precio: 45000 });
      const c = await fila(CORTE);
      assert.equal(c.precio_tarjeta, 45000); assert.equal(c.precio_efectivo, 45000);
    });
    await prueba('los cobros anteriores conservan su precio y los nuevos usan el actualizado', async () => {
      assert.equal((await api('GET', `/api/cobros/${viejo.id}`)).data.total, 104000);
      assert.equal((await cobro(BABY)).data.total, 120000);
    });
    await prueba('actualizar %: la vista previa no cambia nada', async () => {
      const r = (await api('POST', '/api/servicios/actualizar-precios', { porcentaje: 10, grupo: 'Mechas', redondeo: 500 })).data;
      assert.equal(r.aplicado, false); assert.ok(r.cantidad > 0);
      assert.equal((await fila(BABY)).precio_tarjeta, 150000);
    });
    await prueba('actualizar %: aplica solo al grupo elegido, redondea y recalcula efectivo', async () => {
      const antes = await fila(CORTE);
      const r = (await api('POST', '/api/servicios/actualizar-precios', { porcentaje: 10, grupo: 'Mechas', redondeo: 500, aplicar: true })).data;
      assert.equal(r.aplicado, true);
      const f = await fila(BABY);
      assert.equal(f.precio_tarjeta, 165000); assert.equal(f.precio_efectivo, 132000);
      assert.equal((await fila(CORTE)).precio_tarjeta, antes.precio_tarjeta);   // otro grupo, intacto
    });
    await prueba('actualizar %: validaciones', async () => {
      for (const porcentaje of [0, 250, -80, 'x']) assert.equal((await api('POST', '/api/servicios/actualizar-precios', { porcentaje })).status, 400);
      assert.equal((await api('POST', '/api/servicios/actualizar-precios', { porcentaje: 5, redondeo: 7 })).status, 400);
    });
    await prueba('toda la carta con descuento: baja precios y queda en el historial de cambios', async () => {
      const r = (await api('POST', '/api/servicios/actualizar-precios', { porcentaje: -10, grupo: 'todos', redondeo: 100, aplicar: true })).data;
      assert.ok(r.cantidad > 100);
      assert.equal((await fila(BABY)).precio_tarjeta, 148500);
    });
  } finally { cerrar('Servicios'); }
})();