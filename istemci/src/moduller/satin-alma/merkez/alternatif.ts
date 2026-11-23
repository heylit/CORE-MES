import { olcuEtiketi } from "#paylasilan/malzeme-alternatif-ozeti.ts";
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

function nitelik(id: string, alan: "kalite" | "durum" | "yuzey" | "islem", etiket: string, istenen: string | null, secenekler: readonly string[], deger: string | null): string {
  const dl = `dl-alt-${alan}-${id}`;
  return `<label class="f"><span>${etiket}</span><input type="text" data-alt="${id}" data-alt-f="${alan}" value="${esc(deger ?? "")}" placeholder="${esc(istenen ?? "Aynı")}" list="${dl}" aria-label="${etiket} (boş: istenen ${esc(istenen ?? "")})"><datalist id="${dl}">${secenekler.map((x) => `<option value="${esc(x)}">`).join("")}</datalist></label>`;
}

// 3593: teklif kalemde işaretli bir alternatif kartına dayanabilir. Ekran kartın bugünkü sınırıyla ön denetim yapar (sınır dışı satır
// kırmızı, Kaydet pasif); sunucu yeniden denetler ve sınırı teklife dondurur.
type KartSiniri = NonNullable<KalemZarfi["alternatifKartlari"]>[number];
const TUR_ADI: Record<KartSiniri["tur"], string> = { tam: "tam", ust: "üst", sartli: "şartlı" };
const sayi = (v: number): string => v.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
const islemListesi = (v: string): string[] => [...new Set(v.split(/[,+]/).map((x) => x.trim()).filter(Boolean))];
const secilenKart = (kz: KalemZarfi, a: TeklifAlternatifi | null): KartSiniri | undefined =>
  a?.kartId == null ? undefined : kz.alternatifKartlari?.find((k) => k.setId === a.kartId);
function istenenOlcu(kz: KalemZarfi, anahtar: string): number | undefined {
  const o = kz.zarf.olcu.find((x) => x.anahtar === anahtar);
  if (o) return o.istenen;
  return kz.zarf.boy?.anahtar === anahtar ? kz.zarf.boy.istenen ?? undefined : undefined;
}
/** Seçilen alternatif kartının sınırına göre ilk tutmayan alan ve nedeni; kart seçili değilse null. */
export function kartHatasi(kz: KalemZarfi, a: TeklifAlternatifi | null): { alan: string | null; mesaj: string } | null {
  const k = secilenKart(kz, a);
  if (!k || !a) return null;
  if (k.degisti) return { alan: null, mesaj: `${k.ad} talepte işaretlendikten sonra değişti; talep eden kalemi yeni sınırla güncellemeden bu kartla kaydedilmez.` };
  const disi = (alan: string, ne: string) => ({ alan, mesaj: `${ne}, ${k.ad} sınırı dışında; kaydedilmez. Değeri düzeltin ya da başka kart seçin.` });
  const z = kz.zarf;
  for (const s of k.sinir) {
    if (s.degerler !== null) {
      if (s.nitelik === "islem") {
        const v = a.islem ?? kz.islem ?? [];
        const tutar = s.birebir ? v.length === s.degerler.length && v.every((x) => s.degerler!.includes(x)) : s.degerler.every((x) => v.includes(x));
        if (!tutar) return disi("islem", `işlem ${v.join(" + ") || "yok"}`);
        continue;
      }
      if (s.nitelik !== "kalite" && s.nitelik !== "durum" && s.nitelik !== "yuzey") continue;
      const v = a[s.nitelik] ?? z[s.nitelik].istenen;
      const tutar = s.birebir && s.degerler.length === 0 ? v === null : v !== null && s.degerler.includes(v);
      if (!tutar) return disi(s.nitelik, `${s.nitelik === "yuzey" ? "yüzey" : s.nitelik} ${v ?? "yok"}`);
      continue;
    }
    const v = a.olcu[s.nitelik] ?? istenenOlcu(kz, s.nitelik);
    const e = olcuEtiketi(s.nitelik);
    if (v === undefined) return disi(`olcu-${s.nitelik}`, `${e} yok`);
    if ((s.alt !== null && v < s.alt - 1e-6) || (s.ust !== null && v > s.ust + 1e-6)) {
      const ara = s.alt !== null && s.ust !== null ? (s.alt === s.ust ? `birebir ${sayi(s.alt)}` : `${sayi(s.alt)}–${sayi(s.ust)}`) : s.alt !== null ? `en az ${sayi(s.alt)}` : `en çok ${sayi(s.ust!)}`;
      return disi(`olcu-${s.nitelik}`, `${e} ${sayi(v)} mm (sınır ${ara})`);
    }
  }
  return null;
}
/** Formdaki bütün kalemlerin ön denetimi: hatalı satır kırmızı, alan aria-invalid, neden role=alert; Kaydet aria-disabled ve nedene bağlı. */
export function alternatifHatalariniGoster(q: Quote, zarflar: ReadonlyMap<string, KalemZarfi>, kok: ParentNode = document): string | null {
  let ilk: { mesaj: string; kutu: string } | null = null;
  for (const [id, kz] of zarflar) {
    const kutu = kok.querySelector<HTMLElement>(`[data-alt-hata="${id}"]`);
    if (!kutu) continue;
    const h = kartHatasi(kz, q.alternatives?.[id] ?? null);
    kok.querySelectorAll<HTMLElement>(`[data-alt="${id}"]`).forEach((i) => i.removeAttribute("aria-invalid"));
    kutu.closest("tr")?.classList.toggle("alt-hatali", !!h);
    if (!h) { kutu.textContent = ""; continue; }
    if (kutu.textContent !== h.mesaj) kutu.innerHTML = `<span role="alert">${esc(h.mesaj)}</span>`;
    const alan = h.alan === null ? null : h.alan.startsWith("olcu-") ? kok.querySelector(`[data-alt="${id}"][data-alt-olcu="${h.alan.slice(5)}"]`) : kok.querySelector(`[data-alt="${id}"][data-alt-f="${h.alan}"]`);
    alan?.setAttribute("aria-invalid", "true");
    ilk ??= { mesaj: h.mesaj, kutu: kutu.id };
  }
  // Kaydet formun altındaki düğme çubuğundadır (formun dışında).
  const kaydet = kok.querySelector<HTMLElement>('[data-act="save-quote"]') ?? document.querySelector<HTMLElement>('[data-act="save-quote"]');
  if (kaydet && ilk) { kaydet.setAttribute("aria-disabled", "true"); kaydet.setAttribute("aria-describedby", ilk.kutu); }
  else if (kaydet) { kaydet.removeAttribute("aria-disabled"); kaydet.removeAttribute("aria-describedby"); }
  return ilk?.mesaj ?? null;
}

export function alternatifSatiri(it: Item, q: Quote, kz: KalemZarfi): string {
  const z = kz.zarf;
  const a = q.alternatives?.[it.id] ?? null;
  const ac = a !== null;
  const kapali = z.kapali;
  const ust = `<label class="chk"><input type="checkbox" data-alt-ac="${it.id}" ${ac ? "checked" : ""} ${kapali && !ac ? "disabled" : ""}> Alternatif teklif ediliyor</label>`;
  const not = kapali ? `<span class="muted small">${esc(z.gerekce ? `Alternatif kapalı: ${z.gerekce}` : "Alternatif kapalı")}</span>` : "";
  if (!ac) return `<tr class="alt-satir"><td colspan="5" class="lead"><div class="alt-kutu">${ust}${not}</div></td></tr>`;
  const kartlar = kz.alternatifKartlari ?? [];
  const kart = secilenKart(kz, a);
  const kartSec = kartlar.length === 0 ? "" : `<label class="f alt-kart"><span>Teklif edilen</span><select data-alt="${it.id}" data-alt-kart="${it.id}"><option value="">Kabul sınırı (ana malzeme)</option>${kartlar.map((k) => `<option value="${k.setId}" ${a.kartId === k.setId ? "selected" : ""} ${k.degisti && a.kartId !== k.setId ? "disabled" : ""}>${esc(`${k.ad} · ${TUR_ADI[k.tur]}${k.degisti ? " (değişti; talep eden güncellemeli)" : ""}`)}</option>`).join("")}</select></label>`;
  const kartOzeti = kart ? `<span class="muted small" data-alt-kart-ozet="">${esc(`${kart.ad}: ${kart.ozet}`)}</span>` : "";
  const birebir = new Set((kart?.sinir ?? []).filter((x) => x.birebir && x.degerler === null).map((x) => x.nitelik as string));
  const olculer = [...z.olcu.map((o) => ({ anahtar: o.anahtar, istenen: o.istenen, ipucu: kart ? "" : `en çok ${numIn(o.enCok)}` })),
    ...(z.boy && z.boy.istenen !== null ? [{ anahtar: z.boy.anahtar, istenen: z.boy.istenen, ipucu: kart ? "" : z.boy.uzunKesilir ? "uzun kesilir" : "aynı" }] : [])];
  const islemIstenen = (kz.islem ?? []).join(" + ") || "yok";
  const alanlar = [
    nitelik(it.id, "kalite", "Kalite", z.kalite.istenen, z.kalite.secenekler.map((s) => s.deger), a.kalite),
    nitelik(it.id, "durum", "Durum", z.durum.istenen, z.durum.secenekler.map((s) => s.deger), a.durum),
    ...(z.yuzey.istenen === null ? [] : [nitelik(it.id, "yuzey", "Yüzey", z.yuzey.istenen, [], a.yuzey)]),
    ...(kz.islem === undefined ? [] : [nitelik(it.id, "islem", "İşlem", islemIstenen, [], a.islem ? a.islem.join(", ") : null)]),
    ...olculer.map((o) => birebir.has(o.anahtar)
      ? `<span class="f"><span>${esc(olcuEtiketi(o.anahtar))} (mm)</span><output data-alt-birebir="${esc(o.anahtar)}">${numIn(o.istenen)} (birebir)</output></span>`
      : `<label class="f"><span>${esc(olcuEtiketi(o.anahtar))} (mm)${o.ipucu ? ` <small>${esc(o.ipucu)}</small>` : ""}</span><input type="text" inputmode="decimal" data-alt="${it.id}" data-alt-olcu="${esc(o.anahtar)}" value="${numIn(a.olcu[o.anahtar] ?? null)}" placeholder="${numIn(o.istenen)}"></label>`),
  ].join("");
  const sonuc = q.altResults?.[it.id];
  return `<tr class="alt-satir"><td colspan="5" class="lead"><div class="alt-kutu">${ust}${not}${kartSec ? `<div class="alt-alanlar">${kartSec}${kartOzeti}</div>` : ""}<div class="alt-alanlar">${alanlar}</div><div class="alt-hata" id="alt-hata-${it.id}" data-alt-hata="${it.id}"></div><div class="alt-sonuc" data-alt-sonuc-kutu="${it.id}">${sonuc ? sonucRozeti(sonuc) : BEKLER}</div><span class="muted small">${kart ? "Yalnız kartın gevşettiği nitelikleri girin; birebir olanlar salt okunur. " : ""}Boş alan istenenle aynıdır; işlem virgülle ayrılır.</span></div></td></tr>`;
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
      if (i.dataset.altKart !== undefined) { if (v !== "") a.kartId = Number(v); continue; }
      if (i.dataset.altF === "islem") { if (v !== "") a.islem = islemListesi(v); continue; }
      if (i.dataset.altF) { a[i.dataset.altF as "kalite" | "durum" | "yuzey"] = v === "" ? null : v; continue; }
      const n = parseNum(v);
      if (i.dataset.altOlcu && n !== null && n > 0) a.olcu[i.dataset.altOlcu] = n;
    }
    (q.alternatives ??= {})[id] = a;
  }
}
