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
import { bitenleriDondur, FIYAT_ISLEMI, projeMaliyeti } from './servis.ts';
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
    assert.deepEqual(defter.get(isEmriId), { isEmriId, plan: { isleme: 100, ayar: 20 }, gercek: { isleme: 120, ayar: null } });
    const ucretler = await vt().tek<{ ucretler: unknown }>('SELECT ucretler FROM proje_maliyet_defteri WHERE is_emri_id = $1', [isEmriId]);
    assert.deepEqual(ucretler?.ucretler, kayit.ucretler);
    await assert.rejects(vt().sorgu("UPDATE proje_maliyet_defteri SET gercek = '{}' WHERE is_emri_id = $1", [isEmriId]), /yalnız ekleme/);
    await assert.rejects(vt().sorgu('DELETE FROM proje_maliyet_defteri WHERE is_emri_id = $1', [isEmriId]), /yalnız ekleme/);
  });

  test('PM-20 bağlama (PM-B1): projenin iş emri istasyon saat maliyetiyle planlanır; başlamamış işin gerçeği sıfır; işçilik planı yok, toplama girmez', async () => {
    const proje = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparissiz.id, SIMDI));
    assert.deepEqual(proje.plan, null);
    const { istasyonId } = await isEmriAc(siparissiz.id);
    let c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparissiz.id, SIMDI));
    assert.ok(c.eksikler.includes('birim_maliyet_eksik'));
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

  test('PM-30 bekleme finansmanı (PM-29): TL faizi yoksa bildirilir; vadesiz siparişte vade eksik; plan tarihi yoksa plan bilinmez, başlamamış işte gerçek 0', async () => {
    const vadesiz = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparisli.id, SIMDI));
    assert.ok(vadesiz.eksikler.includes('vade_yok'));
    await isEmriAc(siparissiz.id);
    await ortam!.sahip.sorgu("INSERT INTO finans_faiz (para_birimi, gecerlilik_baslangic, aylik_yuzde, olusturan_id) VALUES ('TRY', '2026-01-01', 3, $1)", [yoneticiId]);
    const c = await vt().tx((db) => projeMaliyeti(db, kullanici(['finans.maliyet-oku', FIYAT_ISLEMI]), siparissiz.id, SIMDI));
    assert.ok(!c.eksikler.includes('faiz_yok'));
    assert.ok(!c.eksikler.includes('vade_yok'));
    const kalem = c.kalemler.find((x) => x.kalem === 'finansman')!;
    assert.deepEqual([kalem.plan, kalem.gerceklesen], [null, 0]);
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
});
