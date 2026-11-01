import { useQuery } from '@tanstack/react-query';
import type { ArkonOzetiCevabi, OperatorOzetiCevabi } from '#paylasilan/sozlesme/arkon.ts';
import type { GidisatOlcusu, IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import { useKaynakBildir } from '../../ortak/arayuz/pano-baglami.ts';
import type { AnaSayfaKaynagi } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Rol panosu kaynakları (kart 1585). Pano kartlarıyla aynı uçlar ve sorgu anahtarları: ek istek gitmez.
const useOzet = () => useQuery({ queryKey: [...anahtarlar.hepsi, 'ozet'], queryFn: () => api.get<ArkonOzetiCevabi>('/arkon/ozet') });

type Alan = keyof ArkonOzetiCevabi;
// Sayı yoksa (işlemi olmayana uç null verir) ya da sıfırsa kalem yoktur.
export function ozetKalemi(o: ArkonOzetiCevabi, alan: Alan, k: Omit<IsKalemi, 'anahtar' | 'baslik' | 'sonTarih' | 'neden'> & {
  baslik: (n: number) => string; neden?: string;
}): IsKalemi[] {
  const n = o[alan];
  if (n === null || n === 0) return [];
  return [{ anahtar: alan, baslik: k.baslik(n), ayrinti: k.ayrinti, aciliyet: k.aciliyet, sonTarih: null, yol: k.yol, eylem: k.eylem, neden: k.neden ?? null }];
}

function kaynakOzet(donustur: (o: ArkonOzetiCevabi) => IsKalemi[]) {
  return function Kaynak() {
    const o = useOzet();
    useKaynakBildir(o.isError ? null : o.data === undefined ? undefined : donustur(o.data));
    return null;
  };
}

// Kalite ve arıza başkasının işini durdurur: "bekliyor"; hazırlık planın önündeki iştir: "bugün".
const Hazirlik = kaynakOzet((o) => ozetKalemi(o, 'hazirlikBekleyen', {
  baslik: (n) => `${n.toLocaleString('tr-TR')} iş paketi hazırlık bekliyor`, ayrinti: 'Yayına girmemiş', aciliyet: 'bugun', yol: '/arkon/hazirlik', eylem: 'Hazırla',
}));
const Kalite = kaynakOzet((o) => ozetKalemi(o, 'kaliteBekleyen', {
  baslik: (n) => `${n.toLocaleString('tr-TR')} numune ölçüm bekliyor`, ayrinti: 'Bekleyen ya da ölçülen numune', aciliyet: 'bekliyor',
  yol: '/arkon/kalite', eylem: 'Ölç', neden: 'Onaylanmayan adımda tezgâh devam edemez.',
}));
const Bakim = kaynakOzet((o) => ozetKalemi(o, 'bakimAcik', {
  baslik: (n) => `${n.toLocaleString('tr-TR')} açık arıza`, ayrinti: 'Kapanmamış arıza kaydı', aciliyet: 'bekliyor',
  yol: '/arkon/bakim', eylem: 'Aç', neden: 'Arızalı tezgâh üretim yapamıyor.',
}));

// Operatörün günü: Özetim kartının verisi ölçü olarak. Plan, Üretim Anomalisi'nin kişi hesabıdır (basari.beklenen).
export function operatorOlculeri(o: OperatorOzetiCevabi): GidisatOlcusu[] {
  const bos = { kiyas: null, plan: null, seri: [], dagilim: [] };
  return [
    { ...bos, anahtar: 'bugun-saglam', ad: 'Bugün ürettiğim', deger: o.saglam, birim: 'adet', plan: o.basari?.beklenen ?? null },
    { ...bos, anahtar: 'bugun-hurda', ad: 'Bugünkü hurdam', deger: o.hurda, birim: 'adet' },
    { ...bos, anahtar: 'bugun-calisma', ad: 'Bugün çalıştığım', deger: o.calismaSn === null ? null : Math.round(o.calismaSn / 360) / 10, birim: 'saat' },
    { ...bos, anahtar: 'kalan-izin', ad: 'Kalan yıllık izin', deger: o.izinler?.kalanGun ?? null, birim: 'gün' },
  ];
}

function OperatorGunu() {
  const o = useQuery({
    queryKey: [...anahtarlar.ben, 'operator-ozeti', 'gun'],
    queryFn: () => api.get<OperatorOzetiCevabi>('/arkon/operator-ozeti?donem=gun'),
  });
  useKaynakBildir(o.isError ? null : o.data === undefined ? undefined : operatorOlculeri(o.data));
  return null;
}

export const anaSayfaKaynaklari: AnaSayfaKaynagi[] = [
  { anahtar: 'arkon-hazirlik-is', tur: 'is', baslik: 'Hazırlık', simge: 'layers', sira: 310, islem: 'arkon.hazirlik', yolunda: 'Hazırlık bekleyen iş yok', kaynak: Hazirlik },
  { anahtar: 'arkon-kalite-is', tur: 'is', baslik: 'Kalite', simge: 'target', sira: 300, islem: 'arkon.kalite', yolunda: 'Ölçüm bekleyen numune yok', kaynak: Kalite },
  { anahtar: 'arkon-bakim-is', tur: 'is', baslik: 'Arıza', simge: 'wrench', sira: 300, islem: 'arkon.bakim', yolunda: 'Açık arıza yok', kaynak: Bakim },
  { anahtar: 'arkon-gunum-olcu', tur: 'gidisat', baslik: 'Günüm', simge: 'gauge', sira: 100, islem: 'sayfa.uretim-terminali', kisisel: true, kaynak: OperatorGunu },
];
