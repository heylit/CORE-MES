import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { geriYuklemeDenemesiSemasi } from '#paylasilan/sozlesme/saglik.ts';
import { DENEME_KAYDI_DOSYASI } from '../sunucu/moduller/saglik/disari.ts';
import { DENEME_DEGISKENI, denemeKaydiYaz, denemeVeritabani, denemeYap } from './geri-yukleme-denemesi.ts';

const ORTAM: NodeJS.ProcessEnv = {
  TMIV2_ORTAM: 'gelistirme', TMIV2_PORT: '4100', TMIV2_PG_HOST: '127.0.0.1', TMIV2_PG_PORT: '5432', TMIV2_PG_USER: 'tmiv2_uygulama',
  TMIV2_PG_PASSWORD: 'x', TMIV2_PG_DATABASE: 'tmiv2', TMIV2_PG_TEST_DATABASE: 'tmiv2_test',
  TMIV2_PG_GOC_USER: 'tmiv2_goc', TMIV2_PG_GOC_PASSWORD: 'x', TMIV2_PG_BAGLANTI_SURE_MS: '5000', TMIV2_PG_SORGU_SURE_MS: '10000',
  TMIV2_PG_OKUMA_SURE_MS: '5000', TMIV2_PG_HAVUZ: '30', TMIV2_PG_KILIT_SURE_MS: '5000', TMIV2_PG_BOS_TX_SURE_MS: '30000',
};

test('deneme veritabanı: tanımsızsa, asıl, test ya da eski sistemin veritabanıysa reddedilir; hiçbir şeye dokunulmadan', () => {
  assert.throws(() => denemeVeritabani(ORTAM), /tanımlı değil/);
  assert.throws(() => denemeVeritabani({ ...ORTAM, [DENEME_DEGISKENI]: ' ' }), /tanımlı değil/);
  assert.throws(() => denemeVeritabani({ ...ORTAM, [DENEME_DEGISKENI]: 'tmiv2' }), /asıl veritabanıyla/);
  assert.throws(() => denemeVeritabani({ ...ORTAM, [DENEME_DEGISKENI]: 'TMIV2' }), /asıl veritabanıyla/);
  assert.throws(() => denemeVeritabani({ ...ORTAM, [DENEME_DEGISKENI]: 'tmiv2_test' }), /test veritabanıyla/);
  assert.throws(() => denemeVeritabani({ ...ORTAM, [DENEME_DEGISKENI]: 'tmi' }), /eski sistemin/);
  assert.equal(denemeVeritabani({ ...ORTAM, [DENEME_DEGISKENI]: ' tmiv2_deneme ' }), 'tmiv2_deneme');
});

test('deneme: yüklenip sayılırsa başarılı; yükleme hatası ya da göç kaydı olmayan yedek başarısız; süre ölçülür', async () => {
  let an = Date.parse('2026-11-01T10:00:00Z');
  const simdi = () => new Date(an);
  const iyi = await denemeYap('/yedek/tmiv2-elle-1.tmiv2y', {
    yukle: async () => { an += 4200; }, say: async () => ({ kisiSayisi: 12, gocSayisi: 499 }), simdi,
  });
  assert.deepEqual(iyi, {
    zaman: '2026-11-01T10:00:00.000Z', yedek: 'tmiv2-elle-1.tmiv2y', sonuc: 'basarili', sureSn: 4.2, kisiSayisi: 12, gocSayisi: 499, hata: null,
  });
  const kotu = await denemeYap('/yedek/b.tmiv2y', { yukle: async () => { throw new Error('anahtar\nyanlış'); }, say: async () => ({ kisiSayisi: 1, gocSayisi: 1 }), simdi });
  assert.equal(kotu.sonuc, 'basarisiz');
  assert.equal(kotu.hata, 'anahtar yanlış');
  assert.equal(kotu.kisiSayisi, null);
  const bos = await denemeYap('/yedek/c.tmiv2y', { yukle: async () => undefined, say: async () => ({ kisiSayisi: 0, gocSayisi: 0 }), simdi });
  assert.equal(bos.sonuc, 'basarisiz');
  for (const d of [iyi, kotu, bos]) assert.equal(geriYuklemeDenemesiSemasi.safeParse(d).success, true);
});

test('deneme kaydı: yedek klasöründeki dosyaya satır eklenir, eskiler silinmez', async () => {
  const dizin = await mkdtemp(path.join(tmpdir(), 'tmiv2-deneme-'));
  try {
    const d = { zaman: '2026-11-01T10:00:00.000Z', yedek: 'a', sonuc: 'basarili', sureSn: 1, kisiSayisi: 1, gocSayisi: 1, hata: null } as const;
    const dosya = await denemeKaydiYaz(dizin, d);
    await denemeKaydiYaz(dizin, { ...d, yedek: 'b' });
    assert.equal(path.basename(dosya), DENEME_KAYDI_DOSYASI);
    const satirlar = (await readFile(dosya, 'utf8')).trim().split('\n').map((s) => JSON.parse(s) as { yedek: string });
    assert.deepEqual(satirlar.map((s) => s.yedek), ['a', 'b']);
  } finally {
    await rm(dizin, { recursive: true, force: true });
  }
});
