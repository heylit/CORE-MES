import { calismaBitisi, kesisimDk, type Aralik, type Kaynak } from './kurallar.ts';

// Plandan sapma (781 a, 782): planlanan ile gerçekleşen arasındaki fark tek yerde, saf hesap. Zamanlar dakika (Unix dakikası); takvim
// kaynağın net çalışma aralıklarıdır, undefined okunamamış takvimdir (sürekli çalışma uydurulmaz, ölçü boş kalır).

export interface PlanYeri { kaynak: Kaynak; baslangic: number; bitis: number }
export interface SapmaGirdisi {
  canli: PlanYeri | null;
  taban: PlanYeri | null;
  durum: 'bekliyor' | 'calisiyor' | 'tamam';
  // Ayar başı varsa o, yoksa başlama (766 a).
  giris: number | null;
  bitis: number | null;
  // Kullanım satırlarının makineleri, başlama sırasıyla.
  makineler: readonly (number | null)[];
  // Çalışan işin kalan net dakikası (kalan adet x birim süre / verim); bilinmiyorsa boş.
  kalanDk: number | null;
  takvim: readonly Aralik[] | undefined;
  simdi: number;
  // İlk çalışılan makinede canlı planda bu işten önce başlayacak işlerin girişleri (başlamamışsa boş); o makinede canlı plan yoksa undefined.
  oncekiler: readonly (number | null)[] | undefined;
}
export interface SapmaOlcusu {
  tahminiBitis: number | null;
  bitisKaymasiDk: number | null;
  tabanBitisKaymasiDk: number | null;
  sureOrani: number | null;
  tezgahUyumu: boolean | null;
  siraUyumu: boolean | null;
}

// a ile z arasındaki net çalışma dakikası, işaretli: z a'dan sonraysa artı.
function netFark(takvim: readonly Aralik[], a: number, z: number): number {
  return Math.round(z >= a ? kesisimDk(takvim, a, z) : -kesisimDk(takvim, z, a));
}

export function sapmaOlcusu(g: SapmaGirdisi): SapmaOlcusu {
  const t = g.takvim;
  const tahminiBitis = g.durum !== 'calisiyor' || g.kalanDk === null || t === undefined ? null : calismaBitisi(t, g.simdi, Math.max(0, g.kalanDk));
  const son = g.bitis ?? tahminiBitis;
  const kayma = (p: PlanYeri | null) => (p === null || son === null || t === undefined ? null : netFark(t, p.bitis, son));
  const planliNet = g.canli === null || t === undefined ? 0 : kesisimDk(t, g.canli.baslangic, g.canli.bitis);
  const sureOrani = g.giris === null || g.bitis === null || t === undefined || planliNet <= 0 ? null
    : Math.round((kesisimDk(t, g.giris, g.bitis) / planliNet) * 1000) / 1000;
  const planliMakine = g.canli?.kaynak.tur === 'makine' ? g.canli.kaynak.id : null;
  const tezgahUyumu = planliMakine === null || g.makineler.length === 0 ? null : g.makineler.every((m) => m === planliMakine);
  const giris = g.giris;
  const siraUyumu = giris === null || g.oncekiler === undefined ? null : g.oncekiler.every((x) => x !== null && x <= giris);
  return { tahminiBitis, bitisKaymasiDk: kayma(g.canli), tabanBitisKaymasiDk: kayma(g.taban), sureOrani, tezgahUyumu, siraUyumu };
}
