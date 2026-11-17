import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { temizlikAdaylariCevabi, temizlikEtkisiCevabi, temizleCevabi, type TemizlikKoku } from '#paylasilan/sozlesme/ayarlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { TEMIZLIK_EKI_SATIR_BAYTI, temizlikEkiSatirlari, temizlikYedegiUygunMu, yedekAdi } from './kurallar.ts';

// Deneme verisi temizleme (3395 a): yalnız bayraklı yönetici, yalnız işaretli ve kilitsiz kök, bağlı kayıtlarıyla; parola ve
// yakın tarihli yedek sunucuda istenir; değişmez defterin kilidi yalnız işlev içinde açılır. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('veri temizleme (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let planci = '';
  let ist = 0;
  let firma = 0;
  let kartSira = 0;
  let siparisSira = 0;
  let dizin = '';
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  const istek = (cerez: string | null, yontem: 'GET' | 'POST', url: string, payload?: unknown, baslik: Record<string, string> = {}) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { ...(cerez === null ? {} : { cookie: cerez }), ...baslik }, payload: payload as object | undefined });
  let istekNo = 0;
  const temizleIstegi = (cerez: string | null, govde: unknown) =>
    istek(cerez, 'POST', '/veri-temizleme/temizle', govde, { 'istek-kimligi': `00000000-0000-4000-8000-${String(++istekNo).padStart(12, '0')}` });

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function emir(x: { ust?: number; malzeme?: number } = {}): Promise<number> {
    return (await o().sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, ust_emir_id, bolunme_sira, malzeme_no) VALUES ('ORN-P', 'ORN deneme', 5, $1, $2, $3, $4, $5) RETURNING id",
      [ist, yoneticiId, x.ust ?? null, x.ust === undefined ? null : 1, x.malzeme ?? null]))!.id;
  }
  async function oncelikDegisimi(emirId: number): Promise<void> {
    await o().sahip.sorgu('INSERT INTO uretim_emirleri_oncelik_degisimi (uretim_emri_id, eski_oncelik, yeni_oncelik, kisi_id, zaman) VALUES ($1, 3, 1, $2, now())', [emirId, yoneticiId]);
  }
  async function malzeme(): Promise<number> {
    kartSira += 1;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'ORN-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`orn-dnm-${kartSira}`, kartSira, JSON.stringify({ id: `orn-dnm-${kartSira}`, com: { ad: `ORN malzeme ${kartSira}` } }), yoneticiId]))!.no;
  }
  async function siparis(): Promise<number> {
    siparisSira += 1;
    return (await o().sahip.tek<{ id: number }>(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, para_birimi, kdv_orani, olusturan_id)
       VALUES ($1, 'taslak', $2, current_date, current_date + 10, 'TRY', 20, $3) RETURNING id`, [`ORN-SP-${siparisSira}`, firma, yoneticiId]))!.id;
  }
  const isaretle = async (secim: TemizlikKoku[], isaretli = true) => {
    const c = await istek(yonetici, 'POST', '/veri-temizleme/isaret', { secim, isaretli });
    assert.equal(c.statusCode, 200, c.body);
  };
  const secimMetni = (secim: TemizlikKoku[]) => secim.map((k) => `${k.tur}:${k.kimlik}`).join(',');
  const etki = async (secim: TemizlikKoku[]) => {
    const c = await istek(yonetici, 'GET', `/veri-temizleme/etki?secim=${secimMetni(secim)}`);
    assert.equal(c.statusCode, 200, c.body);
    return temizlikEtkisiCevabi.parse(c.json());
  };
  // Elle yedek HTTP'de pg_dump koşar; testte tamamlanmış yedek dosyası sunucunun veritabanı adıyla yerleştirilir.
  async function yedekKoy(zaman: Date): Promise<string> {
    const ad = yedekAdi(String(process.env['TMIV2_PG_DATABASE']), 'elle', zaman);
    await writeFile(path.join(dizin, ad), 'yedek');
    return ad;
  }
  const varMi = async (tablo: string, sutun: string, deger: number): Promise<boolean> =>
    (await o().sahip.tek<{ var: boolean }>(`SELECT EXISTS (SELECT FROM ${tablo} WHERE ${sutun} = $1) AS var`, [deger]))!.var;

  before(async () => {
    dizin = await mkdtemp(path.join(tmpdir(), 'tmiv2-temizlik-'));
    process.env['TMIV2_YEDEK_DIZINI'] = dizin;
    process.env['TMIV2_YEDEK_ANAHTARI'] = Buffer.alloc(32, 7).toString('base64');
    ortam = await testVeritabaniKur('ayarlar_temizlik');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'ORN Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisCerezi('yonetici');
    // Bayraksız rol: işlem role elle verilse de temizleyemez.
    const rol = (await ortam.sahip.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'planlama_muduru'"))!.id;
    await ortam.sahip.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'ayarlar.veri-temizle') ON CONFLICT DO NOTHING", [rol]);
    await ortam.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'ORN Planci', kullaniciAdi: 'planci', parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, id, rol);
      for (const r of kisi.roller) if (r.id !== rol) await rolAl(db, yoneticiId, id, r.id);
    });
    planci = await girisCerezi('planci');
    const s = ortam.sahip;
    const im = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('ORNM', 'ORN merkez') RETURNING id"))!.id;
    ist = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('ORNI', 'ORN istasyon', $1, true) RETURNING id", [im]))!.id;
    firma = (await s.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('ORN Firma', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
  });
  after(async () => {
    await ortam?.kaldir();
    if (dizin !== '') await rm(dizin, { recursive: true, force: true });
    delete process.env['TMIV2_YEDEK_DIZINI'];
    delete process.env['TMIV2_YEDEK_ANAHTARI'];
  });

  test('yetki: oturumsuz 401; bayraksız kişi işlem rolünde olsa da 403; işlem yerleşik hiçbir rolde yok', async () => {
    const e = await emir();
    for (const [yontem, url, govde] of [
      ['GET', '/veri-temizleme/adaylar?tur=uretim_emri', undefined],
      ['POST', '/veri-temizleme/isaret', { secim: [{ tur: 'uretim_emri', kimlik: e }], isaretli: true }],
      ['GET', `/veri-temizleme/etki?secim=uretim_emri:${e}`, undefined],
    ] as const) {
      assert.equal((await istek(null, yontem, url, govde)).statusCode, 401, url);
      const r = await istek(planci, yontem, url, govde);
      assert.equal(r.statusCode, 403, `${url} ${r.body}`);
    }
    const c = await temizleIstegi(planci, { secim: [{ tur: 'uretim_emri', kimlik: e }], ozet: 'a'.repeat(32), yedekAdi: await yedekKoy(new Date()), onay: 'TEMIZLE', parola: PAROLA });
    assert.equal(c.statusCode, 403, c.body);
    assert.equal(await varMi('uretim_emri', 'id', e), true);
    const roller = await o().sahip.sorgu<{ kod: string }>(
      "SELECT r.kod FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE ri.islem = 'ayarlar.veri-temizle' AND r.kod <> 'planlama_muduru'");
    assert.deepEqual(roller, []);
  });

  test('adaylar: türe, işarete ve açan kişiye göre süzülür; işaret konup kaldırılır', async () => {
    const [a, b] = [await emir(), await emir()];
    await isaretle([{ tur: 'uretim_emri', kimlik: a }]);
    const oku = async (sorgu: string) => {
      const c = await istek(yonetici, 'GET', `/veri-temizleme/adaylar?tur=uretim_emri${sorgu}`);
      assert.equal(c.statusCode, 200, c.body);
      return temizlikAdaylariCevabi.parse(c.json());
    };
    const hepsi = await oku('');
    assert.ok(hepsi.adaylar.some((x) => x.kimlik === a && x.isaretli));
    assert.ok(hepsi.adaylar.some((x) => x.kimlik === b && !x.isaretli));
    const isaretli = await oku('&isaret=isaretli');
    assert.ok(isaretli.adaylar.every((x) => x.isaretli));
    assert.ok(isaretli.adaylar.some((x) => x.kimlik === a));
    assert.equal((await oku(`&kisi=${yoneticiId + 1000}`)).toplam, 0);
    assert.equal((await oku('&bitis=2000-01-01')).toplam, 0);
    await isaretle([{ tur: 'uretim_emri', kimlik: a }], false);
    assert.equal((await oku('&isaret=isaretli')).adaylar.some((x) => x.kimlik === a), false);
  });

  test('etki: işaretsiz kök ve gerçek kayda bağlı kök kilitlidir; işaretli kökün bağlı defter satırı sayılır', async () => {
    const isaretsiz = await emir();
    const gercekUst = await emir();
    const alt = await emir({ ust: gercekUst, malzeme: await malzeme() });
    const mlz = await malzeme();
    const gercekEmir = await emir({ malzeme: mlz });
    const temiz = await emir();
    await oncelikDegisimi(temiz);
    await isaretle([{ tur: 'uretim_emri', kimlik: alt }, { tur: 'malzeme', kimlik: mlz }, { tur: 'uretim_emri', kimlik: temiz }]);
    const sonuc = await etki([
      { tur: 'uretim_emri', kimlik: isaretsiz }, { tur: 'uretim_emri', kimlik: alt }, { tur: 'malzeme', kimlik: mlz }, { tur: 'uretim_emri', kimlik: temiz },
    ]);
    const kok = (kimlik: number) => sonuc.kokler.find((k) => k.kimlik === kimlik)!;
    assert.deepEqual(kok(isaretsiz).kilitler, ['Deneme işareti yok']);
    assert.ok(kok(alt).kilitler.some((k) => k.startsWith('İşaretsiz üretim emri')), JSON.stringify(kok(alt)));
    assert.ok(kok(mlz).kilitler.some((k) => k.startsWith('İşaretsiz üretim emri')), JSON.stringify(kok(mlz)));
    assert.deepEqual(kok(temiz).kilitler, []);
    assert.equal(kok(temiz).tablolar['uretim_emirleri_oncelik_degisimi'], 1);
    // Birleşik küme yalnız kilitsiz kökü taşır.
    assert.deepEqual(sonuc.tablolar, kok(temiz).tablolar);
    assert.equal(await varMi('uretim_emri', 'id', gercekEmir), true);
  });

  test('temizlik: parola, onay, yedek ve özet sunucuda istenir; başarıda kök ve defter satırı gider, gerçek kayıt ve sayaç kalır', async () => {
    const gercek = await emir();
    await oncelikDegisimi(gercek);
    const deneme = await emir();
    await oncelikDegisimi(deneme);
    const secim: TemizlikKoku[] = [{ tur: 'uretim_emri', kimlik: deneme }];
    const denemeNo = (await o().sahip.tek<{ no: string }>('SELECT emir_no AS no FROM uretim_emri WHERE id = $1', [deneme]))!.no;
    await isaretle(secim);
    const { ozet } = await etki(secim);
    const yedek = await yedekKoy(new Date());
    const govde = { secim, ozet, yedekAdi: yedek, onay: 'TEMIZLE', parola: PAROLA };

    assert.equal((await temizleIstegi(yonetici, { ...govde, parola: 'yanlis' })).statusCode, 400);
    assert.equal((await temizleIstegi(yonetici, { ...govde, onay: 'temizle' })).statusCode, 400);
    const eskiYedek = await yedekKoy(new Date(Date.now() - 2 * 60 * 60_000));
    assert.equal((await temizleIstegi(yonetici, { ...govde, yedekAdi: eskiYedek })).statusCode, 409);
    assert.equal((await temizleIstegi(yonetici, { ...govde, ozet: 'b'.repeat(32) })).statusCode, 409);
    assert.equal(await varMi('uretim_emri', 'id', deneme), true, 'reddedilen istek silmedi');

    const c = await temizleIstegi(yonetici, govde);
    assert.equal(c.statusCode, 200, c.body);
    const sonuc = temizleCevabi.parse(c.json());
    assert.equal(sonuc.tablolar['uretim_emri'], 1);
    assert.equal(sonuc.tablolar['uretim_emirleri_oncelik_degisimi'], 1);
    assert.equal(await varMi('uretim_emri', 'id', deneme), false);
    assert.equal(await varMi('uretim_emirleri_oncelik_degisimi', 'uretim_emri_id', deneme), false);
    assert.equal(await varMi('uretim_emri', 'id', gercek), true);
    assert.equal(await varMi('uretim_emirleri_oncelik_degisimi', 'uretim_emri_id', gercek), true);
    assert.equal(await varMi('ayarlar_deneme_isareti', 'kimlik', deneme), false);

    // Defter kilidi işlevden sonra yine yerinde: gerçek emrin değişim satırı silinemez.
    await assert.rejects(o().sahip.sorgu('DELETE FROM uretim_emirleri_oncelik_degisimi WHERE uretim_emri_id = $1', [gercek]));
    // Numara sayacı geri sarılmaz.
    assert.ok((await emir()) > deneme);

    const kayit = await o().sahip.tek<{ govde: unknown }>(
      "SELECT govde FROM denetim_kaydi WHERE yol = '/veri-temizleme/temizle' AND kisi_id = $1 ORDER BY id DESC LIMIT 1", [yoneticiId]);
    assert.ok(kayit !== null);
    const metin = JSON.stringify(kayit);
    assert.equal(metin.includes(PAROLA), false, 'parola deftere girmez');
    assert.ok(metin.includes(yedek));
    const ek = JSON.stringify((kayit.govde as { _ek?: unknown })._ek ?? null);
    assert.ok(ek.includes(denemeNo), `denetim ekinde silinen numara: ${ek}`);
  });

  test("Logo'ya gönderilmiş malzeme kilitli, kuyrukta bekleyen kilitli değil; işaretli sipariş ve malzeme temizlenir", async () => {
    const [logolu, mlz, sp] = [await malzeme(), await malzeme(), await siparis()];
    await o().sahip.sorgu("UPDATE malzeme_katalog_karti SET logo_gonderim_durumu = 'gonderildi', logo_kayit_no = 'ORN-L1', logo_gonderim_zamani = now() WHERE no = $1", [logolu]);
    const secim: TemizlikKoku[] = [{ tur: 'malzeme', kimlik: logolu }, { tur: 'malzeme', kimlik: mlz }, { tur: 'siparis', kimlik: sp }];
    await isaretle(secim);
    const ilk = await etki(secim);
    assert.deepEqual(ilk.kokler.find((k) => k.kimlik === logolu && k.tur === 'malzeme')!.kilitler, ["Logo'ya gönderildi"]);
    const kilitsiz = secim.slice(1);
    const { ozet } = await etki(kilitsiz);
    const c = await temizleIstegi(yonetici, { secim: kilitsiz, ozet, yedekAdi: await yedekKoy(new Date()), onay: 'TEMIZLE', parola: PAROLA });
    assert.equal(c.statusCode, 200, c.body);
    assert.equal(await varMi('malzeme_katalog_karti', 'no', mlz), false);
    assert.equal(await varMi('siparisler_siparis', 'id', sp), false);
    assert.equal(await varMi('malzeme_katalog_karti', 'no', logolu), true);
  });

  test('kilitli kök seçimdeyse hiçbir şey silinmez', async () => {
    const gercekUst = await emir();
    const alt = await emir({ ust: gercekUst, malzeme: await malzeme() });
    const temiz = await emir();
    const secim: TemizlikKoku[] = [{ tur: 'uretim_emri', kimlik: alt }, { tur: 'uretim_emri', kimlik: temiz }];
    await isaretle(secim);
    const { ozet } = await etki(secim);
    const c = await temizleIstegi(yonetici, { secim, ozet, yedekAdi: await yedekKoy(new Date()), onay: 'TEMIZLE', parola: PAROLA });
    assert.equal(c.statusCode, 409, c.body);
    assert.equal(await varMi('uretim_emri', 'id', temiz), true);
    assert.equal(await varMi('uretim_emri', 'id', alt), true);
  });

  test('saat dilimi: aday süzgeci tesis gününe göre (23:30 dahil, ertesi 00:30 değil)', async () => {
    const [dahil, disari] = [await emir(), await emir()];
    await o().sahip.sorgu("UPDATE uretim_emri SET acilma = '2019-03-10T20:30:00Z' WHERE id = $1", [dahil]);
    await o().sahip.sorgu("UPDATE uretim_emri SET acilma = '2019-03-10T21:30:00Z' WHERE id = $1", [disari]);
    const c = await istek(yonetici, 'GET', '/veri-temizleme/adaylar?tur=uretim_emri&baslangic=2019-03-10&bitis=2019-03-10');
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(temizlikAdaylariCevabi.parse(c.json()).adaylar.map((a) => a.kimlik), [dahil]);
  });

  test('etki sonradan değişirse eski özetle temizlik 409 ve hiçbir şey silinmez', async () => {
    const e = await emir();
    const secim: TemizlikKoku[] = [{ tur: 'uretim_emri', kimlik: e }];
    await isaretle(secim);
    const { ozet } = await etki(secim);
    await oncelikDegisimi(e);
    const c = await temizleIstegi(yonetici, { secim, ozet, yedekAdi: await yedekKoy(new Date()), onay: 'TEMIZLE', parola: PAROLA });
    assert.equal(c.statusCode, 409, c.body);
    assert.equal(await varMi('uretim_emri', 'id', e), true);
    assert.equal(await varMi('uretim_emirleri_oncelik_degisimi', 'uretim_emri_id', e), true);
  });

  test("yabancı anahtarsız Logo bağı: Logo'ya gitmiş malzeme fişi ya da kart kuyruğu kökü kilitler; gitmemiş fiş emirle silinir", async () => {
    const fis = async (emirId: number) => (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_malzeme_fisi (tur, uretim_emri_id) VALUES ('sarf', $1) RETURNING id", [emirId]))!.id;
    const [gitmis, gitmemis, kart] = [await emir(), await emir(), await malzeme()];
    const gitmisFis = await fis(gitmis);
    const gitmemisFis = await fis(gitmemis);
    await o().sahip.sorgu(
      "INSERT INTO logo_malzeme_fisi_giden (belge_turu, belge_no, son_deneme, son_sonuc, logo_kayit_no) VALUES ('sarf-fisi', $1, now(), 'gonderildi', 'ORN-F1')", [gitmisFis]);
    await o().sahip.sorgu(
      "INSERT INTO logo_giden (belge_turu, belge_no, son_deneme, son_sonuc, logo_kayit_no) VALUES ('malzeme', $1, now(), 'gonderildi', 'ORN-K1')", [kart]);
    const secim: TemizlikKoku[] = [{ tur: 'uretim_emri', kimlik: gitmis }, { tur: 'uretim_emri', kimlik: gitmemis }, { tur: 'malzeme', kimlik: kart }];
    await isaretle(secim);
    const sonuc = await etki(secim);
    const kilit = (tur: string, kimlik: number) => sonuc.kokler.find((k) => k.tur === tur && k.kimlik === kimlik)!.kilitler;
    assert.ok(kilit('uretim_emri', gitmis).includes("Logo'ya gönderildi"), JSON.stringify(sonuc.kokler));
    assert.ok(kilit('malzeme', kart).includes("Logo'ya gönderildi"));
    assert.deepEqual(kilit('uretim_emri', gitmemis), []);
    assert.equal(sonuc.kokler.find((k) => k.kimlik === gitmemis)!.tablolar['stok_malzeme_fisi'], 1);
    const temiz: TemizlikKoku[] = [{ tur: 'uretim_emri', kimlik: gitmemis }];
    const { ozet } = await etki(temiz);
    const c = await temizleIstegi(yonetici, { secim: temiz, ozet, yedekAdi: await yedekKoy(new Date()), onay: 'TEMIZLE', parola: PAROLA });
    assert.equal(c.statusCode, 200, c.body);
    assert.equal(await varMi('stok_malzeme_fisi', 'id', gitmemisFis), false);
    assert.equal(await varMi('stok_malzeme_fisi', 'id', gitmisFis), true);
  });

  test('bağlantısı boşalacak kayıt ve izin listesinde olmayan silme kuralı kökü kilitler', async () => {
    const [bagli, kurallI] = [await emir(), await emir()];
    await o().sahip.sorgu('CREATE TABLE orn_bag (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, emir_id int REFERENCES uretim_emri ON DELETE SET NULL)');
    await o().sahip.sorgu("CREATE FUNCTION orn_silme_kurali() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ORN kural'; END $$");
    await o().sahip.sorgu('CREATE TRIGGER orn_kural BEFORE DELETE ON uretim_emirleri_oncelik_degisimi FOR EACH ROW EXECUTE FUNCTION orn_silme_kurali()');
    try {
      await o().sahip.sorgu('INSERT INTO orn_bag (emir_id) VALUES ($1)', [bagli]);
      await oncelikDegisimi(kurallI);
      const secim: TemizlikKoku[] = [{ tur: 'uretim_emri', kimlik: bagli }, { tur: 'uretim_emri', kimlik: kurallI }];
      await isaretle(secim);
      const sonuc = await etki(secim);
      assert.ok(sonuc.kokler.find((k) => k.kimlik === bagli)!.kilitler.includes('Bağlantısı silinecek kayıt var (orn_bag)'), JSON.stringify(sonuc.kokler));
      assert.ok(sonuc.kokler.find((k) => k.kimlik === kurallI)!.kilitler.includes('Silme kuralı var (orn_silme_kurali)'), JSON.stringify(sonuc.kokler));
    } finally {
      await o().sahip.sorgu('DROP TRIGGER orn_kural ON uretim_emirleri_oncelik_degisimi');
      await o().sahip.sorgu('DROP FUNCTION orn_silme_kurali()');
      await o().sahip.sorgu('DROP TABLE orn_bag');
    }
  });

  test('stok: deneme girişinin bakiyesi düşülür, defter ile bakiye tutar; gerçek stoktan düşen deneme hareketi kilitlidir', async () => {
    const m = await malzeme();
    const konum = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO stok_konum (depo_id, kod, tur, ad, istasyon_id) SELECT id, 'IST-' || $1::int, 'istasyon', 'ORN', $1::int FROM stok_depo WHERE kod = 'ANA'
       ON CONFLICT ON CONSTRAINT stok_konum_istasyon_tek DO UPDATE SET ad = stok_konum.ad RETURNING id`, [ist]))!.id;
    const [giren, sarfeden] = [await emir({ malzeme: m }), await emir({ malzeme: m })];
    // Hareket fişsiz yazılamaz (stok_hareketi_fisli): her hareket kendi fişiyle.
    const hareket = (fisTuru: string, h: { tur: string; giris?: string; cikis?: string; kaynak?: number; hedef?: number; miktar: number; emir?: number }) => o().sahip.sorgu(
      `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ($1, pg_current_xact_id(), $2) RETURNING id),
         h AS (INSERT INTO stok_hareketi (tur, giris_kaynagi, cikis_nedeni, malzeme_id, kaynak_konum_id, hedef_konum_id, miktar, uretim_emri_id, kisi_id)
               VALUES ($3, $4, $5, $6, $7, $8, $9, $10, $2) RETURNING id)
       INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`,
      [fisTuru, yoneticiId, h.tur, h.giris ?? null, h.cikis ?? null, m, h.kaynak ?? null, h.hedef ?? null, h.miktar, h.emir ?? null]);
    await hareket('giris', { tur: 'giris', giris: 'uretim', hedef: konum, miktar: 5, emir: giren });
    await hareket('sayim', { tur: 'sayim_fazla', hedef: konum, miktar: 10 });
    await hareket('cikis', { tur: 'cikis', cikis: 'uretime_sarf', kaynak: konum, miktar: 2, emir: sarfeden });
    await o().sahip.sorgu('INSERT INTO stok_bakiye (malzeme_id, konum_id, miktar, ilk_giris) VALUES ($1, $2, 13, now())', [m, konum]);
    const secim: TemizlikKoku[] = [{ tur: 'uretim_emri', kimlik: giren }, { tur: 'uretim_emri', kimlik: sarfeden }, { tur: 'malzeme', kimlik: m }];
    await isaretle(secim);
    const sonuc = await etki(secim.slice(0, 2));
    assert.deepEqual(sonuc.kokler.find((k) => k.kimlik === giren)!.kilitler, []);
    assert.ok(sonuc.kokler.find((k) => k.kimlik === sarfeden)!.kilitler.some((x) => x.startsWith('Stok bakiyesi geri alınamaz')), JSON.stringify(sonuc.kokler));

    const temiz: TemizlikKoku[] = [{ tur: 'uretim_emri', kimlik: giren }];
    const { ozet } = await etki(temiz);
    const c = await temizleIstegi(yonetici, { secim: temiz, ozet, yedekAdi: await yedekKoy(new Date()), onay: 'TEMIZLE', parola: PAROLA });
    assert.equal(c.statusCode, 200, c.body);
    const denge = await o().sahip.tek<{ bakiye: string; defter: string }>(
      `SELECT (SELECT coalesce(sum(miktar), 0) FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2)::text AS bakiye,
              (SELECT coalesce(sum(CASE WHEN hedef_konum_id = $2 THEN miktar ELSE 0 END) - sum(CASE WHEN kaynak_konum_id = $2 THEN miktar ELSE 0 END), 0)
                 FROM stok_hareketi WHERE malzeme_id = $1)::text AS defter`, [m, konum]);
    assert.equal(Number(denge!.bakiye), 8);
    assert.equal(Number(denge!.defter), 8);
  });

  test('uygulama rolü değişmez defter satırını doğrudan silemez ve tetiği kapatamaz', async () => {
    const e = await emir();
    await oncelikDegisimi(e);
    await assert.rejects(o().vt.sorgu('DELETE FROM uretim_emirleri_oncelik_degisimi WHERE uretim_emri_id = $1', [e]));
    await assert.rejects(o().vt.sorgu('ALTER TABLE uretim_emirleri_oncelik_degisimi DISABLE TRIGGER uretim_emirleri_oncelik_degisimi_degismez'));
  });
});

test('denetim eki: numaralar türe göre paketlenir, satır sınırı aşılmaz, numara kırpılmaz', () => {
  const kokler = Array.from({ length: 5000 }, (_, i) => ({ tur: i % 2 === 0 ? 'uretim_emri' : 'malzeme', no: `ORN-${String(i).padStart(6, '0')}` }));
  const satirlar = temizlikEkiSatirlari(kokler);
  assert.ok(satirlar.length <= 100);
  for (const s of satirlar) assert.ok(Buffer.byteLength(s.nolar, 'utf8') <= TEMIZLIK_EKI_SATIR_BAYTI);
  assert.equal(satirlar.at(-1)?.tur, 'kalan');
  const tasinan = satirlar.filter((s) => s.tur !== 'kalan').flatMap((s) => s.nolar.split(','));
  assert.equal(tasinan.length + Number(satirlar.at(-1)!.nolar.split(' ')[0]), 5000);
  assert.deepEqual(temizlikEkiSatirlari([{ tur: 'siparis', no: 'ORN-SP-1' }, { tur: 'siparis', no: null }]), [{ tur: 'siparis', nolar: 'ORN-SP-1,?' }]);
});

test('yedek uygunluğu: yoksa, boşsa, eskiyse ya da gelecekteyse uygun değil', () => {
  const simdi = new Date('2026-11-17T12:00:00Z');
  assert.equal(temizlikYedegiUygunMu(undefined, simdi, 30), false);
  assert.equal(temizlikYedegiUygunMu({ zaman: '2026-11-17T11:45:00Z', boyut: 10 }, simdi, 30), true);
  assert.equal(temizlikYedegiUygunMu({ zaman: '2026-11-17T11:45:00Z', boyut: 0 }, simdi, 30), false);
  assert.equal(temizlikYedegiUygunMu({ zaman: '2026-11-17T11:20:00Z', boyut: 10 }, simdi, 30), false);
  assert.equal(temizlikYedegiUygunMu({ zaman: '2026-11-17T12:30:00Z', boyut: 10 }, simdi, 30), false);
});
