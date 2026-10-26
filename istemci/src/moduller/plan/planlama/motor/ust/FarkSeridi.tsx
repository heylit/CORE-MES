import { Simge } from '../../../../../ortak/arayuz/index.ts';
import { farkOzeti, type CanliPlanDurumu } from '../fark.ts';
import type { OkunanPlan } from '../kurallar.ts';

// Önceki planla fark açıkken tahtanın üstündeki satır (x-resim rsFarkOzet): son canlı planla kaç iş, tezgâh ve siparişin yeri değişti.
export function FarkSeridi({ d, p, kapat }: { d: CanliPlanDurumu; p: OkunanPlan | null; kapat: () => void }) {
  if (d.tur === 'kapali') return null;
  let metin: string;
  if (d.tur === 'okunuyor') metin = 'Son canlı plan okunuyor.';
  else if (d.tur === 'hata') metin = d.ileti;
  else if (!Object.keys(d.canli).length) metin = 'Henüz canlıya alınmış plan yok; karşılaştırılacak plan yok.';
  else if (!p) metin = 'Tahtada plan yok.';
  else { const f = farkOzeti(p, d.canli); metin = `Son canlı plan ile: ${f.is} iş yer değişti, ${f.tez} tezgâh, ${f.sip} sipariş. Değişen yay, doluluk ve sıra kesik sarı çizilir.`; }
  return (
    <p className="tc-pym-fark" role="status" data-ton={d.tur === 'hata' ? 'hata' : undefined}>
      <Simge ad="eye" boyut="k" /><span>{metin}</span>
      <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet" aria-label="Farkı kapat" title="Farkı kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
    </p>
  );
}
