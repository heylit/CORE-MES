import type { AlternatifSonucu, KalemZarflariCevabi, TeklifAlternatifi } from "#paylasilan/sozlesme/satin-alma.ts";
import type { Quote, RequestItem as Item } from "./tipler.ts";
import { $$, esc, numIn, parseNum } from "./util.ts";

// 3437 a (dilim 3a): teklif formunda kalemin altında "Alternatif teklif ediliyor" satırı. Nitelikler kalemin daraltılmış kabul zarfından
// önerilir; sonuç (aynı, sınır içinde, şartlı, sınır dışı) kaydedince sunucuda hesaplanır ve rozetle gösterilir.
export type KalemZarfi = KalemZarflariCevabi["kalemler"][number];

const SONUC_ADI: Record<AlternatifSonucu["sonuc"], [string, string]> = {
  ayni: ["İstenenle aynı", "mute"], icinde: ["Sınır içinde", "good"], sartli: ["Şartlı", "warn"], disi: ["Sınır dışı: seçilemez", "bad"],
};
const IZIN_ADI: Record<NonNullable<AlternatifSonucu["izin"]> | "yok", string> = {
  talep: ", talep eden kabul etti", soru: ", talep eden onayladı", ret: ", talep eden reddetti: seçilemez", yok: ", talep edenin onayı bekleniyor",
};
const BEKLER = '<span class="muted small">Sonuç kaydedince hesaplanır.</span>';
// Kayıtlı sonuç, alan değişince geçersizdir: kaydedilene kadar eski rozet gösterilmez.
export function alternatifDegisti(q: Quote, id: string, kok: ParentNode = document): void {
  if (q.altResults?.[id]) delete q.altResults[id];
  const kutu = kok.querySelector(`[data-alt-sonuc-kutu="${id}"]`);
  if (kutu) kutu.innerHTML = '<span class="muted small">Değişti; sonuç kaydedince yeniden hesaplanır.</span>';
}
// Seçilemeyen alternatif (sınır dışı ya da talep edenin reddettiği şartlı) en düşük fiyat vurgusu almaz.
export const secilemezAlternatif = (s: AlternatifSonucu | undefined): boolean => s?.sonuc === "disi" || (s?.sonuc === "sartli" && s.izin === "ret");
export function sonucRozeti(s: AlternatifSonucu | undefined): string {
  if (!s) return "";
  const [ad, ton0] = SONUC_ADI[s.sonuc];
  // 3437-3b-1: şartlıda izin talepte işaretle (talep), sonradan Taleplerim'den (soru) ya da ret ile gelir; ret seçilemez.
  const izin = s.sonuc !== "sartli" ? "" : IZIN_ADI[s.izin ?? "yok"];
  const ton = s.sonuc === "sartli" && s.izin === "ret" ? "bad" : ton0;
  return `<span class="flag ${ton}" data-alt-sonuc="${s.sonuc}">${esc(ad + izin)}</span>${s.nedenler.length ? ` <span class="muted small">${esc(s.nedenler.join(", "))}</span>` : ""}`;
}

function nitelik(id: string, alan: "kalite" | "durum" | "yuzey", etiket: string, istenen: string | null, secenekler: readonly string[], deger: string | null): string {
  const dl = `dl-alt-${alan}-${id}`;
  return `<label class="f"><span>${etiket}</span><input type="text" data-alt="${id}" data-alt-f="${alan}" value="${esc(deger ?? "")}" placeholder="${esc(istenen ?? "Aynı")}" list="${dl}" aria-label="${etiket} (boş: istenen ${esc(istenen ?? "")})"><datalist id="${dl}">${secenekler.map((x) => `<option value="${esc(x)}">`).join("")}</datalist></label>`;
}

export function alternatifSatiri(it: Item, q: Quote, kz: KalemZarfi): string {
  const z = kz.zarf;
  const a = q.alternatives?.[it.id] ?? null;
  const ac = a !== null;
  const kapali = z.kapali;
  const ust = `<label class="chk"><input type="checkbox" data-alt-ac="${it.id}" ${ac ? "checked" : ""} ${kapali && !ac ? "disabled" : ""}> Alternatif teklif ediliyor</label>`;
  const not = kapali ? `<span class="muted small">${esc(z.gerekce ? `Alternatif kapalı: ${z.gerekce}` : "Alternatif kapalı")}</span>` : "";
  if (!ac) return `<tr class="alt-satir"><td colspan="5" class="lead"><div class="alt-kutu">${ust}${not}</div></td></tr>`;
  const olculer = [...z.olcu.map((o) => ({ anahtar: o.anahtar, istenen: o.istenen, ipucu: `en çok ${numIn(o.enCok)}` })),
    ...(z.boy && z.boy.istenen !== null ? [{ anahtar: z.boy.anahtar, istenen: z.boy.istenen, ipucu: z.boy.uzunKesilir ? "uzun kesilir" : "aynı" }] : [])];
  const alanlar = [
    nitelik(it.id, "kalite", "Kalite", z.kalite.istenen, z.kalite.secenekler.map((s) => s.deger), a.kalite),
    nitelik(it.id, "durum", "Durum", z.durum.istenen, z.durum.secenekler.map((s) => s.deger), a.durum),
    ...(z.yuzey.istenen === null ? [] : [nitelik(it.id, "yuzey", "Yüzey", z.yuzey.istenen, [], a.yuzey)]),
    ...olculer.map((o) => `<label class="f"><span>${esc(o.anahtar)} (mm) <small>${esc(o.ipucu)}</small></span><input type="text" inputmode="decimal" data-alt="${it.id}" data-alt-olcu="${esc(o.anahtar)}" value="${numIn(a.olcu[o.anahtar] ?? null)}" placeholder="${numIn(o.istenen)}"></label>`),
  ].join("");
  const sonuc = q.altResults?.[it.id];
  return `<tr class="alt-satir"><td colspan="5" class="lead"><div class="alt-kutu">${ust}${not}<div class="alt-alanlar">${alanlar}</div><div class="alt-sonuc" data-alt-sonuc-kutu="${it.id}">${sonuc ? sonucRozeti(sonuc) : BEKLER}</div><span class="muted small">Boş alan istenenle aynıdır.</span></div></td></tr>`;
}

// Formdaki alternatif alanları teklife okunur; yalnız ekranda satırı olan kalem yazılır (öteki kalemin alternatifi sunucuda korunur).
export function alternatifleriOku(q: Quote, kok: ParentNode = document): void {
  for (const kutu of $$<HTMLInputElement>("[data-alt-ac]", kok)) {
    const id = kutu.dataset.altAc!;
    if (!kutu.checked) {
      if (q.alternatives?.[id] !== undefined || q.altResults?.[id]) (q.alternatives ??= {})[id] = null;
      continue;
    }
    const onceki = q.alternatives?.[id] ?? null;
    const a: TeklifAlternatifi = { kalite: null, durum: null, yuzey: null, olcu: {} };
    const alanlar = $$<HTMLInputElement>(`[data-alt="${id}"]`, kok);
    if (alanlar.length === 0 && onceki) { (q.alternatives ??= {})[id] = onceki; continue; }
    for (const i of alanlar) {
      const v = i.value.trim();
      if (i.dataset.altF) { a[i.dataset.altF as "kalite" | "durum" | "yuzey"] = v === "" ? null : v; continue; }
      const n = parseNum(v);
      if (i.dataset.altOlcu && n !== null && n > 0) a.olcu[i.dataset.altOlcu] = n;
    }
    (q.alternatives ??= {})[id] = a;
  }
}
