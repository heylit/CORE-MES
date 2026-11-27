import type { HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { HazirlikSatiri } from '../operator/HazirlikListesi.tsx';

// 3816 (B): Hazırlık tablosunda emir başına tek satır, altında açılır operasyon satırları. Her sütun bir ya da birkaç hazırlık maddesidir;
// hücre o maddelerin en kötü hâlini gösterir. Emir satırı açık operasyonlarının en kötüsünü ve kaç operasyonda sorun olduğunu söyler.
// Hâli sahibi modül verir (hazırlık özeti); burada yalnız toplanır, yeni hesap yoktur.
export type SutunGrubu = 'Rota' | 'Plan' | 'Malzeme' | 'Takım' | 'Kalite' | 'Terminal';
export interface MaddeSutunu { anahtar: string; baslik: string; grup: SutunGrubu; maddeler: readonly HazirlikMaddesi[] }
export const MADDE_SUTUNLARI: readonly MaddeSutunu[] = [
  { anahtar: 'rota', baslik: 'Rota', grup: 'Rota', maddeler: ['rota'] },
  { anahtar: 'cizim', baslik: 'Çizim rev', grup: 'Rota', maddeler: ['cizim'] },
  { anahtar: 'makine', baslik: 'Makine', grup: 'Plan', maddeler: ['makine'] },
  { anahtar: 'malzeme', baslik: 'Girdi stoğu', grup: 'Malzeme', maddeler: ['malzeme'] },
  { anahtar: 'nc', baslik: 'NC', grup: 'Takım', maddeler: ['cnc'] },
  { anahtar: 'takim', baslik: 'Takım', grup: 'Takım', maddeler: ['takim-omru', 'takim-hazirla'] },
  { anahtar: 'aparat', baslik: 'Aparat', grup: 'Takım', maddeler: ['aparat'] },
  { anahtar: 'olcu', baslik: 'Ölçü aleti', grup: 'Kalite', maddeler: ['olcu-aleti'] },
  { anahtar: 'talimat', baslik: 'Talimat', grup: 'Terminal', maddeler: ['talimat', 'ek-madde'] },
];

// okunmadi: hazırlık özeti okunamadı (Atanmadı ya da Eksik ile karışmasın); yok: bu işte madde gelmedi.
export type HucreDurumu = 'durur' | 'uyari' | 'muaf' | 'bilinmiyor' | 'tamam' | 'gerekmez' | 'okunmadi' | 'yok';
const AGIRLIK: Readonly<Record<HucreDurumu, number>> = { durur: 7, uyari: 6, okunmadi: 5, muaf: 4, bilinmiyor: 3, tamam: 2, gerekmez: 1, yok: 0 };
export const sorunluMu = (d: HucreDurumu): boolean => d === 'durur' || d === 'uyari';
export const HUCRE_GORUNUMU: Readonly<Record<HucreDurumu, { simge: SimgeAdi | null; metin: string; ton: 'stop' | 'hold' | 'idle' | 'run' }>> = {
  durur: { simge: 'x', metin: 'Eksik', ton: 'stop' },
  uyari: { simge: 'alert', metin: 'Uyarı', ton: 'hold' },
  okunmadi: { simge: 'help', metin: 'Okunmadı', ton: 'idle' },
  muaf: { simge: 'lock', metin: 'Muaf', ton: 'hold' },
  bilinmiyor: { simge: 'help', metin: 'Bilinmiyor', ton: 'idle' },
  tamam: { simge: 'check', metin: 'Tamam', ton: 'run' },
  gerekmez: { simge: null, metin: 'Gerekmez', ton: 'idle' },
  yok: { simge: null, metin: '', ton: 'idle' },
};

export interface HucreOzeti { durum: HucreDurumu; madde: HazirlikMaddesi | null; emirDuzeyi: boolean }
const satirDurumu = (x: HazirlikSatiri): HucreDurumu => (x.hal === 'eksik' ? (x.uyarir ? 'uyari' : 'durur') : x.hal);

// Tek operasyonun hücresi. satirlar null: özet okunamadı (okundu ise "Okunmadı", okunuyorsa "yok" ve yer tutucu çizilir).
// emirDuzeyi: sütunun maddelerinin hepsi emir genelidir; operasyon satırında "emirle aynı" yazılır.
export function hucreOzeti(satirlar: readonly HazirlikSatiri[] | null, s: MaddeSutunu, okundu: boolean): HucreOzeti {
  if (!satirlar) return { durum: okundu ? 'okunmadi' : 'yok', madde: null, emirDuzeyi: false };
  const l = satirlar.filter((x) => s.maddeler.includes(x.madde));
  if (!l.length) return { durum: 'yok', madde: null, emirDuzeyi: false };
  let en = l[0]!;
  for (const x of l) if (AGIRLIK[satirDurumu(x)] > AGIRLIK[satirDurumu(en)]) en = x;
  return { durum: satirDurumu(en), madde: en.madde, emirDuzeyi: l.every((x) => !x.isEmriDuzeyi) };
}

// Emir satırı: açık operasyonların en kötüsü ve sorunlu (eksik ya da uyarılı) operasyon sayısı. ilk: ilk sorunlu operasyonun sırası.
export interface EmirHucresi { durum: HucreDurumu; madde: HazirlikMaddesi | null; sorunlu: number; ilk: number | null }
export function emirHucresi(oplar: readonly HucreOzeti[]): EmirHucresi {
  let en: HucreOzeti | null = null;
  let sorunlu = 0;
  let ilk: number | null = null;
  oplar.forEach((o, i) => {
    if (sorunluMu(o.durum)) { sorunlu += 1; if (ilk === null) ilk = i; }
    if (!en || AGIRLIK[o.durum] > AGIRLIK[en.durum]) en = o;
  });
  const e = en as HucreOzeti | null;
  return { durum: e ? e.durum : 'yok', madde: e ? e.madde : null, sorunlu, ilk };
}
