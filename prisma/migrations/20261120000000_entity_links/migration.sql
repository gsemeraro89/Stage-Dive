-- Entity links (owner, 20 Nov 2026): where a band is known elsewhere, for sameAs and the band page.
ALTER TABLE "artists" ADD COLUMN "mbid" TEXT,
ADD COLUMN "wikidata_id" TEXT,
ADD COLUMN "wikipedia_url" TEXT,
ADD COLUMN "links_checked_at" TIMESTAMP(3);
