import { useQuery } from '@tanstack/react-query';
import type { KmIlkParcaBekleyenCevabi, KmOzetCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';

// Şirket özeti ve kalitecinin uyarısı aynı özet ucunu okur (aynı sorgu anahtarı, tek istek).
const useOzet = () => useQuery({ queryKey: ['kalite-merkezi', 'ozet'], queryFn: () => api.get<KmOzetCevabi>('/kalite-merkezi/ozet') });

// Şirket özeti: açık uygunsuzluk sayısı (kart #1081, #1117).
function AcikUygunsuzluk() {
  const o = useOzet();
  return <SayiKarti baslik="Açık uygunsuzluk" simge="alert" ton="uyari" sayi={o.data?.acikUygunsuzluk} altMetin="Kapanmamış uygunsuzluk kaydı" hata={o.isError} />;
}

function UygunsuzlukUyarisi() {
  const o = useOzet();
  return (
    <SayiKarti baslik="Açık uygunsuzluk" simge="alert" ton="uyari" sayi={o.data?.acikUygunsuzluk} altMetin="Kapanmamış uygunsuzluk kaydı"
      yol="/kalite-merkezi/uygunsuzluklar" hata={o.isError} />
  );
}

// Kararı bekleyen emirler Kalite Merkezi'nin Bugün görünümünde karara açılır; kart yalnız sayar.
function IlkParcaBekleyen() {
  const o = useQuery({ queryKey: ['kalite-merkezi', 'ilk-parca', 'bekleyenler'], queryFn: () => api.get<KmIlkParcaBekleyenCevabi>('/kalite-merkezi/ilk-parca/bekleyenler') });
  const emirler = o.data?.emirler;
  const adet = emirler?.reduce((t, e) => t + e.kararBekleyenAdet, 0);
  return (
    <SayiKarti baslik="İlk parça kararı bekleyen emir" simge="check" ton="uyari" sayi={emirler?.length}
      altMetin={adet === undefined ? undefined : `${adet.toLocaleString('tr-TR')} adet karar bekliyor`} yol="/kalite-merkezi" hata={o.isError} />
  );
}

// Şirket özeti kartını Kalite Merkezi'ni okuyan görür (kart #1085). İlk parça kartı karar ucunun yetkisiyle (325 a), uyarı kalite
// kaydını yazanla görünür.
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'kalite-merkezi-yonetim-uygunsuzluk', sira: 840, bolum: 'yonetim', islem: 'kalite-merkezi.oku', ekran: AcikUygunsuzluk },
  { anahtar: 'kalite-merkezi-ilk-parca', sira: 320, bolum: 'is', islem: 'kalite-merkezi.onayla', ekran: IlkParcaBekleyen },
  { anahtar: 'kalite-merkezi-uygunsuzluk', sira: 320, bolum: 'uyari', islem: 'kalite-merkezi.yaz', ekran: UygunsuzlukUyarisi },
];
