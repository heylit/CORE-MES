import type { PlanBloguTuru, PlanSeridi as PlanSeridiVerisi } from '#paylasilan/sozlesme/siparisler.ts';
import { tarihMetni, zamanMetni } from './gorunum.ts';

const BLOK_ADI: Record<PlanBloguTuru, string> = { siparis: 'Plandaki sipariş', 'satis-taslagi': 'Satış taslağı (yeri sabit)', teklif: 'Bu teklif' };
const GUN_MS = 86_400_000;

// Gün tesis günüdür; tesis saati (Europe/Istanbul) 2016'dan beri yaz saatsiz UTC+3'tür.
const gunBasi = (gun: string): number => Date.parse(`${gun}T00:00:00+03:00`);

// Örnek sayfanın plan denemesi şeridi: tezgâh başına plandaki siparişler, yer tutan satış taslakları ve bu teklif; termin ve geçerlilik çizgisi.
// Motor blokları kırpmadan verir; pencere dışı kısım burada kırpılır. Konum SVG koordinatıdır (inline stil yok).
export function PlanSeridi({ plan, termin, gecerlilik }: { plan: PlanSeridiVerisi; termin: string | null; gecerlilik: string | null }) {
  const bas = Date.parse(plan.baslangic);
  const son = Date.parse(plan.bitis);
  const sure = son - bas;
  if (!(sure > 0)) return null;
  const x = (an: number): number => (Math.min(Math.max(an, bas), son) - bas) / sure * 100;
  const gunSonu = (gun: string | null): number | null => (gun === null ? null : x(gunBasi(gun) + GUN_MS));
  const terminX = gunSonu(termin);
  const gecerlilikX = gunSonu(gecerlilik);
  const kapali = plan.kapaliGunler.map((g) => ({ g, x1: x(gunBasi(g)), x2: x(gunBasi(g) + GUN_MS) })).filter((k) => k.x2 > k.x1);
  const hatlar = plan.hatlar.filter((h) => !h.fason || plan.bloklar.some((b) => b.makineId === h.makineId));

  return (
    <section className="tc-sp-serit" aria-label="Plan denemesi">
      <div className="tc-sp-serit-lejant" aria-hidden="true">
        {(Object.keys(BLOK_ADI) as PlanBloguTuru[]).map((t) => (
          <span key={t}><svg viewBox="0 0 10 6"><rect className={`tc-sp-blok-${t}`} width={10} height={6} /></svg>{BLOK_ADI[t]}</span>
        ))}
        <span><svg viewBox="0 0 10 6"><rect className="tc-sp-blok-gec" width={10} height={6} /></svg>Gecikiyor</span>
        <span><svg viewBox="0 0 10 6"><line className="tc-sp-cizgi-termin" x1={5} x2={5} y1={0} y2={6} /></svg>Termin</span>
        <span><svg viewBox="0 0 10 6"><line className="tc-sp-cizgi-gecerlilik" x1={5} x2={5} y1={0} y2={6} /></svg>Geçerlilik sonu</span>
      </div>
      <div className="tc-sp-serit-izler">
        {hatlar.map((h) => {
          const bloklar = plan.bloklar.filter((b) => b.makineId === h.makineId && Date.parse(b.bitis) > bas && Date.parse(b.baslangic) < son);
          return (
            <div key={h.makineId} className="tc-sp-serit-satir">
              <div className="tc-sp-serit-ad"><b>{h.fason ? 'Fason' : h.makineId}</b><small>{h.ad}</small></div>
              <svg className="tc-sp-serit-iz" viewBox="0 0 100 10" preserveAspectRatio="none" role="img"
                aria-label={`${h.ad}: ${bloklar.length === 0 ? 'boş' : bloklar.map((b) => b.etiket).join(', ')}`}>
                {kapali.map((k) => <rect key={k.g} className="tc-sp-kapali" x={k.x1} width={k.x2 - k.x1} y={0} height={10} />)}
                {bloklar.map((b) => {
                  const x1 = x(Date.parse(b.baslangic));
                  return (
                    <rect key={`${b.tur}-${b.etiket}-${b.kalem ?? ''}-${b.adim}-${b.baslangic}`}
                      className={`tc-sp-blok-${b.gecikir ? 'gec' : b.tur}`} x={x1} width={Math.max(0.4, x(Date.parse(b.bitis)) - x1)} y={1.5} height={7}>
                      <title>{`${b.etiket}${b.kalem === null ? '' : ` · kalem ${b.kalem}`} · ${b.adim}: ${zamanMetni(b.baslangic)} – ${zamanMetni(b.bitis)}${b.gecikir ? ' · gecikiyor' : ''}`}</title>
                    </rect>
                  );
                })}
                {terminX !== null && <line className="tc-sp-cizgi-termin" x1={terminX} x2={terminX} y1={0} y2={10} />}
                {gecerlilikX !== null && <line className="tc-sp-cizgi-gecerlilik" x1={gecerlilikX} x2={gecerlilikX} y1={0} y2={10} />}
              </svg>
            </div>
          );
        })}
        <div className="tc-sp-serit-satir">
          <span />
          <div className="tc-sp-serit-eksen"><span>{zamanMetni(plan.baslangic)}</span><span>{tarihMetni(plan.bitis)}</span></div>
        </div>
      </div>
    </section>
  );
}
