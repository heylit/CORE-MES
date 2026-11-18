import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MalzemeSecenekleriCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { api } from '../../ortak/veri/api.ts';
import { sorguMetni } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AramaKutusu } from './AramaKutusu.tsx';
import { kartSecimi, type SecilenKart } from './MalzemeSecici.tsx';

const TUR_ADI: Readonly<Record<string, string>> = { mamul: 'Mamul', yarimamul: 'Yarı mamul', ticari_mal: 'Ticari mal' };
const EN_AZ_HARF = 2;
const EN_COK_SONUC = 8;
const kartMetni = (k: SecilenKart): string => (k.kod ? `${k.kod} · ${k.ad}` : k.ad);

interface Ozellikler {
  etiket: string;
  deger: SecilenKart | null;
  degistir: (kart: SecilenKart | null) => void;
  hata?: string;
}

// Sipariş kaleminin kartı tek kutudan yazılıp listeden seçilir (müşteri aramasıyla aynı); ayrı seçim penceresi yoktur.
// Sipariş kalemi kartsız olamaz ve yazılan metin kaydedilmez: kart, listeden yenisi seçilene kadar kalır (teklif kalemiyle aynı).
export function KartArama({ etiket, deger, degistir, hata }: Ozellikler) {
  const [metin, metinYaz] = useState(deger === null ? '' : kartMetni(deger));
  const [ara, araYaz] = useState('');
  useEffect(() => {
    const sayac = setTimeout(() => araYaz(deger !== null && metin === kartMetni(deger) ? '' : metin.trim()), 300);
    return () => clearTimeout(sayac);
  }, [metin, deger]);
  const aranir = ara.length >= EN_AZ_HARF;
  const liste = useQuery({
    queryKey: anahtarlar.malzemeArama(ara),
    queryFn: () => api.get<MalzemeSecenekleriCevabi>(`/siparisler/malzeme-secenekleri${sorguMetni({ ara })}`),
    enabled: aranir,
  });
  const satirlar = aranir ? (liste.data?.satirlar ?? []).slice(0, EN_COK_SONUC) : [];
  const not = !aranir ? undefined
    : liste.isError ? 'Kartlar alınamadı.'
      : liste.isPending ? 'Aranıyor'
        : satirlar.length === 0 ? 'Satılabilir kart bulunamadı.' : undefined;
  const ipucu = deger !== null
    ? (metin === kartMetni(deger) ? undefined : `Seçmezseniz ${kartMetni(deger)} kalır.`)
    : metin.trim() !== '' ? 'Listeden seçin; yazılan metin kaydedilmez.' : 'Stok kodu ya da ad yazın; yalnız mamul, yarı mamul ve ticari mal.';

  return (
    <AramaKutusu
      etiket={etiket}
      zorunlu
      placeholder="Stok kodu ya da ad"
      metin={metin}
      yaz={metinYaz}
      secenekler={satirlar.map((m) => ({
        anahtar: String(m.no), kod: m.kod, ad: m.ad ?? m.kod, ek: [TUR_ADI[m.tur] ?? m.tur, m.birim].filter(Boolean).join(' · '),
      }))}
      sec={(s) => {
        const m = satirlar.find((x) => String(x.no) === s.anahtar);
        if (m === undefined) return;
        const kart = kartSecimi(m);
        metinYaz(kartMetni(kart));
        degistir(kart);
      }}
      {...(not === undefined ? {} : { not })}
      {...(hata === undefined ? {} : { hata })}
      {...(ipucu === undefined ? {} : { ipucu })}
    />
  );
}
