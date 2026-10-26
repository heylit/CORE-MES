import { useState } from 'react';
import { Dugme, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { AdimliForm, type FormVerisi, type KmAlan, type KmSorun } from '../AdimliForm.tsx';
import type { ParcaOzeti } from '../kurallar.ts';
import { useKmKomutu } from '../veri.ts';
import type { KmRolu } from '../yetki.ts';
import { MalzemeSecici } from './MalzemeSecici.tsx';
import { parcaKimligi } from './parca.ts';

// 592 B2 a: parça numarası ve adı Malzemeler kartındandır; Kalite Merkezi kartta yalnız kalite alanlarını (kritiklik, not) tutar.
export const PARCA_ALANLARI: readonly KmAlan[] = [
  { k: 'sinif', etiket: 'Kritiklik', tur: 'secim', secenekler: ['', 'Uçuş / emniyet kritik', 'Kritik', 'Standart'] },
  { k: 'not', etiket: 'Not', tur: 'cokSatir', genis: 'tam' },
];

interface Ozellikler {
  parca: ParcaOzeti | null;
  // Bağlı kartın Malzemeler'deki numarası ve adı (düzenlemede).
  kart: { kod: string; ad: string | null } | null;
  rol: KmRolu;
  kapat: () => void;
  kaydedildi: (parcaNo: string) => void;
}

const KART_YOK = 'Malzeme kartı seçin.';

export function ParcaFormu({ parca, kart, rol, kapat, kaydedildi }: Ozellikler) {
  const komut = useKmKomutu(rol);
  const { bildir } = useBildirim();
  const [secici, seciciYaz] = useState<((alan: string, deger: unknown) => void) | null>(null);
  const meta = parca?.meta ?? null;
  const baslik = parca ? `${parca.no} bilgileri` : 'Parça ekle';

  const kaydet = async (d: FormVerisi) => {
    // Formun ek denetimi kaydı durdurmaz (yalnız gösterir); kartsız yeni parça burada durur, pencere açık kalır.
    if (!parca && typeof d.malzemeNo !== 'number') { bildir('hata', KART_YOK); return; }
    // Kayıtlı parçanın numarası bağ anahtarıdır, değişmez; yeni parçada numara kartın stok kodudur.
    const parcaNo = parca?.no ?? String(d.kartKod ?? '').trim();
    const malzemeNo = typeof d.malzemeNo === 'number' ? d.malzemeNo : undefined;
    await komut.kaydet('parca', {
      ...(meta ?? {}), parcaNo, ...(malzemeNo ? { malzemeNo } : {}), sinif: String(d.sinif ?? ''), not: String(d.not ?? ''), _id: parcaKimligi(parcaNo),
    });
    bildir('tamam', 'Parça kaydedildi');
    kaydedildi(parcaNo);
  };
  const denetle = (d: FormVerisi): KmSorun[] => (!parca && typeof d.malzemeNo !== 'number' ? [{ metin: KART_YOK, adim: 0 }] : []);

  return (
    <>
      <AdimliForm
        baslik={baslik} alanlar={PARCA_ALANLARI} kapat={kapat} kaydet={kaydet} denetle={denetle}
        adimlar={[{
          baslik, alanlar: PARCA_ALANLARI.map((a) => a.k),
          icerik: (d, degistir) => {
            const kod = typeof d.kartKod === 'string' ? d.kartKod : kart?.kod;
            const ad = typeof d.kartAd === 'string' ? d.kartAd : kart?.ad;
            return (
              <div className="tc-km1-ek-bas">
                <span className="tc-km1-iki">
                  <span className="tc-km1-kod">{kod ?? KART_YOK}</span>
                  {ad && <small>{ad}</small>}
                </span>
                <Dugme simge="search" onClick={() => { seciciYaz(() => degistir); }}>{kod ? 'Kartı değiştir' : 'Kart seç'}</Dugme>
              </div>
            );
          },
        }]}
        ilk={meta ?? {}}
      />
      <MalzemeSecici
        acik={secici !== null} kapat={() => { seciciYaz(null); }}
        sec={(m) => {
          secici?.('malzemeNo', m.malzemeNo);
          secici?.('kartKod', m.kod);
          secici?.('kartAd', m.ad ?? '');
          seciciYaz(null);
        }}
      />
    </>
  );
}
