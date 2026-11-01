import { kisitIhlali } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi, bagimliKayit, bulunamadi, cakisma, gecersiz } from '#cekirdek/hata.ts';
import type {
  Alan, AramaSonucu, Bulgu, FabrikaCevabi, FabrikaKaydi, FabrikaKayitCevabi, GozlerCevabi, Kroki, KrokiHizalama, KrokiKaydi, MerkezKrokileriCevabi, IhlalAyrintisi, IstasyonModeli, IstasyonYeri, MakineYeri, MerkezModeli, MerkezModeliBaglaCevabi, MerkezModeliBaglaKaydi, MerkezModelleriCevabi, MalzemeModelleriCevabi, YerlesmemisIstasyonlarCevabi, KayitCevabi, Model, ModelAyari, ModelKaydi, KalemGorunumu, KalemGorunumuKaydi, KalemMalzemesi, MakineYeriKaydi, GozKalemi, GozKalemiKaydi, Raf, RafKaydi,
  HucreAtaGovdesi, RotaCevabi, RotaSorgusu, Salon, SalonKaydi, SalonOzeti, SurumCakismasi, YerlesimCevabi, YerlesimKaydi,
} from '#paylasilan/sozlesme/atolye.ts';
import { ARAMA_AZAMI_SONUC, MERKEZ_MODEL_TURLERI } from '#paylasilan/sozlesme/atolye.ts';
import { MODEL_AZAMI_BAYT, MODEL_PARCA_BAYT, parcaAnahtari } from '#paylasilan/atolye-sabitleri.ts';
import type { IkiliCevap } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kaydaBagla, kaydaBagliBelgeler, kayitlaraBagliBelgeler, kayittakiBelgeDosyasi, kayittanKaldir, yayindakiBelgeDosyasi, yayindakiBelgeler } from '../belge-merkezi/disari.ts';
import type { BagliBelge } from '../belge-merkezi/disari.ts';
import { istasyonGetir, istasyonlar as istasyonListesi, aktifMakineler, makineGetir } from '../istasyonlar/disari.ts';
import type { Makine } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { malzemeNoKoddan, malzemeOzetleri } from '../malzemeler/disari.ts';
import { acikEmirler } from '../uretim-emirleri/disari.ts';
import {
  GOZ_SAYFA_BOYU, ODA_TURLERI, adresCoz, bolumCakismalari, fabrikaDenetle, fabrikaKonumuYuvarla, krokiHizalamaYuvarla, pdfBasligiGecerliMi, gozDolulukIhlali, aramaSirala, base64Coz, donusIndirge, beklenenParcaBoyu, duvarKutusu, glbBasligiGecerliMi, gozAdresi, hucreAdi,
  hucreKutusu, izgaraAdlari, modelParcaSayisi, odaDuvarlari, rafKutusu, rotaBul, rotaNoktasiIhlali, surumGuncelMi, yerlesimiDenetle, yerlesimiYuvarla,
} from './kurallar.ts';
import type { AramaAdayi, FabrikaBolumu, Kutu, MakineBilgisi, SalonOlcusu } from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { AlanSatiri, GozKalemiSatiri, KrokiKapsami, KrokiSatiri, ModelSatiri, RafSatiri, SalonSatiri } from './sorgular.ts';

const SALON_YOK = 'Salon bulunamadı.';
const RAF_YOK = 'Raf bulunamadı.';

// Ölçüler numeric metindir; geometri hesabı için sayıya çevrilir, cevaba yine metin döner.
const sayi = (m: string): number => Number(m);
const olcusu = (s: SalonSatiri): SalonOlcusu => ({ genislik: sayi(s.genislik), derinlik: sayi(s.derinlik), hucreBoyu: sayi(s.hucreBoyu) });

const ozet = (s: SalonSatiri): SalonOzeti => ({
  id: s.id, kod: s.kod, ad: s.ad, genislik: s.genislik, derinlik: s.derinlik, hucreBoyu: s.hucreBoyu, surum: s.surum,
  fabrika: { x: s.fabrikaX, z: s.fabrikaZ, donus: s.fabrikaDonus },
});

export async function salonlar(db: Db): Promise<SalonOzeti[]> {
  return (await sorgular.salonlariListele(db)).map(ozet);
}

async function salonCevabi(db: Db, s: SalonSatiri): Promise<Salon> {
  const adlar = await kisiAdlari(db, [s.kaydedenKisiId]);
  return {
    ...ozet(s),
    giris: s.girisX === null || s.girisZ === null ? null : { x: s.girisX, z: s.girisZ },
    kaydeden: { id: s.kaydedenKisiId, ad: adlar.get(s.kaydedenKisiId) ?? null },
    kaydedildi: s.kaydedildi,
    ...izgaraAdlari(olcusu(s)),
  };
}

const rafCevabi = (r: RafSatiri, o: SalonOlcusu): Raf => ({
  id: r.id, kod: r.kod, ad: r.ad, tur: r.tur, bolmeSayisi: r.bolmeSayisi, katSayisi: r.katSayisi, gozSayisi: r.gozSayisi,
  bolmeGenisligi: r.bolmeGenisligi, derinlik: r.derinlik, yukseklik: r.yukseklik, x: r.x, z: r.z, donus: r.donus,
  aktif: r.aktif, genislik: r.genislik, hucre: hucreAdi(sayi(r.x), sayi(r.z), o),
  katYukseklikleri: r.katYukseklikleri, gozGenisligi: r.gozGenisligi, gozDerinligi: r.gozDerinligi,
});

const alanCevabi = (a: AlanSatiri, o: SalonOlcusu): Alan => ({
  id: a.id, tur: a.tur, ad: a.ad, x: a.x, z: a.z, donus: a.donus, genislik: a.genislik, derinlik: a.derinlik,
  kapi: a.kapiKenari === null || a.kapiOfseti === null || a.kapiGenisligi === null
    ? null
    : { kenar: a.kapiKenari, ofset: a.kapiOfseti, genislik: a.kapiGenisligi },
  hucre: hucreAdi(sayi(a.x), sayi(a.z), o),
});

// Makineler: aktifler tek sorguda, listede olmayan (pasife alınmış ama yerleşik) makine tek tek; bulunmayan makine yoktur.
async function makineHaritasi(db: Db, gereken: readonly number[]): Promise<Map<number, Makine>> {
  const harita = new Map((await aktifMakineler(db)).map((m) => [m.id, m]));
  for (const id of new Set(gereken)) {
    if (harita.has(id)) continue;
    const m = await makineGetir(db, id);
    if (m) harita.set(id, m);
  }
  return harita;
}

const makineBilgisi = (m: Makine): MakineBilgisi => ({ id: m.id, kod: m.kod, aktif: m.aktif, istasyonId: m.istasyonId });

// Makine yeri gönderilmeyen kayıtta kayıtlı makine yerleri kalır; kurallar yine bütün yerleşimle denetlenir.
async function makineYerleriniTamamla(db: Db, salonId: number, k: YerlesimKaydi): Promise<YerlesimKaydi & { makineYerleri: MakineYeriKaydi[] }> {
  if (k.makineYerleri !== undefined) return { ...k, makineYerleri: k.makineYerleri };
  const kayitli = await sorgular.makineYerleri(db, salonId);
  return {
    ...k,
    makineYerleri: kayitli.map((y) => ({
      makineId: y.makineId, x: sayi(y.x), z: sayi(y.z), donus: sayi(y.donus), genislik: sayi(y.genislik), derinlik: sayi(y.derinlik), modelId: y.modelId,
    })),
  };
}

export async function yerlesim(db: Db, salonId: number): Promise<YerlesimCevabi> {
  const s = await sorgular.salonBul(db, salonId);
  if (s === null) throw bulunamadi(SALON_YOK);
  const o = olcusu(s);
  const yerler = await sorgular.istasyonYerleri(db, salonId);
  const makineYerleri = await sorgular.makineYerleri(db, salonId);
  const modelIdleri = [...new Set([...yerler, ...makineYerleri].flatMap((y) => (y.modelId === null ? [] : [y.modelId])))];
  const istasyonlar = await istasyonListesi(db, { pasiflerDahil: true });
  const makineler = await aktifMakineler(db);
  const yerliMakineler = await makineHaritasi(db, makineYerleri.map((y) => y.makineId));
  const raflar = await sorgular.raflar(db, salonId);
  const alanlar = await sorgular.alanlar(db, salonId);
  const duvarlar = await sorgular.duvarlar(db, salonId);
  const gecisler = await sorgular.gecisler(db, salonId);
  const modeller = modelIdleri.length ? await sorgular.modelleriBul(db, modelIdleri) : [] as ModelSatiri[];
  const modelHaritasi = new Map(modeller.map((m) => [m.id, istasyonModeli(m)]));
  const merkezBaglari = await kayitlaraBagliBelgeler(db, 'istasyonlar', yerler.map((y) => y.istasyonId));
  const istasyonHaritasi = new Map(istasyonlar.map((i) => [i.id, i]));
  const istasyonYerleri: IstasyonYeri[] = yerler.flatMap((y) => {
    const i = istasyonHaritasi.get(y.istasyonId);
    // Yabancı anahtar istasyonun silinmesini durdurur; yine de bulunamayan istasyon uydurulmaz, gösterilmez.
    if (!i) return [];
    return [{
      istasyonId: y.istasyonId, kod: i.kod, ad: i.ad, tip: i.tip, aktif: i.aktif,
      x: y.x, z: y.z, donus: y.donus, genislik: y.genislik, derinlik: y.derinlik,
      hucre: hucreAdi(sayi(y.x), sayi(y.z), o),
      makineler: makineler
        .filter((m) => m.istasyonId === y.istasyonId)
        .map((m) => ({ id: m.id, kod: m.kod, ad: m.ad, tur: m.tur, markaModel: m.markaModel })),
      model: y.modelId === null ? null : modelHaritasi.get(y.modelId) ?? null,
      merkezModeli: merkezModeliSec(merkezBaglari.get(y.istasyonId) ?? []),
    }];
  });
  const makineYerleriCevabi: MakineYeri[] = makineYerleri.flatMap((y) => {
    const m = yerliMakineler.get(y.makineId);
    if (!m) return [];
    const i = m.istasyonId === null ? undefined : istasyonHaritasi.get(m.istasyonId);
    return [{
      makineId: m.id, kod: m.kod, ad: m.ad, tur: m.tur, markaModel: m.markaModel, aktif: m.aktif,
      istasyon: i ? { id: i.id, kod: i.kod, ad: i.ad, tip: i.tip, aktif: i.aktif } : null,
      x: y.x, z: y.z, donus: y.donus, genislik: y.genislik, derinlik: y.derinlik,
      hucre: hucreAdi(sayi(y.x), sayi(y.z), o),
      model: y.modelId === null ? null : modelHaritasi.get(y.modelId) ?? null,
    }];
  });
  return {
    salon: await salonCevabi(db, s),
    istasyonYerleri: istasyonYerleri.sort((a, b) => a.kod.localeCompare(b.kod, 'tr')),
    makineYerleri: makineYerleriCevabi.sort((a, b) => a.kod.localeCompare(b.kod, 'tr')),
    raflar: raflar.map((r) => rafCevabi(r, o)),
    alanlar: alanlar.map((a) => alanCevabi(a, o)),
    duvarlar,
    gecisler: gecisler.map(({ salonId: _s, ...g }) => g),
  };
}

const MAKINE_BASKA_BOLUMDE = 'Yerleştirilen makinelerden biri az önce başka bölüme yerleştirildi. Yerleşimi yenileyip yeniden deneyin.';
const RAF_KODU_KULLANILIYOR = (kodlar: string) => `Raf kodu başka salonda kullanılıyor: ${kodlar}.`;
const SALON_KODU_KULLANILIYOR = 'Bu salon kodu kullanılıyor.';

export async function salonEkle(db: Db, kayit: SalonKaydi, kisiId: number): Promise<SalonOzeti> {
  try {
    const s = await sorgular.salonEkle(db, kayit, kisiId);
    if (s === null) throw new Error('Salon eklenemedi');
    return ozet(s);
  } catch (hata) {
    if (kisitIhlali(hata)?.iz.kisit === 'atolye_salon_kod_tek') throw cakisma(SALON_KODU_KULLANILIYOR);
    throw hata;
  }
}

async function surumCakismasi(db: Db, s: SalonSatiri): Promise<UygulamaHatasi> {
  const ad = (await kisiAdlari(db, [s.kaydedenKisiId])).get(s.kaydedenKisiId) ?? null;
  const ayrinti: SurumCakismasi = { guncelSurum: s.surum, kaydeden: { id: s.kaydedenKisiId, ad }, kaydedildi: s.kaydedildi };
  return cakisma('Yerleşimi siz açtıktan sonra başkası kaydetti. Güncel yerleşimi açıp değişikliğinizi yeniden yapın.', ayrinti);
}

export async function yerlesimKaydet(db: Db, salonId: number, gelen: YerlesimKaydi, kisiId: number): Promise<KayitCevabi> {
  const s = await sorgular.salonKilitle(db, salonId);
  if (s === null) throw bulunamadi(SALON_YOK);
  // ATL-16: düzenleyicinin açtığı sürüm güncel değilse yazılmaz.
  if (!surumGuncelMi(gelen.surum, s.surum)) throw await surumCakismasi(db, s);

  const kayit = await makineYerleriniTamamla(db, salonId, await gecisleriTamamla(db, salonId, yerlesimiYuvarla(gelen)));
  const istasyonIdleri = kayit.istasyonYerleri.map((y) => y.istasyonId);
  const makineIdleri = kayit.makineYerleri.map((y) => y.makineId);
  const modelIdleri = [...new Set([...kayit.istasyonYerleri, ...kayit.makineYerleri].flatMap((y) => (y.modelId === null ? [] : [y.modelId])))];
  const makineler = await makineHaritasi(db, makineIdleri);
  const yerlesikMakineler = await sorgular.makineYerleri(db, salonId);
  const baskaSalondakiMakineler = (await sorgular.makineYerleri(db, null)).filter((y) => y.salonId !== salonId && makineIdleri.includes(y.makineId));
  const salonKodlari = new Map((await sorgular.salonlariListele(db)).map((x) => [x.id, x.kod]));
  const istasyonlar = await istasyonListesi(db, { pasiflerDahil: true });
  const yerlesikler = await sorgular.istasyonYerleri(db, salonId);
  const baskaSalondakiler = await sorgular.baskaSalondakiYerler(db, salonId, istasyonIdleri);
  const salonRaflari = await sorgular.raflar(db, salonId);
  const baskaRafKodlari = await sorgular.baskaSalondakiRafKodlari(db, salonId, kayit.raflar.map((r) => r.kod));
  const modeller = modelIdleri.length ? await sorgular.modelleriBul(db, modelIdleri) : [] as ModelSatiri[];
  if (baskaRafKodlari.length > 0) throw cakisma(RAF_KODU_KULLANILIYOR(baskaRafKodlari.join(', ')));
  const denetim = yerlesimiDenetle(kayit, {
    istasyonlar: new Map(istasyonlar.map((i) => [i.id, { id: i.id, kod: i.kod, aktif: i.aktif }])),
    yerlesikIstasyonlar: new Set(yerlesikler.map((y) => y.istasyonId)),
    baskaSalondakiler: new Map(baskaSalondakiler.map((b) => [b.istasyonId, b.salonKod])),
    salonRaflari: salonRaflari.map((r) => ({ id: r.id, kod: r.kod })),
    modeller: new Map(modeller.map((m) => [m.id, m.tamam])),
    makineler: new Map([...makineler].map(([id, m]) => [id, makineBilgisi(m)])),
    yerlesikMakineler: new Set(yerlesikMakineler.map((y) => y.makineId)),
    baskaSalondakiMakineler: new Map(baskaSalondakiMakineler.map((y) => [y.makineId, salonKodlari.get(y.salonId) ?? '?'])),
  });
  // ATL-31: bölüm büyüyünce komşu bölüme binmez.
  const digerleri = (await sorgular.salonlariListele(db)).filter((x) => x.id !== salonId).map(fabrikaBolumu);
  const cakismalar = bolumCakismalari([{ ...fabrikaBolumu(s), olcu: { genislik: kayit.salon.genislik, derinlik: kayit.salon.derinlik } }], digerleri);
  const ihlaller = [...denetim.ihlaller, ...cakismalar];
  if (ihlaller.length > 0) {
    const ayrinti: IhlalAyrintisi = { ihlaller };
    throw new UygulamaHatasi('GECERSIZ', 'Yerleşim kaydedilemedi: kurala uymayan öğeler var.', { ayrinti });
  }

  alanKimlikleriTek([kayit.alanlar]);
  await yazimHatalari(async () => {
    const yeni = await sorgular.salonGuncelle(db, salonId, s.surum, kayit.salon, kisiId);
    if (yeni === null) throw await surumCakismasi(db, (await sorgular.salonBul(db, salonId)) ?? s);
    // ATL-04: ön denetimden sonra başka salon aynı istasyonu yerleştirdiyse satır yazılmaz; sessiz geçilmez.
    if ((await sorgular.istasyonYerleriniYaz(db, salonId, kayit.istasyonYerleri)) !== kayit.istasyonYerleri.length) {
      throw cakisma('Yerleştirilen istasyonlardan biri az önce başka bölüme yerleştirildi. Yerleşimi yenileyip yeniden deneyin.');
    }
    if ((await sorgular.makineYerleriniYaz(db, salonId, kayit.makineYerleri)) !== kayit.makineYerleri.length) {
      throw cakisma(MAKINE_BASKA_BOLUMDE);
    }
    await bolumIcerigiYaz(db, salonId, kayit, new Map(salonRaflari.map((r) => [r.id, r])));
  });
  return { ...(await yerlesim(db, salonId)), uyarilar: denetim.uyarilar };
}

// Yalnız raf listesi gelen kayıt (Stok Merkezi > Depo, kart #1304): bölümün ölçüsü, girişi, istasyon ve makine yerleri,
// alanları, duvarları ve geçişleri kayıtlı haliyle kalır; kurallar ve sürüm denetimi tam yerleşim kaydıyla aynıdır.
// Bölümün kayıtlı yerleşimi kayıt biçiminde; makine yerleri ve geçişler verilmez (kayıtta olduğu gibi kalır).
async function kayitliYerlesim(db: Db, s: SalonSatiri, surum: number): Promise<YerlesimKaydi> {
  const salonId = s.id;
  return {
    surum,
    salon: {
      kod: s.kod, ad: s.ad, genislik: sayi(s.genislik), derinlik: sayi(s.derinlik), hucreBoyu: sayi(s.hucreBoyu),
      giris: s.girisX === null || s.girisZ === null ? null : { x: sayi(s.girisX), z: sayi(s.girisZ) },
    },
    istasyonYerleri: (await sorgular.istasyonYerleri(db, salonId)).map((y) => ({
      istasyonId: y.istasyonId, x: sayi(y.x), z: sayi(y.z), donus: sayi(y.donus), genislik: sayi(y.genislik), derinlik: sayi(y.derinlik), modelId: y.modelId,
    })),
    raflar: (await sorgular.raflar(db, salonId)).map((r) => ({
      id: r.id, kod: r.kod, ad: r.ad, tur: r.tur, bolmeSayisi: r.bolmeSayisi, katSayisi: r.katSayisi, gozSayisi: r.gozSayisi,
      bolmeGenisligi: sayi(r.bolmeGenisligi), derinlik: sayi(r.derinlik), yukseklik: sayi(r.yukseklik), x: sayi(r.x), z: sayi(r.z), donus: sayi(r.donus),
      aktif: r.aktif, katYukseklikleri: r.katYukseklikleri?.map(sayi) ?? null, gozGenisligi: r.gozGenisligi === null ? null : sayi(r.gozGenisligi),
      gozDerinligi: r.gozDerinligi === null ? null : sayi(r.gozDerinligi),
    })),
    alanlar: (await sorgular.alanlar(db, salonId)).map((a) => ({
      id: a.id, tur: a.tur, ad: a.ad, x: sayi(a.x), z: sayi(a.z), donus: sayi(a.donus), genislik: sayi(a.genislik), derinlik: sayi(a.derinlik),
      kapi: a.kapiKenari === null || a.kapiOfseti === null || a.kapiGenisligi === null ? null : { kenar: a.kapiKenari, ofset: sayi(a.kapiOfseti), genislik: sayi(a.kapiGenisligi) },
    })),
    duvarlar: (await sorgular.duvarlar(db, salonId)).map((d) => ({
      basX: sayi(d.basX), basZ: sayi(d.basZ), sonX: sayi(d.sonX), sonZ: sayi(d.sonZ), kalinlik: sayi(d.kalinlik), cam: d.cam,
    })),
  };
}

export async function rafYerlesimiKaydet(db: Db, salonId: number, gelen: { surum: number; raflar: RafKaydi[] }, kisiId: number): Promise<KayitCevabi> {
  const s = await sorgular.salonBul(db, salonId);
  if (s === null) throw bulunamadi(SALON_YOK);
  return yerlesimKaydet(db, salonId, { ...(await kayitliYerlesim(db, s, gelen.surum)), raflar: gelen.raflar }, kisiId);
}

// ATL-41 (kart #1304): kareye alan türü ya da istasyon atanır; geri kalan yerleşim olduğu gibi kalır ve bütün kurallarla yine
// denetlenir (çakışma, sınır, sürüm).
export async function hucreAta(db: Db, salonId: number, g: HucreAtaGovdesi, kisiId: number): Promise<KayitCevabi> {
  const s = await sorgular.salonBul(db, salonId);
  if (s === null) throw bulunamadi(SALON_YOK);
  const o = olcusu(s);
  const kare = hucreKutusu(g.hucre, o);
  if (kare === null) throw gecersiz(`${g.hucre} bu bölümün ızgarasında yok.`);
  const kayit = await kayitliYerlesim(db, s, g.surum);
  const kayan = (k: { x: number; z: number }) => hucreAdi(k.x, k.z, o) === g.hucre;
  if (g.atama.tur === 'alan') {
    const { alanTuru, ad } = g.atama;
    const var_ = kayit.alanlar.find(kayan);
    const alanlar = var_
      ? kayit.alanlar.map((a) => (a === var_ ? { ...a, tur: alanTuru, ad: ad ?? a.ad } : a))
      : [...kayit.alanlar, { id: null, tur: alanTuru, ad: ad ?? `${ALAN_TUR_ADI[alanTuru]} ${g.hucre}`, x: kare.x, z: kare.z, donus: 0,
        genislik: Math.max(0.2, kare.genislik - 0.2), derinlik: Math.max(0.2, kare.derinlik - 0.2), kapi: null }];
    return yerlesimKaydet(db, salonId, { ...kayit, alanlar }, kisiId);
  }
  const { istasyonId } = g.atama;
  if (!(await istasyonGetir(db, istasyonId))) throw bulunamadi('İstasyon bulunamadı.');
  const baska = await sorgular.baskaSalondakiYerler(db, salonId, [istasyonId]);
  if (baska.length > 0) throw gecersiz(`İstasyon ${baska[0]!.salonKod} bölümünde yerleşik; Fabrika Haritası'nda taşıyın.`);
  const var_ = kayit.istasyonYerleri.find((y) => y.istasyonId === istasyonId);
  const boy = Math.min(3, Math.max(0.2, Math.min(kare.genislik, kare.derinlik) - 0.2));
  const istasyonYerleri = var_
    ? kayit.istasyonYerleri.map((y) => (y === var_ ? { ...y, x: kare.x, z: kare.z } : y))
    : [...kayit.istasyonYerleri, { istasyonId, x: kare.x, z: kare.z, donus: 0, genislik: boy, derinlik: boy, modelId: null }];
  return yerlesimKaydet(db, salonId, { ...kayit, istasyonYerleri }, kisiId);
}

// Stok Merkezi'nin zemin ızgarası (kart #1304): bölümlerin harf-numara kareleri ve karelerdeki öğeler. Stok konumu bu öğelere
// (göz rafına, alana, istasyona) bağlı olduğundan her konumun yerdeki karesi buradan bulunur.
export interface ZeminNesnesi { tur: 'raf' | 'istasyon' | 'makine' | 'alan'; id: number; kod: string | null; ad: string; altTur: string; hucre: string }
export interface ZeminBolumu { salonId: number; kod: string; ad: string; surum: number; sutunlar: string[]; satirlar: string[]; nesneler: ZeminNesnesi[] }
export async function zemin(db: Db): Promise<{ bolumler: ZeminBolumu[]; istasyonlar: { id: number; kod: string; ad: string; tip: string; salonId: number | null }[] }> {
  const istasyonlar = await istasyonListesi(db, { pasiflerDahil: true });
  const istasyonHaritasi = new Map(istasyonlar.map((i) => [i.id, i]));
  const tumYerler = await sorgular.istasyonYerleri(db, null);
  const yerSalonu = new Map(tumYerler.map((y) => [y.istasyonId, y.salonId]));
  const bolumler: ZeminBolumu[] = [];
  for (const s of await sorgular.salonlariListele(db)) {
    const o = olcusu(s);
    const hucre = (x: string, z: string) => hucreAdi(sayi(x), sayi(z), o);
    const makineYerleri = await sorgular.makineYerleri(db, s.id);
    const makineler = await makineHaritasi(db, makineYerleri.map((y) => y.makineId));
    const nesneler: ZeminNesnesi[] = [
      ...(await sorgular.raflar(db, s.id)).map((r): ZeminNesnesi => ({ tur: 'raf', id: r.id, kod: r.kod, ad: r.ad, altTur: r.tur, hucre: hucre(r.x, r.z) })),
      ...tumYerler.filter((y) => y.salonId === s.id).flatMap((y): ZeminNesnesi[] => {
        const i = istasyonHaritasi.get(y.istasyonId);
        return i ? [{ tur: 'istasyon', id: i.id, kod: i.kod, ad: i.ad, altTur: i.tip, hucre: hucre(y.x, y.z) }] : [];
      }),
      ...makineYerleri.flatMap((y): ZeminNesnesi[] => {
        const m = makineler.get(y.makineId);
        const tip = m?.istasyonId == null ? 'talasli' : istasyonHaritasi.get(m.istasyonId)?.tip ?? 'talasli';
        return m ? [{ tur: 'makine', id: m.id, kod: m.kod, ad: m.ad, altTur: tip, hucre: hucre(y.x, y.z) }] : [];
      }),
      ...(await sorgular.alanlar(db, s.id)).map((a): ZeminNesnesi => ({ tur: 'alan', id: a.id, kod: null, ad: a.ad, altTur: a.tur, hucre: hucre(a.x, a.z) })),
    ];
    bolumler.push({ salonId: s.id, kod: s.kod, ad: s.ad, surum: s.surum, ...izgaraAdlari(o), nesneler });
  }
  return {
    bolumler,
    istasyonlar: istasyonlar.filter((i) => i.aktif).map((i) => ({ id: i.id, kod: i.kod, ad: i.ad, tip: i.tip, salonId: yerSalonu.get(i.id) ?? null })),
  };
}

// Alan kimliği kayıtta bir kez geçer (aynı satır iki kez güncellenmez).
function alanKimlikleriTek(listeler: readonly (readonly { id: number | null }[])[]): void {
  const idler = listeler.flatMap((l) => l.flatMap((a) => (a.id === null ? [] : [a.id])));
  if (new Set(idler).size !== idler.length) throw gecersiz('Bir alan kayıtta iki kez geçiyor.');
}

// Geçiş gönderilmeyen kayıtta kayıtlı geçişler kalır; bölüm küçülünce kenardan taşmadıkları yine denetlenir (ATL-34).
async function gecisleriTamamla(db: Db, salonId: number, k: YerlesimKaydi): Promise<YerlesimKaydi> {
  if (k.gecisler !== undefined) return k;
  const kayitli = await sorgular.gecisler(db, salonId);
  return { ...k, gecisler: kayitli.map((g) => ({ tur: g.tur, kenar: g.kenar, ofset: sayi(g.ofset), genislik: sayi(g.genislik) })) };
}

const fabrikaBolumu = (s: SalonSatiri): FabrikaBolumu => ({
  salonId: s.id, kod: s.kod, olcu: { genislik: sayi(s.genislik), derinlik: sayi(s.derinlik) },
  konum: { x: sayi(s.fabrikaX), z: sayi(s.fabrikaZ), donus: sayi(s.fabrikaDonus) },
});

// Kısıt ihlalleri kullanıcı iletisine çevrilir (tek bölüm ve fabrika kaydı aynı).
async function yazimHatalari(yaz: () => Promise<void>): Promise<void> {
  try {
    await yaz();
  } catch (hata) {
    const ihlal = kisitIhlali(hata);
    if (ihlal?.iz.kisit === 'atolye_salon_kod_tek') throw cakisma(SALON_KODU_KULLANILIYOR);
    // ATL-12: rafın dışında kalan göze başka kayıt bağlıysa göz silinemez.
    if (ihlal?.hata.kod === 'BAGIMLI_KAYIT' && ihlal.iz.tablo === 'atolye_goz') {
      throw bagimliKayit('Raf küçültülemez: dışarıda kalacak gözlere bağlı kayıt var.');
    }
    throw hata;
  }
}

// Bölümün rafları (yeni, güncellenen, başka bölümden gelen), alanları ve duvarları yazılır. `onceki`: rafların
// kayıttan önceki hali (göz satırları yalnız yeni ya da ölçüsü değişen rafta eşitlenir).
async function bolumIcerigiYaz(
  db: Db, salonId: number, kayit: YerlesimKaydi, onceki: ReadonlyMap<number, RafSatiri>, korunanAlanlar: readonly number[] = [],
): Promise<void> {
  for (const r of kayit.raflar) {
    const eski = r.id === null ? undefined : onceki.get(r.id);
    if (r.id !== null && eski && eski.salonId !== salonId) await sorgular.rafBolumDegistir(db, r.id, salonId);
    const id = r.id === null ? await sorgular.rafEkle(db, salonId, r) : r.id;
    if (r.id !== null && !(await sorgular.rafGuncelle(db, salonId, r.id, r))) throw bulunamadi(RAF_YOK);
    if (!eski || eski.bolmeSayisi !== r.bolmeSayisi || eski.katSayisi !== r.katSayisi || eski.gozSayisi !== r.gozSayisi) {
      await sorgular.gozleriEsitle(db, id);
    }
  }
  await sorgular.alanlariYaz(db, salonId, kayit.alanlar, korunanAlanlar);
  await sorgular.duvarlariYaz(db, salonId, kayit.duvarlar);
  if (kayit.gecisler !== undefined) await sorgular.gecisleriYaz(db, salonId, kayit.gecisler);
}

// ---------- fabrika (ATL-31, ATL-32) ----------

export async function fabrika(db: Db): Promise<FabrikaCevabi> {
  const liste = await sorgular.salonlariListele(db);
  // Transaction tek bağlantıdır; sorgular sırayla gider (aynı istemcide eşzamanlı sorgu pg'de hatadır).
  const bolumler: YerlesimCevabi[] = [];
  for (const s of liste) bolumler.push(await yerlesim(db, s.id));
  return { bolumler };
}

// Değişen bölümler tek transaction'da: her bölüm kendi sürümüyle (eski sürüm 409), bölüm içi kurallar her bölümde,
// bölümler arası kurallar birlikte denetlenir. İstasyon yeri ve raf bölümler arasında taşınabilir.
export async function fabrikaKaydet(db: Db, k: FabrikaKaydi, kisiId: number): Promise<FabrikaKayitCevabi> {
  const idler = k.bolumler.map((b) => b.salonId);
  if (new Set(idler).size !== idler.length) throw gecersiz('Bir bölüm kayıtta iki kez geçiyor.');
  const kilitli = await sorgular.salonlariKilitle(db, idler);
  if (kilitli.length !== idler.length) throw bulunamadi(SALON_YOK);
  const satirlar = new Map(kilitli.map((s) => [s.id, s]));
  for (const b of k.bolumler) {
    const s = satirlar.get(b.salonId);
    if (s && !surumGuncelMi(b.yerlesim.surum, s.surum)) throw await surumCakismasi(db, s);
  }
  const kayitlar: { salonId: number; konum: ReturnType<typeof fabrikaKonumuYuvarla>; kayit: Awaited<ReturnType<typeof makineYerleriniTamamla>> }[] = [];
  for (const b of k.bolumler) {
    const kayit = await makineYerleriniTamamla(db, b.salonId, await gecisleriTamamla(db, b.salonId, yerlesimiYuvarla(b.yerlesim)));
    kayitlar.push({ salonId: b.salonId, konum: fabrikaKonumuYuvarla(b.fabrika), kayit });
  }
  const kayitta = new Set(idler);
  const modelIdleri = [...new Set(kayitlar.flatMap((x) => [...x.kayit.istasyonYerleri, ...x.kayit.makineYerleri].flatMap((y) => (y.modelId === null ? [] : [y.modelId]))))];
  const tumMakineYerleri = await sorgular.makineYerleri(db, null);
  const makineler = await makineHaritasi(db, kayitlar.flatMap((x) => x.kayit.makineYerleri.map((y) => y.makineId)));
  const istasyonlar = await istasyonListesi(db, { pasiflerDahil: true });
  const tumYerler = await sorgular.istasyonYerleri(db, null);
  const tumRaflar = await sorgular.raflar(db, null);
  const tumSalonlar = await sorgular.salonlariListele(db);
  const modeller = modelIdleri.length ? await sorgular.modelleriBul(db, modelIdleri) : [] as ModelSatiri[];
  const salonKodu = new Map(tumSalonlar.map((s) => [s.id, s.kod]));
  const kayittakiRaflar = new Map(tumRaflar.filter((r) => kayitta.has(r.salonId)).map((r) => [r.id, { salonId: r.salonId, kod: r.kod }]));
  const ihlaller: Bulgu[] = fabrikaDenetle(
    kayitlar.map(({ salonId, konum, kayit }) => ({
      salonId, kod: kayit.salon.kod, olcu: { genislik: kayit.salon.genislik, derinlik: kayit.salon.derinlik }, konum,
      istasyonlar: kayit.istasyonYerleri.map((y) => y.istasyonId), makineler: kayit.makineYerleri.map((y) => y.makineId),
      raflar: kayit.raflar.map((r) => ({ id: r.id, kod: r.kod })),
    })),
    {
      kayittakiRaflar,
      disaridakiRafKodlari: new Set(tumRaflar.filter((r) => !kayitta.has(r.salonId)).map((r) => r.kod)),
      disaridakiIstasyonlar: new Map(tumYerler.filter((y) => !kayitta.has(y.salonId)).map((y) => [y.istasyonId, salonKodu.get(y.salonId) ?? '?'])),
      disaridakiMakineler: new Map(tumMakineYerleri.filter((y) => !kayitta.has(y.salonId)).map((y) => [y.makineId, salonKodu.get(y.salonId) ?? '?'])),
      digerBolumler: tumSalonlar.filter((s) => !kayitta.has(s.id)).map(fabrikaBolumu),
    },
  );
  const uyarilar: Bulgu[] = [];
  const istasyonHaritasi = new Map(istasyonlar.map((i) => [i.id, { id: i.id, kod: i.kod, aktif: i.aktif }]));
  const yerlesik = new Set(tumYerler.filter((y) => kayitta.has(y.salonId)).map((y) => y.istasyonId));
  const modelHaritasi = new Map(modeller.map((m) => [m.id, m.tamam]));
  const makineBilgileri = new Map([...makineler].map(([id, m]) => [id, makineBilgisi(m)]));
  const yerlesikMakine = new Set(tumMakineYerleri.filter((y) => kayitta.has(y.salonId)).map((y) => y.makineId));
  for (const { salonId, kayit } of kayitlar) {
    const buradakiler = new Set(kayit.raflar.flatMap((r) => (r.id === null ? [] : [r.id])));
    const d = yerlesimiDenetle(kayit, {
      istasyonlar: istasyonHaritasi,
      yerlesikIstasyonlar: yerlesik,
      // Bölümler arası istasyon ve raf kuralı yukarıda (ATL-32); burada bölüm içi kurallar.
      baskaSalondakiler: new Map(),
      salonRaflari: [...kayittakiRaflar].filter(([id]) => buradakiler.has(id)).map(([id, r]) => ({ id, kod: r.kod })),
      modeller: modelHaritasi,
      makineler: makineBilgileri,
      yerlesikMakineler: yerlesikMakine,
      baskaSalondakiMakineler: new Map(),
    });
    const onek = (b: Bulgu): Bulgu => ({ ...b, ogeler: b.ogeler.map((o) => `salon:${salonId}/${o}`) });
    ihlaller.push(...d.ihlaller.map(onek));
    uyarilar.push(...d.uyarilar.map(onek));
  }
  if (ihlaller.length > 0) {
    const ayrinti: IhlalAyrintisi = { ihlaller };
    throw new UygulamaHatasi('GECERSIZ', 'Fabrika yerleşimi kaydedilemedi: kurala uymayan öğeler var.', { ayrinti });
  }

  alanKimlikleriTek(kayitlar.map((x) => x.kayit.alanlar));
  const raflarOnce = new Map(tumRaflar.map((r) => [r.id, r]));
  await yazimHatalari(async () => {
    for (const { salonId, konum, kayit } of kayitlar) {
      const s = satirlar.get(salonId);
      if (!s) throw bulunamadi(SALON_YOK);
      if ((await sorgular.salonGuncelle(db, salonId, s.surum, kayit.salon, kisiId, konum)) === null) throw await surumCakismasi(db, s);
    }
    // İstasyon başka bölüme geçebilir: önce her bölümde kalmayanlar bırakılır, sonra yazılır.
    for (const { salonId, kayit } of kayitlar) await sorgular.istasyonYerleriniBirak(db, salonId, kayit.istasyonYerleri.map((y) => y.istasyonId));
    for (const { salonId, kayit } of kayitlar) {
      if ((await sorgular.istasyonYerleriniYaz(db, salonId, kayit.istasyonYerleri)) !== kayit.istasyonYerleri.length) {
        throw cakisma('Yerleştirilen istasyonlardan biri az önce başka bölüme yerleştirildi. Yerleşimi yenileyip yeniden deneyin.');
      }
    }
    for (const { salonId, kayit } of kayitlar) await sorgular.makineYerleriniBirak(db, salonId, kayit.makineYerleri.map((y) => y.makineId));
    for (const { salonId, kayit } of kayitlar) {
      if ((await sorgular.makineYerleriniYaz(db, salonId, kayit.makineYerleri)) !== kayit.makineYerleri.length) throw cakisma(MAKINE_BASKA_BOLUMDE);
    }
    // Alan başka bölüme geçebilir: bir bölümün silmesi öteki bölümün listesindeki alanı silmez.
    for (const { salonId, kayit } of kayitlar) {
      const korunan = kayitlar.filter((x) => x.salonId !== salonId).flatMap((x) => x.kayit.alanlar.flatMap((a) => (a.id === null ? [] : [a.id])));
      await bolumIcerigiYaz(db, salonId, kayit, raflarOnce, korunan);
    }
  });
  return { ...(await fabrika(db)), uyarilar };
}

export async function gozler(db: Db, rafId: number, sayfa: number, bolme: number | null = null): Promise<GozlerCevabi> {
  const r = await sorgular.rafBul(db, rafId);
  if (r === null) throw bulunamadi(RAF_YOK);
  const satirlar = await sorgular.gozSayfasi(db, rafId, GOZ_SAYFA_BOYU, (sayfa - 1) * GOZ_SAYFA_BOYU, bolme);
  const toplam = await sorgular.gozSayisi(db, rafId, bolme);
  return {
    raf: { id: r.id, kod: r.kod, ad: r.ad, aktif: r.aktif },
    satirlar: satirlar.map((g) => ({ id: g.id, adres: gozAdresi(r.kod, g.bolme, g.kat, g.goz), bolme: g.bolme, kat: g.kat, goz: g.goz })),
    toplam,
    sayfaBoyu: GOZ_SAYFA_BOYU,
  };
}

interface AramaKaydi extends AramaAdayi {
  salon: SalonSatiri;
  x: string;
  z: string;
}

const RAF_TUR_ADI: Record<RafSatiri['tur'], string> = { palet: 'Palet rafı', kucuk_parca: 'Küçük parça rafı', konsol: 'Konsol raf', zemin: 'Sac stok alanı' };
const ALAN_TUR_ADI: Record<AlanSatiri['tur'], string> = {
  yuruyus_yolu: 'Yürüyüş yolu', bolge: 'Bölge', karantina: 'Karantina', sevkiyat: 'Sevkiyat alanı', oda: 'Oda', cam_oda: 'Cam oda', palet: 'Palet yeri',
  kabul: 'Mal kabul alanı', uretim_cikisi: 'Üretim çıkış alanı', depo_zemini: 'Depo zemini', fason: 'Fason alanı', ara_alan: 'Ara alan (bekleme)', hurda: 'Hurda alanı',
};

// ATL-14, ATL-15: göz adresi, raf, istasyon ve alan aranır; sonuç salonu ve hücreyi taşır.
export async function arama(db: Db, metin: string, salonId: number | null): Promise<AramaSonucu[]> {
  const salonlarListesi = await sorgular.salonlariListele(db);
  const yerler = await sorgular.istasyonYerleri(db, salonId);
  const istasyonlar = await istasyonListesi(db, { pasiflerDahil: true });
  const raflar = await sorgular.raflar(db, salonId);
  const alanlar = await sorgular.alanlar(db, salonId);
  const salonHaritasi = new Map(salonlarListesi.map((s) => [s.id, s]));
  const istasyonHaritasi = new Map(istasyonlar.map((i) => [i.id, i]));
  const adaylar: AramaKaydi[] = [];

  const adres = adresCoz(metin);
  if (adres !== null && adres.bolme !== null) {
    const raf = await sorgular.rafKoduylaBul(db, adres.rafKodu);
    const salon = raf ? salonHaritasi.get(raf.salonId) : undefined;
    if (raf && salon && (salonId === null || raf.salonId === salonId)) {
      const bulunan = await sorgular.gozAra(db, raf.id, { bolme: adres.bolme, kat: adres.kat, goz: adres.goz }, ARAMA_AZAMI_SONUC);
      for (const g of bulunan) {
        const etiket = gozAdresi(raf.kod, g.bolme, g.kat, g.goz);
        adaylar.push({
          tur: 'goz', kimlik: g.id, etiket, ayrinti: `${raf.ad} · bölme ${g.bolme}, kat ${g.kat}, göz ${g.goz}`,
          anahtarlar: [etiket], aktif: raf.aktif, salon, x: raf.x, z: raf.z,
        });
      }
    }
  }
  for (const r of raflar) {
    const salon = salonHaritasi.get(r.salonId);
    if (salon) adaylar.push({ tur: 'raf', kimlik: r.id, etiket: r.kod, ayrinti: `${r.ad} · ${RAF_TUR_ADI[r.tur]}`, anahtarlar: [r.kod, r.ad], aktif: r.aktif, salon, x: r.x, z: r.z });
  }
  for (const y of yerler) {
    const i = istasyonHaritasi.get(y.istasyonId);
    const salon = salonHaritasi.get(y.salonId);
    if (i && salon) adaylar.push({ tur: 'istasyon', kimlik: i.id, etiket: i.kod, ayrinti: i.ad, anahtarlar: [i.kod, i.ad], aktif: i.aktif, salon, x: y.x, z: y.z });
  }
  for (const a of alanlar) {
    const salon = salonHaritasi.get(a.salonId);
    if (salon) adaylar.push({ tur: 'alan', kimlik: a.id, etiket: a.ad, ayrinti: ALAN_TUR_ADI[a.tur], anahtarlar: [a.ad], aktif: true, salon, x: a.x, z: a.z });
  }

  return aramaSirala(metin, adaylar).map((a) => ({
    tur: a.tur, kimlik: a.kimlik, etiket: a.etiket, ayrinti: a.ayrinti,
    salon: { id: a.salon.id, kod: a.salon.kod, ad: a.salon.ad },
    hucre: hucreAdi(sayi(a.x), sayi(a.z), olcusu(a.salon)),
    x: a.x, z: a.z,
  }));
}

// ATL-20: rota kayıtlı yerleşimin katı öğelerinden geçmez; yürüyüş yolunu yeğler.
export async function rota(db: Db, salonId: number, q: RotaSorgusu): Promise<RotaCevabi> {
  const s = await sorgular.salonBul(db, salonId);
  if (s === null) throw bulunamadi(SALON_YOK);
  const yerler = await sorgular.istasyonYerleri(db, salonId);
  const raflar = await sorgular.raflar(db, salonId);
  const alanlar = await sorgular.alanlar(db, salonId);
  const duvarlar = await sorgular.duvarlar(db, salonId);
  const kutu = (k: { x: string; z: string; donus: string; genislik: string; derinlik: string }): Kutu => ({
    x: sayi(k.x), z: sayi(k.z), donus: sayi(k.donus), genislik: sayi(k.genislik), derinlik: sayi(k.derinlik),
  });
  const alanKaydi = (a: AlanSatiri) => ({
    id: a.id, tur: a.tur, ad: a.ad, ...kutu(a),
    kapi: a.kapiKenari === null ? null : { kenar: a.kapiKenari, ofset: sayi(a.kapiOfseti ?? '0'), genislik: sayi(a.kapiGenisligi ?? '0') },
  });
  const engeller: Kutu[] = [
    ...yerler.map(kutu),
    ...raflar.map((r) => rafKutusu({
      bolmeSayisi: r.bolmeSayisi, bolmeGenisligi: sayi(r.bolmeGenisligi), derinlik: sayi(r.derinlik), x: sayi(r.x), z: sayi(r.z), donus: sayi(r.donus),
    })),
    ...alanlar.filter((a) => a.tur === 'palet').map(kutu),
    ...alanlar.filter((a) => ODA_TURLERI.includes(a.tur)).flatMap((a) => odaDuvarlari(alanKaydi(a))),
    ...duvarlar.map((d) => duvarKutusu({ basX: sayi(d.basX), basZ: sayi(d.basZ), sonX: sayi(d.sonX), sonZ: sayi(d.sonZ), kalinlik: sayi(d.kalinlik) })),
  ];
  const bas = q.basX !== undefined && q.basZ !== undefined
    ? { x: q.basX, z: q.basZ }
    : s.girisX !== null && s.girisZ !== null ? { x: sayi(s.girisX), z: sayi(s.girisZ) } : null;
  // Başlangıç yoksa (giriş tanımsız) rota çizilmez; uydurulmaz.
  if (bas === null) return { rota: null };
  const salon = olcusu(s);
  const disarida = rotaNoktasiIhlali({ x: q.hedefX, z: q.hedefZ }, salon, 'Hedef') ?? rotaNoktasiIhlali(bas, salon, 'Başlangıç');
  if (disarida) throw gecersiz(disarida);
  return {
    rota: rotaBul({
      salon,
      engeller,
      yollar: alanlar.filter((a) => a.tur === 'yuruyus_yolu').map(kutu),
      bas,
      hedef: { x: q.hedefX, z: q.hedefZ },
    }),
  };
}

// ---------- 3B model kütüphanesi (ATL-24..27) ----------

const MERKEZ_MODEL_TURU = new Set<string>(MERKEZ_MODEL_TURLERI);
const merkezTuruMu = (t: string | null): t is MerkezModeli['dosyaTuru'] => t !== null && MERKEZ_MODEL_TURU.has(t);
const MERKEZ_MODELI_YOK = 'Bu istasyonun Çizim Merkezi\'nde yayında 3B modeli yok.';

// İstasyonun Çizim Merkezi'ndeki modeli (kart #921): istasyona bağlı, yayında revizyonu olan, sahnede açılabilen türde
// 3B model belgesi. Birden çoksa en eski belge (küçük kimlik); IGES sahnede açılmadığından sayılmaz.
async function merkezModeli(db: Db, istasyonId: number): Promise<MerkezModeli | null> {
  return merkezModeliSec(await kaydaBagliBelgeler(db, 'istasyonlar', istasyonId));
}

function merkezModeliSec(bagli: readonly BagliBelge[]): MerkezModeli | null {
  let secilen: MerkezModeli | null = null;
  for (const b of bagli) {
    if (b.tur !== '3b-model' || b.harf === null || b.ozet === null || !merkezTuruMu(b.dosyaTuru)) continue;
    if (secilen === null || b.id < secilen.belgeId) secilen = { belgeId: b.id, ad: b.ad, harf: b.harf, ozet: b.ozet, dosyaTuru: b.dosyaTuru };
  }
  return secilen;
}

export async function merkezModelleri(db: Db): Promise<MerkezModelleriCevabi> {
  const belgeler = await yayindakiBelgeler(db, { tur: '3b-model' });
  const ids = (await istasyonListesi(db, { pasiflerDahil: false })).map((i) => i.id);
  const baglar = await kayitlaraBagliBelgeler(db, 'istasyonlar', ids);
  return {
    belgeler: belgeler.flatMap(({ id, ad, harf, ozet: o, dosyaTuru }) => (merkezTuruMu(dosyaTuru) ? [{ id, ad, harf, ozet: o, dosyaTuru }] : [])),
    istasyonlar: ids.flatMap((istasyonId) => {
      const m = merkezModeliSec(baglar.get(istasyonId) ?? []);
      return m === null ? [] : [{ istasyonId, merkezModeli: m }];
    }),
    taslaklar: ids.flatMap((istasyonId) => {
      const bagli = baglar.get(istasyonId) ?? [];
      if (merkezModeliSec(bagli) !== null) return [];
      const t = taslakModelSec(bagli);
      return t === null ? [] : [{ istasyonId, belgeId: t.id, ad: t.ad }];
    }),
  };
}

// Aktif ama hiçbir bölüme yerleşmemiş istasyonlar (kart #1296): ne istasyon yeri ne de ekipmanlarından birinin yeri var.
export async function yerlesmemisIstasyonlar(db: Db): Promise<YerlesmemisIstasyonlarCevabi> {
  const istasyonlar = await istasyonListesi(db, { pasiflerDahil: false });
  const yerlesik = new Set((await sorgular.istasyonYerleri(db, null)).map((y) => y.istasyonId));
  const makineYerleri = await sorgular.makineYerleri(db, null);
  const makineler = await makineHaritasi(db, makineYerleri.map((y) => y.makineId));
  for (const y of makineYerleri) {
    const istasyonId = makineler.get(y.makineId)?.istasyonId ?? null;
    if (istasyonId !== null) yerlesik.add(istasyonId);
  }
  const kalan = istasyonlar.filter((i) => !yerlesik.has(i.id));
  const baglar = await kayitlaraBagliBelgeler(db, 'istasyonlar', kalan.map((i) => i.id));
  return {
    istasyonlar: kalan.map((i) => {
      const bagli = baglar.get(i.id) ?? [];
      const yayinda = merkezModeliSec(bagli);
      const taslak = yayinda === null ? taslakModelSec(bagli) : null;
      const model = yayinda ? { ad: yayinda.ad, yayinda: true } : taslak ? { ad: taslak.ad, yayinda: false } : null;
      return { istasyonId: i.id, kod: i.kod, ad: i.ad, tip: i.tip, model };
    }),
  };
}

// Yayında revizyonu olmayan (yalnız taslak) 3B model bağı: haritada görünmez, "Eklenecek makineler"de nedeni yazar.
function taslakModelSec(bagli: readonly BagliBelge[]): BagliBelge | null {
  let secilen: BagliBelge | null = null;
  for (const b of bagli) if (b.tur === '3b-model' && b.harf === null && (secilen === null || b.id < secilen.id)) secilen = b;
  return secilen;
}

// Açık emirlerin malzemeleri: haritada makinede gösterilen ve dosyası verilebilen malzemeler yalnız bunlardır.
async function acikEmirMalzemeleri(db: Db): Promise<number[]> {
  return [...new Set((await acikEmirler(db)).flatMap((e) => (e.malzemeNo == null ? [] : [e.malzemeNo])))];
}

export async function malzemeModelleri(db: Db): Promise<MalzemeModelleriCevabi> {
  const nolar = await acikEmirMalzemeleri(db);
  const baglar = await kayitlaraBagliBelgeler(db, 'malzemeler', nolar);
  return {
    malzemeler: nolar.flatMap((malzemeNo) => {
      const m = merkezModeliSec(baglar.get(malzemeNo) ?? []);
      return m === null ? [] : [{ malzemeNo, merkezModeli: m }];
    }),
  };
}

// Dosya yalnız açık emrin malzemesi için verilir: harita, kendi gösterdiği kaydın belgesini kendi ucundan verir.
export async function malzemeModelDosyasi(db: Db, malzemeNo: number): Promise<IkiliCevap> {
  const acik = (await acikEmirMalzemeleri(db)).includes(malzemeNo);
  const m = acik ? merkezModeliSec(await kaydaBagliBelgeler(db, 'malzemeler', malzemeNo)) : null;
  const dosya = m === null ? null : await kayittakiBelgeDosyasi(db, 'malzemeler', malzemeNo, m.belgeId);
  if (dosya === null) throw bulunamadi('Bu malzemenin Çizim Merkezi\'nde yayında 3B modeli yok ya da açık emri yok.');
  return dosya;
}

// İstasyon başına tek merkez modeli: seçilen belge bağlanır, istasyonun öbür 3B model bağları kaldırılır. Bağ Çizim
// Merkezi'ndedir; atölye yalnız haritada yeri olan istasyonu bağlar ve bölümü kilitleyerek aynı anda iki seçimi sıraya koyar.
export async function merkezModeliBagla(db: Db, istasyonId: number, k: MerkezModeliBaglaKaydi, kullanici: Kullanici): Promise<MerkezModeliBaglaCevabi> {
  const yer = (await sorgular.istasyonYerleri(db, null)).find((y) => y.istasyonId === istasyonId);
  if (!yer || (await istasyonGetir(db, istasyonId)) === null) throw bulunamadi('İstasyon haritada yerleşik değil.');
  if ((await sorgular.salonKilitle(db, yer.salonId)) === null) throw bulunamadi(SALON_YOK);
  const simdiki = await merkezModeli(db, istasyonId);
  if ((simdiki?.belgeId ?? null) !== k.beklenen) {
    throw cakisma('İstasyonun modelini siz açtıktan sonra başkası değiştirdi. Yerleşimi yeniden açın.', { merkezModeli: simdiki });
  }
  if (k.belgeId !== null) {
    const kaynak = await yayindakiBelgeDosyasi(db, k.belgeId);
    if (kaynak === null) throw bulunamadi('Çizim Merkezi\'nde bu belgenin yayında revizyonu yok.');
    if (kaynak.tur !== '3b-model' || !merkezTuruMu(kaynak.dosyaTuru)) throw gecersiz('İstasyona yalnız STEP, STL ya da GLB 3B model belgesi bağlanır.');
  }
  const bagli = (await kaydaBagliBelgeler(db, 'istasyonlar', istasyonId)).filter((b) => b.tur === '3b-model');
  for (const b of bagli) if (b.id !== k.belgeId) await kayittanKaldir(db, b.id, 'istasyonlar', istasyonId);
  if (k.belgeId !== null && !bagli.some((b) => b.id === k.belgeId)) await kaydaBagla(db, kullanici, k.belgeId, 'istasyonlar', istasyonId);
  return { merkezModeli: await merkezModeli(db, istasyonId) };
}

// Dosya yalnız haritada yeri olan istasyon için verilir: atölye, kendi gösterdiği kaydın belgesini kendi ucundan verir.
export async function merkezModelDosyasi(db: Db, istasyonId: number): Promise<IkiliCevap> {
  const yerli = (await sorgular.istasyonYerleri(db, null)).some((y) => y.istasyonId === istasyonId);
  const m = yerli ? await merkezModeli(db, istasyonId) : null;
  const dosya = m === null ? null : await kayittakiBelgeDosyasi(db, 'istasyonlar', istasyonId, m.belgeId);
  if (dosya === null) throw bulunamadi(MERKEZ_MODELI_YOK);
  return dosya;
}

const MODEL_YOK = 'Model bulunamadı.';

const istasyonModeli = (m: ModelSatiri): IstasyonModeli => ({
  id: m.id, ad: m.ad, birim: m.birim, yukari: m.yukari, donus: m.donus, sigdir: m.sigdir, boyutBayt: m.boyutBayt, parcaSayisi: m.parcaSayisi,
});

async function modelCevaplari(db: Db, satirlar: ModelSatiri[]): Promise<Model[]> {
  const adlar = await kisiAdlari(db, satirlar.map((m) => m.kaydedenKisiId));
  return satirlar.map(({ kaydedenKisiId, ...m }) => ({ ...m, kaydeden: { id: kaydedenKisiId, ad: adlar.get(kaydedenKisiId) ?? null } }));
}

async function modelCevabi(db: Db, id: number): Promise<Model> {
  const m = await sorgular.modelBul(db, id);
  if (m === null) throw bulunamadi(MODEL_YOK);
  const [c] = await modelCevaplari(db, [m]);
  if (!c) throw bulunamadi(MODEL_YOK);
  return c;
}

export async function modeller(db: Db): Promise<Model[]> {
  return modelCevaplari(db, await sorgular.modelleriListele(db));
}

// Yükleme başlar: dosyanın boyu, özeti ve üçgen sayısı bildirilir; parça sayısı boydan hesaplanır.
export async function modelYuklemeBaslat(db: Db, k: ModelKaydi, kisiId: number): Promise<Model> {
  const id = await sorgular.modelEkle(db, k, modelParcaSayisi(k.boyutBayt), kisiId);
  return modelCevabi(db, id);
}

// ATL-25: parça sırası ve boyu dosyanın boyundan bellidir; ATL-26: tamamlanmış modelin dosyası değişmez.
export async function modelParcaYaz(db: Db, id: number, sira: number, veri: string): Promise<{ alinan: number }> {
  const m = await sorgular.modelKilitle(db, id);
  if (m === null) throw bulunamadi(MODEL_YOK);
  if (m.tamam) throw cakisma('Modelin yüklemesi tamamlanmış; dosyası değişmez.');
  const beklenen = beklenenParcaBoyu(m.boyutBayt, sira);
  if (beklenen === null) throw gecersiz(`Parça sırası 0 ile ${m.parcaSayisi - 1} arasında olmalı.`);
  const bayt = base64Coz(veri);
  if (bayt === null) throw gecersiz('Parça base64 olarak çözülemedi.');
  if (bayt.length !== beklenen) throw gecersiz(`Parça ${sira} ${beklenen} bayt olmalı, ${bayt.length} bayt geldi.`);
  return { alinan: await sorgular.modelParcaYaz(db, id, sira, bayt) };
}

// ATL-25: bütün parçalar gelmiş, boy, özet ve GLB 2.0 başlığı tutuyor. Veritabanı tamamlarken aynı denetimi yeniden yapar.
export async function modelTamamla(db: Db, id: number): Promise<Model> {
  const m = await sorgular.modelKilitle(db, id);
  if (m === null) throw bulunamadi(MODEL_YOK);
  if (m.tamam) return modelCevabi(db, id);
  const d = await sorgular.modelParcaDurumu(db, id);
  if (d.adet !== m.parcaSayisi) throw gecersiz(`Dosya eksik: ${m.parcaSayisi} parçadan ${d.adet} tanesi geldi.`);
  if (d.toplam !== m.boyutBayt) throw gecersiz('Dosyanın boyu bildirilen boyla tutmuyor.');
  if (d.bas === null || !glbBasligiGecerliMi(new Uint8Array(Buffer.from(d.bas, 'base64')), m.boyutBayt)) {
    throw gecersiz('Dosya GLB 2.0 değil ya da başlığındaki uzunluk tutmuyor.');
  }
  const ozet = await sorgular.modelOzetiHesapla(db, id);
  if (ozet?.ozet !== m.ozet) throw gecersiz('Dosyanın özeti tutmuyor: yükleme bozulmuş, yeniden yükleyin.');
  await sorgular.modelTamamla(db, id);
  return modelCevabi(db, id);
}

export async function modelAyarla(db: Db, id: number, k: ModelAyari & { surum: number }, kisiId: number): Promise<Model> {
  const m = await sorgular.modelKilitle(db, id);
  if (m === null) throw bulunamadi(MODEL_YOK);
  if (!surumGuncelMi(k.surum, m.surum)) throw cakisma('Modeli siz açtıktan sonra başkası değiştirdi. Listeyi yenileyip yeniden deneyin.');
  const { surum: _s, ...ayar } = k;
  const yeni = await sorgular.modelAyarla(db, id, m.surum, { ...ayar, donus: donusIndirge(ayar.donus) }, kisiId);
  if (yeni === null) throw cakisma('Modeli siz açtıktan sonra başkası değiştirdi. Listeyi yenileyip yeniden deneyin.');
  return modelCevabi(db, id);
}

// ATL-27: istasyona atanmış model silinmez (yabancı anahtar da durdurur); yarım kalmış yükleme silinebilir.
export async function modelSil(db: Db, id: number): Promise<void> {
  const m = await sorgular.modelKilitle(db, id);
  if (m === null) throw bulunamadi(MODEL_YOK);
  if (m.kullanim > 0) throw bagimliKayit(`Model ${m.kullanim} istasyon ya da makinede kullanılıyor; önce oradan kaldırın.`);
  if (m.kalemKodlari.length > 0) throw bagimliKayit(`Model kalem görünümünde kullanılıyor (${m.kalemKodlari.join(', ')}); önce görünümü değiştirin.`);
  try {
    await sorgular.modelSil(db, id);
  } catch (hata) {
    if (kisitIhlali(hata)?.hata.kod === 'BAGIMLI_KAYIT') throw bagimliKayit('Model bir istasyonda, makinede ya da kalem görünümünde kullanılıyor; önce bağı kaldırın.');
    throw hata;
  }
}

export async function modelParcaOku(db: Db, id: number, sira: number): Promise<{ sira: number; veri: string }> {
  const p = await sorgular.modelParca(db, id, sira);
  if (p === null) throw bulunamadi('Model parçası bulunamadı (model yok, yüklemesi tamamlanmamış ya da sıra dışında).');
  return { sira, veri: p.veri };
}

// ---------- kalem görünümü (ATL-28) ----------

// ATL-36: kalem kodu malzeme kartının stok koduyla eşleşirse karta bağlanır (kod anahtarı -> kart). Bağ zorunlu değil:
// eşleşmeyen kod haritada uyarıyla görünür, kaydı engellenmez.
async function kalemMalzemeleri(db: Db, kodlar: readonly string[]): Promise<Map<string, KalemMalzemesi>> {
  const tekil = new Map(kodlar.map((kod) => [parcaAnahtari(kod), kod] as const));
  const nolar = new Map<string, number>();
  for (const [anahtar, kod] of tekil) {
    const no = await malzemeNoKoddan(db, kod);
    if (no !== null) nolar.set(anahtar, no);
  }
  const ozetler = await malzemeOzetleri(db, [...nolar.values()]);
  const sonuc = new Map<string, KalemMalzemesi>();
  for (const [anahtar, no] of nolar) {
    const o = ozetler.get(no);
    if (o) sonuc.set(anahtar, { no, stokKodu: o.kod, ad: o.ad });
  }
  return sonuc;
}

export async function kalemGorunumleri(db: Db): Promise<KalemGorunumu[]> {
  const satirlar = await sorgular.kalemGorunumleri(db);
  const idler = [...new Set(satirlar.flatMap((k) => (k.modelId === null ? [] : [k.modelId])))];
  const modeller = new Map((await sorgular.modelleriBul(db, idler)).map((m) => [m.id, m]));
  const malzemeler = await kalemMalzemeleri(db, satirlar.map((k) => k.kod));
  return satirlar.map((k) => {
    const m = k.modelId === null ? undefined : modeller.get(k.modelId);
    return { kod: k.kod, malzeme: malzemeler.get(parcaAnahtari(k.kod)) ?? null, model: m ? istasyonModeli(m) : null, ambalaj: k.ambalaj, rafta: k.rafta };
  });
}

// ATL-28: koda (boşluk ve harf büyüklüğü ayırmadan) tek görünüm bağlanır; model verilirse tamamlanmış olmalı.
export async function kalemGorunumuYaz(db: Db, k: KalemGorunumuKaydi, kisiId: number): Promise<KalemGorunumu[]> {
  const anahtar = parcaAnahtari(k.kod);
  if (anahtar === '') throw gecersiz('Kod zorunlu.');
  if (k.modelId !== null) {
    const m = await sorgular.modelKilitle(db, k.modelId);
    if (m === null) throw bulunamadi(MODEL_YOK);
    if (!m.tamam) throw gecersiz('Modelin yüklemesi tamamlanmamış; kaleme bağlanamaz.');
  }
  await sorgular.kalemGorunumuYaz(db, anahtar, { ...k, kod: k.kod.trim().replace(/\s+/g, ' ') }, kisiId);
  return kalemGorunumleri(db);
}

export async function kalemGorunumuSil(db: Db, kod: string): Promise<KalemGorunumu[]> {
  await sorgular.kalemGorunumuSil(db, parcaAnahtari(kod));
  return kalemGorunumleri(db);
}

// ---------- göz kalemi (ATL-29) ----------

async function gozKalemiCevaplari(db: Db, satirlar: GozKalemiSatiri[]): Promise<GozKalemi[]> {
  const adlar = await kisiAdlari(db, satirlar.map((k) => k.kaydedenKisiId));
  const malzemeler = await kalemMalzemeleri(db, satirlar.map((k) => k.kod));
  return satirlar.map((k) => ({
    id: k.id, gozId: k.gozId, adres: gozAdresi(k.rafKodu, k.bolme, k.kat, k.goz),
    raf: { id: k.rafId, kod: k.rafKodu, ad: k.rafAdi }, salon: { id: k.salonId, kod: k.salonKodu, ad: k.salonAdi },
    bolme: k.bolme, kat: k.kat, goz: k.goz, kod: k.kod, ad: k.ad, malzeme: malzemeler.get(parcaAnahtari(k.kod)) ?? null, doluluk: k.doluluk,
    kaydeden: { id: k.kaydedenKisiId, ad: adlar.get(k.kaydedenKisiId) ?? null }, kaydedildi: k.kaydedildi,
  }));
}

export async function gozKalemleri(db: Db, salonId: number | null): Promise<GozKalemi[]> {
  return gozKalemiCevaplari(db, await sorgular.gozKalemleri(db, salonId));
}

// Kalem göze konur ya da gözdeki doluluğu güncellenir. Pasif rafa kalem konmaz; gözün toplamı %100'ü aşmaz.
export async function gozKalemiYaz(db: Db, k: GozKalemiKaydi, kisiId: number): Promise<GozKalemi> {
  const goz = await sorgular.gozKilitle(db, k.gozId);
  if (goz === null) throw bulunamadi('Göz bulunamadı.');
  if (!goz.rafAktif) throw gecersiz('Pasif rafa kalem konmaz.');
  const anahtar = parcaAnahtari(k.kod);
  if (anahtar === '') throw gecersiz('Kod zorunlu.');
  const ihlal = gozDolulukIhlali(await sorgular.gozunKalemleri(db, k.gozId), { kodAnahtari: anahtar, doluluk: k.doluluk });
  if (ihlal) throw gecersiz(ihlal);
  const id = await sorgular.gozKalemiYaz(db, anahtar, { ...k, kod: k.kod.trim().replace(/\s+/g, ' ') }, kisiId);
  const satir = await sorgular.gozKalemiBul(db, id);
  if (satir === null) throw bulunamadi('Göz kalemi bulunamadı.');
  const [c] = await gozKalemiCevaplari(db, [satir]);
  if (!c) throw bulunamadi('Göz kalemi bulunamadı.');
  return c;
}

export async function gozKalemiSil(db: Db, id: number): Promise<void> {
  if (!(await sorgular.gozKalemiSil(db, id))) throw bulunamadi('Göz kalemi bulunamadı.');
}

// ---------- kroki (ATL-30) ----------
// Kapsam: bölüm kimliği ya da null (fabrika krokisi; tüm fabrikanın tek paftası).

const KROKI_YOK = 'Krokisi yok.';
const KROKI_DEGISTI = 'Krokiyi siz açtıktan sonra başkası değiştirdi. Düzenleyiciyi yeniden açın.';

async function krokiCevabi(db: Db, k: KrokiSatiri): Promise<Kroki> {
  const adlar = await kisiAdlari(db, [k.kaydedenKisiId]);
  const { id: _id, kaydedenKisiId, olcek, donus, x, z, ...geri } = k;
  return {
    ...geri,
    hizalama: olcek !== null && donus !== null && x !== null && z !== null ? { olcek, donus, x, z } : null,
    kaydeden: { id: kaydedenKisiId, ad: adlar.get(kaydedenKisiId) ?? null },
    merkez: k.salonId === null ? null : await merkezKrokisi(db, k.salonId),
  };
}

// Bölüm krokisinin Çizim Merkezi'ndeki kaynağı (kart #772): bölüme bağlı, yayında revizyonu olan kroki belgesi. Bağı yalnız
// `krokiMerkezden` kurar; yerel yükleme ve kaldırma bağı çözer, böylece bölümde en çok bir kroki belgesi bağlı kalır.
async function merkezKrokisi(db: Db, salonId: number): Promise<Kroki['merkez']> {
  const b = (await kaydaBagliBelgeler(db, 'atolye', salonId)).find((x) => x.tur === 'kroki');
  return b && b.harf !== null && b.ozet !== null ? { belgeId: b.id, ad: b.ad, harf: b.harf, ozet: b.ozet } : null;
}

async function merkezBaginiCoz(db: Db, salonId: number, kalan: number | null = null): Promise<void> {
  for (const b of await kaydaBagliBelgeler(db, 'atolye', salonId)) {
    if (b.tur === 'kroki' && b.id !== kalan) await kayittanKaldir(db, b.id, 'atolye', salonId);
  }
}

export async function merkezKrokileri(db: Db): Promise<MerkezKrokileriCevabi> {
  return { belgeler: (await yayindakiBelgeler(db, { tur: 'kroki' })).filter((b) => b.dosyaTuru === 'pdf').map(({ id, ad, harf, ozet: o }) => ({ id, ad, harf, ozet: o })) };
}

// Merkezdeki belgenin yayındaki PDF'i bölümün krokisi olur; önceki kroki yerini bırakır. Aynı belgenin yeni revizyonunda
// hizalama korunur (pafta ölçeği revizyonla değişmez varsayılır; panel kontrol ister), başka belgede sıfırlanır.
export async function krokiMerkezden(db: Db, salonId: number, belgeId: number, kullanici: Kullanici): Promise<Kroki> {
  if ((await sorgular.salonKilitle(db, salonId)) === null) throw bulunamadi(SALON_YOK);
  const kaynak = await yayindakiBelgeDosyasi(db, belgeId);
  if (kaynak === null) throw bulunamadi('Çizim Merkezi\'nde bu belgenin yayında revizyonu yok.');
  if (kaynak.dosyaTuru !== 'pdf') throw gecersiz('Kroki PDF olmalı.');
  if (kaynak.dosya.boyut > MODEL_AZAMI_BAYT) throw gecersiz(`Kroki en çok ${MODEL_AZAMI_BAYT / 1048576} MB olur.`);
  const eski = await sorgular.krokiKilitle(db, salonId);
  const oncekiBelge = await merkezKrokisi(db, salonId);
  const hizaKalir = eski !== null && eski.tamam && oncekiBelge?.belgeId === belgeId;
  await sorgular.krokiSil(db, salonId);
  await sorgular.krokiEkle(
    db, salonId, { ad: kaynak.ad.slice(0, 120), boyutBayt: kaynak.dosya.boyut, ozet: kaynak.ozet, sayfa: hizaKalir ? eski.sayfa : 1 },
    modelParcaSayisi(kaynak.dosya.boyut), kullanici.id,
  );
  const yeni = await sorgular.krokiKilitle(db, salonId);
  if (yeni === null) throw bulunamadi(KROKI_YOK);
  let sira = 0;
  let birikim = Buffer.alloc(0);
  for await (const parca of kaynak.dosya.akis(db)) {
    birikim = Buffer.concat([birikim, parca]);
    while (birikim.length >= MODEL_PARCA_BAYT) {
      await sorgular.krokiParcaYaz(db, yeni.id, sira++, birikim.subarray(0, MODEL_PARCA_BAYT));
      birikim = birikim.subarray(MODEL_PARCA_BAYT);
    }
  }
  if (birikim.length > 0) await sorgular.krokiParcaYaz(db, yeni.id, sira, birikim);
  // Veritabanı tamamlarken parça sayısını, boyu, özeti ve PDF imzasını yeniden denetler.
  await sorgular.krokiTamamla(db, yeni.id);
  if (hizaKalir && eski.olcek !== null && eski.donus !== null && eski.x !== null && eski.z !== null) {
    const tamam = await sorgular.krokiBul(db, salonId);
    if (tamam !== null) {
      await sorgular.krokiHizala(db, tamam.id, tamam.surum,
        { sayfa: eski.sayfa, olcek: Number(eski.olcek), donus: Number(eski.donus), x: Number(eski.x), z: Number(eski.z) }, kullanici.id);
    }
  }
  await merkezBaginiCoz(db, salonId, belgeId);
  if (oncekiBelge?.belgeId !== belgeId && !(await kaydaBagliBelgeler(db, 'atolye', salonId)).some((b) => b.id === belgeId)) {
    await kaydaBagla(db, kullanici, belgeId, 'atolye', salonId);
  }
  return krokiOku(db, salonId);
}

async function krokiOku(db: Db, kapsam: KrokiKapsami): Promise<Kroki> {
  const k = await sorgular.krokiBul(db, kapsam);
  if (k === null) throw bulunamadi(KROKI_YOK);
  return krokiCevabi(db, k);
}

async function kapsamDenetle(db: Db, kapsam: KrokiKapsami): Promise<void> {
  if (kapsam !== null && (await sorgular.salonBul(db, kapsam)) === null) throw bulunamadi(SALON_YOK);
}

export async function kroki(db: Db, kapsam: KrokiKapsami): Promise<Kroki | null> {
  await kapsamDenetle(db, kapsam);
  const k = await sorgular.krokiBul(db, kapsam);
  return k === null ? null : krokiCevabi(db, k);
}

// Kapsamda tek kroki: yeni yükleme eskisinin (parçalarıyla) yerine geçer. Bölüm krokisinde bölüm kilitlenir; fabrika
// krokisinde aynı anda iki yükleme olursa tek kayıt kısıtı ikincisini durdurur (409).
export async function krokiYuklemeBaslat(db: Db, kapsam: KrokiKapsami, k: KrokiKaydi, kisiId: number): Promise<Kroki> {
  if (kapsam !== null && (await sorgular.salonKilitle(db, kapsam)) === null) throw bulunamadi(SALON_YOK);
  await sorgular.krokiKilitle(db, kapsam);
  await sorgular.krokiSil(db, kapsam);
  if (kapsam !== null) await merkezBaginiCoz(db, kapsam);
  try {
    await sorgular.krokiEkle(db, kapsam, k, modelParcaSayisi(k.boyutBayt), kisiId);
  } catch (hata) {
    if (kisitIhlali(hata)?.iz.kisit === 'atolye_kroki_kapsam_tek') throw cakisma('Aynı anda başka bir kroki yükleniyor; yeniden deneyin.');
    throw hata;
  }
  return krokiOku(db, kapsam);
}

export async function krokiParcaYaz(db: Db, kapsam: KrokiKapsami, sira: number, veri: string): Promise<{ alinan: number }> {
  const k = await sorgular.krokiKilitle(db, kapsam);
  if (k === null) throw bulunamadi(KROKI_YOK);
  if (k.tamam) throw cakisma('Krokinin yüklemesi tamamlanmış; dosyası değişmez.');
  const beklenen = beklenenParcaBoyu(k.boyutBayt, sira);
  if (beklenen === null) throw gecersiz(`Parça sırası 0 ile ${k.parcaSayisi - 1} arasında olmalı.`);
  const bayt = base64Coz(veri);
  if (bayt === null) throw gecersiz('Parça base64 olarak çözülemedi.');
  if (bayt.length !== beklenen) throw gecersiz(`Parça ${sira} ${beklenen} bayt olmalı, ${bayt.length} bayt geldi.`);
  return { alinan: await sorgular.krokiParcaYaz(db, k.id, sira, bayt) };
}

// Bütün parçalar gelmiş, boy, özet ve PDF imzası tutuyor; veritabanı tamamlarken aynı denetimi yeniden yapar.
export async function krokiTamamla(db: Db, kapsam: KrokiKapsami): Promise<Kroki> {
  const k = await sorgular.krokiKilitle(db, kapsam);
  if (k === null) throw bulunamadi(KROKI_YOK);
  if (k.tamam) return krokiCevabi(db, k);
  const d = await sorgular.krokiParcaDurumu(db, k.id);
  if (d.adet !== k.parcaSayisi) throw gecersiz(`Dosya eksik: ${k.parcaSayisi} parçadan ${d.adet} tanesi geldi.`);
  if (d.toplam !== k.boyutBayt) throw gecersiz('Dosyanın boyu bildirilen boyla tutmuyor.');
  if (d.bas === null || !pdfBasligiGecerliMi(new Uint8Array(Buffer.from(d.bas, 'base64')))) throw gecersiz('Dosya PDF değil.');
  if (d.ozet !== k.ozet) throw gecersiz('Dosyanın özeti tutmuyor: yükleme bozulmuş, yeniden yükleyin.');
  await sorgular.krokiTamamla(db, k.id);
  return krokiOku(db, kapsam);
}

export async function krokiHizala(db: Db, kapsam: KrokiKapsami, h: KrokiHizalama, kisiId: number): Promise<Kroki> {
  const k = await sorgular.krokiKilitle(db, kapsam);
  if (k === null) throw bulunamadi(KROKI_YOK);
  if (!k.tamam) throw gecersiz('Krokinin yüklemesi tamamlanmamış; önce yüklemeyi bitirin.');
  if (!surumGuncelMi(h.surum, k.surum)) throw cakisma(KROKI_DEGISTI);
  const y = krokiHizalamaYuvarla(h);
  if (!(y.olcek > 0)) throw gecersiz('Ölçek çok küçük.');
  const yeni = await sorgular.krokiHizala(db, k.id, k.surum, { sayfa: h.sayfa, ...y }, kisiId);
  if (yeni === null) throw cakisma(KROKI_DEGISTI);
  return krokiOku(db, kapsam);
}

export async function krokiSil(db: Db, kapsam: KrokiKapsami): Promise<void> {
  await kapsamDenetle(db, kapsam);
  if (!(await sorgular.krokiSil(db, kapsam))) throw bulunamadi(KROKI_YOK);
  if (kapsam !== null) await merkezBaginiCoz(db, kapsam);
}

export async function krokiParcaOku(db: Db, kapsam: KrokiKapsami, sira: number): Promise<{ sira: number; veri: string }> {
  const p = await sorgular.krokiParca(db, kapsam, sira);
  if (p === null) throw bulunamadi('Kroki parçası bulunamadı (kroki yok, yüklemesi tamamlanmamış ya da sıra dışında).');
  return { sira, veri: p.veri };
}

