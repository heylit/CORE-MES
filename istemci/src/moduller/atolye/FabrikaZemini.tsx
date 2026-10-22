import { useMemo } from 'react';
import type { FabrikaCevabi } from '#paylasilan/sozlesme/atolye.ts';
import { DurumKutusu } from '../../ortak/arayuz/index.ts';
import { PlanCizimi } from './PlanCizimi.tsx';
import { zeminPlaniKur } from './zemin-plani.ts';
import './atolye.css';

export interface FabrikaZeminiOzellikleri {
  // Fabrika Haritası'nın fabrika cevabı; çağıran kendi ucundan alır (stok `stok/disari` üzerinden, #115).
  fabrika: FabrikaCevabi;
  // Kayıtlı anahtar: raf:<id>, alan:<id>, istasyon:<id>, makine:<id>, bolum:<salonId>.
  secili: string | null;
  sec?: (anahtar: string | null) => void;
  etiket?: string;
}

// Bütün bölümler tek zeminde, fabrikadaki yer, dönüş ve gerçek ölçüleriyle; raf, alan (stok kutuları, fason dahil),
// istasyon ve makine haritadaki simgesiyle (#114). Salt okunur: yer ve boyut Fabrika Haritası'nda düzenlenir (Soru 109 a).
export function FabrikaZemini({ fabrika, secili, sec, etiket = 'Fabrika zemini' }: FabrikaZeminiOzellikleri) {
  const yerlesimler = fabrika.bolumler;
  const plan = useMemo(() => (yerlesimler.length === 0 ? null : zeminPlaniKur(yerlesimler, true)), [yerlesimler]);
  if (!plan) return <DurumKutusu durum="bos" mesaj="Fabrika Haritası'nda bölüm yok." />;
  return (
    <div className="tc-atolye-zemin">
      <PlanCizimi
        taslak={plan.taslak}
        sutunlar={[]}
        satirlar={[]}
        secili={secili === null ? null : plan.taslakta(secili)}
        kutu={plan.kutu}
        etiket={etiket}
        {...(sec ? { ogeBas: (anahtar: string) => sec(plan.kayitli(anahtar)), bolumBas: (anahtar: string) => sec(anahtar), bosBas: () => sec(null) } : {})}
      />
    </div>
  );
}
