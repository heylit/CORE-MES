import { useQuery } from '@tanstack/react-query';
import type { ArkonOzetiCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { OperatorPanosu } from './OperatorPanosu.tsx';

// Hazırlık bekleyen iş, hazırlıkçının yapacağı iştir: "Bana düşen işler"de durur.
// Üç kart tek özet ucunu paylaşır (aynı sorgu anahtarı, tek istek); kartın işlemi olmayan sayı uçta null gelir.
function useOzet() {
  return useQuery({ queryKey: [...anahtarlar.hepsi, 'ozet'], queryFn: () => api.get<ArkonOzetiCevabi>('/arkon/ozet') });
}

function HazirlikBekleyen() {
  const o = useOzet();
  return <SayiKarti baslik="Hazırlık bekleyen iş" simge="layers" sayi={o.data?.hazirlikBekleyen} altMetin="Yayına girmemiş iş paketi" yol="/arkon/hazirlik" hata={o.isError} />;
}
function KaliteBekleyen() {
  const o = useOzet();
  return <SayiKarti baslik="Kalite bekleyen adım" simge="target" sayi={o.data?.kaliteBekleyen} altMetin="Bekleyen ya da ölçülen numune" yol="/arkon/kalite" hata={o.isError} />;
}
function BakimIsleri() {
  const o = useOzet();
  return <SayiKarti baslik="Bakım işleri" simge="wrench" ton="uyari" sayi={o.data?.bakimAcik} altMetin="Kapanmamış arıza" yol="/arkon/bakim" hata={o.isError} />;
}


export const anaSayfaKartlari: AnaSayfaKarti[] = [
  // Operatörün ana sayfası (Özetim kısası): en üstte, iki sütunu kaplar; terminale geçiş düğmesi içindedir.
  { anahtar: 'arkon-ozetim', sira: 100, bolum: 'is', islem: 'sayfa.uretim-terminali', genis: true, ekran: OperatorPanosu },
  { anahtar: 'arkon-bakim', sira: 300, bolum: 'is', islem: 'arkon.bakim', ekran: BakimIsleri },
  { anahtar: 'arkon-hazirlik', sira: 310, bolum: 'is', islem: 'arkon.hazirlik', ekran: HazirlikBekleyen },
  { anahtar: 'arkon-kalite', sira: 310, bolum: 'ozet', islem: 'arkon.kalite', ekran: KaliteBekleyen },
];
