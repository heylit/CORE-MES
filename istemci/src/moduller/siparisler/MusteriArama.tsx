import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FirmaSecimCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { api } from '../../ortak/veri/api.ts';
import { sorguMetni } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AramaKutusu } from './AramaKutusu.tsx';
import type { SecilenFirma } from './FirmaSecici.tsx';

const TUR_ADI: Readonly<Record<string, string>> = { musteri: 'Müşteri', ikisi: 'İki yönlü' };
const firmaMetni = (f: { kod: string | null; ad: string }): string => (f.kod ? `${f.kod} · ${f.ad}` : f.ad);

interface Ozellikler {
  deger: SecilenFirma | null;
  degistir: (firma: SecilenFirma | null) => void;
  hata?: string;
}

// 3400-1: teklifte müşteri tek kutudan yazılıp listeden seçilir; firma kimlikle gider (adla eşleme yok). Yazmak seçimi bırakır.
export function MusteriArama({ deger, degistir, hata }: Ozellikler) {
  const [metin, metinYaz] = useState(deger?.ad ?? '');
  const [ara, araYaz] = useState('');
  useEffect(() => {
    const sayac = setTimeout(() => araYaz(deger !== null && metin === deger.ad ? '' : metin.trim()), 300);
    return () => clearTimeout(sayac);
  }, [metin, deger]);

  const firmalar = useQuery({
    queryKey: anahtarlar.firmaSecimi(ara),
    queryFn: () => api.get<FirmaSecimCevabi>(`/musteri-tedarikci/firmalar/secim${sorguMetni({ ara, tur: 'musteri' })}`),
  });
  const liste = firmalar.data?.firmalar ?? [];
  const not = firmalar.isError ? 'Müşteriler alınamadı.' : firmalar.isPending ? 'Aranıyor' : liste.length === 0 ? 'Eşleşen müşteri yok.' : undefined;

  return (
    <AramaKutusu
      etiket="Müşteri"
      zorunlu
      placeholder="Kod ya da ad yazın"
      metin={metin}
      yaz={(m) => { metinYaz(m); if (deger !== null) degistir(null); }}
      secenekler={liste.map((f) => ({ anahtar: String(f.id), kod: f.kod, ad: f.ad, ek: TUR_ADI[f.tur] ?? '' }))}
      sec={(s) => {
        const f = liste.find((x) => String(x.id) === s.anahtar);
        if (f === undefined) return;
        const ad = firmaMetni(f);
        metinYaz(ad);
        degistir({ id: f.id, ad });
      }}
      {...(not === undefined ? {} : { not })}
      {...(hata === undefined ? {} : { hata })}
    />
  );
}
