import { useQuery } from '@tanstack/react-query';
import type { GidisatOlcusu, IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import type { DurusDagilimiCevabi, GunlukUretimCevabi, OzetCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { useKaynakBildir } from '../../ortak/arayuz/pano-baglami.ts';
import type { AnaSayfaKaynagi } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ADIMLI_OKUMA_ISLEMLERI } from './gorunum.ts';

// Rol panosu kaynakları (kart 1585). Pano kartlarıyla aynı uçlar ve sorgu anahtarları.
const useOzet = () => useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<OzetCevabi>('/uretim-emirleri/ozet') });
const sayi = (n: number): string => n.toLocaleString('tr-TR');
const DURUS_SINIRI = 5;
const SERI_GUNU = 14;

export function planlanacakKalemi(o: OzetCevabi): IsKalemi[] {
  if (o.planlanacak === null || o.planlanacak === 0) return [];
  return [{
    anahtar: 'planlanacak', baslik: `${sayi(o.planlanacak)} emir plana alınmayı bekliyor`, ayrinti: 'Taslak emir', aciliyet: 'bugun',
    sonTarih: null, yol: '/uretim-emirleri', eylem: 'Planla', neden: null,
  }];
}

// Operatörün terminali: kuyruktaki iş terminalden başlatılır.
export function kuyrukKalemi(o: OzetCevabi): IsKalemi[] {
  if (o.kuyrugum === 0) return [];
  return [{
    anahtar: 'kuyrugum', baslik: `Kuyruğunda ${sayi(o.kuyrugum)} iş emri`, ayrinti: 'Size atanmış, bitmemiş', aciliyet: 'bugun',
    sonTarih: null, yol: '/uretim-terminali', eylem: 'Terminalde başlat', neden: 'Sıradaki işi terminalden başlatın.',
  }];
}

// Kaydı olmayan gün listede yoktur: son kayıt bugüne ait değilse bugünün değeri bilinmez (null), sıfır uydurulmaz.
// Kıyas bir önceki kayıtlı gündür; etiketi o günün tarihidir, "dün" denmez.
export function uretimOlculeri(c: GunlukUretimCevabi, bugun: string): GidisatOlcusu[] {
  const gunler = c.gunler;
  const son = gunler.at(-1);
  const bugunku = son?.gun === bugun ? son : undefined;
  const onceki = bugunku === undefined ? son : gunler.at(-2);
  const etiket = onceki === undefined ? null : `${onceki.gun.slice(8)}.${onceki.gun.slice(5, 7)}`;
  const seri = gunler.slice(-SERI_GUNU);
  const olcu = (anahtar: string, ad: string, alan: 'saglam' | 'hurda', iyiYon: 'artis' | 'azalis'): GidisatOlcusu => ({
    anahtar, ad, deger: bugunku?.[alan] ?? null, birim: 'adet', plan: null, dagilim: [],
    kiyas: onceki === undefined || etiket === null ? null : { etiket, deger: onceki[alan], iyiYon },
    seri: seri.map((g) => g[alan]),
  });
  return [olcu('gunluk-saglam', 'Bugün sağlam üretim', 'saglam', 'artis'), olcu('gunluk-hurda', 'Bugün hurda', 'hurda', 'azalis')];
}

export function durusOlcusu(c: DurusDagilimiCevabi): GidisatOlcusu[] {
  if (c.nedenler.length === 0) return [];
  const dagilim = [...c.nedenler].sort((a, b) => b.dakika - a.dakika).slice(0, DURUS_SINIRI)
    .map((n) => ({ etiket: n.neden.ad, deger: Math.round(n.dakika) }));
  return [{ anahtar: 'durus-nedenleri', ad: 'Duruş nedenleri, son 14 gün', deger: null, birim: 'dk', kiyas: null, plan: null, seri: [], dagilim }];
}

function Planlanacak() {
  const o = useOzet();
  useKaynakBildir(o.isError ? null : o.data === undefined ? undefined : planlanacakKalemi(o.data));
  return null;
}
function Kuyrugum() {
  const o = useOzet();
  useKaynakBildir(o.isError ? null : o.data === undefined ? undefined : kuyrukKalemi(o.data));
  return null;
}
function Uretim() {
  const s = useQuery({ queryKey: ['uretim-emirleri', 'panel', 'gunluk-uretim'], queryFn: () => api.get<GunlukUretimCevabi>('/uretim-emirleri/gunluk-uretim') });
  useKaynakBildir(s.isError ? null : s.data === undefined ? undefined : uretimOlculeri(s.data, tesisGunu(Date.now())));
  return null;
}
function Durus() {
  const s = useQuery({ queryKey: ['uretim-emirleri', 'panel', 'durus-dagilimi'], queryFn: () => api.get<DurusDagilimiCevabi>('/uretim-emirleri/durus-dagilimi') });
  useKaynakBildir(s.isError ? null : s.data === undefined ? undefined : durusOlcusu(s.data));
  return null;
}

export const anaSayfaKaynaklari: AnaSayfaKaynagi[] = [
  { anahtar: 'uretim-emirleri-planlanacak-is', tur: 'is', baslik: 'Plan', simge: 'flag', sira: 200, islem: 'uretim-emirleri.yaz', yolunda: 'Plana alınacak emir yok', kaynak: Planlanacak },
  { anahtar: 'uretim-emirleri-kuyrugum-is', tur: 'is', baslik: 'Kuyruğum', simge: 'play', sira: 100, islem: 'terminal.uret', kaynak: Kuyrugum },
  { anahtar: 'uretim-emirleri-uretim-olcu', tur: 'gidisat', baslik: 'Üretim', simge: 'gauge', sira: 200, islem: ADIMLI_OKUMA_ISLEMLERI[0], veya: ADIMLI_OKUMA_ISLEMLERI, kaynak: Uretim },
  { anahtar: 'uretim-emirleri-durus-olcu', tur: 'gidisat', baslik: 'Duruş', simge: 'clock', sira: 210, islem: ADIMLI_OKUMA_ISLEMLERI[0], veya: ADIMLI_OKUMA_ISLEMLERI, kaynak: Durus },
];
