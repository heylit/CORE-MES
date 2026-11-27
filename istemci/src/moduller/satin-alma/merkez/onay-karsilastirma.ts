/**
 * 3466-1 (karar C): onaylayanın ekranında teklifler tedarikçi kartları olarak yan yana. Her kart aynı satırları aynı sırada taşır;
 * kartlar ızgarada alt ızgara (subgrid) olduğu için aynı satır her kartta aynı hizadadır. Satırın en iyi değeri vurgulanır.
 * Tutarlar karşılaştırmayla ve karar adımıyla aynı hesaptan gelir (quoteCalc, odemeAyrintisi); burada yeni hesap yoktur.
 */
import type { PurchaseRequest, RequestItem } from "./tipler.ts";
import { SIMGELER } from "../../../ortak/tasarim/simgeler.ts";
import { S } from "./store.ts";
import { lateBy, payText, terminMetni, supName, supplierStats, validity, vsLast, type EvalRow, type Evaluation } from "./calc.ts";
import { kilitMetni, kurFarkiHTML, odemeAyrintisi } from "./karar-ayrintisi.ts";
import { secilemezAlternatif } from "./alternatif.ts";
import { addDays, deltaHTML, esc, fmtDate, isNum, money, nf0, nfx, numIn, parseNum, pct, todayStr } from "./util.ts";
import { alternatifRozeti, kademeRozeti, stars } from "./views.ts";

export const simge = (ad: keyof typeof SIMGELER): string =>
  `<svg class="sa-oy-simge" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${SIMGELER[ad]}"/></svg>`;

type Yon = "min" | "max";
interface Satir { ad: string; alt?: string; hucreler: string[]; degerler?: (number | null)[]; yon?: Yon; anahtar?: boolean }
interface Bolum { ad: string; simge: keyof typeof SIMGELER; satirlar: Satir[] }

/** Satırın en iyisi: yalnız değerlendirmeye uygun ve değeri olan kartlar; en az iki değer olmalı ve hepsi eşit olmamalı. */
export function enIyiler(degerler: readonly (number | null)[], yon: Yon, uygun: readonly boolean[]): Set<number> {
  const ok = degerler.map((v, i) => ({ v, i })).filter((o): o is { v: number; i: number } => isNum(o.v) && !!uygun[o.i]);
  if (ok.length < 2) return new Set();
  const hedef = yon === "min" ? Math.min(...ok.map((o) => o.v)) : Math.max(...ok.map((o) => o.v));
  if (ok.every((o) => Math.abs(o.v - hedef) < 1e-9)) return new Set();
  return new Set(ok.filter((o) => Math.abs(o.v - hedef) < 1e-9).map((o) => o.i));
}

/** Kartların sırası: kararda seçilenler önce, sonra sıralamadaki yerleri. */
export function kartSirasi(ev: Evaluation, secilen: ReadonlySet<string>): EvalRow[] {
  return [...ev.ranking].sort((a, b) => Number(secilen.has(b.q.id)) - Number(secilen.has(a.q.id)));
}

const sub = (t: string): string => (t ? `<span class="sub">${t}</span>` : "");

function kalemSatiri(r: PurchaseRequest, it: RequestItem, kartlar: EvalRow[]): Satir {
  const degerler = kartlar.map((x) => {
    const l = x.c.lines[it.id];
    return l && !secilemezAlternatif(x.q.altResults?.[it.id]) ? l.unit * x.c.unitTRY : null;
  });
  const ilk = degerler.find(isNum);
  const son = isNum(ilk) ? vsLast(r, it, ilk) : null;
  return {
    ad: esc(it.name),
    alt: `${esc(numIn(parseNum(it.qty)))} ${esc(it.unit)}${son ? `, son alış ${money(son.last.unitTRY)}` : ""}`,
    degerler, yon: "min",
    hucreler: kartlar.map((x) => {
      const l = x.c.lines[it.id];
      if (!l) return '<span class="faint">teklif yok</span>';
      // Büyük sayı TL karşılığı (satırlar aynı birimde kıyaslansın); özgün para birimi alt satırda (Arayüz 3466 1).
      const tl = l.unit * x.c.unitTRY, d = vsLast(r, it, tl);
      // Para tutarı satır sonunda bölünmesin (Arayüz 3466 kod sonrası 2).
      const para = (t: string) => `<span class="sa-oy-nowrap">${t}</span>`;
      const ozgun = x.q.currency === "TRY" ? "" : `${para(money(l.unit, x.q.currency))}; `;
      return `${para(money(tl))}${kademeRozeti(x.q, it)}${alternatifRozeti(x.q, it)}${sub(`${ozgun}${para(money(l.line * x.c.unitTRY))}${d ? " " + deltaHTML(d.pct) : ""}`)}`;
    }),
  };
}

function bolumler(r: PurchaseRequest, kartlar: EvalRow[]): Bolum[] {
  const items = r.items || [];
  const tam = (x: EvalRow) => x.c.covered === items.length;
  const od = kartlar.map((x) => odemeAyrintisi(r, x));
  const sst = supplierStats();
  const acik = r.status === "eval" || r.status === "approval";
  const dovizVar = kartlar.some((x) => x.q.currency !== "TRY");
  // 3799: nakliye ve masrafın altında TL karşılığı, talebin kuruyla (onayda sabit kur). Ara toplam iskontodan önce olduğu için TL
  // karşılığı satırıyla karışmasın diye TL almaz; kalem hücresinde TL zaten büyük sayıdır.
  const tl = (x: EvalRow, n: number) => `${money(n, x.q.currency)}${x.q.currency === "TRY" ? "" : sub(money(n * x.c.rate))}`;
  const kilit = kilitMetni(r);
  const tutar: Satir[] = [
    { ad: "Ara toplam", hucreler: kartlar.map((x) => money(x.c.sub, x.q.currency)) },
    { ad: "İskonto", hucreler: kartlar.map((x) => (x.c.disc ? "%" + nfx.format(x.c.disc * 100) : "–")) },
    { ad: "Nakliye ve masraf", hucreler: kartlar.map((x) => (x.q.deliveryIncluded && !x.c.other ? "dahil" : tl(x, x.c.ship + x.c.other))) },
  ];
  if (dovizVar) {
    tutar.push({ ad: "Toplam (teklif para birimi)", hucreler: kartlar.map((x) => money(x.c.total, x.q.currency)) });
    tutar.push({ ad: "Kur", hucreler: kartlar.map((x) => {
      if (x.q.currency === "TRY") return "–";
      const sabit = kilit !== null && isNum(r.award?.fx?.[x.q.currency]);
      const not = sabit ? kilit : isNum(x.q.fxRate) && Math.abs(x.q.fxRate - x.c.rate) > 1e-6 ? `teklif günü ${nfx.format(x.q.fxRate)}` : acik ? "güncel" : "sipariş günü";
      return `${nfx.format(x.c.rate)}${sabit ? ' <span class="flag info">sabit</span>' : ""}${sub(esc(not))}`;
    }) });
  }
  tutar.push({ ad: "TL karşılığı", anahtar: true, yon: "min", degerler: kartlar.map((x) => (tam(x) ? x.c.totalTRY : null)), hucreler: kartlar.map((x) => `${money(x.c.totalTRY)}${kurFarkiHTML(r, x)}${tam(x) ? "" : sub("eksik kalemli")}`) });
  return [
    { ad: "Kalemler (birim fiyat, TL)", simge: "box", satirlar: items.map((it) => kalemSatiri(r, it, kartlar)) },
    { ad: "Tutar ve kur", simge: "lira", satirlar: tutar },
    {
      ad: "Ödeme", simge: "calendar", satirlar: [
        { ad: "Ödeme koşulu", hucreler: kartlar.map((x) => esc(payText(x.q))) },
        { ad: "Ödeme yöntemi", hucreler: od.map((o) => esc(o.yontem)) },
        { ad: "Avans", hucreler: od.map((o) => (o.avans ? `${money(o.avans.tl, "TRY", 0)}${sub(`%${nfx.format(o.avans.yuzde)}, sipariş günü`)}` : "–")) },
        { ad: "Vadeli ödeme", hucreler: od.map((o) => (o.kalan ? `${money(o.kalan.tl, "TRY", 0)}${sub(o.kalan.vadeGun ? (o.kalan.gun ? `${fmtDate(o.kalan.gun)}, tahmini` : "teslim günü bilinmiyor") : "teslimde")}` : "–")) },
        { ad: "Aylık faiz", hucreler: od.map((o) => (o.aylikFaiz === null ? "girilmedi" : "%" + nfx.format(o.aylikFaiz))) },
        { ad: "Vade etkisi", yon: "max", degerler: kartlar.map((x) => (x.c.faizYok ? null : x.c.vadeGain)), hucreler: kartlar.map((x) => (x.c.faizYok ? "hesaba katılmadı" : x.c.vadeGain > 0.5 ? `−${money(x.c.vadeGain, "TRY", 0)}` : "–")) },
        { ad: "Net bugünkü maliyet", anahtar: true, yon: "min", degerler: kartlar.map((x) => (tam(x) ? x.c.pvTRY : null)), hucreler: kartlar.map((x) => `${money(x.c.pvTRY, "TRY", 0)}${tam(x) ? "" : sub("eksik kalemli, tek başına seçilemez")}`) },
      ],
    },
    {
      ad: "Teslimat", simge: "truck", satirlar: [
        { ad: "Termin", yon: "min", degerler: kartlar.map((x) => parseNum(x.q.leadDays)), hucreler: kartlar.map((x) => { const l = parseNum(x.q.leadDays), g = lateBy(r, x.q); return l === null ? "–" : `${terminMetni(x.q)}${g ? sub(`<span class="flag bad">${g} gün geç</span>`) : ""}`; }) },
        { ad: "Tahmini teslim", hucreler: kartlar.map((x) => { const l = parseNum(x.q.leadDays); return l === null ? "–" : fmtDate(addDays(r.award?.orderDate || todayStr(), l)); }) },
        { ad: "Teslim şekli", hucreler: kartlar.map((x) => esc(x.q.deliveryTerm || "–")) },
        { ad: "Garanti", yon: "max", degerler: kartlar.map((x) => parseNum(x.q.warrantyMonths)), hucreler: kartlar.map((x) => { const g = parseNum(x.q.warrantyMonths); return g === null ? "–" : `${g} ay`; }) },
        { ad: "Teklif geçerliliği", hucreler: kartlar.map((x) => { const v = validity(x.q); return v === null ? "–" : v < 0 ? '<span class="flag bad">doldu</span>' : v <= 5 ? `<span class="flag warn">${fmtDate(x.q.validUntil)}, ${v} gün</span>` : fmtDate(x.q.validUntil); }) },
      ],
    },
    {
      ad: "Tedarikçi geçmişi", simge: "users", satirlar: [
        { ad: "Puanınız", hucreler: kartlar.map((x) => stars(S.suppliers[x.q.supplierId]?.rating)) },
        { ad: "Zamanında teslim", yon: "max", degerler: kartlar.map((x) => { const s = sst[x.q.supplierId]; return s && s.deliveries ? s.onTimeRate : null; }), hucreler: kartlar.map((x) => { const s = sst[x.q.supplierId]; return s && s.deliveries ? `${pct(s.onTimeRate)}${sub(`${s.onTime}/${s.deliveries} teslimat`)}` : '<span class="faint">kayıt yok</span>'; }) },
        { ad: "Kalite", hucreler: kartlar.map((x) => { const s = sst[x.q.supplierId]; return s && s.qualityN ? `${pct(s.qualityRate)} sorunsuz` : '<span class="faint">kayıt yok</span>'; }) },
        { ad: "Toplam puan", anahtar: true, yon: "max", degerler: kartlar.map((x) => x.score), hucreler: kartlar.map((x) => nf0.format(x.score)) },
      ],
    },
  ];
}

/** Kartın karara göre farkı: net bugünkü maliyet ve (tek teklifli kararda) termin. Kararın kendisi ve eksik kalemli teklif ayrı yazılır. */
export function kararaGoreFark(r: PurchaseRequest, x: EvalRow, kararNet: number, kararTermin: number | null, secilen: ReadonlySet<string>): string {
  if (secilen.has(x.q.id)) return "Kararda seçilen teklif";
  if (x.c.covered < (r.items || []).length) return "Eksik kalemli; tek başına seçilemez";
  const d = x.c.pvTRY - kararNet, l = parseNum(x.q.leadDays);
  const p: string[] = [Math.abs(d) < 1 ? "Net maliyet karara eşit" : d > 0 ? `Karardan ${money(d, "TRY", 0)} pahalı` : `Karardan ${money(-d, "TRY", 0)} ucuz`];
  if (kararTermin !== null && l !== null && l !== kararTermin) p.push(l > kararTermin ? `${l - kararTermin} gün yavaş` : `${kararTermin - l} gün hızlı`);
  return p.join(", ");
}

/** Yan yana tedarikçi kartları. secilen: kararda seçilen teklif kimlikleri; kararNet: kararın net bugünkü maliyeti (TL). */
export function teklifKartlariHTML(r: PurchaseRequest, ev: Evaluation, secilen: ReadonlySet<string>, kararNet: number): string {
  const kartlar = kartSirasi(ev, secilen);
  if (!kartlar.length) return "";
  const uygun = kartlar.map(() => true);
  const bl = bolumler(r, kartlar);
  const tek = r.award?.mode !== "split" ? kartlar.find((x) => secilen.has(x.q.id)) : undefined;
  const kararTermin = tek ? parseNum(tek.q.leadDays) : null;
  const sira = new Map(ev.ranking.map((x, i) => [x.q.id, i + 1]));
  // Her kartın çocuk sayısı aynı: baş + her bölümde başlık ve satırlar. Izgara bu sayıyla satır açar (alt ızgara hizası).
  const satirSayisi = 1 + bl.reduce((t, b) => t + 1 + b.satirlar.length, 0);
  const enIyi = bl.map((b) => b.satirlar.map((s) => (s.yon && s.degerler ? enIyiler(s.degerler, s.yon, uygun) : new Set<number>())));
  const kart = (x: EvalRow, i: number): string => {
    const karar = secilen.has(x.q.id);
    const v = validity(x.q), g = lateBy(r, x.q), fl: string[] = [];
    if (x.fill > 0) fl.push(`<span class="flag warn">${(r.items || []).length - x.c.covered} kalem eksik</span>`);
    if (g) fl.push(`<span class="flag bad">ihtiyacı ${g} gün kaçırır</span>`);
    if (x.suspended) fl.push('<span class="flag bad">askıdaki tedarikçi</span>');
    if (v !== null && v < 0) fl.push('<span class="flag bad">geçerlilik doldu</span>');
    else if (v !== null && v <= 5) fl.push(`<span class="flag warn">geçerlilik ${v} gün</span>`);
    const bas = `<header class="sa-oy-bas">
      <div class="sa-oy-ad"><b>${esc(supName(x.q))}</b>${karar ? `<span class="flag mute sa-oy-karar">${simge("user")} Karar</span>` : `<span class="xs muted">${sira.get(x.q.id) ?? ""}. sıra</span>`}<span class="xs muted">${esc(x.q.currency)}</span></div>
      <div class="sa-oy-net num">${money(x.c.pvTRY, "TRY", 0)}</div>
      <div class="xs muted">net bugünkü maliyet, puan ${nf0.format(x.score)}</div>
      <div class="sa-oy-fark${karar || x.c.covered < (r.items || []).length ? "" : x.c.pvTRY - kararNet > 0.5 ? " arti" : x.c.pvTRY - kararNet < -0.5 ? " eksi" : ""}">${esc(kararaGoreFark(r, x, kararNet, kararTermin, secilen))}</div>
      ${fl.length ? `<div class="flags">${fl.join("")}</div>` : ""}</header>`;
    const govde = bl.map((b, bi) => `<h4 class="sa-oy-bolum">${simge(b.simge)} ${esc(b.ad)}</h4>${b.satirlar.map((s, si) => {
      const iyi = enIyi[bi]![si]!.has(i);
      return `<div class="sa-oy-satir${s.anahtar ? " key" : ""}${iyi ? " best" : ""}"><span class="sa-oy-k">${s.ad}${s.alt ? `<span class="sub">${s.alt}</span>` : ""}</span><span class="sa-oy-v num">${s.hucreler[i]}${iyi ? `<span class="sa-oy-iyi" title="Bu satırın en iyisi">${simge("target")}<span class="sr-only">en iyi</span></span>` : ""}</span></div>`;
    }).join("")}`).join("");
    return `<article class="sa-oy-kart${karar ? " karar" : ""}" aria-label="${esc(supName(x.q))} teklifi">${bas}${govde}</article>`;
  };
  return `<div class="sa-oy-kartlar" style="--sa-oy-satir:${satirSayisi}">${kartlar.map(kart).join("")}</div>`;
}

/** Onaylayanın dikkat etmesi gerekenler: önce sorunlar, en sonda iyi durum (Arayüz 3466 11). */
export function onayUyarilari(r: PurchaseRequest, ev: Evaluation, secilen: ReadonlySet<string>, butceYuzde: number | null): string[] {
  const kotu: string[] = [], iyi: string[] = [];
  const top = ev.ranking[0];
  const items = (r.items || []).length;
  for (const x of ev.ranking) {
    const ad = esc(supName(x.q)), g = lateBy(r, x.q), v = validity(x.q);
    if (g) kotu.push(`<span class="flag ${secilen.has(x.q.id) ? "bad" : "warn"}">${simge("alert")} ${ad} ihtiyaç tarihini ${g} gün kaçırır</span>`);
    if (v !== null && v < 0) kotu.push(`<span class="flag bad">${simge("clock")} ${ad} teklifinin geçerliliği doldu</span>`);
    else if (v !== null && v <= 5) kotu.push(`<span class="flag warn">${simge("clock")} ${ad} teklifinin geçerliliği ${v} gün</span>`);
    if (x.c.covered < items) kotu.push(`<span class="flag warn">${simge("box")} ${ad} ${items - x.c.covered} kaleme teklif vermedi</span>`);
  }
  if (r.award?.mode === "single" && top && !secilen.has(top.q.id)) kotu.unshift(`<span class="flag warn">${simge("flag")} Önerilen teklif (${esc(supName(top.q))}) seçilmedi</span>`);
  if (ev.ranking.length === 1) kotu.push(`<span class="flag warn">${simge("list")} Tek teklif değerlendirildi</span>`);
  if (butceYuzde !== null) (butceYuzde > 100 ? kotu : iyi).push(`<span class="flag ${butceYuzde > 100 ? "bad" : "info"}">${simge("lira")} ${esc(r.department)} bütçesi bu alımla ${pct(butceYuzde)}</span>`);
  if (r.award?.mode === "single" && top && secilen.has(top.q.id)) iyi.push(`<span class="flag good">${simge("check")} Önerilen teklif seçildi</span>`);
  return [...kotu, ...iyi];
}
