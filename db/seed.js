const { db } = require('../src/db');

const DESC = Number(db.prepare("SELECT valor FROM config WHERE clave='descuento_efectivo_pct'").get().valor);
const efectivoDe = (lista) => Math.round(lista * (100 - DESC) / 100);

const insServ = db.prepare('INSERT OR IGNORE INTO servicio(nombre, categoria, grupo) VALUES (?,?,?)');
const getServ = db.prepare('SELECT id FROM servicio WHERE nombre = ?');
const insVar = db.prepare(`INSERT OR IGNORE INTO servicio_variante
  (servicio_id, etiqueta, precio_tarjeta, precio_efectivo, duracion_min, precio_desde) VALUES (?,?,?,?,?,?)`);

// variantes: [etiqueta, precio, opciones]
// color/nutri: precio = lista (tarjeta), efectivo = lista - descuento
// corte: precio fijo, igual en cualquier método de pago
function add(nombre, categoria, grupo, variantes, dur = null) {
  insServ.run(nombre, categoria, grupo);
  const { id } = getServ.get(nombre);
  for (const [etiqueta, precio, opt = {}] of variantes) {
    const esCorte = categoria === 'corte';
    insVar.run(id, etiqueta, precio, esCorte ? precio : efectivoDe(precio),
      opt.dur ?? dur, opt.desde ? 1 : 0);
  }
}

const LARGOS3 = ['Sobre los hombros', 'Hasta media espalda', 'XL/XXL/XXXL'];
const LARGOS2 = ['Hasta media espalda', 'XL/XXL/XXXL'];
const TALLES8 = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const TALLES6 = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const niveles = (nivel, etiquetas, precios) => etiquetas.map((e, i) => [`${nivel} · ${e}`, precios[i]]);

db.transaction(() => {
  // ---- MECHAS ----
  add('Mechas en cabello corto', 'color', 'Mechas', [['Plus', 80000], ['Premium', 160000]], 240);
  const mechas2 = (n, dur, p) => add(n, 'color', 'Mechas', [
    ...niveles('Plus', LARGOS2, p.slice(0, 2)), ...niveles('Premium', LARGOS2, p.slice(2))], dur);
  mechas2('Babylights', 300, [130000, 160000, 260000, 320000]);
  mechas2('Teasylights', 360, [185000, 215000, 370000, 430000]);
  mechas2('Foilayage', 540, [250000, 300000, 500000, 600000]);
  mechas2('Saturación de mechas', 540, [250000, 300000, 500000, 600000]);
  mechas2('Desgaste', 540, [300000, 350000, 600000, 700000]);
  const mechas3 = (n, dur, p) => add(n, 'color', 'Mechas', [
    ...niveles('Plus', LARGOS3, p.slice(0, 3)), ...niveles('Premium', LARGOS3, p.slice(3))], dur);
  mechas3('Frontlights', 240, [50000, 65000, 75000, 100000, 130000, 150000]);
  mechas3('Underlights', 360, [75000, 85000, 100000, 150000, 170000, 200000]);
  mechas3('Full-contouring', 360, [90000, 110000, 130000, 180000, 220000, 260000]);

  const porTalle = (n, dur, basico, plus, premium) => add(n, 'color', 'Mechas', [
    ['Básico · XXS', basico],
    ...niveles('Plus', TALLES8, plus), ...niveles('Premium', TALLES8, premium)], dur);
  porTalle('Split', 480, 35000,
    [40000, 50000, 85000, 100000, 120000, 150000, 170000, 200000],
    [80000, 100000, 170000, 200000, 240000, 300000, 340000, 400000]);
  porTalle('Deco global', 480, 45000,
    [50000, 80000, 110000, 160000, 200000, 250000, 300000, 350000],
    [100000, 160000, 220000, 320000, 400000, 500000, 600000, 700000]);

  // ---- RETOQUES DECO ----
  const retoque = (n, p, colorEtiquetas, colorPrecios) => {
    add(`Retoque deco · Crecimiento ${n}`, 'color', 'Retoques deco', [
      ['Plus · hasta 2cm', p[0]], ['Premium · hasta 2cm', p[1]],
      ['Plus · hasta 6cm', p[2]], ['Premium · hasta 6cm', p[3]]]);
    add(`Retoque deco · Color después de deco ${n}`, 'color', 'Retoques deco',
      colorEtiquetas.map((e, i) => [e, colorPrecios[i]]));
  };
  retoque('Frontlights', [30000, 60000, 40000, 80000], LARGOS3, [10000, 20000, 30000]);
  retoque('Underlights', [35000, 70000, 50000, 100000], LARGOS3, [20000, 30000, 40000]);
  retoque('Full-contouring', [45000, 90000, 60000, 120000], LARGOS3, [25000, 35000, 50000]);
  retoque('Split', [40000, 80000, 55000, 110000], TALLES6, [25000, 40000, 50000, 80000, 100000, 120000]);
  retoque('Deco global', [65000, 130000, 80000, 160000], TALLES6, [25000, 70000, 100000, 150000, 180000, 220000]);

  // ---- COLORACIONES (sin decoloración) ----
  add('Raíces (sólo color)', 'color', 'Coloraciones', [['Hasta 2cm', 65000], ['Hasta 6cm', 80000]]);
  add('Baño de luz', 'color', 'Coloraciones', [
    ['XXS', 45000], ['XS-S', 65000], ['M', 75000], ['L-XL', 85000], ['XXL', 100000]]);
  add('Corrección con tinte', 'color', 'Coloraciones', [['Desde', 50000, { desde: true }]]);
  add('Color global', 'color', 'Coloraciones',
    TALLES8.map((t, i) => [t, [50000, 65000, 80000, 100000, 130000, 160000, 180000, 200000][i]]));
  add('Hair tattoo (extra)', 'color', 'Coloraciones', [['Desde', 20000, { desde: true }]]);

  // ---- TRATAMIENTOS ----
  const T5 = ['XS/S', 'M', 'L', 'XL', 'XXL'];
  add('Ritual CHROMATICA de 5 pasos', 'nutri', 'Tratamientos',
    T5.map((t, i) => [t, [75000, 85000, 95000, 105000, 115000][i]]));
  add('Tratamiento C-Plex de 3 pasos', 'nutri', 'Tratamientos',
    T5.map((t, i) => [t, [55000, 65000, 75000, 85000, 95000][i]]));
  add('Bomba Nutritiva HAIRSSIME', 'nutri', 'Tratamientos', [['Único', 65000]]);
  add('Máscara HAIRSSIME', 'nutri', 'Tratamientos', [['Único', 50000]]);
  add('Concentrado HAIRSSIME', 'nutri', 'Tratamientos', [['Único', 50000]]);
  add('Ampolla Semi di Lino ALFAPARF', 'nutri', 'Tratamientos', [['1 ampolla', 50000], ['2 ampollas', 85000]]);

  // ---- CORTES (precio fijo) ----
  add('Corte tipo barbería o cortos clásicos', 'corte', 'Cortes', [['Único', 26000]]);
  add('Mantenimiento barbería o cortos clásicos', 'corte', 'Cortes', [['Único', 23000]]);
  add('Extra barba (clásicos)', 'corte', 'Cortes', [['Único', 4000]]);
  add('Corte corto de diseño/vanguardia', 'corte', 'Cortes', [['Único', 30000]]);
  add('Mantenimiento corte de diseño/vanguardia', 'corte', 'Cortes', [['Único', 23000]]);
  add('Extra barba (diseño)', 'corte', 'Cortes', [['Único', 2000]]);
  add('Corte completo (cabello largo)', 'corte', 'Cortes', [['Único', 40000]]);
  add('Mantenimiento de cortes largos', 'corte', 'Cortes', [['Único', 32000]]);
  add('Face framing', 'corte', 'Cortes', [['Fleco + laterales', 18000]]);
  add('Detalles / turno corto', 'corte', 'Cortes', [['Sólo fleco o sólo retoque de costado', 15000]]);
})();

// ---- Duración promedio (solo informativa, se muestra en letra chica al elegir) ----
const DURACIONES = {
  'Mechas en cabello corto': 'aprox 4 hs', 'Babylights': '3 a 5 hs', 'Teasylights': '4 a 6 hs',
  'Foilayage': '6 a 9 hs', 'Saturación de mechas': '6 a 9 hs', 'Desgaste': '6 a 9 hs',
  'Frontlights': '2 a 4 hs', 'Underlights': '3 a 6 hs', 'Full-contouring': '4 a 6 hs',
  'Split': '4 a 8 hs', 'Deco global': '6 a 8 hs',
};
const updDur = db.prepare('UPDATE servicio SET duracion_texto = ? WHERE nombre = ?');
for (const [nombre, txt] of Object.entries(DURACIONES)) updDur.run(txt, nombre);

const n = db.prepare('SELECT COUNT(*) c FROM servicio').get().c;
const v = db.prepare('SELECT COUNT(*) c FROM servicio_variante').get().c;
console.log(`Seed OK: ${n} servicios, ${v} variantes`);