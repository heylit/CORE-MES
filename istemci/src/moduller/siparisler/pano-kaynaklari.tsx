import { useQuery } from '@tanstack/react-query';
import type { GidisatOlcusu, IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import type { SiparisListesiCevabi, SiparisOzetiCevabi, TerminAraligi, TerminDagilimiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { CubukGrafikKarti, YatayCubukKarti, type KategoriSatiri } from '../../ortak/arayuz/grafik/grafikler.tsx';
import { useKaynakBildir } from '../../ortak/arayuz/pano-baglami.ts';
import type { AnaSayfaKaynagi } from '../../ortak/rota/ana-sayfa.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { tarihMetni } from './gorunum.ts';

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

// 3773 b: onay bekleyen taslak, onaylama yetkisi olanın İşlerim listesinde; liste ucu okunur, yeni uç yok. Taslağı açan onaylayabiliyorsa
// kendi taslağı da çıkar (onay kuralı değişmez). Erken termin önce gelir; termin tarihtir, gün başı fabrikanın saatiyle (tek sunucu, +03:00).
type TaslakSatiri = Pick<SiparisListesiCevabi['satirlar'][number], 'id' | 'no' | 'firmaId' | 'firmaAd' | 'termin' | 'olusturma'>;
const GUN_MS = 86_400_000;
export function onayBekleyenKalemleri(satirlar: readonly TaslakSatiri[], simdi: number): IsKalemi[] {
  return satirlar.map((s) => {
    const gun = Math.max(0, Math.floor((simdi - Date.parse(s.olusturma)) / GUN_MS));
    return {
      anahtar: `taslak-${s.id}`, baslik: `${s.no} · ${s.firmaAd ?? `Firma ${s.firmaId}`}`,
      ayrinti: `Onay bekleyen sipariş · termin ${tarihMetni(s.termin)} · ${gun === 0 ? 'bugün açıldı' : `${sayi(gun)} gündür taslak`}`,
      aciliyet: 'bekliyor', sonTarih: `${s.termin}T00:00:00+03:00`, yol: `/siparisler/${s.id}`, eylem: 'Aç', neden: 'Onaylanmadan proje ve üretim emri açılmaz.',
    };
  });
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
function OnayBekleyen() {
  const l = useQuery({
    queryKey: [...anahtarlar.ozet, 'onay-bekleyen'],
    queryFn: () => api.get<SiparisListesiCevabi>('/siparisler?durum=taslak&arsiv=hayir&sirala=termin&yon=artan&sayfaBoyu=50'),
  });
  useKaynakBildir(l.isError ? null : l.data === undefined ? undefined : onayBekleyenKalemleri(l.data.satirlar, Date.now()));
  return null;
}
function Aylik() {
  const o = useOzet();
  useKaynakBildir(o.isError ? null : o.data === undefined ? undefined : aylikOlcu(o.data));
  return null;
}

// Grafikler (kart 1773). Termin aralıkları doğal sırasıyla (gecikmişten uzağa) çizilir.
const ARALIK_ADI: Readonly<Record<TerminAraligi, string>> = { gecikmis: 'Gecikmiş', '0-3': '0-3 gün', '4-7': '4-7 gün', '8-14': '8-14 gün', '15+': '15 gün ve sonrası' };
export function terminSatirlari(c: TerminDagilimiCevabi): KategoriSatiri[] {
  return c.araliklar.map((a) => ({ etiket: ARALIK_ADI[a.aralik], deger: a.sayi }));
}
const ayEtiketi = (ay: string): string => `${ay.slice(5)}.${ay.slice(2, 4)}`;

function TerminGrafigi() {
  const s = useQuery({ queryKey: [...anahtarlar.ozet, 'termin-dagilimi'], queryFn: () => api.get<TerminDagilimiCevabi>('/siparisler/termin-dagilimi') });
  const satirlar = s.data === undefined ? [] : terminSatirlari(s.data);
  return (
    <YatayCubukKarti baslik="Açık siparişler, termine kalan" alt="Onaylı sipariş sayısı; dönemden bağımsız, bugüne göre" simge="truck" yol="/siparisler" siralama={false}
      hata={s.isError} yuklendi={s.data !== undefined} satirlar={satirlar.every((x) => x.deger === 0) ? [] : satirlar} bicim={(n) => `${sayi(n)} sipariş`} />
  );
}
function AylikGrafik() {
  const o = useOzet();
  return (
    <CubukGrafikKarti baslik="Aylık sipariş" alt="Son 6 ay; onaylanan ve kapanan sipariş" simge="chart" yol="/siparisler"
      hata={o.isError} yuklendi={o.data !== undefined} etiketler={o.data?.aylik.map((a) => ayEtiketi(a.ay)) ?? []} bicim={(n) => `${sayi(n)} sipariş`}
      seriler={[{ ad: 'Sipariş', degerler: o.data?.aylik.map((a) => a.sayi) ?? [] }]} />
  );
}

export const anaSayfaKaynaklari: AnaSayfaKaynagi[] = [
  { anahtar: 'siparisler-onay-is', tur: 'is', baslik: 'Sipariş onayı', simge: 'check', sira: 140, islem: 'siparisler.onayla', yolunda: 'Onay bekleyen sipariş yok', kaynak: OnayBekleyen },
  { anahtar: 'siparisler-termin-is', tur: 'is', baslik: 'Termin', simge: 'clock', sira: 150, islem: 'siparisler.oku', yolunda: 'Termini geçen sipariş yok', kaynak: Termin },
  { anahtar: 'siparisler-aylik-olcu', tur: 'gidisat', baslik: 'Sipariş', simge: 'chart', sira: 500, islem: 'siparisler.oku', kaynak: Aylik },
  { anahtar: 'siparisler-termin-grafik', tur: 'grafik', baslik: 'Termin', simge: 'truck', sira: 100, bolum: 'teslim', anaSayfada: true, islem: 'siparisler.oku', kaynak: TerminGrafigi },
  { anahtar: 'siparisler-aylik-grafik', tur: 'grafik', baslik: 'Aylık sipariş', simge: 'chart', sira: 200, bolum: 'teslim', islem: 'siparisler.oku', kaynak: AylikGrafik },
];
