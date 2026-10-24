import type { Analiz, FinansMotoru, SiparisKalemi } from '../motor.ts';
import { addDays, fmt, fmtD, gross, pct, sum } from '../motor.ts';
import { openFindings } from '../gorunum.ts';
import type { IsKalemi } from './yapilacaklar.ts';

// Ana sayfanın sayıları ve metinleri (prototip home, briefing). Saf: motor ve yapılacaklar listesinden okunur.

// Metin parçası: düz yazı ya da vurgulu tutar; vurgu yalnız kalınlık ve "olumsuz" anlamı taşır, renk ekranın işidir.
export type Parca = string | { kalin: string; olumsuz?: true };

export interface AnaSayilar {
  nakit: number;
  alacak: number; alacakGeciken: number; alacakCek: number;
  borc: number; borcHafta: number; borcCek: number; siparisHafta: { adet: number; tutar: number };
  aylikKar: number; gecenAyKar: number; gecenAyMarj: number | null;
}

export function anaSayilar(motor: FinansMotoru, siparisler: readonly SiparisKalemi[]): AnaSayilar {
  const s = motor.durum, bugun = motor.bugun;
  const gelir = motor.openItems('gelir'), gider = motor.openItems('gider');
  const cm3 = motor.completeMonths(3), son = cm3[2]!;
  return {
    nakit: motor.cashToday(),
    alacak: sum(gelir, gross), alacakGeciken: sum(gelir.filter((t) => t.due < bugun), gross),
    alacakCek: sum(s.cheques.filter((q) => q.dir === 'alinan' && ['portfoy', 'tahsilde'].includes(q.status)), (q) => q.amount),
    borc: sum(gider, gross), borcHafta: sum(gider.filter((t) => t.due <= addDays(bugun, 7)), gross),
    borcCek: sum(s.cheques.filter((q) => q.dir === 'verilen' && q.status === 'bekliyor'), (q) => q.amount),
    siparisHafta: motor.siparisBuHafta(siparisler),
    aylikKar: sum(cm3, (r) => r.net) / 3, gecenAyKar: son.net, gecenAyMarj: son.gelir ? son.net / son.gelir : null,
  };
}

export type Hukum = { ton: 'tamam' | 'uyari' | 'hata'; metin: string } | null;

// Nakit görünümü kartının tek cümlelik hükmü: risk toleransı aşılırsa kritik, eşik altı olasılığı %25'i geçerse uyarı.
export function nakitHukmu(motor: FinansMotoru, A: Analiz): Hukum {
  const mc = A.mc;
  if (!mc) return null;
  const tol = (Number(motor.durum.settings.riskTol) || 5) / 100;
  if (mc.pNeg >= tol) return { ton: 'hata', metin: `Nakit önümüzdeki haftalarda eksiye düşebilir (olasılık ${pct(mc.pNeg, 0)}).` };
  if (mc.pBelow >= 0.25) return { ton: 'uyari', metin: `Nakit ${fmtD(addDays(motor.bugun, mc.dipWeek * 7))} civarında güvenlik eşiğinin altına inebilir.` };
  return { ton: 'tamam', metin: 'Önümüzdeki 13 hafta nakit yeterli görünüyor.' };
}

// "Günün özeti" (prototip briefing): bu haftanın tahsilat ve ödemesi, gecikmiş tahsilat, en sıkışık hafta, öncelikli öneri.
export function gununOzeti(motor: FinansMotoru, A: Analiz, ib: readonly IsKalemi[]): Parca[][] {
  const wk = ib.filter((x) => x.g === 1), late = ib.filter((x) => x.g === 0);
  const inW = sum(wk.filter((x) => x.kind === 'in'), (x) => x.tutar), outW = sum(wk.filter((x) => x.kind === 'out'), (x) => x.tutar);
  const lateIn = late.filter((x) => x.kind === 'in').sort((a, b) => b.tutar - a.tutar);
  const acik = openFindings(motor, A), top = acik.find((f) => f.sev === 3) ?? acik[0], mc = A.mc;
  const parts: Parca[][] = [];
  if (inW || outW) parts.push(['Bu hafta ', { kalin: fmt(inW) }, ' tahsilat bekleniyor, ', { kalin: fmt(outW) }, ' ödeme yapılacak.']);
  else parts.push(['Bu hafta için planlanmış bir tahsilat veya ödeme görünmüyor.']);
  if (lateIn.length) {
    const ilk = lateIn[0]!;
    parts.push(['Gecikmiş tahsilat toplamı ', { kalin: fmt(sum(lateIn, (x) => x.tutar)), olumsuz: true }, `; en büyüğü ${ilk.baslik.replace(' ödemesi gecikti', '')} (${fmt(ilk.tutar)}).`]);
  }
  if (mc) {
    parts.push(mc.pBelow >= 0.25
      ? ['Nakdin en sıkışık olacağı dönem ', { kalin: fmtD(addDays(motor.bugun, mc.dipWeek * 7)) }, ` haftası; o hafta en olası bakiye ${fmt(mc.bands[mc.dipWeek]!.p50)}.`]
      : ['Nakit önümüzdeki 13 hafta güvenlik eşiğinin üzerinde görünüyor.']);
  }
  if (top) parts.push([`Öncelikli öneri: ${top.title.charAt(0).toLowerCase() + top.title.slice(1)}.`]);
  return parts;
}

// Saate göre selam; saat tarayıcının (tesis) saatidir.
export const selam = (saat: number): string => (saat < 11 ? 'Günaydın' : saat < 18 ? 'İyi günler' : 'İyi akşamlar');
