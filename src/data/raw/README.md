# Official raw snapshots (T0002)

Run from the repository root with the Node version required by `package.json`:

```sh
npm ci
npm run data:update                      # reuse the pin, or discover and pin initially
npm run data:update -- --version v490    # explicitly select an upstream version
npm run data:update -- --latest          # explicitly discover and select the current version
npm run data:update -- --check           # validate the current pin/cache, with no network
```

`data:update` is a development command. The frontend, production build, and normal
page loads do not invoke it. There is no normalization or gameplay interpretation.
Node's environment proxy support is enabled for the update process; inherited
proxy/CA settings remain in effect. Allow `cdn.projectgorgon.com` in restricted
network environments. HTTP failures, timeouts, redirects, or invalid JSON fail the
update rather than being labeled as unpublished data.

## Official publication

Discovery reads <https://cdn.projectgorgon.com/>, which links/refreshes to a
versioned index such as <https://cdn.projectgorgon.com/v490/data/index.html>.
The index is the authority for file availability. Dataset URLs are direct children
of that exact version's `data/` directory. No permanent version is embedded in the
pipeline. Use `--latest` or `--version` deliberately when upgrading.

The official index also documents `http://client.projectgorgon.com/fileversion.txt`
as a version source. This workflow uses the verified CDN root instead, keeping
acquisition on one HTTPS host. It never follows a changing version alias for data.

Required: `skills`, `advancementtables`, `abilities`, `abilitykeywords`, `items`,
`tsysclientinfo` (including powers/tiers), `tsysprofiles`, `attributes`, `effects`.

Optional if absent from the versioned index: `abilitydynamicdots`,
`abilitydynamicspecialvalues`, `sources_items`, `sources_abilities`. If listed,
each must download and validate successfully. Its absence is only recorded as
`not-published` when the otherwise valid official index does not list it. This is
evidence about the public index, not proof that no unlisted file exists.

The v490 index lists all 13 targets. It does not list a separate general dynamic
ability values file; the published ability/keyword/DoT/special-value inputs are
retained without inventing a filename or replacement content. Progression rewards
remain inside the original skill and advancement records.

Shapes differ: keywords/DoTs/special values are arrays of objects; treasure
profiles map names to string arrays; advancement tables map names to level maps;
sources map original IDs to objects with `entries` arrays; other datasets map
original identifiers to objects. Validation checks structure, not gameplay rules
or cross-dataset semantic references. Unknown fields are retained byte for byte.

## Pin, manifest, and cache

After a successful acquisition, commit `src/data/raw/snapshot.json` to pin it.
It is both the pin and the reviewable source manifest:

- `schemaVersion`, `pipelineVersion`, `upstreamVersion`, `fetchedAt` (UTC)
- `sourceIndex`: exact URL, SHA-256, and original byte count
- `datasets`: names, required flags, exact source URLs, availability, and for
  available files, SHA-256, original byte counts and top-level record counts
- absent optional files carry an explicit reason, with no fabricated hashes/data

Downloaded bytes, the index, and a copy of the manifest live in ignored
`src/data/raw/cache/<version>/`. They are separate from hand-written adapters and
never imported by React. Downloads are validated in a temporary directory and
published only when the whole snapshot passes. A directory lock rejects concurrent
updates. An interrupted process may leave `.update-lock` or an ignored staging
directory; remove those only after confirming the process has stopped.

A matching complete cache is validated and reused without any network or file
rewrites, including timestamps. A fresh clone with a committed manifest downloads
the pinned URLs and verifies every byte hash against that manifest, preserving its
original timestamp. A partial or corrupt existing cache fails clearly; it is never
silently rehashed or blessed. To restore it, remove the affected version directory
and rerun with the pin intact. Republished upstream bytes that disagree with the
pin are refused. An explicit different version may be selected independently.

The official publisher only guarantees a few recent versions, so an old pin may
become unavailable upstream. Keep the ignored raw directory in an external archive
if long-term reproduction is needed. The local hashes detect corruption and changes
relative to the reviewed pin; they are not signatures from the publisher.

## Verification

Run the update twice. Compare `snapshot.json`, file hashes, and modification times;
the second run must say `Validated/reused`. Then run `--check` without network.
Inspect `cache/<version>/skills.json` (e.g. `Alchemy`, `Psychology`, `Cow`, `Unarmed`,
`Deer`), `abilities.json`, and `items.json`: original keys and bytes must remain
unchanged. Remove a cached file or alter a byte, verify the command fails, then
remove that version's cache directory and rerun to restore from the pin.

Offline fixtures in `scripts/fixtures/source-shapes.json` are small structural
examples, not a game snapshot. Records have been reduced; fixture IDs and omitted
fields are not completeness or gameplay assertions. No live acquisition is
claimed by an offline test run. The implementation report/PR records live fetch
results and any remaining network restrictions.

The official publication requires Elder Game attribution when game text becomes
player-visible. This ticket leaves the frontend untouched; include that attribution
when a later ticket displays data.
