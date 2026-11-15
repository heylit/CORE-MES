import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { emirYonu, planYonu, type EmirYonu as Yon } from './ayarlar.ts';
import { EtkiBolumu, useEtki } from './etki.tsx';
import type { TaslakYazici } from './taslak.ts';

// Emrin planlama yönü (3282 1c): terminli emir planın yönünden ayrılabilir. Seçim kişinin taslağına yazılır, etkisiyle gösterilir (etki.tsx).
export interface EmirYonuOzellikleri {
  c: PlanlamaCalismasi;
  taslak: TaslakYazici | null;
  yazabilir: boolean;
  emirId: string;
  no: string;
}

export function EmirYonu({ c, taslak, yazabilir, emirId }: EmirYonuOzellikleri) {
  const { durum, dene, uygula, vazgec } = useEtki({ c, taslak, sonuc: () => undefined });
  const simdi = emirYonu(c, emirId), plan = planYonu(c);
  const kilitli = !yazabilir || taslak === null || durum.tur === 'hesap' || durum.tur === 'etki';
  const sec = (y: Yon) => { if (y !== simdi) void dene({ tur: 'yon', emirId, yon: y }); };
  return (
    <>
      <h3>Planlama yönü</h3>
      <span className="tc-pyq-seg" role="group" aria-label="Planlama yönü">
        {(['plan', 'ileri', 'geri'] as const).map((y) => (
          <button key={y} type="button" aria-pressed={simdi === y} disabled={kilitli} onClick={() => { sec(y); }}>
            {y !== 'plan' && <Simge ad={y === 'geri' ? 'flag' : 'chev-right'} boyut="k" />}{y === 'plan' ? 'Planınki' : y === 'geri' ? 'Teslimden geriye' : 'İleriye'}
          </button>
        ))}
      </span>
      <p className="tc-pyq-not">
        {durum.tur === 'hesap' ? 'Hesaplanıyor' : (simdi === 'plan' ? plan : simdi) === 'geri'
          ? 'Termine yetişecek en geç saatte başlar; geriye sığmazsa ileri planlanır.' : 'İlk boş saatte başlar.'}
      </p>
      {durum.tur === 'hata' && <p className="tc-pyq-ayar-hata" role="alert">{durum.ileti}</p>}
      {durum.tur === 'etki' && <EtkiBolumu ad="Yönün etkisi" e={durum.e} uygula={() => { void uygula(durum.e); }} vazgec={() => { void vazgec(); }} />}
    </>
  );
}
