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
CREATE TABLE "classifier_batches" (
    "id" SERIAL NOT NULL,
    "batch_id" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "youtube_ids" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "classifier_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "classification_cache_youtube_id_key" ON "classification_cache"("youtube_id");

-- CreateIndex
CREATE INDEX "classification_cache_created_at_idx" ON "classification_cache"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "classifier_batches_batch_id_key" ON "classifier_batches"("batch_id");

-- CreateIndex
CREATE INDEX "classifier_batches_status_idx" ON "classifier_batches"("status");
