import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { EntegrasyonGunlukCevabi, EntegrasyonYonetimiCevabi } from '#paylasilan/sozlesme/entegrasyon.ts';
import type { IrsaliyeListesiCevabi } from '#paylasilan/sozlesme/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { gunlugeYaz, kapiliTur, kapilariSifirla } from './isler.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { ESKI_YARDIMCI_OKUMA_ILETISI, yonetimAkisi } from './kurallar.ts';
import { irsaliyeTuru } from './irsaliye.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { malKabulTuru, yeniSurecBellegi } from './servis.ts';
import type { SurecBellegi } from './servis.ts';
import { baglantiTesti, simdiOku, yonetimOzeti } from './yonetim.ts';
import { baglantiHatasiniTemizle, yardimciCevabiniIzle, yazmaUyarisi } from './yardimci-baglanti.ts';
import { hazirlik } from './servis.ts';
import * as s from './sorgular.ts';

const PAROLA = 'dogru-parola-1';
const DK = 60_000;

// 3445: Logo yönetim sayfası. Sıklık kapısı gerçek mal kabul turuyla ve sahte köprüyle ölçülür (istek sayısı, imleç); uçlar gerçek girişle.
describe('Logo yönetimi: sıklık kapısı, akış günlüğü ve sayfa uçları (gerçek PostgreSQL, sahte köprü)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kopru: SahteKopru;
  let yonetici = '';
  let depocu = '';
  let izleyici = '';
  let simdi = Date.parse('2026-11-19T08:00:00Z');
  let bellek: SurecBellegi = yeniSurecBellegi();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  const ayar = async (anahtar: string, deger: boolean | string): Promise<void> => {
    const c = await app.inject({ method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: yonetici, 'istek-kimligi': randomUUID() }, payload: { deger } });
    assert.equal(c.statusCode, 200, `${anahtar}: ${c.body}`);
  };
  const saat = () => new Date(simdi);
  const istemci = () => kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 });
  const malKabulIsi = () =>
    kapiliTur(o().vt, 'logo-mal-kabul-okumasi', (vt, zorlaAni) => malKabulTuru(vt, { kopru: istemci(), bellek, saat, zorlaAni }), yonetimAkisi('mal-kabul'), saat);
  const istekSayisi = (): number => kopru.istekler.filter((x) => x.yol === '/api/PurchaseOrder/receipts').length;
  const gunluk = () => o().sahip.sorgu<{ akis: string; yon: string; sonuc: string; sayi: number | null; ileti: string | null }>(
    'SELECT akis, yon, sonuc, sayi, ileti FROM logo_akis_gunlugu ORDER BY id');
  const oku = (yol: string, cerez = yonetici) => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
  const komut = (yol: string, cerez = yonetici) => app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez } });

  before(async () => {
    ortam = await testVeritabaniKur('logoyonetim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ly-yonetici', parola: PAROLA }));
    const id = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Depocu', kullaniciAdi: 'ly-depocu', parola: PAROLA }));
    await o().vt.sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'depo') WHERE kisi_id = $1", [id]);
    const iz = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme İzleyici', kullaniciAdi: 'ly-izleyici', parola: PAROLA }));
    await o().vt.sorgu("INSERT INTO rol (kod, ad) VALUES ('ly_izleyici', 'ly_izleyici')");
    await o().vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.logo' FROM rol WHERE kod = 'ly_izleyici'");
    await o().vt.sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'ly_izleyici') WHERE kisi_id = $1", [iz]);
    yonetici = await giris('ly-yonetici');
    depocu = await giris('ly-depocu');
    izleyici = await giris('ly-izleyici');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    kapilariSifirla();
    bellek = yeniSurecBellegi();
    simdi += 24 * 3600_000;
    for (const t of ['logo_akis_gunlugu', 'logo_mal_kabul_satiri', 'logo_mal_kabul_imleci', 'logo_irsaliye_imleci']) await o().sahip.sorgu(`DELETE FROM ${t}`);
    await ayar('logo.baglanti', true);
    await ayar('logo.mal-kabul-okumasi', true);
    await ayar('logo.mal-kabul-sikligi', '15dk');
  });
  afterEach(async () => { await kopru.kapat(); });

  test('varsayılan 15 dakika: dakika tikinde istek yalnız sırası gelince çıkar; arada imleç kaymaz, her tur günlüğe yazılır', async () => {
    kopru.malKabulSatirlari.push({ logicalRef: 11, orderLineRef: 101, itemCode: 'ORN-M-1', quantity: 4 });
    await malKabulIsi();
    assert.equal(istekSayisi(), 1);
    await malKabulIsi();
    assert.equal(istekSayisi(), 2, 'kayıt gelen tur pencereyi açık tutar: sonraki tik boş sayfaya kadar okur');
    const imlec = await o().sahip.tek<{ son_ref: number }>('SELECT son_ref FROM logo_mal_kabul_imleci');
    for (let i = 1; i <= 14; i++) {
      simdi += DK;
      await malKabulIsi();
    }
    assert.equal(istekSayisi(), 2, '15 dakika dolmadan istek yok');
    assert.deepEqual(await o().sahip.tek('SELECT son_ref FROM logo_mal_kabul_imleci'), imlec);
    simdi += DK;
    await malKabulIsi();
    assert.equal(istekSayisi(), 3);
    const g = await gunluk();
    assert.deepEqual(g.map((x) => [x.akis, x.yon, x.sonuc, x.sayi]), [['mal-kabul', 'okuma', 'tamam', 1], ['mal-kabul', 'okuma', 'tamam', 0], ['mal-kabul', 'okuma', 'tamam', 0]]);
  });

  test('"Yalnız elle": tik istek atmaz; "Şimdi oku" art arda basılsa da tek tur okur', async () => {
    await ayar('logo.mal-kabul-sikligi', 'elle');
    for (let i = 0; i < 5; i++) {
      simdi += DK;
      await malKabulIsi();
    }
    assert.equal(istekSayisi(), 0);
    for (let i = 0; i < 3; i++) await o().vt.tx((db) => simdiOku(db, 'mal-kabul', istemci()));
    await malKabulIsi();
    await malKabulIsi();
    assert.equal(istekSayisi(), 1, 'üç basış, iki tik: tek istek');
  });

  test('bağlantı ya da akış kapalıyken (409) okutulamaz, tik istek atmaz; açılınca ilk tikte okunur', async () => {
    await ayar('logo.mal-kabul-okumasi', false);
    const r = await komut('/logo/yonetim/akislar/mal-kabul/simdi-oku');
    assert.equal(r.statusCode, 409, r.body);
    await malKabulIsi();
    assert.equal(istekSayisi(), 0);
    await ayar('logo.mal-kabul-okumasi', true);
    await ayar('logo.baglanti', false);
    assert.equal((await komut('/logo/yonetim/akislar/mal-kabul/simdi-oku')).statusCode, 409);
    assert.equal((await oku('/logo/yonetim/baglanti-testi')).statusCode, 409);
    await malKabulIsi();
    assert.equal(istekSayisi(), 0);
    assert.equal((await gunluk()).length, 0, 'kapalı akış günlüğü doldurmaz');
    await ayar('logo.baglanti', true);
    simdi += DK;
    await malKabulIsi();
    assert.equal(istekSayisi(), 1, 'kapalıyken geçen süre sayılmaz, açılınca beklemeden okunur');
  });

  test('irsaliye en az iki tur okur: kayıt gelmese de pencere ikinci tikte kapanır, sonra sıklık beklenir', async () => {
    await ayar('logo.irsaliye-okumasi', true);
    await ayar('logo.irsaliye-sikligi', '15dk');
    let tur = 0;
    const irsaliyeIsi = () => kapiliTur(o().vt, 'logo-irsaliye-okumasi', async () => { tur++; return { tur: 'okuma', akis: 'irsaliye', sonuc: 'okundu', sayi: 0 }; }, yonetimAkisi('irsaliye'), saat);
    for (let i = 0; i < 5; i++) { await irsaliyeIsi(); simdi += DK; }
    assert.equal(tur, 2);
  });

  test('3453: eski yardımcının 404\'ü nedeniyle günlüğe, Logo sayfasına ve irsaliye ekranına yazılır; başarılı turdan sonra irsaliye ekranındaki uyarı kalkar', async () => {
    await ayar('logo.irsaliye-okumasi', true);
    await ayar('logo.irsaliye-sikligi', '15dk');
    const irsaliyeIsi = () => kapiliTur(o().vt, 'logo-irsaliye-okumasi', (vt, zorlaAni) => irsaliyeTuru(vt, { kopru: istemci(), bellek, saat, zorlaAni }), yonetimAkisi('irsaliye'), saat);
    const liste = async () => (await oku('/logo/irsaliyeler?yon=alis&gun=30&sayfa=1')).json<IrsaliyeListesiCevabi>();
    assert.equal((await liste()).okuma.sonHata, null, 'tur yokken uyarı yok');
    kopru.irsaliyeUcuYok = true;
    await irsaliyeIsi();
    assert.ok(kopru.irsaliyeIstekleri.length > 0, 'istek gerçekten yardımcıya gitti');
    const g = await gunluk();
    assert.deepEqual(g.map((x) => [x.akis, x.sonuc, x.ileti]), [['irsaliye', 'hata', ESKI_YARDIMCI_OKUMA_ILETISI]]);
    assert.match(ESKI_YARDIMCI_OKUMA_ILETISI, /eski sürüm.*404.*güncelleyin/);
    const ozet = (await oku('/logo/yonetim')).json<EntegrasyonYonetimiCevabi>();
    assert.equal(ozet.akislar.find((a) => a.anahtar === 'irsaliye')?.son?.ileti, ESKI_YARDIMCI_OKUMA_ILETISI);
    const hatali = await liste();
    assert.equal(hatali.okuma.sonHata?.ileti, ESKI_YARDIMCI_OKUMA_ILETISI);
    kopru.irsaliyeUcuYok = false;
    bellek = yeniSurecBellegi();
    kapilariSifirla();
    await irsaliyeIsi();
    assert.equal((await gunluk()).at(-1)?.sonuc, 'tamam');
    assert.equal((await liste()).okuma.sonHata, null, 'başarılı turdan sonra uyarı kalkar');
  });

  test('günlüğe giden hata tek satır ve kırpılır; köprü adresi ve anahtarı yazılmaz', async () => {
    kopru.senaryo = 'yetkisiz';
    await malKabulIsi();
    const uzun = `Köprü ${kopru.adres} anahtar ${kopru.anahtar}\n${'x'.repeat(400)}`;
    simdi += 20 * DK;
    await assert.rejects(kapiliTur(o().vt, 'logo-mal-kabul-okumasi', () => Promise.reject(new Error(uzun)), yonetimAkisi('mal-kabul'), saat));
    const g = await gunluk();
    assert.equal(g.length, 2);
    assert.deepEqual(g.map((x) => x.sonuc), ['hata', 'hata']);
    const ilk = g[0]!.ileti ?? '';
    assert.ok(!ilk.includes(kopru.anahtar) && !ilk.includes(kopru.adres), ilk);
    const ikinci = g[1]!.ileti ?? '';
    assert.ok(ikinci.length <= 300 && !ikinci.includes('\n'), ikinci);
  });

  test('3736: hatalı yazma turunun günlük satırı kendi belgesinin nedenini taşır; aynı numaralı başka türün nedeni yazılmaz', async () => {
    const neden = 'Logo reddetti: Proje kodu Logo\'da zaten kullanılıyor.';
    const talepNedeni = 'Logo reddetti: Talep fişinde ambar yok.';
    const deneme = (belge: s.BelgeTuru, no: number, hata: string, dk: number) => o().vt.tx((db) => s.denemeYaz(db, belge, no, {
      zaman: new Date(simdi + dk * DK), sonuc: 'reddedildi', hata, logoKayitNo: null, niyetZamani: null, sonrakiDeneme: null, basarili: false,
    }));
    await deneme('proje', 41, neden, 0);
    // Aynı numaralı talep daha yeni denendi: proje turunun günlüğü onu almamalı.
    await deneme('talep', 41, talepNedeni, 1);
    await kapiliTur(o().vt, 'logo-proje-gonderimi', async () => ({ tur: 'proje', no: 41, sonuc: 'reddedildi' }), undefined, saat);
    await kapiliTur(o().vt, 'logo-proje-gonderimi', async () => ({ tur: 'proje', no: 42, sonuc: 'reddedildi' }), undefined, saat);
    await kapiliTur(o().vt, 'logo-satin-alma-gonderimi', async () => ({ tur: 'talep', no: 41, sonuc: 'reddedildi' }), undefined, saat);
    // Sipariş satırı yok: aynı numaralı talebin nedeni siparişe yazılmaz.
    await kapiliTur(o().vt, 'logo-satin-alma-gonderimi', async () => ({ tur: 'gonderim', no: 41, sonuc: 'reddedildi' }), undefined, saat);
    const g = (await gunluk()).filter((x) => x.akis === 'proje' || x.akis === 'satin-alma');
    assert.deepEqual(g.map((x) => [x.akis, x.sonuc, x.ileti]), [
      ['proje', 'hata', `Belge 41: ${neden}`],
      ['proje', 'hata', 'Belge 42: Logo reddetti'],
      ['satin-alma', 'hata', `Belge 41: ${talepNedeni}`],
      ['satin-alma', 'hata', 'Belge 41: Logo reddetti'],
    ]);
  });

  test('sayfa uçları: yalnız sayfa işlemiyle görülür, komut ayarlar.yaz ister; cevapta adres ve anahtar yok', async () => {
    const c = await oku('/logo/yonetim');
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json<EntegrasyonYonetimiCevabi>();
    assert.equal(g.baglanti.acik, true);
    assert.equal(g.baglanti.tanimli, false, 'testte TMIV2_LOGO_KOPRU_* yok');
    const mk = g.akislar.find((a) => a.anahtar === 'mal-kabul');
    assert.deepEqual([mk?.acik, mk?.siklik, mk?.simdiOkunabilir], [true, '15dk', true]);
    assert.ok(g.akislar.some((a) => a.yon === 'yazma') && g.akislar.some((a) => a.yon === 'istek'));
    assert.equal((await oku('/logo/yonetim', depocu)).statusCode, 403);
    assert.equal((await oku('/logo/yonetim/gunluk', depocu)).statusCode, 403);
    assert.equal((await komut('/logo/yonetim/akislar/mal-kabul/simdi-oku', depocu)).statusCode, 403);
    assert.equal((await oku('/logo/yonetim/baglanti-testi', depocu)).statusCode, 403);
    // Sayfayı gören ama ayar yazamayan: görür, komut veremez.
    assert.equal((await oku('/logo/yonetim', izleyici)).statusCode, 200);
    assert.equal((await komut('/logo/yonetim/akislar/mal-kabul/simdi-oku', izleyici)).statusCode, 403);
    assert.equal((await oku('/logo/yonetim/baglanti-testi', izleyici)).statusCode, 403);
    assert.equal((await komut('/logo/yonetim/akislar/mal-kabul/simdi-oku')).statusCode, 409, 'adres tanımlı değil');
    assert.notEqual((await komut('/logo/yonetim/akislar/malzeme/simdi-oku')).statusCode, 200, 'yazma akışı okunmaz');
    const tanimli = await o().vt.tx((db) => yonetimOzeti(db, saat(), istemci()));
    assert.equal(tanimli.baglanti.tanimli, true);
    assert.ok(!JSON.stringify(tanimli).includes(kopru.adres) && !JSON.stringify(tanimli).includes(kopru.anahtar));
  });

  test('günlük sayfalanır ve süzülür: 50 satır, "Daha eski", yalnız hatalar', async () => {
    for (let i = 0; i < 55; i++) {
      await gunlugeYaz(o().vt, { akis: i % 5 === 0 ? 'fatura' : 'mal-kabul', yon: 'okuma', sonuc: i % 5 === 0 ? 'hata' : 'tamam', sayi: null, ileti: null }, saat);
    }
    const ilk = (await oku('/logo/yonetim/gunluk')).json<EntegrasyonGunlukCevabi>();
    assert.equal(ilk.satirlar.length, 50);
    assert.equal(ilk.dahaVar, true);
    const son = ilk.satirlar.at(-1)!;
    const devam = (await oku(`/logo/yonetim/gunluk?once=${son.id}`)).json<EntegrasyonGunlukCevabi>();
    assert.deepEqual([devam.satirlar.length, devam.dahaVar], [5, false]);
    const hatalar = (await oku('/logo/yonetim/gunluk?yalnizHata=evet')).json<EntegrasyonGunlukCevabi>();
    assert.equal(hatalar.satirlar.length, 11);
    assert.ok(hatalar.satirlar.every((x) => x.sonuc === 'hata' && x.akis === 'fatura' && x.akisAdi === 'Faturalar'));
    const fatura = (await oku('/logo/yonetim/gunluk?akis=mal-kabul')).json<EntegrasyonGunlukCevabi>();
    assert.ok(fatura.satirlar.every((x) => x.akis === 'mal-kabul'));
    assert.equal((await oku('/logo/yonetim')).json<EntegrasyonYonetimiCevabi>().bugunHata, 11);
  });

  test('3698: bağlantı testi yardımcı tamam, oturum kapalıyken "hata" döner ve iki adımı ayrı yazar; Logo\'ya yazılmaz', async () => {
    baglantiHatasiniTemizle();
    kopru.oturum = 'kapali';
    const r = await baglantiTesti(o().vt, istemci(), saat);
    assert.equal(r.sonuc, 'hata');
    assert.match(r.ileti, /Yardımcı: .*Logo oturumu: Logo oturumu açık değil.*UserLogin · kod -93/);
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), ['GET /api/version', 'GET /api/session/check'], 'yalnız okuma istekleri');
    assert.equal(kopru.acilan.size + kopru.siparisAcilan.size + kopru.hizmetAcilan.size, 0);
    const g = (await gunluk()).at(-1);
    assert.equal(g?.sonuc, 'hata');
    baglantiHatasiniTemizle();
  });

  test('3698: oturum açıkken test "tamam"; eski yardımcıda (404) "oturum denenemedi" yazılır ve sürüm kontrolü bozulmaz', async () => {
    baglantiHatasiniTemizle();
    const acik = await baglantiTesti(o().vt, istemci(), saat);
    assert.equal(acik.sonuc, 'tamam');
    assert.match(acik.ileti, /Logo oturumu açık \(Logo Objects 9\.9\)/);
    kopru.oturum = 'uc-yok';
    const eski = await baglantiTesti(o().vt, istemci(), saat);
    assert.equal(eski.sonuc, 'tamam');
    assert.match(eski.ileti, /Yardımcı eski, oturum denenemedi/);
  });

  test('3698: son 15 dakikada yazmadan 503 gelmişse hazırlıkta uyarı dolu; başarılı okuma gizlemez, 15 dakika sonra kalkar', async () => {
    baglantiHatasiniTemizle();
    const an = new Date();
    yardimciCevabiniIzle('POST', 503, { neden: 'baglanamadi', adim: 'UserLogin', kod: -93, ileti: '[code=-93] Kullanıcı sayısı limiti aşılmıştır', beklemeSn: 240 }, an);
    assert.equal((await istemci().malKabulOku(0)).tur, 'basarili', 'okuma başarılı');
    const h = await o().vt.okumaTx((db) => hazirlik(db, istemci(), { adres: kopru.adres, anahtarTanimli: true }));
    assert.equal(h.yazilamiyor?.adim, 'UserLogin');
    assert.equal(h.yazilamiyor?.kod, -93);
    assert.equal(yazmaUyarisi(new Date(an.getTime() + 16 * 60_000)), null);
    baglantiHatasiniTemizle();
    assert.equal((await o().vt.okumaTx((db) => hazirlik(db, istemci(), { adres: kopru.adres, anahtarTanimli: true }))).yazilamiyor ?? null, null);
  });

  test('3698: yardımcıya ulaşılamıyorsa oturum denenmez: tek istek gider, ileti "denenmedi" der ve sonuç hata olur', async () => {
    baglantiHatasiniTemizle();
    const yanlisAnahtar = kopruIstemcisiKur({ adres: kopru.adres, anahtar: 'yanlis-anahtar' }, { sureMs: 5000 });
    const r = await baglantiTesti(o().vt, yanlisAnahtar, saat);
    assert.equal(r.sonuc, 'hata');
    assert.match(r.ileti, /Logo oturumu: denenmedi \(yardımcıya ulaşılamadı\)/);
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), ['GET /api/version'], 'oturum ucu çağrılmaz');
  });

  test('3698: yazmadan gelen 503 sonrası oturum açık görülünce hazırlıktaki uyarı silinir', async () => {
    baglantiHatasiniTemizle();
    yardimciCevabiniIzle('POST', 503, { neden: 'baglanamadi', adim: 'UserLogin', kod: -93, ileti: 'x', beklemeSn: 240 }, new Date());
    const once = await o().vt.okumaTx((db) => hazirlik(db, istemci(), { adres: kopru.adres, anahtarTanimli: true }));
    assert.equal(once.yazilamiyor?.kod, -93);
    assert.equal((await baglantiTesti(o().vt, istemci(), saat)).sonuc, 'tamam');
    const sonra = await o().vt.okumaTx((db) => hazirlik(db, istemci(), { adres: kopru.adres, anahtarTanimli: true }));
    assert.equal(sonra.yazilamiyor ?? null, null);
    assert.equal(sonra.baglantiHatasi ?? null, null);
  });
});
