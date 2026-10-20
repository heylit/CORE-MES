import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MalzemeAraCevabi, UrunOzeti as MalzemeOzeti } from '#paylasilan/sozlesme/rota.ts';

type MalzemeTuru = 'hammadde' | 'yarimamul' | 'mamul' | 'sarf' | 'demirbas';
import { DurumKutusu, Girdi, Pencere, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

const SUTUNLAR: readonly Sutun<MalzemeOzeti>[] = [
  { anahtar: 'kod', baslik: 'Stok kodu', mono: true, kirilmaz: true, hucre: (m) => m.stokKodu },
  { anahtar: 'ad', baslik: 'Ad', hucre: (m) => m.ad },
  { anahtar: 'birim', baslik: 'Birim', hucre: (m) => m.stokBirimi ?? '' },
];

interface Ozellikler {
  acik: boolean;
  baslik: string;
  // Verilmezse bütün türler (hammadde, sarf, mamul) aranır; rota kökü mamul ya da yarı mamuldür.
  tur?: MalzemeTuru | 'mamul,yarimamul';
  // Listeden çıkarılan kart: rotası düzenlenen ya da kopyalanan ürünün kendisi.
  haric?: number | null;
  kapat: () => void;
  sec: (m: MalzemeOzeti) => void;
}

// Kart seçimi rota modülünün arama ucundan yapılır (malzemeler modülünün aramasını çağırır); yalnız kullanımdaki kartlar gelir.
export function MalzemeSecici({ acik, baslik, tur, haric, kapat, sec }: Ozellikler) {
  const [metin, metinYaz] = useState('');
  const sorgu = new URLSearchParams({ ...(tur ? { tur } : {}), ...(metin.trim() ? { metin: metin.trim() } : {}) });
  const liste = useQuery({
    queryKey: anahtarlar.malzemeArama(tur ?? 'hepsi', metin.trim()),
    queryFn: () => api.get<MalzemeAraCevabi>(`/rota/malzeme-ara?${sorgu.toString()}`),
    enabled: acik,
  });
  return (
    <Pencere acik={acik} kapat={kapat} baslik={baslik} tur="yan">
      <div className="tc-rota-yigin">
        <Girdi etiket="Ara" type="search" value={metin} onChange={(e) => metinYaz(e.target.value)} placeholder="Stok kodu ya da ad" />
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />}
        {liste.data && (
          <Tablo etiket="Kartlar" sutunlar={SUTUNLAR} satirlar={liste.data.satirlar.filter((m) => m.id !== haric)} satirAnahtari={(m) => m.id} satirSec={sec} bosMesaj="Kart bulunamadı" />
        )}
      </div>
    </Pencere>
  );
}
