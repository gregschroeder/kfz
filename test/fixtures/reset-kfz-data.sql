-- Truncate KFZ app tables for local reset / fixture reload.
-- Guarded: only runs when app.kfz_allow_reset = 'true' (set by local dev scripts).
DO $$
BEGIN
  IF current_setting('app.kfz_allow_reset', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'kfz table reset refused: local dev only (use pnpm db:local:reset or db:local:restore:fixtures)';
  END IF;
END $$;

truncate table kfz.queue restart identity cascade;
truncate table kfz.prefixes restart identity cascade;
