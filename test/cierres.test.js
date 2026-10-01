// Pruebas de movimientos (adelantos, gastos, retiros) y cierre de caja cuando se quiera
const assert = require('node:assert/strict');
const { iniciar, dia } = require('./helper');

(async () => {
  const { api, prueba, entrar, cerrar } = await iniciar();
  console.log('Movimientos y cierre de caja');
  try {
    const { vid } = await entrar();
    const CORTE = vid('Corte completo (cabello largo)');
    const BABY = vid('Babylights', 'Plus · Hasta media espalda');
    const RAICES = vid('Raíces (sólo color)', 'Hasta 2cm');
    const emp = (await api('POST', '/api/empleados', { nombre: 'Peluquero', pagos: { color: { modo: 'hora', valor: 8000 } } })).data;
    const cobro = (b) => api('POST', '/api/cobros', { metodo_cobro: 'efectivo', ...b });
    const hoy = dia(0);

    await cobro({ servicios: [{ variante_id: CORTE }] });                                           // 40.000 -> pago 16.000
    await cobro({ servicios: [{ variante_id: BABY, empleado_id: emp.id, horas: 3 }] });            // 104.000 -> pago 24.000
    const pend = (await cobro({ servicios: [{ variante_id: RAICES, empleado_id: emp.id }] })).data; //  52.000 -> horas pendientes

    await prueba('movimientos: adelanto (con empleado), gasto y retiro; validaciones', async () => {
      assert.equal((await api('POST', '/api/movimientos', { tipo: 'adelanto', monto: 10000 })).status, 400);
      assert.equal((await api('POST', '/api/movimientos', { tipo: 'gasto', monto: -5 })).status, 400);
      assert.equal((await api('POST', '/api/movimientos', { tipo: 'adelanto', empleado_id: emp.id, monto: 10000, concepto: 'Adelanto' })).status, 201);
      assert.equal((await api('POST', '/api/movimientos', { tipo: 'gasto', monto: 5000, concepto: 'Insumos' })).status, 201);
      assert.equal((await api('POST', '/api/movimientos', { tipo: 'retiro', monto: 20000, concepto: 'Retiro dueña' })).status, 201);
      assert.equal((await api('GET', '/api/movimientos')).data.length, 3);
    });

    await prueba('editar y anular un movimiento antes del cierre', async () => {
      const m = (await api('POST', '/api/movimientos', { tipo: 'gasto', monto: 1000 })).data;
      assert.equal((await api('PUT', `/api/movimientos/${m.id}`, { monto: 1500, concepto: 'Corregido' })).data.monto, 1500);
      assert.equal((await api('POST', `/api/movimientos/${m.id}/anular`)).data.anulado, 1);
      assert.equal((await api('GET', '/api/movimientos')).data.length, 3);
    });

    await prueba('el cierre no se puede hacer si faltan horas de color', async () => {
      const r = await api('POST', '/api/cierres', { hasta: hoy });
      assert.equal(r.status, 409);
      assert.equal(r.data.pendientes.length, 1);
      assert.equal((await api('GET', `/api/cierres/previa?hasta=${hoy}`)).data.pendientes.length, 1);
    });

    await prueba('completar las horas pendientes', async () => {
      const r = await api('PUT', `/api/cobros/${pend.id}/servicios/${pend.servicios[0].id}`, { horas: 2 });
      assert.equal(r.data.servicios[0].pago_monto, 16000);
    });

    await prueba('vista previa del período: total, pagos, adelantos, gastos, retiros y ganancia de la pelu', async () => {
      const p = (await api('GET', `/api/cierres/previa?hasta=${hoy}`)).data;
      assert.equal(p.cantidad_cobros, 3);
      assert.equal(p.total_cobrado, 196000);
      assert.equal(p.pagos_empleados, 56000);
      assert.equal(p.gastos, 5000);
      assert.equal(p.retiros, 20000);
      assert.equal(p.ganancia_local, 135000);        // 196.000 - 56.000 - 5.000 (el retiro no es gasto)
      const e = p.por_empleado[0];
      assert.equal(e.por_porcentaje, 16000);
      assert.equal(e.por_horas, 40000);
      assert.equal(e.adelantos, 10000);
      assert.equal(e.neto, 46000);
      assert.equal(p.pendientes.length, 0);
    });

    await prueba('el período se elige: un cobro con fecha posterior queda afuera', async () => {
      await cobro({ servicios: [{ variante_id: CORTE }], fecha: `${dia(3)} 10:00` });
      const p = (await api('GET', `/api/cierres/previa?hasta=${hoy}`)).data;
      assert.equal(p.cantidad_cobros, 3);
      assert.equal((await api('GET', `/api/cierres/previa?hasta=${dia(-1)}`)).data.cantidad_cobros, 0);
    });

    let cierre;
    await prueba('cerrar la caja congela cobros y movimientos', async () => {
      const r = await api('POST', '/api/cierres', { hasta: hoy, nota: 'Semana corta' });
      assert.equal(r.status, 201);
      cierre = r.data;
      assert.equal(cierre.ganancia_local, 135000);
      const d = (await api('GET', `/api/cierres/${cierre.id}`)).data;
      assert.equal(d.historial.length, 3);
      assert.equal(d.movimientos.length, 3);
      assert.equal(d.por_empleado[0].neto, 46000);
      assert.equal((await api('GET', '/api/movimientos')).data.length, 0, 'ya no quedan movimientos abiertos');
      assert.equal((await api('GET', `/api/cierres/previa?hasta=${dia(5)}`)).data.cantidad_cobros, 1, 'queda solo el cobro futuro');
    });

    await prueba('lo cerrado no se puede tocar', async () => {
      assert.equal((await api('PUT', `/api/cobros/${pend.id}/servicios/${pend.servicios[0].id}`, { horas: 5 })).status, 409);
      assert.equal((await api('POST', `/api/cobros/${pend.id}/anular`)).status, 409);
      assert.equal((await api('PATCH', `/api/cobros/${pend.id}`, { ficha: 'x' })).status, 409);
      const mov = (await api('GET', '/api/movimientos?estado=todos')).data[0];
      assert.equal((await api('PUT', `/api/movimientos/${mov.id}`, { monto: 1 })).status, 409);
    });

    await prueba('anular el último cierre reabre todo para corregir', async () => {
      assert.equal((await api('POST', `/api/cierres/${cierre.id}/anular`, { motivo: 'Faltaba un adelanto' })).data.anulado, 1);
      assert.equal((await api('GET', `/api/cierres/previa?hasta=${hoy}`)).data.cantidad_cobros, 3);
      assert.equal((await api('PUT', `/api/cobros/${pend.id}/servicios/${pend.servicios[0].id}`, { horas: 2.5 })).data.servicios[0].pago_monto, 20000);
      await api('POST', '/api/movimientos', { tipo: 'adelanto', empleado_id: emp.id, monto: 5000 });
      const c2 = (await api('POST', '/api/cierres', { hasta: hoy })).data;
      assert.equal(c2.pagos_empleados, 60000);
      assert.equal(c2.ganancia_local, 196000 - 60000 - 5000);
      assert.equal((await api('POST', `/api/cierres/${cierre.id}/anular`)).status, 409);
    });

    await prueba('cobro cargado tarde con fecha anterior entra en el próximo cierre, sin perderse', async () => {
      await cobro({ servicios: [{ variante_id: CORTE }], fecha: `${dia(-2)} 11:00` });
      const p = (await api('GET', `/api/cierres/previa?hasta=${hoy}`)).data;
      assert.equal(p.cantidad_cobros, 1);
      assert.equal(p.total_cobrado, 40000);
    });

    await prueba('no se puede cerrar una caja vacía', async () => {
      assert.equal((await api('POST', '/api/cierres', { hasta: dia(-10) })).status, 400);
    });
  } finally { cerrar('Cierres'); }
})();