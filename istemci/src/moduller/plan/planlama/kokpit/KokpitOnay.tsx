import { useEffect, useRef, useState } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
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
// Taslak çubuğundan gelinince düğme ortak plana yazmıştır ama canlı değişmemiştir (Risk 3282 1d-3 N1); satır bunu bölüm açık kaldıkça söyler,
// canlı sürüm bu arada değişirse (canlıya alındı) kalkar. Taslak çubuğundan gelen kişinin işi az önce yazdığı çalışma planıdır: onayda bekleyen
// başka plan olsa da çalışma planı seçili açılır.
export function KokpitOnay({ o, c, p, kapat, taslakYazildi = false }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; p: OkunanPlan | null; kapat: () => void; taslakYazildi?: boolean }) {
  const [sen, setSen] = useState<SenaryolarCevabi | null>(o.depo.senaryolar);
  useEffect(() => { setSen(o.depo.senaryolar); }, [o.depo.senaryolar]);
  const cf = useCanliFarki(c, sen?.canliSurum ?? null);
  const ilkCanli = useRef<number | undefined>(undefined);
  if (ilkCanli.current === undefined && sen !== null) ilkCanli.current = sen.canliSurum;
  const canliAyni = sen === null || ilkCanli.current === undefined || sen.canliSurum === ilkCanli.current;
  return (
    <div className="tc-pym tc-pym-tp tc-pyq-onay" data-sek="onay">
      {taslakYazildi && canliAyni && <p className="tc-pym-pa-not" role="status"><Simge ad="flag" boyut="k" /><span>Taslak ortak plana yazıldı; <strong>canlı plan değişmedi.</strong></span></p>}
      <OnaySekmesi key={taslakYazildi ? 'taslaktan' : 'dogrudan'} o={o} c={c} p={p} cf={cf} sen={sen} senYaz={setSen} planSekmesi={kapat} {...(taslakYazildi ? { ilkSecim: 'calisma' as const } : {})} />
    </div>
  );
}
