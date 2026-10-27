import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import type { Db } from '#cekirdek/db.ts';
import { bag, kablola, sunucununBaglari } from './kablolama.ts';
import { emirIptalBildir } from './moduller/uretim-emirleri/emir-olaylari.ts';

// Dinleyicinin koştuğu, gönderdiği sorgulardan anlaşılır: sahte bağlantı her sorguyu sayar, boş sonuç döner.
function sayanDb(): { db: Db; sayi: () => number } {
  let n = 0;
  return {
    db: { sorgu: async () => { n++; return []; }, tek: async () => { n++; return null; } },
    sayi: () => n,
  };
}

const OLAY = { uretimEmriId: 1, kisiId: 1 };

test('kablola: emir iptali stoğa ulaşır; ikinci çağrı dinleyiciyi ikiler değil', async () => {
  kablola();
  const ilk = sayanDb();
  await emirIptalBildir(ilk.db, OLAY);
  assert.ok(ilk.sayi() > 0, 'stok dinleyicisi koşmadı');

  kablola();
  const ikinci = sayanDb();
  await emirIptalBildir(ikinci.db, OLAY);
  assert.equal(ikinci.sayi(), ilk.sayi());
});

test('kablolanmadan bütün modüller yüklenince hiçbir dinleyici kendiliğinden kaydolmaz', () => {
  const url = (yol: string): string => pathToFileURL(join(import.meta.dirname, yol)).href;
  const betik = `
    const { modulBasinaUclar } = await import(${JSON.stringify(url('cekirdek/uygulama.ts'))});
    const { emirIptalBildir } = await import(${JSON.stringify(url('moduller/uretim-emirleri/emir-olaylari.ts'))});
    await modulBasinaUclar();
    let n = 0;
    const db = { sorgu: async () => { n++; return []; }, tek: async () => { n++; return null; } };
    await emirIptalBildir(db, ${JSON.stringify(OLAY)});
    console.log('SORGU=' + n);`;
  const kos = spawnSync(process.execPath, ['--import', './araclar/ortam-yukle-goc.ts', '--input-type=module', '-e', betik], {
    cwd: join(import.meta.dirname, '..'), encoding: 'utf8',
  });
  assert.equal(kos.status, 0, kos.stderr);
  assert.match(kos.stdout, /^SORGU=0$/m);
});

test('sunucunun bütün bağlarının iki ucu da çalışma anında var', () => {
  assert.deepEqual(sunucununBaglari().filter((b) => b.eksik).map((b) => b.ad), []);
});

test('plan, kâr riski için üretim emrinin malzeme maliyetini proje maliyetten alır (227 a)', () => {
  assert.ok(sunucununBaglari().some((b) => b.ad === 'üretim emri malzeme maliyeti -> plan'));
});

test('815: müşteri sınıfı plana girmez; plan müşteri kartından sınıf okumaz', () => {
  assert.ok(!sunucununBaglari().some((b) => b.ad === 'müşteri sınıfı -> plan'));
});

test('bir bağ eksikse kablola hata atar ve hiçbir bağı kurmaz', () => {
  const url = (yol: string): string => pathToFileURL(join(import.meta.dirname, yol)).href;
  const betik = `
    const { bag, kablola } = await import(${JSON.stringify(url('kablolama.ts'))});
    let kurulan = 0;
    const kur = () => { kurulan++; };
    try {
      kablola([bag('tam', kur, () => undefined), bag('eksik bağ', kur, undefined)]);
      console.log('HATA=yok');
    } catch (h) { console.log('HATA=' + h.message); }
    console.log('KURULAN=' + kurulan);`;
  const kos = spawnSync(process.execPath, ['--import', './araclar/ortam-yukle-goc.ts', '--input-type=module', '-e', betik], {
    cwd: join(import.meta.dirname, '..'), encoding: 'utf8',
  });
  assert.equal(kos.status, 0, kos.stderr);
  assert.match(kos.stdout, /^HATA=Modüller arası bağ eksik: eksik bağ$/m);
  assert.match(kos.stdout, /^KURULAN=0$/m);
  assert.throws(() => kablola([bag('eksik bağ', undefined, () => undefined)]), /bağ eksik: eksik bağ/);
});
