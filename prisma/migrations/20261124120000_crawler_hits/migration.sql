-- AI and search crawler visits per day and bot (owner, 24 Nov 2026), with hits per page type in "kinds"
-- ({"concert": 12, "md": 3, ...}). Written in batches, at most once every 5 minutes (src/lib/crawler-hits.ts).
CREATE TABLE "crawler_hits" (
    "day" DATE NOT NULL,
    "bot" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "kinds" JSONB NOT NULL DEFAULT '{}',
    "last_path" TEXT,
    "last_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crawler_hits_pkey" PRIMARY KEY ("day","bot")
);
