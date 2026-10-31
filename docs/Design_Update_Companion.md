# GorgonBuilder — Design Update Companion

**Status:** Living document

## Purpose

Use this file when implementation evidence requires a design change.

Do not silently alter architecture inside a ticket without documenting why.

## Design Change Record Template

### DU-XXXX — Title

**Date:**  
**Triggered by ticket/research:**  
**Affected docs:**  

**Previous assumption:**  
...

**New evidence:**  
...

**Decision:**  
...

**Why:**  
...

**Migration / implementation impact:**  
...

**Tickets affected:**  
...

## Rules

- Product changes should update `Product_Decisions.md`.
- Architecture changes should update `Full_Design_Document.md` and/or `MVP_Technical_Design.md`.
- Formula changes should update `Damage_And_DPS_Model.md`.
- Data interpretation changes should update `Data_Source_And_Normalization.md`.
- Import changes should update `Character_Import_And_Validation.md`.
- Save/share changes should update `Build_Save_And_Share_Design.md`.
- Reorder/scope ticket changes in `Tickets.md`.
- Always update `Repo_Current_State.md` after merged implementation work materially changes the current repo.
