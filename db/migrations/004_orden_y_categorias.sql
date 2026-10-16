-- Orden manual de servicios y opciones (ABM de la carta)
ALTER TABLE servicio ADD COLUMN orden INTEGER;
ALTER TABLE servicio_variante ADD COLUMN orden INTEGER;
UPDATE servicio SET orden = id WHERE orden IS NULL;
UPDATE servicio_variante SET orden = id WHERE orden IS NULL;
-- Categorías (niveles) disponibles para las opciones de un servicio, en orden
INSERT OR IGNORE INTO config(clave, valor) VALUES ('niveles', '["Básico","Plus","Premium"]');