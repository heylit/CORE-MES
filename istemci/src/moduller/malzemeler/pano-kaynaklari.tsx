import { useQuery } from '@tanstack/react-query';
import type { MalzemelerOzetiCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import type { IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import { useKaynakBildir } from '../../ortak/arayuz/pano-baglami.ts';
import type { AnaSayfaKaynagi } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';

// Rol panosu kaynağı (kart 1585): pano kartıyla aynı uç. Onay bekleyen kart başkasının açtığı işi durdurur: "bekliyor".
export function onayKalemi(o: MalzemelerOzetiCevabi): IsKalemi[] {
  if (o.onayBekleyen === null || o.onayBekleyen === 0) return [];
  return [{
    anahtar: 'onay', baslik: `${o.onayBekleyen.toLocaleString('tr-TR')} malzeme onayınızı bekliyor`, ayrinti: 'Yeni kart ve değişiklik talebi',
    aciliyet: 'bekliyor', sonTarih: null, yol: '/malzemeler', eylem: 'Onayla', neden: null,
  }];
}

function Onay() {
  const o = useQuery({ queryKey: ['malzemeler', 'ozet'], queryFn: () => api.get<MalzemelerOzetiCevabi>('/malzemeler/ozet') });
  useKaynakBildir(o.isError ? null : o.data === undefined ? undefined : onayKalemi(o.data));
  return null;
}

export const anaSayfaKaynaklari: AnaSayfaKaynagi[] = [
  { anahtar: 'malzemeler-onay-is', tur: 'is', baslik: 'Malzeme onayı', simge: 'check', sira: 300, islem: 'malzemeler.onayla', yolunda: 'Onay bekleyen malzeme yok', kaynak: Onay },
];
