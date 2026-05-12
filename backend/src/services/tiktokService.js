const pool = require('../database/pool');

async function saveTiktokConnection(userId, gameType, tiktokUsername) {
  const username = String(tiktokUsername || '').trim().replace(/^@/, '').slice(0, 120);

  const result = await pool.query(
    `INSERT INTO user_tiktok_connections (user_id, game_type, tiktok_username, is_linked, linked_at, created_at, updated_at)
     VALUES ($1, $2, $3, true, NOW(), NOW(), NOW())
     ON CONFLICT (user_id, game_type)
     DO UPDATE SET tiktok_username = EXCLUDED.tiktok_username, is_linked = true, linked_at = NOW(), updated_at = NOW()
     RETURNING tiktok_username, is_linked, linked_at`,
    [userId, gameType, username],
  );

  return result.rows[0];
}

async function getTiktokConnection(userId, gameType) {
  const result = await pool.query(
    `SELECT tiktok_username, is_linked, linked_at FROM user_tiktok_connections
     WHERE user_id = $1 AND game_type = $2`,
    [userId, gameType],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

async function deleteTiktokConnection(userId, gameType) {
  await pool.query(
    `DELETE FROM user_tiktok_connections WHERE user_id = $1 AND game_type = $2`,
    [userId, gameType],
  );
}

module.exports = {
  saveTiktokConnection,
  getTiktokConnection,
  deleteTiktokConnection,
};
