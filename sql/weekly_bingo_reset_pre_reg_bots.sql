-- Reset next-week edition: remove early bot joins so reg countdown matches reality
-- Run after updating registration_opens_at on the new edition.

DELETE FROM weekly_participant
WHERE edition_id IN (
  SELECT id FROM weekly_edition
  WHERE status = 'open'
    AND registration_opens_at > NOW()
);

UPDATE weekly_edition
SET bot_wallet_remaining = bot_wallet
WHERE status = 'open'
  AND registration_opens_at > NOW();
