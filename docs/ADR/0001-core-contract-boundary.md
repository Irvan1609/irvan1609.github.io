# ADR-0001 — Common Core Contract Boundary

Status: Accepted

Agrotik introduces a Common Core boundary as an additive compatibility layer before migrating existing modules.

Core owns identity, persistence contracts, schema versions, events, settings, overlay coordination, diagnostics, and module registration.

Modules own domain behavior.

Existing legacy globals remain temporarily supported so migration is incremental and reversible.
