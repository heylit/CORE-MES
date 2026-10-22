import { useQuery } from '@tanstack/react-query';
import type { KapiCevabi } from '#paylasilan/sozlesme/nizamiye.ts';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Üç kart kapı konsolunun tek okumasını paylaşır (Kapı ekranıyla aynı sorgu anahtarı, tek istek); kart yalnız sayar, ziyaretçi adı göstermez.
const useKapi = () => useQuery({ queryKey: anahtarlar.kapi, queryFn: () => api.get<KapiCevabi>('/nizamiye/kapi') });

function BeklenenZiyaretci() {
  const k = useKapi();
  return <SayiKarti baslik="Beklenen ziyaretçi" simge="clock" sayi={k.data?.beklenen.length} altMetin="Bugün ve gecikmiş, giriş yapmamış" yol="/nizamiye" hata={k.isError} />;
}

function IceridekiZiyaretci() {
  const k = useKapi();
  return <SayiKarti baslik="İçerideki ziyaretçi" simge="user" sayi={k.data?.iceride.length} altMetin="Giriş yapmış, çıkmamış" yol="/nizamiye" hata={k.isError} />;
}

function BosKart() {
  const k = useKapi();
  return <SayiKarti baslik="Boş ziyaretçi kartı" simge="tag" sayi={k.data?.bosKartlar.length} altMetin="Verilebilecek kart" yol="/nizamiye/kartlar" hata={k.isError} />;
}

// Kapı ucunun yetkisiyle görünür.
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'nizamiye-beklenen', sira: 100, bolum: 'is', islem: 'nizamiye.oku', ekran: BeklenenZiyaretci },
  { anahtar: 'nizamiye-iceride', sira: 100, bolum: 'ozet', islem: 'nizamiye.oku', ekran: IceridekiZiyaretci },
  { anahtar: 'nizamiye-bos-kart', sira: 110, bolum: 'ozet', islem: 'nizamiye.oku', ekran: BosKart },
];
