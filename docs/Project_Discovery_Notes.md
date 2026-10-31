# GorgonBuilder — Discovery Notes

**Status:** Discovery concluded; retained for historical context  
**Date:** 2026-10-31

## Problem

Existing Project Gorgon planning tools are useful for selecting skills, items, and mods, but the desired product should go further into quantitative theorycrafting.

## Core Need

The user wants to understand:

- which real gear/mods best support a build
- how each ability scales
- how different damage-modifier categories interact
- how Mastery Sparks change builds
- how builds compare side by side
- eventually how rotations, AoE, defense, threat, and optimization compare

## Product Roles

- Customer/Product Owner: Matt
- Architect/Planner/Scrum Manager: ChatGPT
- Implementation Developer: Codex

## Key Discovery Decisions

- Two skill selectors, any combination, same skill allowed twice.
- Real database items, searchable by name/effect.
- Global minimum-level filter, commonly 90+.
- Candidate mod planning is permissive rather than tightly legality-policed.
- Per-ability damage before DPS.
- Skill Base Damage applies only to original ability base.
- Sparks are first-class, especially MainHand/OffHand/Ring/Necklace.
- Saving/sharing is core.
- Anonymous ownership requires backend persistence even without accounts.
- Character import is feasible and useful for validation.
- Rotation simulation must be stateful and user-defined; one universal rotation is not valid.
- Rotation work is deferred until the core calculator is trustworthy.

## Import Discovery

Supplied reports demonstrate:

CharacterSheet:
- skills/levels/abilities
- CurrentStats
- character/server/timestamp

Storage:
- real item instances
- TSys powers/tiers
- item metadata

The supplied export was an older snapshot. A new export should be treated as current according to its new timestamp and current report fields.

`IsInInventory` is not a reliable equipped flag.

Individual Mastery Spark outcomes are not assumed available from the observed report fields.
