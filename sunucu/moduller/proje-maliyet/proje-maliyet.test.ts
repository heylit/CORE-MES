import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { ProjeMaliyetCevabi } from '#paylasilan/sozlesme/proje-maliyet.ts';
import type { Proje } from '#paylasilan/sozlesme/projeler.ts';
import type { SiparisAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import type { MaliyetKaydi } from './kurallar.ts';
import { bitenleriDondur, FIYAT_ISLEMI, projeMaliyeti, tabanAl } from './servis.ts';
import { isler } from './isler.ts';
import { isEmriTahminiMaliyetleri, uretimEmriMalzemeMaliyetleri } from './disari.ts';
import { defterOku, defterYaz } from './sorgular.ts';

const PAROLA = 'dogru-parola-1';
// Sipariş termini 2026-11-15; hesap günü sabit.
const SIMDI = Date.parse('2026-10-19T09:00:00Z');

describe('proje-maliyet (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let operator = '';
  let yoneticiId = 0;
  let sayac = 0;
  let siparisli: Proje;
  let siparissiz: Proje;
  let siparis: SiparisAyrintisi;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisYap(rolKodu: string | null, yonetenId: number | null): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `pm-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null && yonetenId !== null) {
        const rol = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yonetenId, yeni, rol?.id ?? 0);
        await rolAl(db, yonetenId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  const gonder = (cerez: string, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const oku = (cerez: string, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
  async function tamam<T>(c: Promise<LightMyRequestResponse>): Promise<T> {
    const cevap = await c;
    assert.equal(cevap.statusCode, 200, cevap.body);
    return cevap.json<T>();
  }

  // Malzeme kartı doğrudan yazılır (kart açılışı bu testin konusu değil); firma, sipariş ve proje kendi uçlarıyla açılır.
  async function mamulAc(): Promise<number> {
    if (!ortam) throw new Error('Test veritabanı yok');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('PM-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const kimlik = `pm-dnm-${(sayac += 1)}`;
    const satir = await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'PM-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [kimlik, sayac, JSON.stringify({ id: kimlik, com: { ad: 'Deneme mamul' } }), yoneticiId],
    );
    return satir?.no ?? 0;
  }

  before(async () => {
    ortam = await testVeritabaniKur('proje_maliyet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const y = await girisYap(null, null);
    yonetici = y.cerez;
    yoneticiId = y.id;
    operator = (await girisYap('operator', y.id)).cerez;
    const firmaId = (await tamam<{ firma: { id: number } }>(gonder(yonetici, '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Müşteri', tur: 'musteri' }))).firma.id;
    const taslak = await tamam<SiparisAyrintisi>(gonder(yonetici, '/siparisler/ekle', {
      firmaId, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2026-11-15', kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: await mamulAc(), miktar: '10', birimFiyat: '250', termin: null, aciklama: null }],
    }));
    siparis = await tamam<SiparisAyrintisi>(gonder(yonetici, `/siparisler/${taslak.id}/onayla`, { surum: taslak.surum }));
    siparisli = await tamam<Proje>(gonder(yonetici, `/projeler/siparisten/${siparis.id}/ac`, { kod: 'PM.1', ad: 'Maliyetli' }));
    // 224 sonrası yeni proje siparişsiz açılmaz; siparişsiz proje yalnız eski kayıt olarak kalır.
    const eski = await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('PM.2', 'Siparişsiz', $1) RETURNING id", [yoneticiId],
    );
    siparissiz = await tamam<Proje>(oku(yonetici, `/projeler/${eski?.id ?? 0}`));
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('PM-13 yetki: finans.maliyet-oku olan okur; olmayan 403; girişsiz 401; olmayan proje 404', async () => {
    const c = await tamam<ProjeMaliyetCevabi>(oku(yonetici, `/proje-maliyet/${siparisli.id}`));
    assert.deepEqual(c.proje, { id: siparisli.id, kod: 'PM.1', ad: 'Maliyetli' });
    assert.equal((await oku(operator, `/proje-maliyet/${siparisli.id}`)).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: `/api/proje-maliyet/${siparisli.id}` })).statusCode, 401);
    assert.equal((await oku(yonetici, '/proje-maliyet/999999')).statusCode, 404);
    assert.equal((await oku(yonetici, '/proje-maliyet/abc')).statusCode, 400);
  });

  const kullanici = (islemler: string[]): Kullanici => ({ id: yoneticiId, ad: 'Deneme', islemler } as unknown as Kullanici);

  test('PM-14 fiyat yetkisi: sipariş tutarı araToplamdan (KDV hariç); emirsiz projede gelir bilinmez; yetkisi olmayana tutar, gelir, katkı ve kâr riski null', async () => {
    const ile = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparisli.id, SIMDI));
    assert.equal(ile.fiyatGorunur, true);
    assert.deepEqual(ile.siparis, { id: siparis.id, no: siparis.no, termin: '2026-11-15', paraBirimi: 'TRY', tutar: 2500 });
    // #9: gelir siparişin tamamı değildir; projenin satıra bağlı emri yoksa bilinmez.
    assert.equal(ile.gelir, null);
    assert.equal(ile.bugun, '2026-10-19');

    const siz = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku']), siparisli.id, SIMDI));
    assert.equal(siz.fiyatGorunur, false);
    assert.equal(siz.siparis?.no, siparis.no);
    assert.deepEqual(
      [siz.siparis?.tutar, siz.gelir, siz.katkiPayi, siz.katkiOrani, siz.planlananKatkiOrani, siz.sapma, siz.karRiski.tutar, siz.karRiski.ceza],
      [null, null, null, null, null, null, null, null],
    );
  });

  test('PM-15 bağlanmamış kaynak: maliyet sıfır uydurulmaz, null döner ve eksik olarak bildirilir; siparişsiz projede sipariş yok', async () => {
    const c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparisli.id, SIMDI));
    assert.deepEqual([c.plan, c.gerceklesen, c.katkiPayi, c.karRiski.gecikmeGunu], [null, null, null, null]);
    assert.deepEqual(c.haftalar, []);
    assert.ok(c.kalemler.every((k) => k.plan === null && k.gerceklesen === null));
    assert.deepEqual(c.sapanIsEmirleri, []);
    assert.equal(c.karRiski.gunlukOran, 0.3);
    // PM-44: emirsiz projede asıl eksik iş emridir; hesaplanmayan finansman için vade uyarısı çıkmaz.
    assert.ok(c.eksikler.includes('is_emri_yok'));
    assert.ok(!c.eksikler.includes('vade_yok'));

    const s = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparissiz.id, SIMDI));
    assert.deepEqual([s.siparis, s.gelir], [null, null]);
    assert.ok(s.eksikler.includes('siparis_yok'));
  });

  // Defter satırının bağlandığı iş emri: tablolara doğrudan yazılır (emir açılışı bu testin konusu değil).
  async function isEmriAc(projeId: number | null = null, emir: { adet?: number; siparisSatiriId?: number } = {}): Promise<{ isEmriId: number; istasyonId: number }> {
    if (!ortam) throw new Error('Test veritabanı yok');
    const sahip = ortam.sahip;
    const n = (sayac += 1);
    const im = await sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`PMM${n}`, 'Deneme Merkezi']);
    const ist = await sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`PMI${n}`, 'Deneme istasyon', im!.id]);
    const e = await sahip.tek<{ id: number }>(
      `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum, malzeme_no, proje_id, siparis_satiri_id)
       VALUES ('P-PM', 'Deneme', $5, $1, $2, 'planli', $3, $4, $6) RETURNING id`,
      [ist!.id, yoneticiId, await mamulAc(), projeId, emir.adet ?? 10, emir.siparisSatiriId ?? null]);
    const tip = await sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1');
    const ie = await sahip.tek<{ id: number }>(
      `INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id, birim_sure_dk, ayar_suresi_dk)
       VALUES ($1, 1, 10, $2, 'Deneme işleme', $3, 6, 30) RETURNING id`,
      [e!.id, tip!.id, ist!.id]);
    return { isEmriId: ie!.id, istasyonId: ist!.id };
  }

  test('PM-18 (236 a) dondur ucu yok: ekran deftere yazamaz', async () => {
    assert.equal((await gonder(yonetici, `/proje-maliyet/${siparisli.id}/dondur`, {})).statusCode, 404);
  });

  test('PM-19 defter (199 a): aynı iş emri ikinci kez yazılmaz; satır değiştirilemez ve silinemez; ücretler satırda kalır', async () => {
    const { isEmriId } = await isEmriAc();
    const kayit: MaliyetKaydi = {
      isEmri: { isEmriId, emirNo: 'UE-1', opNo: 10, istasyonAd: null, bitisZamani: '2026-10-18T10:00:00.000Z' },
      ucretler: { istasyonSaat: 600, kisiSaat: [{ kisiId: yoneticiId, saatMaliyeti: 300 }] },
      bitti: true, adet: 10, saglam: 10, planTarihi: '2026-10-18', gercekTarihi: '2026-10-18',
      plan: { isleme: 100, ayar: 20 }, gercek: { isleme: 120, ayar: null },
    };
    assert.equal(await vt().tx((db) => defterYaz(db, siparisli.id, yoneticiId, [kayit])), 1);
    assert.equal(await vt().tx((db) => defterYaz(db, siparisli.id, yoneticiId, [{ ...kayit, gercek: { isleme: 999 } }])), 0);
    const defter = await vt().tx((db) => defterOku(db, siparisli.id));
    assert.deepEqual(defter.get(isEmriId), { isEmriId, plan: { isleme: 100, ayar: 20 }, gercek: { isleme: 120, ayar: null }, genelGiderGizli: false });
    const ucretler = await vt().tek<{ ucretler: unknown }>('SELECT ucretler FROM proje_maliyet_defteri WHERE is_emri_id = $1', [isEmriId]);
    assert.deepEqual(ucretler?.ucretler, kayit.ucretler);
    await assert.rejects(vt().sorgu("UPDATE proje_maliyet_defteri SET gercek = '{}' WHERE is_emri_id = $1", [isEmriId]), /yalnız ekleme/);
    await assert.rejects(vt().sorgu('DELETE FROM proje_maliyet_defteri WHERE is_emri_id = $1', [isEmriId]), /yalnız ekleme/);
  });

  test('PM-20 bağlama (PM-B1): projenin iş emri istasyon saat maliyetiyle planlanır; başlamamış işin gerçeği sıfır; işçilik planı yok, toplama girmez', async () => {
    const proje = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparissiz.id, SIMDI));
    assert.deepEqual(proje.plan, null);
    assert.ok(!proje.eksikler.includes('iscilik_plani_yok'));
    const { istasyonId } = await isEmriAc(siparissiz.id);
    let c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparissiz.id, SIMDI));
    assert.ok(c.eksikler.includes('birim_maliyet_eksik'));
    // PM-48 (PM-1 a): rotada kişi süresi yok; katkı uydurulmaz, nedeni bildirilir.
    assert.ok(c.eksikler.includes('iscilik_plani_yok'));
    assert.equal(c.katkiPayi, null);
    await ortam!.sahip.sorgu('INSERT INTO finans_istasyon_maliyet (istasyon_id, saat_maliyeti, guncelleyen_id) VALUES ($1, 600, $2)', [istasyonId, yoneticiId]);
    c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparissiz.id, SIMDI));
    assert.ok(!c.eksikler.includes('birim_maliyet_eksik'));
    // 6 dk x 10 adet x 600 TL/saat = 600; ayar 30 dk = 300.
    const kalem = (k: string) => c.kalemler.find((x) => x.kalem === k)!;
    assert.deepEqual([kalem('isleme').plan, kalem('isleme').gerceklesen], [600, 0]);
    assert.deepEqual([kalem('ayar').plan, kalem('ayar').gerceklesen], [300, 0]);
    assert.deepEqual([kalem('iscilik').plan, kalem('iscilik').gerceklesen], [null, 0]);
    assert.deepEqual(c.eksikKalemler, ['iscilik', 'genel_gider', 'finansman']);
    assert.deepEqual([c.plan, c.gerceklesen, c.bugunePlan], [900, 0, 0]);
    assert.ok(c.eksikler.includes('genel_gider_orani_yok'));
    assert.ok(c.eksikler.includes('faiz_yok'));
  });

  test('PM-22 genel gider (206 a): finans oranı girilince istasyon adımına (işleme + ayar) saati x saat başı yüklenir ve toplama girer', async () => {
    const { istasyonId } = await isEmriAc(siparissiz.id);
    await ortam!.sahip.sorgu('INSERT INTO finans_istasyon_maliyet (istasyon_id, saat_maliyeti, guncelleyen_id) VALUES ($1, 600, $2)', [istasyonId, yoneticiId]);
    // 120.000 TL / 1.000 saat = 120 TL/saat.
    await ortam!.sahip.sorgu(
      "INSERT INTO finans_genel_gider_orani (gecerlilik_baslangic, aylik_genel_gider, aylik_makine_saati, amortisman_dahil, olusturan_id) VALUES ('2026-01-01', 120000, 1000, true, $1)",
      [yoneticiId]);
    const c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparissiz.id, SIMDI));
    assert.ok(!c.eksikler.includes('genel_gider_orani_yok'));
    assert.ok(!c.eksikler.includes('amortisman_dahil_degil'));
    const kalem = c.kalemler.find((x) => x.kalem === 'genel_gider')!;
    // İki iş emri (PM-20 ve bu test), her biri 90 dk x 120 TL/saat = 180.
    assert.deepEqual([kalem.plan, kalem.gerceklesen], [360, 0]);
    assert.deepEqual(c.eksikKalemler, ['iscilik', 'finansman']);
  });

  test('PM-24 tahmini maliyet (plan 6c): istasyon saat maliyetiyle işleme + ayar; ücret yoksa null; bulunmayan iş emri haritada yok', async () => {
    const { isEmriId, istasyonId } = await isEmriAc();
    let m = await vt().tx((db) => isEmriTahminiMaliyetleri(db, [isEmriId, 999999], SIMDI));
    assert.deepEqual([...m], [[isEmriId, null]]);
    await ortam!.sahip.sorgu('INSERT INTO finans_istasyon_maliyet (istasyon_id, saat_maliyeti, guncelleyen_id) VALUES ($1, 600, $2)', [istasyonId, yoneticiId]);
    m = await vt().tx((db) => isEmriTahminiMaliyetleri(db, [isEmriId], SIMDI));
    // 6 dk x 10 adet + 30 dk ayar = 90 dk x 600 TL/saat.
    assert.equal(m.get(isEmriId), 900);
    assert.equal((await vt().tx((db) => isEmriTahminiMaliyetleri(db, [], SIMDI))).size, 0);
  });

  test('PM-26 malzeme (PM-25, PM-27): emir başına kayıt; bileşensiz ve sarfsız emirde 0; fiyatsız bileşen ve sarfta null ve eksik', async () => {
    const hedef = (await tamam<Proje>(gonder(yonetici, '/projeler', { kod: 'PM.3', ad: 'Malzemeli', siparisId: siparis.id }))).id;
    const { isEmriId } = await isEmriAc(hedef);
    let c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), hedef, SIMDI));
    let malzeme = c.kalemler.find((x) => x.kalem === 'malzeme')!;
    assert.deepEqual([malzeme.plan, malzeme.gerceklesen], [0, 0]);
    assert.ok(!c.eksikKalemler.includes('malzeme'));
    const bilesen = await mamulAc();
    await ortam!.sahip.sorgu('INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar, fire_yuzde) VALUES ($1, $2, 2, 0)', [isEmriId, bilesen]);
    c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), hedef, SIMDI));
    malzeme = c.kalemler.find((x) => x.kalem === 'malzeme')!;
    assert.deepEqual([malzeme.plan, malzeme.gerceklesen], [null, 0]);
    assert.ok(c.eksikler.includes('birim_maliyet_eksik'));
    // Stoktan emre net sarf: fiyatı olmayan malzeme gerçeği de bilinmez yapar.
    const emir = await vt().tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]);
    const konum = await ortam!.sahip.tek<{ id: number }>("INSERT INTO stok_konum (depo_id, kod, tur) SELECT id, 'PM-SARF', 'depo_zemini' FROM stok_depo ORDER BY id LIMIT 1 RETURNING id");
    await ortam!.sahip.sorgu(
      `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('cikis', pg_current_xact_id(), $4) RETURNING id),
         h AS (INSERT INTO stok_hareketi (tur, malzeme_id, kaynak_konum_id, miktar, cikis_nedeni, uretim_emri_id, kisi_id, onayli_eksi, eksi_onay_kaynagi)
               VALUES ('cikis', $1, $2, 3, 'uretime_sarf', $3, $4, true, 'kisi') RETURNING id)
       INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`, [bilesen, konum!.id, emir!.id, yoneticiId]);
    c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), hedef, SIMDI));
    malzeme = c.kalemler.find((x) => x.kalem === 'malzeme')!;
    assert.equal(malzeme.gerceklesen, null);
  });

  // Stok ve satın alma tablolarına fikstür (PM-52, PM-53): emre sarf ya da mal kabullü giriş; fiyatlı alış, isteğe bağlı emre bağlı sipariş.
  let alisSirasi = 0;
  const stokFiksturu = async (kod: string, emir: number) => {
    const sh = ortam!.sahip;
    const konum = (await sh.tek<{ id: number }>("INSERT INTO stok_konum (depo_id, kod, tur) SELECT id, $1, 'depo_zemini' FROM stok_depo ORDER BY id LIMIT 1 RETURNING id", [kod]))!.id;
    const hareket = async (tur: 'giris' | 'cikis', malzeme: number, miktar: number, gunOnce: number): Promise<number> => (await sh.tek<{ id: number }>(
      `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ($1, pg_current_xact_id(), $5) RETURNING id),
         h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, kaynak_konum_id, hedef_konum_id, miktar, giris_kaynagi, cikis_nedeni, uretim_emri_id, kisi_id, onayli_eksi, eksi_onay_kaynagi)
               VALUES (now() - make_interval(days => $6), $1, $2, CASE WHEN $1 = 'cikis' THEN $3::int END, CASE WHEN $1 = 'giris' THEN $3::int END, $4,
                       CASE WHEN $1 = 'giris' THEN 'mal_kabul' END, CASE WHEN $1 = 'cikis' THEN 'uretime_sarf' END, CASE WHEN $1 = 'cikis' THEN $7::int END, $5, $1 = 'cikis', CASE WHEN $1 = 'cikis' THEN 'kisi' END) RETURNING id),
         s AS (INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f)
       SELECT id::int FROM h`, [tur, malzeme, konum, miktar, yoneticiId, gunOnce, emir]))!.id;
    // Fiyatlı mal kabul (bağ verilmezse emre ve projeye bağlı olmayan): TRY teklifli sipariş satırı, mal kabul satırı ve teslim kaydı.
    const alis = async (malzeme: number, miktar: number, fiyat: number, gunOnce: number, bag: { emir?: number; siparis?: { miktar: number; birim: string } } = {}): Promise<void> => {
      alisSirasi += 1;
      const sira = alisSirasi;
      const [t, kl, tk, katalog] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      await sh.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, uretim_emri_id) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi', $4)", [t, 95200 + sira, yoneticiId, bag.emir ?? null]);
      await sh.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [katalog, malzeme]);
      await sh.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id) VALUES ($1, $2, 1, 'Deneme kalem', $3)", [t, kl, katalog]);
      await sh.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [t, tk]);
      await sh.sorgu('INSERT INTO satin_alma_teklif_satiri (talep_id, teklif_id, kalem_id, birim_fiyat) VALUES ($1, $2, $3, $4)', [t, tk, kl, fiyat]);
      await sh.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
      await sh.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
      const ss = (await sh.tek<{ id: number }>('INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [t, tk, kl, bag.siparis?.miktar ?? miktar, bag.siparis?.birim ?? 'adet']))!.id;
      const h = await hareket('giris', malzeme, miktar, gunOnce);
      const mk = (await sh.tek<{ id: number }>("INSERT INTO stok_mal_kabul (no, tur, zaman, kisi_id) VALUES ($1, 'satin_alma', now() - make_interval(days => $2), $3) RETURNING id", [`PM-MK-${sira}`, gunOnce, yoneticiId]))!.id;
      const satir = (await sh.tek<{ id: number }>(
        'INSERT INTO stok_mal_kabul_satiri (mal_kabul_id, sira, malzeme_id, sayilan_miktar, konum_id, hareket_id, siparis_satir_id) VALUES ($1, 1, $2, $3, $4, $5, $6) RETURNING id',
        [mk, malzeme, miktar, konum, h, ss]))!.id;
      await sh.sorgu('INSERT INTO satin_alma_teslim (siparis_satiri_id, mal_kabul_satiri_id, miktar, kisi_id) VALUES ($1, $2, $3, $4)', [ss, satir, miktar, yoneticiId]);
    };
    return { hareket, alis };
  };

  test('PM-51 (2613 2/2, 2720-2): gerçekleşen malzeme emre çıkan miktar x bağlı siparişin fiyatı; önce emrin, yoksa projenin siparişi; plan siparişten fiyat almaz', async () => {
    const hedef = (await tamam<Proje>(gonder(yonetici, '/projeler', { kod: 'PM.51', ad: 'Sipariş fiyatlı', siparisId: siparis.id }))).id;
    const { isEmriId } = await isEmriAc(hedef);
    const emir = (await vt().tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]))!.id;
    const bilesen = await mamulAc();
    const sh = ortam!.sahip;
    await sh.sorgu('INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar, fire_yuzde) VALUES ($1, $2, 3, 0)', [isEmriId, bilesen]);
    // Satın almanın tabloları (fikstür): teslim alınmış sipariş satırı; bağ emre ya da projeye talepten.
    const katalog = randomUUID();
    await sh.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [katalog, bilesen]);
    const siparisAc = async (sira: number, bag: { emir?: number; proje?: number }, fiyat: number): Promise<string> => {
      const [t, kl, tk] = [randomUUID(), randomUUID(), randomUUID()];
      await sh.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, uretim_emri_id, proje_id) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi', $4, $5)",
        [t, 95100 + sira, yoneticiId, bag.emir ?? null, bag.proje ?? null]);
      await sh.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id) VALUES ($1, $2, 1, 'Deneme kalem', $3)", [t, kl, katalog]);
      await sh.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [t, tk]);
      await sh.sorgu('INSERT INTO satin_alma_teklif_satiri (talep_id, teklif_id, kalem_id, birim_fiyat) VALUES ($1, $2, $3, $4)', [t, tk, kl, fiyat]);
      await sh.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
      await sh.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
      const satir = (await sh.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 10, 'adet') RETURNING id", [t, tk, kl]))!.id;
      await sh.sorgu('INSERT INTO satin_alma_teslim (siparis_satiri_id, mal_kabul_satiri_id, miktar, kisi_id) VALUES ($1, $2, 10, $3)', [satir, 951000 + sira, yoneticiId]);
      return t;
    };
    const emrinTalebi = await siparisAc(1, { emir }, 40);
    const projeninTalebi = await siparisAc(2, { proje: hedef }, 50);
    // Siparişin tamamı (10) değil, emre çıkan 3 sayılır.
    const konum = await sh.tek<{ id: number }>("INSERT INTO stok_konum (depo_id, kod, tur) SELECT id, 'PM-51', 'depo_zemini' FROM stok_depo ORDER BY id LIMIT 1 RETURNING id");
    await sh.sorgu(
      `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('cikis', pg_current_xact_id(), $4) RETURNING id),
         h AS (INSERT INTO stok_hareketi (tur, malzeme_id, kaynak_konum_id, miktar, cikis_nedeni, uretim_emri_id, kisi_id, onayli_eksi, eksi_onay_kaynagi)
               VALUES ('cikis', $1, $2, 3, 'uretime_sarf', $3, $4, true, 'kisi') RETURNING id)
       INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`, [bilesen, konum!.id, emir, yoneticiId]);
    const malzeme = async () => {
      const c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), hedef, SIMDI));
      const k = c.kalemler.find((x) => x.kalem === 'malzeme')!;
      return [k.plan, k.gerceklesen];
    };
    // Kartın liste kg fiyatı yok: plan bilinmez kalır; gerçek emrin siparişinden 3 x 40.
    assert.deepEqual(await malzeme(), [null, 120]);
    // Emrin siparişi iptal: projenin siparişi 3 x 50.
    await sh.sorgu("UPDATE satin_alma_talep SET durum = 'iptal', iptal_nedeni = 'Deneme' WHERE id = $1", [emrinTalebi]);
    assert.deepEqual(await malzeme(), [null, 150]);
    // Bağlı sipariş kalmayınca çıkış anındaki son alış (PM-52); mal kabul yok: bilinmez, listeye düşmez.
    await sh.sorgu("UPDATE satin_alma_talep SET durum = 'iptal', iptal_nedeni = 'Deneme' WHERE id = $1", [projeninTalebi]);
    assert.deepEqual(await malzeme(), [null, null]);
  });

  test('PM-52 (2613-3 a, 2727): siparişsiz sarf çıkış anındaki son alışla; 50 x 120 = 6.000; son alış yoksa bilinmez, listeye düşmez', async () => {
    const hedef = (await tamam<Proje>(gonder(yonetici, '/projeler', { kod: 'PM.52', ad: 'Son alışlı', siparisId: siparis.id }))).id;
    const { isEmriId } = await isEmriAc(hedef);
    const emir = (await vt().tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]))!.id;
    const [bilesen, fiyatsiz] = [await mamulAc(), await mamulAc()];
    const sh = ortam!.sahip;
    await sh.sorgu('INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar, fire_yuzde) VALUES ($1, $2, 50, 0)', [isEmriId, bilesen]);
    const { hareket, alis } = await stokFiksturu('PM-52', emir);
    const malzeme = async () => {
      const c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), hedef, SIMDI));
      const k = c.kalemler.find((x) => x.kalem === 'malzeme')!;
      return [k.plan, k.gerceklesen];
    };
    // Çıkıştan önce 100 alış; çıkıştan sonraki 130'luk alış o çıkışın fiyatı değildir.
    await alis(bilesen, 100, 120, 5);
    await hareket('cikis', bilesen, 50, 3);
    await alis(bilesen, 100, 130, 1);
    // Kartın liste kg fiyatı yok: plan bilinmez; gerçek 50 x 120.
    assert.deepEqual(await malzeme(), [null, 6000]);
    // Son alışı olmayan malzemenin sarfı malzemeyi bilinmez yapar (listeye düşülmez).
    await hareket('cikis', fiyatsiz, 2, 2);
    assert.deepEqual(await malzeme(), [null, null]);
  });

  test('PM-53 (2733 a, 2739): emrin siparişi teslim miktarına kadar sipariş fiyatı, fazlası son alış; 80 kg, 50 kg @100, son alış 120 -> 8.600', async () => {
    const hedef = (await tamam<Proje>(gonder(yonetici, '/projeler', { kod: 'PM.53', ad: 'Kısmi siparişli', siparisId: siparis.id }))).id;
    const { isEmriId } = await isEmriAc(hedef);
    const emir = (await vt().tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]))!.id;
    const bilesen = await mamulAc();
    await ortam!.sahip.sorgu('INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar, fire_yuzde) VALUES ($1, $2, 80, 0)', [isEmriId, bilesen]);
    const { hareket, alis } = await stokFiksturu('PM-53', emir);
    const malzeme = async () => {
      const c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), hedef, SIMDI));
      const k = c.kalemler.find((x) => x.kalem === 'malzeme')!;
      return { degerler: [k.plan, k.gerceklesen], eksik: c.eksikler.includes('birim_maliyet_eksik') };
    };
    // Emre bağlı sipariş 50 kg @100 (6 gün önce), bağsız alış 100 kg @120 (4 gün önce), emre 80 kg sarf (3 gün önce). Birim dönüşümlü
    // (Mimar N3): sipariş satırı 2 'rulo', teslim stok biriminde 50; sınır sipariş satırının miktarı (2) değil, teslim (50).
    await alis(bilesen, 50, 100, 6, { emir, siparis: { miktar: 2, birim: 'rulo' } });
    await alis(bilesen, 100, 120, 4);
    await hareket('cikis', bilesen, 80, 3);
    // 50 x 100 + 30 x 120; plan liste fiyatsız, bilinmez.
    assert.deepEqual((await malzeme()).degerler, [null, 8600]);
    // Fazlası son alışsız malzemede çift bilinmez ve eksik kodu yazılır (2727'de yazılmıyordu): 2 sarf (2 gün önce), emre bağlı siparişten
    // 1 teslim sonradan (1 gün önce); çıkış anında son alış yok.
    const fiyatsiz = await mamulAc();
    await hareket('cikis', fiyatsiz, 2, 2);
    await alis(fiyatsiz, 1, 100, 1, { emir });
    assert.deepEqual(await malzeme(), { degerler: [null, null], eksik: true });
  });

  test('PM-30 bekleme finansmanı (PM-29): TL faizi yoksa bildirilir; vadesiz siparişte vade eksik; plan tarihi yoksa plan bilinmez, başlamamış işte gerçek 0', async () => {
    // Vade uyarısı yalnız hesaplanan iş varken (PM-44): aynı vadesiz siparişten açılan iş emirli proje.
    const vadesizProje = await tamam<Proje>(gonder(yonetici, `/projeler/siparisten/${siparis.id}/ac`, { kod: 'PM.30', ad: 'Vadesiz' }));
    await isEmriAc(vadesizProje.id);
    const vadesiz = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), vadesizProje.id, SIMDI));
    assert.ok(vadesiz.eksikler.includes('vade_yok'));
    await isEmriAc(siparissiz.id);
    await ortam!.sahip.sorgu("INSERT INTO finans_faiz (para_birimi, gecerlilik_baslangic, aylik_yuzde, olusturan_id) VALUES ('TRY', '2026-01-01', 3, $1)", [yoneticiId]);
    const c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparissiz.id, SIMDI));
    assert.ok(!c.eksikler.includes('faiz_yok'));
    assert.ok(!c.eksikler.includes('vade_yok'));
    const kalem = c.kalemler.find((x) => x.kalem === 'finansman')!;
    assert.deepEqual([kalem.plan, kalem.gerceklesen], [null, 0]);
    // PM-47: canlı planda olmayan iş için plan tarihi eksik olarak bildirilir.
    assert.ok(c.eksikler.includes('plan_tarihi_yok'));
  });

  test('PM-32 amortisman (E-9): genel gider oranı amortismanı içermiyorsa ekranda bildirilir', async () => {
    await isEmriAc(siparissiz.id);
    await ortam!.sahip.sorgu(
      "INSERT INTO finans_genel_gider_orani (gecerlilik_baslangic, aylik_genel_gider, aylik_makine_saati, amortisman_dahil, olusturan_id) VALUES ('2026-02-01', 120000, 1000, false, $1)",
      [yoneticiId]);
    const c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparissiz.id, SIMDI));
    assert.ok(c.eksikler.includes('amortisman_dahil_degil'));
  });

  test('PM-33 emir malzeme maliyeti (227 a, disari): bileşensiz emirde 0; fiyatsız bileşende null; bulunmayan emir haritada yok', async () => {
    const { isEmriId } = await isEmriAc();
    const emir = (await vt().tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]))!.id;
    let m = await vt().tx((db) => uretimEmriMalzemeMaliyetleri(db, [emir, 999999]));
    assert.deepEqual([...m], [[emir, 0]]);
    await ortam!.sahip.sorgu('INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar, fire_yuzde) VALUES ($1, $2, 2, 0)', [isEmriId, await mamulAc()]);
    m = await vt().tx((db) => uretimEmriMalzemeMaliyetleri(db, [emir]));
    assert.deepEqual([...m], [[emir, null]]);
    assert.equal((await vt().tx((db) => uretimEmriMalzemeMaliyetleri(db, []))).size, 0);
  });

  test('2891-1: metre stoklu hammaddede kg fiyatından birim fiyat yok, emrin malzeme maliyeti bilinmez (null); adet stoklu kartta kg fiyatı x parça ağırlığı', async () => {
    // Kart fikstürü (mamulAc gibi doğrudan): hammadde, kalite + form, stok birimi ve parça ağırlığı.
    const kart = async (birim: string): Promise<number> => {
      const kimlik = `pm-dnm-${(sayac += 1)}`;
      await ortam!.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('PM-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
      return (await ortam!.sahip.tek<{ no: number }>(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, birim_agirlik_kg, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, 'hammadde', 'PM-DNM-', $2, 'aktif', $3, 2, $4, $4) RETURNING no`,
        [kimlik, sayac, JSON.stringify({ id: kimlik, tur: 'hammadde', grade: 'DENEME-PMO', form: 'cubuk', com: { ad: 'Deneme hammadde', birim } }), yoneticiId],
      ))!.no;
    };
    await ortam!.sahip.sorgu("INSERT INTO satin_alma_kg_fiyati (kalite_kodu, form, kg_fiyati, para_birimi, gecerlilik, kisi_id) VALUES ('DENEME-PMO', 'cubuk', 50, 'TRY', current_date, $1)", [yoneticiId]);
    const emirMaliyeti = async (malzemeNo: number): Promise<number | null | undefined> => {
      const { isEmriId } = await isEmriAc(null, { adet: 1 });
      const emir = (await vt().tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]))!.id;
      await ortam!.sahip.sorgu('INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar, fire_yuzde) VALUES ($1, $2, 2, 0)', [isEmriId, malzemeNo]);
      return (await vt().tx((db) => uretimEmriMalzemeMaliyetleri(db, [emir]))).get(emir);
    };
    // Tek adetlik emir, 2 birim bileşen: 2 x (50 TL/kg x 2 kg) = 200; ürünün net ağırlığı yok, talaş düşülmez.
    assert.equal(await emirMaliyeti(await kart('adet')), 200);
    assert.equal(await emirMaliyeti(await kart('m')), null);
  });

  test('2891-1 (Test N1): gerçekleşen malzemede metre stoklu hammaddenin talaşı bilinmez ve bildirilir; adet stoklu kartta talaş hesaplanır', async () => {
    const sh = ortam!.sahip;
    await sh.sorgu("INSERT INTO satin_alma_kg_fiyati (kalite_kodu, form, kg_fiyati, talas_kg_fiyati, para_birimi, gecerlilik, kisi_id) VALUES ('DENEME-PMT', 'cubuk', 50, 10, 'TRY', current_date, $1)", [yoneticiId]);
    let sira = 0;
    const gercek = async (birim: string): Promise<[number | null | undefined, boolean]> => {
      sira += 1;
      const hedef = (await tamam<Proje>(gonder(yonetici, '/projeler', { kod: `PM.T${sira}`, ad: 'Talaşlı', siparisId: siparis.id }))).id;
      const { isEmriId } = await isEmriAc(hedef, { adet: 1 });
      const emir = (await vt().tek<{ id: number; urun: number }>('SELECT e.id, e.malzeme_no AS urun FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id WHERE i.id = $1', [isEmriId]))!;
      await sh.sorgu('UPDATE malzeme_katalog_karti SET net_agirlik_kg = 1 WHERE no = $1', [emir.urun]);
      const kimlik = `pm-dnm-${(sayac += 1)}`;
      await sh.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('PM-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
      const bilesen = (await sh.tek<{ no: number }>(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, birim_agirlik_kg, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, 'hammadde', 'PM-DNM-', $2, 'aktif', $3, 2, $4, $4) RETURNING no`,
        [kimlik, sayac, JSON.stringify({ id: kimlik, tur: 'hammadde', grade: 'DENEME-PMT', form: 'cubuk', com: { ad: 'Deneme hammadde', birim } }), yoneticiId]))!.no;
      await sh.sorgu('INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar, fire_yuzde) VALUES ($1, $2, 3, 0)', [isEmriId, bilesen]);
      // Emre bağlı teslim alınmış sipariş (birim fiyat 40) ve emre 3 birim sarf (PM-51 fikstürü gibi).
      const [t, kl, tk, katalog] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      await sh.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [katalog, bilesen]);
      await sh.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, uretim_emri_id) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi', $4)", [t, 95300 + sira, yoneticiId, emir.id]);
      await sh.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id) VALUES ($1, $2, 1, 'Deneme kalem', $3)", [t, kl, katalog]);
      await sh.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [t, tk]);
      await sh.sorgu('INSERT INTO satin_alma_teklif_satiri (talep_id, teklif_id, kalem_id, birim_fiyat) VALUES ($1, $2, $3, 40)', [t, tk, kl]);
      await sh.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
      await sh.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
      const satir = (await sh.tek<{ id: number }>('INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 10, $4) RETURNING id', [t, tk, kl, birim]))!.id;
      await sh.sorgu('INSERT INTO satin_alma_teslim (siparis_satiri_id, mal_kabul_satiri_id, miktar, kisi_id) VALUES ($1, $2, 10, $3)', [satir, 953000 + sira, yoneticiId]);
      const konum = (await sh.tek<{ id: number }>("INSERT INTO stok_konum (depo_id, kod, tur) SELECT id, $1, 'depo_zemini' FROM stok_depo ORDER BY id LIMIT 1 RETURNING id", [`PM-T${sira}`]))!.id;
      await sh.sorgu(
        `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('cikis', pg_current_xact_id(), $4) RETURNING id),
           h AS (INSERT INTO stok_hareketi (tur, malzeme_id, kaynak_konum_id, miktar, cikis_nedeni, uretim_emri_id, kisi_id, onayli_eksi, eksi_onay_kaynagi)
                 VALUES ('cikis', $1, $2, 3, 'uretime_sarf', $3, $4, true, 'kisi') RETURNING id)
         INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`, [bilesen, konum, emir.id, yoneticiId]);
      const c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), hedef, SIMDI));
      return [c.kalemler.find((x) => x.kalem === 'malzeme')!.gerceklesen, c.eksikler.includes('talas_dusulmedi')];
    };
    // Adet: 3 x 40 = 120 alış; kütük kg'i parça ağırlığından bilinir, talaş hesaplanır (bitmemiş emirde işlenen pay 0, düşülen 0), eksik yok.
    assert.deepEqual(await gercek('adet'), [120, false]);
    // Metre: parça ağırlığı metre başına değildir; kütük kg'i bilinmez, talaş düşülmedi diye bildirilir (önce 2 kg/m sayılıyordu).
    assert.deepEqual(await gercek('m'), [120, true]);
  });

  test('PM-34 kâr riski oranı (227 a): plan bedel ayarından okunur; müdür değiştirince proje maliyeti de değişir', async () => {
    await ortam!.sahip.sorgu('UPDATE plan_ayari SET kar_riski_orani_gun = 0.5');
    const c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparisli.id, SIMDI));
    await ortam!.sahip.sorgu('UPDATE plan_ayari SET kar_riski_orani_gun = 0.3');
    assert.equal(c.karRiski.gunlukOran, 0.5);
  });

  test('PM-35 defter işi (236 a): biten iş emrini sunucu yazar, donduran boş; ikinci tur yazmaz; açık iş emri yazılmaz; ekranı açmak yazmaz', async () => {
    assert.ok(isler.some((i) => i.ad === 'proje-maliyet-defteri'));
    const { isEmriId: biten } = await isEmriAc(siparissiz.id);
    const { isEmriId: acik } = await isEmriAc(siparissiz.id);
    await tamam(oku(yonetici, `/proje-maliyet/${siparissiz.id}`));
    await ortam!.sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now() - interval '1 hour', bitis = now(), saglam_adet = 10 WHERE id = $1", [biten]);
    await tamam(oku(yonetici, `/proje-maliyet/${siparissiz.id}`));
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM proje_maliyet_defteri WHERE is_emri_id = $1', [biten]))!.n, 0);
    assert.ok((await vt().tx((db) => bitenleriDondur(db, SIMDI))) >= 1);
    const satir = await vt().tek<{ donduran: number | null }>('SELECT donduran_id AS donduran FROM proje_maliyet_defteri WHERE is_emri_id = $1', [biten]);
    assert.deepEqual(satir, { donduran: null });
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM proje_maliyet_defteri WHERE is_emri_id = $1', [acik]))!.n, 0);
    assert.equal(await vt().tx((db) => bitenleriDondur(db, SIMDI)), 0);
  });

  test('PM-37 proje geliri (#9, #38, 226 a): aynı siparişin iki projesi kendi emirlerinin payını alır; satırsız emir bildirilir; eksik maliyette katkı yok; iptal sipariş gelir değil', async () => {
    const firmaId = (await tamam<{ firma: { id: number } }>(gonder(yonetici, '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Müşteri 2', tur: 'musteri' }))).firma.id;
    const taslak = await tamam<SiparisAyrintisi>(gonder(yonetici, '/siparisler/ekle', {
      firmaId, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2026-11-15', kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: await mamulAc(), miktar: '10', birimFiyat: '250', termin: null, aciklama: null }],
    }));
    const ikinci = await tamam<SiparisAyrintisi>(gonder(yonetici, `/siparisler/${taslak.id}/onayla`, { surum: taslak.surum }));
    const satirId = ikinci.satirlar[0]!.id;
    const a = await tamam<Proje>(gonder(yonetici, `/projeler/siparisten/${ikinci.id}/ac`, { kod: 'PM.5', ad: 'Pay A' }));
    const b = await tamam<Proje>(gonder(yonetici, `/projeler/siparisten/${ikinci.id}/ac`, { kod: 'PM.6', ad: 'Pay B' }));
    await isEmriAc(a.id, { adet: 4, siparisSatiriId: satirId });
    await isEmriAc(a.id);
    await isEmriAc(b.id, { adet: 6, siparisSatiriId: satirId });
    const ok = (projeId: number) => vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), projeId, SIMDI));
    const ca = await ok(a.id);
    const cb = await ok(b.id);
    assert.deepEqual([ca.gelir, cb.gelir], [1000, 1500]);
    assert.ok(ca.eksikler.includes('satirsiz_emir'));
    assert.ok(!cb.eksikler.includes('satirsiz_emir'));
    // #10: birim maliyeti girilmemiş iş emrinin maliyeti eksik; katkı payı gelirin tamamı gösterilmez.
    assert.ok(ca.eksikKalemler.length > 0);
    assert.deepEqual([ca.katkiPayi, ca.katkiOrani, ca.karRiski.tutar], [null, null, null]);
    await ortam!.sahip.sorgu("UPDATE siparisler_siparis SET durum = 'iptal', iptal_nedeni = 'Deneme' WHERE id = $1", [ikinci.id]);
    assert.equal((await ok(b.id)).gelir, 0);
  });

  test('PM-38 (1398 a): döviz siparişinde faturalanan kısım fatura kuruyla, kalanı bugünün kuruyla; kur farkı ayrı; TL faturası belge günü kuruyla çevrilir; fiyat yetkisi yoksa null', async () => {
    const firmaId = (await tamam<{ firma: { id: number } }>(gonder(yonetici, '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Müşteri 3', tur: 'musteri' }))).firma.id;
    const taslak = await tamam<SiparisAyrintisi>(gonder(yonetici, '/siparisler/ekle', {
      firmaId, musteriSiparisNo: null, siparisTarihi: '2026-10-01', termin: '2026-11-15', kdvOrani: '20', odemeKosulu: null, aciklama: null, paraBirimi: 'EUR',
      satirlar: [{ malzemeNo: await mamulAc(), miktar: '10', birimFiyat: '100', termin: null, aciklama: null }],
    }));
    const onayli = await tamam<SiparisAyrintisi>(gonder(yonetici, `/siparisler/${taslak.id}/onayla`, { surum: taslak.surum }));
    const p = await tamam<Proje>(gonder(yonetici, `/projeler/siparisten/${onayli.id}/ac`, { kod: 'PM.7', ad: 'Döviz' }));
    await isEmriAc(p.id, { adet: 10, siparisSatiriId: onayli.satirlar[0]!.id });
    for (const [tarih, kur] of [['2026-10-05', '30'], ['2026-10-10', '32'], ['2026-10-19', '35']] as const) {
      await ortam!.sahip.sorgu('INSERT INTO finans_kur (para_birimi, tarih, kur, olusturan_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', ['EUR', tarih, kur, yoneticiId]);
    }
    const ok = (islemler: string[]) => vt().tx((db) => projeMaliyeti(db, kullanici(islemler), p.id, SIMDI));
    const yetkili = ['finans.maliyet-oku', FIYAT_ISLEMI];
    // Fatura yokken bütün tutar bugünün kuruyla: 1000 EUR x 35.
    assert.deepEqual([(await ok(yetkili)).gelir, (await ok(yetkili)).kurFarki], [35000, 0]);
    const belge = (tarih: string, paraBirimi: string, kur: string, tutar: string) => ortam!.sahip.sorgu(
      `INSERT INTO finans_belge (yon, tur, kategori, firma_id, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, siparis_id, olusturan_id)
       VALUES ('gelir', 'fatura', 'urun_satisi', $1, $2, $2, $3, $4, $5, 20, $6, $7)`, [firmaId, tarih, paraBirimi, kur, tutar, onayli.id, yoneticiId]);
    // 300 EUR 30 kuruyla; 100 EUR karşılığı TL fatura (3.200 TL, belge günü kuru 32).
    await belge('2026-10-05', 'EUR', '30', '300');
    await belge('2026-10-10', 'TRY', '1', '3200');
    const c = await ok(yetkili);
    // 400 EUR faturalı: 9.000 + 3.200 = 12.200 TL; kalan 600 EUR x 35 = 21.000. Kur farkı 400 x 35 - 12.200 = 1.800.
    assert.equal(c.gelir, 33200);
    assert.equal(c.kurFarki, 1800);
    assert.ok(!c.eksikler.includes('kur_yok'));
    const siz = await ok(['finans.maliyet-oku']);
    assert.deepEqual([siz.gelir, siz.kurFarki], [null, null]);
  });

  test('PM-50 (2661 a, 2663): gizli oranlı ayda pay ve toplamlar null, gizli işaretli; taban ve defter gizliliği alındığı anınkidir', async () => {
    // Öteki testlerin günü (SIMDI) etkilenmesin diye ileri bir ay; oran satırları yalnız ekleme.
    const GIZLI_AN = Date.parse('2027-03-15T09:00:00Z');
    const SONRA = Date.parse('2027-04-15T09:00:00Z');
    const proje = await tamam<Proje>(gonder(yonetici, `/projeler/siparisten/${siparis.id}/ac`, { kod: 'PM.50', ad: 'Gizli oran' }));
    const { isEmriId: biten, istasyonId } = await isEmriAc(proje.id);
    await ortam!.sahip.sorgu('INSERT INTO finans_istasyon_maliyet (istasyon_id, saat_maliyeti, guncelleyen_id) VALUES ($1, 600, $2)', [istasyonId, yoneticiId]);
    await ortam!.sahip.sorgu(
      `INSERT INTO finans_genel_gider_orani (gecerlilik_baslangic, aylik_genel_gider, aylik_makine_saati, amortisman_dahil, olusturan_id, kaynak, donem_baslangic,
         donem_bitis, kira, amortisman, diger, projesiz_satin_alma, elle_ek, personel_gizli)
       VALUES ('2027-03-01', 150000, 1000, true, $1, 'belge', '2027-02-01', '2027-02-28', 50000, 10000, 20000, 0, 0, true)`, [yoneticiId]);
    const ok = (an: number) => vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), proje.id, an));
    const c = await ok(GIZLI_AN);
    assert.equal(c.genelGiderGizli, true);
    assert.deepEqual([c.plan, c.gerceklesen, c.bugunePlan, c.kalanPlan, c.sapma, c.katkiPayi, c.karRiski.tutar], [null, null, null, null, null, null, null]);
    assert.deepEqual(c.haftalar, []);
    assert.deepEqual(c.sapanIsEmirleri, []);
    const gg = c.kalemler.find((k) => k.kalem === 'genel_gider')!;
    assert.deepEqual([gg.plan, gg.gerceklesen, gg.sapmaOrani], [null, null, null]);
    // Oranla değişmeyen kalem kalır; gizli kalem eksik sayılmaz (Arayüz K3).
    assert.equal(c.kalemler.find((k) => k.kalem === 'isleme')!.plan, 600);
    assert.ok(!c.eksikKalemler.includes('genel_gider'));
    assert.ok(!JSON.stringify(c).includes('"saatBasi"'));
    assert.deepEqual([c.ozet.sonGerceklesen, c.ozet.tahminiSon, c.ozet.fark], [null, null, null]);

    // Taban gizli ayda alınır: hesap gerçek oranla saklanır, okumada plan ve genel gider kalemi gizlidir.
    await vt().tx((db) => tabanAl(db, kullanici(['finans.maliyet-oku', 'projeler.yaz']), proje.id, null, GIZLI_AN));
    const satir = await vt().tek<{ gizli: boolean; plan: string | null }>('SELECT genel_gider_gizli AS gizli, plan::text FROM proje_maliyet_taban WHERE proje_id = $1', [proje.id]);
    assert.equal(satir!.gizli, true);
    assert.notEqual(satir!.plan, null);
    // Bitmiş iş emri gizli ayda dondurulur.
    await ortam!.sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now() - interval '1 hour', bitis = now(), saglam_adet = 10 WHERE id = $1", [biten]);
    assert.ok((await vt().tx((db) => bitenleriDondur(db, GIZLI_AN))) >= 1);

    // Sonraki ay gizli değil: taban ve dondurulmuş iş emri yine gizli; yeni açık iş yok, cevap gizli kalır.
    await ortam!.sahip.sorgu(
      "INSERT INTO finans_genel_gider_orani (gecerlilik_baslangic, aylik_genel_gider, aylik_makine_saati, amortisman_dahil, olusturan_id) VALUES ('2027-04-01', 120000, 1000, true, $1)",
      [yoneticiId]);
    const s = await ok(SONRA);
    assert.equal(s.genelGiderGizli, true);
    assert.equal(s.ozet.taban?.genelGiderGizli, true);
    assert.equal(s.ozet.taban?.plan, null);
    assert.equal(s.ozet.taban?.kalemler.find((k) => k.kalem === 'genel_gider')?.plan, null);
    assert.equal(s.ozet.taban?.kalemler.find((k) => k.kalem === 'isleme')?.plan, 600);
    const uc = await tamam<ProjeMaliyetCevabi>(oku(yonetici, `/proje-maliyet/${proje.id}`));
    assert.equal(typeof uc.genelGiderGizli, 'boolean');
  });
});
