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
import type { ButceKullanimiCevabi, FaturaEslemesiCevabi, KgFiyatiGecmisiCevabi, KgFiyatlariCevabi, MalzemeSecenekleriCevabi, SatinAlmaOzetiCevabi, SiparisBelgeleriCevabi, SiparisFaturalariCevabi, SiparisTakibiCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import type { BeklenenOdemelerCevabi, TedarikciAlacagi, TedarikciAlacaklariCevabi } from '#paylasilan/sozlesme/finans.ts';
import type { BildirimListeCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  karsilamaLogoSonucu, logoyaGidecekKarsilamalar, logoyaGidecekSiparisler, logoyaGidecekTalepler, logoyaGuncellemeGidecekSiparisler, logoyaKapatmaGidecekSiparisler, siparisLogoKapatmaSonucu, logoyaBekletmeGidecekSiparisler, siparisLogoBekletmeSonucu, logoyaIptalGidecekSiparisler, malKabulFiyatlari, malzemeGelisTarihleri, ortalamaAlisFiyatlari, siparisSatiriBelgeleri, siparisLogoGuncellemeSonucu, siparisLogoIptalSonucu, siparisLogoSonucu, siparisSatirlari, sonAlisFiyatlari, talepLogoSonucu, teslimGeriAl, teslimIsle, siparisSatirlarininEmri, isEmriFasonTutarlari, siparisBirimFiyatlari,
} from './disari.ts';
import { uclar } from './uclar.ts';
import * as servis from './servis.ts';
import { tedarikciOnayDurumlari } from '../kalite-merkezi/disari.ts';
import { ILETILER, karneTeslimOlayi, talepEdenGorunumu } from './kurallar.ts';
import { kablola } from '../../kablolama.ts';
import { takvimKayitlari } from './disari.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { acikTalepMiktarlari, siparisOdemeKosullari, terminKalemleriOku } from './sorgular.ts';
import * as sorgu from './sorgular.ts';

const PAROLA = 'dogru-parola-1';
type Cevap = Awaited<ReturnType<FastifyInstance['inject']>>;
describe('satin-alma sürüm 6 (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c: Record<'yonetici' | 'sa' | 'mudur' | 'depo' | 'talep' | 'talep2' | 'operator' | 'samuduru', string> = {
    yonetici: '', sa: '', mudur: '', depo: '', talep: '', talep2: '', operator: '', samuduru: '',
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
  // 2413 a: iptalden dönüş yalnız gerekçeli komutla.
  const iptalGeriAl = (cerez: string, t: Talep, gerekce = 'Yanlışlıkla iptal') => istek(cerez, 'POST', `/satin-alma-talepleri/${t.id}/iptali-geri-al`, { gerekce, surum: t.surum });
  // Kataloğa bağlanacak kart satın almanın arama ucundan bulunur; aktif olmayan kart aramada yoktur, sayı kimliği veritabanından okunur.
  const secenek = async (kod: string) => tamam<MalzemeSecenekleriCevabi>(await istek(c.sa, 'GET', `/satin-alma-malzeme-secenekleri?ara=${kod}`)).malzemeler.find((m) => m.kod === kod)!;
  const kartNo = async (kod: string, aktif = true): Promise<number> => aktif ? (await secenek(kod)).no
    : (await ortam!.sahip.tx((db) => db.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kayit->'com'->>'kod' = $1", [kod])))!.no;

  // Satın almanın teklif girip tek tedarikçiye karar verdiği talep.
  async function kararli(acan = c.talep, alan: Partial<TalepGovdesi> = {}): Promise<Talep> {
    const t = tamam<Talep>(await istek(acan, 'POST', '/satin-alma-talepleri/ac', yeniTalep(alan)));
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

  // 2455-2 a: kg fiyatı yalnız kartlarda kullanılan kalite + forma girilir; testin kalitesi aktif hammadde kartıyla açılır.
  let kaliteKartiSirasi = 0;
  const kaliteKarti = async (kalite: string, form: string | null, birim = 'kg', ek: Record<string, unknown> = {}): Promise<number> => {
    kaliteKartiSirasi += 1;
    const kimlik = `sa-kalite-${String(kaliteKartiSirasi)}`;
    await ortam!.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SAKG-', 0) ON CONFLICT (onek) DO NOTHING");
    return (await ortam!.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'SAKG-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [kimlik, 9000 + kaliteKartiSirasi, JSON.stringify({ id: kimlik, grade: kalite, ...(form === null ? {} : { form }), com: { ad: `Deneme ${kalite}`, birim }, ...ek }), yoneticiId],
    ))!.no;
  };

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

  test('SAT-82 (2883, 2871-1 a): talep eden talebin kendisini yalnız taslakta değiştirir; teklif istendikten sonra 403, kayıt değişmez; satın alma değiştirir', async () => {
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    // Taslakta değiştirip teklif istemeye göndermek serbesttir.
    const gonder = tamam<Talep>(await kaydet(c.talep, { ...govde(t), baslik: 'Deneme taslak düzeltme', durum: 'teklif_isteniyor' }));
    const kalem = { ...gonder.kalemler[0]!, miktar: '99' };
    for (const degisik of [{ notlar: 'Deneme sonradan' }, { baslik: 'Deneme sonradan' }, { kalemler: [kalem, ...gonder.kalemler.slice(1)] }]) {
      const red = await kaydet(c.talep, { ...govde(gonder), ...degisik });
      assert.equal(red.statusCode, 403, red.body);
    }
    const satir = await ortam!.sahip.tek<{ surum: number; baslik: string }>('SELECT surum, baslik FROM satin_alma_talep WHERE id = $1', [t.id]);
    assert.deepEqual([satir!.surum, satir!.baslik], [gonder.surum, 'Deneme taslak düzeltme']);
    // Değişmeden kaydetmek serbesttir; satın alma (satin-alma.yaz) talebi düzeltir.
    assert.equal((await kaydet(c.talep, govde(gonder))).statusCode, 200);
    const tam = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.find((x) => x.id === t.id)!;
    const sa = tamam<Talep>(await kaydet(c.sa, { ...govde(tam), notlar: 'Deneme satın alma notu' }));
    assert.equal(sa.notlar, 'Deneme satın alma notu');
  });

  // 2876: satın almanın gördüğü bütün talep; teklif isteme, karar, onay ve sipariş adımları.
  const satinAlmaGorur = async (id: string) => tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.find((x) => x.id === id)!;
  const teklifIste = async (t: Talep) =>
    tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'teklif_isteniyor', teklifIstekleri: [{ firmaId: firmaA, gonderim: '2026-10-05', sonTarih: null }] }));
  async function siparise(t: Talep, siparisNo: string): Promise<Talep> {
    const a = teklif(firmaA, t.kalemler.map((k): [string, string] => [k.id, '10']));
    const deg = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a] }));
    const ond = tamam<Talep>(await kaydet(c.sa, { ...govde(deg), durum: 'onayda', teklifler: [a],
      karar: { mod: 'tek', teklifId: a.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] } }));
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(ond), onaylar: [onayKaydi()] }));
    const siparis = { teklifId: a.id, siparisNo, siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' };
    return tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi', karar: { ...onayli.karar!, siparisler: [siparis] } }));
  }
  const guncellemeAc = (cerez: string, t: { id: string; surum: number; kalemler: { id: string }[] }, ek: Record<string, unknown> = {}) =>
    istek(cerez, 'POST', `/satin-alma-talepleri/${t.id}/guncelleme-ac`, {
      id: randomUUID(), surum: t.surum, ihtiyacTarihi: '2026-11-20', aciklama: 'Deneme güncelleme',
      kalemler: [{ id: t.kalemler[0]!.id, miktar: '12', aciklama: 'Deneme ölçü' }, { id: t.kalemler[1]!.id, miktar: '4' }], ...ek,
    });

  test('SAT-80 (2876): teklif toplanırken sahibi güncelleme talebi açar; eski talep ve teklif istekleri değişmez; grup iki tarafta, zincir köke bağlanır', async () => {
    const kok = await teklifIste(tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep())));
    const r = await guncellemeAc(c.talep, kok);
    const g = tamam<Talebim>(r);
    assert.deepEqual([g.durum, g.aciklama, g.ihtiyacTarihi?.slice(0, 10), g.kalemler.map((k) => [k.ad, k.miktar, k.aciklama])],
      ['taslak', 'Deneme güncelleme', '2026-11-20', [['Deneme rulman', '12', 'Deneme ölçü'], ['Deneme kayış', '4', '']]]);
    assert.notEqual(g.kalemler[0]!.id, kok.kalemler[0]!.id);
    assert.deepEqual(g.guncellemeGrubu?.map((x) => [x.no, x.kok]), [[kok.no, true], [g.no, false]]);
    assert.doesNotMatch(r.body, SIZINTI);
    const eski = await satinAlmaGorur(kok.id);
    assert.deepEqual([eski.durum, eski.kalemler.map((k) => k.miktar), eski.teklifIstekleri.map((x) => x.firmaId), eski.guncellemeGrubu?.length],
      ['teklif_isteniyor', ['10', '4'], [firmaA], 2]);
    assert.match(eski.hareketler.at(-1)!.metin, new RegExp(`Güncelleme talebi açıldı: ${g.no}`));
    const yeni = await satinAlmaGorur(g.id);
    assert.deepEqual([yeni.talepEdenKisiId, yeni.kalemler.map((k) => k.katalogId)], [kisi.talep, [KATALOG, KATALOG]]);
    const benim = tamam<TaleplerimCevabi>(await istek(c.talep, 'GET', '/satin-alma-taleplerim?sinir=500')).talepler;
    assert.deepEqual([benim.find((x) => x.id === kok.id)?.guncellemeGrubu?.length, benim.find((x) => x.id === kok.id)?.guncellenebilir], [2, true]);
    // Güncellemenin güncellemesi de köke bağlanır (zincir yok).
    const ikinci = tamam<Talebim>(await guncellemeAc(c.talep, await teklifIste(yeni)));
    assert.deepEqual(ikinci.guncellemeGrubu?.map((x) => x.no), [kok.no, g.no, ikinci.no]);
  });

  test('SAT-80 (2876): yasak: başkası 403, yetkisiz 403, taslak ve onaydaki talep 422, bağlı kalemli talep 422, eski sürüm 409, olmayan kalem 422', async () => {
    const taslak = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const red = (r: Cevap) => [r.statusCode, (r.json() as { mesaj: string }).mesaj];
    assert.deepEqual(red(await guncellemeAc(c.talep, taslak)), [422, ILETILER.guncellemeAsamasi]);
    const kok = await teklifIste(taslak);
    assert.deepEqual(red(await guncellemeAc(c.talep2, kok)), [403, ILETILER.talebimSahibiDegil]);
    assert.equal((await guncellemeAc(c.operator, kok)).statusCode, 403);
    assert.equal((await guncellemeAc(c.talep, { ...kok, surum: kok.surum - 1 })).statusCode, 409);
    assert.deepEqual(red(await guncellemeAc(c.talep, kok, { kalemler: [{ id: randomUUID(), miktar: '1' }] })), [422, ILETILER.talebimKalemYok]);
    const onayda = await kararli();
    assert.deepEqual(red(await guncellemeAc(c.talep, onayda)), [422, ILETILER.guncellemeAsamasi]);
    await ortam!.sahip.sorgu('UPDATE satin_alma_talep_kalemi SET uygulanan_malzeme_no = $2 WHERE id = $1', [kok.kalemler[0]!.id, await kartNo('HM-SAT-00001')]);
    assert.deepEqual(red(await guncellemeAc(c.talep, kok)), [422, ILETILER.guncellemeBagli]);
    const sayi = await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_talep WHERE guncellenen_talep_id = $1', [kok.id]);
    assert.equal(sayi!.n, 0);
    // Göç: talep kendisinin güncellemesi olamaz; olmayan talebe bağlanamaz.
    await assert.rejects(ortam!.sahip.sorgu('UPDATE satin_alma_talep SET guncellenen_talep_id = id WHERE id = $1', [kok.id]), kisitla('satin_alma_talep_guncellenen_kendisi_degil'));
    await assert.rejects(ortam!.sahip.sorgu('UPDATE satin_alma_talep SET guncellenen_talep_id = $2 WHERE id = $1', [kok.id, randomUUID()]), kisitla('satin_alma_talep_guncellenen'));
  });

  test('2876 (Veri): güncellemesi olan kök taslağa dönmez ve silinmez; kısıt yine de açık iletiyle karşılanır; güncelleme taslağı silinir', async () => {
    const kok = await teklifIste(tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep())));
    const g = tamam<Talebim>(await guncellemeAc(c.talep, kok));
    const sil = (t: { id: string; surum: number }) => istek(c.sa, 'POST', `/satin-alma-talepleri/${t.id}/sil`, { surum: t.surum });
    const red = (r: Cevap) => [r.statusCode, (r.json() as { mesaj: string }).mesaj];
    assert.equal((await kaydet(c.sa, { ...govde(await satinAlmaGorur(kok.id)), durum: 'taslak' })).statusCode, 422);
    assert.deepEqual(red(await sil(await satinAlmaGorur(kok.id))), [422, ILETILER.yalnizTaslakSilinir]);
    // Kural dışı bir yolla taslağa dönmüş olsa bile 500 değil, açık iletili çakışma (409).
    await ortam!.sahip.sorgu("UPDATE satin_alma_talep SET durum = 'taslak' WHERE id = $1", [kok.id]);
    assert.deepEqual(red(await sil(await satinAlmaGorur(kok.id))), [409, ILETILER.guncellemesiOlanSilinmez]);
    assert.equal((await sil(await satinAlmaGorur(g.id))).statusCode, 200);
  });

  test('2876 (Maliyet E1): plan ön talebinde güncelleme grubunun yalnız en yeni açık talebi sayılır; güncelleme iptal olunca eskisi sayılır', async () => {
    const no = (await ortam!.sahip.tek<{ n: number }>('SELECT malzeme_no AS n FROM satin_alma_katalog WHERE id = $1', [KATALOG]))!.n;
    const acik = async () => Number((await vt().tx((db) => acikTalepMiktarlari(db, [no]))).find((x) => x.birim === 'adet')?.miktar ?? 0);
    const once = await acik();
    const kok = await teklifIste(tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep())));
    assert.equal(await acik(), once + 14);
    const g = tamam<Talebim>(await guncellemeAc(c.talep, kok));
    assert.equal(await acik(), once + 16);
    const yeni = await satinAlmaGorur(g.id);
    tamam(await kaydet(c.sa, { ...govde(yeni), durum: 'iptal', iptalNedeni: 'Deneme vazgeçildi' }));
    assert.equal(await acik(), once + 14);
  });

  test('2876 (Güvenlik N1): var olan bir talebin kimliğiyle güncelleme açılmaz (409); o talep gruba bağlanmaz', async () => {
    const kok = await teklifIste(tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep())));
    const baskasi = tamam<Talep>(await istek(c.talep2, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    assert.equal((await guncellemeAc(c.talep, kok, { id: baskasi.id })).statusCode, 409);
    const satir = await ortam!.sahip.tek<{ g: string | null }>('SELECT guncellenen_talep_id AS g FROM satin_alma_talep WHERE id = $1', [baskasi.id]);
    assert.equal(satir!.g, null);
  });

  test('SAT-81 (2871-2 a): güncelleme siparişe geçince eski talep kendiliğinden iptal olur, geri alınır; siparişteki talep iptal edilmez', async () => {
    const kok = await teklifIste(tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep())));
    const g = tamam<Talebim>(await guncellemeAc(c.talep, kok));
    const siparisli = await siparise(await satinAlmaGorur(g.id), 'SA-GUNCEL-1');
    assert.equal(siparisli.durum, 'siparis_verildi');
    const iptal = await satinAlmaGorur(kok.id);
    assert.deepEqual([iptal.durum, iptal.iptalNedeni], ['iptal', ILETILER.guncellemeIptali(g.no)]);
    assert.match(iptal.hareketler.at(-1)!.metin, /kendiliğinden iptal/);
    // Geri alınır; sonra eski talep de siparişe geçerse siparişteki güncelleme iptal edilmez (satın alma bilerek ikinci alımı yapmıştır).
    const geri = tamam<{ talep: Talep; durum: string }>(await iptalGeriAl(c.sa, iptal, 'Deneme ikisi de alınacak'));
    assert.equal(geri.durum, 'teklif_isteniyor');
    assert.equal(geri.talep.hareketler.at(-1)!.metin, ILETILER.grupSipariste([{ no: g.no, durum: 'siparis_verildi' }]));
    await siparise(geri.talep, 'SA-GUNCEL-2');
    assert.equal((await satinAlmaGorur(g.id)).durum, 'siparis_verildi');
  });

  test('SAT-81 (2871-2 a): eski talep siparişe geçince açık güncelleme talebi iptal olur', async () => {
    const kok = await teklifIste(tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep())));
    const g = tamam<Talebim>(await guncellemeAc(c.talep, kok));
    await siparise(kok, 'SA-GUNCEL-3');
    const iptal = await satinAlmaGorur(g.id);
    assert.deepEqual([iptal.durum, iptal.iptalNedeni], ['iptal', ILETILER.guncellemeIptali(kok.no)]);
    const benim = tamam<TaleplerimCevabi>(await istek(c.talep, 'GET', '/satin-alma-taleplerim?sinir=500')).talepler.find((x) => x.id === g.id)!;
    assert.deepEqual(benim.guncellemeGrubu?.map((x) => [x.no, x.durum]), [[kok.no, 'siparis_verildi'], [g.no, 'iptal']]);
  });

  test('2876 (Maliyet N1): grubun güncellemesi teslim alınmışsa iptali geri alınan eski talebin geçmişine ikinci alım uyarısı yazılır', async () => {
    const kok = await teklifIste(tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep())));
    const g = tamam<Talebim>(await guncellemeAc(c.talep, kok));
    const siparisli = await siparise(await satinAlmaGorur(g.id), 'SA-GUNCEL-4');
    let no = 8761;
    for (const satir of siparisli.karar!.siparisler[0]!.satirlar) await teslimEt(satir.id, satir.miktar, no++);
    assert.equal((await satinAlmaGorur(g.id)).durum, 'teslim_alindi');
    // Grup görünen durumu taşır: "teslim alındı" yazılmaz, siparişten türetilir; kökün ve Taleplerim'in grubunda da öyle görünür.
    assert.deepEqual((await satinAlmaGorur(kok.id)).guncellemeGrubu?.map((x) => [x.no, x.durum]), [[kok.no, 'iptal'], [g.no, 'teslim_alindi']]);
    const benim = tamam<TaleplerimCevabi>(await istek(c.talep, 'GET', '/satin-alma-taleplerim?sinir=500')).talepler.find((x) => x.id === kok.id)!;
    assert.deepEqual(benim.guncellemeGrubu?.map((x) => x.durum), ['iptal', 'teslim_alindi']);
    const geri = tamam<{ talep: Talep }>(await iptalGeriAl(c.sa, await satinAlmaGorur(kok.id), 'Deneme ikinci alım bilerek'));
    assert.equal(geri.talep.hareketler.at(-1)!.metin, ILETILER.grupSipariste([{ no: g.no, durum: 'teslim_alindi' }]));
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
          { teklifId: b.id, siparisNo: 'SA-2', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' }] },
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

  test('2432: onay bekliyor görevi karar verilince (onay ya da ret) bütün onaylayanlarda kapanır', async () => {
    const yapildi = async (id: string) => (await ortam!.sahip.sorgu<{ yapildi: Date | null }>(
      'SELECT yapildi FROM bildirim_kaydi WHERE tekil_anahtar = $1', [`satin-alma.talep-onay-bekliyor:${id}`])).map((r) => r.yapildi !== null);
    const onayda = await kararli();
    assert.ok((await yapildi(onayda.id)).length > 0);
    assert.ok((await yapildi(onayda.id)).every((x) => !x));
    tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay', dortGozsuz: false, notlar: '' }] }));
    assert.ok((await yapildi(onayda.id)).every((x) => x));
    const ikinci = await kararli();
    tamam<Talep>(await kaydet(c.mudur, { ...govde(ikinci), durum: 'degerlendirme', onaylar: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'ret', dortGozsuz: false, notlar: 'Fiyat yüksek' }] }));
    assert.ok((await yapildi(ikinci.id)).length > 0);
    assert.ok((await yapildi(ikinci.id)).every((x) => x));
  });

  test('2432: durum zamanı yalnız durum değişince yenilenir', async () => {
    const zaman = async (id: string) => (await ortam!.sahip.tek<{ z: string }>('SELECT durum_zamani::text AS z FROM satin_alma_talep WHERE id = $1', [id]))!.z;
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    await ortam!.sahip.sorgu("UPDATE satin_alma_talep SET durum_zamani = now() - interval '3 days' WHERE id = $1", [t.id]);
    const once = await zaman(t.id);
    const ayni = tamam<Talep>(await kaydet(c.sa, { ...govde(t), baslik: 'Deneme talep 2' }));
    assert.equal(await zaman(t.id), once);
    tamam<Talep>(await kaydet(c.sa, { ...govde(ayni), durum: 'degerlendirme' }));
    assert.notEqual(await zaman(t.id), once);
  });

  test('2432: hatırlatma bir kez açılır, okunsa da yinelenmez; koşul kalkınca kayıt ve bildirim kapanır', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ ihtiyacTarihi: null })));
    await ortam!.sahip.sorgu("UPDATE satin_alma_talep SET durum_zamani = now() - interval '10 days' WHERE id = $1", [t.id]);
    const tur = 'satin-alma.hatirlatma-taslak-bekliyor';
    const kayitlar = () => ortam!.sahip.sorgu<{ acik: boolean }>('SELECT kapandi IS NULL AS acik FROM satin_alma_hatirlatma WHERE talep_id = $1 AND tur = $2', [t.id, tur]);
    const bildirimler = () => ortam!.sahip.sorgu<{ kisi: number; yapildi: boolean }>(
      "SELECT kisi_id AS kisi, yapildi IS NOT NULL AS yapildi FROM bildirim_kaydi WHERE tur = $1 AND tekil_anahtar LIKE $2", [tur, `${tur}:${t.id}:%`]);
    await vt().tx((db) => servis.hatirlatmalariYenile(db));
    assert.deepEqual(await kayitlar(), [{ acik: true }]);
    const ilk = await bildirimler();
    assert.ok(ilk.some((b) => b.kisi === kisi.sa), 'satın alma alır');
    assert.ok(!ilk.some((b) => b.kisi === kisi.talep), 'talep eden almaz');
    await ortam!.sahip.sorgu('UPDATE bildirim_kaydi SET okundu = now() WHERE tur = $1', [tur]);
    await vt().tx((db) => servis.hatirlatmalariYenile(db));
    assert.equal((await bildirimler()).length, ilk.length);
    tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme' }));
    await vt().tx((db) => servis.hatirlatmalariYenile(db));
    assert.deepEqual(await kayitlar(), [{ acik: false }]);
    assert.ok((await bildirimler()).every((b) => b.yapildi));
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

  test('2975: kademeli fiyat; toplam alınan miktarın basamağından, gönderilmeyen basamak korunur, boş liste siler', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const toplam = async (teklifId: string) => (await vt().tx((db) => db.tek<{ t: string }>(
      'SELECT satin_alma_teklif_toplami($1, $2)::text AS t', [t.id, teklifId])))!.t;
    // k1 10 adet: 10 ve üstü 8 TL basamağı; k2 4 adet, 10 ve üstü basamağın altında kalır, taban 5 TL. 10 × 8 + 4 × 5 = 100.
    const a = teklif(firmaA, [[k1, '10'], [k2, '5']]);
    a.fiyatlar = [{ kalemId: k1, birimFiyat: '10', basamaklar: [{ esik: '10', birimFiyat: '8' }] } as never, { kalemId: k2, birimFiyat: '5', basamaklar: [{ esik: '10', birimFiyat: '1' }] } as never];
    const s1 = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a] }));
    assert.deepEqual([s1.teklifler[0]?.ilkToplam, await toplam(a.id)], ['100', '100.0000']);
    assert.deepEqual(s1.teklifler[0]?.fiyatlar.map((f) => f.basamaklar), [[{ esik: '10', birimFiyat: '8' }], [{ esik: '10', birimFiyat: '1' }]]);
    // Basamağı bilmeyen ekran alanı göndermez: basamak silinmez.
    const s2 = tamam<Talep>(await kaydet(c.sa, { ...govde(s1), teklifler: [{ ...s1.teklifler[0]!, fiyatlar: [{ kalemId: k1, birimFiyat: '10' }, { kalemId: k2, birimFiyat: '5' }] }] }));
    assert.equal(await toplam(a.id), '100.0000');
    // 2974-1 a: en az miktar ilk basamağın eşiğidir; üst basamak onun üstünde olur. En az 15 ise alınan 15'tir, 20 ve üstü
    // basamağın altında kalır, taban 10 TL: 15 × 10 + 4 × 5 = 170.
    const s3 = tamam<Talep>(await kaydet(c.sa, { ...govde(s2), teklifler: [{ ...s2.teklifler[0]!, fiyatlar: [
      { kalemId: k1, birimFiyat: '10', enAzMiktar: '15', basamaklar: [{ esik: '20', birimFiyat: '7' }, { esik: '30', birimFiyat: '6' }] }, { kalemId: k2, birimFiyat: '5', basamaklar: [] }] }] }));
    assert.equal(await toplam(a.id), '170.0000');
    assert.deepEqual(s3.teklifler[0]?.fiyatlar.map((f) => f.basamaklar?.length), [2, 0]);
    // Eşiği en az miktarda ya da altında olan üst basamak reddedilir; gönderilmeyen (korunan) en az miktar da sayılır.
    const red = (r: Cevap) => [r.statusCode, (r.json() as { mesaj: string }).mesaj];
    assert.deepEqual(red(await kaydet(c.sa, { ...govde(s3), teklifler: [{ ...s3.teklifler[0]!, fiyatlar: [
      { kalemId: k1, birimFiyat: '10', enAzMiktar: '20', basamaklar: [{ esik: '10', birimFiyat: '8' }, { esik: '20', birimFiyat: '7' }] }] }] })), [422, ILETILER.basamakEnAz]);
    assert.deepEqual(red(await kaydet(c.sa, { ...govde(s3), teklifler: [{ ...s3.teklifler[0]!, fiyatlar: [
      { kalemId: k1, birimFiyat: '10', basamaklar: [{ esik: '15', birimFiyat: '8' }] }] }] })), [422, ILETILER.basamakEnAz]);
    assert.equal(await toplam(a.id), '170.0000');
    // Aynı eşik iki kez ve beşinci basamak reddedilir.
    const cift = await kaydet(c.sa, { ...govde(s3), teklifler: [{ ...s3.teklifler[0]!, fiyatlar: [{ kalemId: k1, birimFiyat: '10', basamaklar: [{ esik: '20', birimFiyat: '7' }, { esik: '20.0', birimFiyat: '6' }] }] }] });
    assert.equal(cift.statusCode, 400);
    const bes = await kaydet(c.sa, { ...govde(s3), teklifler: [{ ...s3.teklifler[0]!, fiyatlar: [{ kalemId: k1, birimFiyat: '10',
      basamaklar: ['11', '12', '13', '14', '15'].map((esik) => ({ esik, birimFiyat: '6' })) }] }] });
    assert.equal(bes.statusCode, 400);
  });

  test('2975 (Veri): basamaksız teklifte toplam fonksiyonu eski gövdeyle birebir aynı sonucu verir', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10.1234'], [k2, '5']], { iskontoYuzdesi: '7.5', nakliyeDahil: false, nakliye: '15.25', digerMasraf: '2' });
    a.fiyatlar = [{ kalemId: k1, birimFiyat: '10.1234', iskontoYuzdesi: '3', enAzMiktar: '12' } as never, { kalemId: k2, birimFiyat: '5' } as never];
    const b = teklif(firmaB, [[k1, '11'], [k2, '4.5']], { nakliyeDahil: true, nakliye: '99' });
    tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a, b] }));
    // 20261028100000 gövdesi, basamak öncesi.
    const eski = `SELECT round(
        COALESCE((SELECT sum(s.birim_fiyat * GREATEST(k.miktar, s.en_az_miktar) * (1 - COALESCE(s.iskonto_yuzdesi, 0) / 100))
                    FROM satin_alma_teklif_satiri s JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
                   WHERE s.talep_id = q.talep_id AND s.teklif_id = q.id), 0) * (1 - q.iskonto_yuzdesi / 100)
        + CASE WHEN q.nakliye_dahil THEN 0 ELSE q.nakliye END + q.diger_masraf, 4)::text AS eski,
      satin_alma_teklif_toplami(q.talep_id, q.id)::text AS yeni
      FROM satin_alma_teklif q WHERE q.talep_id = $1 ORDER BY q.sira`;
    const satirlar = await vt().tx((db) => db.sorgu<{ eski: string; yeni: string }>(eski, [t.id]));
    assert.equal(satirlar.length, 2);
    for (const r of satirlar) assert.equal(r.yeni, r.eski);
  });

  test('2975 (Veri): kilitli talepte basamak değişmez; basamağa dokunmayan kayıt geçer', async () => {
    const t = await kararli();
    assert.equal(t.durum, 'onayda');
    const red = (r: Cevap) => [r.statusCode, (r.json() as { mesaj: string }).mesaj];
    const [q0, ...diger] = t.teklifler;
    const degisik = { ...q0!, fiyatlar: q0!.fiyatlar.map((f, i) => (i === 0 ? { ...f, basamaklar: [{ esik: '10', birimFiyat: '1' }] } : f)) };
    assert.deepEqual(red(await kaydet(c.sa, { ...govde(t), teklifler: [degisik, ...diger] })), [422, ILETILER.kilitliBasamak]);
    tamam<Talep>(await kaydet(c.sa, { ...govde(t), notlar: 'Basamak aynı' }));
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

  test('#375 SAT-53 b: talep edenin erişebildiği her uç teklif, fiyat, karar ve ayar vermez; teklif istenen tedarikçi görünür; satın almanın teklifi korunur', async () => {
    // Açma cevabı: talep eden yalnız kendi yazdığı geçmişi görür.
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    assert.doesNotMatch(JSON.stringify({ ...t, teklifler: undefined, teklifIstekleri: undefined, karar: undefined }), /Deneme Tedarik/);
    assert.deepEqual([t.teklifler, t.teklifIstekleri, t.karar], [[], [], null]);
    // Satın alma teklif isterken teklifi girer; talep eden aynı durumda talebi gördüğü gibi kaydeder. Cevapta teklif ve karar yoktur;
    // teklif istenen tedarikçi (2429-ekran b) görünür ve talep eden onu gördüğü gibi geri gönderir. Notu değiştiremez (SAT-82).
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10'], [k2, '5']]);
    const sa = tamam<Talep>(await kaydet(c.sa, {
      ...govde(t), durum: 'teklif_isteniyor', teklifler: [a], teklifIstekleri: [{ firmaId: firmaA, gonderim: '2026-10-05', sonTarih: null }],
      hareketler: [...t.hareketler, { id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, metin: '1 tedarikçiden teklif istendi: Deneme Tedarik A' }],
    }));
    const benim = tamam<Talep>(await kaydet(c.talep, {
      ...govde(t), durum: 'teklif_isteniyor', teklifIstekleri: sa.teklifIstekleri, surum: sa.surum,
    }));
    assert.equal((await kaydet(c.talep, { ...govde(t), durum: 'teklif_isteniyor', notlar: 'Deneme düzeltme', teklifIstekleri: sa.teklifIstekleri, surum: benim.surum })).statusCode, 403);
    assert.deepEqual([benim.teklifler, benim.teklifIstekleri.map((q) => q.firmaId), benim.karar, benim.hareketler.map((h) => h.metin)], [[], [firmaA], null, ['Talep açıldı']]);
    // Talep eden teklif istenen tedarikçiyi değiştiremez.
    assert.equal((await kaydet(c.talep, { ...govde(t), durum: 'teklif_isteniyor', teklifIstekleri: [], surum: benim.surum })).statusCode, 403);
    assert.doesNotMatch(JSON.stringify(benim.hareketler), /Deneme Tedarik/);
    const tam = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).talepler.find((x) => x.id === t.id)!;
    assert.deepEqual([tam.teklifler.map((q) => q.id), tam.notlar], [[a.id], t.notlar]);
    // Kart arama, katalog kaydı ve menü sayaçları fiyat, tedarikçi ve ayar taşımaz.
    const sec = tamam<MalzemeSecenekleriCevabi>(await istek(c.talep, 'GET', '/satin-alma-malzeme-secenekleri?ara=HM-SAT'));
    // SAT-78 (2871): stok birimi ve birim ağırlık kartın fiziksel bilgisidir, fiyat değildir.
    assert.deepEqual(Object.keys(sec.malzemeler[0]!).sort(), ['ad', 'birim', 'birimKg', 'hammadde', 'katalogId', 'kategori', 'kod', 'no', 'stokBirimi']);
    const kat = tamam<KatalogKaydi>(await istek(c.talep, 'POST', '/satin-alma-katalogu/kaydet', {
      id: randomUUID(), malzemeNo: await kartNo('HM-SAT-00002'), ozellik: '', notlar: '', takmaAdlari: [], surum: null,
    }));
    assert.doesNotMatch(JSON.stringify(kat), SIZINTI);
    const sayac = tamam<Record<string, number | null>>(await istek(c.talep, 'GET', '/satin-alma-menu-sayaclari'));
    assert.equal(Object.values(sayac).every((n) => n === null), true);
  });

  test('Borç 39 K-058 SAT-53 b: kararlı talepte talep edenin her cevabı kararsız ve teklifsizdir; seçilen tedarikçi görünür, fiyat ve gerekçe görünmez', async () => {
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10'], [k2, '5']]);
    const kararli = tamam<Talep>(await kaydet(c.sa, {
      ...govde(t), durum: 'teklif_isteniyor', teklifler: [a],
      karar: { mod: 'tek', teklifId: a.id, bolunme: [], gerekce: 'Deneme gerekçe', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
    }));
    assert.equal(kararli.karar?.teklifId, a.id);
    // SAT-82: teklif istendikten sonra talep eden talebi yalnız gördüğü gibi kaydedebilir.
    const benim = await kaydet(c.talep, { ...govde(t), durum: 'teklif_isteniyor', surum: kararli.surum });
    const g = tamam<Talep>(benim);
    assert.deepEqual([g.notlar, g.karar, g.teklifler, g.senaryolar, g.secilenTedarikciler], [t.notlar, null, [], [], [{ firmaId: firmaA, ad: 'Deneme Tedarik A' }]]);
    assert.doesNotMatch(benim.body, /"birimFiyat"|"teklifId"|"tlToplam"|Deneme gerekçe/);
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
    const govde = () => ({ id: randomUUID(), tur: 'malzeme' as const, ihtiyacTarihi: null, aciklama: '', uretimEmriId: null, kalemler: [{ malzemeNo: no5, ad: '', birim: '', miktar: '1', aciklama: '', uygulananMalzemeNo: null, isEmriId: null, partiId: null, konumId: null }] });
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
    const siparis = { teklifId: a.id, siparisNo: 'SA-KARTSIZ', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' };
    const red = await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi', karar: { ...onayli.karar!, siparisler: [siparis] } });
    assert.deepEqual([red.statusCode, red.json().mesaj], [422, ILETILER.kartsizSiparis(['Deneme serbest'])]);
    const bagli = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), kalemler: onayli.kalemler.map((k) => ({ ...k, katalogId: KATALOG })) }));
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(bagli), durum: 'siparis_verildi', karar: { ...bagli.karar!, siparisler: [siparis] } }));
    assert.equal(s.durum, 'siparis_verildi');
  });

  test('1647: sipariş satırı ilk yazıldığında yürürlükteki parça revizyonunu alır; sonraki kayıt değiştirmez; satır okuması taşır', async () => {
    let revizyon = 'B';
    servis.parcaRevizyonuCozucusuKaydet(async (_db, nolar) => new Map(nolar.map((n) => [n, revizyon])));
    try {
      const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ kalemler: [kalem('Deneme revizyonlu')] })));
      const [k1] = t.kalemler.map((k) => k.id) as [string];
      const a = teklif(firmaA, [[k1, '10']]);
      const deg = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a] }));
      const ond = tamam<Talep>(await kaydet(c.sa, { ...govde(deg), durum: 'onayda', teklifler: [a],
        karar: { mod: 'tek', teklifId: a.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] } }));
      const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(ond), onaylar: [onayKaydi()] }));
      const siparis = { teklifId: a.id, siparisNo: 'SA-REV', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' };
      const s = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi', karar: { ...onayli.karar!, siparisler: [siparis] } }));
      const satir = async () => (await vt().tek<{ id: number; rev: string | null }>(
        'SELECT id, parca_revizyonu AS rev FROM satin_alma_siparis_satiri WHERE talep_id = $1', [t.id]))!;
      assert.equal((await satir()).rev, 'B');
      revizyon = 'C';
      tamam<Talep>(await kaydet(c.sa, { ...govde(s), notlar: 'Deneme yeniden kayıt' }));
      const { id } = await satir();
      assert.equal((await satir()).rev, 'B');
      const [okunan] = await vt().tx((db) => servis.siparisSatirlari(db, [id]));
      assert.deepEqual([okunan?.parcaRevizyonu, okunan?.isEmriId], ['B', null]);
    } finally {
      // Bu testin kataloğundaki kartın konfigürasyonu yok: gerçek bağ da boş döner.
      servis.parcaRevizyonuCozucusuKaydet(async () => new Map());
    }
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

  test('2975 (Güvenlik N1): basamak ekleme, değiştirme ve silme fiyat izine girer; basamağa dokunmayan kayıt basamak satırı yazmaz', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10'], [k2, '5']]);
    a.fiyatlar = [{ kalemId: k1, birimFiyat: '10', basamaklar: [{ esik: '20', birimFiyat: '8' }] } as never, { kalemId: k2, birimFiyat: '5' } as never];
    const s1 = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a] }));
    const fiyat = (basamaklar: { esik: string; birimFiyat: string }[]) =>
      ({ ...s1.teklifler[0]!, fiyatlar: [{ kalemId: k1, birimFiyat: '10', basamaklar }, { kalemId: k2, birimFiyat: '5' }] });
    const s2 = tamam<Talep>(await kaydet(c.sa, { ...govde(s1), teklifler: [fiyat([{ esik: '20', birimFiyat: '7.5' }, { esik: '30', birimFiyat: '7' }])] }));
    const s3 = tamam<Talep>(await kaydet(c.sa, { ...govde(s2), teklifler: [fiyat([{ esik: '30', birimFiyat: '7' }])] }));
    tamam<Talep>(await kaydet(c.sa, { ...govde(s3), notlar: 'Deneme basamak aynı' }));
    const basamakSatirlari = (await denetimler(t.id)).map((d) => (d.govde._ek ?? []).filter((r) => 'basamakEsigi' in r).map((r) => [Number(r['basamakEsigi']), r['onceki'], r['yeni']]));
    assert.deepEqual(basamakSatirlari, [[[20, null, '8']], [[20, '8', '7.5'], [30, null, '7']], [[20, '7.5', null]], []]);
    const ornek = (await denetimler(t.id))[0]!.govde._ek!.find((r) => 'basamakEsigi' in r)!;
    assert.deepEqual([ornek['teklifId'], ornek['firmaId'], ornek['kalemId'], ornek['miktar'], ornek['paraBirimi']], [a.id, firmaA, k1, '10', 'TRY']);
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

  test('2397 b: onay basamağı ayarla açılır; basamağın ya da üst basamağın rolü olmayan onaylayamaz (403), reddedebilir; rolsüz basamakta yetki yeter', async () => {
    c.samuduru ||= await rolluKisi('samuduru', 'satin_alma_muduru');
    const rolId = async (kod: string) => (await vt().tx((db) => db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod])))!.id;
    const [mudurRol, samRol] = [await rolId('mudur'), await rolId('satin_alma_muduru')];
    const ayarKaydi = async (cerez: string, l: object[], ek: object = {}) => {
      const a = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).ayarlar;
      return istek(cerez, 'POST', '/satin-alma-ayarlari/kaydet', {
        agirliklar: a.agirliklar, gecerlilikGun: a.gecerlilikGun, enAzTeklif: a.enAzTeklif, fiyatUyariYuzdesi: a.fiyatUyariYuzdesi,
        kurlar: a.kurlar.map((k) => ({ paraBirimi: k.paraBirimi })), kategoriler: a.kategoriler, birimler: a.birimler, onayLimitleri: l, surum: a.surum, ...ek,
      });
    };
    // 2397-5 a: basamakları yalnız yönetici yazar.
    const limitler = async (l: object[]) => {
      tamam(await ayarKaydi(c.yonetici, l));
      return tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).ayarlar;
    };
    const kademe = async (deger: boolean) => tamam(await istek(c.yonetici, 'POST', '/ayarlar/satin-alma.onay-kademesi/degistir', { deger }));
    const onay = (sonuc: 'onay' | 'ret' = 'onay') => ({ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc, dortGozsuz: false, notlar: sonuc === 'ret' ? 'Deneme ret' : '' });
    // Karar tutarı 120 TL (A teklifi: 10 x 10 + 4 x 5).
    await limitler([{ azamiTutar: '10', seviye: 'Deneme uzman', rolId: mudurRol }, { azamiTutar: null, seviye: 'Deneme müdür', rolId: samRol }]);
    let t = await kararli();
    assert.equal(tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).ayarlar.onayKademesi, false);
    // Ayar kapalıyken onaylama yetkisi yeter (bugünkü davranış).
    tamam(await kaydet(c.mudur, { ...govde(t), onaylar: [onay()] }));
    await kademe(true);
    t = await kararli();
    const red = await kaydet(c.mudur, { ...govde(t), onaylar: [onay()] });
    assert.equal(red.statusCode, 403);
    assert.match((red.json() as { mesaj: string }).mesaj, /Deneme müdür/);
    // Ret serbesttir.
    tamam(await kaydet(c.mudur, { ...govde(t), onaylar: [onay('ret')] }));
    t = await kararli();
    tamam(await kaydet(c.samuduru, { ...govde(t), onaylar: [onay()] }));
    // Alt basamakta üst basamağın rolü de onaylar; rolü göndermeyen kayıt aynı adlı, yoksa aynı sıradaki basamağın rolünü korur.
    let a = await limitler([{ azamiTutar: '1000', seviye: 'Deneme uzman', rolId: mudurRol }, { azamiTutar: null, seviye: 'Deneme müdür', rolId: samRol }]);
    a = await limitler(a.onayLimitleri.map(({ azamiTutar, seviye }) => ({ azamiTutar, seviye })));
    assert.deepEqual(a.onayLimitleri.map((l) => l.rolId), [mudurRol, samRol]);
    // 2397-6: rol adı ayar cevabında; kayıt gövdesindeki rolAdi yok sayılır.
    const rolAdi = async (id: number) => (await vt().tx((db) => db.tek<{ ad: string }>('SELECT ad FROM rol WHERE id = $1', [id])))!.ad;
    assert.deepEqual(a.onayLimitleri.map((l) => l.rolAdi), [await rolAdi(mudurRol), await rolAdi(samRol)]);
    a = await limitler(a.onayLimitleri.map(({ azamiTutar, seviye, rolId }) => ({ azamiTutar, seviye, rolId, rolAdi: 'Deneme sahte' })));
    assert.deepEqual(a.onayLimitleri.map((l) => l.rolAdi), [await rolAdi(mudurRol), await rolAdi(samRol)]);
    a = await limitler([{ azamiTutar: '1000', seviye: 'Deneme uzman yeni' }, { azamiTutar: null, seviye: 'Deneme müdür' }]);
    assert.deepEqual(a.onayLimitleri.map((l) => [l.seviye, l.rolId]), [['Deneme uzman yeni', mudurRol], ['Deneme müdür', samRol]]);
    a = await limitler([{ azamiTutar: '1000', seviye: 'Deneme uzman', rolId: mudurRol }, { azamiTutar: null, seviye: 'Deneme müdür', rolId: samRol }]);
    // 2397-5 a: satın alma ve satın alma müdürü basamağı, eşiği ya da rolü değiştiremez; aynı kayıtta öteki ayarları yazar.
    const once = a.onayLimitleri.map(({ azamiTutar, seviye }) => ({ azamiTutar, seviye }));
    for (const cerez of [c.sa, c.samuduru]) {
      for (const l of [[{ ...once[0]!, azamiTutar: '5000' }, once[1]!], [{ ...once[0]!, rolId: null }, once[1]!], [once[1]!], [{ ...once[0]!, seviye: 'Deneme ad' }, once[1]!]]) {
        const r = await ayarKaydi(cerez, l);
        assert.equal(r.statusCode, 403, JSON.stringify(l));
        assert.match((r.json() as { mesaj: string }).mesaj, /yalnız yönetici/);
      }
    }
    assert.deepEqual(tamam<Ayarlar>(await ayarKaydi(c.sa, once, { gecerlilikGun: 21 })).gecerlilikGun, 21);
    a = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).ayarlar;
    assert.deepEqual(a.onayLimitleri.map((l) => l.rolId), [mudurRol, samRol]);
    // Rolsüz basamak rollü basamağın üstünde olamaz (yönetici de yazamaz).
    assert.equal((await ayarKaydi(c.yonetici, [{ azamiTutar: '1000', seviye: 'Deneme uzman', rolId: mudurRol }, { azamiTutar: null, seviye: 'Deneme müdür', rolId: null }])).statusCode, 400);
    // Basamakta kullanılan rol silinemez.
    await assert.rejects(vt().tx((db) => db.sorgu('DELETE FROM rol WHERE id = $1', [samRol])));
    t = await kararli();
    tamam(await kaydet(c.samuduru, { ...govde(t), onaylar: [onay()] }));
    t = await kararli();
    tamam(await kaydet(c.mudur, { ...govde(t), onaylar: [onay()] }));
    // Basamağın rolü boşsa yetki yeter.
    await limitler([{ azamiTutar: null, seviye: 'Deneme tek', rolId: null }]);
    t = await kararli();
    tamam(await kaydet(c.mudur, { ...govde(t), onaylar: [onay()] }));
    await kademe(false);
    await limitler([]);
  });

  test('2398 a: talebi açan ya da talep eden onaylayamaz (403), reddedebilir; başkasının talebini onaylar', async () => {
    const onay = (sonuc: 'onay' | 'ret') => ({ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc, dortGozsuz: false, notlar: sonuc === 'ret' ? 'Vade kısa' : '' });
    const acan = await kararli(c.mudur, { talepEdenKisiId: kisi.talep! });
    assert.equal(acan.acanKisiId, kisi.mudur);
    const red = await kaydet(c.mudur, { ...govde(acan), onaylar: [onay('onay')] });
    assert.equal(red.statusCode, 403);
    assert.match((red.json() as { mesaj: string }).mesaj, /Talebi açan ya da talep eden/);
    assert.equal((await kaydet(c.mudur, { ...govde(acan), onaylar: [onay('ret')] })).statusCode, 200);
    const adina = await kararli(c.sa, { talepEdenKisiId: kisi.mudur! });
    assert.equal(adina.talepEdenKisiId, kisi.mudur);
    assert.equal((await kaydet(c.mudur, { ...govde(adina), onaylar: [onay('onay')] })).statusCode, 403);
    assert.equal((await kaydet(c.mudur, { ...govde(await kararli()), onaylar: [onay('onay')] })).statusCode, 200);
  });

  test('2398 a (Güvenlik): talep eden kendini çıkarıp onaylayamaz; talep edeni değişen talebi eski de yeni de talep eden onaylayamaz', async () => {
    const onay = () => ({ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay' as const, dortGozsuz: false, notlar: '' });
    c.samuduru ||= await rolluKisi('samuduru', 'satin_alma_muduru');
    const t = await kararli(c.sa, { talepEdenKisiId: kisi.samuduru! });
    const cikti = tamam<Talep>(await kaydet(c.samuduru, { ...govde(t), talepEdenKisiId: kisi.talep! }));
    assert.equal(cikti.talepEdenKisiId, kisi.talep);
    const red = await kaydet(c.samuduru, { ...govde(cikti), onaylar: [onay()] });
    assert.equal(red.statusCode, 403);
    assert.match((red.json() as { mesaj: string }).mesaj, /Talebi açan ya da talep eden/);
    const t2 = await kararli(c.sa, { talepEdenKisiId: kisi.samuduru! });
    const devir = tamam<Talep>(await kaydet(c.sa, { ...govde(t2), talepEdenKisiId: kisi.mudur! }));
    assert.equal((await kaydet(c.mudur, { ...govde(devir), onaylar: [onay()] })).statusCode, 403);
    assert.equal((await kaydet(c.samuduru, { ...govde(devir), onaylar: [onay()] })).statusCode, 403);
    assert.equal((await kaydet(c.yonetici, { ...govde(devir), onaylar: [onay()] })).statusCode, 200);
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
    const siparis = { teklifId: t.karar!.teklifId!, siparisNo: 'SA-ONAYSIZ', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' };
    assert.equal((await kaydet(c.sa, { ...govde(t), durum: 'siparis_verildi', karar: { ...t.karar!, siparisler: [siparis] } })).statusCode, 422);
    const ip = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'iptal', iptalNedeni: 'Deneme' }));
    // 2413 a: iptalden siparişe genel kayıtla dönülmez; geri alma iptal öncesine (onayda) döner.
    assert.equal((await kaydet(c.sa, { ...govde(ip), durum: 'siparis_verildi', karar: { ...ip.karar!, siparisler: [siparis] } })).statusCode, 422);
    // Ret son onaysa da sipariş verilemez.
    const geri = tamam<{ talep: Talep }>(await iptalGeriAl(c.sa, ip)).talep;
    assert.equal(geri.durum, 'onayda');
    const ret = tamam<Talep>(await kaydet(c.mudur, { ...govde(geri), durum: 'degerlendirme', onaylar: [onayKaydi('ret', 'Pahalı')] }));
    const tekrar = tamam<Talep>(await kaydet(c.sa, { ...govde(ret), durum: 'onayda' }));
    assert.equal((await kaydet(c.sa, { ...govde(tekrar), durum: 'siparis_verildi', karar: { ...tekrar.karar!, siparisler: [siparis] } })).statusCode, 422);
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(tekrar), onaylar: [...tekrar.onaylar, onayKaydi()] }));
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi', karar: { ...onayli.karar!, siparisler: [siparis] } }));
    assert.equal(s.durum, 'siparis_verildi');
  });

  test('2433-4 a, 2433-6 a: teslim tarihi olmayan sipariş oluşmaz, tarih boşaltılamaz; tarihsiz eski sipariş olduğu gibi kaydedilir', async () => {
    const t = await kararli();
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(t), onaylar: [onayKaydi()] }));
    const siparis = { teklifId: onayli.karar!.teklifId!, siparisNo: 'SA-TERMIN', siparisTarihi: '2026-10-07', beklenenTeslim: null };
    const red = await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi', karar: { ...onayli.karar!, siparisler: [siparis] } });
    assert.deepEqual([red.statusCode, (red.json() as { mesaj: string }).mesaj], [422, ILETILER.terminsizSiparis]);
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi', karar: { ...onayli.karar!, siparisler: [{ ...siparis, beklenenTeslim: '2026-10-20' }] } }));
    const bosalt = (x: Talep) => ({ ...govde(x), karar: { ...x.karar!, siparisler: x.karar!.siparisler.map((y) => ({ ...y, beklenenTeslim: null })) } });
    assert.equal((await kaydet(c.sa, bosalt(s))).statusCode, 422);
    // Bugün tarihsiz kayıtlı eski sipariş (veritabanı değişmez): tarihsiz kalarak yeniden kaydedilir, tarih sonradan girilir.
    await ortam!.sahip.sorgu('UPDATE satin_alma_siparis SET beklenen_teslim = NULL WHERE talep_id = $1', [s.id]);
    const eski = await acilistaki(s.id);
    const yeniden = tamam<Talep>(await kaydet(c.sa, { ...govde(eski), notlar: 'Deneme eski' }));
    assert.deepEqual([yeniden.notlar, siparisi(yeniden, siparis.teklifId).beklenenTeslim], ['Deneme eski', null]);
    const tarihli = tamam<Talep>(await kaydet(c.sa, { ...govde(yeniden), karar: { ...yeniden.karar!, siparisler: yeniden.karar!.siparisler.map((y) => ({ ...y, beklenenTeslim: '2026-10-25' })) } }));
    assert.equal(siparisi(tarihli, siparis.teklifId).beklenenTeslim, '2026-10-25');
  });

  // 236 a: tedarikçi onay durumunun sahibi Kalite Merkezi'dir; satın alma firma kimliğiyle okur, kendi durum sütunu siparişi engellemez.
  const kararliOnayli = async (firmaId: number, ad: string): Promise<{ onayli: Talep; siparis: { teklifId: string; siparisNo: string; siparisTarihi: string; beklenenTeslim: string } }> => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme' })));
    const [k1] = t.kalemler.map((k) => k.id) as [string];
    const q = teklif(firmaId, [[k1, '10']], { tedarikciAdi: ad });
    const onayda = tamam<Talep>(await kaydet(c.sa, {
      ...govde(t), durum: 'onayda', teklifler: [q],
      karar: { mod: 'tek', teklifId: q.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
    }));
    return { onayli: tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [onayKaydi()] })), siparis: { teklifId: q.id, siparisNo: '', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' } };
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
          siparisler: durum === 'onayda' ? [] : [{ teklifId: q.id, siparisNo: 'SA-ACILIS', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' }] },
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
    const siparis = { teklifId: o.karar!.teklifId!, siparisNo: 'SA-ONAYLI', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' };
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
  type Basamak = { esik: string; birimFiyat: string };
  // basamak: A'nın k2 (4 adet) ve B'nin k1 (10 adet) satırına kademeli fiyat (2975); yoksa basamaksız.
  async function bolunmusSiparis(k2FiyatiA = '5', teklifA: Record<string, unknown> = {}, basamak: { a?: Basamak[]; b?: Basamak[] } = {}): Promise<{ s: Talep; k1: string; k2: string; a: string; b: string }> {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme' })));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const a = teklif(firmaA, [[k1, '10'], [k2, k2FiyatiA]], teklifA);
    const b = teklif(firmaB, [[k1, '9'], [k2, '6']]);
    const basamakla = (q: typeof a, kalemId: string, l: Basamak[] | undefined) => {
      if (l !== undefined) q.fiyatlar = q.fiyatlar.map((f) => (f.kalemId === kalemId ? { ...f, basamaklar: l } : f)) as typeof q.fiyatlar;
    };
    basamakla(a, k2, basamak.a);
    basamakla(b, k1, basamak.b);
    const onayda = tamam<Talep>(await kaydet(c.sa, {
      ...govde(t), durum: 'onayda', teklifler: [a, b],
      karar: { mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: k1, teklifId: b.id }, { kalemId: k2, teklifId: a.id }], gerekce: 'Kalem bazlı fiyat',
        kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
    }));
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [onayKaydi()] }));
    const s = tamam<Talep>(await kaydet(c.sa, {
      ...govde(onayli), durum: 'siparis_verildi',
      karar: { ...onayli.karar!, siparisler: [
        { teklifId: a.id, siparisNo: 'SA-A', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' },
        { teklifId: b.id, siparisNo: 'SA-B', siparisTarihi: '2026-10-08', beklenenTeslim: '2026-10-20' },
      ] },
    }));
    // 2433-6 a: bu yardımcıyı kullanan testler teslim tarihi olmayan eski siparişin davranışını sınar; tarih sipariş oluştuktan sonra
    // veritabanında boşaltılır (bugün tarihsiz kayıtlı eski sipariş gibi), sonra aynı hâl yeniden kaydedilir.
    await ortam!.sahip.sorgu('UPDATE satin_alma_siparis SET beklenen_teslim = NULL WHERE talep_id = $1', [s.id]);
    const eski = await acilistaki(s.id);
    const yeniden = tamam<Talep>(await kaydet(c.sa, { ...govde(eski) }));
    return { s: yeniden, k1, k2, a: a.id, b: b.id };
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

  test('kart 1474: teslim tedarikçi karnesine satır başına tek olay yazar; termin beklenen teslim, tam net miktarla; geri alma olayı yeniler ya da kaldırır; terminsiz satır olay yazmaz', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const g = tamam<Talep>(await kaydet(c.sa, { ...govde(s), karar: { ...s.karar!, siparisler: s.karar!.siparisler.map((x) =>
      ({ teklifId: x.teklifId, siparisNo: x.siparisNo, siparisTarihi: x.siparisTarihi, beklenenTeslim: x.teklifId === a ? '2026-11-05' : null })) } }));
    const satirA = siparisi(g, a).satirlar[0]!.id, satirB = siparisi(g, b).satirlar[0]!.id;
    const olaylar = () => vt().tx((db) => db.sorgu<{ firma: number; anahtar: string; termin: string; gun: string; tam: boolean }>(
      `SELECT firma_id AS firma, anahtar, termin::text AS termin, teslim_gunu::text AS gun, tam FROM musteri_tedarikci_karne_olayi
        WHERE kaynak = 'satin-alma' AND anahtar = ANY($1::text[]) ORDER BY anahtar`, [[`siparis-satiri:${satirA}`, `siparis-satiri:${satirB}`]]));
    const bugun = tesisGunu(Date.now());
    await teslimEt(satirA, '1', 7951);
    assert.deepEqual(await olaylar(), [{ firma: firmaA, anahtar: `siparis-satiri:${satirA}`, termin: '2026-11-05', gun: bugun, tam: false }]);
    await teslimEt(satirA, '3', 7952);
    assert.deepEqual((await olaylar()).map((x) => x.tam), [true], 'satırın kalanı gelince aynı olay tam olur, ikinci olay açılmaz');
    await teslimEt(satirB, '10', 7953);
    assert.equal((await olaylar()).length, 1, 'beklenen teslimi olmayan siparişin teslimi olay yazmaz');
    await geriAl(7952);
    assert.deepEqual((await olaylar()).map((x) => x.tam), [false], 'geri alınan teslim olayı eksik teslime döndürür');
    await geriAl(7951);
    assert.deepEqual(await olaylar(), [], 'net teslimi kalmayan satırın olayı kalkar');
  });

  test('kart 1474 kural: termin, firma ya da artı teslim yoksa ya da net sıfırsa olay yok; fazla teslim tamdır', () => {
    const b = { firmaId: 7, termin: '2026-11-05', miktar: '4', net: '4', sonZaman: '2026-11-06T08:00:00+00:00' };
    assert.deepEqual(karneTeslimOlayi(b), { firmaId: 7, termin: '2026-11-05', zaman: b.sonZaman, tam: true });
    assert.equal(karneTeslimOlayi({ ...b, net: '5.5' })?.tam, true);
    assert.equal(karneTeslimOlayi({ ...b, net: '3.9999' })?.tam, false);
    for (const x of [{ termin: null }, { firmaId: null }, { sonZaman: null }, { net: '0' }, { net: '-1' }]) assert.equal(karneTeslimOlayi({ ...b, ...x }), null);
  });

  test('kart 1474 reddedilen: geçersiz teslim olay yazmaz', async () => {
    const { s, a } = await bolunmusSiparis();
    const g = tamam<Talep>(await kaydet(c.sa, { ...govde(s), karar: { ...s.karar!, siparisler: s.karar!.siparisler.map((x) =>
      ({ teklifId: x.teklifId, siparisNo: x.siparisNo, siparisTarihi: x.siparisTarihi, beklenenTeslim: '2026-11-05' })) } }));
    const satirA = siparisi(g, a).satirlar[0]!.id;
    await assert.rejects(teslimEt(satirA, '0', 7961), hataKodu('GECERSIZ'));
    await teslimEt(satirA, '1', 7962);
    await assert.rejects(teslimEt(satirA, '1', 7962), hataKodu('CAKISMA'));
    const n = await vt().tx((db) => db.tek<{ n: number; tam: boolean }>(
      "SELECT count(*)::int AS n, bool_and(tam) AS tam FROM musteri_tedarikci_karne_olayi WHERE kaynak = 'satin-alma' AND anahtar = $1", [`siparis-satiri:${satirA}`]));
    assert.deepEqual(n, { n: 1, tam: false });
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
    // 2413 a: siparişten onaya elle dönüş kalktı; kalem değişikliği kayıtlı değişiklik komutuyladır (aşağıdaki test).
    assert.equal((await kaydet(c.sa, { ...govde(await acilistaki(s.id)), durum: 'onayda' })).statusCode, 422);
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

  test('1839: fatura bağlanırken üç yollu eşleşme uyarısı döner ve geçmişe yazılır; rakam taşımaz; bağ reddedilmez; liste okumasında uyarı yok', async () => {
    const { s, a } = await bolunmusSiparis();
    const toplam = (await vt().tx((db) => siparisOdemeKosullari(db, s.id))).find((x) => x.teklifId === a)!.toplam;
    const fatura = async (tutar: number) => tamam<{ belge: { id: number } }>(await istek(c.yonetici, 'POST', '/finans/belgeler/ekle', {
      yon: 'gider', kategori: 'mal_alimi', firmaId: firmaA, belgeNo: null, belgeTarihi: '2026-10-09', vade: '2026-11-09', tutar, kdvOrani: 20,
    })).belge.id;
    const yaz = async (belgeId: number, bagla: boolean) => tamam<SiparisFaturalariCevabi>(
      await istek(c.sa, 'POST', `/satin-alma-talepleri/${s.id}/siparis-faturasi`, { teklifId: a, belgeId, bagla }));
    const esit = await fatura(Number(toplam));
    const fazla = await fatura(Number(toplam) + 1);
    // Teslim yok: tutar tutsa da eksik teslim uyarısı; KDV dahil toplam (tutar x 1,2) karşılaştırılmaz.
    assert.deepEqual((await yaz(esit, true)).uyarilar, [ILETILER.eslesmeEksikTeslim]);
    assert.deepEqual((await yaz(esit, false)).uyarilar, []);
    assert.deepEqual((await yaz(fazla, true)).uyarilar, [ILETILER.eslesmeEksikTeslim, ILETILER.eslesmeTutarFazla]);
    const gecmis = (await acilistaki(s.id)).hareketler.map((h) => h.metin).filter((m) => m.startsWith('Fatura bağlandı'));
    assert.ok(gecmis.some((m) => m.includes(ILETILER.eslesmeTutarFazla)), gecmis.join(' | '));
    assert.ok(gecmis.every((m) => !m.includes(toplam)), 'uyarı rakam taşımaz');
    assert.deepEqual(tamam<SiparisFaturalariCevabi>(await istek(c.sa, 'GET', `/satin-alma-siparis-faturalari?talepId=${s.id}&teklifId=${a}`)).uyarilar, []);
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
    // 1839: tutar 100 TL, sipariş toplamı daha az ve teslim yok; uyarı geçmişe de yazılır.
    assert.deepEqual(metinler.filter((m) => m.includes('DN-F1')), [`Fatura bağlandı: DN-F1 (Deneme Tedarik A). ${ILETILER.eslesmeEksikTeslim} ${ILETILER.eslesmeTutarFazla}`, 'Fatura bağı kaldırıldı: DN-F1 (Deneme Tedarik A)']);

    // Yalnız satın almayı yazan işlem; talep eden 403.
    assert.equal((await liste(s.id, a, c.talep)).statusCode, 403);
    assert.equal((await yaz(s.id, a, f1, true, c.talep)).statusCode, 403);
    // Muhasebe bağı satin-alma.fatura-bagla ile kurar ve kaldırır (K8 a, 2077-3 a); satın alma kaydı yazamaz.
    const muhasebe = await rolluKisi('muhasebeci', 'muhasebe_finans');
    assert.deepEqual(durumlar(await yaz(s.id, a, f2, true, muhasebe)), [[f1, false, true], [f2, true, false]].sort());
    assert.deepEqual(durumlar(await liste(s.id, a, muhasebe)), [[f1, false, true], [f2, true, false]].sort());
    assert.deepEqual(durumlar(await yaz(s.id, a, f2, false, muhasebe)), [[f1, false, true], [f2, false, false]].sort());
    assert.equal((await istek(muhasebe, 'POST', '/satin-alma-tedarikcileri/kaydet', { firmaId: firmaA, puan: 3, notlar: '', kategoriler: [], degerlendirmeler: [], surum: null })).statusCode, 403);
  });

  test('SAT-73 SAT-74 FNS-63 FNS-64 #1124: siparişe çevrilince plan tekliften finansa düşer; yazan değiştirir, okuyan görür; fatura bağlanınca plan kilitlenir ve beklenenden düşer', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const takip = async (cerez = c.sa) => istek(cerez, 'GET', `/satin-alma-talepleri/${s.id}/siparis-takibi`);
    const siparisi = (t: SiparisTakibiCevabi, teklifId: string) => t.siparisler.find((x) => x.teklifId === teklifId)!;
    const ilk = tamam<SiparisTakibiCevabi>(await takip());
    // Vade 30 gün, avans yok, beklenen teslim boş: kalan sipariş tarihinden 30 gün sonra; tutar siparişin KDV dahil toplamı (4 x 5, 10 x 9; genel oran %20).
    assert.deepEqual(siparisi(ilk, a).odemePlani, [{ tur: 'vade', vade: '2026-11-06', yontem: 'banka', tutar: '24' }]);
    assert.deepEqual(siparisi(ilk, b).odemePlani, [{ tur: 'vade', vade: '2026-11-07', yontem: 'banka', tutar: '108' }]);
    assert.equal(siparisi(ilk, a).satirIdleri.length, 1);
    assert.deepEqual(siparisi(ilk, a).faturalar, []);
    const beklenen = async () => tamam<BeklenenOdemelerCevabi>(await istek(c.yonetici, 'GET', '/finans/beklenen-odemeler')).odemeler
      .filter((x) => x.talepId === s.id).map((x) => [x.teklifId, x.vade, x.tutar, x.firmaAdi, x.paraBirimi]);
    assert.deepEqual(await beklenen(), [[a, '2026-11-06', '24.00', 'Deneme Tedarik A', 'TRY'], [b, '2026-11-07', '108.00', 'Deneme Tedarik B', 'TRY']]);
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
    assert.deepEqual(await beklenen(), [[b, '2026-11-07', '108.00', 'Deneme Tedarik B', 'TRY']]);
  });

  test('SAT-74 #1124 2132-6: avanslı teklifte plan avans ve kalan olarak kurulur; kalan beklenen teslimden vade günü sonradır; otomatik plan yeni tarihlerle yeniden kurulur', async () => {
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
    // (10 x 10 + 4 x 2.5) x 0.9 + 7 + 3 = 109; KDV dahil (genel %20) 130.80: avans 32.70 x 1.2 = 39.24, kalan 91.56.
    const plan = async () => tamam<SiparisTakibiCevabi>(await istek(c.sa, 'GET', `/satin-alma-talepleri/${s.id}/siparis-takibi`)).siparisler[0]!.odemePlani;
    assert.deepEqual(await plan(), [{ tur: 'avans', vade: '2026-10-10', yontem: 'banka', tutar: '39.24' }, { tur: 'vade', vade: '2026-12-19', yontem: 'banka', tutar: '91.56' }]);
    // 2132-6 a: tekliften kurulan plan sipariş tarihi ve beklenen teslimle yeniden kurulur (önceden bir kez kurulurdu).
    tamam(await kaydet(c.sa, { ...govde(s), karar: { ...s.karar!, siparisler: [{ teklifId: a.id, siparisNo: 'L-9', siparisTarihi: '2026-10-11', beklenenTeslim: '2026-10-25' }] } }));
    assert.deepEqual((await plan()).map((x) => x.vade), ['2026-10-11', '2026-12-24']);
  });

  test('2132a: iptal edilen siparişin planı beklenen ödemelerden çıkar; faturalı siparişin planı takipte kalır; iptal geri alınınca plan yeniden kurulur; yetkisiz iptal planı silmez', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const beklenen = async () => tamam<BeklenenOdemelerCevabi>(await istek(c.yonetici, 'GET', '/finans/beklenen-odemeler')).odemeler
      .filter((x) => x.talepId === s.id).map((x) => x.teklifId).sort();
    const plan = async (teklifId: string) => tamam<SiparisTakibiCevabi>(await istek(c.sa, 'GET', `/satin-alma-talepleri/${s.id}/siparis-takibi`))
      .siparisler.find((x) => x.teklifId === teklifId)!.odemePlani;
    assert.deepEqual(await beklenen(), [a, b].sort());
    // Yetkisiz kişi iptal edemez; plan yerinde kalır.
    assert.equal((await kaydet(c.operator, { ...govde(await acilistaki(s.id)), durum: 'iptal', iptalNedeni: 'Deneme' })).statusCode, 403);
    assert.deepEqual(await beklenen(), [a, b].sort());
    // a'ya fatura bağlanır: a beklenenden düşer, planı takipte görünür.
    const fatura = tamam<{ belge: { id: number } }>(await istek(c.yonetici, 'POST', '/finans/belgeler/ekle', {
      yon: 'gider', kategori: 'mal_alimi', firmaId: firmaA, belgeNo: 'DN-2132', belgeTarihi: '2026-10-09', vade: '2026-11-09', tutar: 20, kdvOrani: 20,
    })).belge.id;
    tamam(await istek(c.sa, 'POST', `/satin-alma-talepleri/${s.id}/siparis-faturasi`, { teklifId: a, belgeId: fatura, bagla: true }));
    assert.deepEqual(await beklenen(), [b]);
    const aPlani = await plan(a);
    const ip = tamam<Talep>(await kaydet(c.sa, { ...govde(await acilistaki(s.id)), durum: 'iptal', iptalNedeni: 'Deneme' }));
    assert.equal(ip.durum, 'iptal');
    assert.deepEqual(await beklenen(), []);
    assert.deepEqual(await plan(a), aPlani, 'faturalı siparişin planı silinmez');
    assert.deepEqual(await plan(b), []);
    // İptal geri alınır: faturasız siparişe varsayılan plan yeniden kurulur.
    const donus = tamam<{ talep: Talep; durum: string; turetildi: boolean }>(await iptalGeriAl(c.sa, await acilistaki(s.id)));
    assert.deepEqual([donus.durum, donus.turetildi], ['siparis_verildi', false]);
    assert.deepEqual(await beklenen(), [b]);
    assert.equal((await plan(b)).length, 1);
  });

  test('2132-5, 2132-7: siparişin KDV oranı seçilir ve plan o oranla yazılır; kısmi fatura planın en erken satırlarından düşer, kalan beklenende kalır', async () => {
    const { s, a } = await bolunmusSiparis();
    const takipA = async () => tamam<SiparisTakibiCevabi>(await istek(c.sa, 'GET', `/satin-alma-talepleri/${s.id}/siparis-takibi`)).siparisler.find((x) => x.teklifId === a)!;
    const ilk = await takipA();
    assert.deepEqual([ilk.kdvOrani, ilk.kdvElle, ilk.kdvSecenekleri], ['20', false, ['0', '1', '10', '20']]);
    const yaz = async (govde: Record<string, unknown>) => istek(c.sa, 'POST', `/satin-alma-talepleri/${s.id}/odeme-plani`, { teklifId: a, surum: (await acilistaki(s.id)).surum, ...govde });
    const plan = [{ tur: 'avans', vade: '2026-10-07', yontem: 'nakit', tutar: '10' }, { tur: 'vade', vade: '2026-12-01', yontem: 'banka', tutar: '12' }];
    const red = await yaz({ satirlar: plan, kdvOrani: '18' });
    assert.deepEqual([red.statusCode, (red.json() as { mesaj?: string }).mesaj], [422, ILETILER.planKdvGecersiz]);
    assert.equal((await takipA()).kdvElle, false, 'reddedilen oran yazılmaz');
    tamam(await yaz({ satirlar: plan, kdvOrani: '10' }));
    const sonra = await takipA();
    assert.deepEqual([sonra.kdvOrani, sonra.kdvElle], ['10', true]);
    assert.ok((await acilistaki(s.id)).hareketler.some((h) => h.metin.includes('ödeme planı güncellendi (KDV %10 dahil): 2026-10-07 10 TRY, 2026-12-01 12 TRY')));
    // Oran gönderilmezse siparişteki seçim kalır.
    tamam(await yaz({ satirlar: plan }));
    assert.equal((await takipA()).kdvOrani, '10');

    const beklenen = async () => tamam<BeklenenOdemelerCevabi>(await istek(c.yonetici, 'GET', '/finans/beklenen-odemeler')).odemeler
      .filter((x) => x.talepId === s.id).map((x) => [x.teklifId === a ? 'a' : 'b', x.vade, x.tutar]).sort();
    assert.deepEqual(await beklenen(), [['a', '2026-10-07', '10.00'], ['a', '2026-12-01', '12.00'], ['b', '2026-11-07', '108.00']]);
    const fatura = async (no: string, tutar: number) => {
      const id = tamam<{ belge: { id: number } }>(await istek(c.yonetici, 'POST', '/finans/belgeler/ekle', {
        yon: 'gider', kategori: 'mal_alimi', firmaId: firmaA, belgeNo: no, belgeTarihi: '2026-10-09', vade: '2026-11-09', tutar, kdvOrani: 20,
      })).belge.id;
      tamam(await istek(c.sa, 'POST', `/satin-alma-talepleri/${s.id}/siparis-faturasi`, { teklifId: a, belgeId: id, bagla: true }));
      return id;
    };
    // 5 + %20 = 6: avanstan düşer, avansın 4'ü ve vadeli satır kalır.
    await fatura('DN-K1', 5);
    assert.deepEqual(await beklenen(), [['a', '2026-10-07', '4.00'], ['a', '2026-12-01', '12.00'], ['b', '2026-11-07', '108.00']]);
    // 10 + %20 = 12, toplam 18: avans biter, vadeli satırdan 8 düşer.
    const ikinci = await fatura('DN-K2', 10);
    assert.deepEqual(await beklenen(), [['a', '2026-12-01', '4.00'], ['b', '2026-11-07', '108.00']]);
    // İptal edilen fatura sayılmaz.
    const { surum } = (await vt().tx((db) => db.tek<{ surum: number }>('SELECT surum FROM finans_belge WHERE id = $1', [ikinci])))!;
    tamam(await istek(c.yonetici, 'POST', `/finans/belgeler/${ikinci}/iptal`, { surum, neden: 'Deneme' }));
    assert.deepEqual(await beklenen(), [['a', '2026-10-07', '4.00'], ['a', '2026-12-01', '12.00'], ['b', '2026-11-07', '108.00']]);
  });

  test('2132-6, 2132-11: otomatik plan beklenen teslim ve mal kabulle yeniden kurulur, geri alınan teslim sayılmaz; elle yazılan plan değişmez', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const satirA = siparisi(s, a).satirlar[0]!.id;
    const plan = async (teklifId: string) => tamam<SiparisTakibiCevabi>(await istek(c.sa, 'GET', `/satin-alma-talepleri/${s.id}/siparis-takibi`))
      .siparisler.find((x) => x.teklifId === teklifId)!.odemePlani.map((x) => [x.vade, x.tutar]);
    const teslimGunu = async (teklifId: string, beklenenTeslim: string) => {
      const t = await acilistaki(s.id);
      return kaydet(c.sa, { ...govde(t), karar: { ...t.karar!, siparisler: t.karar!.siparisler.map((x) => ({
        teklifId: x.teklifId, siparisNo: x.siparisNo, siparisTarihi: x.siparisTarihi, beklenenTeslim: x.teklifId === teklifId ? beklenenTeslim : x.beklenenTeslim })) } });
    };
    assert.deepEqual(await plan(a), [['2026-11-06', '24']]);
    tamam(await teslimGunu(a, '2026-10-20'));
    assert.deepEqual(await plan(a), [['2026-11-19', '24']]);
    assert.ok((await acilistaki(s.id)).hareketler.some((h) => h.metin.includes('ödeme planı teslim tarihine göre yeniden kuruldu: 2026-11-19 24 TRY')));
    // Elle yazılan plan teslim değişince yerinde kalır.
    tamam(await istek(c.sa, 'POST', `/satin-alma-talepleri/${s.id}/odeme-plani`, { teklifId: b, surum: (await acilistaki(s.id)).surum,
      satirlar: [{ tur: 'vade', vade: '2026-12-15', yontem: 'banka', tutar: '100' }] }));
    tamam(await teslimGunu(b, '2026-10-25'));
    assert.deepEqual(await plan(b), [['2026-12-15', '100']]);
    // Mal kabul: teslim edilen pay mal kabul gününden, kalanı beklenen teslimden sayılır (2417); geri alınınca beklenen teslime döner.
    const bugun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
    const otuzGunSonra = new Date(Date.parse(`${bugun}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
    await teslimEt(satirA, '2', 213261);
    assert.deepEqual(await plan(a), [[otuzGunSonra, '12'], ['2026-11-19', '12']].sort((x, y) => x[0]!.localeCompare(y[0]!)));
    await geriAl(213261);
    assert.deepEqual(await plan(a), [['2026-11-19', '24']]);
    // Mevcut (göç öncesi) satırlar 'elle' sayılır: kaynağı elle olan plan mal kabulle değişmez.
    await vt().tx((db) => db.sorgu("UPDATE finans_siparis_odemesi SET kaynak = 'elle' WHERE satin_alma_talep_id = $1 AND satin_alma_teklif_id = $2", [s.id, a]));
    await teslimEt(satirA, '2', 213262);
    assert.deepEqual(await plan(a), [['2026-11-19', '24']]);
  });

  test('2417: parçalı teslimatta her mal kabul kendi payıyla ayrı vade satırıdır; vade siparişten seçilirse tek satır, sipariş tarihi + vade', async () => {
    const { s, a } = await bolunmusSiparis();
    const satir = siparisi(s, a).satirlar[0]!;
    const plan = async () => tamam<SiparisTakibiCevabi>(await istek(c.sa, 'GET', `/satin-alma-talepleri/${s.id}/siparis-takibi`))
      .siparisler.find((x) => x.teklifId === a)!.odemePlani.map((x) => [x.vade, x.tutar]);
    assert.equal(siparisi(s, a).vadeBaslangici, 'teslim');
    assert.deepEqual(await plan(), [['2026-11-06', '24']]);
    const bugun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
    const otuzGunSonra = new Date(Date.parse(`${bugun}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
    await teslimEt(satir.id, String(Number(satir.miktar) / 2), 224171);
    assert.deepEqual(await plan(), [[otuzGunSonra, '12'], ['2026-11-06', '12']].sort((x, y) => x[0]!.localeCompare(y[0]!)));
    // Siparişten: mal kabul vadeyi kaydırmaz; seçim kayıtta kalır.
    const t = await acilistaki(s.id);
    tamam(await kaydet(c.sa, { ...govde(t), karar: { ...t.karar!, siparisler: t.karar!.siparisler.map((x) => ({
      teklifId: x.teklifId, siparisNo: x.siparisNo, siparisTarihi: x.siparisTarihi, beklenenTeslim: x.beklenenTeslim, vadeBaslangici: x.teklifId === a ? 'siparis' as const : x.vadeBaslangici })) } }));
    assert.equal(siparisi(await acilistaki(s.id), a).vadeBaslangici, 'siparis');
    assert.deepEqual(await plan(), [['2026-11-06', '24']]);
  });

  test('#489 pano: onay bekleyen onaylayana, açık talep ve teslim bekleyen satır yazana, açık sipariş okuyana sayılır; yetkisiz sayı null', async () => {
    const ozet = async (cerez: string) => tamam<SatinAlmaOzetiCevabi>(await istek(cerez, 'GET', '/satin-alma/ozet'));
    const BOS = {
      onayBekleyen: null, acikTalep: null, teslimBekleyenSatir: null, acikSiparis: null, acikSiparisTutari: null, gecikenTeslim: null, buHaftaGelecekTeslim: null,
      siparisVerilecek: null, kararVerilecek: null, ihtiyaciGecen: null, gecikenEnEskiGun: null, ihtiyaciGecenEnEskiGun: null,
    };
    const [sa0, md0] = [await ozet(c.sa), await ozet(c.mudur)];
    assert.equal(sa0.onayBekleyen, null);
    assert.deepEqual(await ozet(c.operator), BOS);
    assert.deepEqual(await ozet(c.talep), BOS);
    // Depo mal kabulü stokta yapar: yalnız teslim bekleyen satır sayısını görür.
    const depo = await ozet(c.depo);
    assert.deepEqual({ ...depo, teslimBekleyenSatir: null }, BOS);
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

  test('2425: ortak pano sayıları iş kutusuyla aynı; sipariş tedarikçi başına, talep durum ve ihtiyaç gününe göre; talep eden ve depo görmez', async () => {
    const ozet = async (cerez: string) => tamam<SatinAlmaOzetiCevabi>(await istek(cerez, 'GET', '/satin-alma/ozet'));
    const gun = await bugun();
    const ileri = (n: number) => { const d = new Date(`${gun}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const sayi = (o: SatinAlmaOzetiCevabi) => [o.gecikenTeslim, o.buHaftaGelecekTeslim, o.siparisVerilecek, o.kararVerilecek, o.ihtiyaciGecen];
    const fark = (a: SatinAlmaOzetiCevabi, b: SatinAlmaOzetiCevabi) => sayi(a).map((x, i) => x! - sayi(b)[i]!);
    for (const cerez of [c.talep, c.depo, c.operator]) {
      const o = await ozet(cerez);
      assert.deepEqual([...sayi(o), o.gecikenEnEskiGun, o.ihtiyaciGecenEnEskiGun], [null, null, null, null, null, null, null]);
    }
    const o0 = await ozet(c.sa);
    // Değerlendirmedeki talep karar verilecektir; ihtiyaç günü geçtiği için ihtiyacı geçen de sayılır.
    tamam(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme', ihtiyacTarihi: ileri(-3) })));
    assert.deepEqual(fark(await ozet(c.sa), o0), [0, 0, 0, 1, 1]);
    assert.ok((await ozet(c.sa)).ihtiyaciGecenEnEskiGun! >= 3);
    // İhtiyacı bugün olan talep geçmiş sayılmaz.
    tamam(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'taslak', ihtiyacTarihi: gun })));
    assert.deepEqual(fark(await ozet(c.sa), o0), [0, 0, 0, 1, 1]);
    // Onaydaki talep ne karar verilecek ne sipariş verilecektir; onaylanınca sipariş verilecek olur, ihtiyacı geçen kalır.
    const k = await kararli(c.talep, { ihtiyacTarihi: ileri(-1) });
    const o1 = await ozet(c.sa);
    assert.deepEqual(fark(o1, o0), [0, 0, 0, 1, 2]);
    tamam(await kaydet(c.mudur, { ...govde(k), onaylar: [onayKaydi()] }));
    assert.deepEqual(fark(await ozet(c.sa), o1), [0, 0, 1, 0, 0]);
    assert.equal((await ozet(c.mudur)).siparisVerilecek, (await ozet(c.sa)).siparisVerilecek, 'onaylayan da görür');
    // Bölünmüş kararda iki tedarikçi siparişi: terminleri (sipariş tarihi + 7 gün) geçmiş, ikisi de gecikir; sipariş verilen talep ihtiyacı geçenden düşer.
    const o2 = await ozet(c.sa);
    const { s, a } = await bolunmusSiparis();
    let o = await ozet(c.sa);
    assert.deepEqual(fark(o, o2), [2, 0, 0, 0, 0]);
    assert.ok(o.gecikenEnEskiGun! >= 25);
    // Beklenen teslim terminin önüne geçer: A önümüzdeki 7 günde gelecek, gecikmez. Bugün + 7 bu hafta değildir.
    const beklenen = async (g: string) => {
      const x = await acilistaki(s.id);
      tamam(await kaydet(c.sa, { ...govde(x), karar: { ...x.karar!, siparisler: x.karar!.siparisler.map((y) => ({
        teklifId: y.teklifId, siparisNo: y.siparisNo, siparisTarihi: y.siparisTarihi, beklenenTeslim: y.teklifId === a ? g : y.beklenenTeslim, vadeBaslangici: y.vadeBaslangici })) } }));
    };
    await beklenen(ileri(6));
    assert.deepEqual(fark(await ozet(c.sa), o2), [1, 1, 0, 0, 0]);
    await beklenen(ileri(7));
    assert.deepEqual(fark(await ozet(c.sa), o2), [1, 0, 0, 0, 0]);
    // Kısmi teslim açık tutar; tamamı gelince sipariş sayılmaz.
    await beklenen(ileri(-1));
    const satirA = siparisi(await acilistaki(s.id), a).satirlar[0]!.id;
    await teslimEt(satirA, '3', 7311);
    assert.deepEqual(fark(await ozet(c.sa), o2), [2, 0, 0, 0, 0]);
    await teslimEt(satirA, '1', 7312);
    o = await ozet(c.sa);
    assert.deepEqual(fark(o, o2), [1, 0, 0, 0, 0]);
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
    assert.deepEqual(tamam(await istek(c.sa, 'GET', '/satin-alma-dis-operasyonlar')), { hazir: true, operasyonlar: [], partiOperasyonlari: [] });
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

  // Firma adları "deneme" geçmez: SAT-41 firma araması "deneme" ile yalnız fikstür firmalarını bekler.
  test('2874-1 a: sipariş verilince firması seçilmemiş fason adıma siparişin tedarikçisi yazılır; fason işaretsiz tedarikçiyle sipariş durur', async () => {
    const emir = await emirAc();
    // İş emirli (adımlı) emir mamul kartı taşır.
    await ortam!.sahip.sorgu('UPDATE uretim_emri SET malzeme_no = (SELECT min(no) FROM malzeme_katalog_karti) WHERE id = $1', [emir]);
    const tip = (await ortam!.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
    const ie = (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, fason_firmasiz, termin_gun) VALUES ($1, 1, 10, $2, 'Deneme fason', true, 5) RETURNING id",
      [emir, tip]))!.id;
    const adim = async () => (await ortam!.sahip.tek<{ firma: number | null; firmasiz: boolean }>(
      'SELECT fason_firma_id AS firma, fason_firmasiz AS firmasiz FROM uretim_emirleri_is_emri WHERE id = $1', [ie]))!;
    const siparisVer = async (firmaId: number, ad: string) => {
      const { onayli, siparis } = await kararliOnayli(firmaId, ad);
      await ortam!.sahip.sorgu('UPDATE satin_alma_talep_kalemi SET is_emri_id = $2 WHERE talep_id = $1', [onayli.id, ie]);
      return kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi', karar: { ...onayli.karar!, siparisler: [siparis] } });
    };

    const isaretsiz = await tedarikciFirma('Tedarik 2874 işaretsiz');
    const red = await siparisVer(isaretsiz.id, 'Tedarik 2874 işaretsiz');
    assert.notEqual(red.statusCode, 200, red.body);
    assert.deepEqual(await adim(), { firma: null, firmasiz: true }, 'reddedilen sipariş adıma firma yazmaz');

    const fasoncu = await tedarikciFirma('Fasoncu 2874');
    await ortam!.sahip.sorgu('UPDATE musteri_tedarikci_firma SET fason = true WHERE id = $1', [fasoncu.id]);
    const s = tamam<Talep>(await siparisVer(fasoncu.id, 'Fasoncu 2874'));
    assert.equal(s.durum, 'siparis_verildi');
    assert.deepEqual(await adim(), { firma: fasoncu.id, firmasiz: false });
    const degisim = await ortam!.sahip.sorgu<{ eskiFirmasiz: boolean; eski: number | null; yeni: number | null }>(
      'SELECT eski_fason_firmasiz AS "eskiFirmasiz", eski_fason_firma_id AS eski, yeni_fason_firma_id AS yeni FROM uretim_emirleri_uretim_yeri_degisimi WHERE is_emri_id = $1', [ie]);
    assert.deepEqual(degisim, [{ eskiFirmasiz: true, eski: null, yeni: fasoncu.id }], 'firma seçimi üretim yeri değişimi olarak kayda girer');
    const belge = await ortam!.sahip.sorgu('SELECT id FROM uretim_emirleri_dis_islem_emri WHERE is_emri_id = $1', [ie]);
    assert.equal(belge.length, 1, 'firma yazılınca dış işlem emri açılır');

    // Firması olan adıma ikinci sipariş dokunmaz.
    const baska = await tedarikciFirma('Fasoncu 2874 B');
    await ortam!.sahip.sorgu('UPDATE musteri_tedarikci_firma SET fason = true WHERE id = $1', [baska.id]);
    tamam<Talep>(await siparisVer(baska.id, 'Fasoncu 2874 B'));
    assert.deepEqual(await adim(), { firma: fasoncu.id, firmasiz: false });
  });

  test('2874-1 a V3: bir adıma iki tedarikçiden sipariş verilince firma yazılmaz, adım firma bekleniyor kalır', async () => {
    const emir = await emirAc();
    await ortam!.sahip.sorgu('UPDATE uretim_emri SET malzeme_no = (SELECT min(no) FROM malzeme_katalog_karti) WHERE id = $1', [emir]);
    const tip = (await ortam!.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
    const ie = (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, fason_firmasiz, termin_gun) VALUES ($1, 1, 10, $2, 'Deneme fason V3', true, 5) RETURNING id",
      [emir, tip]))!.id;
    await ortam!.sahip.sorgu('UPDATE musteri_tedarikci_firma SET fason = true WHERE id = ANY($1::int[])', [[firmaA, firmaB]]);
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme' })));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    await ortam!.sahip.sorgu('UPDATE satin_alma_talep_kalemi SET is_emri_id = $2 WHERE talep_id = $1', [t.id, ie]);
    const t2 = await acilistaki(t.id);
    const a = teklif(firmaA, [[k1, '10'], [k2, '5']]);
    const b = teklif(firmaB, [[k1, '9'], [k2, '6']]);
    const onayda = tamam<Talep>(await kaydet(c.sa, {
      ...govde(t2), durum: 'onayda', teklifler: [a, b],
      karar: { mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: k1, teklifId: b.id }, { kalemId: k2, teklifId: a.id }], gerekce: 'Deneme',
        kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
    }));
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [onayKaydi()] }));
    const s = tamam<Talep>(await kaydet(c.sa, {
      ...govde(onayli), durum: 'siparis_verildi',
      karar: { ...onayli.karar!, siparisler: [
        { teklifId: a.id, siparisNo: 'SA-V3A', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' },
        { teklifId: b.id, siparisNo: 'SA-V3B', siparisTarihi: '2026-10-08', beklenenTeslim: '2026-10-20' },
      ] },
    }));
    assert.equal(s.durum, 'siparis_verildi');
    const adim = (await ortam!.sahip.tek<{ firma: number | null; firmasiz: boolean }>('SELECT fason_firma_id AS firma, fason_firmasiz AS firmasiz FROM uretim_emirleri_is_emri WHERE id = $1', [ie]))!;
    assert.deepEqual(adim, { firma: null, firmasiz: true }, 'iki tedarikçide firma yazılmaz');
    assert.equal((await ortam!.sahip.sorgu('SELECT 1 FROM uretim_emirleri_uretim_yeri_degisimi WHERE is_emri_id = $1', [ie])).length, 0);
    assert.equal((await ortam!.sahip.sorgu('SELECT 1 FROM uretim_emirleri_dis_islem_emri WHERE is_emri_id = $1', [ie])).length, 0);
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
    // 2600 3/3 b: fason siparişin masrafı (7 + 3) genel gidere girer, emre değil: oran 10 / (18 + 10); masrafsız sipariş 0.
    const oranlar = await vt().tx((db) => servis.siparisGenelGiderOranlari(db, [{ talepId: s.id, teklifId: a }, { talepId: s.id, teklifId: b }]));
    assert.deepEqual([...oranlar].sort(), [[`${s.id}:${a}`, 0.357143], [`${s.id}:${b}`, 0]].sort());
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

  test('SAT-68 2413 a: iptal gerekçeyle geri alınır (önceki duruma dönülür); silinen taslak aynı içerikle yeni kimlikle yeniden yazılır', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme' })));
    const ip = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'iptal', iptalNedeni: 'Yanlışlıkla' }));
    assert.equal(ip.durum, 'iptal');
    const geri = tamam<{ talep: Talep }>(await iptalGeriAl(c.sa, ip)).talep;
    assert.deepEqual([geri.durum, geri.iptalNedeni], ['degerlendirme', '']);
    assert.equal(geri.hareketler.at(-1)?.metin, 'İptal geri alındı (iptal nedeni: Yanlışlıkla): Yanlışlıkla iptal');
    const g = yeniTalep({ baslik: 'Silinip geri gelen', notlar: 'Aynı içerik' });
    const d = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', g));
    tamam(await istek(c.talep, 'POST', `/satin-alma-talepleri/${d.id}/sil`, { surum: d.surum }));
    const y = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', { ...g, id: randomUUID() }));
    assert.notEqual(y.id, d.id);
    assert.deepEqual([y.baslik, y.notlar, y.durum, y.kalemler.map((k) => [k.ad, k.miktar])], [d.baslik, d.notlar, d.durum, d.kalemler.map((k) => [k.ad, k.miktar])]);
  });

  test('2413 a: elle geçişler kalktı; geri alma yalnız iptalde, sürümle, gerekçeyle ve yazma yetkisiyle; önceki durum gövdeden yazılmaz', async () => {
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const istekli = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'teklif_isteniyor', teklifIstekleri: [{ firmaId: firmaA, gonderim: '2026-10-05', sonTarih: null }] }));
    assert.equal((await kaydet(c.sa, { ...govde(istekli), durum: 'taslak' })).statusCode, 422);
    const deg = tamam<Talep>(await kaydet(c.sa, { ...govde(istekli), durum: 'degerlendirme' }));
    assert.equal((await kaydet(c.sa, { ...govde(deg), durum: 'teklif_isteniyor' })).statusCode, 422);
    assert.equal((await iptalGeriAl(c.sa, deg)).statusCode, 422, 'iptal olmayan talep');
    // K1: gövdedeki önceki durum yok sayılır; iptal anında sunucu yazar.
    const ip = tamam<Talep>(await kaydet(c.sa, { ...govde(deg), durum: 'iptal', iptalNedeni: 'Deneme', iptalOncesiDurum: 'taslak' }));
    assert.equal((await ortam!.sahip.tek<{ d: string }>('SELECT iptal_oncesi_durum AS d FROM satin_alma_talep WHERE id = $1', [ip.id]))!.d, 'degerlendirme');
    assert.equal((await iptalGeriAl(c.sa, ip, '  ')).statusCode, 400, 'gerekçesiz');
    assert.equal((await iptalGeriAl(c.talep, ip)).statusCode, 403, 'yazma yetkisi yok');
    assert.equal((await iptalGeriAl(c.sa, { ...ip, surum: ip.surum - 1 })).statusCode, 409, 'eski sürüm');
    const r = tamam<{ talep: Talep; durum: string; turetildi: boolean }>(await iptalGeriAl(c.sa, ip));
    assert.deepEqual([r.durum, r.turetildi, r.talep.durum], ['degerlendirme', false, 'degerlendirme']);
    assert.equal((await ortam!.sahip.tek<{ d: string | null }>('SELECT iptal_oncesi_durum AS d FROM satin_alma_talep WHERE id = $1', [ip.id]))!.d, null);
    assert.equal((await iptalGeriAl(c.sa, r.talep)).statusCode, 422, 'ikinci geri alma');
  });

  test('2413 a: önceki durumu kayıtlı olmayan eski iptal veriden türetilir ve cevapta, harekette söylenir', async () => {
    const t = await kararli();
    const ret = tamam<Talep>(await kaydet(c.mudur, { ...govde(t), durum: 'degerlendirme', onaylar: [onayKaydi('ret', 'Pahalı')] }));
    const ip = tamam<Talep>(await kaydet(c.sa, { ...govde(ret), durum: 'iptal', iptalNedeni: 'Eski iptal' }));
    await ortam!.sahip.sorgu('UPDATE satin_alma_talep SET iptal_oncesi_durum = NULL WHERE id = $1', [ip.id]);
    const r = tamam<{ talep: Talep; durum: string; turetildi: boolean }>(await iptalGeriAl(c.sa, ip, 'Yeniden açıldı'));
    assert.deepEqual([r.durum, r.turetildi], ['degerlendirme', true]);
    assert.equal(r.talep.hareketler.at(-1)?.metin, 'İptal geri alındı (iptal nedeni: Eski iptal), önceki durum veriden türetildi: Yeniden açıldı');
  });

  // 2414 a: birleştirme ve ayırma.
  const birlestir = (cerez: string, talepIdleri: string[], id = randomUUID()) => istek(cerez, 'POST', '/satin-alma-talepleri/birlestir', { id, talepIdleri });
  const ayir = (cerez: string, t: Talep, talepIdleri?: string[]) => istek(cerez, 'POST', `/satin-alma-talepleri/${t.id}/ayir`, { surum: t.surum, ...(talepIdleri ? { talepIdleri } : {}) });
  const talebimde = async (cerez: string, id: string) => tamam<TaleplerimCevabi>(await istek(cerez, 'GET', '/satin-alma-taleplerim?sinir=500')).talepler.find((x) => x.id === id);

  test('2414 a: talepler birleşir; kalem kaynağıyla taşınır; kaynak Taleplerim\'de yalnız kendi kalemleriyle birleşik talebi gösterir (K3); termin kalemin tarihini okur', async () => {
    const emir = await emirAc();
    const a = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ ihtiyacTarihi: '2026-12-10', uretimEmriId: emir, kalemler: [kalem('Deneme A1'), kalem('Deneme A2')] })));
    const b = tamam<Talep>(await istek(c.talep2, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ ihtiyacTarihi: '2026-11-20', oncelik: 'acil', uretimEmriId: emir, kalemler: [kalem('Deneme B1')] })));
    const m = tamam<Talep>(await birlestir(c.sa, [a.id, b.id]));
    assert.deepEqual(m.kalemler.map((k) => k.ad), ['Deneme A1', 'Deneme A2', 'Deneme B1']);
    assert.deepEqual([m.baslik, m.ihtiyacTarihi, m.oncelik, m.durum, m.birim, m.uretimEmriId], [`Birleşik talep: ${a.no}, ${b.no}`, '2026-11-20', 'acil', 'taslak', null, emir]);
    assert.deepEqual(m.kaynaklar?.map((x) => [x.no, x.kalemIdleri, x.ihtiyacTarihi, x.talepEdenAdi]),
      [[a.no, a.kalemler.map((k) => k.id), '2026-12-10', 'Deneme talep'], [b.no, b.kalemler.map((k) => k.id), '2026-11-20', 'Deneme talep2']]);
    const kaynakA = await acilistaki(a.id);
    assert.deepEqual([kaynakA.birlesme, kaynakA.kalemler.length], [{ talepId: m.id, no: m.no, durum: 'taslak' }, 0]);
    assert.equal(kaynakA.hareketler.at(-1)?.metin, `${m.no} talebinde birleştirildi.`);
    const benim = (await talebimde(c.talep, a.id))!;
    assert.deepEqual([benim.kalemler.map((k) => k.ad), benim.birlesme?.no], [['Deneme A1', 'Deneme A2'], m.no]);
    assert.equal(await talebimde(c.talep, m.id), undefined, 'birleşik talep talep edene açılmaz');
    assert.deepEqual((await talebimde(c.talep2, b.id))!.kalemler.map((k) => k.ad), ['Deneme B1']);
    const termin = await vt().tx((db) => terminKalemleriOku(db));
    assert.deepEqual([a.kalemler[0]!.id, b.kalemler[0]!.id].map((id) => termin.find((x) => x.kalemId === id)?.ihtiyacTarihi), ['2026-12-10', '2026-11-20']);
  });

  test('2414 a: koşullar: tekil kimlik (K7), teklifsiz ve kararsız taslak ya da teklif isteniyor; birleşmiş talep tekrar birleşmez ve değişmez (K5); yalnız satın alma', async () => {
    const a = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const b = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    assert.equal((await birlestir(c.sa, [a.id, a.id])).statusCode, 400, 'aynı talep iki kez');
    assert.equal((await birlestir(c.sa, [a.id])).statusCode, 400, 'tek talep');
    assert.equal((await birlestir(c.sa, [a.id, randomUUID()])).statusCode, 404);
    assert.equal((await birlestir(c.talep, [a.id, b.id])).statusCode, 403);
    const kararliT = await kararli();
    assert.equal((await birlestir(c.sa, [a.id, kararliT.id])).statusCode, 422, 'kararlı talep');
    const istekli = tamam<Talep>(await kaydet(c.sa, { ...govde(b), durum: 'teklif_isteniyor', teklifIstekleri: [{ firmaId: firmaA, gonderim: '2026-10-05', sonTarih: null }] }));
    assert.equal((await birlestir(c.sa, [a.id, istekli.id])).statusCode, 422, 'teklif istekli talep');
    const d = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const m = tamam<Talep>(await birlestir(c.sa, [a.id, d.id]));
    assert.equal((await birlestir(c.sa, [a.id, b.id])).statusCode, 422, 'başka birleşmede');
    assert.equal((await birlestir(c.sa, [m.id, b.id])).statusCode, 422, 'birleşik talep');
    const kaynak = await acilistaki(a.id);
    assert.equal((await kaydet(c.sa, { ...govde(kaynak), baslik: 'Değişti' })).statusCode, 422, 'K5 kaydet');
    assert.equal((await kaydet(c.sa, { ...govde(kaynak), durum: 'iptal', iptalNedeni: 'x' })).statusCode, 422, 'K5 iptal');
    assert.equal((await istek(c.sa, 'POST', `/satin-alma-talepleri/${a.id}/sil`, { surum: kaynak.surum })).statusCode, 422, 'K5 sil');
    assert.equal((await istek(c.sa, 'POST', `/satin-alma-talepleri/${a.id}/teslim-yontemi`, { teslimYontemi: 'firma_getirir', surum: kaynak.surum })).statusCode, 422, 'K5 teslim yöntemi');
    assert.equal((await istek(c.sa, 'POST', `/satin-alma-talepleri/${m.id}/sil`, { surum: m.surum })).statusCode, 422, 'kaynaklı birleşik talep silinmez');
    assert.equal((await kaydet(c.sa, { ...govde(m), kalemler: m.kalemler.slice(1) })).statusCode, 422, 'kaynak kalemi silinmez');
    const ek = tamam<Talep>(await kaydet(c.sa, { ...govde(m), kalemler: [...m.kalemler, kalem('Deneme ek kalem')] }));
    assert.equal(ek.kalemler.length, 5);
    assert.deepEqual(ek.kaynaklar?.map((x) => x.kalemIdleri.length), [2, 2], 'kayıt kaynak bağını korur');
  });

  test('2414 a: ayırma kısmi ve tam; kalem kaynağına sırasıyla döner; son kaynak çıkınca birleşik talep iptal olur ve geri alınamaz (K8); teklifli birleşik ayrılmaz', async () => {
    const a = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ kalemler: [kalem('Deneme A1'), kalem('Deneme A2')] })));
    const b = tamam<Talep>(await istek(c.talep2, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ kalemler: [kalem('Deneme B1')] })));
    const e = tamam<Talep>(await istek(c.talep2, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ kalemler: [kalem('Deneme E1')] })));
    const m = tamam<Talep>(await birlestir(c.sa, [a.id, b.id, e.id]));
    assert.equal((await ayir(c.sa, m, [randomUUID()])).statusCode, 422, 'kaynak değil');
    assert.equal((await ayir(c.sa, await acilistaki(a.id))).statusCode, 422, 'kaynak talep birleşik değil');
    assert.equal((await ayir(c.talep, m)).statusCode, 403);
    const kismi = tamam<Talep>(await ayir(c.sa, m, [b.id]));
    assert.deepEqual([kismi.kalemler.map((k) => k.ad), kismi.durum, kismi.kaynaklar?.map((x) => x.no)], [['Deneme A1', 'Deneme A2', 'Deneme E1'], 'taslak', [a.no, e.no]]);
    const geriB = await acilistaki(b.id);
    assert.deepEqual([geriB.birlesme, geriB.kalemler.map((k) => k.ad), geriB.durum], [null, ['Deneme B1'], 'taslak']);
    assert.equal(tamam<Talep>(await kaydet(c.talep2, { ...govde(geriB), baslik: 'Yeniden düzenlendi' })).baslik, 'Yeniden düzenlendi', 'ayrılan talep yine kaydedilir');
    const teklifli = tamam<Talep>(await kaydet(c.sa, { ...govde(kismi), durum: 'degerlendirme', teklifler: [teklif(firmaA, kismi.kalemler.map((k) => [k.id, '1'] as [string, string]))] }));
    assert.equal((await ayir(c.sa, teklifli)).statusCode, 422, 'teklifli birleşik talep');
    const teklifsiz = tamam<Talep>(await kaydet(c.sa, { ...govde(teklifli), teklifler: [] }));
    const tam = tamam<Talep>(await ayir(c.sa, teklifsiz));
    assert.deepEqual([tam.kalemler.length, tam.durum, tam.kaynaklar], [0, 'iptal', []]);
    assert.deepEqual((await acilistaki(a.id)).kalemler.map((k) => k.ad), ['Deneme A1', 'Deneme A2']);
    assert.equal((await iptalGeriAl(c.sa, tam)).statusCode, 422, 'K8');
  });

  test('2414 a madde 8: kaynakları açanlar ve talep edenler birleşik talebi onaylayamaz (dört göz)', async () => {
    const a = tamam<Talep>(await istek(c.mudur, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const b = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const m = tamam<Talep>(await birlestir(c.sa, [a.id, b.id]));
    const q = teklif(firmaA, m.kalemler.map((k) => [k.id, '10'] as [string, string]));
    const deg = tamam<Talep>(await kaydet(c.sa, { ...govde(m), durum: 'degerlendirme', teklifler: [q] }));
    const onayda = tamam<Talep>(await kaydet(c.sa, {
      ...govde(deg), durum: 'onayda',
      karar: { mod: 'tek', teklifId: q.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
    }));
    const r = await kaydet(c.mudur, { ...govde(onayda), onaylar: [onayKaydi()] });
    assert.equal(r.statusCode, 403, r.body);
    assert.match(r.body, new RegExp(ILETILER.dortGozTalepEden));
  });

  test('SAT-31: ret notsuz eklenemez (satin_alma_onay_ret_notlu); onay kaydı değişmez (yalnız ekleme)', async () => {
    const t = await kararli();
    const ret = { id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'ret' as const, dortGozsuz: false, notlar: '' };
    assert.equal((await kaydet(c.mudur, { ...govde(t), durum: 'degerlendirme', onaylar: [ret] })).statusCode, 422);
    const r = tamam<Talep>(await kaydet(c.mudur, { ...govde(t), durum: 'degerlendirme', onaylar: [{ ...ret, notlar: 'Vade kısa' }] }));
    assert.equal(r.durum, 'degerlendirme');
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu("UPDATE satin_alma_onay SET notlar = 'x' WHERE talep_id = $1", [t.id])), /yalnız ekleme/);
  });

  test('TMI A2: onay ve ret talebi açana bildirilir, ret gerekçesiyle; karar veren almaz', async () => {
    const t = await kararli();
    const bildirimler = async (cerez: string) => tamam<BildirimListeCevabi>(await istek(cerez, 'GET', '/bildirimler?sayfaBoyu=100')).satirlar
      .filter((x) => (x.tur === 'satin-alma.talep-onaylandi' || x.tur === 'satin-alma.talep-reddedildi') && x.baslik.endsWith(`talep: ${t.no}`));
    const ret = { id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'ret' as const, dortGozsuz: false, notlar: 'Vade kısa' };
    const r = tamam<Talep>(await kaydet(c.mudur, { ...govde(t), durum: 'degerlendirme', onaylar: [ret] }));
    assert.deepEqual((await bildirimler(c.talep)).map((x) => [x.tur, x.baslik, x.metin, x.yol]),
      [['satin-alma.talep-reddedildi', `Reddedilen talep: ${t.no}`, `${t.baslik}. Gerekçe: Vade kısa`, '/taleplerim']]);
    assert.equal((await bildirimler(c.mudur)).length, 0);
    const yeniden = tamam<Talep>(await kaydet(c.sa, { ...govde(r), durum: 'onayda' }));
    const onay = { ...ret, id: randomUUID(), sonuc: 'onay' as const, notlar: '' };
    tamam<Talep>(await kaydet(c.mudur, { ...govde(yeniden), onaylar: [...yeniden.onaylar, onay] }));
    assert.deepEqual((await bildirimler(c.talep)).map((x) => x.tur).sort(), ['satin-alma.talep-onaylandi', 'satin-alma.talep-reddedildi']);
    assert.equal((await bildirimler(c.mudur)).length, 0);
  });

  test('SAT-66 SAT-67: yalnız taslak silinir; karar varken teklif silinmez', async () => {
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    assert.equal((await istek(c.talep2, 'POST', `/satin-alma-talepleri/${t.id}/sil`, { surum: t.surum })).statusCode, 403);
    tamam(await istek(c.talep, 'POST', `/satin-alma-talepleri/${t.id}/sil`, { surum: t.surum }));
    assert.equal((await istek(c.sa, 'POST', `/satin-alma-talepleri/${t.id}/sil`, { surum: 1 })).statusCode, 404);
    const k = await kararli();
    const silRed = await istek(c.sa, 'POST', `/satin-alma-talepleri/${k.id}/sil`, { surum: k.surum });
    assert.deepEqual([silRed.statusCode, (silRed.json() as { mesaj?: string }).mesaj], [422, ILETILER.yalnizTaslakSilinir]);
    const red = await kaydet(c.sa, { ...govde(k), teklifler: k.teklifler.filter((q) => q.id === k.karar!.teklifId) });
    assert.equal(red.statusCode, 422);
  });

  test('#544 2a: sipariş numarasını TMI verir (SP-yıl-sıra); yeniden kayıtta değişmez; istemci numara yazamaz; eşzamanlı siparişler ayrı numara alır', async () => {
    const onayli = async () => { const t = await kararli(); return tamam<Talep>(await kaydet(c.mudur, { ...govde(t), onaylar: [onayKaydi()] })); };
    const siparisVer = (o: Talep, logo: string, ek: object = {}) => kaydet(c.sa, { ...govde(o), durum: 'siparis_verildi',
      karar: { ...o.karar!, siparisler: [{ teklifId: o.karar!.teklifId!, siparisNo: logo, siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20', ...ek }] } });
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
    assert.deepEqual([ted.ad, ted.kaliteDurumu, ted.puan, ted.notlar, ted.kategoriler, ted.degerlendirmeler], [ad, null, null, '', [], []]);
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

  test('2157-1 a: tedarikçi puanı boş kaydedilebilir ve boş döner; 1-5 dışı puan reddedilir', async () => {
    const once = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).tedarikciler.find((x) => x.firmaId === firmaA)!;
    const govde = { firmaId: firmaA, notlar: once.notlar, kategoriler: once.kategoriler, degerlendirmeler: [], surum: once.surum };
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', { ...govde, puan: 0 })).statusCode, 400);
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', { ...govde, puan: 6 })).statusCode, 400);
    const bos = tamam<Tedarikci>(await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', { ...govde, puan: null }));
    assert.equal(bos.puan, null);
    const sonra = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).tedarikciler.find((x) => x.firmaId === firmaA)!;
    assert.equal(sonra.puan, null);
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
    // TMI A4: onaylanıp siparişe dönmemiş talep onay beklemez; menü sayacı panoyla aynı tanımı kullanır.
    const t = await kararli();
    const sayac = async () => tamam<Record<string, number | null>>(await istek(c.mudur, 'GET', '/satin-alma-menu-sayaclari')).onaylar ?? -1;
    const once = await sayac();
    tamam<Talep>(await kaydet(c.mudur, { ...govde(t), onaylar: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay', dortGozsuz: false, notlar: '' }] }));
    assert.equal(await sayac(), once - 1);
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
    // 2397-5 a: onay basamaklarını satın alma değil yönetici yazar.
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-ayarlari/kaydet', g)).statusCode, 403);
    const y = tamam<Ayarlar>(await istek(c.yonetici, 'POST', '/satin-alma-ayarlari/kaydet', g));
    // Gövdedeki şirket adı yok sayılır (1942 a): ad Sistem Ayarları > Firma adı'ndandır.
    const firmaAdi = tamam<{ ad: string }>(await istek(c.sa, 'GET', '/kurum')).ad;
    assert.deepEqual([y.sirket, y.kurlar.map((k) => k.paraBirimi), y.kategoriler, y.onayLimitleri.length, y.surum], [firmaAdi, ['TRY', 'USD'], ['Bakım', 'Ambalaj'], 2, a.surum + 1]);
    assert.equal((await istek(c.sa, 'POST', '/satin-alma-ayarlari/kaydet', g)).statusCode, 409);
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu("INSERT INTO satin_alma_kur (para_birimi) VALUES ('JPY')")), kisitla('satin_alma_kur_kod'));
  });

  test('SAT-77: kg fiyatını satın alma girer; liste kalite + form başına güncel fiyatı verir, ileri tarihli fiyat güncel sayılmaz; geçmiş silinmez', async () => {
    const g = await bugun();
    await kaliteKarti('DENEME-AL', 'cubuk');
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
    for (const f of ['cubuk', 'levha', 'boru']) await kaliteKarti('DENEME-KAT', f);
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
    await kaliteKarti('DENEME-GBP', 'levha');
    const ekle = (kgFiyati: string) => istek(c.sa, 'POST', '/satin-alma-kg-fiyatlari/ekle',
      { satirlar: [{ kaliteKodu: 'DENEME-GBP', form: 'levha', kgFiyati, paraBirimi: 'GBP', gecerlilik: g }] });
    const bul = async () => tamam<KgFiyatlariCevabi>(await istek(c.sa, 'GET', '/satin-alma-kg-fiyatlari')).fiyatlar.find((f) => f.kaliteKodu === 'DENEME-GBP')!;
    tamam(await ekle('2.5'));
    assert.equal((await bul()).tryKgFiyati, null);
    tamam(await istek(c.yonetici, 'POST', '/finans/kur-ciftleri/ekle', { paraBirimi: 'GBP', tarih: g, alis: 39, satis: 40 }));
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

  // 2455-A: doğrulama, kaynak, iptal, yaş ve eskime, son alış ve sapma, onuncu hatırlatma.
  const kgEkle = (cerez: string, satirlar: unknown[]) => istek(cerez, 'POST', '/satin-alma-kg-fiyatlari/ekle', { satirlar });
  const kgListe = async (kalite: string) => tamam<KgFiyatlariCevabi>(await istek(c.sa, 'GET', '/satin-alma-kg-fiyatlari')).fiyatlar.filter((f) => f.kaliteKodu === kalite);
  const gunOnce = (g: string, n: number) => new Date(Date.parse(`${g}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

  test('2891-1: birim fiyat kg fiyatı x parça ağırlığı; metre ve metrekare stoklu kartta karşılık yok (boş), adet stoklu kartta dolu', async () => {
    const g = await bugun();
    const kart = async (kimlik: string, kod: string, birim: string, d: number): Promise<number> => {
      tamam(await istek(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
        kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', grade: 'DENEME-OL', form: 'cubuk', dims: { d, l: 6000 }, com: { kod, ad: `Deneme ${kod}`, birim }, onay: { durum: 'aktif' } },
        ozet: { benzersiz_anahtar: `hammadde|satin-alma|${kimlik}`, mukerrer_gerekcesi: null, birim_agirlik_kg: 2 }, surum: null,
      }));
      return (await ortam!.sahip.tx((db) => db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik])))!.no;
    };
    const adet = await kart('sa-ol-1', 'HM-SAT-00011', 'adet', 21);
    const metre = await kart('sa-ol-2', 'HM-SAT-00012', 'm', 22);
    const alan = await kart('sa-ol-3', 'HM-SAT-00013', 'm²', 23);
    tamam(await istek(c.sa, 'POST', '/satin-alma-kg-fiyatlari/ekle', { satirlar: [
      { kaliteKodu: 'DENEME-OL', form: 'cubuk', kgFiyati: '50', talasKgFiyati: '10', paraBirimi: 'TRY', gecerlilik: g }] }));
    const m = await vt().tx((db) => servis.malzemeKgFiyatlari(db, [adet, metre, alan]));
    assert.deepEqual([Number(m.get(adet)?.kgFiyati), Number(m.get(adet)?.birimFiyati), Number(m.get(adet)?.tryBirimFiyati)], [50, 100, 100]);
    for (const no of [metre, alan]) {
      assert.deepEqual([Number(m.get(no)?.kgFiyati), m.get(no)?.birimFiyati, m.get(no)?.tryBirimFiyati], [50, null, null], String(no));
    }
    const gun = await vt().tx((db) => servis.degerlemeKgFiyatlari(db, [adet, metre, alan], g));
    assert.deepEqual([gun.get(adet), gun.get(metre), gun.get(alan)], [
      { tryBirimFiyati: '100', tryTalasBirimFiyati: '20' }, { tryBirimFiyati: null, tryTalasBirimFiyati: null }, { tryBirimFiyati: null, tryTalasBirimFiyati: null }]);
  });

  test('2455-2 a: kartlarda olmayan kalite + form satır numarasıyla 422 alır ve hiçbir satır yazılmaz; formsuz satır kalitenin her formuna uyar; kaynak yazılır', async () => {
    const g = await bugun();
    await kaliteKarti('DENEME-DG', 'cubuk');
    const satir = (kaliteKodu: string, form: string | null, ek: Record<string, unknown> = {}) => ({ kaliteKodu, form, kgFiyati: '10', paraBirimi: 'TRY', gecerlilik: g, ...ek });
    const red = await kgEkle(c.sa, [satir('DENEME-DG', 'cubuk'), satir('DENEME-DG', null), satir('DENEME-DG', 'levha'), satir('DENEME-YOKKALITE', null)]);
    assert.equal(red.statusCode, 422);
    assert.match(red.body, /satır 3, 4\)/);
    const sayi = async () => (await ortam!.sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM satin_alma_kg_fiyati WHERE kalite_kodu = 'DENEME-DG'"))!.n;
    assert.equal(await sayi(), 0);
    assert.equal((await kgEkle(c.sa, [satir('DENEME-DG', null, { kaynak: 'tahmin' })])).statusCode, 400);
    tamam(await kgEkle(c.sa, [satir('DENEME-DG', null, { kaynak: 'piyasa' }), satir('DENEME-DG', 'cubuk')]));
    const l = await kgListe('DENEME-DG');
    assert.deepEqual(l.map((f) => [f.form, f.kaynak, f.kartta, f.yasGun, f.eskiMi, f.iptalEdildi]), [[null, 'piyasa', true, 0, false, false], ['cubuk', null, true, 0, false, false]]);
    assert.deepEqual(l.map((f) => [f.sonAlisKgFiyatiDoviz, f.sonAlisParaBirimi, f.sonAlisKgFiyati, f.sapmaYuzde, f.sapanMi]), [[null, null, null, null, false], [null, null, null, null, false]]);
    // Doğrulamadan önce girilmiş (kartı sonradan kalkan) satır listede kalır, kartta değil diye işaretlenir.
    await ortam!.sahip.sorgu("INSERT INTO satin_alma_kg_fiyati (kalite_kodu, form, kg_fiyati, para_birimi, gecerlilik, kisi_id) VALUES ('DENEME-ESKIKALITE', NULL, 5, 'TRY', current_date, $1)", [yoneticiId]);
    assert.deepEqual((await kgListe('DENEME-ESKIKALITE')).map((f) => f.kartta), [false]);
  });

  test('2455-A iptal: iptal yeni satır yazar, iptal edilen giriş güncelden düşer ve bir önceki geçerli olur; geçmişte işaretli görünür; ikinci iptal ve iptal satırının iptali reddedilir', async () => {
    const g = await bugun();
    await kaliteKarti('DENEME-IP', 'cubuk');
    tamam(await kgEkle(c.sa, [{ kaliteKodu: 'DENEME-IP', form: 'cubuk', kgFiyati: '100', paraBirimi: 'TRY', gecerlilik: gunOnce(g, 3) }]));
    tamam(await kgEkle(c.sa, [{ kaliteKodu: 'DENEME-IP', form: 'cubuk', kgFiyati: '120', paraBirimi: 'USD', gecerlilik: g }]));
    const yeni = (await kgListe('DENEME-IP'))[0]!;
    assert.equal(Number(yeni.kgFiyati), 120);
    const iptal = (id: number, gerekce = 'Yanlış para birimi', cerez = c.sa) => istek(cerez, 'POST', `/satin-alma-kg-fiyatlari/${id}/iptal`, { gerekce });
    assert.equal((await iptal(yeni.id, 'x', c.mudur)).statusCode, 403);
    assert.equal((await iptal(yeni.id, '  ')).statusCode, 400);
    assert.equal((await iptal(2147483000)).statusCode, 404);
    const cevap = tamam<KgFiyatlariCevabi>(await iptal(yeni.id));
    assert.deepEqual(cevap.fiyatlar.filter((f) => f.kaliteKodu === 'DENEME-IP').map((f) => [Number(f.kgFiyati), f.paraBirimi, f.yasGun]), [[100, 'TRY', 3]]);
    const gecmis = tamam<KgFiyatiGecmisiCevabi>(await istek(c.mudur, 'GET', '/satin-alma-kg-fiyatlari/gecmis?kalite=DENEME-IP&form=cubuk')).girisler;
    assert.deepEqual(gecmis.map((x) => [Number(x.kgFiyati), x.iptalEdildi, x.iptal?.gerekce ?? null, x.iptal?.kisiAdi ?? null]),
      [[120, true, 'Yanlış para birimi', 'Deneme satinalma'], [100, false, null, null]]);
    assert.match(gecmis[0]!.iptal!.zaman, /^\d{4}-\d{2}-\d{2}T/);
    const satir = (await ortam!.sahip.tek<{ id: number; aciklama: string; kisi: number; gun: string; fiyat: string | null }>(
      'SELECT id, aciklama, kisi_id AS kisi, gecerlilik::text AS gun, kg_fiyati::text AS fiyat FROM satin_alma_kg_fiyati WHERE iptal_edilen_id = $1', [yeni.id]))!;
    assert.deepEqual([satir.aciklama, satir.kisi, satir.gun, satir.fiyat], ['Yanlış para birimi', kisi.sa, g, null]);
    assert.equal((await iptal(yeni.id)).statusCode, 422);
    assert.equal((await iptal(satir.id)).statusCode, 422);
    // Kısıtlar: iptal satırı fiyat taşımaz, gerekçesiz olmaz; bir giriş bir kez iptal edilir; tablo yalnız eklenir.
    const ekle = (sql: string) => assert.rejects(ortam!.sahip.tx((db) => db.sorgu(sql, [yeni.id, yoneticiId])), /satin_alma_kg_fiyati_iptal/);
    await ekle("INSERT INTO satin_alma_kg_fiyati (kalite_kodu, form, kg_fiyati, para_birimi, gecerlilik, aciklama, iptal_edilen_id, kisi_id) VALUES ('DENEME-IP', 'cubuk', 1, 'TRY', current_date, 'x', $1, $2)");
    await ekle("INSERT INTO satin_alma_kg_fiyati (kalite_kodu, form, gecerlilik, aciklama, iptal_edilen_id, kisi_id) VALUES ('DENEME-IP', 'cubuk', current_date, ' ', $1, $2)");
    await ekle("INSERT INTO satin_alma_kg_fiyati (kalite_kodu, form, gecerlilik, aciklama, iptal_edilen_id, kisi_id) VALUES ('DENEME-IP', 'cubuk', current_date, 'ikinci', $1, $2)");
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu("INSERT INTO satin_alma_kg_fiyati (kalite_kodu, form, gecerlilik, kisi_id) VALUES ('DENEME-IP', 'cubuk', current_date, $1)", [yoneticiId])),
      /satin_alma_kg_fiyati_iptal_satiri/);
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu('DELETE FROM satin_alma_kg_fiyati WHERE id = $1', [satir.id])), /yalnız ekleme/);
  });

  test('2455-3 a ve 2432 onuncu madde: eşik kadar yaşlanan güncel giriş eski sayılır ve satın almaya hatırlatılır; yeni giriş hatırlatmayı kapatır', async () => {
    const g = await bugun();
    await kaliteKarti('DENEME-ES', 'cubuk');
    tamam(await kgEkle(c.sa, [{ kaliteKodu: 'DENEME-ES', form: 'cubuk', kgFiyati: '50', paraBirimi: 'TRY', gecerlilik: gunOnce(g, 30) }]));
    tamam(await kgEkle(c.sa, [{ kaliteKodu: 'DENEME-ES', form: null, kgFiyati: '50', paraBirimi: 'TRY', gecerlilik: gunOnce(g, 29) }]));
    const l = await kgListe('DENEME-ES');
    assert.deepEqual(l.map((f) => [f.form, f.yasGun, f.eskiMi]), [[null, 29, false], ['cubuk', 30, true]]);
    const eski = l.find((f) => f.form === 'cubuk')!;
    const tur = 'satin-alma.hatirlatma-kg-fiyati-eskidi';
    const kayitlar = () => ortam!.sahip.sorgu<{ anahtar: string; acik: boolean; talep: string | null }>(
      "SELECT anahtar, kapandi IS NULL AS acik, talep_id AS talep FROM satin_alma_hatirlatma WHERE tur = $1 AND anahtar LIKE $1 || ':kg:%' ORDER BY acildi, anahtar", [tur]);
    await vt().tx((db) => servis.hatirlatmalariYenile(db));
    assert.deepEqual((await kayitlar()).filter((k) => k.anahtar === `${tur}:kg:${eski.id}`), [{ anahtar: `${tur}:kg:${eski.id}`, acik: true, talep: null }]);
    const bildirim = await ortam!.sahip.sorgu<{ baslik: string; yol: string }>("SELECT DISTINCT baslik, yol FROM bildirim_kaydi WHERE tur = $1 AND baslik LIKE 'DENEME-ES%'", [tur]);
    assert.deepEqual(bildirim, [{ baslik: 'DENEME-ES cubuk: kg fiyatı 30 gündür güncellenmedi', yol: '/satin-alma/kg-fiyatlari' }]);
    await vt().tx((db) => servis.hatirlatmalariYenile(db));
    assert.equal((await kayitlar()).filter((k) => k.anahtar.endsWith(`:kg:${eski.id}`)).length, 1, 'ikinci tur aynı hatırlatmayı yeniden açmaz');
    tamam(await kgEkle(c.sa, [{ kaliteKodu: 'DENEME-ES', form: 'cubuk', kgFiyati: '55', paraBirimi: 'TRY', gecerlilik: g }]));
    await vt().tx((db) => servis.hatirlatmalariYenile(db));
    assert.deepEqual((await kayitlar()).filter((k) => k.anahtar.endsWith(`:kg:${eski.id}`)).map((k) => k.acik), [false]);
    assert.equal((await kgListe('DENEME-ES')).find((f) => f.form === 'cubuk')!.eskiMi, false);
  });

  test('2455-A son alış ve sapma (F-4, G1): uygulanan kartın en son alışı kg fiyatına çevrilir; aynı para biriminde doğrudan, farklıysa bugünkü kurla ölçülür; eşik iki yönlüdür', async () => {
    const g = await bugun();
    // Stok birimi kg olan kart: son alışın kg fiyatı birim fiyatın kendisidir. Teslim satırı kartın kataloğuna bağlanır.
    const kgKart = await kaliteKarti('DENEME-SA', 'cubuk', 'kg');
    const katalogId = tamam<{ id: string }>(await istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', { id: randomUUID(), malzemeNo: kgKart, ozellik: '', notlar: '', takmaAdlari: [], surum: null })).id;
    const { s, a, k2 } = await bolunmusSiparis('8');
    await teslimEt(siparisi(s, a).satirlar[0]!.id, '1', 8801);
    await ortam!.sahip.sorgu('UPDATE satin_alma_talep_kalemi SET katalog_id = $1 WHERE talep_id = $2 AND id = $3', [katalogId, s.id, k2]);
    const kart = { kalite: 'DENEME-SA', form: 'cubuk' };
    const kgSon = 8;
    tamam(await kgEkle(c.sa, [{ kaliteKodu: kart.kalite, form: kart.form, kgFiyati: '6.4', paraBirimi: 'TRY', gecerlilik: g }]));
    const r = (await kgListe(kart.kalite)).find((f) => f.form === kart.form)!;
    assert.equal(r.sonAlisParaBirimi, 'TRY');
    assert.ok(Math.abs(Number(r.sonAlisKgFiyatiDoviz) - kgSon) < 0.0001);
    assert.ok(Math.abs(Number(r.sonAlisKgFiyati) - kgSon) < 0.0001);
    assert.ok(Math.abs(Number(r.sapmaYuzde) - 25) < 0.02, String(r.sapmaYuzde));
    assert.equal(r.sapanMi, true);
    // Liste dövizde: ikisi de bugünkü satış kuruyla TL'ye çevrilir. Kur yoksa sapma boş.
    tamam(await kgEkle(c.sa, [{ kaliteKodu: kart.kalite, form: kart.form, kgFiyati: '1', paraBirimi: 'GBP', gecerlilik: g }]));
    const kurlu = (await kgListe(kart.kalite)).find((f) => f.form === kart.form)!;
    const tl = Number(kurlu.tryKgFiyati);
    assert.ok(tl > 0, 'GBP kuru önceki testte yazıldı');
    assert.ok(Math.abs(Number(kurlu.sapmaYuzde) - Math.round((kgSon / tl - 1) * 10000) / 100) < 0.02);
    tamam(await kgEkle(c.sa, [{ kaliteKodu: kart.kalite, form: kart.form, kgFiyati: '8', paraBirimi: 'TRY', gecerlilik: g }]));
    const yakin = (await kgListe(kart.kalite)).find((f) => f.form === kart.form)!;
    assert.deepEqual([yakin.sapmaYuzde, yakin.sapanMi], ['0', false]);
    // Birim ağırlığı bilinmeyen adetli kartın son alışı kg'a çevrilmez: alanlar boş, sapma yok (sıfır uydurulmaz).
    tamam(await kgEkle(c.sa, [{ kaliteKodu: 'S235', form: 'cubuk', kgFiyati: '5', paraBirimi: 'TRY', gecerlilik: g }]));
    const agirliksiz = (await kgListe('S235')).find((f) => f.form === 'cubuk')!;
    assert.deepEqual([agirliksiz.sonAlisKgFiyatiDoviz, agirliksiz.sonAlisKgFiyati, agirliksiz.sapmaYuzde, agirliksiz.sapanMi], [null, null, null, false]);
  });

  test('1942 a: şirket adı Sistem Ayarları > Firma adı\'ndan gelir; satın alma ayarı onu değiştirmez, eski şirket adı ucu yoktur', async () => {
    tamam(await istek(c.yonetici, 'POST', '/ayarlar/kabuk.kurum-adi/degistir', { deger: 'Deneme Atölyesi' }));
    assert.equal(tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).ayarlar.sirket, 'Deneme Atölyesi');
    assert.equal((await istek(c.operator, 'GET', '/satin-alma-ayarlari/sirket-adi')).statusCode, 404);
  });

  test('SA3 a: güncel kur finanstan; döviz teklifi kendi gününün kurunu saklar ve sonradan değişmez; finansta kur yoksa kullanıcıdan istenir, finansa yazılmaz', async () => {
    const kurEkle = async (tarih: string, kur: number) => tamam(await istek(c.yonetici, 'POST', '/finans/kur-ciftleri/ekle', { paraBirimi: 'USD', tarih, alis: kur - 0.5, satis: kur }));
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
    assert.deepEqual(siparisi(s, a).logo, { durum: 'bekliyor', kayitNo: null, hata: null, iptalDurumu: null, iptalHata: null, guncellemeDurumu: null, guncellemeHata: null, kapatmaDurumu: null, kapatmaHata: null, bekletmeIstegi: null, bekletmeDurumu: null, bekletmeHata: null });
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

  // 2975 (Test B1): basamaklı fiyat siparişten sonra her okuma yolunda etkin basamaktan gelir. B'nin k1'i 10 adet: taban 9, "10 ve
  // üstü" 8 TL. A'nın k2'si 4 adet: "10 ve üstü" 1 TL basamağına ulaşmaz, taban 5 TL kalır.
  const basamakli = () => bolunmusSiparis('5', {}, { a: [{ esik: '10', birimFiyat: '1' }], b: [{ esik: '10', birimFiyat: '8' }] });

  test('2975: basamaklı siparişte Logo birim fiyatı ve ödeme toplamı basamak fiyatından; ulaşılmayan basamak tabanı değiştirmez', async () => {
    const { s, a, b } = await basamakli();
    const [ia, ib] = [await siparisNo(s.id, a), await siparisNo(s.id, b)];
    const kuyruk = await logoKuyrugu([ia, ib]);
    assert.deepEqual(kuyruk.find((x) => x.id === ib)!.satirlar.map((r) => [r.miktar, r.birimFiyat]), [['10', '8']]);
    assert.deepEqual(kuyruk.find((x) => x.id === ia)!.satirlar.map((r) => [r.miktar, r.birimFiyat]), [['4', '5']]);
    const kosullar = await vt().tx((db) => siparisOdemeKosullari(db, s.id));
    assert.deepEqual([Number(kosullar.find((x) => x.teklifId === b)!.toplam), Number(kosullar.find((x) => x.teklifId === a)!.toplam)], [80, 20]);
  });

  test('2975: basamaklı teslimde son ve ortalama alış basamak fiyatından', async () => {
    const { s, b, k1 } = await basamakli();
    const m = (await vt().tx((db) => db.tek<{ n: number }>(
      'SELECT c.malzeme_no AS n FROM satin_alma_talep_kalemi k JOIN satin_alma_katalog c ON c.id = k.katalog_id WHERE k.talep_id = $1 AND k.id = $2', [s.id, k1])))!.n;
    const ortalama = async () => (await vt().tx((db) => ortalamaAlisFiyatlari(db, [m]))).get(m)!;
    // Önceki testlerin teslimleri de ortalamadadır: beklenen değer o anki toplam net miktardan hesaplanır.
    const netMiktar = async () => Number((await vt().tx((db) => db.tek<{ q: string | null }>(
      `SELECT sum(m.miktar)::text AS q FROM satin_alma_teslim m JOIN satin_alma_siparis_satiri s ON s.id = m.siparis_satiri_id
         JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id JOIN satin_alma_katalog c ON c.id = k.katalog_id
        WHERE c.malzeme_no = $1 AND m.mal_kabul_satiri_id IN (SELECT mal_kabul_satiri_id FROM satin_alma_teslim GROUP BY 1 HAVING sum(miktar) > 0)`, [m])))!.q ?? '0');
    const [once, miktar0] = [await ortalama(), await netMiktar()];
    await teslimEt(siparisi(s, b).satirlar[0]!.id, '3', 79750);
    const son = (await vt().tx((db) => sonAlisFiyatlari(db, [m]))).get(m)!;
    assert.deepEqual([son.birimFiyat, son.tryBirimFiyat], ['8', '8']);
    assert.deepEqual(await vt().tx((db) => malKabulFiyatlari(db, [79750])), new Map([[79750, '8']]));
    const fiyat0 = once.tryBirimFiyat === null ? 0 : Number(once.tryBirimFiyat);
    const sonra = await ortalama();
    assert.ok(Math.abs(Number(sonra.tryBirimFiyat) - (fiyat0 * miktar0 + 8 * 3) / (miktar0 + 3)) < 0.0001, sonra.tryBirimFiyat ?? 'boş');
    await geriAl(79750);
  });

  // 3143 a: müşteri malı sıfır fiyatlı siparişle girer (3139 b). Bedelsiz teslim son alışı, ortalamayı ve stok değerlemesinin mal kabul
  // fiyatını değiştirmez (fiyatı boştur); sipariş Logo kuyruğuna 0 TL ile yine girer (3141).
  test('3143: sıfır fiyatlı teslim son ve ortalama alışı değiştirmez, mal kabul fiyatı boş; sipariş Logo kuyruğunda 0 TL', async () => {
    const { s, a, k2 } = await bolunmusSiparis('0');
    const m = (await vt().tx((db) => db.tek<{ n: number }>(
      'SELECT c.malzeme_no AS n FROM satin_alma_talep_kalemi k JOIN satin_alma_katalog c ON c.id = k.katalog_id WHERE k.talep_id = $1 AND k.id = $2', [s.id, k2])))!.n;
    const ia = await siparisNo(s.id, a);
    assert.deepEqual((await logoKuyrugu([ia])).find((x) => x.id === ia)!.satirlar.map((r) => r.birimFiyat), ['0']);
    const [sonOnce, ortOnce] = [(await vt().tx((db) => sonAlisFiyatlari(db, [m]))).get(m), (await vt().tx((db) => ortalamaAlisFiyatlari(db, [m]))).get(m)!];
    await teslimEt(siparisi(s, a).satirlar[0]!.id, '4', 79760);
    assert.deepEqual(await vt().tx((db) => malKabulFiyatlari(db, [79760])), new Map([[79760, null]]));
    assert.deepEqual((await vt().tx((db) => sonAlisFiyatlari(db, [m]))).get(m), sonOnce);
    assert.deepEqual((await vt().tx((db) => ortalamaAlisFiyatlari(db, [m]))).get(m), ortOnce);
    await geriAl(79760);
  });

  test('2975: basamaklı siparişte iş emrinin fason tutarı ve analiz fiyatları basamak fiyatından', async () => {
    const { s, a, b, k1, k2 } = await basamakli();
    const satirA = siparisi(s, a).satirlar[0]!.id, satirB = siparisi(s, b).satirlar[0]!.id;
    const emir = await emirAc();
    const tip = (await ortam!.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
    const ie = (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, 1, 10, $2, 'Deneme fason') RETURNING id", [emir, tip]))!.id;
    await ortam!.sahip.tx((db) => db.sorgu('UPDATE satin_alma_siparis_satiri SET is_emri_id = $2 WHERE id = ANY($1::int[])', [[satirA, satirB], ie]));
    // A: 4 × 5 (basamak ulaşılmadı), B: 10 × 8 (basamak) = 100; tabanla 110 olurdu.
    assert.deepEqual([...(await vt().tx((db) => isEmriFasonTutarlari(db, [ie])))], [[ie, [{ tutar: '100.00', paraBirimi: 'TRY' }]]]);
    const analiz = (await vt().tx((db) => sorgu.analizSiparisSatirlari(db, '2026-10-01', 'Europe/Istanbul'))).filter((r) => r.id === satirA || r.id === satirB);
    assert.deepEqual(analiz.map((r) => [r.id, Number(r.birimFiyat)]).sort(), [[satirA, 5], [satirB, 8]].sort());
    const teklifFiyatlari = await vt().tx((db) => sorgu.analizTeklifFiyatlari(db, [s.id]));
    const fiyat = (teklifId: string, kalemId: string) => Number(teklifFiyatlari.find((x) => x.teklifId === teklifId && x.kalemId === kalemId)!.birimFiyat);
    assert.deepEqual([fiyat(b, k1), fiyat(a, k2), fiyat(a, k1), fiyat(b, k2)], [8, 5, 10, 6]);
  });

  test('2975: basamaksız teklifte etkin fiyat her miktarda taban fiyattır; basamaksız siparişin okuma yolları tabanla aynı', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const fark = await vt().tx((db) => db.tek<{ n: number }>(
      `SELECT count(*)::int AS n FROM satin_alma_teklif_satiri f CROSS JOIN (VALUES (0.0001), (1), (10), (1000000)) m(q)
        WHERE NOT EXISTS (SELECT 1 FROM satin_alma_teklif_fiyat_basamagi x WHERE x.talep_id = f.talep_id AND x.teklif_id = f.teklif_id AND x.kalem_id = f.kalem_id)
          AND satin_alma_etkin_birim_fiyat(f.talep_id, f.teklif_id, f.kalem_id, f.birim_fiyat, m.q) IS DISTINCT FROM f.birim_fiyat`));
    assert.equal(fark!.n, 0);
    const kuyruk = await logoKuyrugu([await siparisNo(s.id, a), await siparisNo(s.id, b)]);
    assert.deepEqual(kuyruk.flatMap((x) => x.satirlar.map((r) => r.birimFiyat)).sort(), ['5', '9']);
    const kosullar = await vt().tx((db) => siparisOdemeKosullari(db, s.id));
    assert.deepEqual(kosullar.map((x) => Number(x.toplam)).sort((x, y) => x - y), [20, 90]);
  });

  test('#205 Logo: hata kuyrukta kalır; başarı kayıt ve satır numaralarını yazar, kuyruktan çıkarır, yinelenirse değişmez; başka numara ya da yabancı satır reddedilir', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const [ia, ib] = [await siparisNo(s.id, a), await siparisNo(s.id, b)];
    await logoSonucu(ia, { hata: '  Köprüye ulaşılamadı  ' });
    assert.deepEqual(siparisi(await acilistaki(s.id), a).logo, { durum: 'hata', kayitNo: null, hata: 'Köprüye ulaşılamadı', iptalDurumu: null, iptalHata: null, guncellemeDurumu: null, guncellemeHata: null, kapatmaDurumu: null, kapatmaHata: null, bekletmeIstegi: null, bekletmeDurumu: null, bekletmeHata: null });
    assert.equal((await logoKuyrugu([ia]))[0]?.durum, 'hata');
    const satirA = siparisi(s, a).satirlar[0]!.id, satirB = siparisi(s, b).satirlar[0]!.id;
    await assert.rejects(logoSonucu(ia, { kayitNo: '4711', satirlar: [{ satirId: satirB, logoSatirRef: '1' }] }));
    assert.equal(siparisi(await acilistaki(s.id), a).logo?.durum, 'hata');
    await logoSonucu(ia, { kayitNo: '4711', satirlar: [{ satirId: satirA, logoSatirRef: '9001' }] });
    await logoSonucu(ia, { kayitNo: '4711', satirlar: [{ satirId: satirA, logoSatirRef: '9001' }] });
    assert.deepEqual(siparisi(await acilistaki(s.id), a).logo, { durum: 'gonderildi', kayitNo: '4711', hata: null, iptalDurumu: null, iptalHata: null, guncellemeDurumu: null, guncellemeHata: null, kapatmaDurumu: null, kapatmaHata: null, bekletmeIstegi: null, bekletmeDurumu: null, bekletmeHata: null });
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
    assert.deepEqual(siparisi(await acilistaki(s.id), a).logo, { durum: 'gonderildi', kayitNo: '5001', hata: null, iptalDurumu: null, iptalHata: null, guncellemeDurumu: 'gonderildi', guncellemeHata: null, kapatmaDurumu: null, kapatmaHata: null, bekletmeIstegi: null, bekletmeDurumu: null, bekletmeHata: null });
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
      karar: { ...onayli.karar!, siparisler: [{ teklifId: onayli.karar!.teklifId!, siparisNo: 'SA-T', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' }] } }));
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

  const beklet = (t: Talep, teklifId: string, istek_: 'beklet' | 'serbest') =>
    istek(c.sa, 'POST', `/satin-alma-talepleri/${t.id}/siparis-logo-beklet`, { teklifId, istek: istek_, surum: t.surum });
  const bekletmeKuyrugu = async (idler: number[]) => (await vt().tx((db) => logoyaBekletmeGidecekSiparisler(db, 10000))).filter((x) => idler.includes(x.id));
  const logoAnahtari = (anahtar: string, deger: boolean) => istek(c.yonetici, 'POST', `/ayarlar/${anahtar}/degistir`, { deger });

  test('2966-1 b Logo\'da beklet: istek kuyruğa girer, hareket yazılır; sonuç yalnız aynı isteğe yazılır; serbest bırakma geri alır', async () => {
    const { s, a, b } = await bolunmusSiparis();
    const [ia, ib] = [await siparisNo(s.id, a), await siparisNo(s.id, b)];
    const satirA = siparisi(s, a).satirlar[0]!.id;
    tamam(await logoAnahtari('logo.siparis-bekletme-gonderimi', true));
    tamam(await logoAnahtari('logo.satin-alma-gonderimi', true));
    try {
      const gitmemis = await beklet(await acilistaki(s.id), a, 'beklet');
      assert.equal(gitmemis.statusCode, 422);
      assert.match(gitmemis.body, /Yalnız Logo'ya gönderilmiş sipariş/);
      await logoSonucu(ia, { kayitNo: '9600', satirlar: [{ satirId: satirA, logoSatirRef: '9601' }] });
      assert.match((await beklet(await acilistaki(s.id), a, 'serbest')).body, /bekletilmiyor/);
      const t = tamam<Talep>(await beklet(await acilistaki(s.id), a, 'beklet'));
      assert.deepEqual([siparisi(t, a).logo?.bekletmeIstegi, siparisi(t, a).logo?.bekletmeDurumu], ['beklet', 'bekliyor']);
      assert.ok(t.hareketler.some((h) => h.metin.includes("Logo'da bekletme istendi")));
      assert.match((await beklet(t, a, 'beklet')).body, /zaten sırada/);
      const [k] = await bekletmeKuyrugu([ia, ib]);
      assert.deepEqual([k?.id, k?.istek, k?.satirlar.map((x) => x.logoSatirRef)], [ia, 'beklet', ['9601']]);
      await vt().tx((db) => siparisLogoBekletmeSonucu(db, ia, 'serbest', { tamam: true }));
      assert.equal(siparisi(await acilistaki(s.id), a).logo?.bekletmeDurumu, 'bekliyor', 'başka isteğin sonucu yazılmaz');
      await vt().tx((db) => siparisLogoBekletmeSonucu(db, ia, 'beklet', { hata: 'Logo kilitli' }));
      assert.deepEqual([siparisi(await acilistaki(s.id), a).logo?.bekletmeDurumu, siparisi(await acilistaki(s.id), a).logo?.bekletmeHata], ['hata', 'Logo kilitli']);
      assert.equal((await bekletmeKuyrugu([ia])).length, 1, 'hata kuyrukta kalır');
      await vt().tx((db) => siparisLogoBekletmeSonucu(db, ia, 'beklet', { tamam: true }));
      let u = await acilistaki(s.id);
      assert.deepEqual([siparisi(u, a).logo?.bekletmeDurumu, await bekletmeKuyrugu([ia])], ['gonderildi', []]);
      assert.match((await beklet(u, a, 'beklet')).body, /zaten bekletiliyor/);
      u = tamam<Talep>(await beklet(u, a, 'serbest'));
      assert.deepEqual([siparisi(u, a).logo?.bekletmeIstegi, siparisi(u, a).logo?.bekletmeDurumu], ['serbest', 'bekliyor']);
      await vt().tx((db) => siparisLogoBekletmeSonucu(db, ia, 'serbest', { tamam: true }));
      assert.match((await beklet(await acilistaki(s.id), a, 'serbest')).body, /bekletilmiyor/);
      // Sırada düzenleme varken bekletme gitmez (yeni satır iki kez eklenmesin); düzenleme gidince kuyruğa döner.
      tamam<Talep>(await beklet(await acilistaki(s.id), a, 'beklet'));
      await ortam!.sahip.sorgu("UPDATE satin_alma_siparis SET logo_guncelleme_durumu = 'bekliyor' WHERE id = $1", [ia]);
      assert.deepEqual(await bekletmeKuyrugu([ia]), []);
      await ortam!.sahip.sorgu("UPDATE satin_alma_siparis SET logo_guncelleme_durumu = 'gonderildi' WHERE id = $1", [ia]);
      assert.equal((await bekletmeKuyrugu([ia])).length, 1);
      // Talep iptal edilince sıradaki bekletme düşer, iptal gider; geç gelen sonuç yazılmaz.
      const ip = tamam<Talep>(await kaydet(c.sa, { ...govde(await acilistaki(s.id)), durum: 'iptal', iptalNedeni: 'Deneme iptal' }));
      assert.deepEqual([siparisi(ip, a).logo?.bekletmeIstegi, siparisi(ip, a).logo?.bekletmeDurumu, siparisi(ip, a).logo?.iptalDurumu], [null, null, 'bekliyor']);
      await vt().tx((db) => siparisLogoBekletmeSonucu(db, ia, 'beklet', { tamam: true }));
      assert.equal(siparisi(await acilistaki(s.id), a).logo?.bekletmeDurumu, null);
    } finally {
      tamam(await logoAnahtari('logo.siparis-bekletme-gonderimi', false));
      tamam(await logoAnahtari('logo.satin-alma-gonderimi', false));
    }
  });

  test('2966-1 b Logo\'da beklet: kalanı kapatılan ya da iptal edilen siparişte doğru ileti; kapatma sıradaki bekletmeyi düşürür', async () => {
    const { s, a } = await bolunmusSiparis();
    const ia = await siparisNo(s.id, a);
    await logoSonucu(ia, { kayitNo: '9700', satirlar: [{ satirId: siparisi(s, a).satirlar[0]!.id, logoSatirRef: '9701' }] });
    tamam(await logoAnahtari('logo.siparis-bekletme-gonderimi', true));
    tamam(await logoAnahtari('logo.satin-alma-gonderimi', true));
    try {
      tamam<Talep>(await beklet(await acilistaki(s.id), a, 'beklet'));
      const k = tamam<Talep>(await kapat(await acilistaki(s.id), a));
      assert.deepEqual([siparisi(k, a).logo?.bekletmeIstegi, siparisi(k, a).logo?.bekletmeDurumu, siparisi(k, a).logo?.kapatmaDurumu], [null, null, 'bekliyor']);
      assert.deepEqual(await bekletmeKuyrugu([ia]), []);
      for (const istek_ of ['beklet', 'serbest'] as const) {
        const r = await beklet(k, a, istek_);
        assert.equal(r.statusCode, 422);
        assert.match(r.body, /Kalanı kapatılmış ya da iptal edilmiş sipariş Logo'da bekletilmez/);
      }
      const ip = tamam<Talep>(await kaydet(c.sa, { ...govde(await acilistaki(s.id)), durum: 'iptal', iptalNedeni: 'Deneme iptal' }));
      const r = await beklet(ip, a, 'beklet');
      assert.equal(r.statusCode, 422);
      assert.match(r.body, /Yalnız siparişi verilmiş talebin siparişi/);
    } finally {
      tamam(await logoAnahtari('logo.siparis-bekletme-gonderimi', false));
      tamam(await logoAnahtari('logo.satin-alma-gonderimi', false));
    }
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
    const geri = await iptalGeriAl(c.sa, ip);
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
    // 2138-2: kodu olmayan sertifikada gösterilen revizyon boştur (merkezin harfi değil).
    assert.deepEqual(ilk.belgeler.map((x) => [x.ad, x.tur, x.revKodu]), [[ad, 'sertifika', null]]);
    const tekrar = tamam<SiparisBelgeleriCevabi>(await istek(c.sa, 'POST', `/satin-alma-siparis-satirlari/${satirA}/belge-ekle`, govde, kimlik));
    assert.deepEqual(tekrar, ilk);
    const acilan = await vt().tx((db) => db.tek<{ n: number }>('SELECT count(*)::int AS n FROM belge_merkezi_belge WHERE ad = $1', [ad]));
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

    // Merkezde antet kodlu revizyon yayınlanınca satırın belgesi o kodu taşır (aktarım sınanır).
    type Merkez = { surum: number; revizyonlar: { id: number; antetRev: string | null }[] };
    const merkez = tamam<Merkez>(await istek(c.yonetici, 'GET', `/cizimler/${belgeId}`));
    const eklendi = tamam<Merkez>(await istek(c.yonetici, 'POST', `/cizimler/${belgeId}/revizyon-ekle`, { ozet: (await belgeYukle(c.yonetici)).ozet, dosyaAdi: 'sertifika-b.pdf', antetRev: '03', surum: merkez.surum }));
    const kodlu = eklendi.revizyonlar.find((x) => x.antetRev === '03');
    tamam(await istek(c.yonetici, 'POST', `/cizimler/${belgeId}/revizyonlar/${kodlu?.id}/yayinla`, { surum: eklendi.surum }));
    assert.deepEqual(tamam<SiparisBelgeleriCevabi>(await liste(c.mudur, satirA)).belgeler.map((x) => [x.harf, x.revKodu]), [['B', '03']]);

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
    kaydet(c.sa, { ...govde(t), durum: 'siparis_verildi', karar: { ...t.karar!, siparisler: [{ teklifId, siparisNo: '', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' }] } });

  test('1096 a: onaya gönderilen kararın kuru ve faizi finanstan sabitlenir, istemcinin kuru yok sayılır; 7 günden eski kilitle sipariş verilmez', async () => {
    tamam(await istek(c.yonetici, 'POST', '/finans/kur-ciftleri/ekle', { paraBirimi: 'EUR', tarih: '2026-01-03', alis: 35.5, satis: 36 }));
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

  test('2454: bütçe kullanımı sunucuda: kalem tutarı birime ve sipariş yılına, kur teklifin sabit kurundan (T1); kalanı kapatılan siparişte gerçekleşen teslim (2462 a); onay kırılımı', async () => {
    const kurEkle = async (tarih: string, kur: number) => tamam(await istek(c.yonetici, 'POST', '/finans/kur-ciftleri/ekle', { paraBirimi: 'USD', tarih, alis: kur - 0.5, satis: kur }));
    await kurEkle('2025-06-02', 30);
    const kullanim = async (cerez = c.sa) => tamam<ButceKullanimiCevabi>(await istek(cerez, 'GET', '/satin-alma-butce-kullanimi?yil=2026')).birimler;
    const bos = async () => Number((await kullanim()).find((b) => b.birim === null)?.kullanilan ?? '0');
    const once = await bos();
    // k1 B'den 10 x 9 TRY; k2 A'dan 4 x 8 USD, teklifin günü kuru 30.
    const { s, a, k2 } = await bolunmusSiparis('8', { paraBirimi: 'USD', teklifTarihi: '2025-06-03' });
    assert.equal(s.teklifler.find((q) => q.id === a)?.kur, '30');
    // Onayda kur kilitlendiyse kararın sabit kuru, yoksa teklifin kuru.
    const kur = Number(s.karar!.sabitKurlar.find((x) => x.paraBirimi === 'USD')?.kur ?? '30');
    const usd = 4 * 8 * kur;
    const ara = await bos();
    assert.equal(Math.round((ara - once) * 100) / 100, 90 + usd);
    // T1: finansın kuru sonradan değişir, kullanım değişmez.
    await kurEkle('2025-06-20', 33);
    assert.equal(await bos(), ara);
    // Onay kırılımı: birim, bu talep hariç kullanım ve bu alım.
    const d = tamam<{ butce: { birim: string | null; butce: string | null; yil: number; kullanilan: string; buAlim: string }[] }>(await istek(c.mudur, 'GET', `/satin-alma-talepleri/${s.id}/degerlendirme`)).butce;
    assert.deepEqual(d.map((x) => [x.birim, x.butce, x.yil, x.buAlim]), [[null, null, 2026, (90 + usd).toFixed(2)]]);
    assert.equal(Math.round(Number(d[0]!.kullanilan) * 100) / 100, Math.round((ara - 90 - usd) * 100) / 100);
    // 2462 a: A siparişine 1 / 4 teslim gelir ve kalanı kapatılır: kullanım gerçekleşen teslim değerine iner (çeyreği kalır; teklifte masraf yok).
    await teslimEt(siparisi(s, a).satirlar.find((x) => x.kalemId === k2)!.id, '1', 9901);
    assert.equal(await bos(), ara, 'açık siparişte kullanım sipariş tutarıdır');
    await ortam!.sahip.sorgu("UPDATE satin_alma_siparis SET logo_gonderim_durumu = 'gonderildi', logo_gonderim_zamani = now(), logo_kayit_no = 'DENEME-2454', logo_kapatma_durumu = 'bekliyor' WHERE talep_id = $1 AND teklif_id = $2", [s.id, a]);
    assert.equal(Math.round((await bos()) * 100) / 100, Math.round((ara - usd * 0.75) * 100) / 100);
    // V3: iptal edilen talep kullanımdan düşer. V4: talep eden ve işlemsiz göremez.
    await ortam!.sahip.sorgu("UPDATE satin_alma_talep SET durum = 'iptal', iptal_nedeni = 'Deneme iptal' WHERE id = $1", [s.id]);
    assert.equal(Math.round((await bos()) * 100) / 100, Math.round(once * 100) / 100);
    for (const cerez of [c.talep, c.operator]) assert.equal((await istek(cerez, 'GET', '/satin-alma-butce-kullanimi?yil=2026')).statusCode, 403);
    assert.equal((await istek(c.mudur, 'GET', '/satin-alma-butce-kullanimi?yil=26')).statusCode, 400);
  });

  // 2472 yardımcıları: siparişi Logo'ya gönderilmiş say, takipteki planı oku, notları süz.
  const logoyaGitti = async (talepId: string, teklifId: string, satirId: number, kayitNo: string) =>
    logoSonucu(await siparisNo(talepId, teklifId), { kayitNo, satirlar: [{ satirId, logoSatirRef: `${kayitNo}1` }] });
  const odemePlani = async (talepId: string, teklifId: string) => tamam<SiparisTakibiCevabi>(await istek(c.sa, 'GET', `/satin-alma-talepleri/${talepId}/siparis-takibi`))
    .siparisler.find((x) => x.teklifId === teklifId)!.odemePlani.map((x) => [x.tur, x.tutar]);
  const planToplami = (p: unknown[][]) => Math.round(p.reduce((t, x) => t + Number(x[1]), 0) * 100) / 100;

  test('2472: kalanı kapatılan siparişin planı aynı işlemde gerçekleşen teslim değerine iner (KDV dahil); bütçe kullanımıyla aynı tanım (M3); faturalı plan değişmez, not düşer; talep eden notu görmez; geri alma planı yeniden indirir', async () => {
    // A: k2 4 x 10, genel iskonto %10 (mal 36), nakliye 7 hariç + diğer 3, avans %30: 46; KDV %20 dahil 55.20, avans 16.56.
    const { s, a, b } = await bolunmusSiparis('10', { avansYuzdesi: '30', iskontoYuzdesi: '10', nakliye: '7', nakliyeDahil: false, digerMasraf: '3' });
    const [satirA, satirB] = [siparisi(s, a).satirlar[0]!.id, siparisi(s, b).satirlar[0]!.id];
    await logoyaGitti(s.id, a, satirA, '24720');
    await logoyaGitti(s.id, b, satirB, '24721');
    await teslimEt(satirA, '1', 247201);
    await teslimEt(satirB, '5', 247202);
    // Açık sipariş: plan sipariş tutarıdır.
    assert.equal(planToplami(await odemePlani(s.id, a)), 55.2);
    // B'ye fatura bağlanır: planı kilitlenir.
    const belge = tamam<{ belge: { id: number } }>(await istek(c.yonetici, 'POST', '/finans/belgeler/ekle', {
      yon: 'gider', kategori: 'mal_alimi', firmaId: firmaB, belgeNo: 'DN-2472', belgeTarihi: '2026-10-09', vade: '2026-11-09', tutar: 10, kdvOrani: 20,
    })).belge.id;
    tamam(await istek(c.sa, 'POST', `/satin-alma-talepleri/${s.id}/siparis-faturasi`, { teklifId: b, belgeId: belge, bagla: true }));
    const bPlani = await odemePlani(s.id, b);
    // A kapatılır: gerçekleşen 36 x 1/4 + 10 = 19, KDV dahil 22.80; avans 16.56 kalır, kalan tek vadeli satır.
    tamam<Talep>(await kapat(await acilistaki(s.id), a));
    const planA = await odemePlani(s.id, a);
    assert.deepEqual([planA.length, planA[0], planToplami(planA)], [2, ['avans', '16.56'], 22.8]);
    let t = await acilistaki(s.id);
    assert.ok(t.hareketler.some((h) => h.metin.includes('ödeme planı gerçekleşen teslim değerine göre yeniden kuruldu')));
    // M3: TL plan toplamı (KDV hariç) kapalı siparişin bütçe kullanımına eşittir; B açık, sipariş tutarı 10 x 9 = 90. Para birimi TRY.
    const d = tamam<{ butce: { buAlim: string }[] }>(await istek(c.mudur, 'GET', `/satin-alma-talepleri/${s.id}/degerlendirme`)).butce;
    assert.ok(Math.abs(Number(d[0]!.buAlim) - 90 - planToplami(planA) / 1.2) <= 0.01, `${d[0]!.buAlim}`);
    // B kapatılır: faturalı plan değişmez; gerçekleşen 45 (KDV dahil 54), plan 108: fark not olarak düşer.
    tamam<Talep>(await kapat(t, b));
    assert.deepEqual(await odemePlani(s.id, b), bPlani);
    t = await acilistaki(s.id);
    const notlar = t.hareketler.filter((h) => /gerçekleşen teslim değerinden|gerçekleşen teslim değerine göre/.test(h.metin));
    assert.ok(notlar.some((h) => h.metin.includes('ödeme planı gerçekleşen teslim değerinden 54 TRY farklı; planı gözden geçirin')));
    // Güvenlik: notlar tutar taşır; yazarı kapatan satın almacıdır, talep edenin görünümüne girmez.
    assert.ok(notlar.every((h) => h.kisiId === kisi.sa));
    assert.equal(talepEdenGorunumu(t, kisi.talep!).hareketler.some((h) => /gerçekleşen teslim/.test(h.metin)), false);
    // Kapalı siparişte teslim geri alınır: teslim kalmaz, gerçekleşen değer 0; plandaki avans da 0'a iner (2480-1 a), plan kalkar.
    await geriAl(247201);
    assert.deepEqual(await odemePlani(s.id, a), []);
    assert.ok((await acilistaki(s.id)).hareketler.some((h) => h.metin.includes('ödeme planı kaldırıldı: gerçekleşen teslim değeri yok')));
  });

  test('2472 M2, 2132-6 a: avans gerçekleşen değeri aşarsa vadeli satır yazılmaz, fark KDV dahil sipariş dövizinde geçmişe düşer; elle plan değişmez, not düşer', async () => {
    // A: 4 x 10 = 40, avans %80 = 32; KDV dahil avans 38.40. 1 / 4 teslim: gerçekleşen 10, KDV dahil 12; aşım 26.40.
    const { s, a, b } = await bolunmusSiparis('10', { avansYuzdesi: '80' });
    const [satirA, satirB] = [siparisi(s, a).satirlar[0]!.id, siparisi(s, b).satirlar[0]!.id];
    await logoyaGitti(s.id, a, satirA, '24730');
    await logoyaGitti(s.id, b, satirB, '24731');
    await teslimEt(satirA, '1', 247301);
    tamam<Talep>(await kapat(await acilistaki(s.id), a));
    // 2480-1 a: plandaki avans gerçekleşen değere (KDV dahil 12) iner; asıl aşım geçmişte alacak notu olarak kalır.
    assert.deepEqual(await odemePlani(s.id, a), [['avans', '12']]);
    assert.ok((await acilistaki(s.id)).hareketler.some((h) => /avans gerçekleşen teslim değerini 26\.4 TRY aşıyor; plandaki avans gerçekleşen değere indirildi, avans ödendiyse fark tedarikçiden alacaktır/.test(h.metin)));
    // 2480: kapalı siparişin faturası gerçekleşen değerle (KDV hariç 10) eşleşir; bilerek kapatılan kalan eksik teslim uyarısı vermez.
    const belge = tamam<{ belge: { id: number } }>(await istek(c.yonetici, 'POST', '/finans/belgeler/ekle', {
      yon: 'gider', kategori: 'mal_alimi', firmaId: firmaA, belgeNo: 'DN-2480', belgeTarihi: '2026-10-09', vade: '2026-11-09', tutar: 10, kdvOrani: 20,
    })).belge.id;
    assert.deepEqual(tamam<{ uyarilar: string[] }>(await istek(c.sa, 'POST', `/satin-alma-talepleri/${s.id}/siparis-faturasi`, { teklifId: a, belgeId: belge, bagla: true })).uyarilar, []);
    // B: elle plan (100); 4 / 10 teslim, gerçekleşen 36, KDV dahil 43.20: plan yerinde kalır, fark 56.80.
    tamam(await istek(c.sa, 'POST', `/satin-alma-talepleri/${s.id}/odeme-plani`, { teklifId: b, surum: (await acilistaki(s.id)).surum,
      satirlar: [{ tur: 'vade', vade: '2026-12-15', yontem: 'banka', tutar: '100' }] }));
    await teslimEt(satirB, '4', 247302);
    tamam<Talep>(await kapat(await acilistaki(s.id), b));
    assert.deepEqual(await odemePlani(s.id, b), [['vade', '100']]);
    assert.ok((await acilistaki(s.id)).hareketler.some((h) => h.metin.includes('ödeme planı gerçekleşen teslim değerinden 56.8 TRY farklı')));
  });

  test('2480 (Maliyet P1): dövizli kapalı siparişte plan ve bütçe aynı değeri verir; karşılaştırma sipariş dövizinde, 0,01 USD', async () => {
    tamam(await istek(c.yonetici, 'POST', '/finans/kur-ciftleri/ekle', { paraBirimi: 'USD', tarih: '2025-07-02', alis: 34.5, satis: 35 }));
    // A: k2 4 x 8.33 USD, nakliye 4.17 hariç; 1 / 4 teslim: 8.33 + 4.17 = 12.50 USD.
    const { s, a, b } = await bolunmusSiparis('8.33', { paraBirimi: 'USD', teklifTarihi: '2025-07-03', nakliye: '4.17', nakliyeDahil: false });
    const kur = Number(s.karar!.sabitKurlar.find((x) => x.paraBirimi === 'USD')?.kur ?? s.teklifler.find((q) => q.id === a)!.kur);
    const [satirA, satirB] = [siparisi(s, a).satirlar[0]!.id, siparisi(s, b).satirlar[0]!.id];
    await logoyaGitti(s.id, a, satirA, '24800');
    await logoyaGitti(s.id, b, satirB, '24801');
    await teslimEt(satirA, '1', 248001);
    tamam<Talep>(await kapat(await acilistaki(s.id), a));
    const planA = await odemePlani(s.id, a);
    assert.equal(planToplami(planA), 15);
    // B açık, TRY 10 x 9 = 90.
    const d = tamam<{ butce: { buAlim: string }[] }>(await istek(c.mudur, 'GET', `/satin-alma-talepleri/${s.id}/degerlendirme`)).butce;
    assert.ok(Math.abs((Number(d[0]!.buAlim) - 90) / kur - planToplami(planA) / 1.2) <= 0.01, `${d[0]!.buAlim} / ${kur}`);
  });

  // 2611 a yardımcıları: projeler sahibin bağlantısıyla eklenir (projeler modülünün ucu bu testin konusu değil).
  const projeEkle = async (kod: string, durum = 'aktif') => (await ortam!.sahip.tx((db) => db.tek<{ id: number }>(
    "INSERT INTO projeler_proje (kod, ad, durum, olusturan_id) VALUES ($1, $2, $3, $4) RETURNING id", [kod, `Deneme proje ${kod}`, durum, yoneticiId])))!.id;

  test('2611 a: emirsiz talep projeye bağlanır; yalnız aktif proje, emirli talepte proje yok; gelmeyen alan projeyi korur; değişiklik harekete yazılır; başkasının talebinde 403 (K1); seçenek ucu talep açana açık (K4)', async () => {
    const aktif = await projeEkle('P2611A');
    const pasif = await projeEkle('P2611B', 'tamamlandi');
    const secenek = tamam<{ projeler: { id: number }[] }>(await istek(c.talep, 'GET', '/satin-alma-talepleri/proje-secenekleri')).projeler.map((p) => p.id);
    assert.deepEqual([secenek.includes(aktif), secenek.includes(pasif)], [true, false]);
    assert.equal((await istek(c.operator, 'GET', '/satin-alma-talepleri/proje-secenekleri')).statusCode, 403);
    assert.equal((await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ projeId: pasif }))).statusCode, 400);
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ projeId: aktif })));
    assert.deepEqual([t.projeId, t.proje?.kod], [aktif, 'P2611A']);
    // Alanı bilmeyen istemci: projeId gövdede yok, proje kalır.
    const { projeId: _p, ...alansiz } = govde(t);
    const korundu = tamam<Talep>(await kaydet(c.talep, { ...alansiz, notlar: 'Deneme not' }));
    assert.equal(korundu.projeId, aktif);
    // K1: başkasının talebinin projesini değiştirmek gövde değişikliğidir.
    assert.equal((await kaydet(c.talep2, { ...govde(korundu), projeId: null })).statusCode, 403);
    const kalkti = tamam<Talep>(await kaydet(c.talep, { ...govde(korundu), projeId: null }));
    assert.deepEqual([kalkti.projeId, kalkti.proje], [null, null]);
    assert.ok(kalkti.hareketler.some((h) => h.metin === 'Proje: P2611A Deneme proje P2611A -> yok'), JSON.stringify(kalkti.hareketler));
    // Proje pasifleşince yeniden seçilemez; emirli talebe proje veritabanında da girmez.
    assert.equal((await kaydet(c.talep, { ...govde(kalkti), projeId: pasif })).statusCode, 400);
    await assert.rejects(ortam!.sahip.sorgu('UPDATE satin_alma_talep SET uretim_emri_id = $2, proje_id = $3 WHERE id = $1', [t.id, await emirAc(), aktif]),
      kisitla('satin_alma_talep_proje_emirsiz'));
  });

  test('2611 a, Maliyet C1, Veri 2 ve 4: projeye yalnız stoğa girmeyen satır gider (hizmet teslim değeriyle, masraf payıyla); farklı projeli talepler birleşmez; birleşmiş kaynak sayılmaz', async () => {
    const p = await projeEkle('P2611C');
    const hizmetNo = await (async () => {
      tamam(await istek(c.yonetici, 'POST', '/malzeme-katalogu-kartlari/sa-hizmet-2611/kaydet', {
        kayit: { id: 'sa-hizmet-2611', tur: 'hizmet', com: { kod: 'HZ-SAT-00001', ad: 'Deneme hizmet 2611', birim: 'saat' }, g: { kat: 'fason', yon: 'Alınan', cesit: 'Talaşlı imalat' }, onay: { durum: 'aktif' } },
        ozet: { benzersiz_anahtar: null, mukerrer_gerekcesi: null }, surum: null,
      }));
      return (await ortam!.sahip.tx((db) => db.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kimlik = 'sa-hizmet-2611'")))!.no;
    })();
    const hizmetKatalog = tamam<KatalogKaydi>(await istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', { id: randomUUID(), malzemeNo: hizmetNo, ozellik: '', notlar: '', takmaAdlari: [], surum: null })).id;
    const tutar = async () => (await vt().tx((db) => servis.projeSatinAlmaTutarlari(db, [p]))).get(p) ?? [];
    // Stok kartlı 10 x 10 = 100, hizmet 4 x 5 = 20; nakliye 12 hariç.
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme', projeId: p,
      kalemler: [kalem('Deneme stoklu'), { ...kalem('Deneme hizmet', '4', hizmetKatalog), birim: 'saat' }] })));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const q = teklif(firmaA, [[k1, '10'], [k2, '5']], { nakliye: '12', nakliyeDahil: false });
    const onayda = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'onayda', teklifler: [q],
      karar: { mod: 'tek', teklifId: q.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] } }));
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [onayKaydi()] }));
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi',
      karar: { ...onayli.karar!, siparisler: [{ teklifId: q.id, siparisNo: 'SA-2611', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' }] } }));
    const satir = (kalemId: string) => siparisi(s, q.id).satirlar.find((r) => r.kalemId === kalemId)!.id;
    assert.deepEqual(await tutar(), [], 'teslimsiz');
    await teslimEt(satir(k1), '10', 261101);
    assert.deepEqual(await tutar(), [], 'yalnız stok kartlı satır geldi: stoğa girdi, sarfla emre gider');
    // Hizmetin yarısı: 10 + 12 x 20 / 120 = 12.
    await teslimEt(satir(k2), '2', 261102);
    assert.deepEqual(await tutar(), [{ tutar: '12.00', paraBirimi: 'TRY' }]);
    // Farklı projeli ya da projesiz kaynak birleşmez; aynı projeli kaynaklar birleşince yalnız birleşik talep sayılır.
    const ac = async (projeId: number | null) => tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ projeId })));
    const [a1, a2, bos] = [await ac(p), await ac(p), await ac(null)];
    assert.equal((await birlestir(c.sa, [a1.id, bos.id])).statusCode, 422);
    const birlesik = tamam<Talep>(await birlestir(c.sa, [a1.id, a2.id]));
    assert.equal(birlesik.projeId, p);
    const sayilan = await vt().tx((db) => db.sorgu<{ talepId: string }>('SELECT DISTINCT talep_id AS "talepId" FROM satin_alma_siparis_satiri WHERE talep_id = ANY($1::uuid[])', [[a1.id, a2.id]]));
    assert.deepEqual(sayilan, [], 'kaynağın siparişi yok; tutar birleşik talepten bir kez gelir');
    assert.deepEqual(await tutar(), [{ tutar: '12.00', paraBirimi: 'TRY' }]);
  });

  test('2638, 2637 a, Maliyet C1, Mimar N2: emirli talepte hizmet satırı projeli emre yazılır, projeye değil; projesiz emirde genel gidere gider; oran sipariş anahtarıyla toplu çekilir', async () => {
    const p = await projeEkle('P2638');
    const e = await emirAc();
    await ortam!.sahip.sorgu('UPDATE uretim_emri SET proje_id = $2 WHERE id = $1', [e, p]);
    tamam(await istek(c.yonetici, 'POST', '/malzeme-katalogu-kartlari/sa-hizmet-2638/kaydet', {
      kayit: { id: 'sa-hizmet-2638', tur: 'hizmet', com: { kod: 'HZ-SAT-02638', ad: 'Deneme hizmet 2638', birim: 'saat' }, g: { kat: 'fason', yon: 'Alınan', cesit: 'Talaşlı imalat' }, onay: { durum: 'aktif' } },
      ozet: { benzersiz_anahtar: null, mukerrer_gerekcesi: null }, surum: null,
    }));
    const hizmetNo = (await ortam!.sahip.tx((db) => db.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kimlik = 'sa-hizmet-2638'")))!.no;
    const hizmetKatalog = tamam<KatalogKaydi>(await istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', { id: randomUUID(), malzemeNo: hizmetNo, ozellik: '', notlar: '', takmaAdlari: [], surum: null })).id;
    // Stok kartlı 10 x 10 = 100, hizmet 4 x 5 = 20; nakliye 12 hariç.
    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme', uretimEmriId: e,
      kalemler: [kalem('Deneme stoklu'), { ...kalem('Deneme hizmet', '4', hizmetKatalog), birim: 'saat' }] })));
    const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
    const q = teklif(firmaA, [[k1, '10'], [k2, '5']], { nakliye: '12', nakliyeDahil: false });
    const onayda = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'onayda', teklifler: [q],
      karar: { mod: 'tek', teklifId: q.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] } }));
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [onayKaydi()] }));
    const s = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi',
      karar: { ...onayli.karar!, siparisler: [{ teklifId: q.id, siparisNo: 'SA-2638', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' }] } }));
    await teslimEt(siparisi(s, q.id).satirlar.find((r) => r.kalemId === k2)!.id, '2', 263801);
    const emirTutari = async () => (await vt().tx((db) => servis.emirHizmetTutarlari(db, [e]))).get(e) ?? [];
    const anahtar = `${t.id}:${q.id}`;
    const oranlar = () => vt().tx((db) => servis.siparisGenelGiderOranlari(db, [{ talepId: t.id, teklifId: q.id }, { talepId: t.id, teklifId: randomUUID() }]));
    // Hizmetin yarısı: 10 + 12 x 20 / 120 = 12; emrin projesine proje maliyeti kendisi bağlar, projeye ikinci kez sayılmaz.
    assert.deepEqual(await emirTutari(), [{ tutar: '12.00', paraBirimi: 'TRY' }]);
    assert.deepEqual((await vt().tx((db) => servis.projeSatinAlmaTutarlari(db, [p]))).get(p), undefined);
    assert.deepEqual([...(await oranlar())], [[anahtar, 0]], 'bilinmeyen sipariş haritada yok');
    // C1: emrin projesi kalkınca hizmet satırı genel gidere gider: oran 20 / 120.
    await ortam!.sahip.sorgu('UPDATE uretim_emri SET proje_id = NULL WHERE id = $1', [e]);
    assert.deepEqual(await emirTutari(), []);
    assert.equal((await oranlar()).get(anahtar), 0.166667);
    // Mimar N2: pasif hizmet kartı yine hizmettir; satır genel giderde kalır, stoğa sayılmaz.
    await ortam!.sahip.sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'pasif' WHERE kimlik = 'sa-hizmet-2638'");
    assert.equal((await oranlar()).get(anahtar), 0.166667);
    // Fatura gerçektir: talep iptal olsa da oran çekilir.
    await ortam!.sahip.sorgu("UPDATE satin_alma_talep SET durum = 'iptal', iptal_nedeni = 'Deneme' WHERE id = $1", [t.id]);
    assert.equal((await oranlar()).get(anahtar), 0.166667);
  });

  test('2613 2/2, 2720-1, 2733 a: emre ve projeye bağlı siparişin malzeme birim fiyatı ve net teslim miktarı; teslimle ağırlıklı, iki iskonto, sabit kur önce; iade, fason, iptal ve emirli talebin projesi sayılmaz', async () => {
    const e = await emirAc();
    const p = await projeEkle('P2720');
    const emirli = await bolunmusSiparis('5');
    const ikinci = await bolunmusSiparis('7');
    const projeli = await bolunmusSiparis('8');
    const m = (await vt().tx((db) => db.tek<{ n: number }>(
      'SELECT c.malzeme_no AS n FROM satin_alma_talep_kalemi k JOIN satin_alma_katalog c ON c.id = k.katalog_id WHERE k.talep_id = $1 AND k.id = $2', [emirli.s.id, emirli.k2])))!.n;
    await ortam!.sahip.tx(async (db) => {
      await db.sorgu('UPDATE satin_alma_talep SET uretim_emri_id = $2 WHERE id = ANY($1::uuid[])', [[emirli.s.id, ikinci.s.id], e]);
      await db.sorgu('UPDATE satin_alma_talep SET proje_id = $2 WHERE id = $1', [projeli.s.id, p]);
      // Teklif iskontosu 10: 5 -> 4.5.
      await db.sorgu('UPDATE satin_alma_teklif SET iskonto_yuzdesi = 10 WHERE talep_id = $1 AND id = $2', [emirli.s.id, emirli.a]);
      await db.sorgu("UPDATE satin_alma_teklif SET para_birimi = 'USD', kur = 30 WHERE talep_id = $1 AND id = $2", [projeli.s.id, projeli.a]);
    });
    const oku = (emirIdleri: number[], projeIdleri: number[], malzemeNolar: number[]) => vt().tx((db) => siparisBirimFiyatlari(db, { emirIdleri, projeIdleri, malzemeNolar }));
    assert.deepEqual(await oku([e], [p], [m]), [], 'teslimsiz satır yok');
    await teslimEt(siparisi(emirli.s, emirli.a).satirlar[0]!.id, '1', 272001);
    // Mal kabul düzeltmesi (2733 a, Test): 3 alınıp geri alınır, 2.5 yeniden alınır; net 2.5.
    await teslimEt(siparisi(ikinci.s, ikinci.a).satirlar[0]!.id, '3', 272002);
    await geriAl(272002);
    await teslimEt(siparisi(ikinci.s, ikinci.a).satirlar[0]!.id, '2.500', 272005);
    await teslimEt(siparisi(projeli.s, projeli.a).satirlar[0]!.id, '1', 272003);
    // İade: B satırı (aynı kart, 9) teslim alınıp geri alınır; neti 0, ortalamaya girmez.
    await teslimEt(siparisi(emirli.s, emirli.b).satirlar[0]!.id, '2', 272004);
    await geriAl(272004);
    // (4.5 x 1 + 7 x 2.5) / 3.5 = 6.285714 -> 4 ondalık. Proje: USD 8 x teklif kuru 30. Teslim miktarı net teslimdir (iade ve geri alınan
    // düşer), sondaki sıfırlar atılır; mal kabulün stok giriş miktarıyla aynıdır (stok birimi).
    assert.deepEqual(await oku([e, e], [p], [m, 2147483000]), [
      { hedef: 'emir', hedefId: e, malzemeNo: m, tryBirimFiyati: '6.2857', teslimMiktari: '3.5' },
      { hedef: 'proje', hedefId: p, malzemeNo: m, tryBirimFiyati: '240', teslimMiktari: '1' },
    ]);
    // Sabit kur teklif kurundan önce gelir.
    await ortam!.sahip.sorgu("INSERT INTO satin_alma_sabit_kur (talep_id, para_birimi, kur, aylik_faiz_yuzdesi) VALUES ($1, 'USD', 32, NULL)", [projeli.s.id]);
    assert.deepEqual((await oku([], [p], [m])).map((x) => x.tryBirimFiyati), ['256']);
    // 2611 a: emri olan satır proje hedefinde sayılmaz. Talepte emir ve proje birlikte olamaz (CHECK); emir birleşik talepte kalemin kaynağından
    // gelebilir (KALEM_EMRI): projeli talebin kalemi emirli kaynağa bağlanınca satır emirde kalır, projede görünmez.
    const p2 = await projeEkle('P2720B');
    await ortam!.sahip.tx(async (db) => {
      await db.sorgu('UPDATE satin_alma_talep SET uretim_emri_id = NULL, proje_id = $2 WHERE id = $1', [emirli.s.id, p2]);
      await db.sorgu('UPDATE satin_alma_talep_kalemi SET kaynak_talep_id = $2, kaynak_sira = 1 WHERE talep_id = $1', [emirli.s.id, ikinci.s.id]);
    });
    assert.deepEqual(await oku([], [p2], [m]), []);
    assert.deepEqual((await oku([e], [], [m])).map((x) => [x.tryBirimFiyati, x.teslimMiktari]), [['6.2857', '3.5']]);
    // Fason satırı (iş emri bağı) gelmez: ikinci siparişin satırı fasona bağlanınca emirde yalnız ilk sipariş kalır.
    const tip = (await ortam!.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
    const ie = (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, 1, 10, $2, 'Deneme fason') RETURNING id", [e, tip]))!.id;
    await ortam!.sahip.sorgu('UPDATE satin_alma_siparis_satiri SET is_emri_id = $2 WHERE id = $1', [siparisi(ikinci.s, ikinci.a).satirlar[0]!.id, ie]);
    assert.deepEqual((await oku([e], [], [m])).map((x) => [x.tryBirimFiyati, x.teslimMiktari]), [['4.5', '1']]);
    // İptal talep sayılmaz.
    await ortam!.sahip.sorgu("UPDATE satin_alma_talep SET durum = 'iptal', iptal_nedeni = 'Deneme' WHERE id = $1", [emirli.s.id]);
    assert.deepEqual(await oku([e], [], [m]), []);
    assert.deepEqual(await oku([], [], [m]), []);
    assert.deepEqual(await oku([e], [p], []), []);
  });

  test('2642 b, 2646 a, Veri 1-2, Güvenlik K1-K3: fatura satırlara eşlenir; oran (G + (B - E) x S) / B; sürüm 409; aşım 422; bayat eşleme sayılmaz; eşlenen satır silinmez', async () => {
    const hizmetNo = await (async () => {
      tamam(await istek(c.yonetici, 'POST', '/malzeme-katalogu-kartlari/sa-hizmet-2642/kaydet', {
        kayit: { id: 'sa-hizmet-2642', tur: 'hizmet', com: { kod: 'HZ-SAT-02642', ad: 'Deneme hizmet 2642', birim: 'saat' }, g: { kat: 'fason', yon: 'Alınan', cesit: 'Talaşlı imalat' }, onay: { durum: 'aktif' } },
        ozet: { benzersiz_anahtar: null, mukerrer_gerekcesi: null }, surum: null,
      }));
      return (await ortam!.sahip.tx((db) => db.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kimlik = 'sa-hizmet-2642'")))!.no;
    })();
    const hizmetKatalog = tamam<KatalogKaydi>(await istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', { id: randomUUID(), malzemeNo: hizmetNo, ozellik: '', notlar: '', takmaAdlari: [], surum: null })).id;
    // Stok kartlı 10 x 10 = 100, hizmet 4 x 5 = 20; nakliye 12 hariç; sipariş oranı S = 20 / 120.
    const siparisAc = async (no: string) => {
      const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ durum: 'degerlendirme',
        kalemler: [kalem('Deneme stoklu'), { ...kalem('Deneme hizmet', '4', hizmetKatalog), birim: 'saat' }] })));
      const [k1, k2] = t.kalemler.map((k) => k.id) as [string, string];
      const q = teklif(firmaA, [[k1, '10'], [k2, '5']], { nakliye: '12', nakliyeDahil: false });
      const onayda = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'onayda', teklifler: [q],
        karar: { mod: 'tek', teklifId: q.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] } }));
      const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [onayKaydi()] }));
      const s = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi',
        karar: { ...onayli.karar!, siparisler: [{ teklifId: q.id, siparisNo: no, siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' }] } }));
      const satir = (kalemId: string) => siparisi(s, q.id).satirlar.find((r) => r.kalemId === kalemId)!.id;
      return { talepId: t.id, teklifId: q.id, stok: satir(k1), hizmet: satir(k2) };
    };
    const a = await siparisAc('SA-2642-A');
    const belgeId = (await ortam!.sahip.tek<{ id: number }>(
      `INSERT INTO finans_belge (yon, tur, kategori, firma_id, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, satin_alma_talep_id, satin_alma_teklif_id, olusturan_id)
       VALUES ('gider', 'fatura', 'mal_alimi', $1, '2026-10-21', '2026-11-20', 'TRY', 1, 132, 0, $2, $3, $4) RETURNING id`, [firmaA, a.talepId, a.teklifId, yoneticiId]))!.id;
    const yol = `/satin-alma-fatura-eslemeleri/${belgeId}`;
    const oku = async () => tamam<FaturaEslemesiCevabi>(await istek(c.yonetici, 'GET', yol));
    const yaz = (surum: number, satirlar: { siparisSatiriId: number; tutar: string }[], kim = c.yonetici) => istek(kim, 'POST', `${yol}/kaydet`, { surum, satirlar });
    const S = 0.166667;
    const ilk = await oku();
    assert.deepEqual([ilk.esleme, ilk.oran, ilk.surum, ilk.paraBirimi, ilk.eslenmemisKalan, ilk.belgeNo, ilk.firmaAdi], ['yok', S, 0, 'TRY', '132.00', null, 'Deneme Tedarik A']);
    assert.deepEqual(ilk.satirlar.map((r) => [r.siparisSatiriId, r.yol, r.siparisTutari, r.tutar]), [[a.stok, 'stok', '100.00', null], [a.hizmet, 'genel_gider', '20.00', null]]);
    // Güvenlik K1-K2: talep eden okuyamaz; satın almacı (finans.yaz yok) yazamaz.
    assert.equal((await istek(c.talep, 'GET', yol)).statusCode, 403);
    assert.equal((await yaz(0, [], c.sa)).statusCode, 403);
    // Kısmi: yalnız stok eşlendi; kalan 32, siparişin eşlenmemiş kısmının oranıyla (2646 a, Maliyet C1): hizmet 20 ve masrafın hizmet payı
    // 12 x 20 / 120 = 2, payda 20 + 12: kalanın oranı 22 / 32, belge oranı 22 / 132. Stokun masraf payı hiçbir hedefe gitmez (N4).
    const kismi = tamam<FaturaEslemesiCevabi>(await yaz(0, [{ siparisSatiriId: a.stok, tutar: '100' }]));
    assert.deepEqual([kismi.esleme, kismi.oran, kismi.surum, kismi.eslenmemisKalan], ['kismi', 0.166667, 1, '32.00']);
    assert.equal((await yaz(0, [{ siparisSatiriId: a.stok, tutar: '100' }])).statusCode, 409, 'eski sürüm');
    assert.equal((await yaz(1, [{ siparisSatiriId: a.stok, tutar: '100' }, { siparisSatiriId: a.hizmet, tutar: '40' }])).statusCode, 422, 'aşım');
    const tam = tamam<FaturaEslemesiCevabi>(await yaz(1, [{ siparisSatiriId: a.stok, tutar: '100' }, { siparisSatiriId: a.hizmet, tutar: '32' }]));
    assert.deepEqual([tam.esleme, tam.oran, tam.surum], ['tam', 0.242424, 2], 'stok satırı değişmedi, hizmet eklendi');
    assert.deepEqual([...(await vt().tx((db) => servis.belgeGenelGiderOranlari(db, [belgeId, belgeId + 1000])))], [[belgeId, { oran: 0.242424, esleme: 'tam' }]]);
    // Veri 2: eşlenen satır silinmez (kaldırılmış eşleme de tutar).
    await assert.rejects(ortam!.sahip.sorgu('DELETE FROM satin_alma_siparis_satiri WHERE id = $1', [a.hizmet]), kisitla('satin_alma_fatura_eslemesi_satir'));
    // Veri 1: belge başka siparişe bağlanınca eski eşleme bayattır, sayılmaz: oran yeni siparişin oranı.
    const b = await siparisAc('SA-2642-B');
    await ortam!.sahip.sorgu('UPDATE finans_belge SET satin_alma_talep_id = $2, satin_alma_teklif_id = $3 WHERE id = $1', [belgeId, b.talepId, b.teklifId]);
    const bayat = await oku();
    assert.deepEqual([bayat.esleme, bayat.oran, bayat.bayat.length, bayat.satirlar.every((r) => r.tutar === null)], ['yok', S, 2, true]);
    // Bayat eşleme liste kaydında kaldırılır; başka siparişin satırı 422.
    assert.equal((await yaz(2, [{ siparisSatiriId: a.stok, tutar: '10' }])).statusCode, 422);
    const yeni = tamam<FaturaEslemesiCevabi>(await yaz(2, [{ siparisSatiriId: b.hizmet, tutar: '132' }]));
    assert.deepEqual([yeni.esleme, yeni.oran, yeni.bayat, yeni.surum], ['tam', 1, [], 5]);
    // Maliyet N2: aynı satır başka faturaya da eşlenirse uyarı verisi gelir (kayıt engellenmez).
    const ikinci = (await ortam!.sahip.tek<{ id: number }>(
      `INSERT INTO finans_belge (yon, tur, kategori, firma_id, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, satin_alma_talep_id, satin_alma_teklif_id, olusturan_id)
       VALUES ('gider', 'fatura', 'mal_alimi', $1, '2026-10-22', '2026-11-20', 'TRY', 1, 50, 0, $2, $3, $4) RETURNING id`, [firmaA, b.talepId, b.teklifId, yoneticiId]))!.id;
    tamam(await istek(c.yonetici, 'POST', `/satin-alma-fatura-eslemeleri/${ikinci}/kaydet`, { surum: 0, satirlar: [{ siparisSatiriId: b.hizmet, tutar: '20' }] }));
    assert.equal((await oku()).satirlar.find((r) => r.siparisSatiriId === b.hizmet)?.baskaBelgelerden, '20.00');
    // Maliyet (21:15Z): başka para birimindeki belgenin eşlemesi toplama katılmaz.
    const usd = (await ortam!.sahip.tek<{ id: number }>(
      `INSERT INTO finans_belge (yon, tur, kategori, firma_id, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, satin_alma_talep_id, satin_alma_teklif_id, olusturan_id)
       VALUES ('gider', 'fatura', 'mal_alimi', $1, '2026-10-23', '2026-11-20', 'USD', 30, 5, 0, $2, $3, $4) RETURNING id`, [firmaA, b.talepId, b.teklifId, yoneticiId]))!.id;
    tamam(await istek(c.yonetici, 'POST', `/satin-alma-fatura-eslemeleri/${usd}/kaydet`, { surum: 0, satirlar: [{ siparisSatiriId: b.hizmet, tutar: '5' }] }));
    assert.equal((await oku()).satirlar.find((r) => r.siparisSatiriId === b.hizmet)?.baskaBelgelerden, '20.00');
    // Veri K1: eşlenmiş satır (A'da yalnız kaldırılmış eşleme, B'de etkin) talep kaydında siparişten çıkarılamaz: 409.
    for (const [x, satirId] of [[a, a.hizmet], [b, b.hizmet]] as const) {
      const t = await acilistaki(x.talepId);
      const kalemId = siparisi(t, x.teklifId).satirlar.find((r) => r.id === satirId)!.kalemId;
      const red = await kaydet(c.sa, { ...govde(t), teklifler: t.teklifler.map((q) => (q.id === x.teklifId ? { ...q, fiyatlar: q.fiyatlar.filter((f) => f.kalemId !== kalemId) } : q)) });
      assert.deepEqual([red.statusCode, (red.json() as { mesaj: string }).mesaj], [409, ILETILER.eslemeliSatir]);
    }
    // Veri 3: kaldırma dışındaki alan değişmez (tetik, adlı kısıt).
    await assert.rejects(ortam!.sahip.sorgu('UPDATE satin_alma_fatura_eslemesi SET tutar = 1 WHERE belge_id = $1', [belgeId]), kisitla('satin_alma_fatura_eslemesi_kaldirma'));
    // Siparişsiz belge 422.
    await ortam!.sahip.sorgu('UPDATE finans_belge SET satin_alma_talep_id = NULL, satin_alma_teklif_id = NULL WHERE id = $1', [ikinci]);
    assert.equal((await istek(c.yonetici, 'GET', `/satin-alma-fatura-eslemeleri/${ikinci}`)).statusCode, 422);
  });

  test('2614 1/2 a: idari talep kalemsiz taslak satın alma talebine çevrilir; açan çeviren, talep eden idari talebi açan (K3); yetkisiz 403 (K2); ikinci çevirme 409', async () => {
    const idari = (await ortam!.sahip.tx((db) => db.tek<{ id: number }>(
      "INSERT INTO idari_isler_talep (no, kategori, yer, aciklama, acan_kisi_id) VALUES ('IT-2611', 'bina', 'Deneme yer', 'Deneme açıklama', $1) RETURNING id", [kisi.talep])))!.id;
    const g = { idariTalepId: idari, idariTalepNo: 'IT-2611', baslik: 'Deneme raf alımı', notlar: 'Deneme açıklama', talepEdenKisiId: kisi.talep! };
    const kim = (islemler: string[]): Kullanici => ({ id: kisi.sa!, ad: 'Deneme sa', islemler: islemler as Kullanici['islemler'] });
    await assert.rejects(vt().tx((db) => servis.idariTaleptenTalepAc(db, kim(['idari-isler.talep-yonet']), g)), hataKodu('YETKI_YOK'));
    const acilan = await vt().tx((db) => servis.idariTaleptenTalepAc(db, kim(['satin-alma.talep-ac']), g));
    const t = await acilistaki(acilan.id);
    assert.deepEqual([t.no, t.durum, t.kalemler.length, t.acanKisiId, t.talepEdenKisiId, t.baslik], [acilan.no, 'taslak', 0, kisi.sa, kisi.talep, 'Deneme raf alımı']);
    assert.ok(t.hareketler.some((h) => h.metin === 'İdari talep IT-2611 çevrildi; talep eden: Deneme talep'), JSON.stringify(t.hareketler));
    await assert.rejects(vt().tx((db) => servis.idariTaleptenTalepAc(db, kim(['satin-alma.yaz']), g)), hataKodu('CAKISMA'));
    assert.deepEqual((await vt().tx((db) => servis.idariTalepSatinAlmalari(db, [idari, idari + 1]))).get(idari), { talepId: acilan.id, no: acilan.no, durum: 'taslak' });
    // Güncelleme yolu bağı değiştirmez.
    tamam<Talep>(await kaydet(c.sa, { ...govde(t), baslik: 'Deneme raf alımı 2', idariTalepId: null }));
    assert.equal((await vt().tx((db) => servis.idariTalepSatinAlmalari(db, [idari]))).get(idari)?.talepId, acilan.id);
  });

  test('2624 b: farklı emirli talepler birleşir, kaynaktan gelen kalem kendi emrine bağlı kalır (mal kabul); talep emri yalnız kaynaksız kaleme; emir değişikliği harekete; emirli kaynaklı birleşik talebe proje yok; talep eden başka kaynağın emrini görmez', async () => {
    const [e1, e2, e3] = [await emirAc(), await emirAc(), await emirAc()];
    const a = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ uretimEmriId: e1, kalemler: [kalem('Deneme A kalemi')] })));
    const b = tamam<Talep>(await istek(c.talep2, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ uretimEmriId: e2, kalemler: [kalem('Deneme B kalemi')] })));
    const birlesik = tamam<Talep>(await birlestir(c.sa, [a.id, b.id]));
    assert.equal(birlesik.uretimEmriId, null);
    const emirNo = (t: Talep, kaynakId: string) => t.kaynaklar?.find((x) => x.talepId === kaynakId)?.uretimEmriNo;
    assert.deepEqual([emirNo(birlesik, a.id), emirNo(birlesik, b.id)], [a.uretimEmriNo, b.uretimEmriNo]);
    // Veri 4: emirli kaynaktan kalemi olan birleşik talep projeye bağlanmaz.
    const p = await projeEkle('P2624');
    assert.equal((await kaydet(c.sa, { ...govde(birlesik), projeId: p })).statusCode, 400);
    // Talep düzeyinde emir seçilir; hareket yazılır, kaynaktan gelen kalem kaynağın emrinde kalır.
    const yeniKalem = kalem('Deneme sonradan eklenen');
    const emirli = tamam<Talep>(await kaydet(c.sa, { ...govde(birlesik), uretimEmriId: e3, kalemler: [...birlesik.kalemler, yeniKalem] }));
    assert.ok(emirli.hareketler.some((h) => h.metin === `Üretim emri: yok -> ${emirli.uretimEmriNo}`), JSON.stringify(emirli.hareketler));
    const [ka, kb] = [emirli.kaynaklar!.find((x) => x.talepId === a.id)!.kalemIdleri[0]!, emirli.kaynaklar!.find((x) => x.talepId === b.id)!.kalemIdleri[0]!];
    const q = teklif(firmaA, [[ka, '10'], [kb, '10'], [yeniKalem.id, '10']]);
    const degerlendirmede = tamam<Talep>(await kaydet(c.sa, { ...govde(emirli), durum: 'degerlendirme' }));
    const onayda = tamam<Talep>(await kaydet(c.sa, { ...govde(degerlendirmede), durum: 'onayda', teklifler: [q],
      karar: { mod: 'tek', teklifId: q.id, bolunme: [], gerekce: '', kararVerenKisiId: kisi.sa!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] } }));
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(onayda), onaylar: [onayKaydi()] }));
    const sp = tamam<Talep>(await kaydet(c.sa, { ...govde(onayli), durum: 'siparis_verildi',
      karar: { ...onayli.karar!, siparisler: [{ teklifId: q.id, siparisNo: 'SA-2624', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' }] } }));
    const satir = (kalemId: string) => siparisi(sp, q.id).satirlar.find((r) => r.kalemId === kalemId)!.id;
    const emirler = await vt().tx((db) => siparisSatirlarininEmri(db, [satir(ka), satir(kb), satir(yeniKalem.id)]));
    assert.deepEqual([emirler.get(satir(ka)), emirler.get(satir(kb)), emirler.get(satir(yeniKalem.id))], [e1, e2, e3]);
    // Güvenlik K1: talep eden kendi kaynağını görür; birleşik talebin kaynak listesi ve başka kaynağın emri görünmez.
    const gorunen = talepEdenGorunumu(sp, kisi.talep!);
    assert.equal((gorunen.kaynaklar ?? []).length, 0);
    const benim = tamam<TaleplerimCevabi>(await istek(c.talep, 'GET', '/satin-alma-taleplerim')).talepler;
    assert.equal(JSON.stringify(benim).includes(b.uretimEmriNo!), false);
    assert.ok(benim.some((t) => t.id === a.id));
  });

  // 2540 yardımcıları: finansın alacak listesi ve değişiklik defteri.
  const alacagi = async (talepId: string, teklifId: string) => tamam<TedarikciAlacaklariCevabi>(await istek(c.yonetici, 'GET', '/finans/tedarikci-alacaklari'))
    .alacaklar.find((x) => x.talepId === talepId && x.teklifId === teklifId);
  const alacakDurumu = (id: number, govde: Record<string, unknown>) => istek(c.yonetici, 'POST', `/finans/tedarikci-alacaklari/${id}/durum`, govde);
  const defter = (tablo: string, talepId: string) => vt().tx((db) => db.sorgu<{ islem: string; kisi: number | null; anahtar: Record<string, unknown>; alanlar: Record<string, unknown> }>(
    `SELECT islem, kisi_id AS kisi, anahtar, alanlar FROM denetim_degisiklik WHERE tablo = $1 AND (anahtar ->> 'satin_alma_talep_id' = $2
       OR anahtar ->> 'id' IN (SELECT id::text FROM finans_tedarikci_alacagi WHERE satin_alma_talep_id = $2::uuid)) ORDER BY id`, [tablo, talepId]));

  test('2540: aşan avans kapatmada finansa "teyit bekliyor" alacağı olarak düşer; teslim düzeltmesi tutarı günceller; geçişler sunucuda (K2), sürümlü (K1); talep eden göremez (K4); defterde kişi dolu (K5)', async () => {
    // A: 4 x 10, avans %80 = 32 (KDV dahil 38.40). 1 / 4 teslim: gerçekleşen 10, KDV dahil 12; aşım 26.40.
    const { s, a, b } = await bolunmusSiparis('10', { avansYuzdesi: '80' });
    const [satirA, satirB] = [siparisi(s, a).satirlar[0]!.id, siparisi(s, b).satirlar[0]!.id];
    await logoyaGitti(s.id, a, satirA, '25400');
    await logoyaGitti(s.id, b, satirB, '25401');
    await teslimEt(satirA, '1', 254001);
    tamam<Talep>(await kapat(await acilistaki(s.id), a));
    let al = (await alacagi(s.id, a))!;
    assert.deepEqual([al.durum, al.tutar, al.paraBirimi, al.siparisNo.length > 0], ['teyit_bekliyor', '26.40', 'TRY', true]);
    assert.ok((await acilistaki(s.id)).hareketler.some((h) => h.metin.includes('fark tedarikçiden alacaktır (finansta teyit bekliyor)')));
    assert.equal(await alacagi(s.id, b), undefined, 'B kapanmadı: alacak yok');
    // K4: talep eden ve finans yetkisi olmayan göremez.
    for (const cerez of [c.talep, c.operator]) assert.equal((await istek(cerez, 'GET', '/finans/tedarikci-alacaklari')).statusCode, 403);
    // K5: kapatma ucundan yazılan alacağın defter satırında kişi kapatan satın almacıdır.
    assert.deepEqual((await defter('finans_tedarikci_alacagi', s.id)).map((x) => [x.islem, x.kisi]), [['ekle', kisi.sa]]);
    // Kapalı siparişte teslim düzeltmesi (aynı işlemde geri al ve yeniden yaz): 2 / 4 teslim, gerçekleşen 24, aşım 14.40; teyit bekleyen tutar güncellenir.
    await vt().tx(async (db) => {
      await teslimGeriAl(db, depocu(), { malKabulSatirId: 254001 });
      await teslimIsle(db, depocu(), { siparisSatirId: satirA, miktar: '2', malKabulSatirId: 254002 });
    });
    al = (await alacagi(s.id, a))!;
    assert.deepEqual([al.durum, al.tutar], ['teyit_bekliyor', '14.40']);
    // K2: izinsiz geçiş 422; gerekçesiz düşürme 422; eski sürüm 409.
    assert.equal((await alacakDurumu(al.id, { surum: al.surum, durum: 'kapandi', aciklama: 'Deneme' })).statusCode, 422);
    assert.equal((await alacakDurumu(al.id, { surum: al.surum, durum: 'dusuldu' })).statusCode, 422);
    assert.equal((await alacakDurumu(al.id, { surum: al.surum - 1, durum: 'acik' })).statusCode, 409);
    assert.equal((await istek(c.sa, 'POST', `/finans/tedarikci-alacaklari/${al.id}/durum`, { surum: al.surum, durum: 'acik' })).statusCode, 403);
    const acik = tamam<{ alacak: TedarikciAlacagi }>(await alacakDurumu(al.id, { surum: al.surum, durum: 'acik', aciklama: 'Avans ödendi' })).alacak;
    assert.deepEqual([acik.durum, acik.durumDegistirenAdi !== null, acik.durumZamani !== null], ['acik', true, true]);
    // Açılmış alacak teslim değişince değişmez; fark geçmişe not düşer.
    await vt().tx(async (db) => {
      await teslimGeriAl(db, depocu(), { malKabulSatirId: 254002 });
      await teslimIsle(db, depocu(), { siparisSatirId: satirA, miktar: '3', malKabulSatirId: 254003 });
    });
    assert.equal((await alacagi(s.id, a))!.tutar, '14.40');
    assert.ok((await acilistaki(s.id)).hareketler.some((h) => h.metin.includes('avans aşımı 2.4 TRY oldu; finanstaki alacak kaydı değişmedi')));
    assert.equal((await alacakDurumu(al.id, { surum: acik.surum, durum: 'dusuldu', aciklama: 'Deneme' })).statusCode, 422, 'açık alacak düşürülmez');
    const kapandi = tamam<{ alacak: TedarikciAlacagi }>(await alacakDurumu(al.id, { surum: acik.surum, durum: 'kapandi', aciklama: 'Mahsup edildi' })).alacak;
    assert.equal(kapandi.durum, 'kapandi');
    assert.equal((await alacakDurumu(al.id, { surum: kapandi.surum, durum: 'acik', aciklama: 'Yeniden' })).statusCode, 422, 'kapanan alacak yeniden açılmaz');
    // Defter: ekle; düzeltmede geri alma ve yeniden yazım ayrı tutar güncellemesi; iki durum geçişi; uçtan gelen geçişlerde kişi finansçıdır.
    const d = await defter('finans_tedarikci_alacagi', s.id);
    assert.deepEqual(d.map((x) => x.islem), ['ekle', 'guncelle', 'guncelle', 'guncelle', 'guncelle']);
    assert.ok(d.slice(3).every((x) => x.kisi !== null && x.kisi !== kisi.sa));
    // Veri 2: alacağı olan sipariş silinemez (FK RESTRICT); satın almanın kaydı bunu 409 ile önceden reddeder.
    await assert.rejects(ortam!.sahip.sorgu('DELETE FROM satin_alma_siparis WHERE talep_id = $1 AND teklif_id = $2', [s.id, a]));
  });

  test('2540 Maliyet C1: elle plan alacağı planın avans satırından hesaplanır; Veri 2: alacaklı sipariş (düşüldü dahil) karar değişikliğiyle silinmez, 409', async () => {
    // B: 10 x 9 = 90, teklifte avans yok. Elle plan: avans 60, vade 48. 4 / 10 teslim: gerçekleşen 36, KDV dahil 43.20; aşım 16.80.
    const { s, a, b } = await bolunmusSiparis();
    const satirB = siparisi(s, b).satirlar[0]!.id;
    await logoyaGitti(s.id, b, satirB, '25410');
    tamam(await istek(c.sa, 'POST', `/satin-alma-talepleri/${s.id}/odeme-plani`, { teklifId: b, surum: (await acilistaki(s.id)).surum,
      satirlar: [{ tur: 'avans', vade: '2026-10-08', yontem: 'banka', tutar: '60' }, { tur: 'vade', vade: '2026-12-15', yontem: 'banka', tutar: '48' }] }));
    await teslimEt(satirB, '4', 254101);
    tamam<Talep>(await kapat(await acilistaki(s.id), b));
    const al = (await alacagi(s.id, b))!;
    assert.deepEqual([al.durum, al.tutar], ['teyit_bekliyor', '16.80']);
    assert.ok((await acilistaki(s.id)).hareketler.some((h) => h.metin.includes('avans gerçekleşen teslim değerini 16.8 TRY aşıyor; avans ödendiyse')));
    tamam(await alacakDurumu(al.id, { surum: al.surum, durum: 'dusuldu', aciklama: 'Avans ödenmedi' }));
    // A siparişine de deneme alacağı (açık sipariş, Logo'ya gitmemiş): kararı tek teklife çevirip A'yı silmek 409 verir, alacak yerinde kalır.
    await ortam!.sahip.sorgu(`INSERT INTO finans_tedarikci_alacagi (satin_alma_talep_id, satin_alma_teklif_id, siparis_no, firma_id, para_birimi, tutar, olusturan_id, durum, aciklama, durum_degistiren_id, durum_zamani)
      VALUES ($1, $2, 'DENEME', $3, 'TRY', 1, $4, 'dusuldu', 'Deneme', $4, now())`, [s.id, a, firmaA, kisi.sa]);
    const t = await acilistaki(s.id);
    const red = await kaydet(c.sa, { ...govde(t), karar: { ...t.karar!, siparisler: t.karar!.siparisler.filter((x) => x.teklifId !== a).map((x) => ({
      teklifId: x.teklifId, siparisNo: x.siparisNo, siparisTarihi: x.siparisTarihi, beklenenTeslim: x.beklenenTeslim })) } });
    assert.equal(red.statusCode, 409, red.body);
    assert.match(red.body, /tedarikçi alacağı var; önce finansta alacağı kapatın ya da düşürün/);
    assert.ok(await alacagi(s.id, a));
  });

  test('2540 Veri 1 ve test 5: plan upsert; aynı plan ikinci kez yazılınca defterde yeni satır yok, tek taksit değişince tek güncelle, plandan çıkan sıra sil; kişi dolu', async () => {
    const { s, a } = await bolunmusSiparis();
    const yaz = async (satirlar: unknown[]) => tamam(await istek(c.sa, 'POST', `/satin-alma-talepleri/${s.id}/odeme-plani`, { teklifId: a, surum: (await acilistaki(s.id)).surum, satirlar }));
    const plan = [{ tur: 'avans', vade: '2026-10-07', yontem: 'banka', tutar: '10' }, { tur: 'vade', vade: '2026-12-01', yontem: 'banka', tutar: '14' }];
    const satirlar = async () => (await defter('finans_siparis_odemesi', s.id)).filter((x) => x.anahtar.satin_alma_teklif_id === a);
    await yaz(plan);
    const ilk = (await satirlar()).length;
    await yaz(plan);
    assert.equal((await satirlar()).length, ilk, 'aynı plan defterde yeni satır açmaz');
    await yaz([plan[0], { ...plan[1], tutar: '15' }]);
    const tek = (await satirlar()).slice(ilk);
    assert.deepEqual(tek.map((x) => [x.islem, x.anahtar.sira, Object.keys(x.alanlar)]), [['guncelle', 2, ['tutar']]]);
    await yaz([plan[0]]);
    const son = (await satirlar()).slice(ilk + 1);
    assert.deepEqual(son.map((x) => [x.islem, x.anahtar.sira]), [['sil', 2]]);
    assert.ok((await satirlar()).every((x) => x.kisi !== null), 'K5: uçtan yazımda kişi dolu');
    assert.ok((await satirlar()).every((x) => !('id' in x.alanlar)), 'kimlik deftere girmez');
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
      const r = await istek('POST', '/finans/kur-ciftleri/ekle', { paraBirimi, tarih, alis: kur * 0.99, satis: kur });
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
    const finansSatiri = await sayi('finans_kur_cifti');
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
    assert.equal(await sayi('finans_kur_cifti'), finansSatiri);
    assert.equal((await ayarlar()).kurlar.find((k) => k.paraBirimi === 'USD')?.aylikFaizYuzdesi, null);
  });

  test('Borç 38: finansın para birimi yalnız kaydedilmemiş ayarlara önerilir; kaydedilmiş listeden kaldırılan para birimi geri gelmez', async () => {
    assert.equal((await istek('POST', '/finans/kur-ciftleri/ekle', { paraBirimi: 'EUR', tarih: '2026-01-02', alis: 43, satis: 44 })).statusCode, 200);
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
    // 2238-2 a: finans yıllık oran tutar; satın alma kredi oranının aylığını gösterir (2238-3 c).
    const faizEkle = async (paraBirimi: string, gecerlilikBaslangic: string, aylikYuzde: number, tur = 'kredi') => {
      const r = await istek('POST', '/finans/oranlar/ekle', { tur, paraBirimi, gecerlilikBaslangic, yillikYuzde: aylikYuzde * 12 });
      assert.equal(r.statusCode, 200, r.body);
    };
    await faizEkle('USD', '2026-01-01', 1.25);
    await faizEkle('TRY', '2099-01-01', 9);
    const k = (await ayarlar()).kurlar.map((x) => [x.paraBirimi, x.aylikFaizYuzdesi]);
    assert.deepEqual(k, [['TRY', null], ['USD', '1.25']]);
    await faizEkle('USD', '2026-02-01', 1.5);
    assert.equal(Number((await ayarlar()).kurlar.find((x) => x.paraBirimi === 'USD')?.aylikFaizYuzdesi), 1.5);
    // Mevduat yanında verilir, puanlanan kredi faizini değiştirmez; eski tek faiz tablosu okunmaz.
    await faizEkle('USD', '2026-01-01', 0.5, 'mevduat');
    const usd = (await ayarlar()).kurlar.find((x) => x.paraBirimi === 'USD');
    assert.deepEqual([Number(usd?.aylikFaizYuzdesi), Number(usd?.mevduatAylikFaizYuzdesi)], [1.5, 0.5]);
    assert.equal((await istek('POST', '/finans/faizler/ekle', { paraBirimi: 'TRY', gecerlilikBaslangic: '2026-01-01', aylikYuzde: 4 })).statusCode, 200);
    assert.equal((await ayarlar()).kurlar.find((x) => x.paraBirimi === 'TRY')?.aylikFaizYuzdesi, null);
    // 2422: dört göz ayarı ekrana salt okunur gelir (varsayılan açık).
    assert.equal((await ayarlar()).dortGoz, true);
  });
});
