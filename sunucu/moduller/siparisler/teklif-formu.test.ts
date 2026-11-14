import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { TeklifAyrintisi, TeklifFormuCevabi, TeklifFormuVerisiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

// 3245 d: teklif formu şablon kütüphanesi. Basan (fiyat gören) okur, yalnız ayar yetkisi yazar.
describe('siparisler teklif formu (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let satis = '';
  let operator = '';
  // siparisler.oku var, siparisler.fiyat-oku yok (rol matrisi 139): teklifi okur, fiyatlı formu okuyamaz.
  let depo = '';
  let sayac = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function girisYap(rolKodu: string | null): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `tform-${(sayac += 1)}`;
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null) {
        const rol = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
        await rolAl(db, yoneticiId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }
  const gonder = (cerez: string, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const oku = (cerez: string, yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
  const form = async (cerez = yonetici): Promise<TeklifFormuCevabi> => {
    const c = await oku(cerez, '/siparisler/teklif-formu');
    assert.equal(c.statusCode, 200, c.body);
    return c.json<TeklifFormuCevabi>();
  };

  before(async () => {
    ortam = await testVeritabaniKur('siparisler_teklif_formu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const y = await girisYap(null);
    yonetici = y.cerez;
    yoneticiId = y.id;
    satis = (await girisYap('satis')).cerez;
    operator = (await girisYap('operator')).cerez;
    depo = (await girisYap('depo')).cerez;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kurulumda üç hazır şablon gelir; Türkçe standart varsayılandır, firma bilgisi boştur', async () => {
    const f = await form();
    assert.deepEqual(f.sablonlar.map((s) => [s.ad, s.dil, s.varsayilan]), [
      ['Standart teklif', 'tr', true], ['Kısa form', 'tr', false], ['Quotation (English)', 'en', false],
    ]);
    assert.equal(f.kurum.unvan, '');
    assert.equal(f.sablonlar.find((s) => s.dil === 'en')?.icerik.baslik, 'QUOTATION');
  });

  test('yetki: satış (fiyat gören) okur ama yazamaz; işlemsiz rol okuyamaz; girişsiz 401', async () => {
    const f = await form(satis);
    const s = f.sablonlar[0];
    assert.ok(s);
    assert.equal((await oku(operator, '/siparisler/teklif-formu')).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/siparisler/teklif-formu' })).statusCode, 401);
    const govde = { surum: s.surum, ad: s.ad, dil: s.dil, icerik: { ...s.icerik, baslik: 'İZİNSİZ' } };
    assert.equal((await gonder(satis, `/siparisler/teklif-formu/sablonlar/${s.id}/kaydet`, govde)).statusCode, 403);
    assert.equal((await gonder(satis, '/siparisler/teklif-formu/kurum/kaydet', { surum: f.kurumSurum, kurum: { ...f.kurum, unvan: 'İzinsiz' } })).statusCode, 403);
    assert.equal((await gonder(satis, `/siparisler/teklif-formu/sablonlar/${s.id}/kopyala`, { ad: 'İzinsiz kopya' })).statusCode, 403);
    assert.equal((await gonder(satis, `/siparisler/teklif-formu/sablonlar/${s.id}/varsayilan-yap`, { surum: s.surum })).statusCode, 403);
    const sonra = await form();
    assert.equal(sonra.sablonlar.length, f.sablonlar.length);
    assert.notEqual(sonra.sablonlar[0]?.icerik.baslik, 'İZİNSİZ');
    assert.equal(sonra.kurum.unvan, '');
  });

  test('şablon kaydedilir ve sürüm ilerler; eski sürümle kayıt 409, boş başlık 400', async () => {
    const s = (await form()).sablonlar.find((x) => x.ad === 'Kısa form');
    assert.ok(s);
    const icerik = { ...s.icerik, baslik: 'FİYAT TEKLİFİ', sartlar: [...s.icerik.sartlar, 'ORN deneme şartı'] };
    const c = await gonder(yonetici, `/siparisler/teklif-formu/sablonlar/${s.id}/kaydet`, { surum: s.surum, ad: s.ad, dil: s.dil, icerik });
    assert.equal(c.statusCode, 200, c.body);
    const yeni = c.json<TeklifFormuCevabi>().sablonlar.find((x) => x.id === s.id);
    assert.equal(yeni?.icerik.baslik, 'FİYAT TEKLİFİ');
    assert.equal(yeni?.surum, s.surum + 1);
    assert.equal((await gonder(yonetici, `/siparisler/teklif-formu/sablonlar/${s.id}/kaydet`, { surum: s.surum, ad: s.ad, dil: s.dil, icerik })).statusCode, 409);
    assert.equal((await gonder(yonetici, `/siparisler/teklif-formu/sablonlar/${s.id}/kaydet`, { surum: s.surum + 1, ad: s.ad, dil: s.dil, icerik: { ...icerik, baslik: ' ' } })).statusCode, 400);
    assert.equal((await gonder(yonetici, '/siparisler/teklif-formu/sablonlar/999999/kaydet', { surum: 1, ad: 'Yok', dil: 'tr', icerik })).statusCode, 404);
  });

  test('kopya kaynağın içeriğini alır, varsayılan olmaz; aynı ad 409', async () => {
    const s = (await form()).sablonlar.find((x) => x.varsayilan);
    assert.ok(s);
    const c = await gonder(yonetici, `/siparisler/teklif-formu/sablonlar/${s.id}/kopyala`, { ad: 'Standart teklif (kopya)' });
    assert.equal(c.statusCode, 200, c.body);
    const kopya = c.json<TeklifFormuCevabi>().sablonlar.find((x) => x.ad === 'Standart teklif (kopya)');
    assert.equal(kopya?.varsayilan, false);
    assert.deepEqual(kopya?.icerik, s.icerik);
    assert.equal((await gonder(yonetici, `/siparisler/teklif-formu/sablonlar/${s.id}/kopyala`, { ad: 'Standart teklif (kopya)' })).statusCode, 409);
  });

  test('varsayılan tektir: yeni varsayılan eskisini kaldırır; eski sürümle 409', async () => {
    const f = await form();
    const en = f.sablonlar.find((x) => x.dil === 'en');
    assert.ok(en);
    const c = await gonder(yonetici, `/siparisler/teklif-formu/sablonlar/${en.id}/varsayilan-yap`, { surum: en.surum });
    assert.equal(c.statusCode, 200, c.body);
    const sonra = c.json<TeklifFormuCevabi>();
    assert.deepEqual(sonra.sablonlar.filter((x) => x.varsayilan).map((x) => x.id), [en.id]);
    assert.equal((await gonder(yonetici, `/siparisler/teklif-formu/sablonlar/${en.id}/varsayilan-yap`, { surum: en.surum })).statusCode, 409);
    const tr = sonra.sablonlar.find((x) => x.ad === 'Standart teklif');
    assert.ok(tr);
    assert.equal((await gonder(yonetici, `/siparisler/teklif-formu/sablonlar/${tr.id}/varsayilan-yap`, { surum: tr.surum })).statusCode, 200);
  });

  test('firma bilgisi kaydedilir; eski sürüm 409; değişiklik deftere kişiyle düşer', async () => {
    const f = await form();
    const kurum = { unvan: 'ORN Deneme A.Ş.', adres: 'ORN Sokak 0', telefon: '0', eposta: 'orn@orn.example', vergi: 'ORN VD 0' };
    const c = await gonder(yonetici, '/siparisler/teklif-formu/kurum/kaydet', { surum: f.kurumSurum, kurum });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<TeklifFormuCevabi>().kurum, kurum);
    assert.equal((await gonder(yonetici, '/siparisler/teklif-formu/kurum/kaydet', { surum: f.kurumSurum, kurum })).statusCode, 409);
    const defter = await o().sahip.tek<{ kisi_id: number | null }>(
      "SELECT kisi_id FROM denetim_degisiklik WHERE tablo = 'siparisler_teklif_formu_kurum' AND islem <> 'ekle' ORDER BY id DESC LIMIT 1");
    assert.equal(defter?.kisi_id, yoneticiId);
  });

  test('form verisi: müşteri firma kartından, toplamlar sürümden ve verilen KDV oranından; yalnız fiyat gören okur', async () => {
    const firma = await gonder(yonetici, '/musteri-tedarikci/firmalar/ekle', { ad: 'ORN Müşteri Deneme', tur: 'musteri' });
    assert.equal(firma.statusCode, 200, firma.body);
    const firmaId = firma.json<{ firma: { id: number } }>().firma.id;
    const t = await gonder(yonetici, '/siparisler/teklifler/ekle', { firmaId, baslik: 'Form denemesi', istenenTarih: null, aciklama: null, satirlar: [{ malzemeNo: null, tanim: 'ORN parça', miktar: '5' }] });
    assert.equal(t.statusCode, 200, t.body);
    const teklif = t.json<TeklifAyrintisi>();
    const v = await gonder(yonetici, `/siparisler/teklifler/${teklif.id}/surum-ver`, { surum: teklif.surum, fiyatlar: [{ satirId: teklif.satirlar[0]?.id, birimFiyat: '100' }], iskontoOrani: '4' });
    assert.equal(v.statusCode, 200, v.body);
    const yol = `/siparisler/teklifler/${teklif.id}/form`;
    const c = await oku(satis, `${yol}?surumNo=1&kdvOrani=20`);
    assert.equal(c.statusCode, 200, c.body);
    const f = c.json<TeklifFormuVerisiCevabi>();
    assert.deepEqual(f.musteri, { ad: 'ORN Müşteri Deneme', adres: null, vergiNo: null });
    assert.deepEqual([f.araToplam, f.iskontoTutari, f.kdvHaric, f.kdvTutari, f.genelToplam], ['500.00', '20.00', '480.00', '96.00', '576.00']);
    assert.equal(f.kdvHaric, v.json<TeklifAyrintisi>().surumler[0]?.toplam);
    assert.equal((await oku(satis, `${yol}?surumNo=1&kdvOrani=10`)).json<TeklifFormuVerisiCevabi>().genelToplam, '528.00');
    assert.equal((await oku(operator, `${yol}?surumNo=1&kdvOrani=20`)).statusCode, 403);
    assert.equal((await oku(depo, `/siparisler/teklifler/${teklif.id}`)).statusCode, 200);
    assert.equal((await oku(depo, `${yol}?surumNo=1&kdvOrani=20`)).statusCode, 403);
    assert.equal((await oku(yonetici, `${yol}?surumNo=7&kdvOrani=20`)).statusCode, 404);
    assert.equal((await oku(yonetici, `${yol}?surumNo=1&kdvOrani=abc`)).statusCode, 400);
    assert.equal((await oku(yonetici, '/siparisler/teklifler/999999/form?surumNo=1&kdvOrani=20')).statusCode, 404);
  });
});
