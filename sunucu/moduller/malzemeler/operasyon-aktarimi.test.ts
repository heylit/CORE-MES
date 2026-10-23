import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { malzemeOperasyonlari, operasyonluAktifKartlar } from './disari.ts';
import { kartOperasyonlari } from './kurallar.ts';
import { tamGovde } from './test-kart.ts';

const PAROLA = 'dogru-parola-1';

test('kart #688: numarasız satır öncekinin 10 fazlası; no sırası; eşit numara tekilleşir; kodsuz satır alınmaz; adı yoksa null', () => {
  assert.deepEqual(kartOperasyonlari({}), []);
  assert.deepEqual(kartOperasyonlari({ ops: 'x' }), []);
  assert.deepEqual(kartOperasyonlari({ ops: [{ kod: 'KES' }, { kod: 'TRN', ad: 'Torna (CNC)' }] }), [
    { no: 10, kod: 'KES', ad: null }, { no: 20, kod: 'TRN', ad: 'Torna (CNC)' },
  ]);
  assert.deepEqual(kartOperasyonlari({
    ops: [
      { no: 40, kod: 'FRZ', ad: 'Freze (CNC)' }, { no: 10, kod: ' TRN ', ad: 'Torna (CNC)' }, { kod: 'KAL', ad: '' }, { no: 30, kod: '', ad: 'Boş' },
      { no: 30, kod: 'DLM', ad: 'Delik delme' }, null, { no: 1.5, kod: 'TSL' }, { no: 30, kod: 'KLV', ad: 'Kılavuz' }, { no: 31, kod: 'HON' },
    ],
  }), [
    { no: 10, kod: 'TRN', ad: 'Torna (CNC)' }, { no: 20, kod: 'KAL', ad: null }, { no: 30, kod: 'DLM', ad: 'Delik delme' },
    { no: 31, kod: 'KLV', ad: 'Kılavuz' }, { no: 32, kod: 'HON', ad: null }, { no: 40, kod: 'FRZ', ad: 'Freze (CNC)' },
    { no: 41, kod: 'TSL', ad: null },
  ]);
});

describe('malzemeOperasyonlari (kart #688, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';

  before(async () => {
    ortam = await testVeritabaniKur('malzemeops');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme ops', kullaniciAdi: 'op-yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'op-yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kartın operasyonlarını sırayla verir; operasyonsuz kartta boş, olmayan kartta null', async () => {
    const vt = ortam!.vt;
    const kaydet = async (kimlik: string, ops?: unknown[]): Promise<number> => {
      const c = await app.inject({
        method: 'POST', url: `/api/malzeme-katalogu-kartlari/${kimlik}/kaydet`, headers: { cookie: cerez },
        payload: tamGovde('/malzeme-katalogu-kartlari/x/kaydet', {
          kayit: { id: kimlik, tur: 'yarimamul', com: { kod: 'YM-TAL-00000', birim: 'adet' }, onay: { durum: 'taslak' }, ...(ops ? { ops } : {}) },
          ozet: { benzersiz_anahtar: `yarimamul|ops|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
        }) as object,
      });
      assert.equal(c.statusCode, 200, c.body);
      const kod = (c.json() as KatalogKartiKaydetCevabi).stok_kodu;
      return (await vt.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE stok_kodu = $1', [kod]))!.no;
    };
    const dolu = await kaydet('op1', [{ no: 20, kod: 'FRZ', ad: 'Freze (CNC)' }, { no: 10, kod: 'TRN', ad: 'Torna (CNC)' }]);
    const bos = await kaydet('op2');
    assert.deepEqual(await malzemeOperasyonlari(vt, dolu), [{ no: 10, kod: 'TRN', ad: 'Torna (CNC)' }, { no: 20, kod: 'FRZ', ad: 'Freze (CNC)' }]);
    assert.deepEqual(await malzemeOperasyonlari(vt, bos), []);
    assert.equal(await malzemeOperasyonlari(vt, 999_999), null);
  });

  test('operasyonluAktifKartlar: yalnız aktif, mamul ya da yarı mamul ve kodlu operasyonlu kart; kişi onaylayan, yoksa güncelleyen', async () => {
    const vt = ortam!.vt;
    const kaydet = async (kimlik: string, tur: 'yarimamul' | 'mamul' | 'hammadde', ops: unknown[]): Promise<number> => {
      const c = await app.inject({
        method: 'POST', url: `/api/malzeme-katalogu-kartlari/${kimlik}/kaydet`, headers: { cookie: cerez },
        payload: tamGovde('/malzeme-katalogu-kartlari/x/kaydet', {
          kayit: { id: kimlik, tur, com: { kod: { yarimamul: 'YM-TAL-00000', mamul: 'MM-MAY-00000', hammadde: 'HM-PAS-00000' }[tur], birim: 'adet' }, onay: { durum: 'taslak' }, ops },
          ozet: { benzersiz_anahtar: `${tur}|aktif|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
        }) as object,
      });
      assert.equal(c.statusCode, 200, c.body);
      return (await vt.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
    };
    const op = [{ no: 10, kod: 'TRN', ad: 'Torna (CNC)' }];
    const ym = await kaydet('ak1', 'yarimamul', op);
    const mm = await kaydet('ak2', 'mamul', op);
    const taslak = await kaydet('ak3', 'mamul', op);
    const hm = await kaydet('ak4', 'hammadde', op);
    const kodsuz = await kaydet('ak5', 'mamul', [{ no: 10, kod: ' ', ad: 'Boş' }]);
    const bos = await kaydet('ak6', 'mamul', []);
    const kisi = (await vt.tek<{ id: number }>('SELECT guncelleyen_kisi_id AS id FROM malzeme_katalog_karti WHERE no = $1', [ym]))!.id;
    const ikinci = (await vt.tek<{ id: number }>(
      `INSERT INTO kisi (ad) VALUES ('Deneme onaylayan') RETURNING id`))!.id;
    await vt.sorgu(`UPDATE malzeme_katalog_karti SET onay_durumu = 'aktif' WHERE no = ANY($1::int[])`, [[ym, mm, hm, kodsuz, bos]]);
    await vt.sorgu('UPDATE malzeme_katalog_karti SET onaylayan_kisi_id = $2 WHERE no = $1', [mm, ikinci]);
    assert.deepEqual((await operasyonluAktifKartlar(vt)).filter((k) => [ym, mm, taslak, hm, kodsuz, bos].includes(k.no)).sort((a, b) => a.no - b.no),
      [{ no: ym, kisiId: kisi }, { no: mm, kisiId: ikinci }]);
  });
});
