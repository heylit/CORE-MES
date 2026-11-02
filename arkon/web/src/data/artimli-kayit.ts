// Terminalin vardiya kayıtları artımlı okunur (1871): her sayım ve duruşta istasyonun bütün terminalleri 7 günlük durum ve vardiyalık sayım
// listesini baştan okursa cevap veriyle büyür. Tam okuma açılışta, vardiya ya da makine değişince ve belli aralıkla yapılır; arada yalnız
// sunucuya son okumadan sonra varan kayıtlar alınır. Kayıtlar değişmez (yalnız eklenir), bu yüzden birleştirme cid ile teklemekten ibarettir.

// Sunucunun okuma anı ile yazan işlemin varış anı arasındaki yarış (varış işlem başında atanır, kayıt sonra görünür) bu payla kapanır.
export const ARTIMLI_PAY_MS = 5 * 60e3;
// Tam okuma aralığı: budanan ya da beklenmedik biçimde kaçan kayıt en geç bu sürede düzelir.
export const TAM_OKUMA_ARALIGI_MS = 10 * 60e3;
// Sunucunun varsayılan liste sınırı (servis.ts VARSAYILAN_KAYIT_SINIRI): birleşik liste tam okumanın döneceğinden uzun olmasın.
export const KAYIT_SINIRI = 5000;

export type Kayit = Record<string, any>;
export interface ImlecliOkuma { rows: Kayit[]; at: number; cut: boolean }
export interface VardiyaAnahtari { machine: string; vardiyaBasi: number }
export interface VardiyaBellegi extends VardiyaAnahtari { ev: Kayit[]; cn: Kayit[]; imlec: number; tamAn: number }

// Artımlı okunabiliyorsa `varisSonra` değeri; tam okuma gerekiyorsa null.
export function artimliVaris(b: VardiyaBellegi | null, a: VardiyaAnahtari, simdi: number): number | null {
  if (b === null || b.machine !== a.machine || b.vardiyaBasi !== a.vardiyaBasi) return null;
  if (simdi - b.tamAn >= TAM_OKUMA_ARALIGI_MS) return null;
  return Math.max(0, b.imlec - ARTIMLI_PAY_MS);
}

// Eski sıra korunur, yalnız yeni cid eklenir; sıra zamana göredir (eşit zamanda önce gelen önce kalır), sınır en yenileri bırakır.
export function kayitlariBirlestir(eski: readonly Kayit[], yeni: readonly Kayit[], sinir = KAYIT_SINIRI): Kayit[] {
  const bilinen = new Set(eski.map((r) => r['cid']));
  const ekle = yeni.filter((r) => !bilinen.has(r['cid']));
  if (ekle.length === 0) return eski as Kayit[];
  const birlesik = [...eski, ...ekle].sort((x, y) => Number(x['at']) - Number(y['at']));
  return birlesik.length > sinir ? birlesik.slice(-sinir) : birlesik;
}

// İki türün okuması birlikte uygulanır. Okuma imleçsizse (çevrimdışı) ya da kesildiyse null döner: çağıran tam okumaya düşer.
// Yeni imleç iki okumanın erkeninden kurulur ki iki okuma arasında varan kayıt kaçmasın.
export function bellegiGuncelle(
  b: VardiyaBellegi | null, a: VardiyaAnahtari, simdi: number, artimli: boolean, ev: ImlecliOkuma | null, cn: ImlecliOkuma | null,
): VardiyaBellegi | null {
  if (ev === null || cn === null || ev.cut || cn.cut) return null;
  const imlec = Math.min(ev.at, cn.at);
  if (!artimli || b === null) return { ...a, ev: ev.rows, cn: cn.rows, imlec, tamAn: simdi };
  return { ...a, ev: kayitlariBirlestir(b.ev, ev.rows), cn: kayitlariBirlestir(b.cn, cn.rows), imlec, tamAn: b.tamAn };
}
