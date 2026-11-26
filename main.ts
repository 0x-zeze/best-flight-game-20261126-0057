import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, type DossierCaps } from './vendor/makefun-game.ts';

const DOSSIER_CAPS: DossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function exportBundle(repoRoot: string, destDir: string): void {
  const gameSrc = join(repoRoot, 'game');
  const shotsSrc = join(repoRoot, 'screenshots');
  const gameDest = join(destDir, 'game');
  const shotsDest = join(destDir, 'screenshots');

  mkdirSync(destDir, { recursive: true });
  rmSync(gameDest, { recursive: true, force: true });
  rmSync(shotsDest, { recursive: true, force: true });

  cpSync(gameSrc, gameDest, { recursive: true });
  mkdirSync(shotsDest, { recursive: true });
  if (existsSync(shotsSrc)) {
    cpSync(shotsSrc, shotsDest, { recursive: true });
  }

  const dossierBytes = buildDossier(destDir, DOSSIER_CAPS);
  writeFileSync(join(destDir, 'dossier.json'), dossierBytes);
}

const repoRoot = dirname(fileURLToPath(import.meta.url));
const targetDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
exportBundle(repoRoot, targetDir);
