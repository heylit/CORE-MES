import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AraCevabi } from '#paylasilan/sozlesme/stok.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AramaSecici } from './AramaSecici.tsx';

export interface KonumSecimi { id: number; etiket: string }

// Uzun açılır liste yerine konum kodu ya da adıyla arama; okuyucu "LOC:" önekli kodu yazıp Enter'a basınca ilk eşleşme seçilir.
// Yazmaya başlamak seçimi bırakır: alanda görünen metin her zaman seçili konumdur ya da hiçbiridir.
export function KonumSecici({ etiket, deger, degistir, zorunlu, ipucu, hata }: { etiket: string; deger: KonumSecimi | null; degistir: (k: KonumSecimi | null) => void; zorunlu?: boolean; ipucu?: string; hata?: string }) {
  const [metin, setMetin] = useState('');
  const q = metin.trim();
  const a = useQuery({ queryKey: [...anahtarlar.hepsi, 'konum-ara', q], queryFn: () => api.get<AraCevabi>(`/stok/ara?q=${encodeURIComponent(q)}`), enabled: q.length >= 1 && deger === null });
  const konumlar = deger !== null || q === '' ? [] : (a.data?.sonuclar ?? []).flatMap((x) => (x.tur === 'konum' ? [x] : []));
  const bilgi = deger !== null ? (ipucu ?? 'Değiştirmek için yazın.')
    : q === '' ? 'Konum kodunu ya da adını yazın; okutabilirsiniz.'
      : a.isPending ? 'Aranıyor…' : konumlar.length === 0 ? 'Eşleşen konum yok.' : 'Listeden konumu seçin.';
  return (
    <AramaSecici etiket={etiket} deger={metin} zorunlu={zorunlu} hata={hata} ipucu={bilgi} yerTutucu="Örn. A-01-2 ya da Kabul"
      degistir={(v) => { setMetin(v); if (deger !== null) degistir(null); }}
      secildi={(x) => { setMetin(''); degistir({ id: Number(x.deger), etiket: x.baslik }); }}
      secili={deger?.etiket ?? null}
      secenekler={konumlar.map((k) => ({ deger: String(k.konumId), baslik: k.ad ? `${k.kod} · ${k.ad}` : k.kod, alt: k.satirSayisi ? `${k.satirSayisi} stok satırı` : 'Boş' }))} />
  );
}
