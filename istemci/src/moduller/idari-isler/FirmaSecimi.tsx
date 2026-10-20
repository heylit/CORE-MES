import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FirmaSecenekleriCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { Girdi, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { sorguMetni } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';

export interface SecilenFirma { id: number; ad: string }

// Kontrol, atık ve sözleşme firması: adı yazılır, etkin tedarikçilerden seçilir. Boş bırakılabilir.
export function FirmaSecimi({ deger, degistir }: { deger: SecilenFirma | null; degistir: (f: SecilenFirma | null) => void }) {
  const [ara, araYaz] = useState('');
  const [gecikmeli, gecikmeliYaz] = useState('');
  useEffect(() => {
    const s = setTimeout(() => gecikmeliYaz(ara.trim()), 300);
    return () => clearTimeout(s);
  }, [ara]);
  const firmalar = useQuery({
    queryKey: anahtarlar.firmalar(gecikmeli),
    queryFn: () => api.get<FirmaSecenekleriCevabi>(`/idari-isler/firma-secenekleri${sorguMetni({ ara: gecikmeli })}`),
  });
  const secenekler = [
    ...(deger !== null && !(firmalar.data?.firmalar ?? []).some((f) => f.id === deger.id) ? [deger] : []),
    ...(firmalar.data?.firmalar ?? []),
  ].map((f) => ({ deger: String(f.id), baslik: f.ad }));
  return (
    <div className="tc-ii-firma">
      <Girdi etiket="Firma ara" type="search" placeholder="Firma adı" value={ara} onChange={(o) => araYaz(o.target.value)} autoComplete="off" />
      <Secim
        etiket="Firma"
        bosSecenek="Firma yok"
        value={deger === null ? '' : String(deger.id)}
        secenekler={secenekler}
        onChange={(o) => {
          const id = Number(o.target.value);
          const f = [...(deger ? [deger] : []), ...(firmalar.data?.firmalar ?? [])].find((x) => x.id === id);
          degistir(f === undefined ? null : { id: f.id, ad: f.ad });
        }}
      />
    </div>
  );
}
