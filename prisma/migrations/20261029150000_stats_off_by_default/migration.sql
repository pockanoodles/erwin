-- Stats (module id `ladder`) was on for everyone who never turned it off, and
-- new installs start with it off from here, so everyone who already has an
-- account keeps it as it was. Someone who turned it off already has a row.
INSERT INTO "UserModule" ("userId", "moduleId", "enabled", "position", "updatedAt")
SELECT u."id", 'ladder', true, 1, CURRENT_TIMESTAMP
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "UserModule" m WHERE m."userId" = u."id" AND m."moduleId" = 'ladder'
);
