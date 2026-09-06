-- Goals-sync projection identity: stable external key so the vault→erwin pump upserts
-- instead of duplicating. Nullable, so hand-made goals (NULL) are unaffected; Postgres
-- treats multiple NULLs as distinct, so the compound unique still permits many NULL rows.
ALTER TABLE "Goal" ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "Goal_userId_externalId_key" ON "Goal"("userId", "externalId");
