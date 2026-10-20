import { TESIS_SAAT_DILIMI } from '#paylasilan/tesis-zamani.ts';

// Derleme anında vite.config.ts yazar.
declare const __TMI_DERLEME__: { surum: string; tarih: string; commit: string | null };

export interface DerlemeBilgisi {
  surum: string;
  // ISO zaman.
  tarih: string;
  commit: string | null;
}

export const DERLEME: DerlemeBilgisi = __TMI_DERLEME__;

export const kisaCommit = (commit: string | null): string | null => (commit === null ? null : commit.slice(0, 7));

export function derlemeTarihi(tarih: string, saatli = false): string {
  const saat = saatli ? { hour: '2-digit', minute: '2-digit' } as const : {};
  return new Date(tarih).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', ...saat, timeZone: TESIS_SAAT_DILIMI });
}
