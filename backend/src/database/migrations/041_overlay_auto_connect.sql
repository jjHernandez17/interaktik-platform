-- Interruptor "conectar overlays automaticamente". Encendido por defecto: asi se comportaba la plataforma antes de que
-- existiera el interruptor, y las cuentas actuales no cambian nada.
ALTER TABLE overlay_config ADD COLUMN IF NOT EXISTS auto_connect BOOLEAN NOT NULL DEFAULT true;
