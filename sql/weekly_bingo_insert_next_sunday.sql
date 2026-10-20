-- Insert new weekly edition: next Sunday 4:00 PM, reg closes 3:30 PM same day
-- Stake 100, 200 bots (paced across the week)
-- Times use Africa/Addis_Ababa (UTC+3). Run AFTER weekly_bingo.sql

BEGIN;

WITH next_sunday AS (
  SELECT (
    CURRENT_DATE + (
      CASE
        WHEN EXTRACT(DOW FROM CURRENT_DATE) = 0 THEN 7
        ELSE (7 - EXTRACT(DOW FROM CURRENT_DATE)::int)
      END
    )
  )::date AS game_day
),
times AS (
  SELECT
    (game_day::timestamp + TIME '16:00') AT TIME ZONE 'Africa/Addis_Ababa' AS starts_at,
    (game_day::timestamp + TIME '15:30') AT TIME ZONE 'Africa/Addis_Ababa' AS registration_closes_at,
    ((game_day - 6)::timestamp + TIME '08:00') AT TIME ZONE 'Africa/Addis_Ababa' AS registration_opens_at
  FROM next_sunday
),
bot_pool AS (
  SELECT jsonb_agg(label ORDER BY i) AS names
  FROM (
    SELECT
      i,
      s.names[1 + (i - 1) % array_length(s.names, 1)]
        || CASE
             WHEN i > array_length(s.names, 1)
             THEN ' ' || (((i - 1) / array_length(s.names, 1)) + 1)::text
             ELSE ''
           END AS label
    FROM generate_series(1, 200) AS i
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
        'Lomi','Mekonnen','Nahom','Raey','Semira','Tadele','Wondimu','Yonatan',
        'Aster','Bereket','Dagim','Eyerus','Fikir','Gelila','Hannael','Iman',
        'Jember','Kirubel','Lemlem','Meseret','Natnael','Rediet','Senait','Tsion',
        'Amanuel','Betelhem','Caleb','Dagmawi','Esubalew','Firehiwot','Hana','Iyasu',
        'Liya','Meklit','Netsanet','Rebecca','Samson','Yordanos','Abenezer','Biruk',
        'Danait','Eskinder','Feven','Hagos','Kedir','Lensa','Mulugeta','Redwan',
        'Selamawit','Tilahun','Zelalem','Alem','Beza','Eskedar','Gadisa','Haymanot',
        'Konjit','Melat','Netsa','Addisu','Belay','Dina','Endale','Fantu',
        'Habtamu','Kassa','Mihret','Nigist','Seble','Tesfaye','Worku','Yewbdar',
        'Zenebe','Alemayehu','Bruk','Delina','Emebet','Getu','Hasset','Tewabech',
        'Wondwossen','Yeshi','Zewdu','Alemnesh','Biniyam','Dinknesh','Saron','Sofonias',
        'Tsega','Wubit','Yemane','Zinash','Alemseged','Bezawit','Chirotaw','Dagem',
        'Eleni','Fekadu','Gashaw','Hiwot','Kibru','Lidet','Mulu','Negasi',
        'Rahelita','Selamaw','Tigistu','Wendimu','Yaredu','Zekarias','Amare','Birtukan'
      ]::text[] AS names
    ) AS s
  ) AS built
)
INSERT INTO weekly_edition (
  id,
  title,
  stake,
  pattern,
  starts_at,
  registration_opens_at,
  registration_closes_at,
  bot_count,
  bot_wallet,
  bot_wallet_remaining,
  bot_names,
  bot_fill_hours_before_start,
  max_cards_per_user,
  house_cut_percent,
  status
)
SELECT
  'weekly_' || (FLOOR(EXTRACT(EPOCH FROM t.starts_at) * 1000))::bigint,
  'Weekly Bingo — ' || to_char(t.starts_at AT TIME ZONE 'Africa/Addis_Ababa', 'Mon DD, YYYY'),
  100,
  1,
  t.starts_at,
  t.registration_opens_at,
  t.registration_closes_at,
  200,
  500000,
  500000,
  b.names,
  12,
  1,
  15,
  'open'
FROM times t
CROSS JOIN bot_pool b;

COMMIT;

-- Verify
SELECT
  id,
  title,
  status,
  stake,
  bot_count,
  jsonb_array_length(bot_names) AS bot_name_count,
  registration_opens_at AT TIME ZONE 'Africa/Addis_Ababa' AS reg_opens_local,
  registration_closes_at AT TIME ZONE 'Africa/Addis_Ababa' AS reg_closes_local,
  starts_at AT TIME ZONE 'Africa/Addis_Ababa' AS starts_local
FROM weekly_edition
ORDER BY starts_at DESC
LIMIT 5;
