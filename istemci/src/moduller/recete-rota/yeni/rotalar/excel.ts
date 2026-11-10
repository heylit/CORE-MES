// Excel ile rota adımları (2627): akış tablosunun temel alanları (operasyon, ad, istasyon ya da makine, hazırlık ve birim süre).
// Satır ürün ve OP no ile adımı bulur; OP no boşsa ürüne yeni adım eklenir. Yazım ürünün taslağınadır (`/rota/adimlar/toplu-kaydet`,
// tek transaction); taslak yoksa yürürlükteki rotadan açılır. Onaya gönderme, dal, bileşen ve ayrıntılı alanlar sayfada yapılır.
import type { RotaAdimTopluCevabi, RotaAdimTopluSatiri } from '#paylasilan/sozlesme/rota.ts';
import { ANAHTAR_AYRACI, YazimReddi, gonderimNumaralari, sayfaTanimi, type Deger, type ExcelTanimi, type PlanSatiri } from '../../../../ortak/excel/kurallar.ts';
import { api } from '../../../../ortak/veri/api.ts';
import type { RrDurumu } from '../veri.ts';
import { acikRevizyon, revizyonlari, yururlukteki, type Revizyon } from './kurallar.ts';

export const ROTA_SAYFASI = 'Rota adımları';
export const ONAYDA = 'Rotası onay bekliyor; Excel yalnız taslağa yazar.';
// 2703 b (kullanıcı kararı): fason adım Excel'le iç adıma çevrilmez.
export const FASON_KAYNAGI = 'Fason adıma Excel\'de makine ya da istasyon yazılamaz; kaynağı sayfada değiştirin.';

const buyuk = (m: string): string => m.toLocaleUpperCase('tr-TR');

interface RotaAdimKaydi {
  urunId: number;
  urunKod: string;
  opNo: number;
  opKod: string | null;
  ad: string;
  istasyon: string | null;
  makine: string | null;
  hazirlik: number | null;
  birim: number | null;
  onayda: boolean;
  // Firmalı fason adım; firmasız fason durumda ayırt edilmez, sunucu reddeder.
  fason: boolean;
}

export interface RotaExcelKaynagi {
  urunler: ReadonlyMap<string, number>;
  operasyonlar: ReadonlyMap<string, number>;
  istasyonlar: ReadonlyMap<string, number>;
  makineler: ReadonlyMap<string, number>;
  // Rotası onayda olan ürünlerin kimlikleri: yeni adım da yazılamaz.
  onaydakiler: ReadonlySet<number>;
  // Ürün başına önizlemenin okuduğu revizyon ve sürümü (Veri koşulu); revizyonu olmayan ürün haritada yoktur (null gider).
  dayanaklar: ReadonlyMap<number, { revizyonId: number; surum: number }>;
}

const rotaUrunleri = (d: RrDurumu) => (d.items ?? []).filter((i) => i.aktif && (i.type === 'mamul' || i.type === 'yari'));
// Excel'in okuduğu revizyon: açık (taslak ya da onayda) varsa o, yoksa yürürlükteki; yazım taslağı bundan açar.
const okunan = (revler: readonly Revizyon[]): Revizyon | null => acikRevizyon(revler) ?? yururlukteki(revler);

export function rotaKaynagi(d: RrDurumu): RotaExcelKaynagi {
  const harita = (l: readonly { id: string; code: string }[]) => new Map(l.map((x) => [buyuk(x.code), Number(x.id)] as const));
  const onaydakiler = new Set(rotaUrunleri(d).filter((i) => acikRevizyon(revizyonlari(d.routeRevs, i.id))?.status === 'onay').map((i) => Number(i.id)));
  const dayanaklar = new Map(rotaUrunleri(d).flatMap((i) => {
    const r = okunan(revizyonlari(d.routeRevs, i.id));
    return r === null ? [] : [[Number(i.id), { revizyonId: Number(r.id), surum: r.surum }] as const];
  }));
  return {
    urunler: harita(rotaUrunleri(d)), operasyonlar: harita((d.opdefs ?? []).filter((o) => o.aktif)),
    istasyonlar: harita((d.stations ?? []).filter((s) => s.aktif)), makineler: harita((d.machines ?? []).filter((m) => m.aktif)), onaydakiler, dayanaklar,
  };
}

export function rotaKayitlari(d: RrDurumu): RotaAdimKaydi[] {
  const op = new Map((d.opdefs ?? []).map((o) => [o.id, o.code]));
  const ist = new Map((d.stations ?? []).map((s) => [s.id, s.code]));
  const mak = new Map((d.machines ?? []).map((m) => [m.id, m.code]));
  return rotaUrunleri(d).flatMap((i) => {
    const r = okunan(revizyonlari(d.routeRevs, i.id));
    if (r === null) return [];
    return [...r.data.steps].sort((a, b) => a.seq - b.seq).map((a) => ({
      urunId: Number(i.id), urunKod: i.code, opNo: a.opNo, opKod: op.get(a.opId) ?? null, ad: a.name,
      istasyon: a.stationId === null ? null : ist.get(a.stationId) ?? null, makine: a.machineId === null ? null : mak.get(a.machineId) ?? null,
      hazirlik: a.setup, birim: a.cycle, onayda: r.status === 'onay', fason: a.fasonId !== null,
    }));
  });
}

export const AYNI_ADIM = 'Bu üründe aynı operasyon ve adla adım var; yeniden yükleme ise OP no yazın.';
const buyukAd = (m: string): string => buyuk(m.trim());

export function rotaTanimi(d: RrDurumu): ExcelTanimi {
  const urunListesi = rotaUrunleri(d).map((i) => ({ kod: i.code, ad: i.name }));
  const kayitlar = rotaKayitlari(d);
  // Veri N1: OP no'suz satır her yüklemede yeni adımdır; aynı dosyanın ikinci kez yüklenmesi önizlemede görünür.
  const adimlar = new Set(kayitlar.map((k) => [buyuk(k.urunKod), k.opKod === null ? '' : buyuk(k.opKod), buyukAd(k.ad)].join(ANAHTAR_AYRACI)));
  return {
    ad: 'rota-adimlari', baslik: 'Rota adımları',
    kimlikEki: [...rotaKaynagi(d).dayanaklar].sort((a, b) => a[0] - b[0]),
    kilavuz: [
      'Her satır bir rota adımıdır. Ürün ve OP no adımı bulur; OP no boşsa ürüne yeni adım eklenir (sona). Dosyada olmayan adımlar değişmez.',
      'Değişiklik ürünün taslak revizyonuna yazılır; taslak yoksa yürürlükteki rotadan açılır. Onaya gönderme sayfada yapılır.',
      'Rotası onay bekleyen ürüne yazılmaz. Tek satır reddedilirse hiçbir ürünün taslağı değişmez.',
      'Makine doluysa adımın kaynağı makinedir; yalnız istasyon doluysa istasyondur. Boş hücre o alanı değiştirmez.',
      'Bileşen, yan ürün, dal, bağımlılık ve işlem/değişim ayrımı sayfadaki adım panelinden yapılır.',
    ],
    sayfalar: [sayfaTanimi<RotaAdimKaydi>({
      ad: ROTA_SAYFASI, kayitTuru: 'rota adımı', anahtarSutun: 'urun', ikinciAnahtar: 'opNo',
      kayitlar, anahtar: (k) => `${k.urunKod}${ANAHTAR_AYRACI}${String(k.opNo)}`,
      sutunlar: [
        { anahtar: 'urun', baslik: 'Ürün', tur: 'liste', zorunlu: true, liste: urunListesi, genislik: 32 },
        { anahtar: 'opNo', baslik: 'OP no', tur: 'sayi', not: 'Boşsa yeni adım.' },
        { anahtar: 'tip', baslik: 'Operasyon', tur: 'liste', zorunlu: true, liste: (d.opdefs ?? []).filter((o) => o.aktif).map((o) => ({ kod: o.code, ad: o.name })), genislik: 28 },
        { anahtar: 'ad', baslik: 'Adım adı', tur: 'metin', zorunlu: true, enUzun: 80, genislik: 30 },
        { anahtar: 'istasyon', baslik: 'İstasyon', tur: 'liste', liste: (d.stations ?? []).filter((s) => s.aktif).map((s) => ({ kod: s.code, ad: s.name })), genislik: 26 },
        { anahtar: 'makine', baslik: 'Makine', tur: 'liste', liste: (d.machines ?? []).filter((m) => m.aktif).map((m) => ({ kod: m.code, ad: m.name })), not: 'Doluysa kaynak makinedir.', genislik: 26 },
        { anahtar: 'hazirlik', baslik: 'Hazırlık (dk)', tur: 'sayi' },
        { anahtar: 'birim', baslik: 'Birim süre (dk)', tur: 'sayi' },
      ],
      satir: (k) => ({ urun: k.urunKod, opNo: k.opNo, tip: k.opKod, ad: k.ad, istasyon: k.istasyon, makine: k.makine, hazirlik: k.hazirlik, birim: k.birim }),
      kilitli: (k) => (k.onayda ? ONAYDA : null),
      uyari: (v, eslesen) => (eslesen === null && typeof v['urun'] === 'string' && typeof v['tip'] === 'string' && typeof v['ad'] === 'string'
        && adimlar.has([buyuk(v['urun']), buyuk(v['tip']), buyukAd(v['ad'])].join(ANAHTAR_AYRACI)) ? AYNI_ADIM : null),
    })],
  };
}

const kimlik = (m: ReadonlyMap<string, number>, v: Deger | undefined): number | undefined => (typeof v === 'string' ? m.get(buyuk(v)) : undefined);

// Plan satırı sözleşmenin satırına çevrilir. Güncellemede yalnız değişen alanlar gider (sunucu gelmeyen alanı korur).
export function rotaSatiri(p: PlanSatiri, satir: number, k: RotaExcelKaynagi): RotaAdimTopluSatiri {
  const d = p.degerler;
  const yer = `${p.sayfa} sayfası, ${String(p.satir)}. satır`;
  const urunId = kimlik(k.urunler, d['urun']);
  if (urunId === undefined) throw new YazimReddi(`${yer}: ürün bulunamadı.`);
  if (k.onaydakiler.has(urunId)) throw new YazimReddi(`${yer}: ${ONAYDA}`);
  const yeni = p.eslesen === null;
  const degisen = new Set(yeni ? Object.keys(d) : p.farklar.map((f) => f.alan));
  const sayi = (a: string) => (degisen.has(a) && typeof d[a] === 'number' ? { deger: d[a] } : null);
  const operasyonTipiId = degisen.has('tip') ? kimlik(k.operasyonlar, d['tip']) : undefined;
  if (degisen.has('tip') && operasyonTipiId === undefined) throw new YazimReddi(`${yer}: operasyon bulunamadı.`);
  if ((degisen.has('makine') || degisen.has('istasyon')) && (p.eslesen as RotaAdimKaydi | null)?.fason === true) throw new YazimReddi(`${yer}: ${FASON_KAYNAGI}`);
  let kaynak: RotaAdimTopluSatiri['kaynak'];
  if (degisen.has('makine')) {
    const id = kimlik(k.makineler, d['makine']);
    if (id === undefined) throw new YazimReddi(`${yer}: makine bulunamadı.`);
    kaynak = { tur: 'makine', id };
  } else if (degisen.has('istasyon')) {
    const id = kimlik(k.istasyonlar, d['istasyon']);
    if (id === undefined) throw new YazimReddi(`${yer}: istasyon bulunamadı.`);
    kaynak = { tur: 'istasyon', id };
  }
  const hazirlik = sayi('hazirlik');
  const birim = sayi('birim');
  return {
    satir, urunId, dayanak: k.dayanaklar.get(urunId) ?? null, opNo: yeni ? null : Number(d['opNo']),
    ...(operasyonTipiId === undefined ? {} : { operasyonTipiId }),
    ...(degisen.has('ad') && typeof d['ad'] === 'string' ? { ad: d['ad'] } : {}),
    ...(kaynak === undefined ? {} : { kaynak }),
    ...(hazirlik === null ? {} : { ayarSuresiDk: hazirlik.deger as number }),
    ...(birim === null ? {} : { birimSureDk: birim.deger as number }),
  };
}

export async function rotaYaz(satirlar: readonly PlanSatiri[], istekKimligi: string, k: RotaExcelKaynagi): Promise<RotaAdimTopluCevabi> {
  const no = gonderimNumaralari(satirlar);
  return api.post<RotaAdimTopluCevabi>('/rota/adimlar/toplu-kaydet', { satirlar: satirlar.map((p, i) => rotaSatiri(p, no[i] ?? i + 1, k)) }, { istekKimligi });
}
