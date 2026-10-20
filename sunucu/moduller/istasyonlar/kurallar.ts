import type { Islem } from '#paylasilan/islemler.ts';
import type { Istasyon, KapasiteKaynagi, SecimGrubu } from '#paylasilan/sozlesme/istasyonlar.ts';

// Makine durumunu bakımcı, vardiya sorumlusu ve müdür de değiştirir; tanımlar yöneticide kalır (karar 263 a). Uç ve dışa açık komut aynı kümeyi arar.
export const MAKINE_DURUMU_ISLEMLERI = ['istasyonlar.yaz', 'istasyonlar.makine-durumu'] as const satisfies readonly Islem[];

// Arıza bildirimi yalnız arızaya geçişte gider; arıza sürerken yazılan açıklama ya da yeniden "arıza" yinelemez.
export const arizayaGectiMi = (onceki: string | null, yeni: string): boolean => yeni === 'ariza' && onceki !== 'ariza';

export const KULLANIMDA_ILETISI = 'Kullanımdaki kayıt silinemez; pasife alın.';

// Kısıt listesi boşsa kişi her iş merkezinde çalışır (null: kısıt yok).
export function isMerkeziIzinliMi(izinli: readonly number[] | null, isMerkeziId: number): boolean {
  return izinli === null || izinli.length === 0 || izinli.includes(isMerkeziId);
}

// Kişinin kısıtını yalnız kendisi, tesisi yöneten ve sınırı değiştirebilen amir okur.
export function kisitiOkuyabilirMi(okuyan: { id: number; islemler: readonly string[] }, kisiId: number): boolean {
  return okuyan.id === kisiId || okuyan.islemler.includes('istasyonlar.yaz') || okuyan.islemler.includes('arkon.amir');
}

// Sınır güvenlik içindir: kişi kendi sınırını kaldıramaz; yalnız bütün işlemleri taşıyan (yönetici) kendisininkini değiştirir (karar 245 a).
export const kendiKisitiniYazabilirMi = (yazanId: number, kisiId: number, yazanBayrakli: boolean): boolean => yazanId !== kisiId || yazanBayrakli;

export interface SecimSatiri extends Istasyon {
  isMerkeziKod: string;
  isMerkeziAd: string;
}

// Seçim listesi iş merkezine göre gruplanır; grup sırası iş merkezi kodu, içi istasyon kodudur.
// Pasif istasyon listede görünmez; kişi kısıtlıysa yalnız izinli iş merkezlerinin grupları kalır.
export function secimGruplari(satirlar: readonly SecimSatiri[], izinli: readonly number[] | null): SecimGrubu[] {
  const gruplar = new Map<number, SecimGrubu>();
  const gorunur = satirlar
    .filter((s) => s.aktif && isMerkeziIzinliMi(izinli, s.isMerkeziId))
    .sort((a, b) => a.isMerkeziKod.localeCompare(b.isMerkeziKod) || a.kod.localeCompare(b.kod));
  for (const { isMerkeziKod, isMerkeziAd, ...istasyon } of gorunur) {
    const grup = gruplar.get(istasyon.isMerkeziId)
      ?? { isMerkeziId: istasyon.isMerkeziId, isMerkeziKod, isMerkeziAd, istasyonlar: [] };
    grup.istasyonlar.push(istasyon);
    gruplar.set(istasyon.isMerkeziId, grup);
  }
  return [...gruplar.values()];
}

// Kısıta yalnız aktif iş merkezi eklenir (pasif iş merkezi kısıt listesinde görünmez); listede zaten
// olan pasif satır korunur, kişinin kaydı kendiliğinden değişmez.
export function kisiteEklenemeyenler(
  istenen: readonly number[],
  mevcut: readonly number[],
  aktifler: readonly number[],
): number[] {
  return istenen.filter((id) => !mevcut.includes(id) && !aktifler.includes(id));
}

export const tekrarsiz = (idler: readonly number[]): number[] => [...new Set(idler)];

// Bilgi alanına ya da atamaya yalnız var olan, aktif kişi yazılır.
export function atamaReddi(kisi: { aktif: boolean } | undefined): string | null {
  if (kisi === undefined) return 'Kişi bulunamadı.';
  return kisi.aktif ? null : 'Pasif kişi atanamaz.';
}

export type AtamaTuru = 'istasyon' | 'makine' | 'ekip';

// sent: yüzdenin yüzde biri (1250 = %12,50), ondalık hatasız toplamak için; null: o tarihten itibaren çıkarıldı.
export interface AtamaSatiri {
  tur: AtamaTuru;
  hedefId: number;
  baslangic: string;
  sent: number | null;
}

export const YUZDE_TAVANI_SENT = 10000;

// Metin sözleşmede doğrulanmıştır (en çok üç tam, iki ondalık basamak).
export function yuzdeSente(metin: string): number {
  const [tam = '0', kesir = ''] = metin.split('.');
  return Number(tam) * 100 + Number(kesir.padEnd(2, '0'));
}

// 1250 -> "12.5", 6000 -> "60": iletide gösterilecek biçim.
export function sentBicimi(sent: number): string {
  const kesir = sent % 100;
  const tam = (sent - kesir) / 100;
  return kesir === 0 ? String(tam) : `${tam}.${String(kesir).padStart(2, '0').replace(/0$/, '')}`;
}

// Kapasite kaynağı girilmemiş istasyon makineli sayılır (VARSAYIM, kart #1146): kaynak girilmeden önce yazılan istasyonlar talaşlı
// tezgahlardır; insanlı istasyonda kaynak açıkça "insan" seçilir. Kaynak sonradan girilince okuma kendiliğinden düzelir.
export function kapasiteKaynagiCoz(kaynak: KapasiteKaynagi | null): { kaynak: KapasiteKaynagi; varsayilan: boolean } {
  return kaynak === null ? { kaynak: 'makine', varsayilan: true } : { kaynak, varsayilan: false };
}

// 15000 -> "150.00": sözleşmedeki yüzde metni biçimi (iki ondalık).
export const sentYuzdeMetni = (sent: number): string => `${Math.floor(sent / 100)}.${String(sent % 100).padStart(2, '0')}`;

const ayniHedef = (s: AtamaSatiri, tur: AtamaTuru, hedefId: number): boolean => s.tur === tur && s.hedefId === hedefId;

// Bir tarihte geçerli atamalar: her hedef için o tarihe kadarki en son satır; yüzdesi boş olan çıkarılmış demektir.
export function gecerliAtamalar(satirlar: readonly AtamaSatiri[], tarih: string): AtamaSatiri[] {
  const son = new Map<string, AtamaSatiri>();
  for (const s of satirlar) {
    if (s.baslangic > tarih) continue;
    const anahtar = `${s.tur}:${s.hedefId}`;
    const onceki = son.get(anahtar);
    if (onceki === undefined || onceki.baslangic < s.baslangic) son.set(anahtar, s);
  }
  return [...son.values()].filter((s) => s.sent !== null);
}

// Yeni değişikliğin geçerli olacağı pencerede toplamı değişebilecek günler: başlangıç ve penceredeki başka hedeflerin
// değişiklik günleri. Pencere, aynı hedefin sonraki kendi değişikliğinde biter: o günden sonrasını o satır belirler.
export function kontrolTarihleri(satirlar: readonly AtamaSatiri[], tur: AtamaTuru, hedefId: number, baslangic: string): string[] {
  const sonraki = satirlar
    .filter((s) => ayniHedef(s, tur, hedefId) && s.baslangic > baslangic)
    .map((s) => s.baslangic)
    .sort()[0];
  const gunler = satirlar
    .filter((s) => !ayniHedef(s, tur, hedefId) && s.baslangic > baslangic && (sonraki === undefined || s.baslangic < sonraki))
    .map((s) => s.baslangic);
  return [...new Set([baslangic, ...gunler])].sort();
}

// Kişinin bu hedefe verilebilecek en çok yüzdesi: tavandan, penceredeki en yüklü günde diğer hedeflerin toplamı düşülür.
// Atama açık uçludur (bitiş tarihi yok): ileride başlayan yük de pencereye girer; tarih, sınırı koyan en yüklü gündür
// (eşitlikte en erken). İleti, sınır başlangıçtan sonraki bir günden geliyorsa o günü söyler.
export function kalanYuk(
  satirlar: readonly AtamaSatiri[], tur: AtamaTuru, hedefId: number, baslangic: string,
): { kalan: number; tarih: string } {
  const digerleri = satirlar.filter((s) => !ayniHedef(s, tur, hedefId));
  let enYuklu = { yuk: -1, tarih: baslangic };
  for (const tarih of kontrolTarihleri(satirlar, tur, hedefId, baslangic)) {
    const yuk = gecerliAtamalar(digerleri, tarih).reduce((toplam, s) => toplam + (s.sent ?? 0), 0);
    if (yuk > enYuklu.yuk) enYuklu = { yuk, tarih };
  }
  return { kalan: YUZDE_TAVANI_SENT - enYuklu.yuk, tarih: enYuklu.tarih };
}

// Kişi aynı anda tek ekibin üyesidir (IK6): pencerede başka bir ekipte geçerli üyelik varsa engelleyen satır döner
// (iletide ekip ve başlangıç tarihi). Pasif ekip de sayılır: ekibi pasife almak üyeliği bitirmez.
export function ekipCakismasi(satirlar: readonly AtamaSatiri[], ekipId: number, baslangic: string): AtamaSatiri | null {
  const ekipler = satirlar.filter((s) => s.tur === 'ekip');
  for (const tarih of kontrolTarihleri(ekipler, 'ekip', ekipId, baslangic)) {
    const baska = gecerliAtamalar(ekipler, tarih).find((s) => s.hedefId !== ekipId);
    if (baska !== undefined) return baska;
  }
  return null;
}

// "2026-10-18" -> "18.10.2026": iletide gösterilecek biçim.
export const gunBicimi = (tarih: string): string => tarih.split('-').reverse().join('.');

// Atama ileriye işler: geçmiş tarihli değişiklik kabul edilmez (bugün ve sonrası).
export const gecmisTarihliMi = (baslangic: string, bugun: string): boolean => baslangic < bugun;

// IS29 (karar 146 a): yetkinlik geçerlilik bitişine kadar (o gün dahil) geçerlidir; bitişsiz yetkinlik süresizdir. Süresi dolan
// yetkinlik listede kalır, iş başlatmaz, plan kapasitesine ve iş merkezi kapsamına girmez.
export const yetkinlikGecerliMi = (gecerlilikBitis: string | null, gun: string): boolean => gecerlilikBitis === null || gecerlilikBitis >= gun;

// IS29: liste yazımı yalnız farkı uygular; kalan yetkinliğin veren, verilme, bitiş ve dayanağı korunur.
export function yetkinlikFarki(mevcut: readonly number[], istenen: readonly number[]): { eklenen: number[]; kaldirilan: number[] } {
  return { eklenen: istenen.filter((i) => !mevcut.includes(i)), kaldirilan: mevcut.filter((i) => !istenen.includes(i)) };
}
