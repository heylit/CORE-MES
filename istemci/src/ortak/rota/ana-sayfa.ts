import type { ComponentType } from 'react';
import { islemMi, type Islem } from '#paylasilan/islemler.ts';
import { maddeGorunurMu } from '#paylasilan/sayfalar.ts';

// Pano bölümleri; ana sayfada bu sırayla dizilir. Kişinin panosu rolünden değil işlemlerinden çıkar: birden çok rolü olan
// kişi rollerinin açtığı kartların hepsini görür.
// Şirket özeti yöneticinin bütün işletmeye bakışıdır (kart #664); modül kartını yönetici işlemiyle (ayarlar.yaz) bildirir.
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
      if (kart.islem !== undefined && !islemMi(kart.islem)) throw new Error(`Kartın işlemi kayıtlı değil: ${kart.islem} (${dosya})`);
      if (kart.veya !== undefined) {
        if (kart.islem === undefined || kart.veya.length === 0) throw new Error(`Kartın "veya" listesi işlemle ve dolu verilir: ${kart.anahtar} (${dosya})`);
        const kayitsiz = kart.veya.find((i) => !islemMi(i));
        if (kayitsiz !== undefined) throw new Error(`Kartın işlemi kayıtlı değil: ${kayitsiz} (${dosya})`);
      }
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

export function gorunenKartlar(kartlar: readonly AnaSayfaKarti[], islemler: readonly string[]): AnaSayfaKarti[] {
  return kartlar
    .filter((k) => k.islem === undefined || maddeGorunurMu({ islem: k.islem, veya: k.veya }, islemler))
    .sort((a, b) => a.sira - b.sira || a.anahtar.localeCompare(b.anahtar));
}

export const anaSayfaKartlari: readonly AnaSayfaKarti[] = kartlariTopla(
  import.meta.glob('../../moduller/*/ana-sayfa.tsx', { eager: true }),
);

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
