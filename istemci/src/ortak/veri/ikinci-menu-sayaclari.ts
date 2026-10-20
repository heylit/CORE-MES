import { useEffect, useState } from 'react';
import type { IkinciMenuSayaclari } from '#paylasilan/sayfa-tanimi.ts';
import { api } from './api.ts';

export const SAYAC_ARALIGI_MS = 30_000;
const SAYAC_ZAMAN_ASIMI_MS = 10_000;

// Cevap sözleşmeye uymuyorsa (nesne değil) sayı yoktur; tek tek bozuk değerler null olur. İstemci zod taşımaz.
export function sayaclariOku(ham: unknown): IkinciMenuSayaclari | null {
  if (ham === null || typeof ham !== 'object' || Array.isArray(ham)) return null;
  const sonuc: IkinciMenuSayaclari = {};
  for (const [anahtar, deger] of Object.entries(ham)) {
    sonuc[anahtar] = typeof deger === 'number' && Number.isInteger(deger) && deger >= 0 ? deger : null;
  }
  return sonuc;
}

// İçerik eşitliği: aynı sayılar için önceki nesne korunur, menü ölçümü ve kaydırması yeniden tetiklenmez.
export function sayaclarAyniMi(a: Readonly<IkinciMenuSayaclari> | null, b: Readonly<IkinciMenuSayaclari> | null): boolean {
  if (a === null || b === null) return a === b;
  const anahtarlar = Object.keys(a);
  return anahtarlar.length === Object.keys(b).length && anahtarlar.every((k) => k in b && a[k] === b[k]);
}

// İkinci menünün sayıları. İçerik değişmediyse önceki nesne korunur: kabuk her okumada yeniden çizilmez. Uç yoksa, cevap gelmediyse ya da hata olduysa null: menü sayısız çalışır, eski sayı
// doğruymuş gibi kalmaz. Sayfa görünmezken sunucu yoklanmaz; yeniden görününce beklemeden okunur.
export function useIkinciMenuSayaclari(uc: string | undefined): IkinciMenuSayaclari | null {
  const [sayaclar, sayaclariYaz] = useState<IkinciMenuSayaclari | null>(null);

  useEffect(() => {
    sayaclariYaz(null);
    if (uc === undefined) return undefined;
    let bitti = false;
    let ucusta = false;
    const kesici = new AbortController();
    const oku = () => {
      if (ucusta || document.visibilityState === 'hidden') return;
      ucusta = true;
      void api.get<unknown>(uc, { zamanAsimiMs: SAYAC_ZAMAN_ASIMI_MS, sinyal: kesici.signal })
        .then(
          (ham) => {
            const yeni = sayaclariOku(ham);
            if (!bitti) sayaclariYaz((onceki) => (sayaclarAyniMi(onceki, yeni) ? onceki : yeni));
          },
          () => { if (!bitti) sayaclariYaz(null); },
        )
        .finally(() => { ucusta = false; });
    };
    oku();
    const sayac = setInterval(oku, SAYAC_ARALIGI_MS);
    document.addEventListener('visibilitychange', oku);
    return () => {
      bitti = true;
      kesici.abort();
      clearInterval(sayac);
      document.removeEventListener('visibilitychange', oku);
    };
  }, [uc]);

  return sayaclar;
}
