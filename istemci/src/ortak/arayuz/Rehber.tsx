import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import type { HizliIsGrubu } from '../rota/hizli-isler.ts';
import { rehberAra, type GenelKonu, type RehberMaddesi } from '../rota/rehber.ts';
import { rotaninSayfasi } from '../rota/sayfa.ts';
import { Dugme } from './Dugme.tsx';
import { Pencere } from './Pencere.tsx';
import { Simge } from './Simge.tsx';
import { useKatman } from './katman.ts';
import './rehber.css';

interface Ozellikler {
  acik: boolean;
  kapat: () => void;
  maddeler: readonly RehberMaddesi[];
  konular: readonly GenelKonu[];
  kisayollar: readonly HizliIsGrubu[];
  tanitimiBaslat: () => void;
}

function Liste({ baslik, ogeler }: { baslik: string; ogeler: readonly string[] }) {
  if (ogeler.length === 0) return null;
  return (
    <>
      <p className="tc-rehber-alt-baslik">{baslik}</p>
      <ul className="tc-rehber-liste">{ogeler.map((o) => <li key={o}>{o}</li>)}</ul>
    </>
  );
}

function SayfaTarifi({ madde }: { madde: RehberMaddesi }) {
  return (
    <>
      <p className="tc-rehber-ozet">{madde.ozet}</p>
      <Liste baslik="Nasıl yapılır" ogeler={madde.nasil} />
      <Liste baslik="Bilmeniz gerekenler" ogeler={madde.sinirlar} />
    </>
  );
}

function Acilir({ simge, baslik, acik, children }: { simge: RehberMaddesi['simge']; baslik: string; acik?: boolean; children: ReactNode }) {
  return (
    <details className="tc-rehber-madde" open={acik}>
      <summary><Simge ad={simge} /><span>{baslik}</span></summary>
      <div className="tc-rehber-icerik">{children}</div>
    </details>
  );
}

// Sağ üstteki Yardım. Açıldığı sayfanın tarifi en üsttedir; arama soru gibi yazılabilir ("nasıl izin isterim").
export function RehberPenceresi({ acik, kapat, maddeler, konular, kisayollar, tanitimiBaslat }: Ozellikler) {
  const [sorgu, sorguYaz] = useState('');
  const [kitap, kitapYaz] = useState(false);
  const konum = useLocation();
  const git = useNavigate();
  const kimlik = useId();
  useEffect(() => { if (!acik) sorguYaz(''); }, [acik]);
  const sayfaYolu = rotaninSayfasi(konum.pathname);
  const buSayfa = maddeler.find((m) => m.yol === sayfaYolu) ?? null;
  const sonuclar = useMemo(() => rehberAra(sorgu, { maddeler, konular, kisayollar }), [sorgu, maddeler, konular, kisayollar]);
  const gruplar = useMemo(() => [...new Set(maddeler.map((m) => m.grup))], [maddeler]);
  const gitVeKapat = (yol: string) => { kapat(); void git(yol); };
  const aramaVar = sorgu.trim() !== '';

  return (
    <>
      <Pencere
        acik={acik && !kitap}
        kapat={kapat}
        baslik="Yardım ve rehber"
        tur="yan"
        alt={(
          <>
            <Dugme simge="play" onClick={() => { kapat(); tanitimiBaslat(); }}>Tanıtımı başlat</Dugme>
            <Dugme simge="book" onClick={() => kitapYaz(true)}>Kitapçık</Dugme>
          </>
        )}
      >
        <label className="tc-rehber-ara" htmlFor={kimlik}>
          <Simge ad="search" />
          <input
            id={kimlik}
            type="search"
            value={sorgu}
            onChange={(o) => sorguYaz(o.target.value)}
            placeholder="Ne yapmak istiyorsunuz? (ör. izin, mal kabul)"
            aria-label="Rehberde ara"
            autoComplete="off"
            data-ilk-odak
          />
        </label>

        {aramaVar ? (
          <section aria-label="Arama sonuçları" aria-live="polite">
            {sonuclar.length === 0 && (
              <p className="tc-rehber-bos">Bulunamadı. Başka bir sözcük deneyin ya da aşağıdaki sayfalara göz atın.</p>
            )}
            {sonuclar.map((s) => {
              if (s.tur === 'sayfa') {
                return (
                  <Acilir key={`s${s.madde.yol}`} simge={s.madde.simge} baslik={s.madde.baslik} acik={sonuclar.length === 1}>
                    <SayfaTarifi madde={s.madde} />
                    <Dugme simge="next" onClick={() => gitVeKapat(s.madde.yol)}>Sayfaya git</Dugme>
                  </Acilir>
                );
              }
              if (s.tur === 'kisayol') {
                return (
                  <button key={`k${s.yol}${s.baslik}`} type="button" className="tc-rehber-kisayol" onClick={() => gitVeKapat(s.yol)}>
                    <Simge ad={s.simge} />
                    <span><b>{s.baslik}</b><span>{s.aciklama}</span></span>
                  </button>
                );
              }
              return (
                <Acilir key={`g${s.konu.anahtar}`} simge={s.konu.simge} baslik={s.konu.baslik}>
                  <ul className="tc-rehber-liste">{s.konu.metin.map((m) => <li key={m}>{m}</li>)}</ul>
                </Acilir>
              );
            })}
          </section>
        ) : (
          <>
            {buSayfa !== null && (
              <section className="tc-rehber-bolum" aria-label="Bu sayfa">
                <h3 className="tc-rehber-bolum-ad">Bu sayfa: {buSayfa.baslik}</h3>
                <SayfaTarifi madde={buSayfa} />
              </section>
            )}
            <section className="tc-rehber-bolum" aria-label="Başlarken">
              <h3 className="tc-rehber-bolum-ad">Başlarken</h3>
              {konular.map((k) => (
                <Acilir key={k.anahtar} simge={k.simge} baslik={k.baslik}>
                  <ul className="tc-rehber-liste">{k.metin.map((m) => <li key={m}>{m}</li>)}</ul>
                </Acilir>
              ))}
            </section>
            {gruplar.map((g) => (
              <section key={g} className="tc-rehber-bolum" aria-label={g}>
                <h3 className="tc-rehber-bolum-ad">{g}</h3>
                {maddeler.filter((m) => m.grup === g).map((m) => (
                  <Acilir key={m.yol} simge={m.simge} baslik={m.baslik}>
                    <SayfaTarifi madde={m} />
                    {m.yol !== sayfaYolu && <Dugme simge="next" onClick={() => gitVeKapat(m.yol)}>Sayfaya git</Dugme>}
                  </Acilir>
                ))}
              </section>
            ))}
          </>
        )}
      </Pencere>
      {acik && kitap && <Kitapcik maddeler={maddeler} konular={konular} kapat={() => kitapYaz(false)} />}
    </>
  );
}

const bugun = (): string => new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

// Aynı içeriğin yazdırılabilir hali: kişinin gördüğü sayfalar, hepsi açık. Yazdırırken yalnız kitapçık basılır (rehber.css).
export function Kitapcik({ maddeler, konular, kapat }: { maddeler: readonly RehberMaddesi[]; konular: readonly GenelKonu[]; kapat: () => void }) {
  const kutu = useKatman<HTMLDivElement>(true, kapat);
  const gruplar = [...new Set(maddeler.map((m) => m.grup))];
  return createPortal(
    <div ref={kutu} tabIndex={-1} className="tc-kitapcik" role="dialog" aria-modal="true" aria-label="Kullanım kitapçığı">
      <div className="tc-kitapcik-arac">
        <Dugme tur="birincil" simge="download" onClick={() => window.print()} data-ilk-odak>Yazdır / PDF</Dugme>
        <Dugme simge="x" onClick={kapat}>Kapat</Dugme>
      </div>
      <article className="tc-kitapcik-sayfa">
        <header className="tc-kitapcik-kapak">
          <p className="tc-kitapcik-ust mono">TMI CORE</p>
          <h1>Kullanım kitapçığı</h1>
          <p>Bu kitapçık sizin gördüğünüz sayfaları anlatır. {bugun()}</p>
        </header>
        <nav className="tc-kitapcik-icindekiler" aria-label="İçindekiler">
          <h2>İçindekiler</h2>
          <ol>
            <li>Başlarken</li>
            {gruplar.map((g) => <li key={g}>{g}: {maddeler.filter((m) => m.grup === g).map((m) => m.baslik).join(', ')}</li>)}
          </ol>
        </nav>
        <section>
          <h2>Başlarken</h2>
          {konular.map((k) => (
            <div key={k.anahtar} className="tc-kitapcik-madde">
              <h3>{k.baslik}</h3>
              <ul>{k.metin.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          ))}
        </section>
        {gruplar.map((g) => (
          <section key={g}>
            <h2>{g}</h2>
            {maddeler.filter((m) => m.grup === g).map((m) => (
              <div key={m.yol} className="tc-kitapcik-madde">
                <h3><Simge ad={m.simge} />{m.baslik}</h3>
                <p>{m.ozet}</p>
                {m.nasil.length > 0 && <><h4>Nasıl yapılır</h4><ol>{m.nasil.map((n) => <li key={n}>{n}</li>)}</ol></>}
                {m.sinirlar.length > 0 && <><h4>Bilmeniz gerekenler</h4><ul>{m.sinirlar.map((n) => <li key={n}>{n}</li>)}</ul></>}
              </div>
            ))}
          </section>
        ))}
      </article>
    </div>,
    document.body,
  );
}
