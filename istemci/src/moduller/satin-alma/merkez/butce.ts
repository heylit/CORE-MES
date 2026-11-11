import type { ButceKullanimiCevabi, DegerlendirmeCevabi } from "#paylasilan/sozlesme/satin-alma.ts";
import { backend } from "./store.ts";
import { esc, money, pct } from "./util.ts";

// 2479: bütçe kullanımı sunucuda hesaplanır (2454); ekran yalnız okur ve gösterir. Talebin kırılımı talep sürümü başına, yılın
// kullanımı yıl başına bir kez okunur; sayfa yeniden açılınca (butceyiUnut) yeniden okunur.
// Veri sonradan gelince sayfa yeniden çizilmez, yalnız bütçe kutuları yerinde güncellenir: onay notu ve karar gerekçesi
// gibi yazılmakta olan alanlar ve odak yerinde kalır (Arayüz 2479-1).
export type TalepButceSatiri = DegerlendirmeCevabi["butce"][number];
type YilSatiri = ButceKullanimiCevabi["birimler"][number];
type Deger<T> = T | null | "yukleniyor";

const talepler = new Map<string, { surum: number | undefined; deger: Deger<TalepButceSatiri[]> }>();
const yillar = new Map<number, Deger<YilSatiri[]>>();
export function butceyiUnut(): void { talepler.clear(); yillar.clear(); }
// Ortak parçalı başlık (React) merkezin çizim dinleyicileriyle yenilenir; gövde (#main) yeniden yazılmaz.
const dinleyiciler = new Set<() => void>();
export function butceAbone(f: () => void): void { dinleyiciler.add(f); }

export type ButceYeri = "baslik" | "karar" | "onay";
export interface ButceTalebi { id: string; version?: number; department?: string; status: string; award?: unknown }

function yerindeGuncelle(talepId: string): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-sa-butce]")) {
    if (el.dataset.saButce !== talepId) continue;
    const yer = el.dataset.saButceYer as ButceYeri;
    const r = JSON.parse(el.dataset.saButceTalep ?? "{}") as ButceTalebi;
    el.outerHTML = butceHTML(r, yer);
  }
  for (const f of dinleyiciler) f();
}

async function talebiYukle(id: string, surum: number | undefined): Promise<void> {
  let deger: TalepButceSatiri[] | null = null;
  try { deger = await backend.talepButcesi(id); } catch { deger = null; }
  if (talepler.get(id)?.surum !== surum) return;
  talepler.set(id, { surum, deger });
  yerindeGuncelle(id);
}
async function yiliYukle(yil: number): Promise<void> {
  let deger: YilSatiri[] | null = null;
  try { deger = (await backend.butceKullanimi(yil))?.birimler ?? null; } catch { deger = null; }
  yillar.set(yil, deger);
  for (const el of document.querySelectorAll<HTMLElement>(`[data-sa-butce-yil="${yil}"]`)) yerindeGuncelle(el.dataset.saButce ?? "");
}

function talepKirilimi(r: ButceTalebi): Deger<TalepButceSatiri[]> {
  const k = talepler.get(r.id);
  if (k !== undefined && k.surum === r.version) return k.deger;
  talepler.set(r.id, { surum: r.version, deger: "yukleniyor" });
  void talebiYukle(r.id, r.version);
  return "yukleniyor";
}
function yilKullanimi(yil: number): Deger<YilSatiri[]> {
  const k = yillar.get(yil);
  if (k !== undefined) return k;
  yillar.set(yil, "yukleniyor");
  void yiliYukle(yil);
  return "yukleniyor";
}

const norm = (s: string | null | undefined): string => (s ?? "").trim().toLocaleLowerCase("tr-TR");
const sayi = (s: string | null): number | null => (s === null ? null : Number(s));
const birimAdi = (b: string | null): string => b ?? "Belirtilmemiş birim";
// Yüzde tabana yuvarlanır: %99,6 "%100" görünmesin; aşım ise tutardan karar verilir, eşitlik aşım değildir (Maliyet C3).
const oran = (kullanim: number, butce: number): string => pct(Math.floor((kullanim / butce) * 100));
const ASIM = '<span class="flag bad" data-sa-butce-asim><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg> aşıyor</span>';
const EN_COK = 3;

interface Satir { birim: string | null; butce: number | null; kullanim: number; yil: number }

/** Başlıkta "kullanıldı": siparişli talep kendi tutarıyla, açık talep onsuz. Karar ve onayda "bu alımla": her zaman bu alım dahil. */
function satirlar(r: ButceTalebi, yer: ButceYeri, buYil: number): Deger<Satir[]> {
  const siparisli = r.status === "ordered" || r.status === "received";
  if (r.award) {
    const k = talepKirilimi(r);
    if (k === null || k === "yukleniyor") return k;
    // Kararlı talepte kırılım boş gelmez; gelirse (kalemin fiyatı yok) gösterilecek bütçe yoktur.
    return k.map(x => ({ birim: x.birim, butce: sayi(x.butce), yil: x.yil,
      kullanim: Number(x.kullanilan) + (yer !== "baslik" || siparisli ? Number(x.buAlim) : 0) }));
  }
  if (yer !== "baslik" || !r.department) return [];
  const y = yilKullanimi(buYil);
  if (y === null || y === "yukleniyor") return y;
  const b = y.find(x => norm(x.birim) === norm(r.department));
  return b ? [{ birim: b.birim, butce: sayi(b.butce), kullanim: Number(b.kullanilan), yil: buYil }] : [];
}

function satirHTML(s: Satir, yer: ButceYeri): string {
  const tanimli = s.butce !== null && s.butce > 0;
  const etiket = yer === "baslik" ? "kullanıldı" : "bu alımla";
  const asim = tanimli && s.kullanim > s.butce! ? ` ${ASIM}` : "";
  if (yer === "baslik") return tanimli ? `<span data-sa-butce-satir>${esc(birimAdi(s.birim))} ${s.yil} bütçesi: ${etiket} ${oran(s.kullanim, s.butce!)}${asim}</span>` : "";
  return `<li data-sa-butce-satir><b>${esc(birimAdi(s.birim))}</b> ${tanimli
    ? `<span class="num">${etiket} ${oran(s.kullanim, s.butce!)}</span>${asim}<span class="small muted"> ${money(s.kullanim, "TRY", 0)} / ${money(s.butce, "TRY", 0)}</span>`
    : '<span class="small muted">bütçe tanımlı değil</span>'}</li>`;
}

/** Başlık bilgisi; yüklendi ve gösterilecek bütçe yoksa null. */
export function butceBaslik(r: ButceTalebi): string | null {
  const v = satirlar(r, "baslik", new Date().getFullYear());
  if (v !== "yukleniyor" && !(v ?? []).some(x => x.butce !== null && x.butce > 0)) return null;
  return butceHTML(r, "baslik");
}

/** Bütçe kutusu: başlıkta tek bilgi, karar panelinde ve onayda birim başına satır (en çok üç, fazlası "+n birim"). */
export function butceHTML(r: ButceTalebi, yer: ButceYeri, bugun = new Date()): string {
  const buYil = bugun.getFullYear();
  const veri = satirlar(r, yer, buYil);
  const ozet: ButceTalebi = { id: r.id, version: r.version, department: r.department, status: r.status, award: r.award ? true : undefined };
  const ac = (etiket: string, ic: string) => `<${etiket} data-sa-butce="${esc(r.id)}" data-sa-butce-yer="${yer}" data-sa-butce-yil="${buYil}" data-sa-butce-talep="${esc(JSON.stringify(ozet))}"${ic}</${etiket}>`;
  if (yer === "baslik") {
    if (veri === "yukleniyor") return ac("span", '>bütçe …');
    const s = (veri ?? []).filter(x => x.butce !== null && x.butce > 0);
    if (!s.length) return ac("span", ' hidden>');
    const fazla = s.length - EN_COK;
    return ac("span", `>${s.slice(0, EN_COK).map(x => satirHTML(x, yer)).join(" · ")}${fazla > 0 ? ` · +${fazla} birim daha` : ""}`);
  }
  const yil = veri && veri !== "yukleniyor" && veri[0] ? veri[0].yil : buYil;
  const baslik = `<div class="k">${yil} bütçesi</div>`;
  if (veri === "yukleniyor") return ac("div", `>${baslik}<div class="v">…</div>`);
  if (veri === null) return ac("div", `>${baslik}<div class="v">–</div><div class="d">okunamadı</div>`);
  if (!veri.length) return ac("div", `>${baslik}<div class="v">–</div><div class="d">bütçe tanımlı değil</div>`);
  const fazla = veri.length - EN_COK;
  return ac("div", ` data-sa-butce-kutu>${baslik}<ul class="sa-butce">${veri.slice(0, EN_COK).map(x => satirHTML(x, yer)).join("")}${fazla > 0 ? `<li class="small muted">+${fazla} birim daha</li>` : ""}</ul>
    <div class="d">KDV hariç; kuru olmayan kalem dahil değil</div>`);
}
