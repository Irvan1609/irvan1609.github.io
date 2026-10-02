# Agrotik Architecture Audit v1

Baseline: master at 0efb951fd6f5daa11370706e16567b4475c72557
Target: Agrotik Master Specification v1.0

## Current strengths
- IndexedDB already exists for large/local Statistical Web datasets.
- Service Worker/PWA and resilience diagnostics already exist.
- Statistical calculations are modularized and heavy workflows are lazy-loaded.
- Data Editor already has undo/redo, virtualization, metadata, import/export, and compact mobile navigation work.
- Analysis audit/integrity helpers already exist.
- Field Zero has isolated game code and recovery/save mechanisms.
- Cloud dataset sync already uses queued/debounced operations.
- UI contract scripts already enforce many mobile and regression requirements.

## Architecture gaps
1. No single explicit Common Core contract. Responsibilities are distributed across main.js, local-dataset-store.js, research-workspace.js, account-dataset-sync.js, resilience.js, and module code.
2. No canonical dataset_uid found in the current code search. Dataset identity remains strongly name/key based.
3. No first-class analysis_uid contract. Analysis history has generated IDs but is not yet a shared Analysis Core object.
4. localStorage remains a broad state bus for dataset manifests, history, metadata, queues, settings, and module state.
5. StatisticalWebData is exposed through globalThis and several modules communicate through DOM events/global objects.
6. Dataset DB schema is versioned, but Dataset/Analysis/History/API contracts do not yet share one schema registry.
7. Overlay exclusivity exists in navigation.js but ownership remains distributed.
8. Stable cross-module error codes are not yet centralized.
9. There is no formal module lifecycle/capability registry.

## Risk
HIGH: in-place identity/storage rewrite.
HIGH: one-pass /stat rewrite.
MEDIUM: Core adapters, centralized overlay/settings, module contracts.
LOW: versioned contracts, ADRs, diagnostics codes, compatibility adapters.

## Refactor strategy
1. Add Core contracts without changing visible behavior.
2. Add stable identity/provenance adapters.
3. Route existing Dataset operations through Core adapters.
4. Move research metadata/history toward IndexedDB.
5. Introduce first-class Analysis objects while preserving legacy history.
6. Centralize overlay management.
7. Formalize module registry/capabilities.
8. Add contract/regression tests.
9. Remove legacy pathways only after compatibility tests pass.

No big-bang rewrite. Existing user data and workflows must remain recoverable.
