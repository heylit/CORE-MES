// TMI vardiya takvimindeki tatil ve kapalı günler (kv 'holidays', sunucu `arkonTatilleri`): o gün başlayan vardiya yoktur.
export interface TatilGunu { type: 'tatil' | 'kapali'; name: string | null }
export type Tatiller = Readonly<Record<string, TatilGunu>>;

const iki = (n: number): string => String(n).padStart(2, '0');
// Tesis günü cihazın yerel günüdür (Arkon vardiya pencerelerini yerel saatle kurar).
export const gunAnahtari = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`; };

export const kapaliGun = (tatiller: Tatiller, ms: number): TatilGunu | null => tatiller[gunAnahtari(ms)] ?? null;

export const kapaliGunEtiketi = (g: TatilGunu): string => (g.name ?? (g.type === 'tatil' ? 'Tatil' : 'Kapalı gün'));

// Bozuk ya da eski biçimli ayar yok sayılır: tatil yok.
export function tatilleriOku(v: unknown): Tatiller {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, g]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && !!g && typeof g === 'object'
    && ((g as TatilGunu).type === 'tatil' || (g as TatilGunu).type === 'kapali')).map(([k, g]) => [k, { type: (g as TatilGunu).type, name: typeof (g as TatilGunu).name === 'string' ? (g as TatilGunu).name : null }]));
}
