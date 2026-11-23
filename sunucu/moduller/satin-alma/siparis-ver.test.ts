import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { DegerlendirmeCevabi, MalzemeSecenekleriCevabi, Talep, TalepGovdesi, Tedarikci } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';
import { malzemeGelisTarihleri } from './disari.ts';
import { SIPARIS_ILETILERI } from './siparis-kurallar.ts';

// 3574-1: sipariş satırları (siparis-ver komutu, onaya düşen sipariş, R1 plan gelişi, R2 sipariş kaynaklı teklif, S2 kalem azaltma).
const PAROLA = 'dogru-parola-1';
type Cevap = Awaited<ReturnType<FastifyInstance['inject']>>;
describe('satin-alma sipariş satırları 3574-1 (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', sa: '', mudur: '', talep: '' };
  const kisi: Record<string, number> = {};
  let firmaA = 0;
  let firmaB = 0;
  let firmaY = 0;
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
  const oneriKarari = (kim: string, t: Talep, sonuc: 'onay' | 'ret') =>
    istek(kim, 'POST', `/satin-alma-talepleri/${t.id}/siparis-onerisi-karari`, { sonuc, notlar: '', surum: t.surum });
  const gelisToplami = async () => (await vt().tx((db) => malzemeGelisTarihleri(db, [MALZEME]))).get(MALZEME)?.reduce((a, x) => a + Number(x.miktar), 0) ?? 0;

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('satin_alma_siparis_satirlari');
    await ortam.vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, null));
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    c.sa = await rolluKisi('satinalma', 'satin_alma');
    c.mudur = await rolluKisi('mudur', 'mudur');
    c.talep = await rolluKisi('talep', 'kalite');
    const firmaAc = async (ad: string): Promise<number> => {
      const f = tamam<{ firma: { id: number } }>(await istek(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad, tur: 'tedarikci' })).firma;
      tamam<Tedarikci>(await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', { firmaId: f.id, puan: 4, notlar: '', kategoriler: [], degerlendirmeler: [], surum: null }));
      return f.id;
    };
    firmaA = await firmaAc('ORN Tedarik A');
    firmaB = await firmaAc('ORN Tedarik B');
    firmaY = await firmaAc('ORN Tedarik Y');
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

  test('SAT-3574-1: karardaki gibi sipariş satın almada doğrudan verilir; satır termini, not ve firma başlığı yazılır', async () => {
    const { t, k1, k2, a } = await onayli();
    const r = tamam<Talep>(await siparisVer(c.sa, t, [baslik(a, { teslimYeri: 'ORN Depo 1', tedarikciNotu: 'ORN teyit', icNot: 'ORN iç' })],
      [pay(k1, a, '10', '10', { beklenenTeslim: '2026-12-01', notlar: 'ORN acil' }), pay(k2, a, '4', '5')]));
    assert.equal(r.durum, 'siparis_verildi');
    assert.equal(r.siparisOnerisi ?? null, null);
    const s = r.karar!.siparisler[0]!;
    assert.deepEqual([s.teslimYeri, s.tedarikciNotu, s.icNot], ['ORN Depo 1', 'ORN teyit', 'ORN iç']);
    const satir = s.satirlar.find((x) => x.kalemId === k1)!;
    assert.deepEqual([satir.beklenenTeslim, satir.notlar], ['2026-12-01', 'ORN acil']);
    // Satır termini plana gider; boş satırın termini siparişinki.
    const gelis = (await vt().tx((db) => malzemeGelisTarihleri(db, [MALZEME]))).get(MALZEME)!;
    assert.ok(gelis.some((x) => x.tarih === '2026-12-01'));
    assert.ok(gelis.some((x) => x.tarih === '2026-12-05'));
  });

  test('SAT-3574-1 R1: kalem iki firmaya bölünür; plana giden toplam miktar değişmez; tutar artmadıkça onaysızdır', async () => {
    const onceToplam = await gelisToplami();
    const { t, k1, k2, a, b } = await onayli();
    // Onaylı tek karar A; B onaylı kararda olmadığı için yeni firma sayılır ve onaya düşer (S1 a), gerekçe zorunlu.
    assert.equal((await siparisVer(c.sa, t, [baslik(a), baslik(b)], [pay(k1, a, '6', '10'), pay(k1, b, '4', '9'), pay(k2, a, '4', '5')])).statusCode, 400);
    const oneri = tamam<Talep>(await siparisVer(c.sa, t, [baslik(a), baslik(b)], [pay(k1, a, '6', '10'), pay(k1, b, '4', '9'), pay(k2, a, '4', '5')], 'ORN B stoktan veriyor'));
    assert.equal(oneri.durum, 'onayda');
    assert.ok(oneri.siparisOnerisi);
    assert.deepEqual(oneri.siparisOnerisi!.yeniFirmalar, ['ORN Tedarik B']);
    const son = tamam<Talep>(await oneriKarari(c.mudur, oneri, 'onay'));
    assert.equal(son.durum, 'siparis_verildi');
    assert.equal(son.karar!.mod, 'bolunmus');
    assert.equal(son.kalemler.filter((x) => x.ad === 'ORN-MIL-20').length, 2);
    assert.equal(son.kalemler.find((x) => x.id === k1)!.miktar, '6');
    assert.equal(await gelisToplami(), onceToplam + 14, 'bölünen kalem plana bir kez gelir');
    assert.ok(son.hareketler.at(-1)!.metin.includes('bölünen'));
  });

  test('SAT-3574-1 Risk L1: Logo\'ya gitmiş talep satırı firmalara bölünmez (yeni pay Logo karşılaması göndermez)', async () => {
    const { t, k1, k2, a, b } = await onayli();
    await ortam!.sahip.sorgu("UPDATE satin_alma_talep_kalemi SET logo_satir_ref = 'ORN-REF-1' WHERE talep_id = $1 AND id = $2", [t.id, k1]);
    const r = await siparisVer(c.sa, t, [baslik(a), baslik(b)], [pay(k1, a, '6', '10'), pay(k1, b, '4', '9'), pay(k2, a, '4', '5')], 'ORN B stoktan veriyor');
    assert.equal(r.statusCode, 422);
    assert.match(r.body, /Logo/);
    // Bölünmeyen Logo'lu kalem başka firmaya bütün olarak gidebilir (onaya düşer).
    assert.equal((await siparisVer(c.sa, t, [baslik(a), baslik(b)], [pay(k1, b, '10', '12'), pay(k2, a, '4', '5')], 'ORN B hazır')).statusCode, 200);
  });

  test('SAT-3574-1 S1 a, R4, R5: tutarı aşan sipariş onaya düşer; öneren onaylayamaz; ret öneriyi siler, talep onayda kalır', async () => {
    const { t, k1, k2, a } = await onayli();
    const oneri = tamam<Talep>(await siparisVer(c.yonetici, t, [baslik(a)], [pay(k1, a, '10', '11'), pay(k2, a, '4', '5')], 'ORN fiyat arttı'));
    assert.equal(oneri.durum, 'onayda');
    assert.deepEqual([oneri.siparisOnerisi!.onayliTutar, oneri.siparisOnerisi!.yeniTutar], ['120', '130']);
    // R4: ikinci öneri ve kaydetle sipariş verme reddedilir.
    assert.match((await siparisVer(c.sa, oneri, [baslik(a)], [pay(k1, a, '10', '10'), pay(k2, a, '4', '5')])).body, new RegExp(SIPARIS_ILETILERI.bekleyenVar));
    assert.equal((await kaydet(c.sa, { ...govde(oneri), durum: 'siparis_verildi' })).statusCode, 422);
    // S2: satın alma öneriyi onaylayamaz; R5: öneren (onay yetkisi olsa da) onaylayamaz.
    assert.equal((await oneriKarari(c.sa, oneri, 'onay')).statusCode, 403);
    assert.equal((await oneriKarari(c.yonetici, oneri, 'onay')).statusCode, 403);
    const ret = tamam<Talep>(await oneriKarari(c.mudur, oneri, 'ret'));
    assert.equal(ret.durum, 'onayda');
    assert.equal(ret.siparisOnerisi ?? null, null);
    // Tutarı düşüren sipariş onaysızdır.
    const r = tamam<Talep>(await siparisVer(c.sa, ret, [baslik(a)], [pay(k1, a, '10', '9'), pay(k2, a, '4', '5')]));
    assert.equal(r.durum, 'siparis_verildi');
  });

  test('SAT-3574-1 R2: siparişte açılan firma karşılaştırmaya ve teklif sayısına girmez', async () => {
    const { t, k1, k2, a } = await onayli();
    const yeniId = randomUUID();
    const oneri = tamam<Talep>(await siparisVer(c.sa, t, [baslik(a), baslik(yeniId, { yeniFirma: { firmaId: firmaY, paraBirimi: 'TRY', vadeGun: 0, terminGun: null } })],
      [pay(k1, yeniId, '10', '8'), pay(k2, a, '4', '5')], 'ORN Y ucuz ve hazır'));
    const son = tamam<Talep>(await oneriKarari(c.mudur, oneri, 'onay'));
    assert.equal(son.durum, 'siparis_verildi');
    const y = son.teklifler.find((q) => q.id === yeniId)!;
    assert.equal(y.kaynak, 'siparis');
    const d = tamam<DegerlendirmeCevabi>(await istek(c.sa, 'GET', `/satin-alma-talepleri/${t.id}/degerlendirme`));
    assert.equal(d.teklifler.some((x) => x.teklifId === yeniId), false);
    // Teklifi olan firma "başka firma" olarak açılamaz.
    const { t: t2, k1: m1, k2: m2, a: a2 } = await onayli();
    const yeni2 = randomUUID();
    assert.equal((await siparisVer(c.sa, t2, [baslik(a2), baslik(yeni2, { yeniFirma: { firmaId: firmaB, paraBirimi: 'TRY', vadeGun: 0, terminGun: null } })],
      [pay(m1, yeni2, '10', '8'), pay(m2, a2, '4', '5')], 'x')).statusCode, 422);
  });

  test('SAT-3574-1 S2 a, 3574-2a S1 a: satın alma siparişteki kalemi azaltır; artışı önerir, onay yetkilisi onaylar', async () => {
    const { t, k1, k2, a } = await onayli();
    const s = tamam<Talep>(await siparisVer(c.sa, t, [baslik(a)], [pay(k1, a, '10', '10'), pay(k2, a, '4', '5')]));
    const degistir = (kim: string, x: Talep, miktar: string) =>
      istek(kim, 'POST', `/satin-alma-talepleri/${x.id}/siparis-kalemi-degistir`, { kalemId: k2, miktar, birim: 'adet', gerekce: 'ORN deneme', surum: x.surum });
    const az = tamam<Talep>(await degistir(c.sa, s, '3'));
    assert.equal(az.kalemler.find((x) => x.id === k2)!.miktar, '3');
    const oneri = tamam<Talep>(await degistir(c.sa, az, '5'));
    assert.deepEqual([oneri.siparisOnerisi?.tur, oneri.kalemler.find((x) => x.id === k2)!.miktar], ['siparis-degistir', '3']);
    const cok = tamam<Talep>(await istek(c.mudur, 'POST', `/satin-alma-talepleri/${t.id}/siparis-onerisi-karari`, { sonuc: 'onay', notlar: '', surum: oneri.surum }));
    assert.equal(cok.kalemler.find((x) => x.id === k2)!.miktar, '5');
  });
});
