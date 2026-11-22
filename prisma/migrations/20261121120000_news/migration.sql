-- News (owner, 21 Nov 2026): short original articles about our bands and festivals, from the press.
-- CreateTable
CREATE TABLE "news_articles" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'press',
    "key" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT 'other',
    "title" TEXT NOT NULL,
    "lead" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "band_slugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "venue_slug" TEXT,
    "venue_name" TEXT,
    "artists" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_name" TEXT,
    "source_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "check_note" TEXT,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_seen" (
    "url" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_seen_pkey" PRIMARY KEY ("url")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_articles_slug_key" ON "news_articles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "news_articles_key_key" ON "news_articles"("key");

-- CreateIndex
CREATE INDEX "news_articles_status_published_at_idx" ON "news_articles"("status", "published_at");

-- CreateIndex
CREATE INDEX "news_articles_venue_slug_status_idx" ON "news_articles"("venue_slug", "status");

-- CreateIndex
CREATE INDEX "news_seen_created_at_idx" ON "news_seen"("created_at");
