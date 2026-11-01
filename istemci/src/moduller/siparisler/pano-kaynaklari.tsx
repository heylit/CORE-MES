import { useQuery } from '@tanstack/react-query';
import type { GidisatOlcusu, IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import type { SiparisOzetiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { useKaynakBildir } from '../../ortak/arayuz/pano-baglami.ts';
import type { AnaSayfaKaynagi } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Rol panosu kaynakları (kart 1585): pano kartlarıyla aynı özet ucu; liste taşınmaz, fiyat yoktur.
const useOzet = () => useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<SiparisOzetiCevabi>('/siparisler/ozet') });
const sayi = (n: number): string => n.toLocaleString('tr-TR');

export function terminKalemleri(o: SiparisOzetiCevabi): IsKalemi[] {
  const kalemler: IsKalemi[] = [];
  if (o.gecikenSiparis > 0) {
    kalemler.push({
      anahtar: 'geciken', baslik: `${sayi(o.gecikenSiparis)} siparişin termini geçti`, ayrinti: 'Onaylı, kapanmamış', aciliyet: 'gecikmis',
      sonTarih: null, yol: '/siparisler', eylem: 'Listele', neden: 'Müşteriye yeni termin bildirilmeli.',
    });
  }
  if (o.yaklasanTermin > 0) {
    kalemler.push({
      anahtar: 'yaklasan', baslik: `${sayi(o.yaklasanTermin)} siparişin termini 7 gün içinde`, ayrinti: 'Onaylı', aciliyet: 'hafta',
      sonTarih: null, yol: '/siparisler', eylem: 'Listele', neden: null,
    });
  }
  return kalemler;
}

// Kıyas bir önceki aydır; ay bitmeden düşük görünmesi beklenir, bu yüzden yön verilmez.
export function aylikOlcu(o: SiparisOzetiCevabi): GidisatOlcusu[] {
  const son = o.aylik.at(-1);
  const onceki = o.aylik.at(-2);
  if (son === undefined) return [];
  return [{
    anahtar: 'aylik-siparis', ad: 'Bu ay sipariş', deger: son.sayi, birim: 'sipariş', plan: null, dagilim: [],
    kiyas: onceki === undefined ? null : { etiket: `${onceki.ay.slice(5)}.${onceki.ay.slice(2, 4)}`, deger: onceki.sayi, iyiYon: null },
    seri: o.aylik.map((a) => a.sayi),
  }];
}

function Termin() {
  const o = useOzet();
  useKaynakBildir(o.isError ? null : o.data === undefined ? undefined : terminKalemleri(o.data));
  return null;
}
function Aylik() {
  const o = useOzet();
  useKaynakBildir(o.isError ? null : o.data === undefined ? undefined : aylikOlcu(o.data));
  return null;
}

export const anaSayfaKaynaklari: AnaSayfaKaynagi[] = [
  { anahtar: 'siparisler-termin-is', tur: 'is', baslik: 'Termin', simge: 'clock', sira: 150, islem: 'siparisler.oku', yolunda: 'Termini geçen sipariş yok', kaynak: Termin },
  { anahtar: 'siparisler-aylik-olcu', tur: 'gidisat', baslik: 'Sipariş', simge: 'chart', sira: 500, islem: 'siparisler.oku', kaynak: Aylik },
];
