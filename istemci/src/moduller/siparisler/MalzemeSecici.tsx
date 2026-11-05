import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MalzemeSecenegi, MalzemeSecenekleriCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { DurumKutusu, Girdi, Pencere, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';

export interface SecilenKart {
  no: number;
  kod: string | null;
  ad: string;
  birim: string | null;
  aciklamalar: readonly string[];
}

// 2120: satırda kartın adı, altında Açıklama 1-3; ad yoksa tire, açıklama yoksa ikinci satır çizilmez.
export function KalemMetni({ ad, aciklamalar }: { ad: string | null; aciklamalar: readonly string[] }) {
  return (
    <span className="tc-sp-kalem">
      <span>{ad ?? '—'}</span>
      {aciklamalar.length > 0 && <span className="tc-sp-kalem-ac">{aciklamalar.join(' · ')}</span>}
    </span>
  );
}

export const secilenKartMetni = (k: SecilenKart): string =>
  [`${k.kod ?? ''} ${k.ad}${k.birim ? ` (${k.birim})` : ''}`.trim(), ...k.aciklamalar].join(' · ');


// Sunucu yalnız aktif mamul, yarı mamul ve ticari mal kartlarını verir (SIP-02).
const SUTUNLAR: readonly Sutun<MalzemeSecenegi>[] = [
  { anahtar: 'kod', baslik: 'Stok kodu', mono: true, kirilmaz: true, hucre: (m) => m.kod },
  { anahtar: 'ad', baslik: 'Ad', hucre: (m) => <KalemMetni ad={m.ad} aciklamalar={m.aciklamalar} /> },
  { anahtar: 'birim', baslik: 'Birim', hucre: (m) => m.birim ?? '—' },
];

interface Ozellikler {
  acik: boolean;
  kapat: () => void;
  sec: (kart: SecilenKart) => void;
}

// Kart seçimi malzemeler modülünün aramasını çağıran ortak arama ucundan yapılır; yalnız kullanımdaki kartlar gelir.
export function MalzemeSecici({ acik, kapat, sec }: Ozellikler) {
  const [metin, metinYaz] = useState('');
  const q = metin.trim();
  const liste = useQuery({
    queryKey: anahtarlar.malzemeArama(q),
    queryFn: () => api.get<MalzemeSecenekleriCevabi>(`/siparisler/malzeme-secenekleri${sorguMetni({ ara: q })}`),
    enabled: acik,
  });
  const satirlar = liste.data?.satirlar ?? [];

  return (
    <Pencere acik={acik} kapat={kapat} baslik="Malzeme kartı seç" tur="yan">
      <div className="tc-sp-yigin">
        <Girdi etiket="Kart ara" type="search" value={metin} onChange={(o) => metinYaz(o.target.value)} placeholder="Stok kodu ya da ad" autoComplete="off" />
        <p className="tc-sp-ipucu">Yalnız mamul, yarı mamul ve ticari mal kartları satılır.</p>
        {liste.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Kartlar alınamadı')} yenile={() => { void liste.refetch(); }} />
        ) : (
          <Tablo
            etiket="Malzeme kartları"
            sutunlar={SUTUNLAR}
            satirlar={satirlar}
            satirAnahtari={(m) => m.no}
            satirSec={(m) => sec({ no: m.no, kod: m.kod, ad: m.ad ?? m.kod, birim: m.birim, aciklamalar: m.aciklamalar })}
            mesgul={liste.isPending}
            bosMesaj={liste.isPending ? 'Yükleniyor' : 'Satılabilir kart bulunamadı.'}
          />
        )}
      </div>
    </Pencere>
  );
}
