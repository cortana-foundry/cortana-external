ALTER TABLE "mc_codex_threads"
  ADD COLUMN "lifecycle_state" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "last_reconciled_at" TIMESTAMPTZ(3);

CREATE INDEX "mc_codex_threads_lifecycle_state_updated_at_idx"
  ON "mc_codex_threads"("lifecycle_state", "updated_at" DESC);
