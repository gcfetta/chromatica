// Pruebas de cobros: descuento, seña, pago por % (corte) y por hora (color)
const assert = require('node:assert/strict');
const { iniciar } = require('./helper');

(async () => {
  const { api, prueba, entrar, cerrar } = await iniciar();
  console.log('Cobros y pago al empleado');
  try {
    await prueba('sin login, las rutas dan 401', async () => {
      assert.equal((await api('GET', '/api/cobros/1')).status, 401);
    });
    const { vid } = await entrar();
    const CORTE = vid('Corte completo (cabello largo)');
    const BABY = vid('Babylights', 'Plus · Hasta media espalda');
    const RITUAL = vid('Ritual CHROMATICA de 5 pasos', 'XS/S');

    let emp;
    await prueba('empleado nuevo: corte 40%, color por hora (sin configurar), nutri/otro 40%', async () => {
      emp = (await api('POST', '/api/empleados', { nombre: 'Peluquero' })).data;
      assert.deepEqual(emp.pagos.corte, { modo: 'porcentaje', valor: 40 });
      assert.deepEqual(emp.pagos.color, { modo: 'hora', valor: 0 });
      assert.deepEqual(emp.pagos.nutri, { modo: 'porcentaje', valor: 40 });
    });

    await prueba('editar el valor por hora de color y el % de corte', async () => {
      const r = await api('PUT', `/api/empleados/${emp.id}`, { pagos: { color: { valor: 8000 }, corte: { valor: 45 } } });
      assert.deepEqual(r.data.pagos.color, { modo: 'hora', valor: 8000 });
      assert.deepEqual(r.data.pagos.corte, { modo: 'porcentaje', valor: 45 });
      await api('PUT', `/api/empleados/${emp.id}`, { pagos: { corte: { valor: 40 } } });
      assert.equal((await api('PUT', `/api/empleados/${emp.id}`, { pagos: { corte: { valor: 150 } } })).status, 400);
    });

    let c1;
    await prueba('cobro en efectivo: descuento 20% en color y otro; corte sin descuento y con 40% para el empleado', async () => {
      const r = await api('POST', '/api/cobros', {
        metodo_cobro: 'efectivo', sena: true,
        servicios: [{ variante_id: CORTE }, { variante_id: BABY }, { categoria: 'otro', descripcion: 'Peinado', monto: 30000 }],
      });
      assert.equal(r.status, 201);
      c1 = r.data;
      const [corte, baby, otro] = c1.servicios;
      assert.equal(corte.precio_cobrado, 40000);
      assert.equal(corte.empleado_id, emp.id, 'el corte se asigna solo al único empleado');
      assert.equal(corte.pago_monto, 16000);
      assert.equal(baby.precio_cobrado, 104000);
      assert.equal(baby.empleado_id, null);
      assert.equal(baby.pago_monto, 0);
      assert.equal(otro.precio_cobrado, 24000);
      assert.equal(c1.total, 168000);
      assert.equal(c1.sena, 10000);
      assert.equal(c1.saldo, 158000);
      assert.equal(c1.pago_empleados, 16000);
    });

    await prueba('con tarjeta no hay descuento', async () => {
      const r = await api('POST', '/api/cobros', {
        metodo_cobro: 'tarjeta',
        servicios: [{ variante_id: CORTE }, { variante_id: BABY }, { categoria: 'otro', descripcion: 'Peinado', monto: 30000 }],
      });
      assert.equal(r.data.total, 200000);
    });

    await prueba('color por hora: horas cargadas al cobrar -> horas x valor de la hora', async () => {
      const r = await api('POST', '/api/cobros', {
        metodo_cobro: 'efectivo', servicios: [{ variante_id: BABY, empleado_id: emp.id, horas: 3.5 }],
      });
      const l = r.data.servicios[0];
      assert.equal(l.pago_modo, 'hora');
      assert.equal(l.horas, 3.5);
      assert.equal(l.pago_monto, 28000);
      assert.equal(r.data.horas_pendientes, 0);
    });

    let cPend;
    await prueba('color sin horas queda pendiente y se completa después', async () => {
      cPend = (await api('POST', '/api/cobros', {
        metodo_cobro: 'efectivo', servicios: [{ variante_id: BABY, empleado_id: emp.id }],
      })).data;
      assert.equal(cPend.horas_pendientes, 1);
      assert.equal(cPend.servicios[0].pago_monto, 0);
      const r = await api('PUT', `/api/cobros/${cPend.id}/servicios/${cPend.servicios[0].id}`, { horas: 2 });
      assert.equal(r.data.servicios[0].pago_monto, 16000);
      assert.equal(r.data.horas_pendientes, 0);
      assert.equal((await api('PUT', `/api/cobros/${cPend.id}/servicios/${cPend.servicios[0].id}`, { horas: 99 })).status, 400);
    });

    await prueba('nutri asociada al empleado usa su % sobre el precio final', async () => {
      const l = (await api('POST', '/api/cobros', {
        metodo_cobro: 'transferencia', servicios: [{ variante_id: RITUAL, empleado_id: emp.id }],
      })).data.servicios[0];
      assert.equal(l.precio_cobrado, 60000);
      assert.equal(l.pago_monto, 24000);
    });

    await prueba('cambiar % u hora después no altera cobros anteriores', async () => {
      await api('PUT', `/api/empleados/${emp.id}`, { pagos: { corte: { valor: 50 }, color: { valor: 10000 } } });
      assert.equal((await api('GET', `/api/cobros/${c1.id}`)).data.servicios[0].pago_monto, 16000);
      const n = (await api('POST', '/api/cobros', { metodo_cobro: 'efectivo', servicios: [{ variante_id: CORTE }] })).data;
      assert.equal(n.servicios[0].pago_monto, 20000);
      await api('PUT', `/api/empleados/${emp.id}`, { pagos: { corte: { valor: 40 }, color: { valor: 8000 } } });
    });

    await prueba('precio editado a mano queda marcado', async () => {
      const l = (await api('POST', '/api/cobros', { metodo_cobro: 'efectivo', servicios: [{ variante_id: BABY, precio_cobrado: 90000 }] })).data.servicios[0];
      assert.equal(l.editado, 1);
      assert.equal(l.precio_cobrado, 90000);
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
      r = await api('PATCH', `/api/cobros/${c1.id}`, { cliente_id: null, ficha: null });
      assert.equal(r.data.cliente, null);
      await api('PATCH', `/api/cobros/${c1.id}`, { cliente_id: cl.id });
      assert.equal((await api('GET', `/api/clientes/${cl.id}`)).data.historial.length, 3);
      assert.equal((await api('GET', '/api/clientes?q=sof')).data.length, 1);
    });

    await prueba('anular: no se borra y no se puede seguir editando', async () => {
      assert.equal((await api('POST', `/api/cobros/${c1.id}/anular`, { motivo: 'Error de carga' })).data.anulado, 1);
      assert.equal((await api('POST', `/api/cobros/${c1.id}/anular`)).status, 409);
      assert.equal((await api('PATCH', `/api/cobros/${c1.id}`, { ficha: 'x' })).status, 409);
      assert.equal((await api('GET', `/api/cobros/${c1.id}`)).status, 200);
    });

    await prueba('el catálogo trae la duración promedio como texto informativo', async () => {
      const s = (await api('GET', '/api/servicios')).data.find((x) => x.nombre === 'Babylights');
      assert.equal(s.duracion_texto, '3 a 5 hs');
    });
  } finally { cerrar('Cobros'); }
})();