import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';

const game = fileURLToPath(new URL('../', import.meta.url));
const local = join(game, '.local');
const pack = process.env.SKATE_DLC_DIR ? resolve(process.env.SKATE_DLC_DIR)
  : [resolve(game, '../skate20XX-dlc'), join(local, 'skate20XX-dlc')].find(path => existsSync(path));
const command = process.argv[2];
if (!['dev', 'build', 'test'].includes(command)) throw Error('Expected dev, build, or test.');
if (!pack || !existsSync(join(pack, 'src/player/characters/edition.ts'))) {
  throw Error('DLC checkout missing. Place skate20XX-dlc beside the game or set SKATE_DLC_DIR.');
}

// Link individual files so relative imports see one coherent tree, while edits stay in their owning repo.
const view = mkdtempSync(join(tmpdir(), 'skate20xx-edition-'));
process.on('exit', () => rmSync(view, { recursive: true, force: true }));
function linkTree(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) linkTree(from, to);
    else {
      if (existsSync(to)) rmSync(to);
      symlinkSync(from, to);
    }
  }
}
for (const folder of ['src', 'tests', 'scripts', 'docs', 'public']) {
  linkTree(join(game, folder), join(view, folder));
  if (existsSync(join(pack, folder))) linkTree(join(pack, folder), join(view, folder));
}
for (const file of ['index.html', 'tsconfig.json', 'package.json', 'node_modules']) {
  symlinkSync(join(game, file), join(view, file));
}
const config = {
  root: view, configFile: false, resolve: { preserveSymlinks: true },
  cacheDir: join(local, 'vite-dlc'),
  server: { fs: { allow: [view, game, pack] }, watch: { usePolling: true, interval: 300 } },
};
function run(program, args) {
  const child = spawnSync(program, args, { cwd: view, stdio: 'inherit' });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}
if (command === 'test') {
  const files = readdirSync(join(view, 'tests')).filter(file => file.endsWith('.test.ts'));
  run(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', '--experimental-strip-types', '--test',
    ...files.map(file => join(view, 'tests', file))]);
} else if (command === 'build') {
  run(join(game, 'node_modules/.bin/tsc'), ['--project', join(view, 'tsconfig.json')]);
  await build({ ...config, build: { outDir: join(local, 'dist-dlc'), emptyOutDir: true } });
} else {
  const server = await createServer(config);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
  await server.listen();
  console.log('DLC development using', basename(pack));
  server.printUrls();
}
