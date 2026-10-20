import { useQuery } from '@tanstack/react-query';
import type { IkOzetiCevabi } from '#paylasilan/sozlesme/ik.ts';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';

// Şirket özeti: bugün izinli ve raporlu kişi sayısı (kart #1082, #1117).
function IzinliRaporlu() {
  const o = useQuery({ queryKey: ['ik', 'ozet'], queryFn: () => api.get<IkOzetiCevabi>('/ik/ozet') });
  const d = o.data;
  return (
    <SayiKarti baslik="Bugün izinli ya da raporlu" simge="user" sayi={d && d.izinli + d.raporlu}
      altMetin={d && `${d.izinli.toLocaleString('tr-TR')} izinli, ${d.raporlu.toLocaleString('tr-TR')} raporlu`} hata={o.isError} />
  );
}

// Kartı bütün İK kayıtlarını okuyan görür (kart #1085).
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'ik-yonetim-izinli', sira: 850, bolum: 'yonetim', islem: 'ik.oku', ekran: IzinliRaporlu },
];
