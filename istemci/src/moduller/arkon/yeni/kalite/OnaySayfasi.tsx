import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Pkg } from '../../../../../../arkon/shared/model.ts';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { bip } from '../cekirdek/ses.ts';
import { useArkon } from '../veri/baglam.ts';
import { Cip, SayfaCercevesi, onayBekliyor, useSoyle } from '../pano/index.tsx';
import { Onaylar } from './Onaylar.tsx';

// Hazırlık menüsünde Kalite yalnız paket onayıdır: numune, ölçüm ve SPC Kalite Merkezi'nde, ölçü aletleri Kalibrasyon'dadır.
// "Kaliteye onay" kuralı kapalıyken onay istenmez; adres doğrudan açılırsa boş liste yerine bunu söyler.
export function OnaySayfasi() {
  const { depo, ayarlar } = useArkon();
  const soyle = useSoyle();
  const kaliteMerkezi = useYetki().var('sayfa.kalite-merkezi');
  const [pkgs, pkgsYaz] = useState<Record<string, Pkg>>({});

  const reload = useCallback(async () => {
    const ps = (await depo.DB.all('pkgs')) as Pkg[];
    pkgsYaz(Object.fromEntries(ps.map((p) => [p.id, p])));
  }, [depo]);
  useEffect(() => {
    void reload();
    return depo.Bus.on((m) => {
      if (m.type === 'pkg-approval' || m.type === 'pkg-approved' || m.type === 'pkg') {
        void reload();
        if (m.type === 'pkg-approval') { bip('call'); soyle(`Onay bekleyen paket: ${String(m.no ?? '')}`, 'bilgi'); }
      }
    });
  }, [depo, reload, soyle]);

  const bekleyen = Object.values(pkgs).filter(onayBekliyor).length;
  const kmBag = kaliteMerkezi ? <> · <Link to="/kalite-merkezi">Kalite Merkezi'ni aç</Link></> : null;
  return (
    <SayfaCercevesi simge="check" baslik="Kalite onayları" renk="done" ek={bekleyen > 0 ? <Cip renk="hold">{bekleyen} onay bekliyor</Cip> : undefined}>
      {ayarlar.kurallar.approval || bekleyen > 0 ? <Onaylar paketler={pkgs} soyle={soyle} /> : (
        <p className="tc-ay3-not" role="note"><Simge ad="check" /> Kaliteye onay kuralı kapalı: iş paketi kalite onayı beklemeden terminale gönderilir.</p>
      )}
      <p className="tc-ay3-not" role="note"><Simge ad="target" /> Numune, ölçüm ve ilk parça kararı Kalite Merkezi'ndedir{kmBag}</p>
    </SayfaCercevesi>
  );
}
