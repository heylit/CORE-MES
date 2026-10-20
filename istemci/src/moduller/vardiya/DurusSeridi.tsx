import { useEffect, useState } from 'react';
import type { PlanliDurus } from '#paylasilan/sozlesme/vardiya.ts';
import { GUNLER, tarihMetni, yerelGun } from './gosterim.ts';
import { gecmisMi, gerceklesmeler, gunBasi, yuzde } from './serit.ts';

// 7 günlük takvim şeridi (kart #544). Düzen Arkon Planlama > Planlı duruşlar şeridinden (pano-planlama.ts:319-322): gün başlıkları,
// duruş başına bir satır, gün çizgileri, "şimdi" çizgisi, gerçekleşme çubukları; bir daha gerçekleşmeyecek duruş "geçmiş" etiketi alır.
const GUN_SAYISI = 7;
const saatMetni = (an: number) => new Date(an).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

function useSimdi(): number {
  const [simdi, simdiYaz] = useState(() => Date.now());
  useEffect(() => {
    const zamanlayici = setInterval(() => simdiYaz(Date.now()), 60_000);
    return () => clearInterval(zamanlayici);
  }, []);
  return simdi;
}

export function DurusSeridi({ duruslar, hedef }: { duruslar: readonly PlanliDurus[]; hedef: (d: PlanliDurus) => string }) {
  const simdi = useSimdi();
  const pencere = gunBasi(simdi);
  const gunler = Array.from({ length: GUN_SAYISI }, (_, i) => {
    const t = new Date(pencere);
    t.setDate(t.getDate() + i);
    return yerelGun(t.toISOString());
  });
  const x = (an: number) => yuzde(an, pencere, GUN_SAYISI);
  return (
    <div className="tc-vr-serit" role="group" aria-label="7 günlük planlı duruş şeridi">
      <div className="tc-vr-serit-satir tc-vr-serit-bas">
        <span />
        <div className="tc-vr-serit-gunler">
          {gunler.map((g) => <span key={g}>{GUNLER[(new Date(`${g}T00:00:00Z`).getUTCDay() + 6) % 7]} {tarihMetni(g).slice(0, 5)}</span>)}
        </div>
      </div>
      {duruslar.map((d) => {
        const araliklar = gerceklesmeler(d, pencere, GUN_SAYISI);
        const etiket = !d.aktif ? 'pasif' : gecmisMi(d, simdi) ? 'geçmiş' : null;
        return (
          <div key={d.id} className="tc-vr-serit-satir" data-pasif={!d.aktif || undefined}>
            <div className="tc-vr-serit-ad">
              <b>{d.baslik}</b>
              <small>{hedef(d)}{etiket && <span className="tc-vr-serit-etiket"> · {etiket}</span>}</small>
            </div>
            <svg className="tc-vr-serit-iz" viewBox="0 0 100 10" preserveAspectRatio="none" role="img"
              aria-label={`${d.baslik}: bu hafta ${String(araliklar.length)} gerçekleşme`}>
              {[1, 2, 3, 4, 5, 6].map((i) => <line key={i} className="tc-vr-serit-gun" x1={(i / GUN_SAYISI) * 100} x2={(i / GUN_SAYISI) * 100} y1={0} y2={10} />)}
              {araliklar.map((a) => (
                <rect key={a.bas} className="tc-vr-serit-cubuk" x={x(a.bas)} width={Math.max(0.6, x(a.bit) - x(a.bas))} y={2} height={6}>
                  <title>{`${tarihMetni(yerelGun(new Date(a.bas).toISOString()))} ${saatMetni(a.bas)}–${saatMetni(a.bit)}`}</title>
                </rect>
              ))}
              <line className="tc-vr-serit-simdi" x1={x(simdi)} x2={x(simdi)} y1={0} y2={10} />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
