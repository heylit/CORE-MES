import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { alternatifOzeti, zarfAbone, zarfDurumu, zarfIste } from '../merkez/alternatif-ozeti.ts';

// 3572-0: kalem satırında talep edenin alternatif sınırı. Zarf yalnız satır ekrana girince istenir; aynı talebin satırları tek isteği paylaşır.
// Satır kesilmez (sa-is-malzeme gibi uç noktalı değil): ölçü payı ve şartlı bilgisi sonda, dar hücrede kırılır.
function useGorundu<T extends Element>(): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [gorundu, gorunduYaz] = useState(() => typeof IntersectionObserver !== 'function');
  useEffect(() => {
    const el = ref.current;
    if (gorundu || !el) return;
    const g = new IntersectionObserver((l) => { if (l.some((x) => x.isIntersecting)) { gorunduYaz(true); g.disconnect(); } }, { rootMargin: '200px' });
    g.observe(el);
    return () => { g.disconnect(); };
  }, [gorundu]);
  return [ref, gorundu];
}

export function AlternatifOzeti({ talepId, kalemId }: { talepId: string; kalemId: string }) {
  const [ref, gorundu] = useGorundu<HTMLElement>();
  const durum = useSyncExternalStore(zarfAbone, () => zarfDurumu(talepId));
  useEffect(() => { if (gorundu) void zarfIste(talepId); }, [gorundu, talepId]);
  const metin = alternatifOzeti(durum, kalemId);
  if (metin === null) return null;
  return <small ref={ref} data-sa-alt-satir="">{metin}</small>;
}
