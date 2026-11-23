import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { AcilisCevabi, MalzemeSecenekleriCevabi, Talep, TalepGovdesi, Tedarikci } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';
import { DEGISIKLIK_ILETILERI } from './siparis-kurallar.ts';

// 3574-2a: siparişi değiştir (onaysız sınıf, onaya düşen öneri, dört göz, ret, geri alma, kilitler, geçmiş ve fiyat görünürlüğü).
const PAROLA = 'dogru-parola-1';
type Cevap = Awaited<ReturnType<FastifyInstance['inject']>>;
describe('satin-alma sipariş değişikliği 3574-2a (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', sa: '', mudur: '', talep: '', plan: '' };
  const kisi: Record<string, number> = {};
  let firmaA = 0;
  let firmaB = 0;
  let KATALOG = '';
  let MALZEME = 0;

  const vt = () => ortam!.vt;
  const giris = async (k: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<Cevap> =>
    app.inject({
      method: yontem, url: `/api${url}`, payload: payload as object | undefined,
      headers: yontem === 'POST' ? { cookie: cerez, 'istek-kimligi': randomUUID() } : { cookie: cerez },
    });
  const tamam = <T>(r: Cevap): T => { assert.equal(r.statusCode, 200, r.body); return r.json() as T; };
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<string> {
    const rol = (await vt().tx((db) => db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu])))!;
    kisi[kullaniciAdi] = await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
      return id;
    });
    return giris(kullaniciAdi);
  }
  const govde = (t: Talep) => {
    const { no: _n, talepEdenAdi: _a, acanKisiId: _k, olusturma: _o, guncelleme: _g, ...g } = t;
    return g;
  };
  const kaydet = (cerez: string, t: Record<string, unknown> & { id: string }) => istek(cerez, 'POST', `/satin-alma-talepleri/${t.id}/kaydet`, t);
  const kalem = (ad: string, miktar: string) => ({ id: randomUUID(), katalogId: KATALOG, ad, ozellik: '', miktar, birim: 'adet', kategori: '' });
  const teklif = (firmaId: number, ad: string, fiyatlar: [string, string][]) => ({
    id: randomUUID(), firmaId, tedarikciAdi: ad, teklifTarihi: '2026-11-05', gecerlilik: null, paraBirimi: 'TRY' as const, kur: null, iskontoYuzdesi: '0',
    nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7, vadeGun: 30, avansYuzdesi: '0', garantiAy: null, teknikUygun: true,
    notlar: '', ilkToplam: null, revizyon: 0, fiyatlar: fiyatlar.map(([kalemId, birimFiyat]) => ({ kalemId, birimFiyat })),
  });

  // Satın almanın karar verdiği, müdürün onayladığı talep: K1 10 adet, K2 4 adet; A 10 ve 5 TL, B 12 ve 5 TL; karar A (toplam 120 TL).
  async function onayli(): Promise<{ t: Talep; k1: string; k2: string; a: string; b: string }> {
    const g: TalepGovdesi = {
      id: randomUUID(), baslik: 'ORN sipariş talebi', birim: null, talepEdenKisiId: null, oncelik: 'normal', ihtiyacTarihi: '2026-12-30', notlar: '', durum: 'taslak',
      iptalNedeni: '', agirliklar: null, kalemler: [kalem('ORN-MIL-20', '10'), kalem('ORN-PUL-8', '4')], teklifIstekleri: [], teklifler: [], karar: null, onaylar: [],
      hareketler: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, metin: 'Talep açıldı' }], senaryolar: [],
    } as unknown as TalepGovdesi;
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', g));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, 'ORN Tedarik A', [[k1, '10'], [k2, '5']]);
    const b = teklif(firmaB, 'ORN Tedarik B', [[k1, '12'], [k2, '5']]);
    const deg = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a, b] }));
    const onayda = tamam<Talep>(await kaydet(c.sa, {
      ...govde(deg), durum: 'onayda', teklifler: [a, b],
      karar: { mod: 'tek', teklifId: a.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.satinalma!, kararTarihi: '2026-11-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
    }));
    const son = tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay', dortGozsuz: false, notlar: '' }] }));
    return { t: son, k1, k2, a: a.id, b: b.id };
  }
  const baslik = (teklifId: string, ek: Record<string, unknown> = {}) => ({
    teklifId, yeniFirma: null, siparisNo: '', siparisTarihi: '2026-11-22', beklenenTeslim: '2026-12-05', vadeBaslangici: 'teslim', teslimYeri: '', tedarikciNotu: '', icNot: '', ...ek,
  });
  const pay = (kalemId: string, teklifId: string, miktar: string, birimFiyat: string, ek: Record<string, unknown> = {}) =>
    ({ kalemId, teklifId, miktar, birimFiyat, beklenenTeslim: null, notlar: '', ...ek });
  const siparisVer = (kim: string, t: Talep, siparisler: unknown[], paylar: unknown[], gerekce = '') =>
    istek(kim, 'POST', `/satin-alma-talepleri/${t.id}/siparis-ver`, { siparisler, paylar, gerekce, surum: t.surum });

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('satin_alma_siparis_degisikligi');
    await ortam.vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, null));
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    c.sa = await rolluKisi('satinalma', 'satin_alma');
    c.mudur = await rolluKisi('mudur', 'mudur');
    c.talep = await rolluKisi('talep', 'kalite');
    c.plan = await rolluKisi('plan', 'planlama_proje');
    const firmaAc = async (ad: string): Promise<number> => {
      const f = tamam<{ firma: { id: number } }>(await istek(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad, tur: 'tedarikci' })).firma;
      tamam<Tedarikci>(await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', { firmaId: f.id, puan: 4, notlar: '', kategoriler: [], degerlendirmeler: [], surum: null }));
      return f.id;
    };
    firmaA = await firmaAc('ORN Tedarik A');
    firmaB = await firmaAc('ORN Tedarik B');
    tamam(await istek(c.yonetici, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } }));
    tamam(await istek(c.yonetici, 'POST', '/malzeme-katalogu-kartlari/sa-sp-1/kaydet', {
      kayit: { id: 'sa-sp-1', tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 }, com: { kod: 'HM-SPS-00001', ad: 'ORN çubuk', birim: 'adet' }, onay: { durum: 'aktif' } },
      ozet: { benzersiz_anahtar: 'hammadde|satin-alma|sa-sp-1', mukerrer_gerekcesi: null }, surum: null,
    }));
    MALZEME = tamam<MalzemeSecenekleriCevabi>(await istek(c.sa, 'GET', '/satin-alma-malzeme-secenekleri?ara=HM-SPS-00001')).malzemeler.find((m) => m.kod === 'HM-SPS-00001')!.no;
    KATALOG = tamam<{ id: string }>(await istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', {
      id: randomUUID(), malzemeNo: MALZEME, ozellik: '', notlar: '', takmaAdlari: [], surum: null,
    })).id;
  });
  after(async () => { await ortam?.kaldir(); });

  // Siparişi verilmiş talep: SP A, K1 10 adet x 10 TL, K2 4 adet x 5 TL (toplam 120 TL, kararla aynı; doğrudan verilir).
  async function siparisli(): Promise<{ t: Talep; k1: string; k2: string; a: string }> {
    const { t, k1, k2, a } = await onayli();
    const s = tamam<Talep>(await siparisVer(c.sa, t, [baslik(a, { teslimYeri: 'ORN Depo 1' })], [pay(k1, a, '10', '10'), pay(k2, a, '4', '5')]));
    assert.equal(s.durum, 'siparis_verildi');
    return { t: s, k1, k2, a };
  }
  type Satir = { kalemId: string; miktar: string; birim: string; birimFiyat: string; beklenenTeslim: string | null; notlar: string; iptal: boolean };
  // Siparişin şimdiki hâli (gövde biçiminde); test yalnız değişeni üstüne yazar.
  const simdiki = (t: Talep, a: string) => {
    const sip = t.karar!.siparisler.find((x) => x.teklifId === a)!;
    const q = t.teklifler.find((x) => x.id === a)!;
    return {
      satirlar: sip.satirlar.map((r): Satir => ({
        kalemId: r.kalemId, miktar: r.miktar, birim: r.birim, birimFiyat: q.fiyatlar.find((f) => f.kalemId === r.kalemId)!.birimFiyat,
        beklenenTeslim: r.beklenenTeslim ?? null, notlar: r.notlar ?? '', iptal: false,
      })),
      baslik: { vadeGun: q.vadeGun, kdvOrani: sip.kdvOrani ?? null, teslimYeri: sip.teslimYeri ?? '', tedarikciNotu: sip.tedarikciNotu ?? '', icNot: sip.icNot ?? '' },
    };
  };
  const degistir = (kim: string, t: Talep, a: string, satir: (r: Satir) => Satir = (r) => r, baslikEk: Record<string, unknown> = {}, gerekce = 'ORN gerekçe') => {
    const m = simdiki(t, a);
    return istek(kim, 'POST', `/satin-alma-talepleri/${t.id}/siparis-degistir`, {
      teklifId: a, satirlar: m.satirlar.map(satir), baslik: { ...m.baslik, ...baslikEk }, gerekce, teyitKisi: 'ORN telefon', teyitTarihi: '2026-11-24', surum: t.surum,
    });
  };
  const karar = (kim: string, t: Talep, sonuc: 'onay' | 'ret', notlar = '') =>
    istek(kim, 'POST', `/satin-alma-talepleri/${t.id}/siparis-onerisi-karari`, { sonuc, notlar, surum: t.surum });
  const oku = async (id: string, kim = c.sa) => tamam<AcilisCevabi>(await istek(kim, 'GET', '/satin-alma-acilis')).talepler.find((x) => x.id === id)!;
  const sip = (t: Talep, a: string) => t.karar!.siparisler.find((x) => x.teklifId === a)!;
  const fiyat = (t: Talep, a: string, k: string) => t.teklifler.find((x) => x.id === a)!.fiyatlar.find((f) => f.kalemId === k)?.birimFiyat;

  test('SAT-3574-2a S1: fiyat düşürme, termin ve not onaysız uygulanır; sipariş R1 olur, geçmişe izli yazılır', async () => {
    const { t, k1, k2, a } = await siparisli();
    const r = tamam<Talep>(await degistir(c.sa, t, a, (x) => (x.kalemId === k2 ? { ...x, birimFiyat: '4', beklenenTeslim: '2026-12-11', notlar: 'ORN kutu' } : x), { tedarikciNotu: 'ORN teyit' }));
    assert.equal(r.siparisOnerisi ?? null, null);
    const s = sip(r, a);
    assert.equal(s.degisiklikNo, 1);
    assert.equal(fiyat(r, a, k2), '4');
    const satir = s.satirlar.find((x) => x.kalemId === k2)!;
    assert.deepEqual([satir.beklenenTeslim, satir.notlar], ['2026-12-11', 'ORN kutu']);
    assert.equal(s.tedarikciNotu, 'ORN teyit');
    const [g] = s.degisiklikler!;
    assert.equal(g!.sonuc, 'onaysiz');
    assert.equal(g!.degisiklikNo, 1);
    assert.deepEqual(g!.ozet.map((x) => x.alan).sort(), ['birimFiyat', 'not', 'tedarikciNotu', 'termin']);
    assert.deepEqual([g!.onceTutar, g!.sonraTutar], ['120', '116']);
    assert.equal(g!.teyitKisi, 'ORN telefon');
    assert.ok(r.hareketler.some((h) => h.metin.includes('R1 oldu (onaysız, izli)')));
    assert.equal(k1.length > 0, true);
  });

  test('SAT-3574-2a S1, R4: miktar artışı öneri olur, sipariş eski hâliyle kalır; bekleyen varken yeni değişiklik açılmaz; ikinci kişi onaylar', async () => {
    const { t, k1, a } = await siparisli();
    const o = tamam<Talep>(await degistir(c.sa, t, a, (x) => (x.kalemId === k1 ? { ...x, miktar: '12' } : x)));
    assert.equal(o.siparisOnerisi?.tur, 'siparis-degistir');
    assert.equal(o.siparisOnerisi?.govde, null);
    assert.ok(o.siparisOnerisi!.degisiklik!.onayNedenleri.some((x) => x.startsWith('Miktar artışı')));
    assert.equal(o.siparisOnerisi!.degisiklik!.degisiklikNo, 1);
    assert.deepEqual([o.siparisOnerisi!.onayliTutar, o.siparisOnerisi!.yeniTutar], ['120', '140']);
    assert.equal(sip(o, a).satirlar.find((x) => x.kalemId === k1)!.miktar, '10');
    assert.equal(sip(o, a).degisiklikNo, 0);
    const ikinci = await degistir(c.sa, o, a, (x) => ({ ...x, notlar: 'ORN' }));
    assert.equal(ikinci.statusCode, 422, ikinci.body);
    assert.match(ikinci.body, /bekleyen değişiklik/);
    const onay = tamam<Talep>(await karar(c.mudur, o, 'onay'));
    assert.equal(onay.siparisOnerisi ?? null, null);
    const s = sip(onay, a);
    assert.equal(s.satirlar.find((x) => x.kalemId === k1)!.miktar, '12');
    assert.equal(s.degisiklikNo, 1);
    const [g] = s.degisiklikler!;
    assert.deepEqual([g!.sonuc, g!.degisiklikNo, g!.yapanKisiId, g!.onaylayanKisiId, g!.dortGozsuz], ['onaylandi', 1, kisi.satinalma, kisi.mudur, false]);
  });

  test('SAT-3574-2a S2, S3: onay yetkilisinin kendi artışı da öneri olur ve kendisi onaylayamaz; eski kalem ucu da aynı yoldan gider', async () => {
    const { t, k1, a } = await siparisli();
    const o = tamam<Talep>(await istek(c.mudur, 'POST', `/satin-alma-talepleri/${t.id}/siparis-kalemi-degistir`, { kalemId: k1, miktar: '15', birim: 'adet', gerekce: 'ORN artış', surum: t.surum }));
    assert.equal(o.siparisOnerisi?.tur, 'siparis-degistir');
    assert.equal(sip(o, a).satirlar.find((x) => x.kalemId === k1)!.miktar, '10');
    const kendi = await karar(c.mudur, o, 'onay');
    assert.equal(kendi.statusCode, 403, kendi.body);
    // Öneren olmayan geri alamaz; öneren geri alınca geçmişe numarasız "geri alındı" yazılır.
    const baskasi = await istek(c.sa, 'POST', `/satin-alma-talepleri/${t.id}/siparis-onerisi-geri-al`, { surum: o.surum });
    assert.equal(baskasi.statusCode, 403, baskasi.body);
    const geri = tamam<Talep>(await istek(c.mudur, 'POST', `/satin-alma-talepleri/${t.id}/siparis-onerisi-geri-al`, { surum: o.surum }));
    assert.equal(geri.siparisOnerisi ?? null, null);
    const [g] = sip(geri, a).degisiklikler!;
    assert.deepEqual([g!.sonuc, g!.degisiklikNo], ['geri-alindi', null]);
    assert.equal(sip(geri, a).degisiklikNo, 0);
  });

  test('SAT-3574-2a S3: dört göz kapalıyken onay yetkilisi doğrudan uygular, kayıt dört gözsüz işaretli', async () => {
    const { t, k1, a } = await siparisli();
    tamam(await istek(c.yonetici, 'POST', '/ayarlar/satin-alma.dort-goz/degistir', { deger: false }));
    try {
      const r = tamam<Talep>(await degistir(c.mudur, t, a, (x) => (x.kalemId === k1 ? { ...x, miktar: '11' } : x)));
      assert.equal(r.siparisOnerisi ?? null, null);
      const [g] = sip(r, a).degisiklikler!;
      assert.deepEqual([g!.sonuc, g!.dortGozsuz, g!.onaylayanKisiId], ['onaylandi', true, kisi.mudur]);
      // Satın almacı (onay yetkisi yok) için ayar kapalı da olsa artış öneridir.
      const o = tamam<Talep>(await degistir(c.sa, r, a, (x) => (x.kalemId === k1 ? { ...x, miktar: '13' } : x)));
      assert.equal(o.siparisOnerisi?.tur, 'siparis-degistir');
    } finally {
      tamam(await istek(c.yonetici, 'POST', '/ayarlar/satin-alma.dort-goz/degistir', { deger: true }));
    }
  });

  test('SAT-3574-2a: ret notu zorunlu; ret öneriyi siler, geçmişe numarasız yazılır; vade değişikliği onaya düşer', async () => {
    const { t, a } = await siparisli();
    const o = tamam<Talep>(await degistir(c.sa, t, a, (x) => x, { vadeGun: 45 }));
    assert.ok(o.siparisOnerisi!.degisiklik!.onayNedenleri.some((x) => x.startsWith('Ödeme şartı')));
    const notsuz = await karar(c.mudur, o, 'ret');
    assert.equal(notsuz.statusCode, 400, notsuz.body);
    const r = tamam<Talep>(await karar(c.mudur, o, 'ret', 'ORN teklifteki vade geçerli'));
    assert.equal(r.siparisOnerisi ?? null, null);
    assert.equal(r.teklifler.find((x) => x.id === a)!.vadeGun, 30);
    const [g] = sip(r, a).degisiklikler!;
    assert.deepEqual([g!.sonuc, g!.degisiklikNo, g!.kararNotu, g!.onaylayanKisiId], ['reddedildi', null, 'ORN teklifteki vade geçerli', kisi.mudur]);
  });

  test('SAT-3574-2a R3, R4: teslim altına inilmez; öneriden sonra teslim girerse onay reddedilir', async () => {
    const { t, k1, a } = await siparisli();
    const satirId = sip(t, a).satirlar.find((x) => x.kalemId === k1)!.id;
    const o = tamam<Talep>(await degistir(c.sa, t, a, (x) => (x.kalemId === k1 ? { ...x, miktar: '14' } : x)));
    await ortam!.sahip.sorgu("INSERT INTO satin_alma_teslim (siparis_satiri_id, mal_kabul_satiri_id, miktar, zaman, kisi_id) VALUES ($1, 935741, 6, '2026-11-25T10:00:00Z', $2)", [satirId, kisi.satinalma]);
    const red = await karar(c.mudur, o, 'onay');
    assert.equal(red.statusCode, 422, red.body);
    assert.match(red.body, /öneriden sonra değişti/);
    const ret = tamam<Talep>(await karar(c.mudur, await oku(t.id), 'ret', 'ORN teslim geldi'));
    const az = await degistir(c.sa, ret, a, (x) => (x.kalemId === k1 ? { ...x, miktar: '5' } : x));
    assert.equal(az.statusCode, 422, az.body);
    assert.ok(az.body.includes(DEGISIKLIK_ILETILERI.teslimdenAz('ORN-MIL-20', '6')), az.body);
    // Teslimli satır iptal edilince teslim alınana iner (kalan kapanır).
    const iptal = tamam<Talep>(await degistir(c.sa, ret, a, (x) => (x.kalemId === k1 ? { ...x, iptal: true } : x)));
    assert.equal(sip(iptal, a).satirlar.find((x) => x.kalemId === k1)!.miktar, '6');
  });

  test('SAT-3574-2a: teslimsiz satır iptal edilince siparişten çıkar; bütün satırlar iptal edilemez', async () => {
    const { t, k1, k2, a } = await siparisli();
    const hepsi = await degistir(c.sa, t, a, (x) => ({ ...x, iptal: true }));
    assert.equal(hepsi.statusCode, 422, hepsi.body);
    const r = tamam<Talep>(await degistir(c.sa, t, a, (x) => (x.kalemId === k2 ? { ...x, iptal: true } : x)));
    assert.deepEqual(sip(r, a).satirlar.map((x) => x.kalemId), [k1]);
    assert.equal(r.kalemler.some((x) => x.id === k2), false);
    assert.equal(sip(r, a).degisiklikler![0]!.sonuc, 'onaysiz');
  });

  test('SAT-3574-2a S5: fiyat görmeyen okuyucu değişiklik geçmişini ve bekleyen öneriyi görmez', async () => {
    const { t, k1, a } = await siparisli();
    const r = tamam<Talep>(await degistir(c.sa, t, a, (x) => (x.kalemId === k1 ? { ...x, birimFiyat: '9' } : x)));
    tamam<Talep>(await degistir(c.sa, r, a, (x) => (x.kalemId === k1 ? { ...x, miktar: '20' } : x)));
    assert.equal((await oku(t.id)).karar!.siparisler[0]!.degisiklikler!.length, 1);
    const gor = await oku(t.id, c.plan);
    for (const x of gor.karar?.siparisler ?? []) assert.equal(x.degisiklikler, undefined);
    assert.equal(gor.siparisOnerisi ?? null, null);
  });

  test('SAT-3574-2a: değişiklik yoksa ve eksik satırla gelirse reddedilir', async () => {
    const { t, k1, a } = await siparisli();
    const bos = await degistir(c.sa, t, a);
    assert.equal(bos.statusCode, 422, bos.body);
    assert.match(bos.body, /Değişiklik yok/);
    const m = simdiki(t, a);
    const eksik = await istek(c.sa, 'POST', `/satin-alma-talepleri/${t.id}/siparis-degistir`, {
      teklifId: a, satirlar: m.satirlar.filter((x) => x.kalemId === k1), baslik: m.baslik, gerekce: 'ORN', teyitKisi: '', teyitTarihi: null, surum: t.surum,
    });
    assert.equal(eksik.statusCode, 422, eksik.body);
  });
});
