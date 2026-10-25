import { createElement, Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { aramaTerimleri, vurgula, yardimAra, type MetinParcasi } from './kurallar.ts';
import { GORUNUM_YARDIMI, IK_YARDIM, SIK_ARANANLAR, type YardimDugumu, type YardimKonusu } from './yardim.ts';
import './analiz.css';

// "İlgili sayfayı aç" bugünkü ekranda ayarlar ve hesaplamalarda ilgili sekmeyi de seçer.
const AYAR_SEKMESI: Readonly<Record<string, string>> = { 'yan-haklar': 'yanhak', prim: 'yanhak', tesvik: 'tesvik', 'ilk-kurulum': 'genel', veri: 'veri', donemler: 'ucret' };
const HESAP_SEKMESI: Readonly<Record<string, string>> = { 'kidem-ihbar': 'tazminat', 'yillik-izin': 'izin', 'fazla-mesai': 'mesai', 'bordro-temel': 'brutnet', hesaplamalar: 'brutnet' };
export const ilgiliSekme = (konu: string, gorunum: string): string | undefined =>
  gorunum === 'ayarlar' ? AYAR_SEKMESI[konu] : gorunum === 'hesap' ? HESAP_SEKMESI[konu] : undefined;

const SIMGE_ICIN: Readonly<Record<string, Parameters<typeof Simge>[0]['ad']>> = {
  pano: 'dash', gorev: 'clipboard-check', personel: 'users', izin: 'clock', devam: 'clock', bordro: 'lira', hesap: 'chart',
  ayarlar: 'gear', isealim: 'user-plus', pozisyon: 'id-card', rapor: 'chart', plan: 'chart', log: 'list', benim: 'user',
};

const Isaretli = ({ parcalar }: { parcalar: readonly MetinParcasi[] }) => (
  <>{parcalar.map((p, i) => (p.vurgu ? <mark key={i}>{p.metin}</mark> : <Fragment key={i}>{p.metin}</Fragment>))}</>
);

// Düğüm ağacını çizer. Metin, SVG ve düğme dışında arama terimleriyle işaretlenir (bugünkü ekran gibi).
function ciz(d: YardimDugumu, terimler: readonly string[], anahtar: string | number, svgIcinde = false): ReactNode {
  if (typeof d === 'string') return svgIcinde || !terimler.length ? d : <Isaretli key={anahtar} parcalar={vurgula(d, terimler)} />;
  const [etiket, ozellik, ...cocuklar] = d;
  const svg = svgIcinde || etiket === 'svg';
  return createElement(etiket, { ...ozellik, key: anahtar }, ...cocuklar.map((c, i) => ciz(c, terimler, i, svg)));
}

const KonuBaglantisi = ({ konu, ac, children }: { konu: YardimKonusu; ac: () => void; children?: ReactNode }) => (
  <button type="button" className="tc-ikr-konu" onClick={ac}>
    {children}
    <b>{konu.baslik}</b>
    <small>{konu.ozet}</small>
  </button>
);

interface Ozellikler {
  // Açık görünüm: "Bu sayfa hakkında" konusunu seçer.
  gorunum: string;
  git: (gorunum: string, sekme?: string) => void;
  kapat: () => void;
  // Panel bir konuyla açılabilir (Ctrl K "Kılavuz" sonucu).
  konu?: string | null;
  vurgu?: string;
}

export function YardimGorunumu({ gorunum, git, kapat, konu: ilkKonu = null, vurgu: ilkVurgu = '' }: Ozellikler) {
  const [q, setQ] = useState('');
  const [konuKimlik, setKonu] = useState<string | null>(ilkKonu);
  const [vurgu, setVurgu] = useState(ilkVurgu);
  const [buyuk, setBuyuk] = useState(false);
  const govde = useRef<HTMLDivElement>(null);
  const arama = useRef<HTMLInputElement>(null);
  const konu = konuKimlik === null ? null : IK_YARDIM.find((k) => k.kimlik === konuKimlik) ?? null;
  const sonuclar = useMemo(() => yardimAra(IK_YARDIM, q), [q]);
  const bulunan = (id: string) => IK_YARDIM.find((k) => k.kimlik === id);
  const baglam = bulunan(GORUNUM_YARDIMI[gorunum] ?? '');
  const kategoriler = [...new Set(IK_YARDIM.map((k) => k.kategori))];
  const ac = (id: string, hl = '') => { setKonu(id); setVurgu(hl); setQ(''); };

  useEffect(() => { arama.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    govde.current?.scrollTo?.({ top: 0 });
    const ilk = govde.current?.querySelector('mark');
    ilk?.scrollIntoView?.({ block: 'center' });
  }, [konuKimlik, q]);

  const anaSayfa = (
    <>
      {baglam && (
        <div className="tc-ikr-baglam">
          <span className="tc-ikr-soluk">Bu sayfa hakkında</span>
          <KonuBaglantisi konu={baglam} ac={() => ac(baglam.kimlik)} />
        </div>
      )}
      <div className="tc-ikr-sik">
        <span className="tc-ikr-soluk">Sık aranan</span>
        <div>{SIK_ARANANLAR.map((s) => <button key={s} type="button" className="tc-ikr-cip" onClick={() => setQ(s)}>{s}</button>)}</div>
      </div>
      {kategoriler.map((k) => (
        <section key={k} className="tc-ikr-kategori">
          <h3>{k}</h3>
          {IK_YARDIM.filter((x) => x.kategori === k).map((x) => <KonuBaglantisi key={x.kimlik} konu={x} ac={() => ac(x.kimlik)} />)}
        </section>
      ))}
    </>
  );

  let icerik: ReactNode;
  if (q.trim()) {
    icerik = sonuclar.length
      ? (
        <>
          <p className="tc-ikr-soluk">{sonuclar.length} sonuç</p>
          {sonuclar.map((s) => (
            <button key={s.konu.kimlik} type="button" className="tc-ikr-konu" onClick={() => ac(s.konu.kimlik, q)}>
              <span className="tc-ikr-konu-kategori">{s.konu.kategori}</span>
              <b>{s.konu.baslik}</b>
              <small><Isaretli parcalar={s.parca} /></small>
            </button>
          ))}
        </>
      )
      : (
        <>
          <div className="tc-ikr-bos"><b>“{q}” için sonuç yok</b>Farklı bir kelime deneyin ya da aşağıdaki konulara göz atın.</div>
          {anaSayfa}
        </>
      );
  } else if (konu) {
    const terimler = aramaTerimleri(vurgu);
    const ilgili = konu.ilgili.map(bulunan).filter((x): x is YardimKonusu => x !== undefined);
    icerik = (
      <article className="tc-ikr-makale">
        <button type="button" className="tc-ikr-geri" onClick={() => { setKonu(null); setVurgu(''); }}>
          <Simge ad="chev-left" />Tüm konular
        </button>
        <div className="tc-ikr-konu-kategori">{konu.kategori}</div>
        <h2>{konu.baslik}</h2>
        <p className="tc-ikr-giris">{konu.ozet}</p>
        {konu.sekil && (
          <figure className="tc-ikr-sekil-kutu">
            {ciz(konu.sekil, [], 'sekil')}
            <figcaption>
              <button type="button" className="tc-ikr-buyut" onClick={() => setBuyuk(true)}><Simge ad="search" />Şekli büyüt</button>
            </figcaption>
          </figure>
        )}
        <div className="tc-ikr-metin">{konu.govde.map((d, i) => ciz(d, terimler, i))}</div>
        {konu.gorunum && (
          <Dugme
            tur="birincil" simge={SIMGE_ICIN[konu.gorunum] ?? 'chev-right'}
            onClick={() => { git(konu.gorunum!, ilgiliSekme(konu.kimlik, konu.gorunum!)); if (window.matchMedia?.('(max-width: 900px)').matches) kapat(); }}
          >
            İlgili sayfayı aç
          </Dugme>
        )}
        {ilgili.length > 0 && (
          <div className="tc-ikr-ilgili">
            <h4>İlgili konular</h4>
            {ilgili.map((r) => <KonuBaglantisi key={r.kimlik} konu={r} ac={() => ac(r.kimlik)} />)}
          </div>
        )}
        {konu.sekil && (
          <Pencere acik={buyuk} kapat={() => setBuyuk(false)} baslik={konu.baslik} tur="tam">
            <div className="tc-ikr-sekil-buyuk">{ciz(konu.sekil, [], 'buyuk')}</div>
          </Pencere>
        )}
      </article>
    );
  } else icerik = anaSayfa;

  return (
    <aside className="tc-ikr-yardim" aria-labelledby="tc-ikr-yardim-baslik">
      <div className="tc-ikr-yardim-ust">
        <h2 id="tc-ikr-yardim-baslik"><Simge ad="book" />Kullanım kılavuzu</h2>
        <button type="button" className="tc-ikr-kapat" aria-label="Kılavuzu kapat" onClick={kapat}><Simge ad="x" /></button>
      </div>
      <div className="tc-ikr-ara">
        <Simge ad="search" />
        <label className="tc-ikr-gizli" htmlFor="tc-ikr-yardim-q">Kılavuzda ara</label>
        <input
          ref={arama} id="tc-ikr-yardim-q" type="search" autoComplete="off" value={q} placeholder="Kılavuzda ara: ör. net maaş, kıdem, ilan"
          onChange={(o) => setQ(o.target.value)}
          onKeyDown={(o) => { if (o.key === 'Enter' && sonuclar[0]) ac(sonuclar[0].konu.kimlik, q); }}
        />
      </div>
      <div className="tc-ikr-yardim-govde" ref={govde}>{icerik}</div>
    </aside>
  );
}
