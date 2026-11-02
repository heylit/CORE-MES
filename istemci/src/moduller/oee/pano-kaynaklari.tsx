import { useQuery } from '@tanstack/react-query';
import type { OeeCevabi } from '#paylasilan/sozlesme/oee.ts';
import type { GidisatOlcusu } from '#paylasilan/sozlesme/pano.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { YatayCubukKarti, sayi as grafikSayi, type KategoriSatiri } from '../../ortak/arayuz/grafik/grafikler.tsx';
import { useKaynakBildir } from '../../ortak/arayuz/pano-baglami.ts';
import type { AnaSayfaKaynagi, GrafikOzellikleri } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

const GUN_MS = 86_400_000;
const yuzde = (x: number | null): number | null => (x === null ? null : Math.round(x * 1000) / 10);

// Son 7 gün (OEE sayfasının varsayılanı, aynı sorgu anahtarı). Hesaplanamayan değer null kalır; iş merkezleri dağılımdır.
export function oeeOlculeri(c: OeeCevabi): GidisatOlcusu[] {
  const dagilim = c.isMerkezleri.flatMap((m) => (m.oee === null ? [] : [{ etiket: m.ad, deger: yuzde(m.oee) ?? 0 }]));
  return [
    { anahtar: 'tesis-oee', ad: 'Tesis OEE, son 7 gün', deger: yuzde(c.tesis.oee), birim: '%', kiyas: null, plan: null, seri: [], dagilim: [] },
    ...(dagilim.length > 0 ? [{ anahtar: 'is-merkezi-oee', ad: 'İş merkezi OEE, son 7 gün', deger: null, birim: '%', kiyas: null, plan: null, seri: [], dagilim }] : []),
  ];
}

function Oee() {
  const bas = tesisGunu(Date.now() - 6 * GUN_MS);
  const bit = tesisGunu(Date.now());
  const s = useQuery({ queryKey: anahtarlar.oee(bas, bit), queryFn: () => api.get<OeeCevabi>(`/oee?baslangic=${bas}&bitis=${bit}`) });
  useKaynakBildir(s.isError ? null : s.data === undefined ? undefined : oeeOlculeri(s.data));
  return null;
}

// Grafikler (kart 1773): dönem OEE sayfasıyla aynı uçtan; hesaplanamayan (null) satır çizilmez, sıfır sayılmaz.
const useOeeDonemi = (gun: number) => {
  const bas = tesisGunu(Date.now() - (gun - 1) * GUN_MS);
  const bit = tesisGunu(Date.now());
  return useQuery({ queryKey: anahtarlar.oee(bas, bit), queryFn: () => api.get<OeeCevabi>(`/oee?baslangic=${bas}&bitis=${bit}`) });
};
const yuzdeBicimi = (n: number): string => `%${grafikSayi(n)}`;

export function isMerkeziSatirlari(c: OeeCevabi): KategoriSatiri[] {
  return c.isMerkezleri.flatMap((m) => (m.oee === null ? [] : [{ etiket: m.ad, deger: yuzde(m.oee) ?? 0, yol: '/oee' }]));
}
export function bilesenSatirlari(c: OeeCevabi): KategoriSatiri[] {
  const t = c.tesis;
  return ([['Kullanılabilirlik', t.kullanilabilirlik], ['Performans', t.performans], ['Kalite', t.kalite], ['OEE', t.oee]] as const)
    .flatMap(([etiket, v]) => (v === null ? [] : [{ etiket, deger: yuzde(v) ?? 0 }]));
}
// En düşük OEE'li makineler: iyileştirme nereden başlar sorusunun cevabı.
export function dusukMakineSatirlari(c: OeeCevabi, sinir = 8): KategoriSatiri[] {
  return c.makineler.filter((m) => m.oee !== null).sort((a, b) => (a.oee ?? 0) - (b.oee ?? 0)).slice(0, sinir)
    .map((m) => ({ etiket: `${m.kod} ${m.ad}`, deger: yuzde(m.oee) ?? 0, yol: '/oee/makineler' }));
}

function IsMerkeziGrafigi({ gun = 7 }: GrafikOzellikleri) {
  const s = useOeeDonemi(gun);
  return (
    <YatayCubukKarti baslik="OEE, iş merkezine göre" alt={`Son ${gun} gün`} simge="gauge" yol="/oee" tavan={100} bicim={yuzdeBicimi}
      hata={s.isError} yuklendi={s.data !== undefined} satirlar={s.data === undefined ? [] : isMerkeziSatirlari(s.data)} />
  );
}
function BilesenGrafigi({ gun = 30 }: GrafikOzellikleri) {
  const s = useOeeDonemi(gun);
  return (
    <YatayCubukKarti baslik="OEE bileşenleri, tesis" alt={`Son ${gun} gün; OEE üçünün çarpımıdır`} simge="gauge" tavan={100} siralama={false} bicim={yuzdeBicimi}
      hata={s.isError} yuklendi={s.data !== undefined} satirlar={s.data === undefined ? [] : bilesenSatirlari(s.data)} />
  );
}
function DusukMakineGrafigi({ gun = 30 }: GrafikOzellikleri) {
  const s = useOeeDonemi(gun);
  return (
    <YatayCubukKarti baslik="En düşük OEE'li makineler" alt={`Son ${gun} gün; en çok 8 makine`} simge="cpu" yol="/oee/makineler" tavan={100} siralama={false} bicim={yuzdeBicimi}
      hata={s.isError} yuklendi={s.data !== undefined} satirlar={s.data === undefined ? [] : dusukMakineSatirlari(s.data)} />
  );
}

export const anaSayfaKaynaklari: AnaSayfaKaynagi[] = [
  { anahtar: 'oee-olcu', tur: 'gidisat', baslik: 'OEE', simge: 'gauge', sira: 400, islem: 'oee.oku', kaynak: Oee },
  { anahtar: 'oee-is-merkezi-grafik', tur: 'grafik', baslik: 'OEE, iş merkezi', simge: 'gauge', sira: 200, bolum: 'uretim', anaSayfada: true, islem: 'oee.oku', kaynak: IsMerkeziGrafigi },
  { anahtar: 'oee-bilesen-grafik', tur: 'grafik', baslik: 'OEE bileşenleri', simge: 'gauge', sira: 210, bolum: 'uretim', islem: 'oee.oku', kaynak: BilesenGrafigi },
  { anahtar: 'oee-makine-grafik', tur: 'grafik', baslik: 'Makine OEE', simge: 'cpu', sira: 200, bolum: 'makine', islem: 'oee.oku', kaynak: DusukMakineGrafigi },
];
