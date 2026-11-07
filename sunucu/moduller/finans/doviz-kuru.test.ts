import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Belge, Cek, Odeme } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Kursuz dövizli kayıt 1 kurla TL'ye çevrilmez: o güne kadar girilmiş son kur alınır, kur yoksa reddedilir. Firmalar ve kurlar uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('dövizli kayıtta kur (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let firma = 0;
  let usdHesap = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function yaz<T = unknown>(yol: string, govde: unknown): Promise<Cevap<T>> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object });
    return { durum: c.statusCode, govde: c.json() as T };
  }
  const tamam = <T>(c: Cevap<T>): T => { assert.equal(c.durum, 200, JSON.stringify(c.govde)); return c.govde; };
  const belge = (ek: Record<string, unknown>) => yaz<{ belge: Belge }>('/finans/belgeler/ekle',
    { yon: 'gider', tur: 'fatura', kategori: 'mal_alimi', firmaId: firma, belgeTarihi: '2026-10-10', vade: '2026-11-10', tutar: 100, kdvOrani: 20, ...ek });

  before(async () => {
    ortam = await testVeritabaniKur('finansdovizkuru');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    firma = (await ortam.vt.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Tedarikci', 'ikisi', $1) RETURNING id", [kisi]))?.id ?? 0;
    usdHesap = tamam(await yaz<{ hesap: { id: number } }>('/finans/hesaplar/ekle', { ad: 'Deneme USD', tur: 'banka', paraBirimi: 'USD', acilisTarihi: '2026-01-01' })).hesap.id;
    // 2238-1 c: muhasebe kaydı alış kurunu alır; eski tek kur (EUR) okunmaz.
    tamam(await yaz('/finans/kur-ciftleri/ekle', { paraBirimi: 'USD', tarih: '2026-10-01', alis: 34.25, satis: 34.4 }));
    tamam(await yaz('/finans/kurlar/ekle', { paraBirimi: 'EUR', tarih: '2026-10-01', kur: 37 }));
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kursuz USD belge o güne kadar girilmiş son alış kurunu alır', async () => {
    const b = tamam(await belge({ paraBirimi: 'USD' })).belge;
    assert.equal(Number(b.kur), 34.25);
    assert.equal(b.toplamTl, '4110.00');
  });
  test('verilen kur korunur; TRY kursuz 1 olur', async () => {
    assert.equal(Number(tamam(await belge({ paraBirimi: 'USD', kur: 35 })).belge.kur), 35);
    assert.equal(Number(tamam(await belge({})).belge.kur), 1);
  });
  test('alış kuru girilmemiş dövizde (eski tek kuru olsa da) ya da kurdan önceki tarihte belge reddedilir', async () => {
    const eur = await belge({ paraBirimi: 'EUR' });
    assert.equal(eur.durum, 400, JSON.stringify(eur.govde));
    assert.equal((eur.govde as { alan?: string }).alan, 'kur');
    assert.equal((await belge({ paraBirimi: 'USD', belgeTarihi: '2026-09-30', vade: '2026-10-30' })).durum, 400);
  });
  test('kursuz USD ödeme ve çek de günün kurunu alır', async () => {
    const o = tamam(await yaz<{ odeme: Odeme }>('/finans/odemeler/ekle',
      { yon: 'gider', firmaId: firma, tarih: '2026-10-12', yontem: 'banka', hesapId: usdHesap, paraBirimi: 'USD', tutar: 10 })).odeme;
    assert.equal(o.tutarTl, '342.50');
    const c = tamam(await yaz<{ cek: Cek }>('/finans/cekler/ekle',
      { yon: 'alinan', tur: 'cek', firmaId: firma, duzenlemeTarihi: '2026-10-12', vade: '2026-12-12', paraBirimi: 'USD', tutar: 10 })).cek;
    assert.equal(c.tutarTl, '342.50');
  });
  test('düzeltmede kur verilmezse belgenin kuru korunur', async () => {
    const b = tamam(await belge({ paraBirimi: 'USD', kur: 36 })).belge;
    const d = tamam(await yaz<{ belge: Belge }>(`/finans/belgeler/${b.id}/duzelt`, { surum: b.surum, kategori: 'mal_alimi', firmaId: firma,
      belgeTarihi: b.belgeTarihi, vade: '2026-11-20', paraBirimi: 'USD', tutar: 100, kdvOrani: 20 })).belge;
    assert.equal(Number(d.kur), 36);
  });
  test('toplu aktarım kursuz dövizde günün kurunu alır, kuru olmayan satırda hiçbirini yazmaz', async () => {
    const satir = { belgeTarihi: '2026-10-15', yon: 'gider', kategori: 'mal_alimi', firma: 'Deneme Tedarikci', tutar: 100, kdvOrani: 20, vade: '2026-11-15' };
    const once = Number((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_belge'))?.n);
    const red = await yaz('/finans/toplu-ice-aktar', { satirlar: [{ ...satir, belgeNo: 'DN-T1' }, { ...satir, belgeNo: 'DN-T2', paraBirimi: 'EUR' }] });
    assert.equal(red.durum, 400, JSON.stringify(red.govde));
    assert.equal(Number((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_belge'))?.n), once);
    tamam(await yaz('/finans/toplu-ice-aktar', { satirlar: [{ ...satir, belgeNo: 'DN-T3', paraBirimi: 'USD' }] }));
    const k = await vt().tek<{ kur: string }>("SELECT kur::text FROM finans_belge WHERE belge_no = 'DN-T3'");
    assert.equal(Number(k?.kur), 34.25);
  });
});
