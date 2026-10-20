import { useEffect, useState } from 'react';
import {
  KAYIT_ARAMA_EN_COK_SONUC,
  KAYIT_ARAMA_EN_KISA,
  KAYIT_ARAMA_EN_UZUN,
  kayitYoluMu,
  type KayitAramaSonucu,
} from '#paylasilan/sayfa-tanimi.ts';
import { api } from './api.ts';

export const KAYIT_ARAMA_BEKLEME_MS = 250;
const KAYIT_ARAMA_ZAMAN_ASIMI_MS = 5_000;

// Kabuğun sorduğu modül: arama ucu ve sonuçların yanında görünen ad.
export interface KayitKaynagi {
  uc: `/${string}`;
  ad: string;
}

export interface KayitAramasi {
  sonuclar: readonly (KayitAramaSonucu & { kaynak: string })[];
  // Cevabı gelmemiş kaynak var: "Sonuç yok" erken yazılmaz.
  suruyor: boolean;
}

// Cevap sözleşmeye uymuyorsa o kaynak sonuçsuz sayılır; tek tek bozuk satırlar (uygulama dışı adres dahil) düşer. İstemci zod taşımaz.
export function kayitCevabiniOku(ham: unknown): KayitAramaSonucu[] {
  if (ham === null || typeof ham !== 'object' || !('sonuclar' in ham) || !Array.isArray(ham.sonuclar)) return [];
  const sonuc: KayitAramaSonucu[] = [];
  for (const s of ham.sonuclar as unknown[]) {
    if (s === null || typeof s !== 'object') continue;
    const { anahtar, baslik, aciklama, yol } = s as Record<string, unknown>;
    if (typeof anahtar !== 'string' || anahtar === '' || typeof baslik !== 'string' || baslik.trim() === '') continue;
    if (!kayitYoluMu(yol)) continue;
    sonuc.push({ anahtar, baslik, aciklama: typeof aciklama === 'string' && aciklama.trim() !== '' ? aciklama : null, yol });
  }
  return sonuc.slice(0, KAYIT_ARAMA_EN_COK_SONUC);
}

export const kayitSorgusu = (sorgu: string): string | null => {
  const q = sorgu.trim();
  return q.length < KAYIT_ARAMA_EN_KISA || q.length > KAYIT_ARAMA_EN_UZUN ? null : q;
};

const BOS: KayitAramasi = { sonuclar: [], suruyor: false };

// Yazma durunca her kaynağa bir kez sorulur; yeni harf eski istekleri keser. Hata ya da yetkisizlik o kaynağı sonuçsuz
// bırakır, ötekiler gelir. Sonuçlar kaynak sırasıyla dizilir: cevabın geliş sırası listeyi oynatmaz.
export function useKayitAramasi(kaynaklar: readonly KayitKaynagi[], sorgu: string): KayitAramasi {
  const [durum, durumYaz] = useState<KayitAramasi>(BOS);
  const q = kayitSorgusu(sorgu);

  useEffect(() => {
    if (q === null || kaynaklar.length === 0) {
      durumYaz(BOS);
      return undefined;
    }
    durumYaz((d) => ({ ...d, suruyor: true }));
    const kesici = new AbortController();
    const gelen = new Map<string, readonly (KayitAramaSonucu & { kaynak: string })[]>();
    const yansit = () => {
      if (kesici.signal.aborted) return;
      durumYaz({
        sonuclar: kaynaklar.flatMap((k) => gelen.get(k.uc) ?? []),
        suruyor: gelen.size < kaynaklar.length,
      });
    };
    const zamanlayici = setTimeout(() => {
      for (const k of kaynaklar) {
        void api.get<unknown>(`${k.uc}?q=${encodeURIComponent(q)}`, { zamanAsimiMs: KAYIT_ARAMA_ZAMAN_ASIMI_MS, sinyal: kesici.signal })
          .then(
            (ham) => kayitCevabiniOku(ham).map((s) => ({ ...s, anahtar: `${k.uc}#${s.anahtar}`, kaynak: k.ad })),
            () => [],
          )
          .then((liste) => { gelen.set(k.uc, liste); yansit(); });
      }
    }, KAYIT_ARAMA_BEKLEME_MS);
    return () => {
      clearTimeout(zamanlayici);
      kesici.abort();
    };
  }, [kaynaklar, q]);

  return q === null ? BOS : durum;
}
