import type { Islem } from '#paylasilan/islemler.ts';
import type { PlanlanabilirlikCevabi } from '#paylasilan/sozlesme/plan.ts';
import { NEDEN_DUZELTME_YERI, type DuzeltmeYeri, type PlanlanamamaNedeni } from '#paylasilan/sozlesme/planlanamama-sabitleri.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { RozetTonu } from '../../../../ortak/arayuz/index.ts';
import type { SekmeAnahtari } from '../sekmeler.ts';

// Planlanabilirlik sayfasının saf kuralları (2779, 2781): kontrolleri sunucu ölçer (plan modülü, 2780 ile aynı kurallar); ekran yalnız
// adlandırır, kök nedenleri sayar, öncül zincirini katlar ve düzeltme yerini kendi sayfa adresine çevirir.

export type Emir = PlanlanabilirlikCevabi['emirler'][number];
export type Adim = Emir['adimlar'][number];
export type Kontrol = Adim['kontroller'][number];

// Kontrol satırının adı (soru biçiminde değil, neyin ölçüldüğü). Kod listesi sözleşmedendir; eksik ad tip hatasıdır.
export const KONTROL_ADLARI: Readonly<Record<PlanlanamamaNedeni, string>> = {
  'sure-bos': 'Adım süresi',
  'istasyon-yok': 'Rotada istasyon',
  'istasyon-pasif': 'İstasyon kullanımda',
  'makine-yok': 'İstasyonda aktif makine',
  'makine-pasif': 'Seçili makine kullanımda',
  'kisi-pasif': 'Seçili kişi kullanımda',
  'yetkin-kisi-yok': 'İstasyonda yetkin kişi',
  'kisi-vardiyasiz': 'Yetkin kişinin vardiyası',
  'takvim-yok': 'Tezgâhın vardiya takvimi',
  'insanli-makine': 'İnsanlı istasyonda makine seçimi',
  malzeme: 'Malzeme ufukta',
  oncul: 'Önceki adım',
  ufuk: 'Ufuk ve kapasite',
  'rotada-yok': 'Adım yürürlükteki rotada',
  bolunmus: 'Bölünmüş iş',
  'elle-sirali': 'Elle sıralı iş',
  'ek-adaysiz': 'Ek adımın tezgâhı',
  'bagli-parti': 'Bağlı parti',
  'yetki-disi': 'Kaynak yetkinizde',
  'emir-beklemede': 'Emir bekletilmemiş',
  bilinmiyor: 'Diğer',
};

// Üst özetin ve kök sütununun kısa adı: eksik olan şey.
export const NEDEN_ADLARI: Readonly<Record<PlanlanamamaNedeni, string>> = {
  'sure-bos': 'Süre boş',
  'istasyon-yok': 'İstasyon seçilmemiş',
  'istasyon-pasif': 'İstasyon pasif',
  'makine-yok': 'Aktif makine yok',
  'makine-pasif': 'Makine pasif',
  'kisi-pasif': 'Kişi pasif',
  'yetkin-kisi-yok': 'Yetkin kişi yok',
  'kisi-vardiyasiz': 'Kişi vardiyası yok',
  'takvim-yok': 'Tezgâh takvimi yok',
  'insanli-makine': 'İnsanlı istasyonda makine',
  malzeme: 'Malzeme yok',
  oncul: 'Başka işi bekliyor',
  ufuk: 'Ufukta yer yok',
  'rotada-yok': 'Rotada yok',
  bolunmus: 'Bölünmüş iş',
  'elle-sirali': 'Elle sıralı iş',
  'ek-adaysiz': 'Ek adımın tezgâhı yok',
  'bagli-parti': 'Bağlı parti bekliyor',
  'yetki-disi': 'Yetki dışı kaynak',
  'emir-beklemede': 'Emir beklemede',
  bilinmiyor: 'Neden ölçülemedi',
};

export const DURUM_GOSTERIMI: Readonly<Record<Kontrol['durum'], { ad: string; simge: SimgeAdi; ton: RozetTonu }>> = {
  tamam: { ad: 'Tamam', simge: 'check', ton: 'tamam' },
  eksik: { ad: 'Eksik', simge: 'x', ton: 'hata' },
  olculemedi: { ad: 'Ölçülemedi', simge: 'help', ton: 'pasif' },
};

// Kök neden: emrin zincir dışı (öncül olmayan) adımları. Öncül bekleyen adımın kökü zincirin başındaki adımdadır, sayılmaz; ama emrin
// hiçbir adımı kök değilse ve zincir emrin dışında başlıyorsa (başka emir ya da bilinmeyen öncül) emrin nedeni 'oncul'dur.
export function kokAdimlar(e: Emir): Adim[] {
  const kok = e.adimlar.filter((a) => a.kok !== null && a.kok !== 'oncul');
  return kok.length > 0 ? kok : e.adimlar.filter((a) => a.kok === 'oncul' && (baskaEmir(a, e.emirNo) !== null || a.bekledigiOp === null));
}

export interface OzetSatiri { kod: PlanlanamamaNedeni; emir: number; adim: number }
// Üst özet (2781 2/2 a): neden türü başına kaç emir ve kaç adım. Bir emir birden çok türde sayılabilir; en çok emri etkileyen önce.
export function ozet(emirler: readonly Emir[]): OzetSatiri[] {
  const s = new Map<PlanlanamamaNedeni, { emir: Set<number>; adim: number }>();
  for (const e of emirler) {
    for (const a of kokAdimlar(e)) {
      const kod = a.kok as PlanlanamamaNedeni;
      const x = s.get(kod) ?? { emir: new Set<number>(), adim: 0 };
      x.emir.add(e.uretimEmriId);
      x.adim += 1;
      s.set(kod, x);
    }
  }
  return [...s].map(([kod, x]) => ({ kod, emir: x.emir.size, adim: x.adim }))
    .sort((a, b) => b.emir - a.emir || b.adim - a.adim || NEDEN_ADLARI[a.kod].localeCompare(NEDEN_ADLARI[b.kod], 'tr'));
}

export function emirNedenleri(e: Emir): PlanlanamamaNedeni[] {
  return [...new Set(kokAdimlar(e).map((a) => a.kok as PlanlanamamaNedeni))];
}

export function suzgeceUyar(e: Emir, kod: PlanlanamamaNedeni | null): boolean {
  return kod === null || kokAdimlar(e).some((a) => a.kok === kod);
}

// Adımlar ekranda iki türdür: kendi eksiği olan (kontrolleriyle) ve zincirde bekleyen (kök adıma göre tek satırda toplanır).
// bekledigiEmirNo aynı emirde emrin kendi numarasıdır (bağlı partide öteki emrin, rota sekmesinde null; Mimar 2779-2780): yalnız başka
// emrin numarası satıra yazılır.
const baskaEmir = (a: Adim, emirNo: string | null): string | null => (a.bekledigiEmirNo === null || a.bekledigiEmirNo === emirNo ? null : a.bekledigiEmirNo);

export type AdimSatiri = { tur: 'kok'; adim: Adim } | { tur: 'zincir'; bekledigiEmirNo: string | null; bekledigiOp: number | null; oplar: number[] };
export function adimSatirlari(adimlar: readonly Adim[], emirNo: string | null): AdimSatiri[] {
  const sirali = [...adimlar].sort((a, b) => a.opNo - b.opNo);
  const zincir = new Map<string, number[]>();
  const sonuc: AdimSatiri[] = [];
  for (const a of sirali) {
    if (a.kok === 'oncul') {
      const bekledigiEmirNo = baskaEmir(a, emirNo);
      const anahtar = `${bekledigiEmirNo ?? ''}|${String(a.bekledigiOp)}`;
      const l = zincir.get(anahtar);
      if (l) { l.push(a.opNo); continue; }
      const yeni = [a.opNo];
      zincir.set(anahtar, yeni);
      sonuc.push({ tur: 'zincir', bekledigiEmirNo, bekledigiOp: a.bekledigiOp, oplar: yeni });
    } else {
      sonuc.push({ tur: 'kok', adim: a });
    }
  }
  return sonuc;
}

export function zincirMetni(s: Extract<AdimSatiri, { tur: 'zincir' }>): string {
  const op = s.oplar.length === 1 ? `OP ${String(s.oplar[0])}` : `OP ${s.oplar.join(', ')}`;
  if (s.bekledigiEmirNo !== null) return `${op}: ${s.bekledigiEmirNo}${s.bekledigiOp === null ? '' : ` OP ${String(s.bekledigiOp)}`} bekleniyor`;
  return s.bekledigiOp === null ? `${op}: önceki adım yerleşmedi` : `${op}: OP ${String(s.bekledigiOp)} düzelince yerleşir`;
}

// Rota sekmesi: eksik kontrolü olan adımlar (rota cevabı bütün adımları verir).
export function eksikAdimlar(adimlar: readonly Adim[]): Adim[] {
  return adimlar.filter((a) => a.kontroller.some((k) => k.durum === 'eksik'));
}

// Düzeltme yerinin bu ekrandaki karşılığı: Reçete ve Rota bölümü (sekme, ürün seçili) ya da başka sayfanın adresi ve görme işlemi.
export type Gecis =
  | { tur: 'sekme'; anahtar: SekmeAnahtari; baslik: string; urunlu: boolean }
  | { tur: 'adres'; yol: string; islem: Islem; baslik: string };
const GECISLER: Readonly<Record<DuzeltmeYeri, Gecis>> = {
  sureler: { tur: 'sekme', anahtar: 'sureler', baslik: 'Süreler', urunlu: false },
  kaynaklar: { tur: 'sekme', anahtar: 'res', baslik: 'Kaynaklar', urunlu: false },
  'urun-rotalar': { tur: 'sekme', anahtar: 'schema', baslik: 'Ürün ve rotalar', urunlu: true },
  stok: { tur: 'sekme', anahtar: 'stock', baslik: 'Stok', urunlu: false },
  'vardiya-personel': { tur: 'adres', yol: '/vardiya/personel', islem: 'sayfa.vardiya', baslik: 'Vardiya başına personel' },
  vardiyalar: { tur: 'adres', yol: '/vardiya', islem: 'sayfa.vardiya', baslik: 'Vardiyalar ve tatiller' },
  'plan-ayarlari': { tur: 'adres', yol: '/plan/motor-ayarlari', islem: 'plan.planlama-oku', baslik: 'Motor ayarları' },
  plan: { tur: 'adres', yol: '/plan/studio', islem: 'plan.planlama-oku', baslik: 'Planlama atölyesi' },
};
export function gecis(kod: PlanlanamamaNedeni): Gecis | null {
  const yer: DuzeltmeYeri | null = NEDEN_DUZELTME_YERI[kod];
  return yer === null ? null : GECISLER[yer];
}
