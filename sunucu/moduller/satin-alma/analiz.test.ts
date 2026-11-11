import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { satinAlmaAnaliziCevabi, satinAlmaSiparisDokumu } from '#paylasilan/sozlesme/satin-alma-analiz.ts';
import { tesisGunBasi } from '#paylasilan/zaman.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tuketimSerisi } from '../stok/disari.ts';
import { satinAlmaAnalizi, siparisDokumu, tuketimSerisiCozucusuKaydet } from './analiz.ts';

const PAROLA = 'dogru-parola-1';

// 2151: Satın alma analizi uçtan uca. Veriler uydurmadır.
describe('satın alma analizi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kisi = 0;
  let firma = 0;
  let malzeme = 0;
  let katalog = '';
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const giris = async (k: string): Promise<string> => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };

  let talepSira = 0;
  // Tek kalemli sipariş: talep, kalem, teklif ve satır fiyatı, karar, sipariş ve sipariş satırı. Teslim verilirse tek parça girer.
  async function siparis(g: {
    firmaId: number | null; paraBirimi: string; kur: string | null; fiyat: string; miktar: string; tarih: string; katalogId: string | null;
    durum?: string; teslim?: { miktar: string; zaman: string }; termin?: number;
  }): Promise<void> {
    const s = o().sahip;
    const talep = randomUUID(), kalem = randomUUID(), teklif = randomUUID();
    talepSira += 1;
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, iptal_nedeni) VALUES ($1, 2026, $2, 'Deneme talep', $3, $3, $4, $5)",
      [talep, talepSira, kisi, g.durum ?? 'siparis_verildi', g.durum === 'iptal' ? 'Deneme iptal' : '']);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, miktar, katalog_id) VALUES ($1, $2, 1, 'Deneme çubuk', $3, $4)", [talep, kalem, g.miktar, g.katalogId]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, firma_id, tedarikci_adi, teklif_tarihi, para_birimi, kur, termin_gun) VALUES ($1, $2, $3, 'Deneme tedarik', $4, $5, $6, $7)",
      [talep, teklif, g.firmaId, g.tarih, g.paraBirimi, g.kur, g.termin ?? null]);
    await s.sorgu('INSERT INTO satin_alma_teklif_satiri (talep_id, teklif_id, kalem_id, birim_fiyat) VALUES ($1, $2, $3, $4)', [talep, teklif, kalem, g.fiyat]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, $3)", [talep, teklif, g.tarih]);
    await s.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, siparis_no, siparis_tarihi) VALUES ($1, $2, $3, $3, $4)", [talep, teklif, `SA-${String(talepSira)}`, g.tarih]);
    const satir = (await s.tek<{ id: number }>(
      "INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, $4, 'adet') RETURNING id", [talep, teklif, kalem, g.miktar]))!.id;
    if (g.teslim) {
      await s.sorgu('INSERT INTO satin_alma_teslim (siparis_satiri_id, mal_kabul_satiri_id, miktar, zaman, kisi_id) VALUES ($1, $2, $3, $4, $5)',
        [satir, 900_000 + talepSira, g.teslim.miktar, g.teslim.zaman, kisi]);
    }
  }
  async function stokHareketi(zaman: string, tur: 'giris' | 'cikis', miktar: string, konum: number): Promise<void> {
    const giris = tur === 'giris';
    await o().sahip.sorgu(
      `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ($2, pg_current_xact_id(), $9) RETURNING id),
         h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, kaynak_konum_id, hedef_konum_id, miktar, giris_kaynagi, cikis_nedeni, kisi_id, onayli_eksi, eksi_onay_kaynagi)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id)
       INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`,
      [zaman, tur, malzeme, giris ? null : konum, giris ? konum : null, miktar, giris ? 'mal_kabul' : null, giris ? null : 'numune', kisi, !giris, giris ? null : 'kisi']);
  }

  before(async () => {
    ortam = await testVeritabaniKur('satin_alma_analiz');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const rol = (await ortam.vt.tx((db) => db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'")))!;
    await ortam.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme operatör', kullaniciAdi: 'operator', parola: PAROLA });
      const k = await rolAta(db, kisi, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, kisi, id, r.id);
    });
    const s = o().sahip;
    firma = (await s.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme tedarik', 'tedarikci', $1) RETURNING id", [kisi]))!.id;
    await s.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1)', [firma]);
    await s.sorgu("INSERT INTO satin_alma_kur (para_birimi, sira) VALUES ('EUR', 90) ON CONFLICT (para_birimi) DO NOTHING");
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SN-', 0)");
    malzeme = (await s.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('sn-1', 'hammadde', 'SN-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'sn-1', com: { ad: 'Deneme çubuk' } }), kisi]))!.no;
    katalog = randomUUID();
    await s.sorgu("INSERT INTO satin_alma_katalog (id, kategori, ozellik, notlar, malzeme_no) VALUES ($1, 'Hammadde', '', '', $2)", [katalog, malzeme]);

    // Mart: 10 adet x 10 EUR x 30, on dört günde tam teslim. Haziran: 5 adet x 10 EUR x 36, teslim yok. İptal edilen talep sayılmaz.
    await siparis({ firmaId: firma, paraBirimi: 'EUR', kur: '30', fiyat: '10', miktar: '10', tarih: '2026-03-02', katalogId: katalog, termin: 10, teslim: { miktar: '10', zaman: '2026-03-16T09:00:00Z' } });
    await siparis({ firmaId: firma, paraBirimi: 'EUR', kur: '36', fiyat: '10', miktar: '5', tarih: '2026-06-01', katalogId: katalog });
    await siparis({ firmaId: firma, paraBirimi: 'TRY', kur: null, fiyat: '1000', miktar: '9', tarih: '2026-06-02', katalogId: katalog, durum: 'iptal' });
    // 24 aylık pencereden önce: hiçbir hesaba girmez.
    await siparis({ firmaId: firma, paraBirimi: 'TRY', kur: null, fiyat: '1', miktar: '1', tarih: '2024-05-01', katalogId: katalog });
    // Firmaya bağlı olmayan serbest teklif.
    await siparis({ firmaId: null, paraBirimi: 'TRY', kur: null, fiyat: '50', miktar: '2', tarih: '2026-07-01', katalogId: null });

    const depo = (await s.tek<{ id: number }>("INSERT INTO stok_depo (kod, ad) VALUES ('SN', 'Deneme depo') RETURNING id"))!.id;
    const konum = (await s.tek<{ id: number }>("INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'SN-01', 'depo_zemini', 'Deneme zemin') RETURNING id", [depo]))!.id;
    await stokHareketi('2026-02-10T08:00:00Z', 'giris', '100', konum);
    await stokHareketi('2026-04-10T08:00:00Z', 'cikis', '10', konum);
  });
  after(async () => { tuketimSerisiCozucusuKaydet(null); await ortam?.kaldir(); });

  const simdi = tesisGunBasi('2026-11-04') + 9 * 3_600_000;

  test('stok bağı yoksa tüketim bölümü boş ve bağsız olduğunu söyler', async () => {
    tuketimSerisiCozucusuKaydet(null);
    const r = satinAlmaAnaliziCevabi.parse(await o().vt.tx((db) => satinAlmaAnalizi(db, simdi)));
    assert.deepEqual([r.tuketim.stokBagi, r.tuketim.malzemeler], [false, []]);
    assert.equal(r.tedarikciler.length, 1);
  });

  test('tedarikçi, harcama, fiyat ve tüketim: iptal ve pencere dışı sayılmaz, eşik altında istatistik null', async () => {
    tuketimSerisiCozucusuKaydet(tuketimSerisi);
    const r = satinAlmaAnaliziCevabi.parse(await o().vt.tx((db) => satinAlmaAnalizi(db, simdi)));
    assert.equal(r.tuketim.stokBagi, true);
    assert.equal(r.firmasizSatir, 1);
    assert.equal(r.tedarikciler.length, 1);
    const t = r.tedarikciler[0]!;
    assert.deepEqual([t.firmaId, t.ad, t.siparisSatiri], [firma, 'Deneme tedarik', 2]);
    assert.deepEqual(t.tedarikSuresi, { ornek: 1, ortancaGun: null, yuzde80Gun: null, teklifOrtancaGun: null });
    // Karne olayı yazılmadı: teslim sayısı sıfır, Bayes kestirimi ve gecikme yok.
    assert.equal(t.karne?.teslimToplam, 0);
    assert.equal(t.zamanindaBayes, null);
    assert.equal(t.gecikme, null);

    assert.deepEqual([r.harcama.basTarih, r.harcama.bitTarih], ['2025-11-05', '2026-11-04']);
    assert.equal(r.harcama.toplamTl, 4900);
    assert.deepEqual(r.harcama.kalemler.map((k) => [k.anahtar, k.tutarTl, k.sinif]), [[katalog, 4800, 'A'], ['ad:deneme çubuk', 100, 'C']]);

    assert.equal(r.fiyatDegisimleri.length, 1);
    assert.deepEqual(
      [r.fiyatDegisimleri[0]!.degisimTl, r.fiyatDegisimleri[0]!.fiyatEtkisiTl, r.fiyatDegisimleri[0]!.kurEtkisiTl, r.fiyatDegisimleri[0]!.degisimYuzde],
      [60, 0, 60, 20]);

    assert.equal(r.tuketim.aylar.length, 24);
    assert.deepEqual([r.tuketim.aylar[0], r.tuketim.aylar.at(-1)], ['2024-11', '2026-10']);
    const m = r.tuketim.malzemeler.find((x) => x.malzemeNo === malzeme)!;
    assert.equal(m.gecmisAy, 9);
    assert.equal(m.seri[r.tuketim.aylar.indexOf('2026-04')], 10);
    assert.equal(m.seri[r.tuketim.aylar.indexOf('2026-01')], null);
    assert.deepEqual([m.tahminAylik, m.xyz, m.guvenlikStogu], [null, null, null]);
  });

  test('2471: aşama süreleri, tasarruf, hedef sapması ve kural dışı alım (iptal sayılmaz, eşik altında istatistik null)', async () => {
    const s = o().sahip;
    await s.sorgu("UPDATE satin_alma_talep SET olusturma = '2026-01-01T09:00:00Z'");
    // İki teklifli talep: istek 09-02, teklifler 09-04/09-05, karar 09-06, onay 09-08, sipariş 09-09, teslim 09-20 (tam).
    const talep = randomUUID(), kalem = randomUUID(), a = randomUUID(), b = randomUUID();
    talepSira += 1;
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, olusturma) VALUES ($1, 2026, $2, 'Deneme talep', $3, $3, 'teslim_alindi', '2026-09-01T07:00:00Z')", [talep, talepSira, kisi]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, miktar, kategori) VALUES ($1, $2, 1, 'Deneme hizmet', 2, 'Hizmet')", [talep, kalem]);
    await s.sorgu("INSERT INTO satin_alma_teklif_istegi (talep_id, firma_id, gonderim) VALUES ($1, $2, '2026-09-02')", [talep, firma]);
    for (const [id, tarih, fiyat] of [[a, '2026-09-04', '100'], [b, '2026-09-05', '120']] as const) {
      await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, firma_id, tedarikci_adi, teklif_tarihi, para_birimi) VALUES ($1, $2, $3, 'Deneme tedarik', $4, 'TRY')", [talep, id, firma, tarih]);
      await s.sorgu('INSERT INTO satin_alma_teklif_satiri (talep_id, teklif_id, kalem_id, birim_fiyat) VALUES ($1, $2, $3, $4)', [talep, id, kalem, fiyat]);
    }
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi, karar_veren_kisi_id) VALUES ($1, 'tek', $2, '2026-09-06', $3)", [talep, a, kisi]);
    await s.sorgu("INSERT INTO satin_alma_onay (id, talep_id, zaman, kisi_id, sonuc) VALUES ($1, $2, '2026-09-08T08:00:00Z', $3, 'onay')", [randomUUID(), talep, kisi]);
    await s.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, siparis_no, siparis_tarihi) VALUES ($1, $2, 'SA-2471', 'SA-2471', '2026-09-09')", [talep, a]);
    const satir = (await s.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 2, 'adet') RETURNING id", [talep, a, kalem]))!.id;
    await s.sorgu("INSERT INTO satin_alma_teslim (siparis_satiri_id, mal_kabul_satiri_id, miktar, zaman, kisi_id) VALUES ($1, 912345, 2, '2026-09-20T10:00:00Z', $2)", [satir, kisi]);

    const r = satinAlmaAnaliziCevabi.parse(await o().vt.tx((db) => satinAlmaAnalizi(db, simdi)));
    assert.deepEqual(r.donem, { bas: '2025-11-05', bit: '2026-11-04', oncekiBas: '2024-11-05', oncekiBit: '2025-11-04' });
    const g = Object.fromEntries(r.asamaSureleri.tumu.asamalar.map((x) => [x.asama, [x.ornek, x.ortancaGun]]));
    assert.deepEqual(g['teklif-istegi'], [1, null]);
    assert.deepEqual(g.onay, [1, null]);
    assert.equal(r.asamaSureleri.tumu.toplam.ornek, 2);
    assert.equal(r.asamaSureleri.tumu.darbogaz, null);
    assert.ok(r.asamaSureleri.kirilimlar.some((k) => k.tur === 'kategori' && k.ad === 'Hizmet' && k.ozet.toplam.ornek === 1));
    assert.ok(r.asamaSureleri.kirilimlar.some((k) => k.tur === 'alici' && k.ad === 'Deneme Yönetici'));

    assert.deepEqual(r.tasarruf.fiyatFarki.simdi, { tutarTl: 0, ornek: 1, kursuz: 0, kurEtkisiTl: 300 });
    assert.deepEqual(r.tasarruf.kacinilan.simdi, { tutarTl: 40, ornek: 1, kursuz: 0, kurEtkisiTl: null });
    assert.deepEqual(r.fiyatSapmasi.donem.simdi, { satir: 1, toplamTl: 0, bantDisi: 0, endeksYok: 0 });
    assert.deepEqual([r.fiyatSapmasi.kalemler[0]!.kurEtkisiTl, r.fiyatSapmasi.kalemler[0]!.bant], [300, 'icinde']);
    assert.equal(r.fiyatSapmasi.esikYuzde, 10);
    assert.equal(r.kuralDisi.enAzTeklif, 3);
    assert.deepEqual([r.kuralDisi.donem.simdi.azTeklif.siparis, r.kuralDisi.donem.simdi.talepOncesi.siparis], [4, 0]);
  });

  test('2477: kategori ve tedarikçi dağılımı, aylık seri, teklif sayısı ve tek kaynak; sipariş satırları dökümü', async () => {
    const r = satinAlmaAnaliziCevabi.parse(await o().vt.tx((db) => satinAlmaAnalizi(db, simdi)));
    const d = r.harcamaDagilimi;
    assert.equal(d.aylar.length, 12);
    assert.equal(d.aylar.at(-1)!.ay, '2026-11');
    assert.equal(d.aylar.find((a) => a.ay === '2026-09')!.tutarTl! >= 200, true);
    assert.ok(d.kategoriler.some((k) => k.anahtar === 'Hizmet' && k.tutarTl === 200));
    assert.ok(d.tedarikciler.length >= 1 && d.ilkBirPay !== null && d.ilkUcPay !== null && d.ilkUcPay >= d.ilkBirPay);
    assert.ok(r.tedarikRiski.teklif.talep >= 1);
    // İki teklif aynı firmadan: kalem tek kaynaktır.
    assert.ok(r.tedarikRiski.tekKaynak.kalemler.some((k) => k.ad === 'Deneme hizmet' && k.tutarTl === 200));

    const dk = satinAlmaSiparisDokumu.parse(await o().vt.tx((db) => siparisDokumu(db, simdi)));
    assert.deepEqual([dk.basTarih, dk.bitTarih], ['2025-11-05', '2026-11-04']);
    assert.ok(dk.satirlar.some((x) => x.malzeme === 'Deneme hizmet' && x.kategori === 'Hizmet' && x.tutarTl === 200 && /^ST-2026-/.test(x.talepNo)));
    const yanit = await app.inject({ method: 'GET', url: '/api/satin-alma-analiz/siparis-satirlari', headers: { cookie: await giris('yonetici') } });
    assert.equal(yanit.statusCode, 200, yanit.body);
    satinAlmaSiparisDokumu.parse(yanit.json());
    const operator = await app.inject({ method: 'GET', url: '/api/satin-alma-analiz/siparis-satirlari', headers: { cookie: await giris('operator') } });
    assert.equal(operator.statusCode, 403, operator.body);
  });

  test('uç: satın almayı okuyan görür, yetkisiz 403', async () => {
    const yonetici = await app.inject({ method: 'GET', url: '/api/satin-alma-analiz', headers: { cookie: await giris('yonetici') } });
    assert.equal(yonetici.statusCode, 200, yonetici.body);
    assert.equal(satinAlmaAnaliziCevabi.parse(yonetici.json()).tedarikciler.length, 1);
    const operator = await app.inject({ method: 'GET', url: '/api/satin-alma-analiz', headers: { cookie: await giris('operator') } });
    assert.equal(operator.statusCode, 403, operator.body);
  });
});
