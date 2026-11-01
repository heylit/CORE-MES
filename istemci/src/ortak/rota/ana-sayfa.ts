import type { ComponentType } from 'react';
import { islemMi, type Islem } from '#paylasilan/islemler.ts';
import { maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import type { Aciliyet, IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';

// Pano bölümleri; ana sayfada bu sırayla dizilir. Kişinin panosu rolünden değil işlemlerinden çıkar: birden çok rolü olan
// kişi rollerinin açtığı kartların hepsini görür.
// Şirket özeti yönetici ve müdürün bütün işletmeye bakışıdır (kart #664, 73 b); bölüm pano.sirket-ozeti ister, kart ayrıca kendi okumasını.
export const ANA_SAYFA_BOLUMLERI = [
  { anahtar: 'yonetim', baslik: 'Şirket özeti' },
  { anahtar: 'is', baslik: 'Bana düşen işler' },
  { anahtar: 'uyari', baslik: 'Uyarılar' },
  { anahtar: 'ozet', baslik: 'Özet' },
  // Grafik kartları (GrafikKarti) en altta: sayılar önce okunur, eğilim sonra.
  { anahtar: 'grafik', baslik: 'Eğilimler' },
] as const;
export type AnaSayfaBolumu = (typeof ANA_SAYFA_BOLUMLERI)[number]['anahtar'];

// Ana sayfa kabuğundur; modül yalnız kartını bildirir (istemci/src/moduller/<ad>/ana-sayfa.tsx).
export interface AnaSayfaKarti {
  // Ana sayfada tekil; küçük harf, rakam, tire.
  anahtar: string;
  // Küçük önce gelir; eşitte anahtar sırası.
  sira: number;
  // Verilmezse oturumu olan herkes görür. Veri yetkisi uçtadır; bu yalnız kartın görünmesidir.
  islem?: Islem;
  // Menü maddesindeki gibi: işlem ya da listedekilerden biri kartı gösterir.
  veya?: readonly Islem[];
  // Geniş ekranda iki sütunu da kaplar.
  genis?: boolean;
  // Verilmezse kart bölümlerin altında, başlıksız durur (talep formu, sistem durumu gibi).
  bolum?: AnaSayfaBolumu;
  ekran: ComponentType;
}

const ANAHTAR_BICIMI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// dosyalar: glob çıktısı (dosya yolu -> modül). Hata açılışta, dosyayı söyleyerek: yanlış bildirilen kart sessizce düşmesin.
export function kartlariTopla(dosyalar: Record<string, unknown>): AnaSayfaKarti[] {
  const sahip = new Map<string, string>();
  const toplam: AnaSayfaKarti[] = [];
  for (const dosya of Object.keys(dosyalar).sort()) {
    const { anaSayfaKartlari } = dosyalar[dosya] as { anaSayfaKartlari?: unknown };
    if (!Array.isArray(anaSayfaKartlari)) throw new Error(`Modül kart dizisi vermiyor (export const anaSayfaKartlari): ${dosya}`);
    for (const kart of anaSayfaKartlari as AnaSayfaKarti[]) {
      if (!ANAHTAR_BICIMI.test(kart.anahtar)) throw new Error(`Kart anahtarı biçime uymuyor: "${kart.anahtar}" (${dosya})`);
      if (!Number.isFinite(kart.sira)) throw new Error(`Kart sırası sayı değil: ${kart.anahtar} (${dosya})`);
      islemDenetle(kart.islem, kart.veya, kart.anahtar, dosya);
      if (kart.bolum !== undefined && !ANA_SAYFA_BOLUMLERI.some((b) => b.anahtar === kart.bolum)) {
        throw new Error(`Kartın bölümü tanımsız: ${String(kart.bolum)} (${kart.anahtar}, ${dosya})`);
      }
      const onceki = sahip.get(kart.anahtar);
      if (onceki !== undefined) throw new Error(`Aynı anahtarla iki kart verildi: ${kart.anahtar} (${onceki}, ${dosya})`);
      sahip.set(kart.anahtar, dosya);
      toplam.push(kart);
    }
  }
  return toplam;
}

// Şirket özeti bölümü ayrıca bölüm işlemini ister (73 b): kartın kendi okuma işlemi olan başka rol o kartı bu bölümde görmez.
const SIRKET_OZETI_ISLEMI: Islem = 'pano.sirket-ozeti';

export function gorunenKartlar(kartlar: readonly AnaSayfaKarti[], islemler: readonly string[]): AnaSayfaKarti[] {
  const sirketOzeti = islemler.includes(SIRKET_OZETI_ISLEMI);
  return kartlar
    .filter((k) => k.bolum !== 'yonetim' || sirketOzeti)
    .filter((k) => k.islem === undefined || maddeGorunurMu({ islem: k.islem, veya: k.veya }, islemler))
    .sort((a, b) => a.sira - b.sira || a.anahtar.localeCompare(b.anahtar));
}

// Rolün kart listesi (1390 a): null süzgeç yoktur. Yalnız görünürlüktür; kart yine kendi işlemiyle süzülür.
// Kaynaklar da aynı listeyle süzülür: kart ve kaynak anahtarları tek ad alanıdır.
export function rolKartlari<T extends { anahtar: string }>(kartlar: readonly T[], izinli: ReadonlySet<string> | null): readonly T[] {
  return izinli === null ? kartlar : kartlar.filter((k) => izinli.has(k.anahtar));
}

// Rol panosunun kaynağı (kart 1585): modül kart çizmez, iş kalemi ya da gidişat ölçüsü bildirir; kabuk birleştirir.
// Kaynak ekranı görünmez çizilir ve verisini pano-baglami.ts'teki kancayla bildirir.
export interface AnaSayfaKaynagi {
  // Kartlarla ortak ad alanı; küçük harf, rakam, tire.
  anahtar: string;
  tur: 'is' | 'gidisat';
  // İş listesinde süzgeç ve satır etiketi (Plan, Malzeme); gidişatta kullanılmaz.
  baslik: string;
  simge: SimgeAdi;
  // Eşit aciliyette ve gidişatta küçük önce.
  sira: number;
  islem?: Islem;
  veya?: readonly Islem[];
  // İş kaynağı boş döndüğünde "yolunda" satırına düşen kısa metin; verilmezse boş kaynak hiç görünmez.
  yolunda?: string;
  kaynak: ComponentType;
}

function islemDenetle(islem: Islem | undefined, veya: readonly Islem[] | undefined, anahtar: string, dosya: string): void {
  if (islem !== undefined && !islemMi(islem)) throw new Error(`Kartın işlemi kayıtlı değil: ${islem} (${dosya})`);
  if (veya === undefined) return;
  if (islem === undefined || veya.length === 0) throw new Error(`Kartın "veya" listesi işlemle ve dolu verilir: ${anahtar} (${dosya})`);
  const kayitsiz = veya.find((i) => !islemMi(i));
  if (kayitsiz !== undefined) throw new Error(`Kartın işlemi kayıtlı değil: ${kayitsiz} (${dosya})`);
}

// Kaynak dizisi isteğe bağlıdır; anahtar kartlarla çakışırsa iki dosya söylenir.
export function kaynaklariTopla(dosyalar: Record<string, unknown>, kartlar: readonly AnaSayfaKarti[] = []): AnaSayfaKaynagi[] {
  const sahip = new Map<string, string>(kartlar.map((k) => [k.anahtar, 'kart']));
  const toplam: AnaSayfaKaynagi[] = [];
  for (const dosya of Object.keys(dosyalar).sort()) {
    const { anaSayfaKaynaklari } = dosyalar[dosya] as { anaSayfaKaynaklari?: unknown };
    if (anaSayfaKaynaklari === undefined) continue;
    if (!Array.isArray(anaSayfaKaynaklari)) throw new Error(`Modülün kaynak listesi dizi değil (export const anaSayfaKaynaklari): ${dosya}`);
    for (const k of anaSayfaKaynaklari as AnaSayfaKaynagi[]) {
      if (!ANAHTAR_BICIMI.test(k.anahtar)) throw new Error(`Kaynak anahtarı biçime uymuyor: "${k.anahtar}" (${dosya})`);
      if (!Number.isFinite(k.sira)) throw new Error(`Kaynak sırası sayı değil: ${k.anahtar} (${dosya})`);
      if (k.tur !== 'is' && k.tur !== 'gidisat') throw new Error(`Kaynağın türü tanımsız: ${String(k.tur)} (${k.anahtar}, ${dosya})`);
      islemDenetle(k.islem, k.veya, k.anahtar, dosya);
      const onceki = sahip.get(k.anahtar);
      if (onceki !== undefined) throw new Error(`Aynı anahtarla iki kaynak ya da kart verildi: ${k.anahtar} (${onceki}, ${dosya})`);
      sahip.set(k.anahtar, dosya);
      toplam.push(k);
    }
  }
  return toplam;
}

export function gorunenKaynaklar(kaynaklar: readonly AnaSayfaKaynagi[], islemler: readonly string[]): AnaSayfaKaynagi[] {
  return kaynaklar
    .filter((k) => k.islem === undefined || maddeGorunurMu({ islem: k.islem, veya: k.veya }, islemler))
    .sort((a, b) => a.sira - b.sira || a.anahtar.localeCompare(b.anahtar));
}

// Sözleşmedeki ACILIYETLER sırası; istemci paylasilan'dan değer ithal etmez. Kayıt tipi her aciliyeti ister: biri eklenirse derleme durur.
const ACILIYET_DERECESI: Readonly<Record<Aciliyet, number>> = { gecikmis: 0, bekliyor: 1, bugun: 2, hafta: 3 };

export interface IsSatiri { kalem: IsKalemi; kaynak: AnaSayfaKaynagi }

// Modüller arası tek sıra: aciliyet, sonra erken son tarih (tarihsiz sonda), sonra kaynağın sırası, sonra kalem anahtarı.
export function islerSirala(satirlar: readonly IsSatiri[]): IsSatiri[] {
  const derece = (s: IsSatiri) => ACILIYET_DERECESI[s.kalem.aciliyet];
  const zaman = (s: IsSatiri) => (s.kalem.sonTarih === null ? Number.POSITIVE_INFINITY : Date.parse(s.kalem.sonTarih));
  return [...satirlar].sort((a, b) => derece(a) - derece(b) || zaman(a) - zaman(b) || a.kaynak.sira - b.kaynak.sira
    || a.kaynak.anahtar.localeCompare(b.kaynak.anahtar) || a.kalem.anahtar.localeCompare(b.kalem.anahtar));
}

const MODUL_DOSYALARI = import.meta.glob('../../moduller/*/ana-sayfa.tsx', { eager: true });

export const anaSayfaKartlari: readonly AnaSayfaKarti[] = kartlariTopla(MODUL_DOSYALARI);
export const anaSayfaKaynaklari: readonly AnaSayfaKaynagi[] = kaynaklariTopla(MODUL_DOSYALARI, anaSayfaKartlari);

export interface KartGrubu {
  // Başlıksız grup: bölüm bildirmeyen kartlar.
  bolum: (typeof ANA_SAYFA_BOLUMLERI)[number] | null;
  kartlar: AnaSayfaKarti[];
}

// Boş bölüm verilmez; bölümsüz kartlar en sonda. Bölüm içinde sıra korunur.
export function bolumlereAyir(kartlar: readonly AnaSayfaKarti[]): KartGrubu[] {
  const gruplar: KartGrubu[] = ANA_SAYFA_BOLUMLERI.map((bolum) => ({ bolum, kartlar: kartlar.filter((k) => k.bolum === bolum.anahtar) }));
  gruplar.push({ bolum: null, kartlar: kartlar.filter((k) => k.bolum === undefined) });
  return gruplar.filter((g) => g.kartlar.length > 0);
}
