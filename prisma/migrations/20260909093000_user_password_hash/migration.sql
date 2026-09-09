-- Move the local password hash out of `Account.id_token` and onto the user.
--
-- Upstream FluidCalendar stored the bcrypt hash in the OAuth `id_token` column
-- of a synthetic `provider = 'credentials'` Account row. The hash belongs to
-- the identity, not to a federated-account link, so it moves to
-- `User.passwordHash` and the synthetic rows go away -- `passwordHash IS NOT
-- NULL` is now the marker for "this user can sign in with a password".
--
-- Copy-then-delete runs in one transaction, so a failed copy leaves the old
-- rows intact.

ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

UPDATE "User" AS u
SET "passwordHash" = a."id_token"
FROM "Account" AS a
WHERE a."userId" = u."id"
  AND a."provider" = 'credentials'
  AND a."id_token" IS NOT NULL;

DELETE FROM "Account"
WHERE "provider" = 'credentials';
