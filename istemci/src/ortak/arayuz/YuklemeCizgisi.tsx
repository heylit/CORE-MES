import { useContext, useEffect, useState } from 'react';
import { QueryClientContext, type QueryClient } from '@tanstack/react-query';
import { etkiAcik } from '../veri/etki.ts';
import './yukleme-cizgisi.css';

// Kısa bekleyişte çizgi hiç görünmez; göz kırpması olmasın.
const GECIKME_MS = 250;

// Verisi henüz gelmemiş sorgu (sayfanın ilk yüklemesi) ya da süren kayıt işlemi bekleyiştir. Arka planda tazelenen canlı
// veri sayılmaz: her birkaç saniyede bir çizgi yanmasın.
export function bekleyisVar(istemci: QueryClient): boolean {
  if (istemci.isMutating() > 0) return true;
  return istemci.getQueryCache().findAll({ fetchStatus: 'fetching' }).some((s) => s.state.data === undefined);
}

// Ekranın üstünde ince ilerleme çizgisi (kart 2092, karar 2081-22). Sorgu istemcisi yoksa (test, yalıtılmış görünüm) çizilmez.
export function YuklemeCizgisi() {
  const istemci = useContext(QueryClientContext);
  const [durum, durumYaz] = useState<'yok' | 'suruyor' | 'bitti'>('yok');

  useEffect(() => {
    if (!istemci || !etkiAcik('yukleme-cizgisi')) return undefined;
    let gecikme: ReturnType<typeof setTimeout> | null = null;
    let sondur: ReturnType<typeof setTimeout> | null = null;
    const bak = () => {
      if (bekleyisVar(istemci)) {
        if (sondur) { clearTimeout(sondur); sondur = null; }
        gecikme ??= setTimeout(() => { durumYaz('suruyor'); }, GECIKME_MS);
        return;
      }
      if (gecikme) { clearTimeout(gecikme); gecikme = null; }
      durumYaz((d) => (d === 'suruyor' ? 'bitti' : d));
      sondur ??= setTimeout(() => { sondur = null; durumYaz('yok'); }, GECIKME_MS * 2);
    };
    // Önbellek bildirimi başka bir bileşenin çizimi sırasında gelir (sorgu çizimde önbelleğe eklenir); durum orada yazılırsa React
    // "Cannot update a component while rendering" uyarır. Bakış çizimden sonraya ertelenir.
    let acik = true;
    const ertele = () => { queueMicrotask(() => { if (acik) bak(); }); };
    const birak1 = istemci.getQueryCache().subscribe(ertele);
    const birak2 = istemci.getMutationCache().subscribe(ertele);
    bak();
    return () => {
      acik = false;
      birak1();
      birak2();
      if (gecikme) clearTimeout(gecikme);
      if (sondur) clearTimeout(sondur);
    };
  }, [istemci]);

  if (durum === 'yok') return null;
  return <div className="tc-yukleme-cizgisi" data-durum={durum} aria-hidden="true" />;
}
