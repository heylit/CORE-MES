import type { IkMotoru, Prim, Tesvik } from '../motor.ts';

// P1'in motordan okuduğu kısa yollar; tipler motor.ts'ten gelir.
export type { Prim, Tesvik };

export const ayar = (m: IkMotoru, anahtar: string): unknown => m.S()[anahtar];
export const varsayilanTesvik = (m: IkMotoru): Tesvik | null => m.tesvikById(String(ayar(m, 'varsayilanTesvik') ?? ''));
// Kişiye özel prim değeri sayıysa primin değerinin yerine geçer.
export const kisiselPrim = (p: Prim, v: unknown): Prim => (typeof v === 'number' && Number.isFinite(v) ? { ...p, deger: v } : p);
