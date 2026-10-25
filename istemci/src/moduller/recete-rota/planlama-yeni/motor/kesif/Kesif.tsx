import { useEffect, useMemo, useRef, useState, type KeyboardEvent as TusOlayi } from 'react';
import { DurumKutusu, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { saatYaz, saKisa } from '../kurallar.ts';
import { degisken, MetinYaz } from '../ortak.tsx';
import { Bekleme, Sure, Yuk } from '../ozet/bolumler.tsx';
import type { OzetVerisi } from '../ozet/veri.ts';
import {
  ANLAT_SURE_MS, anlatAdimlari, HAZIRLIK_YOK, hatDuzeni, KESIF_GORUNUMLERI, paySayilari, payDuzeni, payYazi, type AnlatAdimi, type KesifGorunumu, type Ton,
} from './kurallar.ts';
import './kesif.css';

// Keşfet görünümü (zn-kesif.betik): tahtanın yerini tek büyük gösterim alır; Pay şeridi, Sipariş hatları, Hazırlık, Planı anlat. Siparişe
// dokunmak onu seçer; seçim öteki gösterimlerde de vurgulu kalır. Sekme ve adım görünümler arası korunur (eski U.ksGor, U.ksAdim).
export interface KesifDurumu { gor: KesifGorunumu; adim: number; oyna: boolean }
export const KESIF_ILK: KesifDurumu = { gor: 'pay', adim: 0, oyna: true };

interface Ozellikler {
  c: PlanlamaCalismasi; v: OzetVerisi; vYorum: OzetVerisi; secJob: string | null; tezGrup: (m: string) => string;
  durum: KesifDurumu; durumDegis: (d: KesifDurumu) => void;
  sipSec: (j: string) => void; tezSec: (m: string) => void; gunSec: (d: number) => void; acikGrup: string | null; grupAc: (g: string) => void;
}

// Gösterim ekrandaki genişlikte çizilir; küçük oynamada yeniden çizilmez (ksOlc, 24 birim). Gövde görünüm değişince yeniden kurulur, ölçü
// yeni öğeden alınır (geri çağıran ref).
function useGenislik(ilk = 0): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [w, setW] = useState(ilk);
  useEffect(() => {
    if (!el) return undefined;
    const olc = () => { const x = el.clientWidth; if (x) setW((y) => (Math.abs(x - y) > 24 ? x : y)); };
    olc(); if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(olc); ro.observe(el); return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

const Sayi = ({ n, ad, ton }: { n: number; ad: string; ton: Ton }) => <span className="tc-pym-ks-sayi" data-ton={ton}><b className="tc-pym-mono">{n}</b>{ad}</span>;
const Not = ({ children }: { children: string }) => <p className="tc-pym-ks-not"><Simge ad="help" boyut="k" />{children}</p>;
// SVG'deki seçilebilir öğe: Enter ve boşluk seçer.
const secTus = (f: () => void) => (e: TusOlayi) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } };

export function Kesif(o: Ozellikler) {
  const { durum, durumDegis } = o;
  const [id, ad, , acik] = KESIF_GORUNUMLERI.find((x) => x[0] === durum.gor) ?? KESIF_GORUNUMLERI[0] ?? ['pay', '', 'flag', ''];
  const [govde, w] = useGenislik();
  // Planı anlat'ın gösterimi her adımda yeniden kurulur; son ölçü korunur, nokta yeniden yerleşmez.
  const wgSon = useRef(0);
  const adimlar = useMemo(() => anlatAdimlari(o.c, o.v, o.tezGrup, o.vYorum), [o.c, o.v, o.tezGrup, o.vYorum]);
  const n = adimlar.length;
  const adim = Math.max(0, Math.min(n - 1, durum.adim));

  // Planı anlat kendiliğinden ilerler; adıma dokunmak oynatmayı durdurur.
  const son = useRef({ durum, durumDegis, n }); son.current = { durum, durumDegis, n };
  useEffect(() => {
    if (id !== 'anlat' || !durum.oyna) return undefined;
    const z = setTimeout(() => { const x = son.current; x.durumDegis({ ...x.durum, adim: (x.durum.adim + 1) % x.n }); }, ANLAT_SURE_MS);
    return () => clearTimeout(z);
  }, [id, durum.oyna, adim]);
  const adimSec = (i: number) => durumDegis({ ...durum, adim: ((i % n) + n) % n, oyna: false });
  // Planı anlat'ta sol ve sağ ok adım değiştirir (yazı alanında ve açık pencerede çalışmaz).
  useEffect(() => {
    if (id !== 'anlat') return undefined;
    const tus = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      const t = e.target as HTMLElement | null; if (t?.closest?.('input, textarea, select, dialog, [contenteditable], [role="dialog"], [role="menu"]')) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault(); e.stopPropagation();
      const x = son.current; x.durumDegis({ ...x.durum, adim: (((x.durum.adim + (e.key === 'ArrowRight' ? 1 : -1)) % x.n) + x.n) % x.n, oyna: false });
    };
    window.addEventListener('keydown', tus, true);
    return () => window.removeEventListener('keydown', tus, true);
  }, [id]);

  const gorSec = (g: KesifGorunumu) => durumDegis({ ...durum, gor: g, oyna: g === 'anlat' ? true : durum.oyna });
  return (
    <div className="tc-pym-ks-kap">
      <section className="tc-pym-ks" aria-label={ad}>
        <header className="tc-pym-ks-ust">
          <nav className="tc-pym-ks-sek" role="tablist" aria-label="Keşfet görünümleri">
            {KESIF_GORUNUMLERI.map(([k, a, sm]) => (
              <button key={k} type="button" role="tab" aria-selected={k === id} title={a} onClick={() => gorSec(k)}><Simge ad={sm} boyut="k" /><span>{a}</span></button>
            ))}
          </nav>
          <p>{acik}</p>
        </header>
        {/* Giriş canlandırması yalnız görünüm ya da adım değişince oynar: anahtar değişince gövde yeniden kurulur. */}
        <div key={id === 'anlat' ? `anlat${adim}` : id} ref={govde} className="tc-pym-ks-govde" data-gor={id}>
          {id === 'pay' ? <PayGorunumu {...o} w={w} />
            : id === 'hat' ? <HatGorunumu {...o} w={w} />
            : id === 'hazir' ? <div className="tc-pym-ks-hazir"><DurumKutusu durum="bos" mesaj={HAZIRLIK_YOK} /></div>
            : <Anlat {...o} wgSon={wgSon} adimlar={adimlar} adim={adim} adimSec={adimSec} oynaDegis={() => durumDegis({ ...durum, oyna: !durum.oyna })} />}
        </div>
      </section>
    </div>
  );
}

// Pay şeridi (ksPay, ksPaySvg).
function PaySeridi({ c, v, secJob, sipSec, w, kucuk }: Ozellikler & { w: number; kucuk?: boolean }) {
  const d = payDuzeni(v, w, !!kucuk, secJob);
  if (!d) return <p className="tc-pym-ks-not">Bu dönemde termini olan sipariş yok.</p>;
  const tikUst = d.ust - 8, tikAlt = d.H - 26;
  return (
    <svg className="tc-pym-ks-pay" viewBox={`0 0 ${d.W} ${d.H}`} role="img" aria-label="Sipariş payları">
      <rect className="tc-pym-ks-bolge" data-ton="hata" x={d.pad} y={tikUst} width={(d.x0 - d.pad).toFixed(1)} height={d.H - d.ust - 18} rx={8} />
      <rect className="tc-pym-ks-bolge" data-ton="uyari" x={d.x0.toFixed(1)} y={tikUst} width={(d.x1 - d.x0).toFixed(1)} height={d.H - d.ust - 18} />
      {d.x0 - d.pad > 40 && <text className="tc-pym-ks-bas" data-ton="hata" x={d.pad + 8} y={d.ust + 8}>Geç</text>}
      {d.x1 - d.x0 > 130 && <text className="tc-pym-ks-bas" data-ton="uyari" x={d.x0 + 8} y={d.ust + 8}>1 günden az pay</text>}
      <text className="tc-pym-ks-bas" data-ton="tamam" x={d.W - d.pad - 8} y={d.ust + 8} textAnchor="end">Rahat</text>
      {d.tikler.map((t) => (
        <g key={t.p}>
          <line className="tc-pym-ks-tik" x1={t.x.toFixed(1)} x2={t.x.toFixed(1)} y1={tikUst} y2={tikAlt} />
          <text className="tc-pym-ks-eksen" x={t.x.toFixed(1)} y={d.H - 8} textAnchor={t.yon}>{t.yazi}</text>
        </g>
      ))}
      <line className="tc-pym-ks-termin" x1={d.x0.toFixed(1)} x2={d.x0.toFixed(1)} y1={tikUst} y2={tikAlt} />
      {d.noktalar.map((x) => (
        <g key={x.id} className="tc-pym-ks-nokta" data-ton={x.ton} data-secili={x.id === secJob ? '' : undefined} ref={degisken({ '--i': x.i })} tabIndex={0} role="button"
          aria-label={`${x.id}: ${payYazi(x.p)}`} onClick={() => sipSec(x.id)} onKeyDown={secTus(() => sipSec(x.id))}>
          <title>{`${x.id} · ${x.urun}\n${payYazi(x.p)} · bitiş ${saatYaz(c.D, x.C)}`}</title>
          <circle cx={x.x.toFixed(1)} cy={x.y.toFixed(1)} r={d.r} />
        </g>
      ))}
      <g className="tc-pym-ks-etiketler" aria-hidden="true">
        {d.noktalar.filter((x) => d.etiketli.has(x.id)).map((x) => <text key={x.id} x={(x.x - d.r - 6).toFixed(1)} y={(x.y + 4).toFixed(1)} textAnchor="end">{x.id}</text>)}
      </g>
    </svg>
  );
}
function PayGorunumu(o: Ozellikler & { w: number }) {
  const s = paySayilari(o.v);
  return (
    <>
      <div className="tc-pym-ks-say"><Sayi n={s.gec} ad="geç" ton="hata" /><Sayi n={s.risk} ad="1 günden az pay" ton="uyari" /><Sayi n={s.rahat} ad="rahat" ton="tamam" /></div>
      <div className="tc-pym-ks-tuval"><PaySeridi {...o} /></div>
      <Not>Pay: siparişin planlanan bitişiyle termini arasındaki süre. Noktaya dokun, sipariş yan panelde açılır.</Not>
    </>
  );
}

// Sipariş hatları (ksHat).
function HatGorunumu({ v, secJob, sipSec, w }: Ozellikler & { w: number }) {
  const d = hatDuzeni(v, w);
  return (
    <>
      <div className="tc-pym-ks-say">
        <Sayi n={d.yolSayisi} ad="farklı yol" ton="bilgi" />
        {d.enSik && <span className="tc-pym-ks-sayi" data-ton="bilgi"><Simge ad="target" boyut="k" />En sık yol: <b>{d.enSik.yol}</b> ({d.enSik.n} sipariş)</span>}
      </div>
      <div className="tc-pym-ks-tuval tc-pym-ks-kay">
        <svg className="tc-pym-ks-hatlar" viewBox={`0 0 ${d.W} ${d.H}`} ref={degisken({ '--en': `${d.W}` })} role="img" aria-label="Sipariş hatları">
          {d.sutunlar.map((s) => (
            <g key={s.g}>
              <text className="tc-pym-ks-sutun" x={s.x.toFixed(1)} y={d.ust - 18} textAnchor="middle">{s.ad}</text>
              <line className="tc-pym-ks-tik" x1={s.x.toFixed(1)} x2={s.x.toFixed(1)} y1={d.ust - 8} y2={d.H - 10} />
            </g>
          ))}
          {d.satirlar.map((s) => (
            <g key={s.id} className="tc-pym-ks-hat" data-ton={s.ton} data-secili={s.id === secJob ? '' : undefined} ref={degisken({ '--i': s.i })} tabIndex={0} role="button"
              aria-label={`${s.id}: ${s.ad}`} onClick={() => sipSec(s.id)} onKeyDown={secTus(() => sipSec(s.id))}>
              <title>{`${s.id} · ${s.ad.split(', ').join(' › ')}`}</title>
              <rect className="tc-pym-ks-hat-zemin" x={0} y={s.y - d.ara / 2} width={d.W} height={d.ara} />
              <text className="tc-pym-ks-hat-ad" x={d.sol - 14} y={s.y + 4} textAnchor="end">{s.id}</text>
              <path className="tc-pym-ks-hat-yol" d={s.yol} pathLength={1} />
              {s.duraklar.map((x) => <circle key={x.g} className="tc-pym-ks-durak" cx={x.x.toFixed(1)} cy={s.y} r={x.r.toFixed(1)}><title>{`${x.ad}: ${saKisa(x.bek)} bekleme`}</title></circle>)}
              <text className="tc-pym-ks-hat-son tc-pym-mono" x={d.W - d.sag + 16} y={s.y + 4} data-ton={s.ton}>{s.son}</text>
            </g>
          ))}
        </svg>
      </div>
      <Not>Çizgi soldan sağa siparişin geçtiği bölümleri birleştirir. Durak büyüdükçe orada bekleme uzar. Üstüne gelince öteki hatlar soluklaşır.</Not>
    </>
  );
}

// Planı anlat (ksAnlat): adım şeridi, sahne (metin ve gösterim), önceki, oynat ya da durdur, sonraki. Gösterimler seçimsiz ve gün
// vurgusuz çizilir (eski brBekle(v, null), brYuk(v, null); Keşfet'te zaman imleci yok).
function Anlat(o: Ozellikler & { wgSon: { current: number }; adimlar: AnlatAdimi[]; adim: number; adimSec: (i: number) => void; oynaDegis: () => void }) {
  const { v, adimlar, adim, durum } = o;
  const a = adimlar[adim]; const [gorsel, wg] = useGenislik(o.wgSon.current);
  o.wgSon.current = wg;
  if (!a) return null;
  return (
    <div className="tc-pym-ks-anlat" data-oyna={durum.oyna ? '' : undefined}>
      <div className="tc-pym-ks-adimlar" role="tablist" aria-label="Adımlar">
        {adimlar.map((x, i) => (
          <button key={i} type="button" role="tab" aria-selected={i === adim} title={x.baslik} onClick={() => o.adimSec(i)}>
            <i data-gecti={i < adim ? '' : undefined}><u /></i><span>{x.baslik}</span>
          </button>
        ))}
      </div>
      <div className="tc-pym-ks-sahne" data-ton={a.ton}>
        <div className="tc-pym-ks-metin">
          <span className="tc-pym-ks-no tc-pym-mono">{adim + 1} / {adimlar.length}</span>
          <h3><Simge ad={a.simge} boyut="k" />{a.baslik}</h3>
          <p><MetinYaz m={a.m} /></p>
          <div className="tc-pym-ks-oynat">
            <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-simge-d" aria-label="Önceki (sol ok)" title="Önceki (sol ok)" onClick={() => o.adimSec(adim - 1)}><Simge ad="chev-left" boyut="k" /></button>
            <button type="button" className="tc-dugme tc-pym-kucuk" onClick={o.oynaDegis}><Simge ad={durum.oyna ? 'pause' : 'play'} boyut="k" />{durum.oyna ? 'Durdur' : 'Oynat'}</button>
            <button type="button" className="tc-dugme tc-pym-kucuk tc-dugme-birincil" onClick={() => o.adimSec(adim + 1)}><Simge ad="next" boyut="k" />Sonraki</button>
          </div>
        </div>
        <div ref={gorsel} className="tc-pym-ks-gorsel">
          {a.gorsel === 'pay' ? <PaySeridi {...o} w={wg} kucuk />
            : a.gorsel === 'bekle' ? <Bekleme c={o.c} v={v} sec={null} acikGrup={o.acikGrup} grupAc={o.grupAc} sipSec={o.sipSec} kartAc={null} />
            : a.gorsel === 'sure' ? <Sure v={v} sipSec={o.sipSec} />
            : a.gorsel === 'yuk' ? <Yuk c={o.c} v={v} sec={null} gun={-1} gunSec={o.gunSec} tezSec={o.tezSec} tezGrup={o.tezGrup} />
            : null}
        </div>
      </div>
    </div>
  );
}
