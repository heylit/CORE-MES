import { useQuery } from '@tanstack/react-query';
import type { KmOzetCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';

// Şirket özeti: açık uygunsuzluk sayısı (kart #1081, #1117).
function AcikUygunsuzluk() {
  const o = useQuery({ queryKey: ['kalite-merkezi', 'ozet'], queryFn: () => api.get<KmOzetCevabi>('/kalite-merkezi/ozet') });
  return <SayiKarti baslik="Açık uygunsuzluk" simge="alert" ton="uyari" sayi={o.data?.acikUygunsuzluk} altMetin="Kapanmamış uygunsuzluk kaydı" hata={o.isError} />;
}

// Kartı Kalite Merkezi'ni okuyan görür (kart #1085).
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'kalite-merkezi-yonetim-uygunsuzluk', sira: 840, bolum: 'yonetim', islem: 'kalite-merkezi.oku', ekran: AcikUygunsuzluk },
];
