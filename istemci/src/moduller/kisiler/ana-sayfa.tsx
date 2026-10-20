import { useQuery } from '@tanstack/react-query';
import type { EksikBilgiOzetiCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Sayıyı sunucu sayar (pasif kişi sayılmaz); kişi listesi taşınmaz. Anahtar kişi anahtarının altındadır: kişi yazılınca birlikte yenilenir.
function EksikBilgiliPersonel() {
  const o = useQuery({ queryKey: anahtarlar.eksikBilgi, queryFn: () => api.get<EksikBilgiOzetiCevabi>('/kisiler/eksik-bilgi-ozeti') });
  const altMetin = o.data && `${o.data.sicilsiz.toLocaleString('tr-TR')} sicil no, ${o.data.gorevsiz.toLocaleString('tr-TR')} görev boş`;
  return (
    <SayiKarti baslik="Eksik bilgili personel" simge="user" ton="uyari" yol="/personel" hata={o.isError}
      sayi={o.data?.eksik} altMetin={altMetin} />
  );
}

// İş kartıdır: eksiği yalnız kişi yazabilen tamamlar.
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'kisiler-eksik-bilgi', sira: 40, bolum: 'is', islem: 'kisiler.yaz', ekran: EksikBilgiliPersonel },
];
