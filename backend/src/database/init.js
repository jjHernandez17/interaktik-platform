const pool = require('./pool');
const logger = require('../config/logger');

async function bootstrapDatabase() {
  logger.info('Initializing database...');

  try {
    // Tabla de usuarios
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(190) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Tabla legacy de estados de juego (JSONB)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_states (
        user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        teams JSONB NOT NULL DEFAULT '[]'::jsonb,
        gifts JSONB NOT NULL DEFAULT '[]'::jsonb,
        history JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Tabla de metadata de estado de juego
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_state_meta (
        user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Tabla de equipos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_teams (
        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        id VARCHAR(120) NOT NULL,
        name VARCHAR(120) NOT NULL,
        color CHAR(7) NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL,
        PRIMARY KEY (user_id, id)
      )
    `);

    // Tabla de reglas de regalos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_gift_rules (
        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        id VARCHAR(120) NOT NULL,
        gift_id VARCHAR(120),
        name VARCHAR(180) NOT NULL,
        points INTEGER NOT NULL DEFAULT 1,
        diamond_count INTEGER NOT NULL DEFAULT 1,
        image_url TEXT NOT NULL DEFAULT '',
        team_id VARCHAR(120),
        position INTEGER NOT NULL,
        PRIMARY KEY (user_id, id)
      )
    `);

    // Tabla de historial de juego
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_history_entries (
        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        id VARCHAR(120) NOT NULL,
        gift_name VARCHAR(180) NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        team_id VARCHAR(120),
        team_name VARCHAR(120) NOT NULL DEFAULT '',
        source VARCHAR(40) NOT NULL DEFAULT 'manual',
        note VARCHAR(400) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (user_id, id)
      )
    `);

    // Índices
    await pool.query('CREATE INDEX IF NOT EXISTS idx_game_teams_user_position ON game_teams (user_id, position)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_game_gift_rules_user_position ON game_gift_rules (user_id, position)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_game_history_entries_user_position ON game_history_entries (user_id, position)');

    // Tabla de catálogo de regalos por usuario
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_gift_catalog (
        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        gift_id VARCHAR(120) NOT NULL,
        name VARCHAR(180) NOT NULL,
        diamond_count INTEGER NOT NULL DEFAULT 1,
        image_url TEXT NOT NULL DEFAULT '',
        gift_type INTEGER,
        source_unique_id VARCHAR(120) NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, gift_id)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_gift_catalog_user_updated ON user_gift_catalog (user_id, updated_at DESC)');

    // Tabla de estado Snake vs Snake
    await pool.query(`
      CREATE TABLE IF NOT EXISTS snake_vs_snake_state (
        user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        settings JSONB NOT NULL DEFAULT '{"rows": 14, "cols": 14, "tickMs": 450}'::jsonb,
        snakes JSONB NOT NULL DEFAULT '{"left": {"label": "Serpiente1", "color": "#8b5cf6", "wins": 0, "headIndex": 2, "length": 3, "applesEaten": 0, "apples": []}, "right": {"label": "Serpiente2", "color": "#06b6d4", "wins": 0, "headIndex": 2, "length": 3, "applesEaten": 0, "apples": []}}'::jsonb,
        rules JSONB NOT NULL DEFAULT '[]'::jsonb,
        history JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_snake_vs_snake_state_updated_at ON snake_vs_snake_state (updated_at DESC)');

    // Tabla de estado de Carrera
    await pool.query(`
      CREATE TABLE IF NOT EXISTS race_game_state (
        user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        participants JSONB NOT NULL DEFAULT '[]'::jsonb,
        car_positions JSONB NOT NULL DEFAULT '{}'::jsonb,
        finish_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
        viewer_bindings JSONB NOT NULL DEFAULT '{}'::jsonb,
        history JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_race_game_state_updated_at ON race_game_state (updated_at DESC)');

    // Tabla de conexiones TikTok
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_tiktok_connections (
        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        game_type VARCHAR(50) NOT NULL,
        tiktok_username VARCHAR(120) NOT NULL,
        is_linked BOOLEAN NOT NULL DEFAULT false,
        linked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, game_type)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_tiktok_connections_game_type ON user_tiktok_connections (user_id, game_type)');

    logger.success('Database initialized successfully');
  } catch (error) {
    logger.error('Database initialization failed', error);
    throw error;
  }
}

module.exports = { bootstrapDatabase };
