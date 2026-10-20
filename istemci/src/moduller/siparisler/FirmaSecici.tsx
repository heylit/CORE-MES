import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FirmaSecimCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { Girdi, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { sorguMetni } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';

export interface SecilenFirma {
  id: number;
  ad: string;
}

interface Ozellikler {
  etiket: string;
  deger: SecilenFirma | null;
  degistir: (firma: SecilenFirma | null) => void;
  hata?: string;
  zorunlu?: boolean;
  bosSecenek?: string;
}

// Firma, müşteri-tedarikçi kartından kimlikle seçilir (adla eşleme yok): müşteri ve iki yönlü firmalar gelir.
export function FirmaSecici({ etiket, deger, degistir, hata, zorunlu = false, bosSecenek = 'Firma seçin' }: Ozellikler) {
  const [yazilan, yazilanYaz] = useState('');
  const [ara, araYaz] = useState('');
  useEffect(() => {
    const sayac = setTimeout(() => araYaz(yazilan.trim()), 300);
    return () => clearTimeout(sayac);
  }, [yazilan]);

  const firmalar = useQuery({
    queryKey: anahtarlar.firmaSecimi(ara),
    queryFn: () => api.get<FirmaSecimCevabi>(`/musteri-tedarikci/firmalar/secim${sorguMetni({ ara, tur: 'musteri' })}`),
  });

  const secenekler = (firmalar.data?.firmalar ?? []).map((f) => ({ deger: String(f.id), baslik: f.kod ? `${f.kod} · ${f.ad}` : f.ad }));
  // Aramada düşen seçili firma listeden kaybolup seçimi sıfırlamasın.
  if (deger !== null && !secenekler.some((s) => s.deger === String(deger.id))) secenekler.unshift({ deger: String(deger.id), baslik: deger.ad });

  return (
    <div className="tc-sp-secici">
      <Girdi
        etiket={`${etiket} ara`}
        type="search"
        placeholder="Kod ya da ad"
        value={yazilan}
        onChange={(o) => yazilanYaz(o.target.value)}
        autoComplete="off"
      />
      <Secim
        etiket={etiket}
        required={zorunlu}
        bosSecenek={firmalar.isError ? 'Firmalar alınamadı' : bosSecenek}
        secenekler={secenekler}
        value={deger === null ? '' : String(deger.id)}
        onChange={(o) => {
          const secilen = secenekler.find((s) => s.deger === o.target.value);
          degistir(secilen ? { id: Number(secilen.deger), ad: secilen.baslik } : null);
        }}
        {...(hata === undefined ? {} : { hata })}
      />
    </div>
  );
}
