-- AlterTable
ALTER TABLE "artists" ADD COLUMN     "bio_generated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bio_sources" TEXT[],
ADD COLUMN     "born_year" INTEGER,
ADD COLUMN     "profile_checked_at" TIMESTAMP(3),
ADD COLUMN     "style" TEXT;
