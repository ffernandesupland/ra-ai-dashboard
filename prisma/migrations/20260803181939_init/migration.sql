-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('GEN_SEARCH_GAP_ANALYSIS', 'GEN_USAGE_BY_SOLUTION', 'GEN_SUMMARY_BY_DAY', 'GEN_SUMMARY_BY_SEARCH_TYPE', 'GEN_SUMMARY_BY_USER', 'GEN_USAGE_BY_USER', 'GEN_USAGE_BY_COLLECTION', 'GEN_TTFA_BY_QUERY', 'GEN_TTFA_BY_PORTAL_GROUP', 'GEN_TTFA_BY_COLLECTION', 'GEN_TTFA_BY_USER', 'AIKA_USAGE_BY_SOLUTION', 'AIKA_USAGE_BY_ROLE', 'AIKA_USAGE_BY_USER', 'AI_USAGE_BY_USER');

-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('DRAFT', 'COMMITTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SearchType" AS ENUM ('KEYWORD', 'NEURAL', 'HYBRID', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "windowStart" DATE NOT NULL,
    "windowEnd" DATE NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "status" "SnapshotStatus" NOT NULL DEFAULT 'DRAFT',
    "label" TEXT,
    "notes" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFile" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "originalName" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "titleLine" TEXT NOT NULL,
    "filterLine" TEXT NOT NULL,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GapAnalysisRow" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "askedOn" DATE NOT NULL,
    "username" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "portalGroup" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "queryNorm" TEXT NOT NULL,
    "searchType" "SearchType" NOT NULL,
    "answered" BOOLEAN NOT NULL,
    "referenceSolutions" TEXT[],
    "contextSet" TEXT[],
    "mrr" DOUBLE PRECISION,

    CONSTRAINT "GapAnalysisRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolutionUsageRow" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "solutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "citations" INTEGER NOT NULL,
    "pctOfTotal" DOUBLE PRECISION,
    "daysSinceModified" INTEGER,
    "collections" TEXT[],

    CONSTRAINT "SolutionUsageRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiKaSolutionRow" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "solutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastModifiedAt" TIMESTAMP(3),
    "collections" TEXT[],
    "aiActions" INTEGER NOT NULL,

    CONSTRAINT "AiKaSolutionRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySummaryRow" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "questions" INTEGER NOT NULL,
    "answered" INTEGER NOT NULL,
    "unanswered" INTEGER NOT NULL,
    "pctAnswered" DOUBLE PRECISION,
    "referenceSolutionView" INTEGER NOT NULL,

    CONSTRAINT "DailySummaryRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtfaQueryRow" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "askedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "username" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "ttfaSec" INTEGER NOT NULL,

    CONSTRAINT "TtfaQueryRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregateRow" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "AggregateRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "metricsVersion" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "questionsAsked" INTEGER NOT NULL,
    "answerRate" DOUBLE PRECISION NOT NULL,
    "solutionsCited" INTEGER NOT NULL,
    "totalCitations" INTEGER NOT NULL,
    "loopClosure" DOUBLE PRECISION NOT NULL,
    "loopClosureWtd" DOUBLE PRECISION NOT NULL,
    "aiShareOfRepair" DOUBLE PRECISION NOT NULL,
    "medianTtfaSec" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Snapshot_tenantId_status_windowEnd_idx" ON "Snapshot"("tenantId", "status", "windowEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_tenantId_windowStart_windowEnd_uploadedAt_key" ON "Snapshot"("tenantId", "windowStart", "windowEnd", "uploadedAt");

-- CreateIndex
CREATE INDEX "SourceFile_checksum_idx" ON "SourceFile"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFile_snapshotId_reportType_key" ON "SourceFile"("snapshotId", "reportType");

-- CreateIndex
CREATE INDEX "GapAnalysisRow_snapshotId_queryNorm_idx" ON "GapAnalysisRow"("snapshotId", "queryNorm");

-- CreateIndex
CREATE INDEX "GapAnalysisRow_snapshotId_answered_idx" ON "GapAnalysisRow"("snapshotId", "answered");

-- CreateIndex
CREATE INDEX "SolutionUsageRow_snapshotId_daysSinceModified_idx" ON "SolutionUsageRow"("snapshotId", "daysSinceModified");

-- CreateIndex
CREATE UNIQUE INDEX "SolutionUsageRow_snapshotId_solutionId_key" ON "SolutionUsageRow"("snapshotId", "solutionId");

-- CreateIndex
CREATE UNIQUE INDEX "AiKaSolutionRow_snapshotId_solutionId_key" ON "AiKaSolutionRow"("snapshotId", "solutionId");

-- CreateIndex
CREATE UNIQUE INDEX "DailySummaryRow_snapshotId_date_key" ON "DailySummaryRow"("snapshotId", "date");

-- CreateIndex
CREATE INDEX "TtfaQueryRow_snapshotId_sessionId_idx" ON "TtfaQueryRow"("snapshotId", "sessionId");

-- CreateIndex
CREATE INDEX "AggregateRow_snapshotId_reportType_idx" ON "AggregateRow"("snapshotId", "reportType");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_snapshotId_key" ON "MetricSnapshot"("snapshotId");

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceFile" ADD CONSTRAINT "SourceFile_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapAnalysisRow" ADD CONSTRAINT "GapAnalysisRow_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolutionUsageRow" ADD CONSTRAINT "SolutionUsageRow_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiKaSolutionRow" ADD CONSTRAINT "AiKaSolutionRow_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySummaryRow" ADD CONSTRAINT "DailySummaryRow_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TtfaQueryRow" ADD CONSTRAINT "TtfaQueryRow_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregateRow" ADD CONSTRAINT "AggregateRow_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
