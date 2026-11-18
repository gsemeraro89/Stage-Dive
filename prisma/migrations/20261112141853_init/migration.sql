-- CreateEnum
CREATE TYPE "SetSource" AS ENUM ('SEED', 'COLLECTOR', 'MANUAL');

-- CreateEnum
CREATE TYPE "SetStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "CreditRole" AS ENUM ('MAIN', 'WITH');

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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "settings" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" SERIAL NOT NULL,
    "youtube_channel_id" TEXT,
    "name" TEXT NOT NULL,
    "is_official" BOOLEAN NOT NULL DEFAULT true,
    "crawl" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sets" (
    "id" SERIAL NOT NULL,
    "youtube_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "view_count" INTEGER NOT NULL,
    "published_at" DATE NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "live_act" BOOLEAN NOT NULL DEFAULT false,
    "write_up" TEXT,
    "tracklist" JSONB,
    "thumbnail_url" TEXT,
    "source" "SetSource" NOT NULL,
    "status" "SetStatus" NOT NULL DEFAULT 'PUBLISHED',
    "curated" BOOLEAN NOT NULL DEFAULT false,
    "embeddable" BOOLEAN NOT NULL,
    "privacy_status" TEXT NOT NULL,
    "made_for_kids" BOOLEAN,
    "yt_checked_at" TIMESTAMP(3) NOT NULL,
    "yt_refreshed_at" TIMESTAMP(3) NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "venue_id" INTEGER,
    "setting_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_artists" (
    "set_id" INTEGER NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "role" "CreditRole" NOT NULL,
    "credit_note" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "set_artists_pkey" PRIMARY KEY ("set_id","artist_id")
);

-- CreateTable
CREATE TABLE "set_genres" (
    "set_id" INTEGER NOT NULL,
    "genre_id" INTEGER NOT NULL,

    CONSTRAINT "set_genres_pkey" PRIMARY KEY ("set_id","genre_id")
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
    "set_id" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "country" CHAR(2),
    "source" TEXT,

    CONSTRAINT "plays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "artists_slug_key" ON "artists"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "venues_slug_key" ON "venues"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "genres_slug_key" ON "genres"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "settings_slug_key" ON "settings"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "settings_name_key" ON "settings"("name");

-- CreateIndex
CREATE UNIQUE INDEX "channels_youtube_channel_id_key" ON "channels"("youtube_channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_name_key" ON "channels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sets_youtube_id_key" ON "sets"("youtube_id");

-- CreateIndex
CREATE UNIQUE INDEX "sets_slug_key" ON "sets"("slug");

-- CreateIndex
CREATE INDEX "sets_status_published_at_idx" ON "sets"("status", "published_at");

-- CreateIndex
CREATE INDEX "sets_status_view_count_idx" ON "sets"("status", "view_count");

-- CreateIndex
CREATE INDEX "set_artists_artist_id_idx" ON "set_artists"("artist_id");

-- CreateIndex
CREATE INDEX "set_genres_genre_id_idx" ON "set_genres"("genre_id");

-- CreateIndex
CREATE INDEX "review_queue_status_created_at_idx" ON "review_queue"("status", "created_at");

-- CreateIndex
CREATE INDEX "review_queue_youtube_id_idx" ON "review_queue"("youtube_id");

-- CreateIndex
CREATE INDEX "plays_set_id_started_at_idx" ON "plays"("set_id", "started_at");

-- CreateIndex
CREATE INDEX "plays_started_at_idx" ON "plays"("started_at");

-- AddForeignKey
ALTER TABLE "sets" ADD CONSTRAINT "sets_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sets" ADD CONSTRAINT "sets_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sets" ADD CONSTRAINT "sets_setting_id_fkey" FOREIGN KEY ("setting_id") REFERENCES "settings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_artists" ADD CONSTRAINT "set_artists_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_artists" ADD CONSTRAINT "set_artists_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_genres" ADD CONSTRAINT "set_genres_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_genres" ADD CONSTRAINT "set_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
