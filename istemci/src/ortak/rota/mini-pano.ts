import type { ComponentType } from 'react';
import { islemMi, type Islem } from '#paylasilan/islemler.ts';
import { acikModulDosyalari, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { SIMGELER, type SimgeAdi } from '../tasarim/simgeler.ts';

// Mini pano (istemci/src/moduller/<ad>/mini-pano.tsx): uygulama küçültülse de öteki programların üstünde duran küçük
// pencerenin içeriği. Modül yalnız içeriği verir; pencere, sekme ve açma düğmesi kabuğundur. Veri yetkisi modülün ucundadır.
export interface MiniPano {
  // Tekil; küçük harf, rakam, tire.
  anahtar: string;
  // Küçük önce gelir; eşitte anahtar sırası.
  sira: number;
  baslik: string;
  simge: SimgeAdi;
  islem: Islem;
  // Menü maddesindeki gibi: işlem ya da listedekilerden biri panoyu gösterir.
  veya?: readonly Islem[];
  ekran: ComponentType;
}

const ANAHTAR_BICIMI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// dosyalar: glob çıktısı (dosya yolu -> modül). Hata açılışta, dosyayı söyleyerek: yanlış bildirilen pano sessizce düşmesin.
export function miniPanolariTopla(dosyalar: Record<string, unknown>): MiniPano[] {
  const sahip = new Map<string, string>();
  const toplam: MiniPano[] = [];
  for (const dosya of Object.keys(dosyalar).sort()) {
    const { miniPanolar } = dosyalar[dosya] as { miniPanolar?: unknown };
    if (!Array.isArray(miniPanolar)) throw new Error(`Modül mini pano dizisi vermiyor (export const miniPanolar): ${dosya}`);
    for (const p of miniPanolar as MiniPano[]) {
      if (!ANAHTAR_BICIMI.test(p.anahtar)) throw new Error(`Mini pano anahtarı biçime uymuyor: "${p.anahtar}" (${dosya})`);
      if (!Number.isFinite(p.sira)) throw new Error(`Mini pano sırası sayı değil: ${p.anahtar} (${dosya})`);
      if (p.baslik.trim() === '' || !(p.simge in SIMGELER)) throw new Error(`Mini panonun başlığı ya da simgesi eksik: ${p.anahtar} (${dosya})`);
      for (const i of [p.islem, ...(p.veya ?? [])]) {
        if (!islemMi(i)) throw new Error(`Mini panonun işlemi kayıtlı değil: ${String(i)} (${p.anahtar}, ${dosya})`);
      }
      if (typeof p.ekran !== 'function' && (typeof p.ekran !== 'object' || p.ekran === null)) {
        throw new Error(`Mini panonun bileşeni yok: ${p.anahtar} (${dosya})`);
      }
      const onceki = sahip.get(p.anahtar);
      if (onceki !== undefined) throw new Error(`Aynı anahtarla iki mini pano verildi: ${p.anahtar} (${onceki}, ${dosya})`);
      sahip.set(p.anahtar, dosya);
      toplam.push(p);
    }
  }
  return toplam;
}

export function gorunenMiniPanolar(panolar: readonly MiniPano[], islemler: readonly string[]): MiniPano[] {
  return panolar
    .filter((p) => maddeGorunurMu({ islem: p.islem, veya: p.veya }, islemler))
    .sort((a, b) => a.sira - b.sira || a.anahtar.localeCompare(b.anahtar));
}

export const miniPanolar: readonly MiniPano[] = miniPanolariTopla(
  acikModulDosyalari(import.meta.glob(['../../moduller/*/mini-pano.tsx', '!../../moduller/portal/**', '!../../moduller/mesaj/**'], { eager: true })),
);
