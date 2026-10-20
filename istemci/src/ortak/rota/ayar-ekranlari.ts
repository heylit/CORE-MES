import type { ComponentType } from 'react';
import { islemMi, type Islem } from '#paylasilan/islemler.ts';
import { maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { SIMGELER, type SimgeAdi } from '../tasarim/simgeler.ts';

// Modülün kendi sayfasındaki ayar ekranı Sistem Ayarları'nda da açılır (istemci/src/moduller/<ad>/ayar-ekranlari.tsx).
// Tek kaynak: aynı bileşen, aynı uçlar; kabuk yalnız yeri, sırayı ve görünürlüğü verir. Yazma yetkisi modülün ucundadır.
export interface AyarEkrani {
  // Sistem Ayarları'nda tekil; küçük harf, rakam, tire.
  anahtar: string;
  // Bölüm başlığı: modülün adı.
  baslik: string;
  simge?: SimgeAdi;
  // Küçük önce gelir; eşitte anahtar sırası.
  sira: number;
  // Modülün ayar menü maddesindeki işlem: ekran orada kimde görünüyorsa burada da onda görünür.
  islem: Islem;
  veya?: readonly Islem[];
  ekran: ComponentType;
  // Dış sistem bağlantısının ayarı Modül ayarları yerine Bağlantılar'da, kendi sistemin alt sekmesinde açılır.
  bolum?: 'baglanti';
}

const ANAHTAR_BICIMI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// dosyalar: glob çıktısı (dosya yolu -> modül). Hata açılışta, dosyayı söyleyerek: yanlış bildirilen ekran sessizce düşmesin.
export function ayarEkranlariniTopla(dosyalar: Record<string, unknown>): AyarEkrani[] {
  const sahip = new Map<string, string>();
  const toplam: AyarEkrani[] = [];
  for (const dosya of Object.keys(dosyalar).sort()) {
    const { ayarEkranlari } = dosyalar[dosya] as { ayarEkranlari?: unknown };
    if (!Array.isArray(ayarEkranlari)) throw new Error(`Modül ayar ekranı dizisi vermiyor (export const ayarEkranlari): ${dosya}`);
    for (const e of ayarEkranlari as AyarEkrani[]) {
      if (!ANAHTAR_BICIMI.test(e.anahtar)) throw new Error(`Ayar ekranı anahtarı biçime uymuyor: "${e.anahtar}" (${dosya})`);
      if (typeof e.baslik !== 'string' || e.baslik.trim() === '') throw new Error(`Ayar ekranının başlığı boş: ${e.anahtar} (${dosya})`);
      if (!Number.isFinite(e.sira)) throw new Error(`Ayar ekranı sırası sayı değil: ${e.anahtar} (${dosya})`);
      if (!islemMi(e.islem)) throw new Error(`Ayar ekranının işlemi kayıtlı değil: ${String(e.islem)} (${e.anahtar}, ${dosya})`);
      if (e.veya !== undefined) {
        if (e.veya.length === 0) throw new Error(`Ayar ekranının "veya" listesi dolu verilir: ${e.anahtar} (${dosya})`);
        const kayitsiz = e.veya.find((i) => !islemMi(i));
        if (kayitsiz !== undefined) throw new Error(`Ayar ekranının işlemi kayıtlı değil: ${kayitsiz} (${e.anahtar}, ${dosya})`);
      }
      if (e.bolum !== undefined && e.bolum !== 'baglanti') throw new Error(`Ayar ekranının bölümü tanınmıyor: ${String(e.bolum)} (${e.anahtar}, ${dosya})`);
      if (e.simge !== undefined && !(e.simge in SIMGELER)) throw new Error(`Ayar ekranının simgesi ortak sette yok: ${e.simge} (${e.anahtar}, ${dosya})`);
      if (typeof e.ekran !== 'function' && (typeof e.ekran !== 'object' || e.ekran === null)) {
        throw new Error(`Ayar ekranının bileşeni yok: ${e.anahtar} (${dosya})`);
      }
      const onceki = sahip.get(e.anahtar);
      if (onceki !== undefined) throw new Error(`Aynı anahtarla iki ayar ekranı verildi: ${e.anahtar} (${onceki}, ${dosya})`);
      sahip.set(e.anahtar, dosya);
      toplam.push(e);
    }
  }
  return toplam;
}

// Görünürlük menü maddesininkiyle aynıdır: işlem ya da "veya" listesinden biri.
export function gorunenAyarEkranlari(ekranlar: readonly AyarEkrani[], islemler: readonly string[]): AyarEkrani[] {
  return ekranlar
    .filter((e) => maddeGorunurMu({ islem: e.islem, veya: e.veya }, islemler))
    .sort((a, b) => a.sira - b.sira || a.anahtar.localeCompare(b.anahtar));
}

export const ayarEkranlari: readonly AyarEkrani[] = ayarEkranlariniTopla(
  import.meta.glob('../../moduller/*/ayar-ekranlari.tsx', { eager: true }),
);
