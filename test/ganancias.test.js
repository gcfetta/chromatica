// Pruebas de historial de cobros y resumen de ganancias
const assert = require('node:assert/strict');
const { iniciar, dia } = require('./helper');

(async () => {
  const { api, prueba, entrar, cerrar } = await iniciar();
  console.log('Historial y ganancias');
  try {
    const { vid } = await entrar();
    const CORTE = vid('Corte completo (cabello largo)');
    const BABY = vid('Babylights', 'Plus · Hasta media espalda');
    const emp = (await api('POST', '/api/empleados', { nombre: 'Peluquero', pagos: { color: { modo: 'hora', valor: 8000 } } })).data;
    const cobro = (b) => api('POST', '/api/cobros', { metodo_cobro: 'efectivo', ...b });
    const c1 = (await cobro({ servicios: [{ variante_id: CORTE }] })).data;                          // 40.000, pago 16.000
    await cobro({ servicios: [{ variante_id: BABY, empleado_id: emp.id }] });                        // 104.000, horas pendientes
    await api('POST', '/api/movimientos', { tipo: 'gasto', monto: 5000 });
    await api('POST', '/api/movimientos', { tipo: 'adelanto', empleado_id: emp.id, monto: 6000 });

    await prueba('el recorrido de un corte incluye Corto/Largo', async () => {
      assert.equal(c1.servicios[0].recorrido, 'Corte › Largo › Corte completo (cabello largo)');
    });
    await prueba('historial: lista por rango de fechas con horas pendientes', async () => {
      const l = (await api('GET', `/api/cobros?desde=${dia(0)}&hasta=${dia(0)}`)).data;
      assert.equal(l.length, 2);
      assert.equal(l.reduce((a, c) => a + c.horas_pendientes, 0), 1);
      assert.equal((await api('GET', `/api/cobros?desde=${dia(-9)}&hasta=${dia(-5)}`)).data.length, 0);
    });
    await prueba('resumen: semana, mes, a pagar por empleado y pendientes', async () => {
      const r = (await api('GET', '/api/ganancias/resumen')).data;
      assert.equal(r.semana.total, 144000);
      assert.equal(r.semana.pagos_empleados, 16000);
      assert.equal(r.semana.gastos, 5000);
      assert.equal(r.semana.ganancia, 123000);
      assert.equal(r.mes.total, 144000);
      assert.equal(r.a_pagar.find((e) => e.empleado_id === emp.id).neto, 16000 - 6000);
      assert.equal(r.dias.length, 7);
      assert.equal(r.dias.find((d) => d.dia === dia(0)).total, 144000);
      assert.equal(r.horas_pendientes, 1);
    });
    await prueba('un cobro anulado deja de contar', async () => {
      await api('POST', `/api/cobros/${c1.id}/anular`, {});
      assert.equal((await api('GET', '/api/ganancias/resumen')).data.semana.total, 104000);
    });
  } finally { cerrar('Ganancias'); }
})();