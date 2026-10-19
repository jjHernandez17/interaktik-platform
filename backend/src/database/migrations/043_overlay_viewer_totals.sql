-- Acumulado COMPLETO por espectador para "Top Likes" y "Top Regaladores" de los overlays.
--
-- Antes el top solo recordaba a los espectadores que ya estaban dentro de la tabla (top 5, por ejemplo). Un espectador nuevo
-- que todavia no estaba en el top empezaba de cero en cada mensaje de likes/regalo y se descartaba enseguida: nunca llegaba
-- a sumar lo suficiente para entrar, aunque llevara muchos mas likes que los de la tabla. Ahora cada espectador acumula
-- siempre su total real aqui, y el top se calcula de estos totales.
CREATE TABLE IF NOT EXISTS overlay_viewer_totals (
  user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL,
  viewer_key VARCHAR(60) NOT NULL,
  nickname VARCHAR(120),
  avatar TEXT,
  total BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind, viewer_key),
  CONSTRAINT overlay_viewer_totals_kind_valid CHECK (kind IN ('likes', 'coins')),
  CONSTRAINT overlay_viewer_totals_total_nonneg CHECK (total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_overlay_viewer_totals_rank ON overlay_viewer_totals (user_id, kind, total DESC);

-- Lo que ya habia en las tablas de hoy se conserva: se copia como punto de partida.
INSERT INTO overlay_viewer_totals (user_id, kind, viewer_key, nickname, avatar, total)
SELECT o.user_id,
       'likes',
       LEFT(e->>'uniqueId', 60),
       LEFT(COALESCE(e->>'nickname', ''), 120),
       NULLIF(e->>'avatar', ''),
       CASE WHEN (e->>'likes') ~ '^[0-9]+(\.[0-9]+)?$' THEN ROUND((e->>'likes')::numeric)::bigint ELSE 0 END
FROM overlay_config o
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(o.state->'topLikers'->'entries') = 'array' THEN o.state->'topLikers'->'entries' ELSE '[]'::jsonb END
) AS e
WHERE COALESCE(e->>'uniqueId', '') <> ''
ON CONFLICT (user_id, kind, viewer_key) DO NOTHING;

INSERT INTO overlay_viewer_totals (user_id, kind, viewer_key, nickname, avatar, total)
SELECT o.user_id,
       'coins',
       LEFT(e->>'uniqueId', 60),
       LEFT(COALESCE(e->>'nickname', ''), 120),
       NULLIF(e->>'avatar', ''),
       CASE WHEN (e->>'coins') ~ '^[0-9]+(\.[0-9]+)?$' THEN ROUND((e->>'coins')::numeric)::bigint ELSE 0 END
FROM overlay_config o
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(o.state->'topGifters'->'entries') = 'array' THEN o.state->'topGifters'->'entries' ELSE '[]'::jsonb END
) AS e
WHERE COALESCE(e->>'uniqueId', '') <> ''
ON CONFLICT (user_id, kind, viewer_key) DO NOTHING;
