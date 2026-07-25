-- Manual boss-list ordering: 0 = top; ties resolved by isBoss then importance.
ALTER TABLE "Goal" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
