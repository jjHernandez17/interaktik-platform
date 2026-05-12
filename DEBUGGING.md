# Debugging Race Game State Persistence

## Cambios realizados ✅

1. **Mejor error handling en saveState()** - Ahora logs detallados
2. **Mejor error handling en loadState()** - Ahora logs detallados  
3. **Endpoints con validación userId** - Verifican que el usuario esté autenticado
4. **Endpoint `/api/race/debug`** - Para verificar el estado de la BD
5. **Logs [Race]** tagueados para fácil debugging

## PASOS PARA VALIDAR:

### 1. Reinicia el servidor:
```bash
npm start
```

### 2. Abre la consola del navegador (F12 → Console)

### 3. Ejecuta el comando de debug:
```javascript
fetch('/api/race/debug').then(r => r.json()).then(d => console.log(d))
```

### 4. Interpreta los resultados:

**Si ves esto:**
```json
{
  "table_exists": true,
  "user_id": 1,
  "data_found": false,
  "data": null
}
```
✅ **La tabla existe** pero NO hay datos guardados. Esto es normal si es la primera vez.

**Si ves esto:**
```json
{
  "table_exists": false,
  "error": "..."
}
```
❌ **La tabla NO existe** - El servidor debe haber fallado al inicializar. Revisa los logs del servidor.

### 5. Agrega un participante y observa los logs:

**En la consola del navegador (F12) deberías ver:**
```
[Race] Saved to localStorage
[Race] Server response status: 200
[Race] Successfully saved to database: { success: true, updated_at: ... }
```

**En los logs del servidor deberías ver:**
```
[Race] Saving state for user 1: { participantCount: 1, historyCount: 0 }
[Race] Saved state for user 1, updated_at: 2026-05-04T12:34:56.789Z
```

### 6. Recarga la página y verifica que aparecen los datos

**En la consola del navegador deberías ver:**
```
[Race] Load response status: 200
[Race] Loaded race state from database: { participants: [...], car_positions: {...}, ... }
```

**En los logs del servidor:**
```
[Race] Loading state for user 1
[Race] Loaded state for user 1: { participantCount: 1, historyCount: 0 }
```

## Si AÚN no funciona, ejecuta esto en la consola del servidor:

Conecta a PostgreSQL y verifica manualmente:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'race_game_state';

SELECT * FROM race_game_state;
```

Si la tabla NO existe, reinicia el servidor (debe crear la tabla en `bootstrapDatabase()`).

## Resumen de cambios en el código:

### server.js:
- ✅ Verificación de `userId` en ambos endpoints
- ✅ Logs detallados con `[Race]` prefix
- ✅ Manejo de errores mejorado con `error.message`
- ✅ Endpoint `/api/race/debug` para validar

### race.js:
- ✅ `saveState()`: logs de localStorage + fetch + respuesta del servidor
- ✅ `loadState()`: logs de fetch + fallback a localStorage
- ✅ Mejor manejo de errores JSON
