-- Test edition: reg +2 min, start +5 min, stake 100, 400 bots, 400 bot names
-- Run in psql, then restart socket server (or wait for cron).

UPDATE weekly_edition
SET
  status = 'open',
  stake = 100,
  bot_count = 400,
  bot_wallet = 500000,
  bot_wallet_remaining = 500000,
  registration_opens_at = NOW() + INTERVAL '2 minutes',
  registration_closes_at  = NOW() + INTERVAL '5 minutes',
  starts_at               = NOW() + INTERVAL '5 minutes',
  bot_names = (
    SELECT jsonb_agg(label ORDER BY i)
    FROM (
      SELECT
        i,
        s.names[1 + (i - 1) % array_length(s.names, 1)]
          || CASE
               WHEN i > array_length(s.names, 1)
               THEN ' ' || (((i - 1) / array_length(s.names, 1)) + 1)::text
               ELSE ''
             END AS label
      FROM generate_series(1, 400) AS i
      CROSS JOIN (
        SELECT ARRAY[
          'Abebe','Kebede','Tigist','Hanna','Dawit','Mimi','Samuel','Liya',
          'Yonas','Sara','Beki','Helen','Jonas','Ruth','Mekdes','Solomon',
          'Eden','Nati','Brook','Rahel','Daniel','Marta','Kaleb','Selam',
          'Robel','Betty','Fikadu','Meron','Henok','Salem','Abel','Birtu',
          'Chala','Dereje','Elias','Frehiwot','Getachew','Hirut','Israel','Jemila',
          'Kidus','Lulit','Melaku','Nardos','Oliyad','Paulos','Rigbe','Sisay',
          'Tewodros','Wubet','Yared','Zemen','Almaz','Binyam','Desta','Etenesh',
          'Fitsum','Genet','Haile','Ibssa','Kalkidan','Lidya','Mahlet','Nebyu',
          'Omar','Petros','Saba','Tamrat','Usman','Winta','Yohannes','Zerihun',
          'Adane','Blen','Chaltu','Eyerusalem','Fasika','Girma','Hawi','Kidan',
          'Lomi','Mekonnen','Nahom','Raey','Semira','Tadele','Wondimu','Yonatan'
        ]::text[] AS names
      ) AS s
    ) AS built
  ),
  updated_at = NOW()
WHERE id = 'weekly_1783868740028';

-- Optional: clear players for a fresh test
-- DELETE FROM weekly_participant WHERE edition_id = 'weekly_1783868740028';

SELECT
  id,
  status,
  stake,
  bot_count,
  jsonb_array_length(bot_names) AS bot_name_count,
  bot_wallet,
  bot_wallet_remaining,
  registration_opens_at,
  registration_closes_at,
  starts_at,
  NOW() AS db_now
FROM weekly_edition
WHERE id = 'weekly_1783868740028';
