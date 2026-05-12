const pool = require('../database/pool');
const {
  normalizeColor,
  normalizeIsoDate,
  clampNumber,
  sanitizeGameState,
  isEmptyGameState,
} = require('../utils/normalize');

async function loadRelationalGameState(userId) {
  const [teamsResult, giftsResult, historyResult, metaResult] = await Promise.all([
    pool.query(
      `SELECT id, name, color, score FROM game_teams
       WHERE user_id = $1 ORDER BY position ASC`,
      [userId],
    ),
    pool.query(
      `SELECT id, gift_id AS "giftId", name, points, diamond_count AS "diamondCount", 
              image_url AS "imageUrl", team_id AS "teamId"
       FROM game_gift_rules WHERE user_id = $1 ORDER BY position ASC`,
      [userId],
    ),
    pool.query(
      `SELECT id, gift_name AS "giftName", points, team_id AS "teamId", team_name AS "teamName", 
              source, note, created_at AS "createdAt"
       FROM game_history_entries WHERE user_id = $1 ORDER BY position ASC`,
      [userId],
    ),
    pool.query('SELECT updated_at FROM game_state_meta WHERE user_id = $1', [userId]),
  ]);

  return {
    teams: teamsResult.rows,
    gifts: giftsResult.rows,
    history: historyResult.rows,
    updated_at: metaResult.rowCount > 0 ? metaResult.rows[0].updated_at : null,
  };
}

async function loadLegacyGameState(userId) {
  const legacy = await pool.query(
    'SELECT teams, gifts, history, updated_at FROM game_states WHERE user_id = $1',
    [userId],
  );

  if (legacy.rowCount === 0) {
    return null;
  }

  return sanitizeGameState(legacy.rows[0]);
}

async function saveRelationalGameState(client, userId, nextState) {
  const normalized = sanitizeGameState(nextState);

  await client.query('DELETE FROM game_history_entries WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM game_gift_rules WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM game_teams WHERE user_id = $1', [userId]);

  for (let index = 0; index < normalized.teams.length; index += 1) {
    const team = normalized.teams[index];
    await client.query(
      `INSERT INTO game_teams (user_id, id, name, color, score, position)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, team.id, team.name, team.color, team.score, index],
    );
  }

  for (let index = 0; index < normalized.gifts.length; index += 1) {
    const gift = normalized.gifts[index];
    await client.query(
      `INSERT INTO game_gift_rules (user_id, id, gift_id, name, points, diamond_count, image_url, team_id, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, gift.id, gift.giftId, gift.name, gift.points, gift.diamondCount, gift.imageUrl, gift.teamId, index],
    );
  }

  for (let index = 0; index < normalized.history.length; index += 1) {
    const entry = normalized.history[index];
    await client.query(
      `INSERT INTO game_history_entries (user_id, id, gift_name, points, team_id, team_name, source, note, created_at, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10)`,
      [userId, entry.id, entry.giftName, entry.points, entry.teamId, entry.teamName, entry.source, entry.note, entry.createdAt, index],
    );
  }

  const metaResult = await client.query(
    `INSERT INTO game_state_meta (user_id, updated_at)
     VALUES ($1, NOW())
     ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
     RETURNING updated_at`,
    [userId],
  );

  return {
    ...normalized,
    updated_at: metaResult.rows[0].updated_at,
  };
}

async function loadGameState(userId) {
  const relational = await loadRelationalGameState(userId);

  if (!isEmptyGameState(relational)) {
    return relational;
  }

  // Migrar estado legacy si existe
  const legacy = await loadLegacyGameState(userId);
  if (legacy && !isEmptyGameState(legacy)) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const migrated = await saveRelationalGameState(client, userId, legacy);
      await client.query('COMMIT');
      return migrated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return { teams: [], gifts: [], history: [], updated_at: null };
}

async function saveGameState(userId, nextState) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const saved = await saveRelationalGameState(client, userId, nextState);
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  loadGameState,
  saveGameState,
  loadRelationalGameState,
  loadLegacyGameState,
};
