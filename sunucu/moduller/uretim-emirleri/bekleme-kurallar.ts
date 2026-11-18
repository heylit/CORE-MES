import { KADEME_KAYNAKLARI, type KademeKaynagi } from '#paylasilan/sozlesme/kademe-sabitleri.ts';
import { BEKLEME_NEDENI_ADLARI, BEKLEME_NEDENLERI, type BeklemeNedeni } from '#paylasilan/sozlesme/uretim-emirleri.ts';

// 3416-1 a (İş Akışı v4.7): bekletilen emir kademeli uyarıya girer; süre neden başınadır. Hiçbir bekleme süresiz kalmasın diye
// kendi süresi olmayan nedenler de "aynı nedenle süren" kaynağına girer.

// Kendi süresi olan nedenler; müşteri onayı ve diğer yalnız süren bekleme kaynağına girer.
export const NEDEN_KAYNAKLARI: Readonly<Record<BeklemeNedeni, KademeKaynagi | null>> = {
  malzeme: 'uretim-emirleri.bekleme-malzeme', fason: 'uretim-emirleri.bekleme-fason', takim: 'uretim-emirleri.bekleme-takim',
  kalite: 'uretim-emirleri.bekleme-kalite', muhendislik: 'uretim-emirleri.bekleme-muhendislik', teslim: 'uretim-emirleri.bekleme-teslim',
  musteri: null, diger: null,
};
export const SUREN_BEKLEME_KAYNAGI = 'uretim-emirleri.bekleme-suruyor' satisfies KademeKaynagi;
// Aynı neden bu kadar iş günü sürünce yöneticiye çıkar (v4.7 "tekrar ekseni").
export const SUREN_BEKLEME_GUNU = 2;

// Kendi kaynağı varsayılan ayarla ikinci iş gününe kadar Yöneticide'ye çıkmayan nedenler süren bekleme kaynağına girer; çıkanlarda
// ikinci uyarı aynı güne düşerdi. Bekleme sayacında Yöneticide, k3 + k4 - 1'inci iş günüdür (bildirim gerekenKademeler); saat
// biriminde k3 saati en çok bu kadar iş gününe yayılır (3418 a).
export function beklemeSuruyorNedenleri(): BeklemeNedeni[] {
  return BEKLEME_NEDENLERI.filter((n) => {
    const k = NEDEN_KAYNAKLARI[n];
    if (k === null) return true;
    const v = KADEME_KAYNAKLARI[k].varsayilan;
    if (v.k3Gun === null || v.k4Gun === null) return true;
    const k3IsGunu = v.k3Birim === 'saat' ? Math.ceil(v.k3Gun / 24) : v.k3Gun;
    return k3IsGunu + v.k4Gun - 1 > SUREN_BEKLEME_GUNU;
  });
}

export interface BekletmeOlayiGirdisi { id: number; olay: 'beklet' | 'devam'; neden: BeklemeNedeni | null; kisiId: number; zaman: string }
export interface SurenBekleme {
  neden: BeklemeNedeni;
  // Zincirin ilk bekletmesi: kayıt kimliği ve sayacın başı ondandır.
  baslangicId: number;
  baslangicAni: string;
  // Son bekletmeyi yapan: işin yapanı.
  kisiId: number;
  // Zincirdeki bekletme sayısı.
  parca: number;
}

// Şu an süren bekleme ve başı. Devam ettirilip aynı nedenle aynı ya da sonraki iş günü yeniden bekletilen emirde sayaç sıfırlanmaz:
// yeniden bekletmek süreyi düşürmenin yolu değildir (v4.7). Not bekletmeyle yazılır; not değişmesi de yeniden bekletmedir.
// Olaylar id sırasıyla verilir. `gun` anın tesis günü, `isGunuFarki` iki tesis günü arası iş günüdür.
export function surenBekleme(
  olaylar: readonly BekletmeOlayiGirdisi[], gun: (an: string) => string, isGunuFarki: (bas: string, bit: string) => number,
): SurenBekleme | null {
  let zincir = null as SurenBekleme | null;
  let sonDevam: string | null = null;
  for (const o of olaylar) {
    if (o.olay === 'devam') { sonDevam = o.zaman; continue; }
    if (o.neden === null) continue;
    const onceki: SurenBekleme | null = zincir;
    const surer: boolean = onceki !== null && sonDevam !== null && onceki.neden === o.neden && isGunuFarki(gun(sonDevam), gun(o.zaman)) <= 1;
    zincir = surer && onceki !== null ? { ...onceki, kisiId: o.kisiId, parca: onceki.parca + 1 }
      : { neden: o.neden, baslangicId: o.id, baslangicAni: o.zaman, kisiId: o.kisiId, parca: 1 };
    sonDevam = null;
  }
  const son = olaylar.at(-1);
  return son?.olay === 'beklet' ? zincir : null;
}

export interface BeklemeKaydi {
  kayit: string;
  no: string;
  baslik: string;
  yol: `/${string}`;
  baslangic: string;
  baslangicAni: string;
  yapanlar: number[];
  yoneticiler: number[];
}
// Kayıt her zincirde yenidir (emir, neden, zincirin ilk bekletmesi): devam edip başka gün yeniden bekletilen emir yeni kayıttır.
// Yönetici kayda bağlı değildir: kaynağın ayarındaki rol, yoksa kademe yöneticileri alır.
export function beklemeKaydi(emir: { id: number; emirNo: string }, b: SurenBekleme, gun: (an: string) => string): BeklemeKaydi {
  return {
    kayit: `${String(emir.id)}:${b.neden}:${String(b.baslangicId)}`,
    no: emir.emirNo,
    baslik: `${emir.emirNo} beklemede: ${BEKLEME_NEDENI_ADLARI[b.neden]}`,
    yol: `/uretim-emirleri/${String(emir.id)}`,
    baslangic: gun(b.baslangicAni),
    baslangicAni: b.baslangicAni,
    yapanlar: [b.kisiId],
    yoneticiler: [],
  };
}

// Kaynağın kayıtları: neden kaynağı yalnız kendi nedenini, süren bekleme kaynağı beklemeSuruyorNedenleri'ni alır.
export function kaynagaGirerMi(kaynak: KademeKaynagi, neden: BeklemeNedeni): boolean {
  if (kaynak === SUREN_BEKLEME_KAYNAGI) return beklemeSuruyorNedenleri().includes(neden);
  return NEDEN_KAYNAKLARI[neden] === kaynak;
}
