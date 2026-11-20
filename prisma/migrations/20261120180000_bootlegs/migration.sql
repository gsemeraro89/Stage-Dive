-- Bootlegs (owner, 20 Nov 2026): fan-shared, professionally filmed complete shows, marked and listed after
-- the official concerts. Every existing concert stays OFFICIAL.
-- CreateEnum
CREATE TYPE "ConcertSourceKind" AS ENUM ('OFFICIAL', 'FAN_PRO_SHOT');

-- AlterTable
ALTER TABLE "concerts" ADD COLUMN     "source_kind" "ConcertSourceKind" NOT NULL DEFAULT 'OFFICIAL',
ADD COLUMN     "credit_name" TEXT,
ADD COLUMN     "official_twin_id" INTEGER;

-- CreateIndex
CREATE INDEX "concerts_source_kind_status_idx" ON "concerts"("source_kind", "status");
