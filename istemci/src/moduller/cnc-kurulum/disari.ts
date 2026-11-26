// CNC Kurulum'un başka modüllere açtığı tek kapı (istemci). Takımhane kütüphaneyi buradan okur (3762): tek kütüphane, iki liste yok.
import { state } from './yeni/depo.ts';
import { allShelves } from './yeni/kutuphane/raf.ts';
import { invKey } from './yeni/secici.ts';
import type { Kalem } from './yeni/veri/tipler.ts';

export interface KutuphaneKalemi {
  // Stok kartının `cncKutuphaneKimligi` alanıyla eşleşen kimlik (lv_ öneki düşer, kurulumdaki stok anahtarıyla aynı).
  kimlik: string;
  ad: string;
  kod: string | null;
}
export interface KutuphaneRafi {
  anahtar: string;
  baslik: string;
  kalemler: KutuphaneKalemi[];
}

type OzelKalem = Partial<Kalem> & { id: string; name: string };

// Hazır katalog istemcidedir, atölyenin eklediği kalemler sunucudaki CNC kaydından gelir. Raf kuruluşu CNC ekranıyla aynı
// işlevden geçer; özel kalemler yalnız bu çağrı süresince yerleştirilir, açık CNC durumu değişmeden kalır.
export function kutuphaneRaflari(ozelKalemler: readonly OzelKalem[]): KutuphaneRafi[] {
  const onceki = state.custom;
  state.custom = ozelKalemler.map((k) => ({ ...k, kind: k.kind ?? '' }));
  try {
    const gorulen = new Set<string>();
    return allShelves().map((r) => ({
      anahtar: r.key,
      baslik: r.title,
      kalemler: r.items.flatMap((k) => {
        const kimlik = invKey(k);
        if (gorulen.has(kimlik)) return [];
        gorulen.add(kimlik);
        return [{ kimlik, ad: k.name, kod: k.code ?? null }];
      }),
    })).filter((r) => r.kalemler.length > 0);
  } finally {
    state.custom = onceki;
  }
}
