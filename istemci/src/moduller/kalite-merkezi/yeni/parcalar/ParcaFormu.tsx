import { useBildirim } from '../../../../ortak/arayuz/index.ts';
import { AdimliForm, type FormVerisi, type KmAlan } from '../AdimliForm.tsx';
import type { ParcaOzeti } from '../kurallar.ts';
import type { Tedarikci } from '../tipler.ts';
import { useKmKomutu } from '../veri.ts';
import type { KmRolu } from '../yetki.ts';
import { parcaKimligi } from './parca.ts';

// Uygulamadaki parça formu: alanlar ve seçenekler aynı; tedarikçi listesi bugünkü gibi Kalite Merkezi'nin kendi tedarikçileridir.
export function parcaAlanlari(tedarikciler: readonly Tedarikci[]): KmAlan[] {
  return [
    { k: 'parcaNo', etiket: 'Parça no', zorunlu: true },
    { k: 'ad', etiket: 'Parça adı', genis: 'yarim' },
    { k: 'malzeme', etiket: 'Malzeme' },
    {
      k: 'tedarikci', etiket: 'Tedarikçi', tur: 'secim', genis: 'yarim',
      secenekler: [['', '— (iç üretim)'], ...tedarikciler.map((s): [string, string] => [s._id, `${s.kod ?? ''} ${s.ad ?? ''}`])],
    },
    { k: 'sinif', etiket: 'Kritiklik', tur: 'secim', secenekler: ['', 'Uçuş / emniyet kritik', 'Kritik', 'Standart'] },
    { k: 'not', etiket: 'Not', tur: 'cokSatir', genis: 'tam' },
  ];
}

interface Ozellikler {
  parca: ParcaOzeti | null;
  tedarikciler: readonly Tedarikci[];
  rol: KmRolu;
  kapat: () => void;
  kaydedildi: (parcaNo: string) => void;
}

export function ParcaFormu({ parca, tedarikciler, rol, kapat, kaydedildi }: Ozellikler) {
  const komut = useKmKomutu(rol);
  const { bildir } = useBildirim();
  const meta = parca?.meta ?? null;
  const baslik = parca ? `${parca.no} bilgileri` : 'Parça ekle';
  const alanlar = parcaAlanlari(tedarikciler);

  const kaydet = async (d: FormVerisi) => {
    const parcaNo = String(d.parcaNo ?? '').trim();
    // Kimlik parça numarasından türer: numara değişirse yeni kart yazılır, eskisi yerinde kalır (uygulamadaki gibi).
    await komut.kaydet('parca', { ...(meta ?? {}), ...d, _id: parcaKimligi(parcaNo) });
    bildir('tamam', 'Parça kaydedildi');
    kaydedildi(parcaNo);
  };

  return (
    <AdimliForm
      baslik={baslik} alanlar={alanlar} kapat={kapat} kaydet={kaydet}
      adimlar={[{ baslik: parca ? `${parca.no} bilgileri` : 'Parça ekle', alanlar: alanlar.map((a) => a.k) }]}
      ilk={{ ...(meta ?? {}), parcaNo: parca?.no ?? '', ad: parca?.ad ?? '' }}
    />
  );
}
