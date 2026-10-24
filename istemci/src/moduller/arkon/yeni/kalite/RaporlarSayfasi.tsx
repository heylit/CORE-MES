import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { nedenAdi } from '../../../../../../arkon/web/src/data/durus-nedeni.ts';
import { yuzdeMetni } from '../../../../../../arkon/web/src/data/yuzde.ts';
import type { LogCall, LogCount, LogEvent, Maint, Pkg } from '../../../../../../arkon/shared/model.ts';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { durusNedeni } from '../cekirdek/ayarlar.ts';
import { dakika, dakikaMetni, gunAy, gunAySaat, sayi } from '../cekirdek/bicim.ts';
import { istasyonListesi } from '../cekirdek/tesis.ts';
import { useArkon } from '../veri/baglam.ts';
import {
  GUNLER, IsMerkeziSuzgeci, SayfaCercevesi, Secmeli, VardiyaTanimsiz, csvIndir, useSoyle, useYerelSecim, type CsvHucresi, type Renk,
} from '../pano/index.tsx';
import { ARALIKLAR, aralik, paretoYuzde80, raporHesapla, type AralikAnahtari, type Rapor, type RaporVerisi } from './kurallar.ts';

// Raporlar (bakim-raporlar.ts ReportsApp, ReportBody, HBars): OEE eğilimi, duruş ve hurda Pareto'su, istasyonlar, çağrılar ve bakım.
// Sayfa yalnız okur; süzgeç ve aralık cihazda saklanır.
const GUN = 864e5;

export function RaporlarSayfasi() {
  const { depo, ayarlar } = useArkon();
  const soyle = useSoyle();
  const [rk, rkYaz] = useYerelSecim<AralikAnahtari>('repRange', 'd7');
  const [wc, wcYaz] = useState('');
  const [st, stYaz] = useState('');
  const [shf, shfYaz] = useState('');
  const [D, DYaz] = useState<RaporVerisi | null>(null);
  const [mesgul, mesgulYaz] = useState(false);
  const yukle = useCallback(async () => {
    mesgulYaz(true);
    const simdi = Date.now();
    const [from, to] = aralik(rk, simdi);
    try {
      const [ev, cn, calls, pk, mt] = await Promise.all([
        depo.Log.query('events', { from: from - 3 * GUN, to, limit: 20000 }), depo.Log.query('counts', { from, to, limit: 20000 }),
        depo.Log.query('calls', { from, to, limit: 20000 }), depo.DB.all('pkgs'), depo.DB.all('maint'),
      ]);
      DYaz({ ev: ev as unknown as LogEvent[], cn: cn as unknown as LogCount[], calls: calls as unknown as LogCall[], pk: pk as Pkg[], mt: mt as Maint[], from, to, now: simdi });
    } catch (e) {
      soyle(`Kayıtlar okunamadı: ${e instanceof Error ? e.message : String(e)}`, 'hata');
    }
    mesgulYaz(false);
  }, [depo, rk, soyle]);
  useEffect(() => { void yukle(); }, [yukle]);
  const R = useMemo(() => (D ? raporHesapla(D, { wc, st, shf }, ayarlar) : null), [D, wc, st, shf, ayarlar]);
  const istasyonlar = istasyonListesi(ayarlar.tesis, true).filter((s) => !wc || s.wc === wc);
  return (
    <SayfaCercevesi simge="chart" baslik="Raporlar" ek={(
      <Secmeli etiket="Rapor aralığı" deger={rk} degistir={rkYaz} secenekler={ARALIKLAR.map(([k, l]) => ({ k, etiket: l }))} />
    )}>
      <div className="tc-ay3-arac">
        <IsMerkeziSuzgeci deger={wc} degistir={(v) => { wcYaz(v); stYaz(''); }} />
        <select className="tc-ay3-secim" aria-label="İstasyon" value={st} onChange={(o) => stYaz(o.target.value)}>
          <option value="">Bütün istasyonlar</option>
          {istasyonlar.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}
        </select>
        <select className="tc-ay3-secim" aria-label="Vardiya" value={shf} onChange={(o) => shfYaz(o.target.value)}>
          <option value="">Bütün vardiyalar</option>
          {ayarlar.vardiyalar.map((s) => <option key={s.name} value={s.name}>Vardiya {s.name}</option>)}
        </select>
        <span className="tc-ay3-bosluk" />
        {D && <small className="tc-ay3-not">{gunAySaat(D.from)} – {gunAySaat(Math.min(D.to, D.now))}</small>}
        <Dugme simge="rotate" onClick={() => { void yukle(); }} disabled={mesgul}>Yenile</Dugme>
        <Dugme simge="download" onClick={() => window.print()}>Yazdır / PDF</Dugme>
      </div>
      {!ayarlar.vardiyalar.length && <VardiyaTanimsiz />}
      {!R ? <p className="tc-ay3-not">Hesaplanıyor…</p> : <RaporGovdesi R={R} />}
    </SayfaCercevesi>
  );
}

interface CubukSatiri { l: string }
// Yatay çubuklar (HBars): en büyük değer tam boydur; renk satır başına seçilir.
function Cubuklar<T extends CubukSatiri>({ satirlar, deger, metin, renk, etiket, alt }: {
  satirlar: readonly T[]; deger: (r: T) => number; metin: (r: T) => string; renk: (r: T) => Renk; etiket: string; alt?: ReactNode;
}) {
  const enCok = Math.max(1, ...satirlar.map(deger));
  return (
    <div className="tc-ay4-cubuklar" role="list" aria-label={etiket}>
      {satirlar.map((r, i) => (
        <div key={i} className="tc-ay4-cubuk" role="listitem" title={`${r.l} · ${metin(r)}`}>
          <span className="tc-ay4-cubuk-ad">{r.l}</span>
          <progress max={enCok} value={deger(r)} data-renk={renk(r)} aria-label={r.l} />
          <span className="tc-ay4-sayi">{metin(r)}</span>
        </div>
      ))}
      {!satirlar.length && <small className="tc-ay3-not">Kayıt yok</small>}
      {alt}
    </div>
  );
}

// Günlük OEE dikey çubukları (vbars): sütun başına değer, çubuk ve gün; %85 çizgisi dünya sınıfı OEE hedefidir. Çubuk SVG'dir,
// yazılar sayfa yazısıyla kalır (genişlikle büyümez).
function GunlukOee({ gunler }: { gunler: Rapor['days'] }) {
  return (
    <div className="tc-ay4-gunluk" role="list" aria-label="Günlük OEE">
      {gunler.map((d) => {
        const v = Math.max(0, Math.min(1, d.oee ?? 0));
        return (
          <div key={d.d} className="tc-ay4-gunluk-sutun" role="listitem"
            title={`${gunAy(d.d)} · OEE ${yuzdeMetni(d.oee)} · K ${yuzdeMetni(d.A)} · P ${yuzdeMetni(d.P)} · Q ${yuzdeMetni(d.Q)} · ${sayi(d.good)} iyi`}>
            <b className="tc-ay4-gunluk-deger">{d.oee != null ? Math.round(d.oee * 100) : '—'}</b>
            <svg className="tc-ay4-gunluk-cizim" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <rect className="tc-ay4-gunluk-zemin" x={0} y={0} width={10} height={100} />
              <rect className="tc-ay4-gunluk-cubuk" x={0} y={100 - v * 100} width={10} height={v * 100} />
              <line className="tc-ay4-gunluk-hedef" x1={0} x2={10} y1={15} y2={15} vectorEffect="non-scaling-stroke" />
            </svg>
            <small className="tc-ay4-gunluk-gun">{gunler.length > 10 ? new Date(d.d).getDate() : `${GUNLER[new Date(d.d).getDay()]} ${new Date(d.d).getDate()}`}</small>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ etiket, deger, alt, renk }: { etiket: string; deger: ReactNode; alt: string; renk?: Renk }) {
  return (
    <div className="tc-ay3-ozet-kutu" data-renk={renk}>
      <span className="tc-ay3-ust">{etiket}</span>
      <b>{deger}</b>
      <small>{alt}</small>
    </div>
  );
}

function Bolum({ baslik, csv, genis, children }: { baslik: string; csv?: () => void; genis?: boolean; children: ReactNode }) {
  return (
    <section className="tc-ay3-kutu tc-ay4-bolum" data-genis={genis ? '' : undefined} aria-label={baslik}>
      <div className="tc-ay3-arac">
        <span className="tc-ay3-ust">{baslik}</span>
        <span className="tc-ay3-bosluk" />
        {csv && <Dugme simge="download" onClick={csv}>CSV</Dugme>}
      </div>
      {children}
    </section>
  );
}

const yuzdeHucresi = (v: number | null | undefined): CsvHucresi => (v != null ? v * 100 : '');

function RaporGovdesi({ R }: { R: Rapor }) {
  const { ayarlar } = useArkon();
  const t = R.tot;
  const per = R.per.slice().sort((a, b) => (b.c.planned > 1 ? 1 : 0) - (a.c.planned > 1 ? 1 : 0) || (a.c.oee ?? 2) - (b.c.oee ?? 2));
  const ad = `rapor-${gunAy(R.from).replace('.', '')}-${gunAy(R.to).replace('.', '')}`;
  const nedenL = (k: string) => durusNedeni(ayarlar, k)?.l ?? null;
  const toplamDurus = R.pareto.reduce((a, x) => a + x.ms, 0);
  return (
    <div className="tc-ay3-sayfa">
      <div className="tc-ay3-ozet">
        <Kpi etiket="OEE" deger={yuzdeMetni(t.oee)} alt={`Kullanılabilirlik ${yuzdeMetni(t.A)}`} />
        <Kpi etiket="Performans" deger={yuzdeMetni(t.P)} alt={`Kalite ${yuzdeMetni(t.Q)}`} />
        <Kpi etiket="İyi parça" deger={sayi(t.good)} alt={`${sayi(t.scrap)} hurda · %${t.good + t.scrap ? ((t.scrap / (t.good + t.scrap)) * 100).toFixed(1) : '0'}`} />
        <Kpi etiket="Plansız duruş" deger={dakikaMetni(t.stopMs)} alt={`${t.stops} olay`} renk="stop" />
        <Kpi etiket="Planlı duruş" deger={dakikaMetni(Math.max(t.stopPMs, t.downMs))} alt="OEE dışı" renk="done" />
        <Kpi etiket="Arıza" deger={R.faults.n} alt={R.faults.mttr != null ? `MTTR ${dakika(R.faults.mttr)} dk` : 'MTTR —'} />
      </div>
      <div className="tc-ay4-rapor">
        <Bolum baslik="OEE · günlük" genis csv={() => csvIndir(`${ad}-oee`, [
          ['Gün', 'OEE %', 'Kullanılabilirlik %', 'Performans %', 'Kalite %', 'İyi', 'Hurda', 'Plansız duruş dk', 'Planlı duruş dk'],
          ...R.days.map((d) => [gunAy(d.d), yuzdeHucresi(d.oee), yuzdeHucresi(d.A), yuzdeHucresi(d.P), yuzdeHucresi(d.Q), d.good, d.scrap, dakika(d.stopMs), dakika(Math.max(d.stopPMs, d.downMs))]),
        ])}>
          <GunlukOee gunler={R.days} />
          <small className="tc-ay3-not">Çubuk: günlük OEE (%) · çizgi: %85 hedef · üzerine gelince kullanılabilirlik / performans / kalite</small>
        </Bolum>
        <Bolum baslik="Duruş nedenleri · Pareto" csv={() => csvIndir(`${ad}-durus`, [
          ['Neden', 'Tür', 'Dakika', 'Olay', 'Pay %'],
          ...R.pareto.map((x) => [x.l, x.p ? 'Planlı' : 'Plansız', dakika(x.ms), x.n, toplamDurus ? (x.ms / toplamDurus) * 100 : 0]),
        ])}>
          <Cubuklar etiket="Duruş nedenleri" satirlar={R.pareto.slice(0, 10)} deger={(x) => x.ms} metin={(x) => `${dakikaMetni(x.ms)} · ${x.n}×`} renk={(x) => (x.p ? 'done' : 'hold')}
            alt={<div className="tc-ay4-lejant"><span data-renk="hold"><i />Plansız</span><span data-renk="done"><i />Planlı</span></div>} />
          {R.pareto.length > 0 && <small className="tc-ay3-not">İlk {paretoYuzde80(R.pareto)} neden toplam duruşun %80&apos;i</small>}
        </Bolum>
        <Bolum baslik="Hurda nedenleri" csv={() => csvIndir(`${ad}-hurda`, [
          ['Neden', 'Adet'], ...R.scrap.map((x) => [x.l, x.n]), [], ['Parça', 'Adet'], ...R.scrapP.map((x) => [x.l, x.n]),
        ])}>
          <Cubuklar etiket="Hurda nedenleri" satirlar={R.scrap} deger={(x) => x.n} metin={(x) => `${sayi(x.n)} ad.`} renk={() => 'stop'} />
          {R.scrapP.length > 0 && (
            <>
              <span className="tc-ay3-ust">Parçaya göre</span>
              <Cubuklar etiket="Parçaya göre hurda" satirlar={R.scrapP.slice(0, 6)} deger={(x) => x.n} metin={(x) => `${sayi(x.n)} ad.`} renk={() => 'stop'} />
            </>
          )}
        </Bolum>
        <Bolum baslik="İstasyonlar" genis csv={() => csvIndir(`${ad}-istasyon`, [
          ['İstasyon', 'İş merkezi', 'OEE %', 'Kullanılabilirlik %', 'Performans %', 'Kalite %', 'Planlı süre dk', 'Çalışma dk', 'İyi', 'Hurda', 'Plansız duruş dk', 'Planlı duruş dk', 'En uzun neden'],
          ...per.map(({ s, c }) => [s.id, s.wcName, yuzdeHucresi(c.oee), yuzdeHucresi(c.A), yuzdeHucresi(c.P), yuzdeHucresi(c.Q), dakika(c.planned), dakika(c.run), c.good, c.scrap,
            dakika(c.stopMs), dakika(Math.max(c.stopPMs, c.downMs)), c.topReason ? nedenL(c.topReason) ?? c.topReason : '']),
        ])}>
          <div className="tc-ay4-tablo-kutu">
            <table className="tc-ay4-tablo" aria-label="İstasyonlar">
              <thead><tr><th>İstasyon</th><th className="tc-ay4-sayi">OEE</th><th className="tc-ay4-sayi">K</th><th className="tc-ay4-sayi">P</th><th className="tc-ay4-sayi">Q</th><th className="tc-ay4-sayi">İyi</th><th className="tc-ay4-sayi">Hurda</th><th className="tc-ay4-sayi">Plansız duruş</th><th className="tc-ay4-sayi">Planlı</th><th>En uzun neden</th></tr></thead>
              <tbody>
                {per.map(({ s, c }) => (
                  <tr key={s.id}>
                    <td><b>{s.id}</b> <small className="tc-ay3-not">{s.wcName}</small></td>
                    <td className="tc-ay4-sayi"><b>{yuzdeMetni(c.oee)}</b></td><td className="tc-ay4-sayi">{yuzdeMetni(c.A)}</td><td className="tc-ay4-sayi">{yuzdeMetni(c.P)}</td><td className="tc-ay4-sayi">{yuzdeMetni(c.Q)}</td>
                    <td className="tc-ay4-sayi">{sayi(c.good)}</td><td className="tc-ay4-sayi">{c.scrap}</td><td className="tc-ay4-sayi">{dakikaMetni(c.stopMs)}</td><td className="tc-ay4-sayi">{dakikaMetni(Math.max(c.stopPMs, c.downMs))}</td>
                    <td>{c.topReason ? nedenAdi(c.topReason, nedenL) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bolum>
        <Bolum baslik="Çağrılar · yanıt süreleri" csv={() => csvIndir(`${ad}-cagri`, [
          ['Ekip', 'Çağrı', 'Ort. üstlenme dk', 'Ort. çözüm dk', 'Yükseltilen'],
          ...R.calls.map((c) => [c.l, c.n, c.ack != null ? c.ack / 60000 : '', c.fix != null ? c.fix / 60000 : '', c.esc]),
        ])}>
          <div className="tc-ay4-tablo-kutu">
            <table className="tc-ay4-tablo" aria-label="Çağrılar">
              <thead><tr><th>Ekip</th><th className="tc-ay4-sayi">Çağrı</th><th className="tc-ay4-sayi">Üstlenme</th><th className="tc-ay4-sayi">Çözüm</th><th className="tc-ay4-sayi">Yükseltilen</th></tr></thead>
              <tbody>
                {R.calls.map((c) => (
                  <tr key={c.k}>
                    <td>{c.l}</td><td className="tc-ay4-sayi">{c.n}</td>
                    <td className="tc-ay4-sayi">{c.ack != null ? `${(c.ack / 60000).toFixed(1)} dk` : '—'}</td>
                    <td className="tc-ay4-sayi">{c.fix != null ? `${Math.round(c.fix / 60000)} dk` : '—'}</td>
                    <td className="tc-ay4-sayi" data-renk={c.esc ? 'stop' : undefined}>{c.esc}</td>
                  </tr>
                ))}
                {!R.calls.length && <tr><td colSpan={5} className="tc-ay3-not">Çağrı yok</td></tr>}
              </tbody>
            </table>
          </div>
        </Bolum>
        <Bolum baslik="Bakım">
          <dl className="tc-ay4-istatistik">
            <div><dt>arıza</dt><dd>{R.faults.n}</dd></div>
            <div><dt>açık</dt><dd>{R.faults.open}</dd></div>
            <div><dt>MTTR</dt><dd>{R.faults.mttr != null ? `${dakika(R.faults.mttr)} dk` : '—'}</dd></div>
            <div><dt>MTBF</dt><dd>{R.faults.mtbf != null ? `${(R.faults.mtbf / 3600e3).toFixed(1)} sa` : '—'}</dd></div>
          </dl>
          <small className="tc-ay3-not">Makine bazında ayrıntı: Bakım › Makine güvenilirliği</small>
        </Bolum>
      </div>
    </div>
  );
}
