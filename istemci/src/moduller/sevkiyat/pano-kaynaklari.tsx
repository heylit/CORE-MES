import { useQuery } from '@tanstack/react-query';
import type { IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import type { OzetCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { useKaynakBildir } from '../../ortak/arayuz/pano-baglami.ts';
import type { AnaSayfaKaynagi } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Rol panosu kaynağı (kart 1585): pano kartlarıyla aynı özet ucu. Gecikmiş iş havuzun içindedir; bekleyen satırı yalnız kalanı sayar.
export function sevkiyatKalemleri(o: OzetCevabi): IsKalemi[] {
  const kalemler: IsKalemi[] = [];
  if (o.gecikmis > 0) {
    kalemler.push({
      anahtar: 'gecikmis', baslik: `${o.gecikmis.toLocaleString('tr-TR')} sevkiyat işi gecikti`, ayrinti: 'İstenen günü geçmiş, yola çıkmamış',
      aciliyet: 'gecikmis', sonTarih: null, yol: '/sevkiyat', eylem: 'Araca ver', neden: null,
    });
  }
  const bekleyen = o.bekleyen - o.gecikmis;
  if (bekleyen > 0) {
    kalemler.push({
      anahtar: 'bekleyen', baslik: `${bekleyen.toLocaleString('tr-TR')} sevkiyat işi araca verilmedi`, ayrinti: 'Bugüne kadarki havuz',
      aciliyet: 'bugun', sonTarih: null, yol: '/sevkiyat', eylem: 'Araca ver', neden: null,
    });
  }
  return kalemler;
}

function Sevkiyat() {
  const o = useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<OzetCevabi>('/sevkiyat/ozet') });
  useKaynakBildir(o.isError ? null : o.data === undefined ? undefined : sevkiyatKalemleri(o.data));
  return null;
}

export const anaSayfaKaynaklari: AnaSayfaKaynagi[] = [
  { anahtar: 'sevkiyat-is', tur: 'is', baslik: 'Sevkiyat', simge: 'truck', sira: 400, islem: 'sevkiyat.onayla', yolunda: 'Bekleyen sevkiyat yok', kaynak: Sevkiyat },
];
