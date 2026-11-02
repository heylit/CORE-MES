import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import type { Belge, Cek } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { gunEkle, ileriTarihHatasi } from './kurallar.ts';

// FIN-9 a: olmamış para hareketi ileri tarihle girilmez, belge en çok 31 gün ileri olur; belge no harf farkıyla iki kez girilmez. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('ileri tarih kuralı (saf)', () => {
  test('hareket bugünü geçemez, belge 31 günü geçemez', () => {
    assert.equal(ileriTarihHatasi('2026-11-02', '2026-11-02', '2026-12-03', 'hareket'), null);
    assert.ok(ileriTarihHatasi('2026-11-03', '2026-11-02', '2026-12-03', 'hareket'));
    assert.equal(ileriTarihHatasi('2026-12-03', '2026-11-02', '2026-12-03', 'belge'), null);
    assert.ok(ileriTarihHatasi('2026-12-04', '2026-11-02', '2026-12-03', 'belge'));
  });
});

describe('ileri tarih ve belge no (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let firma = 0;
  let banka = 0;
  const bugun = tesisGunu(new Date());
  const yarin = gunEkle(bugun, 1);

  async function yaz<T = unknown>(yol: string, govde: unknown): Promise<Cevap<T>> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object });
    return { durum: c.statusCode, govde: c.json() as T };
  }
  const tamam = <T>(c: Cevap<T>): T => { assert.equal(c.durum, 200, JSON.stringify(c.govde)); return c.govde; };
  const belge = (ek: Record<string, unknown>) => yaz<{ belge: Belge }>('/finans/belgeler/ekle',
    { yon: 'gider', tur: 'fatura', kategori: 'kira', firmaId: firma, belgeTarihi: bugun, vade: gunEkle(bugun, 60), tutar: 100, kdvOrani: 20, ...ek });

  before(async () => {
    ortam = await testVeritabaniKur('finansileritarih');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    firma = (await ortam.vt.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Firma', 'ikisi', $1) RETURNING id", [kisi]))?.id ?? 0;
    banka = tamam(await yaz<{ hesap: { id: number } }>('/finans/hesaplar/ekle', { ad: 'Deneme Banka', tur: 'banka', acilisBakiyesi: 1000, acilisTarihi: '2026-01-01' })).hesap.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('belge 31 gün ileriye kadar girer, ötesi reddedilir', async () => {
    tamam(await belge({ belgeTarihi: gunEkle(bugun, 31), vade: gunEkle(bugun, 61) }));
    const red = await belge({ belgeTarihi: gunEkle(bugun, 32), vade: gunEkle(bugun, 62) });
    assert.equal(red.durum, 400, JSON.stringify(red.govde));
    assert.equal((red.govde as unknown as { alan?: string }).alan, 'belgeTarihi');
  });
  test('ödeme, peşin ödeme, virman ve eşitleme yarın tarihiyle reddedilir, bugün geçer', async () => {
    const odeme = (tarih: string) => yaz('/finans/odemeler/ekle', { yon: 'gelir', firmaId: firma, tarih, yontem: 'banka', hesapId: banka, tutar: 10 });
    assert.equal((await odeme(yarin)).durum, 400);
    tamam(await odeme(bugun));
    assert.equal((await belge({ pesin: { yontem: 'banka', hesapId: banka, tarih: yarin } })).durum, 400);
    const kasa = tamam(await yaz<{ hesap: { id: number } }>('/finans/hesaplar/ekle', { ad: 'Deneme Kasa', tur: 'kasa', acilisTarihi: '2026-01-01' })).hesap.id;
    assert.equal((await yaz('/finans/virmanlar/ekle', { kaynakHesapId: banka, hedefHesapId: kasa, tarih: yarin, tutar: 1 })).durum, 400);
    assert.equal((await yaz(`/finans/hesaplar/${banka}/esitle`, { tarih: yarin, gercekBakiye: 5 })).durum, 400);
  });
  test('ileri tarihli çek tahsili bakiyeye girmez', async () => {
    const c = tamam(await yaz<{ cek: Cek }>('/finans/cekler/ekle', { yon: 'alinan', tur: 'cek', firmaId: firma, duzenlemeTarihi: bugun, vade: gunEkle(bugun, 40), tutar: 50 })).cek;
    const tv = tamam(await yaz<{ cek: Cek }>(`/finans/cekler/${c.id}/tahsile-ver`, { surum: c.surum, tarih: bugun })).cek;
    assert.equal((await yaz(`/finans/cekler/${c.id}/tahsil`, { surum: tv.surum, hesapId: banka, tarih: gunEkle(bugun, 40) })).durum, 400);
    tamam(await yaz(`/finans/cekler/${c.id}/tahsil`, { surum: tv.surum, hesapId: banka, tarih: bugun }));
  });
  test('belge no harf farkıyla aynı firmada ikinci kez girilmez; iptal edilen sayılmaz; toplu aktarımda da', async () => {
    const ilk = tamam(await belge({ belgeNo: 'DN-HARF-1' })).belge;
    const red = await belge({ belgeNo: 'dn-harf-1' });
    assert.equal(red.durum, 409, JSON.stringify(red.govde));
    assert.equal((red.govde as unknown as { alan?: string }).alan, 'belgeNo');
    tamam(await yaz(`/finans/belgeler/${ilk.id}/iptal`, { surum: ilk.surum, neden: null }));
    tamam(await belge({ belgeNo: 'dn-harf-1' }));
    const satir = { belgeTarihi: bugun, yon: 'gider', kategori: 'kira', firma: 'Deneme Firma', tutar: 10, kdvOrani: 20, vade: bugun };
    assert.equal((await yaz('/finans/toplu-ice-aktar', { satirlar: [{ ...satir, belgeNo: 'DN-HARF-1' }] })).durum, 409);
    assert.equal((await yaz('/finans/toplu-ice-aktar', { satirlar: [{ ...satir, belgeNo: 'DN-T-9' }, { ...satir, belgeNo: 'dn-t-9' }] })).durum, 409);
  });
});
