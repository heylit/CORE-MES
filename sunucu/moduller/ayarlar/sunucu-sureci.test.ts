import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { GuncellemeOrtami } from './guncelleme.ts';
import { UYGULAMA_ISTEGI_DOSYASI, UYGULANIYOR_DOSYASI, bekciDurumu, type SurecHalkasi } from './kurallar.ts';
import {
  BEKCI_ILETISI, procStatCoz, sunucuSureciOku, sunucuSureciSifirla, yenidenBaslatIste, type SurecBagimliliklari,
} from './sunucu-sureci.ts';

const h = (pid: number, ppid: number, komut: string | null, baslangic: number | null = pid): SurecHalkasi => ({ pid, ppid, komut, baslangic });
const SUNUCU = h(30, 20, 'node --import ./araclar/ortam-yukle.ts sunucu/ana.ts --arayuz');
const GUNCELLEYICI = h(20, 10, 'node araclar/baslat.ts');

describe('bekciDurumu', () => {
  test('bekçi güncelleyicinin üstündeyse var (Windows ve Linux yolları)', () => {
    assert.equal(bekciDurumu([SUNUCU, GUNCELLEYICI, h(10, 1, '"C:\\Program Files\\nodejs\\node.exe" araclar\\bekci.ts')]), 'var');
    assert.equal(bekciDurumu([SUNUCU, GUNCELLEYICI, h(10, 1, '/usr/bin/node araclar/bekci.ts')]), 'var');
    assert.equal(bekciDurumu([SUNUCU, h(20, 1, 'node araclar/bekci.ts', 20)]), 'var');
  });
  test('bekçi yoksa ya da yalnız adı benziyorsa yok', () => {
    assert.equal(bekciDurumu([SUNUCU, GUNCELLEYICI, h(10, 1, 'cmd.exe /c npm run baslat')]), 'yok');
    assert.equal(bekciDurumu([SUNUCU, GUNCELLEYICI, h(10, 1, 'node araclar/bekci.test.ts')]), 'yok');
    assert.equal(bekciDurumu([SUNUCU]), 'yok');
  });
  test('üst süreç ölmüş ve numarası sonra açılan bekçiye verilmişse yok', () => {
    assert.equal(bekciDurumu([SUNUCU, GUNCELLEYICI, h(10, 1, 'node araclar/bekci.ts', 25)]), 'yok');
  });
  test('zincir kopuksa ata sayılmaz', () => {
    assert.equal(bekciDurumu([SUNUCU, h(21, 1, 'node araclar/bekci.ts', 5)]), 'yok');
  });
  test('zincir okunamadıysa ya da komut satırı görünmüyorsa bilinmiyor', () => {
    assert.equal(bekciDurumu(null), 'bilinmiyor');
    assert.equal(bekciDurumu([]), 'bilinmiyor');
    assert.equal(bekciDurumu([SUNUCU, GUNCELLEYICI, h(10, 1, null)]), 'bilinmiyor');
  });
});

test('procStatCoz boşluklu komut adında da üst süreci ve başlangıcı okur', () => {
  const alanlar = ['S', '77', ...Array.from({ length: 17 }, () => '0'), '123456', '0'];
  assert.deepEqual(procStatCoz(`42 (node (bekci) x) ${alanlar.join(' ')}`), { ppid: 77, baslangic: 123456 });
  assert.equal(procStatCoz('bozuk'), null);
});

describe('yeniden başlatma isteği', () => {
  let dizin: string;
  let o: GuncellemeOrtami;
  let kapanislar: string[];
  const bagimlilik = (zincir: SurecHalkasi[] | null, kurulu = true): SurecBagimliliklari => ({
    zincirOku: () => Promise.resolve(zincir),
    kapanisIste: (neden) => { kapanislar.push(neden); return true; },
    kapanisKurulu: () => kurulu,
    acilis: new Date('2026-11-19T05:00:00.000Z'),
    gecikmeMs: 0,
  });
  const bekcili = [SUNUCU, GUNCELLEYICI, h(10, 1, 'node araclar/bekci.ts')];
  const bekle = (): Promise<void> => new Promise((coz) => { setTimeout(coz, 5); });

  before(async () => {
    dizin = await mkdtemp(path.join(tmpdir(), 'sunucu-sureci-'));
    const { publicKey } = generateKeyPairSync('ed25519');
    const x = publicKey.export({ format: 'jwk' }).x ?? '';
    o = { dizin, anahtar: Buffer.from(x, 'base64url').toString('base64'), commit: null };
  });
  after(async () => { await rm(dizin, { recursive: true, force: true }); });
  beforeEach(async () => {
    sunucuSureciSifirla();
    kapanislar = [];
    await rm(path.join(dizin, UYGULAMA_ISTEGI_DOSYASI), { force: true });
    await rm(path.join(dizin, UYGULANIYOR_DOSYASI), { force: true });
  });

  test('bekçi varsa kabul edilir, kapanış gecikmeyle istenir, ikinci istek reddedilir', async () => {
    const b = bagimlilik(bekcili);
    const cevap = await yenidenBaslatIste(o, 7, new Date('2026-11-19T05:10:00.000Z'), b);
    assert.deepEqual(cevap, { istenme: '2026-11-19T05:10:00.000Z', acilis: '2026-11-19T05:00:00.000Z' });
    assert.deepEqual(kapanislar, []);
    await bekle();
    assert.deepEqual(kapanislar, ['Yeniden başlatma (kişi 7)']);
    await assert.rejects(yenidenBaslatIste(o, 7, new Date(), b), (h: { durum?: number }) => h.durum === 409);
  });

  test('bekçi yoksa ya da bilinmiyorsa reddedilir, kapanış istenmez', async () => {
    await assert.rejects(yenidenBaslatIste(o, 7, new Date(), bagimlilik([SUNUCU, GUNCELLEYICI])), new RegExp(BEKCI_ILETISI.yok.slice(0, 30)));
    await assert.rejects(yenidenBaslatIste(o, 7, new Date(), bagimlilik(null)), new RegExp(BEKCI_ILETISI.bilinmiyor.slice(0, 30)));
    // Kapanış işi kurulmamış süreçte (ana.ts dışı açılış) bekçi olsa da kabul edilmez.
    await assert.rejects(yenidenBaslatIste(o, 7, new Date(), bagimlilik(bekcili, false)), new RegExp(BEKCI_ILETISI.bilinmiyor.slice(0, 30)));
    await bekle();
    assert.deepEqual(kapanislar, []);
  });

  test('güncelleme istenmiş ya da kuruluyorsa reddedilir', async () => {
    const istek = JSON.stringify({ commit: 'a'.repeat(40), isteyenId: 1, istenme: '2026-11-19T05:00:00.000Z' });
    for (const dosya of [UYGULAMA_ISTEGI_DOSYASI, UYGULANIYOR_DOSYASI]) {
      await writeFile(path.join(dizin, dosya), istek);
      assert.equal((await sunucuSureciOku(o, bagimlilik(bekcili))).guncellemeSuruyor, true);
      await assert.rejects(yenidenBaslatIste(o, 7, new Date(), bagimlilik(bekcili)), /Güncelleme istendi/);
      await rm(path.join(dizin, dosya));
    }
    assert.deepEqual(kapanislar, []);
  });

  test('kapanış işi bulunamazsa istek düşer, yeniden istenebilir', async () => {
    const b = { ...bagimlilik(bekcili), kapanisIste: () => false };
    await yenidenBaslatIste(o, 7, new Date(), b);
    await bekle();
    await yenidenBaslatIste(o, 7, new Date(), b);
  });

  test('durum: bekçi, güncelleme ve açılış anı', async () => {
    assert.deepEqual(await sunucuSureciOku(o, bagimlilik(bekcili)), { bekci: 'var', guncellemeSuruyor: false, acilis: '2026-11-19T05:00:00.000Z' });
    sunucuSureciSifirla();
    assert.equal((await sunucuSureciOku({ dizin: null, anahtar: null, commit: null }, bagimlilik([SUNUCU]))).bekci, 'yok');
  });
});
