import { useQuery } from '@tanstack/react-query';
import type { OzetCevabi } from '#paylasilan/sozlesme/kalibrasyon.ts';
import type { IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import { useKaynakBildir } from '../../ortak/arayuz/pano-baglami.ts';
import type { AnaSayfaKaynagi } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Rol panosu kaynağı (kart 1585): pano kartıyla aynı özet ucu (liste ucunun özetiyle aynı hesap).
export function kalibrasyonKalemleri(o: OzetCevabi): IsKalemi[] {
  const kalemler: IsKalemi[] = [];
  if (o.vadesiGecen > 0) {
    kalemler.push({
      anahtar: 'vadesi-gecen', baslik: `${o.vadesiGecen.toLocaleString('tr-TR')} ölçü aletinin kalibrasyonu geçti`, ayrinti: 'Kullanımdaki alet',
      aciliyet: 'gecikmis', sonTarih: null, yol: '/kalibrasyon', eylem: 'Planla', neden: 'Vadesi geçen aletle ölçüm yapılmamalı.',
    });
  }
  if (o.yaklasan > 0) {
    kalemler.push({
      anahtar: 'yaklasan', baslik: `${o.yaklasan.toLocaleString('tr-TR')} ölçü aletinin kalibrasyonu yaklaşıyor`, ayrinti: 'Kullanımdaki alet',
      aciliyet: 'hafta', sonTarih: null, yol: '/kalibrasyon', eylem: 'Planla', neden: null,
    });
  }
  return kalemler;
}

function Kalibrasyon() {
  const o = useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<OzetCevabi>('/olcu-aletleri/ozet') });
  useKaynakBildir(o.isError ? null : o.data === undefined ? undefined : kalibrasyonKalemleri(o.data));
  return null;
}

export const anaSayfaKaynaklari: AnaSayfaKaynagi[] = [
  { anahtar: 'kalibrasyon-is', tur: 'is', baslik: 'Kalibrasyon', simge: 'ruler', sira: 300, islem: 'sayfa.kalibrasyon', veya: ['kalibrasyon.oku'], yolunda: 'Vadesi geçen kalibrasyon yok', kaynak: Kalibrasyon },
];
