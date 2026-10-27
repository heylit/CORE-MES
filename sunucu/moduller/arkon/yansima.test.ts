import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { isiBirKezCalistir, modulIsleriniKesfet } from '#cekirdek/zamanlayici.ts';
import type { EmirAyrintiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kararSayaclari, kararliSayimiSonuclandir, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { PLANLAMA_ANAHTARI } from '../plan/disari.ts';
import { isler } from './isler.ts';
import { belgeSil, belgeYaz, belgeler } from './servis.ts';
import { ALET_ONEKI, BITMIS_BITIR, PAKET_ADIM_SIRASI, ROTALI_EMIR_PAKETI, GIZLI_YANSIMA_TURLERI, gizliYansimaTuru, ISTEK_KILIT_BUTCESI_MS, KUYRUK_DEGISIKLIK_YOK, HAZIRLIK_DEGISIKLIK_YOK, SAYIM_ERTELEME, ZATEN_CALISIYOR, PARCA_OTEKI_CALISIYOR, PARCA_OTEKILER_BITMEDI } from './kurallar.ts';
import { BEKLEYEN_EMIRLER_SQL, BEKLEYEN_YANSIMALAR_SQL, KAYITLAR_SQL, PARCA_SAGLAMI_SQL, YANSIMA_SAYIM_SQL, bekleyenlereNedenYaz, yansimaSayimParametreleri } from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

interface Cevap<T = unknown> { durum: number; govde: T }
interface Yansima { sonuc: string; neden: string | null; emir_id: number | null }

describe('arkon sayım ve olayları TMI üretim emrine yansır (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  let operatorId = 0;
  let yonetici = '';
  let operator = '';
  // Çalışan işe katılımı olmayan ikinci operatör: makineli istasyonda başlatması TMI'de reddedilir ("iş zaten çalışıyor").
  let digerOperator = '';
  let yetkisiz = '';
  let istasyonId = 0;
  let merkezId = 0;
  let istasyonKodu = '';
  let durusKodu = '';
  let hurdaKodu = '';
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function istek<T = unknown>(cerez: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerez, ...(yontem === 'POST' && (yol === '/uretim-emirleri' || yol === '/adimli-emirler/rotasiz' || yol.startsWith('/plan/') || /^\/adimli-emirler\/\d+\/(bol|birlestir|adim-ekle)$/.test(yol) || /^\/kalite-merkezi\/ilk-parca\/\d+\/karar$/.test(yol)) ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }

  async function kisiKur(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const gecici = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]);
    if (!yoneticiRolu || !gecici) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici.id, islem]);
    await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, gecici.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
    });
    return girisCerezi(kullaniciAdi);
  }

  const iptalYaz = (id: number) => ortam!.sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now(), surum = surum + 1 WHERE id = $1", [id]);

  async function emirAc(): Promise<number> {
    // İş emirsiz emrin açma ucu yok (238 H3): yalnız kurulum için doğrudan yazılır.
    return (await ortam!.sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, proje_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [`YP-${(sayac += 1)}`, 'Yansıma', 500, istasyonId, yoneticiId, projeId]))!.id;
  }

  // Aynı istasyonda tek başlamış emir olur: her test kendi istasyonunu kurar.
  async function yeniIstasyon(): Promise<void> {
    const im = await istek<{ id: number }>(yonetici, 'POST', '/is-merkezleri', { kod: `YM${(sayac += 1)}`, ad: 'Yansıma merkezi' });
    const ist = await istek<{ id: number; kod: string }>(yonetici, 'POST', '/istasyonlar', { kod: `YI${(sayac += 1)}`, ad: 'Yansıma istasyonu', isMerkeziId: im.govde.id, tip: 'talasli' });
    assert.equal(ist.durum, 200, JSON.stringify(ist.govde));
    istasyonId = ist.govde.id;
    merkezId = im.govde.id;
    istasyonKodu = ist.govde.kod;
    // UE20: ortak operatörler her yeni istasyonda yetkindir; testin kendi kurduğu kişi kendi istasyonunda açıkça yetkin kılınır, çünkü
    // yetkinlik iş merkezi kapsamını genişletir.
    await vt().sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi IN ('op1', 'op1b')", [istasyonId]);
  }

  const emirOku = async (id: number) => (await istek<EmirAyrintiCevabi>(yonetici, 'GET', `/uretim-emirleri/${id}`)).govde.emir;
  // 327 a: ilk parça onaylanana kadar sağlam sayım karar bekler; sağlamı ölçen testler önce ilk parçayı onaylar.
  // Onay bekleyeni olduğu gibi sağlama geçirir: iki kez yazılan sayım onaydan sonra da iki kez görünür.
  const ilkParcaOnay = (emirId: number) => vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, emirId, 'onay'));
  const onayliSaglam = async (emirId: number) => { await ilkParcaOnay(emirId); return (await emirOku(emirId)).canli?.saglam; };
  const ekle = (cerez: string, tur: string, satir: Record<string, unknown>) =>
    istek<{ eklenen: number }>(cerez, 'POST', `/arkon/kayitlar/${tur}/ekle`, { satirlar: [satir], kaynak: 'y1' });
  const yansima = async (cid: string): Promise<Yansima | null> => vt().tek<Yansima>(
    'SELECT y.sonuc, y.neden, y.emir_id FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id WHERE k.cid = $1', [cid]);
  const kayitSayisi = async (cid: string): Promise<number> => (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_kayit WHERE cid = $1', [cid]))?.n ?? -1;
  const pk = (emirId: number) => `tmi-ue-${emirId}`;
  let cidSayac = 0;
  const cid = (): string => `ys-${(cidSayac += 1)}`;
  const olay = (emirId: number, state: string, ek: Record<string, unknown> = {}) => ({ cid: cid(), pkgId: pk(emirId), state, ...ek });
  const sayim = (emirId: number, kind: string, delta: number, ek: Record<string, unknown> = {}) => ({ cid: cid(), pkgId: pk(emirId), kind, delta, ...ek });

  let projeId = 0;

  before(async () => {
    ortam = await testVeritabaniKur('arkonyans');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    // Denetim #27: rotasız emir varsayılan kapalı ve projeyle açılır; kurulum ayarı açar, test projesi verir.
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('TEST.PROJE', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.rotasiz-emir', 'true', $1)", [yoneticiId]);
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ARKON.YAN', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    yonetici = await girisCerezi('yonetici');
    operator = await kisiKur('op1', ['arkon.operator', 'sayfa.arkon', 'terminal.uret']);
    operatorId = (await ortam.vt.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'op1'"))?.id ?? 0;
    yetkisiz = await kisiKur('op2', ['arkon.operator', 'sayfa.arkon']);
    digerOperator = await kisiKur('op1b', ['arkon.operator', 'sayfa.arkon', 'terminal.uret']);
    durusKodu = 'DR-1';
    hurdaKodu = 'HR-1';
    assert.equal((await istek(yonetici, 'POST', '/durus-nedenleri', { kod: durusKodu, ad: 'Deneme duruşu', kategori: 'plansiz' })).durum, 200);
    assert.equal((await istek(yonetici, 'POST', '/hurda-nedenleri', { kod: hurdaKodu, ad: 'Deneme hurdası' })).durum, 200);
  });

  // Her test kendi bekleyenleriyle çalışır: önceki testlerin artakalan bekleyenleri süpürme sırasını doldurmasın.
  beforeEach(async () => {
    await vt().sorgu("UPDATE arkon_tmi_yansima SET sonuc = 'eslenemedi', neden = 'test temizliği' WHERE sonuc = 'bekliyor'");
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('Arkon olay ve sayımı TMI komutuna eşlenir: başlat, sağlam sayım ve düzeltme, hurda, duraklat, devam, durdur (TMI kodlu neden), bitir', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const ilkSaglam = sayim(emir, 'good', 5);
    const adimlar: [string, Record<string, unknown>, (e: Awaited<ReturnType<typeof emirOku>>) => void][] = [
      ['events', olay(emir, 'running'), (e) => assert.equal(e.durum, 'basladi')],
      ['counts', ilkSaglam, (e) => assert.equal(e.canli?.saglam, 5)],
      ['counts', sayim(emir, 'good', -1), (e) => assert.equal(e.canli?.saglam, 4)],
      ['counts', sayim(emir, 'scrap', 2, { reason: hurdaKodu }), (e) => assert.equal(e.canli?.hurda, 2)],
      // Hurda -1 (kart #1194): nedensiz eksi hurda TMI'de son hurdanın nedeniyle düzeltmedir.
      ['counts', sayim(emir, 'scrap', -1), (e) => assert.equal(e.canli?.hurda, 1)],
      ['events', olay(emir, 'paused'), (e) => assert.equal(e.canli?.calisma, 'durakli')],
      ['events', olay(emir, 'running'), (e) => assert.equal(e.canli?.calisma, 'calisiyor')],
      ['events', olay(emir, 'stopped', { reason: durusKodu }), (e) => assert.equal(e.canli?.calisma, 'durdu')],
      ['events', olay(emir, 'running'), (e) => assert.equal(e.canli?.calisma, 'calisiyor')],
      ['events', olay(emir, 'done'), (e) => assert.equal(e.durum, 'bitti')],
    ];
    for (const [tur, satir, dogrula] of adimlar) {
      const c = await ekle(operator, tur, satir);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      const y = await yansima(String(satir['cid']));
      assert.deepEqual(y, { sonuc: 'yazildi', neden: null, emir_id: emir }, `${tur} ${JSON.stringify(satir)}`);
      if (satir === ilkSaglam) await ilkParcaOnay(emir);
      dogrula(await emirOku(emir));
    }
  });

  // Kart #156: terminalde "Aç" ile seçilen refakat kartı sayımla TMI'ye gider; başka emrin kartı reddedilir (denetim stokta).
  test('kart #156: sayım satırındaki refakat kartı TMI sayımına yazılır; başka emrin kartıyla sayım reddedilir', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const baska = await emirAc();
    const sahip = ortam!.sahip;
    await sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['YNS-DNM-']);
    const kimlik = `yns-dnm-${(sayac += 1)}`;
    const hm = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'YNS-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [kimlik, sayac, JSON.stringify({ id: kimlik, com: { ad: 'Deneme çubuk' } }), yoneticiId]))!.no;
    const lot = (await sahip.tek<{ id: number }>('INSERT INTO stok_parti (malzeme_id, acan_kisi_id, lot_no) VALUES ($1, $2, $3) RETURNING id', [hm, yoneticiId, `LT-${kimlik}`]))!.id;
    const kartAc = async (e: number) => (await sahip.tek<{ id: number }>(
      'INSERT INTO stok_refakat_partisi (uretim_emri_id, sira, malzeme_id, parti_id, acan_kisi_id) VALUES ($1, 1, $2, $3, $4) RETURNING id', [e, hm, lot, yoneticiId]))!.id;
    const kart = await kartAc(emir);
    const yabanci = await kartAc(baska);
    assert.equal((await ekle(operator, 'events', olay(emir, 'running'))).durum, 200);
    const kartli = sayim(emir, 'good', 2, { refakatPartisiId: kart });
    assert.equal((await ekle(operator, 'counts', kartli)).durum, 200);
    assert.deepEqual(await yansima(String(kartli['cid'])), { sonuc: 'yazildi', neden: null, emir_id: emir });
    const satirlar = await vt().sorgu<{ refakat_partisi_id: number | null }>('SELECT refakat_partisi_id FROM uretim_sayimi WHERE emir_id = $1', [emir]);
    assert.ok(satirlar.length > 0 && satirlar.every((r) => r.refakat_partisi_id === kart), JSON.stringify(satirlar));
    const yanlis = sayim(emir, 'good', 1, { refakatPartisiId: yabanci });
    assert.equal((await ekle(operator, 'counts', yanlis)).durum, 200);
    assert.equal((await yansima(String(yanlis['cid'])))?.sonuc, 'reddedildi');
  });

  test('denetim #25: çevrimdışı kuyruktan gelen kayıt TMI\'ye kendi zamanıyla yazılır; emrin son anından eski kayıt kaybolmaz, sunucu saatiyle yazılır', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const saat = (dk: number) => Date.now() - dk * 60_000;
    const t1 = saat(90), t2 = saat(80), t3 = saat(70);
    for (const [tur, satir] of [['events', olay(emir, 'running', { at: t1 })], ['counts', sayim(emir, 'good', 3, { at: t2 })], ['events', olay(emir, 'paused', { at: t3 })]] as const) {
      const c = await ekle(operator, tur, satir);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      assert.equal((await yansima(String(satir['cid'])))?.sonuc, 'yazildi');
    }
    const ms = (z: Date | string | number | null | undefined) => (z == null ? null : new Date(z).getTime());
    assert.equal(ms((await vt().tek<{ baslama: Date }>('SELECT baslama FROM uretim_emri WHERE id = $1', [emir]))?.baslama), ms(t1), 'başlama tabletin anı');
    assert.equal(ms((await vt().tek<{ zaman: Date }>("SELECT zaman FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'karar_bekliyor'", [emir]))?.zaman), ms(t2), 'sayım tabletin anı (327 a: onaysız emirde karar bekler)');
    assert.equal(ms((await vt().tek<{ zaman: Date }>("SELECT max(zaman) AS zaman FROM uretim_olayi WHERE emir_id = $1", [emir]))?.zaman), ms(t3), 'duraklatma tabletin anı');
    // Emrin son anından (t3) eski kayıt: TMI reddederdi; sayım kaybolmasın diye sunucu saatiyle yazılır.
    const once = Date.now();
    const devam = olay(emir, 'running', { at: saat(100) });
    assert.equal((await ekle(operator, 'events', devam)).durum, 200);
    assert.equal((await yansima(String(devam['cid'])))?.sonuc, 'yazildi');
    assert.ok(ms((await vt().tek<{ zaman: Date }>("SELECT max(zaman) AS zaman FROM uretim_olayi WHERE emir_id = $1", [emir]))?.zaman)! >= once - 1000, 'eski kayıt sunucu saatiyle');
  });

  test('denetim #25: ileri: saati sunucudan ileri tabletin kaydı (pencere içinde) TMI\'ye sunucu saatiyle yazılır', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const ileri = Date.now() + 60_000;
    const basla = olay(emir, 'running', { at: ileri });
    assert.equal((await ekle(operator, 'events', basla)).durum, 200);
    assert.equal((await yansima(String(basla['cid'])))?.sonuc, 'yazildi');
    const baslama = (await vt().tek<{ baslama: Date }>('SELECT baslama FROM uretim_emri WHERE id = $1', [emir]))?.baslama;
    assert.ok(baslama && new Date(baslama).getTime() < ileri, 'sunucu saatiyle');
    assert.equal((await vt().tek<{ zaman: Date }>('SELECT zaman FROM arkon_kayit WHERE cid = $1', [basla['cid']]))?.zaman.getTime(), ileri, 'Arkon kaydı tabletin zamanını tutar');
  });

  test('131 b, 229 a, 564 5 a, denetim #12: ilk parça kararı Kalite Merkezi\'nin kaydıdır; ölçümdeki Arkon numunesi karar değildir, kalitenin Arkon Kabulü o kaydı yazar; karar beklenirken sonraki sağlam bekler, ret redde, onay sağlama geçirir; ret sonrası sayım yine bekler', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const paket = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(emir)}/yaz`, { taban: 0, govde: { id: pk(emir), status: 'draft', machine: istasyonKodu, plan: [{ id: 1 }] }, kaynak: 'y1' });
    assert.equal(paket.durum, 200, JSON.stringify(paket.govde));
    const sayaclar = async () => {
      const k = (await kararSayaclari(vt(), [emir])).get(emir);
      return { saglam: (await emirOku(emir)).canli?.saglam ?? 0, kararBekliyor: k?.kararBekliyor ?? 0, red: k?.red ?? 0 };
    };
    const yaz = async (satir: Record<string, unknown>) => {
      const c = await ekle(operator, 'counts', { ...satir, machine: istasyonKodu });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      assert.deepEqual(await yansima(String(satir['cid'])), { sonuc: 'yazildi', neden: null, emir_id: emir });
    };
    const tur = await vt().tek<{ id: number }>("SELECT id FROM olcu_aleti_turu WHERE ad = 'Kumpas'");
    const alet = await istek<{ id: number }>(yonetici, 'POST', '/olcu-aletleri', { no: `FAI-${emir}`, turId: tur?.id, ilkKalibrasyon: { sonuc: 'uygun' } });
    assert.equal(alet.durum, 200, JSON.stringify(alet.govde));
    const numune = async (kimlik: string, status: string, ok: boolean) => {
      const c = await istek(yonetici, 'POST', `/arkon/belgeler/requests/${kimlik}/yaz`, {
        taban: 0, govde: { id: kimlik, pkgId: pk(emir), items: [1], status, decidedAt: 1, note: 'not', results: { 1: { ok, v: 1, gid: `${ALET_ONEKI}${alet.govde.id}` } } }, kaynak: 'y1',
      });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    };
    assert.equal((await ekle(operator, 'events', olay(emir, 'running', { machine: istasyonKodu }))).durum, 200);
    await yaz(sayim(emir, 'good', 1));
    await yaz(sayim(emir, 'good', 3));
    // 327 a: ilk sayım da karar bekler; onaya dek hiçbir adet sağlam değildir.
    assert.deepEqual(await sayaclar(), { saglam: 0, kararBekliyor: 4, red: 0 });
    const karar = async (k: 'onay' | 'ret') => {
      const c = await istek(yonetici, 'POST', `/kalite-merkezi/ilk-parca/${emir}/karar`, { karar: k });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    };
    await numune('rq-fai-1', 'measuring', true);
    assert.deepEqual(await sayaclar(), { saglam: 0, kararBekliyor: 4, red: 0 }, 'ölçümdeki Arkon numunesi karar değildir');
    await yaz(sayim(emir, 'good', 1));
    assert.deepEqual(await sayaclar(), { saglam: 0, kararBekliyor: 5, red: 0 }, 'ölçüm sürerken Kalite Merkezi kararına dek bekler');
    await karar('ret');
    assert.deepEqual(await sayaclar(), { saglam: 0, kararBekliyor: 0, red: 5 }, 'ret');
    await yaz(sayim(emir, 'good', 2));
    assert.deepEqual(await sayaclar(), { saglam: 0, kararBekliyor: 2, red: 5 }, 'ret sonrası sayım yine bekler (136 a)');
    await numune('rq-fai-2', 'approved', true);
    assert.deepEqual(await sayaclar(), { saglam: 2, kararBekliyor: 0, red: 5 }, 'kalitenin Arkon Kabulü Kalite Merkezi onayıdır (564 5 a)');
    await yaz(sayim(emir, 'good', 2, { tmiKararBekliyor: 2 }));
    assert.deepEqual(await sayaclar(), { saglam: 4, kararBekliyor: 0, red: 5 }, 'onaydan sonra sağlam; istemcinin alanı sayılmaz');
  });

  test('denetim #12, 564 5 a: yeniden ilk parça kararından sonra ikinci sağlam reddedilir; ölçümdeki Arkon numunesi kapatmaz, kalitenin Arkon Kabulü Kalite Merkezi onayı olarak kapatır', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const yaz = async (govde: Record<string, unknown>) => {
      const b = (await istek<{ belge: { surum: number; govde: Record<string, unknown> } | null }>(yonetici, 'GET', `/arkon/belgeler/pkgs/${pk(emir)}`)).govde.belge;
      const c = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(emir)}/yaz`, { taban: b?.surum ?? 0, govde: { ...(b?.govde ?? {}), ...govde }, kaynak: 'y1' });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    };
    await yaz({ id: pk(emir), status: 'draft', machine: istasyonKodu, plan: [{ id: 1 }] });
    const say = () => ekle(operator, 'counts', { ...sayim(emir, 'good', 1), machine: istasyonKodu });
    const karar = async () => assert.equal((await istek(yonetici, 'POST', `/kalite-merkezi/ilk-parca/${emir}/karar`, { karar: 'onay' })).durum, 200);
    assert.equal((await ekle(operator, 'events', olay(emir, 'running', { machine: istasyonKodu }))).durum, 200);
    assert.equal((await say()).durum, 200);
    await karar();
    assert.equal((await say()).durum, 200, 'ilk karar onaylı');
    await yaz({ fpRe: { on: true, key: 'red:x', why: 'red' } });
    assert.equal((await say()).durum, 200, 'yeniden ilk parça');
    const ret = await say();
    assert.equal(ret.durum, 409, JSON.stringify(ret.govde));
    assert.match(JSON.stringify(ret.govde), /yeniden ilk parça/i);
    const tur = await vt().tek<{ id: number }>("SELECT id FROM olcu_aleti_turu WHERE ad = 'Kumpas'");
    const alet = await istek<{ id: number }>(yonetici, 'POST', '/olcu-aletleri', { no: `YIP-${emir}`, turId: tur?.id, ilkKalibrasyon: { sonuc: 'uygun' } });
    assert.equal(alet.durum, 200, JSON.stringify(alet.govde));
    const numune = async (kimlik: string, status: string) => {
      const c = await istek(yonetici, 'POST', `/arkon/belgeler/requests/${kimlik}/yaz`, {
        taban: 0, govde: { id: kimlik, pkgId: pk(emir), items: [1], status, decidedAt: Date.now(), note: 'not', results: { 1: { ok: true, v: 1, gid: `${ALET_ONEKI}${alet.govde.id}` } } }, kaynak: 'y1',
      });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    };
    await numune(`rq-yip-${emir}`, 'measuring');
    assert.equal((await say()).durum, 409, 'ölçümdeki Arkon numunesi kapatmaz');
    await numune(`rq-yip2-${emir}`, 'approved');
    assert.equal((await say()).durum, 200, 'kalitenin Arkon Kabulü kararın ardından gelen Kalite Merkezi onayıdır ve kapatır');
  });

  test('Arkon hazırlığı TMI\'de "ayar" olayıdır: planlı emirde bir kez yazılır, emri başlatmaz; yinelenen ve başlamış emirdeki hazırlık değişiklik yapmaz', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const ayarlar = async () => (await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM uretim_olayi WHERE emir_id = $1 AND olay = 'ayar'", [emir]))?.n;
    const ilk = olay(emir, 'setup');
    assert.equal((await ekle(operator, 'events', ilk)).durum, 200);
    assert.deepEqual(await yansima(String(ilk['cid'])), { sonuc: 'yazildi', neden: null, emir_id: emir });
    assert.equal((await emirOku(emir)).durum, 'planli');
    assert.equal(await ayarlar(), 1);
    const yine = olay(emir, 'setup');
    assert.equal((await ekle(operator, 'events', yine)).durum, 200);
    assert.equal((await yansima(String(yine['cid'])))?.sonuc, 'eslenemedi');
    assert.equal((await ekle(operator, 'events', olay(emir, 'running'))).durum, 200);
    assert.equal((await emirOku(emir)).durum, 'basladi');
    const sonra = olay(emir, 'setup');
    assert.equal((await ekle(operator, 'events', sonra)).durum, 200);
    assert.match((await yansima(String(sonra['cid'])))?.neden ?? '', new RegExp(`^${HAZIRLIK_DEGISIKLIK_YOK}`));
    assert.equal(await ayarlar(), 1);
  });

  test('karşılığı olmayan kayıtlar yansıtılmaz ve "eslenemedi" nedeniyle saklanır; Arkon kaydı yazılır; üretim dışı türler yansıma satırı üretmez', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    await ekle(operator, 'events', olay(emir, 'running'));
    const eslenemeyen: Record<string, unknown>[] = [
      olay(emir, 'setup'), olay(emir, 'none'),
      olay(emir, 'stopped'),
      sayim(emir, 'scrap', 1),
      sayim(emir, 'scrap', 1, { reason: 'YOK-KOD' }),
      sayim(emir, 'good', 0),
      { cid: cid(), state: 'running' },
      { cid: cid(), state: 'running', pkgId: 'baska-paket-1' },
      olay(99999999, 'running'),
    ];
    for (const satir of eslenemeyen) {
      const tur = 'kind' in satir ? 'counts' : 'events';
      assert.equal((await ekle(operator, tur, satir)).durum, 200, JSON.stringify(satir));
      assert.equal(await kayitSayisi(String(satir['cid'])), 1);
      const y = await yansima(String(satir['cid']));
      assert.equal(y?.sonuc, 'eslenemedi', JSON.stringify(satir));
      assert.ok((y?.neden ?? '').length > 0, JSON.stringify(satir));
    }
    const e = await emirOku(emir);
    assert.deepEqual([e.durum, e.canli?.saglam, e.canli?.hurda], ['basladi', 0, 0]);
    const calls = { cid: cid(), callId: 'c1', team: 'bakim', phase: 'open' };
    assert.equal((await ekle(operator, 'calls', calls)).durum, 200);
    assert.equal(await yansima(calls.cid), null);
  });

  test('denetim #24: TMI\'ye yazılmayan sayım operatöre ret olarak döner (ekran adedi geri çevirir); sıfır sayım ve olaylar dönmez', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    await ekle(operator, 'events', olay(emir, 'running'));
    const donen = async (tur: string, satir: Record<string, unknown>) => {
      const c = await istek<{ reddedilen: { cid: string; ileti: string }[] }>(operator, 'POST', `/arkon/kayitlar/${tur}/ekle`, { satirlar: [satir], kaynak: 'y1' });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return c.govde.reddedilen.filter((r) => r.cid === satir['cid']);
    };
    const nedensiz = sayim(emir, 'scrap', 1);
    const r1 = await donen('counts', nedensiz);
    assert.equal(r1.length, 1, 'nedensiz hurda TMI\'ye yazılmadı: operatör bilmeli');
    assert.match(r1[0]!.ileti, /Hurda nedeni yok/);
    assert.equal((await donen('counts', sayim(emir, 'scrap', 1, { reason: 'YOK-KOD' }))).length, 1, 'TMI\'de olmayan neden');
    assert.deepEqual(await donen('counts', sayim(emir, 'good', 0)), [], 'sıfır sayım beklenen eşlenemezdir');
    assert.deepEqual(await donen('events', olay(emir, 'setup')), [], 'eşlenemeyen olay ret değildir');
    assert.equal((await yansima(String(nedensiz['cid'])))?.sonuc, 'eslenemedi', 'yansıma satırı aynı kalır');
  });

  test('denetim #24 (gecikmeli): sonradan TMI\'ye yazılamayan sayım tablet akışına "$tmiRet" iletisiyle döner; o isteğin cevabında yoktur', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const s = sayim(emir, 'scrap', 1, { reason: 'YOK-KOD' });
    const ilk = await istek<{ reddedilen: { cid: string }[] }>(operator, 'POST', '/arkon/kayitlar/counts/ekle', { satirlar: [s], kaynak: 'y1' });
    assert.deepEqual([ilk.durum, ilk.govde.reddedilen], [200, []], 'planlı emre sayım bekler');
    assert.equal((await yansima(String(s['cid'])))?.sonuc, 'bekliyor');
    const son = (await vt().tek<{ n: number }>('SELECT coalesce(max(id), 0)::float8 AS n FROM arkon_ileti'))?.n ?? 0;
    const baslat = await istek<{ reddedilen: { cid: string }[] }>(operator, 'POST', '/arkon/kayitlar/events/ekle', { satirlar: [olay(emir, 'running')], kaynak: 'y1' });
    assert.equal(baslat.durum, 200, JSON.stringify(baslat.govde));
    assert.equal((await yansima(String(s['cid'])))?.sonuc, 'eslenemedi');
    assert.deepEqual(baslat.govde.reddedilen.filter((r) => r.cid === s['cid']), [], 'başka isteğin kaydı bu cevaba girmez');
    const iletiler = (await vt().sorgu<{ govde: Record<string, unknown> }>("SELECT govde FROM arkon_ileti WHERE id > $1 AND govde->>'type' = '$tmiRet'", [son]))
      .map((r) => r.govde);
    assert.equal(iletiler.length, 1, JSON.stringify(iletiler));
    const m = iletiler[0]!;
    assert.deepEqual([m['kind'], m['cid'], (m['row'] as Record<string, unknown>)['delta'], (m['row'] as Record<string, unknown>)['pkgId']], ['counts', s['cid'], 1, pk(emir)]);
    assert.match(String(m['ileti']), /Hurda nedeni TMI'de yok/);
  });

  test('kuyruğa alma (queued) duraklatmadır: çalışan emir duraklar ve istasyon yeni emri başlatır; çalışmayan emirde TMI değişmez, kayıt "eslenemedi" olur', async () => {
    await yeniIstasyon();
    const eski = await emirAc();
    const yeni = await emirAc();
    assert.equal((await ekle(operator, 'events', olay(eski, 'running'))).durum, 200);
    // Karşı örnek: kuyruğa almadan aynı istasyonda ikinci emir başlamaz.
    const erken = olay(yeni, 'running');
    await ekle(operator, 'events', erken);
    assert.equal((await yansima(String(erken['cid'])))?.sonuc, 'reddedildi');
    const kuyruk = olay(eski, 'queued');
    assert.equal((await ekle(operator, 'events', kuyruk)).durum, 200);
    assert.equal((await yansima(String(kuyruk['cid'])))?.sonuc, 'yazildi');
    const basla = olay(yeni, 'running');
    await ekle(operator, 'events', basla);
    assert.equal((await yansima(String(basla['cid'])))?.sonuc, 'yazildi', 'duraklamış emir istasyonu kilitlemez');
    assert.equal((await emirOku(yeni)).durum, 'basladi');
    // Zaten duraklamış emir yeniden kuyruğa alınınca TMI'de değişiklik yok: ret sayılmaz.
    const ikinci = olay(eski, 'queued');
    await ekle(operator, 'events', ikinci);
    const y = await yansima(String(ikinci['cid']));
    assert.equal(y?.sonuc, 'eslenemedi');
    assert.ok((y?.neden ?? '').startsWith(KUYRUK_DEGISIKLIK_YOK), y?.neden ?? '');
    // Yetki reddi değişiklik yok sayılmaz: terminal.uret olmayan kişinin kuyruğa alması "reddedildi" olur.
    const yetkisizKuyruk = olay(yeni, 'queued');
    await ekle(yetkisiz, 'events', yetkisizKuyruk);
    assert.equal((await yansima(String(yetkisizKuyruk['cid'])))?.sonuc, 'reddedildi');
    assert.equal((await emirOku(yeni)).durum, 'basladi');
  });

  test('iş değiştirme (TA1): ekranın gönderdiği sırayla, eski işin duraklatması ve yeni işin başlatması ikisi de yazılır; duraklatmasız geçiş reddedilir', async () => {
    await yeniIstasyon();
    const eski = await emirAc();
    const yeni = await emirAc();
    assert.equal((await ekle(operator, 'events', olay(eski, 'running'))).durum, 200);
    // Karşı örnek (tarayıcıda görülen): eski iş çalışırken yeni işin başlatılması reddedilir.
    const erken = olay(yeni, 'running');
    await ekle(operator, 'events', erken);
    assert.equal((await yansima(String(erken['cid'])))?.sonuc, 'reddedildi');
    // Ekranın iş değiştirmede gönderdiği sıra: eski iş paused, yeni iş queued (eşlenemez), sonra running.
    const dur = olay(eski, 'paused');
    await ekle(operator, 'events', dur);
    assert.equal((await yansima(String(dur['cid'])))?.sonuc, 'yazildi');
    await ekle(operator, 'events', olay(yeni, 'queued'));
    const basla = olay(yeni, 'running');
    await ekle(operator, 'events', basla);
    assert.equal((await yansima(String(basla['cid'])))?.sonuc, 'yazildi');
    assert.deepEqual([(await emirOku(eski)).durum, (await emirOku(yeni)).durum], ['basladi', 'basladi']);
  });

  test('TMI reddederse Arkon kaydı yazılı kalır ve yansıma "reddedildi" nedeniyle saklanır', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    await ekle(operator, 'events', olay(emir, 'running'));
    // başkasının başlattığı emri tekrar başlatmak: ret (duruma göre devam denenir ve çalışıyorken reddedilir)
    const yine = olay(emir, 'running');
    assert.equal((await ekle(digerOperator, 'events', yine)).durum, 200);
    assert.equal((await yansima(String(yine['cid'])))?.sonuc, 'reddedildi');
    assert.equal((await emirOku(emir)).durum, 'basladi');
    // bitmiş emre sayım: durum kuralı reddeder
    await ekle(operator, 'events', olay(emir, 'done'));
    const gec = sayim(emir, 'good', 1);
    await ekle(operator, 'counts', gec);
    assert.equal((await yansima(String(gec['cid'])))?.sonuc, 'reddedildi');
  });

  test('başlamadan gelen sayım reddedilmez, bekler: başlama kaydı gelince öne alınır ve sayım ardından yazılır (sayı eksik kalmaz)', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const s1 = sayim(emir, 'good', 3);
    const s2 = sayim(emir, 'scrap', 1, { reason: hurdaKodu });
    assert.equal((await ekle(operator, 'counts', s1)).durum, 200);
    assert.equal((await ekle(operator, 'counts', s2)).durum, 200);
    assert.equal(await kayitSayisi(String(s1['cid'])), 1);
    assert.deepEqual(await yansima(String(s1['cid'])), { sonuc: 'bekliyor', neden: null, emir_id: emir });
    assert.equal((await yansimaAyrinti(String(s1['cid'])))?.son_hata, SAYIM_ERTELEME);
    assert.equal((await emirOku(emir)).canli ?? null, null, 'planlı emre sayım yazılmaz');
    const basla = olay(emir, 'running');
    assert.equal((await ekle(operator, 'events', basla)).durum, 200);
    for (const k of [basla, s1, s2]) assert.equal((await yansima(String(k['cid'])))?.sonuc, 'yazildi', String(k['cid']));
    await ilkParcaOnay(emir);
    const e = await emirOku(emir);
    assert.deepEqual([e.durum, e.canli?.saglam, e.canli?.hurda], ['basladi', 3, 1]);
  });

  test('başlamayan emre sayım yazılmaz: başlama kaydı gelmezse bekler; ardındaki olay tıkanmaz (planlı emre duraklatma reddedilir), bitmiş emre sayım reddedilir', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const s1 = sayim(emir, 'good', 4);
    assert.equal((await ekle(operator, 'counts', s1)).durum, 200);
    const dur = olay(emir, 'paused');
    assert.equal((await ekle(operator, 'events', dur)).durum, 200);
    await denemeyeHazirla();
    await tetikle();
    assert.equal((await yansima(String(s1['cid'])))?.sonuc, 'bekliyor');
    assert.equal((await yansima(String(dur['cid'])))?.sonuc, 'reddedildi', 'ertelenmiş sayım ardındaki olayı bekletmez');
    assert.equal((await emirOku(emir)).durum, 'planli');
    // başlatılıp bitirilen emre gelen yeni sayım TMI durum kuralıyla reddedilir (ertelenmez)
    const emir2 = await emirAc();
    await ekle(operator, 'events', olay(emir2, 'running'));
    await ekle(operator, 'events', olay(emir2, 'done'));
    const gec = sayim(emir2, 'good', 1);
    await ekle(operator, 'counts', gec);
    assert.equal((await yansima(String(gec['cid'])))?.sonuc, 'reddedildi');
  });

  test('ertelenen sayım olayları biriktirmez ve sırası korunur: sayım bekler, olaylar işlenir; başlama yazılınca bekleyen sayımlar kayıt sırasıyla yazılır', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const arti = sayim(emir, 'good', 4);
    const erkenDur = olay(emir, 'paused');
    for (const [tur, k] of [['counts', arti], ['events', erkenDur]] as const) assert.equal((await ekle(operator, tur, k)).durum, 200);
    assert.equal((await yansima(String(arti['cid'])))?.sonuc, 'bekliyor');
    assert.equal((await yansima(String(erkenDur['cid'])))?.sonuc, 'reddedildi');
    // Eksi düzeltme de bekler; başlama gelince ikisi kayıt sırasıyla yazılır (düzeltme önce yazılsaydı sağlam sıfırın altına inerdi).
    const eksi = sayim(emir, 'good', -3);
    assert.equal((await ekle(operator, 'counts', eksi)).durum, 200);
    assert.equal((await yansima(String(eksi['cid'])))?.sonuc, 'bekliyor');
    // Başlamadan önceki duraklatma ve başlama tek istekte: başlama öne alınamaz (önünde olay var), bekleyen sayımlar başlamadan hemen sonra yazılır.
    const ara = olay(emir, 'paused');
    const basla = olay(emir, 'running');
    const ikili = await istek<{ eklenen: number }>(operator, 'POST', '/arkon/kayitlar/events/ekle', { satirlar: [ara, basla], kaynak: 'y1' });
    assert.equal(ikili.durum, 200);
    assert.equal((await yansima(String(ara['cid'])))?.sonuc, 'reddedildi');
    const dur = olay(emir, 'paused');
    assert.equal((await ekle(operator, 'events', dur)).durum, 200);
    for (const k of [basla, arti, eksi, dur]) assert.equal((await yansima(String(k['cid'])))?.sonuc, 'yazildi', String(k['cid']));
    const e = await emirOku(emir);
    assert.deepEqual([e.durum, e.canli?.saglam], ['basladi', 0], 'ilk parça onayına kadar sağlam yok');
    assert.equal(await onayliSaglam(emir), 1);
  });

  test('TMI\'ye yazılamayanlar listesi (#243): arkon.yansima-oku ile yazılan dışındaki yansımalar, emir ve neden (kişi yok); süzgeç ve sayfa; işlemsiz kişiye 403', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const yazilan = olay(emir, 'running');
    const eslenmeyen = olay(emir, 'stopped');
    const reddedilen = olay(emir, 'paused');
    for (const k of [yazilan, eslenmeyen]) assert.equal((await ekle(operator, 'events', k)).durum, 200);
    assert.equal((await ekle(yetkisiz, 'events', reddedilen)).durum, 200);
    const izleyici = await kisiKur('izleyici1', ['arkon.yansima-oku']);
    type Liste = { satirlar: (Record<string, unknown> & { sonuc: string; neden: string | null; emirId: number | null; kayit: { cid: string; tur: string } })[]; toplam: number | null; sayfa: number; sayfaBoyu: number };
    const liste = await istek<Liste>(izleyici, 'GET', '/arkon/tmi-yansimalari?sayfaBoyu=200');
    assert.equal(liste.durum, 200, JSON.stringify(liste.govde));
    const bul = (cid: unknown) => liste.govde.satirlar.find((x) => x.kayit.cid === cid);
    assert.equal(bul(yazilan['cid']), undefined, 'yazılan listede yok');
    assert.deepEqual([bul(eslenmeyen['cid'])?.sonuc, bul(eslenmeyen['cid'])?.emirId], ['eslenemedi', null]);
    const r = bul(reddedilen['cid']);
    assert.equal(r?.sonuc, 'reddedildi');
    assert.equal(r.emirId, emir);
    assert.ok((r.neden ?? '').length > 0);
    assert.ok(!('kisi' in r) && !('sonHata' in r), 'kişi ve iç hata özeti dönmez');
    assert.equal(r.kayit.tur, 'events');
    const sadece = await istek<Liste>(izleyici, 'GET', '/arkon/tmi-yansimalari?sonuc=reddedildi&sayfaBoyu=200');
    assert.ok(sadece.govde.satirlar.length > 0 && sadece.govde.satirlar.every((x) => x.sonuc === 'reddedildi'));
    const sayfali = await istek<Liste>(izleyici, 'GET', '/arkon/tmi-yansimalari?sayfaBoyu=1&sayfa=2');
    assert.deepEqual([sayfali.govde.satirlar.length, sayfali.govde.sayfa, sayfali.govde.sayfaBoyu], [1, 2, 1]);
    assert.equal(sayfali.govde.toplam, liste.govde.toplam);
    assert.equal((await istek(izleyici, 'GET', '/arkon/tmi-yansimalari?sonuc=yazildi')).durum, 400);
    assert.equal((await istek(operator, 'GET', '/arkon/tmi-yansimalari')).durum, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/arkon/tmi-yansimalari' })).statusCode, 401);
  });

  test('TMI\'ye yazılamayanlar listesinde veri kapsamı (#243): kısıtlı kişi yalnız kendi iş merkezinin kayıtlarını görür, sayı da süzülür; bekleyende iç hata yerine kullanıcı nedeni', async () => {
    await yeniIstasyon();
    const benimMerkez = merkezId;
    const benimKod = istasyonKodu;
    const benim = await emirAc();
    await yeniIstasyon();
    const baskaKod = istasyonKodu;
    const baskasi = await emirAc();
    const kendi = sayim(benim, 'good', 2, { machine: benimKod });
    const yabanci = sayim(baskasi, 'good', 3, { machine: baskaKod });
    const konumsuz = olay(benim, 'none');
    for (const k of [kendi, yabanci]) assert.equal((await ekle(operator, 'counts', k)).durum, 200);
    assert.equal((await ekle(operator, 'events', konumsuz)).durum, 200);
    const kisitli = await kisiKur('izleyici2', ['arkon.yansima-oku']);
    const kisi = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'izleyici2'");
    assert.equal((await istek(yonetici, 'POST', `/kisi-is-merkezleri/${kisi?.id}/belirle`, { isMerkeziIdleri: [benimMerkez] })).durum, 200);
    type Liste = { satirlar: (Record<string, unknown> & { sonuc: string; neden: string | null; kayit: { cid: string } })[]; toplam: number | null };
    const cidler = (l: Liste) => l.satirlar.map((x) => x.kayit.cid);
    // Bekleyen ve kurulum satırı varsayılan olarak gizlenir (TA2); kapsam gizlenenler gösterilince de aynıdır.
    const dar = (await istek<Liste>(kisitli, 'GET', '/arkon/tmi-yansimalari?sayfaBoyu=200&gizlenenler=true')).govde;
    assert.ok(cidler(dar).includes(String(kendi['cid'])));
    assert.ok(!cidler(dar).includes(String(yabanci['cid'])), 'kapsam dışı iş merkezinin kaydı görünmez');
    assert.ok(!cidler(dar).includes(String(konumsuz['cid'])), 'konumsuz kayıt kısıtlı kişiye görünmez');
    assert.equal(dar.toplam, dar.satirlar.length, 'sayı da süzülür');
    const bekleyen = dar.satirlar.find((x) => x.kayit.cid === kendi['cid']);
    assert.deepEqual([bekleyen?.sonuc, bekleyen?.neden], ['bekliyor', SAYIM_ERTELEME]);
    assert.ok(bekleyen && !('kisi' in bekleyen) && !('sonHata' in bekleyen));
    // Karşı örnek: kapsamsız kişi üçünü de görür.
    const genis = (await istek<Liste>(yonetici, 'GET', '/arkon/tmi-yansimalari?sayfaBoyu=200&gizlenenler=true')).govde;
    for (const k of [kendi, yabanci, konumsuz]) assert.ok(cidler(genis).includes(String(k['cid'])), String(k['cid']));
  });

  test('TMI\'ye yazılamayanlar ayıklanır (TA2): beklenen türler varsayılan olarak listede yok, tür başına sayılır; gösterilince türüyle gelir, tabloda durur', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const planli = await emirAc();
    await yeniIstasyon();
    const bitecek = await emirAc();
    const izleyici = await kisiKur('izleyici3', ['arkon.yansima-oku']);
    type Liste = {
      satirlar: { sonuc: string; neden: string | null; gizliTur: string | null; kayit: { cid: string } }[]; toplam: number | null;
      gizlenenler: { kod: string; ad: string; adet: number }[];
    };
    const oku = async (ek = '') => (await istek<Liste>(izleyici, 'GET', `/arkon/tmi-yansimalari?sayfaBoyu=200${ek}`)).govde;
    const once = await oku();
    assert.deepEqual(once.gizlenenler.map((g) => g.kod), GIZLI_YANSIMA_TURLERI.map((t) => t.kod), 'her tür sayısıyla, sıfır da olsa');
    await ekle(operator, 'events', olay(emir, 'running'));
    await ekle(operator, 'events', olay(bitecek, 'running'));
    await ekle(operator, 'events', olay(bitecek, 'done'));
    const gizliler: [Record<string, unknown>, string, string][] = [
      [olay(emir, 'setup'), 'events', 'kurulum-bosta'],
      [olay(emir, 'none'), 'events', 'kurulum-bosta'],
      [olay(emir, 'running'), 'events', 'zaten-calisiyor'],
      [sayim(emir, 'good', 0), 'counts', 'sifir-sayim'],
      [olay(bitecek, 'queued'), 'events', 'kuyruk-degisiklik-yok'],
      [olay(bitecek, 'done'), 'events', 'zaten-bitmis'],
      [sayim(planli, 'good', 2), 'counts', 'bekliyor'],
    ];
    for (const [k, tur] of gizliler) assert.equal((await ekle(operator, tur, k)).durum, 200);
    // Görünür kalanlar: yetki reddi ve nedensiz duruş.
    const yetki = olay(emir, 'paused');
    await ekle(yetkisiz, 'events', yetki);
    const nedensiz = olay(emir, 'stopped');
    await ekle(operator, 'events', nedensiz);
    const sonra = await oku();
    const cidler = sonra.satirlar.map((x) => x.kayit.cid);
    for (const [k, , kod] of gizliler) assert.ok(!cidler.includes(String(k['cid'])), `${kod} gizli`);
    for (const k of [yetki, nedensiz]) assert.ok(cidler.includes(String(k['cid'])), 'görünür satır listede');
    assert.ok(sonra.satirlar.every((x) => x.gizliTur === null));
    const fark = (kod: string) => (sonra.gizlenenler.find((g) => g.kod === kod)?.adet ?? 0) - (once.gizlenenler.find((g) => g.kod === kod)?.adet ?? 0);
    for (const kod of new Set(gizliler.map(([, , kod]) => kod))) assert.equal(fark(kod), gizliler.filter(([, , g]) => g === kod).length, kod);
    assert.equal(sonra.toplam, sonra.satirlar.length);
    // Gösterilince gizli satırlar türünün adıyla gelir; tür SQL'de ve kuraldaki işlevde aynıdır. Satırlar silinmemiştir.
    const tumu = await oku('&gizlenenler=true');
    const adlar = new Map(GIZLI_YANSIMA_TURLERI.map((t) => [t.kod, t.ad]));
    for (const [k, , kod] of gizliler) {
      const satir = tumu.satirlar.find((x) => x.kayit.cid === k['cid']);
      assert.equal(satir?.gizliTur, adlar.get(kod), kod);
      const ham = await yansimaAyrinti(String(k['cid']));
      assert.equal(gizliYansimaTuru(ham?.sonuc ?? '', ham?.neden ?? null), kod, kod);
    }
    assert.deepEqual(tumu.gizlenenler, sonra.gizlenenler, 'sayılar gösterme seçiminden bağımsız');
    assert.equal(tumu.toplam, (sonra.toplam ?? 0) + sonra.gizlenenler.reduce((t, g) => t + g.adet, 0));
    // Durum süzgeci sayılara da uygulanır.
    const bekleyen = await oku('&sonuc=bekliyor');
    assert.equal(bekleyen.satirlar.length, 0);
    assert.ok(bekleyen.gizlenenler.every((g) => g.kod === 'bekliyor' || g.adet === 0));
  });

  test('bitmiş emre yeniden gelen bitirme (T2) ret değildir: "eslenemedi" ve emir değişmez; başlamamış emre bitirme yine "reddedildi"', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    await ekle(operator, 'events', olay(emir, 'running'));
    const ilk = olay(emir, 'done');
    await ekle(operator, 'events', ilk);
    assert.equal((await yansima(String(ilk['cid'])))?.sonuc, 'yazildi');
    const bitis = (await emirOku(emir)).bitis;
    const yine = olay(emir, 'done');
    assert.equal((await ekle(operator, 'events', yine)).durum, 200);
    assert.deepEqual(await yansima(String(yine['cid'])), { sonuc: 'eslenemedi', neden: BITMIS_BITIR, emir_id: emir });
    const e = await emirOku(emir);
    assert.deepEqual([e.durum, e.bitis], ['bitti', bitis]);
    // Karşı örnek: planlı emre bitirme TMI durum kuralıyla reddedilir.
    const planli = await emirAc();
    const erken = olay(planli, 'done');
    await ekle(operator, 'events', erken);
    assert.equal((await yansima(String(erken['cid'])))?.sonuc, 'reddedildi');
    assert.equal((await emirOku(planli)).durum, 'planli');
  });

  test('yetki yalnız oturumdan: terminal.uret yoksa yansıma "reddedildi: yetki" olur ve Arkon kaydı yazılır; istemcinin kişi alanı yansımayı etkilemez', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const r = olay(emir, 'running', { userId: String(yoneticiId), userName: 'Deneme Yönetici', by: 'Deneme Yönetici' });
    assert.equal((await ekle(yetkisiz, 'events', r)).durum, 200);
    assert.equal(await kayitSayisi(String(r['cid'])), 1);
    const y = await yansima(String(r['cid']));
    assert.equal(y?.sonuc, 'reddedildi');
    assert.match(y?.neden ?? '', /yetki/i);
    assert.equal((await emirOku(emir)).durum, 'planli');
    // aynı olay yetkili kişiyle kabul
    const k = olay(emir, 'running', { userId: String(yoneticiId), userName: 'Deneme Yönetici', by: 'Deneme Yönetici' });
    assert.equal((await ekle(operator, 'events', k)).durum, 200);
    assert.equal((await yansima(String(k['cid'])))?.sonuc, 'yazildi');
    assert.equal((await emirOku(emir)).durum, 'basladi');
    // TMI kaydındaki kişi oturumdaki kişidir
    // gövdede başkasının kimliği olsa da TMI kaydındaki kişi oturumdaki kişidir (TMI ucunun cevabından okunur)
    const kayitlar = (await istek<EmirAyrintiCevabi>(yonetici, 'GET', `/uretim-emirleri/${emir}`)).govde.kayitlar;
    assert.ok(kayitlar.length > 0);
    assert.deepEqual([...new Set(kayitlar.map((x) => x.kisi.ad))], ['Deneme op1']);
  });

  test('yinelenen kayıt TMI\'yi ikinci kez çağırmaz; eşzamanlı aynı kayıt tek yansıma ve tek sayım üretir', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    await ekle(operator, 'events', olay(emir, 'running'));
    const s = sayim(emir, 'good', 2);
    assert.equal((await ekle(operator, 'counts', s)).govde.eklenen, 1);
    assert.equal((await ekle(operator, 'counts', s)).govde.eklenen, 0);
    assert.equal(await onayliSaglam(emir), 2);
    const e = olay(emir, 'paused');
    assert.equal((await ekle(operator, 'events', e)).govde.eklenen, 1);
    assert.equal((await ekle(operator, 'events', e)).govde.eklenen, 0);
    // çalışırken eşzamanlı aynı sayım: tek yansıma
    await ekle(operator, 'events', olay(emir, 'running'));
    const es = sayim(emir, 'good', 3);
    const cevaplar = await Promise.all(Array.from({ length: 6 }, () => ekle(operator, 'counts', es)));
    assert.equal(cevaplar.reduce((t, c) => t + (c.govde.eklenen ?? 0), 0), 1);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id WHERE k.cid = $1', [es['cid']]))?.n, 1);
    assert.equal((await emirOku(emir)).canli?.saglam, 5);
  });

  // TMI tarafında hata (kural reddi değil) üretmek için test tetikleyicisi: verilen tabloya yazım, koşul sağlanınca hata fırlatır. Varsayılan kod
  // serileştirmedir (geçici, sınırsız denenir); "hatali"ya düşmesi gereken testler geçici olmayan P0001 verir.
  // AFTER: satır yazıldıktan SONRA hata (TMI yazdı ama komut cevap veremedi durumu).
  async function hataTetikleyicisiKur(
    ad: string, tablo: string, kosul: string, hataKodu = '40001', mesaj = "'deneme: gecici hata'", an: 'BEFORE' | 'AFTER' = 'BEFORE',
  ): Promise<() => Promise<void>> {
    await ortam?.sahip.sorgu(`CREATE OR REPLACE FUNCTION ${ad}() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN IF ${kosul} THEN RAISE EXCEPTION ${mesaj} USING ERRCODE = '${hataKodu}'; END IF; RETURN NEW; END $f$`);
    await ortam?.sahip.sorgu(`CREATE TRIGGER ${ad} ${an} INSERT ON ${tablo} FOR EACH ROW EXECUTE FUNCTION ${ad}()`);
    return async () => { await ortam?.sahip.sorgu(`DROP TRIGGER ${ad} ON ${tablo}`); };
  }
  // Yeniden deneme aralığını beklemeden denenebilir yap (aralık denemeyle uzar).
  const denemeyeHazirla = () => vt().sorgu("UPDATE arkon_tmi_yansima SET son_deneme = now() - interval '2 hours' WHERE sonuc = 'bekliyor'");
  // Başka emirlerin birikmişini istek değil arka plan işi işler (KD-007); tetik o işin tek turudur.
  const tetikle = async (): Promise<string> => {
    const is = isler.find((i) => i.ad === 'arkon-yansima-yineleyici');
    if (is === undefined) throw new Error('iş yok');
    return isiBirKezCalistir(vt(), is);
  };
  const yansimaAyrinti = async (c: string) => vt().tek<{ sonuc: string; neden: string | null; deneme: number; son_hata: string | null; kisi_id: number }>(
    'SELECT y.sonuc, y.neden, y.deneme, y.son_hata, y.kisi_id FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id WHERE k.cid = $1', [c]);

  test('geçici hata: istek 200, Arkon kaydı durur, yansıma "bekliyor"; hata kalkınca sonraki istek yansımayı yazar ve sayım tam bir kez yazılır', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    await ekle(operator, 'events', olay(emir, 'running'));
    const kaldir = await hataTetikleyicisiKur('yansima_gecici', 'uretim_sayimi', 'NEW.adet = 123');
    const tetik = sayim(emir, 'good', 123);
    try {
      assert.equal((await ekle(operator, 'counts', tetik)).durum, 200);
      assert.equal(await kayitSayisi(String(tetik['cid'])), 1);
      const y = await yansimaAyrinti(String(tetik['cid']));
      assert.deepEqual([y?.sonuc, y?.deneme, y?.kisi_id], ['bekliyor', 1, operatorId]);
      assert.match(y?.son_hata ?? '', /gecici hata/);
      assert.equal((await emirOku(emir)).canli?.saglam, 0);
      // aralık dolmadan yeniden denenmez
      await tetikle();
      assert.equal((await yansimaAyrinti(String(tetik['cid'])))?.deneme, 1);
    } finally {
      await kaldir();
    }
    await denemeyeHazirla();
    assert.equal(await tetikle(), 'tamam');
    assert.deepEqual((await yansimaAyrinti(String(tetik['cid'])))?.sonuc, 'yazildi');
    assert.equal(await onayliSaglam(emir), 123);
    await denemeyeHazirla();
    await tetikle();
    assert.equal((await emirOku(emir)).canli?.saglam, 123, 'ikinci kez yazılmaz');
  });

  test('eşzamanlı işleyiciler aynı bekleyen satırı iki kez yazmaz', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    await ekle(operator, 'events', olay(emir, 'running'));
    const kaldir = await hataTetikleyicisiKur('yansima_gecici2', 'uretim_sayimi', 'NEW.adet = 124');
    const bekleyen = sayim(emir, 'good', 124);
    try {
      assert.equal((await ekle(operator, 'counts', bekleyen)).durum, 200);
    } finally {
      await kaldir();
    }
    await denemeyeHazirla();
    // Arka plan turu ve aynı emrin kendi istekleri aynı satırı birlikte işlemeye çalışır.
    const [turlar, istekler] = await Promise.all([
      Promise.all(Array.from({ length: 4 }, () => tetikle())),
      Promise.all(Array.from({ length: 4 }, () => ekle(operator, 'events', olay(emir, 'running')))),
    ]);
    for (const x of turlar) assert.notEqual(x, 'bekliyor');
    for (const x of istekler) assert.equal(x.durum, 200);
    assert.equal((await yansimaAyrinti(String(bekleyen['cid'])))?.sonuc, 'yazildi');
    assert.equal(await onayliSaglam(emir), 124);
  });

  test('sıra korunur: bekleyen başlat varken sonraki sayım önce yazılmaz; hata kalkınca ikisi sırayla yazılır', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const kaldir = await hataTetikleyicisiKur('yansima_gecici3', 'uretim_kaydi', `NEW.emir_id = ${emir}`);
    const baslat = olay(emir, 'running');
    const sayimi = sayim(emir, 'good', 9);
    try {
      assert.equal((await ekle(operator, 'events', baslat)).durum, 200);
      assert.equal((await ekle(operator, 'counts', sayimi)).durum, 200);
      await denemeyeHazirla();
      await tetikle();
      assert.equal((await yansimaAyrinti(String(baslat['cid'])))?.sonuc, 'bekliyor');
      assert.equal((await yansimaAyrinti(String(sayimi['cid'])))?.sonuc, 'bekliyor');
      assert.equal((await yansimaAyrinti(String(sayimi['cid'])))?.deneme, 0, 'öndeki bekliyorken sonraki denenmez');
      assert.equal((await emirOku(emir)).durum, 'planli');
    } finally {
      await kaldir();
    }
    await denemeyeHazirla();
    await tetikle();
    assert.equal((await yansimaAyrinti(String(baslat['cid'])))?.sonuc, 'yazildi');
    assert.equal((await yansimaAyrinti(String(sayimi['cid'])))?.sonuc, 'yazildi');
    await ilkParcaOnay(emir);
    const e = await emirOku(emir);
    assert.deepEqual([e.durum, e.canli?.saglam], ['basladi', 9]);
  });

  test('yeniden denemede komutu yapan kişi kayıt anındaki kişidir ve yetkisi güncel çözülür: yetkisi kalkmışsa ya da pasifse "reddedildi"', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    await ekle(operator, 'events', olay(emir, 'running'));
    const gecici = await kisiKur('op5', ['arkon.operator', 'sayfa.arkon', 'terminal.uret']);
    const gecici2 = await kisiKur('op6', ['arkon.operator', 'sayfa.arkon', 'terminal.uret']);
    const kaldir = await hataTetikleyicisiKur('yansima_gecici4', 'uretim_sayimi', 'NEW.adet IN (11, 12, 13)');
    const a = sayim(emir, 'scrap', 11, { reason: hurdaKodu });
    const b = sayim(emir, 'good', 12);
    const d = sayim(emir, 'good', 13);
    try {
      for (const [cerez, satir] of [[gecici, a], [gecici2, b], [operator, d]] as const) assert.equal((await ekle(cerez, 'counts', satir)).durum, 200);
    } finally {
      await kaldir();
    }
    // op6 artık yetkisiz, op5 yetkili kalır; yeniden denemeyi YÖNETİCİ tetikler
    const op6 = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'op6'");
    await vt().sorgu("DELETE FROM rol_islemi WHERE islem = 'terminal.uret' AND rol_id = (SELECT id FROM rol WHERE kod = 'gecici_op6')");
    await vt().sorgu('UPDATE kisi SET aktif = false WHERE id = (SELECT id FROM kisi WHERE kullanici_adi = $1)', ['op1']);
    await denemeyeHazirla();
    await tetikle();
    assert.equal((await yansimaAyrinti(String(a['cid'])))?.sonuc, 'yazildi');
    const yb = await yansimaAyrinti(String(b['cid']));
    assert.equal(yb?.sonuc, 'reddedildi');
    assert.match(yb?.neden ?? '', /yetki/i);
    const yd = await yansimaAyrinti(String(d['cid']));
    assert.equal(yd?.sonuc, 'reddedildi', 'pasifleşen kişi');
    assert.match(yd?.neden ?? '', /yetki/i);
    await vt().sorgu("UPDATE kisi SET aktif = true WHERE kullanici_adi = 'op1'");
    assert.notEqual(op6?.id, undefined);
    // TMI kaydındaki kişi, tetikleyen yönetici değil kayıt anındaki kişidir
    const kayitlar = (await istek<EmirAyrintiCevabi>(yonetici, 'GET', `/uretim-emirleri/${emir}`)).govde.kayitlar;
    assert.ok(kayitlar.some((k) => k.kisi.ad === 'Deneme op5'));
    assert.ok(kayitlar.every((k) => k.kisi.ad !== 'Deneme Yönetici'));
    const son = (await emirOku(emir)).canli;
    assert.deepEqual([son?.hurda, son?.saglam], [11, 0]);
  });

  test('sunucu yeniden başlasa da bekleyenler kaybolmaz: yeni uygulama örneği tablodaki bekleyeni işler', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    await ekle(operator, 'events', olay(emir, 'running'));
    const kaldir = await hataTetikleyicisiKur('yansima_gecici5', 'uretim_sayimi', 'NEW.adet = 125');
    const bekleyen = sayim(emir, 'good', 125);
    try {
      assert.equal((await ekle(operator, 'counts', bekleyen)).durum, 200);
    } finally {
      await kaldir();
    }
    await denemeyeHazirla();
    const ikinci = await uygulamaKur({ vt: vt(), ayar: (ortam as TestVeritabani).ayar, kimlik: kimlikCozucu(vt()), denetle: denetimYaz, tekrar: tekrarDeposu });
    try {
      // Emrin kendi yeni kaydı birikmişini işler (başka emirlerinkini arka plan işi işler).
      const r = await ikinci.inject({ method: 'POST', url: '/api/arkon/kayitlar/events/ekle', headers: { cookie: operator }, payload: { satirlar: [olay(emir, 'running')], kaynak: 'y1' } });
      assert.equal(r.statusCode, 200);
    } finally {
      await ikinci.close();
    }
    assert.equal((await yansimaAyrinti(String(bekleyen['cid'])))?.sonuc, 'yazildi');
    assert.equal(await onayliSaglam(emir), 125);
  });

  test('veri kapsamı, Arkon katmanı: kısıtlı operatör başka iş merkezinin emrine yazamaz (403, Arkon kaydı da yok); kendi emri yazılır', async () => {
    const kisitli = await kisiKur('op3', ['arkon.operator', 'sayfa.arkon', 'terminal.uret']);
    const kisitliKisi = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'op3'");
    await yeniIstasyon();
    const benimMerkez = merkezId;
    const benimKod = istasyonKodu;
    const benim = await emirAc();
    // UE20: kısıtlı kişi yalnız kendi istasyonunda yetkindir.
    await vt().sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2)', [kisitliKisi?.id, istasyonId]);
    await yeniIstasyon();
    const baskasi = await emirAc();
    const r = await istek(yonetici, 'POST', `/kisi-is-merkezleri/${kisitliKisi?.id}/belirle`, { isMerkeziIdleri: [benimMerkez] });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    // paket kimliği başka iş merkezinin emrine çözülür: Arkon kapsam denetimi yakalar
    for (const satir of [olay(baskasi, 'running'), olay(baskasi, 'running', { machine: benimKod }), olay(baskasi, 'running', { machine: benimKod, wc: 'YOK' })]) {
      assert.equal((await ekle(kisitli, 'events', satir)).durum, 403, JSON.stringify(satir));
      assert.equal(await kayitSayisi(String(satir['cid'])), 0);
    }
    assert.equal((await emirOku(baskasi)).durum, 'planli');
    const kendi = olay(benim, 'running', { machine: benimKod });
    assert.equal((await ekle(kisitli, 'events', kendi)).durum, 200);
    assert.equal((await yansima(String(kendi['cid'])))?.sonuc, 'yazildi');
    assert.equal((await emirOku(benim)).durum, 'basladi');
  });

  test('KD-003: paket listesi açık emrin paketi için emir okumaz, kapanmış emirlerin durumunu tek sorguda okur; taslak pakete yazımda kapsam bütün açık emirleri kurmadan çözülür', async () => {
    const sayimli = (db: Db, sayilan: { sql: string; p: readonly unknown[] }[]): Db => ({
      sorgu: (sql, p) => { sayilan.push({ sql, p: p ?? [] }); return db.sorgu(sql, p); },
      tek: (sql, p) => { sayilan.push({ sql, p: p ?? [] }); return db.tek(sql, p); },
    } as Db);
    await yeniIstasyon();
    const benimMerkez = merkezId;
    const benimKod = istasyonKodu;
    const acik1 = await emirAc();
    const acik2 = await emirAc();
    const iptal = await emirAc();
    const iptal2 = await emirAc();
    for (const id of [acik1, acik2, iptal, iptal2]) {
      const y = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(id)}/yaz`, { taban: 0, govde: { id: pk(id), status: 'draft', machine: benimKod }, kaynak: 'k3' });
      assert.equal(y.durum, 200, JSON.stringify(y.govde));
    }
    for (const id of [iptal, iptal2]) await iptalYaz(id);
    const yon = { id: yoneticiId, ad: 'Deneme Yönetici', islemler: ['arkon.yonetici'] as never };
    const okunan: { sql: string; p: readonly unknown[] }[] = [];
    const liste = (await vt().tx((db) => belgeler(sayimli(db, okunan), yon, 'pkgs'))).map((b) => b.kimlik);
    assert.ok(liste.includes(pk(acik1)) && liste.includes(pk(acik2)) && !liste.includes(pk(iptal)) && !liste.includes(pk(iptal2)));
    const tekTek = okunan.filter((q) => /FROM uretim_emri e WHERE e\.id = \$1/.test(q.sql)).map((q) => q.p[0]);
    assert.deepEqual(tekTek, [], `emir tek tek okundu: ${tekTek.join(',')}`);
    const toplu = okunan.filter((q) => /FROM uretim_emri WHERE id = ANY/.test(q.sql));
    assert.equal(toplu.length, 1, 'kapanmış emirlerin durumu tek sorguda okunmalı');
    const sorulan = (toplu[0]?.p[0] ?? []) as number[];
    assert.ok(sorulan.includes(iptal) && sorulan.includes(iptal2), `kapanmış emirler sorulmalı: ${sorulan.join(',')}`);
    assert.ok(!sorulan.includes(acik1) && !sorulan.includes(acik2), `açık emir soruldu: ${sorulan.join(',')}`);

    await kisiKur('pl3', ['arkon.planlama', 'sayfa.arkon']);
    const pl = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'pl3'");
    assert.equal((await istek(yonetici, 'POST', `/kisi-is-merkezleri/${pl?.id}/belirle`, { isMerkeziIdleri: [benimMerkez] })).durum, 200);
    const planci = { id: pl?.id ?? 0, ad: 'Deneme pl3', islemler: ['arkon.planlama'] as never };
    const taslak = await emirAc();
    await yeniIstasyon();
    const baskaTaslak = await emirAc();
    const yazilan: { sql: string; p: readonly unknown[] }[] = [];
    const cevap = await vt().tx((db) => belgeYaz(sayimli(db, yazilan), planci, 'pkgs', pk(taslak), { taban: 0, govde: { id: pk(taslak), status: 'draft', machine: benimKod }, kaynak: 'k3' }));
    assert.equal(cevap.sonuc, 'yazildi');
    const listeleme = yazilan.filter((q) => /FROM uretim_emri/.test(q.sql) && !/e\.id = \$1/.test(q.sql));
    assert.deepEqual(listeleme.map((q) => q.sql), [], 'taslak pakete yazım açık emirleri listelememeli');
    await assert.rejects(
      vt().tx((db) => belgeYaz(db, planci, 'pkgs', pk(baskaTaslak), { taban: 0, govde: { id: pk(baskaTaslak), status: 'draft', machine: benimKod }, kaynak: 'k3' })),
      (h: { durum?: number }) => h.durum === 403,
    );
    await assert.rejects(vt().tx((db) => belgeSil(db, planci, 'pkgs', pk(baskaTaslak), { kaynak: 'k3', taban: 0 })), (h: { durum?: number }) => h.durum === 403);
  });

  test('veri kapsamı, TMI katmanı: Arkon paketi kendi istasyonuna kayıtlı ama emir başka iş merkezindeyse Arkon kaydı yazılır, yansıma "reddedildi" olur ve emir değişmez', async () => {
    const kisitli = await kisiKur('op7', ['arkon.operator', 'sayfa.arkon', 'terminal.uret']);
    const kisi = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'op7'");
    await yeniIstasyon();
    const benimMerkez = merkezId;
    const benimKod = istasyonKodu;
    await yeniIstasyon();
    const baskasi = await emirAc();
    assert.equal((await istek(yonetici, 'POST', `/kisi-is-merkezleri/${kisi?.id}/belirle`, { isMerkeziIdleri: [benimMerkez] })).durum, 200);
    // Arkon'daki paket kaydı emri kendi istasyonunda gösterir: Arkon kapsam denetimi geçer, TMI kapsamı yakalamalıdır
    const paket = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(baskasi)}/yaz`, { taban: 0, govde: { id: pk(baskasi), machine: benimKod }, kaynak: 'y1' });
    assert.equal(paket.durum, 200, JSON.stringify(paket.govde));
    const satir = olay(baskasi, 'running', { machine: benimKod });
    assert.equal((await ekle(kisitli, 'events', satir)).durum, 200);
    assert.equal(await kayitSayisi(String(satir['cid'])), 1);
    const y = await yansima(String(satir['cid']));
    assert.equal(y?.sonuc, 'reddedildi');
    assert.ok((y?.neden ?? '').length > 0);
    assert.equal((await emirOku(baskasi)).durum, 'planli');
  });

  test('yeniden denemede GÜNCEL kapsam geçerlidir: kayıttan sonra kişinin iş merkezi kısıtı değişirse yansıma "reddedildi" olur', async () => {
    const kisitli = await kisiKur('op8', ['arkon.operator', 'sayfa.arkon', 'terminal.uret']);
    const kisi = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'op8'");
    await yeniIstasyon();
    const benimMerkez = merkezId;
    const benimKod = istasyonKodu;
    const emir = await emirAc();
    // UE20: kısıtlı kişi yalnız kendi istasyonunda yetkindir.
    await vt().sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2)', [kisi?.id, istasyonId]);
    await yeniIstasyon();
    const digerMerkez = merkezId;
    assert.equal((await istek(yonetici, 'POST', `/kisi-is-merkezleri/${kisi?.id}/belirle`, { isMerkeziIdleri: [benimMerkez] })).durum, 200);
    assert.equal((await ekle(kisitli, 'events', olay(emir, 'running', { machine: benimKod }))).durum, 200);
    const kaldir = await hataTetikleyicisiKur('yansima_kapsam', 'uretim_sayimi', "NEW.adet = 150");
    const s = sayim(emir, 'good', 150, { machine: benimKod });
    try {
      assert.equal((await ekle(kisitli, 'counts', s)).durum, 200);
    } finally {
      await kaldir();
    }
    assert.equal((await yansima(String(s['cid'])))?.sonuc, 'bekliyor');
    // Yetkinlik iş merkezi kapsamını genişlettiği için kişinin kendi istasyonundaki yetkinliği de kalkar.
    await vt().sorgu('DELETE FROM istasyonlar_yetkinlik WHERE kisi_id = $1', [kisi?.id]);
    assert.equal((await istek(yonetici, 'POST', `/kisi-is-merkezleri/${kisi?.id}/belirle`, { isMerkeziIdleri: [digerMerkez] })).durum, 200);
    await denemeyeHazirla();
    await tetikle();
    const y = await yansima(String(s['cid']));
    assert.equal(y?.sonuc, 'reddedildi');
    assert.equal((await emirOku(emir)).canli?.saglam, 0);
  });

  test('kısıttan doğan ret kayıt noktasında kalır: aynı istasyonda eşzamanlı iki emir başlatılınca biri yazılır biri reddedilir, iki Arkon kaydı da durur', async () => {
    for (let tur = 0; tur < 4; tur += 1) {
      await yeniIstasyon();
      const a = await emirAc();
      const b = await emirAc();
      const satirlar = [olay(a, 'running'), olay(b, 'running')];
      const c = await Promise.all(satirlar.map((s) => ekle(operator, 'events', s)));
      for (const x of c) assert.equal(x.durum, 200, `tur ${tur}: ${JSON.stringify(x.govde)}`);
      const sonuclar = (await Promise.all(satirlar.map((s) => yansima(String(s['cid']))))).map((y) => y?.sonuc).sort();
      assert.deepEqual(sonuclar, ['reddedildi', 'yazildi'], `tur ${tur}`);
      for (const s of satirlar) assert.equal(await kayitSayisi(String(s['cid'])), 1);
    }
  });

  test('tek seferlik sayım sınırı TMI ucundakiyle aynıdır: aşan sayım "reddedildi", sınırdaki yazılır', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    await ekle(operator, 'events', olay(emir, 'running'));
    for (const satir of [sayim(emir, 'good', 2_000_000), sayim(emir, 'good', -2_000_000), sayim(emir, 'scrap', 1_000_001, { reason: hurdaKodu })]) {
      assert.equal((await ekle(operator, satir['kind'] === 'good' || satir['kind'] === 'scrap' ? 'counts' : 'events', satir)).durum, 200);
      const y = await yansima(String(satir['cid']));
      assert.equal(y?.sonuc, 'reddedildi', JSON.stringify(satir));
      assert.match(y?.neden ?? '', /1000000/);
    }
    assert.equal((await emirOku(emir)).canli?.saglam, 0);
  });

  test('paket kimliği kanoniktir: tmi-ue-00<id> ve başka yazımlar eşlenemez', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    await ekle(operator, 'events', olay(emir, 'running'));
    for (const pkgId of [`tmi-ue-00${emir}`, `tmi-ue-${emir}x`, `TMI-UE-${emir}`, ` tmi-ue-${emir}`, `tmi-ue-+${emir}`]) {
      const s = { cid: cid(), pkgId, kind: 'good', delta: 1 };
      assert.equal((await ekle(operator, 'counts', s)).durum, 200);
      assert.equal((await yansima(s.cid))?.sonuc, 'eslenemedi', pkgId);
    }
    assert.equal((await emirOku(emir)).canli?.saglam, 0);
  });

  const topluEkle = (cerez: string, tur: string, satirlar: Record<string, unknown>[]) =>
    istek<{ eklenen: number }>(cerez, 'POST', `/arkon/kayitlar/${tur}/ekle`, { satirlar, kaynak: 'y1' });
  const bekleyenSayisi = async (emir: number): Promise<number> =>
    (await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM arkon_tmi_yansima WHERE sonuc = 'bekliyor' AND emir_id = $1", [emir]))?.n ?? -1;
  const calisanEmir = async (): Promise<number> => {
    await yeniIstasyon();
    const e = await emirAc();
    await ekle(operator, 'events', olay(e, 'running'));
    return e;
  };

  test('aynı emre eşzamanlı farklı kayıtlar: hepsi 200 ve kayıtlı, TMI sayacı toplama eşit, bekleyen kalmaz (12 tur x 3)', async () => {
    const emir = await calisanEmir();
    const cidler: string[] = [];
    for (let tur = 0; tur < 12; tur += 1) {
      const satirlar = Array.from({ length: 3 }, () => sayim(emir, 'good', 1));
      cidler.push(...satirlar.map((s) => String(s['cid'])));
      const c = await Promise.all(satirlar.map((s) => ekle(operator, 'counts', s)));
      for (const x of c) assert.equal(x.durum, 200, `tur ${tur}: ${JSON.stringify(x.govde)}`);
    }
    for (const c of cidler) assert.equal(await kayitSayisi(c), 1, c);
    assert.equal(await onayliSaglam(emir), 36);
    assert.equal(await bekleyenSayisi(emir), 0);
  });

  test('emir kilidi başka bağlantıda tutuluyorsa istek düşmez: Arkon kaydı yazılır, yansıma "bekliyor" kalır, kilit bırakılınca işlenir', async () => {
    const emir = await calisanEmir();
    const s = sayim(emir, 'good', 3);
    await vt().tx(async (db) => {
      await db.sorgu('SELECT pg_advisory_xact_lock(hashtext($1))', [`arkon-yansima-emir-${emir}`]);
      const c = await ekle(operator, 'counts', s);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      assert.equal(await kayitSayisi(String(s['cid'])), 1);
      assert.equal((await yansima(String(s['cid'])))?.sonuc, 'bekliyor');
      assert.equal((await emirOku(emir)).canli?.saglam, 0);
    });
    await tetikle();
    assert.equal((await yansima(String(s['cid'])))?.sonuc, 'yazildi');
    assert.equal(await onayliSaglam(emir), 3);
  });

  // A11 (bağlamada kapanacak): emir başına bekleme 2 sn; istek başına toplam bütçe yoksa üç kilitli emir isteği 6 sn bekletir.
  test('istek başına kilit bekleme bütçesi: üç emrin kilidi tutuluyorsa istek bütçe dolunca döner, kayıtlar yazılır ve bekliyor kalır', async () => {
    const emirler = [await calisanEmir(), await calisanEmir(), await calisanEmir()];
    const satirlar = emirler.map((e) => sayim(e, 'good', 1));
    await vt().tx(async (db) => {
      for (const e of emirler) await db.sorgu('SELECT pg_advisory_xact_lock(hashtext($1))', [`arkon-yansima-emir-${e}`]);
      const t0 = Date.now();
      const c = await istek<{ eklenen: number }>(operator, 'POST', '/arkon/kayitlar/counts/ekle', { satirlar, kaynak: 'y1' });
      const sure = Date.now() - t0;
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      assert.ok(sure < ISTEK_KILIT_BUTCESI_MS + 1500, `istek ${sure} ms bekledi`);
      for (const s of satirlar) assert.equal((await yansima(String(s['cid'])))?.sonuc, 'bekliyor');
    });
    await tetikle();
    for (const s of satirlar) assert.equal((await yansima(String(s['cid'])))?.sonuc, 'yazildi');
  });

  // A11: emrin işlemesini saran korumaliIsle doğrudan ölçülür: kayıt noktası dışındaki hata (sonuç yazımı) isteği düşürmez, TMI yazımı geri alınır.
  test('sonuç yazımı düşerse istek düşmez: Arkon kaydı yazılır, TMI yazımı geri alınır, yansıma bekliyor; hata kalkınca tam bir kez yazılır', async () => {
    const emir = await calisanEmir();
    const s = sayim(emir, 'good', 7);
    await ortam?.sahip.sorgu(`CREATE OR REPLACE FUNCTION yansima_sonuc_hatasi() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN IF NEW.sonuc = 'yazildi' THEN RAISE EXCEPTION 'deneme: sonuc yazilamadi' USING ERRCODE = 'P0001'; END IF; RETURN NEW; END $f$`);
    await ortam?.sahip.sorgu('CREATE TRIGGER yansima_sonuc_hatasi BEFORE UPDATE ON arkon_tmi_yansima FOR EACH ROW EXECUTE FUNCTION yansima_sonuc_hatasi()');
    try {
      const c = await ekle(operator, 'counts', s);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      assert.equal(await kayitSayisi(String(s['cid'])), 1);
      assert.equal((await yansima(String(s['cid'])))?.sonuc, 'bekliyor');
      assert.equal((await emirOku(emir)).canli?.saglam, 0);
    } finally {
      await ortam?.sahip.sorgu('DROP TRIGGER yansima_sonuc_hatasi ON arkon_tmi_yansima');
    }
    await tetikle();
    assert.equal((await yansima(String(s['cid'])))?.sonuc, 'yazildi');
    assert.equal(await onayliSaglam(emir), 7);
  });

  test('noktadan önceki okuma hatası isteği düşürmez: Arkon kaydı yazılır, yansıma "bekliyor" (deneme 1); hata kalkınca işlenir', async () => {
    const emir = await calisanEmir();
    const rol = (await vt().tek<{ r: string }>('SELECT current_user::text AS r'))?.r ?? '';
    const s = olay(emir, 'stopped', { reason: durusKodu });
    await ortam?.sahip.sorgu(`REVOKE SELECT ON durus_nedeni FROM "${rol}"`);
    try {
      const c = await ekle(operator, 'events', s);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      assert.equal(await kayitSayisi(String(s['cid'])), 1);
      const y = await yansimaAyrinti(String(s['cid']));
      assert.deepEqual([y?.sonuc, y?.deneme], ['bekliyor', 1]);
      assert.match(y?.son_hata ?? '', /42501/);
    } finally {
      await ortam?.sahip.sorgu(`GRANT SELECT ON durus_nedeni TO "${rol}"`);
    }
    await denemeyeHazirla();
    await tetikle();
    assert.equal((await yansima(String(s['cid'])))?.sonuc, 'yazildi');
    assert.equal((await emirOku(emir)).canli?.calisma, 'durdu');
  });

  test('uretim_emri okuması kuyruğa alırken süre aşımına düşerse istek düşmez: Arkon kaydı yazılır, yansıma "bekliyor" kalır, kilit kalkınca işlenir', async () => {
    const emir = await calisanEmir();
    const s = sayim(emir, 'good', 4);
    await vt().tx(async (db) => {
      await db.sorgu('LOCK TABLE uretim_emri IN ACCESS EXCLUSIVE MODE');
      const c = await ekle(operator, 'counts', s);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    });
    assert.equal(await kayitSayisi(String(s['cid'])), 1);
    assert.equal((await yansimaAyrinti(String(s['cid'])))?.sonuc, 'bekliyor');
    await denemeyeHazirla();
    await tetikle();
    assert.equal((await yansima(String(s['cid'])))?.sonuc, 'yazildi');
    assert.equal(await onayliSaglam(emir), 4);
  });

  test('iki isteğin kilitleri ters sırada istemesi kilitlenme yapmaz: kilitler emir kimliğine göre artan sırada alınır (10 tur)', async () => {
    const e1 = await calisanEmir();
    const e2 = await calisanEmir();
    let toplam = 0;
    for (let tur = 0; tur < 10; tur += 1) {
      const a = [sayim(e1, 'good', 1), sayim(e2, 'good', 1)];
      const b = [sayim(e2, 'good', 1), sayim(e1, 'good', 1)];
      const c = await Promise.all([topluEkle(operator, 'counts', a), topluEkle(operator, 'counts', b)]);
      for (const x of c) assert.equal(x.durum, 200, `tur ${tur}: ${JSON.stringify(x.govde)}`);
      toplam += 2;
      for (const s of [...a, ...b]) assert.equal(await kayitSayisi(String(s['cid'])), 1);
    }
    // Yük altında kilit beklemesi dolabilir; o satır denenmeden bekliyor kalır (tasarım). Kilitlenme ise denenmiş satırda hata bırakırdı.
    const denenen = await vt().tek<{ n: number }>(
      'SELECT count(*)::int AS n FROM arkon_tmi_yansima WHERE emir_id IN ($1, $2) AND (deneme > 0 OR son_hata IS NOT NULL)', [e1, e2]);
    assert.equal(denenen?.n, 0);
    for (let i = 0; i < 3 && await bekleyenSayisi(e1) + (await bekleyenSayisi(e2)) > 0; i += 1) {
      await denemeyeHazirla();
      await tetikle();
    }
    assert.equal(await onayliSaglam(e1), toplam);
    assert.equal(await onayliSaglam(e2), toplam);
    assert.equal(await bekleyenSayisi(e1) + (await bekleyenSayisi(e2)), 0);
  });

  test('süpürme açlığa uğramaz: aralığı dolmamış 10 emrin ardındaki 11. emrin bekleyeni işlenir', async () => {
    const kaldir = await hataTetikleyicisiKur('yansima_aclik', 'uretim_sayimi', 'NEW.adet IN (140, 141)');
    const takilanlar: number[] = [];
    let son = 0;
    try {
      for (let i = 0; i < 11; i += 1) {
        const e = await calisanEmir();
        takilanlar.push(e);
        assert.equal((await ekle(operator, 'counts', sayim(e, 'good', 140))).durum, 200);
        assert.equal(await bekleyenSayisi(e), 1);
      }
      son = await calisanEmir();
      assert.equal((await ekle(operator, 'counts', sayim(son, 'good', 141))).durum, 200);
      assert.equal(await bekleyenSayisi(son), 1);
    } finally {
      await kaldir();
    }
    // yalnız son emrin bekleyeni denemeye hazır; öncekiler aralık beklerken sayı sınırını doldurur
    await vt().sorgu("UPDATE arkon_tmi_yansima SET son_deneme = now() - interval '2 hours' WHERE emir_id = $1 AND sonuc = 'bekliyor'", [son]);
    await tetikle();
    assert.equal(await bekleyenSayisi(son), 0);
    assert.equal(await onayliSaglam(son), 141);
    for (const e of takilanlar) assert.equal(await bekleyenSayisi(e), 1);
  });

  test('KD-007: istek yalnız kendi emrinin birikmişini işler; başka emrin denemeye hazır bekleyenini arka plan turu işler', async () => {
    const baska = await calisanEmir();
    const kaldir = await hataTetikleyicisiKur('yansima_kd007', 'uretim_sayimi', 'NEW.adet = 161');
    try {
      assert.equal((await ekle(operator, 'counts', sayim(baska, 'good', 161))).durum, 200);
    } finally {
      await kaldir();
    }
    await denemeyeHazirla();
    const kendi = await calisanEmir();
    assert.equal((await ekle(operator, 'counts', sayim(kendi, 'good', 7))).durum, 200);
    assert.equal(await bekleyenSayisi(kendi), 0);
    assert.equal(await bekleyenSayisi(baska), 1, 'istek başka emrin birikmişini işledi');
    assert.equal(await tetikle(), 'tamam');
    assert.equal(await bekleyenSayisi(baska), 0);
    assert.equal(await onayliSaglam(baska), 161);
  });

  test('KD-006: arka plan turu dış hatayı yutmaz, zamanlayıcıya düşer', async () => {
    await ortam?.sahip.sorgu('ALTER TABLE arkon_tmi_yansima RENAME TO arkon_tmi_yansima_kd006');
    try {
      await assert.rejects(tetikle());
    } finally {
      await ortam?.sahip.sorgu('ALTER TABLE arkon_tmi_yansima_kd006 RENAME TO arkon_tmi_yansima');
    }
    assert.equal(await tetikle(), 'tamam');
  });

  test('KD-006: işleme geri alınırsa nedeni bekleyen satırın son hatasına yazılır, deneme sayılmaz; sayım ertelemesi işareti korunur', async () => {
    const emir = await calisanEmir();
    // Geçici hata satır başına yakalanır; yakalayan yazım da düşerse hata emrin işlemesini geri aldırır (satır dışı hata).
    await ortam?.sahip.sorgu(`CREATE OR REPLACE FUNCTION yansima_kd006() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN IF NEW.deneme > OLD.deneme THEN RAISE EXCEPTION 'deneme: satır dışı hata' USING ERRCODE = 'P0001'; END IF; RETURN NEW; END $f$`);
    await ortam?.sahip.sorgu('CREATE TRIGGER yansima_kd006 BEFORE UPDATE ON arkon_tmi_yansima FOR EACH ROW EXECUTE FUNCTION yansima_kd006()');
    const kaldir = await hataTetikleyicisiKur('yansima_kd006_sayim', 'uretim_sayimi', 'NEW.adet = 162');
    const s = sayim(emir, 'good', 162);
    try {
      assert.equal((await ekle(operator, 'counts', s)).durum, 200);
    } finally {
      await kaldir();
      await ortam?.sahip.sorgu('DROP TRIGGER yansima_kd006 ON arkon_tmi_yansima');
    }
    const y = await yansimaAyrinti(String(s['cid']));
    assert.equal(y?.sonuc, 'bekliyor');
    assert.equal(y?.deneme, 0);
    assert.match(y?.son_hata ?? '', /P0001.*satır dışı hata/);
    await vt().sorgu("UPDATE arkon_tmi_yansima SET son_hata = $2 WHERE emir_id = $1 AND sonuc = 'bekliyor'", [emir, SAYIM_ERTELEME]);
    await bekleyenlereNedenYaz(vt(), emir, 'x', SAYIM_ERTELEME);
    assert.equal((await yansimaAyrinti(String(s['cid'])))?.son_hata, SAYIM_ERTELEME);
    await denemeyeHazirla();
    await tetikle();
    assert.equal((await yansimaAyrinti(String(s['cid'])))?.sonuc, 'yazildi');
  });

  test('bekleyen ve yazılamayan sorguları büyük tabloda tablo taraması yapmaz: 20 bin sonuçlanmış satırda kısmi indeks kullanılır', async () => {
    const emir = await calisanEmir();
    // Toplu veri sahip bağlantısıyla yazılır: istek bağlantısının sorgu süresi sınırı yavaş ortamda (yabancı anahtar denetimi satır başına) aşılıyordu.
    await ortam?.sahip.sorgu(
      `INSERT INTO arkon_kayit (tur, cid, zaman, govde, kisi_id) SELECT 'counts', 'toplu-' || g, now(), '{}'::jsonb, $1 FROM generate_series(1, 20000) g`, [operatorId]);
    await ortam?.sahip.sorgu(
      `INSERT INTO arkon_tmi_yansima (kayit_id, emir_id, kisi_id, sonuc) SELECT id, $1, kisi_id, 'yazildi' FROM arkon_kayit WHERE cid LIKE 'toplu-%'`, [emir]);
    await ortam?.sahip.sorgu('ANALYZE arkon_tmi_yansima');
    await ortam?.sahip.sorgu('ANALYZE arkon_kayit');
    // A11: "TMI'ye yazılamayanlar" sayımı (sonuc <> 'yazildi') da tabloyu taramaz.
    const sayim = yansimaSayimParametreleri({ sonuc: null, yasak: { merkez: [], istasyon: [], makine: [] }, izinli: null, gizli: [], gizlileriGoster: true });
    // Sıralı tarama yalnız bu işlemde pahalı sayılır: kısmi indeks sorgu koşuluyla eşleşiyorsa planlayıcı onu seçer. Böylece sonuç
    // ortamın istatistiğine değil indeksin koşuluna bağlıdır (borç BK11). Kısmi indekslerden biri aranır, çünkü sıralı tarama kapalıyken
    // eşleşmeyen sorgu birincil anahtarın tam taramasına düşer.
    for (const [sql, param] of [[BEKLEYEN_EMIRLER_SQL, [10]], [BEKLEYEN_YANSIMALAR_SQL, [emir]], [YANSIMA_SAYIM_SQL, sayim]] as const) {
      const plan = await vt().tx(async (db) => {
        await db.sorgu('SET LOCAL enable_seqscan = off');
        return JSON.stringify(await db.sorgu(`EXPLAIN (FORMAT JSON) ${sql}`, param));
      });
      assert.ok(!/"Node Type":"Seq Scan"[^}]*"Relation Name":"arkon_tmi_yansima"/.test(plan), plan.slice(0, 600));
      assert.match(plan, /"Index Name":"arkon_tmi_yansima_(bekleyen|yazilmayan)_idx"/);
    }
  });

  test('KD-005: paket ve emir süzgeçli kayıt okumaları (ilk parça kapısı, kayıt listesi) 20 bin olay satırında türü taramaz', async () => {
    await ortam?.sahip.sorgu(
      `INSERT INTO arkon_kayit (tur, cid, zaman, paket_id, emir_no, govde, kisi_id)
       SELECT 'events', 'kd5-' || g, now() - g * interval '1 second', 'kd5-p' || (g % 400), 'KD5-' || (g % 300), '{"state":"running"}'::jsonb, $1
         FROM generate_series(1, 20000) g`, [operatorId]);
    await ortam?.sahip.sorgu('ANALYZE arkon_kayit');
    const bos = { merkez: [], istasyon: [], makine: [] };
    const liste = (emirNo: string | null, paketId: string | null) =>
      ['events', null, null, null, null, emirNo, paketId, null, 5000, bos.merkez, bos.istasyon, bos.makine, false, [], [], []];
    for (const [sql, param] of [[PARCA_SAGLAMI_SQL, ['kd5-p7', null]], [KAYITLAR_SQL, liste(null, 'kd5-p7')], [KAYITLAR_SQL, liste('KD5-7', null)]] as const) {
      const plan = JSON.stringify(await vt().sorgu(`EXPLAIN (FORMAT JSON) ${sql}`, param as unknown[]));
      assert.ok(!/"Node Type":"Seq Scan"[^}]*"Relation Name":"arkon_kayit"/.test(plan), plan.slice(0, 600));
      assert.match(plan, /arkon_kayit_(paket|emir)_idx/);
    }
  });

  test('geçici olmayan bilinmeyen hata 5 denemeden sonra "hatali" olur ve emrin sonraki bekleyenleri işlenir; geçici hata (serileştirme) sınırsız denenir', async () => {
    const emir = await calisanEmir();
    const kaldir = await hataTetikleyicisiKur('yansima_kalici', 'uretim_sayimi', 'NEW.adet = 131', 'P0001');
    const kotu = sayim(emir, 'good', 131);
    const sonraki = sayim(emir, 'good', 7);
    try {
      assert.equal((await ekle(operator, 'counts', kotu)).durum, 200);
      assert.equal((await ekle(operator, 'counts', sonraki)).durum, 200);
      for (let i = 2; i <= 4; i += 1) {
        await denemeyeHazirla();
        await tetikle();
        assert.deepEqual([(await yansimaAyrinti(String(kotu['cid'])))?.sonuc, (await yansimaAyrinti(String(kotu['cid'])))?.deneme], ['bekliyor', i]);
        assert.equal((await yansima(String(sonraki['cid'])))?.sonuc, 'bekliyor', 'öndeki bekliyorken ardındaki işlenmez');
      }
      await denemeyeHazirla();
      await tetikle();
      const y = await yansimaAyrinti(String(kotu['cid']));
      assert.equal(y?.sonuc, 'hatali');
      assert.ok((y?.neden ?? '').length > 0);
      assert.equal((await yansima(String(sonraki['cid'])))?.sonuc, 'yazildi');
      assert.equal(await onayliSaglam(emir), 7);
      // hatalı satır yeniden denenmez
      await denemeyeHazirla();
      await tetikle();
      assert.equal((await yansimaAyrinti(String(kotu['cid'])))?.deneme, 5);
    } finally {
      await kaldir();
    }
    const emir2 = await calisanEmir();
    const gecici = await hataTetikleyicisiKur('yansima_serilestirme', 'uretim_sayimi', 'NEW.adet = 132', '40001');
    const s = sayim(emir2, 'good', 132);
    try {
      assert.equal((await ekle(operator, 'counts', s)).durum, 200);
      for (let i = 2; i <= 8; i += 1) {
        await denemeyeHazirla();
        await tetikle();
        assert.deepEqual([(await yansimaAyrinti(String(s['cid'])))?.sonuc, (await yansimaAyrinti(String(s['cid'])))?.deneme], ['bekliyor', i]);
      }
    } finally {
      await gecici();
    }
  });

  test('son_hata ve neden reddedilen değeri taşımaz: veri biçimi hatasında (sınıf 22) değer yazılmaz', async () => {
    const emir = await calisanEmir();
    const kaldir = await hataTetikleyicisiKur('yansima_deger', 'uretim_sayimi', 'NEW.adet = 137', '22003', "'deger tasan: %', NEW.adet");
    const s = sayim(emir, 'good', 137);
    try {
      assert.equal((await ekle(operator, 'counts', s)).durum, 200);
    } finally {
      await kaldir();
    }
    const y = await yansimaAyrinti(String(s['cid']));
    assert.equal(y?.sonuc, 'bekliyor');
    assert.ok(!(y?.son_hata ?? '').includes('137'), y?.son_hata ?? '');
    assert.match(y?.son_hata ?? '', /22003/);
  });

  // Yeniden kuyruğa alma (#243).
  const yansimaId = async (c: string): Promise<number> =>
    (await vt().tek<{ id: number }>('SELECT y.id::float8 AS id FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id WHERE k.cid = $1', [c]))?.id ?? -1;
  const yenidenDene = async (cerez: string, c: string) =>
    istek<{ sonuc: string; neden: string | null; mesaj?: string }>(cerez, 'POST', `/arkon/tmi-yansimalari/${await yansimaId(c)}/yeniden-dene`);
  // Kayıt gönderilir ve gerçek yoldan (5 deneme) "hatali" olur; tetikleyici çağıran kaldırır.
  async function hataliYap(tur: string, satir: Record<string, unknown>): Promise<void> {
    assert.equal((await ekle(operator, tur, satir)).durum, 200);
    for (let i = 2; i <= 5; i += 1) {
      await denemeyeHazirla();
      await tetikle();
    }
    assert.equal((await yansimaAyrinti(String(satir['cid'])))?.sonuc, 'hatali');
  }
  let yenileyici = '';
  const yenileyiciAl = async (): Promise<string> => (yenileyici ||= await kisiKur('yenileyici1', ['arkon.yansima-yeniden']));

  test('yeniden deneme: aynı satır iki kez denendi, emirde tek sayım var; TMI yazıp hata veren deneme geri alınmıştır', async () => {
    const cerez = await yenileyiciAl();
    const emir = await calisanEmir();
    // Sayım satırı YAZILDIKTAN sonra hata: komut cevap veremez. Kayıt noktası yazımı geri alır, "yazıldı ama cevap alınamadı" kalmaz.
    const kaldir = await hataTetikleyicisiKur('yeniden_sonra', 'uretim_sayimi', 'NEW.adet = 161', 'P0001', "'deneme: yazdiktan sonra hata'", 'AFTER');
    const s = sayim(emir, 'good', 161);
    try {
      await hataliYap('counts', s);
    } finally {
      await kaldir();
    }
    assert.equal((await emirOku(emir)).canli?.saglam, 0, 'hatali olan beş denemenin hiçbiri TMI sayımı bırakmadı');
    const ilk = await yenidenDene(cerez, String(s['cid']));
    assert.deepEqual([ilk.durum, ilk.govde.sonuc], [200, 'yazildi'], JSON.stringify(ilk.govde));
    const ikinci = await yenidenDene(cerez, String(s['cid']));
    assert.equal(ikinci.durum, 409, 'yazılmış satır yeniden kuyruğa alınmaz');
    await denemeyeHazirla();
    await tetikle();
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_sayimi WHERE emir_id = $1 AND adet = 161', [emir]))?.n, 1);
    assert.equal(await onayliSaglam(emir), 161, 'emirde tek sayım');
  });

  test('yeniden deneme eşzamanlı iki istekte tek kez yürür: biri 200, öteki 409; emirde tek sayım', async () => {
    const cerez = await yenileyiciAl();
    const emir = await calisanEmir();
    const kaldir = await hataTetikleyicisiKur('yeniden_eszaman', 'uretim_sayimi', 'NEW.adet = 162', 'P0001');
    const s = sayim(emir, 'good', 162);
    try {
      await hataliYap('counts', s);
    } finally {
      await kaldir();
    }
    const cevaplar = await Promise.all([yenidenDene(cerez, String(s['cid'])), yenidenDene(cerez, String(s['cid']))]);
    assert.deepEqual(cevaplar.map((c) => c.durum).sort(), [200, 409], JSON.stringify(cevaplar.map((c) => c.govde)));
    assert.equal(await onayliSaglam(emir), 162);
  });

  test('yeniden deneme izni ve ret: işlemsiz kişi 403; yalnız "hatali" alınır (reddedildi, bekliyor, eşlenemedi 409); bulunmayan 404', async () => {
    const cerez = await yenileyiciAl();
    const cam = await kisiKur('cam_yeniden', ['arkon.hazirlik', 'sayfa.arkon', 'arkon.yansima-oku']);
    const emir = await calisanEmir();
    const kaldir = await hataTetikleyicisiKur('yeniden_izin', 'uretim_sayimi', 'NEW.adet = 163', 'P0001');
    const hatali = sayim(emir, 'good', 163);
    try {
      await hataliYap('counts', hatali);
    } finally {
      await kaldir();
    }
    for (const kisi of [operator, cam]) assert.equal((await yenidenDene(kisi, String(hatali['cid']))).durum, 403);
    assert.equal((await yansimaAyrinti(String(hatali['cid'])))?.sonuc, 'hatali', 'reddedilen istek satırı değiştirmez');
    const reddedilen = olay(emir, 'running');
    const eslenmeyen = olay(emir, 'setup');
    assert.equal((await ekle(digerOperator, 'events', reddedilen)).durum, 200);
    assert.equal((await ekle(operator, 'events', eslenmeyen)).durum, 200);
    const planli = await emirAc();
    const bekleyen = sayim(planli, 'good', 4);
    assert.equal((await ekle(operator, 'counts', bekleyen)).durum, 200);
    for (const [k, sonuc] of [[reddedilen, 'reddedildi'], [eslenmeyen, 'eslenemedi'], [bekleyen, 'bekliyor']] as const) {
      const c = await yenidenDene(cerez, String(k['cid']));
      assert.equal(c.durum, 409, `${sonuc}: ${JSON.stringify(c.govde)}`);
      assert.equal((await yansimaAyrinti(String(k['cid'])))?.sonuc, sonuc);
    }
    assert.equal((await istek(cerez, 'POST', '/arkon/tmi-yansimalari/999999999/yeniden-dene')).durum, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/api/arkon/tmi-yansimalari/1/yeniden-dene' })).statusCode, 401);
    // Kabul: işlemi olan kişi aynı satırı alır.
    assert.deepEqual((await yenidenDene(cerez, String(hatali['cid']))).govde.sonuc, 'yazildi');
  });

  test('yeniden deneme sıra koruması: emrin sonraki durum kaydı yazılmışsa eski durum kaydı 409 ve emir değişmez; sonrası yoksa yazılır', async () => {
    const cerez = await yenileyiciAl();
    const emir = await calisanEmir();
    const kaldir = await hataTetikleyicisiKur('yeniden_sira', 'uretim_olayi', `NEW.emir_id = ${emir}`, 'P0001');
    const duraklat = olay(emir, 'paused');
    try {
      await hataliYap('events', duraklat);
    } finally {
      await kaldir();
    }
    assert.equal((await ekle(operator, 'events', olay(emir, 'stopped', { reason: durusKodu }))).durum, 200);
    assert.equal((await emirOku(emir)).canli?.calisma, 'durdu');
    const ret = await yenidenDene(cerez, String(duraklat['cid']));
    assert.equal(ret.durum, 409, JSON.stringify(ret.govde));
    assert.match(String(ret.govde.mesaj), /sonraki durum kayıtları yazıldı/);
    assert.equal((await yansimaAyrinti(String(duraklat['cid'])))?.sonuc, 'hatali');
    assert.equal((await emirOku(emir)).canli?.calisma, 'durdu', 'emir değişmez');
    // Kabul: sonrası yazılmamış durum kaydı yeniden denenir ve yazılır.
    const emir2 = await calisanEmir();
    const kaldir2 = await hataTetikleyicisiKur('yeniden_sira2', 'uretim_olayi', `NEW.emir_id = ${emir2}`, 'P0001');
    const duraklat2 = olay(emir2, 'paused');
    try {
      await hataliYap('events', duraklat2);
    } finally {
      await kaldir2();
    }
    assert.deepEqual((await yenidenDene(cerez, String(duraklat2['cid']))).govde.sonuc, 'yazildi');
    assert.equal((await emirOku(emir2)).canli?.calisma, 'durakli');
  });

  test('yeniden denemede veri kapsamı listedekiyle aynı: kısıtlı kişi başka iş merkezinin satırını 404 alır (satır değişmez), kendi iş merkezininkini alır', async () => {
    await yeniIstasyon();
    const benimMerkez = merkezId;
    const benimKod = istasyonKodu;
    const benim = await emirAc();
    await yeniIstasyon();
    const baskaKod = istasyonKodu;
    const baskasi = await emirAc();
    for (const e of [benim, baskasi]) await ekle(operator, 'events', olay(e, 'running'));
    const kaldir = await hataTetikleyicisiKur('yeniden_kapsam', 'uretim_sayimi', 'NEW.adet = 164', 'P0001');
    const kendi = sayim(benim, 'good', 164, { machine: benimKod });
    const yabanci = sayim(baskasi, 'good', 164, { machine: baskaKod });
    try {
      await hataliYap('counts', kendi);
      await hataliYap('counts', yabanci);
    } finally {
      await kaldir();
    }
    const kisitli = await kisiKur('yenileyici2', ['arkon.yansima-yeniden']);
    const kisi = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'yenileyici2'");
    assert.equal((await istek(yonetici, 'POST', `/kisi-is-merkezleri/${kisi?.id}/belirle`, { isMerkeziIdleri: [benimMerkez] })).durum, 200);
    assert.equal((await yenidenDene(kisitli, String(yabanci['cid']))).durum, 404);
    assert.equal((await yansimaAyrinti(String(yabanci['cid'])))?.sonuc, 'hatali');
    assert.equal((await emirOku(baskasi)).canli?.saglam, 0);
    assert.equal((await yenidenDene(kisitli, String(kendi['cid']))).govde.sonuc, 'yazildi');
    assert.equal(await onayliSaglam(benim), 164);
  });

  describe('toplu istek', () => {
    const toplu = (cerez: string, tur: string, satirlar: Record<string, unknown>[]) =>
      istek<{ eklenen: number }>(cerez, 'POST', `/arkon/kayitlar/${tur}/ekle`, { satirlar, kaynak: 'y1' });

    test('aynı kimlik tek istekte iki kez gelirse tek sayım yazılır; bir satırın beklemesi ötekileri bozmaz', async () => {
      await yeniIstasyon();
      const calisan = await emirAc();
      await ekle(operator, 'events', olay(calisan, 'running'));
      const s = sayim(calisan, 'good', 4);
      assert.equal((await toplu(operator, 'counts', [s, s])).govde.eklenen, 1);
      assert.equal(await onayliSaglam(calisan), 4);
      await yeniIstasyon();
      const planli = await emirAc();
      const iyi = sayim(calisan, 'good', 1);
      const kotu = sayim(planli, 'good', 1);
      const iyi2 = sayim(calisan, 'good', 2);
      assert.equal((await toplu(operator, 'counts', [iyi, kotu, iyi2])).govde.eklenen, 3);
      assert.deepEqual(
        await Promise.all([iyi, kotu, iyi2].map(async (x) => (await yansima(String(x['cid'])))?.sonuc)),
        ['yazildi', 'bekliyor', 'yazildi'],
      );
      assert.equal((await emirOku(calisan)).canli?.saglam, 7);
      assert.equal((await emirOku(planli)).durum, 'planli');
    });

    test('toplu istekte geçici hata Arkon kayıtlarını geri almaz: sıra korunur, öndeki bekleyince ardındakiler bekler; hata kalkınca aynı isteğin yeniden gönderimi bekleyenleri yazar', async () => {
      await yeniIstasyon();
      const emir = await emirAc();
      await ekle(operator, 'events', olay(emir, 'running'));
      const satirlar = [sayim(emir, 'good', 5), sayim(emir, 'good', 123), sayim(emir, 'good', 6)];
      const kaldir = await hataTetikleyicisiKur('yansima_toplu', 'uretim_sayimi', 'NEW.adet = 123');
      try {
        assert.equal((await toplu(operator, 'counts', satirlar)).govde.eklenen, 3);
        for (const s of satirlar) assert.equal(await kayitSayisi(String(s['cid'])), 1);
        assert.deepEqual(
          await Promise.all(satirlar.map(async (s) => (await yansima(String(s['cid'])))?.sonuc)),
          ['yazildi', 'bekliyor', 'bekliyor'],
        );
        assert.equal(await onayliSaglam(emir), 5);
      } finally {
        await kaldir();
      }
      await denemeyeHazirla();
      assert.equal((await toplu(operator, 'counts', satirlar)).govde.eklenen, 0);
      assert.equal((await emirOku(emir)).canli?.saglam, 134);
      for (const s of satirlar) assert.equal((await yansima(String(s['cid'])))?.sonuc, 'yazildi');
      assert.equal((await toplu(operator, 'counts', satirlar)).govde.eklenen, 0);
      assert.equal((await emirOku(emir)).canli?.saglam, 134);
    });
  });

  // Arka plan işi (#299): istek olmadan aynı süpürme. Tur, zamanlayıcının kullandığı tek çalıştırma işleviyle koşar.
  const yineleyici = isler.find((i) => i.ad === 'arkon-yansima-yineleyici');
  const turKos = async (): Promise<string> => {
    if (yineleyici === undefined) throw new Error('iş yok');
    return isiBirKezCalistir(vt(), yineleyici);
  };
  const iz = async (c: string) => vt().tek<{ sonuc: string; deneme: number; son_deneme: Date | null }>(
    'SELECT y.sonuc, y.deneme, y.son_deneme FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id WHERE k.cid = $1', [c]);
  async function bekleyenKur(adet: number, ad: string): Promise<{ emir: number; c: string }> {
    const emir = await calisanEmir();
    const s = sayim(emir, 'good', adet);
    const kaldir = await hataTetikleyicisiKur(ad, 'uretim_sayimi', `NEW.adet = ${adet}`);
    try {
      assert.equal((await ekle(operator, 'counts', s)).durum, 200);
    } finally {
      await kaldir();
    }
    assert.equal((await yansima(String(s['cid'])))?.sonuc, 'bekliyor');
    return { emir, c: String(s['cid']) };
  }

  test('arka plan işi modül işleri arasında: arkon-yansima-yineleyici, 15 sn aralıkla', async () => {
    const kesfedilen = (await modulIsleriniKesfet()).find((i) => i.ad === 'arkon-yansima-yineleyici');
    assert.equal(kesfedilen, yineleyici);
    assert.equal(kesfedilen?.aralikMs, 15_000);
  });

  test('arka plan işi: bekleyen satır yeni kayıt gelmeden yazılır; aralığı dolmamış satıra dokunulmaz; her deneme satırda zaman ve sonuç bırakır', async () => {
    const { emir, c } = await bekleyenKur(171, 'yineleyici_1');
    const ilk = await iz(c);
    assert.equal(ilk?.deneme, 1);
    assert.equal(await turKos(), 'tamam');
    assert.deepEqual(await iz(c), ilk, 'aralığı dolmamış satır denenmez');
    assert.equal((await emirOku(emir)).canli?.saglam, 0);

    // Geçici hata sürerken tur denerse satır bekler ama deneme sayısı ve zamanı ilerler.
    const kaldir = await hataTetikleyicisiKur('yineleyici_1b', 'uretim_sayimi', 'NEW.adet = 171');
    try {
      await denemeyeHazirla();
      const once = new Date();
      await turKos();
      const ikinci = await iz(c);
      assert.deepEqual([ikinci?.sonuc, ikinci?.deneme], ['bekliyor', 2]);
      assert.ok((ikinci?.son_deneme?.getTime() ?? 0) >= once.getTime() - 1000, 'deneme zamanı yazıldı');
    } finally {
      await kaldir();
    }
    assert.equal((await emirOku(emir)).canli?.saglam, 0);

    await denemeyeHazirla();
    const once = new Date();
    await turKos();
    const son = await iz(c);
    assert.equal(son?.sonuc, 'yazildi');
    assert.ok((son?.son_deneme?.getTime() ?? 0) >= once.getTime() - 1000, 'yazım zamanı satırda');
    assert.equal(await onayliSaglam(emir), 171);
    await denemeyeHazirla();
    await turKos();
    assert.equal((await emirOku(emir)).canli?.saglam, 171, 'ikinci kez yazılmaz');
  });

  test('arka plan işi: emir kilidi başka işlemde tutuluyorsa emir atlanır ve satır bekler; kilit bırakılınca sonraki turda yazılır', async () => {
    const { emir, c } = await bekleyenKur(172, 'yineleyici_2');
    await denemeyeHazirla();
    await vt().tx(async (db) => {
      await db.sorgu('SELECT pg_advisory_xact_lock(hashtext($1))', [`arkon-yansima-emir-${emir}`]);
      assert.equal(await turKos(), 'tamam');
      assert.equal((await yansima(c))?.sonuc, 'bekliyor');
    });
    assert.equal((await emirOku(emir)).canli?.saglam, 0);
    await turKos();
    assert.equal((await yansima(c))?.sonuc, 'yazildi');
    assert.equal(await onayliSaglam(emir), 172);
  });

  test('arka plan işinde iz bırakmayan yazım olmaz: satırın sonucu yazılamazsa TMI komutu da geri alınır; iz yazılınca komut kalır', async () => {
    const { emir, c } = await bekleyenKur(173, 'yineleyici_3');
    await denemeyeHazirla();
    // Kısıt sınıfı hata: kayıt noktası bunu kural reddi sayıp yutabilir; iz yazılmadıysa komut da geri alınmalı.
    await ortam?.sahip.sorgu(`CREATE OR REPLACE FUNCTION yineleyici_iz() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN IF NEW.sonuc = 'yazildi' THEN RAISE EXCEPTION 'deneme: iz yazilamadi' USING ERRCODE = '23514'; END IF; RETURN NEW; END $f$`);
    await ortam?.sahip.sorgu('CREATE TRIGGER yineleyici_iz BEFORE UPDATE ON arkon_tmi_yansima FOR EACH ROW EXECUTE FUNCTION yineleyici_iz()');
    try {
      assert.equal(await turKos(), 'tamam');
      assert.equal((await yansima(c))?.sonuc, 'bekliyor');
      assert.equal((await emirOku(emir)).canli?.saglam, 0, 'iz yoksa TMI sayımı da yok');
    } finally {
      await ortam?.sahip.sorgu('DROP TRIGGER yineleyici_iz ON arkon_tmi_yansima');
    }
    await turKos();
    assert.equal((await yansima(c))?.sonuc, 'yazildi');
    assert.equal(await onayliSaglam(emir), 173);
  });
  // AR-BI-2 (kart #1194): TMI'de emir bitince terminal sayımı artırıp azaltabiliyordu; paket biten emri söyler.
  test('AR-BI-2: TMI\'de biten emrin paketi listede ve tek okumada tmi.bitti taşır, açık emrinki taşımaz; okunan sürümle yazım çakışmasız yazılır', async () => {
    await yeniIstasyon();
    const biten = await emirAc();
    const acik = await emirAc();
    for (const id of [biten, acik]) {
      const y = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(id)}/yaz`, { taban: 0, govde: { id: pk(id), status: 'draft', machine: istasyonKodu }, kaynak: 'y1' });
      assert.equal(y.durum, 200, JSON.stringify(y.govde));
    }
    assert.equal((await ekle(operator, 'events', olay(biten, 'running', { machine: istasyonKodu }))).durum, 200);
    assert.equal((await ekle(operator, 'events', olay(biten, 'done', { machine: istasyonKodu }))).durum, 200);
    assert.equal((await emirOku(biten)).durum, 'bitti');
    type Belge = { kimlik: string; surum: number; govde: { tmi?: { bitti?: boolean } } };
    const liste = (await istek<{ belgeler: Belge[] }>(yonetici, 'GET', '/arkon/belgeler/pkgs')).govde.belgeler;
    const b = liste.find((x) => x.kimlik === pk(biten));
    assert.equal(b?.govde.tmi?.bitti, true);
    assert.equal(liste.find((x) => x.kimlik === pk(acik))?.govde.tmi?.bitti, undefined);
    const tek = (await istek<{ belge: Belge | null }>(yonetici, 'GET', `/arkon/belgeler/pkgs/${pk(biten)}`)).govde.belge;
    assert.deepEqual([tek?.surum, tek?.govde.tmi?.bitti], [b?.surum, true]);
    const yaz = await istek<{ sonuc: string }>(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(biten)}/yaz`, { taban: b?.surum, govde: { ...b?.govde, note: 'not' }, kaynak: 'y1' });
    assert.equal(yaz.govde.sonuc, 'yazildi', JSON.stringify(yaz.govde));
  });

  // AR2 (ikinci tarayıcı turu Y1): TMI'de iptal edilen emrin paketi Arkon'da yaşıyordu; operatör uyarısız ayar, sayım yapıyordu.
  test('TMI\'de iptal edilen emrin paketi Arkon listesinden ve tek okumadan düşer, yazılamaz; olay ve sayımı 403 alır, kaydı yazılmaz (AR2)', async () => {
    await yeniIstasyon();
    const iptal = await emirAc();
    const acik = await emirAc();
    for (const id of [iptal, acik]) {
      const y = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(id)}/yaz`, { taban: 0, govde: { id: pk(id), status: 'draft', machine: istasyonKodu }, kaynak: 'y1' });
      assert.equal(y.durum, 200, JSON.stringify(y.govde));
    }
    await iptalYaz(iptal);
    const liste = (await istek<{ belgeler: { kimlik: string }[] }>(yonetici, 'GET', '/arkon/belgeler/pkgs')).govde.belgeler.map((b) => b.kimlik);
    assert.ok(!liste.includes(pk(iptal)), 'iptal edilen emrin paketi listede');
    assert.ok(liste.includes(pk(acik)), 'açık emrin paketi listede değil');
    assert.equal((await istek<{ belge: unknown }>(yonetici, 'GET', `/arkon/belgeler/pkgs/${pk(iptal)}`)).govde.belge, null);
    const yaz = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(iptal)}/yaz`, { taban: null, govde: { id: pk(iptal), status: 'published' }, kaynak: 'y1' });
    assert.equal(yaz.durum, 403, JSON.stringify(yaz.govde));
    const o = olay(iptal, 'setup', { machine: istasyonKodu });
    assert.equal((await ekle(operator, 'events', o)).durum, 403);
    assert.equal(await kayitSayisi(o.cid), 0);
    const s = sayim(iptal, 'good', 1, { machine: istasyonKodu });
    assert.equal((await ekle(operator, 'counts', s)).durum, 403);
    assert.equal(await kayitSayisi(s.cid), 0);
    const a = olay(acik, 'setup', { machine: istasyonKodu });
    assert.equal((await ekle(operator, 'events', a)).govde.eklenen, 1);
  });

  // Rotalı emir (malzeme kartlı, iki iş emri, iki istasyon): tmi-ue paketi kaydedildiği istasyonda kalır, emir adım adım ilerler.
  // `kart` verilirse aynı malzeme kartıyla açar (şablon denemesi); `ucuncuIlkte` üçüncü adımı (op 30) birinci adımın makinesine koyar.
  // Canlı plan yerleşimi (plan modülünün tablosu; fikstür): operatör rotalı işi yalnız canlı ve iş emrinin kaynağına yerleşmişse görür ve başlatır.
  async function canliyaYerlestir(isEmriId: number, kaynak: { makine: number } | { kisi: number }, dk = 0): Promise<void> {
    await ortam!.sahip.sorgu(
      `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, kisi_id, baslangic, bitis, yazan_kisi_id)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4), now() + make_interval(mins => $4 + 30), $5)
       ON CONFLICT (is_emri_id) DO UPDATE SET makine_id = EXCLUDED.makine_id, kisi_id = EXCLUDED.kisi_id, baslangic = EXCLUDED.baslangic, bitis = EXCLUDED.bitis`,
      [isEmriId, 'makine' in kaynak ? kaynak.makine : null, 'kisi' in kaynak ? kaynak.kisi : null, dk, yoneticiId],
    );
  }
  const planSurumuOku = async (): Promise<number> => (await istek<{ planSurumu: number }>(yonetici, 'GET', '/arkon/plan-sira/surum')).govde.planSurumu;
  const plandanCikar = (isEmriId: number) => ortam!.sahip.sorgu('DELETE FROM plan_yerlesimi WHERE is_emri_id = $1', [isEmriId]);

  // Varsayılan: emrin bütün iş emirleri kendi makinelerinde canlı plana yerleşmiş (`plansiz` ile yerleşmez).
  // Sunucu plan motoru (ADR 0018) emrin adımlarını ürünün yürürlükteki rotasından tanır; adımsız ya da girdisiz rota plana girmez. Kartın
  // A revizyonuna ilk emrin adımları (aynı makine ve süreyle) yazılır, ilk adıma bir hammadde girer ve revizyon yürürlüğe alınır.
  async function rotaAdimlariniYaz(kart: number, uretimEmriId: number, ilkParcasizOp: number | null = null): Promise<void> {
    const sahip = ortam!.sahip;
    const rev = (await sahip.tek<{ id: number; durum: string }>("SELECT id, durum FROM rota_revizyonu WHERE malzeme_id = $1 AND harf = 'A'", [kart]))!;
    if (rev.durum !== 'taslak') return;
    await sahip.sorgu(
      `INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) SELECT $1, op_no, $2 FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $3
       ON CONFLICT DO NOTHING`, [kart, rev.id, uretimEmriId]);
    await sahip.sorgu(
      `INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad, makine_id, ayar_suresi_dk, birim_sure_dk, bagimlilik, ilk_parca)
       SELECT $1, $2, op_no, row_number() OVER (ORDER BY op_no), operasyon_tipi_id, ad, makine_id, 10, 1, 'bekleyen',
              CASE WHEN op_no = $4 THEN 'yok' ELSE 'her_kurulum' END
       FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $3`, [rev.id, kart, uretimEmriId, ilkParcasizOp]);
    const girdi = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'YNS-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`yns-${(sayac += 1)}`, sayac, JSON.stringify({ id: `yns-${sayac}`, com: { ad: `Girdi ${sayac}` } }), yoneticiId],
    ))!.no;
    await sahip.sorgu('INSERT INTO rota_bileseni (adim_id, malzeme_id, miktar) SELECT id, $2, 1 FROM rota_adimi WHERE revizyon_id = $1 ORDER BY sira LIMIT 1', [rev.id, girdi]);
    await sahip.sorgu("UPDATE rota_revizyonu SET durum = 'onay_bekliyor', gonderen_kisi_id = $2, gonderme = now() WHERE id = $1", [rev.id, yoneticiId]);
    await sahip.sorgu(
      `UPDATE rota_revizyonu SET durum = 'yururlukte', onaylayan_kisi_id = $2, onaylama = now(), dort_gozsuz_onay = true, yururluge_alan_kisi_id = $2,
       yururluge_alma = now() WHERE id = $1`, [rev.id, yoneticiId]);
  }

  async function rotaliEmirKur(secenek: { kart?: number; ucuncuIlkte?: boolean; plansiz?: boolean; ilkParcasizOp?: number } = {}): Promise<{
    emirId: number; ilk: string; ikinci: string; ilkId: number; ikinciId: number; kart: number; ilkMerkez: number; ikinciMerkez: number; makineKodlari: string[];
  }> {
    const sahip = ortam!.sahip;
    await yeniIstasyon();
    const ilk = istasyonKodu, ilkId = istasyonId, ilkMerkez = merkezId;
    await yeniIstasyon();
    const ikinci = istasyonKodu, ikinciId = istasyonId, ikinciMerkez = merkezId;
    const makineKodlari: string[] = [];
    const makine = async (ist: number) => {
      makineKodlari.push(`YMK${(sayac += 1)}`);
      return (await sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [makineKodlari.at(-1), 'Tezgah', ist]))!.id;
    };
    const [m1, m2] = [await makine(ilkId), await makine(ikinciId)];
    const tip = (await sahip.tek<{ id: number }>('INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, $2, $3) RETURNING id', [`YT${(sayac += 1)}`, 'Deneme tipi', 'TAL']))!.id;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('YNS-', 0) ON CONFLICT (onek) DO NOTHING");
    sayac += 1;
    const kart = secenek.kart ?? (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'YNS-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`yns-${sayac}`, sayac, JSON.stringify({ id: `yns-${sayac}`, com: { ad: `Rotalı ${sayac}` } }), yoneticiId],
    ))!.no;
    // Revizyon harfi pakete rotadan gelir: kartın A revizyonu fikstürle kurulur (aynı kartla ikinci emir aynısını kullanır).
    await sahip.sorgu(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2) ON CONFLICT (malzeme_id, harf) DO NOTHING", [kart, yoneticiId]);
    const revizyon = (await sahip.tek<{ id: number }>("SELECT id FROM rota_revizyonu WHERE malzeme_id = $1 AND harf = 'A'", [kart]))!.id;
    const adim = (sira: number, makineId: number) => ({
      sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tip, kaynak: { tur: 'makine' as const, id: makineId }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
    });
    const { uretimEmriId } = await vt().tx(async (db) => uretimEmriAc(db, (await kullaniciYukle(db, yoneticiId))!, {
      projeId: denemeProjeId, malzemeNo: kart, adet: 20, teslim: null, kaynakRotaRevizyonId: revizyon, isEmirleri: [adim(1, m1), adim(2, m2), ...(secenek.ucuncuIlkte ? [adim(3, m1)] : [])],
    }));
    await rotaAdimlariniYaz(kart, uretimEmriId, secenek.ilkParcasizOp ?? null);
    if (!secenek.plansiz) {
      const isEmirleri = await sahip.sorgu<{ id: number; makineId: number; opNo: number }>(
        'SELECT id, makine_id AS "makineId", op_no AS "opNo" FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1', [uretimEmriId]);
      for (const ie of isEmirleri) await canliyaYerlestir(ie.id, { makine: ie.makineId }, ie.opNo);
    }
    return { emirId: uretimEmriId, ilk, ikinci, ilkId, ikinciId, kart, ilkMerkez, ikinciMerkez, makineKodlari };
  }

  const adimliEmir = async (id: number): Promise<unknown> => {
    const c = await istek(yonetici, 'GET', `/adimli-emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde;
  };

  // Taslak paketi Hazırlık gibi kaydeder (makine taslağınki: emrin o anki istasyonu). Rotalı emrin `tmi-ue` taslağı yoktur (iş emri paketleri);
  // geçiş durumu (adım 1'den önce kaydedilmiş eski paket) verilen makineyle elle kurulur.
  async function paketiKaydet(emirId: number, gecisMakinesi?: string): Promise<Record<string, unknown>> {
    const okunan = (await istek<{ belge: { govde: Record<string, unknown> } | null }>(yonetici, 'GET', `/arkon/belgeler/pkgs/${pk(emirId)}`)).govde.belge?.govde;
    const taslak = gecisMakinesi === undefined ? okunan : { id: pk(emirId), no: `GEC-${emirId}`, machine: gecisMakinesi, target: 20 };
    assert.ok(taslak);
    const govde = { ...taslak, status: 'published', steps: [{ id: 's1' }] };
    const c = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(emirId)}/yaz`, { taban: null, govde, kaynak: 'y1' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return govde;
  }

  test('rotalı emir: eski istasyondaki paketin olay ve sayımı sonraki adıma yazılmaz (eslenemedi), emir ve iş emirleri değişmez; şimdiki istasyondaki paket yazar', async () => {
    const r = await rotaliEmirKur();
    const paket = await paketiKaydet(r.emirId, r.ilk);
    assert.equal(paket['machine'], r.ilk);
    // İzinli: paket emrin şimdiki istasyonunda, ilk adım başlar ve biter.
    const basla = olay(r.emirId, 'running', { machine: r.ilk });
    assert.equal((await ekle(operator, 'events', basla)).durum, 200);
    assert.equal((await yansima(basla.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(basla.cid)));
    const bitir = olay(r.emirId, 'done', { machine: r.ilk });
    assert.equal((await ekle(operator, 'events', bitir)).durum, 200);
    assert.equal((await yansima(bitir.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(bitir.cid)));
    const once = await emirOku(r.emirId);
    assert.equal(once.istasyon?.id, r.ikinciId);
    const isEmirleriOnce = await adimliEmir(r.emirId);
    // Reddedilen: aynı eski paketle yeniden başlatma ve sayım.
    const eskiBasla = olay(r.emirId, 'running', { machine: r.ilk });
    const eskiSayim = sayim(r.emirId, 'good', 3, { machine: r.ilk });
    assert.equal((await ekle(operator, 'events', eskiBasla)).durum, 200);
    assert.equal((await ekle(operator, 'counts', eskiSayim)).durum, 200);
    for (const c of [eskiBasla.cid, eskiSayim.cid]) {
      const y = await yansima(c);
      assert.equal(y?.sonuc, 'eslenemedi', JSON.stringify(y));
      assert.equal(y?.neden, `Paket başka istasyonun; emir şu an ${r.ikinci} istasyonunda.`);
    }
    const sonra = await emirOku(r.emirId);
    assert.equal(sonra.durum, once.durum);
    assert.equal(sonra.istasyon?.id, r.ikinciId);
    assert.deepEqual(await adimliEmir(r.emirId), isEmirleriOnce);
    // "TMI'ye yazılamayanlar"da görünür (gizli tür değil).
    const liste = await istek<{ satirlar: { cid?: string; neden: string | null }[] }>(yonetici, 'GET', '/arkon/tmi-yansimalari');
    assert.equal(liste.durum, 200, JSON.stringify(liste.govde));
    assert.ok(JSON.stringify(liste.govde).includes('Paket başka istasyonun'), JSON.stringify(liste.govde).slice(0, 400));
    // İzinli: paket emrin şimdiki istasyonuna taşınır, ikinci adım oradan başlar.
    const surum = (await istek<{ belge: { surum: number } }>(yonetici, 'GET', `/arkon/belgeler/pkgs/${pk(r.emirId)}`)).govde.belge.surum;
    const tasi = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(r.emirId)}/yaz`, { taban: surum, govde: { ...paket, machine: r.ikinci }, kaynak: 'y1' });
    assert.equal(tasi.durum, 200, JSON.stringify(tasi.govde));
    const ikinciBasla = olay(r.emirId, 'running', { machine: r.ikinci });
    assert.equal((await ekle(operator, 'events', ikinciBasla)).durum, 200);
    assert.equal((await yansima(ikinciBasla.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(ikinciBasla.cid)));
    const calisan = await emirOku(r.emirId);
    assert.equal(calisan.durum, 'basladi');
    assert.equal(calisan.istasyon?.id, r.ikinciId);
  });

  test('rotalı emrin paketi emrin şimdiki istasyonu dışına taşınamaz (400 machine); aynı makineyle yazım ve rotasız emir paketinin taşınması bugünkü gibi', async () => {
    const r = await rotaliEmirKur();
    const paket = await paketiKaydet(r.emirId, r.ilk);
    const surum = async (k: string) => (await istek<{ belge: { surum: number } | null }>(yonetici, 'GET', `/arkon/belgeler/pkgs/${k}`)).govde.belge?.surum ?? null;
    const tasi = await istek<{ alan?: string }>(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(r.emirId)}/yaz`, { taban: await surum(pk(r.emirId)), govde: { ...paket, machine: r.ikinci }, kaynak: 'y1' });
    assert.equal(tasi.durum, 400, JSON.stringify(tasi.govde));
    assert.match(JSON.stringify(tasi.govde), /TMI planından değişir/);
    const ayni = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(r.emirId)}/yaz`, { taban: await surum(pk(r.emirId)), govde: { ...paket, seq: 20 }, kaynak: 'y1' });
    assert.equal(ayni.durum, 200, JSON.stringify(ayni.govde));
    // Eski paketin ilk kaydında da makine emrin şimdiki istasyonu olmalı.
    const r2 = await rotaliEmirKur();
    const ilkKayit = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(r2.emirId)}/yaz`, { taban: null, govde: { id: pk(r2.emirId), machine: r2.ikinci }, kaynak: 'y1' });
    assert.equal(ilkKayit.durum, 400, JSON.stringify(ilkKayit.govde));
    // Rotasız emir: paket başka istasyona taşınır ve kaydı yine emre yazılır.
    await yeniIstasyon();
    const hedef = istasyonKodu;
    await yeniIstasyon();
    const rotasiz = await emirAc();
    const rp = await paketiKaydet(rotasiz);
    const rTasi = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${pk(rotasiz)}/yaz`, { taban: await surum(pk(rotasiz)), govde: { ...rp, machine: hedef }, kaynak: 'y1' });
    assert.equal(rTasi.durum, 200, JSON.stringify(rTasi.govde));
    const b = olay(rotasiz, 'running', { machine: hedef });
    assert.equal((await ekle(operator, 'events', b)).durum, 200);
    assert.equal((await yansima(b.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(b.cid)));
  });

  /* ---------------- adım 1: iş emri başına paket (kart #199) ---------------- */

  type Paket = Record<string, unknown>;
  const ieKimligi = (id: number) => `tmi-ie-${id}`;
  const isEmriIdleri = async (emirId: number): Promise<number[]> =>
    ((await adimliEmir(emirId)) as { emir: { isEmirleri: { id: number; sira: number }[] } }).emir.isEmirleri.sort((a, b) => a.sira - b.sira).map((i) => i.id);
  const paketler = async (cerez = yonetici): Promise<Map<string, { surum: number; govde: Paket }>> => {
    const c = await istek<{ belgeler: { kimlik: string; surum: number; govde: Paket }[] }>(cerez, 'GET', '/arkon/belgeler/pkgs');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return new Map(c.govde.belgeler.map((b) => [b.kimlik, { surum: b.surum, govde: b.govde }]));
  };
  const paketOku = async (kimlik: string) => (await istek<{ belge: { surum: number; govde: Paket } | null }>(yonetici, 'GET', `/arkon/belgeler/pkgs/${kimlik}`)).govde.belge;
  const paketYaz = (kimlik: string, taban: number | null, govde: Paket, cerez = yonetici) =>
    istek<{ sonuc: string; surum?: number }>(cerez, 'POST', `/arkon/belgeler/pkgs/${kimlik}/yaz`, { taban, govde, kaynak: 'y1' });
  const makinesi = async (isEmriId: number) => ({ tur: 'makine', id: (await ortam!.sahip.tek<{ m: number }>(
    'SELECT makine_id AS m FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]))!.m });
  const tmiPlani = (p: Paket | undefined): unknown => (p?.['tmi'] as Record<string, unknown> | undefined)?.['plan'];
  const ieOlay = (isEmriId: number, state: string, ek: Record<string, unknown> = {}) => ({ cid: cid(), pkgId: ieKimligi(isEmriId), state, ...ek });
  const ieSayim = (isEmriId: number, kind: string, delta: number, ek: Record<string, unknown> = {}) => ({ cid: cid(), pkgId: ieKimligi(isEmriId), kind, delta, ...ek });

  test('denetim #12, 744 a, 756 a: iş emri paketinin tmi.ilkParca alanı adımın Kalite Merkezi\'ndeki son ilk parça kararıdır; adımsız (eski) karar hiçbir adımın değildir', async () => {
    const r = await rotaliEmirKur();
    const [ie1, ie2] = await isEmriIdleri(r.emirId);
    const ilkParca = async (id: number) => ((await paketler()).get(ieKimligi(id))?.govde['tmi'] as Record<string, unknown> | undefined)?.['ilkParca'];
    assert.equal(await ilkParca(ie1!), undefined);
    const karar = async (k: 'onay' | 'ret', isEmriId?: number) => assert.equal(
      (await istek(yonetici, 'POST', `/kalite-merkezi/ilk-parca/${r.emirId}/karar`, { karar: k, ...(isEmriId === undefined ? {} : { isEmriId }) })).durum, 200);
    await karar('onay');
    for (const id of [ie1!, ie2!]) assert.equal(await ilkParca(id), undefined, 'adımsız karar adımın kararı değildir');
    await karar('ret', ie1!);
    assert.equal((await ilkParca(ie1!) as { karar?: string } | undefined)?.karar, 'ret');
    await karar('onay', ie1!);
    assert.equal((await ilkParca(ie1!) as { karar?: string } | undefined)?.karar, 'onay');
    assert.equal(await ilkParca(ie2!), undefined, 'Op 10 kararı Op 20\'nin değildir');
    const taslak = (await paketler()).get(ieKimligi(ie1!))!.govde;
    assert.equal(taslak['rules'], undefined, 'her kurulumda seçimi taslağa kural yazmaz (tablet varsayılanı açık)');
    const yaz = await paketYaz(ieKimligi(ie1!), null, { ...taslak, status: 'published', steps: [{ id: 's1' }], tmi: { ...(taslak['tmi'] as object), ilkParca: { karar: 'ret', zaman: 'sahte' } } });
    assert.equal(yaz.durum, 200, JSON.stringify(yaz.govde));
    assert.equal((((await paketOku(ieKimligi(ie1!)))?.govde['tmi'] as Record<string, unknown>)['ilkParca'] as { karar?: string }).karar, 'onay', 'kayıtlı pakette de sunucunun yazdığıdır; istemcinin alanı sayılmaz');
  });

  test('iş emri paketi: rotalı emrin her adımı kendi istasyonunda, TMI alanları rotadan ve emirden dolu; emir başına paket yok; aynı makinedeki iki adım ayrı paket', async () => {
    const r = await rotaliEmirKur({ ucuncuIlkte: true });
    const [ie1, ie2, ie3] = await isEmriIdleri(r.emirId);
    const liste = await paketler();
    assert.ok(!liste.has(pk(r.emirId)), 'rotalı emrin emir başına taslağı var');
    const p1 = liste.get(ieKimligi(ie1!))?.govde;
    const p2 = liste.get(ieKimligi(ie2!))?.govde;
    const p3 = liste.get(ieKimligi(ie3!))?.govde;
    assert.ok(p1 && p2 && p3, [...liste.keys()].join(','));
    assert.equal(p1['machine'], r.ilk);
    assert.equal(p2['machine'], r.ikinci);
    assert.equal(p3['machine'], r.ilk);
    assert.equal(p1['mc'], r.makineKodlari[0]);
    assert.equal(p1['op'], 'Op 10 · Adım 1');
    assert.equal(p3['op'], 'Op 30 · Adım 3');
    assert.equal(p1['cycle'], 60);
    assert.equal(p1['setup'], 10);
    assert.equal(p1['rev'], 'A');
    assert.equal(p1['target'], 20);
    assert.equal(p1['malzemeNo'], r.kart);
    assert.equal(p1['status'], 'draft');
    // İstasyon talaşlı ve emrin CNC kurulumunda onayı yok: hazırlık uyarısı (kilit değil).
    const planSaati = (p1['tmi'] as { planSaati?: unknown }).planSaati;
    assert.ok(planSaati, 'canlı plandaki işin plan saati');
    assert.deepEqual(p1['tmi'], { emirId: r.emirId, isEmriId: ie1, opNo: 10, plan: { canli: true, sira: 1, eslesiyor: true, kaynak: await makinesi(ie1!), zorunlu: false }, hazirlik: 'yok', planSaati });
    assert.deepEqual(tmiPlani(p3), { canli: true, sira: 2, eslesiyor: true, kaynak: await makinesi(ie1!), zorunlu: false }, 'aynı makinede ikinci iş');
    const tek = await paketOku(ieKimligi(ie2!));
    assert.deepEqual(tek?.govde, p2);
  });

  // 266 a: CNC hazırlığı iş emri başınadır; aynı emrin bir iş emrinin onayı ötekinin uyarısını kapatmaz.
  test('266 a: hazırlık uyarısı iş emrinin kendi CNC kurulum onayından', async () => {
    const r = await rotaliEmirKur();
    const [ie1, ie2] = await isEmriIdleri(r.emirId);
    await ortam!.sahip.sorgu(
      `INSERT INTO cnc_kurulum_hazirlik_olayi (adim, olay, imza, emir_id, is_emri_id, kisi_id) VALUES ('final', 'tamam', NULL, $1, $2, 1)`,
      [r.emirId, ie1]);
    const liste = await paketler();
    const hazirlik = (id: number) => (liste.get(ieKimligi(id))?.govde['tmi'] as Record<string, unknown> | undefined)?.['hazirlik'];
    assert.equal(hazirlik(ie1!), undefined, 'onaylı iş emrinde uyarı yok');
    assert.equal(hazirlik(ie2!), 'yok', 'aynı emrin onaysız iş emri uyarıda kalır');
  });

  // Kart #1572: plan işi adetle parçalara böler; her parça kendi makinesinde ayrı paket, kayıt ve sayım iş emrine yazılır.
  test('elle bölünmüş iş: parçalar kendi makinesinde ayrı paket; parça adedini aşan sağlam reddedilir; parça olayı iş emrini bozmaz', async () => {
    const r = await rotaliEmirKur();
    const [ie1, ie2] = await isEmriIdleri(r.emirId);
    const m1 = (await makinesi(ie1!)).id, m2 = (await makinesi(ie2!)).id;
    // Bölünmüş işin yeri parçalarının zarfıdır (plan bölerken öyle yazar): sonraki adım zarfın bitişini bekler, motor da parçalarınkini.
    await ortam!.sahip.sorgu(
      `WITH p AS (INSERT INTO plan_yerlesim_parcasi (is_emri_id, parca_no, adet, makine_id, baslangic, bitis) VALUES
       ($1, 1, 12, $2, now() + interval '10 minutes', now() + interval '30 minutes'), ($1, 2, 8, $3, now() + interval '12 minutes', now() + interval '25 minutes'))
       UPDATE plan_yerlesimi SET baslangic = now() + interval '10 minutes', bitis = now() + interval '30 minutes' WHERE is_emri_id = $1`,
      [ie1, m1, m2]);
    const p1k = `${ieKimligi(ie1!)}-p1`, p2k = `${ieKimligi(ie1!)}-p2`;
    const liste = await paketler();
    assert.ok(!liste.has(ieKimligi(ie1!)), 'bölünmüş işin bütün paketi taslak açıldı');
    const p1 = liste.get(p1k)?.govde, p2 = liste.get(p2k)?.govde;
    assert.ok(p1 && p2, [...liste.keys()].join(','));
    assert.deepEqual([p1['machine'], p1['mc'], p1['target'], p1['no']], [r.ilk, r.makineKodlari[0], 12, liste.get(ieKimligi(ie2!))?.govde['no']]);
    assert.deepEqual([p2['machine'], p2['mc'], p2['target']], [r.ikinci, r.makineKodlari[1], 8]);
    assert.deepEqual((p1['tmi'] as Paket)['parca'], { no: 1, adet: 12, toplam: 2 });
    assert.equal((p2['tmi'] as Paket)['isEmriId'], ie1);
    assert.equal((await paketOku(p2k))?.govde['machine'], r.ikinci);

    // Sayım sınırı parça başınadır: düzeltme ve hurda serbest, tekrar gönderilen satır kendini aşmaz.
    const sayim = (k: string, kind: string, delta: number, ek: Record<string, unknown> = {}) => ({ cid: cid(), pkgId: k, kind, delta, machine: k === p1k ? r.ilk : r.ikinci, ...ek });
    const tamam = sayim(p1k, 'good', 12);
    assert.equal((await ekle(operator, 'counts', tamam)).durum, 200);
    assert.equal((await ekle(operator, 'counts', tamam)).durum, 200, 'tekrar gönderim');
    const fazla = await ekle(operator, 'counts', sayim(p1k, 'good', 1));
    assert.equal(fazla.durum, 409, JSON.stringify(fazla.govde));
    assert.match(JSON.stringify(fazla.govde), /Parça 1 adedi 12: bu parçada en çok 0 sağlam/);
    assert.equal((await ekle(operator, 'counts', sayim(p1k, 'good', -2))).durum, 200, 'düzeltme');
    assert.equal((await ekle(operator, 'counts', sayim(p1k, 'good', 2))).durum, 200, 'düzeltmeden sonra kalan');
    assert.equal((await ekle(operator, 'counts', sayim(p1k, 'scrap', 3, { reason: 'H1' }))).durum, 200, 'hurda sınırsız');
    assert.equal((await ekle(operator, 'counts', sayim(p2k, 'good', 9))).durum, 409);
    assert.equal((await ekle(operator, 'counts', sayim(p2k, 'good', 8))).durum, 200);

    // Olaylar: öteki parça çalışırken başlatma ve bitirme iş emrini değiştirmez.
    const olayi = (k: string, state: string) => ({ cid: cid(), pkgId: k, state, machine: k === p1k ? r.ilk : r.ikinci });
    const b1 = olayi(p1k, 'running');
    assert.equal((await ekle(operator, 'events', b1)).durum, 200);
    assert.equal((await yansima(b1.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(b1.cid)));
    const b2 = olayi(p2k, 'running');
    assert.equal((await ekle(operator, 'events', b2)).durum, 200);
    assert.deepEqual([(await yansima(b2.cid))?.sonuc, (await yansima(b2.cid))?.neden], ['eslenemedi', PARCA_OTEKI_CALISIYOR]);
    const d1 = olayi(p1k, 'done');
    assert.equal((await ekle(operator, 'events', d1)).durum, 200);
    assert.deepEqual([(await yansima(d1.cid))?.sonuc, (await yansima(d1.cid))?.neden], ['eslenemedi', PARCA_OTEKILER_BITMEDI]);
    const isEmriDurumu = async (id: number) => (await ortam!.sahip.tek<{ d: string }>('SELECT durum AS d FROM uretim_emirleri_is_emri WHERE id = $1', [id]))?.d;
    assert.equal(await isEmriDurumu(ie1!), 'calisiyor', 'iş emri öteki parça bitmeden bitmedi');
  });

  const canliPlanAyari = async (acik: boolean): Promise<void> => {
    await ortam!.sahip.sorgu("DELETE FROM ayar WHERE anahtar = 'arkon.yalniz-canli-plan'");
    if (acik) await ortam!.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('arkon.yalniz-canli-plan', 'true', $1)", [yoneticiId]);
  };

  // Kart #1257: A4 kuralı ayardır, varsayılanı kapalı. Kapalıyken plansız iş başlar; plan durumu pakette bilgi olarak kalır.
  test('canlı plan ayarı kapalıyken (varsayılan) plana yerleşmemiş iş emri paketi başlatılır ve TMI\'ye yazılır', async () => {
    const r = await rotaliEmirKur({ plansiz: true });
    const [ie1] = await isEmriIdleri(r.emirId);
    assert.deepEqual(tmiPlani((await paketler()).get(ieKimligi(ie1!))?.govde), { canli: false, sira: null, eslesiyor: false, kaynak: null, zorunlu: false });
    const satir = ieOlay(ie1!, 'running', { machine: r.ilk });
    assert.equal((await ekle(operator, 'events', satir)).durum, 200);
    assert.equal((await yansima(satir.cid))?.sonuc, 'yazildi');
    assert.equal((await emirOku(r.emirId)).durum, 'basladi');
  });

  // Kart #1257: rotasız emrin adımı Hazırlık'a iş emri paketi olarak gelir; plan durumu yoktur, ayar açıkken de başlar. Kaynaksız adım istasyonsuz
  // pakettir: Hazırlık'ta görünür, yayını reddedilir.
  test('rotasız emrin adımları Hazırlık\'ta paket olur, ayar açıkken de başlar; kaynaksız adım istasyonsuz paket olur ve yayınlanamaz', async (t) => {
    const r = await rotaliEmirKur({ plansiz: true });
    const [rie] = await isEmriIdleri(r.emirId);
    const k = (await ortam!.sahip.tek<{ tip: number; makine: number }>('SELECT operasyon_tipi_id AS tip, makine_id AS makine FROM uretim_emirleri_is_emri WHERE id = $1', [rie]))!;
    const ac = await istek<{ uretimEmriId: number }>(yonetici, 'POST', '/adimli-emirler/rotasiz', { projeId: denemeProjeId, malzemeNo: r.kart, adet: 4, teslim: null });
    assert.equal(ac.durum, 200, JSON.stringify(ac.govde));
    const id = ac.govde.uretimEmriId;
    const adimEkle = async (oncekiOpNo: number | null, opNo: number, kaynak: { tur: 'makine'; id: number } | null) => {
      const surum = ((await adimliEmir(id)) as { emir: { surum: number } }).emir.surum;
      const c = await istek(yonetici, 'POST', `/adimli-emirler/${id}/adim-ekle`, {
        oncekiOpNo, opNo, ad: `Rotasız ${opNo}`, operasyonTipiId: k.tip, kaynak, ayarSuresiDk: '5', birimSureDk: '2', terminGun: null, surum,
      });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    };
    await adimEkle(null, 10, { tur: 'makine', id: k.makine });
    await adimEkle(10, 20, null);
    const [a1, a2] = await isEmriIdleri(id);
    const liste = await paketler();
    const p1 = liste.get(ieKimligi(a1!))?.govde as Paket & { tmi: Record<string, unknown> };
    const p2 = liste.get(ieKimligi(a2!))?.govde as Paket & { tmi: Record<string, unknown> };
    assert.ok(p1 && p2, 'iki adımın paketi Hazırlık\'ta');
    assert.deepEqual([p1['machine'], p1.tmi['plan'], p1.tmi['emirId']], [r.ilk, null, id]);
    assert.equal(p2['machine'], '', 'kaynaksız adım istasyonsuz');
    const ret = await paketYaz(ieKimligi(a2!), null, { ...p2, status: 'published', steps: [{ id: 's1' }] });
    assert.equal(ret.durum, 400, JSON.stringify(ret.govde));
    assert.match(JSON.stringify(ret.govde), /İstasyonu seçilmemiş/);
    const y = await paketYaz(ieKimligi(a1!), null, { ...p1, status: 'published', steps: [{ id: 's1' }] });
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    await canliPlanAyari(true);
    t.after(() => canliPlanAyari(false));
    const satir = ieOlay(a1!, 'running', { machine: r.ilk });
    assert.equal((await ekle(operator, 'events', satir)).durum, 200);
    assert.equal((await yansima(satir.cid))?.sonuc, 'yazildi', 'rotasız adım plana girmez, ayar açıkken de başlar');
  });

  // A4 (kart #199), ayar açıkken: operatör paketi yalnız canlı planda iş emrinin kaynağına yerleşmiş işte görür; başlatma da yalnız onda kabul edilir.
  test('iş emri paketi: plan canlı değilse ya da başka makineye yerleşmişse başlatma reddedilir; canlı ve eşleşince başlar; başlamış işin devamı plana bakmaz', async (t) => {
    await canliPlanAyari(true);
    t.after(() => canliPlanAyari(false));
    const r = await rotaliEmirKur({ plansiz: true });
    const [ie1, ie2] = await isEmriIdleri(r.emirId);
    const makineler = new Map((await ortam!.sahip.sorgu<{ id: number; makineId: number }>(
      'SELECT id, makine_id AS "makineId" FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1', [r.emirId])).map((x) => [x.id, x.makineId]));
    const planOku = async (ie: number) => tmiPlani((await paketler()).get(ieKimligi(ie))?.govde);
    assert.deepEqual(await planOku(ie1!), { canli: false, sira: null, eslesiyor: false, kaynak: null, zorunlu: true });
    // Açık taslakta yerleşmiş ama canlıya alınmamış iş: uyarı nedenini söyler; taslaktan çıkınca işaret kalkar.
    const senaryo = (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO plan_senaryosu (ad, taban_plan_surumu, acan_kisi_id) SELECT 'Deneme taslak', surum, $1 FROM plan_durumu RETURNING id", [yoneticiId]))!.id;
    await ortam!.sahip.sorgu(
      `INSERT INTO plan_senaryo_yerlesimi (senaryo_id, is_emri_id, makine_id, kisi_id, baslangic, bitis, kilitli, dondurulmus, elle_sira)
       VALUES ($1, $2, $3, NULL, now(), now() + interval '30 minutes', false, false, NULL)`, [senaryo, ie1, makineler.get(ie1!)]);
    assert.deepEqual(await planOku(ie1!), { canli: false, sira: null, eslesiyor: false, kaynak: null, zorunlu: true, taslakta: true });
    await ortam!.sahip.sorgu('DELETE FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1', [senaryo]);
    // Yöneticinin açık taslağı kalmasın: plan yazımı kişinin açık taslağını sürdürür, öteki testleri etkiler.
    await ortam!.sahip.sorgu('DELETE FROM plan_senaryosu WHERE id = $1', [senaryo]);
    assert.deepEqual(await planOku(ie1!), { canli: false, sira: null, eslesiyor: false, kaynak: null, zorunlu: true });
    const reddedilir = async () => {
      const satir = ieOlay(ie1!, 'running', { machine: r.ilk });
      const c = await ekle(operator, 'events', satir);
      assert.equal(c.durum, 400, JSON.stringify(c.govde));
      assert.match(JSON.stringify(c.govde), /Plan canlıya alınmadı/);
      assert.equal(await kayitSayisi(satir.cid), 0);
      assert.equal((await emirOku(r.emirId)).durum, 'planli');
    };
    await reddedilir();
    await canliyaYerlestir(ie1!, { makine: makineler.get(ie2!)! });
    assert.deepEqual(await planOku(ie1!), { canli: true, sira: 1, eslesiyor: false, kaynak: { tur: 'makine', id: makineler.get(ie2!) }, zorunlu: true });
    await reddedilir();
    await canliyaYerlestir(ie2!, { kisi: yoneticiId });
    assert.deepEqual(await planOku(ie2!), { canli: true, sira: 1, eslesiyor: true, kaynak: { tur: 'kisi', id: yoneticiId }, zorunlu: true }, 'kişi kaynağında istasyon eşleşmesi yeter');
    await canliyaYerlestir(ie1!, { makine: makineler.get(ie1!)! });
    assert.deepEqual(await planOku(ie1!), { canli: true, sira: 1, eslesiyor: true, kaynak: { tur: 'makine', id: makineler.get(ie1!) }, zorunlu: true });
    for (const satir of [ieOlay(ie1!, 'running', { machine: r.ilk }), ieOlay(ie1!, 'paused', { machine: r.ilk })]) {
      assert.equal((await ekle(operator, 'events', satir)).durum, 200);
      assert.equal((await yansima(satir.cid))?.sonuc, 'yazildi');
    }
    await plandanCikar(ie1!);
    const devam = ieOlay(ie1!, 'running', { machine: r.ilk });
    assert.equal((await ekle(operator, 'events', devam)).durum, 200, 'başlamış işin devamı');
    assert.equal((await yansima(devam.cid))?.sonuc, 'yazildi');
  });

  // A4: Arkon Planlama'daki sıralama plan taslağına gider; canlı ve operatör müdür canlıya alana dek eski sırada kalır.
  test('Arkon Planlama sırası: TMI işinin sırası plan taslağına yazılır, canlı değişmez; eski ekran, geçersiz sıra ve yetkisiz reddedilir', async () => {
    const r = await rotaliEmirKur({ ucuncuIlkte: true });
    const [ie1, , ie3] = await isEmriIdleri(r.emirId);
    const kaynak = await makinesi(ie1!);
    const sirala = async (cerez: string, onceki: number[], yeni: number[]) => istek<{ taslakId: number; taslakAcildi: boolean }>(
      cerez, 'POST', '/arkon/plan-sira/sirala', { kaynak, onceki, yeni, planSurumu: await planSurumuOku() });
    const planlamaci = await kisiKur(`pl${(sayac += 1)}`, ['arkon.planlama', 'sayfa.arkon', 'plan.yaz']);
    const yazamayan = await kisiKur(`pl${(sayac += 1)}`, ['arkon.planlama', 'sayfa.arkon']);
    assert.equal((await sirala(operator, [ie1!, ie3!], [ie3!, ie1!])).durum, 403, 'Arkon operatörü');
    assert.equal((await sirala(yazamayan, [ie1!, ie3!], [ie3!, ie1!])).durum, 403, 'plan.yaz yok');
    assert.equal((await sirala(planlamaci, [ie1!, ie3!], [ie3!, ie3!])).durum, 400);
    assert.equal((await sirala(planlamaci, [ie3!, ie1!], [ie1!, ie3!])).durum, 409, 'ekranın gördüğü sıra canlıdakiyle aynı değil');
    // Ekran açıldıktan sonra aynı makinenin canlı kuyruğuna yeni iş girer (canlıya alma plan sürümünü artırır): ekranın sürümüyle sıralama reddedilir.
    const ekranSurumu = await planSurumuOku();
    await ortam!.sahip.sorgu('UPDATE plan_durumu SET surum = surum + 1');
    const eskiEkran = await istek(planlamaci, 'POST', '/arkon/plan-sira/sirala', { kaynak, onceki: [ie1!, ie3!], yeni: [ie3!, ie1!], planSurumu: ekranSurumu });
    assert.equal(eskiEkran.durum, 409, JSON.stringify(eskiEkran.govde));
    assert.match(JSON.stringify(eskiEkran.govde), /Plan değişti/);
    const c = await sirala(planlamaci, [ie1!, ie3!], [ie3!, ie1!]);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.taslakAcildi, true, 'reddedilen istekler taslak açmadı');
    const taslak = await ortam!.sahip.sorgu<{ id: number; s: number }>(
      'SELECT is_emri_id AS id, elle_sira AS s FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1 AND elle_sira IS NOT NULL ORDER BY elle_sira', [c.govde.taslakId]);
    assert.deepEqual(taslak.map((x) => x.id), [ie3, ie1]);
    const liste = await paketler();
    assert.equal((tmiPlani(liste.get(ieKimligi(ie1!))?.govde) as { sira: number }).sira, 1, 'canlı sıra değişmedi');
    assert.equal((tmiPlani(liste.get(ieKimligi(ie3!))?.govde) as { sira: number }).sira, 2);
    const ikinci = await sirala(planlamaci, [ie1!, ie3!], [ie3!, ie1!]);
    assert.equal(ikinci.durum, 200, JSON.stringify(ikinci.govde));
    assert.equal(ikinci.govde.taslakAcildi, false, 'aynı taslak');
  });

  // A4 denetim bulguları: Arkon rolü `plan.edit` ister (plan.yaz yetmez); yerinden oynamayan iş (kilitli, dondurulmuş) varken
  // kuyruğun geri kalanı sıralanır. 147 a: sıra taslakta kalır, paket bunu `siraOnayi` ile söyler (taslakta, onayda); taslak onaylanıp
  // canlıya alınınca Arkon yeni sırayı canlı plandan okur ve etiket kalkar.
  test('Arkon Planlama sırası: kilitli iş yerinde kalınca öteki işler sıralanır, yerinden oynatılırsa reddedilir; onay bekleyen sıra pakette görünür, canlıya alınınca paket sırası değişir', async () => {
    const r = await rotaliEmirKur({ ucuncuIlkte: true });
    const [ie1, ie2, ie3] = await isEmriIdleri(r.emirId);
    const kaynak = await makinesi(ie1!);
    // ADR 0018: canlıya alma sunucu motoruyla dizer; motor planlama sayfasının çalışma kaydı olmadan çözmez (409) ve vardiyası tanımsız
    // tezgâha yer vermez (168 b). Kayıt boş yazılır, bütün iş merkezleri her gün çalışır.
    const gunduz = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Yansima gunduz', '00:00', '23:59') RETURNING id"))!.id;
    await ortam!.sahip.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) SELECT m.id, g, $1 FROM is_merkezi m, generate_series(1, 7) g', [gunduz]);
    const kayit = await istek(yonetici, 'POST', '/plan/planlama-kayitlari/yaz', {
      anahtar: PLANLAMA_ANAHTARI, bicim: 'json', beklenenSurum: null,
      deger: {
        surum: 2, rrSavedAt: null, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
        w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
        D: { meta: { ad: 'Deneme', baslangic: tesisGunu(Date.now()) }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [],
          tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
      },
    });
    assert.equal(kayit.durum, 200, JSON.stringify(kayit.govde));
    await canliyaYerlestir(ie3!, { makine: kaynak.id }, 60);
    await canliyaYerlestir(ie2!, { makine: kaynak.id }, 100);
    await ortam!.sahip.sorgu('UPDATE plan_yerlesimi SET kilitli = true WHERE is_emri_id = $1', [ie1]);
    const sirala = async (cerez: string, onceki: number[], yeni: number[]) => istek<{ taslakId: number; taslakAcildi: boolean }>(
      cerez, 'POST', '/arkon/plan-sira/sirala', { kaynak, onceki, yeni, planSurumu: await planSurumuOku() });
    const amir = await kisiKur(`pl${(sayac += 1)}`, ['arkon.amir', 'sayfa.arkon', 'plan.yaz']);
    const planlamaci = await kisiKur(`pl${(sayac += 1)}`, ['arkon.planlama', 'sayfa.arkon', 'plan.yaz', 'plan.studyo']);
    const ret = await sirala(amir, [ie1!, ie3!, ie2!], [ie1!, ie2!, ie3!]);
    assert.equal(ret.durum, 403, 'plan.yaz var, Arkon rolünde plan.edit yok');
    assert.match(JSON.stringify(ret.govde), /İş sırasını değiştirme yetkiniz yok/);
    const oynar = await sirala(planlamaci, [ie1!, ie3!, ie2!], [ie3!, ie1!, ie2!]);
    assert.equal(oynar.durum, 409, JSON.stringify(oynar.govde));
    assert.match(JSON.stringify(oynar.govde), /yerinden oynatılamaz/);
    const c = await sirala(planlamaci, [ie1!, ie3!, ie2!], [ie1!, ie2!, ie3!]);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const taslak = await ortam!.sahip.sorgu<{ id: number }>(
      'SELECT is_emri_id AS id FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1 AND elle_sira IS NOT NULL ORDER BY elle_sira', [c.govde.taslakId]);
    assert.deepEqual(taslak.map((x) => x.id), [ie2, ie3], 'kilitli iş plana gitmez');
    const sira = async (ie: number) => (tmiPlani((await paketler()).get(ieKimligi(ie))?.govde) as { sira: number }).sira;
    const onay = async () => {
      const liste = await paketler();
      return [ie1!, ie2!, ie3!].map((ie) => (tmiPlani(liste.get(ieKimligi(ie))?.govde) as { siraOnayi?: string }).siraOnayi ?? null);
    };
    assert.deepEqual([await sira(ie1!), await sira(ie3!), await sira(ie2!)], [1, 2, 3], 'taslak canlıya alınmadı');
    assert.deepEqual(await onay(), [null, 'taslakta', 'taslakta'], 'yalnız taşınan işler; kilitli iş taslağa gitmedi');
    const surumu = async () => (await ortam!.sahip.tek<{ surum: number }>('SELECT surum FROM plan_senaryosu WHERE id = $1', [c.govde.taslakId]))!.surum;
    const gonder = await istek(planlamaci, 'POST', `/plan/senaryolar/${c.govde.taslakId}/onaya-gonder`, { surum: await surumu() });
    assert.equal(gonder.durum, 200, JSON.stringify(gonder.govde));
    assert.deepEqual(await onay(), [null, 'onayda', 'onayda']);
    assert.deepEqual([await sira(ie1!), await sira(ie3!), await sira(ie2!)], [1, 2, 3], 'onay bekleyen sıra canlı değil');
    const al = await istek(yonetici, 'POST', `/plan/senaryolar/${c.govde.taslakId}/canliya-al`, { surum: await surumu(), cakismalariKabul: true });
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
    assert.deepEqual([await sira(ie1!), await sira(ie2!), await sira(ie3!)], [1, 2, 3], 'canlıya alınınca yeni sıra');
    assert.deepEqual(await onay(), [null, null, null], 'canlıya alınan sıra artık beklemiyor');
  });

  // Kart #199 (3b): makinede çalışan işin önüne iş alınabilir, operatör öndeki işe geçince çalışan duraklatılır; dondurulmuş başlamış iş yerinde kalır.
  test('Arkon Planlama sırası: başlamış iş dondurulmamışsa önüne iş alınır ve taslağa gider; dondurulunca yerinden oynatılamaz', async () => {
    const r = await rotaliEmirKur({ ucuncuIlkte: true });
    const [ie1, ie2, ie3] = await isEmriIdleri(r.emirId);
    const kaynak = await makinesi(ie1!);
    await canliyaYerlestir(ie3!, { makine: kaynak.id }, 60);
    await canliyaYerlestir(ie2!, { makine: kaynak.id }, 100);
    const basla = ieOlay(ie1!, 'running', { machine: r.ilk });
    assert.equal((await ekle(operator, 'events', basla)).durum, 200);
    assert.equal((await yansima(basla.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(basla.cid)));
    assert.equal((await emirOku(r.emirId)).durum, 'basladi');
    const planlamaci = await kisiKur(`pl${(sayac += 1)}`, ['arkon.planlama', 'sayfa.arkon', 'plan.yaz']);
    const sirala = async (onceki: number[], yeni: number[]) => istek<{ taslakId: number; taslakAcildi: boolean }>(
      planlamaci, 'POST', '/arkon/plan-sira/sirala', { kaynak, onceki, yeni, planSurumu: await planSurumuOku() });
    const c = await sirala([ie1!, ie3!, ie2!], [ie3!, ie1!, ie2!]);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const taslak = await ortam!.sahip.sorgu<{ id: number }>(
      'SELECT is_emri_id AS id FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1 AND elle_sira IS NOT NULL ORDER BY elle_sira', [c.govde.taslakId]);
    assert.deepEqual(taslak.map((x) => x.id).filter((id) => [ie1, ie2, ie3].includes(id)), [ie3, ie1, ie2], 'başlamış iş de sıralanır');
    await ortam!.sahip.sorgu('UPDATE plan_yerlesimi SET dondurulmus = true WHERE is_emri_id = $1', [ie1]);
    const ret = await sirala([ie1!, ie3!, ie2!], [ie3!, ie1!, ie2!]);
    assert.equal(ret.durum, 409, JSON.stringify(ret.govde));
    assert.match(JSON.stringify(ret.govde), /Kilitli ya da dondurulmuş iş yerinden oynatılamaz/);
  });

  // Kart 527 (519 1 c, 522): Üretim Hazırlık kuyruğu kendi sırasını yazar, plan değişmez; paket plan saatini ve Hazırlık sırasını taşır.
  test('kuyruk sırası: Hazırlık istasyon kuyruğunu sıralar, plan ve taslak değişmez; eski ekran, geçersiz sıra, yetkisiz, kapsam dışı ve kilitli iş reddedilir; plan sırasına döner', async () => {
    const r = await rotaliEmirKur({ ucuncuIlkte: true });
    const [ie1, , ie3] = await isEmriIdleri(r.emirId);
    const [k1, k3] = [ieKimligi(ie1!), ieKimligi(ie3!)];
    const tmiAlani = (p: Paket | undefined, ad: string): unknown => (p?.['tmi'] as Record<string, unknown> | undefined)?.[ad];
    const sirala = (cerez: string, onceki: string[], yeni: string[], istasyon = r.ilk) =>
      istek<{ surum: number }>(cerez, 'POST', '/arkon/kuyruk-sira/sirala', { istasyon, onceki, yeni, kaynak: 'y1' });
    const hazirlikci = await kisiKur(`kq${(sayac += 1)}`, ['arkon.hazirlik', 'sayfa.arkon', 'arkon.kuyruk-sirala']);
    const planlamaci = await kisiKur(`kq${(sayac += 1)}`, ['arkon.planlama', 'sayfa.arkon', 'plan.yaz']);
    const ilk = await paketler();
    assert.equal(tmiAlani(ilk.get(k1)?.govde, 'kuyruk'), undefined, 'sıralanmamış kuyrukta Hazırlık sırası yok');
    const saat = tmiAlani(ilk.get(k1)?.govde, 'planSaati') as { baslangic: string; bitis: string };
    assert.ok(Date.parse(saat.bitis) > Date.parse(saat.baslangic), JSON.stringify(saat));
    const senaryolar = async () => (await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM plan_senaryosu'))!.n;
    const taslakOnce = await senaryolar();

    assert.equal((await sirala(operator, [k1, k3], [k3, k1])).durum, 403, 'Arkon operatörü');
    assert.equal((await sirala(planlamaci, [k1, k3], [k3, k1])).durum, 403, 'kuyruk işlemi olmayan planlamacı');
    assert.equal((await sirala(hazirlikci, [k1, k3], [k3, k3])).durum, 400, 'yinelenen iş');
    assert.equal((await sirala(hazirlikci, [k1, 'oz-p1'], ['oz-p1', k1])).durum, 400, 'TMI iş emri paketi değil');
    assert.equal((await sirala(hazirlikci, [k1], [k1])).durum, 409, 'ekran kuyruğun bir kısmını görüyor');
    assert.equal((await sirala(hazirlikci, [k1, k3], [k1, k3])).durum, 400, 'sıra değişmedi');
    assert.equal((await sirala(hazirlikci, [k1, k3], [k3, k1], 'YOK-ISTASYON')).durum, 404);

    const c = await sirala(hazirlikci, [k1, k3], [k3, k1]);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const sonra = await paketler();
    assert.deepEqual([k3, k1].map((k) => (tmiAlani(sonra.get(k)?.govde, 'kuyruk') as { sira: number }).sira), [1, 2]);
    assert.match((tmiAlani(sonra.get(k3)?.govde, 'kuyruk') as { kisi: string }).kisi, /^Deneme kq/, 'kişi sunucudan');
    assert.deepEqual([k1, k3].map((k) => (tmiPlani(sonra.get(k)?.govde) as { sira: number }).sira), [1, 2], 'canlı plan sırası değişmedi');
    assert.equal(await senaryolar(), taslakOnce, 'plan taslağı açılmadı');
    assert.equal((await sirala(hazirlikci, [k1, k3], [k3, k1])).durum, 409, 'ekran başkasının sıralamasından önceki sırayı görüyor');

    const yasakAdi = `kq${(sayac += 1)}`;
    await kisiKur(yasakAdi, ['arkon.hazirlik', 'sayfa.arkon', 'arkon.kuyruk-sirala']);
    await ortam!.sahip.sorgu("INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) SELECT id, $2 FROM kisi WHERE kullanici_adi = $1", [yasakAdi, r.ikinciMerkez]);
    assert.equal((await sirala(await girisCerezi(yasakAdi), [k3, k1], [k1, k3])).durum, 403, 'kapsam dışındaki istasyon');

    await ortam!.sahip.sorgu('UPDATE plan_yerlesimi SET kilitli = true WHERE is_emri_id = $1', [ie1]);
    const kilitli = await sirala(hazirlikci, [k3, k1], [k1, k3]);
    assert.equal(kilitli.durum, 409, JSON.stringify(kilitli.govde));
    assert.match(JSON.stringify(kilitli.govde), /yerinden oynatılamaz/);
    await ortam!.sahip.sorgu('UPDATE plan_yerlesimi SET kilitli = false WHERE is_emri_id = $1', [ie1]);

    const don = (cerez: string) => istek<{ silinen: number }>(cerez, 'POST', '/arkon/kuyruk-sira/plana-don', { istasyon: r.ilk, kaynak: 'y1' });
    assert.equal((await don(planlamaci)).durum, 403);
    const d = await don(hazirlikci);
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.equal(d.govde.silinen, 2);
    assert.equal(tmiAlani((await paketler()).get(k3)?.govde, 'kuyruk'), undefined, 'kuyruk yeniden plan sırasında');
    assert.equal((await don(hazirlikci)).durum, 409, 'Hazırlık sırası yok');
  });

  // Plan işi başka istasyona alınca Hazırlık sırası o işte geçersizdir: iş yeni istasyonunda sırasız durur.
  test('kuyruk sırası: plan işi başka istasyona alınca eski istasyondaki sıra işe uygulanmaz', async () => {
    const r = await rotaliEmirKur({ ucuncuIlkte: true });
    const [ie1, ie2, ie3] = await isEmriIdleri(r.emirId);
    const hazirlikci = await kisiKur(`kq${(sayac += 1)}`, ['arkon.hazirlik', 'sayfa.arkon', 'arkon.kuyruk-sirala']);
    const c = await istek(hazirlikci, 'POST', '/arkon/kuyruk-sira/sirala', { istasyon: r.ilk, onceki: [ieKimligi(ie1!), ieKimligi(ie3!)], yeni: [ieKimligi(ie3!), ieKimligi(ie1!)], kaynak: 'y1' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const ikinciMakine = (await makinesi(ie2!)).id;
    await ortam!.sahip.sorgu('UPDATE uretim_emirleri_is_emri SET makine_id = $2 WHERE id = $1', [ie3, ikinciMakine]);
    await canliyaYerlestir(ie3!, { makine: ikinciMakine }, 200);
    const p = (await paketler()).get(ieKimligi(ie3!))?.govde;
    assert.equal(p?.['machine'], r.ikinci);
    assert.equal((p?.['tmi'] as Record<string, unknown>)['kuyruk'], undefined);
  });

  // Demo 2.16 (kart #544): emrin bir adımı çalışırken aynı emrin bekleyen adımı Arkon'dan sıralanır (çalışan adım kart #199 3b testinde).
  test('Arkon Planlama sırası: başlamış emrin bekleyen adımının önüne başka emrin adımı alınır', async () => {
    const a = await rotaliEmirKur({ ucuncuIlkte: true });
    const [a1, , a3] = await isEmriIdleri(a.emirId);
    const kaynak = await makinesi(a1!);
    const b = await rotaliEmirKur({ ucuncuIlkte: true });
    const [, , b3] = await isEmriIdleri(b.emirId);
    await canliyaYerlestir(a3!, { makine: kaynak.id }, 60);
    await canliyaYerlestir(b3!, { makine: kaynak.id }, 120);
    const basla = ieOlay(a1!, 'running', { machine: a.ilk });
    assert.equal((await ekle(operator, 'events', basla)).durum, 200);
    assert.equal((await yansima(basla.cid))?.sonuc, 'yazildi');
    const planlamaci = await kisiKur(`pl${(sayac += 1)}`, ['arkon.planlama', 'sayfa.arkon', 'plan.yaz']);
    const sirala = async (onceki: number[], yeni: number[]) => istek<{ taslakId: number }>(
      planlamaci, 'POST', '/arkon/plan-sira/sirala', { kaynak, onceki, yeni, planSurumu: await planSurumuOku() });
    const c = await sirala([a1!, a3!, b3!], [a1!, b3!, a3!]);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const taslak = await ortam!.sahip.sorgu<{ id: number }>(
      'SELECT is_emri_id AS id FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1 AND elle_sira IS NOT NULL ORDER BY elle_sira', [c.govde.taslakId]);
    assert.deepEqual(taslak.map((x) => x.id).filter((id) => [a3, b3].includes(id)), [b3, a3]);
  });

  // Plan canlıya alınmadan yayınlanan paket, iş bitince "Planlanmadı" diye takılı kalmaz: bitmiş iş emrinin paketinde plan durumu yoktur.
  test('iş emri paketi: plandan önce yayınlanan paket iş emri bitince plan durumu taşımaz; yazımı da eklemez', async () => {
    const r = await rotaliEmirKur({ plansiz: true });
    const [ie1] = await isEmriIdleri(r.emirId);
    const taslak = (await paketOku(ieKimligi(ie1!)))!;
    assert.deepEqual(tmiPlani(taslak.govde), { canli: false, sira: null, eslesiyor: false, kaynak: null, zorunlu: false });
    const y = await paketYaz(ieKimligi(ie1!), null, { ...taslak.govde, status: 'published', steps: [{ id: 's1' }] });
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    const makine = (await ortam!.sahip.tek<{ m: number }>('SELECT makine_id AS m FROM uretim_emirleri_is_emri WHERE id = $1', [ie1]))!.m;
    await canliyaYerlestir(ie1!, { makine });
    for (const satir of [ieOlay(ie1!, 'running', { machine: r.ilk }), ieOlay(ie1!, 'done', { machine: r.ilk })]) {
      assert.equal((await ekle(operator, 'events', satir)).durum, 200);
      assert.equal((await yansima(satir.cid))?.sonuc, 'yazildi');
    }
    const kayitli = await vt().tek<{ g: Paket }>("SELECT govde AS g FROM arkon_belge WHERE depo = 'pkgs' AND kimlik = $1", [ieKimligi(ie1!)]);
    assert.deepEqual(tmiPlani(kayitli!.g), { canli: false, sira: null, eslesiyor: false, kaynak: null, zorunlu: false }, 'kayıtlı satır yayın anındaki durumu taşır');
    const tek = (await paketOku(ieKimligi(ie1!)))!;
    assert.equal(tmiPlani(tek.govde), undefined, 'tek okuma');
    const liste = (await paketler()).get(ieKimligi(ie1!));
    assert.equal(tmiPlani(liste?.govde), undefined, 'liste');
    assert.equal(liste?.surum, tek.surum);
    const yaz = await paketYaz(ieKimligi(ie1!), tek.surum, { ...tek.govde, note: 'bitti', tmi: { ...(tek.govde['tmi'] as object), plan: { canli: true } } });
    assert.equal(yaz.durum, 200, JSON.stringify(yaz.govde));
    assert.equal(yaz.govde.sonuc, 'yazildi', JSON.stringify(yaz.govde));
    const sonra = await vt().tek<{ g: Paket }>("SELECT govde AS g FROM arkon_belge WHERE depo = 'pkgs' AND kimlik = $1", [ieKimligi(ie1!)]);
    assert.equal(tmiPlani(sonra!.g), undefined, 'istemcinin gönderdiği plan yazılmaz');
    assert.equal(sonra!.g['note'], 'bitti');
    // Silme de aynı okumayla karşılaştırır: kayıtlı satırda eski plan dursa bile okunan sürümle silinir (eskiSurum değil).
    await ortam!.sahip.sorgu(
      `UPDATE arkon_belge SET govde = jsonb_set(govde, '{tmi,plan}', '{"canli": false, "sira": null, "eslesiyor": false}') WHERE depo = 'pkgs' AND kimlik = $1`, [ieKimligi(ie1!)]);
    const silinecek = (await paketOku(ieKimligi(ie1!)))!;
    assert.equal(tmiPlani(silinecek.govde), undefined);
    const sil = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${ieKimligi(ie1!)}/sil`, { taban: silinecek.surum, kaynak: 'y1' });
    assert.equal(sil.durum, 200, JSON.stringify(sil.govde));
    assert.equal(await paketOku(ieKimligi(ie1!)), null);
  });

  test('iş emri paketi (639): sonraki adımın paketi sırası gelmeden uyarıyla başlar ve sayar; önceki adım bitmeden bitmez; ilk adım bitince emir sürene geçer; bitmiş adımın paketi yazmaz', async () => {
    const r = await rotaliEmirKur();
    const [ie1, ie2] = await isEmriIdleri(r.emirId);
    const uyarisi = (c: { govde: unknown }, cid: string): string =>
      ((c.govde as { uyarilar?: { cid: string; ileti: string }[] }).uyarilar ?? []).find((u) => u.cid === cid)?.ileti ?? '';
    // 626 a: ikinci adımın paketiyle erken başlatma reddedilmez; TMI'de adım başlar, operatör uyarıyı görür.
    const erkenBasla = ieOlay(ie2!, 'running', { machine: r.ikinci });
    const basla = await ekle(operator, 'events', erkenBasla);
    assert.equal(basla.durum, 200, JSON.stringify(basla.govde));
    assert.equal((await yansima(erkenBasla.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(erkenBasla.cid)));
    assert.match(uyarisi(basla, erkenBasla.cid), /OP 10 bitmeden OP 20 başlatıldı\./);
    // 647 a: önceki adımın teslim etmediği parça sayılır, uyarır; sayım kendi adımına düşer.
    const erkenSayim = ieSayim(ie2!, 'good', 2, { machine: r.ikinci });
    const sayim = await ekle(operator, 'counts', erkenSayim);
    assert.equal(sayim.durum, 200);
    assert.equal((await yansima(erkenSayim.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(erkenSayim.cid)));
    assert.match(uyarisi(sayim, erkenSayim.cid), /2 fazla \(OP 20\)/);
    // İlk adım kendi paketiyle başlar ve sayar; ikinci adım ilk adım bitmeden bitmez (649 a).
    for (const [tur, satir] of [['events', ieOlay(ie1!, 'running', { machine: r.ilk })], ['counts', ieSayim(ie1!, 'good', 3, { machine: r.ilk })]] as const) {
      assert.equal((await ekle(operator, tur, satir)).durum, 200);
      assert.equal((await yansima(satir.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(satir.cid)));
    }
    await ilkParcaOnay(r.emirId);
    // İki açık adım: ilk adımın paketiyle duraklatma yalnız o adımı duraklatır, ikinci adım sürer; devam yine kendi adımına gider.
    const durak = ieOlay(ie1!, 'paused', { machine: r.ilk });
    assert.equal((await ekle(operator, 'events', durak)).durum, 200);
    assert.equal((await yansima(durak.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(durak.cid)));
    assert.deepEqual((await emirOku(r.emirId)).acikAdimlar?.map((a) => [a.isEmriId, a.calisma]), [[ie1, 'durakli'], [ie2, 'calisiyor']]);
    const devam = ieOlay(ie1!, 'running', { machine: r.ilk });
    assert.equal((await ekle(operator, 'events', devam)).durum, 200);
    assert.equal((await yansima(devam.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(devam.cid)));
    assert.deepEqual((await emirOku(r.emirId)).acikAdimlar?.map((a) => a.calisma), ['calisiyor', 'calisiyor']);
    const erkenBitir = ieOlay(ie2!, 'done', { machine: r.ikinci });
    assert.equal((await ekle(operator, 'events', erkenBitir)).durum, 200);
    assert.deepEqual([(await yansima(erkenBitir.cid))?.sonuc, (await yansima(erkenBitir.cid))?.neden], ['reddedildi', 'OP 10 bitmeden OP 20 bitirilemez; önce OP 10 bitirilmeli.']);
    const ilkBitir = ieOlay(ie1!, 'done', { machine: r.ilk });
    assert.equal((await ekle(operator, 'events', ilkBitir)).durum, 200);
    assert.equal((await yansima(ilkBitir.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(ilkBitir.cid)));
    const s = ieSayim(ie2!, 'good', 3, { machine: r.ikinci });
    assert.equal((await ekle(operator, 'counts', s)).durum, 200);
    assert.equal((await yansima(s.cid))?.sonuc, 'yazildi', JSON.stringify(await yansima(s.cid)));
    const calisan = (await adimliEmir(r.emirId)) as { emir: { isEmirleri: { id: number; durum: string; saglamAdet: number | null }[] } };
    assert.equal(calisan.emir.isEmirleri.find((i) => i.id === ie2)?.durum, 'calisiyor');
    assert.equal((await emirOku(r.emirId)).istasyon?.id, r.ikinciId);
    // Bitmiş adımın paketi: yeniden başlatma eşlenmez; yeniden gelen bitirme gizli türdendir (zaten bitmiş).
    const eski = ieOlay(ie1!, 'running', { machine: r.ilk });
    const eskiBitir = ieOlay(ie1!, 'done', { machine: r.ilk });
    assert.equal((await ekle(operator, 'events', eski)).durum, 200);
    assert.equal((await ekle(operator, 'events', eskiBitir)).durum, 200);
    assert.equal((await yansima(eski.cid))?.neden, PAKET_ADIM_SIRASI);
    assert.equal((await yansima(eskiBitir.cid))?.neden, BITMIS_BITIR);
    assert.equal(gizliYansimaTuru('eslenemedi', BITMIS_BITIR), 'zaten-bitmis');
    assert.equal((await adimliEmir(r.emirId) as typeof calisan).emir.isEmirleri.find((i) => i.id === ie2)?.durum, 'calisiyor');
    // Bulunamayan iş emri.
    const yok = ieOlay(999_999_999, 'running');
    assert.equal((await ekle(operator, 'events', yok)).durum, 200);
    assert.equal((await yansima(yok.cid))?.neden, 'TMI iş emri bulunamadı: 999999999.');
  });

  test('iş emri paketi kaydedilince Hazırlık ekleri kalır, TMI alanları istemciden alınmaz; iş emri değişince TMI alanları ve sürüm yenilenir, yeni sürümle yazım çakışmaz', async () => {
    const r = await rotaliEmirKur();
    const [ie1] = await isEmriIdleri(r.emirId);
    const k = ieKimligi(ie1!);
    const taslak = (await paketOku(k))!.govde;
    const ekler = { steps: [{ id: 's1', t: 'Ayna basıncı', d: '', r: true }], plan: [{ id: 1, nom: '10', min: 9.9, max: 10.1 }], rules: { warns: [] }, note: 'not' };
    const y = await paketYaz(k, null, { ...taslak, ...ekler, machine: r.ikinci, cycle: 5, no: 'ELLE', target: 1, tmi: { emirId: 1, isEmriId: 1, opNo: 1 } });
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    const kayitli = (await paketOku(k))!;
    assert.equal(kayitli.govde['machine'], r.ilk);
    assert.equal(kayitli.govde['cycle'], 60);
    assert.equal(kayitli.govde['no'], taslak['no']);
    assert.equal(kayitli.govde['target'], 20);
    assert.deepEqual(kayitli.govde['tmi'], taslak['tmi']);
    assert.deepEqual(kayitli.govde['steps'], ekler.steps);
    // Kayıtlı satırın kendisi de TMI alanlarıyla yazılır (yalnız okumada birleştirme değil).
    const satir = await vt().tek<{ govde: Paket }>("SELECT govde FROM arkon_belge WHERE depo = 'pkgs' AND kimlik = $1", [k]);
    assert.equal(satir?.govde['machine'], r.ilk);
    assert.equal(satir?.govde['cycle'], 60);
    assert.equal(satir?.govde['no'], taslak['no']);
    // "Emirlere uygula" benzeri değişiklik: birim süre iş emrinde değişir.
    await ortam!.sahip.sorgu('UPDATE uretim_emirleri_is_emri SET birim_sure_dk = 2 WHERE id = $1', [ie1]);
    const yeni = (await paketOku(k))!;
    assert.equal(yeni.govde['cycle'], 120);
    assert.deepEqual(yeni.govde['steps'], ekler.steps);
    assert.deepEqual(yeni.govde['plan'], ekler.plan);
    assert.notEqual(yeni.surum, kayitli.surum);
    assert.equal((await paketler()).get(k)?.surum, yeni.surum);
    const sonra = await paketYaz(k, yeni.surum, { ...yeni.govde, note: 'yeni not' });
    assert.equal(sonra.govde.sonuc, 'yazildi', JSON.stringify(sonra.govde));
    // Eski sürümle yazım çakışır ve güncel (TMI alanları yazılmış) belgeyi döner.
    const eskiYazim = await istek<{ sonuc: string; guncel?: { govde: Paket } }>(yonetici, 'POST', `/arkon/belgeler/pkgs/${k}/yaz`, { taban: kayitli.surum, govde: kayitli.govde, kaynak: 'y1' });
    assert.equal(eskiYazim.govde.sonuc, 'cakisma', JSON.stringify(eskiYazim.govde));
    assert.equal(eskiYazim.govde.guncel?.govde['cycle'], 120);
    // Okunan sürümle silme de çakışmaz.
    const silinecek = (await paketOku(k))!;
    const sil = await istek(yonetici, 'POST', `/arkon/belgeler/pkgs/${k}/sil`, { taban: silinecek.surum, kaynak: 'y1' });
    assert.equal(sil.durum, 200, JSON.stringify(sil.govde));
  });

  test('yayın biçimi 2a: aynı parça ve operasyonun son yayınlanmış paketi yeni emrin taslağına şablon olur (plan, kural, adım), taslak yayında değildir; başka operasyona olmaz', async () => {
    const r1 = await rotaliEmirKur();
    const [a1] = await isEmriIdleri(r1.emirId);
    const t1 = (await paketOku(ieKimligi(a1!)))!.govde;
    const ekler = { steps: [{ id: 's1', t: 'Şablon adımı', d: '', r: true }], plan: [{ id: 1, nom: '20', min: 19.9, max: 20.1 }], rules: { warns: [{ id: 'w1', t: 'Uyarı' }] }, material: 'S355' };
    assert.equal((await paketYaz(ieKimligi(a1!), null, { ...t1, ...ekler, status: 'published', version: 1, publishedAt: 1_000 })).durum, 200);
    const r2 = await rotaliEmirKur({ kart: r1.kart });
    const [b1, b2] = await isEmriIdleri(r2.emirId);
    const liste = await paketler();
    const yeni1 = liste.get(ieKimligi(b1!))?.govde;
    const yeni2 = liste.get(ieKimligi(b2!))?.govde;
    assert.deepEqual(yeni1?.['steps'], ekler.steps);
    assert.deepEqual(yeni1?.['plan'], ekler.plan);
    assert.deepEqual(yeni1?.['rules'], ekler.rules);
    assert.equal(yeni1?.['material'], 'S355');
    assert.equal(yeni1?.['status'], 'draft');
    assert.equal(yeni1?.['machine'], r2.ilk);
    assert.equal(yeni1?.['no'], (await emirOku(r2.emirId)).emirNo);
    assert.deepEqual(yeni2?.['steps'], []);
    assert.deepEqual(yeni2?.['plan'], []);
  });

  test('geçiş ve kapanış: kayıtlı eski paketi olan rotalı emre iş emri paketi açılmaz; iptal edilen emrin kayıtlı iş emri paketi düşer; açık olmayan iş emrine paket yazılamaz', async () => {
    const r = await rotaliEmirKur();
    await paketiKaydet(r.emirId, r.ilk);
    const [ie1] = await isEmriIdleri(r.emirId);
    const liste = await paketler();
    assert.ok(liste.has(pk(r.emirId)));
    assert.ok(!liste.has(ieKimligi(ie1!)), 'geçişteki emre iş emri paketi açıldı');
    assert.equal(await paketOku(ieKimligi(ie1!)), null);
    const r2 = await rotaliEmirKur();
    const [c1] = await isEmriIdleri(r2.emirId);
    // Rotalı emre kayıtsız (eski biçim) emir paketinden gelen kayıt işlenmez.
    const eskiBicim = olay(r2.emirId, 'running', { machine: r2.ilk });
    assert.equal((await ekle(operator, 'events', eskiBicim)).durum, 200);
    assert.equal((await yansima(eskiBicim.cid))?.neden, ROTALI_EMIR_PAKETI);
    assert.equal((await emirOku(r2.emirId)).durum, 'planli');
    const t = (await paketOku(ieKimligi(c1!)))!.govde;
    assert.equal((await paketYaz(ieKimligi(c1!), null, { ...t, note: 'kayıt' })).durum, 200);
    const ayrinti = (await adimliEmir(r2.emirId)) as { emir: { surum: number } };
    const iptal = await istek(yonetici, 'POST', `/adimli-emirler/${r2.emirId}/iptal`, { surum: ayrinti.emir.surum });
    assert.equal(iptal.durum, 200, JSON.stringify(iptal.govde));
    assert.ok(!(await paketler()).has(ieKimligi(c1!)), 'iptal edilen emrin iş emri paketi listede');
    assert.equal(await paketOku(ieKimligi(c1!)), null);
    const yok = await paketYaz(ieKimligi(999_999_998), null, { id: ieKimligi(999_999_998), machine: r.ilk });
    assert.equal(yok.durum, 400, JSON.stringify(yok.govde));
  });

  test('iş emri paketinde veri kapsamı: iş merkezi kısıtlı kişi yalnız kendi istasyonundaki adımın paketini görür ve yazar', async () => {
    const kisitli = await kisiKur('op9', ['arkon.operator', 'arkon.hazirlik', 'sayfa.arkon', 'terminal.uret']);
    const kisi = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'op9'");
    const r = await rotaliEmirKur();
    const [ie1, ie2] = await isEmriIdleri(r.emirId);
    assert.equal((await istek(yonetici, 'POST', `/kisi-is-merkezleri/${kisi?.id}/belirle`, { isMerkeziIdleri: [r.ilkMerkez] })).durum, 200);
    const kisitliOp = await kisiKur('op10', ['arkon.operator', 'sayfa.arkon', 'terminal.uret']);
    const opKisi = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'op10'");
    assert.equal((await istek(yonetici, 'POST', `/kisi-is-merkezleri/${opKisi?.id}/belirle`, { isMerkeziIdleri: [r.ilkMerkez] })).durum, 200);
    const gorunen = await paketler(kisitli);
    assert.ok(gorunen.has(ieKimligi(ie1!)));
    assert.ok(!gorunen.has(ieKimligi(ie2!)));
    const t2 = (await paketOku(ieKimligi(ie2!)))!.govde;
    assert.equal((await paketYaz(ieKimligi(ie2!), null, { ...t2, note: 'x' }, kisitli)).durum, 403);
    const t1 = (await paketOku(ieKimligi(ie1!)))!.govde;
    assert.equal((await paketYaz(ieKimligi(ie1!), null, { ...t1, note: 'x' }, kisitli)).durum, 200);
    // İki adımın paketi de kayıtlıyken (aynı emir no, farklı iş merkezi) kendi adımının kaydı emir numarasıyla da yazılır.
    assert.equal((await paketYaz(ieKimligi(ie2!), null, { ...t2, note: 'y' })).durum, 200);
    const kendi = ieOlay(ie1!, 'setup', { machine: r.ilk, orderNo: t1['no'] });
    const kc = await ekle(kisitliOp, 'events', kendi);
    assert.equal(kc.durum, 200, JSON.stringify(kc.govde));
    const yabanci = ieOlay(ie2!, 'setup', { machine: r.ilk, orderNo: t1['no'] });
    assert.equal((await ekle(kisitliOp, 'events', yabanci)).durum, 403);
    // Kendi paketine başka emrin numarasıyla kayıt yazılmaz.
    const sahteNo = ieOlay(ie1!, 'setup', { machine: r.ilk, orderNo: 'UE-BASKA' });
    assert.equal((await ekle(kisitliOp, 'events', sahteNo)).durum, 400);
    assert.equal(await kayitSayisi(sahteNo.cid), 0);
    // Plan birinci adımı ikinci istasyonun makinesine alınca kapsam kayıtlı makineye değil iş emrinin yerine bakar.
    const m2 = await ortam!.sahip.tek<{ id: number }>('SELECT id FROM makine WHERE kod = $1', [r.makineKodlari[1]]);
    await ortam!.sahip.sorgu('UPDATE uretim_emirleri_is_emri SET makine_id = $1, istasyon_id = $2 WHERE id = $3', [m2!.id, r.ikinciId, ie1]);
    assert.equal((await ekle(kisitliOp, 'events', ieOlay(ie1!, 'setup', { machine: r.ilk }))).durum, 403);
    assert.ok(!(await paketler(kisitli)).has(ieKimligi(ie1!)), 'başka istasyona alınan adım kısıtlı kişide görünüyor');
    // Paket yazımı ve silmesi de iş emrinin bugünkü yerine bakar: eski istasyonun kişisi silemez, yeni istasyonun kişisi yazar.
    const yeniYer = await kisiKur('op11', ['arkon.hazirlik', 'sayfa.arkon']);
    const yeniKisi = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'op11'");
    assert.equal((await istek(yonetici, 'POST', `/kisi-is-merkezleri/${yeniKisi?.id}/belirle`, { isMerkeziIdleri: [r.ikinciMerkez] })).durum, 200);
    const tasinan = (await paketOku(ieKimligi(ie1!)))!;
    assert.equal(tasinan.govde['machine'], r.ikinci);
    assert.equal((await paketYaz(ieKimligi(ie1!), tasinan.surum, { ...tasinan.govde, note: 'yeni yer' }, yeniYer)).durum, 200);
    const sonSurum = (await paketOku(ieKimligi(ie1!)))!.surum;
    assert.equal((await istek(kisitli, 'POST', `/arkon/belgeler/pkgs/${ieKimligi(ie1!)}/sil`, { taban: sonSurum, kaynak: 'y1' })).durum, 403);
  });

  test('iş emri paketinden açılan malzeme isteği stokta paketin üretim emrine bağlanır', async () => {
    const sahip = ortam!.sahip;
    const r = await rotaliEmirKur();
    const [ie1] = await isEmriIdleri(r.emirId);
    sayac += 1;
    const sarf = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'sarf', 'YNS-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`yns-${sayac}`, sayac, JSON.stringify({ id: `yns-${sayac}`, com: { ad: `Sarf ${sayac}` } }), yoneticiId],
    ))!.no;
    const kimlik = `lg-ie-${sayac}`;
    const y = await istek(operator, 'POST', `/arkon/belgeler/logi/${kimlik}/yaz`, {
      taban: null, kaynak: 'y1', govde: { id: kimlik, kind: 'req', st: r.ilk, item: 'Sarf', malzemeId: sarf, qty: 1, status: 'open', pkgId: ieKimligi(ie1!) },
    });
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    const stokta = await sahip.tek<{ uretim_emri_id: number | null }>('SELECT uretim_emri_id FROM stok_malzeme_istegi WHERE kaynak_kimligi = $1', [`arkon:logi:${kimlik}`]);
    assert.equal(stokta?.uretim_emri_id, r.emirId);
  });
  /* ---------------- parti kolu (B8, kart #199): adım türü, birleşme retleri, katılmış kol ---------------- */

  const KOL_ONCEKI_BITMEDI = 'Kol, üst emirde bölündüğü adımdan önceki adım bitmeden başlamaz.';

  // Rotalı emrin verilen adımından (varsayılan 2) 3 adetlik kol ayırır; birleştirme için iki parti aynı adımda beklemelidir (adimSira 1). `rework` verilirse kola açıklamalı bir rework adımı (op 15) konur.
  async function kolAc(r: Awaited<ReturnType<typeof rotaliEmirKur>>, rework?: string, adimSira = 2, birlesmeOpNo?: number): Promise<{ kol: number; kolAdimlari: number[]; ilkMakine: number }> {
    const sahip = ortam!.sahip;
    const [ie1] = await isEmriIdleri(r.emirId);
    const ilk = (await sahip.tek<{ tip: number; makine: number }>('SELECT operasyon_tipi_id AS tip, makine_id AS makine FROM uretim_emirleri_is_emri WHERE id = $1', [ie1]))!;
    const ekAdimlar = rework === undefined ? [] : [{
      oncekiOpNo: null, opNo: 15, tur: 'rework', ad: 'Rework', operasyonTipiId: ilk.tip, kaynak: { tur: 'makine', id: ilk.makine }, ayarSuresiDk: '5', birimSureDk: '2', terminGun: null, aciklama: rework,
    }];
    const surum = ((await adimliEmir(r.emirId)) as { emir: { surum: number } }).emir.surum;
    const b = await istek<{ altEmirId: number }>(yonetici, 'POST', `/adimli-emirler/${r.emirId}/bol`, { adimSira, adet: 3, surum, ekAdimlar, ...(birlesmeOpNo === undefined ? {} : { birlesmeOpNo }) });
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    // Kolun kopyalanan ilk adımının kaynağı boş başlar (plan atar); fikstür aynı makineye atar ki paketi listelensin.
    const kolAdimlari = await isEmriIdleri(b.govde.altEmirId);
    await sahip.sorgu('UPDATE uretim_emirleri_is_emri SET makine_id = $1, istasyon_id = $2 WHERE id = ANY($3::int[]) AND makine_id IS NULL AND kisi_id IS NULL AND fason_firma_id IS NULL',
      [ilk.makine, r.ilkId, kolAdimlari]);
    await sahip.sorgu('UPDATE uretim_emri SET istasyon_id = $1 WHERE id = $2 AND istasyon_id IS NULL', [r.ilkId, b.govde.altEmirId]);
    return { kol: b.govde.altEmirId, kolAdimlari, ilkMakine: ilk.makine };
  }
  const tmiAlani = (p: Paket | undefined): Record<string, unknown> => ((p?.['tmi'] ?? {}) as Record<string, unknown>);

  test('parti kolu: rework adımının türü ve açıklaması pakette görünür ve iş emrinden yenilenir; rota adımında tür/açıklama yoktur', async () => {
    const r = await rotaliEmirKur();
    const { kol, kolAdimlari } = await kolAc(r, 'Çapak alınacak');
    const [rework, rota] = kolAdimlari;
    const liste = await paketler();
    assert.deepEqual([tmiAlani(liste.get(ieKimligi(rework!))?.govde)['tur'], tmiAlani(liste.get(ieKimligi(rework!))?.govde)['ekAciklama']], ['rework', 'Çapak alınacak']);
    for (const ie of [rota!, ...(await isEmriIdleri(r.emirId))]) {
      const t = tmiAlani(liste.get(ieKimligi(ie))?.govde);
      assert.ok(liste.has(ieKimligi(ie)), `paket yok: ${ie}`);
      assert.ok(!('tur' in t) && !('ekAciklama' in t), `rota adımı etiket taşıyor: ${JSON.stringify(t)}`);
    }
    // Kayıtlı pakette de iş emrinden yenilenir (TMI alanı).
    const taslak = liste.get(ieKimligi(rework!))!;
    assert.equal((await paketYaz(ieKimligi(rework!), null, taslak.govde)).durum, 200);
    await ortam!.sahip.sorgu("UPDATE uretim_emirleri_is_emri SET ek_aciklama = 'Yeni not' WHERE id = $1", [rework]);
    assert.equal(tmiAlani((await paketOku(ieKimligi(rework!)))?.govde)['ekAciklama'], 'Yeni not');
    assert.ok(kol > 0);
  });

  test('parti kolu: kol kuralı (önceki adım bitmedi) ve birleşme kuralı (kol gelmedi) kayıttan önce 409 döner, kayıt yazılmaz; kabul edilen kayıtta ret yoktur', async () => {
    const r = await rotaliEmirKur({ ucuncuIlkte: true });
    const { kolAdimlari, ilkMakine } = await kolAc(r, 'Çapak', 2, 30);
    const [rework] = kolAdimlari;
    await canliyaYerlestir(rework!, { makine: ilkMakine });
    const kayitVar = async (cid: string): Promise<boolean> =>
      (await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_kayit WHERE cid = $1', [cid]))!.n > 0;
    const red = ieOlay(rework!, 'running', { machine: r.ilk });
    const c = await ekle(operator, 'events', red);
    assert.equal(c.durum, 409, JSON.stringify(c.govde));
    assert.match(JSON.stringify(c.govde), new RegExp(KOL_ONCEKI_BITMEDI.replace(/[.,]/g, '.')));
    assert.equal(await kayitVar(red.cid), false);
    assert.equal((await yansima(red.cid)) ?? null, null);
    const [ie1, , ie3] = await isEmriIdleri(r.emirId);
    const birlesmeBitir = ieOlay(ie3!, 'done', { machine: r.ilk });
    const b = await ekle(operator, 'events', birlesmeBitir);
    assert.equal(b.durum, 409, JSON.stringify(b.govde));
    assert.match(JSON.stringify(b.govde), /birleşecek parti henüz gelmedi/);
    assert.equal(await kayitVar(birlesmeBitir.cid), false);
    // Ret olmayan kayıt: üstün ilk adımı başlar.
    const iyi = await ekle(operator, 'events', ieOlay(ie1!, 'running', { machine: r.ilk })) as Cevap<{ eklenen: number; reddedilen: unknown[] }>;
    assert.deepEqual([iyi.durum, iyi.govde.eklenen, iyi.govde.reddedilen], [200, 1, []]);
  });

  test('parti kolu: üste katılan (iptal) kolun kayıtlı paketi Arkon listesinden ve tek okumadan düşer, kaydı alınmaz; üstün paketleri kalır', async () => {
    const r = await rotaliEmirKur();
    const { kol, kolAdimlari } = await kolAc(r, undefined, 1);
    const [kolIe] = kolAdimlari;
    const listeOnce = await paketler();
    assert.ok(listeOnce.has(ieKimligi(kolIe!)), `kolun paketi önce listede olmalı`);
    assert.equal((await paketYaz(ieKimligi(kolIe!), null, listeOnce.get(ieKimligi(kolIe!))!.govde)).durum, 200);
    assert.ok((await paketler()).has(ieKimligi(kolIe!)), 'kayıtlı kol paketi listede olmalı');
    const sv = async (id: number) => ((await adimliEmir(id)) as { emir: { surum: number } }).emir.surum;
    const katil = await istek(yonetici, 'POST', `/adimli-emirler/${r.emirId}/birlestir`, { kaynakEmirId: kol, surum: await sv(r.emirId), kaynakSurum: await sv(kol) });
    assert.equal(katil.durum, 200, JSON.stringify(katil.govde));
    const liste = await paketler();
    assert.ok(!liste.has(ieKimligi(kolIe!)), 'katılmış kolun paketi listede');
    assert.equal(await paketOku(ieKimligi(kolIe!)), null);
    const o = ieOlay(kolIe!, 'setup', { machine: r.ilk });
    assert.equal((await ekle(operator, 'events', o)).durum, 403);
    assert.equal(await kayitSayisi(o.cid), 0);
    for (const ie of await isEmriIdleri(r.emirId)) assert.ok(liste.has(ieKimligi(ie)), `üst paketi düştü: ${ie}`);
  });

  // ---------------- terminal: makine seçimi, makine devralma ve aynı işe katılım (kart #1148) ----------------

  type KayitCevabi = { eklenen: number; reddedilen: { cid: string; ileti: string; makineDolu?: { devralEmirId: number; doluOlan: { kullanimId: number; makine: { id: number; ad: string } | null; emir: { id: number; emirNo: string }; kisi: { id: number; ad: string } } }; tmiDurum?: string }[]; uyarilar: { cid: string; ileti: string }[] };
  const olayEkle = (cerez: string, satir: Record<string, unknown>) => istek<KayitCevabi>(cerez, 'POST', `/arkon/kayitlar/events/ekle`, { satirlar: [satir], kaynak: 'y1' });
  const kisiKimligi = async (kullaniciAdi: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM kisi WHERE kullanici_adi = $1', [kullaniciAdi]))!.id;
  const operatorKur = async (ad: string): Promise<string> => {
    const cerez = await kisiKur(ad, ['arkon.operator', 'sayfa.arkon', 'terminal.uret']);
    // UE20: yeni operatör o anki istasyonda yetkindir.
    await vt().sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $2 FROM kisi WHERE kullanici_adi = $1', [ad, istasyonId]);
    return cerez;
  };
  async function makineEkle(ad: string): Promise<{ id: number; kod: string }> {
    const kod = `YMK${(sayac += 1)}`;
    const m = await vt().tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [kod, ad, istasyonId]);
    return { id: m!.id, kod };
  }
  const acikKullanimlar = (emirId: number) => vt().sorgu<{ makine_id: number | null; kisi_id: number }>(
    'SELECT makine_id, kisi_id FROM uretim_emirleri_makine_kullanimi WHERE emir_id = $1 AND bitis IS NULL ORDER BY makine_id', [emirId]);
  const insanliYap = () => ortam!.sahip.sorgu("UPDATE istasyon SET kapasite_kaynagi = 'insan' WHERE id = $1", [istasyonId]);
  async function ekibeAl(kullaniciAdi: string): Promise<void> {
    const kod = `YEK${(sayac += 1)}`;
    const ekip = await vt().tek<{ id: number }>('INSERT INTO ekip (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [kod, 'Yansıma ekibi', istasyonId]);
    await vt().sorgu('INSERT INTO ekip_uye (ekip_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, current_date, 10)', [ekip!.id, await kisiKimligi(kullaniciAdi)]);
  }

  test('makine seçimi: seçilen makinede başlar, seçilmezse istasyon yerinde; bilinmeyen, başka istasyonun ve biçimsiz seçim reddedilir', async () => {
    await yeniIstasyon();
    const m1 = await makineEkle('Torna 1');
    const m2 = await makineEkle('Torna 2');
    const emir = await emirAc();
    const secili = olay(emir, 'running', { mcs: [m2.kod] });
    const c = await olayEkle(operator, secili);
    assert.deepEqual([c.durum, c.govde.reddedilen, c.govde.uyarilar], [200, [], []]);
    assert.deepEqual((await acikKullanimlar(emir)).map((k) => k.makine_id), [m2.id], 'yalnız seçilen makine tutulur');
    assert.equal((await yansima(String(secili['cid'])))?.sonuc, 'yazildi');
    // Seçilmezse (mcs yok) iş emrinin makinesi kullanılır; atanmış makine yoksa istasyonun makinesiz yeri.
    const diger = await emirAc();
    assert.equal((await olayEkle(operator, olay(diger, 'running'))).govde.reddedilen.length, 0);
    assert.deepEqual((await acikKullanimlar(diger)).map((k) => k.makine_id), [null]);
    // Çoklu seçim: bir kişi birden çok makinede tutar.
    await olayEkle(operator, olay(diger, 'paused'));
    await olayEkle(operator, olay(emir, 'paused'));
    const cok = await olayEkle(operator, olay(emir, 'running', { mcs: [m1.kod, m2.kod] }));
    assert.deepEqual(cok.govde.reddedilen, []);
    assert.deepEqual((await acikKullanimlar(emir)).map((k) => k.makine_id).sort(), [m1.id, m2.id].sort());
    // Reddedilenler.
    await olayEkle(operator, olay(emir, 'paused'));
    const yok = await olayEkle(operator, olay(emir, 'running', { mcs: ['YOK-MAKINE'] }));
    assert.match(yok.govde.reddedilen[0]?.ileti ?? '', /Makine TMI'de yok ya da pasif: YOK-MAKINE/);
    await yeniIstasyon();
    const baska = await makineEkle('Başka istasyonun makinesi');
    const sonEmir = await emirAc();
    const baskaOlay = olay(sonEmir, 'running', { mcs: [m1.kod] });
    const baskaCevap = await olayEkle(operator, baskaOlay);
    assert.equal(baskaCevap.govde.reddedilen.length, 1, 'başka istasyonun makinesi seçilemez');
    assert.equal((await olayEkle(operator, olay(sonEmir, 'running', { mcs: [baska.kod] }))).govde.reddedilen.length, 0);
    const bicimsiz = olay(await emirAc(), 'running', { mcs: 'M1' });
    assert.equal((await olayEkle(operator, bicimsiz)).durum, 200);
    const y = await yansima(String(bicimsiz['cid']));
    assert.equal(y?.sonuc, 'eslenemedi');
    assert.match(y?.neden ?? '', /Makine seçimi geçersiz/);
  });

  test('dolu makine: başlatma reddedilir ve cevap kimin hangi işi başlattığını verir; aynı işin aynı makinede yeniden başlatılması devralınamaz', async () => {
    await yeniIstasyon();
    const m = await makineEkle('Freze 1');
    const op2 = await operatorKur('mk2');
    const ilk = await emirAc();
    const ikinci = await emirAc();
    assert.deepEqual((await olayEkle(operator, olay(ilk, 'running', { mcs: [m.kod] }))).govde.reddedilen, []);
    const dolu = olay(ikinci, 'running', { mcs: [m.kod] });
    const c = await olayEkle(op2, dolu);
    assert.equal(c.durum, 200);
    const red = c.govde.reddedilen[0];
    assert.equal(red?.cid, dolu['cid']);
    assert.deepEqual(
      [red?.makineDolu?.devralEmirId, red?.makineDolu?.doluOlan.emir.id, red?.makineDolu?.doluOlan.kisi.id, red?.makineDolu?.doluOlan.makine?.id],
      [ikinci, ilk, operatorId, m.id]);
    assert.ok((red?.makineDolu?.doluOlan.kullanimId ?? 0) > 0);
    assert.equal((await yansima(String(dolu['cid'])))?.sonuc, 'reddedildi');
    assert.equal((await emirOku(ikinci)).durum, 'planli', 'dolu makinede iş başlamaz');
    // Aynı iş aynı makinede: hata var, devralma önerisi yok.
    const ayni = await olayEkle(op2, olay(ilk, 'running', { mcs: [m.kod] }));
    assert.equal(ayni.govde.reddedilen.length, 1);
    assert.equal(ayni.govde.reddedilen[0]?.makineDolu, undefined);
    assert.deepEqual((await acikKullanimlar(ilk)).map((k) => k.makine_id), [m.id], 'çalışan iş etkilenmez');
  });

  test('makine devralma: onaylanınca öteki iş durur ve onun için başlar; eski kullanım, yetkisiz ve oturumsuz reddedilir ve öteki işe dokunmaz', async () => {
    await yeniIstasyon();
    const m = await makineEkle('Freze 2');
    const op2 = await operatorKur('mk3');
    const ilk = await emirAc();
    const ikinci = await emirAc();
    await olayEkle(operator, olay(ilk, 'running', { mcs: [m.kod] }));
    const red = (await olayEkle(op2, olay(ikinci, 'running', { mcs: [m.kod] }))).govde.reddedilen[0]!;
    const kullanimId = red.makineDolu!.doluOlan.kullanimId;
    const devral = (cerez: string, govde: unknown) => istek<{ tamam?: true; mesaj?: string }>(cerez, 'POST', '/arkon/makine-devral', govde);
    assert.equal((await devral(op2, { emirId: ikinci, kullanimId: kullanimId + 1000 })).durum, 409);
    assert.equal((await devral(yetkisiz, { emirId: ikinci, kullanimId })).durum, 403, 'terminal.uret olmayan devralamaz');
    assert.equal((await devral('', { emirId: ikinci, kullanimId })).durum, 401);
    assert.equal((await emirOku(ilk)).canli?.calisma, 'calisiyor', 'reddedilen devralma öteki işe dokunmaz');
    const ok = await devral(op2, { emirId: ikinci, kullanimId });
    assert.equal(ok.durum, 200, JSON.stringify(ok.govde));
    assert.equal((await emirOku(ilk)).canli?.calisma, 'durakli', 'devralınan iş duraklar');
    assert.deepEqual([(await emirOku(ikinci)).durum, (await emirOku(ikinci)).canli?.calisma], ['basladi', 'calisiyor']);
    assert.deepEqual((await acikKullanimlar(ikinci)).map((k) => [k.makine_id, k.kisi_id]), [[m.id, await kisiKimligi('mk3')]]);
    assert.deepEqual(await acikKullanimlar(ilk), []);
    // Aynı kullanım ikinci kez devralınamaz (artık kapalı).
    assert.equal((await devral(op2, { emirId: ikinci, kullanimId })).durum, 409);
  });

  test('devralma iki işin TMI hâlini istasyona ileti olarak yayar; başka istasyondaki emrin hâli yayılmaz', async () => {
    await yeniIstasyon();
    const m = await makineEkle('Freze 4');
    const op2 = await operatorKur('mk5');
    const ilk = await emirAc();
    const ikinci = await emirAc();
    await olayEkle(operator, olay(ilk, 'running', { mcs: [m.kod] }));
    const red = (await olayEkle(op2, olay(ikinci, 'running', { mcs: [m.kod] }))).govde.reddedilen[0]!;
    assert.equal(red.makineDolu?.doluOlan.emir.id, ilk);
    const durumIletileri = async () => (await vt().sorgu<{ govde: Record<string, unknown> }>(
      "SELECT govde FROM arkon_ileti WHERE govde->>'type' = '$durum' ORDER BY id")).map((r) => r.govde);
    const once = (await durumIletileri()).length;
    const ok = await istek(op2, 'POST', '/arkon/makine-devral', { emirId: ikinci, kullanimId: red.makineDolu!.doluOlan.kullanimId, durdurulanEmirId: ilk });
    assert.equal(ok.durum, 200, JSON.stringify(ok.govde));
    assert.deepEqual((await durumIletileri()).slice(once), [
      { type: '$durum', machine: istasyonKodu, orderNo: (await emirOku(ikinci)).emirNo, state: 'running' },
      { type: '$durum', machine: istasyonKodu, orderNo: (await emirOku(ilk)).emirNo, state: 'paused' },
    ]);
    // Gövdedeki durdurulan emir başka istasyondaysa onun hâli duyurulmaz.
    await yeniIstasyon();
    await vt().sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi = 'mk5'", [istasyonId]);
    const m2 = await makineEkle('Freze 5');
    const ucuncu = await emirAc();
    const dorduncu = await emirAc();
    await olayEkle(op2, olay(dorduncu, 'running', { mcs: [m2.kod] }));
    const red2 = (await olayEkle(operator, olay(ucuncu, 'running', { mcs: [m2.kod] }))).govde.reddedilen[0]!;
    const sonra = (await durumIletileri()).length;
    const ok2 = await istek(operator, 'POST', '/arkon/makine-devral', { emirId: ucuncu, kullanimId: red2.makineDolu!.doluOlan.kullanimId, durdurulanEmirId: ilk });
    assert.equal(ok2.durum, 200, JSON.stringify(ok2.govde));
    assert.deepEqual((await durumIletileri()).slice(sonra).map((g) => g['orderNo']), [(await emirOku(ucuncu)).emirNo]);
  });

  test('devralma reddedilmiş kaydı çözer: kaydı yazan kişi devralınca yansıma "yazildi" olur ve neden temizlenir; başkasının kaydı çözülmez', async () => {
    await yeniIstasyon();
    const m = await makineEkle('Freze 3');
    const ilk = await emirAc();
    const ikinci = await emirAc();
    const ucuncu = await emirAc();
    const op2 = await operatorKur('mk4');
    await olayEkle(operator, olay(ilk, 'running', { mcs: [m.kod] }));
    const dolu = olay(ikinci, 'running', { mcs: [m.kod] });
    const red = (await olayEkle(op2, dolu)).govde.reddedilen[0]!;
    assert.equal((await yansima(String(dolu['cid'])))?.sonuc, 'reddedildi');
    const ok = await istek(op2, 'POST', '/arkon/makine-devral', { emirId: ikinci, kullanimId: red.makineDolu!.doluOlan.kullanimId, cid: String(dolu['cid']) });
    assert.equal(ok.durum, 200, JSON.stringify(ok.govde));
    assert.deepEqual(await yansima(String(dolu['cid'])), { sonuc: 'yazildi', neden: null, emir_id: ikinci });
    // Başkasının reddedilmiş kaydı: devralma geçer (yetkili herkes devralır) ama yansıma kaydı yazan kişide kalır.
    const baskasinin = olay(ucuncu, 'running', { mcs: [m.kod] });
    const red2 = (await olayEkle(operator, baskasinin)).govde.reddedilen[0]!;
    const baskaDevral = await istek(op2, 'POST', '/arkon/makine-devral', { emirId: ucuncu, kullanimId: red2.makineDolu!.doluOlan.kullanimId, cid: String(baskasinin['cid']) });
    assert.equal(baskaDevral.durum, 200, JSON.stringify(baskaDevral.govde));
    assert.equal((await yansima(String(baskasinin['cid'])))?.sonuc, 'reddedildi', 'yansıma yalnız kaydı yazan kişinin devralmasıyla çözülür');
  });

  test('insanlı istasyonda çalışan işe başlatma katılımdır: ekipteki kişi uyarı alır ve kendi çalışması başlar; ekip dışı reddedilir; makineli istasyonda reddedilir', async () => {
    await yeniIstasyon();
    await insanliYap();
    const op2 = await operatorKur('kt2');
    const op3 = await operatorKur('kt3');
    await ekibeAl('kt2');
    const emir = await emirAc();
    assert.deepEqual((await olayEkle(operator, olay(emir, 'running'))).govde.uyarilar, [], 'ilk başlatan uyarı almaz');
    const katil = olay(emir, 'running');
    const c = await olayEkle(op2, katil);
    assert.deepEqual([c.durum, c.govde.reddedilen], [200, []]);
    assert.equal(c.govde.uyarilar.length, 1);
    assert.equal(c.govde.uyarilar[0]?.cid, katil['cid']);
    assert.match(c.govde.uyarilar[0]?.ileti ?? '', /Deneme op1 de çalışıyor/);
    assert.deepEqual(await yansima(String(katil['cid'])), { sonuc: 'yazildi', neden: null, emir_id: emir });
    const katilimlar = await vt().sorgu<{ kisi_id: number }>('SELECT kisi_id FROM uretim_emirleri_katilim WHERE emir_id = $1 AND cikis IS NULL ORDER BY kisi_id', [emir]);
    assert.deepEqual(katilimlar.map((k) => k.kisi_id).sort(), [operatorId, await kisiKimligi('kt2')].sort());
    assert.equal((await emirOku(emir)).canli?.calisma, 'calisiyor');
    // Ekip dışı: uyarı değil ret, kendi çalışması başlamaz.
    const disarida = olay(emir, 'running');
    const d = await olayEkle(op3, disarida);
    assert.equal(d.govde.reddedilen.length, 1);
    assert.match(d.govde.reddedilen[0]?.ileti ?? '', /ekibinde değilsiniz/);
    assert.deepEqual(d.govde.uyarilar, []);
    // Aynı kişinin yeniden başlatması ikinci çalışma açmaz; çalışması zaten açık olduğundan ret de değildir.
    assert.equal((await olayEkle(op2, olay(emir, 'running'))).govde.reddedilen.length, 0);
    assert.equal((await vt().sorgu('SELECT 1 FROM uretim_emirleri_katilim WHERE emir_id = $1 AND cikis IS NULL', [emir])).length, 2);
    // Makineli istasyonda (varsayılan kaynak) çalışan işe başlatma katılım değil, reddedilir.
    await yeniIstasyon();
    const m = await makineEkle('Freze 4');
    const makineEmri = await emirAc();
    await olayEkle(operator, olay(makineEmri, 'running', { mcs: [m.kod] }));
    const ikinciKisi = await olayEkle(op2, olay(makineEmri, 'running', { mcs: [m.kod] }));
    assert.equal(ikinciKisi.govde.reddedilen.length, 1);
    assert.deepEqual(ikinciKisi.govde.uyarilar, []);
  });

  test('kişi yalnız kendi çalışmasını duraklatır ve bitirir: başkası çalışırken duraklatma ve bitirme yalnız kendi katılımını kapatır, durdurma ve katılımsız kişinin komutu reddedilir', async () => {
    await yeniIstasyon();
    await insanliYap();
    const op2 = await operatorKur('kt4');
    const op3 = await operatorKur('kt5');
    await ekibeAl('kt4');
    const emir = await emirAc();
    await olayEkle(operator, olay(emir, 'running'));
    await olayEkle(op2, olay(emir, 'running'));
    const acik = async (): Promise<number[]> => (await vt().sorgu<{ kisi_id: number }>('SELECT kisi_id FROM uretim_emirleri_katilim WHERE emir_id = $1 AND cikis IS NULL', [emir])).map((k) => k.kisi_id).sort();
    const op2Id = await kisiKimligi('kt4');
    // Katılımsız kişi başkasının işini duraklatamaz, durduramaz, bitiremez: iş sürer.
    for (const [durum, ek] of [['paused', {}], ['queued', {}], ['stopped', { reason: durusKodu }], ['done', {}]] as const) {
      const c = await olayEkle(op3, olay(emir, durum, ek));
      assert.equal(c.govde.reddedilen.length, 1, durum);
      assert.equal((await emirOku(emir)).canli?.calisma, 'calisiyor', durum);
    }
    assert.deepEqual(await acik(), [operatorId, op2Id].sort());
    // Başkası çalışırken durdurma (duruş nedeniyle) kendi çalışmasını değil işi keserdi: reddedilir.
    const durdur = await olayEkle(op2, olay(emir, 'stopped', { reason: durusKodu }));
    assert.match(durdur.govde.reddedilen[0]?.ileti ?? '', /işi durdurmak başkasının çalışmasını keserdi/);
    // Kendi çalışmasını duraklatır: iş sürer, yalnız kendi katılımı kapanır.
    const duraklat = olay(emir, 'paused');
    assert.deepEqual((await olayEkle(op2, duraklat)).govde.reddedilen, []);
    assert.equal((await yansima(String(duraklat['cid'])))?.sonuc, 'yazildi');
    assert.deepEqual(await acik(), [operatorId]);
    assert.equal((await emirOku(emir)).canli?.calisma, 'calisiyor');
    // Duraklattığı işe döner (katılım), sonra işi bitirmek yalnız kendi katılımından ayrılmaktır.
    assert.equal((await olayEkle(op2, olay(emir, 'running'))).govde.reddedilen.length, 0);
    assert.deepEqual((await olayEkle(op2, olay(emir, 'done'))).govde.reddedilen, []);
    assert.equal((await emirOku(emir)).durum, 'basladi', 'başkası çalışırken bitirme işi bitirmez');
    assert.deepEqual(await acik(), [operatorId]);
    // Tek çalışan kalınca komutlar işin kendisine gider.
    assert.deepEqual((await olayEkle(operator, olay(emir, 'done'))).govde.reddedilen, []);
    assert.equal((await emirOku(emir)).durum, 'bitti');
  });

  test('terminal TMI ile aynı hâli gösterir: duraklattığı çalışmaya dönüş makineli istasyonda da yazılır, açık çalışmaya başlatma değişiklik yapmaz, ret işin TMI hâlini döner', async () => {
    await yeniIstasyon();
    await insanliYap();
    const op2 = await operatorKur('kt6');
    const op3 = await operatorKur('kt7');
    await ekibeAl('kt6');
    const emir = await emirAc();
    await olayEkle(operator, olay(emir, 'running'));
    await olayEkle(op2, olay(emir, 'running'));
    assert.deepEqual((await olayEkle(op2, olay(emir, 'paused'))).govde.reddedilen, []);
    // Duraklattığını bir daha duraklatmak reddedilir; ret kişinin gözünden işin hâlini (duraklamış) taşır.
    const tekrar = await olayEkle(op2, olay(emir, 'paused'));
    assert.equal(tekrar.govde.reddedilen[0]?.tmiDurum, 'paused');
    // İstasyon makineli olur ve kişi ekipten çıkar: kendi duraklattığı çalışmasına dönüş yine yazılır (önceden "iş zaten çalışıyor" reddi).
    await ortam!.sahip.sorgu("UPDATE istasyon SET kapasite_kaynagi = 'makine' WHERE id = $1", [istasyonId]);
    await vt().sorgu('DELETE FROM ekip_uye WHERE kisi_id = $1', [await kisiKimligi('kt6')]);
    const devam = await olayEkle(op2, olay(emir, 'running'));
    assert.deepEqual(devam.govde.reddedilen, []);
    const acik = await vt().sorgu<{ kisi_id: number }>('SELECT kisi_id FROM uretim_emirleri_katilim WHERE emir_id = $1 AND cikis IS NULL', [emir]);
    assert.deepEqual(acik.map((k) => k.kisi_id).sort(), [operatorId, await kisiKimligi('kt6')].sort());
    // Kendi çalışması açıkken (iş başka ekrandan başlatılmış) başlatma ret değildir, değişiklik yapmaz.
    const yeniden = olay(emir, 'running');
    assert.deepEqual((await olayEkle(operator, yeniden)).govde.reddedilen, []);
    assert.deepEqual(await yansima(String(yeniden['cid'])), { sonuc: 'eslenemedi', neden: ZATEN_CALISIYOR, emir_id: emir });
    // Katılımsız kişinin duraklatması ve devamı reddedilir; ret işin TMI'de çalıştığını söyler, terminal çalışıyor gösterir.
    for (const durum of ['paused', 'running'] as const) {
      const red = await olayEkle(op3, olay(emir, durum));
      assert.equal(red.govde.reddedilen.length, 1, durum);
      assert.equal(red.govde.reddedilen[0]?.tmiDurum, 'running', durum);
    }
    assert.equal((await emirOku(emir)).canli?.calisma, 'calisiyor');
  });

  test('numune isteği (115 a): üretim emri paketinde teslim açılmaz ama istek yazılır; istemcinin gönderdiği teslim bağı yok sayılır', async () => {
    await yeniIstasyon();
    const emir = await emirAc();
    const id = `nt-${emir}`;
    const y = await istek<{ sonuc: string }>(operator, 'POST', `/arkon/belgeler/requests/${id}/yaz`, {
      taban: 0, govde: { id, pkgId: pk(emir), machine: istasyonKodu, status: 'waiting', items: [1], results: {}, numuneTeslim: { id: 999, no: 'SAHTE' } }, kaynak: 'nt',
    });
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    const belge = await vt().tek<{ govde: Record<string, unknown> }>("SELECT govde FROM arkon_belge WHERE depo = 'requests' AND kimlik = $1", [id]);
    assert.equal(belge?.govde['status'], 'waiting');
    assert.equal('numuneTeslim' in (belge?.govde ?? {}), false);
  });

  // Uçtan uca test raporu 2026-10-25 K1 ve T1 (kart 526, 521 1 a): terminal yolundan sayılan sağlam, ilk parça kararı Kalite Merkezi'nden gelene dek
  // karar bekler; ölçümü süren numune karar değildir, kalitenin Arkon'daki Kabul'ü karardır (564 5 a). Bitirilen adımın sağlamı ve sonraki adımın
  // hedefi kararla dolar. Rol reddinde modül adı geçmez (G1).
  test('K1, T1, 521 1 a, G1: terminal sayımı ilk parça kararına dek bekler; ölçümdeki numune karar değil; kalitenin Arkon Kabulü karardır (564 5 a), bitmiş adıma ve sonraki adımın hedefine yazar; operatör karar veremez, paket yazamaz', async () => {
    const r = await rotaliEmirKur();
    const [ie1, ie2] = await isEmriIdleri(r.emirId);
    const taslak = (await paketler()).get(ieKimligi(ie1!))!.govde;
    const yayin = await paketYaz(ieKimligi(ie1!), null, { ...taslak, status: 'published', steps: [{ id: 's1' }], plan: [{ id: 1 }] });
    assert.equal(yayin.durum, 200, JSON.stringify(yayin.govde));
    const durum = async () => {
      const k = (await kararSayaclari(vt(), [r.emirId])).get(r.emirId);
      const adimlar = await ortam!.sahip.sorgu<{ durum: string; saglam: number | null }>(
        'SELECT durum, saglam_adet AS saglam FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [r.emirId]);
      return { kararBekliyor: k?.kararBekliyor ?? 0, adimlar, sonrakiHedef: (await paketler()).get(ieKimligi(ie2!))?.govde['target'] };
    };
    const yaz = async (tur: string, satir: Record<string, unknown>) => {
      const c = await ekle(operator, tur, { ...satir, machine: r.ilk });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      assert.equal((await yansima(String(satir['cid'])))?.sonuc, 'yazildi', JSON.stringify(await yansima(String(satir['cid']))));
    };
    await yaz('events', ieOlay(ie1!, 'running'));
    await yaz('counts', ieSayim(ie1!, 'good', 1));
    await yaz('counts', ieSayim(ie1!, 'good', 17));
    await yaz('counts', ieSayim(ie1!, 'scrap', 2, { reason: hurdaKodu }));
    // 327 a: ilk parça dahil bütün sağlam karar bekler; tabletteki sayı da bu (arkon/web/src/data/ilk-parca.ts kararBekleyenSayisi).
    assert.equal((await durum()).kararBekliyor, 18);
    const tur = await vt().tek<{ id: number }>("SELECT id FROM olcu_aleti_turu WHERE ad = 'Kumpas'");
    const alet = await istek<{ id: number }>(yonetici, 'POST', '/olcu-aletleri', { no: `K1-${r.emirId}`, turId: tur?.id, ilkKalibrasyon: { sonuc: 'uygun' } });
    assert.equal(alet.durum, 200, JSON.stringify(alet.govde));
    const numuneGovdesi = (status: string) => ({
      id: `rq-k1-${r.emirId}`, pkgId: ieKimligi(ie1!), items: [1], status, decidedAt: Date.now(), note: 'not', results: { 1: { ok: true, v: 1, gid: `${ALET_ONEKI}${alet.govde.id}` } },
    });
    const numune = await istek<{ surum: number }>(yonetici, 'POST', `/arkon/belgeler/requests/rq-k1-${r.emirId}/yaz`, { taban: 0, govde: numuneGovdesi('measuring'), kaynak: 'y1' });
    assert.equal(numune.durum, 200, JSON.stringify(numune.govde));
    assert.equal((await durum()).kararBekliyor, 18, 'ölçümü süren numune ilk parça kararı değildir');
    await yaz('events', ieOlay(ie1!, 'done'));
    assert.deepEqual(await durum(), { kararBekliyor: 18, adimlar: [{ durum: 'tamam', saglam: 0 }, { durum: 'bekliyor', saglam: null }], sonrakiHedef: 0 },
      'raporun gördüğü hâl: karar gelmeden bitirilen adımın sağlamı 0, sonraki adımın hedefi 0');
    // Reddedilen: operatör ilk parça kararı veremez; paket yazma reddinde modül adı rol adı gibi geçmez.
    const ret = await istek(operator, 'POST', `/kalite-merkezi/ilk-parca/${r.emirId}/karar`, { karar: 'onay' });
    assert.equal(ret.durum, 403, JSON.stringify(ret.govde));
    assert.equal((await durum()).kararBekliyor, 18);
    const paketReddi = await paketYaz(ieKimligi(ie1!), null, { ...taslak, note: 'operatör' }, operator);
    assert.equal(paketReddi.durum, 403, JSON.stringify(paketReddi.govde));
    assert.match(JSON.stringify(paketReddi.govde), /Rolünüz bu belgeyi yazamaz ya da silemez/);
    assert.doesNotMatch(JSON.stringify(paketReddi.govde), /Üretim Hazırlık/);
    const operatorOnayi = await istek(operator, 'POST', `/arkon/belgeler/requests/rq-k1-${r.emirId}/yaz`, { taban: numune.govde.surum, govde: numuneGovdesi('approved'), kaynak: 'y1' });
    assert.equal(operatorOnayi.durum, 403, JSON.stringify(operatorOnayi.govde));
    assert.equal((await durum()).kararBekliyor, 18, 'operatörün numune onayı yazılmaz');
    // İzinli (564 5 a): ilk parça numunesinin Arkon'daki Kabul'ü Kalite Merkezi'nin ilk parça kararıdır; karar bekleyeni bitmiş adımın
    // sağlamına ve sonraki adımın hedefine taşır, Kalite Merkezi'nde ikinci onay gerekmez.
    const onay = await istek(yonetici, 'POST', `/arkon/belgeler/requests/rq-k1-${r.emirId}/yaz`, { taban: numune.govde.surum, govde: numuneGovdesi('approved'), kaynak: 'y1' });
    assert.equal(onay.durum, 200, JSON.stringify(onay.govde));
    assert.deepEqual(await durum(), { kararBekliyor: 0, adimlar: [{ durum: 'tamam', saglam: 18 }, { durum: 'bekliyor', saglam: null }], sonrakiHedef: 18 });
    const ikinci = await istek<{ adet: number }>(yonetici, 'POST', `/kalite-merkezi/ilk-parca/${r.emirId}/karar`, { karar: 'onay' });
    assert.equal(ikinci.durum, 200, JSON.stringify(ikinci.govde));
    assert.equal(ikinci.govde.adet, 0, 'karar Arkon onayıyla verildi, bekleyen kalmadı');
  });

  // 744 a: uçtan uca denemedeki hata: Op 20, Op 10'un onayıyla ölçümsüz üretiyordu. Kilit ve karar adım başınadır; rotada "yok" seçilen adım beklemez.
  test('744 a: Op 10 onaylı emirde Op 20 sağlamı kendi ilk parça kararını bekler; karar o adıma gider; rotada ilk parçası "yok" adımda kapı ve kilit yoktur', async () => {
    const r = await rotaliEmirKur();
    const [ie1, ie2] = await isEmriIdleri(r.emirId);
    const bekleyen = async () => (await kararSayaclari(vt(), [r.emirId])).get(r.emirId)?.kararBekliyor ?? 0;
    const yaz = async (makine: string, tur: string, satir: Record<string, unknown>) => {
      const c = await ekle(operator, tur, { ...satir, machine: makine });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      assert.equal((await yansima(String(satir['cid'])))?.sonuc, 'yazildi', JSON.stringify(await yansima(String(satir['cid']))));
    };
    for (const id of [ie1!, ie2!]) {
      const t = (await paketler()).get(ieKimligi(id))!.govde;
      assert.equal((await paketYaz(ieKimligi(id), null, { ...t, status: 'published', steps: [{ id: 's1' }], plan: [{ id: 1 }] })).durum, 200);
    }
    await yaz(r.ilk, 'events', ieOlay(ie1!, 'running'));
    await yaz(r.ilk, 'counts', ieSayim(ie1!, 'good', 5));
    assert.equal(await bekleyen(), 5);
    const op10 = await istek<{ adet: number }>(yonetici, 'POST', `/kalite-merkezi/ilk-parca/${r.emirId}/karar`, { karar: 'onay', isEmriId: ie1 });
    assert.equal(op10.govde.adet, 5, JSON.stringify(op10.govde));
    await yaz(r.ilk, 'counts', ieSayim(ie1!, 'good', 5));
    assert.equal(await bekleyen(), 0, 'onaylı adımın sağlamı beklemez');
    await yaz(r.ilk, 'events', ieOlay(ie1!, 'done'));
    await yaz(r.ikinci, 'events', ieOlay(ie2!, 'running'));
    await yaz(r.ikinci, 'counts', ieSayim(ie2!, 'good', 1));
    await yaz(r.ikinci, 'counts', ieSayim(ie2!, 'good', 3));
    assert.equal(await bekleyen(), 4, 'Op 20 Op 10\'un onayıyla sayılmaz');
    const kayit = await ortam!.sahip.tek<{ isEmriId: number | null }>(
      'SELECT is_emri_id AS "isEmriId" FROM kalite_merkezi_ilk_parca_karari WHERE uretim_emri_id = $1 ORDER BY id DESC LIMIT 1', [r.emirId]);
    assert.equal(kayit?.isEmriId, ie1, 'Op 10 kararı adımıyla yazıldı');
    const op20 = await istek<{ adet: number }>(yonetici, 'POST', `/kalite-merkezi/ilk-parca/${r.emirId}/karar`, { karar: 'onay', isEmriId: ie2 });
    assert.equal(op20.govde.adet, 4, JSON.stringify(op20.govde));
    assert.equal(await bekleyen(), 0);

    // Rotada Op 10'un ilk parçası "yok": taslak ilk parça kuralını kapatır; ölçülü kayıtlı pakette de sağlam beklemez (Arkon kapısı ve TMI kilidi yok).
    const y = await rotaliEmirKur({ ilkParcasizOp: 10 });
    const [y1, y2] = await isEmriIdleri(y.emirId);
    const liste = await paketler();
    assert.deepEqual(liste.get(ieKimligi(y1!))!.govde['rules'], { q: { firstPiece: false } });
    assert.equal(liste.get(ieKimligi(y2!))!.govde['rules'], undefined);
    const t1 = liste.get(ieKimligi(y1!))!.govde;
    assert.equal((await paketYaz(ieKimligi(y1!), null, { ...t1, status: 'published', steps: [{ id: 's1' }], plan: [{ id: 1 }], rules: {} })).durum, 200);
    await yaz(y.ilk, 'events', ieOlay(y1!, 'running'));
    await yaz(y.ilk, 'counts', ieSayim(y1!, 'good', 1));
    await yaz(y.ilk, 'counts', ieSayim(y1!, 'good', 6));
    assert.equal((await kararSayaclari(vt(), [y.emirId])).get(y.emirId)?.kararBekliyor ?? 0, 0);
    assert.deepEqual(await ortam!.sahip.sorgu<{ tur: string; adet: number }>(
      "SELECT tur, sum(adet)::int AS adet FROM uretim_sayimi WHERE emir_id = $1 GROUP BY tur ORDER BY tur", [y.emirId]), [{ tur: 'saglam', adet: 7 }]);
  });

  // 564 1 b, 6 a, 600 a: numune emrin sonraki kalite istasyonuna gider (istek o istasyonla işaretlenir); kalite istasyonu terminalindeki lot
  // Kabul/Red'i Kalite Merkezi'nin lot kaydıdır. Karar AQL planı ve bulunan sayılardan çıkar; tutmayan istek yazılmaz, kayıt da kalmaz.
  test('564 1 b, 6 a, 600 a: numune kalite istasyonuna işaretlenir; lot kararı Kalite Merkezi lot kaydıdır, rol, eksik, tutmayan ve verilmiş karar reddedilir', async () => {
    const r = await rotaliEmirKur();
    await ortam!.sahip.sorgu("UPDATE istasyon SET tip = 'kalite' WHERE id = $1", [r.ikinciId]);
    const [ie1, ie2] = await isEmriIdleri(r.emirId);
    const numune = await istek(operator, 'POST', `/arkon/belgeler/requests/nk-${r.emirId}/yaz`, {
      taban: 0, govde: { id: `nk-${r.emirId}`, pkgId: ieKimligi(ie1!), machine: r.ilk, status: 'waiting', items: [1], results: {}, kaliteIstasyonu: 'SAHTE' }, kaynak: 'nk',
    });
    assert.equal(numune.durum, 200, JSON.stringify(numune.govde));
    const istekBelgesi = await vt().tek<{ govde: Record<string, unknown> }>("SELECT govde FROM arkon_belge WHERE depo = 'requests' AND kimlik = $1", [`nk-${r.emirId}`]);
    assert.equal(istekBelgesi?.govde['kaliteIstasyonu'], r.ikinci);

    const kimlik = ieKimligi(ie2!);
    const taslak = (await paketler()).get(kimlik)!.govde;
    const yayin = await paketYaz(kimlik, null, { ...taslak, status: 'published', steps: [{ id: 's1' }], plan: [{ id: 1 }] });
    assert.equal(yayin.durum, 200, JSON.stringify(yayin.govde));
    const lotlar = async () => (await ortam!.sahip.sorgu<{ govde: Record<string, unknown> }>("SELECT govde FROM kalite_merkezi_belge WHERE koleksiyon = 'lot'"))
      .filter((l) => l.govde['uretimEmriId'] === r.emirId || String(l.govde['kaynakAnahtari'] ?? '').startsWith(kimlik));
    let surum = 0;
    const sonucYaz = async (lotKarari: Record<string, unknown>, cerez = yonetici) => {
      const c = await istek<{ surum: number }>(cerez, 'POST', `/arkon/belgeler/results/${kimlik}/yaz`, { taban: surum, govde: { id: kimlik, meas: {}, pins: [], lotKarari }, kaynak: 'lk' });
      if (c.durum === 200) surum = c.govde.surum;
      return c;
    };
    const kabul = { karar: 'kabul', bulunan: { Kritik: 0, Majör: 0, Minör: 0 }, at: 1 };
    assert.equal((await sonucYaz(kabul, operator)).durum, 403, 'operatör lot kararı veremez');
    assert.equal((await sonucYaz({ ...kabul, karar: 'ret', bulunan: { Majör: 2 } })).durum, 400, 'Red gerekçe ister');
    const tutmayan = await sonucYaz({ ...kabul, bulunan: { Kritik: 0, Majör: 3, Minör: 0 } });
    assert.equal(tutmayan.durum, 400, JSON.stringify(tutmayan.govde));
    assert.match(JSON.stringify(tutmayan.govde), /AQL planına göre başka karar/);
    assert.equal((await lotlar()).length, 0, 'tutmayan istekte Kalite Merkezi kaydı da kalmaz');
    const verildi = await sonucYaz(kabul);
    assert.equal(verildi.durum, 200, JSON.stringify(verildi.govde));
    const sonuc = await vt().tek<{ govde: { lotKarari: { kayit: { no: string; karar: string } } } }>("SELECT govde FROM arkon_belge WHERE depo = 'results' AND kimlik = $1", [kimlik]);
    assert.equal(sonuc?.govde.lotKarari.kayit.karar, 'Kabul');
    const kayitlar = await lotlar();
    assert.equal(kayitlar.length, 1);
    assert.deepEqual([kayitlar[0]!.govde['no'], kayitlar[0]!.govde['karar']], [sonuc?.govde.lotKarari.kayit.no, 'Kabul']);
    const degistir = await sonucYaz({ ...kabul, karar: 'ret', bulunan: { Majör: 2 }, not: 'çapak', at: 2 });
    assert.equal(degistir.durum, 403, 'verilmiş karar Arkon\'da değişmez');
    assert.equal((await sonucYaz(sonuc!.govde.lotKarari as unknown as Record<string, unknown>)).durum, 200, 'aynı kararın yeniden yazılması');
    assert.equal((await lotlar()).length, 1);
    // Red: kusurlu sayısı ve gerekçeyle Kalite Merkezi Ret kaydı; stokta izlenmeyen parçada redde geçen yoktur ("0"), uydurulmaz.
    const r2 = await rotaliEmirKur({ kart: r.kart });
    await ortam!.sahip.sorgu("UPDATE istasyon SET tip = 'kalite' WHERE id = $1", [r2.ikinciId]);
    const k2 = ieKimligi((await isEmriIdleri(r2.emirId))[1]!);
    assert.equal((await paketYaz(k2, null, { ...(await paketler()).get(k2)!.govde, status: 'published', steps: [{ id: 's1' }], plan: [{ id: 1 }] })).durum, 200);
    const red = await istek(yonetici, 'POST', `/arkon/belgeler/results/${k2}/yaz`, {
      taban: 0, govde: { id: k2, meas: {}, pins: [], lotKarari: { karar: 'ret', bulunan: { Kritik: 0, Majör: 3, Minör: null }, not: 'çapak', at: 3 } }, kaynak: 'lk',
    });
    assert.equal(red.durum, 200, JSON.stringify(red.govde));
    const redSonucu = await vt().tek<{ govde: { lotKarari: { kayit: Record<string, unknown> } } }>("SELECT govde FROM arkon_belge WHERE depo = 'results' AND kimlik = $1", [k2]);
    assert.deepEqual([redSonucu?.govde.lotKarari.kayit['karar'], redSonucu?.govde.lotKarari.kayit['redde']], ['Ret', '0']);
  });
});
