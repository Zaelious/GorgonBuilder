# Remote persistence contracts (T0018)

Provider-neutral contracts for account-owned saved builds. T0019 implements `BuildRepository` on native Cloudflare D1 behind `/api/*`.
Hosted staging remains owner-action pending; production stays unbound. See [verification](../../../docs/T0019_Verification.md).

| File | Purpose |
|---|---|
| `build-repository.ts` | Async `BuildRepository` interface, result/error codes, pagination |
| `build-record.ts` | `BuildRecord`/`BuildSummary`, visibility, limits, `prepareBuildDocument` (validates BuildDocument v1 and derives indexed metadata server-side) |
| `access.ts` | `Actor` (guest or server-verified `userId`) and pure read/modify/listing rules |
| `build-id.ts` | Opaque 96-bit base64url build IDs |
| `username.ts` | Public handle validation, normalization and reserved names |
| `search-contract.ts` | T0020-F1 Public search query contract and reference predicate |
| `testing/` | **Test-only**: deterministic in-memory fake, fixtures and the shared contract suite (ESLint blocks production imports) |

Rules: owner = verified `userId` only; Private (default) is owner-only and returns
`not_found` to others; Unlisted is link-readable but never listed; Public is readable
and listed; only owners modify; copies are new Private records owned by the copier.
BuildDocument v1 is stored unchanged; owner, visibility, title and description are record
fields, never document fields. See [the T0018 ADR](../../../docs/T0018_Backend_Architecture_ADR.md).

`d1-build-repository.ts` uses conditional SQL writes and keyset queries. Its internal
record contract preserves exact owner JSON and exact copies by default. The Worker
configures `foreignCopyDocument: publicDocument` so copies by another account never
receive original private metadata. `public-document.ts` is the audited allowlist for
every non-owner response. Callers must serialize via `worker/api/dto.ts`, never expose
repository rows. The shared T0018 suite is unchanged and runs against native local D1.
