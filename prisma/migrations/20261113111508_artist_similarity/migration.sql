-- AlterTable
ALTER TABLE "artist_lookups" ADD COLUMN     "similar_checked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "artist_similarity" (
    "artist_id" INTEGER NOT NULL,
    "similar_id" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_similarity_pkey" PRIMARY KEY ("artist_id","similar_id")
);

-- CreateTable
CREATE TABLE "artist_external_similar" (
    "artist_id" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mbid" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_external_similar_pkey" PRIMARY KEY ("artist_id","source","name_key")
);

-- CreateIndex
CREATE INDEX "artist_similarity_artist_id_rank_idx" ON "artist_similarity"("artist_id", "rank");

-- AddForeignKey
ALTER TABLE "artist_similarity" ADD CONSTRAINT "artist_similarity_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_similarity" ADD CONSTRAINT "artist_similarity_similar_id_fkey" FOREIGN KEY ("similar_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_external_similar" ADD CONSTRAINT "artist_external_similar_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
