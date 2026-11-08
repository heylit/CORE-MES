import { useEffect, useState } from 'react';
import type { DuzenleyenCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme, Simge } from '../../../../../ortak/arayuz/index.ts';
import { api } from '../../../../../ortak/veri/api.ts';
import { duzenleyen, duzenleyenMetni, SORMA_MS, type Duzenleyen } from './kurallar.ts';

// Sayfa açıkken ve görünürken çalışmayı son yazanı sorar. Okunamazsa şerit gizli kalır: uyarı yardımcıdır, yazmayı sürüm denetimi korur.
export function useDuzenleyen(benId: number | null, benimSurum: () => number | null): Duzenleyen | null {
  const [d, setD] = useState<Duzenleyen | null>(null);
  useEffect(() => {
    if (benId === null) return undefined;
    let acik = true;
    const sor = (): void => {
      if (document.visibilityState === 'hidden') return;
      api.get<DuzenleyenCevabi>('/plan/planlama-calismasi/duzenleyen').then(
        (c) => { if (acik) setD(duzenleyen(c, benId, benimSurum(), Date.now())); },
        () => { if (acik) setD(null); },
      );
    };
    sor();
    const z = setInterval(sor, SORMA_MS);
    document.addEventListener('visibilitychange', sor);
    return () => { acik = false; clearInterval(z); document.removeEventListener('visibilitychange', sor); };
  }, [benId, benimSurum]);
  return d;
}

export function DuzenleyenSeridi({ d, yenile }: { d: Duzenleyen; yenile: () => void }) {
  return (
    <section className="tc-py-ds" data-durum="eski" aria-label="Düzenleyen">
      <div className="tc-py-ds-satir" role="status">
        <Simge ad="users" boyut="k" />
        <span className="tc-py-ds-metin">{duzenleyenMetni(d)}</span>
        {d.eski && <Dugme simge="rotate" onClick={yenile}>Yenile</Dugme>}
      </div>
    </section>
  );
}
