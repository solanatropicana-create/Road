/**
 * Turns the Vite build into one self-contained page for publishing:
 * drops the document wrapper (the host adds its own) and inlines CSS and JS.
 * Run after `vite build`: node scripts/artifact.mjs
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const assets = readdirSync('dist/assets');
const js = assets.filter((f) => f.endsWith('.js'));
const css = assets.filter((f) => f.endsWith('.css'));
if (js.length !== 1 || css.length !== 1) throw new Error(`expected one js and one css, got ${assets.join(', ')}`);
const code = readFileSync(`dist/assets/${js[0]}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const style = readFileSync(`dist/assets/${css[0]}`, 'utf8').replace(/<\/style/gi, '<\\/style');

const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
// Keep font and icon links; local stylesheet/modulepreload links are inlined instead.
const links = [...html.matchAll(/<link[^>]+>/g)].map((m) => m[0]).filter((l) => !l.includes('modulepreload') && !l.includes('./assets/'));
const body = html
  .match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<script[^>]*src=[^>]*><\/script>/g, '')
  .trim();

const out = [title, ...links, `<style>${style}</style>`, body, `<script type="module">${code}</script>`].join('\n');
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/dalga.html', out);
console.log(`dist-artifact/dalga.html ${(out.length / 1024).toFixed(0)} KB`);
