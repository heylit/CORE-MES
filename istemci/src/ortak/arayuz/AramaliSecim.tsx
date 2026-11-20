import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Simge } from './Simge.tsx';
import { useAcilirKonum } from './acilir-konum.ts';
import './kayit-secici.css';

export interface AramaliSecenek {
  deger: string;
  baslik: string;
  // Aramada da bakılan ikinci satır (istasyon gibi).
  alt?: string;
}

// Yüzlerce seçenekte liste uzar; arama daraltana kadar ilk kısmı çizilir.
const EN_COK_SATIR = 150;

// Kodlar ASCII büyük harfle yazılır ("EKIP"); Türkçe küçültme onu "ekıp" yapar ve "ekip" araması bulamaz. Bu yüzden ı ile i eş sayılır.
const kucuk = (m: string) => m.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');

// Seçenekleri ekranda hazır olan, yazdıkça süzen seçici: düz açılır liste uzunken kaydırarak aranıyordu. Seçenekler sunucuda
// aranacaksa `KayitSecici` kullanılır. Görünüm onunla aynıdır. Ok tuşları gezer, Enter seçer, Escape kapatır; seçim değişmezse `sec` çağrılmaz.
export function AramaliSecim({ etiket, secenekler, deger, sec, bos, disabled, yerTutucu = 'Seçiniz' }: {
  etiket: string;
  secenekler: readonly AramaliSecenek[];
  deger: string;
  sec: (deger: string) => void;
  // Verilirse değeri boş olan ilk seçenektir.
  bos?: string;
  disabled?: boolean;
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

  const aranan = kucuk(ara.trim());
  const secili = secenekler.find((s) => s.deger === deger);
  const uyanlar = secenekler.filter((s) => aranan === '' || kucuk(`${s.baslik} ${s.alt ?? ''}`).includes(aranan));
  const tum = [...(bos !== undefined && aranan === '' ? [{ deger: '', baslik: bos }] : []), ...uyanlar];
  const liste = tum.slice(0, EN_COK_SATIR);

  const kapat = () => { acikYaz(false); araYaz(''); etkinYaz(0); };
  // Klavyeyle kapanınca odak açan düğmeye döner; yoksa sayfanın başına düşer.
  const kapatOdakla = () => { kapat(); capa.current?.focus(); };
  const sonuc = (d: string) => {
    kapatOdakla();
    if (d !== deger) sec(d);
  };
  // Ok tuşuyla gezilen satır listenin görünen yerinde kalır.
  useEffect(() => {
    if (acik) document.getElementById(`${kimlik}-${etkin}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [acik, etkin, kimlik]);
  const ac = () => {
    // Seçili satır etkin başlar: Enter seçimi değiştirmeden kapatır.
    etkinYaz(Math.max(0, liste.findIndex((s) => s.deger === deger)));
    acikYaz(true);
  };

  return (
    <div className="tc-ksecici" ref={kok}>
      <button
        ref={capa} type="button" className="tc-alan-kutu tc-ksecici-dugme" aria-label={etiket} aria-haspopup="listbox" aria-expanded={acik}
        disabled={disabled} onClick={() => (acik ? kapat() : ac())}
      >
        <span className="tc-ksecici-metin">{secili?.baslik ?? (deger === '' && bos !== undefined ? bos : yerTutucu)}</span>
        <Simge ad="down" boyut="k" />
      </button>
      {acik && createPortal(
        <div ref={katman} className="tc-ksecici-acilir tc-acilir-katman">
          <input
            className="tc-alan-kutu" type="search" role="combobox" aria-label={`${etiket} ara`} aria-controls={kimlik} aria-expanded="true"
            aria-activedescendant={liste[etkin] ? `${kimlik}-${etkin}` : undefined} placeholder="Kod ya da ad yazın" value={ara} autoFocus
            onChange={(o) => { araYaz(o.target.value); etkinYaz(0); }}
            onKeyDown={(o) => {
              if (o.key === 'ArrowDown') { o.preventDefault(); etkinYaz((e) => Math.min(e + 1, liste.length - 1)); }
              if (o.key === 'ArrowUp') { o.preventDefault(); etkinYaz((e) => Math.max(e - 1, 0)); }
              if (o.key === 'Enter') { o.preventDefault(); const s = liste[etkin]; if (s) sonuc(s.deger); }
              if (o.key === 'Escape') { o.stopPropagation(); kapatOdakla(); }
              // Liste sayfanın sonundadır; Tab odağı düğmeden sıradaki alana taşısın.
              if (o.key === 'Tab') { capa.current?.focus(); kapat(); }
            }}
          />
          <ul id={kimlik} role="listbox" aria-label={etiket} className="tc-ksecici-liste">
            {liste.map((s, sira) => (
              <li
                key={s.deger} id={`${kimlik}-${sira}`} role="option" aria-selected={s.deger === deger}
                className="tc-ksecici-secenek" data-etkin={sira === etkin}
                onMouseDown={(o) => o.preventDefault()} onClick={() => sonuc(s.deger)} onMouseEnter={() => etkinYaz(sira)}
              >
                <span>{s.baslik}</span>{s.alt && <small className="tc-ksecici-ipucu">{s.alt}</small>}
              </li>
            ))}
          </ul>
          {liste.length === 0 && <p className="tc-ksecici-ipucu">Aramaya uyan yok.</p>}
          {tum.length > liste.length && <p className="tc-ksecici-ipucu">İlk {EN_COK_SATIR} gösteriliyor; aramayı daraltın.</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
