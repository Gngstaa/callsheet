-- DropForeignKey
ALTER TABLE "ActionLog" DROP CONSTRAINT "ActionLog_placementId_fkey";

-- DropTable
DROP TABLE "ActionLog";

-- DropEnum
DROP TYPE "ActionType";
