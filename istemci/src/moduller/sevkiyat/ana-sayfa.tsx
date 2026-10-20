import { useQuery } from '@tanstack/react-query';
import type { OzetCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Kartlar tek özet ucunu paylaşır (aynı sorgu anahtarı, tek istek).
const useOzet = () => useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<OzetCevabi>('/sevkiyat/ozet') });

function Bekleyen() {
  const o = useOzet();
  return <SayiKarti baslik="Araca verilmemiş sevkiyat işi" simge="list" sayi={o.data?.bekleyen} altMetin="Bugüne kadarki havuz" yol="/sevkiyat" hata={o.isError} />;
}
function Gecikmis() {
  const o = useOzet();
  return <SayiKarti baslik="Gecikmiş sevkiyat işi" simge="alert" ton="uyari" sayi={o.data?.gecikmis} altMetin="İstenen günü geçmiş, yola çıkmamış" yol="/sevkiyat" hata={o.isError} />;
}
// Yönetici özeti: gecikmeyi havuzla birlikte gösterir; aynı özet ucundan beslenir.
function GecikenYonetim() {
  const o = useOzet();
  return <SayiKarti baslik="Geciken sevkiyat" simge="alert" ton="uyari" sayi={o.data?.gecikmis} altMetin={o.data ? `${o.data.bekleyen.toLocaleString('tr-TR')} iş araca verilmemiş` : undefined} yol="/sevkiyat" hata={o.isError} />;
}

// İş kartlarını sevkiyatı yürüten görür (onay yetkisi: Sevkiyat ve depo rolleri).
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'sevkiyat-bekleyen', sira: 400, bolum: 'is', islem: 'sevkiyat.onayla', ekran: Bekleyen },
  { anahtar: 'sevkiyat-gecikmis', sira: 410, bolum: 'is', islem: 'sevkiyat.onayla', ekran: Gecikmis },
  // Şirket özeti kartını sevkiyatı okuyan görür (kart #1085).
  { anahtar: 'sevkiyat-geciken', sira: 120, bolum: 'yonetim', islem: 'sevkiyat.oku', ekran: GecikenYonetim },
];
