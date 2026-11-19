import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { binde } from './kurallar.ts';
import { bakiyeDegistir } from './servis/ortak.ts';

// 3429-3 F4b: satış siparişi kaleminin ("Stoktan") depo son çıkışı malzemenin stokunu sevk çıkışıyla düşer ve satırın ayırma
// isteğini teslim eder; çıkışın geri alınması stoğu ve isteği geri getirir. Stok yoksa çıkış reddedilir, eksik stok eksiye düşer.
// Bağlar kablolamadadır (uygulamaKur kurar). Veriler uydurmadır (ORN- kodlu).
const PAROLA = 'dogru-parola-1';
interface Hata { kod: string; mesaj: string }

describe('stok: satış siparişi kaleminin depo çıkışı (3429-3 F4b, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let yoneticiId = 0;
  let firmaId = 0;
  let noktaId = 0;
  let raf = 0;
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
  const malzeme = async (birim = 'adet'): Promise<number> => {
    sayac += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'ticari_mal', 'ORN-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`ornss-${sayac}`, sayac, JSON.stringify({ id: `ornss-${sayac}`, com: { ad: 'Deneme ticari', birim } }), yoneticiId]))!.no;
  };
  async function giris(m: number, miktar: string): Promise<void> {
    await o().vt.tx(async (db: Db) => {
      await db.sorgu(
        `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('giris', pg_current_xact_id(), $4) RETURNING id),
           h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, hedef_konum_id, miktar, kisi_id, giris_kaynagi)
                 VALUES (now(), 'giris', $1, $2, $3, $4, 'mal_kabul') RETURNING id)
         INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`, [m, raf, miktar, yoneticiId]);
      await bakiyeDegistir(db, { malzemeId: m, konumId: raf, partiId: null, kaliteDurumu: 'serbest', fark: binde(miktar) });
    });
  }
  const stok = async (m: number): Promise<number> =>
    Number((await o().sahip.tek<{ m: string }>('SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [m]))!.m);
  const sevkCikisi = async (m: number): Promise<number> => Number((await o().sahip.tek<{ m: string }>(
    `SELECT COALESCE(sum(h.miktar), 0)::text AS m FROM stok_hareketi h
      WHERE h.malzeme_id = $1 AND h.tur = 'cikis' AND h.cikis_nedeni = 'sevk' AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)`, [m]))!.m);
  const istekler = (satirId: number) => o().sahip.sorgu<{ miktar: string; durum: string }>(
    "SELECT miktar::text AS miktar, durum FROM stok_ayirma_istegi WHERE kaynak = 'siparis' AND siparis_satiri_id = $1 ORDER BY id", [satirId]);
  const siparis = async (malzemeNo: number, miktar: number): Promise<{ id: number; satir: number }> => {
    sayac += 1;
    const id = await tek(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id)
       VALUES ($1, 'taslak', $2, current_date, current_date + 3, 20, $3) RETURNING id`, [`ORN-SS-${String(sayac).padStart(4, '0')}`, firmaId, yoneticiId]);
    const satir = await tek("INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, karsilama) VALUES ($1, 1, $2, $3, 5, 'stok') RETURNING id",
      [id, malzemeNo, miktar]);
    const surum = (await o().sahip.tek<{ surum: number }>('SELECT surum FROM siparisler_siparis WHERE id = $1', [id]))!.surum;
    const r = await istek<Hata>('POST', `/siparisler/${id}/onayla`, { surum });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    return { id, satir };
  };
  const gun = (ek: number): string => new Date(Date.now() + ek * 86_400_000).toISOString().slice(0, 10);
  // Aday bırakılır, işe çevrilir, tetiklenir: kalem depoda son çıkışı bekler.
  const depoya = async (satirId: number): Promise<number> => {
    const b = await istek<Hata & { kalemIdleri: number[] }>('POST', '/sevkiyat/tum-isler/serbest-birak', { anahtarlar: [`siparis:${satirId}`], tasima: 'biz' });
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const kalemId = b.govde.kalemIdleri[0]!;
    const c = await istek<Hata & { is: { id: number } }>('POST', `/sevkiyat/bekleyenler/${kalemId}/ise-cevir`, {
      tarih: gun(0), tur: 'teslimat', alisNoktasiId: null, birakisNoktasiId: noktaId, agirlikKilogram: 50, paletSayisi: 1, durakSuresiDakika: null,
      alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null, belgeNo: null, aciklama: null, sabitAracId: null,
    });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const t = await istek<Hata>('POST', `/sevkiyat/isler/${c.govde.is.id}/tetikle`);
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const liste = await istek<{ satirlar: { kalemId: number; kaynak: string; adet: string | null }[] }>('GET', '/stok/depo-sevk');
    const s = liste.govde.satirlar.find((x) => x.kalemId === kalemId);
    assert.equal(s?.kaynak, 'siparis', 'tetiklenen sipariş kalemi depoya düşer');
    return kalemId;
  };
  const cikis = (kalemId: number) => istek<Hata & { hareketIdler: number[]; uyarilar?: string[] }>('POST', `/stok/depo-sevk/${kalemId}/cikis`);

  before(async () => {
    ortam = await testVeritabaniKur('stok_siparis_sevki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    firmaId = await tek("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri', 'musteri', $1) RETURNING id", [yoneticiId]);
    noktaId = await tek("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ('Deneme Müşteri Noktası', 'musteri', 39.95, 32.75, $1) RETURNING id", [firmaId]);
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-', 0) ON CONFLICT (onek) DO NOTHING");
    raf = await tek("INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ((SELECT depo_id FROM stok_konum WHERE kod = 'KABUL'), 'ORN-SS1', 'depo_zemini', 'Deneme zemini') RETURNING id");
  });
  after(async () => { await ortam?.kaldir(); });

  test('son çıkış stoğu sevk çıkışıyla düşer, ayırma isteği teslim olur; geri alma stoğu ve isteği geri getirir; yeniden çıkış yine düşer', async () => {
    const m = await malzeme();
    await giris(m, '10');
    const s = await siparis(m, 4);
    assert.deepEqual(await istekler(s.satir), [{ miktar: '4.0000', durum: 'bekliyor' }], 'F2: onayda istek açılır');
    const kalemId = await depoya(s.satir);

    const c = await cikis(kalemId);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.hareketIdler.length, 1);
    assert.equal(c.govde.uyarilar, undefined);
    assert.deepEqual([await stok(m), await sevkCikisi(m)], [6, 4]);
    assert.deepEqual(await istekler(s.satir), [{ miktar: '4.0000', durum: 'teslim' }], 'Risk F4 K1: ayırma açık kalmaz');
    assert.equal((await cikis(kalemId)).durum, 409, 'ikinci çıkış yok');

    const geri = await istek<Hata>('POST', `/stok/depo-sevk/${kalemId}/geri-al`);
    assert.equal(geri.durum, 200, JSON.stringify(geri.govde));
    assert.deepEqual([await stok(m), await sevkCikisi(m)], [10, 0]);
    assert.deepEqual(await istekler(s.satir), [{ miktar: '4.0000', durum: 'ayrildi' }], 'geri alınan çıkışın stoğu siparişe ayrılmış kalır');

    assert.equal((await cikis(kalemId)).durum, 200);
    assert.deepEqual([await stok(m), await sevkCikisi(m)], [6, 4]);
    assert.deepEqual(await istekler(s.satir), [{ miktar: '4.0000', durum: 'teslim' }]);
  });

  test('eksik stok son bakiyede eksiye düşer ve uyarılır; hiç stok yoksa çıkış reddedilir, kalem depoda bekler', async () => {
    const m = await malzeme('kg');
    await giris(m, '3');
    const s = await siparis(m, 5);
    assert.deepEqual(await istekler(s.satir), [{ miktar: '3.0000', durum: 'bekliyor' }], 'F2: istek eldeki kadar');
    const kalemId = await depoya(s.satir);
    const c = await cikis(kalemId);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.uyarilar?.length, 1);
    assert.match(c.govde.uyarilar[0]!, /^Malzeme ORN-\S+: 2 kg stokta yoktu, eksiye düştü; sonraki giriş tamamlar\.$/);
    assert.deepEqual([await stok(m), await sevkCikisi(m)], [-2, 5]);
    assert.deepEqual(await istekler(s.satir), [{ miktar: '3.0000', durum: 'teslim' }]);

    // Risk N3: onayı geri alınan siparişin işe girmiş kalemi depoda bekler, stok çıkmaz.
    const m3 = await malzeme();
    await giris(m3, '5');
    const s3 = await siparis(m3, 1);
    const k3 = await depoya(s3.satir);
    const surum = (await o().sahip.tek<{ surum: number }>('SELECT surum FROM siparisler_siparis WHERE id = $1', [s3.id]))!.surum;
    assert.equal((await istek('POST', `/siparisler/${s3.id}/onay-geri-al`, { surum, neden: 'Deneme' })).durum, 200);
    const r3 = await cikis(k3);
    assert.equal(r3.durum, 409, JSON.stringify(r3.govde));
    assert.deepEqual([await stok(m3), await sevkCikisi(m3)], [5, 0]);

    const bos = await malzeme();
    const s2 = await siparis(bos, 2);
    assert.deepEqual(await istekler(s2.satir), [], 'stok yokken istek açılmaz');
    const k2 = await depoya(s2.satir);
    const r = await cikis(k2);
    assert.equal(r.durum, 409, JSON.stringify(r.govde));
    assert.match(r.govde.mesaj, /: sevk için 2 adet gerekli, stokta 0 adet var\. Eksiye düşecek lot yok\.$/);
    assert.deepEqual([await stok(bos), await sevkCikisi(bos)], [0, 0]);
    const liste = await istek<{ satirlar: { kalemId: number }[] }>('GET', '/stok/depo-sevk');
    assert.ok(liste.govde.satirlar.some((x) => x.kalemId === k2), 'reddedilen kalem depoda bekler');
  });
  test('Test B1, T1-T4: yoldaki partisiz teslim düşülür; karar bekleyen stokta red; hurda, firma konumu atlanır, emirsiz parti önce; hizmet stoğa yazılmaz; açık istek varken geri alma ikinci açık istek açmaz', async () => {
    const konum = (kod: string, tur: string, firma: number | null = null) => tek(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad, firma_id) VALUES ((SELECT depo_id FROM stok_konum WHERE kod = 'KABUL'), $1, $2, 'Deneme', $3) RETURNING id", [kod, tur, firma]);
    const koy = (m: number, konumId: number, miktar: string, d: { partiId?: number | null; kaliteDurumu?: 'serbest' | 'karar_bekliyor' | 'red' } = {}) =>
      o().vt.tx(async (db: Db) => {
        await db.sorgu(
          `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('giris', pg_current_xact_id(), $4) RETURNING id),
             h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, hedef_konum_id, miktar, kisi_id, giris_kaynagi, parti_id, parti_secimi, hedef_kalite_durumu)
                   VALUES (now(), 'giris', $1, $2, $3, $4, 'mal_kabul', $5, CASE WHEN $5::bigint IS NULL THEN NULL ELSE 'kisi' END, $6) RETURNING id)
           INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`,
          [m, konumId, miktar, yoneticiId, d.partiId ?? null, d.kaliteDurumu ?? 'serbest']);
        await bakiyeDegistir(db, { malzemeId: m, konumId, partiId: d.partiId ?? null, kaliteDurumu: d.kaliteDurumu ?? 'serbest', fark: binde(miktar) });
      });
    // B1: rafta partisiz 10, 8'i yolda teslimde; sipariş 4: serbest 2 alınır, 2 eksiye düşer.
    const m1 = await malzeme();
    await giris(m1, '10');
    const ikinci = await konum('ORN-SS2', 'depo_zemini');
    await o().sahip.sorgu(
      `INSERT INTO stok_teslim (no, kaynak_kimligi, malzeme_id, miktar, kaynak_konum_id, hedef_konum_id, gonderen_kisi_id)
       VALUES ('ORN-T-1', 'orn-teslim-1', $1, 8, $2, $3, $4)`, [m1, raf, ikinci, yoneticiId]);
    const s1 = await siparis(m1, 4);
    const c1 = await cikis(await depoya(s1.satir));
    assert.equal(c1.durum, 200, JSON.stringify(c1.govde));
    assert.match(c1.govde.uyarilar?.[0] ?? '', /: 2 adet stokta yoktu, eksiye düştü/);
    assert.equal(await stok(m1), 6, 'raftan 4 düşer; 2 si yoldaki teslimin karşılığından eksidir');

    // T2: yalnız karar bekleyen stok varken çıkış reddedilir.
    const m2 = await malzeme();
    await koy(m2, raf, '5', { kaliteDurumu: 'karar_bekliyor' });
    const s2 = await siparis(m2, 3);
    const c2 = await cikis(await depoya(s2.satir));
    assert.equal(c2.durum, 409, JSON.stringify(c2.govde));
    assert.match(c2.govde.mesaj, /kalite kararı bekliyor/);

    // T3: hurda ve firma konumundaki stok alınmaz; en eski giriş önce (sevk bekleyen emir partisi urun-sevki.test.ts Risk K1'de).
    const m3 = await malzeme();
    const hurda = await konum('ORN-SSH', 'hurda');
    const yolda = await konum('ORN-SSY', 'yolda', firmaId);
    const lot = await tek("INSERT INTO stok_parti (malzeme_id, tedarikci_parti_no, acan_kisi_id, lot_no) VALUES ($1, 'ORN-TP-1', $2, 'ORN-LOT-1') RETURNING id", [m3, yoneticiId]);
    await koy(m3, hurda, '9');
    await koy(m3, yolda, '9');
    await koy(m3, raf, '3', { partiId: lot });
    await giris(m3, '2');
    const s3 = await siparis(m3, 4);
    const c3 = await cikis(await depoya(s3.satir));
    assert.equal(c3.durum, 200, JSON.stringify(c3.govde));
    const kalan = await o().sahip.sorgu<{ konum: number; parti: number | null; m: string }>(
      'SELECT konum_id AS konum, parti_id AS parti, miktar::text AS m FROM stok_bakiye WHERE malzeme_id = $1 ORDER BY konum_id, parti_id NULLS FIRST', [m3]);
    assert.deepEqual(kalan.map((r) => [r.konum, r.parti, Number(r.m)]).sort(), [[raf, null, 1], [hurda, null, 9], [yolda, null, 9]].sort(),
      'eski lottan 3, partisizden 1 alınır; hurda ve firma konumu dokunulmaz');

    // 147 b: yalnız red parça varken sevk edilir, uyarılır.
    const m6 = await malzeme();
    await koy(m6, raf, '2', { kaliteDurumu: 'red' });
    const s6 = await siparis(m6, 2);
    const c6 = await cikis(await depoya(s6.satir));
    assert.equal(c6.durum, 200, JSON.stringify(c6.govde));
    assert.deepEqual(c6.govde.uyarilar?.map((u) => u.replace(/^Malzeme \S+: /, '')), ['2 adet red parça sevk edildi.']);

    // T1: hizmet kalemi stoğa yazılmaz.
    sayac += 1;
    const hizmet = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, hizmet_yonu, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hizmet', 'verilen', 'ORN-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`ornss-${sayac}`, sayac, JSON.stringify({ id: `ornss-${sayac}`, com: { ad: 'Deneme hizmet', birim: 'adet' } }), yoneticiId]))!.no;
    const s4 = await siparis(hizmet, 1);
    const c4 = await cikis(await depoya(s4.satir));
    assert.equal(c4.durum, 200, JSON.stringify(c4.govde));
    assert.deepEqual(c4.govde.hareketIdler, []);

    // T4: çıkıştan sonra satıra yeni açık istek açıldıysa geri alma teslimi geri döndürmez (satırda tek açık istek).
    const m5 = await malzeme();
    await giris(m5, '10');
    const s5 = await siparis(m5, 2);
    const k5 = await depoya(s5.satir);
    assert.equal((await cikis(k5)).durum, 200);
    await o().sahip.sorgu(
      `INSERT INTO stok_ayirma_istegi (kaynak, siparis_id, siparis_satiri_id, talep_no, kalem_ad, malzeme_id, miktar, birim, kaynaklar, isteyen_kisi_id)
       VALUES ('siparis', $1, $2, 'ORN', 'ORN kalem', $3, 1, 'adet', $5::jsonb, $4)`,
      [s5.id, s5.satir, m5, yoneticiId, JSON.stringify([{ malzemeNo: m5, artikId: null, stokMiktari: 1, karsilanan: 1, konumlar: [] }])]);
    assert.equal((await istek<Hata>('POST', `/stok/depo-sevk/${k5}/geri-al`)).durum, 200);
    assert.deepEqual(await istekler(s5.satir), [{ miktar: '2.0000', durum: 'teslim' }, { miktar: '1.0000', durum: 'bekliyor' }]);
    assert.equal(await stok(m5), 10);
  });

  test('Test T5: statülü (yarı mamul) bakiye sevk çıkışına girmez; statüsüz yetmeyen kısım eksiye düşer', async () => {
    const m = await malzeme();
    const kod = (await o().sahip.tek<{ kod: string }>("SELECT 'ORN-' || lpad(sira_no::text, 5, '0') AS kod FROM malzeme_katalog_karti WHERE no = $1", [m]))!.kod;
    const statu = await tek("INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ($1, 'Deneme ara statü', $2, '#336699', 'YM') RETURNING id", [kod, `orn-adim-${String(m)}`]);
    await o().vt.tx(async (db: Db) => {
      await db.sorgu(
        `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('giris', pg_current_xact_id(), $4) RETURNING id),
           h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, hedef_konum_id, miktar, kisi_id, giris_kaynagi, hedef_statu_id)
                 VALUES (now(), 'giris', $1, $2, $3, $4, 'mal_kabul', $5) RETURNING id)
         INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`, [m, raf, '5', yoneticiId, statu]);
      await bakiyeDegistir(db, { malzemeId: m, konumId: raf, partiId: null, statuId: statu, kaliteDurumu: 'serbest', fark: binde('5') });
    });
    await giris(m, '2');
    const s = await siparis(m, 4);
    const c = await cikis(await depoya(s.satir));
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.match(c.govde.uyarilar?.[0] ?? '', /: 2 adet stokta yoktu, eksiye düştü/);
    const b = await o().sahip.sorgu<{ statu: number | null; miktar: string }>(
      'SELECT statu_id AS statu, miktar::text AS miktar FROM stok_bakiye WHERE malzeme_id = $1 ORDER BY statu_id NULLS FIRST', [m]);
    assert.deepEqual(b.map((x) => [x.statu, Number(x.miktar)]), [[null, -2], [statu, 5]], 'statülü 5 yerinde kalır, statüsüz 2 - 4 = -2');
  });
});
