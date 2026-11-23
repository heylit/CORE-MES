import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';

// Sıra hatasında kısayol (Arayüz Y8): hata elle kilitli adımı gösteriyorsa yalnız o emir yeniden dizilir ve yalnız o emrin kilitleri kalkar.
// Kapsam düğmede yazılır; plan.kilitle yoksa düğme pasif ve nedeni yanında. Odak ileti kutusunda değil düğmededir (ileti sonradan eklenir).
export function KilitIhlali({ ileti, emirNo, kilitYetkisi, diz, kapat }: { ileti: string; emirNo: string; kilitYetkisi: boolean; diz: (() => void) | null; kapat: () => void }) {
  return (
    <div className="tc-pyq-ipucu tc-pyq-tasima-onayi tc-pyq-guncelleme" role="alert">
      <span><Simge ad="lock" boyut="k" />{ileti}</span>
      {diz !== null && <Dugme simge="rotate" disabled={!kilitYetkisi} onClick={diz} title={`Yalnız ${emirNo} yeniden dizilir ve yalnız onun elle kilitleri kalkar; Geri al ile döner.`}>Kilidi kaldır ve yeniden diz</Dugme>}
      {!kilitYetkisi && <small>Kilitleri kaldırmak plan kilitleme yetkisi ister.</small>}
      <Dugme onClick={kapat}>Kapat</Dugme>
    </div>
  );
}
