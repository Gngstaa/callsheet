-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Industry" AS ENUM ('CONSTRUCTION', 'ARCHITECTURE_ENGINEERING', 'HEALTHCARE', 'INSURANCE', 'SAAS_STARTUPS', 'BACK_OFFICE_OPERATIONS', 'ECOMMERCE_RETAIL', 'LEGAL_PROFESSIONAL_SERVICES');

-- CreateEnum
CREATE TYPE "Location" AS ENUM ('PUNE', 'RAJKOT', 'MANILA');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('ACTIVE', 'ENDED', 'REPLACED');

-- CreateEnum
CREATE TYPE "Party" AS ENUM ('CLIENT', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('CLIENT_COMPLAINT', 'UNDERPERFORMANCE', 'ATTENDANCE', 'REPLACEMENT_REQUEST');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "Reporter" AS ENUM ('CLIENT', 'PROFESSIONAL', 'F5');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'FIXED', 'CLOSED', 'REGRESSED');

-- CreateEnum
CREATE TYPE "FollowUpOutcome" AS ENUM ('HELD', 'REGRESSED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('ESCALATION', 'SILENCE', 'ISSUE_FOLLOWUP', 'FEEDBACK_DUE', 'NEW_PLACEMENT', 'CHECKIN_DUE');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('RED', 'AMBER', 'GREEN');

-- CreateEnum
CREATE TYPE "EscalationRole" AS ENUM ('ACCOUNT_DIRECTOR', 'DELIVERY_MANAGER');

-- CreateEnum
CREATE TYPE "EscalationRule" AS ENUM ('TWO_OPEN_ISSUES', 'TRIAL_CLIENT_COMPLAINT', 'REPEAT_ATTENDANCE', 'RED_SEVEN_DAYS', 'REPLACEMENT_REQUEST', 'REGRESSED_FOLLOW_UP');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" "Industry" NOT NULL,
    "timezone" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "startedWithF5At" DATE NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professional" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" "Location" NOT NULL,
    "joinedF5At" DATE NOT NULL,

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "PlacementStatus" NOT NULL DEFAULT 'ACTIVE',
    "weeklyRateUsd" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackEntry" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "party" "Party" NOT NULL,
    "collectedAt" TIMESTAMPTZ(3) NOT NULL,
    "sentiment" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "FeedbackEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "type" "IssueType" NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL,
    "reportedBy" "Reporter" NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "fixedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueFollowUp" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "checkedAt" TIMESTAMPTZ(3),
    "outcome" "FollowUpOutcome",

    CONSTRAINT "IssueFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "party" "Party" NOT NULL,
    "dueOn" DATE NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "performedAt" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "EscalationRole" NOT NULL,

    CONSTRAINT "EscalationContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "issueId" TEXT,
    "rule" "EscalationRule" NOT NULL,
    "contactId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "escalatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSnapshot" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "status" "HealthStatus" NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "HealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Placement_status_idx" ON "Placement"("status");

-- CreateIndex
CREATE INDEX "Placement_clientId_idx" ON "Placement"("clientId");

-- CreateIndex
CREATE INDEX "Placement_professionalId_idx" ON "Placement"("professionalId");

-- CreateIndex
CREATE INDEX "FeedbackEntry_placementId_party_collectedAt_idx" ON "FeedbackEntry"("placementId", "party", "collectedAt");

-- CreateIndex
CREATE INDEX "Issue_placementId_status_idx" ON "Issue"("placementId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IssueFollowUp_issueId_offsetDays_key" ON "IssueFollowUp"("issueId", "offsetDays");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_placementId_party_dueOn_key" ON "CheckIn"("placementId", "party", "dueOn");

-- CreateIndex
CREATE INDEX "ActionLog_placementId_performedAt_idx" ON "ActionLog"("placementId", "performedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationContact_role_key" ON "EscalationContact"("role");

-- CreateIndex
CREATE INDEX "Escalation_placementId_rule_idx" ON "Escalation"("placementId", "rule");

-- CreateIndex
CREATE UNIQUE INDEX "HealthSnapshot_placementId_day_key" ON "HealthSnapshot"("placementId", "day");

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEntry" ADD CONSTRAINT "FeedbackEntry_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueFollowUp" ADD CONSTRAINT "IssueFollowUp_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "EscalationContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthSnapshot" ADD CONSTRAINT "HealthSnapshot_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
