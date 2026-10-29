import { useEffect, useState } from 'react';
import type { Tur } from '#paylasilan/sozlesme/kalibrasyon.ts';
import { Dugme, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { AletTuru } from './alet-simgeleri.tsx';
import { TurFormu } from './formlar.tsx';

const SUTUNLAR: Sutun<Tur>[] = [
  { anahtar: 'ad', baslik: 'Tür', hucre: (t) => <AletTuru tur={t.ad} /> },
  { anahtar: 'alet', baslik: 'Alet sayısı', hucre: (t) => t.aletSayisi, hizala: 'sag', mono: true },
  { anahtar: 'durum', baslik: 'Durum', hucre: (t) => <Rozet ton={t.aktif ? 'tamam' : 'pasif'}>{t.aktif ? 'Aktif' : 'Pasif'}</Rozet> },
];

export function Turler({ turler, yazabilir, yeni = false, yeniKapandi }: {
  turler: readonly Tur[]; yazabilir: boolean; yeni?: boolean; yeniKapandi?: () => void;
}) {
  // undefined: form kapalı; null: yeni tür.
  const [form, formYaz] = useState<Tur | null | undefined>(undefined);
  // Adresle açılan yeni tür formu (Ctrl K komutu, `komutlar.ts`).
  useEffect(() => { if (yeni && yazabilir) formYaz(null); }, [yeni, yazabilir]);
  return (
    <>
      {yazabilir && (
        <div className="tc-kal-arac">
          <Dugme simge="plus" onClick={() => { formYaz(null); }}>Tür ekle</Dugme>
        </div>
      )}
      <Tablo
        etiket="Alet türleri"
        sutunlar={SUTUNLAR}
        satirlar={turler}
        satirAnahtari={(t) => t.id}
        satirSec={yazabilir ? (t) => { formYaz(t); } : undefined}
        bosMesaj="Alet türü yok"
      />
      {form !== undefined && <TurFormu tur={form} kapat={() => { formYaz(undefined); yeniKapandi?.(); }} />}
    </>
  );
}
