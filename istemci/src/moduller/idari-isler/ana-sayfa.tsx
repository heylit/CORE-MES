import { useQuery } from '@tanstack/react-query';
import type { BugunCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Üç kart Bugün ekranının okumasını paylaşır (aynı sorgu anahtarı, tek istek); yazma sonrası modül önekiyle birlikte yenilenir.
const useBugun = () => useQuery({ queryKey: anahtarlar.bugun, queryFn: () => api.get<BugunCevabi>('/idari-isler/bugun') });

function AcikTalep() {
  const b = useBugun();
  const s = b.data?.sayilar;
  return (
    <SayiKarti baslik="Açık tesis talebi" simge="wrench" sayi={s?.acikTalep} altMetin={s && (s.acilTalep > 0 ? `${s.acilTalep.toLocaleString('tr-TR')} acil` : 'Acil talep yok')}
      yol="/idari-isler/talepler" hata={b.isError} />
  );
}

function Kontrol() {
  const b = useBugun();
  const s = b.data?.sayilar;
  return (
    <SayiKarti baslik="Periyodik kontrol" simge="clock" ton="uyari" sayi={s && s.gecenKontrol + s.yakinKontrol}
      altMetin={s && `${s.gecenKontrol.toLocaleString('tr-TR')} süresi geçmiş, ${s.yakinKontrol.toLocaleString('tr-TR')} yedi gün içinde`} yol="/idari-isler/periyodik" hata={b.isError} />
  );
}

function Arac() {
  const b = useBugun();
  return (
    <SayiKarti baslik="Araç uyarısı" simge="truck" ton="uyari" sayi={b.data?.sayilar.aracUyarisi} altMetin="Muayene, sigorta ya da bakım zamanı"
      yol="/idari-isler/filo" hata={b.isError} />
  );
}

// Bugün ucunun yetkisiyle görünür.
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'idari-isler-acik-talep', sira: 350, bolum: 'is', islem: 'idari-isler.oku', ekran: AcikTalep },
  { anahtar: 'idari-isler-kontrol', sira: 350, bolum: 'uyari', islem: 'idari-isler.oku', ekran: Kontrol },
  { anahtar: 'idari-isler-arac', sira: 360, bolum: 'uyari', islem: 'idari-isler.oku', ekran: Arac },
];
