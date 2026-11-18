-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('ELECTRONIC_ONLY', 'ARTIST', 'MIXED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VideoVerdict" AS ENUM ('ACCEPTED', 'NOT_A_SET', 'NOT_ELECTRONIC', 'UNCERTAIN', 'DUPLICATE', 'ERROR');

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "kind" "ChannelKind" NOT NULL DEFAULT 'MIXED',
ADD COLUMN     "last_crawled_at" TIMESTAMP(3),
ADD COLUMN     "uploads_playlist_id" TEXT;

-- CreateTable
CREATE TABLE "video_decisions" (
    "id" SERIAL NOT NULL,
    "youtube_id" TEXT NOT NULL,
    "verdict" "VideoVerdict" NOT NULL,
    "reason" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_lookups" (
    "id" SERIAL NOT NULL,
    "name_key" TEXT NOT NULL,
    "mbid" TEXT,
    "genres" TEXT[],
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_lookups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" SERIAL NOT NULL,
    "job" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "ok" BOOLEAN,
    "summary" JSONB,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_decisions_youtube_id_key" ON "video_decisions"("youtube_id");

-- CreateIndex
CREATE INDEX "video_decisions_decided_at_idx" ON "video_decisions"("decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "artist_lookups_name_key_key" ON "artist_lookups"("name_key");

-- CreateIndex
CREATE INDEX "job_runs_job_started_at_idx" ON "job_runs"("job", "started_at");
