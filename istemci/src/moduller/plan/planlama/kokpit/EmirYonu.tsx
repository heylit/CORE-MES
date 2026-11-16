import { useState } from 'react';
import { Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
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

const YON_ADI = { ileri: 'İleriye', geri: 'Teslimden geriye' } as const;

// Emrin satırında tek satır durur (3304 a): bugünkü yön ve "Değiştir". Seçenekler Değiştir'le açılır; etki beklerken açık kalır.
export function EmirYonu({ c, taslak, yazabilir, emirId, no }: EmirYonuOzellikleri) {
  const { durum, dene, uygula, vazgec } = useEtki({ c, taslak, sonuc: () => undefined });
  const [acik, setAcik] = useState(false);
  const simdi = emirYonu(c, emirId), plan = planYonu(c);
  const kilitli = !yazabilir || taslak === null || durum.tur === 'hesap' || durum.tur === 'etki';
  const sec = (y: Yon) => { if (y !== simdi) void dene({ tur: 'yon', emirId, yon: y }); };
  const acikMi = acik || durum.tur === 'hesap' || durum.tur === 'etki' || durum.tur === 'hata';
  return (
    <div className="tc-pyq-emir-yon" data-ayri={simdi === 'plan' ? undefined : ''}>
      <span className="tc-pyq-emir-yon-ozet">
        <span>{simdi === 'plan' ? `Bu emir: tüm planla aynı (${YON_ADI[plan]})` : `Bu emir: ${YON_ADI[simdi]} (tüm plan: ${YON_ADI[plan]})`}</span>
        {simdi !== 'plan' && <Rozet ton="bilgi" gorunum="cizgi">Plandan ayrı</Rozet>}
        <button type="button" className="tc-pyq-kucuk" aria-expanded={acikMi} aria-label={`${no} yönünü değiştir`} disabled={!yazabilir || taslak === null} onClick={() => { setAcik(!acikMi); }}>Değiştir</button>
      </span>
      {acikMi && (
        <div className="tc-pyq-emir-yon-acik">
          <span className="tc-pyq-seg" role="group" aria-label="Bu emrin yönü">
            {(['plan', 'ileri', 'geri'] as const).map((y) => (
              <button key={y} type="button" aria-pressed={simdi === y} disabled={kilitli} onClick={() => { sec(y); }}>
                {y !== 'plan' && <Simge ad={y === 'geri' ? 'flag' : 'chev-right'} boyut="k" />}{y === 'plan' ? `Tüm planla aynı (${YON_ADI[plan]})` : YON_ADI[y]}
              </button>
            ))}
          </span>
          <p className="tc-pyq-not">
            {durum.tur === 'hesap' ? 'Hesaplanıyor' : (simdi === 'plan' ? plan : simdi) === 'geri'
              ? 'Termine yetişecek en geç saatte başlar; geriye sığmazsa ileri planlanır.' : 'İlk boş saatte başlar.'}
          </p>
          {durum.tur === 'hata' && <p className="tc-pyq-ayar-hata" role="alert">{durum.ileti}</p>}
          {durum.tur === 'etki' && <EtkiBolumu ad="Yönün etkisi" e={durum.e} uygula={() => { void uygula(durum.e); }} vazgec={() => { void vazgec(); }} />}
        </div>
      )}
    </div>
  );
}
