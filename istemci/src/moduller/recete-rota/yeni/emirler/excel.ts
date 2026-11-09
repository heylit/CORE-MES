// Excel ile toplu emir (2627): "Yeni üretim emri" formunun alanları. Her satır yeni emirdir; ürünün yürürlükteki rotasından açılır
// (`/rota/emre-kopyala-toplu`, tek transaction). Bölme, çok katmanlı emir ve sipariş satırı seçimi sayfada tek tek yapılır.
import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { EmreKopyalaTopluCevabi, EmreKopyalaTopluSatiri } from '#paylasilan/sozlesme/rota.ts';
import { YazimReddi, gonderimNumaralari, sayfaTanimi, type ExcelTanimi, type PlanSatiri } from '../../../../ortak/excel/kurallar.ts';
import { api } from '../../../../ortak/veri/api.ts';
import type { RrDurumu } from '../veri.ts';
import { ONCELIK_ADI, yururlukteRevizyonId } from './kurallar.ts';

export const EMIR_SAYFASI = 'Emirler';
// Sunucunun toplu emir sınırı (rota sözleşmesi EMIR_TOPLU_EN_COK); emir başına iş emirleri açıldığı için genel sınırdan küçüktür.
export const EMIR_EXCEL_EN_COK = 200;

export interface EmirExcelKaynagi {
  // Ürün kodundan kimliğe; yalnız yürürlükte rotası olan ve kullanımdaki ürünler.
  urunler: ReadonlyMap<string, number>;
  projeler: ReadonlyMap<string, number>;
}

export function emirKaynagi(d: RrDurumu, secenekler: AcilisSecenekleri | null): EmirExcelKaynagi {
  const urunler = new Map((d.items ?? [])
    .filter((i) => i.aktif && (i.type === 'mamul' || i.type === 'yari') && yururlukteRevizyonId(d, i.id) !== null)
    .map((i) => [i.code.toLocaleUpperCase('tr-TR'), Number(i.id)] as const));
  const projeler = new Map((secenekler?.projeler ?? []).map((p) => [p.kod.toLocaleUpperCase('tr-TR'), p.id] as const));
  return { urunler, projeler };
}

// Aynı ürün, miktar ve teslimle açık (bitmemiş, iptal edilmemiş) emir: aynı dosyanın değiştirilip yeniden yüklenmesi ya da
// elle açılmış emrin Excel'de tekrarı olabilir. Bazen gerçekten ikinci emir gerekir; bu yüzden uyarıdır, yazımı durdurmaz.
export function acikEmirAnahtarlari(d: RrDurumu): ReadonlySet<string> {
  const kodu = new Map((d.items ?? []).map((i) => [i.id, i.code.toLocaleUpperCase('tr-TR')] as const));
  return new Set((d.emirler?.orders ?? []).filter((o) => o.status !== 'tamam' && o.status !== 'iptal' && o.due !== null)
    .map((o) => `${kodu.get(o.itemId) ?? ''}|${String(o.qty)}|${(o.due ?? '').slice(0, 10)}`));
}

export function emirTanimi(d: RrDurumu, secenekler: AcilisSecenekleri | null): ExcelTanimi {
  const acik = acikEmirAnahtarlari(d);
  const urunListesi = (d.items ?? []).filter((i) => i.aktif && (i.type === 'mamul' || i.type === 'yari') && yururlukteRevizyonId(d, i.id) !== null)
    .map((i) => ({ kod: i.code, ad: i.name }));
  return {
    ad: 'uretim-emirleri', baslik: 'Yeni üretim emirleri',
    kilavuz: [
      'Her satır yeni bir üretim emridir; ürünün yürürlükteki rotasından açılır. Listede yalnız yürürlükte rotası olan ürünler vardır.',
      'Tek satır reddedilirse hiçbir emir açılmaz. Bir dosyada en çok 200 emir açılır.',
      'Proje, stoğa üretim, rework ve bakım-deneme dışındaki türlerde zorunludur. Sipariş satırı projede tekse sunucu bağlar.',
      'Bölme ve çok katmanlı emir sayfadaki formdan yapılır.',
      ...(urunListesi.length === 0 ? ['Yürürlükte rotası olan ürün yok: önce Ürün ve rotalar sayfasında rotayı yürürlüğe alın.'] : []),
    ],
    // Boş "Stoktan rezerve" Evet sayılır; kaç emrin stok ayıracağı yazım onayından önce görünür (Veri N1).
    ozet: (gidecek) => {
      const n = gidecek.filter((p) => p.degerler['rezerve'] !== false).length;
      return n === 0 ? null : `${String(n)} emir stoktan rezerve ayıracak (Stoktan rezerve sütunu Evet ya da boş).`;
    },
    sayfalar: [sayfaTanimi<never>({
      ad: EMIR_SAYFASI, kayitTuru: 'emir', anahtarSutun: '', kayitlar: [], anahtar: () => '',
      sutunlar: [
        { anahtar: 'urun', baslik: 'Ürün', tur: 'liste', zorunlu: true, liste: urunListesi, genislik: 32 },
        { anahtar: 'adet', baslik: 'Miktar', tur: 'sayi', zorunlu: true },
        { anahtar: 'baslangic', baslik: 'Başlangıç', tur: 'tarih', zorunlu: true },
        { anahtar: 'teslim', baslik: 'Teslim', tur: 'tarih', zorunlu: true },
        { anahtar: 'oncelik', baslik: 'Öncelik', tur: 'liste', liste: Object.entries(ONCELIK_ADI).map(([kod, ad]) => ({ kod, ad })), not: 'Boşsa Normal.' },
        { anahtar: 'durum', baslik: 'Durum', tur: 'liste', liste: [{ kod: 'serbest', ad: 'Planlı (plana girer)' }, { kod: 'taslak', ad: 'Taslak' }], not: 'Boşsa Planlı.' },
        { anahtar: 'tur', baslik: 'Emir türü', tur: 'liste', liste: Object.entries(EMIR_TURU_ADLARI).map(([kod, ad]) => ({ kod, ad })), not: 'Boşsa Seri.' },
        { anahtar: 'proje', baslik: 'Proje', tur: 'liste', liste: (secenekler?.projeler ?? []).map((p) => ({ kod: p.kod, ad: p.ad })), genislik: 28 },
        { anahtar: 'rezerve', baslik: 'Stoktan rezerve', tur: 'evet-hayir', not: 'Boşsa Evet (formdaki gibi).' },
        { anahtar: 'aciklama', baslik: 'Açıklama', tur: 'metin', enUzun: 300, genislik: 36 },
      ],
      satir: () => ({}),
      uyari: (v) => (acik.has(`${String(v['urun']).toLocaleUpperCase('tr-TR')}|${String(v['adet'])}|${String(v['teslim'])}`)
        ? 'Aynı ürün, miktar ve teslimle açık emir var.' : null),
    })],
  };
}

// Plan satırı sözleşmenin satırına çevrilir; boş alan formun varsayılanını alır.
export function emirSatiri(p: PlanSatiri, satir: number, k: EmirExcelKaynagi): EmreKopyalaTopluSatiri {
  const d = p.degerler;
  const urunId = k.urunler.get(String(d['urun']).toLocaleUpperCase('tr-TR'));
  if (urunId === undefined) throw new YazimReddi(`${p.sayfa} sayfası, ${String(p.satir)}. satır: ürün bulunamadı.`);
  const projeId = typeof d['proje'] === 'string' ? k.projeler.get(d['proje'].toLocaleUpperCase('tr-TR')) : undefined;
  return {
    satir, urunId, adet: Number(d['adet']), baslangic: String(d['baslangic']), teslim: String(d['teslim']),
    oncelik: d['oncelik'] === undefined ? 3 : Number(d['oncelik']),
    ...(d['durum'] === 'taslak' ? { taslak: true } : {}),
    ...(typeof d['tur'] === 'string' ? { emirTuru: d['tur'] as EmreKopyalaTopluSatiri['emirTuru'] } : {}),
    ...(projeId === undefined ? {} : { projeId }),
    ...(d['rezerve'] === false ? {} : { stoktanRezerve: true }),
    ...(typeof d['aciklama'] === 'string' ? { aciklama: d['aciklama'] } : {}),
  };
}

export async function emirYaz(satirlar: readonly PlanSatiri[], istekKimligi: string, k: EmirExcelKaynagi): Promise<EmreKopyalaTopluCevabi> {
  if (satirlar.length > EMIR_EXCEL_EN_COK) throw new YazimReddi(`Bir dosyada en çok ${String(EMIR_EXCEL_EN_COK)} emir açılır; dosyayı bölün.`);
  const kesirli = satirlar.find((p) => !Number.isInteger(p.degerler['adet']) || Number(p.degerler['adet']) <= 0);
  if (kesirli) throw new YazimReddi(`${kesirli.sayfa} sayfası, ${String(kesirli.satir)}. satır: miktar sıfırdan büyük tam sayı olmalı.`);
  const no = gonderimNumaralari(satirlar);
  return api.post<EmreKopyalaTopluCevabi>('/rota/emre-kopyala-toplu', { satirlar: satirlar.map((p, i) => emirSatiri(p, no[i] ?? i + 1, k)) }, { istekKimligi });
}
