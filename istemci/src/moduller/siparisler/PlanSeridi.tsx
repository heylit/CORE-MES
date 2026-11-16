import type { PlanBloguTuru, PlanSeridi as PlanSeridiVerisi } from '#paylasilan/sozlesme/siparisler.ts';
import { tarihMetni, zamanMetni } from './gorunum.ts';

const BLOK_ADI: Record<PlanBloguTuru, string> = { siparis: 'Plandaki sipariş', 'satis-taslagi': 'Satış taslağı (yeri sabit)', teklif: 'Bu teklif' };
const GUN_MS = 86_400_000;
// Konumlar yüzde uzunluktur: SVG esnemez, blok adı bozulmadan bloğun başından yazılır ve iç SVG'de bloğa kırpılır. Pencerenin bu
// yüzdesinden dar blokta ad yazılmaz, yalnız title'da durur.
const yuzde = (n: number): string => `${String(n)}%`;
const YAZI_EN_AZ = 8;

// Gün tesis günüdür; tesis saati (Europe/Istanbul) 2016'dan beri yaz saatsiz UTC+3'tür.
const gunBasi = (gun: string): number => Date.parse(`${gun}T00:00:00+03:00`);
const tesisGunu = (an: number): string => new Date(an + 3 * 3_600_000).toISOString().slice(0, 10);
const HAFTA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;

// Örnek sayfanın plan denemesi şeridi: tezgâh başına plandaki siparişler, yer tutan satış taslakları ve bu teklif; termin ve geçerlilik çizgisi.
// Motor blokları kırpmadan verir; pencere dışı kısım burada kırpılır. Konum SVG yüzde uzunluğudur (inline stil yok).
// 3326: gunSec verilirse gün başlıkları düğmedir; tıklanan gün (GGGG-AA-GG) ekrana döner, seçili gün işaretlenir. Pencere gün başına
// hizalanır ki gün sütunları eşit genişlikte olsun.
export function PlanSeridi({ plan, termin, gecerlilik, gunSec, secili = null, gunEtiketi = 'Gün seç' }: {
  plan: PlanSeridiVerisi; termin: string | null; gecerlilik: string | null;
  gunSec?: (gun: string) => void; secili?: string | null; gunEtiketi?: string;
}) {
  const bas = gunBasi(tesisGunu(Date.parse(plan.baslangic)));
  const son = Date.parse(plan.bitis);
  const sure = son - bas;
  if (!(sure > 0)) return null;
  const x = (an: number): number => (Math.min(Math.max(an, bas), son) - bas) / sure * 100;
  const gunSonu = (gun: string | null): number | null => (gun === null ? null : x(gunBasi(gun) + GUN_MS));
  const terminX = gunSonu(termin);
  const gecerlilikX = gunSonu(gecerlilik);
  const kapali = plan.kapaliGunler.map((g) => ({ g, x1: x(gunBasi(g)), x2: x(gunBasi(g) + GUN_MS) })).filter((k) => k.x2 > k.x1);
  const kapaliGun = new Set(plan.kapaliGunler);
  const gunler: string[] = [];
  for (let an = bas; an < son; an += GUN_MS) gunler.push(tesisGunu(an));
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
        {gunSec !== undefined && (
          <div className="tc-sp-serit-satir">
            <span className="tc-sp-serit-ad"><small>{gunEtiketi}</small></span>
            <div className="tc-sp-serit-gunler" role="group" aria-label={gunEtiketi}>
              {gunler.map((g) => {
                const hg = HAFTA[new Date(`${g}T12:00:00Z`).getUTCDay()] ?? '';
                const ad = `${tarihMetni(g)} ${hg}${kapaliGun.has(g) ? ', kapalı gün' : ''}`;
                return (
                  <button key={g} type="button" className="tc-sp-serit-gun" data-kapali={kapaliGun.has(g) || undefined} aria-pressed={secili === g}
                    aria-label={ad} title={ad} onClick={() => gunSec(g)}>
                    <b>{g.slice(8)}</b><small>{hg}</small>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {hatlar.map((h) => {
          const bloklar = plan.bloklar.filter((b) => b.makineId === h.makineId && Date.parse(b.bitis) > bas && Date.parse(b.baslangic) < son);
          return (
            <div key={h.makineId} className="tc-sp-serit-satir">
              <div className="tc-sp-serit-ad"><b>{h.fason ? 'Fason' : h.makineId}</b><small>{h.ad}</small></div>
              <svg className="tc-sp-serit-iz" role="img" aria-label={`${h.ad}: ${bloklar.length === 0 ? 'boş' : bloklar.map((b) => b.etiket).join(', ')}`}>
                {kapali.map((k) => <rect key={k.g} className="tc-sp-kapali" x={yuzde(k.x1)} width={yuzde(k.x2 - k.x1)} y={0} height="100%" />)}
                {bloklar.map((b) => {
                  const x1 = x(Date.parse(b.baslangic));
                  const en = Math.max(0.4, x(Date.parse(b.bitis)) - x1);
                  return (
                    <svg key={`${b.tur}-${b.etiket}-${b.kalem ?? ''}-${b.adim}-${b.baslangic}`} x={yuzde(x1)} width={yuzde(en)} y="15%" height="70%">
                      <title>{`${b.etiket}${b.kalem === null ? '' : ` · kalem ${b.kalem}`} · ${b.adim}: ${zamanMetni(b.baslangic)} – ${zamanMetni(b.bitis)}${b.gecikir ? ' · gecikiyor' : ''}`}</title>
                      <rect className={`tc-sp-blok-${b.gecikir ? 'gec' : b.tur}`} width="100%" height="100%" />
                      {en >= YAZI_EN_AZ && <text className="tc-sp-blok-yazi" x={3} y="50%">{b.etiket}</text>}
                    </svg>
                  );
                })}
                {terminX !== null && <line className="tc-sp-cizgi-termin" x1={yuzde(terminX)} x2={yuzde(terminX)} y1={0} y2="100%" />}
                {gecerlilikX !== null && <line className="tc-sp-cizgi-gecerlilik" x1={yuzde(gecerlilikX)} x2={yuzde(gecerlilikX)} y1={0} y2="100%" />}
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
