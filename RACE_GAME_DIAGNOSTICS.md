# Diagnóstico - Carrera de Colegas - Error 500

## Problema Actual
Cuando agregas un participante, el servidor retorna HTTP 500 al intentar guardar en la BD.

## ✅ Cambios Ya Realizados

### 1. Mejor Error Logging en server.js (POST /api/race/state)
Ahora el servidor loguea detalles más específicos:
- ❌ `[Race] ERROR SAVING RACE STATE`
- `Error message:` (mensaje de error)
- `Error code:` (código de error PostgreSQL)
- `Error detail:` (detalle del error)
- `Error hint:` (sugerencia del error)
- `Full stack:` (stack trace completo)

## 🔍 Paso a Paso para Diagnosticar

### 1. Reinicia el servidor
```bash
npm start
```

Observa los logs iniciales. Deberías ver:
```
Servidor listo en http://localhost:3000
```

### 2. Inicia sesión en la aplicación

### 3. Ve a http://localhost:3000/race

### 4. Intenta agregar un participante
Ingresa un nombre y haz clic en "Agregar (+)"

### 5. Observa los logs en la TERMINAL del servidor

Busca mensajes que empiecen con `[Race]`. Deberías ver:

**Si funciona:**
```
[Race] Saving state for user 1: { participantCount: 1, historyCount: 0 }
[Race] ✅ Saved state for user 1, updated_at: 2026-05-04T...
```

**Si hay error:**
```
[Race] ❌ ERROR SAVING RACE STATE
[Race] Error message: [AQUÍ ESTARÁ EL ERROR]
[Race] Error code: [CÓDIGO DE ERROR - p.ej. "23503" = constraint violation]
[Race] Error detail: [DETALLES DEL ERROR]
[Race] Error hint: [SUGERENCIA]
```

## Errores Comunes y Soluciones

### ❌ Error Code 23503 (Foreign Key Constraint)
**Mensaje:** `insert or update on table "race_game_state" violates foreign key constraint`

**Solución:** 
- El `user_id` no existe en la tabla `app_users`
- Ejecuta en PostgreSQL: `SELECT id FROM app_users;`
- Verifica que el usuario loguead exista

### ❌ Error: "relation 'race_game_state' does not exist"
**Solución:**
- La tabla NO se creó en el bootstrap
- El servidor debe haber fallado al iniciar
- Ejecuta manualmente en PostgreSQL:
```sql
CREATE TABLE IF NOT EXISTS race_game_state (
  user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  car_positions JSONB NOT NULL DEFAULT '{}'::jsonb,
  finish_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  viewer_bindings JSONB NOT NULL DEFAULT '{}'::jsonb,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_race_game_state_updated_at ON race_game_state (updated_at DESC);
```

### ❌ Error: JSON/JSONB encoding error
**Solución:**
- Problemas al serializar los datos de participantes
- Las imágenes base64 pueden ser muy grandes
- Limitación: máx 500KB por avatarData en sanitizeRaceParticipant()

## Script de Verificación Manual en PostgreSQL

Ejecuta esto en tu cliente PostgreSQL para verificar todo:

```sql
-- 1. Verificar que la tabla existe
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'race_game_state';

-- 2. Ver estructura de la tabla
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'race_game_state' ORDER BY ordinal_position;

-- 3. Verificar que existe al menos un usuario
SELECT id, name, email FROM app_users LIMIT 5;

-- 4. Intentar insertar datos de prueba (reemplaza 1 con tu user_id)
INSERT INTO race_game_state (
  user_id, 
  participants, 
  car_positions, 
  finish_counts, 
  viewer_bindings, 
  history
) VALUES (
  1,
  '[{"id":"test-1","name":"Test","carNumber":1}]'::jsonb,
  '{"test-1":0}'::jsonb,
  '{"test-1":0}'::jsonb,
  '{}'::jsonb,
  '["test"]'::jsonb
) ON CONFLICT (user_id) 
DO UPDATE SET participants = EXCLUDED.participants
RETURNING *;

-- 5. Ver los datos guardados
SELECT * FROM race_game_state WHERE user_id = 1;
```

## Próximos Pasos

### Si ves `✅ Saved state`:
1. Recarga la página (F5)
2. Verifica que los datos reaparezcanen
3. ¡Funciona! El problema está resuelto

### Si ves `❌ ERROR SAVING RACE STATE`:
1. **Copia el error completo**
2. Comparte el contenido exacto de los logs
3. Incluye especialmente:
   - `Error message`
   - `Error code`
   - `Error detail`

## Monitoreo en Tiempo Real

Para monitorear los logs en tiempo real mientras agregas participantes:

**En Windows (PowerShell):**
```powershell
# En una terminal, inicia el servidor
npm start

# En otra terminal, puedes ver los logs en vivo mientras los generas
# Solo asegúrate de dejar visible la terminal donde está ejecutándose npm start
```

## Próximas Pruebas Si Todo Funciona

1. ✅ Agregar múltiples participantes
2. ✅ Cargar imágenes de avatares pequeñas (< 100KB)
3. ✅ Recarga la página
4. ✅ Todos los datos deberían reaparecer
