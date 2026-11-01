import { useQuery } from '@tanstack/react-query';
import type { DurusDagilimiCevabi, GunlukUretimCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CubukListesiKarti, IkiSeriKarti } from '../../ortak/arayuz/PanoGrafikleri.tsx';
import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { ADIMLI_OKUMA_ISLEMLERI } from './gorunum.ts';
import { AcikEmirler, BugunUrettigim, Kuyrugum, Planlanacak } from './PanoKartlari.tsx';

// Şirket özeti serileri (kart #1078, #1117): uç dönemi varsayılanıyla verir (günlük üretim 30, duruş 14 gün).
const gunAdi = (gun: string): string => gun.slice(5).split('-').reverse().join('.');
const DURUS_SINIRI = 6;

function GunlukUretim() {
  const s = useQuery({ queryKey: ['uretim-emirleri', 'panel', 'gunluk-uretim'], queryFn: () => api.get<GunlukUretimCevabi>('/uretim-emirleri/gunluk-uretim') });
  const noktalar = s.data?.gunler.map((g) => ({ etiket: gunAdi(g.gun), birinci: g.saglam, ikinci: g.hurda }));
  return (
    <IkiSeriKarti baslik="Günlük sağlam ve hurda adet" simge="gauge" seriAdlari={['Sağlam', 'Hurda']} birim="adet" noktalar={noktalar}
      altMetin="Son 30 gün" bosMetin="Bu dönemde üretim kaydı yok" hata={s.isError} />
  );
}
// En uzun süren nedenler önce; kalanlar karta sığmaz, emir ekranında okunur.
function DurusDagilimi() {
  const s = useQuery({ queryKey: ['uretim-emirleri', 'panel', 'durus-dagilimi'], queryFn: () => api.get<DurusDagilimiCevabi>('/uretim-emirleri/durus-dagilimi') });
  const satirlar = s.data && [...s.data.nedenler].sort((a, b) => b.dakika - a.dakika).slice(0, DURUS_SINIRI)
    .map((n) => ({ etiket: n.neden.ad, deger: Math.round(n.dakika) }));
  return (
    <CubukListesiKarti baslik="Duruş nedenleri" simge="clock" birim="dk" satirlar={satirlar}
      altMetin="Son 14 gün, neden başına toplam süre" bosMetin="Bu dönemde duruş yok" hata={s.isError} />
  );
}

// Kart işlemle görünür, rolle değil (kart #483). Planlanacak plana alabilene, kişi kartları üretim kaydı yazabilene.
export const anaSayfaKartlari: AnaSayfaKarti[] = [
  { anahtar: 'uretim-emirleri-planlanacak', sira: 200, islem: 'uretim-emirleri.yaz', bolum: 'is', ekran: Planlanacak },
  { anahtar: 'uretim-emirleri-kuyrugum', sira: 210, islem: 'terminal.uret', bolum: 'is', ekran: Kuyrugum },
  { anahtar: 'uretim-emirleri-acik', sira: 200, islem: 'sayfa.rota', bolum: 'ozet', ekran: AcikEmirler },
  { anahtar: 'uretim-emirleri-bugun', sira: 210, islem: 'terminal.uret', bolum: 'ozet', ekran: BugunUrettigim },
  // Şirket özeti kartlarını emir listesini okuyan görür (kart #1085).
  { anahtar: 'uretim-emirleri-yonetim-gunluk', sira: 800, bolum: 'yonetim', islem: ADIMLI_OKUMA_ISLEMLERI[0], veya: ADIMLI_OKUMA_ISLEMLERI, ekran: GunlukUretim },
  { anahtar: 'uretim-emirleri-yonetim-durus', sira: 810, bolum: 'yonetim', islem: ADIMLI_OKUMA_ISLEMLERI[0], veya: ADIMLI_OKUMA_ISLEMLERI, ekran: DurusDagilimi },
];

export { anaSayfaKaynaklari } from './pano-kaynaklari.tsx';
