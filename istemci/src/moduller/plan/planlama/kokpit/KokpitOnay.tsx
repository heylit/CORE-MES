import { useEffect, useRef, useState } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { useCanliFarki } from '../motor/atolye/canli-farki.ts';
import { OnaySekmesi, type OnaySekmeAdi } from '../motor/atolye/Onay.tsx';
import type { OkunanPlan } from '../motor/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import '../motor/motor.css';
import '../motor/atolye/atolye.css';

// Kokpit'in onay sayfası (3282-4 a, 3335 a): Kokpit'in yerine açılır, adresi `?sayfa=onay`. Planlamacı planını onaya gönderir ya da canlıya
// alır, müdür onaydaki planı onaylar. Üç sekme: "Planım" kişinin çalışma planıdır ve sayfa hep onunla açılır; çalışma planı yokken ve onayda
// plan varken "Onay bekleyenler" açılır (müdürün işi). Komutlar ve kurallar Stüdyo'nun Onay ve canlı ekranınınkidir (aynı bileşen, aynı uçlar).
// Taslak çubuğundan gelinince düğme ortak plana yazmıştır ama canlı değişmemiştir (Risk 3282 1d-3 N1); satır bunu sayfa açık kaldıkça söyler,
// canlı sürüm bu arada değişirse (canlıya alındı) kalkar.
const SEKME_ADI: Record<OnaySekmeAdi, string> = { planim: 'Planım', bekleyen: 'Onay bekleyenler', gecmis: 'Geçmiş' };
export function KokpitOnay({ o, c, p, kapat, taslakYazildi = false }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi; p: OkunanPlan | null; kapat: () => void; taslakYazildi?: boolean }) {
  const [sen, setSen] = useState<SenaryolarCevabi | null>(o.depo.senaryolar);
  useEffect(() => { setSen(o.depo.senaryolar); }, [o.depo.senaryolar]);
  const cf = useCanliFarki(c, sen?.canliSurum ?? null);
  const ilkCanli = useRef<number | undefined>(undefined);
  if (ilkCanli.current === undefined && sen !== null) ilkCanli.current = sen.canliSurum;
  const canliAyni = sen === null || ilkCanli.current === undefined || sen.canliSurum === ilkCanli.current;
  const onayda = sen?.senaryolar.filter((x) => x.durum === 'onayda').length ?? 0;
  const [sekme, setSekme] = useState<OnaySekmeAdi>(() => (p === null && onayda > 0 ? 'bekleyen' : 'planim'));
  const sekmeler: OnaySekmeAdi[] = ['planim', 'bekleyen', 'gecmis'];
  return (
    <div className="tc-pym tc-pym-tp tc-pyq-onay" data-sek="onay">
      <ol className="tc-pyq-onay-adimlar" aria-label="Plan adımları">
        <li><button type="button" onClick={kapat}><b>1</b> Planla <small>Kokpit</small></button></li>
        <li aria-current="step"><b>2</b> Kontrol et</li>
        <li aria-current="step"><b>3</b> Canlıya al</li>
      </ol>
      <div className="tc-pyq-onay-sekmeler" role="tablist" aria-label="Onay sayfası">
        {sekmeler.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={sekme === s} onClick={() => { setSekme(s); }}>
            {SEKME_ADI[s]}{s === 'bekleyen' && onayda > 0 ? ` (${String(onayda)})` : ''}
          </button>
        ))}
      </div>
      {taslakYazildi && canliAyni && <p className="tc-pym-pa-not" role="status"><Simge ad="flag" boyut="k" /><span>Taslak ortak plana yazıldı; <strong>canlı plan değişmedi.</strong></span></p>}
      <OnaySekmesi o={o} c={c} p={p} cf={cf} sen={sen} senYaz={setSen} planSekmesi={kapat} sade={{ sekme, sekmeSec: setSekme }} />
    </div>
  );
}
