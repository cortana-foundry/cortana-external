CREATE TABLE "mc_codex_threads" (
    "id" TEXT NOT NULL,
    "thread_name" TEXT,
    "cwd" TEXT,
    "model" TEXT,
    "source" TEXT,
    "cli_version" TEXT,
    "last_message_preview" TEXT,
    "transcript_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_turn_started_at" TIMESTAMPTZ(3),
    "last_turn_completed_at" TIMESTAMPTZ(3),
    "metadata" JSONB,

    CONSTRAINT "mc_codex_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mc_codex_turns" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "duration_ms" INTEGER,
    "total_tokens" INTEGER,
    "input_tokens" INTEGER,
    "cached_input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "reasoning_output_tokens" INTEGER,
    "model_context_window" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "mc_codex_turns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mc_codex_messages" (
    "row_id" BIGSERIAL NOT NULL,
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "turn_id" TEXT,
    "role" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "phase" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "metadata" JSONB,

    CONSTRAINT "mc_codex_messages_pkey" PRIMARY KEY ("row_id")
);

CREATE UNIQUE INDEX "mc_codex_messages_id_key" ON "mc_codex_messages"("id");
CREATE INDEX "mc_codex_threads_updated_at_idx" ON "mc_codex_threads"("updated_at" DESC);
CREATE INDEX "mc_codex_threads_last_turn_completed_at_idx" ON "mc_codex_threads"("last_turn_completed_at" DESC);
CREATE INDEX "mc_codex_turns_thread_id_started_at_idx" ON "mc_codex_turns"("thread_id", "started_at" DESC);
CREATE INDEX "mc_codex_messages_thread_id_row_id_idx" ON "mc_codex_messages"("thread_id", "row_id" ASC);
CREATE INDEX "mc_codex_messages_turn_id_row_id_idx" ON "mc_codex_messages"("turn_id", "row_id" ASC);

ALTER TABLE "mc_codex_turns"
  ADD CONSTRAINT "mc_codex_turns_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "mc_codex_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mc_codex_messages"
  ADD CONSTRAINT "mc_codex_messages_thread_id_fkey"
  FOREIGN KEY ("thread_id") REFERENCES "mc_codex_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mc_codex_messages"
  ADD CONSTRAINT "mc_codex_messages_turn_id_fkey"
  FOREIGN KEY ("turn_id") REFERENCES "mc_codex_turns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
