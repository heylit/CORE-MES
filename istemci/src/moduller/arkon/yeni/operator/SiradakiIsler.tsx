import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { IS_DURUMLARI } from '../cekirdek/sabitler.ts';
import type { IsYeriBilgisi } from './Parcalar.tsx';
import type { Is, IsDurumu } from './tipler.ts';

// 3714: kart dardır ve özet taşır (resim, parça, proje · Rev, adet, emir no en altta); bakılan kart genişler ve Op, malzeme, termin, tezgâhı açar.
// Şerit yüksekliği sabittir: kart yalnız yatayda genişler, alt hiza kımıldamaz.
const durumRengi = (s: string) => IS_DURUMLARI[s as IsDurumu]?.durum ?? 'sirada';
const durumAdi = (s: string): string => IS_DURUMLARI[s as IsDurumu]?.etiket ?? s;
const terminYaz = (t: string | null | undefined): string => (t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t.split('-').reverse().join('.') : t || '—');

export function SiradakiKart({ is, siradaki, ekranda, acik, yer, resim }: {
  is: Is; siradaki: boolean; ekranda: boolean; acik: boolean; yer: IsYeriBilgisi | null; resim?: ReactNode;
}) {
  const oran = is.target > 0 ? Math.min(1, Math.max(0, is.good / is.target)) : 0;
  const durum = durumRengi(is.state);
  const projeRev = [is.pkg?.proje, is.pkg?.rev ? `Rev ${is.pkg.rev}` : null].filter(Boolean).join(' · ');
  const tezgah = yer?.makine ? [yer.makine, yer.makineAd].filter(Boolean) : null;
  return (
    <article className="tc-ay1-sk" data-durum={durum} data-ekranda={ekranda || undefined} data-acik={acik || undefined}>
      <span className="tc-ay1-sk-resim" aria-hidden="true">{resim ?? <Simge ad="camera" />}</span>
      <div className="tc-ay1-sk-ic">
        <span className="tc-ay1-sk-etiketler">
          {acik ? <span className="tc-ay1-cip" data-durum={durum}><i aria-hidden="true" />{durumAdi(is.state)}</span> : null}
          {ekranda ? <span className="tc-ay1-etiket tc-ay1-tcark-ekranda">Ekranda</span> : siradaki ? <span className="tc-ay1-etiket">Sıradaki</span> : null}
          {is.urgent ? <span className="tc-ay1-etiket" data-durum="durdu">Acil</span> : null}
        </span>
        <b className="tc-ay1-sk-parca" title={is.part}>{is.part || '—'}</b>
        {projeRev ? <small className="tc-ay1-sk-proje" title={projeRev}>{projeRev}</small> : null}
        {is.empty ? null : <small className="tc-ay1-mono tc-ay1-sk-adet">{is.good} / {is.target} adet</small>}
        {is.empty ? null : <progress className="tc-ay1-tcark-ilerleme" max={1} value={oran} aria-label="İlerleme" />}
        <small className="tc-ay1-mono tc-ay1-sk-no" title={is.no}>{is.no}</small>
      </div>
      {acik && !is.empty ? (
        <dl className="tc-ay1-sk-ayrinti">
          <div><dt>Op</dt><dd title={is.op}>{is.op || '—'}</dd></div>
          <div><dt>Malzeme</dt><dd title={is.pkg?.material}>{is.pkg?.material || '—'}</dd></div>
          <div><dt>Termin</dt><dd>{terminYaz(is.due)}</dd></div>
          <div><dt>Tezgâh</dt><dd>{tezgah ? <><b>{tezgah[0]}</b>{tezgah[1] ? <span>{tezgah[1]}</span> : null}</> : 'Makine seçilmedi'}</dd></div>
        </dl>
      ) : null}
    </article>
  );
}

// 3338-6 a: terminalin en üstünde istasyonun işleri boydan boya, elle kayar. Ekrandaki iş ortaya gelir ve sarı çerçevelidir.
// Karta dokunmak yalnız bakar (önizleme); geçiş "Bu işe geç" ile ve bugünkü geçiş sorusuyla olur. Biten işler soluk durur.
export function SiradakiIsler({ isler, ekranda, bakilan, siradakiMi, yer, sec, eylem }: {
  isler: readonly Is[]; ekranda: number; bakilan: number; siradakiMi: (i: number) => boolean; yer: (i: number) => IsYeriBilgisi | null;
  sec: (i: number) => void; eylem: ReactNode;
}) {
  const ol = useRef<HTMLOListElement>(null);
  const odak = bakilan >= 0 ? bakilan : ekranda;
  useLayoutEffect(() => {
    const kap = ol.current;
    const li = kap?.children[odak] as HTMLElement | undefined;
    if (!kap || !li) return;
    const sol = kap.scrollLeft + li.getBoundingClientRect().left - kap.getBoundingClientRect().left - (kap.clientWidth - li.offsetWidth) / 2;
    if (typeof kap.scrollTo === 'function') kap.scrollTo({ left: sol }); else kap.scrollLeft = sol;
  }, [odak, isler.length]);
  // 3583: iş yokken de şerit yerinde durur (aynı bölge, aynı yükseklik); yalnız içeriği "iş yok" yazar.
  if (isler.every((x) => x.empty)) {
    return (
      <section className="tc-ay1-sira" aria-label="Sıradaki işler" data-bos="">
        <span className="tc-ay1-sira-ust"><Simge ad="list" boyut="k" /><b>Sıradaki işler</b><small className="tc-ay1-mono">0 iş</small></span>
        <div className="tc-ay1-sira-govde"><p className="tc-ay1-soluk tc-ay1-sira-bos">Sırada iş yok</p></div>
      </section>
    );
  }
  const kaydir = (yon: -1 | 1) => {
    const kap = ol.current;
    const li = kap?.firstElementChild as HTMLElement | null | undefined;
    if (!kap || !li) return;
    const sol = kap.scrollLeft + yon * li.offsetWidth;
    if (typeof kap.scrollTo === 'function') kap.scrollTo({ left: sol, behavior: 'smooth' }); else kap.scrollLeft = sol;
  };
  const acik = isler.filter((x) => !x.empty && x.state !== 'done').length;
  return (
    <section className="tc-ay1-sira" aria-label="Sıradaki işler">
      <span className="tc-ay1-sira-ust">
        <Simge ad="list" boyut="k" /><b>Sıradaki işler</b>
        <small className="tc-ay1-mono">{acik} iş · {ekranda + 1}/{isler.length}</small>
      </span>
      <div className="tc-ay1-sira-govde">
        <button type="button" className="tc-ra-kaydir" aria-label="Önceki işler" onClick={() => kaydir(-1)}><Simge ad="chev-left" boyut="k" /></button>
        <ol ref={ol}>
          {isler.map((x, i) => (
            <li key={`${x.no}:${String(i)}`} data-bitti={x.state === 'done' ? '' : undefined}>
              <button type="button" aria-pressed={i === odak} aria-label={`${x.no}${i === ekranda ? ' · ekranda' : ''}`} onClick={() => sec(i)}>
                <SiradakiKart is={x} siradaki={i !== ekranda && siradakiMi(i)} ekranda={i === ekranda} acik={i === odak} yer={yer(i)} />
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="tc-ra-kaydir" aria-label="Sonraki işler" onClick={() => kaydir(1)}><Simge ad="chev-right" boyut="k" /></button>
      </div>
      {eylem ? <div className="tc-ay1-sira-eylem">{eylem}</div> : null}
    </section>
  );
}
