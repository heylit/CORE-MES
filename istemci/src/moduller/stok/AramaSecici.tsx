import { useId, useState, type KeyboardEvent } from 'react';
import { Girdi } from '../../ortak/arayuz/index.ts';

export interface AramaSecenegi { deger: string; baslik: string; alt: string; sag?: string }

// Yazarak aranan seçim alanı (malzeme, konum): sonuçlar alanın altında açılır, ok tuşları ve Enter ile seçilir, Escape kapatır.
// Okuyucu kodu yazıp Enter'a basar; liste açıksa vurgulu seçenek seçilir. Seçilen kayıt alanda `secili` metniyle görünür,
// yazmaya başlanınca arama metnine döner. Değer çağıranındır (kimlik ya da arama metni); `secildi` verilirse seçim ona gider.
export function AramaSecici({ etiket, deger, degistir, secildi, secili, secenekler, ipucu, yerTutucu, zorunlu, hata }: {
  etiket: string; deger: string; degistir: (v: string) => void; secildi?: (x: AramaSecenegi) => void; secili: string | null; secenekler: AramaSecenegi[]; ipucu: string; yerTutucu: string; zorunlu?: boolean; hata?: string;
}) {
  const listeKimlik = useId();
  const [yaziyor, setYaziyor] = useState(false);
  const [kapali, setKapali] = useState(false);
  const [vurgu, setVurgu] = useState(0);
  const acik = secenekler.length > 0 && !kapali;
  const etkin = Math.min(vurgu, secenekler.length - 1);
  const sec = (x: AramaSecenegi) => { setYaziyor(false); setKapali(true); if (secildi) secildi(x); else degistir(x.deger); };
  const tus = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!acik) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setVurgu((v) => (v + (e.key === 'ArrowDown' ? 1 : secenekler.length - 1)) % secenekler.length);
    } else if (e.key === 'Enter') {
      // Liste açıkken Enter formu göndermez, vurgulu seçeneği seçer.
      e.preventDefault();
      sec(secenekler[etkin]!);
    } else if (e.key === 'Escape') {
      setKapali(true);
    }
  };
  return (
    <div className="tc-stok-secici">
      <Girdi etiket={etiket} type="search" autoComplete="off" placeholder={yerTutucu} value={!yaziyor && secili !== null ? secili : deger} ipucu={ipucu} hata={hata} required={zorunlu}
        role="combobox" aria-autocomplete="list" aria-expanded={acik} aria-controls={listeKimlik}
        {...(acik ? { 'aria-activedescendant': `${listeKimlik}-${etkin}` } : {})}
        onFocus={(e) => e.target.select()} onBlur={() => setYaziyor(false)} onKeyDown={tus}
        onChange={(e) => { setYaziyor(true); setKapali(false); setVurgu(0); degistir(e.target.value.trimStart()); }} />
      <ul id={listeKimlik} role="listbox" aria-label={`${etiket} için bulunanlar`} className="tc-stok-secici-liste" hidden={!acik}>
        {acik && secenekler.map((x, i) => (
          // Fare basışı odağı alandan almaz; seçim tıklamada yapılır.
          <li key={x.deger} id={`${listeKimlik}-${i}`} role="option" aria-selected={i === etkin} className="tc-stok-secici-secenek"
            onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setVurgu(i)} onClick={() => sec(x)}>
            <span className="tc-stok-secici-ad"><strong>{x.baslik}</strong><span className="tc-stok-mono">{x.alt}</span></span>
            {x.sag !== undefined && <span className="tc-stok-secici-stok">{x.sag}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
