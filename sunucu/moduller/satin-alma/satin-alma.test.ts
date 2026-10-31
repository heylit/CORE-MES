import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type {
  AcilisCevabi, Ayarlar, DegerlendirmeCevabi, KartAyrintilariCevabi, FirmaSecenekleriCevabi, KatalogKaydi, Talebim, TaleplerimCevabi, Talep, TalepGovdesi, Tedarikci,
} from '#paylasilan/sozlesme/satin-alma.ts';
import type { KgFiyatiGecmisiCevabi, KgFiyatlariCevabi, MalzemeSecenekleriCevabi, SatinAlmaOzetiCevabi, SiparisBelgeleriCevabi, SiparisFaturalariCevabi, SiparisTakibiCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import type { BeklenenOdemelerCevabi } from '#paylasilan/sozlesme/finans.ts';
import type { BildirimListeCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  karsilamaLogoSonucu, logoyaGidecekKarsilamalar, logoyaGidecekSiparisler, logoyaGidecekTalepler, logoyaGuncellemeGidecekSiparisler, logoyaKapatmaGidecekSiparisler, siparisLogoKapatmaSonucu, logoyaIptalGidecekSiparisler, malKabulFiyatlari, malzemeGelisTarihleri, ortalamaAlisFiyatlari, siparisSatiriBelgeleri, siparisLogoGuncellemeSonucu, siparisLogoIptalSonucu, siparisLogoSonucu, siparisSatirlari, sonAlisFiyatlari, talepLogoSonucu, teslimGeriAl, teslimIsle, siparisSatirlarininEmri, isEmriFasonTutarlari,
} from './disari.ts';
import { uclar } from './uclar.ts';
import * as servis from './servis.ts';
import { tedarikciOnayDurumlari } from '../kalite-merkezi/disari.ts';
import { ILETILER } from './kurallar.ts';
import { kablola } from '../../kablolama.ts';
import { takvimKayitlari } from './disari.ts';

const PAROLA = 'dogru-parola-1';
type Cevap = Awaited<ReturnType<FastifyInstance['inject']>>;
describe('satin-alma sürüm 6 (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c: Record<'yonetici' | 'sa' | 'mudur' | 'depo' | 'talep' | 'talep2' | 'operator', string> = {
    yonetici: '', sa: '', mudur: '', depo: '', talep: '', talep2: '', operator: '',
  };
  const kisi: Record<string, number> = {};
  let firmaA = 0;
  let firmaB = 0;
  let firmaPasif = 0;
  let firmaMusteri = 0;

  const vt = () => ortam!.vt;
  const giris = async (k: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  // Her yazma kendi istek kimliğiyle gider (tekrar korumalı uç kimliksiz isteği reddeder; korumasız uç başlığı yok sayar).
  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, kimlik: string | null = randomUUID()): Promise<Cevap> =>
    app.inject({
      method: yontem, url: `/api${url}`, payload: payload as object | undefined,
      headers: yontem === 'POST' && kimlik !== null ? { cookie: cerez, 'istek-kimligi': kimlik } : { cookie: cerez },
    });
  const tamam = <T>(r: Cevap): T => { assert.equal(r.statusCode, 200, r.body); return r.json() as T; };
  const kisitla = (ad: string) => (h: { constraint?: string; message?: string }) => h.constraint === ad || (h.message ?? '').includes(ad);

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

  // Siparişe dönen kalem kartlı olmalı (#375); fikstür kalemleri kartlı katalog kalemine bağlıdır, kart bekleyen kalem açıkça boş verilir.
  let KATALOG = '';
  const kalem = (adi: string, miktar = '10', katalogId: string | null = KATALOG) => ({ id: randomUUID(), katalogId, ad: adi, ozellik: '', miktar, birim: 'adet', kategori: '' });
  const yeniTalep = (alan: Partial<TalepGovdesi> = {}): TalepGovdesi => ({
    id: randomUUID(), baslik: 'Deneme talep', birim: null, talepEdenKisiId: null, oncelik: 'normal', ihtiyacTarihi: '2026-10-30', notlar: '',
    durum: 'taslak', iptalNedeni: '', agirliklar: null, kalemler: [kalem('Deneme rulman'), kalem('Deneme kayış', '4')], teklifIstekleri: [],
    teklifler: [], karar: null, onaylar: [], hareketler: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, metin: 'Talep açıldı' }],
    senaryolar: [], ...alan,
  });
  const teklif = (firmaId: number, fiyatlar: [string, string][], alan: Record<string, unknown> = {}) => ({
    id: randomUUID(), firmaId, tedarikciAdi: firmaId === firmaA ? 'Deneme Tedarik A' : 'Deneme Tedarik B', teklifTarihi: '2026-10-05', gecerlilik: null,
    paraBirimi: 'TRY' as const, kur: null, iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7,
    vadeGun: 30, avansYuzdesi: '0', garantiAy: null, teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0,
    fiyatlar: fiyatlar.map(([kalemId, birimFiyat]) => ({ kalemId, birimFiyat })), ...alan,
  });
  const govde = (t: Talep) => {
    const { no: _n, talepEdenAdi: _a, acanKisiId: _k, olusturma: _o, guncelleme: _g, ...g } = t;
    return g;
  };
  // Gövde serbest nesnedir: sunucunun cevabındaki ek alanlar (sipariş satırları, teslim durumu) şemada atılır.
  const kaydet = (cerez: string, t: Record<string, unknown> & { id: string }) => istek(cerez, 'POST', `/satin-alma-talepleri/${t.id}/kaydet`, t);
  // Kataloğa bağlanacak kart satın almanın arama ucundan bulunur; aktif olmayan kart aramada yoktur, sayı kimliği veritabanından okunur.
  const secenek = async (kod: string) => tamam<MalzemeSecenekleriCevabi>(await istek(c.sa, 'GET', `/satin-alma-malzeme-secenekleri?ara=${kod}`)).malzemeler.find((m) => m.kod === kod)!;
  const kartNo = async (kod: string, aktif = true): Promise<number> => aktif ? (await secenek(kod)).no
    : (await ortam!.sahip.tx((db) => db.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kayit->'com'->>'kod' = $1", [kod])))!.no;

  // Satın almanın teklif girip tek tedarikçiye karar verdiği talep.
  async function kararli(): Promise<Talep> {
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10.00'], [k2, '5']]);
    const b = teklif(firmaB, [[k1, '12'], [k2, '5']]);
    const deg = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a, b] }));
    return tamam<Talep>(await kaydet(c.sa, {
      ...govde(deg), durum: 'onayda', teklifler: [a, b],
      karar: { mod: 'tek', teklifId: a.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
      hareketler: [...deg.hareketler, { id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, metin: 'Karar: Deneme Tedarik A' }],
    }));
  }

  // Finansta firma açılıp satın almanın tedarikçisi yapılır; pasifleştirme ayrı adımdır (teklif kurulduktan sonra pasifleşen firma).
  // Test sonunda firma pasif bırakılır: firma arama testi yalnız aktif firmaları sayar.
  async function tedarikciFirma(ad: string): Promise<{ id: number; pasifle: () => Promise<void> }> {
    const f = tamam<{ firma: { id: number; surum: number } }>(await istek(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad, tur: 'tedarikci' })).firma;
    tamam<Tedarikci>(await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', { firmaId: f.id, puan: 3, notlar: '', kategoriler: [], degerlendirmeler: [], surum: null }));
    return { id: f.id, pasifle: async () => { tamam(await istek(c.yonetici, 'POST', `/finans/firmalar/${f.id}/pasif`, { surum: f.surum })); } };
  }

  before(async () => {
    // Sevkiyat alım bağı (kart #1310) gibi modüller arası bağlar ön yükleme olmadan da kurulu olsun (tek dosya koşusu).
    kablola();
    // Rol x işlem satırları kisiler göçünden gelir (kart #223); test hiçbir role işlem eklemez.
    ortam = await testVeritabaniKur('satin_alma6');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    kisi.yonetici = yoneticiId;
    c.yonetici = await giris('yonetici');
    c.sa = await rolluKisi('satinalma', 'satin_alma');
    kisi.sa = kisi.satinalma!;
    c.mudur = await rolluKisi('mudur', 'mudur');
    c.depo = await rolluKisi('depo', 'depo');
    c.talep = await rolluKisi('talep', 'kalite');
    c.talep2 = await rolluKisi('talep2', 'kalite');
    c.operator = await rolluKisi('operator', 'operator');
    // Dövizli teklif, ayarlarda o para birimi olmadan yazılamaz (satin_alma_teklif para_birimi FK); kur finanstadır (SA3 a).
    const ayar = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).ayarlar;
    tamam(await istek(c.sa, 'POST', '/satin-alma-ayarlari/kaydet', {
      sirket: '', agirliklar: ayar.agirliklar, gecerlilikGun: 15, enAzTeklif: 3, fiyatUyariYuzdesi: '10',
      kurlar: [{ paraBirimi: 'TRY', aylikFaizYuzdesi: '0' }, { paraBirimi: 'USD', aylikFaizYuzdesi: '0' }, { paraBirimi: 'EUR', aylikFaizYuzdesi: '0' }],
      kategoriler: [], birimler: [], onayLimitleri: [], surum: ayar.surum,
    }));
    // Firma kartı finanstadır (SA1): firmalar finansın ucuyla açılır.
    const firmaAc = async (ad: string, tur: 'tedarikci' | 'musteri' | 'ikisi', pasif = false): Promise<number> => {
      const f = tamam<{ firma: { id: number; surum: number } }>(await istek(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad, tur })).firma;
      if (pasif) tamam(await istek(c.yonetici, 'POST', `/finans/firmalar/${f.id}/pasif`, { surum: f.surum }));
      return f.id;
    };
    firmaA = await firmaAc('Deneme Tedarik A', 'tedarikci');
    firmaB = await firmaAc('Deneme Tedarik B', 'ikisi');
    firmaPasif = await firmaAc('Deneme Pasif Firma', 'tedarikci', true);
    firmaMusteri = await firmaAc('Deneme Müşteri', 'musteri');
    // Malzeme kartı malzemelerin sayfasında açılır (SA2 b); onay akışı kapalı, kart doğrudan aktif ya da taslak açılır.
    tamam(await istek(c.yonetici, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } }));
    for (const [sira, ad, birim, durum] of [[1, 'Deneme tekrar kalemi', 'adet', 'aktif'], [2, 'Deneme eldiven', 'çift', 'aktif'], [3, 'Deneme taslak kart', 'adet', 'taslak'], [4, 'Deneme fikstür kalemi', 'adet', 'aktif'], [5, 'Deneme eşzamanlı kalem', 'adet', 'aktif']] as const) {
      const kimlik = `sa-kart-${sira}`;
      tamam(await istek(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
        // Malzeme sihirbazının zorunlu alanları (malzemeler B11): aile, kalite ve kart başına ayrı ölçü.
        kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 + sira }, com: { kod: `HM-SAT-0000${sira}`, ad, birim }, onay: { durum } },
        ozet: { benzersiz_anahtar: `hammadde|satin-alma|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
      }));
    }
    KATALOG = tamam<{ id: string }>(await istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', {
      id: randomUUID(), malzemeNo: await kartNo('HM-SAT-00004'), ozellik: '', notlar: '', takmaAdlari: [], surum: null,
    })).id;
    for (const id of [firmaA, firmaB]) {
      tamam<Tedarikci>(await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', {
        firmaId: id, puan: 4, notlar: '', kategoriler: ['Bakım'], degerlendirmeler: [], surum: null,
      }));
    }
  });
  after(async () => { await ortam?.kaldir(); });

  test('SAT-01 SAT-06: talep eden taslak açar; numara sunucuda ST-yıl-sıra; başkası adına açılır, kişi var olmalı', async () => {
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    assert.match(t.no, /^ST-\d{4}-\d{3,}$/);
    assert.equal(t.talepEdenKisiId, kisi.talep);
    assert.equal(t.hareketler[0]?.kisiId, kisi.talep);
    const baskasi = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ talepEdenKisiId: kisi.talep2! })));
    assert.equal(baskasi.talepEdenAdi, 'Deneme talep2');
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ talepEdenKisiId: 2147483000 }))).statusCode, 400);
    assert.equal((await istek(c.operator, 'POST', '/satin-alma-talepleri/ac', yeniTalep())).statusCode, 403);
  });

  test('SAT-64: talep eden teklif ya da kararla talep açamaz; teklif ekleyerek kaydedemez; kendi taslağını düzenler', async () => {
    const t0 = yeniTalep();
    assert.equal((await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', { ...t0, teklifler: [teklif(firmaA, [[t0.kalemler[0]!.id, '1']])] })).statusCode, 403);
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const duzen = tamam<Talep>(await kaydet(c.talep, { ...govde(t), baslik: 'Değişti', durum: 'teklif_isteniyor' }));
    assert.deepEqual([duzen.baslik, duzen.durum, duzen.surum], ['Değişti', 'teklif_isteniyor', 2]);
    const red = await kaydet(c.talep, { ...govde(duzen), teklifler: [teklif(firmaA, [[t.kalemler[0]!.id, '1']])] });
    assert.equal(red.statusCode, 403);
    assert.equal((await kaydet(c.talep2, { ...govde(duzen), baslik: 'Başkası' })).statusCode, 403);
  });

  test('SAT-70: talep bütün olarak eksiksiz kaydedilir ve açılışta aynı döner: kalem, istek, teklif ve fiyat, bölünmüş karar, sabit kur, sipariş, senaryo', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10.5'], [k2, '5']], { paraBirimi: 'USD', kur: '41.25', ilkToplam: '120.0000', revizyon: 1 });
    const b = teklif(firmaB, [[k1, '12']]);
    const senaryo = { id: randomUUID(), ad: 'Yarı yarıya', kisiId: null, kisiAdi: null, olusturma: '2026-10-07T08:00:00.000Z',
      paylar: [{ kalemId: k1, teklifId: a.id, miktar: '5' }, { kalemId: k1, teklifId: b.id, miktar: '5' }], dengeler: [{ kalemId: k1, denge: null }] };
    const g = {
      ...govde(t), durum: 'siparis_verildi' as const, agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 },
      teklifIstekleri: [{ firmaId: firmaA, gonderim: '2026-10-01', sonTarih: '2026-10-04' }], teklifler: [a, b],
      karar: { mod: 'bolunmus' as const, teklifId: null, bolunme: [{ kalemId: k1, teklifId: b.id }, { kalemId: k2, teklifId: a.id }],
        gerekce: 'Termin', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-06', ogrenilenler: '', sabitKurlar: [{ paraBirimi: 'USD' as const, kur: '41.5' }],
        siparisler: [{ teklifId: a.id, siparisNo: 'SA-1', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-14' },
          { teklifId: b.id, siparisNo: 'SA-2', siparisTarihi: '2026-10-07', beklenenTeslim: null }] },
      senaryolar: [senaryo],
    };
    // Taslaktan sipariş durumuna tek kayıtta geçilemez (SAT-07); satın alma adımları sırayla kaydeder.
    assert.equal((await kaydet(c.sa, g)).statusCode, 422);
    const ara = tamam<Talep>(await kaydet(c.sa, { ...g, durum: 'degerlendirme', karar: null }));
    const onayda = tamam<Talep>(await kaydet(c.sa, { ...g, durum: 'onayda', surum: ara.surum }));
    // Sipariş onaylı karar ister (B-002): müdür onaylar, sonra satın alma siparişi kaydeder.
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay', dortGozsuz: false, notlar: '' }] }));
    const son = tamam<Talep>(await kaydet(c.sa, { ...g, onaylar: onayli.onaylar, surum: onayli.surum }));
    const acilis = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis'));
    const okunan = acilis.talepler.find((x) => x.id === t.id)!;
    assert.deepEqual(okunan, son);
    assert.deepEqual(okunan.teklifler.map((q) => [q.paraBirimi, q.kur, q.fiyatlar.length]), [['USD', '41.25', 2], ['TRY', null, 1]]);
    assert.deepEqual(okunan.karar?.bolunme.length, 2);
    // 1096 a: sabit kur onaya girerken sunucuda kurulur; istemcinin gönderdiği 41.5 yok sayılır. Finansta kur yoksa teklifin kendi kuru.
    assert.deepEqual(okunan.karar?.sabitKurlar, [{ paraBirimi: 'TRY', kur: '1', aylikFaizYuzdesi: null }, { paraBirimi: 'USD', kur: '41.25', aylikFaizYuzdesi: null }]);
    assert.equal(okunan.karar?.kurKilidi, onayda.karar?.kurKilidi);
    assert.ok(onayda.karar?.kurKilidi);
    assert.deepEqual(okunan.senaryolar[0]?.paylar.length, 2);
    // Sipariş satırları kalem bazlı karardan oluşur; mal kabul gelene kadar teslim bekleniyor, kalite boş, durum değişmez.
    assert.deepEqual(okunan.karar?.siparisler.map((x) => [x.satirlar.map((r) => r.kalemId), x.teslimDurumu, x.kalite]),
      [[[k2], 'bekleniyor', null], [[k1], 'bekleniyor', null]]);
    assert.equal(okunan.durum, 'siparis_verildi');
    assert.deepEqual(okunan.agirliklar, { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 });
  });

  test('221 a: talep onaya düşünce onaylayana bildirim gider; kaydeden almaz; onaydayken yeniden kaydetmek yeni bildirim açmaz', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const bildirimler = async (cerez: string) => tamam<BildirimListeCevabi>(await istek(cerez, 'GET', '/bildirimler?sayfaBoyu=100')).satirlar
      .filter((b) => b.tur === 'satin-alma.talep-onay-bekliyor' && b.baslik === `Onay bekleyen talep: ${t.no}`);
    const ara = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme' }));
    assert.equal((await bildirimler(c.mudur)).length, 0);
    const onayda = tamam<Talep>(await kaydet(c.sa, { ...govde(ara), durum: 'onayda' }));
    const ilk = await bildirimler(c.mudur);
    assert.deepEqual(ilk.map((b) => [b.yol, b.metin, b.kaynakModul]), [['/satin-alma/onaylar', t.baslik, 'satin-alma']]);
    assert.equal((await bildirimler(c.sa)).length, 0);
    tamam<Talep>(await kaydet(c.sa, govde(onayda)));
    assert.deepEqual((await bildirimler(c.mudur)).map((b) => b.tekrarSayisi), ilk.map((b) => b.tekrarSayisi));
  });

  test('SAT-13 SAT-56: ilk toplam ve revizyon sunucuda hesaplanır; istemcinin değeri yok sayılır', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    // 10 × 10 + 4 × 5 = 120; %10 iskonto 108; nakliye fiyata dahil değil 15; diğer 2 → 125
    const a = teklif(firmaA, [[k1, '10'], [k2, '5']], { iskontoYuzdesi: '10', nakliyeDahil: false, nakliye: '15', digerMasraf: '2', ilkToplam: '999', revizyon: 7 });
    const s1 = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a] }));
    assert.deepEqual([s1.teklifler[0]?.ilkToplam, s1.teklifler[0]?.revizyon], ['125', 0]);
    const s2 = tamam<Talep>(await kaydet(c.sa, { ...govde(s1), teklifler: [{ ...s1.teklifler[0]!, fiyatlar: [{ kalemId: k1, birimFiyat: '9' }, { kalemId: k2, birimFiyat: '5' }] }] }));
    assert.deepEqual([s2.teklifler[0]?.ilkToplam, s2.teklifler[0]?.revizyon], ['125', 1]);
    const s3 = tamam<Talep>(await kaydet(c.sa, { ...govde(s2), teklifler: [{ ...s2.teklifler[0]!, notlar: 'Fiyat aynı' }] }));
    assert.equal(s3.teklifler[0]?.revizyon, 1);
  });

  test('SAT-45: eski sürümle kaydeden 409 (eski-surum) alır; kayıt değişmez', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    tamam<Talep>(await kaydet(c.sa, { ...govde(t), baslik: 'Bir' }));
    const eski = await kaydet(c.sa, { ...govde(t), baslik: 'İki' });
    assert.equal(eski.statusCode, 409);
    assert.equal((eski.json() as { ayrinti?: { neden?: string } }).ayrinti?.neden, 'eski-surum');
  });

  // #375: talep edenin eline hiçbir uçtan teklif, fiyat, tedarikçi, karar, bütçe, onay limiti ya da kur geçmez.
  const SIZINTI = /Deneme Tedarik|"birimFiyat"|"firmaId"|"tedarikci|"teklifler"|"teklifIstekleri"|"karar"|"sabitKurlar"|"yillikButce"|"onayLimitleri"|"kur"|"aylikFaizYuzdesi"/;

  test('SAT-53 SAT-65 #375: açılış satın almanın ekranıdır; yalnız talep açabilen 403 alır, tam gören bütünü görür; işlemsiz 403, kimliksiz 401', async () => {
    const t = await kararli();
    for (const cerez of [c.talep, c.depo, c.operator]) assert.equal((await istek(cerez, 'GET', '/satin-alma-acilis')).statusCode, 403);
    assert.equal((await istek('', 'GET', '/satin-alma-acilis')).statusCode, 401);
    const tam = tamam<AcilisCevabi>(await istek(c.mudur, 'GET', '/satin-alma-acilis'));
    assert.equal(tam.talepler.find((x) => x.id === t.id)?.teklifler.length, 2);
    assert.ok(tam.tedarikciler.some((x) => x.firmaId === firmaA && x.ad === 'Deneme Tedarik A'));
    const acilis = uclar.find((u) => u.yol === '/satin-alma-acilis')!;
    assert.deepEqual(acilis.yetki, { biri: ['satin-alma.oku', 'satin-alma.yaz', 'satin-alma.onayla', 'satin-alma.ayar'] });
  });

  test('#375: talep eden kendi taleplerini fiyatsız, tedarikçisiz ve kararsız görür; başkasının talebi yok; sınır ve toplam', async () => {
    const t = await kararli();
    const benim = tamam<TaleplerimCevabi>(await istek(c.talep, 'GET', '/satin-alma-taleplerim'));
    const g = benim.talepler.find((x) => x.id === t.id)!;
    assert.deepEqual([g.no, g.durum, g.kalemler.map((k) => [k.ad, k.miktar, k.kartBekliyor])], [t.no, 'onayda', [['Deneme rulman', '10', false], ['Deneme kayış', '4', false]]]);
    assert.doesNotMatch(JSON.stringify(benim), SIZINTI);
    assert.equal(tamam<TaleplerimCevabi>(await istek(c.talep2, 'GET', '/satin-alma-taleplerim')).talepler.some((x) => x.id === t.id), false);
    const bir = tamam<TaleplerimCevabi>(await istek(c.talep, 'GET', '/satin-alma-taleplerim?sinir=1'));
    assert.deepEqual([bir.talepler.length, bir.toplam === benim.toplam, benim.toplam >= 2], [1, true, true]);
    assert.equal(benim.talepler.length <= 10, true);
    assert.equal((await istek(c.operator, 'GET', '/satin-alma-taleplerim')).statusCode, 403);
  });

  test('#375: talep edenin erişebildiği her uç teklif, fiyat, tedarikçi, karar ve ayar vermez; satın almanın teklifi korunur', async () => {
    // Açma cevabı: talep eden yalnız kendi yazdığı geçmişi görür.
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    assert.doesNotMatch(JSON.stringify({ ...t, teklifler: undefined, teklifIstekleri: undefined, karar: undefined }), /Deneme Tedarik/);
    assert.deepEqual([t.teklifler, t.teklifIstekleri, t.karar], [[], [], null]);
    // Satın alma teklif isterken teklifi girer; talep eden aynı durumda notunu düzeltir, cevapta teklif ve tedarikçi yoktur.
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10'], [k2, '5']]);
    const sa = tamam<Talep>(await kaydet(c.sa, {
      ...govde(t), durum: 'teklif_isteniyor', teklifler: [a], teklifIstekleri: [{ firmaId: firmaA, gonderim: '2026-10-05', sonTarih: null }],
      hareketler: [...t.hareketler, { id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, metin: '1 tedarikçiden teklif istendi: Deneme Tedarik A' }],
    }));
    const benim = tamam<Talep>(await kaydet(c.talep, { ...govde(t), durum: 'teklif_isteniyor', notlar: 'Deneme düzeltme', surum: sa.surum }));
    assert.equal(benim.notlar, 'Deneme düzeltme');
    assert.deepEqual([benim.teklifler, benim.teklifIstekleri, benim.karar, benim.hareketler.map((h) => h.metin)], [[], [], null, ['Talep açıldı']]);
    assert.doesNotMatch(JSON.stringify(benim.hareketler), /Deneme Tedarik/);
    const tam = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.find((x) => x.id === t.id)!;
    assert.deepEqual([tam.teklifler.map((q) => q.id), tam.notlar], [[a.id], 'Deneme düzeltme']);
    // Kart arama, katalog kaydı ve menü sayaçları fiyat, tedarikçi ve ayar taşımaz.
    const sec = tamam<MalzemeSecenekleriCevabi>(await istek(c.talep, 'GET', '/satin-alma-malzeme-secenekleri?ara=HM-SAT'));
    assert.deepEqual(Object.keys(sec.malzemeler[0]!).sort(), ['ad', 'birim', 'katalogId', 'kategori', 'kod', 'no']);
    const kat = tamam<KatalogKaydi>(await istek(c.talep, 'POST', '/satin-alma-katalogu/kaydet', {
      id: randomUUID(), malzemeNo: await kartNo('HM-SAT-00002'), ozellik: '', notlar: '', takmaAdlari: [], surum: null,
    }));
    assert.doesNotMatch(JSON.stringify(kat), SIZINTI);
    const sayac = tamam<Record<string, number | null>>(await istek(c.talep, 'GET', '/satin-alma-menu-sayaclari'));
    assert.equal(Object.values(sayac).every((n) => n === null), true);
  });

  test('Borç 39 K-058: kararlı talepte talep edenin her cevabı kararsız, teklifsiz ve tedarikçisizdir', async () => {
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10'], [k2, '5']]);
    const kararli = tamam<Talep>(await kaydet(c.sa, {
      ...govde(t), durum: 'teklif_isteniyor', teklifler: [a],
      karar: { mod: 'tek', teklifId: a.id, bolunme: [], gerekce: 'Deneme gerekçe', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
    }));
    assert.equal(kararli.karar?.teklifId, a.id);
    const benim = await kaydet(c.talep, { ...govde(t), durum: 'teklif_isteniyor', notlar: 'Deneme kararlı', surum: kararli.surum });
    const g = tamam<Talep>(benim);
    assert.deepEqual([g.notlar, g.karar, g.teklifler, g.senaryolar], ['Deneme kararlı', null, [], []]);
    assert.doesNotMatch(benim.body, /Deneme Tedarik|"birimFiyat"|"firmaId"|Deneme gerekçe/);
    const liste = await istek(c.talep, 'GET', '/satin-alma-taleplerim?sinir=500');
    assert.ok(tamam<TaleplerimCevabi>(liste).talepler.some((x) => x.id === t.id));
    assert.doesNotMatch(liste.body, SIZINTI);
    assert.equal((await istek(c.talep, 'GET', '/satin-alma-acilis')).statusCode, 403);
    // Kararı satın alma korur: talep edenin kaydı kararı silmez.
    const tam = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.find((x) => x.id === t.id)!;
    assert.equal(tam.karar?.teklifId, a.id);
  });

  test('#375: ana sayfadan hızlı talep yalnız oturumdaki kişi adına açılır; kart kataloğa bağlanır, kartsız kalem kart bekler', async () => {
    const no1 = await kartNo('HM-SAT-00001');
    const r = await istek(c.talep, 'POST', '/satin-alma-talepleri/hizli-ac', {
      id: randomUUID(), ihtiyacTarihi: '2026-10-30', aciklama: 'Deneme hızlı', talepEdenKisiId: kisi.talep2, acanKisiId: kisi.talep2,
      kalemler: [{ malzemeNo: no1, miktar: '3', aciklama: 'Deneme not' }, { ad: 'Deneme serbest', birim: 'adet', miktar: '2' }],
    });
    const h = tamam<Talebim>(r);
    assert.deepEqual([h.baslik, h.durum, h.kalemler.map((k) => [k.ad, k.miktar, k.birim, k.kartBekliyor])],
      ['Deneme tekrar kalemi ve 1 kalem daha', 'taslak', [['Deneme tekrar kalemi', '3', 'adet', false], ['Deneme serbest', '2', 'adet', true]]]);
    assert.doesNotMatch(JSON.stringify(h), SIZINTI);
    const tam = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis'));
    const t = tam.talepler.find((x) => x.id === h.id)!;
    const bagli = tam.katalog.find((k) => k.id === t.kalemler[0]!.katalogId)!;
    assert.deepEqual([t.talepEdenKisiId, t.acanKisiId, bagli.malzemeNo, t.kalemler[1]!.katalogId], [kisi.talep, kisi.talep, no1, null]);
    assert.equal(tamam<TaleplerimCevabi>(await istek(c.talep2, 'GET', '/satin-alma-taleplerim')).talepler.some((x) => x.id === h.id), false);
    // Geçersiz kalemler ve kart: kayıt yok.
    const dene = async (kalemler: unknown[]) => istek(c.talep, 'POST', '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), kalemler });
    for (const kalemler of [[], [{ miktar: '1' }], [{ ad: 'Deneme', miktar: '1' }], [{ ad: 'Deneme', birim: 'adet', miktar: '0' }],
      [{ malzemeNo: await kartNo('HM-SAT-00003', false), miktar: '1' }], [{ malzemeNo: 2147483000, miktar: '1' }]]) {
      assert.equal((await dene(kalemler)).statusCode, 400, JSON.stringify(kalemler));
    }
    assert.equal((await istek(c.operator, 'POST', '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), kalemler: [{ ad: 'D', birim: 'adet', miktar: '1' }] })).statusCode, 403);
    assert.equal((await istek(c.talep, 'POST', '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), kalemler: [{ ad: 'D', birim: 'adet', miktar: '1' }] }, null)).statusCode, 400);
  });

  test('SAT-75 #1192: hizmet talebi yalnız alınan hizmet kartını listeler ve kabul eder; malzeme talebi hizmeti, hizmet talebi malzemeyi reddeder', async () => {
    const hizmetKart = async (kimlik: string, yon: 'Alınan' | 'Verilen'): Promise<number> => {
      tamam(await istek(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
        kayit: { id: kimlik, tur: 'hizmet', com: { kod: 'HZ-SAT-00001', ad: `Deneme hizmet ${yon}`, birim: 'saat' }, g: { kat: 'fason', yon, cesit: 'Talaşlı imalat' }, onay: { durum: 'aktif' } },
        ozet: { benzersiz_anahtar: null, mukerrer_gerekcesi: null }, surum: null,
      }));
      return (await ortam!.sahip.tx((db) => db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik])))!.no;
    };
    const alinan = await hizmetKart('sa-hizmet-1', 'Alınan');
    const verilen = await hizmetKart('sa-hizmet-2', 'Verilen');
    const liste = async (sorgu: string) => tamam<MalzemeSecenekleriCevabi>(await istek(c.talep, 'GET', `/satin-alma-malzeme-secenekleri?${sorgu}`)).malzemeler.map((m) => m.no);
    const hizmetler = await liste('tur=hizmet');
    assert.deepEqual([hizmetler.includes(alinan), hizmetler.includes(verilen)], [true, false]);
    assert.equal(hizmetler.includes(await kartNo('HM-SAT-00001')), false);
    const malzemeler = await liste('ara=');
    assert.deepEqual([malzemeler.includes(await kartNo('HM-SAT-00001')), malzemeler.includes(alinan)], [true, false]);
    assert.equal((await istek(c.talep, 'GET', '/satin-alma-malzeme-secenekleri?tur=urun')).statusCode, 400);

    const ac = (tur: string | undefined, kalemler: unknown[]) => istek(c.talep, 'POST', '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), ...(tur ? { tur } : {}), kalemler });
    const h = tamam<Talebim>(await ac('hizmet', [{ malzemeNo: alinan, miktar: '4' }, { ad: 'Deneme serbest hizmet', birim: 'saat', miktar: '1' }]));
    const t = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.find((x) => x.id === h.id)!;
    assert.deepEqual(t.kalemler.map((k) => [k.ad, k.birim, k.kategori]), [['Deneme hizmet Alınan', 'saat', 'Fason işçilik'], ['Deneme serbest hizmet', 'saat', 'Hizmet']]);
    for (const [tur, no] of [['hizmet', verilen], ['hizmet', await kartNo('HM-SAT-00001')], ['malzeme', alinan], [undefined, alinan]] as const) {
      const r = await ac(tur, [{ malzemeNo: no, miktar: '1' }]);
      assert.equal(r.statusCode, 400, `${tur} ${no}`);
      assert.match(r.body, new RegExp(ILETILER.kartTuruTalepteYok));
    }
  });

  test('SAT-75: katalog ve tam talep uçları da yalnız satın alınabilir kartı bağlar (fiziksel ya da alınan hizmet); eski bağ korunur', async () => {
    const hizmetKart = async (kimlik: string, yon: 'Alınan' | 'Verilen'): Promise<number> => {
      tamam(await istek(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
        kayit: { id: kimlik, tur: 'hizmet', com: { kod: 'HZ-SAT-00001', ad: `Deneme hizmet ${kimlik}`, birim: 'saat' }, g: { kat: 'fason', yon, cesit: 'Talaşlı imalat' }, onay: { durum: 'aktif' } },
        ozet: { benzersiz_anahtar: null, mukerrer_gerekcesi: null }, surum: null,
      }));
      return (await ortam!.sahip.tx((db) => db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik])))!.no;
    };
    const alinan = await hizmetKart('sa-hizmet-3', 'Alınan');
    const verilen = await hizmetKart('sa-hizmet-4', 'Verilen');
    const katalog = (malzemeNo: number) => istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', { id: randomUUID(), malzemeNo, ozellik: '', notlar: '', takmaAdlari: [], surum: null });
    const r = await katalog(verilen);
    assert.equal(r.statusCode, 400);
    assert.match(r.body, new RegExp(ILETILER.kartTuruTalepteYok));
    const alinanKalem = tamam<KatalogKaydi>(await katalog(alinan));
    // Kuraldan önce bağlanmış verilen hizmet kalemi (eski veri): yeni talebe ve yeni kaleme bağlanmaz, var olan kalem düzenlenir.
    const eskiKalem = tamam<KatalogKaydi>(await katalog(await hizmetKart('sa-hizmet-5', 'Alınan')));
    await ortam!.sahip.tx((db) => db.sorgu('UPDATE satin_alma_katalog SET malzeme_no = $1 WHERE id = $2', [verilen, eskiKalem.id]));
    const ac = (kalemler: unknown[]) => istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ kalemler: kalemler as TalepGovdesi['kalemler'] }));
    const red = await ac([kalem('Deneme verilen', '1', eskiKalem.id)]);
    assert.equal(red.statusCode, 400);
    assert.match(red.body, new RegExp(ILETILER.kartTuruTalepteYok));
    const t = tamam<Talep>(await ac([{ ...kalem('Deneme alınan', '1', alinanKalem.id), birim: 'saat' }, kalem('Deneme fiziksel', '2')]));
    await ortam!.sahip.tx((db) => db.sorgu('UPDATE satin_alma_talep_kalemi SET katalog_id = $1 WHERE talep_id = $2 AND id = $3', [eskiKalem.id, t.id, t.kalemler[0]!.id]));
    const eski = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.find((x) => x.id === t.id)!;
    const duzen = tamam<Talep>(await kaydet(c.sa, { ...govde(eski), notlar: 'Deneme düzenleme' }));
    assert.equal(duzen.notlar, 'Deneme düzenleme');
    const yeniKalem = await kaydet(c.sa, { ...govde(duzen), kalemler: [...duzen.kalemler, kalem('Deneme verilen 2', '1', eskiKalem.id)] });
    assert.equal(yeniKalem.statusCode, 400);
    assert.match(yeniKalem.body, new RegExp(ILETILER.kartTuruTalepteYok));
  });

  test('KD-012: aynı yeni kart iki hızlı talepte aynı anda: ikisi de açılır, kart tek katalog kalemine bağlanır', async () => {
    const no5 = await kartNo('HM-SAT-00005');
    const talepEden: Kullanici = { id: kisi.talep!, ad: 'Deneme talep', islemler: ['satin-alma.talep-ac'] };
    const govde = () => ({ id: randomUUID(), tur: 'malzeme' as const, ihtiyacTarihi: null, aciklama: '', uretimEmriId: null, kalemler: [{ malzemeNo: no5, ad: '', birim: '', miktar: '1', aciklama: '', uygulananMalzemeNo: null, isEmriId: null }] });
    // İlk talep kartın katalog kalemini açar ve işlemi açık tutar; ikinci istek bu sırada gelir.
    let ikinci: ReturnType<typeof istek> | null = null;
    await ortam!.vt.tx(async (db) => {
      await servis.hizliAc(db, talepEden, govde(), () => {});
      ikinci = istek(c.talep, 'POST', '/satin-alma-talepleri/hizli-ac', govde());
      await new Promise((coz) => setTimeout(coz, 300));
    });
    assert.equal((await ikinci!).statusCode, 200);
    const katalog = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).katalog;
    assert.equal(katalog.filter((k) => k.malzemeNo === no5).length, 1);
    assert.equal(new Set(katalog.map((k) => k.kod)).size, katalog.length);
  });

  async function emirAc(durum: 'planli' | 'iptal' = 'planli'): Promise<number> {
    const n = randomUUID().slice(0, 8).toUpperCase();
    const im = await ortam!.sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`TEM${n}`, 'Deneme Merkezi']);
    const ist = await ortam!.sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`TEI${n}`, 'Deneme istasyon', im!.id]);
    const e = await ortam!.sahip.tek<{ id: number }>(
      `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum, iptal) VALUES ('P-TE', 'Deneme', 1, $1, $2, $3, ${durum === 'iptal' ? 'now()' : 'NULL'}) RETURNING id`,
      [ist!.id, yoneticiId, durum]);
    return e!.id;
  }

  test('talep üretim emri: emirsiz ve açık emirli açılır, emir no görünür; kapalı ya da olmayan emir 400; bağı değişmeyen talep emir kapanınca da kaydedilir', async () => {
    const acik = await emirAc(), kapali = await emirAc('iptal');
    const emirsiz = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    assert.deepEqual([emirsiz.uretimEmriId, emirsiz.uretimEmriNo], [null, null]);
    const emirli = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ uretimEmriId: acik })));
    assert.equal(emirli.uretimEmriId, acik);
    assert.match(emirli.uretimEmriNo ?? '', /^UE-\d+$/);
    for (const kotu of [kapali, 2147483000]) {
      const r = await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ uretimEmriId: kotu }));
      assert.equal(r.statusCode, 400, r.body);
      assert.match(r.body, new RegExp(ILETILER.emirKapali));
    }
    const kaydetRed = await kaydet(c.talep, { ...govde(emirsiz), uretimEmriId: kapali });
    assert.equal(kaydetRed.statusCode, 400, kaydetRed.body);
    const baglandi = tamam<Talep>(await kaydet(c.talep, { ...govde(emirsiz), uretimEmriId: acik }));
    assert.equal(baglandi.uretimEmriId, acik);
    await ortam!.sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [acik]);
    const korundu = tamam<Talep>(await kaydet(c.talep, { ...govde(baglandi), baslik: 'Emir kapandıktan sonra' }));
    assert.deepEqual([korundu.uretimEmriId, korundu.baslik], [acik, 'Emir kapandıktan sonra']);
    const bosaltildi = tamam<Talep>(await kaydet(c.talep, { ...govde(korundu), uretimEmriId: null }));
    assert.deepEqual([bosaltildi.uretimEmriId, bosaltildi.uretimEmriNo], [null, null]);
  });

  test('talep üretim emri: hızlı açma emri taşır, kapalı emri reddeder; açık emir listesi yalnız açık emirleri verir', async () => {
    const acik = await emirAc(), kapali = await emirAc('iptal');
    const g = (uretimEmriId: number | null) => ({ id: randomUUID(), tur: 'malzeme' as const, ihtiyacTarihi: null, aciklama: '', uretimEmriId, kalemler: [{ ad: 'Deneme serbest', birim: 'adet', miktar: '1', aciklama: '' }] });
    const tamTalep = tamam<Talebim>(await istek(c.talep, 'POST', '/satin-alma-talepleri/hizli-ac', g(acik)));
    assert.match(tamTalep.uretimEmriNo ?? '', /^UE-\d+$/);
    assert.equal(tamam<Talebim>(await istek(c.talep, 'POST', '/satin-alma-talepleri/hizli-ac', g(null))).uretimEmriNo, null);
    assert.equal((await istek(c.talep, 'POST', '/satin-alma-talepleri/hizli-ac', g(kapali))).statusCode, 400);
    const liste = tamam<{ emirler: { id: number }[] }>(await istek(c.talep, 'GET', '/satin-alma-acik-emirler')).emirler.map((e) => e.id);
    assert.deepEqual([liste.includes(acik), liste.includes(kapali)], [true, false]);
  });

  test('siparisSatirlarininEmri: emirli talebin sipariş satırı haritada gelir, emirsizinki ve olmayan kimlik gelmez', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const satirA = siparisi(s, a).satirlar[0]!.id, satirB = siparisi(s, b).satirlar[0]!.id;
    assert.equal((await vt().tx((db) => siparisSatirlarininEmri(db, [satirA, satirB]))).size, 0);
    const emir = await emirAc();
    await ortam!.sahip.sorgu('UPDATE satin_alma_talep SET uretim_emri_id = $2 WHERE id = $1', [s.id, emir]);
    const harita = await vt().tx((db) => siparisSatirlarininEmri(db, [satirA, satirB, satirA, 2147483000]));
    assert.deepEqual([...harita].sort(([x], [y]) => x - y), [[satirA, emir], [satirB, emir]].sort(([x], [y]) => x! - y!));
    assert.equal((await vt().tx((db) => siparisSatirlarininEmri(db, []))).size, 0);
  });

  test('#375: kart bekleyen kalemle sipariş verilmez; kalem karta bağlanınca verilir', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ kalemler: [kalem('Deneme kartlı'), kalem('Deneme serbest', '1', null)] })));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10'], [k2, '5']]);
    const deg = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a] }));
    const ond = tamam<Talep>(await kaydet(c.sa, { ...govde(deg), durum: 'onayda', teklifler: [a],
      karar: { mod: 'tek', teklifId: a.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] } }));
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(ond), onaylar: [onayKaydi()] }));
    const siparis = { teklifId: a.id, siparisNo: 'SA-KARTSIZ', siparisTarihi: '2026-10-07', beklenenTeslim: null };
    const red = await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi', karar: { ...onayli.karar!, siparisler: [siparis] } });
    assert.deepEqual([red.statusCode, red.json().mesaj], [422, ILETILER.kartsizSiparis(['Deneme serbest'])]);
    const bagli = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), kalemler: onayli.kalemler.map((k) => ({ ...k, katalogId: KATALOG })) }));
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(bagli), durum: 'siparis_verildi', karar: { ...bagli.karar!, siparisler: [siparis] } }));
    assert.equal(s.durum, 'siparis_verildi');
  });

  type DenetimSatiri = { yol: string; govde: Record<string, unknown> & { _ek?: Record<string, unknown>[] } };
  const denetimler = (talepId: string) => vt().sorgu<DenetimSatiri>(
    `SELECT yol, govde FROM denetim_kaydi WHERE yol = '/satin-alma-talepleri/:id/kaydet' AND parametre->>'id' = $1 ORDER BY id`, [talepId]);
  const sonAcilis = async () => (await vt().tek<DenetimSatiri>(
    "SELECT yol, govde FROM denetim_kaydi WHERE yol = '/satin-alma-talepleri/ac' ORDER BY id DESC LIMIT 1"))!;

  test('S2: talep kaydı gövdesiz denetlenir; fiyatı değişen her teklif ve kalem ek satırıdır; not ve tedarikçi adı kayda girmez', async () => {
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ notlar: 'Deneme gizli not' })));
    // Fiyatsız açılış ek yazmaz; gövde yerine biçim özeti kalır.
    assert.deepEqual(Object.keys((await sonAcilis()).govde), ['_ozet']);
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10'], [k2, '5']], { notlar: 'Deneme teklif notu' });
    const deg = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a] }));
    const a2 = { ...a, fiyatlar: [{ kalemId: k1, birimFiyat: '11.50' }] };
    tamam<Talep>(await kaydet(c.sa, { ...govde(deg), teklifler: [a2], notlar: 'Deneme yeni not' }));
    const [ilk, ikinci] = await denetimler(t.id);
    assert.deepEqual(ilk!.govde._ek, [
      { teklifId: a.id, firmaId: firmaA, kalemId: k1, miktar: '10', paraBirimi: 'TRY', onceki: null, yeni: '10' },
      { teklifId: a.id, firmaId: firmaA, kalemId: k2, miktar: '4', paraBirimi: 'TRY', onceki: null, yeni: '5' },
    ]);
    assert.deepEqual(ikinci!.govde._ek, [
      { teklifId: a.id, firmaId: firmaA, kalemId: k1, miktar: '10', paraBirimi: 'TRY', onceki: '10', yeni: '11.5' },
      { teklifId: a.id, firmaId: firmaA, kalemId: k2, miktar: '4', paraBirimi: 'TRY', onceki: '5', yeni: null },
    ]);
    const metin = JSON.stringify(await denetimler(t.id));
    for (const yasak of ['Deneme gizli not', 'Deneme yeni not', 'Deneme teklif notu', 'Deneme Tedarik A', 'Deneme rulman']) assert.equal(metin.includes(yasak), false, yasak);
  });

  test('S2: fiyat değişikliği kayda girmeden geçemez; fiyatı değişmeyen kayıt ek yazmaz', async () => {
    const t = await kararli();
    const kayitlar = await denetimler(t.id);
    // kararli(): teklif girişi (dört fiyat) ve fiyatı değişmeyen karar kaydı.
    assert.deepEqual(kayitlar.map((d) => d.govde._ek?.length ?? 0), [4, 0]);
    const izler = kayitlar.flatMap((d) => d.govde._ek ?? []);
    for (const q of t.teklifler) {
      for (const f of q.fiyatlar) assert.ok(izler.some((r) => r['teklifId'] === q.id && r['kalemId'] === f.kalemId && r['yeni'] === f.birimFiyat), `${q.id} ${f.kalemId}`);
    }
  });

  test('S2: sınırı aşan fiyat değişikliğinde kaydın ilk ek satırı kesildiğini ve toplamı açıkça söyler', async () => {
    const kalemler = Array.from({ length: 120 }, (_, i) => kalem(`Deneme kalem ${i + 1}`, '1'));
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({
      kalemler, durum: 'degerlendirme', teklifler: [teklif(firmaB, kalemler.map((k) => [k.id, '2']))],
    })));
    assert.equal(t.teklifler[0]?.fiyatlar.length, 120);
    const ek = (await sonAcilis()).govde._ek!;
    assert.equal(ek.length, 100);
    assert.deepEqual(ek[0], { kesildi: true, toplam: 120, yazilan: 99 });
  });

  test('SAT-29 SAT-30: onayı onayla işlemi ekler (satın alma 403); kişi sunucunun; kararı veren onaylayamaz', async () => {
    const t = await kararli();
    const onay = { id: randomUUID(), zaman: '', kisiId: 999, kisiAdi: 'Uydurma', sonuc: 'onay' as const, dortGozsuz: true, notlar: '' };
    assert.equal((await kaydet(c.sa, { ...govde(t), onaylar: [onay] })).statusCode, 403);
    const o = tamam<Talep>(await kaydet(c.mudur, { ...govde(t), onaylar: [onay] }));
    assert.deepEqual([o.onaylar[0]?.kisiId, o.onaylar[0]?.kisiAdi, o.onaylar[0]?.dortGozsuz], [kisi.mudur, 'Deneme mudur', false]);
    // Yönetici kararı değiştirirse kararı veren olur (kişi sunucunun); sonra onaylarsa dört göz reddeder.
    const t2 = await kararli();
    const k = tamam<Talep>(await kaydet(c.yonetici, { ...govde(t2), karar: { ...t2.karar!, gerekce: 'Yöneticinin gerekçesi' } }));
    assert.equal(k.karar?.kararVerenKisiId, kisi.yonetici);
    const red = await kaydet(c.yonetici, { ...govde(k), onaylar: [{ ...onay, id: randomUUID() }] });
    assert.equal(red.statusCode, 403);
    assert.match((red.json() as { mesaj: string }).mesaj, /Kararı veren/);
  });

  const onayKaydi = (sonuc: 'onay' | 'ret' = 'onay', notlar = '') =>
    ({ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc, dortGozsuz: false, notlar });
  const bugun = async () => (await vt().tx((db) => db.tek<{ g: string }>('SELECT current_date::text AS g')))!.g;

  test('B-001 SAT-30: kararı veren ve karar tarihi sunucunun; istemcinin gönderdiği kişi ve tarih yok sayılır', async () => {
    const t = await kararli();
    assert.deepEqual([t.karar?.kararVerenKisiId, t.karar?.kararTarihi], [kisi.sa, await bugun()]);
    // Karar verenin adı çıkışta kişi tablosundan gelir; ekran kişi no yerine adı gösterir.
    assert.equal(t.karar?.kararVerenAdi, 'Deneme satinalma');
    assert.equal(tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.find((x) => x.id === t.id)?.karar?.kararVerenAdi, 'Deneme satinalma');
    // Adı çıkışa eklemek değişiklik sayılmaz: onay yalnız onay yetkisi ister (müdür, satın alma işi yapmadan onaylar).
    const onayli = await kararli();
    assert.equal((await kaydet(c.mudur, { ...govde(onayli), onaylar: [onayKaydi()] })).statusCode, 200);
    // Başkası adına ve geçmiş tarihli karar yazılamaz; karar değişmeden yapılan kayıt kararı vereni korur.
    const k = tamam<Talep>(await kaydet(c.sa, { ...govde(t), karar: { ...t.karar!, gerekce: 'Fiyat', kararVerenKisiId: kisi.mudur!, kararTarihi: '2020-01-01' } }));
    assert.deepEqual([k.karar?.kararVerenKisiId, k.karar?.kararTarihi], [kisi.sa, await bugun()]);
    const not = tamam<Talep>(await kaydet(c.yonetici, { ...govde(k), notlar: 'Not', karar: { ...k.karar!, kararVerenKisiId: null } }));
    assert.equal(not.karar?.kararVerenKisiId, kisi.sa);
  });

  test('B-001 SAT-30: karar ve onay aynı kayıtta gelirse dört göz yeni kararı verene bakar ve reddeder', async () => {
    const t = await kararli();
    const r = await kaydet(c.yonetici, { ...govde(t), karar: { ...t.karar!, gerekce: 'Yöneticinin kararı' }, onaylar: [onayKaydi()] });
    assert.equal(r.statusCode, 403);
    assert.match((r.json() as { mesaj: string }).mesaj, /Kararı veren/);
    const sonra = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.find((x) => x.id === t.id)!;
    assert.deepEqual([sonra.onaylar.length, sonra.karar?.kararVerenKisiId, sonra.karar?.gerekce], [0, kisi.sa, t.karar?.gerekce]);
  });

  test('B-002 SAT-07 SAT-29: onay kaydı olmadan sipariş verilemez; iptalden siparişe dönüş de onay ister', async () => {
    const t = await kararli();
    const siparis = { teklifId: t.karar!.teklifId!, siparisNo: 'SA-ONAYSIZ', siparisTarihi: '2026-10-07', beklenenTeslim: null };
    assert.equal((await kaydet(c.sa, { ...govde(t), durum: 'siparis_verildi', karar: { ...t.karar!, siparisler: [siparis] } })).statusCode, 422);
    const ip = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'iptal', iptalNedeni: 'Deneme' }));
    assert.equal((await kaydet(c.sa, { ...govde(ip), durum: 'siparis_verildi', karar: { ...ip.karar!, siparisler: [siparis] } })).statusCode, 422);
    // Ret son onaysa da sipariş verilemez.
    const geri = tamam<Talep>(await kaydet(c.sa, { ...govde(ip), durum: 'onayda', iptalNedeni: '' }));
    const ret = tamam<Talep>(await kaydet(c.mudur, { ...govde(geri), durum: 'degerlendirme', onaylar: [onayKaydi('ret', 'Pahalı')] }));
    const tekrar = tamam<Talep>(await kaydet(c.sa, { ...govde(ret), durum: 'onayda' }));
    assert.equal((await kaydet(c.sa, { ...govde(tekrar), durum: 'siparis_verildi', karar: { ...tekrar.karar!, siparisler: [siparis] } })).statusCode, 422);
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(tekrar), onaylar: [...tekrar.onaylar, onayKaydi()] }));
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi', karar: { ...onayli.karar!, siparisler: [siparis] } }));
    assert.equal(s.durum, 'siparis_verildi');
  });

  // 236 a: tedarikçi onay durumunun sahibi Kalite Merkezi'dir; satın alma firma kimliğiyle okur, kendi durum sütunu siparişi engellemez.
  const kararliOnayli = async (firmaId: number, ad: string): Promise<{ onayli: Talep; siparis: { teklifId: string; siparisNo: string; siparisTarihi: string; beklenenTeslim: null } }> => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme' })));
    const [k1] = t.kalemler.map((k) => k.id) as [string];
    const q = teklif(firmaId, [[k1, '10']], { tedarikciAdi: ad });
    const onayda = tamam<Talep>(await kaydet(c.sa, {
      ...govde(t), durum: 'onayda', teklifler: [q],
      karar: { mod: 'tek', teklifId: q.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
    }));
    return { onayli: tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [onayKaydi()] })), siparis: { teklifId: q.id, siparisNo: '', siparisTarihi: '2026-10-07', beklenenTeslim: null } };
  };
  const kaliteKaydi = (kimlik: string) => async (govdesi: Record<string, unknown>, surum: number | null): Promise<number> =>
    tamam<{ surum: number }>(await istek(c.yonetici, 'POST', `/kalite-merkezi/kayitlar/sup/${kimlik}/onayla`, { govde: govdesi, surum })).surum;

  test('SAT-76 (236 a): Kalite Merkezi onayı Aday ya da Askıda olan tedarikçiye sipariş verilmez; Onaylı ve Şartlı onaylıya verilir; var olan sipariş etkilenmez', async () => {
    servis.kaliteDurumuCozucusuKaydet(tedarikciOnayDurumlari);
    const x = await tedarikciFirma('Deneme Askı Tedarik');
    // Kalite kaydının adı firmadan farklı: bağ yalnız firma kimliğidir.
    const kalite = kaliteKaydi('sup_sat76');
    const { onayli, siparis } = await kararliOnayli(x.id, 'Deneme Askı Tedarik');
    let surum = await kalite({ ad: 'Kalitedeki başka ad', onay: 'Aday', firmaId: x.id }, null);
    const sipariset = (t: Talep) => kaydet(c.sa, { ...govde(t), durum: 'siparis_verildi', karar: { ...t.karar!, siparisler: [siparis] } });
    for (const onay of ['Aday', 'Askıda']) {
      if (onay !== 'Aday') surum = await kalite({ ad: 'Kalitedeki başka ad', onay, firmaId: x.id }, surum);
      const red = await sipariset(onayli);
      assert.equal(red.statusCode, 422, onay);
      assert.ok(red.body.includes(ILETILER.askidakiTedarikci([`Deneme Askı Tedarik (${onay})`])), red.body);
    }
    assert.equal(tamam<{ talepler: Talep[] }>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.find((y) => y.id === onayli.id)?.durum, 'onayda');
    const goster = async () => tamam<{ tedarikciler: Tedarikci[] }>(await istek(c.sa, 'GET', '/satin-alma-acilis')).tedarikciler.find((y) => y.firmaId === x.id)!;
    assert.equal((await goster()).kaliteDurumu, 'Askıda');
    surum = await kalite({ ad: 'Kalitedeki başka ad', onay: 'Şartlı onaylı', firmaId: x.id }, surum);
    assert.equal((await goster()).kaliteDurumu, 'Şartlı onaylı');
    const s = tamam<Talep>(await sipariset(onayli));
    assert.equal(s.durum, 'siparis_verildi');
    // Sipariş verildikten sonra askıya alınan tedarikçinin siparişi düzenlenir (beklenen teslim).
    surum = await kalite({ ad: 'Kalitedeki başka ad', onay: 'Askıda', firmaId: x.id }, surum);
    const sonra = tamam<Talep>(await kaydet(c.sa, { ...govde(s), karar: { ...s.karar!, siparisler: s.karar!.siparisler.map((y) => ({ ...y, beklenenTeslim: '2026-11-02' })) } }));
    assert.equal(sonra.karar?.siparisler[0]?.beklenenTeslim, '2026-11-02');
    await kalite({ ad: 'Kalitedeki başka ad', onay: 'Onaylı', firmaId: x.id }, surum);
    await x.pasifle();
  });

  test('236 a: satın almanın eski durum alanı siparişi engellemez ve yazılmaz; Kalite Merkezi kaydı olmayan tedarikçiye sipariş verilir', async () => {
    servis.kaliteDurumuCozucusuKaydet(tedarikciOnayDurumlari);
    const x = await tedarikciFirma('Deneme Eski Durum');
    const once = tamam<{ tedarikciler: Tedarikci[] }>(await istek(c.sa, 'GET', '/satin-alma-acilis')).tedarikciler.find((y) => y.firmaId === x.id)!;
    assert.equal(once.kaliteDurumu, null);
    // Eski istemcinin gönderdiği durum yok sayılır.
    const yazilan = tamam<Tedarikci>(await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', {
      firmaId: x.id, durum: 'askida', puan: once.puan, notlar: once.notlar, kategoriler: once.kategoriler, degerlendirmeler: once.degerlendirmeler, surum: once.surum,
    }));
    assert.equal(yazilan.durum, once.durum);
    await vt().sorgu("UPDATE satin_alma_tedarikci SET durum = 'askida' WHERE firma_id = $1", [x.id]);
    const { onayli, siparis } = await kararliOnayli(x.id, 'Deneme Eski Durum');
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi', karar: { ...onayli.karar!, siparisler: [siparis] } }));
    assert.equal(s.durum, 'siparis_verildi');
    await x.pasifle();
  });

  test('E-13 (236 a): firma kimliği olmayan eski Kalite Merkezi kaydı adla bağlanır ve siparişi engeller; onay dönünce verilir', async () => {
    servis.kaliteDurumuCozucusuKaydet(tedarikciOnayDurumlari);
    const x = await tedarikciFirma('Deneme Kalite Askı');
    const kalite = kaliteKaydi('sup_e13');
    const { onayli, siparis } = await kararliOnayli(x.id, 'Deneme Kalite Askı');
    const ilk = await kalite({ ad: ' deneme kalite ASKI ', kod: '', onay: 'Askıda' }, null);
    const red = await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi', karar: { ...onayli.karar!, siparisler: [siparis] } });
    assert.equal(red.statusCode, 422);
    assert.ok(red.body.includes(ILETILER.askidakiTedarikci(['Deneme Kalite Askı (Askıda)'])), red.body);
    await kalite({ ad: ' deneme kalite ASKI ', kod: '', onay: 'Onaylı' }, ilk);
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi', karar: { ...onayli.karar!, siparisler: [siparis] } }));
    assert.equal(s.durum, 'siparis_verildi');
    await x.pasifle();
  });

  test('B-002 SAT-07: talep yalnız taslaktan ulaşılabilen bir durumla açılır; onaya ve siparişe açılışta geçilemez', async () => {
    for (const durum of ['onayda', 'siparis_verildi', 'teslim_alindi'] as const) {
      const t = yeniTalep({ durum });
      const [k1] = t.kalemler.map((k) => k.id) as [string];
      const q = teklif(firmaA, [[k1, '10']]);
      const r = await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', {
        ...t, teklifler: [q],
        karar: { mod: 'tek', teklifId: q.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [],
          siparisler: durum === 'onayda' ? [] : [{ teklifId: q.id, siparisNo: 'SA-ACILIS', siparisTarihi: '2026-10-07', beklenenTeslim: null }] },
      });
      assert.equal(r.statusCode, 422, `${durum}: ${r.body}`);
    }
    const d = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme' })));
    assert.equal(d.durum, 'degerlendirme');
  });

  test('SAT-07 S4 a: teklif isteniyor durumundan karar kaydı onaya geçer; taslaktan doğrudan onaya geçilemez', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10'], [k2, '5']]);
    const karar = { mod: 'tek' as const, teklifId: a.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] };
    assert.equal((await kaydet(c.sa, { ...govde(t), durum: 'onayda', teklifler: [a], karar })).statusCode, 422);
    const rfq = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'teklif_isteniyor', teklifler: [a] }));
    const onayda = tamam<Talep>(await kaydet(c.sa, { ...govde(rfq), durum: 'onayda', karar }));
    assert.deepEqual([onayda.durum, onayda.karar?.teklifId], ['onayda', a.id]);
  });

  test('B-002 SAT-29: onay yalnız onaydaki talebe ve karar varken eklenir', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme' })));
    assert.equal((await kaydet(c.mudur, { ...govde(t), onaylar: [onayKaydi()] })).statusCode, 422);
    const k = await kararli();
    const d = tamam<Talep>(await kaydet(c.sa, { ...govde(k), durum: 'degerlendirme' }));
    assert.equal((await kaydet(c.mudur, { ...govde(d), onaylar: [onayKaydi()] })).statusCode, 422);
  });

  test('B-002 SAT-29: onaylanmış karar değişmez; değişmesi için önce reddedilir; sipariş bilgisi karar değişikliği sayılmaz', async () => {
    const t = await kararli();
    const o = tamam<Talep>(await kaydet(c.mudur, { ...govde(t), onaylar: [onayKaydi()] }));
    const b = o.teklifler.find((q) => q.id !== o.karar!.teklifId)!;
    assert.equal((await kaydet(c.sa, { ...govde(o), karar: { ...o.karar!, teklifId: b.id } })).statusCode, 422);
    assert.equal((await kaydet(c.sa, { ...govde(o), durum: 'degerlendirme', karar: { ...o.karar!, teklifId: b.id } })).statusCode, 422);
    assert.equal((await kaydet(c.sa, { ...govde(o), karar: { ...o.karar!, gerekce: 'Değişti' } })).statusCode, 422);
    const siparis = { teklifId: o.karar!.teklifId!, siparisNo: 'SA-ONAYLI', siparisTarihi: '2026-10-07', beklenenTeslim: null };
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(o), durum: 'siparis_verildi', karar: { ...o.karar!, siparisler: [siparis] } }));
    assert.equal(s.karar?.siparisler[0]?.siparisNo, 'SA-ONAYLI');
    // Siparişteki talebe onay ya da ret eklenmez; ret onaydaki talebe gelir, sonra karar değişebilir.
    assert.equal((await kaydet(c.mudur, { ...govde(s), onaylar: [...s.onaylar, onayKaydi('ret', 'Vazgeçildi')] })).statusCode, 422);
    const t2 = await kararli();
    const o2 = tamam<Talep>(await kaydet(c.mudur, { ...govde(t2), onaylar: [onayKaydi()] }));
    const ret = tamam<Talep>(await kaydet(c.mudur, { ...govde(o2), durum: 'degerlendirme', onaylar: [...o2.onaylar, onayKaydi('ret', 'Vazgeçildi')] }));
    const b2 = ret.teklifler.find((q) => q.id !== ret.karar!.teklifId)!;
    const yeniKarar = tamam<Talep>(await kaydet(c.sa, { ...govde(ret), karar: { ...ret.karar!, teklifId: b2.id } }));
    assert.equal(yeniKarar.karar?.teklifId, b2.id);
  });

  test('B-010: senaryonun kişisi ve zamanı sunucunun; yeniden kayıtta korunur', async () => {
    const t = await kararli();
    const senaryo = { id: randomUUID(), ad: 'Deneme senaryo', kisiId: kisi.mudur!, kisiAdi: null, olusturma: '2020-01-01T00:00:00.000Z', paylar: [], dengeler: [] };
    const a = tamam<Talep>(await kaydet(c.sa, { ...govde(t), senaryolar: [senaryo] }));
    const s = a.senaryolar[0]!;
    assert.equal(s.kisiId, kisi.sa);
    assert.ok(s.olusturma.startsWith(await bugun()), s.olusturma);
    const b = tamam<Talep>(await kaydet(c.yonetici, { ...govde(a), notlar: 'Yeniden', senaryolar: [{ ...s, kisiId: null, olusturma: '' }] }));
    assert.deepEqual([b.senaryolar[0]?.kisiId, b.senaryolar[0]?.olusturma], [kisi.sa, s.olusturma]);
  });

  // Kalem bazlı kararla iki tedarikçiye sipariş verilmiş talep: A'ya kayış (4), B'ye rulman (10).
  async function bolunmusSiparis(k2FiyatiA = '5', teklifA: Record<string, unknown> = {}): Promise<{ s: Talep; k1: string; k2: string; a: string; b: string }> {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme' })));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10'], [k2, k2FiyatiA]], teklifA);
    const b = teklif(firmaB, [[k1, '9'], [k2, '6']]);
    const onayda = tamam<Talep>(await kaydet(c.sa, {
      ...govde(t), durum: 'onayda', teklifler: [a, b],
      karar: { mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: k1, teklifId: b.id }, { kalemId: k2, teklifId: a.id }], gerekce: 'Kalem bazlı fiyat',
        kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
    }));
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [onayKaydi()] }));
    const s = tamam<Talep>(await kaydet(c.sa, {
      ...govde(onayli), durum: 'siparis_verildi',
      karar: { ...onayli.karar!, siparisler: [
        { teklifId: a.id, siparisNo: 'SA-A', siparisTarihi: '2026-10-07', beklenenTeslim: null },
        { teklifId: b.id, siparisNo: 'SA-B', siparisTarihi: '2026-10-08', beklenenTeslim: null },
      ] },
    }));
    return { s, k1, k2, a: a.id, b: b.id };
  }
  const acilistaki = async (id: string) => tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.find((x) => x.id === id)!;
  const siparisi = (t: Talep, teklifId: string) => t.karar!.siparisler.find((x) => x.teklifId === teklifId)!;

  test('SAT-57: kalem bazlı kararda her tedarikçiye ayrı sipariş açılır; her sipariş yalnız kendisine düşen kalemleri taşır ve ayrı teslim izlenir', async () => {
    const { s, k1, k2 } = await bolunmusSiparis();
    assert.deepEqual(s.karar!.siparisler.map((x) => [x.siparisNo, x.satirlar.map((r) => [r.kalemId, r.miktar]), x.teslimDurumu]).sort(),
      [['SA-A', [[k2, '4']], 'bekleniyor'], ['SA-B', [[k1, '10']], 'bekleniyor']]);
    assert.equal(s.durum, 'siparis_verildi');
  });

  test('kart #1310, 959 b: yöntemi seçilmiş siparişli talep her tedarikçi için sevkiyatta alım kalemi olur; gün siparişi, taşıma yöntemi izler; yöntem silinince kalem kalkar', async () => {
    const { s, a } = await bolunmusSiparis();
    const kalemler = async () => (await vt().tx((db) => db.sorgu<{ firma: number; gun: string | null; tasima: string; yer: string; kaldirildi: boolean }>(
      `SELECT firma_id AS firma, istenen_tarih::text AS gun, tasima, son_yazan_yer AS yer, kaldirildi IS NOT NULL AS kaldirildi FROM sevkiyat_bekleyen
        WHERE kaynak = 'alim' AND talep_id = $1 ORDER BY firma_id, id`, [s.id]))).filter((x) => !x.kaldirildi);
    const alimlar = async () => (await kalemler()).map((x) => [x.firma, x.gun]);
    const yontem = async (teslimYontemi: string | null, cerez = c.sa, surum?: number) =>
      istek(cerez, 'POST', `/satin-alma-talepleri/${s.id}/teslim-yontemi`, { teslimYontemi, surum: surum ?? (await acilistaki(s.id)).surum });
    assert.equal(s.teslimYontemi, null);
    assert.deepEqual(await alimlar(), []);
    assert.equal((await yontem('biz_alacagiz', c.talep)).statusCode, 403);
    const eskiSurum = (await acilistaki(s.id)).surum;
    const t = tamam<Talep>(await yontem('biz_alacagiz'));
    assert.equal(t.teslimYontemi, 'biz_alacagiz');
    // Beklenen teslim boş: talebin ihtiyaç günü.
    assert.deepEqual(await alimlar(), [[firmaA, '2026-10-30'], [firmaB, '2026-10-30']]);
    assert.equal((await yontem('biz_alacagiz', c.sa, eskiSurum)).statusCode, 409);
    tamam<Talep>(await yontem('biz_alacagiz'));
    assert.deepEqual(await alimlar(), [[firmaA, '2026-10-30'], [firmaB, '2026-10-30']], 'yeniden seçmek satır çoğaltmaz');

    const guncel = await acilistaki(s.id);
    tamam<Talep>(await kaydet(c.sa, { ...govde(guncel), karar: { ...guncel.karar!, siparisler: guncel.karar!.siparisler.map((x) =>
      ({ teklifId: x.teklifId, siparisNo: x.siparisNo, siparisTarihi: x.siparisTarihi, beklenenTeslim: x.teklifId === a ? '2026-10-20' : x.beklenenTeslim })) } }));
    assert.deepEqual(await alimlar(), [[firmaA, '2026-10-20'], [firmaB, '2026-10-30']]);

    assert.deepEqual((await kalemler()).map((x) => [x.tasima, x.yer]), [['biz', 'satin-alma'], ['biz', 'satin-alma']]);

    tamam<Talep>(await yontem('firma_getirir'));
    assert.deepEqual((await kalemler()).map((x) => [x.firma, x.gun, x.tasima, x.yer]),
      [[firmaA, '2026-10-20', 'firma', 'satin-alma'], [firmaB, '2026-10-30', 'firma', 'satin-alma']], 'aynı kalem, taşıması değişir');
    tamam<Talep>(await yontem('biz_alacagiz'));
    assert.deepEqual((await kalemler()).map((x) => [x.firma, x.tasima]), [[firmaA, 'biz'], [firmaB, 'biz']]);
    tamam<Talep>(await yontem(null));
    assert.deepEqual(await alimlar(), []);
  });

  const depocu = (): Kullanici => ({ id: kisi.depo!, ad: 'Deneme depo', islemler: [] });
  const teslimEt = (siparisSatirId: number, miktar: string, malKabulSatirId: number) =>
    vt().tx((db) => teslimIsle(db, depocu(), { siparisSatirId, miktar, malKabulSatirId }));
  const geriAl = (malKabulSatirId: number) => vt().tx((db) => teslimGeriAl(db, depocu(), { malKabulSatirId }));
  const hataKodu = (kod: string) => (h: { kod?: string }) => h.kod === kod;

  test('stok değeri: malzemenin son teslim alınan satırının teklif fiyatı, para birimi ve TRY karşılığı; teslimi olmayan malzeme yok; geri alma son teslim sayılmaz', async () => {
    const { s, a, b, k1, k2 } = await bolunmusSiparis();
    const satirA = siparisi(s, a).satirlar[0]!.id, satirB = siparisi(s, b).satirlar[0]!.id;
    const no = async (kalemId: string) => (await vt().tx((db) => db.tek<{ n: number }>(
      'SELECT c.malzeme_no AS n FROM satin_alma_talep_kalemi k JOIN satin_alma_katalog c ON c.id = k.katalog_id WHERE k.talep_id = $1 AND k.id = $2', [s.id, kalemId])))!.n;
    const [m1, m2] = [await no(k1), await no(k2)];
    const oku = () => vt().tx((db) => sonAlisFiyatlari(db, [m1, m2, 2147483000]));
    await teslimEt(satirA, '1', 7701);
    let f = await oku();
    assert.deepEqual(f.get(m2) && { ...f.get(m2)!, zaman: '' }, { birimFiyat: '5', paraBirimi: 'TRY', tryBirimFiyat: '5', zaman: '' });
    assert.equal(f.has(2147483000), false);
    await teslimEt(satirB, '2', 7702);
    f = await oku();
    assert.equal(f.get(m1)?.birimFiyat, '9');
    assert.match(f.get(m1)!.zaman, /^\d{4}-\d{2}-\d{2}T/);
    // 1382 d: geri alınan teslim son alış sayılmaz.
    const once = f.get(m1)!.zaman;
    await geriAl(7702);
    assert.notEqual((await oku()).get(m1)?.zaman, once);
    assert.deepEqual(await vt().tx((db) => sonAlisFiyatlari(db, [])), new Map());
  });

  test('1382 d: alış fiyatı nettir (teklif iskontosu düşülür); mal kabul satırı fiyatı aynı net fiyattır, teslimi olmayan satır yoktur', async () => {
    const { s, a, k2 } = await bolunmusSiparis('8', { iskontoYuzdesi: '10' });
    const m = (await vt().tx((db) => db.tek<{ n: number }>(
      'SELECT c.malzeme_no AS n FROM satin_alma_talep_kalemi k JOIN satin_alma_katalog c ON c.id = k.katalog_id WHERE k.talep_id = $1 AND k.id = $2', [s.id, k2])))!.n;
    await teslimEt(siparisi(s, a).satirlar[0]!.id, '2', 7901);
    const son = (await vt().tx((db) => sonAlisFiyatlari(db, [m]))).get(m)!;
    assert.deepEqual([son.birimFiyat, son.tryBirimFiyat], ['7.2', '7.2']);
    assert.deepEqual(await vt().tx((db) => malKabulFiyatlari(db, [7901, 7999])), new Map([[7901, '7.2']]));
    assert.deepEqual(await vt().tx((db) => malKabulFiyatlari(db, [])), new Map());
    await geriAl(7901);
    assert.deepEqual(await vt().tx((db) => malKabulFiyatlari(db, [7901])), new Map([[7901, '7.2']]), 'geri alınan satırın fiyatı stokun geri almasında kullanılır');
  });

  test('plan: açık siparişteki malzemenin kalan miktarı ve beklenen gelişi termin sırasıyla; tarihsiz en sonda; teslim düşer, biten satır çıkar', async () => {
    const { s, a, b, k1, k2 } = await bolunmusSiparis();
    const g = tamam<Talep>(await kaydet(c.sa, { ...govde(s), karar: { ...s.karar!, siparisler: s.karar!.siparisler.map((x) =>
      ({ teklifId: x.teklifId, siparisNo: x.siparisNo, siparisTarihi: x.siparisTarihi, beklenenTeslim: x.teklifId === a ? '2026-11-05' : null })) } }));
    const no = async (kalemId: string) => (await vt().tx((db) => db.tek<{ n: number }>(
      'SELECT c.malzeme_no AS n FROM satin_alma_talep_kalemi k JOIN satin_alma_katalog c ON c.id = k.katalog_id WHERE k.talep_id = $1 AND k.id = $2', [s.id, kalemId])))!.n;
    const [m1, m2] = [await no(k1), await no(k2)];
    const [noA, noB] = [siparisi(g, a).no, siparisi(g, b).no];
    const oku = async () => {
      const m = await vt().tx((db) => malzemeGelisTarihleri(db, [m1, m2, m2, 2147483000]));
      assert.equal(m.has(2147483000), false);
      for (const l of m.values()) {
        const tarihler = l.map((x) => x.tarih ?? '9999-99-99');
        assert.deepEqual(tarihler, [...tarihler].sort(), 'termin sırası, tarihsiz en sonda');
      }
      // A siparişi k2'nin (m2), B siparişi k1'in (m1) malzemesini getirir; iki kalem aynı karta bağlı olabilir.
      const bu = (n: number, siparisNo: string | null) => (m.get(n) ?? []).filter((x) => x.siparisNo === siparisNo);
      return [...bu(m1, noB), ...bu(m2, noA)];
    };
    const birimi = siparisi(g, a).satirlar[0]!.birim;
    assert.deepEqual(await oku(), [
      { tarih: null, miktar: '10', birim: siparisi(g, b).satirlar[0]!.birim, siparisNo: noB },
      { tarih: '2026-11-05', miktar: '4', birim: birimi, siparisNo: noA },
    ]);
    const satirA = siparisi(g, a).satirlar[0]!.id;
    await teslimEt(satirA, '1.5', 7741);
    assert.deepEqual((await oku())[1], { tarih: '2026-11-05', miktar: '2.5', birim: birimi, siparisNo: noA });
    await teslimEt(satirA, '2.5', 7742);
    assert.deepEqual((await oku()).map((x) => x.siparisNo), [noB]);
    assert.deepEqual(await vt().tx((db) => malzemeGelisTarihleri(db, [])), new Map());
  });

  test('stok değeri (ortalama): neti artı teslimlerin net TRY birim fiyatı net miktarla ağırlıklı; geri alınan teslim çıkar; teslimi olmayan malzemenin fiyatı boş', async () => {
    const malzemeNo = async (t: Talep, kalemId: string) => (await vt().tx((db) => db.tek<{ n: number }>(
      'SELECT c.malzeme_no AS n FROM satin_alma_talep_kalemi k JOIN satin_alma_katalog c ON c.id = k.katalog_id WHERE k.talep_id = $1 AND k.id = $2', [t.id, kalemId])))!.n;
    const oku = (nolar: number[]) => vt().tx((db) => ortalamaAlisFiyatlari(db, nolar));
    const ucuz = await bolunmusSiparis();
    const m = await malzemeNo(ucuz.s, ucuz.k2);
    await teslimEt(siparisi(ucuz.s, ucuz.a).satirlar[0]!.id, '1', 7802);
    const once = (await oku([m, 2147483000]));
    assert.deepEqual(once.get(2147483000), { tryBirimFiyat: null, teslimSayisi: 0 });
    // Önceki testlerin teslimleri de ortalamadadır: beklenen değer o anki toplam miktardan hesaplanır.
    const miktar0 = Number((await vt().tx((db) => db.tek<{ q: string }>(
      `SELECT sum(m.miktar)::text AS q FROM satin_alma_teslim m JOIN satin_alma_siparis_satiri s ON s.id = m.siparis_satiri_id
         JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id JOIN satin_alma_katalog c ON c.id = k.katalog_id
        WHERE c.malzeme_no = $1 AND m.mal_kabul_satiri_id IN (SELECT mal_kabul_satiri_id FROM satin_alma_teslim GROUP BY 1 HAVING sum(miktar) > 0)`, [m])))!.q);
    const fiyat0 = Number(once.get(m)!.tryBirimFiyat);
    const pahali = await bolunmusSiparis('7');
    assert.equal(await malzemeNo(pahali.s, pahali.k2), m);
    await teslimEt(siparisi(pahali.s, pahali.a).satirlar[0]!.id, '3', 7801);
    let sonra = (await oku([m])).get(m)!;
    assert.ok(Math.abs(Number(sonra.tryBirimFiyat) - (fiyat0 * miktar0 + 7 * 3) / (miktar0 + 3)) < 0.0001, sonra.tryBirimFiyat ?? 'boş');
    assert.equal(sonra.teslimSayisi, once.get(m)!.teslimSayisi + 1);
    await geriAl(7801);
    sonra = (await oku([m])).get(m)!;
    assert.deepEqual(sonra, once.get(m), 'geri alınan teslim ortalamadan çıkar');
    assert.deepEqual(await oku([]), new Map());
  });

  test('SH1 SAT-57 SAT-38: stokun yazdığı teslimle sipariş kısmi, sonra tamam olur; iki sipariş de tamam olunca talep teslim alındı görünür; kişi ve gün sunucunun', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const satirA = siparisi(s, a).satirlar[0]!.id, satirB = siparisi(s, b).satirlar[0]!.id;
    await teslimEt(satirA, '3', 7001);
    let t = await acilistaki(s.id);
    assert.deepEqual([siparisi(t, a).teslimDurumu, siparisi(t, a).satirlar[0]!.teslimAlinan, siparisi(t, a).satirlar[0]!.sonTeslimTarihi, t.durum],
      ['kismi', '3', await bugun(), 'siparis_verildi']);
    await teslimEt(satirA, '1', 7002);
    t = await acilistaki(s.id);
    assert.deepEqual([siparisi(t, a).teslimDurumu, siparisi(t, b).teslimDurumu, t.durum], ['tamam', 'bekleniyor', 'siparis_verildi']);
    await teslimEt(satirB, '10', 7003);
    assert.equal((await acilistaki(s.id)).durum, 'teslim_alindi');
    const kisiler = await vt().tx((db) => db.sorgu<{ k: number }>('SELECT DISTINCT kisi_id AS k FROM satin_alma_teslim WHERE mal_kabul_satiri_id IN (7001, 7002, 7003)'));
    assert.deepEqual(kisiler, [{ k: kisi.depo }]);
  });

  test('SH1 TS1: kalanı aşan teslim reddedilmez, sipariş satırında fazla teslim görünür; geri alma ters kayıt ekler, fazla kalkar', async () => {
    const { s, a } = await bolunmusSiparis();
    const satirA = siparisi(s, a).satirlar[0]!.id;
    await teslimEt(satirA, '3', 7101);
    await teslimEt(satirA, '1.5', 7102);
    let r = siparisi(await acilistaki(s.id), a);
    assert.deepEqual([r.teslimDurumu, r.satirlar[0]!.teslimAlinan, r.satirlar[0]!.fazlaTeslim], ['tamam', '4.5', '0.5']);
    await geriAl(7102);
    r = siparisi(await acilistaki(s.id), a);
    assert.deepEqual([r.teslimDurumu, r.satirlar[0]!.teslimAlinan, r.satirlar[0]!.fazlaTeslim], ['kismi', '3', null]);
    const kayitlar = await vt().tx((db) => db.sorgu<{ miktar: string }>('SELECT miktar::text FROM satin_alma_teslim WHERE mal_kabul_satiri_id = 7102 ORDER BY id'));
    assert.deepEqual(kayitlar.map((x) => Number(x.miktar)), [1.5, -1.5]);
  });

  test('257 a: kartlı kalem kartın birimiyle açılır ve kaydedilir; kartsız kalem serbest, eski kayıt dokunulmadan kaydedilir', async () => {
    const red = await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ kalemler: [{ ...kalem('Deneme kg'), birim: 'kg' }] }));
    assert.equal(red.statusCode, 422);
    assert.match(red.body, /Deneme kg: birim malzeme kartının birimiyle girilir \(adet\)/);
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ kalemler: [{ ...kalem('Deneme büyük'), birim: 'ADET' }, { ...kalem('Deneme serbest', '1', null), birim: 'kutu' }] })));
    const [kartli] = t.kalemler.map((k) => k.id) as [string];
    const degis = (x: Talep, birim: string) => kaydet(c.sa, { ...govde(x), kalemler: govde(x).kalemler.map((k) => (k.id === kartli ? { ...k, birim } : k)) });
    assert.equal((await degis(t, 'kg')).statusCode, 422);
    // Kural öncesinden kalan farklı birimli kalem değişmeden kaydedilir.
    await ortam!.sahip.tx((db) => db.sorgu("UPDATE satin_alma_talep_kalemi SET birim = 'kg' WHERE id = $1", [kartli]));
    const eski = await acilistaki(t.id);
    assert.equal(tamam<Talep>(await kaydet(c.sa, { ...govde(eski), notlar: 'Deneme not' })).kalemler.find((k) => k.id === kartli)!.birim, 'kg');
  });

  test('Borç 36: siparişteki kalemin miktarı ve birimi değişmez, kalem silinmez; onaya geri alınınca teslimsiz kalem değişir, teslimli kalem değişmez', async () => {
    const { s, k1, k2, a } = await bolunmusSiparis();
    const kalemDegis = (t: Talep, id: string, d: Record<string, unknown>) => ({ ...govde(t), kalemler: govde(t).kalemler.map((k) => (k.id === id ? { ...k, ...d } : k)) });
    for (const d of [{ miktar: '5' }, { birim: 'kutu' }]) {
      const r = await kaydet(c.sa, kalemDegis(s, k2, d));
      assert.equal(r.statusCode, 422, JSON.stringify(d));
      assert.match(r.body, /Siparişi verilmiş kalemin miktarı ve birimi kaydetle değişmez/);
    }
    assert.equal((await kaydet(c.sa, { ...govde(s), kalemler: govde(s).kalemler.filter((k) => k.id !== k1) })).statusCode, 422);
    assert.equal((await kaydet(c.sa, kalemDegis(s, k2, { miktar: '4.000' }))).statusCode, 200);
    await teslimEt(siparisi(s, a).satirlar[0]!.id, '1', 7401);
    const onayda = tamam<Talep>(await kaydet(c.sa, { ...govde(await acilistaki(s.id)), durum: 'onayda' }));
    assert.equal((await kaydet(c.sa, kalemDegis(onayda, k2, { miktar: '6' }))).statusCode, 422);
    const degisti = tamam<Talep>(await kaydet(c.sa, kalemDegis(onayda, k1, { miktar: '12' })));
    assert.equal(degisti.kalemler.find((k) => k.id === k1)!.miktar, '12');
    assert.equal(siparisi(await acilistaki(s.id), a).satirlar[0]!.miktar, '4');
  });

  test('Borç 36 (kayıtlı ve onaylı değişiklik): onay yetkilisi siparişteki kalemi gerekçeyle değiştirir; satır kimliği korunur, hareket yazılır; teslimden aşağı inmez, teslimli birim değişmez', async () => {
    const { s, k1, k2, a } = await bolunmusSiparis();
    const degistir = (kim: string, t: Talep, g: Record<string, unknown>) =>
      istek(kim, 'POST', `/satin-alma-talepleri/${t.id}/siparis-kalemi-degistir`, { kalemId: k2, miktar: '6', birim: 'adet', gerekce: 'Müşteri adedi arttı', surum: t.surum, ...g });
    const satir = siparisi(s, a).satirlar[0]!;
    assert.equal((await degistir(c.sa, s, {})).statusCode, 403);
    assert.equal((await degistir(c.mudur, s, { gerekce: '  ' })).statusCode, 400);
    const r = tamam<Talep>(await degistir(c.mudur, s, {}));
    assert.equal(r.kalemler.find((k) => k.id === k2)!.miktar, '6');
    const sonra = siparisi(await acilistaki(s.id), a).satirlar[0]!;
    assert.deepEqual([sonra.id, sonra.miktar], [satir.id, '6']);
    const h = r.hareketler.at(-1)!;
    assert.equal(h.kisiId, kisi.mudur);
    assert.match(h.metin, /^Sipariş değişikliği: .* yerine 6 adet\. Gerekçe: Müşteri adedi arttı$/);
    // Aynı sürümle ikinci gönderim yazılmaz.
    assert.equal((await degistir(c.mudur, s, { miktar: '7' })).statusCode, 409);
    await teslimEt(satir.id, '4', 7402);
    const t2 = await acilistaki(s.id);
    for (const [g, ileti] of [[{ miktar: '3' }, /teslim alınandan \(4\) az olamaz/], [{ birim: 'kutu' }, /birimi değişmez/], [{ miktar: '6' }, /değişiklik yok/],
      [{ kalemId: randomUUID() }, /siparişte yok/]] as const) {
      const red = await degistir(c.mudur, t2, g);
      assert.equal(red.statusCode, 422, JSON.stringify(g));
      assert.match(red.body, ileti);
    }
    assert.equal(tamam<Talep>(await degistir(c.mudur, t2, { miktar: '4' })).kalemler.find((k) => k.id === k2)!.miktar, '4');
    // 257 a: teslimsiz kartlı kalemde de birim kartın birimidir; sipariş dışındaki talepte komut çalışmaz.
    const t3 = await acilistaki(s.id);
    const kutu = await degistir(c.mudur, t3, { kalemId: k1, miktar: '2', birim: 'kutu' });
    assert.equal(kutu.statusCode, 422);
    assert.match(kutu.body, /kartının birimiyle girilir \(adet\)/);
    const b = tamam<Talep>(await degistir(c.mudur, t3, { kalemId: k1, miktar: '2', birim: 'adet' }));
    assert.equal(b.kalemler.find((k) => k.id === k1)!.miktar, '2');
    const taslak = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const dis = await istek(c.mudur, 'POST', `/satin-alma-talepleri/${taslak.id}/siparis-kalemi-degistir`, { kalemId: taslak.kalemler[0]!.id, miktar: '2', birim: 'adet', gerekce: 'x', surum: taslak.surum });
    assert.equal(dis.statusCode, 422);
    assert.match(dis.body, /yalnız siparişi verilmiş/);
  });

  test('D6 b: siparişe tedarikçinin alış faturası bağlanır ve kaldırılır; başka siparişteki fatura üstüne bağlanmaz; eşzamanlı iki bağdan biri geçer; geçmişe yazılır', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const { s: s2, a: a2 } = await bolunmusSiparis();
    const fatura = async (firmaId: number, belgeNo: string | null, yon: 'gider' | 'gelir' = 'gider') => tamam<{ belge: { id: number } }>(await istek(c.yonetici, 'POST', '/finans/belgeler/ekle', {
      yon, kategori: yon === 'gider' ? 'mal_alimi' : 'urun_satisi', firmaId, belgeNo, belgeTarihi: '2026-10-09', vade: '2026-11-09', tutar: 100, kdvOrani: 20,
    })).belge.id;
    const f1 = await fatura(firmaA, 'DN-F1');
    const f2 = await fatura(firmaA, null);
    const fb = await fatura(firmaB, 'DN-FB');
    const satis = await fatura(firmaB, 'DN-FS', 'gelir');
    const liste = async (talepId: string, teklifId: string, cerez = c.sa) =>
      istek(cerez, 'GET', `/satin-alma-siparis-faturalari?talepId=${talepId}&teklifId=${teklifId}`);
    const yaz = (talepId: string, teklifId: string, belgeId: number, bagla: boolean, cerez = c.sa) =>
      istek(cerez, 'POST', `/satin-alma-talepleri/${talepId}/siparis-faturasi`, { teklifId, belgeId, bagla });
    const durumlar = (r: Cevap) => tamam<SiparisFaturalariCevabi>(r).faturalar.filter((f) => [f1, f2, fb, satis].includes(f.id)).map((f) => [f.id, f.bagli, f.baskaSipariste]).sort();
    const ileti = (r: Cevap) => [r.statusCode, (r.json() as { mesaj?: string }).mesaj];

    // Liste yalnız siparişin tedarikçisinin alış faturalarıdır; satış ve başka firmanın faturası gelmez, tutar gelmez.
    assert.deepEqual(durumlar(await liste(s.id, a)), [[f1, false, false], [f2, false, false]].sort());
    assert.deepEqual(durumlar(await liste(s.id, b)), [[fb, false, false]]);
    assert.ok(!('toplam' in (tamam<SiparisFaturalariCevabi>(await liste(s.id, a)).faturalar[0] ?? {})));

    assert.deepEqual(durumlar(await yaz(s.id, a, f1, true)), [[f1, true, false], [f2, false, false]].sort());
    // Bağlı faturayı yeniden bağlamak değişiklik değildir; geçmişe ikinci satır yazılmaz.
    tamam(await yaz(s.id, a, f1, true));
    assert.deepEqual(durumlar(await liste(s2.id, a2)), [[f1, false, true], [f2, false, false]].sort());
    assert.deepEqual(ileti(await yaz(s2.id, a2, f1, true)), [422, ILETILER.faturaBaskaSipariste]);
    assert.deepEqual(ileti(await yaz(s2.id, a2, f1, false)), [422, ILETILER.faturaBagliDegil]);
    assert.deepEqual(ileti(await yaz(s.id, a, fb, true)), [422, 'Faturanın firması siparişin tedarikçisi değil.']);
    assert.deepEqual(ileti(await yaz(s.id, b, satis, true)), [422, 'Siparişe yalnız alış faturası bağlanır.']);
    assert.deepEqual(ileti(await yaz(s.id, randomUUID(), f1, true)), [422, ILETILER.faturaSiparisYok]);
    const onayda = await kararli();
    assert.deepEqual(ileti(await liste(onayda.id, onayda.teklifler[0]!.id)), [422, ILETILER.faturaSiparisDurumu]);

    // Aynı fatura iki siparişe aynı anda: ilk işlem bağlayıp bitmeden ikincisi başlar; ikincisi bekler, öncekinin bağını görür ve reddedilir.
    const sa: Kullanici = { id: kisi.sa!, ad: 'Deneme satinalma', islemler: [] };
    let yazdi = (): void => undefined, birak = (): void => undefined;
    const yazildi = new Promise<void>((r) => { yazdi = r; }), bitir = new Promise<void>((r) => { birak = r; });
    const ilk = vt().tx(async (db) => { await servis.siparisFaturasiYaz(db, sa, s.id, { teklifId: a, belgeId: f2, bagla: true }); yazdi(); await bitir; });
    await yazildi;
    // Sonuç hemen yakalanır: ilkin COMMIT'i kilidi bırakınca ikincinin reddi, ilkin cevabından önce gelebilir.
    let ikinciBitti = false;
    const ikinci = vt().tx((db) => servis.siparisFaturasiYaz(db, sa, s2.id, { teklifId: a2, belgeId: f2, bagla: true }))
      .then(() => null, (h: unknown) => h).finally(() => { ikinciBitti = true; });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(ikinciBitti, false);
    birak();
    await ilk;
    const hata = await ikinci;
    assert.ok(hata instanceof Error && hata.message === ILETILER.faturaBaskaSipariste, String(hata));
    assert.deepEqual(durumlar(await liste(s.id, a)).find((x) => x[0] === f2), [f2, true, false]);
    tamam(await yaz(s.id, a, f2, false));

    // Ağ kopunca aynı kimlikle yinelenen kaldırma ilk cevabı alır (ikinci kez "bağlı değil" demez).
    const kaldirK = randomUUID();
    const kaldir = () => istek(c.sa, 'POST', `/satin-alma-talepleri/${s.id}/siparis-faturasi`, { teklifId: a, belgeId: f1, bagla: false }, kaldirK);
    assert.deepEqual(durumlar(await kaldir()), [[f1, false, false], [f2, false, false]].sort());
    assert.deepEqual(durumlar(await kaldir()), [[f1, false, false], [f2, false, false]].sort());
    tamam(await yaz(s2.id, a2, f1, true));
    const metinler = (await acilistaki(s.id)).hareketler.map((h) => h.metin).filter((m) => m.startsWith('Fatura'));
    assert.deepEqual(metinler.filter((m) => m.includes('DN-F1')), ['Fatura bağlandı: DN-F1 (Deneme Tedarik A)', 'Fatura bağı kaldırıldı: DN-F1 (Deneme Tedarik A)']);

    // Yalnız satın almayı yazan işlem; talep eden 403.
    assert.equal((await liste(s.id, a, c.talep)).statusCode, 403);
    assert.equal((await yaz(s.id, a, f1, true, c.talep)).statusCode, 403);
  });

  test('SAT-73 SAT-74 FNS-63 FNS-64 #1124: siparişe çevrilince plan tekliften finansa düşer; yazan değiştirir, okuyan görür; fatura bağlanınca plan kilitlenir ve beklenenden düşer', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const takip = async (cerez = c.sa) => istek(cerez, 'GET', `/satin-alma-talepleri/${s.id}/siparis-takibi`);
    const siparisi = (t: SiparisTakibiCevabi, teklifId: string) => t.siparisler.find((x) => x.teklifId === teklifId)!;
    const ilk = tamam<SiparisTakibiCevabi>(await takip());
    // Vade 30 gün, avans yok, beklenen teslim boş: kalan sipariş tarihinden 30 gün sonra; tutar siparişin KDV hariç toplamı (4 x 5, 10 x 9).
    assert.deepEqual(siparisi(ilk, a).odemePlani, [{ tur: 'vade', vade: '2026-11-06', yontem: 'banka', tutar: '20' }]);
    assert.deepEqual(siparisi(ilk, b).odemePlani, [{ tur: 'vade', vade: '2026-11-07', yontem: 'banka', tutar: '90' }]);
    assert.equal(siparisi(ilk, a).satirIdleri.length, 1);
    assert.deepEqual(siparisi(ilk, a).faturalar, []);
    const beklenen = async () => tamam<BeklenenOdemelerCevabi>(await istek(c.yonetici, 'GET', '/finans/beklenen-odemeler')).odemeler
      .filter((x) => x.talepId === s.id).map((x) => [x.teklifId, x.vade, x.tutar, x.firmaAdi, x.paraBirimi]);
    assert.deepEqual(await beklenen(), [[a, '2026-11-06', '20.00', 'Deneme Tedarik A', 'TRY'], [b, '2026-11-07', '90.00', 'Deneme Tedarik B', 'TRY']]);
    assert.equal((await istek(c.sa, 'GET', '/finans/beklenen-odemeler')).statusCode, 403);

    const yaz = async (satirlar: unknown[], cerez = c.sa, teklifId = a, surum?: number) =>
      istek(cerez, 'POST', `/satin-alma-talepleri/${s.id}/odeme-plani`, { teklifId, satirlar, surum: surum ?? (await acilistaki(s.id)).surum });
    const ileti = (r: Cevap) => [r.statusCode, (r.json() as { mesaj?: string }).mesaj];
    const plan = [{ tur: 'avans', vade: '2026-10-07', yontem: 'nakit', tutar: '5' }, { tur: 'vade', vade: '2026-12-01', yontem: 'cek', tutar: '15.50' }];
    const surum = (await acilistaki(s.id)).surum;
    assert.deepEqual(siparisi(tamam<SiparisTakibiCevabi>(await yaz(plan, c.sa, a, surum)), a).odemePlani,
      [{ tur: 'avans', vade: '2026-10-07', yontem: 'nakit', tutar: '5' }, { tur: 'vade', vade: '2026-12-01', yontem: 'cek', tutar: '15.5' }]);
    // Sürüm planla artar: aynı sürümle ikinci gönderim 409 alır.
    assert.equal((await yaz(plan, c.sa, a, surum)).statusCode, 409);
    assert.ok((await acilistaki(s.id)).hareketler.some((h) => h.metin.includes('ödeme planı güncellendi: 2026-10-07 5 TRY, 2026-12-01 15.50 TRY')));
    assert.deepEqual(ileti(await yaz([plan[1], plan[0]])), [422, 'Avans satırları vadeli satırlardan önce gelir.']);
    assert.equal((await yaz([{ ...plan[0], tutar: '0' }])).statusCode, 400);
    assert.equal((await yaz([{ ...plan[0], yontem: 'ciro' }])).statusCode, 400);
    assert.equal((await yaz([], c.sa)).statusCode, 400);
    assert.deepEqual(ileti(await yaz(plan, c.sa, randomUUID())), [422, ILETILER.planSiparisYok]);
    const onayda = await kararli();
    const onaydaYaz = await istek(c.sa, 'POST', `/satin-alma-talepleri/${onayda.id}/odeme-plani`, { teklifId: onayda.teklifler[0]!.id, satirlar: plan, surum: onayda.surum });
    assert.deepEqual(ileti(onaydaYaz), [422, ILETILER.planSiparisDurumu]);
    // Okuyan (müdür) görür, yazamaz; talep eden ne görür ne yazar.
    tamam(await takip(c.mudur));
    assert.equal((await yaz(plan, c.mudur)).statusCode, 403);
    assert.equal((await takip(c.talep)).statusCode, 403);
    assert.equal((await yaz(plan, c.talep)).statusCode, 403);

    // Fatura finansta girilir ve siparişe bağlanır: takipte no, tarih ve vade görünür; plan değişmez; beklenen ödemeden düşer.
    const fatura = tamam<{ belge: { id: number } }>(await istek(c.yonetici, 'POST', '/finans/belgeler/ekle', {
      yon: 'gider', kategori: 'mal_alimi', firmaId: firmaA, belgeNo: 'DN-P1', belgeTarihi: '2026-10-09', vade: '2026-11-09', tutar: 100, kdvOrani: 20,
    })).belge.id;
    tamam(await istek(c.sa, 'POST', `/satin-alma-talepleri/${s.id}/siparis-faturasi`, { teklifId: a, belgeId: fatura, bagla: true }));
    assert.deepEqual(siparisi(tamam<SiparisTakibiCevabi>(await takip()), a).faturalar, [{ belgeNo: 'DN-P1', belgeTarihi: '2026-10-09', vade: '2026-11-09' }]);
    assert.deepEqual(ileti(await yaz(plan)), [422, 'Faturası bağlanmış siparişin ödeme planı değişmez; vade faturadadır.']);
    assert.deepEqual(await beklenen(), [[b, '2026-11-07', '90.00', 'Deneme Tedarik B', 'TRY']]);
  });

  test('SAT-74 #1124: avanslı teklifte plan avans ve kalan olarak kurulur; kalan beklenen teslimden vade günü sonradır; yeniden kayıt planı değiştirmez', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme' })));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10'], [k2, '2.5']], { avansYuzdesi: '30', vadeGun: 60, iskontoYuzdesi: '10', nakliye: '7', nakliyeDahil: false, digerMasraf: '3' });
    const onayda = tamam<Talep>(await kaydet(c.sa, {
      ...govde(t), durum: 'onayda', teklifler: [a],
      karar: { mod: 'tek', teklifId: a.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
    }));
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [onayKaydi()] }));
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi',
      karar: { ...onayli.karar!, siparisler: [{ teklifId: a.id, siparisNo: '', siparisTarihi: '2026-10-10', beklenenTeslim: '2026-10-20' }] } }));
    // (10 x 10 + 4 x 2.5) x 0.9 + 7 + 3 = 109; avans 32.70, kalan 76.30.
    const plan = async () => tamam<SiparisTakibiCevabi>(await istek(c.sa, 'GET', `/satin-alma-talepleri/${s.id}/siparis-takibi`)).siparisler[0]!.odemePlani;
    assert.deepEqual(await plan(), [{ tur: 'avans', vade: '2026-10-10', yontem: 'banka', tutar: '32.7' }, { tur: 'vade', vade: '2026-12-19', yontem: 'banka', tutar: '76.3' }]);
    tamam(await kaydet(c.sa, { ...govde(s), karar: { ...s.karar!, siparisler: [{ teklifId: a.id, siparisNo: 'L-9', siparisTarihi: '2026-10-11', beklenenTeslim: '2026-10-25' }] } }));
    assert.deepEqual((await plan()).map((x) => x.vade), ['2026-10-10', '2026-12-19']);
  });

  test('#489 pano: onay bekleyen onaylayana, açık talep ve teslim bekleyen satır yazana, açık sipariş okuyana sayılır; yetkisiz sayı null', async () => {
    const ozet = async (cerez: string) => tamam<SatinAlmaOzetiCevabi>(await istek(cerez, 'GET', '/satin-alma/ozet'));
    const [sa0, md0] = [await ozet(c.sa), await ozet(c.mudur)];
    assert.equal(sa0.onayBekleyen, null);
    assert.deepEqual(await ozet(c.operator), { onayBekleyen: null, acikTalep: null, teslimBekleyenSatir: null, acikSiparis: null, acikSiparisTutari: null });
    assert.deepEqual(await ozet(c.talep), { onayBekleyen: null, acikTalep: null, teslimBekleyenSatir: null, acikSiparis: null, acikSiparisTutari: null });
    // Depo mal kabulü stokta yapar: yalnız teslim bekleyen satır sayısını görür.
    const depo = await ozet(c.depo);
    assert.deepEqual({ ...depo, teslimBekleyenSatir: null }, { onayBekleyen: null, acikTalep: null, teslimBekleyenSatir: null, acikSiparis: null, acikSiparisTutari: null });
    assert.equal(depo.teslimBekleyenSatir, sa0.teslimBekleyenSatir);

    const t = await kararli();
    assert.equal((await ozet(c.mudur)).onayBekleyen, md0.onayBekleyen! + 1);
    assert.equal((await ozet(c.sa)).acikTalep, sa0.acikTalep! + 1);
    // Onaylanıp sipariş bekleyen talep onay beklemez.
    tamam(await kaydet(c.mudur, { ...govde(t), onaylar: [onayKaydi()] }));
    assert.equal((await ozet(c.mudur)).onayBekleyen, md0.onayBekleyen);

    const { s, a } = await bolunmusSiparis();
    let o = await ozet(c.sa);
    assert.deepEqual([o.acikSiparis, o.teslimBekleyenSatir, o.acikTalep], [sa0.acikSiparis! + 2, sa0.teslimBekleyenSatir! + 2, sa0.acikTalep! + 1]);
    assert.equal((await ozet(c.mudur)).acikSiparis, sa0.acikSiparis! + 2);
    // Açık sipariş tutarı TL: A siparişi 4 x 5, B siparişi 10 x 9 (iskonto, nakliye ve masraf sıfır).
    const tutar = (x: SatinAlmaOzetiCevabi) => Number(x.acikSiparisTutari);
    assert.equal(tutar(o) - tutar(sa0), 110);
    // Kısmi teslim satırı açık tutar; tamamı gelince satır ve sipariş kapanır.
    const satirA = siparisi(s, a).satirlar[0]!.id;
    await teslimEt(satirA, '3', 7301);
    assert.equal((await ozet(c.sa)).teslimBekleyenSatir, sa0.teslimBekleyenSatir! + 2);
    await teslimEt(satirA, '1', 7302);
    o = await ozet(c.sa);
    assert.deepEqual([o.acikSiparis, o.teslimBekleyenSatir], [sa0.acikSiparis! + 1, sa0.teslimBekleyenSatir! + 1]);
    assert.equal(tutar(o) - tutar(sa0), 90);
    assert.equal((await app.inject({ method: 'GET', url: '/api/satin-alma/ozet' })).statusCode, 401);
  });

  test('#544 mal kabul listesi: teslimi tamamlanan satır açık siparişlerden düşer, kısmi kalır; kimlikle okunan satır yine gelir; geri alma satırı geri getirir', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const satirA = siparisi(s, a).satirlar[0]!.id, satirB = siparisi(s, b).satirlar[0]!.id;
    const acik = async () => new Set((await vt().tx((db) => siparisSatirlari(db))).map((r) => r.id));
    await teslimEt(satirA, '4', 7601);
    await teslimEt(satirB, '3', 7602);
    let l = await acik();
    assert.deepEqual([l.has(satirA), l.has(satirB)], [false, true]);
    assert.deepEqual((await vt().tx((db) => siparisSatirlari(db, [satirA]))).map((r) => r.id), [satirA]);
    await geriAl(7601);
    l = await acik();
    assert.equal(l.has(satirA), true);
  });

  test('denetim #18: mal kabule giden sipariş satırı kalan miktarı da taşır (sipariş - net teslim, eksiye inmez)', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const satirA = siparisi(s, a).satirlar[0]!.id, satirB = siparisi(s, b).satirlar[0]!.id;
    const kalan = async () => new Map((await vt().tx((db) => siparisSatirlari(db, [satirA, satirB]))).map((r) => [r.id, [r.miktar, r.kalanMiktar]]));
    assert.deepEqual(await kalan(), new Map([[satirA, ['4', '4']], [satirB, ['10', '10']]]));
    await teslimEt(satirB, '2.5', 7651);
    await teslimEt(satirA, '5', 7652);
    assert.deepEqual(await kalan(), new Map([[satirA, ['4', '0']], [satirB, ['10', '7.5']]]));
    await geriAl(7651);
    assert.deepEqual((await kalan()).get(satirB), ['10', '10']);
  });

  test('891 takvim: siparişi verilmiş talebin siparişleri beklenen teslim gününde gelir; tamamı teslim alınan biter, aralık dışı gelmez', async () => {
    const { s: ilk, a, b } = await bolunmusSiparis();
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(ilk), karar: { ...ilk.karar!, siparisler: ilk.karar!.siparisler.map((y) => ({ ...y, beklenenTeslim: y.teklifId === a ? '2031-03-10' : '2031-03-12' })) } }));
    const noA = siparisi(s, a).no!, noB = siparisi(s, b).no!;
    await teslimEt(siparisi(s, b).satirlar[0]!.id, '10', 8911);
    const oku = async (bas: string, son: string) => (await vt().tx((db) => takvimKayitlari(db, bas, son))).filter((x) => x.no === noA || x.no === noB);
    const l = await oku('2031-03-01', '2031-03-31');
    assert.deepEqual(l.map((x) => [x.kaynak, x.tarih, x.no, x.baslik, x.durum, x.bitti]), [
      ['satin-alma', '2031-03-10', noA, `Sipariş ${noA}`, 'Bekleniyor', false],
      ['satin-alma', '2031-03-12', noB, `Sipariş ${noB}`, 'Teslim alındı', true],
    ]);
    assert.ok(l.every((x) => x.ilgili !== null));
    assert.deepEqual((await oku('2031-03-11', '2031-03-31')).map((x) => x.no), [noB]);
  });

  test('#542 dış operasyonlar: liste üretim emirlerinin açık fason iş emirlerinden gelir ve hazırdır; okuyan ve yazan görür, talep eden 403; sipariş satırının iş emri bağı boş olabilir, olmayan iş emrine bağlanamaz', async () => {
    assert.deepEqual(tamam(await istek(c.sa, 'GET', '/satin-alma-dis-operasyonlar')), { hazir: true, operasyonlar: [] });
    assert.equal((await istek(c.mudur, 'GET', '/satin-alma-dis-operasyonlar')).statusCode, 200);
    assert.equal((await istek(c.talep, 'GET', '/satin-alma-dis-operasyonlar')).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/satin-alma-dis-operasyonlar' })).statusCode, 401);

    const { s, a } = await bolunmusSiparis();
    const satir = siparisi(s, a).satirlar[0]!.id;
    const bag = (isEmriId: number | null) => ortam!.sahip.tx((db) => db.sorgu('UPDATE satin_alma_siparis_satiri SET is_emri_id = $2 WHERE id = $1', [satir, isEmriId]));
    await bag(null);
    await assert.rejects(bag(2147483000), kisitla('satin_alma_siparis_satiri_is_emri'));
  });

  test('143 a: satın alma sipariş satırına bağlı iş emri silinmez (bağımlı kayıt); bağ kaldırılınca silinir', async () => {
    const { s, a } = await bolunmusSiparis();
    const satir = siparisi(s, a).satirlar[0]!.id;
    const emir = await emirAc();
    const tip = (await ortam!.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
    const ie = (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, 1, 10, $2, 'Deneme fason') RETURNING id", [emir, tip]))!.id;
    const bag = (isEmriId: number | null) => ortam!.sahip.tx((db) => db.sorgu('UPDATE satin_alma_siparis_satiri SET is_emri_id = $2 WHERE id = $1', [satir, isEmriId]));
    // Üretim emirlerinin bekleyen iş emrini silen sorgusuyla aynı komut, uygulama rolüyle.
    const sil = () => vt().tx((db) => db.sorgu("DELETE FROM uretim_emirleri_is_emri WHERE id = $1 AND durum = 'bekliyor'", [ie]));
    await bag(ie);
    await assert.rejects(sil(), kisitla('satin_alma_siparis_satiri_is_emri'));
    assert.equal((await ortam!.sahip.tek<{ is_emri_id: number | null }>('SELECT is_emri_id FROM satin_alma_siparis_satiri WHERE id = $1', [satir]))?.is_emri_id, ie);
    await bag(null);
    await sil();
    assert.equal(await ortam!.sahip.tek('SELECT id FROM uretim_emirleri_is_emri WHERE id = $1', [ie]), null);
  });

  test('197 a: iş emrinin fason tutarı bağlı sipariş satırlarından, para birimi başına, iskontolu ve KDV hariç; iptal talep sayılmaz', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const satirA = siparisi(s, a).satirlar[0]!.id;
    const satirB = siparisi(s, b).satirlar[0]!.id;
    const emir = await emirAc();
    const tip = (await ortam!.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
    const isEmri = async (sira: number) => (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, $2, $3, $4, 'Deneme fason') RETURNING id",
      [emir, sira, sira * 10, tip]))!.id;
    const [ie, bos] = [await isEmri(1), await isEmri(2)];
    await ortam!.sahip.tx((db) => db.sorgu('UPDATE satin_alma_siparis_satiri SET is_emri_id = $2 WHERE id = ANY($1::int[])', [[satirA, satirB], ie]));
    const oku = () => vt().tx((db) => isEmriFasonTutarlari(db, [ie, bos, ie]));
    // A: 4 x 5, B: 10 x 9; ikisi de TRY.
    assert.deepEqual([...(await oku())], [[ie, [{ tutar: '110.00', paraBirimi: 'TRY' }]]]);
    await ortam!.sahip.tx(async (db) => {
      await db.sorgu("UPDATE satin_alma_teklif SET iskonto_yuzdesi = 10, nakliye = 7, nakliye_dahil = false, diger_masraf = 3 WHERE talep_id = $1 AND id = $2", [s.id, a]);
      await db.sorgu("UPDATE satin_alma_teklif SET para_birimi = 'USD', kur = 30 WHERE talep_id = $1 AND id = $2", [s.id, b]);
    });
    // İskonto satıra düşer; nakliye ve diğer masraf teklif başınadır, iş emrine dağıtılmaz.
    assert.deepEqual([...(await oku())], [[ie, [{ tutar: '18.00', paraBirimi: 'TRY' }, { tutar: '90.00', paraBirimi: 'USD' }]]]);
    assert.equal((await vt().tx((db) => isEmriFasonTutarlari(db, []))).size, 0);
    tamam<Talep>(await kaydet(c.sa, { ...govde(await acilistaki(s.id)), durum: 'iptal', iptalNedeni: 'Deneme' }));
    assert.equal((await oku()).size, 0);
  });

  test('SH1: teslim geçersiz miktarı, olmayan satırı ve siparişte olmayan talebi reddeder; aynı mal kabul satırı ikinci kez yazılmaz; kayıt değişmez', async () => {
    const { s, a } = await bolunmusSiparis();
    const satirA = siparisi(s, a).satirlar[0]!.id;
    for (const m of ['0', '-1', 'bir']) await assert.rejects(teslimEt(satirA, m, 7201), hataKodu('GECERSIZ'));
    await assert.rejects(teslimEt(2147483000, '1', 7201), hataKodu('GECERSIZ'));
    await teslimEt(satirA, '1', 7201);
    await assert.rejects(teslimEt(satirA, '1', 7201), hataKodu('CAKISMA'));
    await geriAl(7201);
    await assert.rejects(geriAl(7201), hataKodu('GECERSIZ'));
    await teslimEt(satirA, '2', 7201);
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu('UPDATE satin_alma_teslim SET miktar = 9 WHERE mal_kabul_satiri_id = 7201')), /yalnız ekleme/);
    const ip = tamam<Talep>(await kaydet(c.sa, { ...govde(await acilistaki(s.id)), durum: 'iptal', iptalNedeni: 'Deneme' }));
    assert.equal(ip.durum, 'iptal');
    await assert.rejects(teslimEt(satirA, '1', 7202), hataKodu('GECERSIZ'));
  });

  test('SAT-63: hareket kaydı yalnız eklenir; kişisi ve zamanı sunucunun; eski hareket kayıtla değişmez, silinmez', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const ilk = t.hareketler[0]!;
    const yeni = { id: randomUUID(), zaman: '2020-01-01T00:00:00.000Z', kisiId: kisi.mudur!, kisiAdi: null, metin: 'Başlık değişti' };
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(t), baslik: 'Yeni başlık', hareketler: [{ ...ilk, metin: 'Değiştirilmiş' }, yeni] }));
    assert.deepEqual(s.hareketler.map((h) => [h.id, h.metin, h.kisiId]), [[ilk.id, 'Talep açıldı', kisi.sa], [yeni.id, 'Başlık değişti', kisi.sa]]);
    assert.ok(s.hareketler[1]!.zaman.startsWith(await bugun()), s.hareketler[1]!.zaman);
    const bos = tamam<Talep>(await kaydet(c.sa, { ...govde(s), notlar: 'Geçmişsiz kayıt', hareketler: [] }));
    assert.deepEqual(bos.hareketler.map((h) => h.id), [ilk.id, yeni.id]);
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu("UPDATE satin_alma_hareket SET metin = 'x' WHERE talep_id = $1", [t.id])), /yalnız ekleme/);
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu('DELETE FROM satin_alma_hareket WHERE talep_id = $1', [t.id])), /yalnız ekleme/);
  });

  test('SAT-68: iptal geri çevrilir (önceki duruma dönülür); silinen taslak aynı içerikle yeni kimlikle yeniden yazılır', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme' })));
    const ip = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'iptal', iptalNedeni: 'Yanlışlıkla' }));
    assert.equal(ip.durum, 'iptal');
    const geri = tamam<Talep>(await kaydet(c.sa, { ...govde(ip), durum: 'degerlendirme', iptalNedeni: '' }));
    assert.deepEqual([geri.durum, geri.iptalNedeni], ['degerlendirme', '']);
    const g = yeniTalep({ baslik: 'Silinip geri gelen', notlar: 'Aynı içerik' });
    const d = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', g));
    tamam(await istek(c.talep, 'POST', `/satin-alma-talepleri/${d.id}/sil`, { surum: d.surum }));
    const y = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', { ...g, id: randomUUID() }));
    assert.notEqual(y.id, d.id);
    assert.deepEqual([y.baslik, y.notlar, y.durum, y.kalemler.map((k) => [k.ad, k.miktar])], [d.baslik, d.notlar, d.durum, d.kalemler.map((k) => [k.ad, k.miktar])]);
  });

  test('SAT-31: ret notsuz eklenemez (satin_alma_onay_ret_notlu); onay kaydı değişmez (yalnız ekleme)', async () => {
    const t = await kararli();
    const ret = { id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'ret' as const, dortGozsuz: false, notlar: '' };
    assert.equal((await kaydet(c.mudur, { ...govde(t), durum: 'degerlendirme', onaylar: [ret] })).statusCode, 422);
    const r = tamam<Talep>(await kaydet(c.mudur, { ...govde(t), durum: 'degerlendirme', onaylar: [{ ...ret, notlar: 'Vade kısa' }] }));
    assert.equal(r.durum, 'degerlendirme');
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu("UPDATE satin_alma_onay SET notlar = 'x' WHERE talep_id = $1", [t.id])), /yalnız ekleme/);
  });

  test('SAT-66 SAT-67: yalnız taslak silinir; karar varken teklif silinmez', async () => {
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    assert.equal((await istek(c.talep2, 'POST', `/satin-alma-talepleri/${t.id}/sil`, { surum: t.surum })).statusCode, 403);
    tamam(await istek(c.talep, 'POST', `/satin-alma-talepleri/${t.id}/sil`, { surum: t.surum }));
    assert.equal((await istek(c.sa, 'POST', `/satin-alma-talepleri/${t.id}/sil`, { surum: 1 })).statusCode, 404);
    const k = await kararli();
    assert.equal((await istek(c.sa, 'POST', `/satin-alma-talepleri/${k.id}/sil`, { surum: k.surum })).statusCode, 422);
    const red = await kaydet(c.sa, { ...govde(k), teklifler: k.teklifler.filter((q) => q.id === k.karar!.teklifId) });
    assert.equal(red.statusCode, 422);
  });

  test('#544 2a: sipariş numarasını TMI verir (SP-yıl-sıra); yeniden kayıtta değişmez; istemci numara yazamaz; eşzamanlı siparişler ayrı numara alır', async () => {
    const onayli = async () => { const t = await kararli(); return tamam<Talep>(await kaydet(c.mudur, { ...govde(t), onaylar: [onayKaydi()] })); };
    const siparisVer = (o: Talep, logo: string, ek: object = {}) => kaydet(c.sa, { ...govde(o), durum: 'siparis_verildi',
      karar: { ...o.karar!, siparisler: [{ teklifId: o.karar!.teklifId!, siparisNo: logo, siparisTarihi: '2026-10-07', beklenenTeslim: null, ...ek }] } });
    const yil = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Istanbul', year: 'numeric' }).format(new Date());
    const s1 = tamam<Talep>(await siparisVer(await onayli(), 'L-1', { no: 'SP-1999-999' }));
    const no = s1.karar!.siparisler[0]!.no!;
    assert.match(no, new RegExp(`^SP-${yil}-[0-9]{3,}$`));
    assert.equal(s1.karar!.siparisler[0]!.siparisNo, 'L-1');
    const s2 = tamam<Talep>(await kaydet(c.sa, { ...govde(s1), notlar: 'Logo numarası değişti',
      karar: { ...s1.karar!, siparisler: [{ ...s1.karar!.siparisler[0]!, siparisNo: 'L-2', no: 'SP-1999-998' } as never] } }));
    assert.deepEqual([s2.karar!.siparisler[0]!.no, s2.karar!.siparisler[0]!.siparisNo], [no, 'L-2']);
    const [a, b] = await Promise.all([onayli(), onayli()]);
    const [ya, yb] = (await Promise.all([siparisVer(a!, ''), siparisVer(b!, '')])).map((r) => tamam<Talep>(r).karar!.siparisler[0]!.no!);
    assert.notEqual(ya, yb);
    const sira = (x: string) => Number(x.split('-')[2]);
    assert.deepEqual([sira(ya!), sira(yb!)].sort((p, q) => p - q), [sira(no) + 1, sira(no) + 2]);
  });

  test('SAT-37 SAT-38: teslim alma bu modülde yok; sipariş satırları stok için fiyatsız açılır, kimliği korunur; teslim alındı yazılamaz', async () => {
    const t = await kararli();
    const o = tamam<Talep>(await kaydet(c.mudur, { ...govde(t), onaylar: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay', dortGozsuz: false, notlar: '' }] }));
    const siparis = { teklifId: t.karar!.teklifId!, siparisNo: 'SA-9', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-14' };
    const s1 = tamam<Talep>(await kaydet(c.sa, { ...govde(o), durum: 'siparis_verildi', karar: { ...o.karar!, siparisler: [siparis] } }));
    const satirlar = s1.karar!.siparisler[0]!.satirlar;
    assert.deepEqual(satirlar.map((r) => [r.miktar, r.birim, r.teslimAlinan]), [['10', 'adet', null], ['4', 'adet', null]]);
    // Depo uçları yok.
    assert.equal((await istek(c.depo, 'GET', '/satin-alma-teslimleri')).statusCode, 404);
    assert.equal((await istek(c.depo, 'POST', '/satin-alma-siparisleri/teslim-al', { talepId: t.id })).statusCode, 404);
    // Stokun mal kabul belgesi için: fiyatsız, talep ve sipariş numaralı.
    const stok = await vt().tx((db) => siparisSatirlari(db, satirlar.map((r) => r.id)));
    assert.deepEqual(stok.map((r) => [r.talepNo, r.siparisNo, r.tedarikciAdi, r.kalemAdi, r.miktar]),
      [[t.no, s1.karar!.siparisler[0]!.no, 'Deneme Tedarik A', 'Deneme rulman', '10'], [t.no, s1.karar!.siparisler[0]!.no, 'Deneme Tedarik A', 'Deneme kayış', '4']]);
    assert.doesNotMatch(JSON.stringify(stok), /birimFiyat|toplam|nakliye|iskonto/);
    assert.ok((await vt().tx((db) => siparisSatirlari(db))).some((r) => r.id === satirlar[0]!.id));
    assert.deepEqual(await vt().tx((db) => siparisSatirlari(db, [])), []);
    // Yeniden kayıtta satır kimliği değişmez (stok buna bağlanır).
    const s2 = tamam<Talep>(await kaydet(c.sa, { ...govde(s1), notlar: 'Not eklendi' }));
    assert.deepEqual(s2.karar!.siparisler[0]!.satirlar.map((r) => r.id), satirlar.map((r) => r.id));
    // "Teslim alındı" istemciyle yazılamaz; mal kabulden türetilir.
    assert.equal((await kaydet(c.sa, { ...govde(s2), durum: 'teslim_alindi' })).statusCode, 422);
    assert.equal(s2.durum, 'siparis_verildi');
  });

  test('SAT-41: kayıtsız aktif tedarikçi firma açılışta firma kartı olarak gelir; teklifle kaydedilince nötr başlangıçla tedarikçi olur ve kartlardan çıkar', async () => {
    const ad = 'Örnek Kartlı Firma';
    const f = tamam<{ firma: { id: number } }>(await istek(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad, tur: 'tedarikci' })).firma.id;
    const once = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis'));
    assert.deepEqual(once.firmaKartlari.find((x) => x.id === f), { id: f, ad });
    assert.equal(once.tedarikciler.some((x) => x.firmaId === f), false);
    assert.equal(once.firmaKartlari.some((x) => x.id === firmaPasif || x.id === firmaMusteri), false);
    const adlar = once.firmaKartlari.map((x) => x.ad);
    assert.deepEqual(adlar, [...adlar].sort((a, b) => a.localeCompare(b, 'tr')));
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const q = teklif(f, [[t.kalemler[0]!.id, '3']], { tedarikciAdi: ad });
    tamam(await kaydet(c.sa, { ...govde(t), durum: 'teklif_isteniyor', teklifler: [q] }));
    const sonra = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis'));
    const ted = sonra.tedarikciler.find((x) => x.firmaId === f)!;
    assert.deepEqual([ted.ad, ted.kaliteDurumu, ted.puan, ted.notlar, ted.kategoriler, ted.degerlendirmeler], [ad, null, 3, '', [], []]);
    assert.equal(sonra.firmaKartlari.some((x) => x.id === f), false);
  });

  test('SAT-41: tedarikçi finansta kayıtlı aktif firmadır ve bir kez eklenir; firma alanları finanstan gelir; yalnız yaz işlemi ekler', async () => {
    const tedarikci = { firmaId: firmaPasif, puan: 3, notlar: '', kategoriler: [], degerlendirmeler: [], surum: null };
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', tedarikci)).statusCode, 422);
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', { ...tedarikci, firmaId: 999999 })).statusCode, 422);
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', { ...tedarikci, firmaId: firmaMusteri })).statusCode, 422);
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', { ...tedarikci, firmaId: firmaA })).statusCode, 409);
    assert.equal((await istek(c.talep, 'POST', '/satin-alma-tedarikcileri/kaydet', { ...tedarikci, firmaId: firmaB })).statusCode, 403);
    const acilis = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis'));
    const a = acilis.tedarikciler.find((x) => x.firmaId === firmaA)!;
    assert.deepEqual([a.ad, a.sehir, a.firmaAktif, typeof a.firmaSurum], ['Deneme Tedarik A', null, true, 'number']);
    const d = tamam<Tedarikci>(await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', {
      firmaId: firmaA, puan: 5, notlar: 'İyi', kategoriler: ['Bakım', 'Rulman'],
      degerlendirmeler: [{ id: randomUUID(), tarih: '2026-10-07', puan: 5, metin: 'Zamanında', degerlendiren: 'Deneme Değerlendiren' }], surum: a.surum,
    }));
    assert.deepEqual([d.puan, d.kategoriler, d.degerlendirmeler[0]?.kisiAdi], [5, ['Bakım', 'Rulman'], 'Deneme satinalma']);
    // Kategoriler girildiği sırayla döner (alfabetik değil).
    const ters = tamam<Tedarikci>(await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', { firmaId: firmaA, puan: 5, notlar: '', kategoriler: ['Rulman', 'Bakım'], degerlendirmeler: [], surum: d.surum }));
    assert.deepEqual(ters.kategoriler, ['Rulman', 'Bakım']);
  });

  test('SAT-41: firma finanstan adla aranıp seçilir; yalnız aktif tedarikçi firmalar gelir, tedarikçi olanlar işaretli; arama yaz işlemi ister', async () => {
    const r = tamam<FirmaSecenekleriCevabi>(await istek(c.sa, 'GET', '/satin-alma-firma-secenekleri?ara=deneme'));
    assert.deepEqual(r.firmalar.map((f) => [f.id, f.tedarikci]), [[firmaA, true], [firmaB, true]]);
    assert.equal((await istek(c.talep, 'GET', '/satin-alma-firma-secenekleri?ara=deneme')).statusCode, 403);
    assert.equal((await istek(c.sa, 'GET', '/satin-alma-firma-secenekleri?ara=d')).statusCode, 400);
  });

  test('SAT-42: teklifte kullanılan tedarikçi silinmez', async () => {
    await kararli();
    const r = await istek(c.sa, 'POST', `/satin-alma-tedarikcileri/${firmaA}/sil`);
    assert.equal(r.statusCode, 409);
    // Modülün kendi iletisi döner (çekirdeğin genel "bağlı kayıt" iletisi değil).
    assert.equal((r.json() as { mesaj: string }).mesaj, ILETILER.bagliKayit);
  });

  test('SAT-41 SA1: firma alanları finansın kaydından gelir; finansta pasifleşen firma açılışta pasif görünür', async () => {
    const f = tamam<{ firma: { id: number; surum: number } }>(await istek(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', {
      ad: 'Deneme Sonra Pasif', tur: 'tedarikci', vergiNo: '1234567890', il: 'Deneme İli', telefon: '000 000 00 00', ePosta: 'deneme@ornek.test',
    })).firma;
    tamam<Tedarikci>(await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', { firmaId: f.id, puan: 3, notlar: '', kategoriler: [], degerlendirmeler: [], surum: null }));
    tamam(await istek(c.yonetici, 'POST', `/finans/firmalar/${f.id}/pasif`, { surum: f.surum }));
    const t = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).tedarikciler.find((x) => x.firmaId === f.id)!;
    assert.deepEqual([t.ad, t.vergiNo, t.sehir, t.telefon, t.eposta, t.yetkili, t.firmaAktif], ['Deneme Sonra Pasif', '1234567890', 'Deneme İli', '000 000 00 00', 'deneme@ornek.test', null, false]);
    assert.equal(t.firmaSurum, f.surum + 1);
  });

  test('SAT-41 S5 a: pasif firmayla yeni teklif, firması pasife değişen teklif ve tedarikçi olamayan firmayla teklif 422 alır; aktif firmayla teklif kaydedilir', async () => {
    const pasif = await tedarikciFirma('Deneme Teklif Pasif A');
    await pasif.pasifle();
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const k1 = t.kalemler[0]!.id;
    const a = teklif(firmaA, [[k1, '10']]);
    const kayitli = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a] }));
    const yeni = await kaydet(c.sa, { ...govde(kayitli), teklifler: [...kayitli.teklifler, teklif(pasif.id, [[k1, '9']])] });
    assert.deepEqual([yeni.statusCode, yeni.json().mesaj], [422, ILETILER.firmaPasif]);
    const degisen = await kaydet(c.sa, { ...govde(kayitli), teklifler: [{ ...kayitli.teklifler[0]!, firmaId: pasif.id }] });
    assert.deepEqual([degisen.statusCode, degisen.json().mesaj], [422, ILETILER.firmaPasif]);
    // Tedarikçi kaydı olmayan müşteri firması da tedarikçi olamaz.
    assert.equal((await kaydet(c.sa, { ...govde(kayitli), teklifler: [...kayitli.teklifler, teklif(firmaMusteri, [[k1, '9']])] })).statusCode, 422);
    const kalan = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.find((x) => x.id === t.id)!;
    assert.deepEqual(kalan.teklifler.map((q) => q.firmaId), [firmaA]);
    const aktif = tamam<Talep>(await kaydet(c.sa, { ...govde(kayitli), teklifler: [...kayitli.teklifler, teklif(firmaB, [[k1, '9']])] }));
    assert.deepEqual(aktif.teklifler.map((q) => q.firmaId), [firmaA, firmaB]);
    // Açılışta da aynı kural: pasif firmayla yeni teklifli talep açılmaz.
    const t2 = yeniTalep({ durum: 'degerlendirme' });
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', { ...t2, teklifler: [teklif(pasif.id, [[t2.kalemler[0]!.id, '9']])] })).statusCode, 422);
  });

  test('SAT-41 S5 a: eski teklifin sonradan pasifleşen firması korunur; aynı talep yeniden kaydedilince eski teklif reddedilmez, o firmayla yeni teklif reddedilir', async () => {
    const firma = await tedarikciFirma('Deneme Teklif Pasif B');
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const k1 = t.kalemler[0]!.id;
    const kayitli = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [teklif(firma.id, [[k1, '10']])] }));
    await firma.pasifle();
    const not = tamam<Talep>(await kaydet(c.sa, { ...govde(kayitli), notlar: 'Firma pasifleştikten sonra yeniden kayıt' }));
    assert.deepEqual([not.notlar, not.teklifler.map((q) => q.firmaId), not.teklifler[0]?.fiyatlar.length], ['Firma pasifleştikten sonra yeniden kayıt', [firma.id], 1]);
    const fiyat = tamam<Talep>(await kaydet(c.sa, { ...govde(not), teklifler: [{ ...not.teklifler[0]!, fiyatlar: [{ kalemId: k1, birimFiyat: '11' }] }] }));
    assert.equal(fiyat.teklifler[0]?.fiyatlar[0]?.birimFiyat, '11');
    assert.equal((await kaydet(c.sa, { ...govde(fiyat), teklifler: [...fiyat.teklifler, teklif(firma.id, [[k1, '8']])] })).statusCode, 422);
  });

  test('BR1: talep birimi ayarlardaki listede olmalı; listedeki birim ve boş birim geçer, listede olmayan 422 ve açık ileti alır, talep açılmaz ya da kaydedilmez', async () => {
    const a = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).ayarlar;
    tamam(await istek(c.sa, 'POST', '/satin-alma-ayarlari/kaydet', {
      ...a, kurlar: a.kurlar.map(({ paraBirimi, aylikFaizYuzdesi }) => ({ paraBirimi, aylikFaizYuzdesi })),
      birimler: [...a.birimler, { ad: 'Deneme Birim', yillikButce: '0' }],
    }));
    // Birim kısıtı veritabanında da durur (savunma); ileti ise sunucunun kendi denetiminden gelir.
    const [kisit] = await ortam!.sahip.tx((db) => db.sorgu<{ ad: string }>(
      "SELECT conname AS ad FROM pg_constraint WHERE conrelid = 'satin_alma_talep'::regclass AND contype = 'f' AND confrelid = 'satin_alma_birim'::regclass"));
    assert.equal(kisit?.ad, 'satin_alma_talep_birim_fkey');
    const listede = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ birim: 'Deneme Birim' })));
    assert.equal(listede.birim, 'Deneme Birim');
    const yok = yeniTalep({ birim: 'Olmayan Birim' });
    const red = await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yok);
    assert.deepEqual([red.statusCode, red.json().mesaj], [422, ILETILER.birimYok('Olmayan Birim')]);
    assert.equal(ILETILER.birimYok('Olmayan Birim'), "Birim listede yok: Olmayan Birim. Ayarlar'dan ekleyin ya da listeden seçin.");
    assert.equal(tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.some((x) => x.id === yok.id), false);
    // Kayıtta da aynı: listedeki birimden boşa ve listedeki başka birime geçilir, listede olmayana geçilemez.
    const redKayit = await kaydet(c.talep, { ...govde(listede), birim: 'Olmayan Birim' });
    assert.deepEqual([redKayit.statusCode, redKayit.json().mesaj], [422, ILETILER.birimYok('Olmayan Birim')]);
    const bos = tamam<Talep>(await kaydet(c.talep, { ...govde(listede), birim: null }));
    assert.equal(bos.birim, null);
    assert.equal(tamam<Talep>(await kaydet(c.talep, { ...govde(bos), birim: 'Deneme Birim' })).birim, 'Deneme Birim');
  });

  test('tekrar koruması: talep açma ve katalog kaydı aynı kimlikle yinelenince ilk cevap döner, ikinci kez yazılmaz; kimliksiz 400', async () => {
    const talep = yeniTalep();
    const kimlik = randomUUID();
    const ilk = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', talep, kimlik));
    const ikinci = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', talep, kimlik));
    assert.deepEqual([ikinci.id, ikinci.no], [ilk.id, ilk.no]);
    assert.equal((await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', talep)).statusCode, 409);
    assert.equal((await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep(), null)).statusCode, 400);

    const kalemi = { id: randomUUID(), malzemeNo: await kartNo('HM-SAT-00001'), ozellik: '', notlar: '', takmaAdlari: [], surum: null };
    const kk = randomUUID();
    const k1 = tamam<KatalogKaydi>(await istek(c.talep, 'POST', '/satin-alma-katalogu/kaydet', kalemi, kk));
    assert.equal(tamam<KatalogKaydi>(await istek(c.talep, 'POST', '/satin-alma-katalogu/kaydet', kalemi, kk)).kod, k1.kod);
    assert.equal((await istek(c.talep, 'POST', '/satin-alma-katalogu/kaydet', { ...kalemi, id: randomUUID() }, null)).statusCode, 400);
  });

  test('SAT-58 SA2 SAT-59: katalog kalemi malzeme kartına bağlanır, kod, ad ve birim karttan; olmayan ya da aktif olmayan kart bağlanmaz; düzenleme satın almanın; kullanılan silinmez', async () => {
    const no = await kartNo('HM-SAT-00002');
    const yeni = { id: randomUUID(), malzemeNo: no, ozellik: '', notlar: '', takmaAdlari: ['iş eldiveni'], surum: null };
    const k = tamam<KatalogKaydi>(await istek(c.talep, 'POST', '/satin-alma-katalogu/kaydet', yeni));
    assert.deepEqual([k.kod, k.ad, k.birim, k.malzemeNo, k.takmaAdlari], ['HM-SAT-00002', 'Deneme eldiven', 'çift', no, ['iş eldiveni']]);
    assert.equal((await secenek('HM-SAT-00002')).katalogId, k.id);
    assert.equal((await istek(c.talep, 'POST', '/satin-alma-katalogu/kaydet', { ...yeni, notlar: 'Değişti', surum: k.surum })).statusCode, 403);
    const d = tamam<KatalogKaydi>(await istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', { ...yeni, notlar: 'Deneme not', surum: k.surum }));
    assert.equal(d.notlar, 'Deneme not');
    const yok = await istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', { ...yeni, id: randomUUID(), malzemeNo: 999999 });
    assert.deepEqual([yok.statusCode, yok.json().mesaj], [400, ILETILER.kartYok]);
    assert.match(ILETILER.kartYok, /^Malzeme kartı bulunamadı; yeni kart ".+" sayfasında açılır.$/);
    const taslak = await istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', { ...yeni, id: randomUUID(), malzemeNo: await kartNo('HM-SAT-00003', false) });
    assert.deepEqual([taslak.statusCode, taslak.json().mesaj], [400, 'Kataloğa yalnız aktif malzeme kartı bağlanır.']);
    tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ kalemler: [{ ...kalem('Deneme eldiven'), katalogId: k.id, birim: 'çift' }] })));
    assert.equal((await istek(c.sa, 'POST', `/satin-alma-katalogu/${k.id}/sil`, { surum: d.surum })).statusCode, 409);
    // Bağ zorunludur: sütun dolu ve malzeme kartına yabancı anahtarlı (SA2 b).
    const [sutun] = await ortam!.sahip.tx((db) => db.sorgu<{ tur: string; bos: string }>(
      "SELECT data_type AS tur, is_nullable AS bos FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'satin_alma_katalog' AND column_name = 'malzeme_no'"));
    assert.deepEqual(sutun, { tur: 'integer', bos: 'NO' });
  });

  test('SAT-71: ikinci menü sayaçları yetkiye göre süzülür; yetkisiz ve hesaplanmayan madde boş döner', async () => {
    await kararli();
    const sa = tamam<Record<string, number | null>>(await istek(c.sa, 'GET', '/satin-alma-menu-sayaclari'));
    assert.ok((sa.talepler ?? 0) > 0 && (sa.tedarikciler ?? 0) >= 2);
    assert.deepEqual([sa.onaylar, sa['is-kutusu'], sa.raporlar], [null, null, null]);
    const talep = tamam<Record<string, number | null>>(await istek(c.talep, 'GET', '/satin-alma-menu-sayaclari'));
    assert.deepEqual([talep.talepler, talep.malzemeler, talep.onaylar], [null, null, null]);
    assert.equal('taleplerim' in talep, false);
    const mudur = tamam<Record<string, number | null>>(await istek(c.mudur, 'GET', '/satin-alma-menu-sayaclari'));
    assert.ok((mudur.onaylar ?? 0) >= 1);
    assert.deepEqual(Object.values(tamam<Record<string, number | null>>(await istek(c.operator, 'GET', '/satin-alma-menu-sayaclari'))).every((x) => x === null), true);
  });

  test('SAT-69: ayarlar satin-alma.ayar ister; kurlar, kategoriler, birimler ve onay limitleri kaydedilir; sürüm korunur', async () => {
    const a = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).ayarlar;
    const g = {
      sirket: 'Deneme A.Ş.', agirliklar: { maliyet: 50, termin: 20, tedarikci: 20, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 3,
      fiyatUyariYuzdesi: '10',
      kurlar: [{ paraBirimi: 'TRY', aylikFaizYuzdesi: '3.5' }, { paraBirimi: 'USD', aylikFaizYuzdesi: '0' }],
      kategoriler: ['Bakım', 'Ambalaj'], birimler: [{ ad: 'Bakım', yillikButce: '500000' }],
      onayLimitleri: [{ azamiTutar: '50000', seviye: 'Satın alma uzmanı' }, { azamiTutar: null, seviye: 'Genel müdür' }], surum: a.surum,
    };
    assert.equal((await istek(c.mudur, 'POST', '/satin-alma-ayarlari/kaydet', g)).statusCode, 403);
    const y = tamam<Ayarlar>(await istek(c.sa, 'POST', '/satin-alma-ayarlari/kaydet', g));
    assert.deepEqual([y.sirket, y.kurlar.map((k) => k.paraBirimi), y.kategoriler, y.onayLimitleri.length, y.surum], ['Deneme A.Ş.', ['TRY', 'USD'], ['Bakım', 'Ambalaj'], 2, a.surum + 1]);
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-ayarlari/kaydet', g)).statusCode, 409);
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu("INSERT INTO satin_alma_kur (para_birimi) VALUES ('JPY')")), kisitla('satin_alma_kur_kod'));
  });

  test('SAT-77: kg fiyatını satın alma girer; liste kalite + form başına güncel fiyatı verir, ileri tarihli fiyat güncel sayılmaz; geçmiş silinmez', async () => {
    const g = await bugun();
    const yarin = (await vt().tx((db) => db.tek<{ g: string }>("SELECT (current_date + 1)::text AS g")))!.g;
    const satir = (kaliteKodu: string, form: string | null, kgFiyati: string, gecerlilik = g, paraBirimi = 'TRY') =>
      ({ kaliteKodu, form, kgFiyati, paraBirimi, gecerlilik, aciklama: '' });
    const ekle = (cerez: string, satirlar: unknown[]) => istek(cerez, 'POST', '/satin-alma-kg-fiyatlari/ekle', { satirlar });
    const liste = async (cerez = c.sa) => tamam<KgFiyatlariCevabi>(await istek(cerez, 'GET', '/satin-alma-kg-fiyatlari')).fiyatlar
      .filter((f) => f.kaliteKodu.startsWith('DENEME-'));
    const ozet = (l: KgFiyatlariCevabi['fiyatlar']) => l.map((f) => [f.kaliteKodu, f.form, Number(f.kgFiyati), f.paraBirimi, f.gecerlilik]);

    tamam(await ekle(c.sa, [satir('DENEME-AL', 'cubuk', '100'), satir('DENEME-AL', null, '90'), satir('DENEME-AL', 'cubuk', '120', yarin)]));
    assert.deepEqual(ozet(await liste()), [['DENEME-AL', null, 90, 'TRY', g], ['DENEME-AL', 'cubuk', 100, 'TRY', g]]);
    const ilk = (await liste())[1]!;
    assert.equal(ilk.kisiAdi, 'Deneme satinalma');
    assert.equal(Number(ilk.tryKgFiyati), 100);
    // Aynı güne yeni giriş öncekinin yerine geçer; eski giriş geçmişte kalır (ileri tarihli dahil, yeniden eskiye).
    tamam(await ekle(c.sa, [satir('DENEME-AL', 'cubuk', '110.5')]));
    assert.deepEqual(ozet(await liste()).map((x) => x[2]), [90, 110.5]);
    const gecmis = tamam<KgFiyatiGecmisiCevabi>(await istek(c.mudur, 'GET', '/satin-alma-kg-fiyatlari/gecmis?kalite=DENEME-AL&form=cubuk')).girisler;
    assert.deepEqual(gecmis.map((x) => Number(x.kgFiyati)), [120, 110.5, 100]);
    const genel = tamam<KgFiyatiGecmisiCevabi>(await istek(c.mudur, 'GET', '/satin-alma-kg-fiyatlari/gecmis?kalite=DENEME-AL')).girisler;
    assert.deepEqual(genel.map((x) => [x.form, Number(x.kgFiyati)]), [[null, 90]]);
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu("UPDATE satin_alma_kg_fiyati SET kg_fiyati = 1 WHERE kalite_kodu = 'DENEME-AL'")), /yalnız ekleme/);
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu("DELETE FROM satin_alma_kg_fiyati WHERE kalite_kodu = 'DENEME-AL'")), /yalnız ekleme/);
  });

  test('1352 a: işlem ve aracı katsayısı girişle yazılır ve geçmişte kalır; etkin kg fiyatı ikisi de yazılıysa çarpımdır, biri boşsa boş', async () => {
    const g = await bugun();
    const satir = (form: string, ek: Record<string, unknown>) => ({ kaliteKodu: 'DENEME-KAT', form, kgFiyati: '100', paraBirimi: 'TRY', gecerlilik: g, ...ek });
    tamam(await istek(c.sa, 'POST', '/satin-alma-kg-fiyatlari/ekle', { satirlar: [
      satir('cubuk', { islemKatsayisi: '1.15', araciKatsayisi: '1.05' }), satir('levha', { islemKatsayisi: '1.2' }), satir('boru', {}),
    ] }));
    const l = tamam<KgFiyatlariCevabi>(await istek(c.mudur, 'GET', '/satin-alma-kg-fiyatlari')).fiyatlar.filter((f) => f.kaliteKodu === 'DENEME-KAT');
    assert.deepEqual(l.map((f) => [f.form, f.islemKatsayisi, f.araciKatsayisi, f.etkinKgFiyati === null ? null : Number(f.etkinKgFiyati)]), [
      ['boru', null, null, null], ['cubuk', '1.15', '1.05', 120.75], ['levha', '1.2', null, null],
    ]);
    // Katsayı maliyet hesabına girmez: TL karşılığı ham kg fiyatından.
    assert.equal(Number(l.find((f) => f.form === 'cubuk')!.tryKgFiyati), 100);
    tamam(await istek(c.sa, 'POST', '/satin-alma-kg-fiyatlari/ekle', { satirlar: [satir('cubuk', { kgFiyati: '110', islemKatsayisi: '1.1' })] }));
    const gecmis = tamam<KgFiyatiGecmisiCevabi>(await istek(c.mudur, 'GET', '/satin-alma-kg-fiyatlari/gecmis?kalite=DENEME-KAT&form=cubuk')).girisler;
    assert.deepEqual(gecmis.map((x) => [Number(x.kgFiyati), x.islemKatsayisi, x.araciKatsayisi]), [[110, '1.1', null], [100, '1.15', '1.05']]);
  });

  test('1352 a: bozuk katsayı reddedilir ve hiçbir satır yazılmaz; katsayıyı da yalnız satın almayı yazan girer', async () => {
    const g = await bugun();
    const satir = { kaliteKodu: 'DENEME-KR', form: null, kgFiyati: '5', paraBirimi: 'TRY', gecerlilik: g };
    const ekle = (cerez: string, satirlar: unknown[]) => istek(cerez, 'POST', '/satin-alma-kg-fiyatlari/ekle', { satirlar });
    assert.equal((await ekle(c.mudur, [{ ...satir, islemKatsayisi: '1.1' }])).statusCode, 403);
    for (const bozuk of [{ islemKatsayisi: '0' }, { islemKatsayisi: '-1' }, { araciKatsayisi: '100.5' }, { araciKatsayisi: '1.00001' }, { islemKatsayisi: 'bir' }]) {
      assert.equal((await ekle(c.sa, [satir, { ...satir, ...bozuk }])).statusCode, 400, JSON.stringify(bozuk));
    }
    const sayi = await ortam!.sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM satin_alma_kg_fiyati WHERE kalite_kodu = 'DENEME-KR'");
    assert.equal(sayi?.n, 0);
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu(
      "INSERT INTO satin_alma_kg_fiyati (kalite_kodu, kg_fiyati, para_birimi, gecerlilik, islem_katsayisi, kisi_id) SELECT 'DENEME-KR', 1, 'TRY', current_date, 0, id FROM kisi LIMIT 1")),
    /satin_alma_kg_fiyati_islem_katsayisi/);
  });

  test('SAT-77: kg fiyatının TL karşılığı finansın güncel kurundan; kur yoksa boş (sıfır uydurulmaz)', async () => {
    const g = await bugun();
    const ekle = (kgFiyati: string) => istek(c.sa, 'POST', '/satin-alma-kg-fiyatlari/ekle',
      { satirlar: [{ kaliteKodu: 'DENEME-GBP', form: 'levha', kgFiyati, paraBirimi: 'GBP', gecerlilik: g }] });
    const bul = async () => tamam<KgFiyatlariCevabi>(await istek(c.sa, 'GET', '/satin-alma-kg-fiyatlari')).fiyatlar.find((f) => f.kaliteKodu === 'DENEME-GBP')!;
    tamam(await ekle('2.5'));
    assert.equal((await bul()).tryKgFiyati, null);
    tamam(await istek(c.yonetici, 'POST', '/finans/kurlar/ekle', { paraBirimi: 'GBP', tarih: g, kur: 40 }));
    assert.equal(Number((await bul()).tryKgFiyati), 100);
  });

  test('SAT-77: kg fiyatını yalnız satın almayı yazan girer, okuyan ve maliyet okuyan görür, işlemsiz göremez; geçersiz satır yazılmaz', async () => {
    const g = await bugun();
    const satir = { kaliteKodu: 'DENEME-YT', form: null, kgFiyati: '5', paraBirimi: 'TRY', gecerlilik: g };
    const ekle = (cerez: string, satirlar: unknown[]) => istek(cerez, 'POST', '/satin-alma-kg-fiyatlari/ekle', { satirlar });
    assert.equal((await ekle(c.mudur, [satir])).statusCode, 403);
    assert.equal((await istek(c.operator, 'GET', '/satin-alma-kg-fiyatlari')).statusCode, 403);
    assert.equal((await istek(c.mudur, 'GET', '/satin-alma-kg-fiyatlari')).statusCode, 200);
    // 215 a: yalnız maliyet okuyan (satın alma işlemi yok) üç okuma ucunu görür, fiyat giremez.
    await vt().tx(async (db) => {
      const rol = (await db.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_maliyet', 'Geçici maliyet') RETURNING id"))!;
      await db.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'finans.maliyet-oku')", [rol.id]);
    });
    const muhasebe = await rolluKisi('maliyet', 'gecici_maliyet');
    assert.equal((await istek(muhasebe, 'GET', '/satin-alma-acilis')).statusCode, 403);
    for (const yol of ['/satin-alma-kg-fiyatlari', '/satin-alma-kg-fiyatlari/gecmis?kalite=DENEME-YT', '/satin-alma-kg-fiyatlari/malzemeler?nolar=1']) {
      assert.equal((await istek(muhasebe, 'GET', yol)).statusCode, 200, yol);
    }
    assert.equal((await ekle(muhasebe, [satir])).statusCode, 403);
    for (const bozuk of [{ kgFiyati: '0' }, { kgFiyati: '-1' }, { kgFiyati: '0.00' }, { paraBirimi: 'JPY' }, { kaliteKodu: ' ' }, { gecerlilik: '19.10.2026' }]) {
      assert.equal((await ekle(c.sa, [satir, { ...satir, ...bozuk }])).statusCode, 400, JSON.stringify(bozuk));
    }
    assert.equal((await ekle(c.sa, [])).statusCode, 400);
    const sayi = await ortam!.sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM satin_alma_kg_fiyati WHERE kalite_kodu = 'DENEME-YT'");
    assert.equal(sayi?.n, 0);
  });

  test('SAT-77: malzemenin birim fiyatı kalite + form kg fiyatından (form fiyatı yoksa kalitenin genel fiyatı); fiyatsız kalite listede ayrı', async () => {
    const g = await bugun();
    // Formlu hammadde kartı ölçüsüyle kaydedilir (malzemeler ölçü denetimi).
    const OLCULER: Record<string, Record<string, number>> = { cubuk: { d: 50, l: 6000 }, levha: { t: 2, w: 1000, l: 2000 }, boru: { D: 48.3, t: 2.6, l: 6000 } };
    const kart = async (kimlik: string, kod: string, grade: string, form: string, birim: string): Promise<number> => {
      tamam(await istek(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
        kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', grade, form, dims: OLCULER[form], com: { kod, ad: `Deneme ${kod}`, birim }, onay: { durum: 'aktif' } },
        ozet: { benzersiz_anahtar: `hammadde|satin-alma|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
      }));
      return (await ortam!.sahip.tx((db) => db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik])))!.no;
    };
    const cubuk = await kart('sa-kg-1', 'HM-SAT-00006', 'DENEME-MK', 'cubuk', 'kg');
    const levha = await kart('sa-kg-2', 'HM-SAT-00007', 'DENEME-MK', 'levha', 'adet');
    const fiyatsiz = await kart('sa-kg-3', 'HM-SAT-00008', 'DENEME-FY', 'boru', 'kg');
    const fiyatsizlar = async () => tamam<KgFiyatlariCevabi>(await istek(c.sa, 'GET', '/satin-alma-kg-fiyatlari')).fiyatsizKaliteler
      .filter((k) => k.kaliteKodu.startsWith('DENEME-')).map((k) => [k.kaliteKodu, k.form, k.kartSayisi]);
    assert.deepEqual(await fiyatsizlar(), [['DENEME-FY', 'boru', 1], ['DENEME-MK', 'cubuk', 1], ['DENEME-MK', 'levha', 1]]);
    tamam(await istek(c.sa, 'POST', '/satin-alma-kg-fiyatlari/ekle', { satirlar: [
      { kaliteKodu: 'DENEME-MK', form: 'cubuk', kgFiyati: '150', paraBirimi: 'TRY', gecerlilik: g },
      { kaliteKodu: 'DENEME-MK', form: null, kgFiyati: '120', talasKgFiyati: '30', paraBirimi: 'TRY', gecerlilik: g },
    ] }));
    // 214 a: talaş fiyatı aynı satırda; girilmeyen boş kalır (sıfır uydurulmaz), sıfır kabul edilmez.
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-kg-fiyatlari/ekle', { satirlar: [
      { kaliteKodu: 'DENEME-MK', form: null, kgFiyati: '120', talasKgFiyati: '0', paraBirimi: 'TRY', gecerlilik: g }] })).statusCode, 400);
    assert.deepEqual(await fiyatsizlar(), [['DENEME-FY', 'boru', 1]]);
    const m = await vt().tx((db) => servis.malzemeKgFiyatlari(db, [cubuk, levha, fiyatsiz]));
    assert.deepEqual([m.get(cubuk)?.form, Number(m.get(cubuk)?.kgFiyati), Number(m.get(cubuk)?.birimFiyati), Number(m.get(cubuk)?.tryBirimFiyati)], ['cubuk', 150, 150, 150]);
    // Adetle tutulan malzemenin kg ağırlığı bilinmiyor: kg fiyatı var, birim fiyatı boş (sıfır uydurulmaz).
    assert.deepEqual([m.get(levha)?.form, Number(m.get(levha)?.kgFiyati), m.get(levha)?.birimFiyati, Number(m.get(levha)?.tryTalasKgFiyati)], [null, 120, null, 30]);
    assert.equal(m.get(cubuk)?.talasKgFiyati, null);
    assert.equal(m.has(fiyatsiz), false);
    assert.equal('tryTalasBirimFiyati' in m.get(cubuk)!, false);
    // 1382 d: stok değerlemesi verilen günün kg fiyatıyla; talaş stok birimine çevrilir; o gün geçerli fiyat yoksa kart yok.
    const kgGun = await vt().tx((db) => servis.degerlemeKgFiyatlari(db, [cubuk, levha, fiyatsiz], g));
    assert.deepEqual(kgGun, new Map([[cubuk, { tryBirimFiyati: '150', tryTalasBirimFiyati: null }], [levha, { tryBirimFiyati: null, tryTalasBirimFiyati: null }]]));
    assert.deepEqual(await vt().tx((db) => servis.degerlemeKgFiyatlari(db, [cubuk, levha], null)), kgGun);
    const dun = new Date(Date.parse(`${g}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
    assert.deepEqual(await vt().tx((db) => servis.degerlemeKgFiyatlari(db, [cubuk, levha], dun)), new Map());
    // Hammadde stok değeri: kg fiyatıyla (birim fiyatı bilinmeyen ve fiyatsız kalem dışarıda, sayılır) ve alış fiyatıyla; yalnız finans.oku olana.
    // 228 a: değer yalnız kullanılabilir stoktan; geri kalanı Stok'un değer gruplarıyla ayrı döner, değere girmez. Hammadde dışı kart sayılmaz.
    const stokDegeri = async (cerez: string) => tamam<KgFiyatlariCevabi>(await istek(cerez, 'GET', '/satin-alma-kg-fiyatlari')).stokDegeri;
    servis.stokMiktariCozucusuKaydet(async () => [
      { malzemeId: cubuk, grup: 'kullanilabilir', toplam: '6' }, { malzemeId: cubuk, grup: 'hurda', toplam: '1' }, { malzemeId: cubuk, grup: 'fason', toplam: '2' },
      { malzemeId: levha, grup: 'kullanilabilir', toplam: '4' }, { malzemeId: fiyatsiz, grup: 'kullanilabilir', toplam: '2' },
      { malzemeId: 2147483000, grup: 'kullanilabilir', toplam: '5' },
    ]);
    try {
      const d = (await stokDegeri(c.mudur))!;
      assert.deepEqual([d.kgFiyatiyla, d.kgFiyatsizKalem, d.alisFiyatiyla, d.alisFiyatsizKalem], ['900.00', 2, null, 3]);
      assert.deepEqual(d.ayriToplam, { kgFiyatiyla: '450.00', alisFiyatiyla: null });
      assert.deepEqual(d.ayriGruplar.map((g) => [g.grup, g.kgFiyatiyla]), [['kalite', null], ['hurda', '150.00'], ['fason', '300.00'], ['yolda', null], ['diger', null]]);
      assert.deepEqual(d.satirlar.filter((x) => x.kaliteKodu.startsWith('DENEME-')).map((x) => [x.kaliteKodu, x.form, x.tutar]),
        [['DENEME-MK', 'cubuk', '900.00'], ['DENEME-MK', null, null]]);
      assert.equal(await stokDegeri(c.sa), null);
    } finally {
      servis.stokMiktariCozucusuKaydet(null);
    }
    // Malzeme ekranının okuduğu uç aynı değeri verir; fiyatı olmayan malzeme listede yok, satın almayı okumayan göremez.
    const uc = tamam<{ malzemeler: { malzemeNo: number; birimFiyati: string | null }[] }>(
      await istek(c.sa, 'GET', `/satin-alma-kg-fiyatlari/malzemeler?nolar=${cubuk},${levha},${fiyatsiz}`)).malzemeler;
    assert.deepEqual(uc.map((x) => [x.malzemeNo, x.birimFiyati === null ? null : Number(x.birimFiyati)]).sort(), [[cubuk, 150], [levha, null]].sort());
    assert.equal((await istek(c.operator, 'GET', `/satin-alma-kg-fiyatlari/malzemeler?nolar=${cubuk}`)).statusCode, 403);
    assert.equal((await istek(c.sa, 'GET', '/satin-alma-kg-fiyatlari/malzemeler?nolar=1,x')).statusCode, 400);
  });

  test('SAT-72: şirket adı satın alma ayarından okunur; oturumu olan herkes okur, oturumsuz 401', async () => {
    assert.equal((await istek('', 'GET', '/satin-alma-ayarlari/sirket-adi')).statusCode, 401);
    assert.deepEqual(tamam(await istek(c.operator, 'GET', '/satin-alma-ayarlari/sirket-adi')), { sirketAdi: 'Deneme A.Ş.' });
  });

  test('SA3 a: güncel kur finanstan; döviz teklifi kendi gününün kurunu saklar ve sonradan değişmez; finansta kur yoksa kullanıcıdan istenir, finansa yazılmaz', async () => {
    const kurEkle = async (tarih: string, kur: number) => tamam(await istek(c.yonetici, 'POST', '/finans/kurlar/ekle', { paraBirimi: 'USD', tarih, kur }));
    await kurEkle('2026-01-02', 40.5);
    const once = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).ayarlar;
    const para = (['TRY', 'USD', 'EUR'] as const).map((paraBirimi) => ({ paraBirimi, aylikFaizYuzdesi: '0' }));
    tamam(await istek(c.sa, 'POST', '/satin-alma-ayarlari/kaydet', { ...once, kurlar: para }));
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const [k1] = t.kalemler.map((k) => k.id) as [string];
    const usd = teklif(firmaA, [[k1, '10']], { paraBirimi: 'USD', teklifTarihi: '2026-01-05' });
    const ilk = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [usd] }));
    assert.equal(ilk.teklifler[0]?.kur, '40.5');
    // Finansa daha yeni kur girilir: saklanan kur değişmez (ekran geri gönderse de, boş gönderse de); aynı güne yeni teklif yeni kuru alır.
    await kurEkle('2026-01-04', 45);
    const ikinci = tamam<Talep>(await kaydet(c.sa, { ...govde(ilk), teklifler: [{ ...usd, kur: null }] }));
    const yeni = teklif(firmaB, [[k1, '9']], { paraBirimi: 'USD', teklifTarihi: '2026-01-05' });
    const ucuncu = tamam<Talep>(await kaydet(c.sa, { ...govde(ikinci), teklifler: [...ikinci.teklifler, yeni] }));
    assert.deepEqual(ucuncu.teklifler.map((q) => q.kur), ['40.5', '45']);
    // Finansta EUR kuru yok: kursuz EUR teklifi alan hatasıyla (400) kur ister; elle girilen kur teklife yazılır, finansa yazılmaz.
    const eur = teklif(firmaB, [[k1, '8']], { paraBirimi: 'EUR', teklifTarihi: '2026-01-05' });
    const red = await kaydet(c.sa, { ...govde(ucuncu), teklifler: [...ucuncu.teklifler, eur] });
    assert.equal(red.statusCode, 400);
    assert.match(red.body, /Finansta 2026-01-05 için EUR kuru yok; teklife o günün kurunu girin/);
    const elle = tamam<Talep>(await kaydet(c.sa, { ...govde(ucuncu), teklifler: [...ucuncu.teklifler, { ...eur, kur: '47.25' }] }));
    assert.equal(elle.teklifler[2]?.kur, '47.25');
    const ayar = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).ayarlar;
    assert.deepEqual(ayar.kurlar.map((k) => [k.paraBirimi, k.kur]), [['TRY', '1'], ['USD', '45'], ['EUR', null]]);
    assert.equal(ayar.kurTarihi, '2026-01-04');
  });

  // #205 karar 1: Logo bağlantısının satın almadan aldığı sipariş ve yazdığı sonuç.
  const siparisNo = async (talepId: string, teklifId: string) => (await vt().tx((db) => db.tek<{ id: number }>(
    'SELECT id FROM satin_alma_siparis WHERE talep_id = $1 AND teklif_id = $2', [talepId, teklifId])))!.id;
  const logoKuyrugu = async (idler: number[]) => (await vt().tx((db) => logoyaGidecekSiparisler(db, 10000))).filter((x) => idler.includes(x.id));
  const logoSonucu = (id: number, sonuc: Parameters<typeof siparisLogoSonucu>[2]) => vt().tx((db) => siparisLogoSonucu(db, id, sonuc));

  test('#205 Logo: sipariş verilince her sipariş Logo kuyruğuna girer; kuyruk tedarikçi, para birimi, kur, iskonto, termin ve satırları stok koduyla verir', async () => {
    const { s, a, b } = await bolunmusSiparis();
    assert.deepEqual(siparisi(s, a).logo, { durum: 'bekliyor', kayitNo: null, hata: null, iptalDurumu: null, iptalHata: null, guncellemeDurumu: null, guncellemeHata: null, kapatmaDurumu: null, kapatmaHata: null });
    const [ia, ib] = [await siparisNo(s.id, a), await siparisNo(s.id, b)];
    const kuyruk = await logoKuyrugu([ia, ib]);
    assert.deepEqual(kuyruk.map((x) => x.id), [ia, ib].sort((x, y) => x - y));
    const A = kuyruk.find((x) => x.id === ia)!;
    assert.deepEqual({ ...A, satirlar: undefined }, {
      id: ia, no: siparisi(s, a).no, tarih: '2026-10-07', firmaId: firmaA, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0', termin: null, durum: 'bekliyor', satirlar: undefined,
    });
    assert.deepEqual(A.satirlar, [{ satirId: siparisi(s, a).satirlar[0]!.id, stokKodu: 'HM-SAT-00004', hizmet: false, miktar: '4', birim: 'adet', birimFiyat: '5' }]);
    // Siparişe dönmemiş talebin siparişi yoktur; kuyruğa sipariş verilmeden girilmez.
    const k = await kararli();
    assert.equal((await vt().tx((db) => db.tek('SELECT 1 FROM satin_alma_siparis WHERE talep_id = $1 AND logo_gonderim_durumu IS NOT NULL', [k.id]))), null);
  });

  test('#205 Logo: hata kuyrukta kalır; başarı kayıt ve satır numaralarını yazar, kuyruktan çıkarır, yinelenirse değişmez; başka numara ya da yabancı satır reddedilir', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const [ia, ib] = [await siparisNo(s.id, a), await siparisNo(s.id, b)];
    await logoSonucu(ia, { hata: '  Köprüye ulaşılamadı  ' });
    assert.deepEqual(siparisi(await acilistaki(s.id), a).logo, { durum: 'hata', kayitNo: null, hata: 'Köprüye ulaşılamadı', iptalDurumu: null, iptalHata: null, guncellemeDurumu: null, guncellemeHata: null, kapatmaDurumu: null, kapatmaHata: null });
    assert.equal((await logoKuyrugu([ia]))[0]?.durum, 'hata');
    const satirA = siparisi(s, a).satirlar[0]!.id, satirB = siparisi(s, b).satirlar[0]!.id;
    await assert.rejects(logoSonucu(ia, { kayitNo: '4711', satirlar: [{ satirId: satirB, logoSatirRef: '1' }] }));
    assert.equal(siparisi(await acilistaki(s.id), a).logo?.durum, 'hata');
    await logoSonucu(ia, { kayitNo: '4711', satirlar: [{ satirId: satirA, logoSatirRef: '9001' }] });
    await logoSonucu(ia, { kayitNo: '4711', satirlar: [{ satirId: satirA, logoSatirRef: '9001' }] });
    assert.deepEqual(siparisi(await acilistaki(s.id), a).logo, { durum: 'gonderildi', kayitNo: '4711', hata: null, iptalDurumu: null, iptalHata: null, guncellemeDurumu: null, guncellemeHata: null, kapatmaDurumu: null, kapatmaHata: null });
    assert.equal((await vt().tx((db) => db.tek<{ r: string }>('SELECT logo_satir_ref AS r FROM satin_alma_siparis_satiri WHERE id = $1', [satirA])))!.r, '9001');
    assert.deepEqual((await logoKuyrugu([ia, ib])).map((x) => x.id), [ib]);
    await assert.rejects(logoSonucu(ia, { kayitNo: '4712', satirlar: [] }));
    await assert.rejects(logoSonucu(ib, { kayitNo: '4711', satirlar: [] }), kisitla('satin_alma_siparis_logo_kayit_no_tek'));
  });

  const guncellemeKuyrugu = async (idler: number[]) => (await vt().tx((db) => logoyaGuncellemeGidecekSiparisler(db, 10000))).filter((x) => idler.includes(x.id));
  const guncellemeSonucu = (id: number, sonuc: Parameters<typeof siparisLogoGuncellemeSonucu>[2]) => vt().tx((db) => siparisLogoGuncellemeSonucu(db, id, sonuc));

  test('#205 S2 b: Logo\'ya gitmiş siparişin fiyatı, iskontosu, miktarı ve termini değişir ve düzenleme kuyruğuna girer; tedarikçi ve para birimi değişmez, sipariş karardan çıkmaz', async () => {
    const { s, k1, k2, a, b } = await bolunmusSiparis();
    const [ia, ib] = [await siparisNo(s.id, a), await siparisNo(s.id, b)];
    const satirA = siparisi(s, a).satirlar[0]!.id;
    await logoSonucu(ia, { kayitNo: '5001', satirlar: [{ satirId: satirA, logoSatirRef: '9001' }] });
    const t = await acilistaki(s.id);
    const teklifDegis = (x: Talep, qid: string, d: (q: Talep['teklifler'][number]) => Record<string, unknown>) =>
      ({ ...govde(x), teklifler: x.teklifler.map((q) => (q.id === qid ? { ...q, ...d(q) } : q)) });
    for (const [ad, g] of [
      ['tedarikçi', teklifDegis(t, a, () => ({ firmaId: firmaB }))],
      ['para birimi', teklifDegis(t, a, () => ({ paraBirimi: 'USD', kur: '45' }))],
      ['sipariş', { ...govde(t), karar: { ...t.karar!, siparisler: t.karar!.siparisler.filter((x) => x.teklifId !== a) } }],
    ] as const) {
      const r = await kaydet(c.sa, g);
      assert.equal(r.statusCode, 422, ad);
      assert.match(r.body, /Logo'ya gönderilmiş siparişin/, ad);
    }
    // Değişmeden kaydetmek düzenleme göndermez.
    const ayni = tamam<Talep>(await kaydet(c.sa, govde(t)));
    assert.equal(siparisi(ayni, a).logo?.guncellemeDurumu, null);
    const fiyat = tamam<Talep>(await kaydet(c.sa, teklifDegis(ayni, a, (q) => ({ fiyatlar: q.fiyatlar.map((f) => (f.kalemId === k2 ? { ...f, birimFiyat: '5.5' } : f)) }))));
    assert.deepEqual([siparisi(fiyat, a).logo?.guncellemeDurumu, siparisi(fiyat, b).logo?.guncellemeDurumu], ['bekliyor', null]);
    const [g] = await guncellemeKuyrugu([ia, ib]);
    assert.deepEqual({ ...g!, satirlar: undefined }, {
      id: ia, no: siparisi(s, a).no, tarih: '2026-10-07', firmaId: firmaA, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0', termin: null, durum: 'bekliyor',
      logoKayitNo: '5001', kaldirilanSatirRefleri: [], satirlar: undefined,
    });
    assert.deepEqual(g!.satirlar, [{ satirId: satirA, stokKodu: 'HM-SAT-00004', hizmet: false, miktar: '4', birim: 'adet', birimFiyat: '5.5', logoSatirRef: '9001' }]);
    await guncellemeSonucu(ia, { satirlar: [] });
    assert.deepEqual(siparisi(await acilistaki(s.id), a).logo, { durum: 'gonderildi', kayitNo: '5001', hata: null, iptalDurumu: null, iptalHata: null, guncellemeDurumu: 'gonderildi', guncellemeHata: null, kapatmaDurumu: null, kapatmaHata: null });
    assert.deepEqual(await guncellemeKuyrugu([ia]), []);
    const iskonto = tamam<Talep>(await kaydet(c.sa, teklifDegis(await acilistaki(s.id), a, () => ({ iskontoYuzdesi: '3' }))));
    assert.equal(siparisi(iskonto, a).logo?.guncellemeDurumu, 'bekliyor');
    await guncellemeSonucu(ia, { hata: 'Logo kilitli' });
    assert.deepEqual([siparisi(await acilistaki(s.id), a).logo?.guncellemeDurumu, siparisi(await acilistaki(s.id), a).logo?.guncellemeHata], ['hata', 'Logo kilitli']);
    assert.equal((await guncellemeKuyrugu([ia]))[0]?.durum, 'hata');
    await assert.rejects(guncellemeSonucu(ia, { satirlar: [{ satirId: siparisi(s, b).satirlar[0]!.id, logoSatirRef: '1' }] }));
    const once = await acilistaki(s.id);
    const kalem = tamam<Talep>(await istek(c.mudur, 'POST', `/satin-alma-talepleri/${s.id}/siparis-kalemi-degistir`, { kalemId: k2, miktar: '6', birim: 'adet', gerekce: 'Deneme', surum: once.surum }));
    assert.deepEqual([siparisi(kalem, a).logo?.guncellemeDurumu, siparisi(kalem, a).logo?.guncellemeHata], ['bekliyor', null]);
    assert.equal((await guncellemeKuyrugu([ia]))[0]?.satirlar[0]?.miktar, '6');
    await guncellemeSonucu(ia, { satirlar: [] });
    const termin = tamam<Talep>(await kaydet(c.sa, { ...govde(await acilistaki(s.id)), karar: { ...kalem.karar!, siparisler: kalem.karar!.siparisler.map((x) => (x.teklifId === a ? { ...x, beklenenTeslim: '2026-10-20' } : x)) } }));
    assert.deepEqual([siparisi(termin, a).beklenenTeslim, siparisi(termin, a).logo?.guncellemeDurumu], ['2026-10-20', 'bekliyor']);
    // Gitmemiş sipariş değişir, düzenleme kuyruğuna girmez.
    const bDegisti = tamam<Talep>(await istek(c.mudur, 'POST', `/satin-alma-talepleri/${s.id}/siparis-kalemi-degistir`, { kalemId: k1, miktar: '11', birim: 'adet', gerekce: 'Deneme', surum: termin.surum }));
    assert.deepEqual([siparisi(bDegisti, b).satirlar[0]!.miktar, siparisi(bDegisti, b).logo?.guncellemeDurumu], ['11', null]);
  });

  test('#205 S2 b: Logo\'ya gitmiş siparişten kaldırılan satırın Logo numarası düzenlemede açık listeyle gider; düzenleme gidince liste boşalır', async () => {
    const k = await kararli();
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(k), onaylar: [onayKaydi()] }));
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi',
      karar: { ...onayli.karar!, siparisler: [{ teklifId: onayli.karar!.teklifId!, siparisNo: 'SA-T', siparisTarihi: '2026-10-07', beklenenTeslim: null }] } }));
    const qid = s.karar!.teklifId!;
    const [r1, r2] = siparisi(s, qid).satirlar;
    const id = await siparisNo(s.id, qid);
    await logoSonucu(id, { kayitNo: '5201', satirlar: [{ satirId: r1!.id, logoSatirRef: '521' }, { satirId: r2!.id, logoSatirRef: '522' }] });
    const t = await acilistaki(s.id);
    const azaldi = tamam<Talep>(await kaydet(c.sa, { ...govde(t),
      teklifler: t.teklifler.map((q) => (q.id === qid ? { ...q, fiyatlar: q.fiyatlar.filter((f) => f.kalemId !== r1!.kalemId) } : q)) }));
    assert.deepEqual([siparisi(azaldi, qid).satirlar.map((r) => r.id), siparisi(azaldi, qid).logo?.guncellemeDurumu], [[r2!.id], 'bekliyor']);
    const [g] = await guncellemeKuyrugu([id]);
    assert.deepEqual([g!.kaldirilanSatirRefleri, g!.satirlar.map((r) => r.logoSatirRef)], [['521'], ['522']]);
    await guncellemeSonucu(id, { hata: 'Logo kilitli' });
    assert.deepEqual((await guncellemeKuyrugu([id]))[0]?.kaldirilanSatirRefleri, ['521']);
    await guncellemeSonucu(id, { satirlar: [] });
    assert.deepEqual((await vt().tx((db) => db.tek<{ r: string[] }>('SELECT logo_kaldirilan_satir_refleri AS r FROM satin_alma_siparis WHERE id = $1', [id])))!.r, []);
  });

  const kapat = (t: Talep, teklifId: string, gerekce = 'Kalan gelmeyecek') =>
    istek(c.sa, 'POST', `/satin-alma-talepleri/${t.id}/siparis-kapat`, { teklifId, gerekce, surum: t.surum });
  const kapatmaKuyrugu = async (idler: number[]) => (await vt().tx((db) => logoyaKapatmaGidecekSiparisler(db, 10000))).filter((x) => idler.includes(x.id));

  test('#205 Kalanı kapat: Logo\'daki siparişin kalanı gerekçeyle kapatılır, kuyruğa girer; kapatılan siparişe teslim yazılmaz, düzenlenmez, tamam sayılır', async () => {
    const { s, k2, a, b } = await bolunmusSiparis();
    const [ia, ib] = [await siparisNo(s.id, a), await siparisNo(s.id, b)];
    const [satirA, satirB] = [siparisi(s, a).satirlar[0]!.id, siparisi(s, b).satirlar[0]!.id];
    const gitmemis = await kapat(s, a);
    assert.equal(gitmemis.statusCode, 422);
    assert.match(gitmemis.body, /Yalnız Logo'ya gönderilmiş sipariş kapatılır/);
    await logoSonucu(ia, { kayitNo: '9300', satirlar: [{ satirId: satirA, logoSatirRef: '9301' }] });
    await logoSonucu(ib, { kayitNo: '9310', satirlar: [{ satirId: satirB, logoSatirRef: '9311' }] });
    await teslimEt(satirA, '1', 920601);
    await teslimEt(satirB, '10', 920602);
    let t = await acilistaki(s.id);
    const tamB = await kapat(t, b);
    assert.equal(tamB.statusCode, 422);
    assert.match(tamB.body, /kapatılacak kalan yok/);
    assert.equal((await kapat(t, a, '  ')).statusCode, 400);
    const kapali = tamam<Talep>(await kapat(t, a));
    assert.deepEqual([siparisi(kapali, a).logo?.kapatmaDurumu, siparisi(kapali, a).teslimDurumu, kapali.durum], ['bekliyor', 'tamam', 'teslim_alindi']);
    assert.ok(kapali.hareketler.some((h) => h.metin.includes('kalanı kapatıldı: Kalan gelmeyecek')));
    assert.deepEqual(await kapatmaKuyrugu([ia, ib]), [{ id: ia, no: siparisi(s, a).no, logoKayitNo: '9300', satirRefleri: ['9301'] }]);
    await assert.rejects(teslimEt(satirA, '1', 920603), (h: { kod?: string; mesaj?: string }) => /kalanı kapatıldı/.test(h.mesaj ?? ''));
    assert.equal((await vt().tx((db) => siparisSatirlari(db))).some((x) => x.id === satirA), false);
    assert.equal((await kapat(kapali, a)).statusCode, 422);
    t = await acilistaki(s.id);
    const fiyat = await kaydet(c.sa, { ...govde(t), teklifler: t.teklifler.map((q) => (q.id === a ? { ...q, fiyatlar: q.fiyatlar.map((f) => (f.kalemId === k2 ? { ...f, birimFiyat: '5.5' } : f)) } : q)) });
    assert.equal(fiyat.statusCode, 422);
    assert.match(fiyat.body, /kalanı kapatılmış/);
    await vt().tx((db) => siparisLogoKapatmaSonucu(db, ia, { hata: 'Logo kilitli' }));
    assert.deepEqual([siparisi(await acilistaki(s.id), a).logo?.kapatmaDurumu, siparisi(await acilistaki(s.id), a).logo?.kapatmaHata], ['hata', 'Logo kilitli']);
    assert.equal((await kapatmaKuyrugu([ia])).length, 1);
    await vt().tx((db) => siparisLogoKapatmaSonucu(db, ia, { tamam: true }));
    assert.equal(siparisi(await acilistaki(s.id), a).logo?.kapatmaDurumu, 'gonderildi');
    assert.deepEqual(await kapatmaKuyrugu([ia]), []);
  });

  test('B-5 (1404): kalanı kapatılmış siparişte mal kabul düzeltmesi aynı işlemde geri alıp yeniden yazar; geri almasız ya da ayrı işlemdeki yazım reddedilir', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const ia = await siparisNo(s.id, a);
    const [satirA, satirB] = [siparisi(s, a).satirlar[0]!.id, siparisi(s, b).satirlar[0]!.id];
    await logoSonucu(ia, { kayitNo: '9500', satirlar: [{ satirId: satirA, logoSatirRef: '9501' }] });
    await teslimEt(satirA, '1', 940401);
    tamam<Talep>(await kapat(await acilistaki(s.id), a));
    const kapaliRed = (h: { mesaj?: string }) => /kalanı kapatıldı/.test(h.mesaj ?? '');
    const net = async () => (await vt().tx((db) => db.tek<{ n: string }>(
      'SELECT coalesce(sum(miktar), 0)::text AS n FROM satin_alma_teslim WHERE siparis_satiri_id = $1', [satirA])))!.n;
    // Reddedilen: geri alma olmadan yeni mal kabul satırı kapalı siparişe yazılmaz.
    await assert.rejects(teslimEt(satirA, '1', 940402), kapaliRed);
    // İzinli: düzeltme (stok DEP-53) aynı işlemde eski teslimi geri alır, doğru miktarı yeni satırla yazar; büyük miktar da yazılır.
    await vt().tx(async (db) => {
      await teslimGeriAl(db, depocu(), { malKabulSatirId: 940401 });
      await teslimIsle(db, depocu(), { siparisSatirId: satirA, miktar: '1.5', malKabulSatirId: 940403 });
    });
    assert.equal(Number(await net()), 1.5);
    assert.equal(siparisi(await acilistaki(s.id), a).logo?.kapatmaDurumu, 'bekliyor', 'düzeltme kapatmayı açmaz');
    // Reddedilen: geri alma önceki işlemde kaldıysa sonraki işlemdeki yazım düzeltme sayılmaz.
    await geriAl(940403);
    await assert.rejects(teslimEt(satirA, '1.5', 940404), kapaliRed);
    assert.equal(Number(await net()), 0);
    // Reddedilen: aynı işlemde başka sipariş satırının teslimini geri almak kapalı satıra yazım izni vermez.
    await teslimEt(satirB, '2', 940405);
    await assert.rejects(vt().tx(async (db) => {
      await teslimGeriAl(db, depocu(), { malKabulSatirId: 940405 });
      await teslimIsle(db, depocu(), { siparisSatirId: satirA, miktar: '2', malKabulSatirId: 940406 });
    }), kapaliRed);
  });

  test('#205 Kalanı kapat: irsaliyesiz kapatılan sipariş düzenlenmez; talep iptal edilince gitmemiş kapatma düşer, iptal gider; geç gelen kapatma sonucu yok sayılır', async () => {
    const { s, k2, a } = await bolunmusSiparis();
    const ia = await siparisNo(s.id, a);
    await logoSonucu(ia, { kayitNo: '9400', satirlar: [] });
    const kapali = tamam<Talep>(await kapat(await acilistaki(s.id), a));
    const fiyat = await kaydet(c.sa, { ...govde(kapali), teklifler: kapali.teklifler.map((q) => (q.id === a ? { ...q, fiyatlar: q.fiyatlar.map((f) => (f.kalemId === k2 ? { ...f, birimFiyat: '5.5' } : f)) } : q)) });
    assert.equal(fiyat.statusCode, 422);
    assert.match(fiyat.body, /kalanı kapatılmış/);
    const ip = tamam<Talep>(await kaydet(c.sa, { ...govde(kapali), durum: 'iptal', iptalNedeni: 'Deneme iptal' }));
    assert.deepEqual([siparisi(ip, a).logo?.kapatmaDurumu, siparisi(ip, a).logo?.iptalDurumu], [null, 'bekliyor']);
    assert.deepEqual(await kapatmaKuyrugu([ia]), []);
    await vt().tx((db) => siparisLogoKapatmaSonucu(db, ia, { tamam: true }));
    assert.equal(siparisi(await acilistaki(s.id), a).logo?.kapatmaDurumu, null);
  });

  test('#205 S2 b: irsaliyesi gelmiş Logo siparişinin satırı, fiyatı, iskontosu ve termini değişmez; gitmemiş siparişin irsaliyesi kilitlemez', async () => {
    const { s, k1, k2, a, b } = await bolunmusSiparis();
    const satirA = siparisi(s, a).satirlar[0]!.id;
    await logoSonucu(await siparisNo(s.id, a), { kayitNo: '5101', satirlar: [{ satirId: satirA, logoSatirRef: '9101' }] });
    await teslimEt(satirA, '1', 920501);
    await teslimEt(siparisi(s, b).satirlar[0]!.id, '1', 920502);
    const t = await acilistaki(s.id);
    const teklifDegis = (qid: string, d: (q: Talep['teklifler'][number]) => Record<string, unknown>) => ({ ...govde(t), teklifler: t.teklifler.map((q) => (q.id === qid ? { ...q, ...d(q) } : q)) });
    for (const [ad, g] of [
      ['fiyat', teklifDegis(a, (q) => ({ fiyatlar: q.fiyatlar.map((f) => (f.kalemId === k2 ? { ...f, birimFiyat: '5.5' } : f)) }))],
      ['iskonto', teklifDegis(a, () => ({ iskontoYuzdesi: '3' }))],
      ['termin', { ...govde(t), karar: { ...t.karar!, siparisler: t.karar!.siparisler.map((x) => (x.teklifId === a ? { ...x, beklenenTeslim: '2026-10-20' } : x)) } }],
    ] as const) {
      const r = await kaydet(c.sa, g);
      assert.equal(r.statusCode, 422, ad);
      assert.match(r.body, /irsaliyesi gelmiş/, ad);
    }
    const kalem = await istek(c.mudur, 'POST', `/satin-alma-talepleri/${t.id}/siparis-kalemi-degistir`, { kalemId: k2, miktar: '6', birim: 'adet', gerekce: 'Deneme', surum: t.surum });
    assert.equal(kalem.statusCode, 422);
    assert.match(kalem.body, /irsaliyesi gelmiş/);
    const bDegisti = tamam<Talep>(await istek(c.mudur, 'POST', `/satin-alma-talepleri/${t.id}/siparis-kalemi-degistir`, { kalemId: k1, miktar: '11', birim: 'adet', gerekce: 'Deneme', surum: t.surum }));
    assert.equal(siparisi(bDegisti, b).satirlar[0]!.miktar, '11');
    assert.equal(siparisi(bDegisti, a).logo?.guncellemeDurumu, null);
  });

  test('#205 Logo iptal: talep iptal edilince Logo\'daki siparişin iptali kuyruğa girer, gitmemiş sipariş kuyruktan çıkar; iptalden geri alınmaz; geç gelen başarı iptali kuyruğa koyar', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const [ia, ib] = [await siparisNo(s.id, a), await siparisNo(s.id, b)];
    await logoSonucu(ia, { kayitNo: '6001', satirlar: [] });
    const once = await acilistaki(s.id);
    const termin = tamam<Talep>(await kaydet(c.sa, { ...govde(once), karar: { ...once.karar!, siparisler: once.karar!.siparisler.map((x) => (x.teklifId === a ? { ...x, beklenenTeslim: '2026-10-21' } : x)) } }));
    assert.equal(siparisi(termin, a).logo?.guncellemeDurumu, 'bekliyor');
    const ip = tamam<Talep>(await kaydet(c.sa, { ...govde(termin), durum: 'iptal', iptalNedeni: 'Deneme iptal' }));
    assert.deepEqual([siparisi(ip, a).logo?.iptalDurumu, siparisi(ip, a).logo?.guncellemeDurumu, siparisi(ip, b).logo], ['bekliyor', null, null]);
    assert.deepEqual(await guncellemeKuyrugu([ia, ib]), []);
    // İptalden önce alınmış düzenlemenin sonucu yok sayılır.
    await guncellemeSonucu(ia, { satirlar: [] });
    assert.equal(siparisi(await acilistaki(s.id), a).logo?.guncellemeDurumu, null);
    const iptaller = async () => (await vt().tx((db) => logoyaIptalGidecekSiparisler(db, 10000))).filter((x) => [ia, ib].includes(x.id));
    assert.deepEqual(await iptaller(), [{ id: ia, no: siparisi(ip, a).no, logoKayitNo: '6001' }]);
    assert.deepEqual(await logoKuyrugu([ia, ib]), []);
    const geri = await kaydet(c.sa, { ...govde(ip), durum: 'siparis_verildi', iptalNedeni: '' });
    assert.equal(geri.statusCode, 422);
    assert.match(geri.body, /iptalden geri alınmaz/);
    await vt().tx((db) => siparisLogoIptalSonucu(db, ia, { hata: 'Logo kilitli' }));
    assert.deepEqual([siparisi(await acilistaki(s.id), a).logo?.iptalDurumu, siparisi(await acilistaki(s.id), a).logo?.iptalHata], ['hata', 'Logo kilitli']);
    await vt().tx((db) => siparisLogoIptalSonucu(db, ia, { tamam: true }));
    assert.equal(siparisi(await acilistaki(s.id), a).logo?.iptalDurumu, 'gonderildi');
    assert.deepEqual(await iptaller(), []);
    // İşçi iptalden önce almış ve Logo'da açmıştı: kayıt yazılır, iptali kuyruğa girer.
    await logoSonucu(ib, { kayitNo: '6002', satirlar: [] });
    assert.deepEqual([siparisi(await acilistaki(s.id), b).logo?.durum, siparisi(await acilistaki(s.id), b).logo?.iptalDurumu], ['gonderildi', 'bekliyor']);
  });

  // #205 S3 b (kart #790): onaylı talep fişi ve sipariş satırının karşılaması.
  const talepNo = async (id: string) => (await vt().tx((db) => db.tek<{ id: number }>('SELECT sayi_id AS id FROM satin_alma_talep WHERE id = $1', [id])))!.id;
  const kalemNo = async (talepId: string, kalemId: string) => (await vt().tx((db) => db.tek<{ id: number }>(
    'SELECT sayi_id AS id FROM satin_alma_talep_kalemi WHERE talep_id = $1 AND id = $2', [talepId, kalemId])))!.id;
  const talepKuyrugu = async (idler: number[]) => (await vt().tx((db) => logoyaGidecekTalepler(db, 10000))).filter((x) => idler.includes(x.id));
  const talepSonucu = (id: number, sonuc: Parameters<typeof talepLogoSonucu>[2]) => vt().tx((db) => talepLogoSonucu(db, id, sonuc));
  const karsilamalar = async (satirlar: number[]) => (await vt().tx((db) => logoyaGidecekKarsilamalar(db, 10000))).filter((x) => satirlar.includes(x.siparisSatirId));
  const karsilamaSonucu = (id: number, sonuc: Parameters<typeof karsilamaLogoSonucu>[2]) => vt().tx((db) => karsilamaLogoSonucu(db, id, sonuc));

  test('#205 S3 b talep fişi: karar onaylanınca talep Logo kuyruğuna girer; onaysız talep girmez; hata kuyrukta kalır, başarı satır numaralarını yazar, yinelenirse değişmez', async () => {
    const k = await kararli();
    assert.deepEqual(await talepKuyrugu([await talepNo(k.id)]), []);
    const { s, k1, k2 } = await bolunmusSiparis();
    const id = await talepNo(s.id);
    const [n1, n2] = [await kalemNo(s.id, k1), await kalemNo(s.id, k2)];
    const [t] = await talepKuyrugu([id]);
    assert.deepEqual({ ...t!, satirlar: undefined, tarih: undefined }, { id, no: s.no, ihtiyacTarihi: s.ihtiyacTarihi, durum: 'bekliyor', satirlar: undefined, tarih: undefined });
    assert.equal(t!.tarih, (await vt().tx((db) => db.tek<{ g: string }>("SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date::text AS g")))!.g);
    assert.deepEqual(t!.satirlar.map((r) => [r.satirId, r.miktar, r.birim]), [[n1, '10', 'adet'], [n2, '4', 'adet']]);
    assert.equal(t!.satirlar[1]!.stokKodu, 'HM-SAT-00004');
    await talepSonucu(id, { hata: '  Logo kapalı ' });
    assert.equal((await talepKuyrugu([id]))[0]?.durum, 'hata');
    const diger = await bolunmusSiparis();
    await assert.rejects(talepSonucu(id, { kayitNo: 'T-1', satirlar: [{ satirId: await kalemNo(diger.s.id, diger.k1), logoSatirRef: '1' }] }));
    assert.equal((await talepKuyrugu([id]))[0]?.durum, 'hata');
    await talepSonucu(id, { kayitNo: 'T-1', satirlar: [{ satirId: n1, logoSatirRef: '81' }, { satirId: n2, logoSatirRef: '82' }] });
    await talepSonucu(id, { kayitNo: 'T-1', satirlar: [{ satirId: n1, logoSatirRef: '81' }] });
    assert.deepEqual(await talepKuyrugu([id]), []);
    assert.deepEqual((await vt().tx((db) => db.sorgu<{ r: string }>('SELECT logo_satir_ref AS r FROM satin_alma_talep_kalemi WHERE talep_id = $1 ORDER BY sira', [s.id]))).map((x) => x.r), ['81', '82']);
    await assert.rejects(talepSonucu(id, { kayitNo: 'T-2', satirlar: [] }));
    // Başka talebin fişi kendi kuyruğunda kalır.
    assert.deepEqual(await talepKuyrugu([await talepNo(diger.s.id)]).then((x) => x.map((y) => y.durum)), ['bekliyor']);
  });

  test('#205 S3 b karşılama: talep fişi ve sipariş Logo\'da satır numarası alınca sipariş satırı karşılama kuyruğuna girer; hata kalır, başarı çıkarır; iptal edilen sipariş ve gitmemiş fiş karşılanmaz', async () => {
    const { s, k1, k2, a, b } = await bolunmusSiparis();
    const id = await talepNo(s.id);
    const [satirA, satirB] = [siparisi(s, a).satirlar[0]!.id, siparisi(s, b).satirlar[0]!.id];
    await logoSonucu(await siparisNo(s.id, a), { kayitNo: '7001', satirlar: [{ satirId: satirA, logoSatirRef: '71' }] });
    assert.deepEqual(await karsilamalar([satirA, satirB]), []);
    await talepSonucu(id, { kayitNo: 'T-7', satirlar: [{ satirId: await kalemNo(s.id, k1), logoSatirRef: '81' }, { satirId: await kalemNo(s.id, k2), logoSatirRef: '82' }] });
    assert.deepEqual(await karsilamalar([satirA, satirB]), [
      { siparisSatirId: satirA, siparisKayitNo: '7001', talepSatirRef: '82', siparisSatirRef: '71', miktar: '4', stokKodu: 'HM-SAT-00004', birim: 'adet', firmaId: firmaA },
    ]);
    await karsilamaSonucu(satirA, { hata: 'Kilitli' });
    assert.equal((await karsilamalar([satirA])).length, 1);
    await karsilamaSonucu(satirA, { karsilamaRef: 'K-1' });
    await karsilamaSonucu(satirA, { karsilamaRef: 'K-1' });
    assert.deepEqual(await karsilamalar([satirA]), []);
    await assert.rejects(karsilamaSonucu(satirA, { karsilamaRef: 'K-2' }));
    await karsilamaSonucu(satirA, { hata: 'Geç gelen hata' });
    assert.deepEqual((await vt().tx((db) => db.tek<{ d: string; r: string }>('SELECT logo_karsilama_durumu AS d, logo_karsilama_ref AS r FROM satin_alma_siparis_satiri WHERE id = $1', [satirA])))!, { d: 'gonderildi', r: 'K-1' });
    // B siparişi Logo'ya gidince karşılanır; talep iptal edilince (sipariş iptali kuyrukta) karşılanmaz.
    await logoSonucu(await siparisNo(s.id, b), { kayitNo: '7002', satirlar: [{ satirId: satirB, logoSatirRef: '72' }] });
    assert.equal((await karsilamalar([satirB])).length, 1);
    tamam<Talep>(await kaydet(c.sa, { ...govde(await acilistaki(s.id)), durum: 'iptal', iptalNedeni: 'Deneme iptal' }));
    assert.deepEqual(await karsilamalar([satirB]), []);
  });

  test('#205 S3 b: gitmemiş talep fişi iptalde kuyruktan çıkar', async () => {
    const { s } = await bolunmusSiparis();
    const id = await talepNo(s.id);
    tamam<Talep>(await kaydet(c.sa, { ...govde(await acilistaki(s.id)), durum: 'iptal', iptalNedeni: 'Deneme iptal' }));
    assert.deepEqual(await talepKuyrugu([id]), []);
  });

  test('#855 numara kuralları: talep ve sipariş numarası ayardaki kalıptan gelir, katalog kodu kartındır; çakışan numara atlanır; Logo\'ya sığmayan kalıp kayıt açtırmaz', async () => {
    const kalip = async (anahtar: string, deger: string) => tamam(await istek(c.yonetici, 'POST', `/ayarlar/${anahtar}/degistir`, { deger }));
    const eski = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    assert.match(eski.no, /^ST-\d{4}-\d{3,}$/);
    try {
      // Kalıp değişince eski bir numarayla çakışan numara atlanır.
      await ortam!.sahip.tx((db) => db.sorgu("UPDATE satin_alma_talep SET no = 'DT-001' WHERE id = $1", [eski.id]));
      await kalip('satin-alma.talep-no', 'DT-{SAYAC:3}');
      await kalip('satin-alma.siparis-no', 'DS-{SAYAC:3}');
      const yeni = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
      const ikinci = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
      assert.deepEqual([yeni.no, ikinci.no], ['DT-002', 'DT-003']);
      const { s, a } = await bolunmusSiparis();
      assert.match(siparisi(s, a).no ?? '', /^DS-\d{3}$/);
      const kart = tamam<{ stok_kodu: string }>(await istek(c.yonetici, 'POST', '/malzeme-katalogu-kartlari/sa-kart-7/kaydet', {
        kayit: { id: 'sa-kart-7', tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1007 }, com: { kod: 'HM-SAT-00009', ad: 'Deneme numara kalemi', birim: 'adet' }, onay: { durum: 'aktif' } },
        ozet: { benzersiz_anahtar: 'hammadde|satin-alma|sa-kart-7', mukerrer_gerekcesi: null }, surum: null,
      }));
      const kat = tamam<KatalogKaydi>(await istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', {
        id: randomUUID(), malzemeNo: await kartNo(kart.stok_kodu, false), ozellik: '', notlar: '', takmaAdlari: [], surum: null,
      }));
      // 249 a: katalog kalemi kendi kodunu tutmaz; kod, ad ve birim kartındır, kopya sütun yoktur.
      assert.deepEqual([kat.kod, kat.ad, kat.birim], [kart.stok_kodu, 'Deneme numara kalemi', 'adet']);
      const sutunlar = await ortam!.sahip.tx((db) => db.sorgu<{ ad: string }>(
        "SELECT column_name AS ad FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'satin_alma_katalog' AND column_name IN ('kod', 'ad', 'birim', 'kategori') ORDER BY 1"));
      assert.deepEqual(sutunlar.map((x) => x.ad), ['kategori']);
      await kalip('satin-alma.talep-no', 'UZUN-TALEP-{YYYY}-{SAYAC:6}');
      const uzun = await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep());
      assert.equal(uzun.statusCode, 422);
      assert.match(uzun.body, /numara kuralını kısaltın/);
    } finally {
      for (const [anahtar, deger] of [['satin-alma.talep-no', 'ST-{YYYY}-{SAYAC:3}'], ['satin-alma.siparis-no', 'SP-{YYYY}-{SAYAC:3}']] as const) {
        await kalip(anahtar, deger);
      }
    }
  });

  // Sentetik PDF: imzası türü belirler, gerisi rastgele; gerçek sertifika yok.
  async function belgeYukle(cerez: string): Promise<{ ozet: string; icerik: Buffer }> {
    const icerik = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(2000)]);
    const ozet = createHash('sha256').update(icerik).digest('hex');
    const r = await istek(cerez, 'POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') }, null);
    assert.equal(r.statusCode, 200, r.body);
    return { ozet, icerik };
  }

  test('#1010: sipariş satırına sertifika bağlanır; yinelenen yükleme ikinci belge açmaz, okuyan görür ve açar, yalnız yazan ekler ve kaldırır', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const satirA = siparisi(s, a).satirlar[0]!.id, satirB = siparisi(s, b).satirlar[0]!.id;
    const liste = (cerez: string, satir: number) => istek(cerez, 'GET', `/satin-alma-siparis-satirlari/${satir}/belgeler`);
    assert.deepEqual(tamam<SiparisBelgeleriCevabi>(await liste(c.mudur, satirA)).belgeler, []);

    const { ozet, icerik } = await belgeYukle(c.sa);
    const ad = `Deneme sertifika ${randomUUID()}`;
    const govde = { tur: 'sertifika', ad, ozet, dosyaAdi: 'sertifika.pdf' };
    const kimlik = randomUUID();
    const ilk = tamam<SiparisBelgeleriCevabi>(await istek(c.sa, 'POST', `/satin-alma-siparis-satirlari/${satirA}/belge-ekle`, govde, kimlik));
    assert.deepEqual(ilk.belgeler.map((x) => [x.ad, x.tur]), [[ad, 'sertifika']]);
    const tekrar = tamam<SiparisBelgeleriCevabi>(await istek(c.sa, 'POST', `/satin-alma-siparis-satirlari/${satirA}/belge-ekle`, govde, kimlik));
    assert.deepEqual(tekrar, ilk);
    const acilan = await vt().tx((db) => db.tek<{ n: number }>('SELECT count(*)::int AS n FROM cizimler_belge WHERE ad = $1', [ad]));
    assert.equal(acilan?.n, 1);
    const belgeId = ilk.belgeler[0]!.id;

    // Okuyan listeyi görür ve dosyayı açar; belge başka satırın ucundan verilmez.
    assert.deepEqual(tamam<SiparisBelgeleriCevabi>(await liste(c.mudur, satirA)), ilk);
    const dosya = await istek(c.mudur, 'GET', `/satin-alma-siparis-satirlari/${satirA}/belgeler/${belgeId}/dosya`);
    assert.equal(dosya.statusCode, 200, dosya.body);
    assert.ok(dosya.rawPayload.equals(icerik));
    assert.equal((await istek(c.mudur, 'GET', `/satin-alma-siparis-satirlari/${satirB}/belgeler/${belgeId}/dosya`)).statusCode, 404);
    assert.deepEqual([...(await vt().tx((db) => siparisSatiriBelgeleri(db, [satirA, satirB])))], [[satirA, ilk.belgeler]]);

    // Satın almayı görmeyen okuyamaz; okuyan ekleyemez ve kaldıramaz; olmayan satır 404.
    assert.equal((await liste(c.operator, satirA)).statusCode, 403);
    const { ozet: ozet2 } = await belgeYukle(c.mudur);
    assert.equal((await istek(c.mudur, 'POST', `/satin-alma-siparis-satirlari/${satirA}/belge-ekle`, { ...govde, ozet: ozet2 })).statusCode, 403);
    assert.equal((await istek(c.mudur, 'POST', `/satin-alma-siparis-satirlari/${satirA}/belgeler/${belgeId}/kaldir`)).statusCode, 403);
    assert.equal((await liste(c.sa, 2147483000)).statusCode, 404);
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-siparis-satirlari/2147483000/belge-ekle', govde)).statusCode, 404);

    // Kaldırılan belge satırdan düşer; ikinci kaldırma ve dosyası 404.
    const kaldir = () => istek(c.sa, 'POST', `/satin-alma-siparis-satirlari/${satirA}/belgeler/${belgeId}/kaldir`);
    assert.deepEqual(tamam<SiparisBelgeleriCevabi>(await kaldir()).belgeler, []);
    assert.equal((await kaldir()).statusCode, 404);
    assert.equal((await istek(c.mudur, 'GET', `/satin-alma-siparis-satirlari/${satirA}/belgeler/${belgeId}/dosya`)).statusCode, 404);
  });

  // 1096 a ve 1099 a: onaya giden kararın kuru sunucuda sabitlenir; kalem ayrıntısı toplamlara girer.
  // Sonda durur: EUR teklifi ve sabit kuru, para birimini ayarlardan kaldıran önceki testleri bağlamasın.
  async function onaydaEuro(alan: Record<string, unknown> = {}): Promise<{ t: Talep; a: ReturnType<typeof teklif> }> {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10'], [k2, '5']], { paraBirimi: 'EUR', kur: '36', ...alan });
    const deg = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a] }));
    const ond = tamam<Talep>(await kaydet(c.sa, { ...govde(deg), durum: 'onayda', teklifler: [a],
      karar: { mod: 'tek', teklifId: a.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [{ paraBirimi: 'EUR', kur: '99' }], siparisler: [] } }));
    return { t: ond, a };
  }
  const siparisVer = (t: Talep, teklifId: string) =>
    kaydet(c.sa, { ...govde(t), durum: 'siparis_verildi', karar: { ...t.karar!, siparisler: [{ teklifId, siparisNo: '', siparisTarihi: '2026-10-07', beklenenTeslim: null }] } });

  test('1096 a: onaya gönderilen kararın kuru ve faizi finanstan sabitlenir, istemcinin kuru yok sayılır; 7 günden eski kilitle sipariş verilmez', async () => {
    tamam(await istek(c.yonetici, 'POST', '/finans/kurlar/ekle', { paraBirimi: 'EUR', tarih: '2026-01-03', kur: 36 }));
    const { t, a } = await onaydaEuro();
    assert.deepEqual(t.karar?.sabitKurlar.map((x) => [x.paraBirimi, x.kur]), [['EUR', '36']]);
    assert.ok(t.karar?.kurKilidi);
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(t), onaylar: [onayKaydi()] }));
    await ortam!.sahip.tx((db) => db.sorgu("UPDATE satin_alma_karar SET kur_kilidi = now() - interval '8 days' WHERE talep_id = $1", [t.id]));
    // Kilit sunucunundur: gövdedeki kilit okunmaz, veritabanındaki eski kilit geçerlidir.
    const guncel = onayli;
    const red = await siparisVer(guncel, a.id);
    assert.deepEqual([red.statusCode, red.json().mesaj], [422, ILETILER.kurKilidiEski(7)]);
    // Değerlendirmeye alıp yeniden onaya gönderince yeni kilit kurulur; eski onay yetmez, yeni onayla sipariş verilir.
    const geri = tamam<Talep>(await kaydet(c.sa, { ...govde(guncel), durum: 'degerlendirme' }));
    assert.deepEqual([geri.karar?.kurKilidi, geri.karar?.sabitKurlar], [null, []]);
    const yine = tamam<Talep>(await kaydet(c.sa, { ...govde(geri), durum: 'onayda' }));
    assert.ok(Date.parse(yine.karar!.kurKilidi!) > Date.parse(onayli.onaylar[0]!.zaman));
    const kilittenOnce = await siparisVer(yine, a.id);
    assert.deepEqual([kilittenOnce.statusCode, kilittenOnce.json().mesaj], [422, ILETILER.kilittenOnceOnay]);
    const yeniOnay = tamam<Talep>(await kaydet(c.mudur, { ...govde(yine), onaylar: [...yine.onaylar, onayKaydi()] }));
    assert.equal(tamam<Talep>(await siparisVer(yeniOnay, a.id)).durum, 'siparis_verildi');
  });

  test('1096 a: onaydan sonra kur %3ten fazla kayınca sipariş verilmez; değerlendirme sabit kuru ve uyarıyı gösterir', async () => {
    const { t, a } = await onaydaEuro();
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(t), onaylar: [onayKaydi()] }));
    await ortam!.sahip.tx((db) => db.sorgu("UPDATE satin_alma_sabit_kur SET kur = 34 WHERE talep_id = $1 AND para_birimi = 'EUR'", [t.id]));
    const d = tamam<DegerlendirmeCevabi>(await istek(c.mudur, 'GET', `/satin-alma-talepleri/${t.id}/degerlendirme`));
    assert.deepEqual([d.kurKaynagi, d.teklifler[0]?.kur, d.kilitUyarisi], ['sabit', '34', ILETILER.kurKaydi('EUR', '5,9')]);
    const red = await siparisVer(onayli, a.id);
    assert.deepEqual([red.statusCode, red.json().mesaj], [422, ILETILER.kurKaydi('EUR', '5,9')]);
  });

  test('1099 a: teklif satırı iskonto, termin ve en az miktarı saklar; göndermeyen kayıt silmez; toplam ve sipariş miktarı bunlarla', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = { ...teklif(firmaA, [], { iskontoYuzdesi: '10' }), fiyatlar: [{ kalemId: k1, birimFiyat: '10', iskontoYuzdesi: '20', terminGun: 12 }, { kalemId: k2, birimFiyat: '5', enAzMiktar: '6' }] };
    const s1 = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a] }));
    // (10 × 10 × 0,8 + 5 × max(4, 6)) × 0,9 = 99
    assert.equal(s1.teklifler[0]?.ilkToplam, '99');
    const ayrinti = (x: Talep) => x.teklifler[0]!.fiyatlar.map((f) => [f.iskontoYuzdesi, f.terminGun, f.enAzMiktar]);
    assert.deepEqual(ayrinti(s1), [['20', 12, null], [null, null, '6']]);
    const bilmeyen = { ...s1.teklifler[0]!, notlar: 'Ayrıntısız ekran', fiyatlar: s1.teklifler[0]!.fiyatlar.map(({ kalemId, birimFiyat }) => ({ kalemId, birimFiyat })) };
    const s2 = tamam<Talep>(await kaydet(c.sa, { ...govde(s1), teklifler: [bilmeyen] }));
    assert.deepEqual(ayrinti(s2), ayrinti(s1));
    const d = tamam<DegerlendirmeCevabi>(await istek(c.sa, 'GET', `/satin-alma-talepleri/${t.id}/degerlendirme`));
    assert.deepEqual(d.teklifler.map((q) => [q.toplam, q.termin, q.satirlar.map((r) => r.alinanMiktar)]), [['99.00', 12, ['10', '6']]]);
    const ond = tamam<Talep>(await kaydet(c.sa, { ...govde(s2), durum: 'onayda',
      karar: { mod: 'tek', teklifId: a.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] } }));
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(ond), onaylar: [onayKaydi()] }));
    const sip = tamam<Talep>(await siparisVer(onayli, a.id));
    assert.deepEqual(sip.karar?.siparisler[0]?.satirlar.map((r) => [r.kalemId, Number(r.miktar)]), [[k1, 10], [k2, 6]]);
  });

  test('1094 b: değerlendirme ucu teklifleri gören rollere açıktır; talep eden ve işlemsiz 403, olmayan talep 404', async () => {
    const t = await kararli();
    const d = tamam<DegerlendirmeCevabi>(await istek(c.mudur, 'GET', `/satin-alma-talepleri/${t.id}/degerlendirme`));
    assert.deepEqual([d.teklifler.length, d.kurKaynagi, d.oneri, d.karar?.tlToplam], [2, 'sabit', t.karar?.teklifId, '120.00']);
    for (const cerez of [c.talep, c.operator]) assert.equal((await istek(cerez, 'GET', `/satin-alma-talepleri/${t.id}/degerlendirme`)).statusCode, 403);
    assert.equal((await istek(c.sa, 'GET', `/satin-alma-talepleri/${randomUUID()}/degerlendirme`)).statusCode, 404);
  });

  test('1104 a, 1105 a: kalemin kart ayrıntısı görünür; tedarikçiye iç alanlar gitmez; siparişte kart kopyalanır, kart değişince kopya kalır', async () => {
    const kart = (sql: string) => ortam!.sahip.tx((db) => db.sorgu(`UPDATE malzeme_katalog_karti SET ${sql}, surum = surum + 1 WHERE kayit->'com'->>'kod' = 'HM-SAT-00004'`));
    await kart(`kayit = kayit || '{"tol": "h9", "opts": {"durum": "Normalize"}}'::jsonb || jsonb_build_object('com', kayit->'com' || '{"sertifika": ["EN 10204 3.1"], "not": "Deneme iç not", "ted": "Deneme Tedarik A", "moq": 5}'::jsonb)`);
    const { t, a } = await onaydaEuro();
    const ayrinti = async () => tamam<KartAyrintilariCevabi>(await istek(c.sa, 'GET', `/satin-alma-talepleri/${t.id}/kart-ayrintilari`)).kalemler[0]!;
    const once = await ayrinti();
    assert.deepEqual([once.guncel?.tolerans, once.guncel?.sertifikalar, once.guncel?.enAzSiparis, once.siparisler], ['h9', ['EN 10204 3.1'], '5', []]);
    assert.deepEqual(once.tedarikciye.map((x) => x.ad), ['Kalite', 'Tolerans', 'Durum / ısıl işlem', 'İstenen sertifikalar']);
    assert.doesNotMatch(JSON.stringify(once.tedarikciye), /Deneme iç not|Deneme Tedarik A/);
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(t), onaylar: [onayKaydi()] }));
    tamam<Talep>(await siparisVer(onayli, a.id));
    await kart(`kayit = kayit || '{"tol": "h7"}'::jsonb`);
    const sonra = await ayrinti();
    assert.deepEqual([sonra.guncel?.tolerans, sonra.siparisler.map((x) => [x.teklifId, x.kopya.tolerans, x.kartDegisti])], ['h7', [[a.id, 'h9', true]]]);
    assert.equal(sonra.tedarikciye.find((x) => x.ad === 'Tolerans')?.deger, 'h9');
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu("UPDATE satin_alma_siparis_kart_kopyasi SET kart_surumu = 0")), /yalnız ekleme/);
    for (const cerez of [c.talep, c.operator]) assert.equal((await istek(cerez, 'GET', `/satin-alma-talepleri/${t.id}/kart-ayrintilari`)).statusCode, 403);
  });
});

describe('satin-alma SA3 a: ayarlar hiç kaydedilmemiş kurulum (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  const istek = (yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<Cevap> =>
    app.inject({ method: yontem, url: `/api${url}`, payload: payload as object | undefined, headers: yontem === 'POST' ? { cookie: cerez, 'istek-kimligi': randomUUID() } : { cookie: cerez } });
  const ayarlar = async (): Promise<Ayarlar> => {
    const r = await istek('GET', '/satin-alma-acilis');
    assert.equal(r.statusCode, 200, r.body);
    return (r.json() as AcilisCevabi).ayarlar;
  };

  before(async () => {
    ortam = await testVeritabaniKur('satin_alma_kur0');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerez = String(r.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await ortam?.kaldir(); });

  test('SA3 a: ayarlar hiç kaydedilmeden finanstaki USD kuru görünür (finansta faiz yoksa faiz boş); finansta kuru olmayan para birimi görünmez; kur sonradan girilince listeye eklenir', async () => {
    // Yeni kurulumda satin_alma_kur'da yalnız TRY vardır; finansta henüz kur yoktur.
    const bos = await ayarlar();
    assert.deepEqual(bos.kurlar.map((k) => [k.paraBirimi, k.kur]), [['TRY', '1']]);
    assert.equal(bos.kurTarihi, null);
    const kurEkle = async (paraBirimi: string, tarih: string, kur: number) => {
      const r = await istek('POST', '/finans/kurlar/ekle', { paraBirimi, tarih, kur });
      assert.equal(r.statusCode, 200, r.body);
    };
    await kurEkle('USD', '2026-01-02', 40.5);
    const dolu = await ayarlar();
    assert.deepEqual(dolu.kurlar.map((k) => [k.paraBirimi, k.kur]), [['TRY', '1'], ['USD', '40.5']]);
    assert.equal(dolu.kurlar[1]?.aylikFaizYuzdesi, null);
    assert.equal(dolu.kurTarihi, '2026-01-02');
    // Satın almanın para birimi listesinde olmayan döviz (yen) sözleşmeyi bozmaz, listeye girmez.
    await kurEkle('JPY', '2026-01-02', 0.27);
    assert.deepEqual((await ayarlar()).kurlar.map((k) => k.paraBirimi), ['TRY', 'USD']);
  });

  test('SA3 a: ayarlar hiç kaydedilmeden USD teklifi kaydedilir ve satin_alma_kur\'da USD satırı oluşur; ikinci kayıt satırı çoğaltmaz, finansın kuruna yazılmaz; liste dışı para birimi reddedilir', async () => {
    const sahip = ortam!.sahip;
    const sayi = async (tablo: string, kosul = 'true') => Number((await sahip.tx((db) => db.tek<{ n: string }>(`SELECT count(*)::text AS n FROM ${tablo} WHERE ${kosul}`)))!.n);
    assert.equal(await sayi('satin_alma_kur', "para_birimi = 'USD'"), 0);
    const finansSatiri = await sayi('finans_kur');
    const kalemId = randomUUID();
    const talep = { id: randomUUID(), baslik: 'Deneme', birim: null, talepEdenKisiId: null, oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'taslak', iptalNedeni: '', agirliklar: null,
      kalemler: [{ id: kalemId, katalogId: null, ad: 'Kalem', ozellik: '', miktar: '1', birim: 'adet', kategori: '' }], teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [] };
    const teklifi = (paraBirimi: string) => ({ id: randomUUID(), firmaId: null, tedarikciAdi: 'Deneme', teklifTarihi: '2026-01-05', gecerlilik: null, paraBirimi, kur: '40', iskontoYuzdesi: '0', nakliye: '0',
      digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: null, vadeGun: 0, avansYuzdesi: '0', garantiAy: null, teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0, fiyatlar: [{ kalemId, birimFiyat: '1' }] });
    const ac = await istek('POST', '/satin-alma-talepleri/ac', talep);
    assert.equal(ac.statusCode, 200, ac.body);
    const { no: _n, talepEdenAdi: _a, acanKisiId: _k, olusturma: _o, guncelleme: _g, ...g } = ac.json() as Talep;
    // Liste dışı para birimi şemada reddedilir ve satır eklenmez.
    assert.equal((await istek('POST', `/satin-alma-talepleri/${talep.id}/kaydet`, { ...g, durum: 'degerlendirme', teklifler: [teklifi('JPY')] })).statusCode, 400);
    assert.equal(await sayi('satin_alma_kur', "para_birimi = 'JPY'"), 0);
    const ilk = await istek('POST', `/satin-alma-talepleri/${talep.id}/kaydet`, { ...g, durum: 'degerlendirme', teklifler: [teklifi('USD')] });
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal(await sayi('satin_alma_kur', "para_birimi = 'USD'"), 1);
    // Aynı para birimiyle ikinci teklif satırı çoğaltmaz; TRY satırı korunur; finansta faiz yokken USD faizi boştur (937 b).
    const t1 = ilk.json() as Talep;
    const { no: _n2, talepEdenAdi: _a2, acanKisiId: _k2, olusturma: _o2, guncelleme: _g2, ...g2 } = t1;
    const ikinci = await istek('POST', `/satin-alma-talepleri/${talep.id}/kaydet`, { ...g2, teklifler: [...t1.teklifler, teklifi('USD')] });
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.equal(await sayi('satin_alma_kur', "para_birimi = 'USD'"), 1);
    assert.equal(await sayi('satin_alma_kur'), 2);
    assert.equal(await sayi('finans_kur'), finansSatiri);
    assert.equal((await ayarlar()).kurlar.find((k) => k.paraBirimi === 'USD')?.aylikFaizYuzdesi, null);
  });

  test('Borç 38: finansın para birimi yalnız kaydedilmemiş ayarlara önerilir; kaydedilmiş listeden kaldırılan para birimi geri gelmez', async () => {
    assert.equal((await istek('POST', '/finans/kurlar/ekle', { paraBirimi: 'EUR', tarih: '2026-01-02', kur: 44 })).statusCode, 200);
    const once = await ayarlar();
    assert.deepEqual(once.kurlar.map((k) => k.paraBirimi), ['TRY', 'USD', 'EUR']);
    const { kurTarihi: _t, ...g } = once;
    const kayit = await istek('POST', '/satin-alma-ayarlari/kaydet', { ...g, kurlar: once.kurlar.filter((k) => k.paraBirimi !== 'EUR').map((k) => ({ paraBirimi: k.paraBirimi })) });
    assert.equal(kayit.statusCode, 200, kayit.body);
    assert.deepEqual((await ayarlar()).kurlar.map((k) => k.paraBirimi), ['TRY', 'USD']);
  });

  test('937 b: ayar kaydında gelen faiz yok sayılır; finansta faiz yokken faiz boş görünür', async () => {
    const once = await ayarlar();
    const { kurTarihi: _t, ...g } = once;
    const kayit = await istek('POST', '/satin-alma-ayarlari/kaydet', { ...g, kurlar: [{ paraBirimi: 'TRY', aylikFaizYuzdesi: '3.5' }, { paraBirimi: 'USD', aylikFaizYuzdesi: '0.7' }] });
    assert.equal(kayit.statusCode, 200, kayit.body);
    assert.deepEqual((await ayarlar()).kurlar.map((k) => [k.paraBirimi, k.aylikFaizYuzdesi]), [['TRY', null], ['USD', null]]);
  });

  test('937 b: finansta geçerli faiz varsa o görünür, yoksa boş; gelecek tarihli finans faizi sayılmaz', async () => {
    const faizEkle = async (paraBirimi: string, gecerlilikBaslangic: string, aylikYuzde: number) => {
      const r = await istek('POST', '/finans/faizler/ekle', { paraBirimi, gecerlilikBaslangic, aylikYuzde });
      assert.equal(r.statusCode, 200, r.body);
    };
    await faizEkle('USD', '2026-01-01', 1.25);
    await faizEkle('TRY', '2099-01-01', 9);
    const k = (await ayarlar()).kurlar.map((x) => [x.paraBirimi, x.aylikFaizYuzdesi]);
    assert.deepEqual(k, [['TRY', null], ['USD', '1.25']]);
    await faizEkle('USD', '2026-02-01', 1.5);
    assert.equal(Number((await ayarlar()).kurlar.find((x) => x.paraBirimi === 'USD')?.aylikFaizYuzdesi), 1.5);
  });
});
