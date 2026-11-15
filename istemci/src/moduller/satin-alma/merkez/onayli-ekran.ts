import type { PurchaseRequest } from "./tipler.ts";
import { matOf } from "./calc.ts";
import { ONAYLI, firmaRehberi, talepKategorileri, type Rehber } from "./onayli.ts";
import { S } from "./store.ts";
import { esc, todayStr } from "./util.ts";

// 3279 a: teklif iste, karşılaştırma ve karar ekranlarındaki Kalite rozetleri (tek sözlük). Askı rozeti merkezin kendi "askıda"
// işaretiyle çizildiği için burada tekrar edilmez. Hiçbir şey engellenmez.
export function talepRehberi(r: PurchaseRequest, supplierId: string): Rehber | null {
  const veri = ONAYLI.veri;
  if (veri === null) return null;
  const id = Number(supplierId);
  if (!Number.isSafeInteger(id)) return null;
  return firmaRehberi(veri, id, talepKategorileri(veri, r, S.materials, matOf).anahtarlar, todayStr());
}

export function rehberRozetleri(r: PurchaseRequest, supplierId: string): string[] {
  const g = talepRehberi(r, supplierId);
  if (g === null) return [];
  const askida = S.suppliers[supplierId]?.status === "suspended";
  const fl: string[] = [];
  if (g.sinif === "onayli") fl.push('<span class="flag good">Onaylı</span>');
  else if (g.sinif === "sartli") fl.push(`<span class="flag warn" title="${esc(g.sartlar.join("; "))}">Şartlı</span>`);
  else if (g.sinif === "kayitsiz") fl.push('<span class="flag mute">Kalite kaydı yok</span>');
  for (const u of g.uyarilar) if (!(askida && u === "Bu kategoride Kalite onayı yok") && u !== "Kalite Merkezi'nde kaydı yok") fl.push(`<span class="flag warn">${esc(u)}</span>`);
  for (const s of g.sartlar) fl.push(`<span class="sub">Şart: ${esc(s)}</span>`);
  return fl;
}

/** Teklif iste penceresinin notu: kalemlerin kategorisi eşleşmezse firma geneli durum kullanılır. */
export function kategoriNotu(r: PurchaseRequest): string {
  const veri = ONAYLI.veri;
  if (veri === null) return "";
  if (!veri.kaliteBagli) return '<div class="note small">Kalite bilgisi alınamadı; Kalite rozetleri gösterilmiyor, kimse onaylı sayılmıyor.</div>';
  const k = talepKategorileri(veri, r, S.materials, matOf);
  return k.anahtarlar.length === 0 && k.eslesmeyen > 0 ? '<div class="note small">Kategori eşleşmedi: kalemlerin kart kategorisi yok, firma geneli Kalite durumu kullanılır.</div>' : "";
}
