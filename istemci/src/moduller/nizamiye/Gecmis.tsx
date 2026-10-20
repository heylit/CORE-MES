import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { GecmisCevabi, Ziyaret } from '#paylasilan/sozlesme/nizamiye.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, Girdi, Rozet, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { NEDEN_ADLARI, ZIYARET_DURUM_ADLARI, adi, saat } from './gorunum.ts';
import './nizamiye.css';

const SUTUNLAR: readonly Sutun<Ziyaret>[] = [
  { anahtar: 'no', baslik: 'No', mono: true, kirilmaz: true, hucre: (z) => z.ziyaretNo },
  { anahtar: 'ad', baslik: 'Ziyaretçi', hucre: (z) => <><strong>{adi(z)}</strong>{z.firmaAdi && <span className="tc-nz-soluk"> · {z.firmaAdi}</span>}</> },
  { anahtar: 'neden', baslik: 'Neden', hucre: (z) => NEDEN_ADLARI[z.neden] },
  { anahtar: 'ev', baslik: 'Ev sahibi', hucre: (z) => z.evSahibiAd ?? '—' },
  { anahtar: 'kart', baslik: 'Kart', mono: true, hucre: (z) => z.kartNo ?? '—' },
  { anahtar: 'giris', baslik: 'Giriş', mono: true, hucre: (z) => saat(z.giris) },
  { anahtar: 'cikis', baslik: 'Çıkış', mono: true, hucre: (z) => saat(z.cikis) },
  {
    anahtar: 'durum', baslik: 'Durum',
    hucre: (z) => <Rozet ton={z.durum === 'iceride' ? 'bilgi' : z.durum === 'iptal' ? 'pasif' : 'tamam'}>{ZIYARET_DURUM_ADLARI[z.durum]}</Rozet>,
  },
];

export function Gecmis() {
  const [gun, gunYaz] = useState(() => tesisGunu(Date.now()));
  const [ara, araYaz] = useState('');
  const q = ara.trim();
  const veri = useQuery({
    queryKey: anahtarlar.gecmis(gun, q),
    queryFn: () => api.get<GecmisCevabi>(`/nizamiye/gecmis?${new URLSearchParams({ gun, ...(q === '' ? {} : { ara: q }) }).toString()}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="tc-nz">
      <div className="tc-nz-baslik-satiri">
        <h1 className="tc-nz-sayfa-baslik"><Simge ad="clock" /> Ziyaret geçmişi</h1>
        <div className="tc-nz-iki">
          <Girdi etiket="Gün" type="date" value={gun} onChange={(o) => { if (o.target.value !== '') gunYaz(o.target.value); }} />
          <Girdi etiket="Ara" type="search" placeholder="Ad, firma, plaka, kart" value={ara} onChange={(o) => araYaz(o.target.value)} />
        </div>
      </div>
      {veri.isPending && <DurumKutusu durum="yukleniyor" />}
      {veri.isError && <DurumKutusu durum="hata" yenile={() => { void veri.refetch(); }} />}
      {veri.data && (
        <Tablo etiket="Ziyaretler" sutunlar={SUTUNLAR} satirlar={veri.data.ziyaretler} satirAnahtari={(z) => z.id}
          bosMesaj="Bu gün için kayıt yok." mesgul={veri.isFetching} />
      )}
    </div>
  );
}
