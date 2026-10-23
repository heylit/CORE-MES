import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Veritabani } from '#cekirdek/db.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir, isTanimi, modulIsleriniKesfet, zamanlayiciKur } from '#cekirdek/zamanlayici.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { isler } from './isler.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { BELIRSIZ_BEKLEME_MS } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { malzemeTuru, yeniSurecBellegi } from './servis.ts';
import { birimSetiOkumasi, kopruListesiniYaz } from './sorgular.ts';
import type { SurecBellegi, TurOrtami, TurSonucu, TxAcan } from './servis.ts';

const PAROLA = 'dogru-parola-1';
// Cevap veren köprüye istek süresi geniş: yüklü CI'da yerel köprünün ilk cevabı 300 ms'yi aşıp başarı yolunu "belirsiz"e
// düşürüyordu (#641). Kısa süre yalnız cevapsız kalan senaryolarda verilir ki zaman aşımı testleri saniyeler beklemesin.
const TEST_ISTEK_SURESI_MS = 5000;
const ZAMAN_ASIMI_SURESI_MS = 300;

interface KartLogo { durum: string | null; kayit_no: string | null; hata: string | null }
interface Giden { niyet: boolean; deneme_sayisi: number; son_sonuc: string | null; son_hata: string | null; logo_kayit_no: string | null }

describe('Logo malzeme kartı gönderimi, sahte köprüyle uçtan uca (kart #207, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let operatorCerezi = '';
  let kopru: SahteKopru;
  let sayac = 0;
  let simdi = Date.parse('2026-10-08T10:00:00Z');

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = cerez) =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c }, ...(govde === undefined ? {} : { payload: govde as object }) });
  async function tamam<T>(yol: string, govde: unknown): Promise<T> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez }, payload: govde as object });
    assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
    return c.json() as T;
  }
  // Onay akışı kapalı: kart doğrudan aktif açılır ve tetikleyici onu "bekliyor" yapar (MKL-1).
  async function aktifKart(ek: { tur?: string; birim?: string; aciklamalar?: [string, string, string] } = {}): Promise<{ no: number; kod: string }> {
    const kimlik = `lb${++sayac}`;
    const tur = ek.tur ?? 'hammadde';
    const onek = tur === 'sarf' ? 'SF' : 'HM';
    await tamam(`/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      // Kart, malzeme sihirbazının zorunlu alanlarıyla açılır (malzemeler B11): hammaddede aile, kalite ve kart başına ayrı ölçü; sarfta kategori ve tür.
      kayit: {
        id: kimlik, tur, fam: 'metal', com: { kod: `${onek}-LGB-00001`, ad: `Logo deneme ${kimlik}`, birim: ek.birim ?? 'kg' }, onay: { durum: 'aktif' },
        ...(tur === 'sarf' ? { g: { kat: 'genel', tur: `Logo deneme ${kimlik}` } } : { grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 + sayac } }),
      },
      ozet: {
        benzersiz_anahtar: `${tur}|metal|${kimlik}`, mukerrer_gerekcesi: null,
        ...(ek.aciklamalar ? { aciklama_1: ek.aciklamalar[0], aciklama_2: ek.aciklamalar[1], aciklama_3: ek.aciklamalar[2] } : {}),
      },
      surum: null,
    });
    const satir = await vt().tek<{ no: number; kod: string; durum: string | null }>(
      'SELECT no, stok_kodu AS kod, logo_gonderim_durumu AS durum FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]);
    assert.equal(satir?.durum, 'bekliyor', 'aktif olan kart kuyruğa düşer');
    return { no: satir.no, kod: satir.kod };
  }
  const kartLogo = (no: number): Promise<KartLogo | null> => vt().tek<KartLogo>(
    'SELECT logo_gonderim_durumu AS durum, logo_kayit_no AS kayit_no, logo_hata AS hata FROM malzeme_katalog_karti WHERE no = $1', [no]);
  const giden = (no: number): Promise<Giden | null> => vt().tek<Giden>(
    `SELECT niyet_zamani IS NOT NULL AS niyet, deneme_sayisi, son_sonuc, son_hata, logo_kayit_no FROM logo_giden WHERE belge_turu = 'malzeme' AND belge_no = $1`, [no]);
  const turOrtami = (bellek: SurecBellegi, adres = kopru.adres, sureMs = TEST_ISTEK_SURESI_MS): TurOrtami => ({
    kopru: kopruIstemcisiKur({ adres, anahtar: kopru.anahtar }, { sureMs }), bellek, saat: () => new Date(simdi),
  });
  // Hizmet gönderimi kodda kapalıdır; açık hâli yalnız testte, sahte köprünün test yoluyla denenir (gerçek "var mı" yolu bilinmiyor).
  const hizmetOrtami = (bellek: SurecBellegi, acik: { alinan: boolean; verilen: boolean }, varMiYolu = true): TurOrtami => ({
    kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, {
      sureMs: TEST_ISTEK_SURESI_MS,
      ...(varMiYolu ? { hizmetVarMiYolu: (yon: string, kod: string) => `/sahte/hizmet-var-mi/${yon}/${encodeURIComponent(kod)}` } : {}),
    }),
    bellek, saat: () => new Date(simdi), hizmetAcik: acik,
  });
  let hizmetSayac = 0;
  async function hizmetKart(yon: 'Alınan' | 'Verilen'): Promise<{ no: number; kod: string }> {
    const kimlik = `lbh${++hizmetSayac}`;
    await tamam(`/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur: 'hizmet', com: { kod: 'HZ-FSN-00001', ad: `Hizmet ${kimlik}`, birim: 'saat' }, g: { kat: 'fason', yon, cesit: 'Talaşlı imalat' }, onay: { durum: 'aktif' } },
      ozet: { benzersiz_anahtar: null, mukerrer_gerekcesi: null },
      surum: null,
    });
    const satir = await vt().tek<{ no: number; kod: string; durum: string | null }>(
      'SELECT no, stok_kodu AS kod, logo_gonderim_durumu AS durum FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]);
    assert.equal(satir?.durum, 'bekliyor', 'aktif hizmet kartı da kuyruğa düşer');
    return { no: satir.no, kod: satir.kod };
  }
  const hizmetGiden = (no: number): Promise<Giden | null> => vt().tek<Giden>(
    `SELECT niyet_zamani IS NOT NULL AS niyet, deneme_sayisi, son_sonuc, son_hata, logo_kayit_no FROM logo_giden WHERE belge_turu = 'hizmet' AND belge_no = $1`, [no]);
  const tur = (o: TurOrtami): Promise<TurSonucu> => malzemeTuru(vt(), o);
  const acmaSayisi = (kod: string): number => kopru.acilan.get(kod) ?? 0;
  const istekSayisi = (kod: string): number => kopru.istekler.filter((i) => i.yol.endsWith(kod) || (i.govde as { code?: string } | null)?.code === kod).length;
  // Kuyrukta yalnız bu testin kartı kalsın: önceki testlerin gönderilmemiş kartları bu testin turunu almasın.
  async function kuyruguBosalt(): Promise<void> {
    await vt().sorgu(
      `UPDATE malzeme_katalog_karti SET logo_gonderim_durumu = 'gonderildi', logo_kayit_no = 'T-' || no, logo_gonderim_zamani = now(), logo_hata = NULL
        WHERE logo_gonderim_durumu IN ('bekliyor', 'hata')`);
  }
  const bekle = (ms: number) => new Promise((coz) => setTimeout(coz, ms));

  before(async () => {
    ortam = await testVeritabaniKur('logobag');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Logo', kullaniciAdi: 'lb-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lb-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await tamam('/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    await tamam('/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'hammadde', logoDegeri: '10' });
    await tamam('/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: '06' });
    await tamam('/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'saat', logoDegeri: '05' });
    await tamam('/ayarlar/logo.baglanti/degistir', { deger: true });
    const opId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Okuyucu', kullaniciAdi: 'lb-okuyucu', parola: PAROLA }));
    // Yerleşik rollerin hiçbiri malzemeyi yalnız okumaz: okuyucu rolü testte açılır.
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('okuyucu', 'Okuyucu')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.malzemeler' FROM rol WHERE kod = 'okuyucu'");
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'okuyucu') WHERE kisi_id = $1", [opId]);
    const o = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lb-okuyucu', parola: PAROLA } });
    assert.equal(o.statusCode, 200, o.body);
    operatorCerezi = String(o.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    simdi += 24 * 3600_000;
    await kuyruguBosalt();
    // Birim seti listesi bu testin saatinde okunmuş sayılır: tur liste okumadan karta geçer.
    await vt().tx((db) => kopruListesiniYaz(db, kopru.birimSetleri.map((b) => ({ kod: b.code, ad: b.name })), new Date(simdi)));
  });
  afterEach(async () => { await kopru.kapat(); });

  test('LGB-5 (334 a) uçtan uca: kartın Açıklama 1-3\'ü malzemelerden Logo isteğine name2, name3, name4 olarak gider', async () => {
    const k = await aktifKart({ aciklamalar: ['Aciklama bir', 'Aciklama iki', 'Aciklama uc'] });
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'niyet', no: k.no });
    simdi += 5000;
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'gonderim', no: k.no, sonuc: 'gonderildi' });
    const govde = kopru.istekler.find((i) => i.yontem === 'POST')?.govde as Record<string, unknown> | undefined;
    assert.deepEqual([govde?.['name2'], govde?.['name3'], govde?.['name4']], ['Aciklama bir', 'Aciklama iki', 'Aciklama uc']);
  });

  test('LGB-8 kabul: kart aktif olur, "bekliyor"a düşer, işçi niyet yazar, sonraki turda gönderir; kart "gonderildi" ve kayıt numarası yazılır', async () => {
    const k = await aktifKart();
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'niyet', no: k.no });
    assert.equal(kopru.istekler.length, 0, 'niyet turunda istek yok');
    assert.equal((await giden(k.no))?.niyet, true);
    simdi += 5000;
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'gonderim', no: k.no, sonuc: 'gonderildi' });
    const ref = kopru.kartlar.get(k.kod);
    assert.ok(ref);
    assert.deepEqual(await kartLogo(k.no), { durum: 'gonderildi', kayit_no: String(ref), hata: null });
    assert.deepEqual(await giden(k.no), { niyet: false, deneme_sayisi: 1, son_sonuc: 'gonderildi', son_hata: null, logo_kayit_no: String(ref) });
    assert.deepEqual(kopru.istekler.map((i) => [i.yontem, i.yol, i.anahtar]), [
      ['GET', `/api/Material/exists/${k.kod}`, kopru.anahtar],
      ['POST', '/api/Material/AddRich', kopru.anahtar],
    ]);
    assert.deepEqual(kopru.istekler[1]?.govde, { code: k.kod, name: `Logo deneme lb${sayac}`, cardType: 10, unitSetCode: '06', auxilCode: 'TMI', vat: 20, sellVat: 20 });
    // Yinelenen turlar gönderilmiş kartı yeniden göndermez.
    for (let i = 0; i < 3; i++) { simdi += BELIRSIZ_BEKLEME_MS; assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'bos' }); }
    assert.equal(acmaSayisi(k.kod), 1);
  });

  test('LGB-8 gönderilen karşılık: tur sırasında karşılık değişse de karta Logo\'ya giden tür ve birim seti yazılır', async () => {
    const k = await aktifKart();
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'niyet', no: k.no });
    simdi += 5000;
    kopru.senaryo = 'yavas';
    kopru.gecikmeMs = 300;
    try {
      const gonderim = tur(turOrtami(bellek));
      // Kuyruk okunduktan sonra, köprü cevabı gelmeden karşılık başka bir oturumda değişir.
      await bekle(100);
      await vt().sorgu("UPDATE malzeme_logo_karsiligi SET logo_degeri = '05' WHERE cesit = 'birim' AND tmi_degeri = 'kg'");
      await vt().sorgu("UPDATE malzeme_logo_karsiligi SET logo_degeri = '11' WHERE cesit = 'tur' AND tmi_degeri = 'hammadde'");
      assert.deepEqual(await gonderim, { tur: 'gonderim', no: k.no, sonuc: 'gonderildi' });
      assert.equal((kopru.istekler[1]?.govde as { unitSetCode: string }).unitSetCode, '06');
      const kart = await vt().tek<{ tur: string | null; birim: string | null }>(
        'SELECT logo_kart_turu AS tur, logo_birim_seti AS birim FROM malzeme_katalog_karti WHERE no = $1', [k.no]);
      assert.deepEqual(kart, { tur: '10', birim: '06' });
    } finally {
      await vt().sorgu("UPDATE malzeme_logo_karsiligi SET logo_degeri = '06' WHERE cesit = 'birim' AND tmi_degeri = 'kg'");
      await vt().sorgu("UPDATE malzeme_logo_karsiligi SET logo_degeri = '10' WHERE cesit = 'tur' AND tmi_degeri = 'hammadde'");
    }
  });

  test('LGB-6 kalkan: kod Logo\'da varsa yeni kart açılmaz, var olan kaydın numarası yazılır', async () => {
    const k = await aktifKart();
    kopru.kartlar.set(k.kod, 4242);
    const bellek = yeniSurecBellegi();
    await tur(turOrtami(bellek));
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'gonderim', no: k.no, sonuc: 'zaten-vardi' });
    assert.deepEqual(await kartLogo(k.no), { durum: 'gonderildi', kayit_no: '4242', hata: null });
    assert.equal(kopru.istekler.filter((i) => i.yontem === 'POST').length, 0, 'açma isteği gitmedi');
  });

  test('LGB-3 doğrulama hatası: kart "hata" olur, metin saklanır; bekleme dolmadan istek yok, dolunca yeniden denenir', async () => {
    const k = await aktifKart();
    const bellek = yeniSurecBellegi();
    kopru.senaryo = 'dogrulama';
    await tur(turOrtami(bellek));
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'gonderim', no: k.no, sonuc: 'reddedildi' });
    const kart = await kartLogo(k.no);
    assert.equal(kart?.durum, 'hata');
    assert.match(kart?.hata ?? '', /NAME alani zorunlu; UNITSETCODE gecersiz/);
    assert.equal((await giden(k.no))?.niyet, false, 'kesin ret: niyet boşalır');
    const istek = kopru.istekler.length;
    simdi += 10_000;
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'bos' });
    assert.equal(kopru.istekler.length, istek, 'bekleme dolmadan istek yok');
    simdi += 30_000;
    kopru.senaryo = 'basari';
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'niyet', no: k.no });
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'gonderim', no: k.no, sonuc: 'gonderildi' });
    assert.equal((await kartLogo(k.no))?.durum, 'gonderildi');
    assert.equal(acmaSayisi(k.kod), 1);
  });

  test('LGB-4 401: anahtar reddedilirse kart "hata" olur; "var mı" okuması geçmediği için açma isteği gitmez', async () => {
    const k = await aktifKart();
    const bellek = yeniSurecBellegi();
    kopru.senaryo = 'yetkisiz';
    await tur(turOrtami(bellek));
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'gonderim', no: k.no, sonuc: 'yetkisiz' });
    assert.match((await kartLogo(k.no))?.hata ?? '', /anahtarı reddedildi \(401\)/);
    assert.equal(kopru.istekler.filter((i) => i.yontem === 'POST').length, 0);
  });

  test('LGB-4 köprüye ulaşılamaz: kart "hata", metin adres taşımaz', async () => {
    const k = await aktifKart();
    const bellek = yeniSurecBellegi();
    const kapali = await sahteKopruAc();
    const adres = kapali.adres;
    await kapali.kapat();
    await tur(turOrtami(bellek, adres));
    assert.deepEqual(await tur(turOrtami(bellek, adres)), { tur: 'gonderim', no: k.no, sonuc: 'ulasilamadi' });
    const hata = (await kartLogo(k.no))?.hata ?? '';
    assert.match(hata, /Köprüye ulaşılamadı/);
    assert.ok(!hata.includes('127.0.0.1') && !hata.includes(kopru.anahtar), hata);
  });

  test('LGB-6 zaman aşımı: kart "hata" ve "belirsiz"; bekleme dolmadan yeni açma isteği yok (yeni süreç dahil), dolunca önce "var mı"', async () => {
    const k = await aktifKart();
    const bellek = yeniSurecBellegi();
    kopru.senaryo = 'zaman-asimi';
    await tur(turOrtami(bellek));
    assert.deepEqual(await tur(turOrtami(bellek, kopru.adres, ZAMAN_ASIMI_SURESI_MS)), { tur: 'gonderim', no: k.no, sonuc: 'belirsiz' });
    assert.match((await kartLogo(k.no))?.hata ?? '', /cevap vermedi/);
    assert.equal((await giden(k.no))?.niyet, true, 'belirsiz istek: niyet kalır');
    kopru.senaryo = 'basari';
    const istek = kopru.istekler.length;
    for (const b of [bellek, yeniSurecBellegi()]) {
      simdi += 60_000;
      assert.deepEqual(await tur(turOrtami(b)), { tur: 'bos' });
    }
    assert.equal(kopru.istekler.length, istek);
    simdi += BELIRSIZ_BEKLEME_MS;
    assert.deepEqual(await tur(turOrtami(yeniSurecBellegi())), { tur: 'gonderim', no: k.no, sonuc: 'gonderildi' });
    assert.deepEqual(kopru.istekler.slice(istek).map((i) => i.yontem), ['GET', 'POST']);
    assert.equal(acmaSayisi(k.kod), 1);
  });

  test('LGB-6 zaman aşımından sonra köprü kartı yine açarsa (kuyrukta bekleyen istek) ve süreç yeniden başlarsa: Logo\'da tek kart', async () => {
    const k = await aktifKart();
    kopru.senaryo = 'gec-islenen';
    kopru.gecikmeMs = ZAMAN_ASIMI_SURESI_MS * 2;
    const bellek = yeniSurecBellegi();
    await tur(turOrtami(bellek));
    assert.deepEqual(await tur(turOrtami(bellek, kopru.adres, ZAMAN_ASIMI_SURESI_MS)), { tur: 'gonderim', no: k.no, sonuc: 'belirsiz' });
    simdi += 60_000;
    assert.deepEqual(await tur(turOrtami(yeniSurecBellegi())), { tur: 'bos' }, 'yeniden başlayan süreç beklemeyi bozmaz');
    await bekle(ZAMAN_ASIMI_SURESI_MS * 2);
    assert.equal(acmaSayisi(k.kod), 1, 'köprü kartı geç açtı');
    simdi += BELIRSIZ_BEKLEME_MS;
    kopru.senaryo = 'basari';
    assert.deepEqual(await tur(turOrtami(yeniSurecBellegi())), { tur: 'gonderim', no: k.no, sonuc: 'zaten-vardi' });
    assert.equal(acmaSayisi(k.kod), 1);
    assert.deepEqual(await kartLogo(k.no), { durum: 'gonderildi', kayit_no: String(kopru.kartlar.get(k.kod)), hata: null });
  });

  test('LGB-6 istek ulaşır, cevap kaybolur: "belirsiz"; bekleme sonrası "var mı" kaydı bulur, ikinci kart açılmaz', async () => {
    const k = await aktifKart();
    kopru.senaryo = 'cevap-kayboldu';
    const bellek = yeniSurecBellegi();
    await tur(turOrtami(bellek));
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'gonderim', no: k.no, sonuc: 'belirsiz' });
    assert.equal((await kartLogo(k.no))?.durum, 'hata');
    simdi += BELIRSIZ_BEKLEME_MS;
    kopru.senaryo = 'basari';
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'gonderim', no: k.no, sonuc: 'zaten-vardi' });
    assert.equal(acmaSayisi(k.kod), 1);
  });

  test('LGB-8 yavaş cevap: süre içinde gelen cevap beklenir; transaction "boşta" kesmesine düşmez', async () => {
    const k = await aktifKart();
    kopru.senaryo = 'yavas';
    kopru.gecikmeMs = 800;
    const bellek = yeniSurecBellegi();
    await tur(turOrtami(bellek, kopru.adres, 2000));
    // Boşta transaction kesmesi köprü cevabından kısa: köprü transaction dışında beklendiği için tur kesilmez.
    const kisaKesmeli: TxAcan = {
      tx: (is) => vt().tx(async (db) => {
        await db.sorgu("SELECT set_config('idle_in_transaction_session_timeout', '300', true)");
        return is(db);
      }),
    };
    const sonuc = await malzemeTuru(kisaKesmeli, turOrtami(bellek, kopru.adres, 2000));
    assert.deepEqual(sonuc, { tur: 'gonderim', no: k.no, sonuc: 'gonderildi' });
    assert.equal((await kartLogo(k.no))?.durum, 'gonderildi');
  });

  test('LGB-6 tur köprüden sonra kesilirse (açma isteği gitti, sonuç yazılamadı): aynı süreç de yeni süreç de ikinci kartı açmaz', async () => {
    const k = await aktifKart();
    const bellek = yeniSurecBellegi();
    await tur(turOrtami(bellek));
    // Sonucu yazacak ikinci transaction açılamaz: köprü kartı açtı, TMI bilmiyor.
    let txSayisi = 0;
    const kesik: TxAcan = {
      tx: (is) => (++txSayisi === 2 ? Promise.reject(new Error('veritabanı koptu (benzetim)')) : vt().tx(is)),
    };
    await assert.rejects(malzemeTuru(kesik, turOrtami(bellek)), /benzetim/);
    assert.equal(txSayisi, 2);
    assert.equal(acmaSayisi(k.kod), 1);
    assert.equal((await kartLogo(k.no))?.durum, 'bekliyor', 'TMI kartı sonucu almadı');
    simdi += 10_000;
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'bos' }, 'aynı süreç');
    assert.deepEqual(await tur(turOrtami(yeniSurecBellegi())), { tur: 'bos' }, 'yeni süreç');
    simdi += BELIRSIZ_BEKLEME_MS;
    assert.deepEqual(await tur(turOrtami(yeniSurecBellegi())), { tur: 'gonderim', no: k.no, sonuc: 'zaten-vardi' });
    assert.equal(acmaSayisi(k.kod), 1);
  });

  test('LGB-6 eşzamanlı iki işçi: aynı anda tek tur koşar; başka sürecin niyeti beklemesiz gönderilmez; Logo\'da tek kart', async () => {
    const k = await aktifKart();
    kopru.senaryo = 'yavas';
    kopru.gecikmeMs = 1000;
    const a = yeniSurecBellegi();
    const b = yeniSurecBellegi();
    const is = (bellek: SurecBellegi) => isTanimi({ ad: 'logo-test', aralikMs: 1000, txDisi: async (v) => { await malzemeTuru(v, turOrtami(bellek, kopru.adres, 2000)); } });
    await isiBirKezCalistir(vt(), is(a));
    assert.equal((await giden(k.no))?.niyet, true);
    assert.equal(await isiBirKezCalistir(vt(), is(b)), 'tamam');
    assert.equal(kopru.istekler.length, 0, 'b, a\'nın niyetini taze saymaz');
    // a köprüyü beklerken b'nin turu kilidi alamaz ve atlanır. Sabit bekleme yavaş makinede a kilidi almadan b'yi koşturur;
    // a'nın köprüye isteği görülünce a'nın kilidi tuttuğu kesindir.
    const aTuru = isiBirKezCalistir(vt(), is(a));
    for (let i = 0; kopru.istekler.length === 0; i++) { assert.ok(i < 500, 'a köprüye istek atmadı'); await bekle(10); }
    assert.equal(await isiBirKezCalistir(vt(), is(b)), 'atlandi');
    assert.equal(await aTuru, 'tamam');
    assert.equal((await kartLogo(k.no))?.durum, 'gonderildi');
    for (const bellek of [a, b]) { simdi += BELIRSIZ_BEKLEME_MS; await isiBirKezCalistir(vt(), is(bellek)); }
    assert.equal(acmaSayisi(k.kod), 1);
  });

  test('LGB-10 köprü cevabı beklenirken işin açık transaction\'ı yok: Logo kaydı açtıktan sonra geri alınacak yazı kalmaz (borç 258)', async () => {
    const k = await aktifKart();
    kopru.senaryo = 'yavas';
    kopru.gecikmeMs = 1500;
    const bellek = yeniSurecBellegi();
    // İşin açtığı her transaction'ın sunucu oturumu tutulur; köprü beklenirken o oturumlarda transaction görülmemeli.
    const oturumlar = new Set<number>();
    const izli: Veritabani = {
      ...vt(),
      tx: (is) => vt().tx(async (db) => {
        const o = await db.tek<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        if (o) oturumlar.add(o.pid);
        return is(db);
      }),
    };
    const is = isTanimi({ ad: 'logo-tx-disi-test', aralikMs: 1000, txDisi: async (v) => { await malzemeTuru(v, turOrtami(bellek, kopru.adres, 4000)); } });
    assert.equal(await isiBirKezCalistir(izli, is), 'tamam');
    assert.equal((await giden(k.no))?.niyet, true);
    const turSozu = isiBirKezCalistir(izli, is);
    for (let i = 0; !kopru.istekler.some((x) => x.yontem === 'POST'); i++) { assert.ok(i < 500, 'açma isteği gitmedi'); await bekle(10); }
    assert.ok(oturumlar.size > 0);
    const acik = await vt().tek<{ n: number }>(
      'SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = ANY($1::int[]) AND pid <> pg_backend_pid() AND xact_start IS NOT NULL', [[...oturumlar]]);
    assert.equal(acik?.n, 0, 'köprü beklenirken işin transaction\'ı açık');
    assert.equal(await turSozu, 'tamam');
    assert.equal((await kartLogo(k.no))?.durum, 'gonderildi');
    assert.equal(acmaSayisi(k.kod), 1);
  });

  test('LGB-9 eksikli kart gönderilmez: istek yok, giden kutusuna satır yazılmaz', async () => {
    const k = await aktifKart({ birim: 'adet' });
    assert.deepEqual(await tur(turOrtami(yeniSurecBellegi())), { tur: 'bos' });
    assert.equal(await giden(k.no), null);
    assert.equal(kopru.istekler.length, 0);
    assert.equal(istekSayisi(k.kod), 0);
  });

  const anahtar = (deger: boolean) => tamam('/ayarlar/logo.baglanti/degistir', { deger });
  // Ağ isteği atılırsa sayılır ve düşer; testte gerçek ağ çağrısı yok.
  async function agsiz<T>(fn: () => Promise<T>): Promise<{ sonuc: T; cagri: number }> {
    const asil = globalThis.fetch;
    let cagri = 0;
    globalThis.fetch = (async () => { cagri += 1; throw new Error('ağ isteği atılmamalıydı'); }) as typeof fetch;
    try {
      return { sonuc: await fn(), cagri };
    } finally {
      globalThis.fetch = asil;
    }
  }

  test('LGB-1 anahtar kapalı + değişkenler var: istek çıkmaz, hiçbir şey yazılmaz, kart "bekliyor" kalır', async () => {
    const k = await aktifKart();
    await anahtar(false);
    try {
      const bellek = yeniSurecBellegi();
      for (let i = 0; i < 3; i++) { simdi += 3600_000; assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'kapali' }); }
      // Asıl iş de kapalıyken hata vermez, "bekliyor" döner.
      assert.equal(await isiBirKezCalistir(vt(), isler[0]!), 'bekliyor');
    } finally {
      await anahtar(true);
    }
    assert.equal(kopru.istekler.length, 0, 'sahte köprüye istek gelmedi');
    assert.equal(await giden(k.no), null);
    assert.equal((await kartLogo(k.no))?.durum, 'bekliyor', 'kuyruk birikir');
  });

  test('LGB-1 anahtar açık + değişken yok: istek çıkmaz, iş "bekliyor" döner; neden sağlık ayrıntısında görünür', async () => {
    const k = await aktifKart();
    assert.equal(process.env['TMIV2_LOGO_KOPRU_ADRESI'], undefined, 'test ortamında köprü değişkeni yok');
    assert.deepEqual(isler.map((i) => i.ad), ['logo-malzeme-gonderimi', 'logo-satin-alma-gonderimi', 'logo-satis-gonderimi', 'logo-malzeme-fisi-gonderimi', 'logo-mal-kabul-okumasi', 'logo-liste-okumasi', 'logo-fatura-okumasi']);
    const { cagri } = await agsiz(async () => {
      assert.deepEqual(await tur({ kopru: null, bellek: yeniSurecBellegi(), saat: () => new Date(simdi) }), { tur: 'ortam-degiskeni-yok' });
      assert.equal(await isiBirKezCalistir(vt(), isler[0]!), 'bekliyor');
      assert.equal(await isiBirKezCalistir(vt(), isler[1]!), 'bekliyor', 'satın alma işi de istek atmadan bekler');
      assert.equal(await isiBirKezCalistir(vt(), isler[2]!), 'bekliyor', 'satış işi de istek atmadan bekler');
      // Asıl iş tanımı (ortam değişkenleri süreçten okunur) zamanlayıcıyla koşar; durum sağlık ayrıntısına düşer.
      const zamanlayici = zamanlayiciKur({
        vt: vt(), gunluk: { error: () => undefined, warn: () => undefined },
        isler: [isTanimi({ ad: isler[0]!.ad, aralikMs: 1000, txDisi: isler[0]!.txDisi })],
      });
      zamanlayici.baslat();
      try {
        type Durum = { ad: string; sonSonuc: string | null; sonHata: string | null; sonNeden: string | null };
        let durum: Durum | undefined;
        for (let i = 0; i < 40 && durum?.sonSonuc == null; i++) {
          await bekle(100);
          const c = await istek('GET', '/saglik/ayrinti');
          assert.equal(c.statusCode, 200, c.body);
          durum = (c.json() as { isler: Durum[] }).isler.find((d) => d.ad === 'logo-malzeme-gonderimi');
        }
        assert.equal(durum?.sonSonuc, 'bekliyor');
        assert.equal(durum?.sonHata, null);
        assert.match(durum?.sonNeden ?? '', /TMIV2_LOGO_KOPRU_ADRESI/);
        assert.doesNotMatch(durum?.sonNeden ?? '', /http|127\.0\.0\.1/, 'neden değer taşımaz');
      } finally {
        await zamanlayici.durdur(1000);
      }
    });
    assert.equal(cagri, 0, 'ağ isteği yok');
    assert.equal(await giden(k.no), null);
    assert.equal((await kartLogo(k.no))?.durum, 'bekliyor');
    assert.ok((await modulIsleriniKesfet()).some((is) => is.ad === 'logo-malzeme-gonderimi'));
  });

  test('LGB-1 anahtar açık + değişkenler var: istek çıkar; anahtarı açıp kapatmak denetim kaydına düşer', async () => {
    const k = await aktifKart();
    const bellek = yeniSurecBellegi();
    await tur(turOrtami(bellek));
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'gonderim', no: k.no, sonuc: 'gonderildi' });
    assert.equal(kopru.istekler.length, 2);
    // Ayarlar modülü değişikliği eski ve yeni değerle denetime yazar.
    const kayitlar = async () => vt().sorgu<{ govde: { eski: boolean; yeni: boolean } }>(
      "SELECT govde FROM denetim_kaydi WHERE parametre->>'anahtar' = 'logo.baglanti' AND govde ? 'yeni' ORDER BY id");
    const once = (await kayitlar()).length;
    await anahtar(false);
    await anahtar(true);
    assert.deepEqual((await kayitlar()).slice(once).map((r) => r.govde), [{ eski: true, yeni: false }, { eski: false, yeni: true }]);
  });

  test('LGB-11 KDV ayarı: varsayılan 20 okunur ve vat ile sellVat 20 gider; ayar değişince yeni oran gider', async () => {
    const kdvYaz = (deger: number) => tamam<{ deger: number | null }>('/ayarlar/logo.kdv-orani/degistir', { deger });
    const kdvOku = async (): Promise<unknown> =>
      ((await istek('GET', '/ayarlar')).json() as { ayarlar: { anahtar: string; deger: unknown }[] }).ayarlar.find((a) => a.anahtar === 'logo.kdv-orani')?.deger;
    const gonder = async (): Promise<Record<string, unknown> | undefined> => {
      await kuyruguBosalt();
      const k = await aktifKart();
      const bellek = yeniSurecBellegi();
      await tur(turOrtami(bellek));
      assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'gonderim', no: k.no, sonuc: 'gonderildi' });
      return kopru.istekler.filter((i) => i.yontem === 'POST').at(-1)?.govde as Record<string, unknown> | undefined;
    };
    assert.equal(await vt().tek("SELECT 1 FROM ayar WHERE anahtar = 'logo.kdv-orani'"), null, 'ayar hiç yazılmamış');
    assert.equal(await kdvOku(), 20, 'varsayılan 20');
    const varsayilan = await gonder();
    assert.equal(varsayilan?.['vat'], 20);
    assert.equal(varsayilan?.['sellVat'], 20);
    try {
      assert.equal((await kdvYaz(10)).deger, 10);
      const degisen = await gonder();
      assert.equal(degisen?.['vat'], 10);
      assert.equal(degisen?.['sellVat'], 10);
    } finally {
      await kdvYaz(20);
    }
  });

  test('LGB-20 KDV ayarları boşaltılabilir: malzeme oranı doldurulup boşaltılınca vat ve sellVat gitmez; hizmet oranı boş gelir, doldurulup boşaltılınca VAT_PERC gitmez', async () => {
    const yaz = (anahtar: string, deger: number | null) => tamam<{ deger: number | null }>(`/ayarlar/${anahtar}/degistir`, { deger });
    const sonPost = (): Record<string, unknown> | undefined => kopru.istekler.filter((i) => i.yontem === 'POST').at(-1)?.govde as Record<string, unknown> | undefined;
    const malzemeGonder = async () => {
      await kuyruguBosalt();
      const k = await aktifKart();
      const bellek = yeniSurecBellegi();
      await tur(turOrtami(bellek));
      assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'gonderim', no: k.no, sonuc: 'gonderildi' });
      return sonPost();
    };
    const hizmetGonder = async () => {
      await kuyruguBosalt();
      const k = await hizmetKart('Alınan');
      const bellek = yeniSurecBellegi();
      const acik = { alinan: true, verilen: false };
      await tur(hizmetOrtami(bellek, acik));
      assert.deepEqual(await tur(hizmetOrtami(bellek, acik)), { tur: 'gonderim', no: k.no, sonuc: 'gonderildi' });
      return sonPost();
    };
    try {
      assert.equal((await yaz('logo.kdv-orani', 10)).deger, 10);
      assert.equal((await yaz('logo.kdv-orani', null)).deger, null);
      const m = await malzemeGonder();
      assert.ok(m && !('vat' in m) && !('sellVat' in m), JSON.stringify(m));
      assert.ok(!('VAT_PERC' in ((await hizmetGonder()) ?? {})), 'hizmet oranı varsayılan boş');
      assert.equal((await yaz('logo.hizmet-kdv-orani', 18)).deger, 18);
      assert.equal((await hizmetGonder())?.['VAT_PERC'], 18);
      assert.equal((await yaz('logo.hizmet-kdv-orani', null)).deger, null);
      assert.ok(!('VAT_PERC' in ((await hizmetGonder()) ?? {})), 'boşaltılan hizmet oranı gitmez');
    } finally {
      await yaz('logo.kdv-orani', 20);
      await yaz('logo.hizmet-kdv-orani', null);
    }
  });

  test('LGB-18 hizmet gönderimi kodda kapalı: hizmet kartına istek yok, satır yok, kart bekler; malzeme kartı aynı kuyrukta gitmeye devam eder', async () => {
    const h = await hizmetKart('Alınan');
    const k = await aktifKart();
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'niyet', no: k.no }, 'hizmet kartı atlanır, malzeme kartına geçilir');
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'gonderim', no: k.no, sonuc: 'gonderildi' });
    for (let i = 0; i < 3; i++) { simdi += BELIRSIZ_BEKLEME_MS; assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'bos' }); }
    assert.equal(kopru.istekler.filter((i) => /Service|hizmet/.test(i.yol)).length, 0, 'hizmet ucuna istek yok');
    assert.equal(await hizmetGiden(h.no), null);
    assert.equal(await giden(h.no), null, 'malzeme olarak da yazılmadı');
    assert.equal((await kartLogo(h.no))?.durum, 'bekliyor');
  });

  test('LGB-19 hizmet açıkken (test): önce "var mı", sonra yönün ucuna açma; alınan açık olunca verilen kapalı kalır', async () => {
    const a = await hizmetKart('Alınan');
    const v = await hizmetKart('Verilen');
    const bellek = yeniSurecBellegi();
    const yalnizAlinan = { alinan: true, verilen: false };
    assert.deepEqual(await tur(hizmetOrtami(bellek, yalnizAlinan)), { tur: 'niyet', no: a.no });
    assert.deepEqual(await tur(hizmetOrtami(bellek, yalnizAlinan)), { tur: 'gonderim', no: a.no, sonuc: 'gonderildi' });
    const ref = kopru.hizmetKartlari.get(a.kod);
    assert.ok(ref);
    assert.deepEqual(await kartLogo(a.no), { durum: 'gonderildi', kayit_no: String(ref), hata: null });
    assert.equal((await hizmetGiden(a.no))?.son_sonuc, 'gonderildi');
    assert.deepEqual(kopru.istekler.map((i) => [i.yontem, i.yol]), [
      ['GET', `/sahte/hizmet-var-mi/alinan/${a.kod}`],
      ['POST', '/api/PurchaseService/AddRich'],
    ]);
    assert.deepEqual(kopru.istekler[1]?.govde, { CODE: a.kod, DESCRIPTION: `Hizmet lbh${hizmetSayac - 1}`, CARD_TYPE: 1, UNITSET_CODE: '05', AUXIL_CODE: 'TMI' });
    simdi += BELIRSIZ_BEKLEME_MS;
    assert.deepEqual(await tur(hizmetOrtami(bellek, yalnizAlinan)), { tur: 'bos' }, 'verilen kapalı');
    assert.equal(kopru.istekler.length, 2);
    const ikisi = { alinan: true, verilen: true };
    assert.deepEqual(await tur(hizmetOrtami(bellek, ikisi)), { tur: 'niyet', no: v.no });
    assert.deepEqual(await tur(hizmetOrtami(bellek, ikisi)), { tur: 'gonderim', no: v.no, sonuc: 'gonderildi' });
    assert.deepEqual(kopru.istekler.slice(2).map((i) => [i.yontem, i.yol]), [
      ['GET', `/sahte/hizmet-var-mi/verilen/${v.kod}`],
      ['POST', '/api/SalesService/AddRich'],
    ]);
    assert.equal((kopru.istekler[3]?.govde as { CARD_TYPE?: number }).CARD_TYPE, 2);
    assert.equal(kopru.hizmetAcilan.get(a.kod), 1);
    assert.equal(kopru.hizmetAcilan.get(v.kod), 1);
  });

  test('LGB-19 kalkan: hizmet kodu Logo\'da varsa açılmaz; "var mı" yolu yoksa yalnız taze niyetle açılır, sonucu bilinmeyen istek yinelenmez (yeni süreçte de)', async () => {
    const a = await hizmetKart('Alınan');
    kopru.hizmetKartlari.set(a.kod, 7777);
    const bellek = yeniSurecBellegi();
    const acik = { alinan: true, verilen: false };
    await tur(hizmetOrtami(bellek, acik));
    assert.deepEqual(await tur(hizmetOrtami(bellek, acik)), { tur: 'gonderim', no: a.no, sonuc: 'zaten-vardi' });
    assert.equal((await kartLogo(a.no))?.kayit_no, '7777');
    assert.equal(kopru.istekler.filter((i) => i.yontem === 'POST').length, 0);
    await kuyruguBosalt();
    const b = await hizmetKart('Alınan');
    const b2 = yeniSurecBellegi();
    kopru.senaryo = 'cevap-kayboldu';
    await tur(hizmetOrtami(b2, acik, false));
    assert.deepEqual(await tur(hizmetOrtami(b2, acik, false)), { tur: 'gonderim', no: b.no, sonuc: 'belirsiz' });
    kopru.senaryo = 'basari';
    simdi += BELIRSIZ_BEKLEME_MS;
    for (const bb of [b2, yeniSurecBellegi()]) {
      assert.deepEqual(await tur(hizmetOrtami(bb, acik, false)), { tur: 'gonderim', no: b.no, sonuc: 'reddedildi' });
      simdi += 10 * 60_000;
    }
    assert.equal(kopru.hizmetAcilan.get(b.kod), 1, 'Logo\'da tek hizmet kartı');
    assert.match((await kartLogo(b.no))?.hata ?? '', /Logo'da kontrol edin/);
    await kuyruguBosalt();
    const c = await hizmetKart('Alınan');
    const c2 = yeniSurecBellegi();
    await tur(hizmetOrtami(c2, acik, false));
    assert.deepEqual(await tur(hizmetOrtami(c2, acik, false)), { tur: 'gonderim', no: c.no, sonuc: 'gonderildi' }, 'taze niyetle açılır');
  });

  test('LGB-21 hizmet ayarı: "alınan hizmet kartı gönderimi" açılınca alınan kart gider, verilen kart bekler', async () => {
    await kuyruguBosalt();
    const a = await hizmetKart('Alınan');
    const v = await hizmetKart('Verilen');
    const bellek = yeniSurecBellegi();
    const ortam = (): TurOrtami => {
      const { hizmetAcik: _ayardanOkunur, ...o } = hizmetOrtami(bellek, { alinan: false, verilen: false });
      return o;
    };
    assert.deepEqual(await tur(ortam()), { tur: 'bos' }, 'ayarlar kapalı gelir');
    await tamam('/ayarlar/logo.hizmet-alinan-gonderimi/degistir', { deger: true });
    try {
      assert.deepEqual(await tur(ortam()), { tur: 'niyet', no: a.no });
      assert.deepEqual(await tur(ortam()), { tur: 'gonderim', no: a.no, sonuc: 'gonderildi' });
      assert.deepEqual(await tur(ortam()), { tur: 'bos' });
      assert.equal(kopru.hizmetAcilan.get(v.kod), undefined);
    } finally {
      await tamam('/ayarlar/logo.hizmet-alinan-gonderimi/degistir', { deger: false });
    }
  });

  test('LGB-10 geçersiz karşılık: birim seti Logo listesinde yoksa niyet ve istek yok, kart "hata: Geçersiz karşılık"', async () => {
    await tamam('/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: '99' });
    try {
      const k = await aktifKart();
      assert.deepEqual(await tur(turOrtami(yeniSurecBellegi())), { tur: 'gonderim', no: k.no, sonuc: 'reddedildi' });
      assert.equal(kopru.istekler.length, 0);
      const kart = await kartLogo(k.no);
      assert.equal(kart?.durum, 'hata');
      assert.match(kart?.hata ?? '', /^Geçersiz karşılık: birim seti 99/);
      assert.equal((await giden(k.no))?.niyet, false);
    } finally {
      await tamam('/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: '06' });
    }
  });

  test('LGB-12 birim seti listesi: eskiyince tur yalnız listeyi okur (tek istek); elle girilen ve listede olmayan "geçersiz" görünür', async () => {
    await tamam('/logo/birim-setleri/ekle', { kod: 'EL1', ad: 'Elle' });
    simdi += 2 * 3600_000;
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await tur(turOrtami(bellek)), { tur: 'liste', sonuc: 'okundu' });
    assert.deepEqual(kopru.istekler.map((i) => [i.yontem, i.yol]), [['GET', '/api/Lookup/unitsets']]);
    assert.equal((await vt().tx((db) => birimSetiOkumasi(db)))?.sonOkumaAn.getTime(), simdi);
    const c = await istek('GET', '/logo/birim-setleri');
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json() as { setler: { kod: string; elle: boolean; kopruListesinde: boolean; gecerli: boolean }[]; baglanti: string; sonOkuma: string | null };
    assert.equal(g.baglanti, 'ortam-degiskeni-yok', 'test sürecinde köprü değişkeni yok, anahtar açık');
    assert.ok(g.sonOkuma);
    assert.deepEqual(g.setler.find((x) => x.kod === 'EL1'), { kod: 'EL1', ad: 'Elle', elle: true, kopruListesinde: false, gecerli: false });
    assert.equal(g.setler.find((x) => x.kod === '06')?.gecerli, true);
    // Başarısız okuma her turda yinelenmez; liste taze olunca tur karta geçer.
    kopru.senaryo = 'yetkisiz';
    simdi += 2 * 3600_000;
    const b2 = yeniSurecBellegi();
    assert.deepEqual(await tur(turOrtami(b2)), { tur: 'liste', sonuc: 'yetkisiz' });
    assert.deepEqual(await tur(turOrtami(b2)), { tur: 'bos' }, 'aralık dolmadan yeniden okunmaz; kuyruk boş');
    assert.equal(kopru.istekler.length, 2);
    assert.equal((await tamam<{ kod: string }>('/logo/birim-setleri/EL1/kaldir', {})).kod, 'EL1');
  });

  test('LGB-14 birim seti uçları: yönetici ekler ve kaldırır; kullanılan set kaldırılamaz; okuyucu okur, yazamaz; yazma denetlenir', async () => {
    assert.equal((await istek('GET', '/logo/birim-setleri', undefined, operatorCerezi)).statusCode, 200);
    assert.equal((await istek('POST', '/logo/birim-setleri/ekle', { kod: 'OP1', ad: null }, operatorCerezi)).statusCode, 403);
    assert.equal((await istek('POST', '/logo/birim-setleri/ekle', { kod: 'iki kelime', ad: null })).statusCode, 400);
    assert.deepEqual(await tamam('/logo/birim-setleri/ekle', { kod: 'EL2', ad: null }), { kod: 'EL2' });
    assert.equal((await istek('POST', '/logo/birim-setleri/EL2/kaldir', {}, operatorCerezi)).statusCode, 403);
    // '06' kuyruktaki kartın birim karşılığı: elle işaretlense de kaldırılamaz.
    await aktifKart();
    await tamam('/logo/birim-setleri/ekle', { kod: '06', ad: null });
    const ret = await istek('POST', '/logo/birim-setleri/06/kaldir', {});
    assert.equal(ret.statusCode, 422, ret.body);
    assert.match(ret.body, /kullanılıyor/);
    assert.equal((await istek('POST', '/logo/birim-setleri/YOK/kaldir', {})).statusCode, 404);
    assert.equal((await istek('POST', '/logo/birim-setleri/05/kaldir', {})).statusCode, 422, 'köprüden gelen, elle eklenmemiş');
    assert.deepEqual(await tamam('/logo/birim-setleri/EL2/kaldir', {}), { kod: 'EL2' });
    const c = await istek('GET', '/logo/birim-setleri');
    assert.equal((c.json() as { setler: { kod: string }[] }).setler.some((x) => x.kod === 'EL2'), false);
    const denetim = await vt().sorgu<{ yol: string }>("SELECT yol FROM denetim_kaydi WHERE yol LIKE '%/logo/birim-setleri/%' ORDER BY id");
    assert.ok(denetim.some((d) => d.yol.endsWith('/ekle')) && denetim.some((d) => d.yol.endsWith('/kaldir')), JSON.stringify(denetim));
  });
});
