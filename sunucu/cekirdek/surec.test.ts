import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { Ayar } from './ayar.ts';
import type { Veritabani } from './db.ts';
import { yakalanmamisRetiDinle, yakalanmamisRetYaz } from './surec.ts';
import { uygulamaKur } from './uygulama.ts';

interface Kayit {
  nesne: { err: unknown };
  mesaj: string;
}

function gunlukKur(): { kayitlar: Kayit[]; error(nesne: { err: unknown }, mesaj: string): void } {
  const kayitlar: Kayit[] = [];
  return { kayitlar, error: (nesne, mesaj) => { kayitlar.push({ nesne, mesaj }); } };
}

test('yakalanmamış ret günlüğe bir kez, hata nesnesiyle yazılır ve fırlatılmaz', () => {
  const gunluk = gunlukKur();
  const sebep = new Error('unutulmuş söz');
  assert.doesNotThrow(() => { yakalanmamisRetYaz(gunluk, sebep); });
  assert.equal(gunluk.kayitlar.length, 1);
  assert.equal(gunluk.kayitlar[0]?.nesne.err, sebep);
  assert.match(gunluk.kayitlar[0]?.mesaj ?? '', /Yakalanmamış söz reddi/);
});

test('günlükleyici hata verse de dışarı hata çıkmaz', (t) => {
  const yazilan = t.mock.method(console, 'error', () => undefined);
  const bozuk = { error: (): void => { throw new Error('günlük kapalı'); } };
  assert.doesNotThrow(() => { yakalanmamisRetYaz(bozuk, new Error('unutulmuş söz')); });
  assert.equal(yazilan.mock.callCount(), 1);
});

test('dinleyici yalnız yakalanmamış reddi dinler; yakalanmamış istisnaya dokunmaz', () => {
  const kaynak = new EventEmitter();
  const gunluk = gunlukKur();
  yakalanmamisRetiDinle(kaynak, gunluk);
  assert.equal(gunluk.kayitlar.length, 0);
  const sebep = new Error('unutulmuş söz');
  kaynak.emit('unhandledRejection', sebep);
  assert.equal(gunluk.kayitlar.length, 1);
  assert.equal(gunluk.kayitlar[0]?.nesne.err, sebep);
  assert.equal(kaynak.listenerCount('uncaughtException'), 0);
});

test('uygulamayı kurmak süreç dinleyicisi eklemez: kayıt sunucu girişine aittir, test süreci reddi görmeye devam eder', async () => {
  const AYAR: Ayar = {
    ortam: 'test',
    port: 4100,
    pg: { host: '127.0.0.1', port: 5432, kullanici: 'k', parola: 'p', veritabani: 'sahte', baglantiSureMs: 5000, sorguSureMs: 20000, okumaSureMs: 20000, havuzBoyutu: 10, kilitSureMs: 5000, bosTxSureMs: 30000 },
    pgTestVeritabani: null,
    commit: null,
  };
  const sahteVt: Veritabani = {
    sorgu: async <T>(): Promise<T[]> => Promise.resolve([]),
    tek: async <T>(): Promise<T | null> => Promise.resolve(null),
    tx: async (is) => is(sahteVt),
    okumaTx: async (is) => is(sahteVt),
    kapat: async () => Promise.resolve(),
  };
  const once = process.listenerCount('unhandledRejection');
  const app = await uygulamaKur({ vt: sahteVt, ayar: AYAR });
  await app.close();
  assert.equal(process.listenerCount('unhandledRejection'), once);

  // Aynı işlev süreçle çağrılınca dinleyici gerçekten eklenir: yukarıdaki eşitlik boş yere tutmuyor.
  const dinleyiciler = process.listeners('unhandledRejection');
  yakalanmamisRetiDinle(process, gunlukKur());
  try {
    assert.equal(process.listenerCount('unhandledRejection'), once + 1);
  } finally {
    for (const d of process.listeners('unhandledRejection')) {
      if (!dinleyiciler.includes(d)) process.off('unhandledRejection', d);
    }
  }
});
