import type { OnayliListeCevabi } from "#paylasilan/sozlesme/satin-alma.ts";
import type { Material, PurchaseRequest } from "./tipler.ts";

// 3279 a: teklif isterken ve karşılaştırırken kalemin kategorisindeki Kalite kararı. Kaynak Kalite Merkezi; satın alma yalnız okur,
// hiçbir şeyi engellemez. Uyarı yalnız "kontrollü" kategoride çıkar: Kalite'nin en az bir firma için karar verdiği kategori (V7);
// hiç karar verilmemiş kategoride firma geneli durum kullanılır.

/** Yüklenen onaylı liste; Kalite okunamadıysa ya da istek düştüyse null (rehber çıkmaz, kimse onaylı sayılmaz). */
export const ONAYLI: { veri: OnayliListeCevabi | null } = { veri: null };

export type RehberSinifi = "onayli" | "sartli" | "firma" | "onaysiz" | "kayitsiz";
export interface Rehber {
  sinif: RehberSinifi;
  /** Rozet metni (tek sözlük: Onaylı, Şartlı, Onaysız, Kalite kaydı yok; kontrolsüz kategoride firma geneli durum). */
  etiket: string;
  /** Şartlı kararların şart metinleri. */
  sartlar: string[];
  /** Turuncu ipucu satırları: kategoride onay yok, sertifika bitti. */
  uyarilar: string[];
}

const SIRA: Record<RehberSinifi, number> = { onayli: 0, sartli: 1, firma: 2, onaysiz: 3, kayitsiz: 3 };
export const rehberSirasi = (r: Rehber | null): number => (r === null ? 2 : SIRA[r.sinif]);

const anahtar = (tur: string, kod: string): string => `${tur}|${kod}`;
const tarihMetni = (g: string): string => `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}`;

/** Talebin kalemlerinin kategori anahtarları; kartı ya da kategorisi olmayan kalem `eslesmeyen` sayılır. */
export function talepKategorileri(veri: OnayliListeCevabi, r: Pick<PurchaseRequest, "items">, malzemeler: Record<string, Material>, matOf: (it: PurchaseRequest["items"][number]) => string | null | undefined): { anahtarlar: string[]; eslesmeyen: number } {
  const kart = new Map(veri.malzemeKategorileri.map((m) => [m.malzemeNo, anahtar(m.tur, m.kod)]));
  const anahtarlar = new Set<string>();
  let eslesmeyen = 0;
  for (const it of r.items ?? []) {
    const mid = matOf(it);
    const no = mid ? malzemeler[mid]?.malzemeNo : undefined;
    const a = no === undefined ? undefined : kart.get(no);
    if (a === undefined) eslesmeyen++;
    else anahtarlar.add(a);
  }
  return { anahtarlar: [...anahtarlar], eslesmeyen };
}

/** Kontrollü kategoriler: Kalite'nin en az bir firma için karar verdiği (tür, kod). */
export function kontrolluKategoriler(veri: OnayliListeCevabi): Set<string> {
  return new Set(veri.firmalar.flatMap((f) => (f.kalite?.kategoriler ?? []).map((k) => anahtar(k.kategoriTuru, k.kategoriKodu))));
}

/** Bir firmanın talep için rehberi. Kalite bağlı değilse ya da liste yüklenmediyse null. `bugun` YYYY-AA-GG. */
export function firmaRehberi(veri: OnayliListeCevabi | null, firmaId: number, kategoriler: readonly string[], bugun: string): Rehber | null {
  if (veri === null || !veri.kaliteBagli) return null;
  const f = veri.firmalar.find((x) => x.firmaId === firmaId);
  const k = f?.kalite ?? null;
  if (k === null) return { sinif: "kayitsiz", etiket: "Kalite kaydı yok", sartlar: [], uyarilar: ["Kalite Merkezi'nde kaydı yok"] };
  const uyarilar: string[] = [];
  if (k.sertifikaBitisi !== null && k.sertifikaBitisi < bugun) uyarilar.push(`Sertifika ${tarihMetni(k.sertifikaBitisi)}'da bitti`);
  const kontrollu = kontrolluKategoriler(veri);
  const bakilan = kategoriler.filter((a) => kontrollu.has(a));
  if (bakilan.length === 0) {
    if (k.durum === "Aday" || k.durum === "Askıda") return { sinif: "onaysiz", etiket: k.durum, sartlar: [], uyarilar };
    // Ad ile eşlenen kayıt firma kartına bağlı değil: onaylı sayılmaz, Kalite kaydı olmayanla aynı sırada (Risk K3).
    if (k.adIleEslendi) return { sinif: "kayitsiz", etiket: "Ad ile eşlendi", sartlar: [], uyarilar: ["Kalite kaydı firma kartına bağlı değil; onaylı sayılmaz", ...uyarilar] };
    return { sinif: "firma", etiket: k.durum ?? "Karar yok", sartlar: [], uyarilar };
  }
  const kararlar = bakilan.map((a) => k.kategoriler.find((x) => anahtar(x.kategoriTuru, x.kategoriKodu) === a) ?? null);
  const sartlar = kararlar.flatMap((x) => (x?.durum === "sartli" && x.aciklama !== null ? [x.aciklama] : []));
  if (kararlar.some((x) => x === null || x.durum === "onaysiz")) {
    return { sinif: "onaysiz", etiket: "Onaysız", sartlar, uyarilar: ["Bu kategoride Kalite onayı yok", ...uyarilar] };
  }
  if (kararlar.some((x) => x?.durum === "sartli")) return { sinif: "sartli", etiket: "Şartlı", sartlar, uyarilar };
  return { sinif: "onayli", etiket: "Onaylı", sartlar, uyarilar };
}
