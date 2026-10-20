import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { guvenliYol, tarAc, tarOku } from './tar-oku.ts';

// Elle kurulan ustar girdisi: kuşkulu yolları git üretmez, okuyucunun reddi bununla sınanır.
function girdi(ad: string, veri: string, tur = '0'): Buffer {
  const baslik = Buffer.alloc(512);
  baslik.write(ad, 0, 100, 'utf8');
  baslik.write('0000644\0', 100, 'ascii');
  baslik.write(`${Buffer.byteLength(veri).toString(8).padStart(11, '0')}\0`, 124, 'ascii');
  baslik.write('00000000000\0', 136, 'ascii');
  baslik.write(tur, 156, 'ascii');
  baslik.write('ustar\0', 257, 'ascii');
  baslik.write('        ', 148, 'ascii');
  let toplam = 0;
  for (const b of baslik) toplam += b;
  baslik.write(`${toplam.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  const govde = Buffer.alloc(Math.ceil(Buffer.byteLength(veri) / 512) * 512);
  govde.write(veri, 'utf8');
  return Buffer.concat([baslik, govde]);
}
const arsiv = (...girdiler: Buffer[]): Buffer => gzipSync(Buffer.concat([...girdiler, Buffer.alloc(1024)]));

test('git archive çıktısı ağaçtaki dosyalarla aynı açılır (pax genel başlığı atlanır)', () => {
  const kok = fileURLToPath(new URL('../', import.meta.url));
  const gz = execFileSync('git', ['archive', '--format=tar.gz', 'HEAD', 'araclar/paket-bin.ts', 'package.json'], { cwd: kok });
  const girdiler = tarOku(gz).filter((g) => g.tur === 'dosya');
  assert.deepEqual(girdiler.map((g) => g.yol).sort(), ['araclar/paket-bin.ts', 'package.json']);
  const hedef = mkdtempSync(join(tmpdir(), 'tmiv2-tar-'));
  try {
    assert.equal(tarAc(gz, hedef), 2);
    const beklenen = execFileSync('git', ['show', 'HEAD:package.json'], { cwd: kok });
    assert.equal(readFileSync(join(hedef, 'package.json')).equals(beklenen), true);
  } finally {
    rmSync(hedef, { recursive: true, force: true });
  }
});

test('pax uzun adı kullanılır; klasör ve dosya açılır', () => {
  const uzun = `${'a'.repeat(120)}/b.txt`;
  const pax = `path=${uzun}\n`;
  const kayit = `${String(Buffer.byteLength(pax) + 4)} ${pax}`;
  assert.equal(Buffer.byteLength(kayit), Number(kayit.split(' ')[0]));
  const girdiler = tarOku(arsiv(girdi('k/', '', '5'), girdi('PaxHeader', kayit, 'x'), girdi('kisa', 'icerik')));
  assert.deepEqual(girdiler.map((g) => [g.yol, g.tur, g.veri.toString()]), [['k', 'klasor', ''], [uzun, 'dosya', 'icerik']]);
});

test('klasörden çıkan, mutlak, sürücü harfli ya da ters eğik çizgili yol ve bağ reddedilir; hiçbir şey yazılmaz', () => {
  for (const ad of ['../disari.txt', '/etc/x', 'C:/x', 'a\\..\\b', 'a/../../b', './', 'a//b']) {
    assert.throws(() => guvenliYol(ad), /güvensiz yol/, ad);
  }
  assert.equal(guvenliYol('./a/b/'), 'a/b');
  const hedef = mkdtempSync(join(tmpdir(), 'tmiv2-tar-'));
  try {
    assert.throws(() => tarAc(arsiv(girdi('iyi.txt', 'x'), girdi('../kotu.txt', 'y')), hedef), /güvensiz yol/);
    assert.throws(() => tarAc(arsiv(girdi('bag', '', '2')), hedef), /desteklenmeyen/);
    assert.deepEqual(readdirSync(hedef), [], 'bozuk arşiv yarım klasör bırakmaz');
  } finally {
    rmSync(hedef, { recursive: true, force: true });
  }
});

test('sağlaması tutmayan ya da eksik arşiv reddedilir', () => {
  const bozuk = girdi('a.txt', 'icerik');
  bozuk[0] = 0x62;
  assert.throws(() => tarOku(arsiv(bozuk)), /sağlaması/);
  const tam = Buffer.concat([girdi('a.txt', 'x'.repeat(2000))]);
  assert.throws(() => tarOku(gzipSync(tam.subarray(0, 1024))), /eksik/);
});
