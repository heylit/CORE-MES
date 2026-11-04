import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Simge, useAcilirKonum } from '../../ortak/arayuz/index.ts';
import { aramayaUyar } from './ListeAraclari.tsx';

export interface AranabilirSecenek {
  deger: string;
  baslik: string;
  // Aynı gruptakiler bir başlığın altında durur (istasyonlar iş merkezine göre).
  grup?: string;
  alt?: string;
}

// Yüzlerce seçenekte liste uzar; arama daraltana kadar ilk kısmı çizilir (kart #1296).
const EN_COK_SATIR = 150;
// Son seçilenler sayfa açık kaldıkça bellekte durur; her seçici türünün kendi listesi vardır.
const SONLAR: Record<string, string[]> = {};

// Yazdıkça süzülen seçici (kart #1296): düz açılır liste yüzlerce istasyonda kaydırarak aranıyordu.
// Ok tuşları gezer, Enter seçer, Escape kapatır; seçim değişmezse kayıt gitmez.
export function AranabilirSecim({ etiket, secenekler, deger, sec, bos, disabled, tur = 'genel', yerTutucu = 'Seçiniz' }: {
  etiket: string;
  secenekler: readonly AranabilirSecenek[];
  deger: string;
  sec: (deger: string) => void;
  // Verilirse değeri boş olan ilk seçenektir ("İstasyonsuz").
  bos?: string;
  disabled?: boolean;
  tur?: string;
  yerTutucu?: string;
}) {
  const [acik, acikYaz] = useState(false);
  const [ara, araYaz] = useState('');
  const [etkin, etkinYaz] = useState(0);
  const kok = useRef<HTMLDivElement>(null);
  const { capa, katman } = useAcilirKonum<HTMLButtonElement, HTMLDivElement>(acik);
  const kimlik = useId();

  useEffect(() => {
    if (!acik) return undefined;
    // Liste body'dedir: içine basmak dışarı sayılmaz.
    const disari = (o: MouseEvent) => {
      const hedef = o.target as Node;
      if (!kok.current?.contains(hedef) && !katman.current?.contains(hedef)) acikYaz(false);
    };
    document.addEventListener('mousedown', disari);
    return () => document.removeEventListener('mousedown', disari);
  }, [acik, katman]);

  const secili = secenekler.find((s) => s.deger === deger);
  const sonlar = ara.trim() === ''
    ? (SONLAR[tur] ?? []).flatMap((d) => secenekler.filter((s) => s.deger === d && d !== deger)).map((s) => ({ ...s, grup: 'Son kullanılanlar' }))
    : [];
  const uyanlar = secenekler.filter((s) => aramayaUyar(ara, [s.baslik, s.grup, s.alt]));
  const tum = [...(bos !== undefined && ara.trim() === '' ? [{ deger: '', baslik: bos }] : []), ...sonlar, ...uyanlar];
  const liste = tum.slice(0, EN_COK_SATIR);

  const kapat = () => { acikYaz(false); araYaz(''); etkinYaz(0); };
  const sonuc = (d: string) => {
    if (d !== '') SONLAR[tur] = [d, ...(SONLAR[tur] ?? []).filter((x) => x !== d)].slice(0, 3);
    kapat();
    if (d !== deger) sec(d);
  };

  return (
    <div className="tc-ist-secici" ref={kok}>
      <button
        ref={capa} type="button" className="tc-alan-kutu tc-ist-hucre tc-ist-secici-dugme" aria-label={etiket} aria-haspopup="listbox" aria-expanded={acik}
        disabled={disabled} onClick={() => (acik ? kapat() : acikYaz(true))}
      >
        <span className="tc-ist-secici-metin">{secili?.baslik ?? (deger === '' && bos !== undefined ? bos : yerTutucu)}</span>
        <Simge ad="down" boyut="k" />
      </button>
      {acik && createPortal(
        <div ref={katman} className="tc-ist-acilir tc-acilir-katman">
          <input
            className="tc-alan-kutu" type="search" role="combobox" aria-label={`${etiket} ara`} aria-controls={kimlik} aria-expanded="true"
            aria-activedescendant={liste[etkin] ? `${kimlik}-${etkin}` : undefined} placeholder="Kod ya da ad yazın" value={ara} autoFocus
            onChange={(o) => { araYaz(o.target.value); etkinYaz(0); }}
            onKeyDown={(o) => {
              if (o.key === 'ArrowDown') { o.preventDefault(); etkinYaz((e) => Math.min(e + 1, liste.length - 1)); }
              if (o.key === 'ArrowUp') { o.preventDefault(); etkinYaz((e) => Math.max(e - 1, 0)); }
              if (o.key === 'Enter') { o.preventDefault(); const s = liste[etkin]; if (s) sonuc(s.deger); }
              if (o.key === 'Escape') { o.stopPropagation(); kapat(); }
              // Liste sayfanın sonundadır; Tab odağı düğmeden sıradaki alana taşısın.
              if (o.key === 'Tab') { capa.current?.focus(); kapat(); }
            }}
          />
          <ul id={kimlik} role="listbox" aria-label={etiket} className="tc-ist-acilir-liste">
            {liste.map((s, sira) => {
              const grupBasi = s.grup !== undefined && s.grup !== liste[sira - 1]?.grup;
              return [
                grupBasi && <li key={`g${sira}`} role="presentation" className="tc-ist-acilir-grup">{s.grup}</li>,
                <li
                  key={`${s.grup ?? ''}${s.deger}`} id={`${kimlik}-${sira}`} role="option" aria-selected={s.deger === deger}
                  className="tc-ist-acilir-secenek" data-etkin={sira === etkin}
                  onMouseDown={(o) => o.preventDefault()} onClick={() => sonuc(s.deger)} onMouseEnter={() => etkinYaz(sira)}
                >
                  <span>{s.baslik}</span>{s.alt && <small className="tc-ist-ipucu">{s.alt}</small>}
                </li>,
              ];
            })}
          </ul>
          {liste.length === 0 && <p className="tc-ist-ipucu">Aramaya uyan yok.</p>}
          {tum.length > liste.length && <p className="tc-ist-ipucu">İlk {EN_COK_SATIR} gösteriliyor; aramayı daraltın.</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
