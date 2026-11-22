import type { KalemZarflariCevabi, SatinAlmaUclari } from "#paylasilan/sozlesme/satin-alma.ts";
import { ucCagrisi } from "../../../ortak/veri/uc-cagrisi.ts";

// 3572-0: satın almacı teklif yazmadan önce talep edenin alternatif sınırını görür. Kaynak var olan kalem zarfları ucudur; talep
// başına bir istek atılır ve aynı talebin bütün kalem satırları (ilk tablo, talep ayrıntısı) aynı sonucu okur.
type KalemZarfi = KalemZarflariCevabi["kalemler"][number];
export type ZarfDurumu = { tur: "yukleniyor" } | { tur: "hata" } | { tur: "tamam"; kalemler: ReadonlyMap<string, KalemZarfi> };

const uc = ucCagrisi<SatinAlmaUclari>();
// Talep eden sınırı sonradan değiştirebilir; ekran yeniden açıldığında 30 sn'den eski sonuç yeniden okunur.
const TAZELIK_MS = 30_000;
const YUKLENIYOR: ZarfDurumu = { tur: "yukleniyor" };
const depo = new Map<string, { durum: ZarfDurumu; zaman: number; istek: Promise<boolean> | null }>();
const dinleyiciler = new Set<() => void>();
const bildir = () => { for (const f of dinleyiciler) f(); };

export function zarfAbone(f: () => void): () => void { dinleyiciler.add(f); return () => { dinleyiciler.delete(f); }; }
export const zarfDurumu = (talepId: string): ZarfDurumu => depo.get(talepId)?.durum ?? YUKLENIYOR;

/**
 * Talebin kalem zarflarını okur. Okuma sürüyorsa aynı istek beklenir, taze sonuç varsa istek atılmaz (false döner).
 * Eski sonuç yenisi gelene kadar gösterilir.
 */
export function zarfIste(talepId: string, simdi = Date.now()): Promise<boolean> {
  const k = depo.get(talepId);
  if (k?.istek) return k.istek;
  if (k && simdi - k.zaman < TAZELIK_MS) return Promise.resolve(false);
  // Ayrı bir hata iletisi açılmaz: satır "okunamadı" yazar, merkez yeniden yüklenmez.
  const istek = uc.get("/satin-alma-talepleri/:id/kalem-zarflari", { parametre: { id: talepId }, zamanAsimiMs: 15_000 }).then(
    (c): ZarfDurumu => ({ tur: "tamam", kalemler: new Map(c.kalemler.map((x) => [x.kalemId, x])) }),
    (): ZarfDurumu => ({ tur: "hata" }),
  ).then((durum) => { depo.set(talepId, { durum, zaman: Date.now(), istek: null }); bildir(); return true; });
  depo.set(talepId, { durum: k?.durum ?? YUKLENIYOR, zaman: simdi, istek });
  return istek;
}
export function zarfDeposunuBosalt(): void { depo.clear(); }

const kabulMetni = (k: KalemZarfi["kabul"]): string => (k === null ? "kartın sınırı" : [
  k.kaliteler === null ? null : k.kaliteler.length === 0 ? "kalite yalnız istenen" : `kalite ${k.kaliteler.join(", ")}`,
  k.durumlar === null ? null : k.durumlar.length === 0 ? "durum yalnız istenen" : `durum ${k.durumlar.join(", ")}`,
  k.payMm === null ? null : `ölçü en çok +${k.payMm.toLocaleString("tr-TR")} mm`,
].filter(Boolean).join(" · ") || "kartın sınırı");

function sartliMetni(kz: KalemZarfi): string {
  const z = kz.zarf;
  const var_ = [...(z.kalite.acik ? z.kalite.secenekler : []), ...(z.durum.acik ? z.durum.secenekler : [])].some((s) => s.tur === "sartli");
  if (!var_) return "şartlı: yok";
  if (kz.kabul?.sartliKabul) return "şartlı: var, talep eden kabul etti";
  return z.sartliAcik ? "şartlı: var, kart kuralıyla kabul" : "şartlı: var, talep edenin onayı gerekir";
}

/**
 * Kalem satırının tek satırlık alternatif özeti. Okunurken "–", okunamazsa "okunamadı" yazılır; zarfı olmayan kalemde (hammadde
 * dışı ya da kalitesiz kart: yalnız aynı malzeme) satır çizilmez (null).
 */
export function alternatifOzeti(d: ZarfDurumu, kalemId: string): string | null {
  if (d.tur === "yukleniyor") return "Alternatif: –";
  if (d.tur === "hata") return "Alternatif: okunamadı";
  const kz = d.kalemler.get(kalemId);
  if (!kz) return null;
  if (kz.kabul?.yalnizAyni) return "Alternatif: yalnız aynı malzeme";
  if (kz.zarf.kapali) return "Alternatif: kapalı";
  return `Alternatif: ${kabulMetni(kz.kabul)}; ${sartliMetni(kz)}`;
}

/** HTML ile çizilen talep ayrıntısı: `data-sa-alt-ozet` taşıyan yer tutucular okunan özetle doldurulur. */
export function alternatifOzetleriniDoldur(kok: ParentNode | null): void {
  if (!kok) return;
  const yerler = [...kok.querySelectorAll<HTMLElement>("[data-sa-alt-ozet]")];
  for (const talepId of new Set(yerler.map((y) => y.dataset.saAltTalep ?? ""))) {
    if (!talepId) continue;
    const d = zarfDurumu(talepId);
    for (const y of yerler.filter((x) => x.dataset.saAltTalep === talepId)) {
      const m = alternatifOzeti(d, y.dataset.saAltOzet ?? "");
      if (m === null) y.remove(); else y.textContent = m;
    }
    void zarfIste(talepId).then((yeni) => { if (yeni) alternatifOzetleriniDoldur(kok); });
  }
}
