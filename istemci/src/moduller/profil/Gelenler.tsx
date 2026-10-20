import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { GeriBildirimListeCevabi } from '#paylasilan/sozlesme/profil.ts';
import { DurumKutusu, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KONU_ADI, KONULAR, TUR_ADI, TURLER, zamanMetni } from './gorunum.ts';
import './profil.css';

type Satir = GeriBildirimListeCevabi['satirlar'][number];

const SUTUNLAR: readonly Sutun<Satir>[] = [
  { anahtar: 'gonderildi', baslik: 'Zaman', kirilmaz: true, hucre: (s) => zamanMetni(s.gonderildi) },
  { anahtar: 'kisi', baslik: 'Yazan', hucre: (s) => s.kisiAdi },
  { anahtar: 'tur', baslik: 'Tür', hucre: (s) => <Rozet ton={s.tur === 'sikayet' ? 'hata' : s.tur === 'istek' ? 'bilgi' : 'tamam'}>{TUR_ADI[s.tur]}</Rozet> },
  { anahtar: 'konu', baslik: 'Konu', hucre: (s) => KONU_ADI[s.konu] },
  { anahtar: 'metin', baslik: 'Yazı', hucre: (s) => <span className="tc-profil-gb-metin">{s.metin}</span> },
];

// Çalışanların yazdıkları, yazanın adıyla; yalnız profil.geri-bildirim-oku sahibi okur (yetki uçtadır).
export function Gelenler() {
  const [sayfa, sayfaYaz] = useState(1);
  const [konu, konuYaz] = useState('');
  const [tur, turYaz] = useState('');
  const sorgu = useQuery({
    queryKey: anahtarlar.gelenler(sayfa, konu, tur),
    queryFn: () => {
      const q = new URLSearchParams({ sayfa: String(sayfa) });
      if (konu) q.set('konu', konu);
      if (tur) q.set('tur', tur);
      return api.get<GeriBildirimListeCevabi>(`/profil/geri-bildirimler?${q.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
  if (sorgu.isError && sorgu.error instanceof ApiHatasi && sorgu.error.durum === 403) {
    return <DurumKutusu durum="bos" mesaj="Bu listeyi görme yetkiniz yok." />;
  }
  return (
    <div className="tc-profil">
      <div className="tc-profil-suzgec">
        <Secim etiket="Konu" value={konu} bosSecenek="Hepsi" onChange={(o) => { konuYaz(o.target.value); sayfaYaz(1); }}
          secenekler={KONULAR.map((k) => ({ deger: k, baslik: KONU_ADI[k] }))} />
        <Secim etiket="Tür" value={tur} bosSecenek="Hepsi" onChange={(o) => { turYaz(o.target.value); sayfaYaz(1); }}
          secenekler={TURLER.map((t) => ({ deger: t, baslik: TUR_ADI[t] }))} />
      </div>
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />
          : (
            <Tablo
              etiket="Gelen şikayet, istek ve öneriler"
              sutunlar={SUTUNLAR}
              satirlar={sorgu.data.satirlar}
              satirAnahtari={(s) => s.id}
              bosMesaj="Henüz gelen yok"
              mesgul={sorgu.isPlaceholderData}
              sayfalama={{ sayfa: sorgu.data.sayfa, sayfaBoyu: sorgu.data.sayfaBoyu, toplam: sorgu.data.toplam, degistir: sayfaYaz }}
            />
          )}
    </div>
  );
}
