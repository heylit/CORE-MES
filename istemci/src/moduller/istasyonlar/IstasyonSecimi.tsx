import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { IstasyonSecimiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

interface Ozellikler {
  etiket?: string;
  deger: number | null;
  degistir: (istasyonId: number | null) => void;
  // İşte istasyon tanımsızsa (deger null) "Tanımsız istasyon" gösterilir; seçim yine de yapılabilir.
  tanimsizGoster?: boolean;
  disabled?: boolean;
}

export const TANIMSIZ_ISTASYON = 'Tanımsız istasyon';

// Sunucu listeyi süzer: pasif istasyon yoktur, iş merkezi kısıtlı kişi yalnız kendi iş merkezlerini görür.
export function IstasyonSecimi({ etiket = 'İstasyon', deger, degistir, tanimsizGoster = false, disabled }: Ozellikler) {
  const kimlik = useId();
  const secim = useQuery({
    queryKey: anahtarlar.secim,
    queryFn: () => api.get<IstasyonSecimiCevabi>('/istasyonlar/secim'),
  });
  const gruplar = secim.data?.gruplar ?? [];
  // Seçili istasyon listede yoksa (pasife alınmış ya da izin dışı) boş görünmesin: kimliğiyle gösterilir.
  const listede = gruplar.some((g) => g.istasyonlar.some((i) => i.id === deger));

  return (
    <div className="tc-alan">
      <label className="tc-alan-etiket" htmlFor={kimlik}>{etiket}</label>
      <select
        id={kimlik}
        className="tc-alan-kutu"
        value={deger === null ? '' : String(deger)}
        disabled={disabled || secim.isPending}
        onChange={(o) => degistir(o.target.value === '' ? null : Number(o.target.value))}
      >
        {(deger === null && tanimsizGoster)
          ? <option value="">{TANIMSIZ_ISTASYON}</option>
          : <option value="">Seçiniz</option>}
        {deger !== null && !listede && !secim.isPending && <option value={String(deger)}>{`İstasyon ${deger} (listede yok)`}</option>}
        {gruplar.map((g) => (
          <optgroup key={g.isMerkeziId} label={`${g.isMerkeziKod} - ${g.isMerkeziAd}`}>
            {g.istasyonlar.map((i) => <option key={i.id} value={String(i.id)}>{`${i.kod} - ${i.ad}`}</option>)}
          </optgroup>
        ))}
      </select>
      {secim.isError && <p className="tc-alan-alt tc-ist-hata" role="alert">İstasyon listesi alınamadı.</p>}
    </div>
  );
}
