/**
 * Turns the Vite build into one self-contained page for publishing:
 * strips the document wrapper (the host adds its own) and inlines the bundle.
 * Run after `vite build`: node scripts/artifact.mjs
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const js = readdirSync('dist/assets').filter((f) => f.endsWith('.js'));
if (js.length !== 1) throw new Error(`expected one bundle, got ${js.join(', ')}`);
const code = readFileSync(`dist/assets/${js[0]}`, 'utf8').replace(/<\/script/gi, '<\\/script');

const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const links = [...html.matchAll(/<link[^>]+>/g)].map((m) => m[0]).filter((l) => !l.includes('modulepreload'));
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html
  .match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<script[^>]*src=[^>]*><\/script>/g, '')
  .trim();

const out = [title, ...links, style, body, `<script type="module">${code}</script>`].join('\n');
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/underfoot.html', out);
console.log(`dist-artifact/underfoot.html ${(out.length / 1024).toFixed(0)} KB`);
