// zod taşımaz: istemci değer olarak ithal eder (eslint.config.js ZODSUZ).
// Adım Durumu matrisi (3604): toplu elle statü yazımının kalem kararı. Sunucu bu karara göre yazar, ekran aynı karardan "yazılır / atlanır"
// sayımını önceden gösterir; ikisi tek dosyadan okur ki sayım ile sonuç ayrışmasın.
import type { AdimStatusu, ElleYazilanStatu, EmirDurumu } from './uretim-emirleri.ts';

// Tek istekte en çok kalem ve ekranın ek onay istediği eşik (Kurgu 3604).
export const TOPLU_EN_COK_KALEM = 100;
export const TOPLU_EK_ONAY_ESIGI = 50;
export const ADIM_NOTU_EN_COK = 500;

// Sistem statüsü terminalde canlı çalışmayı söyleyen adımlar: elle statü operatörün ekranında canlı durumu örter (Arayüz Y4).
export const CALISAN_STATULER = ['uretimde', 'duraklatildi', 'durdu'] as const satisfies readonly AdimStatusu[];
export const calisanMi = (statu: AdimStatusu): boolean => (CALISAN_STATULER as readonly string[]).includes(statu);

export type AtlamaNedeni = 'emir-kapali' | 'beklemede' | 'adim-bitti' | 'calisiyor' | 'elle-yok';
export const ATLAMA_METNI: Readonly<Record<AtlamaNedeni, string>> = {
  'emir-kapali': 'emir bitti ya da iptal',
  beklemede: 'emir beklemede',
  'adim-bitti': 'adım bitti',
  calisiyor: 'adım şu an çalışıyor',
  'elle-yok': 'elle statü yok',
};
export const ATLAMA_SIRASI: readonly AtlamaNedeni[] = ['emir-kapali', 'beklemede', 'adim-bitti', 'calisiyor', 'elle-yok'];

export interface KalemGirdisi {
  emirDurumu: EmirDurumu;
  // Adımın şu anki sistem statüsü (sunucuda hesaplanan; ekranda matrisin gösterdiği).
  sistemStatusu: AdimStatusu;
  elleVar: boolean;
  // statu: yazılacak statü; null: otomatiğe dön.
  statu: ElleYazilanStatu | null;
  // Tek hücreden uyarıyla yazım: çalışan adım yalnız bu açıkken yazılır (toplu yazımda kapalı, Risk kararı 3604).
  calisanOnay: boolean;
}
export type KalemKarari = { yazilir: true } | { yazilir: false; neden: AtlamaNedeni };

export function kalemKarari(g: KalemGirdisi): KalemKarari {
  if (g.emirDurumu === 'bitti' || g.emirDurumu === 'iptal') return { yazilir: false, neden: 'emir-kapali' };
  if (g.statu === null) return g.elleVar ? { yazilir: true } : { yazilir: false, neden: 'elle-yok' };
  // 3050 a: emir beklemedeyse statü bekletmeden gelir, elle statü onu örtmez.
  if (g.sistemStatusu === 'beklemede') return { yazilir: false, neden: 'beklemede' };
  // Biten adımın sistem statüsü bir daha değişmez; elle statü "sistem statüsü değişince düşer" güvencesini yitirir (3604, tek ve toplu yol).
  if (g.sistemStatusu === 'bitti') return { yazilir: false, neden: 'adim-bitti' };
  if (calisanMi(g.sistemStatusu) && !g.calisanOnay) return { yazilir: false, neden: 'calisiyor' };
  return { yazilir: true };
}

export interface YazimSayimi {
  yazilir: number;
  atlanir: number;
  // Atlanan kalemin nedeni başına sayı, ATLAMA_SIRASI sırasıyla; yalnız sayısı olanlar.
  nedenler: { neden: AtlamaNedeni; sayi: number }[];
  // Yazılacak kalemlerden sistem statüsü çalışan olanların sayısı (tek hücre uyarısı için).
  calisanUyarisi: number;
}
export function yazimSayimi(kalemler: readonly KalemGirdisi[]): YazimSayimi {
  const sayi = new Map<AtlamaNedeni, number>();
  let yazilir = 0;
  let calisanUyarisi = 0;
  for (const k of kalemler) {
    const karar = kalemKarari(k);
    if (karar.yazilir) {
      yazilir += 1;
      if (k.statu !== null && calisanMi(k.sistemStatusu)) calisanUyarisi += 1;
    } else sayi.set(karar.neden, (sayi.get(karar.neden) ?? 0) + 1);
  }
  const nedenler = ATLAMA_SIRASI.flatMap((neden) => (sayi.has(neden) ? [{ neden, sayi: sayi.get(neden) ?? 0 }] : []));
  return { yazilir, atlanir: kalemler.length - yazilir, nedenler, calisanUyarisi };
}
