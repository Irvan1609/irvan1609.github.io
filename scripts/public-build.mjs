import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { transformWithEsbuild } from 'vite';

async function filesUnder(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Deployment contains symlink: ${name}`);
    if (entry.isDirectory()) files.push(...await filesUnder(root, name));
    else files.push(name);
  }
  return files;
}

export async function assertSafeArtifacts(root) {
  for (const name of await filesUnder(root)) {
    if (/(^|\/)(?:\.git|\.github|node_modules|cloudflare|payment-worker|src|scripts)(\/|$)/i.test(name)
      || /(^|\/)(?:\.env(?:\..*)?|wrangler\.[^/]+|package(?:-lock)?\.json)$/i.test(name)
      || /\.(?:map|sql|pem|key|p12|pfx)$/i.test(name)) {
      throw new Error(`Private/source artifact must not be deployed: ${name}`);
    }
    if (/\.(?:js|css)$/.test(name) && /[#@]\s*sourceMappingURL\s*=/.test(await readFile(path.join(root, name), 'utf8'))) {
      throw new Error(`Public source map reference: ${name}`);
    }
  }
}

export default function publicBuild() {
  let config;
  return {
    name: 'minify-and-validate-public-build',
    apply: 'build',
    configResolved(value) { config = value; },
    async closeBundle() {
      const output = path.resolve(config.root, config.build.outDir);
      if (config.publicDir) {
        for (const name of await filesUnder(config.publicDir)) {
          if (!name.endsWith('.js')) continue;
          const filename = path.join(output, name);
          const result = await transformWithEsbuild(await readFile(filename, 'utf8'), name, {
            minify: true,
            sourcemap: false,
            target: 'esnext',
            legalComments: 'inline',
          });
          await writeFile(filename, result.code);
        }
      }
      await assertSafeArtifacts(output);
    },
  };
}
