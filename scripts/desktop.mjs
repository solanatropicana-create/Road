/**
 * Copies the Vite build into the desktop shell (desktop/app). Run after
 * `vite build`; then `npm --prefix desktop start` runs it, and
 * `npm --prefix desktop run dist:win` packs a Windows build.
 */
import { cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

rmSync('desktop/app', { recursive: true, force: true });
cpSync('dist', 'desktop/app', { recursive: true });
// The shell's version follows the game's.
const v = JSON.parse(readFileSync('package.json', 'utf8')).version;
const pkg = JSON.parse(readFileSync('desktop/package.json', 'utf8'));
if (pkg.version !== v) {
  pkg.version = v;
  writeFileSync('desktop/package.json', JSON.stringify(pkg, null, 2) + '\n');
}
console.log(`desktop/app ← dist (v${v})`);
