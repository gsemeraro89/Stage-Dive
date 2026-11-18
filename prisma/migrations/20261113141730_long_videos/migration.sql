-- CreateTable
CREATE TABLE "long_videos" (
    "youtube_id" TEXT NOT NULL,
    "youtube_channel_id" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "long_videos_pkey" PRIMARY KEY ("youtube_id")
);

-- CreateIndex
CREATE INDEX "long_videos_checked_at_idx" ON "long_videos"("checked_at");
