# Statistical Web — Safe Update Policy

## Branch roles
- `master`: production only. GitHub Pages deploys only from this branch.
- `development`: all new features and fixes are implemented and validated here first.
- `stable`: last user-confirmed stable production snapshot. Do not develop directly on this branch.

## Required update flow
1. Make changes on `development` only.
2. Let `Validate Statistical Web` complete successfully.
3. Review the change and confirm the app still behaves correctly.
4. Promote the validated `development` commit to `master`.
5. After the user confirms production is stable, move `stable` to the same commit.

## CI gates
A change is not production-ready unless all of these pass:
- JavaScript syntax checks for core modules.
- UI contract test: required button/modal IDs exist, no duplicate IDs, core modules are loaded as ES modules, and core controls are referenced by their handlers.
- Vite production build.
- Built-site test: `dist/index.html` must use bundled assets, must not reference `/src/*.js` or `/src/*.css`, and the JavaScript bundle must contain the core controls.

## Deployment rule
Production deployment must use the repository workflow `.github/workflows/deploy.yml` and the Vite `dist/` artifact. Do not deploy the source branch through Jekyll/"Deploy from a branch".

## Rollback rule
If production regresses, immediately restore `master` from `stable`. Do not guess a historical commit from chat timestamps.

## Change-size rule
Do not combine unrelated changes to statistics, UI, export, and deployment in one production update. Make one focused change, validate it, then continue.
