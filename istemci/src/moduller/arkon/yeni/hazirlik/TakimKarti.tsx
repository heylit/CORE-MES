import { sayi } from '../cekirdek/bicim.ts';
import type { Order, Result, Takim } from './tipler.ts';

// Operatör ekranındaki takım ömrü (kurallar.ts ToolsCard): kullanılan = iyi parça - takım değiştiğindeki iyi parça.
export function takimKullanimi(t: Pick<Takim, 'id' | 'life' | 'warnPct'>, o: Pick<Order | Result, 'good' | 'toolsAt'>): { kullanilan: number; yuzde: number; ton: 'stop' | 'hazard' | 'run' } {
  const kullanilan = Math.max(0, o.good - ((o.toolsAt || {})[t.id] || 0));
  const yuzde = Math.min(100, (kullanilan / t.life) * 100);
  return { kullanilan, yuzde, ton: yuzde >= 100 ? 'stop' : yuzde >= t.warnPct ? 'hazard' : 'run' };
}

export function TakimKarti({ takimlar, is, degisti, kilitli }: {
  takimlar: readonly Takim[]; is: Pick<Order | Result, 'good' | 'toolsAt'>; degisti: (t: Takim) => void; kilitli?: boolean;
}) {
  if (!takimlar.length) return null;
  return (
    <section className="tc-ay2-kart tc-ay2-takim-karti" aria-label="Takım ömrü">
      <div className="tc-ay2-kb"><b>Takım ömrü</b><span className="tc-ay2-ust-yazi tc-ay2-sag">{takimlar.length} takım</span></div>
      {takimlar.map((t) => {
        const k = takimKullanimi(t, is);
        return (
          <div key={t.id} className="tc-ay2-omur">
            <div className="tc-ay2-omur-ust">
              <b>{t.name}</b>
              <span className="tc-ay2-mono">{sayi(k.kullanilan)} / {sayi(t.life)}</span>
              {!kilitli ? <button type="button" className="tc-ay2-bag" onClick={() => degisti(t)}>Değiştirildi</button> : null}
            </div>
            <svg className="tc-ay2-cubuk" data-ton={k.ton} viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label={t.name + ' ömrü yüzde ' + Math.round(k.yuzde)}>
              <rect className="tc-ay2-cubuk-zemin" x="0" y="0" width="100" height="4" />
              <rect className="tc-ay2-cubuk-dolu" x="0" y="0" width={k.yuzde} height="4" />
            </svg>
          </div>
        );
      })}
    </section>
  );
}
