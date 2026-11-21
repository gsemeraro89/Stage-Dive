-- HD page (owner, 21 Nov 2026): YouTube's video definition ("hd" or "sd"), filled in by the collector and the refresh.
ALTER TABLE "concerts" ADD COLUMN "definition" TEXT;

CREATE INDEX "concerts_definition_status_idx" ON "concerts"("definition", "status");
