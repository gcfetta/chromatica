CREATE TABLE usuario (
  id INTEGER PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  mail_recuperacion TEXT NOT NULL
);

CREATE TABLE cliente (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  contacto TEXT,
  ficha TEXT,
  observacion TEXT,
  notas_importantes TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE empleado (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1
);

-- % de comisión de cada empleado por categoría
CREATE TABLE comision_categoria (
  empleado_id INTEGER NOT NULL REFERENCES empleado(id),
  categoria TEXT NOT NULL CHECK (categoria IN ('corte','color','nutri','otro')),
  pct REAL NOT NULL,
  PRIMARY KEY (empleado_id, categoria)
);

CREATE TABLE servicio (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL CHECK (categoria IN ('corte','color','nutri')),
  grupo TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE servicio_variante (
  id INTEGER PRIMARY KEY,
  servicio_id INTEGER NOT NULL REFERENCES servicio(id),
  etiqueta TEXT NOT NULL,
  precio_tarjeta INTEGER NOT NULL,   -- cortes: igual a precio_efectivo
  precio_efectivo INTEGER NOT NULL,  -- efectivo y transferencia
  duracion_min INTEGER,
  precio_desde INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (servicio_id, etiqueta)
);

-- Un "turno" se crea al cobrar. La clienta es opcional.
CREATE TABLE turno (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER REFERENCES cliente(id),
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  metodo_cobro TEXT NOT NULL CHECK (metodo_cobro IN ('efectivo','transferencia','tarjeta')),
  total INTEGER NOT NULL,            -- suma de servicios, sin restar la seña
  sena INTEGER NOT NULL DEFAULT 0,   -- saldo cobrado = total - sena
  ficha TEXT,
  notas TEXT,
  anulado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_turno_fecha ON turno(fecha);
CREATE INDEX idx_turno_cliente ON turno(cliente_id);

CREATE TABLE turno_servicio (
  id INTEGER PRIMARY KEY,
  turno_id INTEGER NOT NULL REFERENCES turno(id),
  variante_id INTEGER REFERENCES servicio_variante(id),   -- NULL en "Otro"
  categoria TEXT NOT NULL CHECK (categoria IN ('corte','color','nutri','otro')),
  recorrido TEXT NOT NULL,           -- ej: Color › Babylights › Plus › Hasta media espalda
  empleado_id INTEGER REFERENCES empleado(id),
  precio_lista INTEGER NOT NULL,
  precio_cobrado INTEGER NOT NULL,
  editado INTEGER NOT NULL DEFAULT 0,
  comision_pct REAL NOT NULL DEFAULT 0,      -- snapshot al guardar
  comision_monto INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_ts_turno ON turno_servicio(turno_id);

CREATE TABLE liquidacion (
  id INTEGER PRIMARY KEY,
  empleado_id INTEGER NOT NULL REFERENCES empleado(id),
  semana_inicio TEXT NOT NULL,       -- lunes, YYYY-MM-DD
  monto INTEGER NOT NULL,
  fecha_pago TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (empleado_id, semana_inicio)
);

CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  entidad TEXT NOT NULL,
  entidad_id INTEGER,
  accion TEXT NOT NULL,
  detalle TEXT
);

CREATE TABLE config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
INSERT INTO config(clave, valor) VALUES
  ('descuento_efectivo_pct', '20'),
  ('sena_default', '10000'),
  ('comision_default_pct', '40');