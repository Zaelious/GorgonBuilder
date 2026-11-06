-- T0018 migration 0001: Better Auth core account/session tables.
--
-- Generated from better-auth 1.7.18 `getMigrations(...).compileMigrations()` (SQLite/D1 dialect)
-- for the option set in worker/auth-probe/auth-options.ts: OAuth-only (Discord + Google),
-- no email/password, default model and field names. These tables are owned by the auth
-- library; application data lives in 0002. worker/auth-probe/auth-schema.test.ts fails if
-- Better Auth would need any further table or column after all committed migrations.
--
-- Contents are private account data: "user".email/name/image come from the OAuth provider and
-- must never appear in public API responses; "account" may hold provider tokens (T0019 enables
-- encryptOAuthTokens); "account".password stays NULL because email/password is not enabled.
-- Do NOT edit an applied migration; add a new numbered file instead.

create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);
create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");
