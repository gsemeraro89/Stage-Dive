-- AlterTable
ALTER TABLE "artist_lookups" ADD COLUMN     "channel_checked_at" TIMESTAMP(3),
ADD COLUMN     "search_result_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "searched_at" TIMESTAMP(3),
ADD COLUMN     "youtube_channel_id" TEXT;

-- AlterTable
ALTER TABLE "classifier_batches" ADD COLUMN     "lane" TEXT NOT NULL DEFAULT 'collect';

-- CreateTable
CREATE TABLE "lane_answers" (
    "id" SERIAL NOT NULL,
    "youtube_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lane_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lane_answers_created_at_idx" ON "lane_answers"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "lane_answers_youtube_id_prompt_version_key" ON "lane_answers"("youtube_id", "prompt_version");
