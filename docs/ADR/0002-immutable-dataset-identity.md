# ADR-0002 — Immutable Dataset Identity

Status: Accepted

Every Dataset will have an immutable dataset_uid. Dataset name is a display property only.

Legacy name-based storage remains compatible during migration.

Rename must never change Dataset identity. Cross-module references should migrate to dataset_uid.
