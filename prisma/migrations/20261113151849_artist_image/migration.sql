-- AlterTable
ALTER TABLE "artists" ADD COLUMN     "image_checked_at" TIMESTAMP(3),
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "youtube_channel_id" TEXT;
