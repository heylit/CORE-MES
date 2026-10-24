import type { ReactNode } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';

// Prototipte iletiler isaretle baslar (⚠ uyari, ✓ tamam); isaret simge olur (T4), metin aynen kalir. G-Kod Sim. de kullanir.
export function ileti(m: string | null | undefined): ReactNode {
  if (!m) return null;
  const uyari = m.startsWith('⚠'), tamam = m.startsWith('✓');
  if (!uyari && !tamam) return m;
  return <><Simge ad={uyari ? 'alert' : 'check'} boyut="k" /> {m.slice(1).trimStart()}</>;
}
