-- Tours filled by the collector (owner, 21 Nov 2026): when a concert's tour was settled from its text.
ALTER TABLE "concerts" ADD COLUMN "tour_checked_at" TIMESTAMP(3);

-- Bands people search for that are not on the site (keyword research, owner 21 Nov 2026).
CREATE TABLE "keyword_missing_bands" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "phrases" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "examples" TEXT[],
    "listed_at" TIMESTAMP(3) NOT NULL,
    "mbid" TEXT,
    "mb_genres" TEXT[],
    "our_genres" TEXT[],
    "verdict" TEXT,
    "checked_at" TIMESTAMP(3),

    CONSTRAINT "keyword_missing_bands_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "keyword_missing_bands_rank_idx" ON "keyword_missing_bands"("rank");
