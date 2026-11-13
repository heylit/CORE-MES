import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { LogoKartBolumuCevabi } from '#paylasilan/sozlesme/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kartAlislari, kartHareketleri } from './kart-bolumu.ts';
import type { KopruIstemcisi, OkumaSonucu } from './kopru.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { geriHareketSayfasiniAyikla, hareketFisAdi, hareketYonu, kartStokKarsilastir } from './kurallar.ts';
import type { LogoAlisFiyati, LogoMalzemeHareketi, Sayfa } from './kurallar.ts';

// 3201 a: malzeme kartının "Logo'da" bölümü. Kodlar, ambarlar ve cariler uydurmadır (ORN-).
const PAROLA = 'dogru-parola-1';

describe('3201 stok karşılaştırması (saf)', () => {
  const depo = (no: number, miktar: string | null, kod = `D${no}`) => ({ depoKod: kod, depoAd: `Depo ${kod}`, logoAmbarNo: no, miktar });
  test('fark yalnız eşli ambarlardan; eşlenmemiş ambar ayrı toplam; eksi ve ondalık tam hesaplanır', () => {
    const r = kartStokKarsilastir(
      [{ ambarNo: 0, miktar: '412.5' }, { ambarNo: 1, miktar: '86' }, { ambarNo: 3, miktar: '30' }, { ambarNo: 4, miktar: '-1.25' }],
      [depo(0, '405'), depo(1, '86.000'), depo(2, '7.5')],
      new Map([[0, 'ORN merkez'], [3, null]]),
    );
    assert.deepEqual(r.ambarlar.map((a) => [a.ambarNo, a.ambarAdi, a.logo, a.depo?.kod ?? null, a.core, a.fark]), [
      [0, 'ORN merkez', '412.5', 'D0', '405', '7.5'],
      [1, null, '86', 'D1', '86', '0'],
      [2, null, null, 'D2', '7.5', '-7.5'],
      [3, null, '30', null, null, null],
      [4, null, '-1.25', null, null, null],
    ]);
    assert.deepEqual(r.eslenen, { logo: '498.5', core: '498.5', fark: '0' });
    assert.equal(r.eslenmemis, '28.75');
  });
  test('eşli ambar yoksa eşlenen toplamı null; aynı ambara iki depo toplanır; okunamayan miktar farkı boş bırakır', () => {
    assert.deepEqual(kartStokKarsilastir([{ ambarNo: 0, miktar: '5' }], [], new Map()).eslenen, null);
    const iki = kartStokKarsilastir([{ ambarNo: 0, miktar: '5' }], [depo(0, '2', 'A'), depo(0, '1', 'B'), depo(0, null, 'C')], new Map());
    assert.deepEqual([iki.ambarlar[0]?.depo?.kod, iki.ambarlar[0]?.core, iki.ambarlar[0]?.fark], ['A', '3', '2']);
    const bozuk = kartStokKarsilastir([{ ambarNo: 0, miktar: '1e5' }], [depo(0, '2')], new Map());
    assert.deepEqual([bozuk.ambarlar[0]?.fark, bozuk.eslenen], [null, null]);
    assert.equal(kartStokKarsilastir([], [], new Map()).eslenmemis, null);
  });
  test('hareket yönü ve fiş adı: bilinmeyen kod uydurulmaz', () => {
    assert.deepEqual([1, 2, 3, 4, 9].map(hareketYonu), ['giris', 'giris', 'cikis', 'cikis', null]);
    assert.deepEqual([1, 12, 13, 25].map(hareketFisAdi), ['Satın alma irsaliyesi', 'Sarf fişi', 'Üretimden giriş fişi', 'Fiş türü 25']);
  });
  test('köprü: geriye okuma yolu; zarfta order yoksa eski yardımcı sayılır', async () => {
    const yollar: string[] = [];
    let govde: unknown = { data: [], next: null, order: 'desc' };
    const fetchSahte = (async (adres: string | URL | Request) => {
      yollar.push(String(adres).replace('http://127.0.0.1:1', ''));
      return new Response(JSON.stringify(govde), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const k = kopruIstemcisiKur({ adres: 'http://127.0.0.1:1', anahtar: 'deneme-anahtar' }, { fetch: fetchSahte });
    assert.deepEqual(await k.malzemeHareketleriGeriyeOku('ORN 1', null), { tur: 'basarili', veri: { sayfa: { kayitlar: [], sonraki: null }, geriye: true } });
    govde = { data: [], next: 7 };
    assert.deepEqual(await k.malzemeHareketleriGeriyeOku('ORN-1', 40), { tur: 'basarili', veri: { sayfa: { kayitlar: [], sonraki: 7 }, geriye: false } });
    assert.deepEqual(yollar, ['/api/Material/ORN%201/movements?order=desc', '/api/Material/ORN-1/movements?order=desc&before=40']);
    assert.equal(geriHareketSayfasiniAyikla([]), null);
  });
});

// Sahte köprü: yalnız bu bölümün okuduğu iki yol; hareketler kayıt numarasıyla.
function sahteKopru(o: { hareketler: number; geriye: boolean; alislar?: LogoAlisFiyati[] }) {
  const istekler: string[] = [];
  const hareket = (n: number): LogoMalzemeHareketi => ({
    logoKayitNo: n, tarih: '2026-10-01', fisTuru: n % 2 === 0 ? 1 : 12, girisCikis: n % 2 === 0 ? 1 : 4, fisNo: `ORN-F-${n}`, miktar: '2.5', ambarNo: 0, birim: 'KG',
  });
  const hepsi = Array.from({ length: o.hareketler }, (_, i) => hareket(i + 1));
  const basarili = <T>(veri: T): Promise<OkumaSonucu<T>> => Promise.resolve({ tur: 'basarili', veri });
  const k: Pick<KopruIstemcisi, 'malzemeHareketleriOku' | 'malzemeHareketleriGeriyeOku' | 'sonAlisFiyatlariOku'> = {
    malzemeHareketleriOku: (kod, since) => {
      istekler.push(`artan ${kod} ${since}`);
      const l = hepsi.filter((h) => h.logoKayitNo > since).slice(0, 500);
      return basarili<Sayfa<LogoMalzemeHareketi> | null>({ kayitlar: l, sonraki: l.length === 500 ? l.at(-1)!.logoKayitNo : null });
    },
    malzemeHareketleriGeriyeOku: (kod, once) => {
      istekler.push(`geri ${kod} ${once}`);
      if (!o.geriye) {
        const l = hepsi.slice(0, 500);
        return basarili({ sayfa: { kayitlar: l, sonraki: l.length === 500 ? l.at(-1)!.logoKayitNo : null }, geriye: false });
      }
      const l = hepsi.filter((h) => once === null || h.logoKayitNo < once).reverse().slice(0, 20);
      return basarili({ sayfa: { kayitlar: l, sonraki: l.length === 20 ? l.at(-1)!.logoKayitNo : null }, geriye: true });
    },
    sonAlisFiyatlariOku: (kod) => { istekler.push(`alis ${kod}`); return basarili<LogoAlisFiyati[] | null>(o.alislar ?? []); },
  };
  return { kopru: k as KopruIstemcisi, istekler };
}

describe('3201 malzeme kartının Logo bölümü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let okuyucu = '';
  let stokcu = '';
  const KOD = 'KL-00001';

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const al = (yol: string, c = cerez) => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: c } });
  const ayar = async (anahtar: string, deger: boolean) => {
    const c = await app.inject({ method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: cerez }, payload: { deger } });
    assert.equal(c.statusCode, 200, c.body);
  };

  before(async () => {
    ortam = await testVeritabaniKur('logokart');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Logo kart', kullaniciAdi: 'lk-yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lk-yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    const { sahip } = ortam;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KL-', 0) ON CONFLICT DO NOTHING");
    const no = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('lk-1', 'hammadde', 'KL-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'lk-1', com: { ad: 'ORN deneme' } }), kisi]))!.no;
    const depo = async (kod: string, ambar: number) => (await sahip.tek<{ id: number }>(
      'INSERT INTO stok_depo (kod, ad, logo_ambar_no) VALUES ($1, $2, $3) RETURNING id', [kod, `ORN ${kod}`, ambar]))!.id;
    const konum = async (d: number, kod: string) => (await sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, $2, 'depo_zemini', 'ORN zemin') RETURNING id", [d, kod]))!.id;
    const merkez = await depo('LKM', 0);
    await depo('LKU', 1);
    await sahip.sorgu("INSERT INTO stok_bakiye (malzeme_id, konum_id, miktar, ilk_giris) VALUES ($1, $2, '400', now()), ($1, $3, '5', now())",
      [no, await konum(merkez, 'LK-Z1'), await konum(merkez, 'LK-Z2')]);
    const zaman = new Date('2026-11-13T09:00:00Z');
    await sahip.sorgu("INSERT INTO logo_stok_toplami (malzeme_kodu, ambar_no, miktar, son_okuma) VALUES ($1, 0, 412.5, $2), ($1, 1, 0, $2), ($1, 3, 30, $2)", [KOD, zaman]);
    await sahip.sorgu("INSERT INTO logo_okuma_imleci (akis, son_ref, tur_basi, son_tamam, sayi) VALUES ('stok', 0, $1, $1, 3)", [zaman]);
    await sahip.sorgu("INSERT INTO logo_ambar (kod, ad, son_okuma) VALUES ('0', 'ORN merkez', now()), ('3', 'ORN fason', now())");
    await sahip.sorgu("INSERT INTO logo_cari (kod, ad, son_okuma) VALUES ('ORN-T1', 'ORN Tedarikçi', now())");
    const opId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Okuyucu', kullaniciAdi: 'lk-okuyucu', parola: PAROLA }));
    await ortam.vt.sorgu("INSERT INTO rol (kod, ad) VALUES ('lkokuyucu', 'Okuyucu')");
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.malzemeler' FROM rol WHERE kod = 'lkokuyucu'");
    await ortam.vt.sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'lkokuyucu') WHERE kisi_id = $1", [opId]);
    const og = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lk-okuyucu', parola: PAROLA } });
    okuyucu = String(og.headers['set-cookie']).split(';')[0] ?? '';
    const stId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Stokçu', kullaniciAdi: 'lk-stokcu', parola: PAROLA }));
    await ortam.vt.sorgu("INSERT INTO rol (kod, ad) VALUES ('lkstokcu', 'Stokçu')");
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, i FROM rol, unnest(ARRAY['sayfa.malzemeler', 'sayfa.stok']) i WHERE kod = 'lkstokcu'");
    await ortam.vt.sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'lkstokcu') WHERE kisi_id = $1", [stId]);
    const sg = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lk-stokcu', parola: PAROLA } });
    stokcu = String(sg.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('anahtarlar kapalı gelir: parça yok, stok okunmaz; kart yoksa 404', async () => {
    const c = await al(`/logo/malzeme-karti/${KOD}`);
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json(), { parcalar: { stok: false, hareket: false, fiyat: false }, logoKodu: KOD, stok: null });
    assert.equal((await al('/logo/malzeme-karti/KL-99999')).statusCode, 404);
    const h = await kartHareketleri(o().vt, sahteKopru({ hareketler: 3, geriye: true }).kopru, KOD, null);
    assert.equal(h.durum, 'kapali');
  });

  test('stok açıkken ambar ambar Logo ve CORE; fark yalnız eşli depolardan; fiyat yalnız fiyat görene', async () => {
    await ayar('logo.baglanti', true);
    await ayar('logo.stok-okumasi', true);
    await ayar('logo.son-alis-fiyatlari-okumasi', true);
    const c = (await al(`/logo/malzeme-karti/${KOD.toLowerCase()}`)).json() as LogoKartBolumuCevabi;
    assert.deepEqual(c.parcalar, { stok: true, hareket: false, fiyat: true });
    assert.equal(Date.parse(c.stok?.sonOkuma ?? ''), Date.parse('2026-11-13T09:00:00Z'));
    assert.deepEqual(c.stok?.ambarlar.map((a) => [a.ambarNo, a.ambarAdi, a.logo, a.depo?.kod ?? null, a.core, a.fark]), [
      [0, 'ORN merkez', '412.5', 'LKM', '405', '7.5'],
      [1, null, '0', 'LKU', null, '0'],
      [3, 'ORN fason', '30', null, null, null],
    ]);
    assert.deepEqual([c.stok?.eslenen, c.stok?.eslenmemis], [{ logo: '412.5', core: '405', fark: '7.5' }, '30']);
    const st = (await al(`/logo/malzeme-karti/${KOD}`, stokcu)).json() as LogoKartBolumuCevabi;
    assert.deepEqual([st.parcalar, st.stok?.eslenen?.fark], [{ stok: true, hareket: false, fiyat: false }, '7.5'], 'fiyat yetkisi olmayana fiyat parçası yok');
    assert.equal((await al(`/logo/malzeme-karti/${KOD}/son-alislar`, stokcu)).statusCode, 403);
  });

  test('stok okuma yetkisi olmayan (yalnız malzeme sayfası) stok ve hareket parçasını görmez; hareket ucu 403', async () => {
    await ayar('logo.malzeme-hareketleri-okumasi', true);
    const ok = (await al(`/logo/malzeme-karti/${KOD}`, okuyucu)).json() as LogoKartBolumuCevabi;
    assert.deepEqual([ok.parcalar, ok.stok], [{ stok: false, hareket: false, fiyat: false }, null]);
    assert.equal((await al(`/logo/malzeme-karti/${KOD}/hareketler`, okuyucu)).statusCode, 403);
    assert.equal((await al(`/logo/malzeme-karti/${KOD}/son-alislar`, okuyucu)).statusCode, 403);
    assert.equal((await al(`/logo/malzeme-karti/${KOD}`, stokcu)).json().parcalar.hareket, true);
    const h = await al(`/logo/malzeme-karti/${KOD}/hareketler`, stokcu);
    assert.equal(h.statusCode, 200, h.body);
    await ayar('logo.malzeme-hareketleri-okumasi', false);
  });

  test('hareketler: yeni yardımcı geriye 20, sonra daha eskiler; eski yardımcıda sayfalar okunup son 20; çok sayfa uydurulmaz', async () => {
    await ayar('logo.malzeme-hareketleri-okumasi', true);
    const yeni = sahteKopru({ hareketler: 25, geriye: true });
    const ilk = await kartHareketleri(o().vt, yeni.kopru, KOD, null);
    assert.deepEqual([ilk.durum, ilk.kayitlar.length, ilk.kayitlar[0]?.logoKayitNo, ilk.dahaEski], ['tamam', 20, 25, 6]);
    assert.deepEqual([ilk.kayitlar[0]?.fisAdi, ilk.kayitlar[0]?.yon, ilk.kayitlar[1]?.yon], ['Sarf fişi', 'cikis', 'giris']);
    const ikinci = await kartHareketleri(o().vt, yeni.kopru, KOD, 6);
    assert.deepEqual([ikinci.kayitlar.map((h) => h.logoKayitNo), ikinci.dahaEski], [[5, 4, 3, 2, 1], null]);
    assert.deepEqual(yeni.istekler, [`geri ${KOD} null`, `geri ${KOD} 6`], 'tek istek; artan okuma yok');

    const eski = sahteKopru({ hareketler: 1200, geriye: false });
    const e = await kartHareketleri(o().vt, eski.kopru, KOD, null);
    assert.deepEqual([e.durum, e.kayitlar[0]?.logoKayitNo, e.kayitlar.at(-1)?.logoKayitNo, e.dahaEski], ['tamam', 1200, 1181, 1181]);
    assert.deepEqual(eski.istekler, [`geri ${KOD} null`, `artan ${KOD} 500`, `artan ${KOD} 1000`]);
    const e2 = await kartHareketleri(o().vt, eski.kopru, KOD, 1181);
    assert.equal(e2.kayitlar[0]?.logoKayitNo, 1180);

    const cok = await kartHareketleri(o().vt, sahteKopru({ hareketler: 5000, geriye: false }).kopru, KOD, null);
    assert.deepEqual([cok.durum, cok.kayitlar.length], ['hata', 0]);
    assert.match(cok.ileti ?? '', /yardımcı programın güncellenmesi gerekir/);
    assert.equal((await kartHareketleri(o().vt, null, KOD, null)).durum, 'ortam-degiskeni-yok');
  });

  test('son alışlar: tedarikçi adı cari aynasından, yoksa kod; okunamayan fiyat atlanır', async () => {
    const alislar: LogoAlisFiyati[] = [
      { logoKayitNo: 3, tarih: '2026-11-01', cariKodu: 'ORN-T1', faturaNo: 'ORN-FT-3', miktar: '100', birim: 'KG', fiyat: '42.5', dovizTuru: null, dovizFiyati: null },
      { logoKayitNo: 2, tarih: '2026-10-01', cariKodu: 'ORN-T9', faturaNo: null, miktar: '50', birim: 'KG', fiyat: '1.2', dovizTuru: 1, dovizFiyati: '1.1' },
      { logoKayitNo: 1, tarih: '2026-09-01', cariKodu: null, faturaNo: null, miktar: '1', birim: null, fiyat: '1e3', dovizTuru: null, dovizFiyati: null },
    ];
    const r = await kartAlislari(o().vt, sahteKopru({ hareketler: 0, geriye: true, alislar }).kopru, KOD);
    assert.deepEqual(r.kayitlar.map((a) => [a.logoKayitNo, a.tedarikci, a.fiyat]), [[3, 'ORN Tedarikçi', '42.5'], [2, 'ORN-T9', '1.2']]);
  });
});
