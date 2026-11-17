import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Girdi } from '../../ortak/arayuz/index.ts';

export interface AramaSecenegi {
  anahtar: string;
  kod: string | null;
  ad: string;
  // Sağda soluk yazılan bilgi (tür, birim, oran).
  ek?: string;
}

interface Ozellikler {
  etiket: string;
  metin: string;
  yaz: (metin: string) => void;
  secenekler: readonly AramaSecenegi[];
  sec: (s: AramaSecenegi) => void;
  // Listenin altında kalan not (sonuç yok, yükleniyor, seçilmezse ne olur).
  not?: ReactNode;
  hata?: string;
  ipucu?: string;
  zorunlu?: boolean;
  placeholder?: string;
}

// 3400-1: yazınca altında sonuçlar açılan kutu (tek alan). Ok tuşları gezer, Enter seçer, Escape kapatır; liste fareyle de seçilir.
export function AramaKutusu({ etiket, metin, yaz, secenekler, sec, not, hata, ipucu, zorunlu = false, placeholder }: Ozellikler) {
  const [acik, acikYaz] = useState(false);
  const [etkin, etkinYaz] = useState(0);
  const liste = useId();
  const secenekKimligi = (i: number) => `${liste}-${String(i)}`;
  const gorunur = acik && (secenekler.length > 0 || not !== undefined);
  const secildi = (s: AramaSecenegi) => { sec(s); acikYaz(false); };
  // Kutu sağ sütundaysa liste ekranın sağından taşmasın: sığmazsa kutunun sağ kenarına hizalanır.
  const listeOgesi = useRef<HTMLUListElement>(null);
  const [sagdan, sagdanYaz] = useState(false);
  useLayoutEffect(() => {
    if (!gorunur) { sagdanYaz(false); return; }
    const o = listeOgesi.current;
    const kutu = o?.parentElement?.getBoundingClientRect();
    if (o === null || kutu === undefined || sagdan) return;
    const r = o.getBoundingClientRect();
    if (r.right > document.documentElement.clientWidth && kutu.right - r.width >= 0) sagdanYaz(true);
  }, [gorunur, sagdan, secenekler.length]);

  return (
    <div className="tc-sp-arama">
      <Girdi
        etiket={etiket}
        type="search"
        role="combobox"
        aria-expanded={gorunur}
        aria-controls={liste}
        aria-autocomplete="list"
        {...(gorunur && secenekler[etkin] ? { 'aria-activedescendant': secenekKimligi(etkin) } : {})}
        autoComplete="off"
        required={zorunlu}
        placeholder={placeholder}
        value={metin}
        onChange={(o) => { yaz(o.target.value); etkinYaz(0); acikYaz(true); }}
        onFocus={() => acikYaz(true)}
        onBlur={() => acikYaz(false)}
        onKeyDown={(o) => {
          if (o.key === 'ArrowDown') { o.preventDefault(); acikYaz(true); etkinYaz((e) => Math.min(e + 1, Math.max(secenekler.length - 1, 0))); }
          else if (o.key === 'ArrowUp') { o.preventDefault(); etkinYaz((e) => Math.max(e - 1, 0)); }
          // Arama kutusunda Escape metni de siler; liste açıkken yalnız listeyi kapatsın.
          else if (o.key === 'Escape') { if (gorunur) o.preventDefault(); acikYaz(false); }
          else if (o.key === 'Enter' && gorunur && secenekler[etkin]) { o.preventDefault(); secildi(secenekler[etkin]); }
        }}
        {...(hata === undefined ? {} : { hata })}
        {...(ipucu === undefined ? {} : { ipucu })}
      />
      {gorunur && (
        <ul ref={listeOgesi} id={liste} role="listbox" aria-label={`${etiket} sonuçları`} className={sagdan ? 'tc-sp-arama-liste tc-sp-arama-sagdan' : 'tc-sp-arama-liste'}>
          {secenekler.map((s, i) => (
            <li
              key={s.anahtar}
              id={secenekKimligi(i)}
              role="option"
              aria-selected={i === etkin}
              className="tc-sp-arama-secenek"
              // Odak kutuda kalsın: tıklama blur'dan önce gelmezse liste kapanır.
              onMouseDown={(o) => o.preventDefault()}
              onMouseEnter={() => etkinYaz(i)}
              onClick={() => secildi(s)}
            >
              {s.kod !== null && <span className="tc-sp-arama-kod">{s.kod}</span>}
              <span className="tc-sp-arama-ad">{s.ad}</span>
              {s.ek !== undefined && <span className="tc-sp-arama-ek">{s.ek}</span>}
            </li>
          ))}
          {not !== undefined && <li role="presentation" className="tc-sp-arama-not">{not}</li>}
        </ul>
      )}
    </div>
  );
}
