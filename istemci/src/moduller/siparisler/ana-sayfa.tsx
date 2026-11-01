import { useQuery } from '@tanstack/react-query';
import type { SiparisOzetiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { GrafikKarti } from '../../ortak/arayuz/GrafikKarti.tsx';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Gün sayısı sunucudaki YAKLASAN_TERMIN_GUN ile aynıdır; istemci sözleşmeden değer ithal etmez.
// Dört kart sunucunun saydığı tek özeti okur (aynı sorgu anahtarı, tek istek); liste taşınmaz, fiyat yoktur.
const useOzet = () => useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<SiparisOzetiCevabi>('/siparisler/ozet') });

function AcikTeklif() {
  const o = useOzet();
  return <SayiKarti baslik="Açık teklif" simge="edit" sayi={o.data?.acikTeklif} altMetin="Reddedilmemiş, siparişe dönmemiş" yol="/siparisler/teklifler" hata={o.isError} />;
}

function YaklasanTermin() {
  const o = useOzet();
  return (
    <SayiKarti baslik="Termini yaklaşan sipariş" simge="clock" sayi={o.data?.yaklasanTermin} altMetin="Onaylı, termini 7 gün içinde"
      yol="/siparisler" hata={o.isError} />
  );
}

function GecikenSiparis() {
  const o = useOzet();
  return <SayiKarti baslik="Termini geçmiş sipariş" simge="alert" ton="uyari" sayi={o.data?.gecikenSiparis} altMetin="Onaylı, kapanmamış" yol="/siparisler" hata={o.isError} />;
}

const ayAdi = (ay: string): string => `${ay.slice(5)}.${ay.slice(2, 4)}`;
function AylikSiparis() {
  const o = useOzet();
  const noktalar = o.data?.aylik.map((a) => ({ etiket: ayAdi(a.ay), deger: a.sayi }));
  return (
    <GrafikKarti baslik="Aylık sipariş" simge="chart" tur="cubuk" birim="sipariş" noktalar={noktalar} altMetin="Onaylanmış ya da kapanmış, sipariş tarihine göre"
      yol="/siparisler" hata={o.isError} />
  );
}

// Teklif ve eğilim siparişi yazana, termin ve gecikme siparişi okuyana (özet ucu okumayla açılır).
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'siparisler-acik-teklif', sira: 150, bolum: 'is', islem: 'siparisler.yaz', ekran: AcikTeklif },
  { anahtar: 'siparisler-geciken', sira: 150, bolum: 'uyari', islem: 'siparisler.oku', ekran: GecikenSiparis },
  { anahtar: 'siparisler-yaklasan-termin', sira: 150, bolum: 'ozet', islem: 'siparisler.oku', ekran: YaklasanTermin },
  { anahtar: 'siparisler-aylik', sira: 150, bolum: 'grafik', islem: 'siparisler.yaz', ekran: AylikSiparis },
];

export { anaSayfaKaynaklari } from './pano-kaynaklari.tsx';
