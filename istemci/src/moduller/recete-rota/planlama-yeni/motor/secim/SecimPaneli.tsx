import { useCallback, useEffect, useState, type MutableRefObject, type ReactNode } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { DonemOlcegi } from '../../gorunumler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { Dg } from '../cizelge/Dugme.tsx';
import { HAZIRLIK_YOK } from '../kesif/kurallar.ts';
import '../kesif/kesif.css';
import {
  bekleme, dilimAdi, dilimBoyu, durusOku, gecikmeEtkisi, gecMetin, siparisRengi, tezgahDurumu, type Aralik, type Sahne,
} from '../harita/kurallar.ts';
import { ayristir, KATEGORI_AD, ONCELIK_AD, saatYaz, saatYazi, type Derleme, type OkunanPlan, type SureKategorisi } from '../kurallar.ts';
import { degisken, HAZIRLANIYOR, MOTOR_NOTU, YOK_NOTU } from '../ortak.tsx';
import { isoYerel, mesaiAdaylari, tezgahYazi, yolculuk, type PanelSecimi } from './kurallar.ts';
import { RotaSekmesi, TakvimSekmesi } from './Sekmeler.tsx';
import './secim.css';

// Yan panel (zl-yan dkHtml) ve seçim kartı (zc-tahta tkSecim, z-komuta kmSiparis, kmTezgah, kmIs): Özet, Harita ve Keşfet'te seçim olunca
// görünümün sağında açılır, dar ekranda alttan. Motorun hamleleri (öne al, öncelik, hedefe yetiştir, boşalt, sıra, ek mesai, taşı, kaydır)
// yerinde ve pasiftir (357 b); sabitlemek çalışmaya yazar (plan.kilitle, 223 a ile ortak plan.yaz).
export type PanelSekmesi = 'yon' | 'rota' | 'takvim';
export interface Ozellikler {
  kok?: MutableRefObject<HTMLElement | null>;
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; s: Sahne; r: Aralik; olcek: DonemOlcegi; t: number;
  secim: PanelSecimi; sek: PanelSekmesi; sekSec: (x: PanelSekmesi) => void;
  komut: CalismaKomutu | null; planYaz: boolean; planKilitle: boolean;
  kapat: () => void; opSec: (id: string) => void; sipSec: (j: string) => void; zamanSec: (t: number) => void;
  // Rota sekmesindeki seçim kutusu siparişi değiştirir, sekme Rota'da kalır (mz-rota-j).
  rotaSec: (j: string) => void;
  gunPlani: (t: number, sec: { adim?: string; tezgah?: string }) => void; hazirlikAc: () => void;
}

const Bolum = ({ baslik, simge, children }: { baslik: string; simge: SimgeAdi; children: ReactNode }) => (
  <section className="tc-pym-km-bolum"><h4><Simge ad={simge} boyut="k" />{baslik}</h4>{children}</section>
);
function Baslik({ tur, ad, alt, nokta }: { tur: string; ad: string; alt: string; nokta?: number }) {
  return (
    <header className="tc-pym-km-bas">
      <span className="tc-pym-km-tur">{tur.toLocaleUpperCase('tr-TR')}</span>
      <div><b className="tc-pym-mono">{nokta != null && <span className="tc-pym-km-nokta" ref={degisken({ '--c': `var(--tc-pym-is-${nokta})` })} />}{ad}</b><small>{alt}</small></div>
    </header>
  );
}

// Panel, sayfayı kaydıran kutunun görünen kısmını aşmaz (eski panel çerçevenin boyundaydı): boy o kutudan ve panelin kutudaki yerinden okunur
// (--tc-pym-gy); dar ekranda alttan açılan panel kutunun yüzde 46'sıdır (--tc-pym-gk).
function useGorunurBoy(kok?: MutableRefObject<HTMLElement | null>) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const govde = el?.parentElement ?? null; let k = govde?.parentElement ?? null;
    while (k && !/(auto|scroll)/.test(getComputedStyle(k).overflowY)) k = k.parentElement;
    if (!el || !govde || !k) return undefined;
    const kap = k;
    const olc = () => {
      const ust = govde.getBoundingClientRect().top - kap.getBoundingClientRect().top;
      el.style.setProperty('--tc-pym-gy', `${Math.round(kap.clientHeight - Math.max(0, ust))}px`);
      el.style.setProperty('--tc-pym-gk', `${kap.clientHeight}px`);
    };
    olc(); kap.addEventListener('scroll', olc, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(olc); ro?.observe(kap);
    return () => { kap.removeEventListener('scroll', olc); ro?.disconnect(); };
  }, [el]);
  return useCallback((x: HTMLElement | null) => { setEl(x); if (kok) kok.current = x; }, [kok]);
}

export function SecimPaneli(o: Ozellikler) {
  const { secim } = o;
  const kok = useGorunurBoy(o.kok);
  const sekmeler: [PanelSekmesi, string][] = secim.tur === 'siparis' ? [['yon', 'Yön ver'], ['rota', 'Rota']] : secim.tur === 'tezgah' ? [['yon', 'Yön ver'], ['takvim', 'Takvim']] : [];
  const k = sekmeler.some(([x]) => x === o.sek) ? o.sek : 'yon';
  const govde = k === 'rota' ? <RotaSekmesi {...o} j={secim.id} />
    : k === 'takvim' ? <TakvimSekmesi {...o} m={secim.id} />
    : secim.tur === 'is' ? <IsKarti {...o} id={secim.id} />
    : secim.tur === 'siparis' ? <SiparisKarti {...o} j={secim.id} />
    : <TezgahKarti {...o} m={secim.id} />;
  return (
    <aside ref={kok} className="tc-pym-dk" aria-label="Yan panel" tabIndex={-1}>
      <div className="tc-pym-dk-bas">
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" title="Kapat (Esc)" aria-label="Kapat (Esc)" onClick={o.kapat}><Simge ad="x" boyut="k" /></button>
      </div>
      <div className="tc-pym-dk-ic">
        <section className="tc-pym-tk-secim" aria-label="Seçim kartı">
          {sekmeler.length > 0 && (
            <div className="tc-pym-tk-sek" role="tablist">
              {sekmeler.map(([x, ad]) => <button key={x} type="button" role="tab" aria-selected={k === x} onClick={() => o.sekSec(x)}>{ad}</button>)}
            </div>
          )}
          <div className="tc-pym-km" data-k={`secim-${secim.tur}-${k}`}>{govde}</div>
          {secim.tur === 'siparis' && (
            <div className="tc-pym-ks tc-pym-km-hz">
              <div className="tc-pym-km-hz-durum"><Simge ad="check" boyut="k" /><span>Hazırlık</span></div>
              <p>{HAZIRLIK_YOK}</p>
              <button type="button" className="tc-pym-link" onClick={o.hazirlikAc}>Hazırlık listesinde aç</button>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}

// Bitişi ne belirliyor (kmSiparis): süre ayrışımının çubuğu, en büyük dört kalem; tezgâhta sıra beklemesi.
const KAT_SIRA = Object.keys(KATEGORI_AD) as SureKategorisi[];
function SiparisKarti({ c, p, cx, s, t, j, planYaz: yaz, opSec, gunPlani }: Ozellikler & { j: string }) {
  const D = c.D; const sp = D.siparisler.find((x) => x.id === j); const J = p.J[j]; const due = cx.jobs[j]?.due ?? null;
  const urun = D.urunler.find((u) => u.id === sp?.urun)?.ad ?? sp?.urun ?? '';
  const a = ayristir(p, cx, j); const m = bekleme(p, cx, j); const l = yolculuk(c, s, j, t);
  const gec = (J?.T ?? 0) > 0.05; const pasif = yaz ? MOTOR_NOTU : 'Plan yazma yetkiniz yok.';
  const sira = a && a !== 'eksik' ? KAT_SIRA.filter((x) => (a.seg[x] ?? 0) > 0.01) : [];
  const top = a && a !== 'eksik' ? a.toplam || 1 : 1;
  const mm = Object.entries(m).sort((x, y) => y[1] - x[1]);
  return (
    <>
      <Baslik tur="Sipariş" ad={j} alt={`${urun} · ${ONCELIK_AD[Number(sp?.oncelik)] ?? ''} öncelik`} nokta={siparisRengi(D, j)} />
      <p className="tc-pym-km-durum" data-ton={gec ? 'hata' : 'tamam'}>
        {J?.C != null ? <>Bitiş <b className="tc-pym-mono">{saatYaz(D, J.C)}</b>{due != null && <> · termin <span className="tc-pym-mono">{saatYaz(D, due)}</span></>} · {gec ? <b>{gecMetin(J.T ?? null)} geç</b> : 'termine yetişiyor'}</> : 'Bitiş belirsiz'}
      </p>
      <Bolum baslik="Gecikmenin bedeli" simge="lira"><p className="tc-pym-kucuk-yazi">{HAZIRLANIYOR}</p></Bolum>
      <Bolum baslik="Bitişi ne belirliyor" simge="search">
        {a && a !== 'eksik' && (
          <div className="tc-pym-km-neden">
            <div className="tc-pym-ay-yol" role="img" aria-label={sira.map((x) => `${KATEGORI_AD[x]} ${saatYazi(a.seg[x])}`).join(', ')}>
              {sira.map((x) => <i key={x} data-k={x} ref={degisken({ '--w': `${((a.seg[x] ?? 0) / top) * 100}%` })} title={`${KATEGORI_AD[x]}: ${saatYazi(a.seg[x])}`} />)}
            </div>
            <ul className="tc-pym-ay-lejant">
              {[...sira].sort((x, y) => (a.seg[y] ?? 0) - (a.seg[x] ?? 0)).slice(0, 4).map((x) => (
                <li key={x}><i data-k={x} /><span>{KATEGORI_AD[x]}</span><b className="tc-pym-mono">{saatYazi(a.seg[x])}</b></li>
              ))}
            </ul>
          </div>
        )}
        <p className="tc-pym-kucuk-yazi">
          {mm.length
            ? <>Resimde kırmızı rozetli tezgâhlarda sıra bekliyor: {mm.map(([k, v], i) => <span key={k}>{i > 0 && ', '}<b className="tc-pym-mono">{k}</b> {saatYazi(v)}</span>)}.</>
            : 'Tezgâh beklemesi yok; bitişi işleme, ayar ve fason süreleri belirliyor.'}
        </p>
      </Bolum>
      <Bolum baslik="Yön ver" simge="target">
        <div className="tc-pym-km-hamleler">
          <Dg ad="Öne al" simge="flag" birincil={gec} not={pasif} />
          {l[0] && <Dg ad="Gün planı" simge="gantt" hayalet yap={() => { const r = l[0]?.r; if (r) gunPlani(r.S, { adim: r.id }); }} />}
        </div>
        <p className="tc-pym-km-alt">Öncelik</p>
        <div className="tc-pym-seg" role="group" aria-label="Öncelik">
          {[1, 2, 3].map((v) => <button key={v} type="button" aria-pressed={Number(sp?.oncelik) === v} aria-disabled="true" title={`${ONCELIK_AD[v]}: ${pasif}`}>{ONCELIK_AD[v]}</button>)}
        </div>
        <div className="tc-pym-km-hedef">
          <label className="tc-alan">
            <span className="tc-alan-etiket">Şu saate yetiştir</span>
            <input className="tc-alan-kutu" type="datetime-local" readOnly aria-disabled="true" title={pasif} value={due == null ? '' : isoYerel(D, due)} />
          </label>
          <Dg ad="Seçenek ara" simge="search" not={pasif} />
        </div>
      </Bolum>
      <Bolum baslik="Yolculuk" simge="gantt">
        <ol className="tc-pym-at-yol">
          {l.map((x, i) => (
            <li key={x.r.id} data-simdi={x.simdi ? '' : undefined} data-bitti={!x.simdi && x.bitti ? '' : undefined}>
              <b className="tc-pym-mono">{i + 1}</b>
              <button type="button" className="tc-pym-link tc-pym-mono" onClick={() => opSec(x.r.id)}>{tezgahYazi(x.r.m)}</button>
              <small className="tc-pym-mono">{x.zaman}</small>
            </li>
          ))}
        </ol>
      </Bolum>
    </>
  );
}
function TezgahKarti({ c, p, cx, s, r, olcek, t, m, planYaz: yaz, opSec, sipSec, zamanSec, gunPlani }: Ozellikler & { m: string }) {
  const D = c.D; const st = tezgahDurumu(s, durusOku(c), m, t); const d = s.dol[m] ?? [];
  const e = gecikmeEtkisi(D, p, cx).m[m]; const L = dilimBoyu(r);
  const mesai = yaz && !m.startsWith('@') ? mesaiAdaylari(c, cx, m).slice(0, 4) : [];
  return (
    <>
      <Baslik tur="Tezgâh" ad={m} alt={s.ist[m]?.ad ?? ''} />
      <p className="tc-pym-km-durum" data-dur={st.dur}>
        {st.dur === 'ariza' ? 'Arıza ya da bakımda.' : st.cal ? <>Şu an <b className="tc-pym-mono">{st.cal.id}</b>, {saatYaz(D, st.cal.C).slice(6)}'e kadar.</> : 'Boşta.'}
      </p>
      {e && (
        <p className="tc-pym-km-yorum" data-ton="hata">
          <Simge ad="chart" boyut="k" />
          <span>{e.j.size} geç siparişi toplam <b>{saatYazi(e.v)}</b> bekletiyor: {[...e.j].slice(0, 4).map((j, i) => <span key={j}>{i > 0 && ', '}<button type="button" className="tc-pym-link tc-pym-mono" onClick={() => sipSec(j)}>{j}</button></span>)}.</span>
        </p>
      )}
      <div className="tc-pym-at-gunler">
        {d.map((v, i) => (
          <button key={i} type="button" title={`${dilimAdi(D, olcek, r, i, true)}: ${v == null ? 'kapalı' : `%${Math.round(v * 100)}`}`} onClick={() => zamanSec(Math.max(s.now, r.a + i * L + Math.min(8, L / 2)))}>
            <i ref={degisken({ '--h': `${v == null ? 0 : Math.min(100, Math.round(v * 100))}%` })} data-ton={v != null && v > 0.97 ? 'hata' : undefined} />
            <small>{dilimAdi(D, olcek, r, i)}</small>
          </button>
        ))}
      </div>
      <Bolum baslik="Yön ver" simge="target">
        <div className="tc-pym-km-hamleler">
          <Dg ad="Odakla" simge="zin" birincil not={YOK_NOTU} />
          <Dg ad="Bugün boşalt" simge="upload" not={yaz ? MOTOR_NOTU : 'Plan yazma yetkiniz yok.'} />
          <Dg ad="Hepsini boşalt" simge="upload" not={yaz ? MOTOR_NOTU : 'Plan yazma yetkiniz yok.'} />
          <Dg ad="Sırayı düzenle" simge="sort" />
          <Dg ad="Gün planı" simge="gantt" hayalet yap={() => gunPlani(t, { tezgah: m })} />
        </div>
        {mesai.length > 0 && (
          <>
            <p className="tc-pym-km-alt"><Simge ad="clock" boyut="k" />Ek mesai ekle, motor yeniden dizsin:</p>
            <div className="tc-pym-km-hamleler">{mesai.map((x) => <Dg key={`${x.gun}|${x.vardiya}`} ad={x.ad} />)}</div>
          </>
        )}
      </Bolum>
      <Bolum baslik={`Sıra (${st.bekleyen})`} simge="list">
        <ol className="tc-pym-at-yol">
          {st.sira.length ? st.sira.map((x, i) => (
            <li key={x.id}>
              <b className="tc-pym-mono">{i + 1}</b>
              <button type="button" className="tc-pym-link tc-pym-mono" onClick={() => opSec(x.id)}>{x.id}</button>
              <small className="tc-pym-mono">{saatYaz(D, x.S).slice(6)}</small>
            </li>
          )) : <li className="tc-pym-kucuk-yazi">Sırada iş yok.</li>}
        </ol>
      </Bolum>
    </>
  );
}

function IsKarti({ c, p, cx, id, komut, planYaz: yaz, planKilitle, sipSec }: Ozellikler & { id: string }) {
  const D = c.D; const r = p.ops[id]; if (!r) return null;
  const o = cx.byId[id]; const kl = !!c.locks[id];
  const al = (o?.c ?? []).filter((m) => m !== r.m);
  const pasif = yaz ? MOTOR_NOTU : 'Plan yazma yetkiniz yok.';
  const sabit = planKilitle && komut ? () => {
    komut.degistir(kl ? 'Sabitlik kaldırıldı' : 'İş sabitlendi', (x) => { if (kl) delete x.locks[id]; else x.locks[id] = { m: r.m, S: r.S }; }, { ayrinti: id, planKoru: true });
  } : null;
  return (
    <>
      <Baslik tur="İş adımı" ad={id} alt={`${o?.ad ?? ''} · ${r.m.startsWith('@') ? r.m.slice(1) : r.m}${kl ? ' · sabit' : ''}`} />
      <p className="tc-pym-km-durum">
        <span className="tc-pym-mono">{saatYaz(D, r.S)} → {saatYaz(D, r.C)}</span> · <button type="button" className="tc-pym-link tc-pym-mono" onClick={() => sipSec(r.job)}>{r.job} siparişine git</button>
      </p>
      <Bolum baslik="Başka tezgâha taşı" simge="next">
        {al.length ? (
          <ul className="tc-pym-km-secenek">
            {al.map((m) => (
              <li key={m}>
                <span><b className="tc-pym-mono">{tezgahYazi(m)}</b><small className="tc-pym-mono">{MOTOR_NOTU}</small></span>
                <Dg ad="Taşı" not={pasif} />
              </li>
            ))}
          </ul>
        ) : <p className="tc-pym-kucuk-yazi">Bu adımı başka tezgâh yapamıyor.</p>}
      </Bolum>
      <Bolum baslik="Zamanı" simge="clock">
        <div className="tc-pym-km-hamleler">
          {([[-24, '−1 gün'], [-2, '−2 sa'], [2, '+2 sa'], [24, '+1 gün']] as const).map(([v, ad]) => <Dg key={v} ad={ad} not={pasif} />)}
          <Dg ad={kl ? 'Sabitliği kaldır' : 'Burada sabitle'} simge="lock" yap={sabit} not="Sabitleme yetkiniz yok." />
        </div>
        <p className="tc-pym-kucuk-yazi">Sabit iş motorun yeniden dizmesinde yerinden oynamaz.</p>
      </Bolum>
    </>
  );
}
