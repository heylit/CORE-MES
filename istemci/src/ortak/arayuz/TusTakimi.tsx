import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { sayiYaz } from './durum.ts';
import { Simge } from './Simge.tsx';
import { useKatman } from './katman.ts';
import './tus-takimi.css';

interface Ozellikler {
  acik: boolean;
  baslik: string;
  birim?: string;
  // Verilmezse boş başlar: eski sayının üstüne yanlışlıkla hane eklenmez.
  ilkDeger?: number | null;
  enCok?: number;
  enCokHane?: number;
  // Uyarı metni dönerse ilk onay yalnız uyarıyı gösterir; aynı değerle ikinci onay kaydeder.
  buyukDegisim?: (deger: number) => string | null;
  onayla: (deger: number) => void;
  kapat: () => void;
}

const TUSLAR = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'sil', '0', 'onay'] as const;
type Tus = (typeof TUSLAR)[number];

export function TusTakimi({
  acik, baslik, birim = 'adet', ilkDeger = null, enCok, enCokHane = 6, buyukDegisim, onayla, kapat,
}: Ozellikler) {
  const kutu = useKatman<HTMLDivElement>(acik, kapat);
  const baslikKimlik = useId();
  const [metin, metinYaz] = useState('');
  const [uyari, uyariYaz] = useState<string | null>(null);

  // Yalnız açılışta sıfırlanır: pencere açıkken ilk değer değişirse (arkada veri yenilenir) yazılan sayı silinmez.
  const ilkDegerRef = useRef(ilkDeger);
  ilkDegerRef.current = ilkDeger;
  useEffect(() => {
    if (!acik) return;
    metinYaz(ilkDegerRef.current === null ? '' : String(ilkDegerRef.current));
    uyariYaz(null);
  }, [acik]);

  if (!acik) return null;

  const bos = metin === '';
  const asim = enCok !== undefined && Number(metin) > enCok;
  const bas = (tus: Exclude<Tus, 'onay'>) => {
    const yeni = tus === 'sil' ? metin.slice(0, -1) : metin === '0' ? tus : metin + tus;
    // Silme sınıra takılmaz: sınırı aşan ilk değer ancak silinerek düzeltilebilir.
    if (tus !== 'sil' && (yeni.length > enCokHane || (enCok !== undefined && Number(yeni) > enCok))) return;
    uyariYaz(null);
    metinYaz(yeni);
  };
  const onay = () => {
    if (bos || asim) return;
    const deger = Number(metin);
    const ileti = uyari === null ? buyukDegisim?.(deger) ?? null : null;
    if (ileti !== null) { uyariYaz(ileti); return; }
    onayla(deger);
  };
  const klavye = (o: KeyboardEvent) => {
    if (/^\d$/.test(o.key)) { o.preventDefault(); bas(o.key as Exclude<Tus, 'onay' | 'sil'>); return; }
    if (o.key === 'Backspace') { o.preventDefault(); bas('sil'); return; }
    // Odak bir rakam tuşundayken Enter o rakamı yeniden yazmaz, girişi onaylar; Vazgeç kendi işini yapar.
    if (o.key === 'Enter' && !(o.target instanceof HTMLElement && o.target.dataset.yerelEnter !== undefined)) {
      o.preventDefault();
      onay();
    }
  };

  return createPortal(
    <div className="tc-tus-perde" onMouseDown={(o) => { if (o.target === o.currentTarget) kapat(); }}>
      <div
        ref={kutu}
        className="tc-tus-pencere"
        role="dialog"
        aria-modal="true"
        aria-labelledby={baslikKimlik}
        tabIndex={-1}
        onKeyDown={klavye}
      >
        <div className="tc-tus-ust">
          <h2 id={baslikKimlik} className="tc-tus-baslik">{baslik}</h2>
          <button type="button" className="tc-tus-kapat" onClick={kapat} aria-label="Vazgeç" data-yerel-enter>
            <Simge ad="x" boyut="k" />
          </button>
        </div>
        <div className="tc-tus-gosterge" tabIndex={-1} data-ilk-odak>
          <span className="tc-tus-birim">{birim}</span>
          <output className="tc-tus-deger" aria-live="polite">{bos ? '' : sayiYaz(Number(metin))}</output>
        </div>
        {uyari !== null && (
          <div className="tc-tus-uyari" role="alert">
            <Simge ad="alert" />
            <div><b>{uyari}</b><span>Doğruysa yeniden onaylayın.</span></div>
          </div>
        )}
        <div className="tc-tus-izgara">
          {TUSLAR.map((tus) => tus === 'onay' ? (
            <button key={tus} type="button" className="tc-tus tc-tus-onay" aria-label="Onayla" disabled={bos || asim} onClick={onay}>
              <Simge ad="check" boyut="b" />
            </button>
          ) : (
            <button key={tus} type="button" className="tc-tus" aria-label={tus === 'sil' ? 'Sil' : tus} onClick={() => bas(tus)}>
              {tus === 'sil' ? <Simge ad="back" boyut="b" /> : tus}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
