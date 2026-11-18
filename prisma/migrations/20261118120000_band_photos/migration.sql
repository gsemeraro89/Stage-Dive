-- CreateTable
CREATE TABLE "band_photos" (
    "id" SERIAL NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "image" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "source_title" TEXT NOT NULL,
    "source_page" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "license_url" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "band_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "band_photo_checks" (
    "artist_id" INTEGER NOT NULL,
    "wikidata_id" TEXT,
    "skipped" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "band_photo_checks_pkey" PRIMARY KEY ("artist_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "band_photos_artist_id_key" ON "band_photos"("artist_id");

-- AddForeignKey
ALTER TABLE "band_photos" ADD CONSTRAINT "band_photos_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
