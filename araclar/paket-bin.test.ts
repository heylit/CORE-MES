import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { npmCliBul } from './paket-bin.ts';

const node = join('/nodejs', 'node');
const yanindaki = join('/nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js');
const libAltindaki = join('/nodejs', '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');

test('npm run içinden açılınca npm ortamdaki npm_execpath\'tir', () => {
  const ortamdaki = join('/baska', 'npm-cli.js');
  assert.equal(npmCliBul({ npm_execpath: ortamdaki }, node, () => true), ortamdaki);
});

test('npm_execpath yoksa (bekçi, başlangıç betiği) npm node\'un yanında, sonra lib altında aranır', () => {
  assert.equal(npmCliBul({}, node, (yol) => yol === yanindaki), yanindaki);
  assert.equal(npmCliBul({}, node, (yol) => yol === libAltindaki), libAltindaki);
});

test('npm-cli.js olmayan npm_execpath (ör. pnpm, yarn) kullanılmaz; hiçbir yerde yoksa null', () => {
  assert.equal(npmCliBul({ npm_execpath: join('/baska', 'pnpm.cjs') }, node, (yol) => yol === yanindaki), yanindaki);
  assert.equal(npmCliBul({}, node, () => false), null);
});

test('bu makinede npm ortam değişkeni olmadan da bulunur', () => {
  assert.notEqual(npmCliBul({}), null);
});
