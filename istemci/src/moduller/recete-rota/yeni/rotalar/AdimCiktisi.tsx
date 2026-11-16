import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { ciktiAdaylari, ciktiEngeli, ciktiYaz, turKisa, type Adim, type Malzeme } from './kurallar.ts';
import { Bolme } from './ortak.tsx';

const LISTE_BOYU = 8;

// Ara adımın çıktısı (3320 a): girenler gibi malzeme listesinden seçilir. Seçim yoksa adım statülü ara hâl çıkarır (bugünkü davranış);
// seçilen kart adım bitince stoğa girer, sonraki adım onu tüketir. Son adımda bölüm yoktur (çıktı ürünün kendisidir).
export function AdimCiktisi({ liste, sahip, adimlar, a, duzen, statuluBaslik, rotali, yaz }: {
  liste: readonly Malzeme[]; sahip: Malzeme; adimlar: readonly Adim[]; a: Adim; duzen: boolean; statuluBaslik: string;
  rotali: (id: string) => boolean; yaz: (f: (x: Adim) => Adim, metin: string) => void;
}) {
  const git = useNavigate();
  const [q, setQ] = useState('');
  const [acik, setAcik] = useState(false);
  const [uyari, setUyari] = useState<string | null>(null);
  const secili = a.ciktiId == null ? null : liste.find((m) => m.id === a.ciktiId) ?? null;
  const adaylar = ciktiAdaylari(liste, '', sahip.id, adimlar, a.id).filter((m) => m.id !== a.ciktiId);
  const bulunan = acik ? ciktiAdaylari(liste, q, sahip.id, adimlar, a.id).filter((m) => m.id !== a.ciktiId).slice(0, LISTE_BOYU) : [];
  const sec = (m: Malzeme) => {
    const engel = ciktiEngeli(m, rotali);
    setAcik(false);
    if (engel !== null) { setUyari(engel); return; }
    setUyari(null);
    setQ('');
    yaz((x) => ciktiYaz(x, m.id), `${m.code} çıktı seçildi`);
  };
  return (
    <Bolme baslik="Bu adımın çıktısı" ek="tc-rr1-ciktibox">
      {a.ciktiId != null ? (
        <div className="tc-rr1-qt">
          <div className="tc-rr1-qtr">
            <span className="tc-rr1-chip" title={secili ? `${secili.code} ${secili.name}` : undefined}>
              <span className={`tc-rr1-slot tc-rr1-slot-${secili?.type ?? 'yok'}`}>{secili ? turKisa(secili.type) : '?'}</span>{' '}
              <b>{secili?.code ?? 'Silinmiş kart'}</b> <small>{secili?.name ?? ''}</small>
            </span>
            {duzen && (
              <button type="button" className="tc-rr1-ib" aria-label="Çıktıyı kaldır, statülü ara hâle dön" title="Statülü ara hâle dön"
                onClick={() => { setUyari(null); yaz((x) => ciktiYaz(x, null), 'Çıktı statülü ara hâle döndü'); }}>
                <Simge ad="x" boyut="k" />
              </button>
            )}
          </div>
          <p className="tc-rr1-ipucu">Adım bitince parça bu kartın stoğuna girer ve emre ayrılır; sonraki adım bu kartı tüketir.</p>
        </div>
      ) : (
        <p className="tc-rr1-ipucu">Çıktı seçilmedi: parça <b>{statuluBaslik}</b> statüsüyle sonraki adıma geçer. Yarı mamul ya da mamul kartı seçebilirsin.</p>
      )}
      {duzen && adaylar.length > 0 && (
        <div className="tc-rr1-qadd">
          <span className="tc-rr1-qadd-ara">
            <input className="tc-rr1-metin" value={q} placeholder="Çıktı kartının kodu ya da adı…" aria-label="Çıktı malzemesi" autoComplete="off"
              onFocus={() => { setAcik(true); }} onBlur={() => { setTimeout(() => { setAcik(false); }, 150); }}
              onChange={(e) => { setQ(e.target.value); setAcik(true); setUyari(null); }} />
            {bulunan.length > 0 && (
              <span className="tc-rr1-qadd-liste" role="listbox" aria-label="Çıktı malzemesi seçenekleri">
                {bulunan.map((m) => (
                  <button key={m.id} type="button" role="option" aria-selected={false} className="tc-rr1-pick" title={`${m.code} ${m.name}`}
                    onMouseDown={(e) => { e.preventDefault(); }} onClick={() => { sec(m); }}>
                    <span className={`tc-rr1-slot tc-rr1-slot-${m.type}`}>{turKisa(m.type)}</span><span className="tc-rr1-pn"><b>{m.code}</b> {m.name}</span>
                  </button>
                ))}
              </span>
            )}
          </span>
        </div>
      )}
      {uyari && <p className="tc-rr1-warnbox" role="alert">{uyari}</p>}
      {duzen && adaylar.length === 0 && a.ciktiId == null && (
        <>
          <p className="tc-rr1-ipucu">Uygun yarı mamul ya da mamul kartı yok; çıktı statülü kalır.</p>
          <Dugme tur="ikincil" simge="plus" title="Yeni kart Malzemeler ve Hizmetler'de açılır" onClick={() => { void git('/malzemeler/yeni'); }}>
            Malzemeler ve Hizmetler&apos;de oluştur
          </Dugme>
        </>
      )}
    </Bolme>
  );
}
