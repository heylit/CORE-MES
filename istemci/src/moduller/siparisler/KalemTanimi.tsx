import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MalzemeSecenekleriCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { api } from '../../ortak/veri/api.ts';
import { sorguMetni } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AramaKutusu } from './AramaKutusu.tsx';
import { miktarMetni } from './gorunum.ts';
import { kartSecimi, type SecilenKart } from './MalzemeSecici.tsx';

const TUR_ADI: Readonly<Record<string, string>> = { mamul: 'Mamul', yarimamul: 'Yarı mamul', ticari_mal: 'Ticari mal' };
const EN_AZ_HARF = 2;
const EN_COK_SONUC = 8;

interface Ozellikler {
  etiket: string;
  tanim: string;
  tanimYaz: (tanim: string) => void;
  sec: (kart: SecilenKart) => void;
  karta: boolean;
  hata?: string;
}

// 3400-1: kalem tanımına yazınca satılabilir kartlar altında açılır; seçilen kart kaleme bağlanır. Seçilmezse yazılan tanımla
// kartsız kalem kalır (siparişe dönüşmeden kart seçilir). İki harften kısa metinde aranmaz.
export function KalemTanimi({ etiket, tanim, tanimYaz, sec, karta, hata }: Ozellikler) {
  const [ara, araYaz] = useState('');
  useEffect(() => {
    const sayac = setTimeout(() => araYaz(tanim.trim()), 300);
    return () => clearTimeout(sayac);
  }, [tanim]);
  const aranir = !karta && ara.length >= EN_AZ_HARF;
  const liste = useQuery({
    queryKey: anahtarlar.malzemeArama(ara),
    queryFn: () => api.get<MalzemeSecenekleriCevabi>(`/siparisler/malzeme-secenekleri${sorguMetni({ ara })}`),
    enabled: aranir,
  });
  const satirlar = aranir ? (liste.data?.satirlar ?? []).slice(0, EN_COK_SONUC) : [];
  const not = !aranir ? undefined
    : liste.isError ? 'Kartlar alınamadı; yazdığınız tanımla devam edebilirsiniz.'
      : liste.isPending ? 'Aranıyor'
        : 'Seçmezseniz yazdığınız tanımla kartsız kalem olur; siparişe dönüşmeden kart seçilir.';

  return (
    <AramaKutusu
      etiket={etiket}
      zorunlu={!karta}
      placeholder={karta ? 'Boşsa malzeme adı yazılır' : 'Yazın: kartlar listelenir ya da tanım olarak kalır'}
      metin={tanim}
      yaz={tanimYaz}
      secenekler={satirlar.map((m) => ({
        anahtar: String(m.no),
        kod: m.kod,
        ad: m.ad ?? m.kod,
        ek: [TUR_ADI[m.tur] ?? m.tur, m.birim, m.yerlilikOrani === null ? null : `%${miktarMetni(m.yerlilikOrani)} yerli`].filter(Boolean).join(' · '),
      }))}
      sec={(s) => { const m = satirlar.find((x) => String(x.no) === s.anahtar); if (m !== undefined) sec(kartSecimi(m)); }}
      {...(not === undefined ? {} : { not })}
      {...(hata === undefined ? {} : { hata })}
    />
  );
}
