import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { KatalogMalzemeOzeti } from '#paylasilan/sozlesme/malzemeler.ts';
import type { AdimKaynagiCevabi, AdimKaynakOzeti, Bagimlilik, GerceklesenTuru, KomutCevabi, MakineKullanimi, RevizyonAyrintisi, RevizyonDurumu, KaynakOzeti, RevizyonKomutu, UrunOzeti, ParametreDegerleri, SartnameSurumu, TalimatAdimi } from '#paylasilan/sozlesme/rota.ts';
import { sistemAyariOku } from '../../ayarlar/disari.ts';
import { firmaOzetleri } from '../../musteri-tedarikci/disari.ts';
import { aktifIstasyonlar, istasyonKisiAtamalari, istasyonlar as istasyonListesi, istasyondakiMakineler, makineGetir, operasyonTipleri as katalogTipleri } from '../../istasyonlar/disari.ts';
import { kisiAdlari, kisileriListele } from '../../kisiler/disari.ts';
import { aletTurleri } from '../../kalibrasyon/disari.ts';
import { malzemeOperasyonlari, malzemeOzetleri } from '../../malzemeler/disari.ts';
import { PATLATMA_AZAMI_KATMAN, patlatmaOzeti, rotaPatlat, isEmriKaynagi, karttanAdimlar, kisiIstasyonlari, adimMiktarlari, kontrolListesi, akisiCikar, donguBul, komutDenetle, ondalikMetin, isEmriBagimliligi, oncullerCikar, opNolariVer, revizyonHarfi, sayiyaCevir, teorikSure, bekleyenOlcum, degisenTurler, degisimOrani, teorikAyrim, cozulmusDegerler, eksikZorunlular, kapsamUyarMi, sartnameOnayEngeli, adimliKontrolListesi, kontrolKur } from '../kurallar.ts';
import type { AdimSureleri, GerceklesenSatiri, PatlamisSatir, PatlatmaRotasi } from '../kurallar.ts';
import * as s from '../sorgular.ts';
import type { AdimKaynagi, Icerik, Kaynak, RevizyonSatiri } from '../sorgular.ts';
import { ROTALI_TURLER } from './liste.ts';
import type { revizyonGetir } from './okuma.ts';

/* ---------------- yardımcılar ---------------- */

export const ARAMA_SAYFA_BOYU = 50;
export const urunOzetine = (o: KatalogMalzemeOzeti): UrunOzeti => ({
  id: o.id, stokKodu: o.kod, ad: o.ad ?? o.kod, tur: o.tur, stokBirimi: o.birim, onayDurumu: o.onayDurumu,
});

export async function urunOzetleri(db: Db, idler: readonly number[]): Promise<Map<number, UrunOzeti>> {
  // Kart malzemeler modülünün verisidir; tablo okunmaz, dışa açtığı toplu özet alınır.
  const ozetler = await malzemeOzetleri(db, [...idler]);
  return new Map([...ozetler].map(([id, o]) => [id, urunOzetine(o)]));
}

export async function urunOzetiAl(db: Db, id: number): Promise<UrunOzeti> {
  const o = (await urunOzetleri(db, [id])).get(id);
  if (!o) throw bulunamadi('Malzeme kartı bulunamadı.');
  return o;
}
export const rotaliTurMu = (tur: string): tur is (typeof ROTALI_TURLER)[number] => (ROTALI_TURLER as readonly string[]).includes(tur);
export const turu = (u: UrunOzeti): (typeof ROTALI_TURLER)[number] => (u.tur === 'yarimamul' ? 'yarimamul' : 'mamul');

export async function rotaKurulabilirUrun(db: Db, id: number): Promise<UrunOzeti> {
  const urun = await urunOzetiAl(db, id);
  if (!rotaliTurMu(urun.tur)) throw gecersiz('Rota yalnız mamul ya da yarımamul kartına kurulur.');
  if (urun.onayDurumu !== 'aktif') throw gecersiz('Kart kullanımda değil; önce kart onaylanmalı.');
  return urun;
}

export function revizyonuAl(r: RevizyonSatiri | null): RevizyonSatiri {
  if (!r) throw bulunamadi('Rota revizyonu bulunamadı.');
  return r;
}

export const dortGozAcikMi = (db: Db): Promise<boolean> => sistemAyariOku(db, 'rota.dort-goz');

// Operasyon tipleri istasyonlar kataloğundandır (RT2 a); pasifler eski adımın tipini göstermek için dahil.
// Kısaltması boş tipte kod gösterilir.
export const operasyonTipleri = async (db: Db) =>
  (await katalogTipleri(db, { pasiflerDahil: true })).map((t) => ({ ...t, kisaltma: t.kisaltma ?? t.kod }));

// Komut revizyonu kilitleyerek alır; izin, durum ve sürüm burada denetlenir.
export async function komutIcinAl(db: Db, kullanici: Kullanici, id: number, komut: RevizyonKomutu, surum: number | null) {
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

export const cevap = (id: number, durum: RevizyonDurumu, surum: number): KomutCevabi => ({ id, durum, surum });

export const sayi = (m: string): number => Number(m);

/* ---------------- kaynak (makine ya da kişi) ---------------- */

// Kaynaklar istasyonlar ve kişiler modüllerinin verisidir; dışa açtıkları fonksiyonlarla okunur. Pasif istasyondaki makine pasif sayılır.
interface KaynakBaglami { makine: Map<number, KaynakOzeti>; kisi: Map<number, KaynakOzeti>; istasyonlar: { id: number; kod: string; ad: string; aktif: boolean }[] }

export async function kaynakBaglami(db: Db): Promise<KaynakBaglami> {
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
// Firmasız fason (id null) özeti yoktur; çağıran onu ayrı ele alır (Mimar K1: ad uydurulmaz).
export type SecilmisKaynak = Extract<AdimKaynagi, { id: number }>;
export const secilmisMi = (k: AdimKaynagi): k is SecilmisKaynak => k.id !== null;
export async function kaynakOzetiAl(db: Db, b: KaynakBaglami, k: SecilmisKaynak): Promise<AdimKaynakOzeti> {
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

// Kartın operasyonları taslağa çevrilir (#688); eşleşmeyen satırın tipi düzenleyicinin varsayılanıdır (önce "uretim", yoksa ilk aktif).
export async function kartAdimlari(db: Db, urunId: number) {
  const ops = await malzemeOperasyonlari(db, urunId);
  if (!ops || ops.length === 0) return null;
  const tipler = await operasyonTipleri(db);
  const varsayilan = tipler.find((t) => t.aktif && t.kod === 'uretim') ?? tipler.find((t) => t.aktif);
  if (!varsayilan) throw gecersiz('Aktif operasyon tipi yok; önce istasyonlar kataloğunda tip tanımlanmalı.');
  return karttanAdimlar(ops, tipler, varsayilan.id);
}

interface AdimGorunumuBaglami {
  icerik: Icerik;
  tipler: Map<number, { id: number; kod: string; ad: string; kisaltma: string; aktif: boolean }>;
  kaynaklar: Map<string, AdimKaynakOzeti>;
  urunler: Map<number, UrunOzeti>;
  talimatlar: Map<number, { surum: number; metin: string }>;
  aletTurleri: Map<number, string>;
}

export function adimlariKur(b: AdimGorunumuBaglami, urunMiktari = 1): RevizyonAyrintisi['adimlar'] {
  const { icerik } = b;
  const akis = akisiCikar(icerik.adimlar);
  const onculler = oncullerCikar(icerik.adimlar);
  const miktarlar = adimMiktarlari(icerik.adimlar.map((a) => ({ opNo: a.opNo, firePayiYuzde: sayi(a.firePayiYuzde), bagimlilik: a.bagimlilik, dal: a.dal, birlesen: a.birlesen })), urunMiktari);
  const secilmis = (k: SecilmisKaynak): AdimKaynakOzeti => b.kaynaklar.get(`${k.tur}:${k.id}`) ?? { tur: k.tur, id: k.id, kod: null, ad: 'Bilinmeyen kaynak', aktif: false, istasyon: null };
  const kaynak = (k: AdimKaynagi): AdimKaynagiCevabi => (secilmisMi(k) ? secilmis(k) : { tur: 'fason', id: null });
  const adayKaynagi = (k: Kaynak): KaynakOzeti => ({ ...secilmis(k), tur: k.tur });
  const urun = (id: number): UrunOzeti => b.urunler.get(id) ?? { id, stokKodu: null, ad: 'Bilinmeyen kart', tur: '?', stokBirimi: null, onayDurumu: '?' };
  return icerik.adimlar.map((a, i) => {
    // Dal adımı bir mamul için çarpan kadar parça işler (1257 a); bileşen miktarı ise mamul başınadır, çarpanla büyümez (1333 a).
    const mamulMiktari = miktarlar.get(a.opNo) ?? urunMiktari;
    const miktar = mamulMiktari * (a.adetCarpani ?? 1);
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
      firePayiYuzde: a.firePayiYuzde, makineKullanimi: a.makineKullanimi, enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar, ilkParca: a.ilkParca,
      hazirlikDk: a.hazirlikDk, ayar: a.ayar, ayarDk: a.ayarDk, dal: a.dal, birlesen: a.birlesen, adetCarpani: a.adetCarpani, onculler: onculler[i] ?? null,
      adaylar: icerik.adaylar.filter((x) => x.adimId === a.id)
        .map((x) => {
          const ayrim = teorikAyrim(x.birimSureDk, x.islemSuresiDk, x.degisimSuresiDk);
          return { kaynak: adayKaynagi(x.kaynak), ayarSuresiDk: x.ayarSuresiDk, birimSureDk: x.birimSureDk, islemSuresiDk: ayrim.islem, degisimSuresiDk: ayrim.degisim };
        }),
      bilesenler: icerik.bilesenler.filter((x) => x.adimId === a.id)
        .map((x) => ({
          malzeme: urun(x.malzemeId), miktar: x.miktar, fireYuzde: x.fireYuzde,
          toplamMiktar: ondalikMetin(mamulMiktari * sayi(x.miktar) * (1 + sayi(x.fireYuzde) / 100)),
        })),
      yanUrunler: icerik.yanUrunler.filter((x) => x.adimId === a.id).map((x) => ({ malzeme: urun(x.malzemeId), miktar: x.miktar })),
      ekipman: (icerik.ekipman ?? []).filter((x) => x.adimId === a.id).map((x) => ({
        tur: x.tur, malzeme: x.malzemeId === null ? null : urun(x.malzemeId), aciklama: x.aciklama,
        aletTuru: x.aletTuruId === null ? null : { id: x.aletTuruId, ad: b.aletTurleri.get(x.aletTuruId) ?? 'Kullanım dışı alet türü' },
      })),
      akis: { tuketir: akisi.tuketir, cikti: akisi.cikti },
      adimMiktari: ondalikMetin(miktar),
      teorikSureDk: sure === null ? null : ondalikMetin(sure),
      talimat: b.talimatlar.get(a.opNo) ?? null,
    };
  });
}

export async function gorunumBaglami(db: Db, malzemeId: number, icerik: Icerik): Promise<AdimGorunumuBaglami> {
  const kb = await kaynakBaglami(db);
  const kaynaklar = new Map<string, AdimKaynakOzeti>();
  for (const k of [...icerik.adimlar.flatMap((a) => (a.kaynak && secilmisMi(a.kaynak) ? [a.kaynak] : [])), ...icerik.adaylar.map((x) => x.kaynak)]) {
    kaynaklar.set(`${k.tur}:${k.id}`, await kaynakOzetiAl(db, kb, k));
  }
  return {
    icerik,
    tipler: new Map((await operasyonTipleri(db)).map((t) => [t.id, { id: t.id, kod: t.kod, ad: t.ad, kisaltma: t.kisaltma, aktif: t.aktif }])),
    kaynaklar,
    urunler: await urunOzetleri(db, [
      ...icerik.bilesenler.map((x) => x.malzemeId), ...icerik.yanUrunler.map((x) => x.malzemeId), ...(icerik.ekipman ?? []).flatMap((x) => (x.malzemeId === null ? [] : [x.malzemeId])),
    ]),
    talimatlar: new Map((await s.gecerliTalimatlar(db, malzemeId)).map((t) => [t.opNo, { surum: t.surum, metin: t.metin }])),
    aletTurleri: (icerik.ekipman ?? []).some((x) => x.aletTuruId !== null) ? new Map((await aletTurleri(db)).map((t) => [t.id, t.ad])) : new Map(),
  };
}

// Adımlar ve medyaları sahip kimliğine (talimat sürümü ya da şablon) göre birleşir.
export function talimatAdimlariKur(adimlar: readonly s.TalimatAdimiSatiri[], medyalar: readonly s.MedyaSatiri[]): Map<number, TalimatAdimi[]> {
  const medya = new Map<string, TalimatAdimi['medya']>();
  for (const m of medyalar) {
    const k = `${m.sahipId}:${m.adimSira}`;
    medya.set(k, [...(medya.get(k) ?? []), { ozet: m.ozet, ad: m.ad, tur: m.tur, boyut: m.boyut }]);
  }
  const harita = new Map<number, TalimatAdimi[]>();
  for (const x of adimlar) {
    const adim: TalimatAdimi = {
      sira: x.sira, baslik: x.baslik, metin: x.metin, kontrol: kontrolKur(x.kontrolTuru, x.kontrolAyari), zorunlu: x.zorunlu,
      medya: medya.get(`${x.sahipId}:${x.sira}`) ?? [], asama: x.asama, hedefSureDk: x.hedefSureDk,
    };
    harita.set(x.sahipId, [...(harita.get(x.sahipId) ?? []), adim]);
  }
  return harita;
}

// Talimat sürümü kimliğine göre adımlar; adımı olmayan (düz metin) sürüm haritada yoktur.
export async function surumAdimlari(db: Db, talimatIdleri: readonly number[]): Promise<Map<number, TalimatAdimi[]>> {
  return talimatAdimlariKur(await s.talimatAdimlari(db, talimatIdleri), await s.talimatMedyalari(db, talimatIdleri));
}

export async function donguDenetle(db: Db, kok: number, kokBilesenleri: readonly number[]): Promise<void> {
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

/* ---------------- patlamış rota (1476, 1481 a) ---------------- */

function patlatmaRotasi(revizyonId: number, icerik: Icerik): PatlatmaRotasi {
  return {
    revizyonId,
    adimlar: icerik.adimlar.map((a) => ({
      id: a.id, opNo: a.opNo, sira: a.sira,
      bilesenler: icerik.bilesenler.filter((b) => b.adimId === a.id).map((b) => ({ malzemeId: b.malzemeId, miktar: sayi(b.miktar) })),
    })),
  };
}

// Kökün rotası verilen revizyondur; alt ürünler yürürlükteki revizyonlarıyla açılır. Döngüde zaten okunmuş ürün yeniden okunmaz,
// döngüyü kural (rotaPatlat) yol üzerinden bulur.
async function patlatmaRotalari(db: Db, kok: number, kokRevizyon: number): Promise<Map<number, PatlatmaRotasi>> {
  const kokIcerik = await s.icerikOku(db, kokRevizyon);
  const rotalar = new Map<number, PatlatmaRotasi>([[kok, patlatmaRotasi(kokRevizyon, kokIcerik)]]);
  let sinir = [...new Set(kokIcerik.bilesenler.map((b) => b.malzemeId))];
  for (let derinlik = 0; sinir.length > 0 && derinlik <= PATLATMA_AZAMI_KATMAN; derinlik += 1) {
    const yeni = sinir.filter((m) => !rotalar.has(m));
    const idler = await s.yururluktekiRevizyonIdleri(db, yeni);
    const icerikler = await s.iceriklerOku(db, [...idler.values()]);
    const sonraki: number[] = [];
    for (const [urun, rid] of idler) {
      const icerik = icerikler.get(rid) ?? { adimlar: [], adaylar: [], bilesenler: [], yanUrunler: [] };
      rotalar.set(urun, patlatmaRotasi(rid, icerik));
      sonraki.push(...icerik.bilesenler.map((b) => b.malzemeId));
    }
    sinir = [...new Set(sonraki)];
  }
  return rotalar;
}

// Patlatma kurulamazsa ileti ürün kodlarıyla yolu gösterir (döngü ya da katman sınırı).
export async function patlatmaKur(db: Db, revizyonId: number, kokMalzemeId: number): Promise<{ satirlar: PatlamisSatir[] } | { ileti: string }> {
  const p = rotaPatlat(kokMalzemeId, await patlatmaRotalari(db, kokMalzemeId, revizyonId));
  if (!('ileti' in p)) return p;
  if (p.yol === undefined) return { ileti: p.ileti };
  const adlar = await urunOzetleri(db, p.yol);
  return { ileti: `${p.ileti} ${p.yol.map((d) => adlar.get(d)?.stokKodu ?? adlar.get(d)?.ad ?? String(d)).join(' > ')}` };
}

// Patlatma kaydı emir açılışının parçasıdır (rota.emre-kopyala); ayrı yazma ucu yoktur. Aynı revizyon kümesi var olan kaydı döndürür.
export async function patlat(db: Db, kisiId: number, revizyonId: number, kokMalzemeId: number): Promise<{ id: number; satirlar: PatlamisSatir[] }> {
  const p = await patlatmaKur(db, revizyonId, kokMalzemeId);
  if ('ileti' in p) throw gecersiz(p.ileti);
  const id = await s.patlatmaYaz(db, { kokMalzemeId, kokRevizyonId: revizyonId, ozet: patlatmaOzeti(p.satirlar), kisiId }, p.satirlar);
  return { id, satirlar: p.satirlar };
}

/* ---------------- komutlar ---------------- */

type YeniAdim = Omit<s.AdimYazimi, 'opNo' | 'sira'> & { opNo: number | null };

export function icerikYazimlari(icerik: Icerik): (YeniAdim & { opNo: number })[] {
  return icerik.adimlar.map((a) => ({
    opNo: a.opNo, operasyonTipiId: a.operasyonTipiId, ad: a.ad, kaynak: a.kaynak, ayarSuresiDk: a.ayarSuresiDk,
    birimSureDk: a.birimSureDk, islemSuresiDk: a.islemSuresiDk, degisimSuresiDk: a.degisimSuresiDk, terminGun: a.terminGun,
    bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, firePayiYuzde: a.firePayiYuzde,
    makineKullanimi: a.makineKullanimi, enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar, ilkParca: a.ilkParca,
    adaylar: icerik.adaylar.filter((x) => x.adimId === a.id)
      .map(({ kaynak, ayarSuresiDk, birimSureDk, islemSuresiDk, degisimSuresiDk }) => ({ kaynak, ayarSuresiDk, birimSureDk, islemSuresiDk, degisimSuresiDk })),
    bilesenler: icerik.bilesenler.filter((x) => x.adimId === a.id).map(({ malzemeId, miktar, fireYuzde }) => ({ malzemeId, miktar, fireYuzde })),
    yanUrunler: icerik.yanUrunler.filter((x) => x.adimId === a.id).map(({ malzemeId, miktar }) => ({ malzemeId, miktar })),
    ekipman: (icerik.ekipman ?? []).filter((x) => x.adimId === a.id).map(({ tur, malzemeId, aletTuruId, aciklama }) => ({ tur, malzemeId, aletTuruId, aciklama })),
    hazirlikDk: a.hazirlikDk, ayar: a.ayar, ayarDk: a.ayarDk, dal: a.dal, birlesen: a.birlesen, adetCarpani: a.adetCarpani,
  }));
}

// Numarasız adıma ürünün kullanılmış en büyük numarasının üstünden numara verilir, numara kayda yazılır, adımlar sırayla yazılır.
export async function adimlariYaz(db: Db, revizyonId: number, malzemeId: number, adimlar: readonly YeniAdim[]): Promise<void> {
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
  await s.sahipsizAdimSartnameleriniSil(db, revizyonId);
}

export const TASLAK_ACIK = 'Bu ürünün açık bir revizyonu var; önce onu bitirin ya da iptal edin.';
export const ROTA_VAR = 'Bu ürünün rotası var; başka üründen kopya yalnız ilk rota için istenir.';

export type TaslakKaynagi =
  | { tur: 'revizyon'; revizyonId: number } | { tur: 'standart' } | { tur: 'bos' } | { tur: 'kart' } | { tur: 'sablon'; sablonId: number }
  | { tur: 'urun'; urunId: number };

// Başka ürünün revizyonu hedefe taşınırken hedefte kullanılmış numara boşaltılır (yeni numara alır); hedef kendi reçetesinde bileşen olamaz.
export async function baskaUruneAdimlar(db: Db, kaynakRevizyonId: number, hedefUrunId: number): Promise<YeniAdim[]> {
  const kullanilmis = new Set(await s.kullanilmisOpNolari(db, hedefUrunId));
  const adimlar = icerikYazimlari(await s.icerikOku(db, kaynakRevizyonId)).map((a) => (a.opNo !== null && kullanilmis.has(a.opNo) ? { ...a, opNo: null } : a));
  if (adimlar.some((a) => a.bilesenler.some((b) => b.malzemeId === hedefUrunId))) {
    throw gecersiz('Hedef ürün bu reçetede bileşen; kendisini bileşen olarak alamaz.');
  }
  return adimlar;
}

export async function taslagiAc(db: Db, acanKisiId: number, urunId: number, kaynak: TaslakKaynagi): Promise<KomutCevabi> {
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
      enKucukParca: null, yenidenAyar: true, ilkParca: 'her_kurulum', hazirlikDk: null, ayar: false, ayarDk: null, adaylar: [], bilesenler: [], yanUrunler: [], dal: null, birlesen: [], adetCarpani: null,
    }));
  } else if (kaynak.tur === 'kart') {
    // Aktarım tek yönlüdür ve yalnız ilk rotada: kart sonradan değişse de var olan rota değişmez, kartta kopya kalır (#688).
    if ((await s.harfler(db, urunId)).length > 0) throw cakisma('Bu ürünün rotası var; karttan yalnız ilk rota açılır.');
    const kart = await kartAdimlari(db, urunId);
    if (!kart) throw gecersiz('Kartta operasyon yok.');
    adimlar = kart.map((a) => ({
      opNo: a.opNo, operasyonTipiId: a.operasyonTipiId, ad: a.ad, kaynak: null, ayarSuresiDk: null, birimSureDk: null, islemSuresiDk: null, degisimSuresiDk: null, terminGun: null,
      bagimlilik: 'bekleyen' as Bagimlilik, devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek' as MakineKullanimi,
      enKucukParca: null, yenidenAyar: true, ilkParca: 'her_kurulum', hazirlikDk: null, ayar: false, ayarDk: null, adaylar: [], bilesenler: [], yanUrunler: [], dal: null, birlesen: [], adetCarpani: null,
    }));
  } else if (kaynak.tur === 'urun') {
    if ((await s.harfler(db, urunId)).length > 0) throw cakisma(ROTA_VAR);
    kaynakId = await s.yururluktekiRevizyonId(db, kaynak.urunId);
    if (kaynakId === null) throw gecersiz('Kaynak ürünün yürürlükte rotası yok.');
    adimlar = await baskaUruneAdimlar(db, kaynakId, urunId);
  }
  const id = await s.revizyonEkle(db, { malzemeId: urunId, malzemeTuru: turu(urun), harf, acanKisiId, kaynakRevizyonId: kaynakId });
  await adimlariYaz(db, id, urunId, adimlar);
  // Şartname bağı OP numarasıyla tutulur: yalnız aynı ürünün revizyonundan açılan taslak bağları alır.
  if (kaynak.tur === 'revizyon' && kaynakId !== null) await s.adimSartnameleriniKopyala(db, kaynakId, id);
  return cevap(id, 'taslak', 1);
}

/* ---------------- süreler (teorik ve gerçekleşen) ---------------- */

export const sayiMi = (m: string | null): number | null => sayiyaCevir(m);

export const gerceklesenSatirlari = (kayitlar: readonly s.GerceklesenKaydi[], opNo: number): GerceklesenSatiri[] =>
  kayitlar.filter((k) => k.opNo === opNo).map((k) => ({ id: k.id, tur: k.tur, makineId: k.makineId, sureDk: sayiMi(k.sureDk), kaynak: k.kaynak }));

// RT-79 (171 a): yürürlüğe giren revizyonda teorik süresi öncekinden farklı türlerin bekleyen ölçümü boş elle satırıyla boşaltılır. Adımın
// kendi süresi makinesiz görünümü ve adımın makinesinin ölçümünü, aday süresi o makinenin ölçümünü kapatır. Bekleyen ölçümü olmayan yere satır yazılmaz.
export async function olcumleriBosalt(db: Db, kisiId: number, malzemeId: number, eskiId: number | null, yeniId: number): Promise<void> {
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


// Emre kopya ve emirlere uygula aynı girdiyi kurar: her rota adımı bir iş emri, talimatın o anki metni kontrol listesi.
export async function isEmriGirdileri(db: Db, malzemeId: number, rota: NonNullable<Awaited<ReturnType<typeof revizyonGetir>>>) {
  const gecerli = await s.gecerliTalimatlar(db, malzemeId);
  const adimlar = await surumAdimlari(db, gecerli.map((t) => t.id));
  // Adımlı sürümde madde adımın başlığı, açıklaması adımın metnidir; düz metin sürüm satır satır bölünür.
  const listeler = new Map(gecerli.map((t) => {
    const a = adimlar.get(t.id);
    return [t.opNo, a ? adimliKontrolListesi(a) : kontrolListesi(t.metin)];
  }));
  return rota.adimlar.map((a) => ({
    sira: a.sira, opNo: a.opNo, ad: a.ad, operasyonTipiId: a.operasyonTipiId,
    ...isEmriKaynagi(a), ayarSuresiDk: a.ayarSuresiDk,
    birimSureDk: a.birimSureDk, terminGun: a.fason?.terminGun ?? null, talimatSurumu: a.talimatSurumu,
    ...isEmriBagimliligi(a),
    adetCarpani: a.adetCarpani,
    kontrolListesi: listeler.get(a.opNo) ?? [],
    // Emir adedi istenen sağlam çıktıdır (250 a): ihtiyacı adımın fire payı büyütür; adım ayarları planın girdisidir, varsayılana düşmez.
    firePayiYuzde: a.firePayiYuzde, makineKullanimi: a.makineKullanimi, enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar,
    // İş emrinin adayı makine ya da kişidir; istasyon adayı emirde karşılıksızdır, adımın istasyonu zaten başlıktır.
    adaylar: a.adaylar.flatMap((x) => (x.kaynak.tur === 'istasyon' ? [] : [{ kaynak: { tur: x.kaynak.tur, id: x.kaynak.id }, ayarSuresiDk: x.ayarSuresiDk, birimSureDk: x.birimSureDk }])),
    // Adımın girenleri emre kopyalanır: stok üretim sayımında adımın girdisini bunlardan sarf eder; yoksa sayım yalnız ürün girişi olur.
    bilesenler: a.bilesenler.map((b) => ({ malzemeNo: b.malzemeId, miktar: String(b.miktar), fireYuzde: String(b.fireYuzde) })),
  }));
}

/* ---------------- işlem şartnamesi (971 a) ---------------- */

export const SARTNAME_YOK = 'İşlem şartnamesi bulunamadı.';

export async function surumAyrintilari(db: Db, surumIdleri: readonly number[]): Promise<Map<number, SartnameSurumu>> {
  const tekil = [...new Set(surumIdleri)];
  if (tekil.length === 0) return new Map();
  const surumler = await s.surumleriOku(db, tekil);
  const parametreler = await s.surumParametreleri(db, tekil);
  const atiflar = await s.surumAtiflari(db, tekil);
  const ad = await kisiAdlari(db, surumler.flatMap((v) => [v.acanKisiId, v.yayinlayanKisiId].filter((k): k is number => k !== null)));
  const kisi = (id: number | null) => (id === null ? null : { id, ad: ad.get(id) ?? null });
  return new Map(surumler.map((v) => [v.id, {
    id: v.id, surumNo: v.surumNo, durum: v.durum, istenenBelgeler: v.istenenBelgeler, terminalNotu: v.terminalNotu, degisiklikNotu: v.degisiklikNotu,
    acan: kisi(v.acanKisiId), acilma: v.acilma, yayinlayan: kisi(v.yayinlayanKisiId), yayin: v.yayin,
    parametreler: parametreler.filter((p) => p.surumId === v.id).map(({ surumId: _, ...p }) => p),
    atiflar: atiflar.filter((a) => a.surumId === v.id).map((a) => ({
      sira: a.sira, standart: { id: a.standartId, numara: a.numara, kisaAciklama: a.kisaAciklama }, rol: a.rol as SartnameSurumu['atiflar'][number]['rol'], not: a.not,
    })),
  }]));
}

/* ---- adım şartnameleri ---- */

export const fasonAdimMi = (a: { kaynak: AdimKaynagi | null }): boolean => a.kaynak?.tur === 'fason';

interface SartnameBaglami { ozet: Map<number, s.SartnameSatiri>; surum: Map<number, SartnameSurumu> }

export async function sartnameBaglami(db: Db, sartnameIdleri: readonly number[]): Promise<SartnameBaglami> {
  const tekil = [...new Set(sartnameIdleri)];
  const satirlar = tekil.length === 0 ? [] : await s.sartnameleriOku(db, tekil);
  const surum = await surumAyrintilari(db, satirlar.flatMap((x) => (x.yururlukteSurumId === null ? [] : [x.yururlukteSurumId])));
  return { ozet: new Map(satirlar.map((x) => [x.id, x])), surum };
}

export const yururlukteSurum = (b: SartnameBaglami, sartnameId: number): SartnameSurumu | null => {
  const id = b.ozet.get(sartnameId)?.yururlukteSurumId;
  return id === null || id === undefined ? null : b.surum.get(id) ?? null;
};

export async function sartnameOnayDenetimi(db: Db, revizyonId: number, icerik: Icerik): Promise<void> {
  const baglar = await s.adimSartnameleri(db, [revizyonId]);
  if (baglar.length === 0) return;
  const b = await sartnameBaglami(db, baglar.map((x) => x.sartnameId));
  const adimlar = new Map(icerik.adimlar.map((a) => [a.opNo, a]));
  const hata = sartnameOnayEngeli(baglar.flatMap((x) => {
    const ozet = b.ozet.get(x.sartnameId);
    const adim = adimlar.get(x.opNo);
    if (!ozet || !adim) return [];
    const yururlukte = yururlukteSurum(b, x.sartnameId);
    return [{
      opNo: x.opNo, kod: ozet.kod, aktif: ozet.aktif, yururlukteVar: yururlukte !== null, kapsamUyar: kapsamUyarMi(ozet.kapsam, fasonAdimMi(adim)),
      eksikler: yururlukte ? eksikZorunlular(yururlukte.parametreler, cozulmusDegerler(yururlukte.parametreler, x.degerler)) : [],
    }];
  }));
  if (hata) throw gecersiz(hata);
}

// Emir açılırken (ya da başlamamış iş emri yenilenirken) adımın şartnameleri o an yürürlükteki sürümle ve çözülmüş değerlerle
// iş emrine sabitlenir. Sonradan yayınlanan sürüm sabitlenmiş iş emrini değiştirmez.
// Adımın bağları yürürlükteki sürümle çözülür; yayınlanmış sürümü olmayan ya da zorunlusu boş kalan bağ sabitlenemez.
type AdimSabiti = { sabitler: { surumId: number; degerler: ParametreDegerleri }[] } | { hata: string };
export function adimSabitleri(b: Awaited<ReturnType<typeof sartnameBaglami>>, baglar: readonly s.AdimSartnameSatiri[], opNo: number): AdimSabiti {
  const sabitler: { surumId: number; degerler: ParametreDegerleri }[] = [];
  for (const x of baglar.filter((y) => y.opNo === opNo)) {
    const kod = b.ozet.get(x.sartnameId)?.kod ?? String(x.sartnameId);
    const yururlukte = yururlukteSurum(b, x.sartnameId);
    if (!yururlukte) return { hata: `OP ${opNo}: ${kod} şartnamesinin yayınlanmış sürümü yok; emir açılamaz.` };
    const degerler = cozulmusDegerler(yururlukte.parametreler, x.degerler);
    const eksik = eksikZorunlular(yururlukte.parametreler, degerler);
    if (eksik.length > 0) return { hata: `OP ${opNo}: ${kod} şartnamesinde zorunlu alan boş (${eksik.join(', ')}); emir açılamaz.` };
    sabitler.push({ surumId: yururlukte.id, degerler });
  }
  return { sabitler };
}

export async function isEmirlerineSabitle(db: Db, kisiId: number, revizyonId: number, isEmirleri: readonly { id: number; opNo: number }[]): Promise<void> {
  await isEmirlerineEkipmanYaz(db, revizyonId, isEmirleri);
  const baglar = await s.adimSartnameleri(db, [revizyonId]);
  if (baglar.length === 0) return;
  const b = await sartnameBaglami(db, baglar.map((x) => x.sartnameId));
  for (const ie of isEmirleri) {
    const r = adimSabitleri(b, baglar, ie.opNo);
    if ('hata' in r) throw gecersiz(r.hata);
    if (r.sabitler.length > 0) await s.isEmriSabitle(db, ie.id, r.sabitler, kisiId);
  }
}

// Adım ekipmanı (2893-4 a) emir açılırken rota adımından iş emrine kopyalanır; revizyon sonradan değişse de iş emrinin listesi kalır.
async function isEmirlerineEkipmanYaz(db: Db, revizyonId: number, isEmirleri: readonly { id: number; opNo: number }[]): Promise<void> {
  const icerik = await s.icerikOku(db, revizyonId);
  const ekipman = icerik.ekipman ?? [];
  if (ekipman.length === 0) return;
  const adimi = new Map(icerik.adimlar.map((a) => [a.opNo, a.id]));
  for (const ie of isEmirleri) {
    const adimId = adimi.get(ie.opNo);
    if (adimId === undefined) continue;
    await s.isEmriEkipmaniYaz(db, ie.id, ekipman.filter((x) => x.adimId === adimId).map(({ tur, malzemeId, aletTuruId, aciklama }) => ({ tur, malzemeId, aletTuruId, aciklama })));
  }
}
