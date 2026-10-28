// node scripts/check-version.mjs [tag]     e.g. v0.2.0 or v0.2.0-next.1
// package.json is the single source of truth (tauri.conf.json reads it through
// "version": "../package.json"); Cargo.toml must agree, and so must the release tag.
import { readFileSync } from 'node:fs';

const here = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, here), 'utf8');

const pkg = JSON.parse(read('package.json')).version;
const cargo = /^\[package\][^[]*?^version\s*=\s*"([^"]+)"/ms.exec(read('src-tauri/Cargo.toml'))?.[1];
// A path in the "version" field of tauri.conf.json means "read it from that package.json".
const confVersion = JSON.parse(read('src-tauri/tauri.conf.json')).version;
const conf = /package\.json$/.test(confVersion ?? '') ? pkg : confVersion;
const tag = process.argv[2]?.replace(/^v/, '');

const versions = {
  'package.json': pkg,
  'src-tauri/Cargo.toml': cargo,
  'src-tauri/tauri.conf.json': conf,
  ...(tag ? { tag } : {}),
};
console.log(versions);
if (new Set(Object.values(versions)).size !== 1 || Object.values(versions).includes(undefined)) {
  console.error('version mismatch');
  process.exit(1);
}
