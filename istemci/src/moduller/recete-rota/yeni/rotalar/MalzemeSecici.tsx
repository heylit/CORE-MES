import { useState } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { malzemeAra, SECICI_TURLERI, turKisa, type Malzeme } from './kurallar.ts';

const SAYFA = 40;

// Ortak malzeme seçici (Girenler, Yan ürünler): koda ve ada göre süzer, türe göre süzgeç, 40'lık sayfalar. Girdi olamayan kart (ticari mal,
// hizmet) girende listelenmez.
export function MalzemeListesi({ liste, girdi, haricId, sec, etiket }: {
  liste: readonly Malzeme[]; girdi: boolean; haricId: string | null; sec: (m: Malzeme) => void; etiket: string;
}) {
  const [q, setQ] = useState('');
  const [tur, setTur] = useState('all');
  const [sayfa, setSayfa] = useState(1);
  const bulunan = malzemeAra(liste, q, tur, girdi, haricId);
  const gor = bulunan.slice(0, sayfa * SAYFA);
  return (
    <div className="tc-rr1-msec">
      <input className="tc-rr1-metin" type="search" value={q} placeholder="Malzeme ara: kod ya da ad" aria-label={etiket} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setSayfa(1); }} />
      <span className="tc-rr1-seg" role="group" aria-label="Tür filtresi">
        {SECICI_TURLERI.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tur === k} onClick={() => { setTur(k); setSayfa(1); }}>{l}</button>
        ))}
      </span>
      <div className="tc-rr1-picklist" role="listbox" aria-label="Malzeme seçenekleri">
        {gor.map((m) => (
          <button key={m.id} type="button" role="option" aria-selected={false} className="tc-rr1-pick" onClick={() => { sec(m); }}>
            <span className={`tc-rr1-slot tc-rr1-slot-${m.type}`}>{turKisa(m.type)}</span>
            <span className="tc-rr1-pn"><b>{m.code}</b> {m.name}</span>
          </button>
        ))}
        {gor.length === 0 && <p className="tc-rr1-ipucu">Bu aramada malzeme yok.</p>}
        {bulunan.length > gor.length && (
          <Dugme tur="ikincil" onClick={() => { setSayfa(sayfa + 1); }}>{bulunan.length - gor.length} malzeme daha göster</Dugme>
        )}
      </div>
    </div>
  );
}

// Adım panelindeki hızlı ekleme: yaz, seç, miktarı gir, Ekle.
export function HizliEkle({ liste, girdi, haricId, ekle, etiket }: {
  liste: readonly Malzeme[]; girdi: boolean; haricId: string | null; ekle: (m: Malzeme, miktar: number) => void; etiket: string;
}) {
  const [q, setQ] = useState('');
  const [secili, setSecili] = useState<Malzeme | null>(null);
  const [acik, setAcik] = useState(false);
  const [miktar, setMiktar] = useState('1');
  const bulunan = acik && !secili ? malzemeAra(liste, q, 'all', girdi, haricId).slice(0, 8) : [];
  const ekleBas = () => {
    const n = Number(miktar.replace(',', '.'));
    if (!secili || !Number.isFinite(n) || n <= 0) return;
    ekle(secili, n);
    setQ(''); setSecili(null); setMiktar('1');
  };
  return (
    <div className="tc-rr1-qadd">
      <span className="tc-rr1-qadd-ara">
        <input className="tc-rr1-metin" value={q} placeholder={girdi ? 'Malzeme kodu ya da adı yaz…' : 'Yan ürün kodu ya da adı yaz…'} aria-label={etiket}
          autoComplete="off" onFocus={() => { setAcik(true); }} onBlur={() => { setTimeout(() => { setAcik(false); }, 150); }}
          onChange={(e) => { setQ(e.target.value); setSecili(null); setAcik(true); }} />
        {bulunan.length > 0 && (
          <span className="tc-rr1-qadd-liste" role="listbox" aria-label={`${etiket} seçenekleri`}>
            {bulunan.map((m) => (
              <button key={m.id} type="button" role="option" aria-selected={false} className="tc-rr1-pick"
                onMouseDown={(e) => { e.preventDefault(); }} onClick={() => { setSecili(m); setQ(`${m.code} ${m.name}`); setAcik(false); }}>
                <span className={`tc-rr1-slot tc-rr1-slot-${m.type}`}>{turKisa(m.type)}</span><span className="tc-rr1-pn"><b>{m.code}</b> {m.name}</span>
              </button>
            ))}
          </span>
        )}
      </span>
      <input className="tc-rr1-sayi" inputMode="decimal" value={miktar} aria-label={`${etiket} miktarı`} onChange={(e) => { setMiktar(e.target.value); }} />
      <Dugme tur="birincil" disabled={!secili} onClick={ekleBas}>Ekle</Dugme>
    </div>
  );
}
