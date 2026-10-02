/**
 * Scaffold a new game package from templates/game.
 *
 * Usage: pnpm new-game <id> ["Display Name"]
 *   id: lowercase kebab-case, e.g. `liars-dice`
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateRegistry } from './gen-registry';

const root = join(import.meta.dirname, '..');
const [id, displayName] = process.argv.slice(2);

if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
  console.error('Usage: pnpm new-game <id> ["Display Name"]   (id: lowercase kebab-case)');
  process.exit(1);
}

const target = join(root, 'packages/games', id);
if (existsSync(target)) {
  console.error(`packages/games/${id} already exists`);
  process.exit(1);
}

const words = id.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1));
const sdkPkg = JSON.parse(readFileSync(join(root, 'packages/game-sdk/package.json'), 'utf8'));
const webPkg = JSON.parse(readFileSync(join(root, 'apps/web/package.json'), 'utf8'));
const replacements: Record<string, string> = {
  __GAME_ID__: id,
  __GAME_NAME__: displayName ?? words.join(' '),
  __GAME_STATE__: words.join(''),
  __SCHEMA_VERSION__: sdkPkg.dependencies['@colyseus/schema'],
  __ZOD_VERSION__: sdkPkg.dependencies.zod,
  __REACT_VERSION__: webPkg.dependencies.react,
  __REACT_TYPES_VERSION__: sdkPkg.devDependencies['@types/react'],
};

function copy(from: string, to: string) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const source = join(from, name);
    const dest = join(to, name);
    if (statSync(source).isDirectory()) {
      copy(source, dest);
      continue;
    }
    let content = readFileSync(source, 'utf8');
    for (const [key, value] of Object.entries(replacements))
      content = content.replaceAll(key, value);
    writeFileSync(dest, content);
  }
}

copy(join(root, 'templates/game'), target);
generateRegistry();
execSync('pnpm install', { cwd: root, stdio: 'inherit' });

console.log(`
Created packages/games/${id}

  src/manifest.ts   name, player counts, settings
  src/state.ts      synced state (shared by server and client)
  src/server.ts     messages, win condition
  src/client.tsx    the game UI
  test/             unit tests (pnpm --filter @games/game-${id} test)

It's already registered with the game server and the web app.
`);
