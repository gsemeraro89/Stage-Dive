-- AlterTable
ALTER TABLE "artists" ADD COLUMN     "cover_chosen_from" TEXT,
ADD COLUMN     "cover_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cover_use_avatar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cover_youtube_id" TEXT;
