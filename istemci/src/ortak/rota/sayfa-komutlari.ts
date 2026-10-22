import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import type { CerceveKomutu } from './cerceve-iletisi.ts';
import { useEkranGorunur } from './kalici.tsx';

// Açık sayfanın o an çalıştırabileceği komut; Ctrl K paletinde "Bu sayfa" grubunda görünür. Komut yetki vermez: sayfa
// yalnız kişinin o an yapabileceğini koyar, yazma yine sayfanın mevcut ucundadır.
export interface SayfaKomutu {
  // Kaynak içinde tekil.
  anahtar: string;
  baslik: string;
  simge: SimgeAdi;
  aciklama: string | null;
  sozcukler: readonly string[];
  calistir: () => void;
}

// Kaynak: komutları bildiren sayfa ya da çerçeve (genellikle menü kökü). `komutlar` null: o kaynağın listesi silinir.
export type SayfaKomutYazici = (kaynak: string, komutlar: readonly SayfaKomutu[] | null) => void;

export const SayfaKomutBaglami = createContext<SayfaKomutYazici | null>(null);

const KOMUTSUZ: readonly SayfaKomutu[] = [];
export const VARSAYILAN_KOMUT_SIMGESI: SimgeAdi = 'bolt';

// Sayfa komutlarını kabuğa bildirir; bileşen kalkınca ya da kalıcı ekran gizlenince liste silinir. Kabuk yoksa (test,
// gömülü ekran) düşer. `komutlar` her çizimde yeni dizi olabilir: kayıt içerik değişince yenilenir, `calistir` hep son
// verilendir.
export function useSayfaKomutlari(kaynak: string, komutlar: readonly SayfaKomutu[] | null): void {
  const yaz = useContext(SayfaKomutBaglami);
  const gorunur = useEkranGorunur();
  const son = useRef(komutlar ?? KOMUTSUZ);
  son.current = komutlar ?? KOMUTSUZ;
  // Anahtar, başlık ve sözcük değişmedikçe kabuktaki liste yenilenmez; calistir son çizimden okunur.
  const imza = (komutlar ?? KOMUTSUZ).map((k) => [k.anahtar, k.baslik, k.simge, k.aciklama ?? '', k.sozcukler.join(' ')].join('\u0000')).join('\u0001');
  const kayit = useMemo<readonly SayfaKomutu[]>(
    () => son.current.map((k) => ({ ...k, calistir: () => { son.current.find((s) => s.anahtar === k.anahtar)?.calistir(); } })),
    [imza],
  );

  useEffect(() => {
    if (yaz === null) return undefined;
    yaz(kaynak, gorunur && kayit.length > 0 ? kayit : null);
    return () => { yaz(kaynak, null); };
  }, [yaz, kaynak, gorunur, kayit]);
}

// Çerçevenin bildirdiği komutlar kabuk komutuna çevrilir; seçilince anahtar çerçeveye döner.
export function cerceveKomutlarindan(komutlar: readonly CerceveKomutu[], calistir: (anahtar: string) => void): SayfaKomutu[] {
  return komutlar.map((k) => ({
    anahtar: k.anahtar,
    baslik: k.baslik,
    simge: k.simge ?? VARSAYILAN_KOMUT_SIMGESI,
    aciklama: k.aciklama ?? null,
    sozcukler: k.sozcukler ?? [],
    calistir: () => { calistir(k.anahtar); },
  }));
}
