-- T0018 migration 0002: public author profiles and account-owned saved builds.
--
-- Ownership is the stable server-generated "user"."id"; usernames, emails and OAuth IDs
-- never authorize anything. Indexed columns (skill_a_id, skill_b_id, schema_version,
-- game_data_version) are derived server-side from the validated BuildDocument v1 in
-- build_json (src/persistence/remote/build-record.ts) and are never client-authoritative.
-- Raw CharacterSheet/Storage reports are never stored or indexed.
--
-- Visibility: 'private' (default, owner-only) | 'unlisted' (link-readable, never listed)
-- | 'public' (readable and listed). Every public listing/search/count query MUST include
-- `visibility = 'public'`; the partial indexes below exist only for that predicate.
-- Do NOT edit an applied migration; add a new numbered file instead.

CREATE TABLE "profile" (
  "user_id" TEXT NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  -- Display form, e.g. 'MooCow'. Rules live in src/persistence/remote/username.ts.
  "username" TEXT NOT NULL CHECK (length("username") BETWEEN 3 AND 24),
  -- Case-insensitive uniqueness key; ASCII-only handles make lower() exact.
  "username_normalized" TEXT NOT NULL UNIQUE CHECK ("username_normalized" = lower("username")),
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE "build" (
  -- Opaque 16-character base64url public ID (src/persistence/remote/build-id.ts).
  "id" TEXT NOT NULL PRIMARY KEY CHECK (length("id") = 16),
  "owner_user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "visibility" TEXT NOT NULL DEFAULT 'private' CHECK ("visibility" IN ('private', 'unlisted', 'public')),
  "title" TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 120),
  "public_description" TEXT NOT NULL DEFAULT '' CHECK (length("public_description") <= 2000),
  "skill_a_id" TEXT,
  "skill_b_id" TEXT,
  "schema_version" INTEGER NOT NULL CHECK ("schema_version" >= 1),
  "game_data_version" TEXT NOT NULL,
  -- Canonical BuildDocument JSON, at most 256 KiB of UTF-8.
  "build_json" TEXT NOT NULL CHECK (json_valid("build_json") AND length(CAST("build_json" AS BLOB)) <= 262144),
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" >= 1),
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

-- Owner library (My Builds): every visibility, newest first.
CREATE INDEX "build_owner_recent_idx" ON "build" ("owner_user_id", "updated_at" DESC, "id" DESC);
-- Public-only partial indexes for the default directory, author profiles and skill filters.
CREATE INDEX "build_public_recent_idx" ON "build" ("updated_at" DESC, "id" DESC) WHERE "visibility" = 'public';
CREATE INDEX "build_public_owner_idx" ON "build" ("owner_user_id", "updated_at" DESC, "id" DESC) WHERE "visibility" = 'public';
CREATE INDEX "build_public_skill_a_idx" ON "build" ("skill_a_id", "updated_at" DESC, "id" DESC) WHERE "visibility" = 'public';
CREATE INDEX "build_public_skill_b_idx" ON "build" ("skill_b_id", "updated_at" DESC, "id" DESC) WHERE "visibility" = 'public';
