import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { TESIS_SABLONU } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { IsMerkezleriCevabi, IstasyonlarCevabi, TesisSablonuSonucu } from '#paylasilan/sozlesme/istasyonlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { sablonPlani } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
const YOL = '/tesis-sablonu/uygula';
const SABLON_ISTASYONLARI = TESIS_SABLONU.flatMap((m) => m.istasyonlar.map((i) => i.kod));

// 2166-1 a: şablon eksik olanı açar, var olana dokunmaz. Yetki ve 401/403 reddi istasyonlar.test.ts'teki yazma tablosundadır.
describe('istasyonlar 2166: tesis şablonu planı (saf)', () => {
  test('boş tesiste her şey açılır, atlanan yok', () => {
    const plan = sablonPlani(TESIS_SABLONU, [], []);
    assert.deepEqual(plan.atlananlar, []);
    assert.deepEqual(plan.merkezler.filter((m) => m.mevcutId === null).map((m) => m.sablon.kod), TESIS_SABLONU.map((m) => m.kod));
    assert.deepEqual(plan.merkezler.flatMap((m) => m.istasyonlar.map((i) => i.kod)), SABLON_ISTASYONLARI);
  });

  test('var olan merkez ve istasyon (küçük harfle yazılmış olsa da) atlanır; pasif merkezin eksik istasyonu açılmaz', () => {
    const plan = sablonPlani(TESIS_SABLONU, [{ id: 7, kod: 'kalite', aktif: false }, { id: 8, kod: 'DEPO', aktif: true }], ['mrk-01']);
    const kalite = plan.merkezler.find((m) => m.sablon.kod === 'KALITE');
    const depo = plan.merkezler.find((m) => m.sablon.kod === 'DEPO');
    assert.equal(kalite?.mevcutId, 7);
    assert.deepEqual(kalite?.istasyonlar, []);
    assert.equal(depo?.mevcutId, 8);
    assert.deepEqual(depo?.istasyonlar.map((i) => i.kod), ['DEPO-01']);
    assert.deepEqual(plan.merkezler.find((m) => m.sablon.kod === 'MARKALAMA')?.istasyonlar, []);
    assert.deepEqual(plan.atlananlar, [
      { kod: 'KALITE', neden: 'var' },
      { kod: 'KAL-GKK', neden: 'merkez-pasif' }, { kod: 'KAL-ARA', neden: 'merkez-pasif' }, { kod: 'KAL-SON', neden: 'merkez-pasif' },
      { kod: 'KAL-CMM', neden: 'merkez-pasif' },
      { kod: 'MRK-01', neden: 'var' },
      { kod: 'DEPO', neden: 'var' },
    ]);
  });

  test('şablon kodları benzersiz, Kalite iş merkezi ve kalite istasyonları var', () => {
    const kodlar = [...TESIS_SABLONU.map((m) => m.kod), ...SABLON_ISTASYONLARI];
    assert.equal(new Set(kodlar).size, kodlar.length);
    const kalite = TESIS_SABLONU.find((m) => m.kod === 'KALITE');
    assert.ok(kalite !== undefined && kalite.istasyonlar.length > 0 && kalite.istasyonlar.every((i) => i.tip === 'kalite'));
  });
});

describe('istasyonlar 2166: tesis şablonunu uygula (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';

  const vt = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function istek<T = unknown>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> {
    const cevap = await app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerez }, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar_tesis_sablonu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('var olan kayda dokunmaz, eksikleri açar; ikinci çağrı bir şey açmaz', async () => {
    vt();
    const merkez = await istek<{ id: number; surum: number }>('POST', '/is-merkezleri', { kod: 'KALITE', ad: 'Bizim kalite', aciklama: 'Elle açıldı' });
    assert.equal(merkez.durum, 200, JSON.stringify(merkez.govde));
    const elle = await istek<{ id: number }>('POST', '/istasyonlar', { kod: 'KAL-GKK', ad: 'Elle GKK', isMerkeziId: merkez.govde.id, tip: 'kalite', kapasiteKaynagi: 'insan' });
    assert.equal(elle.durum, 200, JSON.stringify(elle.govde));

    const ilk = await istek<TesisSablonuSonucu>('POST', YOL);
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    assert.deepEqual(ilk.govde.acilanMerkezler, TESIS_SABLONU.map((m) => m.kod).filter((k) => k !== 'KALITE'));
    assert.deepEqual(ilk.govde.acilanIstasyonlar, SABLON_ISTASYONLARI.filter((k) => k !== 'KAL-GKK'));
    assert.deepEqual(ilk.govde.atlananlar, [{ kod: 'KALITE', neden: 'var' }, { kod: 'KAL-GKK', neden: 'var' }]);

    const merkezler = (await istek<IsMerkezleriCevabi>('GET', '/is-merkezleri?pasifler=true')).govde.isMerkezleri;
    const kalite = merkezler.find((m) => m.kod === 'KALITE');
    assert.deepEqual([kalite?.ad, kalite?.aciklama, kalite?.surum], ['Bizim kalite', 'Elle açıldı', merkez.govde.surum]);
    const istasyonlar = (await istek<IstasyonlarCevabi>('GET', '/istasyonlar?pasifler=true')).govde.istasyonlar;
    assert.equal(istasyonlar.find((i) => i.kod === 'KAL-GKK')?.ad, 'Elle GKK');
    const son = istasyonlar.find((i) => i.kod === 'KAL-SON');
    assert.deepEqual([son?.tip, son?.kapasiteKaynagi, son?.isMerkeziId, son?.aktif], ['kalite', 'insan', kalite?.id, true]);
    assert.equal(istasyonlar.find((i) => i.kod === 'MRK-01')?.tip, 'markalama');

    const ikinci = await istek<TesisSablonuSonucu>('POST', YOL);
    assert.equal(ikinci.durum, 200);
    assert.deepEqual([ikinci.govde.acilanMerkezler, ikinci.govde.acilanIstasyonlar], [[], []]);
    assert.equal(ikinci.govde.atlananlar.length, TESIS_SABLONU.length + SABLON_ISTASYONLARI.length);
  });
});
