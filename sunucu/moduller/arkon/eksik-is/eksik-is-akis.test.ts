import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { eksikIslerCevabi, eksikIslerimCevabi } from '#paylasilan/sozlesme/arkon.ts';
import type { EksikIslerCevabi, EksikIslerimCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../../denetim/disari.ts';
import { tekrarDeposu } from '../../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../../kisiler/disari.ts';
import { kimlikCozucu } from '../../oturum/disari.ts';
import { uretimEmriAc } from '../../uretim-emirleri/disari.ts';
import { gunEkle } from '../kurallar.ts';
import { eksikIsleriYenile } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const SAAT = 3_600_000;

interface Cevap<T = unknown> { durum: number; govde: T }

// Kart 2421 c: eksik iş olayları 15 dakikalık işte yazılır, anomali sayfası ve terminal uçlarından okunur. Vardiya gün boyu açık: net dakika
// takvim dakikasıdır. Plan hiç canlıya alınmadı (bayat plan açık işte değer 0).
describe('arkon eksik iş olayları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let yonetici = '';
  let hazirlik = '';
  let planlamaId = 0;
  let operator = '';
  let operatorId = 0;
  let baskaOperator = '';
  let sayac = 0;
  let simdi = 0;
  let istasyonId = 0;
  let makineId = 0;
  type Emir = { emirId: number; adim: number; ikinci: number | null };
  let geride: Emir = { emirId: 0, adim: 0, ikinci: null };
  let plansiz: Emir = { emirId: 0, adim: 0, ikinci: null };
  let yarim: Emir = { emirId: 0, adim: 0, ikinci: null };

  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const anMetni = (t: number): string => new Date(t).toISOString();

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function istek<T = unknown>(cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`,
      headers: { ...(cerez ? { cookie: cerez } : {}), ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }
  async function kisiKur(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const gecici = await o().vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]);
    for (const islem of islemler) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici!.id, islem]);
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, gecici!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
      return yeni;
    });
    return { cerez: await girisCerezi(kullaniciAdi), id };
  }
  const ayarYaz = (anahtar: string, deger: number | boolean | null) => istek(yonetici, 'POST', `/ayarlar/${anahtar}/degistir`, { deger });

  // Rotalı emir; `acilma` saat önce açılmış. `akisliDevir` verilirse ikinci adım birinciye akışlı bağlıdır.
  async function emirKur(acilmaSaatOnce: number, akisliDevir?: number): Promise<{ emirId: number; adim: number; ikinci: number | null }> {
    sayac += 1;
    const tip = (await o().sahip.tek<{ id: number }>('INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, $2, $3) RETURNING id', [`EK${sayac}`, 'Deneme tipi', 'TAL']))!.id;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('EKS-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'EKS-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`eks-${sayac}`, sayac, JSON.stringify({ id: `eks-${sayac}`, com: { ad: `Deneme ${sayac}` } }), yoneticiId],
    ))!.no;
    await o().sahip.sorgu("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2)", [kart, yoneticiId]);
    const revizyon = (await o().sahip.tek<{ id: number }>("SELECT id FROM rota_revizyonu WHERE malzeme_id = $1 AND harf = 'A'", [kart]))!.id;
    const { uretimEmriId } = await o().vt.tx(async (db) => uretimEmriAc(db, (await kullaniciYukle(db, yoneticiId))!, {
      projeId, malzemeNo: kart, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyon,
      isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine' as const, id: makineId }, ayarSuresiDk: '0', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      }, ...(akisliDevir === undefined ? [] : [{
        sira: 2, opNo: 20, ad: 'Adım 2', operasyonTipiId: tip, kaynak: { tur: 'makine' as const, id: makineId }, ayarSuresiDk: '0', birimSureDk: '1',
        terminGun: null, bagimlilik: 'akisli' as const, devirAdedi: akisliDevir, talimatSurumu: null, kontrolListesi: [],
      }])],
    }));
    await o().sahip.sorgu('UPDATE uretim_emri SET acilma = $2::timestamptz WHERE id = $1', [uretimEmriId, anMetni(simdi - acilmaSaatOnce * SAAT)]);
    const adimlar = await o().sahip.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira', [uretimEmriId]);
    return { emirId: uretimEmriId, adim: adimlar[0]!.id, ikinci: adimlar[1]?.id ?? null };
  }
  const yerlestir = (isEmriId: number, bas: number, bit: number) => o().sahip.sorgu(
    `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, kisi_id, baslangic, bitis, yazan_kisi_id) VALUES ($1, $2, NULL, $3::timestamptz, $4::timestamptz, $5)
     ON CONFLICT (is_emri_id) DO UPDATE SET baslangic = EXCLUDED.baslangic, bitis = EXCLUDED.bitis`,
    [isEmriId, makineId, anMetni(bas), anMetni(bit), yoneticiId]);
  const yenile = (an = simdi) => o().vt.tx((db) => eksikIsleriYenile(db, an));
  const olaylar = () => o().sahip.sorgu<{ tur: string; konuId: number | null; deger: number; kalanAdet: number | null; planaGore: boolean; kapanis: string | null; bildirim: string | null }>(
    `SELECT tur, konu_id AS "konuId", deger::float8 AS deger, kalan_adet AS "kalanAdet", plana_gore AS "planaGore", kapanis::text AS kapanis, bildirim::text AS bildirim
       FROM arkon_eksik_is_olayi ORDER BY id`);
  const acik = async (tur: string, konuId: number | null) => (await olaylar()).find((r) => r.tur === tur && r.konuId === konuId && r.kapanis === null);

  before(async () => {
    ortam = await testVeritabaniKur('arkoneksik');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ARKON.EK', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    yonetici = await girisCerezi('yonetici');
    hazirlik = (await kisiKur('hz1', ['arkon.hazirlik', 'sayfa.arkon'])).cerez;
    planlamaId = (await kisiKur('pl1', ['arkon.planlama', 'sayfa.arkon'])).id;
    ({ cerez: operator, id: operatorId } = await kisiKur('op1', ['arkon.operator', 'sayfa.arkon', 'terminal.uret']));
    baskaOperator = (await kisiKur('op2', ['arkon.operator', 'sayfa.arkon', 'terminal.uret'])).cerez;
    simdi = tesisGunBasi(tesisGunu(Date.now())) + 12 * SAAT;
    const merkez = await istek<{ id: number }>(yonetici, 'POST', '/is-merkezleri', { kod: 'EM1', ad: 'Eksik merkezi' });
    const ist = await istek<{ id: number }>(yonetici, 'POST', '/istasyonlar', { kod: 'EI1', ad: 'Eksik istasyonu', isMerkeziId: merkez.govde.id, tip: 'talasli' });
    istasyonId = ist.govde.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('EK1', 'Tezgah E', $1) RETURNING id", [istasyonId]))!.id;
    const vardiya = (await ortam.sahip.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Gün E', '00:00', '23:59') RETURNING id"))!.id;
    await ortam.sahip.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) SELECT $1, g, $2 FROM generate_series(1, 7) g', [merkez.govde.id, vardiya]);
    await ortam.sahip.sorgu("INSERT INTO makine_kisi (makine_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2000-01-01', 100)", [makineId, operatorId]);
    // Geride: dün 6-8'e yerleşti, hiç girilmedi; teslimi üç gün önce. Plansız: iki gün önce açıldı, yerleşmedi. Yarım: başladı, 30 saattir hareket yok.
    geride = await emirKur(72);
    await yerlestir(geride.adim, simdi - 30 * SAAT, simdi - 28 * SAAT);
    await ortam.sahip.sorgu('UPDATE uretim_emri SET teslim = $2::date WHERE id = $1', [geride.emirId, gunEkle(tesisGunu(simdi), -3)]);
    plansiz = await emirKur(48);
    yarim = await emirKur(72);
    await yerlestir(yarim.adim, simdi + SAAT, simdi + 3 * SAAT);
    await ortam.sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = $2::timestamptz WHERE id = $1", [yarim.adim, anMetni(simdi - 30 * SAAT)]);
  });
  after(async () => { await ortam?.kaldir(); });

  test('varsayılan eşikler açık (2421 c); uç: hazırlık 200 ve sözleşmeye uyar, operatör 403, oturumsuz 401', async () => {
    const cevap = await istek<EksikIslerCevabi>(hazirlik, 'GET', '/arkon/eksik-isler');
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    assert.equal(eksikIslerCevabi.safeParse(cevap.govde).success, true);
    assert.deepEqual(cevap.govde.esikler, { planGerisiDk: 60, kayitsizGun: 1, yarimIsSaat: 8, plansizIsSaat: 8, gecikenEmirGun: 0, bayatPlanSaat: 8 });
    assert.equal((await istek(operator, 'GET', '/arkon/eksik-isler')).durum, 403);
    assert.equal((await istek(null, 'GET', '/arkon/eksik-isler')).durum, 401);
  });

  test('AR-EK-1, 2, 3, 4, 5, 6: yapılmayan, girilmeyen ve geciken iş plan yeniden canlıya alınmadan görünür', async () => {
    await yenile();
    const pg = await acik('plan-gerisi', geride.adim);
    // Vardiya 23:59'da biter: gece yarısını geçen her gün bir dakika net sayılmaz.
    assert.deepEqual([pg?.deger, pg?.kalanAdet], [28 * 60 - 1, 10], 'dün 8:00 bitmeliydi: 28 saat net gecikme, 10 adet kaldı');
    assert.equal(await acik('plan-gerisi', yarim.adim), undefined, 'yerleşimi ileride');
    // Yarım ve plansız iş de vardiya saatiyle: aynı gece yarısı dakikaları düşer, değer aşağı yuvarlanır.
    assert.equal((await acik('plansiz-is', plansiz.adim))?.deger, 47);
    assert.equal(await acik('plansiz-is', geride.adim), undefined);
    assert.equal((await acik('yarim-is', yarim.adim))?.deger, 29);
    const ge = await acik('geciken-emir', geride.emirId);
    assert.deepEqual([ge?.deger, ge?.planaGore], [3, false]);
    assert.equal(await acik('geciken-emir', plansiz.emirId), undefined, 'teslimsiz');
    assert.equal((await acik('kayitsiz-gun', istasyonId))?.deger, 3, 'üç gündür açık iş var, sayım yok');
    assert.equal((await acik('bayat-plan', null))?.deger, 0, 'plan hiç canlıya alınmadı');
    assert.ok((await olaylar()).every((r) => r.bildirim !== null), 'açılan her olay bildirildi');

    const cevap = await istek<EksikIslerCevabi>(hazirlik, 'GET', '/arkon/eksik-isler');
    assert.equal(eksikIslerCevabi.safeParse(cevap.govde).success, true, JSON.stringify(cevap.govde));
    assert.deepEqual(cevap.govde.ozet, { 'plan-gerisi': 1, 'kayitsiz-gun': 1, 'yarim-is': 1, 'plansiz-is': 1, 'geciken-emir': 1, 'bayat-plan': 1, 'geride-onceki': 0 });
    const satir = cevap.govde.olaylar.find((x) => x.tur === 'plan-gerisi')!;
    assert.deepEqual([satir.istasyon?.id, satir.kaynak, satir.opNo, satir.uretimEmriId], [istasyonId, { tur: 'makine', id: makineId, ad: 'Tezgah E' }, 10, geride.emirId]);
  });

  test('bildirim olay başına bir kez; alıcı türün işlemidir; ikinci tur yeni olay ve bildirim açmaz, değer güncellenir', async () => {
    const say = async () => (await o().sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = 'arkon.plan-gerisi'", [planlamaId]))!.n;
    assert.equal(await say(), 1);
    await yenile(simdi + SAAT);
    assert.equal(await say(), 1);
    assert.equal((await olaylar()).filter((r) => r.tur === 'plan-gerisi').length, 1);
    assert.equal((await acik('plan-gerisi', geride.adim))?.deger, 29 * 60 - 1);
  });

  test('AR-EK-2: duruş kaydı girilmiş gün kayıtsız sayılmaz, zinciri kırmaz', async () => {
    const neden = (await o().sahip.tek<{ id: number }>("INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ('EK-D1', 'Deneme duruşu', 'plansiz', 901) RETURNING id"))!.id;
    await o().sahip.sorgu(
      `INSERT INTO uretim_olayi (emir_id, is_emri_id, kisi_id, istasyon_id, olay, durus_nedeni_id, zaman)
       VALUES ($1, $2, $3, $4, 'durdur', $5, $6::timestamptz), ($1, $2, $3, $4, 'devam', NULL, $7::timestamptz)`,
      [geride.emirId, geride.adim, yoneticiId, istasyonId, neden, anMetni(simdi - 48 * SAAT), anMetni(simdi - 47 * SAAT)]);
    await yenile(simdi + SAAT);
    assert.equal((await acik('kayitsiz-gun', istasyonId))?.deger, 2, 'iki gün önce duruş girildi: o gün sayılmaz, önceki gün sayılır');
  });

  test('saha görünümü: operatör kendi tezgahının eksiklerini görür; atanmayan operatör boş, operatör rolü olmayan 403', async () => {
    const cevap = await istek<EksikIslerimCevabi>(operator, 'GET', '/arkon/eksik-islerim');
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    assert.equal(eksikIslerimCevabi.safeParse(cevap.govde).success, true);
    // Önce türe göre (kayıtsız gün, yarım iş, plan gerisi), tür içinde değere göre: değerin birimi türden türe değişir.
    assert.deepEqual(cevap.govde.olaylar.map((x) => x.tur), ['kayitsiz-gun', 'yarim-is', 'plan-gerisi']);
    assert.deepEqual((await istek<EksikIslerimCevabi>(baskaOperator, 'GET', '/arkon/eksik-islerim')).govde.olaylar, []);
    assert.equal((await istek(hazirlik, 'GET', '/arkon/eksik-islerim')).durum, 403);
    assert.equal((await istek(null, 'GET', '/arkon/eksik-islerim')).durum, 401);
  });

  test('AR-EK-7: giriş gelince kayıtsız gün, kural kapanınca plansız iş kapanır; hatırlatma da kapanır', async () => {
    await o().sahip.sorgu(
      "INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, tur, adet, zaman) VALUES ($1, $2, $3, $4, 'saglam', 1, $5::timestamptz)",
      [geride.emirId, geride.adim, yoneticiId, istasyonId, anMetni(simdi - 26 * SAAT)]);
    assert.equal((await ayarYaz('arkon.eksik-plansiz-is-saat', null)).durum, 200);
    await yenile(simdi + 2 * SAAT);
    assert.equal(await acik('kayitsiz-gun', istasyonId), undefined, 'dün giriş var: zincir kırıldı');
    assert.equal(await acik('plansiz-is', plansiz.adim), undefined);
    assert.notEqual((await olaylar()).find((r) => r.tur === 'plansiz-is')?.kapanis, null, 'iz kalır');
    const acikHatirlatma = await o().sahip.tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM bildirim_kaydi WHERE tur = 'arkon.plansiz-is' AND yapildi IS NULL");
    assert.equal(acikHatirlatma?.n, 0);
  });

  test('AR-EK-8: sıra dışı başlayan adım, önceki adımın sayımı yetişene kadar açıktır; değer sayılmamış en az adettir; ayar kapanınca kapanır', async () => {
    const e = await emirKur(4, 2);
    const ikinci = e.ikinci!;
    const sayim = (isEmriId: number, adet: number) => o().sahip.sorgu(
      "INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, tur, adet, zaman) VALUES ($1, $2, $3, $4, 'saglam', $5, $6::timestamptz)",
      [e.emirId, isEmriId, yoneticiId, istasyonId, adet, anMetni(simdi - SAAT)]);
    await yenile();
    assert.equal(await acik('geride-onceki', ikinci), undefined, 'kayıt yoksa olay yok');
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = $2::timestamptz WHERE id = $1", [ikinci, anMetni(simdi - 2 * SAAT)]);
    await o().sahip.sorgu(
      `INSERT INTO uretim_emirleri_sira_disi_baslatma (uretim_emri_id, is_emri_id, oncul_is_emri_id, oncul_turu, devir_adedi, hazir_adet, oncul_sayilan, kisi_id, istasyon_id, zaman)
       VALUES ($1, $2, $3, 'akisli', 2, 0, 0, $4, $5, $6::timestamptz)`,
      [e.emirId, ikinci, e.adim, yoneticiId, istasyonId, anMetni(simdi - 2 * SAAT)]);
    await sayim(ikinci, 3);
    await yenile();
    assert.deepEqual(await acik('geride-onceki', ikinci).then((r) => [r?.deger, r?.kalanAdet]), [3, 2], 'ikinci adımda 3 sayıldı, önceki adımda 0; devir için 2 eksik');
    assert.equal(await acik('geride-onceki', e.adim), undefined, 'olay önceki adımda değil, sıra dışı başlayan adımda');
    await sayim(e.adim, 2);
    await yenile();
    assert.deepEqual(await acik('geride-onceki', ikinci).then((r) => [r?.deger, r?.kalanAdet]), [1, 0], 'önceki adım yetiştikçe değer azalır; devir geldi');
    assert.equal((await ayarYaz('arkon.eksik-geride-onceki', false)).durum, 200);
    await yenile();
    assert.equal(await acik('geride-onceki', ikinci), undefined, 'ayar kapalı: olay kapanır');
    assert.notEqual((await olaylar()).find((r) => r.tur === 'geride-onceki')?.kapanis, null, 'iz kalır');
    assert.equal((await ayarYaz('arkon.eksik-geride-onceki', true)).durum, 200);
    await sayim(e.adim, 1);
    await yenile();
    assert.equal(await acik('geride-onceki', ikinci), undefined, 'önceki adım yetişti: yeniden açılmaz');
  });
});
