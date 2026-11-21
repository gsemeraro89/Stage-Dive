-- Live albums (owner, 21 Nov 2026): each band's live albums from MusicBrainz, for the band page and its FAQ.
ALTER TABLE "artists" ADD COLUMN "live_albums_checked_at" TIMESTAMP(3),
ADD COLUMN "live_albums_mbid" TEXT;

CREATE TABLE "artist_live_albums" (
    "id" SERIAL NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "mbid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,

    CONSTRAINT "artist_live_albums_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artist_live_albums_artist_id_mbid_key" ON "artist_live_albums"("artist_id", "mbid");

ALTER TABLE "artist_live_albums" ADD CONSTRAINT "artist_live_albums_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
