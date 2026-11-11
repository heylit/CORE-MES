import { OZEL_OLCU_SINIRI } from '#paylasilan/etiket-sabitleri.ts';
import type { OzelOlcu } from '#paylasilan/sozlesme/etiket-merkezi.ts';

// Standart dışı rulo cihaza bağlıdır (rulo yazıcının içindedir): girilen ölçü şablon başına bu tarayıcıda kalır, sunucuya gitmez.
const ANAHTAR = 'coremes.etiket-merkezi.ozel-olcu';

// Virgül de ondalık ayırıcıdır; en çok bir ondalık. Geçersizse hata metni döner.
export function olcuCoz(en: string, boy: string): { olcu: OzelOlcu | null; enHatasi?: string; boyHatasi?: string } {
  const sayi = (d: string) => (d.trim() === '' ? Number.NaN : Number(d.trim().replace(',', '.')));
  const denetle = (ad: string, v: number, enCok: number) => {
    if (!Number.isFinite(v)) return `${ad} mm olarak yazılır.`;
    if (v < OZEL_OLCU_SINIRI.enAz || v > enCok) return `${ad} ${OZEL_OLCU_SINIRI.enAz} ile ${enCok} mm arasında olur.`;
    if (Math.round(v * 10) !== v * 10) return `${ad} en çok bir ondalıkla yazılır.`;
    return undefined;
  };
  const g = sayi(en);
  const y = sayi(boy);
  const enHatasi = denetle('En', g, OZEL_OLCU_SINIRI.enCokEn);
  const boyHatasi = denetle('Boy', y, OZEL_OLCU_SINIRI.enCokBoy);
  return { olcu: enHatasi || boyHatasi ? null : { genislik: g, yukseklik: y }, ...(enHatasi ? { enHatasi } : {}), ...(boyHatasi ? { boyHatasi } : {}) };
}

const gecerli = (x: unknown): x is OzelOlcu => {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.genislik === 'number' && typeof o.yukseklik === 'number' && olcuCoz(String(o.genislik), String(o.yukseklik)).olcu !== null;
};

export function ozelOlculeriCoz(ham: string | null): Record<string, OzelOlcu> {
  if (ham === null) return {};
  try {
    const v: unknown = JSON.parse(ham);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, o]) => gecerli(o))) as Record<string, OzelOlcu>;
  } catch { return {}; }
}

export function ozelOlcuOku(sablonAnahtar: string): OzelOlcu | null {
  try { return ozelOlculeriCoz(localStorage.getItem(ANAHTAR))[sablonAnahtar] ?? null; } catch { return null; }
}

// null kaydı kaldırır: şablon kendi ölçüsüyle basılır.
export function ozelOlcuYaz(sablonAnahtar: string, olcu: OzelOlcu | null): void {
  try {
    const liste = ozelOlculeriCoz(localStorage.getItem(ANAHTAR));
    if (olcu === null) delete liste[sablonAnahtar]; else liste[sablonAnahtar] = olcu;
    localStorage.setItem(ANAHTAR, JSON.stringify(liste));
  } catch { /* depolama kapalı: ölçü bu açılışta kalır */ }
}

export const olcuYazisi = (o: { genislik: number; yukseklik: number }): string =>
  `${String(o.genislik).replace('.', ',')}x${String(o.yukseklik).replace('.', ',')} mm`;
