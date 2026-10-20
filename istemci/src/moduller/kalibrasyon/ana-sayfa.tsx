import { useQuery } from '@tanstack/react-query';
import type { OzetCevabi } from '#paylasilan/sozlesme/kalibrasyon.ts';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Özet ucu liste ucunun özetiyle aynı hesaptır; aletler taşınmaz. Anahtar modül kökünün altındadır: yazma komutlarıyla birlikte yenilenir.
function VadesiGecen() {
  const o = useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<OzetCevabi>('/olcu-aletleri/ozet') });
  return <SayiKarti baslik="Vadesi geçen kalibrasyon" simge="ruler" ton="uyari" sayi={o.data?.vadesiGecen} altMetin="Kullanımdaki, kalibrasyon vadesi dolmuş alet" yol="/kalibrasyon" hata={o.isError} />;
}

// Uçtaki okuma kümesiyle aynı: sayfası olan ya da sayfasız okuma işlemi verilen.
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'kalibrasyon-vadesi-gecen', sira: 300, bolum: 'uyari', islem: 'sayfa.kalibrasyon', veya: ['kalibrasyon.oku'], ekran: VadesiGecen },
];
