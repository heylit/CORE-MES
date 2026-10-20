import { useQuery } from '@tanstack/react-query';
import type { MalzemelerOzetiCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';

function OnayBekleyen() {
  const o = useQuery({ queryKey: ['malzemeler', 'ozet'], queryFn: () => api.get<MalzemelerOzetiCevabi>('/malzemeler/ozet') });
  return (
    <SayiKarti baslik="Onay bekleyen malzeme" simge="check" sayi={o.data?.onayBekleyen} altMetin="Yeni kart ve değişiklik talebi"
      yol="/malzemeler" hata={o.isError} />
  );
}

// Rol panoları tablosu (kalite: "Onay bekleyen malzeme"); kart onaylayan işlemle görünür.
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'malzemeler-onay-bekleyen', sira: 300, bolum: 'is', islem: 'malzemeler.onayla', ekran: OnayBekleyen },
];
