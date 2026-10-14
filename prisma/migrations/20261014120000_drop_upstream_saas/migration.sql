-- DropForeignKey
ALTER TABLE "JobRecord" DROP CONSTRAINT "JobRecord_userId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_userId_fkey";

-- AlterTable
ALTER TABLE "NotificationSettings" DROP COLUMN "dailyEmailEnabled";

-- AlterTable
ALTER TABLE "SystemSettings" DROP COLUMN "resendApiKey";

-- DropTable
DROP TABLE "PendingWaitlist";

-- DropTable
DROP TABLE "Waitlist";

-- DropTable
DROP TABLE "BetaSettings";

-- DropTable
DROP TABLE "JobRecord";

-- DropTable
DROP TABLE "Subscription";

-- DropEnum
DROP TYPE "JobStatus";

-- DropEnum
DROP TYPE "SubscriptionPlan";

-- DropEnum
DROP TYPE "SubscriptionStatus";
