import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MalzemeSecenegi, MalzemeSecenekleriCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { api } from '../../ortak/veri/api.ts';
import { sorguMetni } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AramaKutusu } from './AramaKutusu.tsx';
import { kartSecimi, type SecilenKart } from './MalzemeSecici.tsx';

const TUR_ADI: Readonly<Record<string, string>> = { mamul: 'Mamul', yarimamul: 'Yarı mamul', ticari_mal: 'Ticari mal' };
const EN_AZ_HARF = 2;
const EN_COK_SONUC = 8;
const kartMetni = (k: SecilenKart): string => (k.kod ? `${k.kod} · ${k.ad}` : k.ad);
const revizyonEki = (m: MalzemeSecenegi): string | null =>
  m.revizyon === null ? null : `${m.revizyon.etiket ?? 'Revizyon'}${m.revizyon.yururlukte ? '' : ' (yürürlükte değil)'}`;

interface Ozellikler {
  etiket: string;
  deger: SecilenKart | null;
  // `eski`: kullanıcının seçtiği, yürürlükte olmayan revizyon; seçim ailenin yürürlükteki kartına yönlendiyse dolu (3438 a).
  degistir: (kart: SecilenKart | null, eski?: SecilenKart) => void;
  hata?: string;
}

const secenekleriAl = (ara: string) => api.get<MalzemeSecenekleriCevabi>(`/siparisler/malzeme-secenekleri${sorguMetni({ ara })}`);

// 3438 a: yürürlükte olmayan revizyon seçilince ailenin yürürlükteki kartı aranır; bulunamazsa seçilen kart kalır.
export async function yururluktekiSecenek(m: MalzemeSecenegi, al: (ara: string) => Promise<MalzemeSecenekleriCevabi>): Promise<MalzemeSecenegi | null> {
  if (m.revizyon === null || m.revizyon.yururlukte) return null;
  const no = m.revizyon.yururluktekiNo;
  return (await al(m.revizyon.yururluktekiKodu)).satirlar.find((x) => x.no === no) ?? null;
}

// Sipariş kaleminin kartı tek kutudan yazılıp listeden seçilir (müşteri aramasıyla aynı); ayrı seçim penceresi yoktur.
// Sipariş kalemi kartsız olamaz ve yazılan metin kaydedilmez: kart, listeden yenisi seçilene kadar kalır (teklif kalemiyle aynı).
export function KartArama({ etiket, deger, degistir, hata }: Ozellikler) {
  const [metin, metinYaz] = useState(deger === null ? '' : kartMetni(deger));
  // Kart dışarıdan değişirse ("Eski revizyonu kullan") kutudaki metin de o karta döner; yoksa kutu eski seçimi gösterir.
  const [gosterilenNo, gosterilenNoYaz] = useState(deger?.no ?? null);
  if ((deger?.no ?? null) !== gosterilenNo) {
    gosterilenNoYaz(deger?.no ?? null);
    metinYaz(deger === null ? '' : kartMetni(deger));
  }
  const [ara, araYaz] = useState('');
  useEffect(() => {
    const sayac = setTimeout(() => araYaz(deger !== null && metin === kartMetni(deger) ? '' : metin.trim()), 300);
    return () => clearTimeout(sayac);
  }, [metin, deger]);
  const aranir = ara.length >= EN_AZ_HARF;
  const istemci = useQueryClient();
  // Yönlendirme yanıtı sonradan gelir: o anki form değeri ve geri çağırma kullanılır; kullanıcı arada başka kart seçtiyse yönlenmez.
  const son = useRef({ deger, degistir });
  son.current = { deger, degistir };
  const liste = useQuery({
    queryKey: anahtarlar.malzemeArama(ara),
    queryFn: () => secenekleriAl(ara),
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
        anahtar: String(m.no), kod: m.kod, ad: m.ad ?? m.kod,
        ek: [TUR_ADI[m.tur] ?? m.tur, m.birim, revizyonEki(m)].filter(Boolean).join(' · '),
      }))}
      sec={(s) => {
        const m = satirlar.find((x) => String(x.no) === s.anahtar);
        if (m === undefined) return;
        const kart = kartSecimi(m);
        metinYaz(kartMetni(kart));
        degistir(kart);
        void yururluktekiSecenek(m, (a) => istemci.fetchQuery({ queryKey: anahtarlar.malzemeArama(a), queryFn: () => secenekleriAl(a) }))
          .then((y) => {
            if (y === null || son.current.deger?.no !== kart.no) return;
            const yeni = kartSecimi(y);
            metinYaz(kartMetni(yeni));
            son.current.degistir(yeni, kart);
          })
          .catch(() => undefined);
      }}
      {...(not === undefined ? {} : { not })}
      {...(hata === undefined ? {} : { hata })}
      {...(ipucu === undefined ? {} : { ipucu })}
    />
  );
}
