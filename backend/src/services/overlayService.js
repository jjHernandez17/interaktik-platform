const crypto = require('crypto');
const pool = require('../database/pool');
const { sanitizeOverlayState } = require('../utils/normalize');

function defaultOverlayState() {
  return {
    giftAlert: { enabled: true, durationSeconds: 5, minCoins: 0 },
    goalBar: { enabled: true, label: 'Meta de la transmisión', targetCoins: 500, currentCoins: 0 },
    topGifters: { enabled: true, title: 'Top Regaladores', maxEntries: 5, entries: [] },
    likeCounter: { enabled: true, label: 'Likes en vivo', totalLikes: 0 },
    topLikers: { enabled: true, title: 'Top Likes', maxEntries: 5, entries: [] },
  };
}

function generateOverlayKey() {
  return crypto.randomBytes(32).toString('hex');
}

async function getOrCreateOverlayConfig(userId) {
  const existing = await pool.query(
    'SELECT overlay_key, state, updated_at FROM overlay_config WHERE user_id = $1',
    [userId],
  );

  if (existing.rowCount > 0) {
    const row = existing.rows[0];
    return {
      overlayKey: row.overlay_key,
      state: sanitizeOverlayState(row.state || {}),
      updated_at: row.updated_at,
    };
  }

  const overlayKey = generateOverlayKey();
  const state = defaultOverlayState();

  const inserted = await pool.query(
    `INSERT INTO overlay_config (user_id, overlay_key, state, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING overlay_key, state, updated_at`,
    [userId, overlayKey, JSON.stringify(state)],
  );

  const row = inserted.rows[0];
  return {
    overlayKey: row.overlay_key,
    state: sanitizeOverlayState(row.state || {}),
    updated_at: row.updated_at,
  };
}

async function saveOverlayState(userId, nextState) {
  const normalized = sanitizeOverlayState(nextState);

  await getOrCreateOverlayConfig(userId);

  const result = await pool.query(
    `UPDATE overlay_config SET state = $2::jsonb, updated_at = NOW()
     WHERE user_id = $1
     RETURNING overlay_key, state, updated_at`,
    [userId, JSON.stringify(normalized)],
  );

  const row = result.rows[0];
  return {
    overlayKey: row.overlay_key,
    state: sanitizeOverlayState(row.state || {}),
    updated_at: row.updated_at,
  };
}

async function regenerateOverlayKey(userId) {
  await getOrCreateOverlayConfig(userId);

  const overlayKey = generateOverlayKey();
  const result = await pool.query(
    `UPDATE overlay_config SET overlay_key = $2, updated_at = NOW()
     WHERE user_id = $1
     RETURNING overlay_key, state, updated_at`,
    [userId, overlayKey],
  );

  const row = result.rows[0];
  return {
    overlayKey: row.overlay_key,
    state: sanitizeOverlayState(row.state || {}),
    updated_at: row.updated_at,
  };
}

// Suma monedas al progreso de la barra de meta de forma atomica (un solo
// UPDATE con jsonb_set, sin leer-modificar-escribir desde Node) — asi no se
// pierden incrementos si llegan dos regalos casi al mismo tiempo. Se fusiona
// con lo que ya hubiera en goalBar (o crea la clave si el registro es de
// antes de que existiera este overlay) para no pisar enabled/label/targetCoins.
async function incrementGoalBarCoins(userId, coins) {
  const cleanCoins = Math.max(0, Math.round(Number(coins) || 0));
  if (cleanCoins <= 0) return null;

  const result = await pool.query(
    `UPDATE overlay_config
     SET state = jsonb_set(
       state,
       '{goalBar}',
       COALESCE(state->'goalBar', '{}'::jsonb) || jsonb_build_object(
         'currentCoins', COALESCE((state->'goalBar'->>'currentCoins')::numeric, 0) + $2::numeric
       ),
       true
     ),
     updated_at = NOW()
     WHERE user_id = $1
     RETURNING overlay_key, state, updated_at`,
    [userId, cleanCoins],
  );

  if (result.rowCount === 0) return null;

  const row = result.rows[0];
  return {
    overlayKey: row.overlay_key,
    state: sanitizeOverlayState(row.state || {}),
    updated_at: row.updated_at,
  };
}

async function resetGoalBar(userId) {
  await getOrCreateOverlayConfig(userId);

  const result = await pool.query(
    `UPDATE overlay_config
     SET state = jsonb_set(
       state,
       '{goalBar}',
       COALESCE(state->'goalBar', '{}'::jsonb) || '{"currentCoins": 0}'::jsonb,
       true
     ),
     updated_at = NOW()
     WHERE user_id = $1
     RETURNING overlay_key, state, updated_at`,
    [userId],
  );

  const row = result.rows[0];
  return {
    overlayKey: row.overlay_key,
    state: sanitizeOverlayState(row.state || {}),
    updated_at: row.updated_at,
  };
}

// A diferencia de incrementGoalBarCoins (un solo numero, resoluble con
// jsonb_set atomico), mantener el top-N ordenado por regalador requiere
// leer, modificar en JS y volver a escribir — se hace dentro de una
// transaccion con SELECT ... FOR UPDATE para que dos regalos casi
// simultaneos no se pisen entre si.
async function incrementTopGifter(userId, user, coins) {
  const cleanCoins = Math.max(0, Math.round(Number(coins) || 0));
  if (cleanCoins <= 0) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT overlay_key, state FROM overlay_config WHERE user_id = $1 FOR UPDATE',
      [userId],
    );

    if (existing.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const state = sanitizeOverlayState(existing.rows[0].state || {});
    const entryKey = String(user?.uniqueId || user?.nickname || '').trim() || 'anonimo';
    const entries = state.topGifters.entries.slice();
    const existingIndex = entries.findIndex((entry) => entry.uniqueId === entryKey);

    if (existingIndex >= 0) {
      entries[existingIndex] = {
        ...entries[existingIndex],
        nickname: user?.nickname || entries[existingIndex].nickname,
        avatar: user?.avatar || entries[existingIndex].avatar,
        coins: entries[existingIndex].coins + cleanCoins,
      };
    } else {
      entries.push({
        uniqueId: entryKey,
        nickname: user?.nickname || entryKey,
        avatar: user?.avatar || null,
        coins: cleanCoins,
      });
    }

    entries.sort((a, b) => b.coins - a.coins);

    const nextState = {
      ...state,
      topGifters: { ...state.topGifters, entries: entries.slice(0, state.topGifters.maxEntries) },
    };

    const updated = await client.query(
      `UPDATE overlay_config SET state = $2::jsonb, updated_at = NOW()
       WHERE user_id = $1
       RETURNING overlay_key, state, updated_at`,
      [userId, JSON.stringify(nextState)],
    );

    await client.query('COMMIT');

    const row = updated.rows[0];
    return {
      overlayKey: row.overlay_key,
      state: sanitizeOverlayState(row.state || {}),
      updated_at: row.updated_at,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function resetTopGifters(userId) {
  await getOrCreateOverlayConfig(userId);

  const result = await pool.query(
    `UPDATE overlay_config
     SET state = jsonb_set(
       state,
       '{topGifters}',
       COALESCE(state->'topGifters', '{}'::jsonb) || '{"entries": []}'::jsonb,
       true
     ),
     updated_at = NOW()
     WHERE user_id = $1
     RETURNING overlay_key, state, updated_at`,
    [userId],
  );

  const row = result.rows[0];
  return {
    overlayKey: row.overlay_key,
    state: sanitizeOverlayState(row.state || {}),
    updated_at: row.updated_at,
  };
}

async function incrementLikeCounter(userId, likes) {
  const cleanLikes = Math.max(0, Math.round(Number(likes) || 0));
  if (cleanLikes <= 0) return null;

  const result = await pool.query(
    `UPDATE overlay_config
     SET state = jsonb_set(
       state,
       '{likeCounter}',
       COALESCE(state->'likeCounter', '{}'::jsonb) || jsonb_build_object(
         'totalLikes', COALESCE((state->'likeCounter'->>'totalLikes')::numeric, 0) + $2::numeric
       ),
       true
     ),
     updated_at = NOW()
     WHERE user_id = $1
     RETURNING overlay_key, state, updated_at`,
    [userId, cleanLikes],
  );

  if (result.rowCount === 0) return null;

  const row = result.rows[0];
  return {
    overlayKey: row.overlay_key,
    state: sanitizeOverlayState(row.state || {}),
    updated_at: row.updated_at,
  };
}

async function resetLikeCounter(userId) {
  await getOrCreateOverlayConfig(userId);

  const result = await pool.query(
    `UPDATE overlay_config
     SET state = jsonb_set(
       state,
       '{likeCounter}',
       COALESCE(state->'likeCounter', '{}'::jsonb) || '{"totalLikes": 0}'::jsonb,
       true
     ),
     updated_at = NOW()
     WHERE user_id = $1
     RETURNING overlay_key, state, updated_at`,
    [userId],
  );

  const row = result.rows[0];
  return {
    overlayKey: row.overlay_key,
    state: sanitizeOverlayState(row.state || {}),
    updated_at: row.updated_at,
  };
}

// Mismo patron que incrementTopGifter: requiere leer, modificar en JS y
// volver a escribir para mantener el top-N ordenado, asi que se hace dentro
// de una transaccion con SELECT ... FOR UPDATE.
async function incrementTopLiker(userId, user, likes) {
  const cleanLikes = Math.max(0, Math.round(Number(likes) || 0));
  if (cleanLikes <= 0) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT overlay_key, state FROM overlay_config WHERE user_id = $1 FOR UPDATE',
      [userId],
    );

    if (existing.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const state = sanitizeOverlayState(existing.rows[0].state || {});
    const entryKey = String(user?.uniqueId || user?.nickname || '').trim() || 'anonimo';
    const entries = state.topLikers.entries.slice();
    const existingIndex = entries.findIndex((entry) => entry.uniqueId === entryKey);

    if (existingIndex >= 0) {
      entries[existingIndex] = {
        ...entries[existingIndex],
        nickname: user?.nickname || entries[existingIndex].nickname,
        avatar: user?.avatar || entries[existingIndex].avatar,
        likes: entries[existingIndex].likes + cleanLikes,
      };
    } else {
      entries.push({
        uniqueId: entryKey,
        nickname: user?.nickname || entryKey,
        avatar: user?.avatar || null,
        likes: cleanLikes,
      });
    }

    entries.sort((a, b) => b.likes - a.likes);

    const nextState = {
      ...state,
      topLikers: { ...state.topLikers, entries: entries.slice(0, state.topLikers.maxEntries) },
    };

    const updated = await client.query(
      `UPDATE overlay_config SET state = $2::jsonb, updated_at = NOW()
       WHERE user_id = $1
       RETURNING overlay_key, state, updated_at`,
      [userId, JSON.stringify(nextState)],
    );

    await client.query('COMMIT');

    const row = updated.rows[0];
    return {
      overlayKey: row.overlay_key,
      state: sanitizeOverlayState(row.state || {}),
      updated_at: row.updated_at,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function resetTopLikers(userId) {
  await getOrCreateOverlayConfig(userId);

  const result = await pool.query(
    `UPDATE overlay_config
     SET state = jsonb_set(
       state,
       '{topLikers}',
       COALESCE(state->'topLikers', '{}'::jsonb) || '{"entries": []}'::jsonb,
       true
     ),
     updated_at = NOW()
     WHERE user_id = $1
     RETURNING overlay_key, state, updated_at`,
    [userId],
  );

  const row = result.rows[0];
  return {
    overlayKey: row.overlay_key,
    state: sanitizeOverlayState(row.state || {}),
    updated_at: row.updated_at,
  };
}

async function resolveByOverlayKey(key) {
  const cleanKey = String(key || '').trim();
  if (!cleanKey) return null;

  const result = await pool.query(
    'SELECT user_id, state FROM overlay_config WHERE overlay_key = $1',
    [cleanKey],
  );

  if (result.rowCount === 0) return null;

  return {
    userId: result.rows[0].user_id,
    state: sanitizeOverlayState(result.rows[0].state || {}),
  };
}

module.exports = {
  getOrCreateOverlayConfig,
  saveOverlayState,
  regenerateOverlayKey,
  incrementGoalBarCoins,
  resetGoalBar,
  incrementTopGifter,
  resetTopGifters,
  incrementLikeCounter,
  resetLikeCounter,
  incrementTopLiker,
  resetTopLikers,
  resolveByOverlayKey,
};
