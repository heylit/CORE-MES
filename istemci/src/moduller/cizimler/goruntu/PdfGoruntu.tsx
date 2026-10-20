import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Dugme, DurumKutusu } from '../../../ortak/arayuz/index.ts';
import { pdfAc, sayfaCiz } from './pdf.ts';

const YAKINLIKLAR = [0.5, 0.75, 1, 1.5, 2, 3] as const;

export function PdfGoruntu({ veri }: { veri: Uint8Array }) {
  const kap = useRef<HTMLDivElement>(null);
  const tuval = useRef<HTMLCanvasElement>(null);
  const [belge, belgeYaz] = useState<PDFDocumentProxy | null>(null);
  const [sayfa, sayfaYaz] = useState(1);
  const [yakinlik, yakinlikYaz] = useState(2);
  const [hata, hataYaz] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    let acilan: PDFDocumentProxy | null = null;
    belgeYaz(null);
    hataYaz(null);
    sayfaYaz(1);
    pdfAc(veri).then(
      (b) => { acilan = b; if (iptal) void b.loadingTask.destroy(); else belgeYaz(b); },
      () => { if (!iptal) hataYaz('PDF okunamadı.'); },
    );
    return () => { iptal = true; if (acilan) void acilan.loadingTask.destroy(); };
  }, [veri]);

  useEffect(() => {
    const t = tuval.current;
    const k = kap.current;
    if (!belge || !t || !k) return;
    sayfaCiz(belge, sayfa, t, Math.max(240, k.clientWidth), YAKINLIKLAR[yakinlik] ?? 1).catch(() => { hataYaz('Sayfa çizilemedi.'); });
  }, [belge, sayfa, yakinlik]);

  const sayfaSayisi = belge?.numPages ?? 0;
  return (
    <div className="tc-cz-pdf">
      {belge && (
        <div className="tc-cz-arac">
          <Dugme simge="chev-left" aria-label="Önceki sayfa" disabled={sayfa <= 1} onClick={() => { sayfaYaz((s) => s - 1); }} />
          <span className="mono">{sayfa} / {sayfaSayisi}</span>
          <Dugme simge="chev-right" aria-label="Sonraki sayfa" disabled={sayfa >= sayfaSayisi} onClick={() => { sayfaYaz((s) => s + 1); }} />
          <Dugme simge="zout" aria-label="Uzaklaştır" disabled={yakinlik === 0} onClick={() => { yakinlikYaz((y) => y - 1); }} />
          <span className="mono">%{Math.round((YAKINLIKLAR[yakinlik] ?? 1) * 100)}</span>
          <Dugme simge="zin" aria-label="Yakınlaştır" disabled={yakinlik === YAKINLIKLAR.length - 1} onClick={() => { yakinlikYaz((y) => y + 1); }} />
        </div>
      )}
      <div ref={kap} className="tc-cz-pdf-kap">
        <canvas ref={tuval} className="tc-cz-pdf-tuval" aria-label={`PDF sayfa ${sayfa}`} />
      </div>
      {!belge && !hata && <DurumKutusu durum="yukleniyor" mesaj="PDF açılıyor" />}
      {hata && <DurumKutusu durum="hata" mesaj={hata} />}
    </div>
  );
}
