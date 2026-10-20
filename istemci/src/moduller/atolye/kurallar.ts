import { parcaAnahtari } from '#paylasilan/atolye-sabitleri.ts';
import type { AlanTuru, GozKalemi, IstasyonModeli, IstasyonYeri, KalemAmbalaji, MerkezModeli, YerlesimCevabi, KalemGorunumu, KalemMalzemesi, Raf, RafTuru } from '#paylasilan/sozlesme/atolye.ts';
import type { GozYuku, YukBicimi } from './sahne/nesneler.ts';
import type { IstasyonTipi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { Emir, SonOlayTuru, SonOlaylarCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { SonOlaylarCevabi as ArkonSonOlaylarCevabi } from '#paylasilan/sozlesme/arkon.ts';

type ArkonSonOlayTuru = ArkonSonOlaylarCevabi['olaylar'][number]['tur'];
import type { MakineDurumu } from '../../ortak/arayuz/index.ts';

// Ekranın gösterim yardımcıları: iş kuralı değildir, sunucunun verdiği durumu ekrana çevirir.

// numeric metin yalnız çizim için sayıya çevrilir; cevaba ya da kayda geri yazılmaz.
export const sayi = (metin: string): number => Number(metin);

const SAYI = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
export const olcuMetni = (metre: number): string => `${SAYI.format(metre)} m`;
export const sayiMetni = (n: number): string => SAYI.format(n);

export interface IstasyonGorunumu {
  durum: MakineDurumu;
  metin: string;
}

// Gösterim: istasyonun rengi, üretim emirleri modülünün verdiği başlamış emrin canlı halidir; başlamış emir yoksa bekliyor.
// Durumu hesaplayan sunucudur (emir modülü); burada yalnız ekran adına çevrilir. Pasif istasyonun durumu gösterilmez.
export function istasyonGorunumu(yer: Pick<IstasyonYeri, 'aktif'>, emir: Emir | undefined): IstasyonGorunumu {
  if (!yer.aktif) return { durum: 'sirada', metin: 'Pasif' };
  if (!emir) return { durum: 'sirada', metin: 'Bekliyor' };
  const calisma = emir.canli?.calisma ?? null;
  if (calisma === 'durdu') return { durum: 'durdu', metin: 'Durdu' };
  if (calisma === 'durakli') return { durum: 'durakli', metin: 'Duraklatıldı' };
  return { durum: 'calisiyor', metin: 'Çalışıyor' };
}

// Sahnede istasyonun etiketi ve makine ekranı: durum, sayaç ve emir; emir yoksa boş (uydurulmaz).
export interface IstasyonCanli extends IstasyonGorunumu {
  sayac: string | null;
  oran: number | null;
  emirNo: string | null;
  parca: string | null;
  neden: string | null;
}

export function istasyonCanli(yer: Pick<IstasyonYeri, 'aktif'>, emir: Emir | undefined): IstasyonCanli {
  const g = istasyonGorunumu(yer, emir);
  const e = yer.aktif ? emir : undefined;
  return {
    ...g,
    sayac: e?.canli ? `${e.canli.saglam}/${e.adet}` : null,
    oran: ilerleme(e),
    emirNo: e?.emirNo ?? null,
    parca: e?.parcaAd ?? null,
    neden: e?.canli?.durusNedeni?.ad ?? null,
  };
}

// Makinenin istasyonlar modülündeki elle girilen durumu (arıza, bakım); çalışır makine haritada ayrıca işaretlenmez.
export interface MakineArizasi {
  durum: 'ariza' | 'bakim';
  aciklama: string | null;
}

// Haritadaki nesnenin (makine ya da makinesi yerleşmemiş istasyon) canlı hali ve dayandığı emir.
export interface NesneCanli extends IstasyonCanli {
  emir: Emir | null;
  // Çalışan iş emri: "Op 20 · Frezeleme"; iş emirsiz emirde ve adımlar arasında null.
  isEmri: string | null;
  ariza: MakineArizasi | null;
}

// ATL-38: nesne anahtarı -> canlı hal. Başlamış emir, iş emrinin makinesi haritadaysa o makineye, değilse istasyonun haritadaki
// nesnesine (ilk makinesi ya da kendisi) düşer; aynı nesneye düşen ikinci emir yazılmaz. Arıza ve bakım çalışan emrin
// üstündedir (kullanıcı kararı S3 "İkisi"): emir bilgisi kalır, durum ve neden arızadan gelir. Pasif nesne yazılmaz.
export function nesneCanlilari(
  bolumler: readonly Pick<YerlesimCevabi, 'istasyonYerleri' | 'makineYerleri'>[],
  emirler: readonly Emir[],
  arizalar: ReadonlyMap<number, MakineArizasi>,
): Map<string, NesneCanli> {
  const makineler = new Map(bolumler.flatMap((b) => b.makineYerleri).map((m) => [m.makineId, m]));
  const istasyonlar = new Map(bolumler.flatMap((b) => b.istasyonYerleri).map((i) => [i.istasyonId, i]));
  const aktifMi = (anahtar: string): boolean => {
    const [tur, no] = anahtar.split(':');
    if (tur === 'makine') {
      const m = makineler.get(Number(no));
      return m !== undefined && m.aktif && (m.istasyon?.aktif ?? true);
    }
    return istasyonlar.get(Number(no))?.aktif ?? false;
  };
  const sonuc = new Map<string, NesneCanli>();
  const baslamis = emirler.filter((e) => e.durum === 'basladi');
  const makinesi = (e: Emir): number | null => {
    const id = e.canli?.isEmri?.makineId ?? null;
    return id !== null && makineler.has(id) ? id : null;
  };
  // Makinesi belli emirler önce: istasyonun ilk makinesine düşen emir, makinesi belli olanın yerini almaz.
  const sirali = [...baslamis.filter((e) => makinesi(e) !== null), ...baslamis.filter((e) => makinesi(e) === null)];
  for (const e of sirali) {
    const m = makinesi(e);
    const anahtar = m !== null ? `makine:${m}` : istasyonNesnesi(bolumler, e.istasyon.id);
    if (sonuc.has(anahtar) || !aktifMi(anahtar)) continue;
    const ie = e.canli?.isEmri ?? null;
    sonuc.set(anahtar, { ...istasyonCanli({ aktif: true }, e), emir: e, isEmri: ie ? `Op ${ie.opNo} · ${ie.ad}` : null, ariza: null });
  }
  for (const [makineId, ariza] of arizalar) {
    const anahtar = `makine:${makineId}`;
    if (!makineler.has(makineId) || !aktifMi(anahtar)) continue;
    const var_ = sonuc.get(anahtar) ?? { ...istasyonCanli({ aktif: true }, undefined), emir: null, isEmri: null, ariza: null };
    sonuc.set(anahtar, {
      ...var_,
      durum: ariza.durum === 'ariza' ? 'durdu' : 'ayar',
      metin: ariza.durum === 'ariza' ? 'Arıza' : 'Bakımda',
      neden: ariza.aciklama ?? var_.neden,
      ariza,
    });
  }
  return sonuc;
}

export interface Ozet {
  calisiyor: number;
  durakli: number;
  durdu: number;
  bekliyor: number;
  // Başlamış emirlerin sağlam sayaçları toplamı; başlamış emir yoksa null (sıfır uydurulmaz).
  saglam: number | null;
}

export function ozetle(yerler: readonly IstasyonYeri[], emirler: ReadonlyMap<number, Emir>): Ozet {
  const ozet: Ozet = { calisiyor: 0, durakli: 0, durdu: 0, bekliyor: 0, saglam: null };
  for (const y of yerler) {
    if (!y.aktif) continue;
    const emir = emirler.get(y.istasyonId);
    const { durum } = istasyonGorunumu(y, emir);
    if (durum === 'calisiyor') ozet.calisiyor += 1;
    else if (durum === 'durakli') ozet.durakli += 1;
    else if (durum === 'durdu') ozet.durdu += 1;
    else ozet.bekliyor += 1;
    if (emir?.canli) ozet.saglam = (ozet.saglam ?? 0) + emir.canli.saglam;
  }
  return ozet;
}

// Halka için oran: emir yoksa ya da sayaç yoksa null.
export function ilerleme(emir: Emir | undefined): number | null {
  if (!emir?.canli) return null;
  return Math.min(1, emir.canli.saglam / emir.adet);
}

export function emirlerIstasyonaGore(emirler: readonly Emir[]): Map<number, Emir> {
  return new Map(emirler.filter((e) => e.durum === 'basladi').map((e) => [e.istasyon.id, e]));
}

// Örnek veri istasyonları ORN- koduyla gelir (sunucu/moduller/istasyonlar/ornek-veri.ts).
export const ornekIstasyonMu = (kod: string): boolean => kod.startsWith('ORN-');

// Haritaya yalnız Çizim Merkezi'nde makineyle eşleşmiş istasyon eklenir (kullanıcı kararı 15.10.2026); örnek istasyonlar denemek
// için eşleşmesiz de eklenebilir. Eşleşenler önce gelir. `eslesmemis`: listeye girmeyen istasyon sayısı (kullanıcıya söylenir).
export function eklenebilirIstasyonlar<T extends { id: number; kod: string }>(
  liste: readonly T[],
  eslesmis: (id: number) => boolean,
): { eklenecek: T[]; eslesmemis: number } {
  const esli = liste.filter((i) => eslesmis(i.id));
  const ornek = liste.filter((i) => !eslesmis(i.id) && ornekIstasyonMu(i.kod));
  return { eklenecek: [...esli, ...ornek], eslesmemis: liste.length - esli.length - ornek.length };
}

// Başlamış emri olan ama fabrikanın hiçbir bölümüne (istasyon ya da ekipmanıyla) yerleşmemiş istasyonlar (kart #1284):
// canlı durumları haritada hiçbir nesneye düşmez, kullanıcıya ayrıca söylenir.
export function yerlesmemisCalisanlar(
  bolumler: readonly Pick<YerlesimCevabi, 'istasyonYerleri' | 'makineYerleri'>[],
  emirler: readonly Emir[],
): Emir[] {
  const yerlesik = new Set(bolumler.flatMap((b) => [
    ...b.istasyonYerleri.map((i) => i.istasyonId),
    ...b.makineYerleri.flatMap((m) => (m.istasyon ? [m.istasyon.id] : [])),
  ]));
  return emirler.filter((e) => e.durum === 'basladi' && !yerlesik.has(e.istasyon.id))
    .sort((a, b) => a.istasyon.ad.localeCompare(b.istasyon.ad, 'tr') || a.id - b.id);
}

export const RAF_TURU_ADI: Record<RafTuru, string> = {
  palet: 'Palet rafı', kucuk_parca: 'Küçük parça rafı', konsol: 'Konsol raf', zemin: 'Sac stok alanı',
};

export const ALAN_TURU_ADI: Record<AlanTuru, string> = {
  yuruyus_yolu: 'Yürüyüş yolu', bolge: 'Bölge', karantina: 'Karantina', sevkiyat: 'Sevkiyat alanı', oda: 'Oda', cam_oda: 'Cam oda', palet: 'Palet',
  kabul: 'Mal kabul alanı', uretim_cikisi: 'Üretim çıkış alanı', depo_zemini: 'Depo zemini', fason: 'Fason alanı', ara_alan: 'Ara alan (bekleme)', hurda: 'Hurda alanı',
};

// İstasyonlar modülünün ekran etiketleri (etiketler.ts) dışa açık değil; açılınca oradan alınır (BASKA-MODUL-ISTEKLERI).
export const ISTASYON_TIPI_ADI: Record<IstasyonTipi, string> = {
  talasli: 'Talaşlı imalat', kalite: 'Kalite', depo: 'Depo', markalama: 'Markalama', boya: 'Boya', montaj: 'Montaj',
};

// Makine cinsi: 3B gövde ve 2B plan simgesi aynı karardan çizilir. Talaşlıda tip yetmez; tornayı ve 5 ekseni ad ayırır.
export type MakineCinsi = 'dik_isleme' | 'bes_eksen' | 'torna' | 'lazer' | 'cmm' | 'montaj' | 'boya' | 'depo';

export function makineCinsi(tip: IstasyonTipi | string, ad: string): MakineCinsi {
  if (tip === 'kalite') return 'cmm';
  if (tip === 'montaj') return 'montaj';
  if (tip === 'boya') return 'boya';
  if (tip === 'markalama') return 'lazer';
  if (tip === 'depo') return 'depo';
  const kucuk = ad.toLocaleLowerCase('tr');
  if (kucuk.includes('torna')) return 'torna';
  return kucuk.includes('5 eksen') || kucuk.includes('beş eksen') ? 'bes_eksen' : 'dik_isleme';
}

export const MAKINE_CINSI_ADI: Record<MakineCinsi, string> = {
  dik_isleme: 'Dik işleme merkezi', bes_eksen: '5 eksen işleme', torna: 'CNC torna', lazer: 'Lazer markalama', cmm: 'CMM ölçüm',
  montaj: 'Montaj tezgahı', boya: 'Boya kabini', depo: 'Depo',
};

// Başlamış emrin parçası parça modeliyle eşleşen istasyonlar (istasyon kimliği -> model). Emrin malzeme kartı varsa
// önce o kartla eşleşen kalemin modeli (ATL-36), yoksa parça numarası. Pasif istasyon ve parça modeli olmayan emir
// haritada yoktur.
// Makinede işlenen parçanın önizleme modeli (kart #1258): önce emrin malzemesine Çizim Merkezi'nde bağlı yayındaki model,
// yoksa harita kütüphanesinin kalem görünümü (malzeme kartıyla, sonra parça nosuyla eşleşen). `sirada`: istasyonda başlamış
// emir yok, model sıradaki planlı emrindir (sahnede soluk görünür).
export type ParcaModeli =
  | { kaynak: 'merkez'; malzemeNo: number; model: MerkezModeli; ad: string; sirada: boolean }
  | { kaynak: 'kutuphane'; model: IstasyonModeli; ad: string; sirada: boolean };

type ParcaEmri = Pick<Emir, 'parcaNo' | 'malzemeNo'>;

// Parçası haritada gösterilecek istasyonlar: istasyonun kendi yeri ve istasyona bağlı makinelerin yerleri. Makine olarak
// yerleştirilmiş istasyon da emrinin parçasını alır; aynı istasyon iki yolla da yerleşmişse bir kez sayılır.
export function parcaYerleri(bolumler: readonly Pick<YerlesimCevabi, 'istasyonYerleri' | 'makineYerleri'>[]): { istasyonId: number; aktif: boolean }[] {
  const sonuc = new Map<number, boolean>();
  for (const b of bolumler) {
    for (const y of b.istasyonYerleri) sonuc.set(y.istasyonId, (sonuc.get(y.istasyonId) ?? false) || y.aktif);
    for (const m of b.makineYerleri) {
      if (m.istasyon === null) continue;
      sonuc.set(m.istasyon.id, (sonuc.get(m.istasyon.id) ?? false) || (m.aktif && m.istasyon.aktif));
    }
  }
  return [...sonuc].map(([istasyonId, aktif]) => ({ istasyonId, aktif }));
}

export function istasyonParcalari(
  yerler: readonly Pick<IstasyonYeri, 'istasyonId' | 'aktif'>[],
  emirler: ReadonlyMap<number, ParcaEmri>,
  kalemler: readonly KalemGorunumu[],
  malzemeModelleri: ReadonlyMap<number, MerkezModeli> = new Map(),
  siradakiler: ReadonlyMap<number, ParcaEmri> = new Map(),
): Map<number, ParcaModeli> {
  const modeller = new Map(kalemler.flatMap((k) => (k.model ? [[parcaAnahtari(k.kod), k.model] as const] : [])));
  const kartModelleri = new Map(kalemler.flatMap((k) => (k.model && k.malzeme ? [[k.malzeme.no, k.model] as const] : [])));
  const sonuc = new Map<number, ParcaModeli>();
  for (const y of yerler) {
    if (!y.aktif) continue;
    const basladi = emirler.get(y.istasyonId);
    const emir = basladi ?? siradakiler.get(y.istasyonId);
    if (!emir) continue;
    const sirada = basladi === undefined;
    const merkez = emir.malzemeNo == null ? undefined : malzemeModelleri.get(emir.malzemeNo);
    if (merkez && emir.malzemeNo != null) {
      sonuc.set(y.istasyonId, { kaynak: 'merkez', malzemeNo: emir.malzemeNo, model: merkez, ad: merkez.ad, sirada });
      continue;
    }
    const kartModeli = emir.malzemeNo == null ? undefined : kartModelleri.get(emir.malzemeNo);
    const model = kartModeli ?? modeller.get(parcaAnahtari(emir.parcaNo));
    if (model) sonuc.set(y.istasyonId, { kaynak: 'kutuphane', model, ad: model.ad, sirada });
  }
  return sonuc;
}

// İstasyonun sıradaki işi: başlamamış planlı emirlerden en önce açılanı (plan sırası haritada okunmuyor).
export function siradakiEmirler(emirler: readonly Emir[]): Map<number, Emir> {
  const sonuc = new Map<number, Emir>();
  for (const e of emirler) {
    if (e.durum !== 'planli') continue;
    const var_ = sonuc.get(e.istasyon.id);
    if (!var_ || e.acilma < var_.acilma || (e.acilma === var_.acilma && e.id < var_.id)) sonuc.set(e.istasyon.id, e);
  }
  return sonuc;
}

// Depo: rafların en yoğun toplandığı yer (12 m içinde en çok komşusu olan rafın çevresi). Raflar salona dağılmışsa
// ortalama boş bir noktaya düşer; burada en kalabalık kümenin ortası ve ona en yakın raf alınır.
export function depoMerkezi<T extends { id: number; x: string; z: string }>(raflar: readonly T[]): { x: number; z: number; raf: T } | null {
  if (raflar.length === 0) return null;
  const k = raflar.map((r) => ({ r, x: Number(r.x), z: Number(r.z) }));
  const komsular = (a: (typeof k)[number]) => k.filter((b) => Math.hypot(a.x - b.x, a.z - b.z) <= 12);
  const merkezRaf = k.reduce((en, a) => (komsular(a).length > komsular(en).length ? a : en));
  const kume = komsular(merkezRaf);
  const x = kume.reduce((t, a) => t + a.x, 0) / kume.length;
  const z = kume.reduce((t, a) => t + a.z, 0) / kume.length;
  const yakin = kume.reduce((en, a) => (Math.hypot(a.x - x, a.z - z) < Math.hypot(en.x - x, en.z - z) ? a : en));
  return { x, z, raf: yakin.r };
}

const RAF_VARSAYILAN_BICIM: Record<RafTuru, YukBicimi> = { palet: 'koli', kucuk_parca: 'parca', konsol: 'cubuk', zemin: 'sac' };

// Raf yükü ve (rafta model gösterimiyse) dizilecek modeli.
export type RafYuku = GozYuku & { model: IstasyonModeli | null };

const AMBALAJ_BICIMI: Record<Exclude<KalemAmbalaji, 'otomatik'>, YukBicimi> = { koli: 'koli', kasa: 'kasa', kutu: 'parca', demet: 'cubuk', levha: 'sac' };

export const AMBALAJ_ADI: Record<KalemAmbalaji, string> = {
  otomatik: 'Otomatik (raf türünden)', koli: 'Koli', kasa: 'Ahşap kasa', kutu: 'Plastik kutu', demet: 'Demet (çubuk, profil, boru)', levha: 'Levha yığını',
};

export function gorunumHaritasi(kalemler: readonly KalemGorunumu[]): Map<string, KalemGorunumu> {
  return new Map(kalemler.map((k) => [parcaAnahtari(k.kod), k]));
}

// Gözün özeti: içindeki kalemler (çok dolduran önce) ve toplam doluluk (%; 100 üstü sunucuda reddedilir).
export interface GozOzeti {
  gozId: number;
  rafId: number;
  adres: string;
  bolme: number;
  kat: number;
  goz: number;
  toplam: number;
  kalemler: GozKalemi[];
}

export function gozOzetleri(kalemler: readonly GozKalemi[]): Map<number, GozOzeti> {
  const sonuc = new Map<number, GozOzeti>();
  for (const k of kalemler) {
    const o = sonuc.get(k.gozId) ?? { gozId: k.gozId, rafId: k.raf.id, adres: k.adres, bolme: k.bolme, kat: k.kat, goz: k.goz, toplam: 0, kalemler: [] };
    o.toplam += k.doluluk;
    o.kalemler.push(k);
    sonuc.set(k.gozId, o);
  }
  for (const o of sonuc.values()) o.kalemler.sort((a, b) => b.doluluk - a.doluluk || a.kod.localeCompare(b.kod, 'tr'));
  return sonuc;
}

// Göz kalemlerinden rafın çizilecek yükleri (raf kimliği -> yükler). Gözün görünümünü en çok dolduran kalem verir:
// rafta model seçiliyse parçanın kendi modeli dizilir, değilse seçilen ambalaj; görünüm yoksa raf türünün olağan
// yükü. Palet rafındaki küçük parça kolide durur. Pasif ve bilinmeyen raf atlanır.
export function gozKalemiYukleri(
  raflar: readonly Pick<Raf, 'id' | 'tur' | 'aktif'>[],
  kalemler: readonly GozKalemi[],
  gorunumler: readonly KalemGorunumu[] = [],
): Map<number, RafYuku[]> {
  const rafla = new Map(raflar.filter((r) => r.aktif).map((r) => [r.id, r]));
  const gorunum = gorunumHaritasi(gorunumler);
  const sonuc = new Map<number, RafYuku[]>();
  for (const o of gozOzetleri(kalemler).values()) {
    const raf = rafla.get(o.rafId);
    const baskin = o.kalemler[0];
    if (!raf || !baskin) continue;
    const k = gorunum.get(parcaAnahtari(baskin.kod));
    let bicim: YukBicimi = RAF_VARSAYILAN_BICIM[raf.tur];
    let model: IstasyonModeli | null = null;
    if (k?.rafta === 'model' && k.model) {
      bicim = 'model';
      model = k.model;
    } else if (k && k.ambalaj !== 'otomatik') {
      bicim = AMBALAJ_BICIMI[k.ambalaj];
    }
    if (raf.tur === 'palet' && bicim === 'parca') bicim = 'koli';
    const liste = sonuc.get(raf.id) ?? [];
    liste.push({ bolme: o.bolme, kat: o.kat, goz: o.goz, bicim, doluluk: Math.min(100, o.toplam) / 100, model });
    sonuc.set(raf.id, liste);
  }
  for (const l of sonuc.values()) l.sort((a, b) => a.bolme - b.bolme || a.kat - b.kat || a.goz - b.goz);
  return sonuc;
}

// Parça (kalem) listesi: göz kalemleri, kalem görünümleri ve üretim emirlerindeki parça numaralarının birleşimi.
// Makine bilgisi emirlerden çıkar (ayrı tablo yok): süren emrin istasyonu ve geçmiş emirlerin istasyonları.
export interface ParcaMakinesi {
  id: number;
  ad: string;
  emirSayisi: number;
  suruyor: boolean;
  // En son emrin başlama ya da açılma zamanı.
  son: string;
}

export interface ParcaSatiri {
  anahtar: string;
  kod: string;
  // Göz kaydındaki ya da emirdeki ad; ikisi de yoksa null.
  ad: string | null;
  gorunum: KalemGorunumu | null;
  // Kodun eşleştiği malzeme kartı (ATL-36); null: kart yok, ekranda uyarı.
  malzeme: KalemMalzemesi | null;
  gozler: GozKalemi[];
  makineler: ParcaMakinesi[];
}

export function parcaListesi(gozKalemleri: readonly GozKalemi[], gorunumler: readonly KalemGorunumu[], emirler: readonly Emir[]): ParcaSatiri[] {
  const satirlar = new Map<string, ParcaSatiri>();
  const satir = (kod: string): ParcaSatiri => {
    const a = parcaAnahtari(kod);
    const var_ = satirlar.get(a);
    if (var_) return var_;
    const yeni: ParcaSatiri = { anahtar: a, kod: kod.trim(), ad: null, gorunum: null, malzeme: null, gozler: [], makineler: [] };
    satirlar.set(a, yeni);
    return yeni;
  };
  for (const k of gorunumler) {
    const s = satir(k.kod);
    s.gorunum = k;
    s.malzeme ??= k.malzeme;
  }
  for (const g of gozKalemleri) {
    const s = satir(g.kod);
    s.gozler.push(g);
    s.ad ??= g.ad;
    s.malzeme ??= g.malzeme;
  }
  for (const e of emirler) {
    if (e.durum === 'iptal') continue;
    const s = satir(e.parcaNo);
    s.ad ??= e.parcaAd;
    const zaman = e.baslama ?? e.acilma;
    const m = s.makineler.find((x) => x.id === e.istasyon.id);
    if (m) {
      m.emirSayisi += 1;
      m.suruyor ||= e.durum === 'basladi';
      if (zaman > m.son) m.son = zaman;
    } else {
      s.makineler.push({ id: e.istasyon.id, ad: e.istasyon.ad, emirSayisi: 1, suruyor: e.durum === 'basladi', son: zaman });
    }
  }
  for (const s of satirlar.values()) {
    s.gozler.sort((a, b) => a.adres.localeCompare(b.adres, 'tr'));
    s.makineler.sort((a, b) => Number(b.suruyor) - Number(a.suruyor) || b.son.localeCompare(a.son));
  }
  return [...satirlar.values()].sort((a, b) => a.kod.localeCompare(b.kod, 'tr'));
}

// İstasyonda üretilen parçalar (emirlerden): süren önce, sonra en yeni.
export interface IstasyonParcasi {
  kod: string;
  ad: string;
  emirSayisi: number;
  suruyor: boolean;
  son: string;
}

export function istasyonunParcalari(istasyonId: number, emirler: readonly Emir[]): IstasyonParcasi[] {
  const sonuc = new Map<string, IstasyonParcasi>();
  for (const e of emirler) {
    if (e.istasyon.id !== istasyonId || e.durum === 'iptal') continue;
    const a = parcaAnahtari(e.parcaNo);
    const zaman = e.baslama ?? e.acilma;
    const p = sonuc.get(a);
    if (p) {
      p.emirSayisi += 1;
      p.suruyor ||= e.durum === 'basladi';
      if (zaman > p.son) p.son = zaman;
    } else {
      sonuc.set(a, { kod: e.parcaNo, ad: e.parcaAd, emirSayisi: 1, suruyor: e.durum === 'basladi', son: zaman });
    }
  }
  return [...sonuc.values()].sort((a, b) => Number(b.suruyor) - Number(a.suruyor) || b.son.localeCompare(a.son));
}

// Raf cephesinin bir hücresi (bölme, kat, göz) için anahtar.
export const hucreAnahtari = (bolme: number, kat: number, goz: number): string => `${bolme}-${kat}-${goz}`;

// Doluluğun ekran adı: %0 boş, 1-60 az, 61-90 dolu, 91-100 tam.
export type DolulukKademesi = 'bos' | 'az' | 'dolu' | 'tam';
export function dolulukKademesi(yuzde: number): DolulukKademesi {
  if (yuzde <= 0) return 'bos';
  if (yuzde <= 60) return 'az';
  return yuzde <= 90 ? 'dolu' : 'tam';
}

// Otomatik turun sırası: duran, duraklatılan, çalışan, bekleyen; aynı durumda kod sırası. Pasif istasyon atlanır.
const TUR_ONCELIGI: Record<MakineDurumu, number> = { durdu: 0, durakli: 1, ayar: 1, calisiyor: 2, sirada: 3, bitti: 3 };
export function turSirasi(yerler: readonly Pick<IstasyonYeri, 'istasyonId' | 'kod' | 'aktif'>[], durumlar: ReadonlyMap<number, MakineDurumu>): string[] {
  return yerler
    .filter((y) => y.aktif)
    .map((y) => ({ y, o: TUR_ONCELIGI[durumlar.get(y.istasyonId) ?? 'sirada'] }))
    .sort((a, b) => a.o - b.o || a.y.kod.localeCompare(b.y.kod, 'tr'))
    .map(({ y }) => `istasyon:${y.istasyonId}`);
}

// İstasyonun haritadaki nesnesi: makineleri yerleşikse kod sırasıyla ilk makinesi (istasyon yalnız çerçevedir),
// değilse istasyonun kendisi. Listeden, aramadan ve turdan seçim bu anahtara gider.
export function istasyonNesnesi(bolumler: readonly Pick<YerlesimCevabi, 'makineYerleri'>[], istasyonId: number): string {
  const ilk = bolumler.flatMap((b) => b.makineYerleri).filter((m) => m.istasyon?.id === istasyonId)
    .sort((a, b) => a.kod.localeCompare(b.kod, 'tr'))[0];
  return ilk ? `makine:${ilk.makineId}` : `istasyon:${istasyonId}`;
}

// Son hareket listesinde olayın adı ve rengi (emir modülünün olay türlerinden).
export const OLAY_GORUNUMU: Record<SonOlayTuru, { metin: string; durum: MakineDurumu }> = {
  ayar: { metin: 'Hazırlık', durum: 'ayar' },
  baslat: { metin: 'Başladı', durum: 'calisiyor' },
  devam: { metin: 'Devam etti', durum: 'calisiyor' },
  duraklat: { metin: 'Duraklatıldı', durum: 'durakli' },
  durdur: { metin: 'Durdu', durum: 'durdu' },
  bitir: { metin: 'Bitti', durum: 'bitti' },
  saglam: { metin: 'Sayım', durum: 'sirada' },
  hurda: { metin: 'Hurda', durum: 'durdu' },
  duzeltme: { metin: 'Düzeltme', durum: 'sirada' },
};

// Son hareketler listesinin satırı: üretim emirleri ve Arkon olayları tek zaman çizgisinde.
export interface HareketSatiri {
  anahtar: string;
  zaman: string;
  baslik: string;
  adet: string;
  ayrinti: string[];
  durum: MakineDurumu;
  metin: string;
  // Haritadaki yeri; istasyon kodu çözülemeyen Arkon olayında null (seçilmez).
  yer: { makine: { id: number } | null; istasyon: { id: number } } | null;
}

const ARKON_OLAY_GORUNUMU: Record<Exclude<ArkonSonOlayTuru, 'counts'>, { metin: string; durum: MakineDurumu }> = {
  events: { metin: 'Terminal', durum: 'sirada' },
  meas: { metin: 'Ölçüm', durum: 'sirada' },
  calls: { metin: 'Çağrı', durum: 'durakli' },
};

// ATL-40: Arkon olaylarından yalnız emre yansımayanlar alınır: sayım (`counts`) ve emre bağlı durum olayı (`events`, emir no dolu)
// üretim emirlerine de yazıldığından orada zaten vardır; ölçüm, çağrı ve emirsiz terminal olayı yalnız Arkon'dadır. Yeniden eskiye, en çok `sinir`.
export function sonHareketler(
  emirOlaylari: SonOlaylarCevabi['olaylar'],
  arkonOlaylari: ArkonSonOlaylarCevabi['olaylar'],
  sinir: number,
): HareketSatiri[] {
  const satirlar: HareketSatiri[] = emirOlaylari.map((o) => {
    const g = OLAY_GORUNUMU[o.olay];
    return {
      anahtar: `emir:${o.id}`,
      zaman: o.zaman,
      baslik: `${o.emir.emirNo} · ${o.emir.parcaNo}`,
      adet: o.adet === null ? (o.isEmri ? `Op ${o.isEmri.opNo} · ${o.isEmri.ad}` : o.emir.parcaNo) : `${o.adet > 0 ? '+' : ''}${sayiMetni(o.adet)} adet`,
      ayrinti: [o.makine ? o.makine.ad : o.istasyon.ad, o.kisi.ad, o.durusNedeni?.ad].filter((m): m is string => Boolean(m)),
      durum: g.durum,
      metin: g.metin,
      yer: { makine: o.makine, istasyon: o.istasyon },
    };
  });
  for (const o of arkonOlaylari) {
    if (o.tur === 'counts' || (o.tur === 'events' && o.emirNo !== null)) continue;
    const g = ARKON_OLAY_GORUNUMU[o.tur];
    satirlar.push({
      anahtar: `arkon:${o.id}`,
      zaman: o.zaman,
      baslik: o.emirNo ?? 'Emirsiz',
      adet: 'Terminal',
      ayrinti: [o.istasyonKodu ?? 'İstasyon bilinmiyor', o.kisi.ad].filter((m): m is string => Boolean(m)),
      durum: g.durum,
      metin: g.metin,
      yer: o.istasyonId === null ? null : { makine: null, istasyon: { id: o.istasyonId } },
    });
  }
  return satirlar.sort((a, b) => Date.parse(b.zaman) - Date.parse(a.zaman)).slice(0, sinir);
}

// ATL-39: olayın haritadaki nesnesi: makinesi haritadaysa makine, değilse istasyonun nesnesi.
export function olayNesnesi(
  bolumler: readonly Pick<YerlesimCevabi, 'makineYerleri'>[],
  olay: { makine: { id: number } | null; istasyon: { id: number } },
): string {
  const m = olay.makine;
  if (m && bolumler.some((b) => b.makineYerleri.some((y) => y.makineId === m.id))) return `makine:${m.id}`;
  return istasyonNesnesi(bolumler, olay.istasyon.id);
}

export function saatMetni(zaman: string | null): string | null {
  if (zaman === null) return null;
  const t = new Date(zaman);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
