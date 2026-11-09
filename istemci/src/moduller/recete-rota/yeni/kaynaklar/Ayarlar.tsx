import { DurumKutusu } from '../../../../ortak/arayuz/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { Statuler } from './Statuler.tsx';

// Reçete ve Rota ayarları (2584 a): elle tanımlanan statüler burada; Malzemeler yalnız kart listesidir.
export function Ayarlar({ veri, yetki }: EkranOzellikleri) {
  if (veri.durum.statuses === undefined) {
    return <div className="tc-rr2" data-parca="R2"><DurumKutusu durum="bos" mesaj="Statü tanımları bu rolde okunamıyor." /></div>;
  }
  return <div className="tc-rr2" data-parca="R2"><Statuler durum={veri.durum} yetki={yetki} /></div>;
}
