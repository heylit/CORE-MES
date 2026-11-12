import { useEffect, useRef, useState } from 'react';
import { etkiAcik } from '../veri/etki.ts';
import { Simge } from './Simge.tsx';
import './kopyala.css';

interface Ozellikler {
  metin: string;
  // Düğmenin erişilebilir adı ("Belge numarasını kopyala").
  etiket: string;
}

const ONAY_MS = 1500;

// Pano yazma izni yalnız güvenli bağlamdadır (https ya da localhost); kurum içi http sunucuda eski yol denenir.
export async function panoyaYaz(metin: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(metin);
      return true;
    }
  } catch { /* izin yok: eski yol */ }
  const alan = document.createElement('textarea');
  alan.value = metin;
  alan.setAttribute('readonly', '');
  alan.className = 'tc-kopyala-gecici';
  document.body.appendChild(alan);
  alan.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    alan.remove();
  }
}

// Belge numarasının yanındaki tek dokunuşla kopyala düğmesi (kart 2090, karar 2081-18). Sonuç düğmenin yanında kısa süre
// yazar ve ekran okuyucuya duyurulur. Kurum kapattıysa düğme çizilmez; numara seçilerek yine kopyalanır.
export function Kopyala({ metin, etiket }: Ozellikler) {
  const [sonuc, sonucYaz] = useState<'tamam' | 'olmadi' | null>(null);
  const zaman = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (zaman.current) clearTimeout(zaman.current); }, []);
  if (!etkiAcik('kopyala')) return null;

  const kopyala = async () => {
    const oldu = await panoyaYaz(metin);
    sonucYaz(oldu ? 'tamam' : 'olmadi');
    if (zaman.current) clearTimeout(zaman.current);
    zaman.current = setTimeout(() => { sonucYaz(null); }, ONAY_MS);
  };

  return (
    <span className="tc-kopyala">
      <button type="button" className="tc-kopyala-dugme" aria-label={etiket} title={etiket} data-sonuc={sonuc ?? undefined}
        onClick={(o) => { o.stopPropagation(); void kopyala(); }}>
        <Simge ad={sonuc === 'tamam' ? 'check' : 'clipboard-check'} boyut="k" />
      </button>
      <span className="tc-kopyala-ileti" role="status">
        {sonuc === 'tamam' ? 'Kopyalandı' : sonuc === 'olmadi' ? 'Kopyalanamadı' : ''}
      </span>
    </span>
  );
}
