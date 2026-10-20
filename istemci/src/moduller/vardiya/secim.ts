import type { TopluRetAyrintisi } from '#paylasilan/sozlesme/vardiya.ts';
import { ApiHatasi } from '../../ortak/veri/api.ts';

// Toplu düzenlemede gün kısayolları (ISO gün: 1 pazartesi ... 7 pazar).
export const GUN_KISAYOLLARI = [
  { baslik: 'Hafta içi', gunler: [1, 2, 3, 4, 5] },
  { baslik: 'Hafta sonu', gunler: [6, 7] },
  { baslik: 'Tüm hafta', gunler: [1, 2, 3, 4, 5, 6, 7] },
] as const;

export function degistir<T>(kume: ReadonlySet<T>, deger: T): Set<T> {
  const yeni = new Set(kume);
  if (yeni.has(deger)) yeni.delete(deger); else yeni.add(deger);
  return yeni;
}

// Görünen satırların hepsi seçiliyse seçimden çıkarılır, değilse hepsi eklenir; görünmeyen seçimler korunur.
export function hepsiniDegistir<T>(kume: ReadonlySet<T>, gorunen: readonly T[]): Set<T> {
  const yeni = new Set(kume);
  const hepsi = gorunen.length > 0 && gorunen.every((d) => yeni.has(d));
  for (const d of gorunen) if (hepsi) yeni.delete(d); else yeni.add(d);
  return yeni;
}

// Kod alanları büyük harfli ASCII'dir (IM-A); Türkçe küçültme I'yı ı yapar. İ, I, ı ve i aynı harf sayılır: "im" de "ım" de IM-A'yı bulur.
const sade = (s: string): string => s.toLocaleLowerCase('tr-TR').replaceAll('ı', 'i');
export const aramaUyar = (metin: string, ...alanlar: readonly string[]): boolean => {
  const a = sade(metin.trim());
  return a === '' || alanlar.some((x) => sade(x).includes(a));
};

// Toplu komut kapsam dışı kayıtta 403 döner ve reddedilen kayıtları ayrıntıda sayar; ekran nedeni o satıra yazar.
export function reddedilenler(hata: unknown, alan: keyof TopluRetAyrintisi): number[] {
  if (!(hata instanceof ApiHatasi)) return [];
  const ayrinti = hata.govde.ayrinti as Record<string, unknown> | null | undefined;
  const liste = typeof ayrinti === 'object' && ayrinti !== null ? ayrinti[alan] : undefined;
  return Array.isArray(liste) ? liste.filter((x): x is number => typeof x === 'number') : [];
}
