import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { IrsaliyeCevabi, IrsaliyeListesiCevabi } from '#paylasilan/sozlesme/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { irsaliyeTuru } from './irsaliye.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { IRSALIYE_SAYFASI, OKUMA_HATA_BEKLEME_MS } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { yeniSurecBellegi } from './servis.ts';
import type { SurecBellegi, TurOrtami } from './servis.ts';

const PAROLA = 'dogru-parola-1';

// 3345 a: irsaliyeler yalnız okunur. Sahte köprü yardımcının /api/Dispatch uçları gibi davranır; CORE karşılıkları sahibi tablolara doğrudan
// yazılmış sentetik kayıtlardır (ORN- önekli, gerçek veri yok).
describe('Logo irsaliyeleri: okuma işi ve sayfa uçları (gerçek PostgreSQL, sahte köprü)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kopru: SahteKopru;
  let yonetici = '';
  let depocu = '';
  let gormeyen = '';
  let alisci = '';
  let planci = '';
  let yazar = '';
  let onayci = '';
  let yoneticiId = 0;
  let simdi = Date.parse('2026-11-16T10:00:00Z');
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
  const ayar = async (anahtar: string, deger: boolean): Promise<void> => {
    const c = await app.inject({ method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: yonetici, 'istek-kimligi': randomUUID() }, payload: { deger } });
    assert.equal(c.statusCode, 200, `${anahtar}: ${c.body}`);
  };
  const ortami = (): TurOrtami => ({ kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 }), bellek, saat: () => new Date(simdi) });
  const tur = () => irsaliyeTuru(o().vt, ortami());
  const oku = (yol: string, cerez = yonetici) => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
  const sayi = async (tablo: string): Promise<number> => Number((await o().sahip.tek<{ n: string }>(`SELECT count(*) AS n FROM ${tablo}`))?.n);
  const dispatchIstegi = (): number => kopru.istekler.filter((x) => x.yol.startsWith('/api/Dispatch/')).length;
  const imlec = () => o().sahip.tek<{ son_ref: number; degisme: string | null; degisme_ref: number; sira: string; firma: number; donem: number }>(
    'SELECT firma, donem, son_ref, degisme, degisme_ref, sira FROM logo_irsaliye_imleci ORDER BY son_okuma DESC, firma DESC, donem DESC LIMIT 1');

  const irsaliye = (ref: number, trCode: number, ek: Record<string, unknown> = {}, satirlar: Record<string, unknown>[] = []): Record<string, unknown> => ({
    logicalRef: ref, trCode, ficheNo: `ORN-IRS-${ref}`, docNumber: `ORN-E-${ref}`, date: '2026-11-10', cancelled: false, warehouseNr: 0, arpCode: 'ORN-C-1',
    arpName: 'ORN Tedarikçi', invoiceNo: null, eDespatch: true, modifiedAt: `2026-11-10T09:00:${String(ref % 60).padStart(2, '0')}.000`, lines: satirlar, ...ek,
  });
  const satir = (ref: number, ek: Record<string, unknown> = {}): Record<string, unknown> => ({
    logicalRef: ref, itemCode: 'ORN-M-1', itemName: 'ORN Malzeme', quantity: 30, unitCode: 'ADET', price: 12.5, currency: 0, currencyPrice: null,
    orderRef: 500, orderLineRef: 9001, orderNo: 'ORN-LS-1', ...ek,
  });

  // Liste uçu gerçek saatle süzer (son N gün); okunmuş başlıkların tarihi bugüne göre konur ki test takvimden bağımsız kalsın.
  const tarihGeriAl = (ref: number, gun: number) => o().sahip.sorgu('UPDATE logo_irsaliye SET tarih = current_date - $2::int WHERE logical_ref = $1', [ref, gun]);
  const tarihleriYakinaAl = () => o().sahip.sorgu('UPDATE logo_irsaliye SET tarih = current_date - 6');

  const kisiRolle = async (ad: string, rolKod: string): Promise<void> => {
    const id = await o().vt.tx((db) => yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA }));
    await o().vt.sorgu('UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = $2) WHERE kisi_id = $1', [id, rolKod]);
  };

  // CORE karşılıkları: Logo sipariş satırı 9001'e bağlı satır 30 adet teslim aldı (20 + 10), 9002'ye bağlı satır 28 adet; bir sevk işi ve bir iade mal kabulü.
  const coreKayitlari = async (): Promise<void> => {
    const s = o().sahip;
    const [talep, teklif, k1, k2] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const firma = (await s.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('ORN Tedarik', 'tedarikci', $1) RETURNING id", [yoneticiId]))!.id;
    await s.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1)', [firma]);
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2026, 1, 'ORN talep', $2, $2, 'siparis_verildi')", [talep, yoneticiId]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, miktar) VALUES ($1, $2, 1, 'ORN kalem 1', 30), ($1, $3, 2, 'ORN kalem 2', 30)", [talep, k1, k2]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, firma_id, teklif_tarihi, para_birimi) VALUES ($1, $2, $3, '2026-11-01', 'TRY')", [talep, teklif, firma]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, '2026-11-01')", [talep, teklif]);
    await s.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, siparis_no) VALUES ($1, $2, 'SP-2026-901', 'ORN-LS-1')", [talep, teklif]);
    const satirId = async (kalem: string, ref: string) => (await s.tek<{ id: number }>(
      "INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim, logo_satir_ref) VALUES ($1, $2, $3, 30, 'adet', $4) RETURNING id", [talep, teklif, kalem, ref]))!.id;
    const s1 = await satirId(k1, '9001');
    const s2 = await satirId(k2, '9002');
    await s.sorgu('INSERT INTO satin_alma_teslim (siparis_satiri_id, mal_kabul_satiri_id, miktar, kisi_id) VALUES ($1, 1, 20, $3), ($1, 2, 10, $3), ($2, 3, 28, $3)',
      [s1, s2, yoneticiId]);
    const nokta = (await s.tek<{ id: number }>("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam) VALUES ('ORN Müşteri Noktası', 'musteri', 39.95, 32.75) RETURNING id"))!.id;
    await s.sorgu(
      `INSERT INTO sevkiyat_isi (tarih, istenen_tarih, tur, birakis_noktasi_id, agirlik_kilogram, palet_sayisi, belge_no) VALUES ('2026-11-10', '2026-11-10', 'teslimat', $1, 10, 1, 'ORN-E-301')`,
      [nokta],
    );
    await s.sorgu("INSERT INTO stok_mal_kabul (no, tur, irsaliye_no, kisi_id) VALUES ('ORN-MK-1', 'iade', 'ORN-E-401', $1), ('ORN-MK-2', 'satin_alma', 'ORN-E-402', $1)", [yoneticiId]);
  };

  before(async () => {
    ortam = await testVeritabaniKur('logoirsaliye');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'li-yonetici', parola: PAROLA }));
    await kisiRolle('li-depocu', 'depo');
    await o().vt.sorgu("INSERT INTO rol (kod, ad) VALUES ('li_gormeyen', 'Görmeyen')");
    await kisiRolle('li-gormeyen', 'li_gormeyen');
    // Alış fiyatını (satin-alma.fiyat-oku) görür, satış fiyatını (siparisler.fiyat-oku) görmez.
    await o().vt.sorgu("INSERT INTO rol (kod, ad) VALUES ('li_alisci', 'Alışçı')");
    await o().vt.sorgu(
      "INSERT INTO rol_islemi (rol_id, islem) SELECT id, unnest(ARRAY['sayfa.logo-irsaliyeleri', 'logo.irsaliye-oku', 'satin-alma.fiyat-oku']) FROM rol WHERE kod = 'li_alisci'");
    await kisiRolle('li-alisci', 'li_alisci');
    // 3401-1 a: yalnız satın almayı okuyan (planlama) alış fiyatını da görmez; yazan ve onaylayan görür.
    for (const [rol, islem] of [['li_planci', 'satin-alma.oku'], ['li_yazar', 'satin-alma.yaz'], ['li_onayci', 'satin-alma.onayla']] as const) {
      await o().vt.sorgu("INSERT INTO rol (kod, ad) VALUES ($1, $1)", [rol]);
      await o().vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT rol.id, i FROM rol, unnest($2::text[]) i WHERE kod = $1", [rol, ['sayfa.logo-irsaliyeleri', 'logo.irsaliye-oku', islem]]);
      await kisiRolle(`li-${rol.slice(3)}`, rol);
    }
    yonetici = await giris('li-yonetici');
    depocu = await giris('li-depocu');
    gormeyen = await giris('li-gormeyen');
    alisci = await giris('li-alisci');
    planci = await giris('li-planci');
    yazar = await giris('li-yazar');
    onayci = await giris('li-onayci');
    await coreKayitlari();
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    bellek = yeniSurecBellegi();
    simdi = Date.parse('2026-11-16T10:00:00Z');
    await o().sahip.sorgu('DELETE FROM logo_irsaliye_imleci');
    await o().sahip.sorgu('DELETE FROM logo_irsaliye');
    await ayar('logo.baglanti', true);
    await ayar('logo.irsaliye-okumasi', true);
  });
  afterEach(async () => { await kopru.kapat(); });

  test('ayar kapalıyken köprüye hiç istek gitmez, hiçbir şey yazılmaz', async () => {
    await ayar('logo.irsaliye-okumasi', false);
    kopru.irsaliyeler = [irsaliye(1, 1)];
    assert.deepEqual(await tur(), { tur: 'irsaliye-kapali' });
    await ayar('logo.irsaliye-okumasi', true);
    await ayar('logo.baglanti', false);
    assert.deepEqual(await tur(), { tur: 'kapali' });
    assert.equal(kopru.istekler.length, 0);
    assert.equal(await sayi('logo_irsaliye'), 0);
    assert.equal(await sayi('logo_irsaliye_imleci'), 0);
  });

  test('yeniler sayfa sayfa okunur, imleç dönem başına ilerler; sonra değişenler değişme zamanıyla, sonra silinenler; yalnız GET, CORE kaydı değişmez', async () => {
    const once = { hareket: await sayi('stok_hareketi'), teslim: await sayi('satin_alma_teslim'), sevk: await sayi('sevkiyat_isi'), malKabul: await sayi('stok_mal_kabul') };
    kopru.irsaliyeDonemi = { firm: 7, period: 3 };
    kopru.irsaliyeler = Array.from({ length: IRSALIYE_SAYFASI + 2 }, (_, i) => irsaliye(i + 1, 1, {}, [satir(10_000 + i)]));
    kopru.irsaliyeler.push(irsaliye(500, 6, { date: '2026-01-01' }));

    assert.deepEqual(await tur(), { tur: 'okuma', akis: 'irsaliye', sonuc: 'okundu', sayi: IRSALIYE_SAYFASI });
    assert.deepEqual(await imlec(), { firma: 7, donem: 3, son_ref: IRSALIYE_SAYFASI, degisme: '2026-11-10T09:00:59.000', degisme_ref: 59, sira: 'yeni' });
    assert.match(kopru.irsaliyeIstekleri[0] ?? '', /^\/api\/Dispatch\/list\?since=0&from=2026-08-18$/, 'ilk okuma 90 günle sınırlı');
    assert.deepEqual(await tur(), { tur: 'okuma', akis: 'irsaliye', sonuc: 'okundu', sayi: 2 });
    assert.equal((await imlec())?.sira, 'degisen');
    assert.equal(await sayi('logo_irsaliye'), IRSALIYE_SAYFASI + 2, '90 günden eski başlık okunmaz');
    assert.equal(await sayi('logo_irsaliye_satiri'), IRSALIYE_SAYFASI + 2);

    // Logo'da 5 numara iptal edildi, faturalandı ve satırı değişti; 7 numara silindi.
    const bes = kopru.irsaliyeler.find((x) => x['logicalRef'] === 5)!;
    Object.assign(bes, { cancelled: true, invoiceNo: 'ORN-F-1', modifiedAt: '2026-11-16T09:59:00.000', lines: [satir(20_000, { quantity: 7 })] });
    kopru.irsaliyeler = kopru.irsaliyeler.filter((x) => x['logicalRef'] !== 7);
    const r = await tur();
    assert.deepEqual(r, { tur: 'okuma', akis: 'irsaliye', sonuc: 'okundu', sayi: 1 });
    assert.match(kopru.irsaliyeIstekleri.at(-1) ?? '', /since=59&from=2026-08-18&changedAfter=2026-11-10T09%3A00%3A59\.000$/);
    const b5 = await o().sahip.tek<{ iptal: boolean; fatura_no: string; n: number }>(
      "SELECT iptal, fatura_no, (SELECT count(*) FROM logo_irsaliye_satiri s WHERE s.irsaliye_ref = 5 AND s.miktar = 7) AS n FROM logo_irsaliye WHERE logical_ref = 5");
    assert.deepEqual(b5, { iptal: true, fatura_no: 'ORN-F-1', n: 1 });
    assert.equal(await sayi('logo_irsaliye_satiri'), IRSALIYE_SAYFASI + 2, 'eski satır kalkar, yenisi gelir');
    assert.equal((await imlec())?.sira, 'refler');

    assert.deepEqual(await tur(), { tur: 'okuma', akis: 'irsaliye', sonuc: 'okundu', sayi: 1 });
    assert.match(kopru.irsaliyeIstekleri.at(-1) ?? '', /^\/api\/Dispatch\/refs\?from=2026-08-18$/);
    assert.equal((await o().sahip.tek<{ yok: boolean }>('SELECT logoda_yok IS NOT NULL AS yok FROM logo_irsaliye WHERE logical_ref = 7'))?.yok, true);
    assert.equal((await imlec())?.sira, 'yeni');
    // Silinme denetimi saatte bir: değişenler bitince yeniden sorulmaz.
    await tur();
    await tur();
    assert.equal(kopru.irsaliyeIstekleri.filter((x) => x.startsWith('/api/Dispatch/refs')).length, 1);

    assert.ok(kopru.istekler.every((x) => x.yontem === 'GET'), 'yalnız okuma');
    assert.deepEqual(
      { hareket: await sayi('stok_hareketi'), teslim: await sayi('satin_alma_teslim'), sevk: await sayi('sevkiyat_isi'), malKabul: await sayi('stok_mal_kabul') }, once,
      'stok, satın alma, sevkiyat kaydı değişmez',
    );
  });

  test('okunamayan cevapta imleç ilerlemez, ayna yazılmaz; hata beklemesi her hatada artar', async () => {
    kopru.irsaliyeler = [irsaliye(1, 1)];
    kopru.senaryo = 'yetkisiz';
    assert.equal((await tur()).tur, 'okuma');
    assert.equal(await imlec(), null);
    assert.equal(dispatchIstegi(), 1);
    simdi += OKUMA_HATA_BEKLEME_MS - 1;
    assert.deepEqual(await tur(), { tur: 'bos' }, 'ilk bekleme dolmadan istek yok');
    simdi += 1;
    await tur();
    assert.equal(dispatchIstegi(), 2);
    simdi += OKUMA_HATA_BEKLEME_MS;
    assert.deepEqual(await tur(), { tur: 'bos' }, 'ikinci hatadan sonra bekleme iki katı');
    simdi += OKUMA_HATA_BEKLEME_MS;
    kopru.senaryo = 'basari';
    assert.equal((await tur()).tur, 'okuma');
    assert.equal(dispatchIstegi(), 3);
    assert.equal(await sayi('logo_irsaliye'), 1);
    assert.equal(bellek.irsaliyeHatasi, null, 'başarı beklemeyi sıfırlar');
  });

  test('yardımcı başka döneme geçince o dönemin imleci sıfırdan açılır; eski dönemin kaydı ayrı anahtarla kalır', async () => {
    kopru.irsaliyeler = [irsaliye(1, 1)];
    await tur();
    kopru.irsaliyeDonemi = { firm: 1, period: 2 };
    assert.deepEqual(await tur(), { tur: 'okuma', akis: 'irsaliye', sonuc: 'okundu', sayi: 0 }, 'yeni dönemin ilk cevabı yazılmaz');
    assert.deepEqual(await imlec(), { firma: 1, donem: 2, son_ref: 0, degisme: null, degisme_ref: 0, sira: 'yeni' });
    await tur();
    assert.match(kopru.irsaliyeIstekleri.at(-1) ?? '', /since=0&/);
    assert.deepEqual((await o().sahip.sorgu<{ donem: number }>('SELECT donem FROM logo_irsaliye ORDER BY donem')).map((x) => x.donem), [1, 2]);
  });

  test('liste ve tek irsaliye: eşleşme rozetleri, konsinye gizli, fiyat yalnız yetkiliye; yetkisize 403', async () => {
    kopru.irsaliyeler = [
      irsaliye(101, 1, {}, [satir(1001), satir(1002, { orderLineRef: 9002 }), satir(1003, { orderLineRef: null, orderRef: null })]),
      irsaliye(102, 1, {}, [satir(1004)]),
      irsaliye(201, 5, {}, [satir(1005)]),
      irsaliye(301, 8, { arpName: 'ORN Müşteri' }, [satir(1006, { orderLineRef: null })]),
      irsaliye(302, 8),
      irsaliye(401, 3),
      irsaliye(402, 3),
    ];
    await tur();
    // 9001: Logo net 30 + 30 = 60, CORE teslim 30 → fark; aynı satır bir irsaliyeden çıkınca eşleşir.
    kopru.irsaliyeler = kopru.irsaliyeler.filter((x) => x['logicalRef'] !== 102);
    await o().sahip.sorgu('DELETE FROM logo_irsaliye WHERE logical_ref = 102');
    await tarihleriYakinaAl();

    const c = await oku('/logo/irsaliyeler?yon=alis&gun=30');
    assert.equal(c.statusCode, 200, c.body);
    const l = c.json<IrsaliyeListesiCevabi>();
    assert.deepEqual(l.satirlar.map((x) => [x.kayitNo, x.tur, x.durum]), [[101, 1, 'eslesmedi']]);
    assert.equal(l.satirlar[0]?.ozet, 'Sipariş SP-2026-901 · 1 satırda fark · 1 satır eşleşmedi');
    assert.deepEqual(l.turler, [{ tur: 1, ad: 'Satın alma', sayi: 1 }, { tur: 6, ad: 'Satın alma iade', sayi: 0 }], 'konsinye giriş (5) görünmez');
    assert.equal(l.okuma.acik, true);
    assert.ok(l.okuma.sonOkuma !== null);

    const satis = (await oku('/logo/irsaliyeler?yon=satis')).json<IrsaliyeListesiCevabi>();
    assert.deepEqual(satis.satirlar.map((x) => [x.kayitNo, x.durum]), [[402, 'eslesmedi'], [401, 'eslesti'], [302, 'eslesmedi'], [301, 'eslesti']]);
    assert.deepEqual(satis.satirlar.map((x) => x.ozet).slice(0, 3), ['CORE\'da iade mal kabulü yok', 'İade mal kabulü ORN-MK-1', 'CORE\'da sevk yok'], 'satın alma mal kabulü satış iadesi sayılmaz');
    assert.match(satis.satirlar[3]?.ozet ?? '', /^Sevk #\d+ · 2026-11-10$/);
    assert.equal((await oku('/logo/irsaliyeler?yon=satis&durum=eslesti')).json<IrsaliyeListesiCevabi>().toplam, 2);
    assert.equal((await oku('/logo/irsaliyeler?yon=satis&ara=musteri')).json<IrsaliyeListesiCevabi>().toplam, 1, 'Türkçe harf duyarsız arama');

    const d = await oku('/logo/irsaliyeler/1/1/101');
    assert.equal(d.statusCode, 200, d.body);
    const ic = d.json<IrsaliyeCevabi>();
    assert.equal(ic.fiyatGorunur, true);
    assert.deepEqual(ic.satirlar.map((x) => [x.kayitNo, x.durum, x.neden, x.fiyat, x.tutar]), [
      [1001, 'eslesti', null, '12.5', '375.0'],
      [1002, 'fark', 'Logo net 30, CORE teslim 28', '12.5', '375.0'],
      [1003, 'eslesmedi', 'Siparişsiz satır', '12.5', '375.0'],
    ]);
    assert.deepEqual(ic.satirlar[0]?.core, { tur: 'siparis', id: ic.satirlar[0]?.core?.id, no: 'SP-2026-901' });

    const dc = await oku('/logo/irsaliyeler/1/1/101', depocu);
    assert.equal(dc.statusCode, 200, `depo rolü göçle görür: ${dc.body}`);
    const dic = dc.json<IrsaliyeCevabi>();
    assert.equal(dic.fiyatGorunur, false);
    assert.ok(dic.satirlar.length === 3 && dic.satirlar.every((x) => x.fiyat === null && x.tutar === null && x.dovizFiyati === null && x.dovizTuru === null));
    assert.ok(!dc.body.includes('12.5'), 'fiyat cevapta hiç yok');
    assert.equal((await oku('/logo/irsaliyeler?yon=alis', depocu)).statusCode, 200);

    assert.equal((await oku('/logo/irsaliyeler/1/1/201')).statusCode, 404, 'ölçülmemiş konsinye kaydı açılmaz');
    assert.equal((await oku('/logo/irsaliyeler/1/1/999')).statusCode, 404);
    assert.equal((await oku('/logo/irsaliyeler?yon=alis', gormeyen)).statusCode, 403);
    assert.equal((await oku('/logo/irsaliyeler/1/1/101', gormeyen)).statusCode, 403);
  });

  test('okuma kapalıyken liste boş ve "kapalı" bildirir; kur ve fiyat boşsa null kalır', async () => {
    kopru.irsaliyeler = [irsaliye(1, 1, {}, [satir(1, { price: null, currencyPrice: null, currency: null })])];
    await tur();
    await tarihleriYakinaAl();
    await ayar('logo.irsaliye-okumasi', false);
    const l = (await oku('/logo/irsaliyeler?yon=alis&gun=90')).json<IrsaliyeListesiCevabi>();
    assert.equal(l.okuma.acik, false);
    assert.equal(l.toplam, 1, 'okunmuş kayıt görünmeye devam eder');
    const ic = (await oku('/logo/irsaliyeler/1/1/1')).json<IrsaliyeCevabi>();
    assert.deepEqual([ic.satirlar[0]?.fiyat, ic.satirlar[0]?.tutar, ic.satirlar[0]?.dovizFiyati, ic.satirlar[0]?.dovizTuru], [null, null, null, null]);
    assert.equal(ic.baslik.ambar, 'Ambar 0', 'adı aynada olmayan ambar numarasıyla etiketli');
    assert.equal(Date.parse(ic.baslik.okumaZamani), simdi, 'zaman bölge bilgili ISO metni');
    assert.match(ic.baslik.okumaZamani, /(Z|[+-]\d{2}:\d{2})$/);
  });
  test('fiyat yetkisi yöne göre: alışta satin-alma.fiyat-oku/yaz/onayla, satışta siparisler.fiyat-oku; döviz fiyatı ve tutar da maskelenir', async () => {
    const doviz = { currency: 1, currencyPrice: 0.4 };
    kopru.irsaliyeler = [irsaliye(601, 1, {}, [satir(6001, doviz)]), irsaliye(602, 8, {}, [satir(6002, { ...doviz, orderLineRef: null })])];
    await tur();
    const alis = (await oku('/logo/irsaliyeler/1/1/601', alisci)).json<IrsaliyeCevabi>();
    assert.equal(alis.fiyatGorunur, true);
    assert.deepEqual([alis.satirlar[0]?.fiyat, alis.satirlar[0]?.tutar, alis.satirlar[0]?.dovizTuru, alis.satirlar[0]?.dovizFiyati], ['12.5', '375.0', 1, '0.4']);
    const satisCevabi = await oku('/logo/irsaliyeler/1/1/602', alisci);
    assert.equal(satisCevabi.statusCode, 200, satisCevabi.body);
    const satis = satisCevabi.json<IrsaliyeCevabi>();
    assert.equal(satis.fiyatGorunur, false, 'satın alma okuyan satış fiyatını görmez');
    assert.deepEqual([satis.satirlar[0]?.fiyat, satis.satirlar[0]?.tutar, satis.satirlar[0]?.dovizTuru, satis.satirlar[0]?.dovizFiyati], [null, null, null, null]);
    assert.ok(!satisCevabi.body.includes('12.5') && !satisCevabi.body.includes('0.4'), 'fiyat cevapta hiç yok');
    const planAlis = await oku('/logo/irsaliyeler/1/1/601', planci);
    assert.equal(planAlis.statusCode, 200, planAlis.body);
    const plan = planAlis.json<IrsaliyeCevabi>();
    assert.equal(plan.fiyatGorunur, false, 'yalnız satin-alma.oku (planlama) alış fiyatını görmez');
    assert.deepEqual([plan.satirlar[0]?.fiyat, plan.satirlar[0]?.tutar, plan.satirlar[0]?.dovizTuru, plan.satirlar[0]?.dovizFiyati], [null, null, null, null]);
    assert.ok(!planAlis.body.includes('12.5') && !planAlis.body.includes('375'), 'planlama cevabında fiyat yok');
    for (const cerez of [yazar, onayci]) {
      const k = (await oku('/logo/irsaliyeler/1/1/601', cerez)).json<IrsaliyeCevabi>();
      assert.deepEqual([k.fiyatGorunur, k.satirlar[0]?.fiyat], [true, '12.5']);
    }
    const yoneticiSatis = (await oku('/logo/irsaliyeler/1/1/602')).json<IrsaliyeCevabi>();
    assert.deepEqual([yoneticiSatis.fiyatGorunur, yoneticiSatis.satirlar[0]?.dovizFiyati], [true, '0.4']);
  });

  test('Logo net miktarı: iade düşer; iptal ve Logo\'da olmayan irsaliye nete girmez', async () => {
    // CORE: 9002'ye bağlı satır 28 teslim aldı. Logo: 30 giriş - 2 iade = 28 → eşleşir; iptal 50 ve silinmiş 40 sayılmaz.
    kopru.irsaliyeler = [
      irsaliye(701, 1, {}, [satir(7001, { orderLineRef: 9002 })]),
      irsaliye(702, 6, {}, [satir(7002, { orderLineRef: 9002, quantity: 2 })]),
      irsaliye(703, 1, { cancelled: true }, [satir(7003, { orderLineRef: 9002, quantity: 50 })]),
      irsaliye(704, 1, {}, [satir(7004, { orderLineRef: 9002, quantity: 40 })]),
    ];
    await tur();
    await o().sahip.sorgu('UPDATE logo_irsaliye SET logoda_yok = now() WHERE logical_ref = 704');
    const ic = (await oku('/logo/irsaliyeler/1/1/701')).json<IrsaliyeCevabi>();
    assert.deepEqual([ic.satirlar[0]?.durum, ic.satirlar[0]?.neden], ['eslesti', null]);
    // Silinmiş irsaliye Logo'da yeniden görünürse nete yine girer: 28 + 40 = 68 → fark.
    await o().sahip.sorgu('UPDATE logo_irsaliye SET logoda_yok = NULL WHERE logical_ref = 704');
    const ic2 = (await oku('/logo/irsaliyeler/1/1/701')).json<IrsaliyeCevabi>();
    assert.deepEqual([ic2.satirlar[0]?.durum, ic2.satirlar[0]?.neden], ['fark', 'Logo net 68, CORE teslim 28']);
  });

  test('Logo\'da yok işareti, başlık refler listesinde ya da değişenlerde yeniden görünürse kalkar', async () => {
    kopru.irsaliyeler = [irsaliye(1, 1), irsaliye(2, 1)];
    await tur();
    await tur();
    const gizli = kopru.irsaliyeler;
    kopru.irsaliyeler = [irsaliye(1, 1)];
    await tur();
    const yok = async (ref: number) => (await o().sahip.tek<{ yok: boolean }>('SELECT logoda_yok IS NOT NULL AS yok FROM logo_irsaliye WHERE logical_ref = $1', [ref]))?.yok;
    assert.equal(await yok(2), true);
    kopru.irsaliyeler = gizli;
    simdi += 3_600_001;
    const refSayisi = () => kopru.irsaliyeIstekleri.filter((x) => x.startsWith('/api/Dispatch/refs')).length;
    const once = refSayisi();
    for (let i = 0; i < 4 && refSayisi() === once; i += 1) await tur();
    assert.equal(refSayisi(), once + 1, 'saat dolunca refler yeniden soruldu');
    assert.equal(await yok(2), false, 'refler listesinde yeniden görünen işaretten çıkar');
    await o().sahip.sorgu('UPDATE logo_irsaliye SET logoda_yok = now() WHERE logical_ref = 2');
    Object.assign(kopru.irsaliyeler[1]!, { modifiedAt: '2026-11-16T09:59:59.000' });
    await tur();
    await tur();
    assert.equal(await yok(2), false, 'değişenlerde yeniden okunan başlık da işaretten çıkar');
  });

  test('tür ve gün süzgeçleri listeyi daraltır; türler sayısı süzgeçten bağımsız', async () => {
    kopru.irsaliyeler = [irsaliye(801, 1), irsaliye(802, 6), irsaliye(803, 1)];
    await tur();
    await tarihGeriAl(801, 2);
    await tarihGeriAl(802, 3);
    await tarihGeriAl(803, 20);
    const l = async (q: string) => (await oku(`/logo/irsaliyeler?yon=alis&${q}`)).json<IrsaliyeListesiCevabi>();
    assert.deepEqual((await l('gun=30')).satirlar.map((x) => x.kayitNo), [801, 802, 803]);
    assert.deepEqual((await l('gun=7')).satirlar.map((x) => x.kayitNo), [801, 802], '20 gün önceki 7 günlük pencereye girmez');
    const t6 = await l('gun=30&tur=6');
    assert.deepEqual(t6.satirlar.map((x) => x.kayitNo), [802]);
    assert.equal(t6.toplam, 1);
    assert.deepEqual(t6.turler, [{ tur: 1, ad: 'Satın alma', sayi: 2 }, { tur: 6, ad: 'Satın alma iade', sayi: 1 }]);
    assert.equal((await l('gun=30&tur=8')).toplam, 0, 'yöne uymayan tür boş döner');
    assert.equal((await oku('/logo/irsaliyeler?yon=alis&gun=15')).statusCode, 400);
  });
});
