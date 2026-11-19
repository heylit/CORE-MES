import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { sevkIsiOzeti, siparisinSevkleri } from './disari.ts';

// 3429-3 F4: onaylı siparişin emirsiz kalemi ("Stoktan", "Satın al") Tüm işlerde sipariş kalemi adayıdır; bırakılan kalem işe girer,
// sevki siparişin akışında kaleme sayılır, kapanış eksiğinden düşer. Sipariş onaylı değilse işe girmemiş kalem kaldırılır; işe girmiş
// kalem siparişte kilitlidir. Bağlar kablolamadadır (uygulamaKur kurar). Veriler uydurmadır (ORN- kodlu).
const PAROLA = 'dogru-parola-1';
interface Hata { kod: string; mesaj: string }
interface AkisKalemi { id: number; sevkEdilen: number; yolda: number }
interface Akis { kalemler: AkisKalemi[]; kapanisEksikleri: string[]; asama: string }

describe('sevkiyat sipariş kalemi (3429-3 F4, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let yoneticiId = 0;
  let firmaId = 0;
  let noktaId = 0;
  let sayac = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tek = async (sql: string, p: unknown[] = []): Promise<number> => (await o().sahip.tek<{ id: number }>(sql, p))!.id;
  async function istek<T = unknown>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const malzeme = async (): Promise<number> => {
    sayac += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'ticari_mal', 'ORN-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`ornsvk-${sayac}`, sayac, JSON.stringify({ id: `ornsvk-${sayac}`, com: { ad: 'Deneme sevk', birim: 'adet' } }), yoneticiId]))!.no;
  };
  const siparis = async (kalemler: { malzemeNo: number; miktar: number; karsilama: string }[]): Promise<{ id: number; no: string; satirlar: number[] }> => {
    sayac += 1;
    const no = `ORN-SVK-${String(sayac).padStart(4, '0')}`;
    const id = await tek(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id)
       VALUES ($1, 'taslak', $2, current_date, current_date + 3, 20, $3) RETURNING id`, [no, firmaId, yoneticiId]);
    const satirlar: number[] = [];
    for (const [i, k] of kalemler.entries()) {
      satirlar.push(await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, karsilama) VALUES ($1, $2, $3, $4, 5, $5) RETURNING id',
        [id, i + 1, k.malzemeNo, k.miktar, k.karsilama]));
    }
    return { id, no, satirlar };
  };
  const surum = async (id: number): Promise<number> => (await o().sahip.tek<{ surum: number }>('SELECT surum FROM siparisler_siparis WHERE id = $1', [id]))!.surum;
  const komut = async (id: number, k: 'onayla' | 'onay-geri-al' | 'iptal') =>
    istek<Hata>('POST', `/siparisler/${id}/${k}`, { surum: await surum(id), ...(k === 'onayla' ? {} : { neden: 'Deneme' }) });
  const gun = (ek: number): string => new Date(Date.now() + ek * 86_400_000).toISOString().slice(0, 10);
  const tumIsler = async (): Promise<TumIsSatiri[]> => {
    const r = await istek<{ satirlar: TumIsSatiri[] }>('GET', `/sevkiyat/tum-isler?baslangic=${gun(-1)}&bitis=${gun(10)}`);
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    return r.govde.satirlar;
  };
  const satir = async (anahtar: string): Promise<TumIsSatiri | undefined> => (await tumIsler()).find((x) => x.anahtar === anahtar);
  const birak = (anahtar: string) => istek<Hata & { kalemIdleri: number[] }>('POST', '/sevkiyat/tum-isler/serbest-birak', { anahtarlar: [anahtar], tasima: 'biz' });
  const iseCevir = async (kalemId: number): Promise<number> => {
    const r = await istek<Hata & { is: { id: number } }>('POST', `/sevkiyat/bekleyenler/${kalemId}/ise-cevir`, {
      tarih: gun(1), tur: 'teslimat', alisNoktasiId: null, birakisNoktasiId: noktaId, agirlikKilogram: 50, paletSayisi: 1, durakSuresiDakika: null,
      alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null, belgeNo: null, aciklama: null, sabitAracId: null,
    });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    return r.govde.is.id;
  };
  const akis = async (id: number): Promise<Akis> => {
    const r = await istek<Akis>('GET', `/akis/siparisler/${id}`);
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    return r.govde;
  };
  const sevk = (a: Akis, satirId: number) => { const k = a.kalemler.find((x) => x.id === satirId)!; return [k.sevkEdilen, k.yolda]; };

  before(async () => {
    ortam = await testVeritabaniKur('sevkiyat_siparis_kalemi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    firmaId = await tek("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri', 'musteri', $1) RETURNING id", [yoneticiId]);
    noktaId = await tek("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ('Deneme Müşteri Noktası', 'musteri', 39.95, 32.75, $1) RETURNING id", [firmaId]);
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-', 0) ON CONFLICT (onek) DO NOTHING");
  });
  after(async () => { await ortam?.kaldir(); });

  test('onaylı siparişin emirsiz kalemi aday; bırakılan kalem işe girer, sevki akışta kaleme sayılır, kapanış eksiğinden düşer; fatura bağı siparişi bulur', async () => {
    const m = await malzeme();
    const s = await siparis([{ malzemeNo: m, miktar: 5, karsilama: 'stok' }, { malzemeNo: m, miktar: 2, karsilama: 'satin-al' }]);
    const [stoktan, satinAl] = s.satirlar as [number, number];
    assert.equal(await satir(`siparis:${stoktan}`), undefined, 'taslak sipariş aday vermez');
    assert.equal((await komut(s.id, 'onayla')).durum, 200);

    const aday = (await satir(`siparis:${stoktan}`))!;
    assert.deepEqual([aday.kaynak, aday.yon, aday.asama, aday.adet, aday.siparisNo, aday.firmaId, aday.malzemeNo, aday.ilerleme],
      ['siparis', 'gidis', 'hazir', '5', s.no, firmaId, m, 'Stoktan karşılanır']);
    assert.equal((await satir(`siparis:${satinAl}`))?.ilerleme, 'Satın alınır');
    const once = await akis(s.id);
    assert.deepEqual(once.kapanisEksikleri.slice(0, 2), ['Kalem 1: teslim edilen 0 / 5.', 'Kalem 2: teslim edilen 0 / 2.'], 'emirsiz kalemin sevki kapanışta ölçülür');

    const b = await birak(`siparis:${stoktan}`);
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const [kalemId] = b.govde.kalemIdleri as [number];
    assert.equal(await satir(`siparis:${stoktan}`), undefined, 'bırakılan aday listeden düşer');
    const kalem = (await satir(`kalem:${kalemId}`))!;
    assert.deepEqual([kalem.kaynak, kalem.asama, kalem.adet, kalem.siparisNo, kalem.firmaId], ['siparis', 'havuzda', '5.0000', s.no, firmaId]);
    assert.equal((await birak(`siparis:${stoktan}`)).durum, 409, 'kalanı olmayan kalem ikinci kez açılmaz');

    const isId = await iseCevir(kalemId);
    assert.deepEqual(sevk(await akis(s.id), stoktan), [0, 0], 'havuzdaki iş sevk sayılmaz');
    assert.equal((await istek('POST', `/sevkiyat/isler/${isId}/durum`, { durum: 'tamamlandi', tarih: gun(1), not: null })).durum, 200);
    const sonra = await akis(s.id);
    assert.deepEqual(sevk(sonra, stoktan), [5, 0]);
    assert.ok(!sonra.kapanisEksikleri.some((e) => e.startsWith('Kalem 1:')), JSON.stringify(sonra.kapanisEksikleri));
    assert.ok(sonra.kapanisEksikleri.includes('Kalem 2: teslim edilen 0 / 2.'));
    assert.equal(sonra.asama, 'kismi-sevk');

    const sevkler = await o().vt.tx((db) => siparisinSevkleri(db, s.id));
    assert.deepEqual(sevkler.map((x) => [x.isId, x.uretimEmriId, x.satisSiparisSatiriId, x.adet, x.durum]), [[isId, null, stoktan, '5.0000', 'tamamlandi']]);
    assert.deepEqual(await o().vt.tx((db) => sevkIsiOzeti(db, isId)), { tur: 'teslimat', firmaId, siparisId: s.id, iptal: false }, 'faturanın bağlanacağı sipariş');

    // İşe girmiş kalem onayı geri alınmış siparişte kilitli (SIP-19); işe girmemiş satın al kalemi değil.
    assert.equal((await birak(`siparis:${satinAl}`)).durum, 200);
    assert.equal((await komut(s.id, 'onay-geri-al')).durum, 200);
    const ayrinti = await istek<{ satirlar: { id: number; emreBagli: boolean }[] }>('GET', `/siparisler/${s.id}`);
    assert.deepEqual(ayrinti.govde.satirlar.map((k) => [k.id, k.emreBagli]), [[stoktan, true], [satinAl, false]]);
    const kaldirildi = await o().sahip.sorgu<{ kaldirildi: boolean }>(
      "SELECT kaldirildi IS NOT NULL AS kaldirildi FROM sevkiyat_bekleyen WHERE satis_siparis_satiri_id = $1", [satinAl]);
    assert.deepEqual(kaldirildi, [{ kaldirildi: true }], 'onay geri alınınca işe girmemiş kalem kaldırılır');
    // Risk D1: onaylı olmayan siparişin işi iptal edilince yük açık kayda dönmez, aday doğmaz.
    assert.equal((await istek('POST', `/sevkiyat/isler/${isId}/durum`, { durum: 'havuzda', tarih: gun(1), not: null })).durum, 200);
    assert.equal((await istek('POST', `/sevkiyat/isler/${isId}/iptal-et`)).durum, 200);
    const acik = await o().sahip.sorgu<{ n: number }>(
      'SELECT count(*)::int AS n FROM sevkiyat_bekleyen WHERE satis_siparis_satiri_id = $1 AND kaldirildi IS NULL AND is_id IS NULL', [stoktan]);
    assert.deepEqual(acik, [{ n: 0 }]);
    assert.equal((await komut(s.id, 'onayla')).durum, 200);
    assert.equal((await satir(`siparis:${stoktan}`))?.adet, '5', 'yeniden onayda kalan yine aday; iptal edilen sevk sayılmaz');
  });

  test('iptal edilen işin kalemi açık kalır, aday ikinci kez doğmaz; kalan kadar ikinci kalem açılır; sipariş iptalinde işe girmemiş kalem kaldırılır', async () => {
    const m = await malzeme();
    const s = await siparis([{ malzemeNo: m, miktar: 4, karsilama: 'stok' }]);
    const [satirId] = s.satirlar as [number];
    assert.equal((await komut(s.id, 'onayla')).durum, 200);
    const [kalemId] = (await birak(`siparis:${satirId}`)).govde.kalemIdleri as [number];
    const isId = await iseCevir(kalemId);
    assert.equal((await istek('POST', `/sevkiyat/isler/${isId}/iptal-et`)).durum, 200);
    const acik = (await tumIsler()).filter((x) => x.kaynak === 'siparis' && x.siparisNo === s.no);
    assert.deepEqual(acik.map((x) => [x.kalemId !== null, x.asama, x.adet]), [[true, 'havuzda', '4.0000']], 'iptal edilen işin yükü yeni açık kayda geçer, aday yok');
    assert.deepEqual((await o().vt.tx((db) => siparisinSevkleri(db, s.id))).map((x) => [x.isId, x.iptal]), [[isId, true]]);

    // Kısmi: açık kalem miktarı düşürülürse (sevkiyat elle) kalan aday olur ve kalan kadar açılır.
    await o().sahip.sorgu("UPDATE sevkiyat_bekleyen SET adet = 1 WHERE kaynak = 'siparis' AND satis_siparis_satiri_id = $1 AND is_id IS NULL AND kaldirildi IS NULL", [satirId]);
    assert.equal((await satir(`siparis:${satirId}`))?.adet, '3');
    assert.equal((await birak(`siparis:${satirId}`)).durum, 200);
    assert.equal(await satir(`siparis:${satirId}`), undefined);

    assert.equal((await komut(s.id, 'iptal')).durum, 200);
    const kalanlar = await o().sahip.sorgu<{ n: number }>(
      "SELECT count(*)::int AS n FROM sevkiyat_bekleyen WHERE satis_siparis_satiri_id = $1 AND kaldirildi IS NULL", [satirId]);
    assert.deepEqual(kalanlar, [{ n: 1 }], 'iptal edilen işteki geçmiş kalır, açık kalemler kaldırılır');
    assert.equal(await satir(`siparis:${satirId}`), undefined, 'iptal edilen sipariş aday vermez');
  });

  test('kısıt: sipariş kalemi satırsız, müşterisiz ya da adetsiz yazılamaz; satış satırı yalnız sipariş kaleminde', async () => {
    const m = await malzeme();
    const ekle = (kaynak: string, satir: number | null, firma: number | null, adet: number | null) => o().sahip.sorgu(
      `INSERT INTO sevkiyat_bekleyen (kaynak, yon, uretim_emri_id, firma_id, malzeme_no, adet, satis_siparis_satiri_id, aciklama, elle_turu)
       VALUES ($1, 'gidis', NULL, $2, $3, $4, $5, CASE WHEN $1 = 'elle' THEN 'Deneme' END, CASE WHEN $1 = 'elle' THEN 'diger' END)`, [kaynak, firma, m, adet, satir]);
    const s = await siparis([{ malzemeNo: m, miktar: 1, karsilama: 'stok' }]);
    await assert.rejects(ekle('siparis', null, firmaId, 1), /sevkiyat_bekleyen_kaynak_alanlari/);
    await assert.rejects(ekle('siparis', s.satirlar[0]!, null, 1), /sevkiyat_bekleyen_kaynak_alanlari/);
    await assert.rejects(ekle('siparis', s.satirlar[0]!, firmaId, null), /sevkiyat_bekleyen_kaynak_alanlari/);
    await assert.rejects(ekle('elle', s.satirlar[0]!, firmaId, 1), /sevkiyat_bekleyen_satis_siparisinde/);
    await ekle('siparis', s.satirlar[0]!, firmaId, 1);
  });
});
