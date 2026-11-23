import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';

// Baştan kurun sonucu (Arayüz Y9): kısa ömürlü bildirim yetmez; bu işlem kilit ve (yöneticide) başlamış işleri taşır. Geri al sonraki plan
// değişikliğine ya da Kapat'a dek durur; Kapat yalnız satırı kapatır, plan taslakta kalır. Yazamayan ya da meşgulken geriAl null.
export function BastanKurSonucu({ ileti, geriAl, kapat }: { ileti: string; geriAl: (() => boolean) | null; kapat: () => void }) {
  return (
    <div className="tc-pyq-ipucu tc-pyq-tasima-onayi tc-pyq-guncelleme" role="group" aria-label="Son baştan kur">
      <span role="status"><Simge ad="rotate" boyut="k" /><b>Son baştan kur:</b> {ileti} Taslakta; canlıya geçmedi.</span>
      {geriAl && <Dugme simge="back" onClick={() => { geriAl(); }}>Geri al</Dugme>}
      <Dugme tur="birincil" simge="check" onClick={kapat}>Kapat</Dugme>
    </div>
  );
}
