import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  AlarmlarCevabi, AmbarHareketleriCevabi, DuruslarCevabi, FireHareketleriCevabi, GidenCevabi, HamKayitCevabi,
  IsEmriDurumlariCevabi, KaliteOlcumleriCevabi,
} from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, Kart, Pencere, Rozet, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GIDEN, YOK, sayiMetni, zamanMetni } from './gosterim.ts';
import './smartes.css';

interface Sayfa<S> { satirlar: S[]; toplam: number | null; sayfa: number; sayfaBoyu: number }

// Dört liste aynı biçimdedir: salt okunur, sunucu sırasıyla (en yeni üstte), sayfalı.
// SmartES satırı CORE'da ham haliyle saklanır; listede gösterilmeyen alanlar buradan okunur.
function TumAlanlar({ tur, id, kapat }: { tur: string; id: number; kapat: () => void }) {
  const ham = useQuery({ queryKey: anahtarlar.ham(tur, id), queryFn: () => api.get<HamKayitCevabi>(`/smartes/ham/${tur}/${id}`) });
  return (
    <Pencere acik tur="yan" kapat={kapat} baslik="SmartES’ten gelen tüm alanlar">
      <div className="tc-smartes">
        {ham.isPending && <DurumKutusu durum="yukleniyor" />}
        {ham.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(ham.error, 'Kayıt alınamadı')} yenile={() => { void ham.refetch(); }} />}
        {ham.data && (
          <dl className="tc-smartes-liste tc-sg-ham">
            {ham.data.alanlar.map((a) => (<div key={a.ad} className="tc-sg-ham-satir"><dt>{a.ad}</dt><dd>{a.deger ?? YOK}</dd></div>))}
          </dl>
        )}
      </div>
    </Pencere>
  );
}

function SayfaliListe<S>({ ad, yol, baslik, aciklama, sutunlar: verilen, anahtar, bos, ham = true }: {
  ad: string; yol: string; baslik: string; aciklama: string; sutunlar: readonly Sutun<S>[]; anahtar: (s: S) => number; bos: string; ham?: boolean;
}) {
  const [sayfa, sayfaYaz] = useState(1);
  const [acik, acikYaz] = useState<number | null>(null);
  const sutunlar: readonly Sutun<S>[] = ham
    ? [...verilen, {
      anahtar: 'tum', baslik: 'Tüm alanlar', csv: false,
      hucre: (s) => <Dugme simge="list" aria-label="SmartES’ten gelen tüm alanları göster" onClick={() => { acikYaz(anahtar(s)); }} />,
    }]
    : verilen;
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
        {acik !== null && <TumAlanlar tur={ad} id={acik} kapat={() => { acikYaz(null); }} />}
      </div>
    </Kart>
  );
}

type UretimSatiri = IsEmriDurumlariCevabi['satirlar'][number];
const ONAY: Record<NonNullable<UretimSatiri['onay']>, { metin: string; ton: RozetTonu }> = {
  bekliyor: { metin: 'Onay bekliyor', ton: 'uyari' }, onaylandi: { metin: 'Onaylandı', ton: 'tamam' }, reddedildi: { metin: 'Reddedildi', ton: 'hata' },
};
const URETIM_SUTUNLARI: readonly Sutun<UretimSatiri>[] = [
  { anahtar: 'isEmriNo', baslik: 'İş emri', hucre: (s) => s.isEmriNo ?? YOK, mono: true },
  { anahtar: 'istasyon', baslik: 'İstasyon', hucre: (s) => s.istasyonKodu ?? YOK, mono: true },
  { anahtar: 'makine', baslik: 'Makine', hucre: (s) => s.makineKodu ?? YOK, mono: true },
  { anahtar: 'operasyon', baslik: 'Operasyon', hucre: (s) => s.operasyonKodu ?? YOK, mono: true },
  { anahtar: 'saglam', baslik: 'Sağlam', hucre: (s) => sayiMetni(s.saglam), hizala: 'sag', mono: true },
  { anahtar: 'red', baslik: 'Red', hucre: (s) => sayiMetni(s.red), hizala: 'sag', mono: true },
  { anahtar: 'baslangic', baslik: 'Başlangıç', hucre: (s) => zamanMetni(s.baslangic), kirilmaz: true },
  { anahtar: 'bitis', baslik: 'Bitiş', hucre: (s) => zamanMetni(s.bitis), kirilmaz: true },
  { anahtar: 'onay', baslik: 'CORE’a', hucre: (s) => (s.onay == null ? <span className="tc-sm-not">Aktarılmaz</span> : <Rozet ton={ONAY[s.onay].ton}>{ONAY[s.onay].metin}</Rozet>) },
];

export const UretimSayilari = () => (
  <SayfaliListe
    ad="uretim" yol="/smartes/is-emri-durumlari" baslik="Üretim sayıları"
    aciklama="SmartES’ten okunan makine gerçekleşenleri. Sayım kaynağı SmartES olan istasyonun sağlam adedi “Onay bekliyor”a düşer ve onaylanınca üretim emrine işlenir; terminalden sayılan istasyonun satırı yalnız burada durur. SmartES’teki veri değiştirilmez."
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
    sutunlar={GIDEN_SUTUNLARI} anahtar={(s) => s.isEmriId} bos="Henüz gönderilen iş emri yok." ham={false}
  />
);

type FireSatiri = FireHareketleriCevabi['satirlar'][number];
const FIRE_SUTUNLARI: readonly Sutun<FireSatiri>[] = [
  { anahtar: 'isEmriNo', baslik: 'İş emri', hucre: (s) => s.isEmriNo ?? YOK, mono: true },
  { anahtar: 'yer', baslik: 'İstasyon · makine', hucre: (s) => `${s.istasyonKodu ?? YOK} · ${s.makineKodu ?? YOK}`, mono: true },
  { anahtar: 'neden', baslik: 'Fire adı', hucre: (s) => s.neden ?? YOK },
  { anahtar: 'adet', baslik: 'Adet', hucre: (s) => sayiMetni(s.adet), hizala: 'sag', mono: true },
  { anahtar: 'zaman', baslik: 'Zaman', hucre: (s) => zamanMetni(s.zaman), kirilmaz: true },
];

export const FireHareketleri = () => (
  <SayfaliListe
    ad="fire" yol="/smartes/fire" baslik="Fire kayıtları"
    aciklama="SmartES’te girilen fire kayıtları. Fire adının CORE’daki karşılığı Kod eşlemeleri > Fire’den verilir."
    sutunlar={FIRE_SUTUNLARI} anahtar={(s) => s.smartesId} bos="Henüz okunan fire kaydı yok."
  />
);

type AmbarSatiri = AmbarHareketleriCevabi['satirlar'][number];
const AMBAR_SUTUNLARI: readonly Sutun<AmbarSatiri>[] = [
  { anahtar: 'isEmriNo', baslik: 'İş emri', hucre: (s) => s.isEmriNo ?? YOK, mono: true },
  { anahtar: 'stokNo', baslik: 'Stok', hucre: (s) => s.stokNo ?? YOK, mono: true },
  { anahtar: 'ambar', baslik: 'Ambar', hucre: (s) => s.ambarKodu ?? YOK, mono: true },
  { anahtar: 'tur', baslik: 'Hareket', hucre: (s) => s.hareketTuru ?? YOK },
  { anahtar: 'miktar', baslik: 'Miktar', hucre: (s) => sayiMetni(s.miktar), hizala: 'sag', mono: true },
  { anahtar: 'zaman', baslik: 'Zaman', hucre: (s) => zamanMetni(s.zaman), kirilmaz: true },
];

export const AmbarHareketleri = () => (
  <SayfaliListe
    ad="ambar" yol="/smartes/ambar" baslik="Ambar hareketleri"
    aciklama="SmartES’te girilen ambar hareketleri. Yalnız gösterilir; CORE stoğuna yazılmaz."
    sutunlar={AMBAR_SUTUNLARI} anahtar={(s) => s.smartesId} bos="Henüz okunan ambar hareketi yok."
  />
);

type KaliteSatiri = KaliteOlcumleriCevabi['satirlar'][number];
const KALITE_SUTUNLARI: readonly Sutun<KaliteSatiri>[] = [
  { anahtar: 'isEmriNo', baslik: 'İş emri', hucre: (s) => s.isEmriNo ?? YOK, mono: true },
  { anahtar: 'yer', baslik: 'İstasyon · makine', hucre: (s) => `${s.istasyonKodu ?? YOK} · ${s.makineKodu ?? YOK}`, mono: true },
  { anahtar: 'olcum', baslik: 'Ölçüm', hucre: (s) => s.olcumAdi ?? YOK },
  { anahtar: 'deger', baslik: 'Değer', hucre: (s) => s.olcumDegeri ?? YOK, hizala: 'sag', mono: true },
  { anahtar: 'sonuc', baslik: 'Sonuç', hucre: (s) => s.sonuc ?? YOK },
  { anahtar: 'zaman', baslik: 'Zaman', hucre: (s) => zamanMetni(s.zaman), kirilmaz: true },
];

export const KaliteOlcumleri = () => (
  <SayfaliListe
    ad="kalite" yol="/smartes/kalite" baslik="Kalite ölçümleri"
    aciklama="SmartES’te girilen kalite kontrol ölçümleri. Yalnız gösterilir; CORE kalite kayıtlarına yazılmaz."
    sutunlar={KALITE_SUTUNLARI} anahtar={(s) => s.smartesId} bos="Henüz okunan ölçüm yok."
  />
);
