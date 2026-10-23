import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Dugme } from '../../../ortak/arayuz/Dugme.tsx';
import { Pencere } from '../../../ortak/arayuz/Pencere.tsx';

// İndirilen HTML'in biçimi uygulamanın previewDoc'undakiyle aynıdır: belge ekran teması değil, kâğıt düzenidir (203 a).
export const BELGE_BICIMI = 'body{font-family:Arial,sans-serif;font-size:13px;margin:24px;color:#000}table{width:100%;border-collapse:collapse;margin-top:8px}'
  + 'td,th{border:1px solid #444;padding:5px 7px;text-align:left;vertical-align:top}th{background:#eee}h2{margin:0 0 6px}h3{font-size:14px;margin:14px 0 2px}'
  + '.dh-t{text-align:center;font-size:20px;font-weight:bold}.dh-f{width:26%}.dh-m{width:28%;font-size:12px}.sig td{height:74px;width:50%}'
  + '.sigline{margin-top:24px;border-top:1px solid #666;font-size:11px;width:60%}.small{font-size:11px;color:#555}.tagp{border:3px solid #000;padding:14px;max-width:420px;margin:0 auto}'
  + '.tal{display:grid;grid-template-columns:240px 1fr;gap:12px;border-top:1px solid #999;padding:10px 0;page-break-inside:avoid}.tal img{width:100%;border:1px solid #bbb}'
  + '.tal h3{margin:0 0 6px}.tag-h{display:flex;justify-content:space-between;font-size:12px}.tag-st{font-size:44px;font-weight:bold;text-align:center;border:4px double #000;margin:10px 0;padding:4px;letter-spacing:.06em}';

const kacis = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export function belgeHtml(baslik: string, govde: string): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${kacis(baslik)}</title><style>${BELGE_BICIMI}</style></head><body>${govde}</body></html>`;
}

export const dosyaAdi = (ad: string): string => `${ad.replace(/[^\w\-.]+/g, '_')}.html`;

interface Istek { baslik: string; dosya: string; icerik: ReactNode }
type Onizle = (baslik: string, dosya: string, icerik: ReactNode) => void;
const OnizlemeBaglami = createContext<Onizle | null>(null);

export function useOnizleme(): Onizle {
  const o = useContext(OnizlemeBaglami);
  if (!o) throw new Error('useOnizleme, OnizlemeSaglayici içinde kullanılmalı');
  return o;
}

const BASKI_SINIFI = 'tc-km-baskida';

// Önizleme penceresi: Yazdır yalnız belgeyi basar (gövdedeki öteki her şey baskıda gizli), HTML indir belgeyi tek dosya olarak verir.
export function OnizlemeSaglayici({ children }: { children: ReactNode }) {
  const [istek, istekYaz] = useState<Istek | null>(null);
  const kutu = useRef<HTMLDivElement>(null);
  const onizle = useCallback<Onizle>((baslik, dosya, icerik) => istekYaz({ baslik, dosya, icerik }), []);

  useEffect(() => {
    const bitti = () => document.body.classList.remove(BASKI_SINIFI);
    window.addEventListener('afterprint', bitti);
    return () => {
      window.removeEventListener('afterprint', bitti);
      bitti();
    };
  }, []);

  const yazdir = () => {
    document.body.classList.add(BASKI_SINIFI);
    window.print();
  };
  const indir = () => {
    if (!istek || !kutu.current) return;
    const blob = new Blob([belgeHtml(istek.baslik, kutu.current.innerHTML)], { type: 'text/html' });
    const adres = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = adres;
    a.download = dosyaAdi(istek.dosya);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(adres), 5000);
  };

  return (
    <OnizlemeBaglami.Provider value={onizle}>
      {children}
      {istek && (
        <Pencere acik kapat={() => istekYaz(null)} baslik={istek.baslik} tur="yan"
          alt={<><Dugme tur="ikincil" simge="download" onClick={indir}>HTML indir</Dugme><Dugme simge="printer" onClick={yazdir}>Yazdır</Dugme></>}>
          <div ref={kutu} className="tc-km-onizleme">{istek.icerik}</div>
        </Pencere>
      )}
      {istek && createPortal(<div className="tc-km-baski" aria-hidden="true">{istek.icerik}</div>, document.body)}
    </OnizlemeBaglami.Provider>
  );
}
