import type { SatinAlmaAnaliziCevabi, SatinAlmaSiparisDokumu } from '#paylasilan/sozlesme/satin-alma-analiz.ts';
import { tarihMetni } from '../../../ortak/veri/zaman-metni.ts';
import {
  ASAMA_ADLARI, BANT_ADLARI, bantDisiOrani, kategoriAdi, kuralDisiMetni, oncekiMetni, sapmaAltMetni, sureOzetiMetni, teklifAltMetni, tlMetni,
  tutarAltMetni, tutarMetni, yogunlasmaMetni, yuzdeMetni,
} from '../analiz/kurallar.ts';

// 2477 (2467 a): Raporlar, Analiz'in dışa aktarımıdır. Şablonlar Analiz cevabını (ve sipariş satırı dökümünü) sayfaya ve Excel'e dizer;
// hesap yapmaz. Ekran önizlemesi, PDF (yazdır) ve Excel aynı yapıdan çıkar.

export type HucreTuru = 'metin' | 'tl' | 'sayi' | 'yuzde' | 'tarih';
export type Hucre = string | number | null;
export interface RaporSutunu { ad: string; tur: HucreTuru }
export interface RaporBolumu { baslik: string; sutunlar: readonly RaporSutunu[]; satirlar: readonly (readonly Hucre[])[]; not?: string }
export interface Rapor { baslik: string; altBaslik: string; dosyaAdi: string; bolumler: readonly RaporBolumu[] }
export type RaporAnahtari = 'aylik' | 'tedarikci' | 'fiyat' | 'siparis';

export const RAPORLAR: readonly { anahtar: RaporAnahtari; baslik: string; aciklama: string; dipnot: string }[] = [
  {
    anahtar: 'aylik', baslik: 'Aylık yönetim raporu',
    aciklama: 'Özet ölçüler, aylık harcama, kategori dağılımı ve dikkat maddeleri. Yönetim toplantısı için tek sayfa.',
    dipnot: 'Ölçüler son 12 ayın; seçilen ayın yalnız harcaması yazılır.',
  },
  {
    anahtar: 'tedarikci', baslik: 'Tedarikçi dökümü',
    aciklama: 'Tedarikçi başına harcama ve payı, karne zamanında oranı ve puanı, tedarik süresi, ilk 1 ve ilk 3 yoğunlaşma.',
    dipnot: 'Sıra harcamaya göre; başarım yalnız firma karnesinden (2151-2 a).',
  },
  {
    anahtar: 'fiyat', baslik: 'Fiyat dökümü',
    aciklama: 'Hedefe göre sapma, bant dışı kalemler, son iki alışın fiyat ve kur etkisi.',
    dipnot: '₺ kalemde hedef, enflasyon endeksi girilince dolar.',
  },
  {
    anahtar: 'siparis', baslik: 'Sipariş satırları',
    aciklama: 'Dönemin bütün sipariş satırları: tarih, talep, birim, kategori, malzeme, tedarikçi, ₺ tutar.',
    dipnot: 'Ham veri; eski CSV indirmesinin yerine.',
  },
];
export const raporMu = (x: string | null): x is RaporAnahtari => RAPORLAR.some((r) => r.anahtar === x);

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'] as const;
export const ayAdi = (ay: string): string => `${AY_ADLARI[Number(ay.slice(5, 7)) - 1] ?? ''} ${ay.slice(0, 4)}`;
const oncekiAy = (ay: string): string => {
  const [y, a] = ay.split('-').map(Number) as [number, number];
  return a === 1 ? `${String(y - 1)}-12` : `${String(y)}-${String(a - 1).padStart(2, '0')}`;
};
export const donemMetni = (c: SatinAlmaAnaliziCevabi): string => `${tarihMetni(c.donem.bas)} - ${tarihMetni(c.donem.bit)}`;
const hesaplanan = (c: SatinAlmaAnaliziCevabi): string => `hesaplanan ${tarihMetni(c.hesaplanan.slice(0, 10))}`;

// Aylık raporda seçilebilen aylar: verisi olan aylar, yeniden eskiye. Varsayılan son tam ay (yoksa bu ay).
export function raporAylari(c: SatinAlmaAnaliziCevabi): string[] {
  return c.harcamaDagilimi.aylar.filter((a) => a.tutarTl !== null).map((a) => a.ay).reverse();
}
export function varsayilanAy(c: SatinAlmaAnaliziCevabi): string | null {
  const l = raporAylari(c);
  const buAy = c.donem.bit.slice(0, 7);
  return l.find((a) => a < buAy) ?? l[0] ?? null;
}

export function dikkatMaddeleri(c: SatinAlmaAnaliziCevabi): string[] {
  const a = c.asamaSureleri.tumu, s = c.fiyatSapmasi.donem.simdi, r = c.tedarikRiski;
  const darbogaz = a.darbogaz === null ? null : a.asamalar.find((x) => x.asama === a.darbogaz) ?? null;
  const l = [darbogaz === null
    ? `Darboğaz için yeterli veri yok: her aşamada en az ${String(c.asamaGereken)} talep gerekir.`
    : `Darboğaz: ${ASAMA_ADLARI[darbogaz.asama]}, ${sureOzetiMetni(darbogaz, c.asamaGereken)}.`];
  if (s.bantDisi > 0) l.push(`Hedef bandı dışında ${String(s.bantDisi)} sipariş satırı (eşik ±%${String(c.fiyatSapmasi.esikYuzde)}).`);
  if (r.teklif.hedefAlti > 0) l.push(`${String(r.teklif.hedefAlti)} talep en az ${String(c.kuralDisi.enAzTeklif)} teklifin altında siparişe döndü.`);
  if (r.tekKaynak.kalemSayisi > 0) l.push(`${String(r.tekKaynak.kalemSayisi)} kalem tek kaynağa bağlı.`);
  if (s.endeksYok > 0) l.push(`Enflasyon endeksi olmadığından ${String(s.endeksYok)} ₺ satırın hedef fiyatı hesaplanmadı.`);
  if (a.hataliAralik > 0) l.push(`${String(a.hataliAralik)} aşama aralığında tarih sırası bozuk; sayılmadı.`);
  return l;
}

export function aylikRapor(c: SatinAlmaAnaliziCevabi, ay: string): Rapor {
  const t = c.tasarruf, s = c.fiyatSapmasi.donem, k = c.kuralDisi.donem, a = c.asamaSureleri, d = c.harcamaDagilimi;
  const ayTutari = (x: string) => d.aylar.find((m) => m.ay === x)?.tutarTl ?? null;
  const once = oncekiAy(ay);
  const bantDisi = bantDisiOrani(s.simdi);
  const olcu = (ad: string, deger: string, aciklama: string): Hucre[] => [ad, deger, aciklama];
  return {
    baslik: `Satın alma aylık yönetim raporu · ${ayAdi(ay)}`,
    altBaslik: `Dönem ${donemMetni(c)} · ${hesaplanan(c)}`,
    dosyaAdi: `satin-alma-aylik-${ay}`,
    bolumler: [
      {
        baslik: 'Özet ölçüler', sutunlar: [{ ad: 'Ölçü', tur: 'metin' }, { ad: 'Değer', tur: 'metin' }, { ad: 'Açıklama', tur: 'metin' }],
        satirlar: [
          olcu(`${ayAdi(ay)} harcaması`, tlMetni(ayTutari(ay)), oncekiMetni(ayTutari(once) === null ? null : `${ayAdi(once)} ${tlMetni(ayTutari(once))}`)),
          olcu('Harcama (12 ay)', c.harcama.toplamTl === null ? 'Veri yok' : tlMetni(c.harcama.toplamTl), oncekiMetni(c.oncekiHarcamaTl === null ? null : tlMetni(c.oncekiHarcamaTl))),
          olcu('Son alışa göre fiyat farkı', tutarMetni(t.fiyatFarki.simdi), tutarAltMetni(t.fiyatFarki.simdi, 'satır; eksi gerçek azalma, kur etkisi hariç', t.fiyatFarki.onceki)),
          olcu('Kaçınılan maliyet', tutarMetni(t.kacinilan.simdi), tutarAltMetni(t.kacinilan.simdi, 'satır; en düşük öteki teklife göre', t.kacinilan.onceki)),
          olcu('Talepten tam teslime', sureOzetiMetni(a.tumu.toplam, c.asamaGereken), `${String(a.tumu.toplam.ornek)} talep`),
          olcu('Hedef dışı alım', bantDisi === null ? 'Veri yok' : yuzdeMetni(bantDisi), sapmaAltMetni(s.simdi)),
          olcu('Kural dışı alım (vekil)', kuralDisiMetni(k.simdi), 'tutar payı'),
          olcu('Talep başına teklif', c.tedarikRiski.teklif.ortanca === null ? 'Veri yok' : String(c.tedarikRiski.teklif.ortanca).replace('.', ','),
            teklifAltMetni(c.tedarikRiski.teklif, c.kuralDisi.enAzTeklif)),
          olcu('Tedarikçi yoğunlaşması', d.ilkBirPay === null ? 'Veri yok' : `${yuzdeMetni(d.ilkBirPay)} / ${yuzdeMetni(d.ilkUcPay)}`, yogunlasmaMetni(d)),
        ],
      },
      {
        baslik: 'Aylık harcama', sutunlar: [{ ad: 'Ay', tur: 'metin' }, { ad: 'Harcama (₺)', tur: 'tl' }],
        satirlar: d.aylar.map((m) => [ayAdi(m.ay), m.tutarTl]), not: 'Bu ay sürüyor; ilk siparişten önceki ay boştur.',
      },
      {
        baslik: 'Kategoriye göre (12 ay)', sutunlar: [{ ad: 'Kategori', tur: 'metin' }, { ad: 'Harcama (₺)', tur: 'tl' }, { ad: 'Pay', tur: 'yuzde' }],
        satirlar: d.kategoriler.slice(0, 10).map((x) => [kategoriAdi(x.ad), x.tutarTl, x.pay]),
      },
      { baslik: 'Dikkat', sutunlar: [{ ad: 'Madde', tur: 'metin' }], satirlar: dikkatMaddeleri(c).map((m) => [m]) },
    ],
  };
}

export function tedarikciRaporu(c: SatinAlmaAnaliziCevabi): Rapor {
  const basarim = new Map(c.tedarikciler.map((t) => [`f:${String(t.firmaId)}`, t]));
  return {
    baslik: 'Tedarikçi dökümü', altBaslik: `Dönem ${donemMetni(c)} · ${hesaplanan(c)}`, dosyaAdi: `satin-alma-tedarikci-${c.donem.bit}`,
    bolumler: [{
      baslik: 'Tedarikçiler (harcamaya göre)',
      sutunlar: [
        { ad: 'Tedarikçi', tur: 'metin' }, { ad: 'Harcama (₺)', tur: 'tl' }, { ad: 'Pay', tur: 'yuzde' }, { ad: 'Sipariş satırı (24 ay)', tur: 'sayi' },
        { ad: 'Zamanında (karne)', tur: 'yuzde' }, { ad: 'Karne puanı', tur: 'yuzde' }, { ad: 'Sınıf', tur: 'metin' },
        { ad: 'Tedarik süresi ortanca (gün)', tur: 'sayi' }, { ad: 'Tedarik süresi P80 (gün)', tur: 'sayi' },
      ],
      satirlar: c.harcamaDagilimi.tedarikciler.map((x) => {
        const b = basarim.get(x.anahtar);
        return [
          x.ad, x.tutarTl, x.pay, b?.siparisSatiri ?? null, b?.karne?.zamanindaOran ?? null, b?.karne?.puan ?? null, b?.karne?.sinif ?? null,
          b?.tedarikSuresi.ortancaGun ?? null, b?.tedarikSuresi.yuzde80Gun ?? null,
        ];
      }),
      not: `${yogunlasmaMetni(c.harcamaDagilimi)} Karne yetersiz veride puan vermez; boş hücre veri yok demektir. Firmaya bağlı olmayan teklifin karnesi yoktur.`,
    }],
  };
}

export function fiyatRaporu(c: SatinAlmaAnaliziCevabi): Rapor {
  const f = c.fiyatSapmasi;
  return {
    baslik: 'Fiyat dökümü', altBaslik: `Dönem ${donemMetni(c)} · ${hesaplanan(c)}`, dosyaAdi: `satin-alma-fiyat-${c.donem.bit}`,
    bolumler: [
      {
        baslik: 'Hedefe göre sapma (en büyük)',
        sutunlar: [
          { ad: 'Malzeme', tur: 'metin' }, { ad: 'Sipariş', tur: 'tarih' }, { ad: 'Para birimi', tur: 'metin' }, { ad: 'Hedef birim', tur: 'sayi' },
          { ad: 'Fiili birim', tur: 'sayi' }, { ad: 'Fark', tur: 'yuzde' }, { ad: 'Sapma (₺)', tur: 'tl' }, { ad: 'Kur etkisi (₺)', tur: 'tl' }, { ad: 'Bant', tur: 'metin' },
        ],
        satirlar: f.kalemler.map((x) => [x.ad, x.siparisTarihi, x.paraBirimi, x.hedef, x.fiili, x.farkYuzde, x.sapmaTl, x.kurEtkisiTl, BANT_ADLARI[x.bant]]),
        not: `Bant ±%${String(f.esikYuzde)}. ${sapmaAltMetni(f.donem.simdi)}.`,
      },
      {
        baslik: 'Son iki alış',
        sutunlar: [
          { ad: 'Malzeme', tur: 'metin' }, { ad: 'Para birimi', tur: 'metin' }, { ad: 'Önceki tarih', tur: 'tarih' }, { ad: 'Önceki birim', tur: 'sayi' },
          { ad: 'Son tarih', tur: 'tarih' }, { ad: 'Son birim', tur: 'sayi' }, { ad: 'Birim değişim (₺)', tur: 'sayi' }, { ad: 'Değişim', tur: 'yuzde' },
          { ad: 'Fiyat etkisi (₺)', tur: 'sayi' }, { ad: 'Kur etkisi (₺)', tur: 'sayi' },
        ],
        satirlar: c.fiyatDegisimleri.map((x) => [
          x.ad, x.paraBirimi, x.onceki.tarih, x.onceki.birimFiyat, x.son.tarih, x.son.birimFiyat, x.degisimTl, x.degisimYuzde, x.fiyatEtkisiTl,
          x.paraBirimi === 'TRY' ? null : x.kurEtkisiTl,
        ]),
        not: 'Fiyat etkisi (yeni kurla) ve kur etkisi (eski fiyatla) toplamı değişime eşittir. İskonto düşülmüştür.',
      },
    ],
  };
}

export function siparisRaporu(d: SatinAlmaSiparisDokumu): Rapor {
  const kursuz = d.satirlar.filter((x) => x.tutarTl === null).length;
  return {
    baslik: 'Sipariş satırları', altBaslik: `Dönem ${tarihMetni(d.basTarih)} - ${tarihMetni(d.bitTarih)} · ${String(d.satirlar.length)} satır`,
    dosyaAdi: `satin-alma-siparis-satirlari-${d.bitTarih}`,
    bolumler: [{
      baslik: 'Sipariş satırları',
      sutunlar: [
        { ad: 'Tarih', tur: 'tarih' }, { ad: 'Talep', tur: 'metin' }, { ad: 'Birim', tur: 'metin' }, { ad: 'Kategori', tur: 'metin' },
        { ad: 'Malzeme', tur: 'metin' }, { ad: 'Tedarikçi', tur: 'metin' }, { ad: 'Tutar (₺)', tur: 'tl' },
      ],
      satirlar: d.satirlar.map((x) => [x.siparisTarihi, x.talepNo, x.birim, kategoriAdi(x.kategori), x.malzeme, x.tedarikci, x.tutarTl]),
      not: `KDV ve masraf hariç, iskonto dahil, sipariş günü kuruyla.${kursuz > 0 ? ` Kuru girilmemiş ${String(kursuz)} döviz satırının tutarı boş.` : ''}`,
    }],
  };
}

// Önizleme ve PDF hücresi; Excel sayıyı sayı olarak yazar (excel.ts).
export function hucreMetni(h: Hucre, tur: HucreTuru): string {
  if (h === null || h === '') return '-';
  if (typeof h === 'string') return tur === 'tarih' ? tarihMetni(h) : h;
  if (tur === 'tl') return tlMetni(h);
  if (tur === 'yuzde') return yuzdeMetni(h);
  return h.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}
