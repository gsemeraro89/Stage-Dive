-- News pictures (owner, 23 Nov 2026: "the news section has to be more visual"): what each story is mainly
-- about (a band or a festival), and free festival photos from Wikimedia Commons (ported from OpenDecks).
-- Old articles get their subject from admin op news-subjects.
-- AlterTable
ALTER TABLE "news_articles" ADD COLUMN     "subject" TEXT,
ADD COLUMN     "subject_kind" TEXT;

-- CreateTable
CREATE TABLE "festival_photos" (
    "venue_id" INTEGER NOT NULL,
    "qid" TEXT,
    "image" BYTEA,
    "width" INTEGER,
    "height" INTEGER,
    "source_title" TEXT,
    "source_page" TEXT,
    "author" TEXT,
    "license" TEXT,
    "license_url" TEXT,
    "skipped" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "festival_photos_pkey" PRIMARY KEY ("venue_id")
);

-- AddForeignKey
ALTER TABLE "festival_photos" ADD CONSTRAINT "festival_photos_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

