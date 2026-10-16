// Borra los datos de uso (cobros, turnos, clientas, movimientos, cierres e historial de cambios).
// Conserva la carta de servicios y precios, el personal y el usuario. Antes hace una copia en data/backups.
// Uso:  npm run limpiar            -> muestra lo que borraría
//       npm run limpiar -- --confirmar   -> borra
const path = require('path');
const { db, DATA_DIR } = require('../src/db');

const ORDEN = ['turno_servicio', 'turno', 'movimiento', 'cierre_empleado', 'cierre', 'liquidacion', 'cliente', 'auditoria'];
const existentes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name));
const tablas = ORDEN.filter((t) => existentes.has(t));
const cuenta = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;

console.log('Se borrarían:');
for (const t of tablas) console.log(`  ${t}: ${cuenta(t)} filas`);

if (!process.argv.includes('--confirmar')) {
  console.log('\nNo se borró nada. Para borrar de verdad:  npm run limpiar -- --confirmar');
  process.exit(0);
}

const copia = path.join(DATA_DIR, 'backups', `antes-de-limpiar-${Date.now()}.db`);
db.exec(`VACUUM INTO '${copia.replace(/'/g, "''")}'`);
db.transaction(() => {
  for (const t of tablas) db.exec(`DELETE FROM ${t}`);
  if (existentes.has('sqlite_sequence')) db.exec(`DELETE FROM sqlite_sequence WHERE name IN (${tablas.map((t) => `'${t}'`).join(',')})`);
})();
console.log(`\nListo. Copia de lo anterior: ${copia}`);
for (const t of tablas) console.log(`  ${t}: ${cuenta(t)} filas`);