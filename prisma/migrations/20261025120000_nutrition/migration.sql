-- Nutrition module: daily targets, saved foods, and what was eaten each day.
-- It makes no tasks.
-- CreateTable
CREATE TABLE "NutritionTarget" (
    "userId" TEXT NOT NULL,
    "calories" INTEGER,
    "protein" INTEGER,
    "carbs" INTEGER,
    "fat" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionTarget_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serving" TEXT,
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "foodId" TEXT,
    "name" TEXT NOT NULL,
    "serving" TEXT,
    "servings" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Food_userId_archived_idx" ON "Food"("userId", "archived");

-- CreateIndex
CREATE INDEX "FoodEntry_userId_day_idx" ON "FoodEntry"("userId", "day");

-- AddForeignKey
ALTER TABLE "NutritionTarget" ADD CONSTRAINT "NutritionTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Food" ADD CONSTRAINT "Food_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodEntry" ADD CONSTRAINT "FoodEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodEntry" ADD CONSTRAINT "FoodEntry_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE SET NULL ON UPDATE CASCADE;

