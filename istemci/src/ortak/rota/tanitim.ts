import type { ComponentType } from 'react';
import { acikModulDosyalari } from '#paylasilan/sayfalar.ts';
import { SIMGELER, type SimgeAdi } from '../tasarim/simgeler.ts';

// Tanıtım konuları (istemci/src/moduller/<ad>/tanitim.tsx, 3535 a): Tanıtım sayfasındaki her konunun içeriği ekranın sahibi
// modüldedir ki ekran değişince aynı yerde güncellensin. Modül yalnız içeriği verir; konu listesi ve sayfa Profil'indir.
// İçerik örnek veriyle çizer, istek atmaz; bu yüzden konu yetki istemez, sayfayı gören her konuyu görür.
export interface TanitimKonusu {
  // Tekil; küçük harf, rakam, tire. Adreste ?konu= olarak durur.
  anahtar: string;
  // Küçük önce gelir; eşitte anahtar sırası.
  sira: number;
  baslik: string;
  // Konunun bulunduğu yer (menü grubu ya da sayfa), listede başlığın altında.
  alt: string;
  simge: SimgeAdi;
  icerik: ComponentType;
}

const ANAHTAR_BICIMI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// dosyalar: glob çıktısı (dosya yolu -> modül). Hata açılışta, dosyayı söyleyerek: yanlış bildirilen konu sessizce düşmesin.
export function tanitimKonulariTopla(dosyalar: Record<string, unknown>): TanitimKonusu[] {
  const sahip = new Map<string, string>();
  const toplam: TanitimKonusu[] = [];
  for (const dosya of Object.keys(dosyalar).sort()) {
    const { tanitimKonulari } = dosyalar[dosya] as { tanitimKonulari?: unknown };
    if (!Array.isArray(tanitimKonulari)) throw new Error(`Modül tanıtım konusu dizisi vermiyor (export const tanitimKonulari): ${dosya}`);
    for (const k of tanitimKonulari as TanitimKonusu[]) {
      if (!ANAHTAR_BICIMI.test(k.anahtar)) throw new Error(`Tanıtım konusu anahtarı biçime uymuyor: "${k.anahtar}" (${dosya})`);
      if (!Number.isFinite(k.sira)) throw new Error(`Tanıtım konusunun sırası sayı değil: ${k.anahtar} (${dosya})`);
      if (k.baslik.trim() === '' || !(k.simge in SIMGELER)) throw new Error(`Tanıtım konusunun başlığı ya da simgesi eksik: ${k.anahtar} (${dosya})`);
      if (typeof k.icerik !== 'function' && (typeof k.icerik !== 'object' || k.icerik === null)) {
        throw new Error(`Tanıtım konusunun bileşeni yok: ${k.anahtar} (${dosya})`);
      }
      const onceki = sahip.get(k.anahtar);
      if (onceki !== undefined) throw new Error(`Aynı anahtarla iki tanıtım konusu verildi: ${k.anahtar} (${onceki}, ${dosya})`);
      sahip.set(k.anahtar, dosya);
      toplam.push(k);
    }
  }
  return toplam.sort((a, b) => a.sira - b.sira || a.anahtar.localeCompare(b.anahtar));
}

export const tanitimKonulari: readonly TanitimKonusu[] = tanitimKonulariTopla(
  acikModulDosyalari(import.meta.glob(['../../moduller/*/tanitim.tsx', '!../../moduller/portal/**', '!../../moduller/mesaj/**'], { eager: true })),
);
