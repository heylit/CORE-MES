import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  AlarmlarCevabi, DuruslarCevabi, GidenCevabi, IsEmriDurumlariCevabi,
} from '#paylasilan/sozlesme/smartes.ts';
import { DurumKutusu, Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GIDEN, YOK, sayiMetni, zamanMetni } from './gosterim.ts';
import './smartes.css';

interface Sayfa<S> { satirlar: S[]; toplam: number | null; sayfa: number; sayfaBoyu: number }

// Dört liste aynı biçimdedir: salt okunur, sunucu sırasıyla (en yeni üstte), sayfalı.
function SayfaliListe<S>({ ad, yol, baslik, aciklama, sutunlar, anahtar, bos }: {
  ad: string; yol: string; baslik: string; aciklama: string; sutunlar: readonly Sutun<S>[]; anahtar: (s: S) => number; bos: string;
}) {
  const [sayfa, sayfaYaz] = useState(1);
  const liste = useQuery({
    queryKey: anahtarlar.liste(ad, sayfa),
    queryFn: () => api.get<Sayfa<S>>(`${yol}?sayfa=${sayfa}`),
    placeholderData: keepPreviousData,
  });
  return (
    <Kart baslik={baslik}>
      <div className="tc-smartes">
        <p className="tc-smartes-aciklama">{aciklama}</p>
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Liste alınamadı')} yenile={() => { void liste.refetch(); }} />}
        {liste.data && (
          <Tablo
            etiket={baslik}
            sutunlar={sutunlar}
            satirlar={liste.data.satirlar}
            satirAnahtari={anahtar}
            bosMesaj={bos}
            mesgul={liste.isFetching}
            sayfalama={{ sayfa: liste.data.sayfa, sayfaBoyu: liste.data.sayfaBoyu, toplam: liste.data.toplam, degistir: sayfaYaz }}
          />
        )}
      </div>
    </Kart>
  );
}

type UretimSatiri = IsEmriDurumlariCevabi['satirlar'][number];
const URETIM_SUTUNLARI: readonly Sutun<UretimSatiri>[] = [
  { anahtar: 'isEmriNo', baslik: 'İş emri', hucre: (s) => s.isEmriNo ?? YOK, mono: true },
  { anahtar: 'istasyon', baslik: 'İstasyon', hucre: (s) => s.istasyonKodu ?? YOK, mono: true },
  { anahtar: 'makine', baslik: 'Makine', hucre: (s) => s.makineKodu ?? YOK, mono: true },
  { anahtar: 'operasyon', baslik: 'Operasyon', hucre: (s) => s.operasyonKodu ?? YOK, mono: true },
  { anahtar: 'saglam', baslik: 'Sağlam', hucre: (s) => sayiMetni(s.saglam), hizala: 'sag', mono: true },
  { anahtar: 'red', baslik: 'Red', hucre: (s) => sayiMetni(s.red), hizala: 'sag', mono: true },
  { anahtar: 'baslangic', baslik: 'Başlangıç', hucre: (s) => zamanMetni(s.baslangic), kirilmaz: true },
  { anahtar: 'bitis', baslik: 'Bitiş', hucre: (s) => zamanMetni(s.bitis), kirilmaz: true },
];

export const UretimSayilari = () => (
  <SayfaliListe
    ad="uretim" yol="/smartes/is-emri-durumlari" baslik="Üretim sayıları"
    aciklama="SmartES’ten okunan makine gerçekleşenleri. SmartES’teki veri değiştirilmez; “aktarıldı” işaretini mevcut program koyar."
    sutunlar={URETIM_SUTUNLARI} anahtar={(s) => s.smartesId} bos="Henüz okunan kayıt yok."
  />
);

type DurusSatiri = DuruslarCevabi['satirlar'][number];
const DURUS_SUTUNLARI: readonly Sutun<DurusSatiri>[] = [
  { anahtar: 'makine', baslik: 'Makine', hucre: (s) => s.makineKodu ?? YOK, mono: true },
  { anahtar: 'neden', baslik: 'Neden kodu', hucre: (s) => s.nedenKodu ?? YOK, mono: true },
  { anahtar: 'isEmriNo', baslik: 'İş emri', hucre: (s) => s.isEmriNo ?? YOK, mono: true },
  { anahtar: 'baslangic', baslik: 'Başlangıç', hucre: (s) => zamanMetni(s.baslangic), kirilmaz: true },
  { anahtar: 'bitis', baslik: 'Bitiş', hucre: (s) => (s.bitis === null ? <Rozet ton="uyari">Sürüyor</Rozet> : zamanMetni(s.bitis)), kirilmaz: true },
];

export const Duruslar = () => (
  <SayfaliListe
    ad="durus" yol="/smartes/duruslar" baslik="Duruşlar" aciklama="SmartES’ten okunan makine duruşları."
    sutunlar={DURUS_SUTUNLARI} anahtar={(s) => s.smartesId} bos="Henüz okunan duruş yok."
  />
);

type AlarmSatiri = AlarmlarCevabi['satirlar'][number];
const ALARM_SUTUNLARI: readonly Sutun<AlarmSatiri>[] = [
  { anahtar: 'makine', baslik: 'Makine', hucre: (s) => s.makineKodu ?? YOK, mono: true },
  { anahtar: 'kod', baslik: 'Alarm kodu', hucre: (s) => s.alarmKodu ?? YOK, mono: true },
  { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (s) => s.aciklama ?? YOK },
  { anahtar: 'baslangic', baslik: 'Başlangıç', hucre: (s) => zamanMetni(s.baslangic), kirilmaz: true },
  { anahtar: 'bitis', baslik: 'Bitiş', hucre: (s) => zamanMetni(s.bitis), kirilmaz: true },
];

export const Alarmlar = () => (
  <SayfaliListe
    ad="alarm" yol="/smartes/alarmlar" baslik="Alarmlar" aciklama="SmartES’ten okunan makine alarmları."
    sutunlar={ALARM_SUTUNLARI} anahtar={(s) => s.smartesId} bos="Henüz okunan alarm yok."
  />
);

type GidenSatiri = GidenCevabi['satirlar'][number];
const GIDEN_SUTUNLARI: readonly Sutun<GidenSatiri>[] = [
  { anahtar: 'no', baslik: 'SmartES iş emri no', hucre: (s) => s.smartesIsEmriNo, mono: true },
  { anahtar: 'durum', baslik: 'Durum', hucre: (s) => <Rozet ton={GIDEN[s.durum].ton}>{GIDEN[s.durum].metin}</Rozet> },
  { anahtar: 'deneme', baslik: 'Deneme', hucre: (s) => sayiMetni(s.denemeSayisi), hizala: 'sag', mono: true },
  { anahtar: 'sonDeneme', baslik: 'Son deneme', hucre: (s) => zamanMetni(s.sonDeneme), kirilmaz: true },
  { anahtar: 'sonraki', baslik: 'Sonraki deneme', hucre: (s) => zamanMetni(s.sonrakiDeneme), kirilmaz: true },
  { anahtar: 'hata', baslik: 'Hata', hucre: (s) => s.sonHata ?? YOK },
];

export const Giden = () => (
  <SayfaliListe
    ad="giden" yol="/smartes/giden" baslik="İş emri gönderimi"
    aciklama="Planlı iş emirleri, istasyonu SmartES’te eşlenmişse SmartES’e gönderilir. Plandan düşen emir SmartES’te kapatılır, silinmez."
    sutunlar={GIDEN_SUTUNLARI} anahtar={(s) => s.isEmriId} bos="Henüz gönderilen iş emri yok."
  />
);
