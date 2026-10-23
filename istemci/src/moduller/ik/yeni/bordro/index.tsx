import { SayfaBasligi } from '../../../../ortak/arayuz/index.ts';
import type { IkEkrani } from '../gorunumler.ts';
import { HesapPaneli, MotorBekleniyor } from './Hesaplayicilar.tsx';

export { Ayarlar } from './Ayarlar.tsx';
export { Bordro } from './Bordro.tsx';
export { MaliyetPlani } from './MaliyetPlani.tsx';

export const Hesaplamalar: IkEkrani = ({ motor }) => (
  <div className="tc-ikb">
    <SayfaBasligi
      baslik="Hesaplamalar"
      simge="ruler"
      alt="Bordro, tazminat, izin ve mesai hesaplarını kontrol etmek için şablonlar. Her sonuç adım adım ve dayanak maddeleriyle gösterilir; kayıtlara dokunmaz."
    />
    {motor ? <HesapPaneli motor={motor} /> : <MotorBekleniyor />}
  </div>
);
