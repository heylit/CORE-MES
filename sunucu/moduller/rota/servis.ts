import { kayitNoktasi, kisitIhlali } from '#cekirdek/db.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Db } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { OndalikMetin } from '#paylasilan/ondalik.ts';
import { KATALOG_TURLERI } from '#paylasilan/sozlesme/malzemeler.ts';
import type { KatalogMalzemeOzeti, KatalogTuru } from '#paylasilan/sozlesme/malzemeler.ts';
import type { EmirTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  AdimKaynakOzeti, AgacCevabi, Bagimlilik, FarkCevabi, GerceklesenKabulCevabi, GerceklesenTuru, KaydetGovdesiCikti, SurelerCevabi, KomutCevabi, KullanimCevabi, MakineKullanimi, RevizyonAyrintisi, RevizyonDurumu,
  KaynakOzeti, RevizyonKomutu, RevizyonOzetiCevabi, RotaListesiCevabi, Sablon, SablonCevabi, SablonlarCevabi, SeceneklerCevabi, TalimatlarCevabi, UrunOzeti, UrunRevizyonlariCevabi,
} from '#paylasilan/sozlesme/rota.ts';
import { AZAMI_AGAC_DERINLIGI } from '#paylasilan/sozlesme/rota.ts';
import { OPERASYON_GRUP_ADLARI } from '#paylasilan/sozlesme/istasyonlar.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { firmaAra, firmaOzetleri } from '../musteri-tedarikci/disari.ts';
import {
  aktifIstasyonlar, istasyonKisiAtamalari, istasyonlar as istasyonListesi, istasyondakiMakineler, makineGetir, operasyonTipleri as katalogTipleri,
} from '../istasyonlar/disari.ts';
import { kisiAdlari, kisileriListele } from '../kisiler/disari.ts';
import { malzemeAra as kartAra, malzemeOperasyonlari, malzemeOzetleri, operasyonluAktifKartlar } from '../malzemeler/disari.ts';
import { adimliEmirAyrintisi, isEmirleriniYenile, isEmriSureOzeti, uretimEmriAc, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import type { EmirBittiOlayi } from '../uretim-emirleri/disari.ts';
import {
  YAZ, isEmriKaynagi, karttanAdimlar, kisiIstasyonlari, adimMiktarlari, emreKopyalanabilirMi, fasonTerminToplami, kaynakAnahtari, kontrolListesi, agaciAc, akisiCikar, donguBul, ilkAdimiDuzenle, izinliKomutlar, komutDenetle, ondalikMetin, rotaOzeti,
  girdiEksigi, girdiOlabilirMi, onayaHazirMi, opNolariVer, revizyonFarki, revizyonHarfi, rotasizMamuller, sayiyaCevir, taslakDenetle, teorikSure,
  bekleyenOlcum, degisenTurler, degisimOrani, dortGozEngeli, etkinAdimSuresi, gerceklesenDenetle, kabulDenetle, kabulSureleri, taslakSureleri, teorikAyrim, terminalOlcumleri,
} from './kurallar.ts';
import type { AdimSureleri, AgacRotasi, EtkinAdimSuresi, FarkAdimi, GerceklesenSatiri } from './kurallar.ts';
import * as s from './sorgular.ts';
import type { AdimKaynagi, Icerik, Kaynak, RevizyonSatiri } from './sorgular.ts';

/* ---------------- yardımcılar ---------------- */

const ARAMA_SAYFA_BOYU = 50;
const urunOzetine = (o: KatalogMalzemeOzeti): UrunOzeti => ({
  id: o.id, stokKodu: o.kod, ad: o.ad ?? o.kod, tur: o.tur, stokBirimi: o.birim, onayDurumu: o.onayDurumu,
});

async function urunOzetleri(db: Db, idler: readonly number[]): Promise<Map<number, UrunOzeti>> {
  // Kart malzemeler modülünün verisidir; tablo okunmaz, dışa açtığı toplu özet alınır.
  const ozetler = await malzemeOzetleri(db, [...idler]);
  return new Map([...ozetler].map(([id, o]) => [id, urunOzetine(o)]));
}

async function urunOzetiAl(db: Db, id: number): Promise<UrunOzeti> {
  const o = (await urunOzetleri(db, [id])).get(id);
  if (!o) throw bulunamadi('Malzeme kartı bulunamadı.');
  return o;
}

// Rota yalnız kullanımdaki mamul ya da yarımamul kartına kurulur.
export const ROTALI_TURLER = ['mamul', 'yarimamul'] as const;
const rotaliTurMu = (tur: string): tur is (typeof ROTALI_TURLER)[number] => (ROTALI_TURLER as readonly string[]).includes(tur);
const turu = (u: UrunOzeti): (typeof ROTALI_TURLER)[number] => (u.tur === 'yarimamul' ? 'yarimamul' : 'mamul');

async function rotaKurulabilirUrun(db: Db, id: number): Promise<UrunOzeti> {
  const urun = await urunOzetiAl(db, id);
  if (!rotaliTurMu(urun.tur)) throw gecersiz('Rota yalnız mamul ya da yarımamul kartına kurulur.');
  if (urun.onayDurumu !== 'aktif') throw gecersiz('Kart kullanımda değil; önce kart onaylanmalı.');
  return urun;
}

function revizyonuAl(r: RevizyonSatiri | null): RevizyonSatiri {
  if (!r) throw bulunamadi('Rota revizyonu bulunamadı.');
  return r;
}

const dortGozAcikMi = (db: Db): Promise<boolean> => sistemAyariOku(db, 'rota.dort-goz');

// Operasyon tipleri istasyonlar kataloğundandır (RT2 a); pasifler eski adımın tipini göstermek için dahil.
// Kısaltması boş tipte kod gösterilir.
const operasyonTipleri = async (db: Db) =>
  (await katalogTipleri(db, { pasiflerDahil: true })).map((t) => ({ ...t, kisaltma: t.kisaltma ?? t.kod }));

// Komut revizyonu kilitleyerek alır; izin, durum ve sürüm burada denetlenir.
async function komutIcinAl(db: Db, kullanici: Kullanici, id: number, komut: RevizyonKomutu, surum: number | null) {
  const r = revizyonuAl(await s.revizyonKilitle(db, id));
  const dortGozAcik = await dortGozAcikMi(db);
  const red = komutDenetle(komut, {
    durum: r.durum, islemler: kullanici.islemler, kisiId: kullanici.id, gonderenKisiId: r.gonderenKisiId,
    duzenleyenKisiIdleri: r.duzenleyenKisiIdleri, dortGozAcik,
  });
  if (red) throw red.tur === 'yetki' ? yetkiYok(red.ileti) : cakisma(red.ileti);
  if (surum !== null && surum !== r.surum) {
    throw eskiSurum();
  }
  return { r, dortGozAcik };
}

const cevap = (id: number, durum: RevizyonDurumu, surum: number): KomutCevabi => ({ id, durum, surum });

const sayi = (m: string): number => Number(m);

/* ---------------- kaynak (makine ya da kişi) ---------------- */

// Kaynaklar istasyonlar ve kişiler modüllerinin verisidir; dışa açtıkları fonksiyonlarla okunur. Pasif istasyondaki makine pasif sayılır.
interface KaynakBaglami { makine: Map<number, KaynakOzeti>; kisi: Map<number, KaynakOzeti>; istasyonlar: { id: number; kod: string; ad: string; aktif: boolean }[] }

async function kaynakBaglami(db: Db): Promise<KaynakBaglami> {
  // Aktif istasyon: kendisi de iş merkezi de aktif (istasyonlar modülünün tanımı).
  const aktif = new Set((await aktifIstasyonlar(db)).map((i) => i.id));
  const istasyonlar = (await istasyonListesi(db, { pasiflerDahil: true })).map((i) => ({ id: i.id, kod: i.kod, ad: i.ad, aktif: aktif.has(i.id) }));
  const ist = new Map(istasyonlar.map((i) => [i.id, i]));
  const makine = new Map<number, KaynakOzeti>();
  for (const i of istasyonlar) {
    for (const m of await istasyondakiMakineler(db, i.id, { pasiflerDahil: true })) {
      makine.set(m.id, { tur: 'makine', id: m.id, kod: m.kod, ad: m.ad, aktif: m.aktif && i.aktif, istasyon: i });
    }
  }
  const kisininIstasyonu = kisiIstasyonlari(await istasyonKisiAtamalari(db));
  const kisi = new Map<number, KaynakOzeti>();
  for (const k of await kisileriListele(db)) {
    const i = kisininIstasyonu.get(k.id);
    kisi.set(k.id, { tur: 'kisi', id: k.id, kod: null, ad: k.ad, aktif: k.aktif, istasyon: i === undefined ? null : ist.get(i) ?? null });
  }
  return { makine, kisi, istasyonlar };
}

// Fason firma finansın kartıdır: kullanımda sayılması için aktif ve fason işaretli olmalıdır (F2).
async function kaynakOzetiAl(db: Db, b: KaynakBaglami, k: AdimKaynagi): Promise<AdimKaynakOzeti> {
  if (k.tur === 'fason') {
    const f = (await firmaOzetleri(db, [k.id])).get(k.id);
    return f
      ? { tur: 'fason', id: f.id, kod: f.kod, ad: f.ad, aktif: f.aktif && f.fason, istasyon: null }
      : { tur: 'fason', id: k.id, kod: null, ad: 'Bilinmeyen firma', aktif: false, istasyon: null };
  }
  if (k.tur === 'istasyon') {
    const i = b.istasyonlar.find((x) => x.id === k.id);
    return i
      ? { tur: 'istasyon', id: i.id, kod: i.kod, ad: i.ad, aktif: i.aktif, istasyon: i }
      : { tur: 'istasyon', id: k.id, kod: null, ad: 'Bilinmeyen istasyon', aktif: false, istasyon: null };
  }
  const bilinen = (k.tur === 'makine' ? b.makine : b.kisi).get(k.id);
  if (bilinen) return bilinen;
  if (k.tur === 'makine') {
    // İstasyonsuz makine: istasyon listesinde görünmez, kendisi okunur.
    const m = await makineGetir(db, k.id);
    if (m) return { tur: 'makine', id: m.id, kod: m.kod, ad: m.ad, aktif: m.aktif, istasyon: null };
  }
  return { tur: k.tur, id: k.id, kod: null, ad: k.tur === 'makine' ? 'Bilinmeyen makine' : 'Bilinmeyen kişi', aktif: false, istasyon: null };
}

/* ---------------- okuma ---------------- */

// Fason süzgeci finansın aramasında uygulanır (KD-021): sonradan süzülse, arama sınırını (50) fason olmayan firmalar doldurur
// ve sonraki fason firma seçilemezdi. Sınır finansındır; 50'den çok fason firma bugün listeye girmez.
const FASON_ARAMA_SINIRI = 200;
async function fasonFirmalar(db: Db): Promise<AdimKaynakOzeti[]> {
  const bulunan = await firmaAra(db, { metin: '', sinir: FASON_ARAMA_SINIRI, fason: true });
  const ozetler = await firmaOzetleri(db, bulunan.map((f) => f.id));
  return [...ozetler.values()].filter((f) => f.aktif && f.fason)
    .map((f) => ({ tur: 'fason', id: f.id, kod: f.kod, ad: f.ad, aktif: true, istasyon: null }));
}

export async function secenekler(db: Db): Promise<SeceneklerCevabi> {
  const b = await kaynakBaglami(db);
  const kisiler = [...b.kisi.values()].filter((k) => k.aktif);
  return {
    operasyonTipleri: await (async () => {
      const kullanim = new Map((await s.tipKullanimi(db)).map((k) => [k.tipId, k.adet]));
      return (await operasyonTipleri(db)).map((t) => ({
        id: t.id, kod: t.kod, ad: t.ad, kisaltma: t.kisaltma, grup: t.grup, grupAdi: OPERASYON_GRUP_ADLARI[t.grup], aktif: t.aktif,
        varsayilanAyarDk: t.varsayilanAyarDk, varsayilanBirimDk: t.varsayilanBirimDk, kullanim: kullanim.get(t.id) ?? 0,
      }));
    })(),
    istasyonlar: b.istasyonlar.map((i) => ({
      ...i,
      makineler: [...b.makine.values()].filter((m) => m.istasyon?.id === i.id && m.aktif),
      kisiler: kisiler.filter((k) => k.istasyon?.id === i.id),
    })),
    istasyonsuzKisiler: kisiler.filter((k) => k.istasyon === null),
    fasonFirmalar: await fasonFirmalar(db),
  };
}

// İkinci menünün "Ürün ve rotalar" sayısı: açık (taslak ya da onay bekleyen) revizyonu olan ürün.
export const acikRevizyonSayisi = async (db: Db): Promise<number> => (await rotaListesi(db)).rotalar.filter((r) => r.acik !== null).length;

export async function rotaListesi(db: Db): Promise<RotaListesiCevabi> {
  const satirlar = await s.rotaOzetleri(db);
  const urunler = await urunOzetleri(db, satirlar.map((x) => x.malzemeId));
  return {
    rotalar: satirlar.flatMap((x) => {
      const urun = urunler.get(x.malzemeId);
      if (!urun) return [];
      return [{
        urun,
        yururlukte: x.yururlukteId === null || x.yururlukteHarf === null ? null : { id: x.yururlukteId, harf: x.yururlukteHarf },
        acik: x.acikId === null || x.acikHarf === null || x.acikDurum === null ? null : { id: x.acikId, harf: x.acikHarf, durum: x.acikDurum },
        revizyonSayisi: x.revizyonSayisi,
      }];
    }),
  };
}

export function revizyonOzeti(db: Db): Promise<RevizyonOzetiCevabi> {
  return s.revizyonSayilari(db);
}

// Kartın operasyonları taslağa çevrilir (#688); eşleşmeyen satırın tipi düzenleyicinin varsayılanıdır (önce "uretim", yoksa ilk aktif).
async function kartAdimlari(db: Db, urunId: number) {
  const ops = await malzemeOperasyonlari(db, urunId);
  if (!ops || ops.length === 0) return null;
  const tipler = await operasyonTipleri(db);
  const varsayilan = tipler.find((t) => t.aktif && t.kod === 'uretim') ?? tipler.find((t) => t.aktif);
  if (!varsayilan) throw gecersiz('Aktif operasyon tipi yok; önce istasyonlar kataloğunda tip tanımlanmalı.');
  return karttanAdimlar(ops, tipler, varsayilan.id);
}

export async function urunRevizyonlari(db: Db, kullanici: Kullanici, urunId: number): Promise<UrunRevizyonlariCevabi> {
  const urun = await urunOzetiAl(db, urunId);
  const revizyonlar = await s.urunRevizyonlari(db, urunId);
  const acik = revizyonlar.some((r) => r.durum === 'taslak' || r.durum === 'onay_bekliyor');
  const kart = revizyonlar.length === 0 && rotaliTurMu(urun.tur) ? await kartAdimlari(db, urunId) : null;
  return {
    urun,
    revizyonlar,
    taslakAcilabilir: !acik && rotaliTurMu(urun.tur) && urun.onayDurumu === 'aktif' && kullanici.islemler.includes(YAZ),
    kartOperasyonlari: kart && { sayi: kart.length, eslesmeyen: kart.filter((a) => !a.eslesti).map((a) => a.ad) },
  };
}

interface AdimGorunumuBaglami {
  icerik: Icerik;
  tipler: Map<number, { id: number; kod: string; ad: string; kisaltma: string; aktif: boolean }>;
  kaynaklar: Map<string, AdimKaynakOzeti>;
  urunler: Map<number, UrunOzeti>;
  talimatlar: Map<number, { surum: number; metin: string }>;
}

function adimlariKur(b: AdimGorunumuBaglami, urunMiktari = 1): RevizyonAyrintisi['adimlar'] {
  const { icerik } = b;
  const akis = akisiCikar(icerik.adimlar);
  const miktarlar = adimMiktarlari(icerik.adimlar.map((a) => ({ opNo: a.opNo, firePayiYuzde: sayi(a.firePayiYuzde) })), urunMiktari);
  const kaynak = (k: AdimKaynagi): AdimKaynakOzeti => b.kaynaklar.get(`${k.tur}:${k.id}`) ?? { tur: k.tur, id: k.id, kod: null, ad: 'Bilinmeyen kaynak', aktif: false, istasyon: null };
  const adayKaynagi = (k: Kaynak): KaynakOzeti => ({ ...kaynak(k), tur: k.tur });
  const urun = (id: number): UrunOzeti => b.urunler.get(id) ?? { id, stokKodu: null, ad: 'Bilinmeyen kart', tur: '?', stokBirimi: null, onayDurumu: '?' };
  return icerik.adimlar.map((a, i) => {
    const miktar = miktarlar.get(a.opNo) ?? urunMiktari;
    const sure = teorikSure(sayiyaCevir(a.ayarSuresiDk), sayiyaCevir(a.birimSureDk), miktar);
    const tip = b.tipler.get(a.operasyonTipiId) ?? { id: a.operasyonTipiId, kod: '?', ad: 'Bilinmeyen tip', kisaltma: '?', aktif: false };
    const akisi = akis[i] ?? { tuketir: [], cikti: { tur: 'urun' as const } };
    const ayrim = teorikAyrim(a.birimSureDk, a.islemSuresiDk, a.degisimSuresiDk);
    const oran = degisimOrani(sayiyaCevir(ayrim.islem), sayiyaCevir(ayrim.degisim));
    return {
      id: a.id, opNo: a.opNo, sira: a.sira, operasyonTipi: tip, ad: a.ad,
      kaynak: a.kaynak === null ? null : kaynak(a.kaynak),
      ayarSuresiDk: a.ayarSuresiDk, birimSureDk: a.birimSureDk, islemSuresiDk: ayrim.islem, degisimSuresiDk: ayrim.degisim,
      degisimOraniYuzde: oran === null ? null : ondalikMetin(oran, 2), terminGun: a.terminGun, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi,
      firePayiYuzde: a.firePayiYuzde, makineKullanimi: a.makineKullanimi, enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar,
      adaylar: icerik.adaylar.filter((x) => x.adimId === a.id)
        .map((x) => {
          const ayrim = teorikAyrim(x.birimSureDk, x.islemSuresiDk, x.degisimSuresiDk);
          return { kaynak: adayKaynagi(x.kaynak), ayarSuresiDk: x.ayarSuresiDk, birimSureDk: x.birimSureDk, islemSuresiDk: ayrim.islem, degisimSuresiDk: ayrim.degisim };
        }),
      bilesenler: icerik.bilesenler.filter((x) => x.adimId === a.id)
        .map((x) => ({
          malzeme: urun(x.malzemeId), miktar: x.miktar, fireYuzde: x.fireYuzde,
          toplamMiktar: ondalikMetin(miktar * sayi(x.miktar) * (1 + sayi(x.fireYuzde) / 100)),
        })),
      yanUrunler: icerik.yanUrunler.filter((x) => x.adimId === a.id).map((x) => ({ malzeme: urun(x.malzemeId), miktar: x.miktar })),
      akis: { tuketir: akisi.tuketir, cikti: akisi.cikti },
      adimMiktari: ondalikMetin(miktar),
      teorikSureDk: sure === null ? null : ondalikMetin(sure),
      talimat: b.talimatlar.get(a.opNo) ?? null,
    };
  });
}

async function gorunumBaglami(db: Db, malzemeId: number, icerik: Icerik): Promise<AdimGorunumuBaglami> {
  const kb = await kaynakBaglami(db);
  const kaynaklar = new Map<string, AdimKaynakOzeti>();
  for (const k of [...icerik.adimlar.flatMap((a) => (a.kaynak ? [a.kaynak] : [])), ...icerik.adaylar.map((x) => x.kaynak)]) {
    kaynaklar.set(`${k.tur}:${k.id}`, await kaynakOzetiAl(db, kb, k));
  }
  return {
    icerik,
    tipler: new Map((await operasyonTipleri(db)).map((t) => [t.id, { id: t.id, kod: t.kod, ad: t.ad, kisaltma: t.kisaltma, aktif: t.aktif }])),
    kaynaklar,
    urunler: await urunOzetleri(db, [...icerik.bilesenler.map((x) => x.malzemeId), ...icerik.yanUrunler.map((x) => x.malzemeId)]),
    talimatlar: new Map((await s.gecerliTalimatlar(db, malzemeId)).map((t) => [t.opNo, { surum: t.surum, metin: t.metin }])),
  };
}

export async function revizyonAyrintisi(db: Db, kullanici: Kullanici, id: number, miktar = 1): Promise<RevizyonAyrintisi> {
  const r = revizyonuAl(await s.revizyonOku(db, id));
  const urun = await urunOzetiAl(db, r.malzemeId);
  const icerik = await s.icerikOku(db, id);
  const adimlar = adimlariKur(await gorunumBaglami(db, r.malzemeId, icerik), miktar);
  // Fason adım dakika toplamına girmez (F6); termini ayrı toplanır.
  const fasonlar = adimlar.filter((a) => a.kaynak?.tur === 'fason');
  const ozet = rotaOzeti(adimlar.filter((a) => a.kaynak?.tur !== 'fason').map((a) => ({ opNo: a.opNo, sure: sayiyaCevir(a.teorikSureDk) })));
  const kisiler = [r.acanKisiId, r.gonderenKisiId, r.onaylayanKisiId, r.yururlugeAlanKisiId, r.iptalEdenKisiId, ...r.duzenleyenKisiIdleri]
    .filter((k): k is number => k !== null);
  const adlar = await kisiAdlari(db, kisiler);
  const kisi = (k: number) => ({ id: k, ad: adlar.get(k) ?? null });
  const varsa = (k: number | null) => (k === null ? null : kisi(k));
  const komutlar = izinliKomutlar({
    durum: r.durum, islemler: kullanici.islemler, kisiId: kullanici.id, gonderenKisiId: r.gonderenKisiId,
    duzenleyenKisiIdleri: r.duzenleyenKisiIdleri, dortGozAcik: await dortGozAcikMi(db),
  });
  return {
    urun,
    revizyon: {
      id: r.id, harf: r.harf, durum: r.durum, surum: r.surum, aciklama: r.aciklama, acilma: r.acilma, onaylama: r.onaylama,
      yururlugeAlma: r.yururlugeAlma,
      kaynak: r.kaynakRevizyonId === null || r.kaynakHarf === null ? null : { id: r.kaynakRevizyonId, harf: r.kaynakHarf },
      acan: kisi(r.acanKisiId), gonderen: varsa(r.gonderenKisiId), gonderme: r.gonderme, onaylayan: varsa(r.onaylayanKisiId),
      dortGozsuzOnay: r.dortGozsuzOnay, yururlugeAlan: varsa(r.yururlugeAlanKisiId), iptalEden: varsa(r.iptalEdenKisiId),
      iptalEtme: r.iptalEtme, duzenleyenler: r.duzenleyenKisiIdleri.map(kisi),
    },
    adimlar,
    miktar: ondalikMetin(miktar),
    ozet: {
      toplamTeorikSureDk: ozet.toplam === null ? null : ondalikMetin(ozet.toplam),
      enUzunAdimOpNo: ozet.enUzunOpNo,
      adimSayisi: adimlar.length,
      fasonTerminGunu: fasonTerminToplami(fasonlar.map((a) => a.terminGun)),
    },
    komutlar,
  };
}

function farkAdimlari(ayrinti: RevizyonAyrintisi['adimlar']): FarkAdimi[] {
  return ayrinti.map((a) => ({
    opNo: a.opNo, sira: a.sira, ad: a.ad, operasyonTipi: a.operasyonTipi.ad, kaynak: a.kaynak ? (a.kaynak.kod ?? a.kaynak.ad) : null,
    ayarSuresiDk: a.ayarSuresiDk, birimSureDk: a.birimSureDk, islemSuresiDk: a.islemSuresiDk, degisimSuresiDk: a.degisimSuresiDk,
    terminGun: a.terminGun, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, firePayiYuzde: a.firePayiYuzde, bilesenler: a.bilesenler.map((b) => ({ ad: b.malzeme.stokKodu ?? b.malzeme.ad, miktar: b.miktar })),
  }));
}

// Revizyon, ürünün yürürlükteki revizyonuyla karşılaştırılır; yürürlükteki revizyonun kendisi için fark yoktur.
export async function fark(db: Db, id: number): Promise<FarkCevabi> {
  const r = revizyonuAl(await s.revizyonOku(db, id));
  const yururlukte = await s.yururluktekiRevizyonId(db, r.malzemeId);
  if (yururlukte === null || yururlukte === id) return { karsilastirilan: null, farklar: [] };
  const eskiR = revizyonuAl(await s.revizyonOku(db, yururlukte));
  const adimlar = async (rid: number) => adimlariKur(await gorunumBaglami(db, r.malzemeId, await s.icerikOku(db, rid)));
  return {
    karsilastirilan: { id: eskiR.id, harf: eskiR.harf },
    farklar: revizyonFarki(farkAdimlari(await adimlar(yururlukte)), farkAdimlari(await adimlar(id))),
  };
}

export async function talimatListesi(db: Db, urunId: number, opNo: number): Promise<TalimatlarCevabi> {
  const satirlar = await s.talimatlar(db, urunId, opNo);
  const adlar = await kisiAdlari(db, satirlar.map((t) => t.yazanKisiId));
  return {
    surumler: satirlar.map((t) => ({ surum: t.surum, metin: t.metin, yazan: { id: t.yazanKisiId, ad: adlar.get(t.yazanKisiId) ?? null }, yazma: t.yazma })),
  };
}

/* ---------------- ürün ağacı ve döngü ---------------- */

function agacRotasi(revizyonId: number, icerik: Icerik): AgacRotasi {
  return {
    revizyonId,
    adimlar: icerik.adimlar.map((a) => ({
      opNo: a.opNo,
      firePayiYuzde: sayi(a.firePayiYuzde),
      bilesenler: icerik.bilesenler.filter((b) => b.adimId === a.id)
        .map((b) => ({ malzemeId: b.malzemeId, miktar: sayi(b.miktar), fireYuzde: sayi(b.fireYuzde) })),
    })),
  };
}

// Kökün rotası verilen revizyondur; alt mamuller yürürlükteki revizyonlarıyla açılır.
async function agacRotalari(db: Db, kok: number, kokRevizyon: number, kokIcerik: Icerik): Promise<Map<number, AgacRotasi>> {
  const rotalar = new Map<number, AgacRotasi>([[kok, agacRotasi(kokRevizyon, kokIcerik)]]);
  let sinir = [...new Set(kokIcerik.bilesenler.map((b) => b.malzemeId))];
  for (let derinlik = 0; sinir.length > 0 && derinlik < AZAMI_AGAC_DERINLIGI; derinlik += 1) {
    const sonraki: number[] = [];
    for (const urun of sinir) {
      if (rotalar.has(urun)) continue;
      const rid = await s.yururluktekiRevizyonId(db, urun);
      if (rid === null) continue;
      const icerik = await s.icerikOku(db, rid);
      rotalar.set(urun, agacRotasi(rid, icerik));
      sonraki.push(...icerik.bilesenler.map((b) => b.malzemeId));
    }
    sinir = [...new Set(sonraki)];
  }
  return rotalar;
}

async function donguDenetle(db: Db, kok: number, kokBilesenleri: readonly number[]): Promise<void> {
  const cocuklar = new Map<number, number[]>([[kok, [...new Set(kokBilesenleri)]]]);
  let sinir = [...new Set(kokBilesenleri)].filter((x) => x !== kok);
  while (sinir.length > 0) {
    const satirlar = await s.yururluktekiBilesenler(db, sinir);
    const sonraki: number[] = [];
    for (const urun of sinir) {
      if (cocuklar.has(urun)) continue;
      const bilesenler = satirlar.filter((x) => x.urunId === urun && x.bilesenId !== null).map((x) => x.bilesenId as number);
      cocuklar.set(urun, bilesenler);
      sonraki.push(...bilesenler.filter((b) => !cocuklar.has(b)));
    }
    sinir = [...new Set(sonraki)];
  }
  const dongu = donguBul(kok, cocuklar);
  if (dongu) {
    const adlar = await urunOzetleri(db, dongu);
    throw gecersiz(`Reçete döngüsü var: ${dongu.map((d) => adlar.get(d)?.stokKodu ?? adlar.get(d)?.ad ?? String(d)).join(' > ')}`);
  }
}

export async function agac(db: Db, id: number, miktar: number): Promise<AgacCevabi> {
  const r = revizyonuAl(await s.revizyonOku(db, id));
  const urun = await urunOzetiAl(db, r.malzemeId);
  const rotalar = await agacRotalari(db, r.malzemeId, id, await s.icerikOku(db, id));
  const { dugumler, toplamlar } = agaciAc(r.malzemeId, miktar, rotalar, AZAMI_AGAC_DERINLIGI);
  const ozetler = await urunOzetleri(db, [...dugumler.map((d) => d.malzemeId)]);
  const harfler = new Map<number, string>();
  for (const d of dugumler) {
    if (d.revizyonId !== null && !harfler.has(d.revizyonId)) {
      const rr = await s.revizyonOku(db, d.revizyonId);
      if (rr) harfler.set(rr.id, rr.harf);
    }
  }
  const ozet = (mid: number): UrunOzeti => ozetler.get(mid) ?? { id: mid, stokKodu: null, ad: 'Bilinmeyen kart', tur: '?', stokBirimi: null, onayDurumu: '?' };
  return {
    urun,
    miktar: ondalikMetin(miktar),
    dugumler: dugumler.map((d) => ({
      derinlik: d.derinlik, ust: d.ust, malzeme: ozet(d.malzemeId), opNo: d.opNo, birimMiktar: ondalikMetin(d.birimMiktar),
      fireYuzde: ondalikMetin(d.fireYuzde, 2), toplamMiktar: ondalikMetin(d.toplamMiktar),
      revizyon: d.revizyonId === null ? null : { id: d.revizyonId, harf: harfler.get(d.revizyonId) ?? '?' },
    })),
    toplamlar: [...toplamlar].map(([mid, m]) => ({ malzeme: ozet(mid), miktar: ondalikMetin(m) })),
  };
}

/* ---------------- onaya hazırlık ---------------- */

async function onayDenetimi(db: Db, r: RevizyonSatiri): Promise<void> {
  const icerik = await s.icerikOku(db, r.id);
  const tipler = new Map((await operasyonTipleri(db)).map((t) => [t.id, t]));
  const kb = await kaynakBaglami(db);
  const aktifMi = async (k: AdimKaynagi) => (await kaynakOzetiAl(db, kb, k)).aktif;
  const hazirlik = [];
  for (const a of icerik.adimlar) {
    const adaylarAktif: boolean[] = [];
    for (const x of icerik.adaylar.filter((y) => y.adimId === a.id)) adaylarAktif.push(await aktifMi(x.kaynak));
    hazirlik.push({
      a,
      kaynakAktif: a.kaynak === null ? null : await aktifMi(a.kaynak),
      adaylarAktif,
    });
  }
  const hata = onayaHazirMi(hazirlik.map(({ a, kaynakAktif, adaylarAktif }) => ({
    opNo: a.opNo,
    operasyonTipiAktif: tipler.get(a.operasyonTipiId)?.aktif === true,
    kaynakAktif,
    adaylarAktif,
    fason: a.kaynak?.tur === 'fason',
    makineKullanimi: a.makineKullanimi,
    ayarSuresiDk: sayiyaCevir(a.ayarSuresiDk),
    birimSureDk: sayiyaCevir(a.birimSureDk),
    terminGun: a.terminGun,
    bagimlilik: a.bagimlilik,
    girenSayisi: icerik.bilesenler.filter((b) => b.adimId === a.id).length,
  })));
  if (hata) throw gecersiz(hata);
  const kartlar = await urunOzetleri(db, [...icerik.bilesenler.map((b) => b.malzemeId), ...icerik.yanUrunler.map((y) => y.malzemeId)]);
  for (const [, k] of kartlar) {
    if (k.onayDurumu !== 'aktif') throw gecersiz(`${k.stokKodu ?? k.ad} kartı kullanımda değil.`);
  }
  for (const b of icerik.bilesenler) {
    const k = kartlar.get(b.malzemeId);
    if (k && !girdiOlabilirMi(k.tur)) throw gecersiz(`${k.stokKodu ?? k.ad}: ticari mal ve hizmet reçetede girdi olmaz.`);
  }
  const bilesenler = [...new Set(icerik.bilesenler.map((b) => b.malzemeId))];
  const mamuller = bilesenler.filter((b) => rotaliTurMu(kartlar.get(b)?.tur ?? ''));
  const rotali = new Set((await s.yururluktekiBilesenler(db, mamuller)).map((x) => x.urunId));
  const eksik = rotasizMamuller(mamuller, rotali);
  if (eksik.length > 0) {
    throw gecersiz(`Bileşen mamul ya da yarımamulün yürürlükte rotası yok: ${eksik.map((e) => kartlar.get(e)?.stokKodu ?? kartlar.get(e)?.ad ?? String(e)).join(', ')}`);
  }
  await donguDenetle(db, r.malzemeId, bilesenler);
}

/* ---------------- komutlar ---------------- */

type YeniAdim = Omit<s.AdimYazimi, 'opNo' | 'sira'> & { opNo: number | null };

function icerikYazimlari(icerik: Icerik): (YeniAdim & { opNo: number })[] {
  return icerik.adimlar.map((a) => ({
    opNo: a.opNo, operasyonTipiId: a.operasyonTipiId, ad: a.ad, kaynak: a.kaynak, ayarSuresiDk: a.ayarSuresiDk,
    birimSureDk: a.birimSureDk, islemSuresiDk: a.islemSuresiDk, degisimSuresiDk: a.degisimSuresiDk, terminGun: a.terminGun,
    bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, firePayiYuzde: a.firePayiYuzde,
    makineKullanimi: a.makineKullanimi, enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar,
    adaylar: icerik.adaylar.filter((x) => x.adimId === a.id)
      .map(({ kaynak, ayarSuresiDk, birimSureDk, islemSuresiDk, degisimSuresiDk }) => ({ kaynak, ayarSuresiDk, birimSureDk, islemSuresiDk, degisimSuresiDk })),
    bilesenler: icerik.bilesenler.filter((x) => x.adimId === a.id).map(({ malzemeId, miktar, fireYuzde }) => ({ malzemeId, miktar, fireYuzde })),
    yanUrunler: icerik.yanUrunler.filter((x) => x.adimId === a.id).map(({ malzemeId, miktar }) => ({ malzemeId, miktar })),
  }));
}

// Numarasız adıma ürünün kullanılmış en büyük numarasının üstünden numara verilir, numara kayda yazılır, adımlar sırayla yazılır.
async function adimlariYaz(db: Db, revizyonId: number, malzemeId: number, adimlar: readonly YeniAdim[]): Promise<void> {
  const kullanilmis = await s.kullanilmisOpNolari(db, malzemeId);
  const dolu = adimlar.flatMap((a) => (a.opNo === null ? [] : [a.opNo]));
  const yeniler = opNolariVer([...kullanilmis, ...dolu], adimlar.filter((a) => a.opNo === null).length);
  let siradaki = 0;
  const numarali = adimlar.map((a) => {
    if (a.opNo !== null) return { ...a, opNo: a.opNo };
    const opNo = yeniler[siradaki] as number;
    siradaki += 1;
    return { ...a, opNo };
  });
  await s.opNolariKaydet(db, malzemeId, numarali.map((a) => a.opNo), revizyonId);
  for (const [i, a] of numarali.entries()) await s.adimYaz(db, revizyonId, malzemeId, { ...a, sira: i + 1 });
}

const TASLAK_ACIK = 'Bu ürünün açık bir revizyonu var; önce onu bitirin ya da iptal edin.';

type TaslakKaynagi = { tur: 'revizyon'; revizyonId: number } | { tur: 'standart' } | { tur: 'bos' } | { tur: 'kart' } | { tur: 'sablon'; sablonId: number };

export function taslakAc(db: Db, kullanici: Kullanici, urunId: number, kaynak: TaslakKaynagi): Promise<KomutCevabi> {
  return taslagiAc(db, kullanici.id, urunId, kaynak);
}

// Kart onaylanınca ilk rota kendiliğinden taslak açılır (#688): Malzemeler Rota'yı çağıramaz (Rota onu ithal eder, döngü yasak),
// bu yüzden Rota'nın işi kartları tarar. Rotası (herhangi bir revizyonu) olan kart atlanır: taslak bir kez açılır, silinse de
// yeniden açılmaz. Taslağı açan, kartı onaylayan kişidir. Bir kartın reddi ötekileri durdurmaz; ret günlüğe yazılır.
// Reçete ve Rota açılırken de koşar (POST /rota/karttan-taslaklar): kart yeni onaylandıysa tarama beklenmeden rota taslağı görünür.
export async function karttanTaslaklar(db: Db, gunluk: Gunluk): Promise<{ acilan: number }> {
  const rotali = new Set(await s.rotasiOlanMalzemeler(db));
  let acilan = 0;
  for (const k of await operasyonluAktifKartlar(db)) {
    if (rotali.has(k.no)) continue;
    const sonuc = await kayitNoktasi(db, () => taslagiAc(db, k.kisiId, k.no, { tur: 'kart' }));
    if (sonuc.tamam) acilan += 1;
    else gunluk.uyar(`Rota: kart ${k.no} için taslak açılamadı: ${sonuc.hata.message}`);
  }
  return { acilan };
}

async function taslagiAc(db: Db, acanKisiId: number, urunId: number, kaynak: TaslakKaynagi): Promise<KomutCevabi> {
  const urun = await rotaKurulabilirUrun(db, urunId);
  if (await s.acikRevizyonVarMi(db, urunId)) throw cakisma(TASLAK_ACIK);
  const harf = revizyonHarfi(await s.harfler(db, urunId));
  if (harf === null) throw gecersiz('Bu ürünün revizyon harfleri tükendi.');
  let adimlar: YeniAdim[] = [];
  let kaynakId: number | null = null;
  if (kaynak.tur === 'revizyon') {
    const k = await s.revizyonOku(db, kaynak.revizyonId);
    if (!k || k.malzemeId !== urunId) throw dogrulama('Kaynak revizyon bu ürünün değil.', 'kaynak.revizyonId');
    kaynakId = k.id;
    adimlar = icerikYazimlari(await s.icerikOku(db, k.id));
  } else if (kaynak.tur === 'standart' || kaynak.tur === 'sablon') {
    // "Standart" varsayılan şablondur (#698). Şablon tipi kimlikle tutar: katalogda kod değişse de taslak açılır (#464).
    const sablonId = kaynak.tur === 'sablon' ? kaynak.sablonId : await s.varsayilanSablonId(db);
    if (sablonId === null) throw gecersiz('Varsayılan rota şablonu tanımlı değil.');
    const sablon = await s.sablonAdimlari(db, [sablonId]);
    if (sablon.length === 0) {
      if (kaynak.tur === 'sablon' && !(await s.sablonlar(db)).some((x) => x.id === sablonId)) throw dogrulama('Şablon bulunamadı.', 'kaynak.sablonId');
      throw gecersiz('Şablonda adım yok.');
    }
    adimlar = sablon.map((st) => ({
      opNo: null, operasyonTipiId: st.operasyonTipiId, ad: st.ad, kaynak: null, ayarSuresiDk: null, birimSureDk: null, islemSuresiDk: null, degisimSuresiDk: null, terminGun: null,
      bagimlilik: 'bekleyen' as Bagimlilik, devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek' as MakineKullanimi,
      enKucukParca: null, yenidenAyar: true, adaylar: [], bilesenler: [], yanUrunler: [],
    }));
  } else if (kaynak.tur === 'kart') {
    // Aktarım tek yönlüdür ve yalnız ilk rotada: kart sonradan değişse de var olan rota değişmez, kartta kopya kalır (#688).
    if ((await s.harfler(db, urunId)).length > 0) throw cakisma('Bu ürünün rotası var; karttan yalnız ilk rota açılır.');
    const kart = await kartAdimlari(db, urunId);
    if (!kart) throw gecersiz('Kartta operasyon yok.');
    adimlar = kart.map((a) => ({
      opNo: a.opNo, operasyonTipiId: a.operasyonTipiId, ad: a.ad, kaynak: null, ayarSuresiDk: null, birimSureDk: null, islemSuresiDk: null, degisimSuresiDk: null, terminGun: null,
      bagimlilik: 'bekleyen' as Bagimlilik, devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek' as MakineKullanimi,
      enKucukParca: null, yenidenAyar: true, adaylar: [], bilesenler: [], yanUrunler: [],
    }));
  }
  const id = await s.revizyonEkle(db, { malzemeId: urunId, malzemeTuru: turu(urun), harf, acanKisiId, kaynakRevizyonId: kaynakId });
  await adimlariYaz(db, id, urunId, adimlar);
  return cevap(id, 'taslak', 1);
}

export async function kaydet(db: Db, kullanici: Kullanici, id: number, govde: KaydetGovdesiCikti): Promise<KomutCevabi> {
  const { r } = await komutIcinAl(db, kullanici, id, 'kaydet', govde.surum);
  const mevcut = await s.icerikOku(db, id);
  const ayrilmis = taslakSureleri(govde.adimlar.map((a) => ({
    ...a, terminGun: a.terminGun ?? null, islemSuresiDk: a.islemSuresiDk ?? null, degisimSuresiDk: a.degisimSuresiDk ?? null,
    adaylar: a.adaylar.map((x) => ({ ...x, islemSuresiDk: x.islemSuresiDk ?? null, degisimSuresiDk: x.degisimSuresiDk ?? null })),
  })));
  if ('hata' in ayrilmis) throw dogrulama(ayrilmis.hata.ileti, ayrilmis.hata.alan);
  const adimlar = ilkAdimiDuzenle(ayrilmis.adimlar);
  const hata = taslakDenetle(adimlar, { urunId: r.malzemeId, taslaktakiOpNolari: mevcut.adimlar.map((a) => a.opNo) });
  if (hata) throw dogrulama(hata.ileti, hata.alan);
  const tipler = new Map((await operasyonTipleri(db)).map((t) => [t.id, t]));
  const eskiKartlar = new Set([...mevcut.bilesenler.map((b) => b.malzemeId), ...mevcut.yanUrunler.map((y) => y.malzemeId)]);
  const yeniKartlar = adimlar.flatMap((a) => [...a.bilesenler, ...a.yanUrunler].map((b) => b.malzemeId)).filter((m) => !eskiKartlar.has(m));
  const kartlar = await urunOzetleri(db, yeniKartlar);
  for (const [i, a] of adimlar.entries()) {
    const tip = tipler.get(a.operasyonTipiId);
    if (!tip) throw dogrulama('Operasyon tipi bulunamadı.', `adimlar.${i}.operasyonTipiId`);
    const eski = mevcut.adimlar.find((m) => m.opNo === a.opNo);
    // Pasif tip yeni adımda seçilemez; var olan adımda kalır.
    if (!tip.aktif && (!eski || eski.operasyonTipiId !== a.operasyonTipiId)) {
      throw dogrulama('Bu operasyon tipi kullanıma kapalı.', `adimlar.${i}.operasyonTipiId`);
    }
  }
  // Yeni seçilen makine, kişi ya da fason firma var ve kullanımda olmalı; var olan adımdaki kaynak pasifleşse de taslakta kalır
  // (onayda denetlenir).
  const kb = await kaynakBaglami(db);
  const eskiKaynaklar = new Set([...mevcut.adimlar.flatMap((a) => (a.kaynak ? [kaynakAnahtari(a.kaynak)] : [])), ...mevcut.adaylar.map((x) => kaynakAnahtari(x.kaynak))]);
  for (const [i, a] of adimlar.entries()) {
    for (const k of [...(a.kaynak ? [a.kaynak] : []), ...a.adaylar.map((x) => x.kaynak)]) {
      if (eskiKaynaklar.has(kaynakAnahtari(k))) continue;
      const o = await kaynakOzetiAl(db, kb, k);
      if (!o.aktif) {
        throw dogrulama(
          o.tur === 'fason' ? `${o.ad}: fason firma bulunamadı, kullanımda değil ya da fason işaretli değil.` : `${o.ad}: makine ya da kişi bulunamadı ya da kullanımda değil.`,
          `adimlar.${i}.kaynak`,
        );
      }
    }
  }
  for (const m of yeniKartlar) {
    const k = kartlar.get(m);
    if (!k) throw dogrulama('Malzeme kartı bulunamadı.', 'adimlar');
    if (k.onayDurumu !== 'aktif') throw dogrulama(`${k.stokKodu ?? k.ad} kartı kullanımda değil.`, 'adimlar');
  }
  for (const [i, a] of adimlar.entries()) {
    for (const b of a.bilesenler) {
      const k = kartlar.get(b.malzemeId);
      if (k && !girdiOlabilirMi(k.tur)) throw dogrulama(`${k.stokKodu ?? k.ad}: ticari mal ve hizmet reçetede girdi olmaz.`, `adimlar.${i}.bilesenler`);
    }
  }
  await s.icerikSil(db, id);
  await adimlariYaz(db, id, r.malzemeId, adimlar);
  return cevap(id, 'taslak', await s.kaydetYaz(db, id, govde.aciklama === '' ? null : govde.aciklama, kullanici.id));
}

export async function onayaGonder(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<KomutCevabi> {
  const { r } = await komutIcinAl(db, kullanici, id, 'onaya-gonder', surum);
  await onayDenetimi(db, r);
  return cevap(id, 'onay_bekliyor', await s.gonderYaz(db, id, kullanici.id));
}

export async function geriGonder(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<KomutCevabi> {
  await komutIcinAl(db, kullanici, id, 'geri-gonder', surum);
  return cevap(id, 'taslak', await s.geriGonderYaz(db, id));
}

export async function onayla(db: Db, kullanici: Kullanici, id: number, surum: number, yururlugeAl: boolean): Promise<KomutCevabi> {
  const { r, dortGozAcik } = await komutIcinAl(db, kullanici, id, 'onayla', surum);
  // Gönderildikten sonra bileşen kartı ya da alt ürün rotası değişmiş olabilir: onayda yeniden denetlenir.
  await onayDenetimi(db, r);
  // Dört gözsüz yalnız, ayar açık olsaydı engellenecek onaydır; başkasının onayı ayar kapalıyken de dört gözlüdür.
  const dortGozsuz = !dortGozAcik && dortGozEngeli({ kisiId: kullanici.id, gonderenKisiId: r.gonderenKisiId, duzenleyenKisiIdleri: r.duzenleyenKisiIdleri, dortGozAcik: true });
  const yeniSurum = await s.onaylaYaz(db, id, kullanici.id, dortGozsuz);
  if (!yururlugeAl) return cevap(id, 'onayli', yeniSurum);
  return yururlugeGir(db, kullanici, r);
}

export async function yururlugeAl(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<KomutCevabi> {
  const { r } = await komutIcinAl(db, kullanici, id, 'yururluge-al', surum);
  await onayDenetimi(db, r);
  return yururlugeGir(db, kullanici, r);
}

async function yururlugeGir(db: Db, kullanici: Kullanici, r: RevizyonSatiri): Promise<KomutCevabi> {
  const onceki = await s.yururluktekiRevizyonId(db, r.malzemeId);
  await s.yururluktekiniOnayliYap(db, r.malzemeId);
  const surum = await s.yururlugeAlYaz(db, r.id, kullanici.id);
  await olcumleriBosalt(db, kullanici.id, r.malzemeId, onceki, r.id);
  return cevap(r.id, 'yururlukte', surum);
}

export async function iptal(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<KomutCevabi> {
  await komutIcinAl(db, kullanici, id, 'iptal', surum);
  return cevap(id, 'iptal', await s.iptalYaz(db, id, kullanici.id));
}

// Revizyon başka (ya da aynı) mamule taslak olarak kopyalanır. Aynı üründe numaralar korunur; başka üründe
// hedefte kullanılmamış numara korunur, kullanılmış numara yeni numara alır.
export async function kopyala(db: Db, kullanici: Kullanici, id: number, hedefUrunId: number): Promise<KomutCevabi> {
  const { r } = await komutIcinAl(db, kullanici, id, 'kopyala', null);
  const hedef = await rotaKurulabilirUrun(db, hedefUrunId);
  if (await s.acikRevizyonVarMi(db, hedefUrunId)) throw cakisma(TASLAK_ACIK);
  const harf = revizyonHarfi(await s.harfler(db, hedefUrunId));
  if (harf === null) throw gecersiz('Bu ürünün revizyon harfleri tükendi.');
  let adimlar: YeniAdim[] = icerikYazimlari(await s.icerikOku(db, id));
  if (hedefUrunId !== r.malzemeId) {
    const kullanilmis = new Set(await s.kullanilmisOpNolari(db, hedefUrunId));
    adimlar = adimlar.map((a) => (a.opNo !== null && kullanilmis.has(a.opNo) ? { ...a, opNo: null } : a));
    if (adimlar.some((a) => a.bilesenler.some((b) => b.malzemeId === hedefUrunId))) {
      throw gecersiz('Hedef ürün bu reçetede bileşen; kendisini bileşen olarak alamaz.');
    }
  }
  const yeni = await s.revizyonEkle(db, { malzemeId: hedefUrunId, malzemeTuru: turu(hedef), harf, acanKisiId: kullanici.id, kaynakRevizyonId: id });
  await adimlariYaz(db, yeni, hedefUrunId, adimlar);
  return cevap(yeni, 'taslak', 1);
}

export async function talimatYaz(
  db: Db, kullanici: Kullanici, urunId: number, govde: { opNo: number; metin: string; okunanSurum: number | null },
): Promise<TalimatlarCevabi> {
  if (!(await s.opNoAdimiVarMi(db, urunId, govde.opNo))) {
    throw dogrulama(`OP ${govde.opNo} bu ürünün hiçbir revizyonunda yok; talimat yazılamaz.`, 'opNo');
  }
  const son = (await s.talimatlar(db, urunId, govde.opNo))[0]?.surum ?? null;
  if (son !== govde.okunanSurum) {
    throw eskiSurum();
  }
  await s.talimatEkle(db, urunId, govde.opNo, (son ?? 0) + 1, govde.metin, kullanici.id);
  return talimatListesi(db, urunId, govde.opNo);
}

/* ---------------- süreler (teorik ve gerçekleşen) ---------------- */

const sayiMi = (m: string | null): number | null => sayiyaCevir(m);
const metinMi = (x: number | null, basamak = 4): string | null => (x === null ? null : ondalikMetin(x, basamak));

interface AdimSuresi { adimId: number; opNo: number; fason: boolean; teorik: { hazirlikDk: number | null; islemDk: number | null; degisimDk: number | null } }

function adimTeorikSureleri(icerik: Icerik): AdimSuresi[] {
  return icerik.adimlar.map((a) => {
    const ayrim = teorikAyrim(sayiMi(a.birimSureDk), sayiMi(a.islemSuresiDk), sayiMi(a.degisimSuresiDk));
    return { adimId: a.id, opNo: a.opNo, fason: a.kaynak?.tur === 'fason', teorik: { hazirlikDk: sayiMi(a.ayarSuresiDk), islemDk: ayrim.islem, degisimDk: ayrim.degisim } };
  });
}

const gerceklesenSatirlari = (kayitlar: readonly s.GerceklesenKaydi[], opNo: number): GerceklesenSatiri[] =>
  kayitlar.filter((k) => k.opNo === opNo).map((k) => ({ id: k.id, tur: k.tur, makineId: k.makineId, sureDk: sayiMi(k.sureDk), kaynak: k.kaynak }));

export async function sureler(db: Db, revizyonId: number, makineId: number | null): Promise<SurelerCevabi> {
  const r = revizyonuAl(await s.revizyonOku(db, revizyonId));
  const icerik = await s.icerikOku(db, revizyonId);
  const b = await gorunumBaglami(db, r.malzemeId, icerik);
  const gorunum = adimlariKur(b);
  const kayitlar = await s.gerceklesenSureler(db, r.malzemeId, icerik.adimlar.map((a) => a.opNo));
  const adlar = await kisiAdlari(db, kayitlar.map((k) => k.kisiId));
  const kayitById = new Map(kayitlar.map((k) => [k.id, k]));
  return {
    revizyon: { id: r.id, harf: r.harf, durum: r.durum, malzemeId: r.malzemeId },
    makineId,
    adimlar: adimTeorikSureleri(icerik).map((a, i) => {
      const g = gorunum[i]!;
      const satirlar = gerceklesenSatirlari(kayitlar, a.opNo);
      const etkin = etkinAdimSuresi(a.teorik);
      const son = (tur: GerceklesenTuru) => satirlar.filter((x) => x.tur === tur && x.makineId === makineId).at(-1)?.id ?? null;
      const bekleyen = bekleyenOlcum(satirlar, makineId);
      const olcum = (tur: GerceklesenTuru) => {
        const x = bekleyen[tur];
        const k = x === null ? undefined : kayitById.get(x.id);
        if (x === null || x.sureDk === null || k === undefined || k.kaynak === 'kabul') return null;
        return {
          id: x.id, sureDk: ondalikMetin(x.sureDk), kaynak: k.kaynak, isEmriId: k.isEmriId, makineId: x.makineId,
          yazan: { id: k.kisiId, ad: adlar.get(k.kisiId) ?? null }, zaman: k.zaman,
        };
      };
      const oran = degisimOrani(etkin.islemSuresiDk, etkin.degisimSuresiDk);
      return {
        adimId: a.adimId, opNo: a.opNo, sira: g.sira, ad: g.ad,
        operasyonTipi: { id: g.operasyonTipi.id, kod: g.operasyonTipi.kod, ad: g.operasyonTipi.ad },
        kaynak: g.kaynak,
        teorik: {
          hazirlikDk: g.ayarSuresiDk, islemDk: g.islemSuresiDk, degisimDk: g.degisimSuresiDk, degisimOraniYuzde: g.degisimOraniYuzde,
        },
        sonKayit: { hazirlik: son('hazirlik'), islem: son('islem'), degisim: son('degisim') },
        olcum: { hazirlik: olcum('hazirlik'), islem: olcum('islem'), degisim: olcum('degisim') },
        etkin: {
          hazirlikDk: metinMi(etkin.ayarSuresiDk), birimSureDk: metinMi(etkin.birimSureDk), islemDk: metinMi(etkin.islemSuresiDk),
          degisimDk: metinMi(etkin.degisimSuresiDk), degisimOraniYuzde: metinMi(oran, 2),
        },
        fason: a.fason,
      };
    }),
  };
}

const FASON_SURESIZ = 'Fason adıma gerçekleşen süre girilmez; termin günüyle izlenir.';

// Elle ölçüm (RT-73, RT-75): defter yalnız eklenir; boş süre bekleyen ölçümü boşaltır. Okunan satır son satır değilse başkası yazmıştır
// (eski sürüm). Fason adımın dakika süresi yoktur (FS4 a); ölçüm de girilmez.
export async function gerceklesenSureYaz(
  db: Db, kullanici: Kullanici, adimId: number, g: { tur: GerceklesenTuru; sureDk: number | null; makineId: number | null; okunanId: number | null },
): Promise<SurelerCevabi> {
  const adim = await s.adimKunyesi(db, adimId);
  if (adim === null) throw bulunamadi('Rota adımı bulunamadı.');
  const icerik = await s.icerikOku(db, adim.revizyonId);
  if (icerik.adimlar.find((a) => a.id === adimId)?.kaynak?.tur === 'fason') throw gecersiz(FASON_SURESIZ);
  const ret = gerceklesenDenetle(g.tur, g.sureDk);
  if (ret) throw dogrulama(ret, 'sureDk');
  await s.gerceklesenKilitle(db, adim.malzemeId, adim.opNo);
  const son = await s.sonGerceklesenId(db, { malzemeId: adim.malzemeId, opNo: adim.opNo, tur: g.tur, makineId: g.makineId });
  if (son !== g.okunanId) throw eskiSurum();
  await kisitKorumali(
    { rota_gerceklesen_sure_makine: { ileti: 'Makine bulunamadı.', alan: 'makineId' } },
    () => s.gerceklesenEkle(db, { malzemeId: adim.malzemeId, opNo: adim.opNo, tur: g.tur, makineId: g.makineId, sureDk: g.sureDk, kisiId: kullanici.id }),
  );
  return sureler(db, adim.revizyonId, g.makineId);
}

const ONAYDA_KABUL = 'Bu ürünün açık revizyonu onayda; kabul için önce geri gönderin ya da onaylayın.';

// Kabul (RT-77, RT-78; 169 c): ölçüm ürünün açık taslağına, yoksa yürürlükteki revizyondan açılan taslağa teorik süre olarak yazılır;
// kabul eden taslağın düzenleyenidir, onay dört gözle başkasınındır. Makine verilirse o makinenin (adımın kaynağı ya da adayı) süresi
// değişir. Terminal ölçümünde kabul satırı ölçülen iş emriyle yazılır (elle ölçümün iş emri yoktur, kayıt revizyondadır). Ölçüm
// revizyon yürürlüğe girince boşaltılır (RT-79), plan o zamana kadar yürürlükteki süreyle çalışır.
export async function gerceklesenKabulEt(
  db: Db, kullanici: Kullanici, adimId: number, g: { tur: GerceklesenTuru; olcumId: number; makineId: number | null; okunanId: number | null },
): Promise<GerceklesenKabulCevabi> {
  const adim = await s.adimKunyesi(db, adimId);
  if (adim === null) throw bulunamadi('Rota adımı bulunamadı.');
  await s.gerceklesenKilitle(db, adim.malzemeId, adim.opNo);
  const satir = await s.gerceklesenSatiri(db, g.olcumId);
  if (satir === null) throw bulunamadi('Ölçüm bulunamadı.');
  const ret = kabulDenetle({ ...satir, sureDk: sayiMi(satir.sureDk) }, { malzemeId: adim.malzemeId, opNo: adim.opNo, tur: g.tur, makineId: g.makineId });
  if (ret) throw gecersiz(ret);
  const son = await s.sonGerceklesenId(db, { malzemeId: adim.malzemeId, opNo: adim.opNo, tur: g.tur, makineId: g.makineId });
  if (son !== g.okunanId) throw eskiSurum();
  const acik = await s.acikRevizyon(db, adim.malzemeId);
  if (acik !== null && acik.durum !== 'taslak') throw cakisma(ONAYDA_KABUL);
  let taslakId = acik?.id ?? null;
  if (taslakId === null) {
    const yururlukte = await s.yururluktekiRevizyonId(db, adim.malzemeId);
    if (yururlukte === null) throw gecersiz('Ürünün yürürlükte rotası yok; ölçüm kabul edilemez.');
    taslakId = (await taslagiAc(db, kullanici.id, adim.malzemeId, { tur: 'revizyon', revizyonId: yururlukte })).id;
  }
  await s.revizyonKilitle(db, taslakId);
  const yazimlar = icerikYazimlari(await s.icerikOku(db, taslakId));
  const hedef = yazimlar.find((a) => a.opNo === adim.opNo);
  if (hedef === undefined) throw gecersiz('Açık taslakta bu operasyon yok.');
  if (hedef.kaynak?.tur === 'fason') throw gecersiz(FASON_SURESIZ);
  const aday = g.makineId === null || (hedef.kaynak?.tur === 'makine' && hedef.kaynak.id === g.makineId)
    ? null : hedef.adaylar.find((x) => x.kaynak.tur === 'makine' && x.kaynak.id === g.makineId);
  if (aday === undefined) throw gecersiz('Makine bu adımın kaynağı ya da adayı değil.');
  const yer = aday ?? hedef;
  const yeni = kabulSureleri({
    ayarSuresiDk: sayiMi(yer.ayarSuresiDk === null ? null : String(yer.ayarSuresiDk)), birimSureDk: sayiMi(yer.birimSureDk === null ? null : String(yer.birimSureDk)),
    islemSuresiDk: sayiMi(yer.islemSuresiDk === null ? null : String(yer.islemSuresiDk)), degisimSuresiDk: sayiMi(yer.degisimSuresiDk === null ? null : String(yer.degisimSuresiDk)),
  }, g.tur, Number(satir.sureDk));
  if ('ileti' in yeni) throw gecersiz(yeni.ileti);
  Object.assign(yer, yeni);
  await s.icerikSil(db, taslakId);
  await adimlariYaz(db, taslakId, adim.malzemeId, yazimlar);
  const surum = await s.duzenlemeYaz(db, taslakId, kullanici.id);
  if (satir.isEmriId !== null) {
    await s.gerceklesenEkle(db, {
      malzemeId: adim.malzemeId, opNo: adim.opNo, tur: g.tur, makineId: g.makineId, sureDk: satir.sureDk, kisiId: kullanici.id, kaynak: 'kabul', isEmriId: satir.isEmriId,
    });
  }
  return { taslak: cevap(taslakId, 'taslak', surum), sureler: await sureler(db, taslakId, g.makineId) };
}

// RT-79 (171 a): yürürlüğe giren revizyonda teorik süresi öncekinden farklı türlerin bekleyen ölçümü boş elle satırıyla boşaltılır. Adımın
// kendi süresi makinesiz görünümü ve adımın makinesinin ölçümünü, aday süresi o makinenin ölçümünü kapatır. Bekleyen ölçümü olmayan yere satır yazılmaz.
async function olcumleriBosalt(db: Db, kisiId: number, malzemeId: number, eskiId: number | null, yeniId: number): Promise<void> {
  const yeni = await s.icerikOku(db, yeniId);
  const eski = eskiId === null ? null : await s.icerikOku(db, eskiId);
  const kayitlar = await s.gerceklesenSureler(db, malzemeId, yeni.adimlar.map((a) => a.opNo));
  const sureleri = (x: { ayarSuresiDk: string | null; birimSureDk: string | null; islemSuresiDk: string | null; degisimSuresiDk: string | null }): AdimSureleri => ({
    ayarSuresiDk: sayiMi(x.ayarSuresiDk), birimSureDk: sayiMi(x.birimSureDk), islemSuresiDk: sayiMi(x.islemSuresiDk), degisimSuresiDk: sayiMi(x.degisimSuresiDk),
  });
  for (const a of yeni.adimlar) {
    const o = eski?.adimlar.find((x) => x.opNo === a.opNo);
    const yerler: { makineId: number | null; turler: GerceklesenTuru[] }[] = [];
    const kendi = degisenTurler(o ? sureleri(o) : null, sureleri(a));
    yerler.push({ makineId: null, turler: kendi });
    if (a.kaynak?.tur === 'makine') yerler.push({ makineId: a.kaynak.id, turler: kendi });
    for (const x of yeni.adaylar.filter((y) => y.adimId === a.id && y.kaynak.tur === 'makine')) {
      const ox = o === undefined ? undefined : eski?.adaylar.find((y) => y.adimId === o.id && y.kaynak.tur === 'makine' && y.kaynak.id === x.kaynak.id);
      yerler.push({ makineId: x.kaynak.id, turler: degisenTurler(ox ? sureleri(ox) : null, sureleri(x)) });
    }
    const satirlar = gerceklesenSatirlari(kayitlar, a.opNo);
    for (const { makineId, turler } of yerler) {
      const bekleyen = bekleyenOlcum(makineId === null ? satirlar : satirlar.filter((x) => x.makineId === makineId), makineId);
      for (const tur of turler) {
        if (bekleyen[tur] === null) continue;
        await s.gerceklesenEkle(db, { malzemeId, opNo: a.opNo, tur, makineId, sureDk: null, kisiId });
      }
    }
  }
}

// Emir bitti (B38, bağı kablolama.ts kurar): biten her makine ya da kişi iş emrinin ölçümü rotaya terminal ölçümü olarak yazılır;
// plan kullanmaz, planlamacı kabul eder (169 c). Ölçüm makinedeyse o makineye özgüdür. Rotada olmayan adım (ek adım), fason adım,
// ölçülmemiş süre ve önceden ölçülmüş iş emri atlanır. Olay komutla aynı işlemdedir: burada ret emri bitirmeyi geri alır, bu yüzden
// eksik veri reddedilmez, atlanır.
export async function emirBittiYansit(db: Db, olay: EmirBittiOlayi): Promise<void> {
  const emir = await uretimEmriOzeti(db, olay.uretimEmriId);
  if (emir === null || emir.malzemeNo === null) return;
  const malzemeId = emir.malzemeNo;
  const ayrinti = await adimliEmirAyrintisi(db, emir.id);
  const opNolari = new Set(await s.kullanilmisOpNolari(db, malzemeId));
  const adaylar = ayrinti.isEmirleri.filter((i) => i.durum === 'tamam' && i.kaynak !== null && i.kaynak.tur !== 'fason' && opNolari.has(i.opNo));
  const olculmus = await s.olculmusIsEmirleri(db, adaylar.map((i) => i.id));
  for (const i of adaylar) {
    if (olculmus.has(i.id)) continue;
    const makineId = i.kaynak?.tur === 'makine' ? i.kaynak.id : null;
    const olcum = terminalOlcumleri(await isEmriSureOzeti(db, i.id));
    for (const tur of ['hazirlik', 'islem'] as const) {
      const sureDk = olcum[tur];
      if (sureDk === null) continue;
      await s.gerceklesenEkle(db, { malzemeId, opNo: i.opNo, tur, makineId, sureDk, kisiId: olay.kisiId, kaynak: 'terminal', isEmriId: i.id });
    }
  }
}

// Plan için etkin süre (169 c): yalnız teorik; ölçüm teoriğe kabul ve revizyonla geçer. OP numarasıyla döner; fason adım dönmez (dakika
// süresi yoktur). Makine parametresi bugünkü çağıranlar içindir; süre makineye göre değişmez.
export async function adimEtkinSureleri(db: Db, revizyonId: number, _makineId: number | null = null): Promise<Map<number, EtkinAdimSuresi>> {
  const r = await s.revizyonOku(db, revizyonId);
  if (!r) return new Map();
  const adimlar = adimTeorikSureleri(await s.icerikOku(db, revizyonId)).filter((a) => !a.fason);
  return new Map(adimlar.map((a) => [a.opNo, etkinAdimSuresi(a.teorik)]));
}

// adimEtkinSureleri'nin toplu hâli: i. sonuç i. isteğindir; istek sayısından bağımsız sabit sayıda sorgu (Arkon operatör özeti iş başına çağırıyordu).
export async function adimEtkinSureleriToplu(
  db: Db, istekler: readonly { revizyonId: number; makineId: number | null }[],
): Promise<Map<number, EtkinAdimSuresi>[]> {
  if (istekler.length === 0) return [];
  const satirlar = new Map((await s.revizyonlariOku(db, [...new Set(istekler.map((x) => x.revizyonId))])).map((r) => [r.id, r]));
  const icerikler = await s.iceriklerOku(db, [...satirlar.keys()]);
  return istekler.map(({ revizyonId }) => {
    if (!satirlar.has(revizyonId)) return new Map();
    const adimlar = adimTeorikSureleri(icerikler.get(revizyonId) ?? { adimlar: [], adaylar: [], bilesenler: [], yanUrunler: [] }).filter((a) => !a.fason);
    return new Map(adimlar.map((a) => [a.opNo, etkinAdimSuresi(a.teorik)]));
  });
}

/* ---------------- başka modüllere ---------------- */

export interface RotaAdimi {
  opNo: number;
  sira: number;
  operasyonTipiId: number;
  ad: string;
  // Operasyonu yapan makine ya da kişi; null: henüz atanmadı ya da adım fason.
  kaynak: Kaynak | null;
  // Fason adım: işi yapan finans firması ve takvim günü termini. Plan fason adımı henüz yerleştirmez (F10).
  fason: { firmaId: number; terminGun: number | null } | null;
  ayarSuresiDk: OndalikMetin | null;
  birimSureDk: OndalikMetin | null;
  bagimlilik: Bagimlilik;
  devirAdedi: number | null;
  firePayiYuzde: OndalikMetin;
  makineKullanimi: MakineKullanimi;
  enKucukParca: number | null;
  yenidenAyar: boolean;
  adaylar: { kaynak: Kaynak; ayarSuresiDk: OndalikMetin | null; birimSureDk: OndalikMetin | null }[];
  bilesenler: { malzemeId: number; miktar: OndalikMetin; fireYuzde: OndalikMetin }[];
  yanUrunler: { malzemeId: number; miktar: OndalikMetin }[];
  // Emre kopyalanırken sabitlenecek geçerli talimat sürümü; talimat yoksa null.
  talimatSurumu: number | null;
}

export interface RotaRevizyonu {
  id: number;
  malzemeId: number;
  harf: string;
  durum: RevizyonDurumu;
  adimlar: RotaAdimi[];
}

// Kural gelmeden onaylanmış revizyonda da girensiz adım olabilir (#1372): plan ve Arkon bu revizyondan açılan emri yerleştirmez, nedenini gösterir.
export async function girdisiEksikRevizyonlar(db: Db, revizyonIdleri: readonly number[]): Promise<Map<number, string>> {
  const adimlar = await s.adimGirenSayilari(db, [...new Set(revizyonIdleri)]);
  const sonuc = new Map<number, string>();
  for (const id of new Set(adimlar.map((a) => a.revizyonId))) {
    const eksik = girdiEksigi(adimlar.filter((a) => a.revizyonId === id));
    if (eksik) sonuc.set(id, `Rotada girdi eksik (${eksik.replace(/\.$/, '')})`);
  }
  return sonuc;
}

export async function revizyonGetir(db: Db, id: number): Promise<RotaRevizyonu | null> {
  const r = await s.revizyonOku(db, id);
  if (!r) return null;
  const icerik = await s.icerikOku(db, id);
  const talimatlar = new Map((await s.gecerliTalimatlar(db, r.malzemeId)).map((t) => [t.opNo, t.surum]));
  return revizyonKur(r, icerik, talimatlar);
}

// /plan gibi çok revizyon okuyan çağıranlar için: revizyon sayısından bağımsız sabit sayıda sorgu. Bulunmayan kimlik haritada yer almaz.
export async function revizyonlar(db: Db, idler: readonly number[]): Promise<Map<number, RotaRevizyonu>> {
  const sonuc = new Map<number, RotaRevizyonu>();
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return sonuc;
  const satirlar = await s.revizyonlariOku(db, tekil);
  if (satirlar.length === 0) return sonuc;
  const icerikler = await s.iceriklerOku(db, satirlar.map((r) => r.id));
  const talimatlar = new Map<number, Map<number, number>>();
  for (const t of await s.urunlerinGecerliTalimatlari(db, [...new Set(satirlar.map((r) => r.malzemeId))])) {
    let urun = talimatlar.get(t.malzemeId);
    if (!urun) talimatlar.set(t.malzemeId, urun = new Map());
    urun.set(t.opNo, t.surum);
  }
  for (const r of satirlar) {
    sonuc.set(r.id, revizyonKur(r, icerikler.get(r.id) ?? { adimlar: [], adaylar: [], bilesenler: [], yanUrunler: [] }, talimatlar.get(r.malzemeId) ?? new Map()));
  }
  return sonuc;
}

function revizyonKur(r: RevizyonSatiri, icerik: Icerik, talimatlar: ReadonlyMap<number, number>): RotaRevizyonu {
  const yazim = icerikYazimlari(icerik);
  return {
    id: r.id, malzemeId: r.malzemeId, harf: r.harf, durum: r.durum,
    adimlar: icerik.adimlar.map((a, i) => ({
      opNo: a.opNo, sira: a.sira, operasyonTipiId: a.operasyonTipiId, ad: a.ad,
      kaynak: a.kaynak?.tur === 'fason' ? null : (a.kaynak as Kaynak | null),
      fason: a.kaynak?.tur === 'fason' ? { firmaId: a.kaynak.id, terminGun: a.terminGun } : null,
      ayarSuresiDk: a.ayarSuresiDk, birimSureDk: a.birimSureDk, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, firePayiYuzde: a.firePayiYuzde,
      makineKullanimi: a.makineKullanimi, enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar,
      adaylar: (yazim[i]?.adaylar ?? []).map(({ kaynak, ayarSuresiDk, birimSureDk }) => ({ kaynak, ayarSuresiDk, birimSureDk })) as RotaAdimi['adaylar'],
      bilesenler: (yazim[i]?.bilesenler ?? []) as RotaAdimi['bilesenler'],
      yanUrunler: (yazim[i]?.yanUrunler ?? []) as RotaAdimi['yanUrunler'],
      talimatSurumu: talimatlar.get(a.opNo) ?? null,
    })),
  };
}

// Reçete ve Rota'nın bağlı durumu (kart #1184): ekranın düzenlediği alanlar. Adımın kaynağı ham haliyle verilir (istasyon, makine, kişi, fason);
// ekranın karşılığı olmayan kişi, fason ve makine adayları yorumsuz taşınır ki kaydet onları silmesin.
export interface DurumRotaAdimi {
  opNo: number;
  operasyonTipiId: number;
  ad: string;
  kaynak: AdimKaynagi | null;
  terminGun: number | null;
  ayarSuresiDk: OndalikMetin | null;
  birimSureDk: OndalikMetin | null;
  islemSuresiDk: OndalikMetin | null;
  degisimSuresiDk: OndalikMetin | null;
  bagimlilik: Bagimlilik;
  devirAdedi: number | null;
  firePayiYuzde: OndalikMetin;
  makineKullanimi: MakineKullanimi;
  enKucukParca: number | null;
  yenidenAyar: boolean;
  adaylar: { kaynak: Kaynak; ayarSuresiDk: OndalikMetin | null; birimSureDk: OndalikMetin | null; islemSuresiDk: OndalikMetin | null; degisimSuresiDk: OndalikMetin | null }[];
  bilesenler: { malzemeId: number; miktar: OndalikMetin; fireYuzde: OndalikMetin }[];
  yanUrunler: { malzemeId: number; miktar: OndalikMetin }[];
}

export interface DurumRotaRevizyonu {
  id: number;
  malzemeId: number;
  harf: string;
  durum: RevizyonDurumu;
  surum: number;
  aciklama: string | null;
  acilma: string;
  onaylama: string | null;
  yururlugeAlma: string | null;
  adimlar: DurumRotaAdimi[];
}

// malzemeId verilince yalnız o ürünün revizyonları (sayımda tek rotanın statüsü çözülür).
export async function durumRevizyonlari(db: Db, malzemeId: number | null = null): Promise<DurumRotaRevizyonu[]> {
  const sonuc: DurumRotaRevizyonu[] = [];
  for (const r of await s.iptalsizRevizyonlar(db, malzemeId)) {
    const icerik = await s.icerikOku(db, r.id);
    sonuc.push({
      id: r.id, malzemeId: r.malzemeId, harf: r.harf, durum: r.durum, surum: r.surum, aciklama: r.aciklama, acilma: r.acilma, onaylama: r.onaylama,
      yururlugeAlma: r.yururlugeAlma,
      adimlar: icerik.adimlar.map((a) => ({
        opNo: a.opNo, operasyonTipiId: a.operasyonTipiId, ad: a.ad, kaynak: a.kaynak, terminGun: a.terminGun, ayarSuresiDk: a.ayarSuresiDk,
        birimSureDk: a.birimSureDk, islemSuresiDk: a.islemSuresiDk, degisimSuresiDk: a.degisimSuresiDk, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi,
        firePayiYuzde: a.firePayiYuzde, makineKullanimi: a.makineKullanimi, enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar,
        adaylar: icerik.adaylar.filter((x) => x.adimId === a.id)
          .map(({ kaynak, ayarSuresiDk, birimSureDk, islemSuresiDk, degisimSuresiDk }) => ({ kaynak, ayarSuresiDk, birimSureDk, islemSuresiDk, degisimSuresiDk })),
        bilesenler: icerik.bilesenler.filter((x) => x.adimId === a.id).map(({ malzemeId, miktar, fireYuzde }) => ({ malzemeId, miktar, fireYuzde })),
        yanUrunler: icerik.yanUrunler.filter((x) => x.adimId === a.id).map(({ malzemeId, miktar }) => ({ malzemeId, miktar })),
      })),
    });
  }
  return sonuc;
}

export async function yururluktekiRevizyon(db: Db, malzemeId: number): Promise<RotaRevizyonu | null> {
  const id = await s.yururluktekiRevizyonId(db, malzemeId);
  return id === null ? null : revizyonGetir(db, id);
}

export async function adimBilesenleri(db: Db, revizyonId: number, opNo: number): Promise<RotaAdimi['bilesenler']> {
  const r = await revizyonGetir(db, revizyonId);
  return r?.adimlar.find((a) => a.opNo === opNo)?.bilesenler ?? [];
}

export async function gecerliTalimat(db: Db, malzemeId: number, opNo: number): Promise<{ surum: number; metin: string } | null> {
  const t = (await s.talimatlar(db, malzemeId, opNo))[0];
  return t ? { surum: t.surum, metin: t.metin } : null;
}

// Yürürlükteki rotayla ağaç; rotası yoksa null.
export async function urunAgaci(db: Db, malzemeId: number, miktar: number): Promise<AgacCevabi | null> {
  const id = await s.yururluktekiRevizyonId(db, malzemeId);
  return id === null ? null : agac(db, id, miktar);
}

// Malzemeler bölümü: kartın hangi rotalarda kullanıldığı.
export async function malzemeKullanimi(db: Db, malzemeIdleri: readonly number[]): Promise<KullanimCevabi> {
  const satirlar = await s.malzemeKullanimi(db, malzemeIdleri);
  const urunler = new Map<number, UrunOzeti>();
  for (const x of satirlar) if (!urunler.has(x.urunId)) urunler.set(x.urunId, await urunOzetiAl(db, x.urunId));
  return {
    kullanimlar: satirlar.map((x) => ({
      malzemeId: x.malzemeId, urun: urunler.get(x.urunId)!, revizyon: { id: x.revizyonId, harf: x.harf, durum: x.durum as RevizyonDurumu },
      opNo: x.opNo, adimAdi: x.adimAdi, rol: x.rol,
    })),
  };
}

/* ---------------- emre kopya (K1) ---------------- */

// Rota (üst) üretim emirlerinin (alt) komutunu kendi transaction'ında çağırır (ADR 0006): üretim emri açılır, her rota adımı bir
// iş emri olur; talimatın emir açıldığı andaki sürümü sabitlenir ve metni iş emrinin kontrol listesi olur.
export async function emreKopyala(db: Db, kullanici: Kullanici, id: number, g: {
  adet: number; teslim: string | null; oncelik?: number | undefined; baslangic?: string | null | undefined; aciklama?: string | null | undefined; taslak?: boolean | undefined; projeId?: number | null | undefined; siparisSatiriId?: number | null | undefined;
  stoktanRezerve?: boolean | undefined; emirTuru?: EmirTuru | undefined;
}) {
  const r = revizyonuAl(await s.revizyonOku(db, id));
  const urun = await urunOzetiAl(db, r.malzemeId);
  if (urun.onayDurumu !== 'aktif') throw gecersiz('Kart kullanımda değil; emir açılamaz.');
  const rota = await revizyonGetir(db, id);
  const ret = emreKopyalanabilirMi({ durum: r.durum, adimSayisi: rota?.adimlar.length ?? 0 });
  if (ret || !rota) throw gecersiz(ret ?? 'Rota bulunamadı.');
  return uretimEmriAc(db, kullanici, {
    malzemeNo: r.malzemeId, adet: g.adet, teslim: g.teslim, oncelik: g.oncelik, baslangic: g.baslangic ?? null, aciklama: g.aciklama ?? null,
    ...(g.taslak ? { taslak: true } : {}), ...(g.stoktanRezerve ? { stoktanRezerve: true } : {}), ...(g.emirTuru ? { emirTuru: g.emirTuru } : {}), projeId: g.projeId ?? null, siparisSatiriId: g.siparisSatiriId ?? null, kaynakRotaRevizyonId: r.id, isEmirleri: await isEmriGirdileri(db, r.malzemeId, rota),
  });
}

// Emre kopya ve emirlere uygula aynı girdiyi kurar: her rota adımı bir iş emri, talimatın o anki metni kontrol listesi.
async function isEmriGirdileri(db: Db, malzemeId: number, rota: NonNullable<Awaited<ReturnType<typeof revizyonGetir>>>) {
  const metinler = new Map((await s.gecerliTalimatlar(db, malzemeId)).map((t) => [t.opNo, t.metin]));
  return rota.adimlar.map((a) => ({
    sira: a.sira, opNo: a.opNo, ad: a.ad, operasyonTipiId: a.operasyonTipiId,
    ...isEmriKaynagi(a), ayarSuresiDk: a.ayarSuresiDk,
    birimSureDk: a.birimSureDk, terminGun: a.fason?.terminGun ?? null, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, talimatSurumu: a.talimatSurumu,
    kontrolListesi: kontrolListesi(metinler.get(a.opNo) ?? null),
    // Emir adedi istenen sağlam çıktıdır (250 a): ihtiyacı adımın fire payı büyütür; adım ayarları planın girdisidir, varsayılana düşmez.
    firePayiYuzde: a.firePayiYuzde, makineKullanimi: a.makineKullanimi, enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar,
    // İş emrinin adayı makine ya da kişidir; istasyon adayı emirde karşılıksızdır, adımın istasyonu zaten başlıktır.
    adaylar: a.adaylar.flatMap((x) => (x.kaynak.tur === 'istasyon' ? [] : [{ kaynak: { tur: x.kaynak.tur, id: x.kaynak.id }, ayarSuresiDk: x.ayarSuresiDk, birimSureDk: x.birimSureDk }])),
    // Adımın girenleri emre kopyalanır: stok üretim sayımında adımın girdisini bunlardan sarf eder; yoksa sayım yalnız ürün girişi olur.
    bilesenler: a.bilesenler.map((b) => ({ malzemeNo: b.malzemeId, miktar: String(b.miktar), fireYuzde: String(b.fireYuzde) })),
  }));
}

// Teslimdeki "Emirlere uygula (yürürlükteki rota)": iş emirleri ürünün yürürlükteki revizyonundan yenilenir. Güvenli kip
// üretim emirlerindedir (başlamış ya da bitmiş iş emri korunur); rota yalnız yürürlükteki adımları verir (ADR 0006).
export async function emreUygula(db: Db, kullanici: Kullanici, emirId: number) {
  const e = await adimliEmirAyrintisi(db, emirId);
  if (e.urun.id === null || e.kaynakRotaRevizyonId === null) throw gecersiz('Rotadan açılmamış emre rota uygulanmaz.');
  const yid = await s.yururluktekiRevizyonId(db, e.urun.id);
  if (yid === null) throw gecersiz('Ürünün yürürlükte rotası yok.');
  if (yid === e.kaynakRotaRevizyonId) throw cakisma('Emir zaten yürürlükteki rotayla açılmış.');
  const r = revizyonuAl(await s.revizyonOku(db, yid));
  const rota = await revizyonGetir(db, yid);
  const ret = emreKopyalanabilirMi({ durum: r.durum, adimSayisi: rota?.adimlar.length ?? 0 });
  if (ret || !rota) throw gecersiz(ret ?? 'Rota bulunamadı.');
  const { degisenler } = await isEmirleriniYenile(db, kullanici, emirId, { kaynakRotaRevizyonId: yid, isEmirleri: await isEmriGirdileri(db, r.malzemeId, rota) });
  return { degisenler, kaynakRevizyon: { id: r.id, harf: r.harf } };
}

export async function revizyonKunyeleri(db: Db, idler: readonly number[]) {
  return { revizyonlar: await s.revizyonKunyeleri(db, idler) };
}

// Malzeme seçici ve Malzemeler bölümü: arama malzemeler modülündedir; rota yalnız ürün özetine çevirir.
// Bilinmeyen tür süzgeçten düşer; istenen türlerin hiçbiri bilinmiyorsa sonuç boştur (süzgeçsiz arama yapılmaz).
export async function malzemeAra(db: Db, g: { metin: string | null; tur: string[]; hepsi: boolean; sayfa: number }) {
  const turler = g.tur.filter((t): t is KatalogTuru => (KATALOG_TURLERI as readonly string[]).includes(t));
  if (g.tur.length > 0 && turler.length === 0) return { satirlar: [], toplam: 0, sayfaBoyu: ARAMA_SAYFA_BOYU };
  const r = await kartAra(db, { metin: g.metin, turler, yalnizAktif: !g.hepsi, sayfa: g.sayfa, sayfaBoyu: ARAMA_SAYFA_BOYU });
  // Malzemelerin araması sayımı hep verir; vermezse ekran en az görünen satır sayısını gösterir.
  return { satirlar: r.satirlar.map(urunOzetine), toplam: r.toplam ?? r.satirlar.length, sayfaBoyu: r.sayfaBoyu };
}

/* ---------------- şablonlar (#698) ---------------- */

const SABLON_ADI_KULLANILIYOR = 'Bu adla bir şablon var.';

async function sablonlariKur(db: Db, satirlar: readonly s.SablonSatiri[]): Promise<Sablon[]> {
  const adimlar = await s.sablonAdimlari(db, satirlar.map((x) => x.id));
  const tipler = new Map((await operasyonTipleri(db)).map((t) => [t.id, { id: t.id, kod: t.kod, ad: t.ad, aktif: t.aktif }]));
  return satirlar.map((x) => ({
    ...x,
    adimlar: adimlar.filter((a) => a.sablonId === x.id).map((a) => ({
      sira: a.sira, ad: a.ad, operasyonTipi: tipler.get(a.operasyonTipiId) ?? { id: a.operasyonTipiId, kod: '?', ad: 'Bilinmeyen tip', aktif: false },
    })),
  }));
}

export async function sablonListesi(db: Db): Promise<SablonlarCevabi> {
  return { sablonlar: await sablonlariKur(db, await s.sablonlar(db)) };
}

async function sablonGetir(db: Db, id: number): Promise<SablonCevabi> {
  const satir = (await s.sablonlar(db)).find((x) => x.id === id);
  if (!satir) throw bulunamadi('Şablon bulunamadı.');
  return { sablon: (await sablonlariKur(db, [satir]))[0]! };
}

// Pasif tipe yeni adım yazılmaz; şablonda zaten olan pasif tipli adım korunabilir (rota adımıyla aynı kural).
async function sablonAdimlariDenetle(db: Db, adimlar: readonly { operasyonTipiId: number }[], eskiTipler: ReadonlySet<number>): Promise<void> {
  const tipler = new Map((await operasyonTipleri(db)).map((t) => [t.id, t]));
  for (const [i, a] of adimlar.entries()) {
    const tip = tipler.get(a.operasyonTipiId);
    if (!tip) throw dogrulama('Operasyon tipi bulunamadı.', `adimlar.${i}.operasyonTipiId`);
    if (!tip.aktif && !eskiTipler.has(a.operasyonTipiId)) throw dogrulama('Bu operasyon tipi kullanıma kapalı.', `adimlar.${i}.operasyonTipiId`);
  }
}

async function adiKoru<T>(is: () => Promise<T>): Promise<T> {
  try {
    return await is();
  } catch (hata) {
    if (kisitIhlali(hata)?.iz.kisit === 'rota_sablonu_ad_tekil') throw cakisma(SABLON_ADI_KULLANILIYOR);
    throw hata;
  }
}

export async function sablonEkle(db: Db, g: { ad: string; adimlar: { operasyonTipiId: number; ad: string }[] }): Promise<SablonCevabi> {
  await sablonAdimlariDenetle(db, g.adimlar, new Set());
  const id = await adiKoru(() => s.sablonEkle(db, g.ad));
  await s.sablonAdimlariniYaz(db, id, g.adimlar);
  // İlk şablon kendiliğinden varsayılandır: "Standart rotadan başla" boşa düşmesin.
  if ((await s.varsayilanSablonId(db)) === null) await s.varsayilanYap(db, id);
  return sablonGetir(db, id);
}

export async function sablonKaydet(db: Db, id: number, g: { ad: string; surum: number; adimlar: { operasyonTipiId: number; ad: string }[] }): Promise<SablonCevabi> {
  const mevcut = await s.sablonKilitle(db, id);
  if (!mevcut) throw bulunamadi('Şablon bulunamadı.');
  if (mevcut.surum !== g.surum) throw eskiSurum();
  await sablonAdimlariDenetle(db, g.adimlar, new Set((await s.sablonAdimlari(db, [id])).map((a) => a.operasyonTipiId)));
  if (!(await adiKoru(() => s.sablonAdiYaz(db, id, g.ad, g.surum)))) throw eskiSurum();
  await s.sablonAdimlariniYaz(db, id, g.adimlar);
  return sablonGetir(db, id);
}

export async function sablonuVarsayilanYap(db: Db, id: number, surum: number): Promise<SablonCevabi> {
  const mevcut = await s.sablonKilitle(db, id);
  if (!mevcut) throw bulunamadi('Şablon bulunamadı.');
  if (mevcut.surum !== surum) throw eskiSurum();
  await s.varsayilanYap(db, id);
  return sablonGetir(db, id);
}

// Varsayılan şablon silinmez: önce başka bir şablon varsayılan yapılır. Şablondan açılmış rotalar etkilenmez (kopya alınır).
export async function sablonuSil(db: Db, id: number, surum: number): Promise<void> {
  const mevcut = await s.sablonKilitle(db, id);
  if (!mevcut) throw bulunamadi('Şablon bulunamadı.');
  if (mevcut.surum !== surum) throw eskiSurum();
  if (mevcut.varsayilan) throw gecersiz('Varsayılan şablon silinmez; önce başka bir şablonu varsayılan yapın.');
  await s.sablonSil(db, id);
}
