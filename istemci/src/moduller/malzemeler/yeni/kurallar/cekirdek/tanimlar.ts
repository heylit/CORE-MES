import { OPT_FAM_KEY, OPT_ICON, OPT_KEY } from './durum.ts';
import type { AileSecenegi, Kalite, OzellikDegerleri, Sozluk } from './tipler.ts';

export function G(ad: string, kod: string, p: OzellikDegerleri, std?: string, eq?: Sozluk<string>): Kalite { return ({ ad, kod, p, std: std || '', eq: eq || {} }); }
export function svgI(d: string, cls?: string): string { return (`<svg viewBox="0 0 32 32" class="${cls || ''}" aria-hidden="true">${d}</svg>`); }
export function optIcon(fam: string | null | undefined, o: AileSecenegi): string | undefined { const famKey: Sozluk<Sozluk<string>> = OPT_FAM_KEY, key: Sozluk<string> = OPT_KEY, icon: Sozluk<string> = OPT_ICON; const k = ((fam != null && famKey[fam] && famKey[fam][o.k])) || key[o.k] || 'wrench'; return icon[k]; }
