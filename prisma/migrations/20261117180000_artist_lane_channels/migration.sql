-- AlterTable
ALTER TABLE "artist_lookups" ADD COLUMN     "channel_from" TEXT,
ADD COLUMN     "handle_checked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "lane_matches" (
    "youtube_id" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "found_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lane_matches_pkey" PRIMARY KEY ("youtube_id")
);
