# Public build protection

`npm run build` minifies JavaScript copied from `public/` using the esbuild
transform already supplied by Vite. Paths, module exports and browser APIs stay
intact. The transform preserves the existing modern syntax target and retains
legal comments. No extra runtime, network request or paid service is added.
Vite continues to bundle application entry points and lazy analysis chunks.

Only deploy `dist/`. Source maps are disabled. The build rejects source-map files
and references, server/source directories, environment files, SQL and common
private-key formats in the output. This is a deployment guard, not a complete
secret scanner: never place credentials in public assets or client-side code.
Public API URLs and Turnstile site keys are intentionally public.

`npm run test:dist` checks the output and tests forbidden artifact rejection,
built service-worker offline behavior, and detector exports/calculation parity.

Minification raises the effort required to read code but cannot prevent copying
HTML, CSS, JavaScript, public models or other browser-delivered assets. A public
GitHub repository still exposes the original source. Make the repository private
only after replacement hosting is verified and the old site's availability is
addressed. Previously downloaded copies cannot be recalled.

Keep credentials and authorization on the Worker. Browser payment screens and
CORS alone cannot enforce paid access. Existing offline calculations remain
client-side and inspectable. This change does not claim to hide those algorithms
or modify the production Worker's authorization rules.
