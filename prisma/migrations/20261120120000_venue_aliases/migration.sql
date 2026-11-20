-- Old slugs of merged venues (admin op merge-venue): they redirect to the kept venue.
-- CreateTable
CREATE TABLE "venue_aliases" (
    "slug" TEXT NOT NULL,
    "venue_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_aliases_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "venue_aliases_venue_id_idx" ON "venue_aliases"("venue_id");

-- AddForeignKey
ALTER TABLE "venue_aliases" ADD CONSTRAINT "venue_aliases_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

