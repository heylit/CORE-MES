import { Pencere } from '../../../../ortak/arayuz/index.ts';
import { useMesaj, type AyrintiOzellikleri, type AyrintiTuru } from '../durum.tsx';
import { GorevAyrinti } from './GorevAyrinti.tsx';
import { NotYazmaAlani } from './Notlar.tsx';
import { OnayAyrinti } from './OnayAyrinti.tsx';
import { SiparisAyrinti } from './SiparisAyrinti.tsx';
import { ToplantiAyrinti } from './ToplantiAyrinti.tsx';
import './ayrinti.css';

const BASLIK: Record<AyrintiTuru, string> = { gorev: 'Görev', onay: 'Onay isteği', siparis: 'Sipariş', toplanti: 'Toplantı' };
const KOLEKSIYON: Record<AyrintiTuru, string> = { gorev: 'tasks', onay: 'approvals', siparis: 'orders', toplanti: 'toplantilar' };

// Prototipin openDetail'i: yan pencerede kayıt, altta not yazma alanı (yazma yetkisiyle).
export function AyrintiSayfasi({ tur, id, kapat }: AyrintiOzellikleri) {
  const { yetki } = useMesaj();
  return (
    <Pencere
      acik kapat={kapat} baslik={BASLIK[tur]} tur="yan"
      alt={yetki.yaz ? <NotYazmaAlani koleksiyon={KOLEKSIYON[tur]} id={id} toplanti={tur === 'toplanti'} izYaz={tur !== 'siparis'} /> : undefined}
    >
      {tur === 'gorev' ? <GorevAyrinti id={id} kapat={kapat} />
        : tur === 'onay' ? <OnayAyrinti id={id} kapat={kapat} />
          : tur === 'toplanti' ? <ToplantiAyrinti id={id} /> : <SiparisAyrinti id={id} />}
    </Pencere>
  );
}
