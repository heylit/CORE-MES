import { Fragment, type KeyboardEvent } from 'react';
import type { PlanCevabi, PlanYerlesimi } from '#paylasilan/sozlesme/plan.ts';
import { Simge } from '../../ortak/arayuz/index.ts';
import { EK_ADIM_ETIKETI } from './PartiPaneli.tsx';
import { istasyonRengi } from './gorunum.ts';
import { DURUM_ADI, durumSinifi, gorunenKaynaklar, gorunenYerlesimler, kaynakGruplari, yerlesimDurumu, type Pencere, type Suzgec } from './planGorunumu.ts';
import { kaynakAnahtari, kaynakEtiketi, kisaZaman } from './usePlan.ts';
import './plan.css';

// Gün başına sabit genişlik (birim = ekran pikseli, ölçek 1:1): dar ekranda yatay kaydırılır, çubuk etiketi okunur kalır.
const GUN_GEN = 144;
const SATIR = 34;
const EKSEN = 24;
interface Tiklama { role: 'button'; tabIndex: number; onClick: () => void; onKeyDown: (o: KeyboardEvent<SVGGElement>) => void }

// Makine ve kişi çizelgesi: istasyona göre gruplu satırlar. Etiket sütunu HTML'dir ve yatay kaydırmada solda sabit kalır
// (position: sticky); çubuklar satır başına bir SVG'dir, koordinatlar öznitelik olarak verilir.
export function KaynakCizelgesi({ veri, pencere, suzgec, sec, secili }: {
  veri: PlanCevabi; pencere: Pencere; suzgec: Suzgec; sec: (isEmriId: number) => void; secili: number | null;
}) {
  const yerlesimler = gorunenYerlesimler(veri, suzgec);
  const gruplar = kaynakGruplari(gorunenKaynaklar(veri, suzgec));
  const EN = pencere.gun * GUN_GEN;
  const uzun = pencere.bitis - pencere.baslangic;
  const x = (iso: string) => Math.min(EN, Math.max(0, ((Date.parse(iso) - pencere.baslangic) / uzun) * EN));
  const gunGen = EN / pencere.gun;
  const adim = pencere.gun <= 7 ? 1 : pencere.gun <= 14 ? 2 : 4;
  const simdi = ((Date.parse(veri.simdi) - pencere.baslangic) / uzun) * EN;
  const cizgiler = Array.from({ length: pencere.gun + 1 }, (_, i) => i * gunGen);
  const ac = (id: number): Tiklama => ({ role: 'button', tabIndex: 0, onClick: () => sec(id), onKeyDown: (o: KeyboardEvent<SVGGElement>) => { if (o.key === 'Enter' || o.key === ' ') { o.preventDefault(); sec(id); } } });
  const iz = (satirYuksekligi: number) => (
    <>
      {cizgiler.map((c) => <line key={c} className="tc-g-iz-cizgi" x1={c} x2={c} y1={0} y2={satirYuksekligi} />)}
      {simdi >= 0 && simdi <= EN && <line className="tc-g-simdi" x1={simdi} x2={simdi} y1={0} y2={satirYuksekligi} />}
    </>
  );
  if (gruplar.length === 0) return <p className="tc-rota-ipucu">Süzgece uyan makine ya da kişi yok.</p>;
  return (
    <div className="tc-kc-kap" role="group" aria-label="Makine ve kişi çizelgesi">
      <div className={`tc-kc-ic tc-kc-h${pencere.gun / 7}`}>
        <div className="tc-kc-satir">
          <div className="tc-kc-etiket" />
          <svg className="tc-kc-iz" viewBox={`0 0 ${EN} ${EKSEN}`} aria-hidden="true">
            {pencere.gunler.map((t, i) => (i % adim === 0 ? <text key={t} className="tc-g-etiket-dis" x={i * gunGen + 4} y={EKSEN - 8}>{`${t.slice(8, 10)}.${t.slice(5, 7)}`}</text> : null))}
          </svg>
        </div>
        {gruplar.map((g) => (
          <Fragment key={g.anahtar}>
            <div className="tc-kc-grup"><span><Simge ad={g.anahtar === 'yok' ? 'user' : 'cpu'} boyut="k" />{g.baslik}<small>{g.kaynaklar.length} kaynak</small></span></div>
            {g.kaynaklar.map((k) => {
              const anahtar = kaynakAnahtari(k);
              const isler = yerlesimler.filter((y) => kaynakAnahtari(y.kaynak) === anahtar);
              const gorunen = isler.filter((y) => Date.parse(y.bitis) > pencere.baslangic && Date.parse(y.baslangic) < pencere.bitis);
              return (
                <div className="tc-kc-satir" key={anahtar}>
                  <div className="tc-kc-etiket" title={`${k.tur === 'makine' ? '' : 'Kişi: '}${kaynakEtiketi(k)}`}><span>{k.tur === 'makine' ? '' : 'Kişi: '}{kaynakEtiketi(k)}</span><small>{isler.length} iş</small></div>
                  <svg className="tc-kc-iz" viewBox={`0 0 ${EN} ${SATIR}`} role="presentation">
                    {iz(SATIR)}
                    {gorunen.map((y) => <Cubuk key={y.isEmriId} y={y} istasyonId={k.istasyon?.id ?? null} x1={x(y.baslangic)} x2={x(y.bitis)} secili={secili === y.isEmriId} ac={ac(y.isEmriId)} />)}
                  </svg>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Cubuk({ y, istasyonId, x1, x2, secili, ac }: {
  y: PlanYerlesimi; istasyonId: number | null; x1: number; x2: number; secili: boolean; ac: Tiklama;
}) {
  const durum = yerlesimDurumu(y);
  const w = Math.max(4, x2 - x1);
  return (
    <g className={`tc-g-cubuk ${istasyonRengi(istasyonId)}${secili ? ' tc-secili' : ''}${durumSinifi(durum)}`} aria-label={`${y.emirNo} OP ${y.opNo} ${y.ad}`} {...ac}>
      <title>{`${y.emirNo} OP ${y.opNo} ${y.ad}: ${kisaZaman(y.baslangic)} → ${kisaZaman(y.bitis)}${durum === 'normal' ? '' : ` (${DURUM_ADI[durum]})`}`}</title>
      <rect className="tc-g-renk" x={x1} y={4} width={w} height={SATIR - 8} rx={4} />
      {w > 70 && <text className="tc-g-etiket" x={x1 + 4} y={21}>{y.kilitli ? 'Kilitli · ' : y.dondurulmus ? 'Donduruldu · ' : ''}{y.emirNo.replace(/^UE-0*/, 'UE-')} · OP {y.opNo}{y.tur !== 'rota' ? ` · ${EK_ADIM_ETIKETI[y.tur].ad}` : ''}</text>}
    </g>
  );
}
