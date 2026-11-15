import { useEffect, useState } from 'react';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { useCanliFarki } from '../motor/atolye/canli-farki.ts';
import { OnaySekmesi } from '../motor/atolye/Onay.tsx';
import type { OkunanPlan } from '../motor/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import '../motor/motor.css';
import '../motor/atolye/atolye.css';

// Kokpit'in Onay ve canlı bölümü (3282-4 a): planlamacı taslağını onaya gönderir ya da canlıya alır, müdür onaydaki planı onaylar. Akış
// Stüdyo'nun onaylı Onay ve canlı ekranıdır (aynı bileşen, aynı uçlar); Stüdyo artık onu okunur gösterir. Açılışta onaydaki plan, yoksa çalışma planı seçilidir.
export function KokpitOnay({ o, c, p, kapat }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; p: OkunanPlan | null; kapat: () => void }) {
  const [sen, setSen] = useState<SenaryolarCevabi | null>(o.depo.senaryolar);
  useEffect(() => { setSen(o.depo.senaryolar); }, [o.depo.senaryolar]);
  const cf = useCanliFarki(c, sen?.canliSurum ?? null);
  return (
    <div className="tc-pym tc-pym-tp tc-pyq-onay" data-sek="onay">
      <OnaySekmesi o={o} c={c} p={p} cf={cf} sen={sen} senYaz={setSen} planSekmesi={kapat} />
    </div>
  );
}
