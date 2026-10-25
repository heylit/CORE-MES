import { useEffect, useState, type ReactNode } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { KATEGORI_AD, saatYaz, saKisa, type SureKategorisi } from '../kurallar.ts';
import { degisken, HAZIRLANIYOR, MetinYaz, yuzde } from '../ortak.tsx';
import {
  anOzeti, beklemeler, grupAdi, gunOrtalamasi, konum, sureToplami, sutunAni, type BolgeKimligi, type Gosterge, type Metin, type OzetSecimi, type OzetVerisi,
  type Yorum,
} from './veri.ts';

// Özet'in altı bölümü (zf-resim.betik brPanoHtml, brKpi, brBekle, brYolculuk, brYuk, brSure, brYaris, brYorumHtml, brCanli). Her bölüm bir soruya
// cevap verir: soru başlıkta, veriden cevap altında, okuma kuralı "Nasıl okunur" ile açılır; renk anahtarı her zaman görünür.
export const SAHNE: [BolgeKimligi, string, SimgeAdi][] = [
  ['ozet', 'Plan nasıl gidiyor?', 'dash'], ['bekle', 'Siparişler nerede bekliyor?', 'clock'], ['yuk', 'Hangi gün hangi tezgâh dolu?', 'grid'],
  ['sure', 'Süre nereye gidiyor?', 'chart'], ['yaris', 'Siparişler zamanında bitiyor mu?', 'flag'], ['yorum', 'Ne yapmalıyım?', 'bolt'],
];
const NASIL: Record<BolgeKimligi, string[]> = {
  ozet: ['Her kart bir ölçü. Renkli kenar durumu söyler: yeşil iyi, kırmızı sorun, sarı dikkat.', 'Sağ üstteki sayaç tahtanın zamanını izler: oynatınca çalışan tezgâh ve biten sipariş sayısı değişir.'],
  bekle: ['Her satır bir istasyon grubu; yukarıdan aşağı rotadaki sırası.', 'Çubuk o gruptaki bütün siparişlerin toplam süresi: yeşil işleme, açık yeşil ayar, gri sıra bekleme, kırmızı geç siparişlerin beklemesi.', 'Gri ve kırmızısı uzun grup darboğazdır; sağdaki sayı toplam bekleme (kalın: geç siparişlerin payı).', 'Grup adına dokunun: orada en çok bekleyen siparişler. Siparişe dokunun: aşağıda yolculuğu açılır.'],
  yuk: ['Satır tezgâh, sütun gün.', 'Mavi koyulaştıkça tezgâh o gün daha dolu (vardiya saatine göre). Taralı hücre: tezgâh o gün kapalı.', 'Çerçeveli sütun tahtadaki gündür. Gün başlığına dokunun: tahta o güne gider.', 'Tezgâh adına dokunun: o tezgâhı kullanan siparişler bütün bölgelerde yanar.'],
  sure: ['Bütün siparişlerin atölyede geçirdiği süre yüzde yüz sayılır.', 'Her renk bir sebep: işleme, ayar, tezgâh dolu bekledi, fasonda, tezgâh kapalı...', 'İşleme payı ne kadar küçükse sipariş o kadar çok bekliyor demektir. Altta geç siparişlerin kendi dağılımı.'],
  yaris: ['Her satır bir sipariş; terminine göre sıralı, en acil üstte.', 'Çubuk siparişin ilk işlemden son işleme kadar atölyede kaldığı süre. Elmas termin: çubuk elmasın sağına taşıyorsa sipariş geç (kırmızı).', 'Dikey çizgi tahtanın zamanı; çubuğun dolu kısmı o ana kadar geçen süre.', 'Siparişe dokunun: atölyede yolu, yük haritasında tezgâhları, beklemede grupları yanar.'],
  yorum: ['Veriden kurulan gözlemler, önem sırasıyla.', 'Kırmızı kenar sorun, sarı dikkat, yeşil iyi. Bağlantı ilgili yere götürür.'],
};
const Sz = ({ r, children }: { r: string; children: ReactNode }) => <span className="tc-pym-br-sz"><i data-r={r} />{children}</span>;
const LEJANT: Record<BolgeKimligi, ReactNode> = {
  ozet: <><Sz r="iyi">iyi</Sz><Sz r="sorun">sorun</Sz><Sz r="dikkat">dikkat</Sz></>,
  bekle: <><Sz r="isl">işleme</Sz><Sz r="ayar">ayar</Sz><Sz r="bek">bekleme</Sz><Sz r="sorun">geç siparişin beklemesi</Sz></>,
  yuk: <><span className="tc-pym-br-sz"><span className="tc-pym-br-rampa">{[0.15, 0.45, 0.75, 1].map((y) => <i key={y} ref={degisken({ '--y': y })} />)}</span>boş → dolu</span><Sz r="kapali">kapalı</Sz></>,
  sure: null,
  yaris: <><Sz r="iyi">zamanında</Sz><Sz r="sorun">geç</Sz><Sz r="termin">termin</Sz><Sz r="imlec">şimdi</Sz></>,
  yorum: <><Sz r="sorun">sorun</Sz><Sz r="dikkat">dikkat</Sz><Sz r="iyi">iyi</Sz></>,
};

interface PanoOzellikleri { id: BolgeKimligi; cevap: Metin; nasil: boolean; nasilAc: () => void; yakindan: (el: HTMLElement | null) => void; ek?: ReactNode; children: ReactNode }
export function Pano({ id, cevap, nasil, nasilAc, yakindan, ek, children }: PanoOzellikleri) {
  const [, ad, simge] = SAHNE.find((x) => x[0] === id) ?? SAHNE[0]!;
  const [kok, setKok] = useState<HTMLElement | null>(null);
  return (
    <section ref={setKok} className="tc-pym-br-pano" data-b={id} aria-label={ad}>
      <header className="tc-pym-br-pano-bas">
        <button type="button" className="tc-pym-br-soru" title="Yakından bak" onClick={() => yakindan(kok)}><Simge ad={simge} boyut="k" /><b>{ad}</b></button>
        <button type="button" className="tc-pym-br-nasil-d" aria-expanded={nasil} title="Nasıl okunur" onClick={nasilAc}><Simge ad="help" boyut="k" /><span>Nasıl okunur</span></button>
        {ek}
      </header>
      <p className="tc-pym-br-cevap"><MetinYaz m={cevap} /></p>
      {nasil && <ol className="tc-pym-br-nasil">{NASIL[id].map((x) => <li key={x}>{x}</li>)}</ol>}
      {LEJANT[id] && <div className="tc-pym-br-lejant">{LEJANT[id]}</div>}
      {children}
    </section>
  );
}

// Sayı açılışta sıfırdan yükselir (brSay); hareket azaltıldıysa hemen yerinde.
function Sayac({ x }: { x: number }) {
  const [g, setG] = useState(x);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setG(x); return undefined; }
    const t0 = performance.now(); let raf = 0;
    const adim = (now: number) => { const f = Math.min(1, (now - t0) / 700); setG(Math.round(x * (1 - (1 - f) ** 3))); if (f < 1) raf = requestAnimationFrame(adim); };
    raf = requestAnimationFrame(adim);
    return () => cancelAnimationFrame(raf);
  }, [x]);
  return <>{g}</>;
}

export function Gostergeler({ l }: { l: Gosterge[] }) {
  return (
    <div className="tc-pym-br-kpiler">
      {l.map((k) => (
        <div key={k.ad} className="tc-pym-br-kpi" data-ton={k.ton || undefined}>
          <span><Simge ad={k.simge} boyut="k" />{k.ad}</span>
          <b className="tc-pym-mono">{k.deger == null ? '—' : typeof k.deger === 'number' ? <Sayac x={k.deger} /> : k.deger}</b>
          <small><b>{k.ek}</b> {k.alt}</small>
        </div>
      ))}
    </div>
  );
}

export function Canli({ c, v, t }: { c: PlanlamaCalismasi; v: OzetVerisi; t: number }) {
  const a = anOzeti(v, t);
  return (
    <div className="tc-pym-br-canli" aria-live="polite">
      <b className="tc-pym-mono">{saatYaz(c.D, t)}</b>
      <span><b>{a.tezgah}</b> tezgâh çalışıyor</span><span><b>{a.siparis}</b> sipariş üretimde</span><span><b>{a.biten}</b>/{a.toplam} sipariş bitti</span>
      {a.yok > 0 && <span data-ton="hata"><b>{a.yok}</b> yerleşmedi</span>}
    </div>
  );
}

const pay = (x: number, mx: number) => yuzde(x / mx);
export function Bekleme({ c, v, sec, acikGrup, grupAc, sipSec, kartAc }: {
  c: PlanlamaCalismasi; v: OzetVerisi; sec: OzetSecimi | null; acikGrup: string | null; grupAc: (g: string) => void; sipSec: (j: string) => void;
  kartAc: (() => void) | null;
}) {
  const l = beklemeler(v); const mx = Math.max(1, ...l.map((x) => x.isl + x.ayar + x.bek));
  return (
    <>
      <div className="tc-pym-br-bk">
        <div className="tc-pym-br-bk-eksen"><span /><small>işleme · ayar · bekleme</small><small>bekleme</small></div>
        {l.map((x) => {
          const acik = acikGrup === x.id;
          const enCok = Object.entries(x.sip).filter(([, b]) => b > 0.5).sort((a, b) => b[1] - a[1]).slice(0, 5);
          return (
            <div key={x.id} className="tc-pym-br-bk-s" data-hedef="" data-ilgili={sec?.grup.has(x.id) ? '' : undefined} data-acik={acik ? '' : undefined}>
              <button type="button" className="tc-pym-br-bk-ad" aria-expanded={acik} title="Bu grupta en çok bekleyen siparişler" onClick={() => grupAc(x.id)}>{grupAdi(x.id)}</button>
              <div className="tc-pym-br-bk-cubuk" title={`İşleme ${saKisa(x.isl)} · ayar ${saKisa(x.ayar)} · bekleme ${saKisa(x.bek)}${x.bekG ? ` (geç siparişler ${saKisa(x.bekG)})` : ''}`}>
                <i data-k="isl" ref={degisken({ '--w': pay(x.isl, mx) })} /><i data-k="ayar" ref={degisken({ '--w': pay(x.ayar, mx) })} />
                <i data-k="bek" ref={degisken({ '--w': pay(x.bek - x.bekG, mx) })} /><i data-k="bekg" ref={degisken({ '--w': pay(x.bekG, mx) })} />
              </div>
              <small className="tc-pym-mono">{saKisa(x.bek)}{x.bekG > 0.5 && <> <b>{saKisa(x.bekG)}</b></>}</small>
              {acik && (
                <div className="tc-pym-br-bk-liste">
                  {enCok.length
                    ? enCok.map(([j, b]) => <button key={j} type="button" className="tc-pym-link tc-pym-mono" onClick={() => sipSec(j)}>{j} · {saKisa(b)}</button>)
                    : <span>Bu grupta bekleyen sipariş yok.</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Yolculuk c={c} v={v} sec={sec} kartAc={kartAc} />
    </>
  );
}

// Seçilen siparişin yolculuğu: adım adım işleme ve aradaki beklemeler, termin çizgisi. "Kartı aç" yan paneldeki seçim kartına götürür.
function Yolculuk({ c, v, sec, kartAc }: { c: PlanlamaCalismasi; v: OzetVerisi; sec: OzetSecimi | null; kartAc: (() => void) | null }) {
  const s = sec?.s;
  if (!s) return <p className="tc-pym-br-ipucu"><Simge ad="target" boyut="k" />Bir siparişe dokunun: atölyedeki yolculuğu burada adım adım açılır.</p>;
  const due = s.due ?? s.C; const t0 = Math.min(v.now, s.S), t1 = Math.max(s.C, due); const x = (t: number) => (t - t0) / Math.max(1, t1 - t0);
  const par: ReactNode[] = []; let son = Math.max(v.now, t0);
  s.adim.forEach((a, i) => {
    if (a.S > son + 0.05) par.push(<i key={`b${i}`} className="tc-pym-br-yc-bek" data-gec={s.gec ? '' : undefined} ref={degisken({ '--x': yuzde(x(son)), '--w': yuzde(x(a.S) - x(son)) })} title={`Bekleme ${saKisa(a.S - son)} (${a.m} öncesi)`} />);
    par.push(
      <i key={`i${i}`} className="tc-pym-br-yc-is" ref={degisken({ '--x': yuzde(x(a.S)), '--w': yuzde(Math.max(0.004, x(a.C) - x(a.S))) })}
        title={`${a.m}: ayar ${saKisa(a.su)}, işleme ${saKisa(a.run)} · ${saatYaz(c.D, a.S)} – ${saatYaz(c.D, a.C)}`}><em>{a.m.startsWith('@') ? a.m.slice(1) : a.m}</em></i>,
    );
    son = Math.max(son, a.C);
  });
  const bek = s.adim.reduce((t, a) => t + a.bek, 0), isl = s.adim.reduce((t, a) => t + a.run + a.su, 0);
  return (
    <div className="tc-pym-br-yc">
      <p>
        <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" aria-disabled={kartAc ? undefined : 'true'} title={kartAc ? undefined : 'Kartı aç: siparişin tezgâhı haritada yok.'} onClick={kartAc ?? undefined}><Simge ad="expand" boyut="k" />Kartı aç</button>
        <b className="tc-pym-mono">{s.id}</b> {s.urun} · {s.adim.length} adım · işleme {saKisa(isl)}, bekleme <b>{saKisa(bek)}</b> · {s.gec ? <b data-ton="hata">{saKisa(s.T)} geç</b> : 'zamanında'}
      </p>
      <div className="tc-pym-br-yc-yol">
        {par}
        {s.due != null && <b className="tc-pym-br-yc-termin" ref={degisken({ '--x': yuzde(x(s.due)) })} title={`Termin ${saatYaz(c.D, s.due)}`}><span>termin</span></b>}
      </div>
      <div className="tc-pym-br-yc-alt"><span>{saatYaz(c.D, t0)}</span><span>{saatYaz(c.D, t1)}</span></div>
    </div>
  );
}

export function Yuk({ c, v, sec, gun, gunSec, tezSec, tezGrup }: {
  c: PlanlamaCalismasi; v: OzetVerisi; sec: OzetSecimi | null; gun: number; gunSec: (d: number) => void; tezSec: (m: string) => void; tezGrup: (m: string) => string;
}) {
  const gt = gunOrtalamasi(v); let son = '';
  const yak = (d: number) => (d === gun ? '' : undefined);
  return (
    <div className="tc-pym-br-isi-kap">
      <table className="tc-pym-br-isi" aria-label="Tezgâh ve güne göre doluluk">
        <thead>
          <tr><th />{v.gunAd.map((g, d) => (
            <th key={d} data-g={d} data-gun-yak={yak(d)}><button type="button" title="Tahtayı bu güne götür" onClick={() => gunSec(d)}>{g}<small>{saatYaz(c.D, sutunAni(v, d)).slice(0, 2)}</small></button></th>
          ))}</tr>
        </thead>
        <tbody>
          {v.yuk.map((y) => {
            const ilk = y.grup !== son; son = y.grup; const ilgT = !!sec?.tez.has(y.m);
            return (
              <tr key={y.m} data-ilk={ilk ? '' : undefined} data-ilgili={ilgT ? '' : undefined}>
                <th className="tc-pym-mono"><button type="button" title={`${grupAdi(tezGrup(y.m))}: bu tezgâhı kullanan siparişleri göster`} onClick={() => tezSec(y.m)}>{y.m}</button></th>
                {y.g.map((x, d) => {
                  const ilg = sec && (sec.s ? sec.hucre.has(`${y.m}|${d}`) : ilgT) ? '' : undefined;
                  return x == null
                    ? <td key={d} data-g={d} data-kapali="" data-hedef="" data-ilgili={ilg} data-gun-yak={yak(d)} title={`${y.m} · ${v.gunAd[d] ?? ''}: kapalı`} />
                    : <td key={d} data-g={d} data-hedef="" data-ilgili={ilg} data-gun-yak={yak(d)} ref={degisken({ '--y': Math.min(1, x).toFixed(2) })} title={`${y.m} · ${v.gunAd[d] ?? ''}: %${Math.round(x * 100)} dolu`} />;
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr><th>Ort. %</th>{gt.map((x, d) => <td key={d} data-g={d} data-gun-yak={yak(d)} className="tc-pym-mono">{x == null ? '–' : Math.round(x * 100)}</td>)}</tr></tfoot>
      </table>
    </div>
  );
}

// Süre ayrışımının şeridi: renk sırası bütün siparişlerin toplamındaki sıradır.
function Serit({ sira, seg, toplam, buyuk }: { sira: [SureKategorisi, number][]; seg: Partial<Record<SureKategorisi, number>>; toplam: number; buyuk?: boolean }) {
  return (
    <div className={buyuk ? 'tc-pym-br-serit tc-pym-br-serit-b' : 'tc-pym-br-serit'}>
      {sira.map(([k]) => { const x = (seg[k] ?? 0) / Math.max(0.01, toplam); return x > 0.0005 ? <i key={k} data-k={k} ref={degisken({ '--w': yuzde(x) })} title={`${KATEGORI_AD[k]}: %${Math.round(x * 100)}`} /> : null; })}
    </div>
  );
}
export function Sure({ v, sipSec }: { v: OzetVerisi; sipSec: (j: string) => void }) {
  const { sira, hep } = sureToplami(v); const top = Object.fromEntries(sira) as Partial<Record<SureKategorisi, number>>;
  const gec = v.sip.filter((s) => s.gec && s.seg).sort((a, b) => b.T - a.T).slice(0, 6);
  return (
    <div className="tc-pym-br-yuzde">
      <Serit sira={sira} seg={top} toplam={hep} buyuk />
      <ul className="tc-pym-br-lejl">
        {sira.map(([k, x]) => <li key={k}><i data-k={k} /><span>{KATEGORI_AD[k]}</span><b className="tc-pym-mono">%{Math.round(x / hep * 100)}</b></li>)}
      </ul>
      {gec.length > 0 && (
        <>
          <h4>Geç siparişler</h4>
          <ul className="tc-pym-br-gecler">
            {gec.map((s) => {
              const seg = s.seg ?? {}; const t = Object.values(seg).reduce((a, b) => a + b, 0);
              return <li key={s.id}><button type="button" className="tc-pym-link tc-pym-mono" onClick={() => sipSec(s.id)}>{s.id}</button><Serit sira={sira} seg={seg} toplam={t} /><b className="tc-pym-mono">+{saKisa(s.T)}</b></li>;
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export function Yaris({ c, v, sec, sipSec }: { c: PlanlamaCalismasi; v: OzetVerisi; sec: OzetSecimi | null; sipSec: (j: string) => void }) {
  // Termini olmayan sipariş en sona.
  const sip = [...v.sip].sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
  return (
    <div className="tc-pym-br-yaris">
      <div className="tc-pym-br-yaris-eksen">
        <span />
        <div>{v.gunAd.map((g, d) => <span key={d} ref={degisken({ '--x': yuzde(d / v.gun) })} data-ara={d % 3 ? '' : undefined}>{saatYaz(c.D, sutunAni(v, d)).slice(0, 2)}<em> {g}</em></span>)}</div>
        <span />
      </div>
      {sip.map((s) => {
        const a = konum(v, s.S), b = Math.max(a + 0.002, konum(v, s.C)); const fark = s.due == null ? null : s.C - s.due;
        return (
          <div key={s.id} className="tc-pym-br-yaris-s" data-hedef="" data-gec={s.gec ? '' : undefined} data-ilgili={sec?.sip.has(s.id) ? '' : undefined} data-secili={sec?.j === s.id ? '' : undefined}>
            <button type="button" className="tc-pym-link tc-pym-mono" title={`${s.urun}: yolculuğunu ve tezgâhlarını göster`} onClick={() => sipSec(s.id)}>{s.id}</button>
            <div className="tc-pym-br-yol">
              <i className="tc-pym-br-cubuk" ref={degisken({ '--s': a.toFixed(4), '--e': b.toFixed(4) })}><u /></i>
              {s.due != null && <b className="tc-pym-br-termin" ref={degisken({ '--x': yuzde(konum(v, s.due)) })} title={`Termin ${saatYaz(c.D, s.due)}`} />}
            </div>
            <small className="tc-pym-mono" data-ton={s.gec ? 'hata' : 'tamam'}>{fark == null ? '—' : s.gec ? `+${saKisa(fark)}` : `${saKisa(-fark)} pay`}</small>
          </div>
        );
      })}
      <div className="tc-pym-br-imlec" aria-hidden="true" />
    </div>
  );
}

export function Yorumlar({ l, eylem }: { l: Yorum[]; eylem: (e: NonNullable<Yorum['eylem']>) => (() => void) | null }) {
  return (
    <ol className="tc-pym-br-yorum">
      {l.map((x, i) => {
        const yap = x.eylem ? eylem(x.eylem) : null;
        return (
          <li key={i} data-ton={x.ton}>
            <Simge ad={x.simge} boyut="k" />
            <span>
              <MetinYaz m={x.m} />
              {x.eylem && <> <button type="button" className="tc-pym-link" aria-disabled={yap ? undefined : 'true'} title={yap ? undefined : `${x.eylem.ad}: ${HAZIRLANIYOR}`} onClick={yap ?? undefined}>{x.eylem.ad}</button></>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
