-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ConcertSource" AS ENUM ('SEED', 'COLLECTOR', 'MANUAL');

-- CreateEnum
CREATE TYPE "ConcertStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "CreditRole" AS ENUM ('MAIN', 'WITH');

-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('ELECTRONIC_ONLY', 'ARTIST', 'MIXED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VideoVerdict" AS ENUM ('ACCEPTED', 'NOT_A_SET', 'NOT_ELECTRONIC', 'UNCERTAIN', 'DUPLICATE', 'ERROR');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "artists" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aka" TEXT,
    "origin" TEXT,
    "label" TEXT,
    "bio" TEXT,
    "similar_names" TEXT[],
    "born_year" INTEGER,
    "style" TEXT,
    "bio_sources" TEXT[],
    "bio_generated" BOOLEAN NOT NULL DEFAULT false,
    "profile_checked_at" TIMESTAMP(3),
    "last_searched_at" TIMESTAMP(3),
    "image_url" TEXT,
    "image_checked_at" TIMESTAMP(3),
    "youtube_channel_id" TEXT,
    "cover_youtube_id" TEXT,
    "cover_use_avatar" BOOLEAN NOT NULL DEFAULT false,
    "cover_locked" BOOLEAN NOT NULL DEFAULT false,
    "cover_chosen_from" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "venues" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genres" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_kinds" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "venue_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tours" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "artist_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" SERIAL NOT NULL,
    "youtube_channel_id" TEXT,
    "name" TEXT NOT NULL,
    "is_official" BOOLEAN NOT NULL DEFAULT true,
    "crawl" BOOLEAN NOT NULL DEFAULT false,
    "kind" "ChannelKind" NOT NULL DEFAULT 'MIXED',
    "uploads_playlist_id" TEXT,
    "last_crawled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concerts" (
    "id" SERIAL NOT NULL,
    "youtube_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "view_count" INTEGER NOT NULL,
    "published_at" DATE NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "performed_year" INTEGER,
    "performed_on" DATE,
    "write_up" TEXT,
    "setlist" JSONB,
    "setlist_source" TEXT,
    "setlist_checked_at" TIMESTAMP(3),
    "thumbnail_url" TEXT,
    "source" "ConcertSource" NOT NULL,
    "status" "ConcertStatus" NOT NULL DEFAULT 'PUBLISHED',
    "curated" BOOLEAN NOT NULL DEFAULT false,
    "embeddable" BOOLEAN NOT NULL,
    "privacy_status" TEXT NOT NULL,
    "made_for_kids" BOOLEAN,
    "yt_checked_at" TIMESTAMP(3) NOT NULL,
    "yt_refreshed_at" TIMESTAMP(3) NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "venue_id" INTEGER,
    "venue_kind_id" INTEGER,
    "tour_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concert_artists" (
    "concert_id" INTEGER NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "role" "CreditRole" NOT NULL,
    "credit_note" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "concert_artists_pkey" PRIMARY KEY ("concert_id","artist_id")
);

-- CreateTable
CREATE TABLE "concert_genres" (
    "concert_id" INTEGER NOT NULL,
    "genre_id" INTEGER NOT NULL,

    CONSTRAINT "concert_genres_pkey" PRIMARY KEY ("concert_id","genre_id")
);

-- CreateTable
CREATE TABLE "video_decisions" (
    "id" SERIAL NOT NULL,
    "youtube_id" TEXT NOT NULL,
    "verdict" "VideoVerdict" NOT NULL,
    "reason" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "long_videos" (
    "youtube_id" TEXT NOT NULL,
    "youtube_channel_id" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "long_videos_pkey" PRIMARY KEY ("youtube_id")
);

-- CreateTable
CREATE TABLE "classification_cache" (
    "id" SERIAL NOT NULL,
    "youtube_id" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classification_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lane_answers" (
    "id" SERIAL NOT NULL,
    "youtube_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lane_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lane_matches" (
    "youtube_id" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "found_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lane_matches_pkey" PRIMARY KEY ("youtube_id")
);

-- CreateTable
CREATE TABLE "classifier_batches" (
    "id" SERIAL NOT NULL,
    "batch_id" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "youtube_ids" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lane" TEXT NOT NULL DEFAULT 'collect',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "classifier_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_lookups" (
    "id" SERIAL NOT NULL,
    "name_key" TEXT NOT NULL,
    "mbid" TEXT,
    "genres" TEXT[],
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "similar_checked_at" TIMESTAMP(3),
    "youtube_channel_id" TEXT,
    "channel_checked_at" TIMESTAMP(3),
    "searched_at" TIMESTAMP(3),
    "search_result_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channel_from" TEXT,
    "handle_checked_at" TIMESTAMP(3),

    CONSTRAINT "artist_lookups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" SERIAL NOT NULL,
    "job" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "ok" BOOLEAN,
    "summary" JSONB,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_queue" (
    "id" SERIAL NOT NULL,
    "youtube_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "review_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plays" (
    "id" BIGSERIAL NOT NULL,
    "concert_id" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "country" CHAR(2),
    "source" TEXT,

    CONSTRAINT "plays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "artists_slug_key" ON "artists"("slug");

-- CreateIndex
CREATE INDEX "artist_similarity_artist_id_rank_idx" ON "artist_similarity"("artist_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "venues_slug_key" ON "venues"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "genres_slug_key" ON "genres"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "venue_kinds_slug_key" ON "venue_kinds"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "venue_kinds_name_key" ON "venue_kinds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tours_slug_key" ON "tours"("slug");

-- CreateIndex
CREATE INDEX "tours_artist_id_idx" ON "tours"("artist_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_youtube_channel_id_key" ON "channels"("youtube_channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_name_key" ON "channels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "concerts_youtube_id_key" ON "concerts"("youtube_id");

-- CreateIndex
CREATE UNIQUE INDEX "concerts_slug_key" ON "concerts"("slug");

-- CreateIndex
CREATE INDEX "concerts_status_published_at_idx" ON "concerts"("status", "published_at");

-- CreateIndex
CREATE INDEX "concerts_status_performed_year_idx" ON "concerts"("status", "performed_year");

-- CreateIndex
CREATE INDEX "concerts_status_view_count_idx" ON "concerts"("status", "view_count");

-- CreateIndex
CREATE INDEX "concert_artists_artist_id_idx" ON "concert_artists"("artist_id");

-- CreateIndex
CREATE INDEX "concert_genres_genre_id_idx" ON "concert_genres"("genre_id");

-- CreateIndex
CREATE UNIQUE INDEX "video_decisions_youtube_id_key" ON "video_decisions"("youtube_id");

-- CreateIndex
CREATE INDEX "video_decisions_decided_at_idx" ON "video_decisions"("decided_at");

-- CreateIndex
CREATE INDEX "long_videos_checked_at_idx" ON "long_videos"("checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "classification_cache_youtube_id_key" ON "classification_cache"("youtube_id");

-- CreateIndex
CREATE INDEX "classification_cache_created_at_idx" ON "classification_cache"("created_at");

-- CreateIndex
CREATE INDEX "lane_answers_created_at_idx" ON "lane_answers"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "lane_answers_youtube_id_prompt_version_key" ON "lane_answers"("youtube_id", "prompt_version");

-- CreateIndex
CREATE UNIQUE INDEX "classifier_batches_batch_id_key" ON "classifier_batches"("batch_id");

-- CreateIndex
CREATE INDEX "classifier_batches_status_idx" ON "classifier_batches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "artist_lookups_name_key_key" ON "artist_lookups"("name_key");

-- CreateIndex
CREATE INDEX "job_runs_job_started_at_idx" ON "job_runs"("job", "started_at");

-- CreateIndex
CREATE INDEX "review_queue_status_created_at_idx" ON "review_queue"("status", "created_at");

-- CreateIndex
CREATE INDEX "review_queue_youtube_id_idx" ON "review_queue"("youtube_id");

-- CreateIndex
CREATE INDEX "plays_concert_id_started_at_idx" ON "plays"("concert_id", "started_at");

-- CreateIndex
CREATE INDEX "plays_started_at_idx" ON "plays"("started_at");

-- AddForeignKey
ALTER TABLE "artist_similarity" ADD CONSTRAINT "artist_similarity_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_similarity" ADD CONSTRAINT "artist_similarity_similar_id_fkey" FOREIGN KEY ("similar_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_external_similar" ADD CONSTRAINT "artist_external_similar_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tours" ADD CONSTRAINT "tours_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concerts" ADD CONSTRAINT "concerts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concerts" ADD CONSTRAINT "concerts_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concerts" ADD CONSTRAINT "concerts_venue_kind_id_fkey" FOREIGN KEY ("venue_kind_id") REFERENCES "venue_kinds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concerts" ADD CONSTRAINT "concerts_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concert_artists" ADD CONSTRAINT "concert_artists_concert_id_fkey" FOREIGN KEY ("concert_id") REFERENCES "concerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concert_artists" ADD CONSTRAINT "concert_artists_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concert_genres" ADD CONSTRAINT "concert_genres_concert_id_fkey" FOREIGN KEY ("concert_id") REFERENCES "concerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concert_genres" ADD CONSTRAINT "concert_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_concert_id_fkey" FOREIGN KEY ("concert_id") REFERENCES "concerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
