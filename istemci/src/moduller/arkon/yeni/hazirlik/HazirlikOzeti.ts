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

// 3820: tablonun bütün sütunları (Durum hep görünür, sağda sabit). Gizlenebilir; varsayılanda gizli olanlar Arayüz ön bakışının listesidir.
// Madde sütunları hazırlık özetinden, öteki sütunlar paketin sunucunun yazdığı alanlarından okunur (tmi.plan, tmi.planSaati, tmi.ilkParca).
export type SutunAnahtari =
  | 'rota' | 'cizim' | 'makine' | 'kisi' | 'planBas' | 'malzeme' | 'fason' | 'nc' | 'takim' | 'aparat' | 'olcu' | 'ilkParca' | 'kontrolPlani'
  | 'talimat' | 'paket' | 'uretim';
export interface SutunSecenegi { anahtar: SutunAnahtari; baslik: string; grup: SutunGrubu; varsayilan: boolean }
export const SUTUNLAR: readonly SutunSecenegi[] = [
  { anahtar: 'rota', baslik: 'Rota', grup: 'Rota', varsayilan: true },
  { anahtar: 'cizim', baslik: 'Çizim rev', grup: 'Rota', varsayilan: true },
  { anahtar: 'makine', baslik: 'Makine', grup: 'Plan', varsayilan: true },
  { anahtar: 'kisi', baslik: 'Kişi', grup: 'Plan', varsayilan: true },
  { anahtar: 'planBas', baslik: 'Plan başlangıcı', grup: 'Plan', varsayilan: false },
  { anahtar: 'malzeme', baslik: 'Girdi stoğu', grup: 'Malzeme', varsayilan: true },
  { anahtar: 'fason', baslik: 'Fason', grup: 'Malzeme', varsayilan: false },
  { anahtar: 'nc', baslik: 'NC', grup: 'Takım', varsayilan: true },
  { anahtar: 'takim', baslik: 'Takım', grup: 'Takım', varsayilan: false },
  { anahtar: 'aparat', baslik: 'Aparat', grup: 'Takım', varsayilan: false },
  { anahtar: 'olcu', baslik: 'Ölçü aleti', grup: 'Kalite', varsayilan: false },
  { anahtar: 'ilkParca', baslik: 'İlk parça', grup: 'Kalite', varsayilan: true },
  { anahtar: 'kontrolPlani', baslik: 'Kontrol planı', grup: 'Kalite', varsayilan: true },
  { anahtar: 'talimat', baslik: 'Talimat', grup: 'Terminal', varsayilan: true },
  { anahtar: 'paket', baslik: 'Paket', grup: 'Terminal', varsayilan: true },
  { anahtar: 'uretim', baslik: 'Üretim', grup: 'Terminal', varsayilan: true },
];
const SUTUN_ANAHTARLARI = new Set<string>(SUTUNLAR.map((s) => s.anahtar));
export const varsayilanGizli = (): ReadonlySet<SutunAnahtari> => new Set(SUTUNLAR.filter((s) => !s.varsayilan).map((s) => s.anahtar));
// Saklanan seçim okunamazsa ya da bozuksa varsayılan; bilinmeyen anahtar atılır.
export function gizliOku(ham: string | null): ReadonlySet<SutunAnahtari> {
  if (ham === null) return varsayilanGizli();
  try {
    const l: unknown = JSON.parse(ham);
    return Array.isArray(l) ? new Set(l.filter((x): x is SutunAnahtari => typeof x === 'string' && SUTUN_ANAHTARLARI.has(x))) : varsayilanGizli();
  } catch { return varsayilanGizli(); }
}

// Plan bilgisi: kişi kaynağında kişinin adı, canlı plandaki başlangıç ve bitiş. Termin riski: plan bitişi terminin günü bittikten sonra.
interface PlanAlanlari { due?: string; tmi?: { plan?: { canli?: boolean; kaynak?: { tur?: string; ad?: string } | null } | null; planSaati?: { baslangic?: unknown; bitis?: unknown } | null } | null }
export interface PlanBilgisi { kisi: string | null; kisiPlani: boolean; baslangic: number | null; bitis: number | null; terminRiski: boolean }
export function planBilgisi(p: PlanAlanlari): PlanBilgisi {
  const plan = p.tmi?.plan;
  const kisiPlani = plan?.kaynak?.tur === 'kisi';
  const kisi = kisiPlani && typeof plan?.kaynak?.ad === 'string' && plan.kaynak.ad ? plan.kaynak.ad : null;
  const s = p.tmi?.planSaati;
  const zaman = (v: unknown) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
  const baslangic = zaman(s?.baslangic), bitis = zaman(s?.bitis);
  const termin = /^\d{4}-\d{2}-\d{2}$/.test(p.due ?? '') ? new Date(`${p.due!}T23:59:59`).getTime() : null;
  return { kisi, kisiPlani, baslangic, bitis, terminRiski: bitis !== null && termin !== null && bitis > termin };
}

// İlk parça: kararı Kalite Merkezi'nin (tmi.ilkParca); karar yoksa ve istasyon istiyorsa "Bekliyor". Ret üretimi durdurmaz (559 2), uyarıdır.
export type IlkParcaDurumu = 'onay' | 'ret' | 'bekliyor' | null;
export function ilkParcaDurumu(p: { tmi?: unknown }, karar: 'onay' | 'ret' | null): IlkParcaDurumu {
  if (karar) return karar;
  const t = p.tmi && typeof p.tmi === 'object' ? (p.tmi as { ilkParcaGerekli?: unknown }) : null;
  return t?.ilkParcaGerekli === true ? 'bekliyor' : null;
}
const ILK_PARCA_AGIRLIK: Readonly<Record<Exclude<IlkParcaDurumu, null>, number>> = { ret: 3, bekliyor: 2, onay: 1 };
export const enKotuIlkParca = (l: readonly IlkParcaDurumu[]): IlkParcaDurumu =>
  l.reduce<IlkParcaDurumu>((a, b) => (b !== null && (a === null || ILK_PARCA_AGIRLIK[b] > ILK_PARCA_AGIRLIK[a]) ? b : a), null);
