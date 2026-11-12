import { createContext, useContext } from 'react';
import type { PlanVerisi } from './tipler.ts';
import type { EmirNo } from './ortak/emir-no.ts';

// Kaynak (tezgâh, kişi, fasoncu) ve tezgâh grubunun ekrandaki adı. Plan verisinde kaynak kimliği veritabanı numarasıdır ("5", "kisi-4", "@2");
// kullanıcı tezgâhı kodundan tanır (ORN-CNC-T1), kişiyi ve fasoncuyu adından. Kod ya da ad yoksa kimlik yazılır (fasonun @ işareti düşer).
// Sipariş kimliği emrin iç kimliğidir; ekranda emir no (ortak/emir-no.ts).
export interface KaynakAdlari { kaynak: (m: string) => string; grup: (g: string) => string; emir: EmirNo }
const KISI = 'kisi-';
const cip = (m: string) => (m.startsWith('@') ? m.slice(1) : m);
export const KIMLIK_ADLARI: KaynakAdlari = { kaynak: cip, grup: (g) => g, emir: (j) => j };

export function kaynakAdlariKur(D: Pick<PlanVerisi, 'tezgahlar' | 'fasoncular'> | null | undefined, emir: EmirNo = KIMLIK_ADLARI.emir): KaynakAdlari {
  if (!D) return { ...KIMLIK_ADLARI, emir };
  const k = new Map<string, string>(), g = new Map<string, string>();
  for (const t of D.tezgahlar) {
    const ad = t.kod || (t.id.startsWith(KISI) ? t.ad : null);
    if (ad) k.set(t.id, ad);
    if (t.grup != null) { const ga = t.grupKod || t.grupAd; if (ga && !g.has(String(t.grup))) g.set(String(t.grup), ga); }
  }
  for (const f of D.fasoncular ?? []) if (f.ad) k.set(`@${f.id}`, f.ad);
  return { kaynak: (m) => k.get(m) ?? cip(m), grup: (x) => g.get(x) ?? x, emir };
}

export const KaynakAdlariBaglami = createContext<KaynakAdlari>(KIMLIK_ADLARI);
export const useKaynakAdlari = (): KaynakAdlari => useContext(KaynakAdlariBaglami);
