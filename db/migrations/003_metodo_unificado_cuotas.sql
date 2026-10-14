-- Efectivo y transferencia son lo mismo: se guarda como 'efectivo'
UPDATE turno SET metodo_cobro = 'efectivo' WHERE metodo_cobro = 'transferencia';

-- Pago con tarjeta: cantidad de cuotas elegida
ALTER TABLE turno ADD COLUMN cuotas INTEGER;

-- Cortes: Corto / Largo
ALTER TABLE servicio ADD COLUMN subgrupo TEXT;

INSERT OR IGNORE INTO config(clave, valor) VALUES ('cuotas_opciones', '1,3');