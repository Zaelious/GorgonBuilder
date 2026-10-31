# GorgonBuilder — Repository Current State

**Last updated:** 2026-10-31  
**Canonical repository:** `Zaelious/GorgonBuilder`  
**Default branch:** `main`

## Current Status

Pre-implementation documentation foundation.

At the time this document was prepared, the repository began with only:

- `README.md`
- `LICENSE`

The initial architecture/documentation pack is being committed before T0001.

## Completed Tickets

None.

## Active Ticket

None.

## Planned Next Ticket

**T0001 — Project Foundation**

The current condensed v1 backlog is **T0001–T0021**. It replaces the earlier 50-ticket draft before implementation began.

## Intended Initial Stack

- Vite
- React
- strict TypeScript
- Vitest
- CSS/CSS Modules
- provider-agnostic persistence interface

## Current Source Tree

No application source tree exists yet.

T0001 will create the complete project foundation: Vite/React/strict TypeScript, quality tooling, baseline architecture folders, tests, and the initial app shell.

## Game Data

No normalized game-data snapshot has been committed yet.

Official Project Gorgon data ingestion/normalization is now concentrated in T0002–T0006, including advancement tables, dynamic ability data, TSys profiles, completeness checks, and the runtime data repository.

## Character Import Research

Feasibility confirmed from supplied Project Gorgon JSON reports.

CharacterSheet can expose skills/known abilities/CurrentStats and character metadata.

Storage can expose real item instances and exact TSys powers/tiers.

Important constraint:

`IsInInventory` is not treated as definitive equipped status.

A report's freshness is determined by its export timestamp. The supplied sample was old; a newly generated export is expected to provide a current snapshot of fields supported by the current report format.

## Build/Test Status

No Node project exists yet, so there are no application build/test results.

## Known Issues

See `docs/Known_Issues_And_Followups.md`.

## Documentation Rule

After every merged implementation ticket, update this file with:

- completed tickets
- active/next ticket
- relevant folder structure
- installed dependencies
- available scripts
- build/test status
- known issues
- material architecture changes
