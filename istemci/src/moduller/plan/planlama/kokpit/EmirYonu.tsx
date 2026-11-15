import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { degerlendirmeIste } from '../siparis/degerlendirme.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { emirYonu, emirYonuYaz, planYonu, yonAdi, type EmirYonu as Yon } from './ayarlar.ts';
import { EtkiBolumu, useEtki } from './etki.tsx';

// Emrin planlama yönü (3282 1c): terminli emir planın yönünden ayrılabilir. Seçim etkisiyle gösterilir (etki.tsx).
export interface EmirYonuOzellikleri {
  c: PlanlamaCalismasi;
  komut: CalismaKomutu | null;
  yazabilir: boolean;
  kim: string;
  emirId: string;
  no: string;
  iste?: typeof degerlendirmeIste | undefined;
}

export function EmirYonu({ c, komut, yazabilir, kim, emirId, no, iste }: EmirYonuOzellikleri) {
  const { durum, dene, uygula, vazgec } = useEtki({ c, komut, kim, iste, sonuc: () => undefined });
  const simdi = emirYonu(c, emirId), plan = planYonu(c);
  const ad = (y: Yon) => (y === 'plan' ? `Planınki (${yonAdi(plan)})` : yonAdi(y));
  const kilitli = !yazabilir || komut === null || durum.tur === 'hesap' || durum.tur === 'etki';
  const sec = (y: Yon) => { if (y !== simdi) void dene('Emrin yönü değişti', (x) => emirYonuYaz(x, emirId, y), `${no}: ${ad(simdi)} → ${ad(y)}`); };
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
      {durum.tur === 'etki' && <EtkiBolumu ad="Yönün etkisi" e={durum.e} uygula={() => { uygula('Emrin yönü uygulandı', durum.e); }} vazgec={() => { vazgec(durum.e); }} />}
    </>
  );
}
