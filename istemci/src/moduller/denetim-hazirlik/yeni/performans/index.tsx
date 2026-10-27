import { useState } from 'react';
import { Dugme, Kart, Rozet, Simge, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { useDenetim } from '../baglam.tsx';
import { CL_EY } from '../icerik/eydep.ts';
import { PROGRAMLAR, PROGRAM_SIRASI, eyGrade } from '../icerik/programlar.ts';
import { sonucMetni } from '../kurallar/denetim-takvimi.ts';
import { ozNotu } from '../kurallar/oz.ts';
import {
  BOS_SUZGEC, KAYNAKLAR, performansMatrisi, performansOlaylari, type Kaynak, type MatrisSatiri, type PerformansOlayi, type PerformansSuzgeci,
} from '../kurallar/performans.ts';
import { ayEkle, bugunTarihi, isoTarih, tarihMetni } from '../tarih.ts';
import type { ProgramKodu } from '../tipler.ts';
import { DenetimFormu, type FormAcilisi, type KayitSonucu } from '../takvim/DenetimFormu.tsx';
import '../ic-denetim/p3-ortak.css';
import '../takvim/takvim.css';
import './performans.css';

// Performans geçmişi: iç, dış, müşteri denetimleri, EYDEP ve öz değerlendirmeler ortak zaman ekseninde; madde matrisi "kör nokta" ve
// "tekrarlayan" sinyallerini gösterir (kurallar/performans.ts). Süzgeçler ekranda kalır, kayda yazılmaz.

type OzOlayi = Extract<PerformansOlayi, { t: 'oz' }>;
type DenetimOlayi = Extract<PerformansOlayi, { t: 'audit' }>;
const DONEMLER: [string, string][] = [['6', '6 ay'], ['12', '12 ay'], ['24', '24 ay'], ['all', 'Tümü']];
const notTonu = (p: number | null): RozetTonu => (p == null ? 'pasif' : p >= 85 ? 'tamam' : p >= 70 ? 'bilgi' : p >= 50 ? 'uyari' : 'hata');
const puanSinifi = (p: number): string => (p >= 85 ? 'tc-dhy-ton-iyi' : p >= 70 ? 'tc-dhy-ton-bilgi' : p >= 50 ? 'tc-dhy-ton-uyari' : 'tc-dhy-ton-kotu');
const SINYAL: Record<MatrisSatiri['sc'], RozetTonu> = { bad: 'hata', warn: 'uyari', good: 'tamam', obs: 'bilgi', '': 'pasif' };

function Grafik({ ev }: { ev: readonly PerformansOlayi[] }) {
  const Wd = 760, top = 14, topH = 168, gap = 34, botH = 64, H = top + topH + gap + botH + 26, pl = 34, pr = 14;
  const t = bugunTarihi();
  let d0 = ev[0]?.date ?? ayEkle(t, -6);
  let d1 = t;
  for (const e of ev) if (e.date > d1) d1 = e.date;
  if (d0 >= d1) d0 = ayEkle(d1, -3);
  let T0 = Date.parse(`${d0}T00:00:00`);
  let T1 = Date.parse(`${d1}T00:00:00`);
  const span = T1 - T0;
  T0 -= span * 0.04;
  T1 += span * 0.04;
  const X = (d: string) => pl + ((Wd - pl - pr) * (Date.parse(`${d}T00:00:00`) - T0)) / (T1 - T0);
  const Y = (v: number) => top + topH * (1 - v / 100);
  const aud = ev.filter((e): e is DenetimOlayi => e.t === 'audit' && e.k !== 'eydep');
  const mx = Math.max(3, ...aud.map((e) => e.a.res.major + e.a.res.minor + e.a.res.obs));
  const by = top + topH + gap;
  const bb = by + botH;
  const ilkAy = new Date(T0);
  const gunler = (T1 - T0) / 86_400_000;
  const adim = gunler > 540 ? 3 : gunler > 240 ? 2 : 1;
  const aylar: string[] = [];
  for (let dd = new Date(ilkAy.getFullYear(), ilkAy.getMonth() + 1, 1); dd.getTime() <= T1; dd = new Date(dd.getFullYear(), dd.getMonth() + adim, 1)) aylar.push(isoTarih(dd));
  const f = (n: number) => n.toFixed(1);
  return (
    <svg className="tc-dhd-grafik" viewBox={`0 0 ${String(Wd)} ${String(H)}`} role="img" aria-label="Denetim ve değerlendirmelerin ortak zaman grafiği">
      {([[85, 100, 'iyi', 'A'], [70, 85, 'bilgi', 'B'], [50, 70, 'uyari', 'C'], [0, 50, 'kotu', 'D']] as const).map(([a, b, ton, harf]) => (
        <g key={harf} className={`tc-dhd-bant tc-dhd-bant-${ton}`}>
          <rect x={pl} y={f(Y(b))} width={Wd - pl - pr} height={f(Y(a) - Y(b))} />
          <text x={pl - 8} y={f((Y(a) + Y(b)) / 2 + 3.5)} textAnchor="end">{harf}</text>
        </g>
      ))}
      <text x={pl} y={by - 8} className="tc-dhd-serit">Bulgular (ISO 9001 · AS9100)</text>
      <line x1={pl} y1={bb} x2={Wd - pr} y2={bb} className="tc-dhd-cizgi" />
      <text x={pl - 8} y={by + 4} textAnchor="end">{mx}</text>
      <text x={pl - 8} y={bb + 3} textAnchor="end">0</text>
      {aylar.map((m) => (
        <g key={m}>
          <line x1={f(X(m))} y1={top} x2={f(X(m))} y2={bb} className="tc-dhd-cizgi tc-dhd-kesik" />
          <text x={f(X(m))} y={H - 8} textAnchor="middle">
            {new Date(`${m}T00:00:00`).toLocaleDateString('tr-TR', { month: 'short' }) + (m.slice(5, 7) === '01' || m === aylar[0] ? ` ${m.slice(2, 4)}` : '')}
          </text>
        </g>
      ))}
      {t >= d0 && (
        <g className="tc-dhd-bugun">
          <line x1={f(X(t))} y1={top} x2={f(X(t))} y2={bb} />
          <text x={f(X(t) - 4)} y={top + 10} textAnchor="end">Bugün</text>
        </g>
      )}
      {PROGRAM_SIRASI.map((k) => {
        const pts = ev.filter((e): e is OzOlayi & { pct: number } => e.t === 'oz' && e.k === k && e.pct != null);
        return (
          <g key={k} className={`tc-dhd-p-${k} tc-dhd-seri`}>
            {pts.length > 1 && <polyline points={pts.map((e) => `${f(X(e.date))},${f(Y(e.pct))}`).join(' ')} />}
            {pts.map((e) => (
              <circle key={e.r.id} cx={f(X(e.date))} cy={f(Y(e.pct))} r="4.5">
                <title>{`${PROGRAMLAR[k].s} öz değerlendirme · ${tarihMetni(e.date)} · %${String(e.pct)} · ${ozNotu(e.pct)} · ${String(Object.keys(e.r.items).length)} soru`}</title>
              </circle>
            ))}
          </g>
        );
      })}
      {ev.filter((e): e is DenetimOlayi => e.t === 'audit' && e.k === 'eydep' && e.a.res.score !== '').map((e) => {
        const sc = e.a.res.score as number;
        const x = X(e.date);
        const y = Y(sc);
        return (
          <rect
            key={e.a.id} className={`tc-dhd-p-eydep tc-dhd-elmas${e.src === 'ic' ? ' tc-dhd-ici-bos' : ''}`}
            x={f(x - 6)} y={f(y - 6)} width="12" height="12" transform={`rotate(45 ${f(x)} ${f(y)})`}
          >
            <title>{`EYDEP · ${e.a.type} · ${tarihMetni(e.date)} · ${String(sc)} puan · ${eyGrade(sc) ? `${eyGrade(sc)} seviyesi` : 'eşik altı'}${e.src === 'ic' ? ' · iç/ön değerlendirme' : ''}`}</title>
          </rect>
        );
      })}
      {aud.map((e) => {
        const x = X(e.date);
        const r = e.a.res;
        const n = r.major + r.minor + r.obs;
        const ic = e.src === 'ic';
        const u = botH / mx;
        const ipucu = `${PROGRAMLAR[e.k].s} · ${KAYNAKLAR[e.src]} · ${e.a.type} · ${tarihMetni(e.date)} · ${sonucMetni(e.a)}`;
        let y = bb;
        return (
          <g key={e.a.id} className={`tc-dhd-p-${e.k} tc-dhd-denetim${ic ? ' tc-dhd-ici-bos' : ''}`}>
            <line x1={f(x)} y1={top} x2={f(x)} y2={by} className="tc-dhd-dikey" />
            <circle cx={f(x)} cy={top + topH + 6} r="3" className="tc-dhd-dip" />
            {!n ? (
              <circle cx={f(x)} cy={bb - 7} r="6" className="tc-dhd-bulgusuz"><title>{ipucu}</title></circle>
            ) : (['major', 'minor', 'obs'] as const).map((l) => {
              const c = r[l];
              if (!c) return null;
              const hh = c * u;
              y -= hh;
              return <rect key={l} className={`tc-dhd-sutun tc-dhd-sutun-${l}`} x={f(x - 7)} y={f(y)} width="14" height={f(hh)} rx="2"><title>{ipucu}</title></rect>;
            })}
          </g>
        );
      })}
    </svg>
  );
}

function Sayi({ simge, deger, sinif, baslik, alt }: { simge: SimgeAdi; deger: string; sinif?: string; baslik: string; alt: string }) {
  return (
    <div className="tc-dhd-psayi">
      <span className={`tc-dhd-ksayi-deger${sinif ? ` ${sinif}` : ''}`}>{deger}</span>
      <span className="tc-dhd-ksayi-baslik"><Simge ad={simge} boyut="k" />{baslik}</span>
      <span className="tc-dhd-ksayi-alt">{alt}</span>
    </div>
  );
}

function Bulgular({ b }: { b: MatrisSatiri['f']['ic'] }) {
  if (!b.n) return <span className="tc-dhd-soluk">–</span>;
  return (
    <span className="tc-dhd-fb">
      {b.major > 0 && <Rozet ton="hata">{`${String(b.major)}M`}</Rozet>}
      {b.minor > 0 && <Rozet ton="uyari">{`${String(b.minor)}m`}</Rozet>}
      {b.obs > 0 && <Rozet ton="bilgi">{`${String(b.obs)}G`}</Rozet>}
    </span>
  );
}
const Puan = ({ p }: { p: { p: number } | null }) => (p ? <b className={puanSinifi(p.p)}>{p.p}</b> : <span className="tc-dhd-soluk">–</span>);

export function Performans() {
  const d = useDenetim();
  const [f, fYaz] = useState<PerformansSuzgeci>(() => structuredClone(BOS_SUZGEC));
  const [mx, mxYaz] = useState<'iso' | 'ey'>('iso');
  const [form, formYaz] = useState<(FormAcilisi & { anahtar: number }) | null>(null);
  const yaz = d.yetki.yazabilir;
  const ey = mx === 'ey';
  const ev = performansOlaylari(d.profil, f);
  const au = ev.filter((e): e is DenetimOlayi => e.t === 'audit');
  const oz = ev.filter((e): e is OzOlayi => e.t === 'oz');

  const icDenetimEkle = () => {
    const p = d.program;
    const tur = p === 'eydep' ? PROGRAMLAR.eydep.types[0] : PROGRAMLAR[p].types.find((x) => /İç denetim/.test(x)) ?? PROGRAMLAR[p].types[0];
    formYaz({ mode: 'new', pid: d.depo.active, id: '', prog: p, type: tur, date: bugunTarihi(), cb: '', anahtar: Date.now() });
  };
  const kaydedildi = (s: KayitSonucu) => {
    if (s.sonra === 'sonuc') formYaz({ mode: 'done', pid: s.pid, id: s.id, prog: s.prog, anahtar: Date.now() });
    else formYaz(null);
  };
  const formu = form && <DenetimFormu key={form.anahtar} acilis={form} kapat={() => { formYaz(null); }} kaydedildi={kaydedildi} />;

  const suzgecler = (
    <Kart>
      <div className="tc-dhd-psuzgec">
        <div className="tc-dhd-cipler" role="group" aria-label="Program">
          {PROGRAM_SIRASI.map((k) => (
            <Dugme key={k} className={`tc-dhd-p-${k}`} aria-pressed={f.p[k]} onClick={() => { fYaz((o) => ({ ...o, p: { ...o.p, [k]: !o.p[k] } })); }}>
              <i className="tc-dhd-nokta" aria-hidden="true" />{PROGRAMLAR[k].s}
            </Dugme>
          ))}
        </div>
        <div className="tc-dhd-cipler" role="group" aria-label="Kaynak">
          {(Object.keys(KAYNAKLAR) as Kaynak[]).map((k) => (
            <Dugme key={k} aria-pressed={f.s[k]} onClick={() => { fYaz((o) => ({ ...o, s: { ...o.s, [k]: !o.s[k] } })); }}>{KAYNAKLAR[k]}</Dugme>
          ))}
        </div>
        <div className="tc-dhd-cipler" role="group" aria-label="Dönem">
          {DONEMLER.map(([k, ad]) => <Dugme key={k} aria-pressed={f.per === k} onClick={() => { fYaz((o) => ({ ...o, per: k })); }}>{ad}</Dugme>)}
        </div>
      </div>
    </Kart>
  );

  const aciklama = d.ekran.ux !== 'uzman' && (
    <p className="tc-dhd-aciklama">İç denetimler, dış denetimler, müşteri denetimleri, EYDEP ve öz değerlendirmeler ortak bir zaman ekseninde.</p>
  );

  if (!ev.length) {
    return (
      <div className="tc-dhd">
        {aciklama}
        {suzgecler}
        <Kart>
          <div className="tc-dhd-bos">
            <Simge ad="layers" boyut="b" />
            <h3>Henüz karşılaştırılacak değerlendirme yok</h3>
            <p>Takvimde tamamlanmış denetimlerin sonucunu girin, iç denetimlerinizi kaydedin ve öz değerlendirme turları yapın. Hepsi burada ortak bir grafikte, madde bazında karşılaştırılır.</p>
            <div className="tc-dhd-dugmeler">
              {yaz && <Dugme tur="birincil" simge="plus" onClick={icDenetimEkle}>İç denetim kaydı ekle</Dugme>}
              <Dugme simge="rotate" onClick={() => { d.git('kontrol'); }}>Öz değerlendirme turu</Dugme>
            </div>
          </div>
        </Kart>
        {formu}
      </div>
    );
  }

  const F = { major: 0, minor: 0, obs: 0 };
  for (const e of au) { F.major += e.a.res.major; F.minor += e.a.res.minor; F.obs += e.a.res.obs; }
  const sonOz = oz[oz.length - 1];
  const satirlar = performansMatrisi(ev, ey);
  const kor = satirlar.filter((r) => r.sig === 'Kör nokta');
  const tekrar = satirlar.filter((r) => r.rep >= 2);
  const ad = (r: MatrisSatiri) => (ey ? (CL_EY[r.g]?.s ?? r.g) : `${r.g} ${r.ad}`);
  const say: Partial<Record<Kaynak, number>> = {};
  for (const e of au) say[e.src] = (say[e.src] ?? 0) + 1;
  const icgoruler: string[] = [];
  if (kor.length) {
    icgoruler.push(`Kör nokta: ${kor.map((r) => ad(r) + (r.last ? ` (öz değerlendirme %${String(r.last.p)})` : '')).join(', ')}. Kendinize yüksek not verdiğiniz halde ${ey ? 'resmi puan belirgin şekilde düşük.' : 'denetimde uygunsuzluk çıkmış; bu maddelerde puanlama ölçütünüzü sıkılaştırın.'}`);
  }
  if (tekrar.length && !ey) {
    icgoruler.push(`Tekrarlayan: ${tekrar.map((r) => `${r.g} ${r.ad} (${String(r.rep)} denetimde)`).join(', ')}. Aynı maddede birden fazla denetimde bulgu çıkması, düzeltici faaliyetlerin etkin olmadığına işaret edebilir ve sonraki denetimde daha ağır yazılabilir.`);
  }
  const maddesiz = au.filter((e) => e.k !== 'eydep' && e.a.res.major + e.a.res.minor + e.a.res.obs > e.a.res.items.filter((i) => i.g).length).length;
  if (maddesiz) icgoruler.push(`${String(maddesiz)} denetimde bulguların maddesi girilmemiş; bu bulgular madde tablosuna yansımaz. Takvimde "Sonucu düzenle" ile ekleyebilirsiniz.`);

  return (
    <div className="tc-dhd">
      {aciklama}
      {suzgecler}
      <div className="tc-dhd-ksayilar">
        <Sayi
          simge="layers" deger={String(ev.length)} baslik="Değerlendirme"
          alt={[say.dis ? `${String(say.dis)} dış` : '', say.mus ? `${String(say.mus)} müşteri` : '', say.ic ? `${String(say.ic)} iç` : '', oz.length ? `${String(oz.length)} öz değ. turu` : ''].filter(Boolean).join(' · ')}
        />
        <Sayi
          simge="alert" deger={String(F.major + F.minor)} sinif={F.major ? 'tc-dhy-ton-kotu' : F.minor ? 'tc-dhy-ton-uyari' : 'tc-dhy-ton-iyi'} baslik="Uygunsuzluk"
          alt={`${String(F.major)} majör · ${String(F.minor)} minör · ${String(F.obs)} gözlem`}
        />
        <Sayi
          simge="rotate" deger={sonOz ? ozNotu(sonOz.pct) : '–'} sinif={sonOz?.pct != null ? puanSinifi(sonOz.pct) : undefined} baslik="Son öz değerlendirme"
          alt={sonOz ? `${PROGRAMLAR[sonOz.k].s} · %${String(sonOz.pct ?? '–')} · ${tarihMetni(sonOz.date)}` : 'Tur yok'}
        />
        <Sayi
          simge="eye" deger={String(kor.length)} sinif={kor.length ? 'tc-dhy-ton-kotu' : 'tc-dhy-ton-iyi'} baslik="Kör nokta"
          alt={kor.length ? kor.map(ad).join(', ') : 'Öz değerlendirme denetimlerle tutarlı'}
        />
      </div>

      <Kart
        baslik="Ortak zaman grafiği" simge="chart"
        sag={(
          <span className="tc-dhd-lejant">
            <span><i className="tc-dhd-nokta" />Öz değerlendirme (program rengi)</span>
            <span><i className="tc-dhd-nokta tc-dhd-lejant-elmas" />EYDEP puanı</span>
            <span><i className="tc-dhd-nokta tc-dhd-lejant-dis" />Dış denetim bulgusu</span>
            <span><i className="tc-dhd-nokta tc-dhd-lejant-ic" />İç denetim bulgusu</span>
          </span>
        )}
      >
        <div className="tc-dhd-kaydir"><Grafik ev={ev} /></div>
        <p className="tc-dhd-not">Üst şerit 0–100 puanı (öz değerlendirme ve EYDEP), alt şerit ISO 9001 ve AS9100 denetimlerinin bulgu sayısını gösterir. İçi boş işaretler iç denetim ve ön değerlendirmelerdir. Bulgular puana çevrilmez; iki ölçek ayrı tutulur.</p>
      </Kart>

      <Kart
        baslik="Madde bazında karşılaştırma" simge="layers"
        sag={(
          <span className="tc-dhd-cipler" role="group" aria-label="Matris">
            <Dugme aria-pressed={!ey} onClick={() => { mxYaz('iso'); }}>ISO 9001 + AS9100</Dugme>
            <Dugme aria-pressed={ey} onClick={() => { mxYaz('ey'); }}>EYDEP alanları</Dugme>
          </span>
        )}
      >
        {icgoruler.length > 0 && (
          <div className="tc-dhd-icgoru">
            {icgoruler.map((x) => <p key={x}><Simge ad="help" /><span>{x}</span></p>)}
          </div>
        )}
        <div className="tc-dhd-kaydir">
          <table className="tc-dhd-matris" aria-label="Madde bazında karşılaştırma">
            <thead>
              <tr>
                <th scope="col">{ey ? 'Alan' : 'Madde'}</th>
                <th scope="col">Öz değerlendirme<small>son tur</small></th>
                {ey ? (
                  <><th scope="col">Ön değerlendirme<small>alan puanı</small></th><th scope="col">EYDEP resmi<small>alan puanı</small></th></>
                ) : (
                  <><th scope="col">İç denetim<small>bulguları</small></th><th scope="col">Dış denetim<small>bulguları</small></th></>
                )}
                <th scope="col">Sinyal</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((r) => (
                <tr key={r.g}>
                  <th scope="row">{ad(r)}</th>
                  <td><Puan p={r.last} /></td>
                  {ey ? <><td><Puan p={r.pre} /></td><td><Puan p={r.off} /></td></> : <><td><Bulgular b={r.f.ic} /></td><td><Bulgular b={r.f.ex} /></td></>}
                  <td>{r.sig ? <Rozet ton={SINYAL[r.sc]}>{r.sig}</Rozet> : <span className="tc-dhd-soluk">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tc-dhd-not">
          {ey
            ? 'Kör nokta: öz değerlendirme puanı resmi (yoksa ön değerlendirme) alan puanından 15 puan veya daha yüksek.'
            : 'Kör nokta: son öz değerlendirmede %70 ve üzeri, ama seçili dönemde bu maddede majör veya minör bulgu var. M: majör, m: minör, G: gözlem.'}
        </p>
      </Kart>

      <Kart baslik="Tüm değerlendirmeler" simge="list" sag={yaz ? <Dugme tur="birincil" simge="plus" onClick={icDenetimEkle}>İç denetim kaydı ekle</Dugme> : undefined}>
        <ul className="tc-dhd-tliste">
          {ev.slice().reverse().map((e) => (
            <li key={e.t === 'oz' ? `oz-${e.k}-${e.r.id}` : `a-${e.a.id}`} className={`tc-dhd-pd tc-dhd-p-${e.k}`}>
              <b>{tarihMetni(e.date)}</b>
              <Rozet ton="bilgi">{PROGRAMLAR[e.k].s}</Rozet>
              <span className="tc-dhd-soluk">{KAYNAKLAR[e.src] + (e.t === 'audit' && e.a.type ? ` · ${e.a.type}` : e.t === 'oz' ? ` · ${String(Object.keys(e.r.items).length)} soru` : '')}</span>
              <span>{e.t === 'oz' ? <><span>{`%${String(e.pct ?? '–')} `}</span><Rozet ton={notTonu(e.pct)}>{ozNotu(e.pct)}</Rozet></> : sonucMetni(e.a)}</span>
              {e.t === 'audit'
                ? (yaz && <Dugme onClick={() => { formYaz({ mode: 'done', pid: d.depo.active, id: e.a.id, prog: e.a.prog as ProgramKodu, anahtar: Date.now() }); }}>Sonucu düzenle</Dugme>)
                : <Dugme onClick={() => { d.git('kontrol', { program: e.k }); }}>Aç</Dugme>}
            </li>
          ))}
        </ul>
      </Kart>
      {formu}
    </div>
  );
}
