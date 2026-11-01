import { useQuery } from '@tanstack/react-query';
import type { IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import type { VardiyaPersoneliCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { useKaynakBildir } from '../../ortak/arayuz/pano-baglami.ts';
import type { AnaSayfaKaynagi } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Rol panosu kaynağı (kart 1585): "Vardiyası seçilmemiş kişi" kartıyla aynı uç ve sayım.
export function vardiyasizKalemi(c: VardiyaPersoneliCevabi): IsKalemi[] {
  const n = c.personel.filter((p) => p.vardiyaId === null).length;
  if (n === 0) return [];
  return [{
    anahtar: 'vardiyasiz', baslik: `${n.toLocaleString('tr-TR')} kişinin vardiyası seçilmemiş`, ayrinti: 'İstasyona atanmış, vardiyası yok',
    aciliyet: 'bugun', sonTarih: null, yol: '/vardiya/personel', eylem: 'Ata', neden: null,
  }];
}

function Vardiyasiz() {
  const s = useQuery({ queryKey: anahtarlar.personel, queryFn: () => api.get<VardiyaPersoneliCevabi>('/vardiya-personeli') });
  useKaynakBildir(s.isError ? null : s.data === undefined ? undefined : vardiyasizKalemi(s.data));
  return null;
}

export const anaSayfaKaynaklari: AnaSayfaKaynagi[] = [
  { anahtar: 'vardiya-vardiyasiz-is', tur: 'is', baslik: 'Personel', simge: 'users', sira: 400, islem: 'vardiya.yaz', yolunda: 'Herkesin vardiyası seçili', kaynak: Vardiyasiz },
];
