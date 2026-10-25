-- Which modules each person has on (src/modules). No row means the module's
-- default, and turning one off flips `enabled` without deleting its data.
CREATE TABLE "UserModule" (
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserModule_pkey" PRIMARY KEY ("userId","moduleId")
);

ALTER TABLE "UserModule" ADD CONSTRAINT "UserModule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Courses was part of every Erwin until now and is off by default from here,
-- so anyone who already connected Canvas keeps it on.
INSERT INTO "UserModule" ("userId", "moduleId", "enabled", "position", "updatedAt")
SELECT u."id", 'courses', true, 0, CURRENT_TIMESTAMP
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "TaskProvider" p WHERE p."userId" = u."id" AND p."type" = 'CANVAS')
   OR EXISTS (SELECT 1 FROM "Course" c WHERE c."userId" = u."id");
