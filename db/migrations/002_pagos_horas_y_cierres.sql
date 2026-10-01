-- 1) Pago al empleado por categoría: porcentaje del precio, o valor por hora
CREATE TABLE pago_empleado (
  empleado_id INTEGER NOT NULL REFERENCES empleado(id),
  categoria TEXT NOT NULL CHECK (categoria IN ('corte','color','nutri','otro')),
  modo TEXT NOT NULL CHECK (modo IN ('porcentaje','hora')),
  valor REAL NOT NULL CHECK (valor >= 0),   -- % (0-100) o $ por hora
  PRIMARY KEY (empleado_id, categoria)
);
INSERT INTO pago_empleado(empleado_id, categoria, modo, valor)
  SELECT empleado_id, categoria,
         CASE WHEN categoria = 'color' THEN 'hora' ELSE 'porcentaje' END,
         CASE WHEN categoria = 'color' THEN 0 ELSE pct END
  FROM comision_categoria;
DROP TABLE comision_categoria;

-- 2) Cada servicio cobrado guarda cómo se calculó el pago (snapshot) y las horas
ALTER TABLE turno_servicio RENAME COLUMN comision_pct TO pago_valor;
ALTER TABLE turno_servicio RENAME COLUMN comision_monto TO pago_monto;
ALTER TABLE turno_servicio ADD COLUMN pago_modo TEXT;   -- 'porcentaje' | 'hora' | NULL (sin empleado)
ALTER TABLE turno_servicio ADD COLUMN horas REAL;       -- horas reales (color)
UPDATE turno_servicio SET pago_modo = 'porcentaje' WHERE empleado_id IS NOT NULL;

-- 3) Duración promedio solo como información (texto, ej. "3 a 5 hs")
ALTER TABLE servicio ADD COLUMN duracion_texto TEXT;

-- 4) Movimientos de dinero: adelantos al empleado, gastos y retiros
CREATE TABLE movimiento (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  tipo TEXT NOT NULL CHECK (tipo IN ('adelanto','gasto','retiro')),
  empleado_id INTEGER REFERENCES empleado(id),   -- obligatorio en adelanto
  monto INTEGER NOT NULL CHECK (monto > 0),
  concepto TEXT,
  cierre_id INTEGER,
  anulado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_mov_cierre ON movimiento(cierre_id);

-- 5) Cierres de caja (cuando se quiera)
CREATE TABLE cierre (
  id INTEGER PRIMARY KEY,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  desde TEXT,
  hasta TEXT NOT NULL,
  cantidad_cobros INTEGER NOT NULL,
  total_cobrado INTEGER NOT NULL,
  pagos_empleados INTEGER NOT NULL,
  gastos INTEGER NOT NULL,
  retiros INTEGER NOT NULL,
  ganancia_local INTEGER NOT NULL,
  nota TEXT,
  anulado INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE cierre_empleado (
  cierre_id INTEGER NOT NULL REFERENCES cierre(id),
  empleado_id INTEGER NOT NULL REFERENCES empleado(id),
  por_porcentaje INTEGER NOT NULL,
  por_horas INTEGER NOT NULL,
  pago_total INTEGER NOT NULL,
  adelantos INTEGER NOT NULL,
  neto INTEGER NOT NULL,                 -- pago_total - adelantos
  PRIMARY KEY (cierre_id, empleado_id)
);

ALTER TABLE turno ADD COLUMN cierre_id INTEGER REFERENCES cierre(id);
CREATE INDEX idx_turno_cierre ON turno(cierre_id);