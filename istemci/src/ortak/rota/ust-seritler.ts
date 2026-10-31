import type { ComponentType } from 'react';
import { islemMi, type Islem } from '#paylasilan/islemler.ts';
import { seritRolGorunurMu } from '#paylasilan/rol-gorunumleri.ts';
import { maddeGorunurMu } from '#paylasilan/sayfalar.ts';

// Bütün sayfaların en üstünde, kabuğun tam genişliğinde duran modül şeridi (istemci/src/moduller/<ad>/ust-serit.tsx; 939).
// Kabuk yalnız yeri, sırayı ve görünürlüğü verir; içerik ve yazma yetkisi modülündür.
export interface UstSerit {
  // Tekil; küçük harf, rakam, tire.
  anahtar: string;
  // Küçük üstte; eşitte anahtar sırası.
  sira: number;
  // 'oturum': giriş yapmış herkes görür.
  islem: Islem | 'oturum';
  serit: ComponentType;
}

const ANAHTAR_BICIMI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// dosyalar: glob çıktısı (dosya yolu -> modül). Hata açılışta, dosyayı söyleyerek: yanlış bildirilen şerit sessizce düşmesin.
export function ustSeritleriTopla(dosyalar: Record<string, unknown>): UstSerit[] {
  const sahip = new Map<string, string>();
  const toplam: UstSerit[] = [];
  for (const dosya of Object.keys(dosyalar).sort()) {
    const { ustSeritler } = dosyalar[dosya] as { ustSeritler?: unknown };
    if (!Array.isArray(ustSeritler)) throw new Error(`Modül üst şerit dizisi vermiyor (export const ustSeritler): ${dosya}`);
    for (const s of ustSeritler as UstSerit[]) {
      if (!ANAHTAR_BICIMI.test(s.anahtar)) throw new Error(`Üst şerit anahtarı biçime uymuyor: "${s.anahtar}" (${dosya})`);
      if (!Number.isFinite(s.sira)) throw new Error(`Üst şerit sırası sayı değil: ${s.anahtar} (${dosya})`);
      if (s.islem !== 'oturum' && !islemMi(s.islem)) throw new Error(`Üst şeridin işlemi kayıtlı değil: ${String(s.islem)} (${s.anahtar}, ${dosya})`);
      if (typeof s.serit !== 'function' && (typeof s.serit !== 'object' || s.serit === null)) throw new Error(`Üst şeridin bileşeni yok: ${s.anahtar} (${dosya})`);
      const onceki = sahip.get(s.anahtar);
      if (onceki !== undefined) throw new Error(`Aynı anahtarla iki üst şerit verildi: ${s.anahtar} (${onceki}, ${dosya})`);
      sahip.set(s.anahtar, dosya);
      toplam.push(s);
    }
  }
  return toplam;
}

export function gorunenUstSeritler(seritler: readonly UstSerit[], islemler: readonly string[]): UstSerit[] {
  return seritler
    .filter((s) => s.islem === 'oturum' || maddeGorunurMu({ islem: s.islem }, islemler))
    .sort((a, b) => a.sira - b.sira || a.anahtar.localeCompare(b.anahtar));
}

// Rolle sınırlı şerit (1394 a, kur ve faiz) yalnız o rollerde kalır; sınırsız şerit herkesin işlem süzgecine gider.
export function rolSeritleri(seritler: readonly UstSerit[], roller: readonly string[] | undefined): readonly UstSerit[] {
  return seritler.filter((s) => seritRolGorunurMu(s.anahtar, roller));
}

export const ustSeritler: readonly UstSerit[] = ustSeritleriTopla(
  import.meta.glob('../../moduller/*/ust-serit.tsx', { eager: true }),
);
