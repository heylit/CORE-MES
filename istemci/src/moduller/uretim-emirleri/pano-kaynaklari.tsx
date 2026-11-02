import { useQuery } from '@tanstack/react-query';
import type { GidisatOlcusu, IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import type { DurusDagilimiCevabi, GunlukUretimCevabi, OzetCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { CizgiGrafikKarti, CubukGrafikKarti, YatayCubukKarti, sayi as grafikSayi } from '../../ortak/arayuz/grafik/grafikler.tsx';
import { useKaynakBildir } from '../../ortak/arayuz/pano-baglami.ts';
import type { AnaSayfaKaynagi, GrafikOzellikleri } from '../../ortak/rota/ana-sayfa.ts';
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

// Grafikler (kart 1773). Kaydı olmayan gün uçta yoktur; pencere günleri burada sıralanır ve boş gün null kalır (sıfır uydurulmaz).
const GUN_MS = 86_400_000;
export function gunListesi(bugun: string, gun: number): string[] {
  const son = Date.parse(`${bugun}T00:00:00Z`);
  return Array.from({ length: gun }, (_, i) => new Date(son - (gun - 1 - i) * GUN_MS).toISOString().slice(0, 10));
}
const gunEtiketi = (g: string): string => `${g.slice(8)}.${g.slice(5, 7)}`;

export function uretimSerileri(c: GunlukUretimCevabi, bugun: string, gun: number) {
  const kayit = new Map(c.gunler.map((g) => [g.gun, g]));
  const gunler = gunListesi(bugun, gun);
  const saglam = gunler.map((g) => kayit.get(g)?.saglam ?? null);
  const hurda = gunler.map((g) => kayit.get(g)?.hurda ?? null);
  // Oran yalnız üretimi olan günde: sağlam ve hurdası sıfır olan gün tanımsızdır.
  const hurdaOrani = gunler.map((g) => {
    const k = kayit.get(g);
    return k === undefined || k.saglam + k.hurda === 0 ? null : (k.hurda / (k.saglam + k.hurda)) * 100;
  });
  return { etiketler: gunler.map(gunEtiketi), saglam, hurda, hurdaOrani };
}

const useGunlukUretim = (gun: number) => useQuery({
  queryKey: ['uretim-emirleri', 'panel', 'gunluk-uretim', gun],
  queryFn: () => api.get<GunlukUretimCevabi>(`/uretim-emirleri/gunluk-uretim?gun=${gun}`),
});

function UretimGrafigi({ gun = SERI_GUNU }: GrafikOzellikleri) {
  const s = useGunlukUretim(gun);
  const v = s.data === undefined ? null : uretimSerileri(s.data, tesisGunu(Date.now()), gun);
  return (
    <CubukGrafikKarti baslik={`Üretim, son ${gun} gün`} alt="Sağlam ve hurda adet; boş gün kayıt yok" simge="chart" yol="/uretim-emirleri" genis
      hata={s.isError} yuklendi={v !== null} etiketler={v?.etiketler ?? []} bicim={(n) => `${grafikSayi(n, 0)} adet`}
      seriler={[{ ad: 'Sağlam', degerler: v?.saglam ?? [] }, { ad: 'Hurda', degerler: v?.hurda ?? [] }]} />
  );
}

function HurdaOraniGrafigi({ gun = 30 }: GrafikOzellikleri) {
  const s = useGunlukUretim(gun);
  const v = s.data === undefined ? null : uretimSerileri(s.data, tesisGunu(Date.now()), gun);
  return (
    <CizgiGrafikKarti baslik="Hurda oranı" alt={`Günlük hurda / toplam adet, son ${gun} gün`} simge="target" genis
      hata={s.isError} yuklendi={v !== null} etiketler={v?.etiketler ?? []} bicim={(n) => `%${grafikSayi(n)}`}
      seriler={[{ ad: 'Hurda oranı', degerler: v?.hurdaOrani ?? [] }]} />
  );
}

function DurusGrafigi({ gun = 7 }: GrafikOzellikleri) {
  const s = useQuery({
    queryKey: ['uretim-emirleri', 'panel', 'durus-dagilimi', gun],
    queryFn: () => api.get<DurusDagilimiCevabi>(`/uretim-emirleri/durus-dagilimi?gun=${gun}`),
  });
  const satirlar = s.data?.nedenler.map((n) => ({ etiket: n.neden.ad, deger: Math.round(n.dakika) })) ?? [];
  return (
    <YatayCubukKarti baslik="Duruş nedenleri" alt={`Dakika, son ${gun} gün; büyükten küçüğe`} simge="clock"
      hata={s.isError} yuklendi={s.data !== undefined} satirlar={satirlar} bicim={(n) => `${grafikSayi(n, 0)} dk`} />
  );
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
  { anahtar: 'uretim-emirleri-uretim-grafik', tur: 'grafik', baslik: 'Üretim', simge: 'chart', sira: 100, bolum: 'uretim', anaSayfada: true, islem: ADIMLI_OKUMA_ISLEMLERI[0], veya: ADIMLI_OKUMA_ISLEMLERI, kaynak: UretimGrafigi },
  { anahtar: 'uretim-emirleri-durus-grafik', tur: 'grafik', baslik: 'Duruş nedenleri', simge: 'clock', sira: 300, bolum: 'uretim', anaSayfada: true, islem: ADIMLI_OKUMA_ISLEMLERI[0], veya: ADIMLI_OKUMA_ISLEMLERI, kaynak: DurusGrafigi },
  { anahtar: 'uretim-emirleri-hurda-grafik', tur: 'grafik', baslik: 'Hurda oranı', simge: 'target', sira: 100, bolum: 'kalite', islem: ADIMLI_OKUMA_ISLEMLERI[0], veya: ADIMLI_OKUMA_ISLEMLERI, kaynak: HurdaOraniGrafigi },
  { anahtar: 'uretim-emirleri-durus-olcu', tur: 'gidisat', baslik: 'Duruş', simge: 'clock', sira: 210, islem: ADIMLI_OKUMA_ISLEMLERI[0], veya: ADIMLI_OKUMA_ISLEMLERI, kaynak: Durus },
];
