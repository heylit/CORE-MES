import { Simge } from '../../../../ortak/arayuz/index.ts';
import { useMesaj } from '../durum.tsx';
import { teslimEtiketi } from '../kurallar.ts';
import { DurumRozeti, KisiRozeti } from '../ortak/index.ts';
import type { Gorev, Kayit } from '../tipler.ts';
import { durumDegistirebilir, useIsEylemleri } from './eylemler.ts';
import { SiparisCipi, TeslimEtiketi } from './parcalar.tsx';
import './kartlar.css';

// Prototipin taskRow'u: satıra dokununca ayrıntı açılır; daire düğmesi bitirir ya da geri alır.
export function GorevSatiri({ gorev: t, siparissiz }: { gorev: Kayit<Gorev>; siparissiz?: boolean }) {
  const { ben, ilkAd, yetki, ayrintiAc } = useMesaj();
  const { gorevDurumu } = useIsEylemleri();
  const bitti = t.status === 'done';
  const benim = t.to === ben.id;
  const kim = benim ? (t.by && t.by !== ben.id ? `Veren: ${ilkAd(t.by)}` : 'Kendine') : (t.to ? ilkAd(t.to) : 'Atanmamış');
  const isaretleyebilir = durumDegistirebilir(t, yetki, ben.id);
  const ac = () => ayrintiAc({ tur: 'gorev', id: t.id });
  return (
    <div className={`tc-mi-satir${bitti ? ' tc-mi-bitti' : ''}`} onClick={ac}>
      <button
        type="button" className="tc-mi-tik" aria-pressed={bitti} disabled={!isaretleyebilir}
        aria-label={bitti ? 'Tamamlanmadı yap' : 'Bitti olarak işaretle'}
        onClick={(o) => { o.stopPropagation(); gorevDurumu(t.id, bitti ? 'todo' : 'done'); }}
      >
        <Simge ad="check" />
      </button>
      <div className="tc-mi-govde">
        <button type="button" className="tc-mi-baslik" onClick={(o) => { o.stopPropagation(); ac(); }}>{t.title}</button>
        <div className="tc-mi-ust">
          {!benim && t.to && <KisiRozeti id={t.to} boyut="s" />}
          <span>{kim}</span>
          {!bitti && <TeslimEtiketi etiket={teslimEtiketi(t.due, Date.now())} />}
          {t.status === 'doing' && <DurumRozeti tur="gorev" durum="doing" />}
          {!siparissiz && <SiparisCipi siparisId={t.orderId ?? null} />}
        </div>
      </div>
    </div>
  );
}
