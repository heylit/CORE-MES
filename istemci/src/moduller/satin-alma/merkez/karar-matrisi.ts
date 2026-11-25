/**
 * 3590: teklif karar sayfası tek sayfadır (ön izleme D). Satır kalem, sütun tedarikçi; teklifler, kalem fiyatları, şartlar ve dağıtma tek
 * tabloda. Karar alttaki tek çubuktadır: hücreye basmak kalemi o tedarikçiye verir, sütun başlığı bütün kalemleri verir, "Böl" miktarı
 * paylaştırır. Kalem "karara dahil" değilse onaya gönderilirken teklifleriyle yeni talebe ayrılır (P1, sunucuda tek komut).
 * Telefonda ana yüzey kalem listesidir; tedarikçi değişimi pencerede. Taslak yalnız bu ekranda tutulur; onaya gönderilince yazılır.
 */
import type { Award, PurchaseRequest, RequestItem } from "./tipler.ts";
import { OPEN } from "./constants.ts";
import { SIMGELER } from "../../../ortak/tasarim/simgeler.ts";
import { S, V, backend, canWrite, saveRequest } from "./store.ts";
import {
  approvalState, awardTotals, evaluate, vsLast, itemCost, itemLineCost, optimalSplit, payText, terminMetni, planCost, requiredApprover, supName, supplierStats, validity,
  type EvalRow, type Evaluation,
} from "./calc.ts";
import { $, deltaHTML, esc, fmtDate, isNum, kokIcinde, money, nf0, numIn, parseNum, pct, todayStr } from "./util.ts";
import { parcaAltSatiri } from "./kalem-bagi.ts";
import { secilemezAlternatif } from "./alternatif.ts";
import { rehberRozetleri } from "./onayli-ekran.ts";
import { PRESETS, UI, alternatifRozeti, faizUyarisi, kademeRozeti, render } from "./views.ts";
import { closeModal, eylemCalistir, openModal, toast } from "./ui.ts";
import { bolmeKapaliNedeni, bolunemezNedeni, kalemAtamasi } from "./kalem-kalem.ts";
import { tabSim } from "./sim.ts";

export const ik = (ad: keyof typeof SIMGELER, boy = 16): string =>
  `<svg width="${boy}" height="${boy}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${SIMGELER[ad]}"/></svg>`;

interface Taslak { rid: string; atama: Record<string, string>; dahil: Record<string, boolean>; gerekce: string; onceki: Record<string, string> | null }
const TASLAK: { x: Taslak | null } = { x: null };

/** Taslağı talebin bugünkü kalemleriyle eşitler: yeni kalem (bölünen satır) atamasını kalemAtamasi'ndan alır, karara dahil başlar. */
export function taslak(r: PurchaseRequest, ev: Evaluation): Taslak {
  if (TASLAK.x?.rid !== r.id) TASLAK.x = { rid: r.id, atama: {}, dahil: {}, gerekce: r.award?.reason ?? "", onceki: null };
  const t = TASLAK.x, varsayilan = kalemAtamasi(r, ev);
  const fiyatli = (it: RequestItem, qid: string | undefined) => !!qid && ev.elig.some((x) => x.q.id === qid && itemCost(x, it) !== null);
  for (const it of r.items ?? []) {
    if (!fiyatli(it, t.atama[it.id])) { const v = varsayilan[it.id]; if (v) t.atama[it.id] = v; else delete t.atama[it.id]; }
    if (!(it.id in t.dahil)) t.dahil[it.id] = true;
  }
  return t;
}
export function taslagiBirak(): void { TASLAK.x = null; }

/** Parçalı gönderim yalnız değerlendirmedeki, siparişsiz talepte (sunucu da reddeder). */
const parcaliOlur = (r: PurchaseRequest): boolean => r.status === "eval" && !(r.items ?? []).some((it) => it.sabit === "kaynak")
  && !(r.guncellemeGrubu ?? []).some((u) => u.id !== r.id && u.status !== "cancelled");
const kilitli = (r: PurchaseRequest): boolean => !canWrite() || !OPEN.includes(r.status) || approvalState(r).state === "approved";

/** Taslağın kararı: karara dahil kalemler; tek tedarikçi kalırsa tek karar. */
export function taslakKarari(r: PurchaseRequest, ev: Evaluation): { secilen: RequestItem[]; kalan: RequestItem[]; kullanilan: string[]; plan: ReturnType<typeof planCost>; award: Award | null } {
  const t = taslak(r, ev);
  const items = r.items ?? [];
  const secilen = items.filter((it) => t.dahil[it.id] !== false);
  const kalan = items.filter((it) => t.dahil[it.id] === false);
  const atama = Object.fromEntries(secilen.flatMap((it) => (t.atama[it.id] ? [[it.id, t.atama[it.id]!]] : [])));
  const plan = planCost({ ...r, items: secilen }, ev.all, atama);
  const kullanilan = [...new Set(Object.values(atama))];
  if (!secilen.length || !plan.ok || !kullanilan.length) return { secilen, kalan, kullanilan, plan, award: null };
  const eski: Partial<Award> = r.award ?? {};
  const tek = kullanilan.length === 1;
  const award: Award = {
    mode: tek ? "single" : "split", quoteId: tek ? kullanilan[0]! : null, ...(tek ? {} : { splits: atama }),
    reason: t.gerekce.trim(), by: eski.by || S.me?.name || "", decidedAt: eski.decidedAt || todayStr(), approvals: [],
    ...(eski.fx ? { fx: eski.fx } : {}),
  };
  return { secilen, kalan, kullanilan, plan, award };
}

/** Gerekçe: önerilen tek teklif ya da seçilen kalemlerin en uygun dağılımı seçilmediyse zorunlu. */
function gerekceGerekir(r: PurchaseRequest, ev: Evaluation, k: ReturnType<typeof taslakKarari>): boolean {
  if (!k.award) return false;
  const top = ev.ranking[0];
  if (k.award.mode === "single" && top && k.award.quoteId === top.q.id) return false;
  const alt = { ...r, items: k.secilen };
  const enIyi = Math.min(optimalSplit(alt, ev.elig)?.total ?? Infinity, top ? planCost(alt, ev.all, Object.fromEntries(k.secilen.map((it) => [it.id, top.q.id]))).total : Infinity);
  return !(k.plan.total <= enIyi + 0.5);
}

/* ---------------- tablo ---------------- */
function enUcuzMu(ev: Evaluation, it: RequestItem, x: EvalRow): boolean {
  const l = ev.elig.filter((y) => !secilemezAlternatif(y.q.altResults?.[it.id])).map((y) => itemCost(y, it)).filter(isNum);
  const u = itemCost(x, it);
  return l.length >= 2 && u !== null && Math.abs(u - Math.min(...l)) < 0.005 && !secilemezAlternatif(x.q.altResults?.[it.id]);
}
function nitelik(r: PurchaseRequest, x: EvalRow): string[] {
  const v = validity(x.q), fl: string[] = [];
  if (x.fill > 0) fl.push(`<span class="flag warn">${(r.items ?? []).length - x.c.covered} kalem eksik</span>`);
  if (x.late) fl.push(`<span class="flag bad">ihtiyacı ${x.late} gün kaçırır</span>`);
  if (x.suspended) fl.push('<span class="flag bad">askıdaki tedarikçi</span>');
  fl.push(...rehberRozetleri(r, x.q.supplierId));
  if (v !== null && v < 0) fl.push('<span class="flag bad">geçerlilik doldu</span>');
  else if (v !== null && v <= 5) fl.push(`<span class="flag warn">geçerlilik ${v} gün</span>`);
  return fl;
}
function tedBaslik(r: PurchaseRequest, ev: Evaluation, x: EvalRow, kilit: boolean): string {
  const fl = nitelik(r, x);
  return `<div class="sa-kr-ted"><span class="sa-kr-ted-ad"><b>${esc(supName(x.q))}</b>${ev.ranking[0]?.q.id === x.q.id ? ` <span class="flag good">${ik("check", 12)} önerilen</span>` : ""}</span>
    <span class="num sa-kr-net" title="Tüm kalemler, nakliye ve vade etkisi dahil net bugünkü maliyet">${money(x.c.pvTRY, "TRY", 0)}</span><span class="xs muted">tüm kalemler, net, vade dahil</span>
    <span class="small muted">${terminMetni(x.q) ?? "termin yok"} · ${esc(payText(x.q))}</span>
    <span class="small muted">puan <b class="num">${nf0.format(x.score)}</b></span>
    ${fl.length ? `<span class="flags">${fl.join("")}</span>` : ""}
    <span class="row sa-kr-ted-d">${kilit ? "" : `<button class="btn sm" data-act="kr-tek" data-qid="${x.q.id}">Tümünü ver</button>`}<button class="btn sm ghost sa-kr-ikon" data-act="calc" data-qid="${x.q.id}" title="Hesabı göster" aria-label="Hesabı göster: ${esc(supName(x.q))}">${ik("lira")}</button></span></div>`;
}
/** Üst kademe ipucu: "20 adet alınırsa ..." (teklif para biriminde, eski tablodaki gibi). */
function ust(x: EvalRow, it: RequestItem): string {
  const l = x.c.lines[it.id]?.ust;
  return l ? `<span class="xs muted">${esc(numIn(l.min))} ${esc(it.unit)} alınırsa ${money(l.line, x.q.currency)}</span>` : "";
}
function hucre(r: PurchaseRequest, ev: Evaluation, t: Taslak, it: RequestItem, x: EvalRow, kilit: boolean): string {
  const u = itemCost(x, it);
  if (u === null) return '<span class="faint small">teklif yok</span>';
  const secilemez = secilemezAlternatif(x.q.altResults?.[it.id]);
  const secili = t.atama[it.id] === x.q.id, eu = enUcuzMu(ev, it, x), tutar = itemLineCost(x, it);
  const etiket = `${it.name}, ${supName(x.q)}, birim ${money(u)}${eu ? ", en ucuz" : ""}${secili ? ", seçili" : ""}`;
  return `<button class="sa-kr-hucre${secili ? " sec" : ""}" data-act="kr-ata" data-item="${it.id}" data-qid="${x.q.id}" aria-pressed="${secili}" ${kilit || secilemez ? "disabled" : ""} aria-label="${esc(etiket)}">
    <span class="num sa-kr-bf">${secili ? ik("check", 12) : ""}${money(u)}</span>${kademeRozeti(x.q, it)}${alternatifRozeti(x.q, it)}
    <span class="num small muted">${tutar === null ? "" : money(tutar, "TRY", 0)}</span>${ust(x, it)}${eu ? `<span class="sa-kr-eu small">${ik("down", 12)} en ucuz</span>` : ""}</button>`;
}
/** Miktar ve (3100) kalem karşılığı: "10 kg (≈ 4 adet)". */
const miktarMetni = (it: RequestItem): string => (isNum(it.qty) ? `${numIn(it.qty)} ${esc(it.unit)}${it.karsilik ? ` (${esc(it.karsilik)})` : ""}` : "miktar yok");
/** Son alışa göre en ucuz geçerli fiyat (eski karşılaştırmadaki "son alış"). */
function sonAlis(r: PurchaseRequest, it: RequestItem): string {
  const ev = evaluate(r);
  const u = ev.elig.map((x) => (secilemezAlternatif(x.q.altResults?.[it.id]) ? null : itemCost(x, it))).filter(isNum);
  if (!u.length) return "";
  const d = vsLast(r, it, Math.min(...u));
  return d ? ` · son alış ${money(d.last.unitTRY)} ${deltaHTML(d.pct)}` : "";
}
function kalemHucresi(r: PurchaseRequest, t: Taslak, it: RequestItem, kilit: boolean): string {
  const dahil = t.dahil[it.id] !== false;
  const bolNeden = bolunemezNedeni(it) ?? bolmeKapaliNedeni(r);
  const dahilKutu = kilit || !parcaliOlur(r) ? "" : `<label class="sa-kr-dahil"><input type="checkbox" data-kr-dahil="${it.id}" ${dahil ? "checked" : ""}> karara dahil</label>`;
  const bagli = bolunemezNedeni(it);
  const bol = kilit ? "" : bolNeden ? (bagli ? `<span class="xs muted">${esc(bagli)}</span>` : "") : `<button class="btn sm ghost" data-act="kk-bol" data-item="${it.id}" title="Miktarı tedarikçilere böl">${ik("route", 14)} Böl</button>`;
  return `<div class="sa-kr-kalem"><b>${esc(it.name)}</b><span class="small muted sub">${miktarMetni(it)}${it.spec ? ` · ${esc(it.spec)}` : ""}${sonAlis(r, it)}</span>${parcaAltSatiri(it)}
    ${dahil ? "" : `<span class="flag warn">${ik("clock", 12)} yeni talebe ayrılır</span>`}<span class="row">${dahilKutu}${bol}</span></div>`;
}
function matris(r: PurchaseRequest, ev: Evaluation, t: Taslak, kilit: boolean): string {
  const cols = ev.ranking, items = r.items ?? [];
  const sst = supplierStats();
  const sart = (ad: string, f: (x: EvalRow) => string) => `<tr><th scope="row" class="sa-kr-sol">${ad}</th>${cols.map((x) => `<td class="r">${f(x)}</td>`).join("")}</tr>`;
  return `<div class="tw sa-kr-kay" role="region" tabindex="0" aria-label="Teklif karşılaştırma tablosu, ${cols.length} tedarikçi"><table class="sa-kr-t">
    <thead><tr><th scope="col" class="sa-kr-sol">Kalem <span class="small muted">· hücre: kalemi o tedarikçiye ver</span></th>${cols.map((x) => `<th scope="col">${tedBaslik(r, ev, x, kilit)}</th>`).join("")}</tr></thead>
    <tbody>${items.map((it) => `<tr class="${t.dahil[it.id] === false ? "sa-kr-ayrik" : ""}" data-kr-kalem="${it.id}"><th scope="row" class="sa-kr-sol">${kalemHucresi(r, t, it, kilit)}</th>
      ${cols.map((x) => `<td>${hucre(r, ev, t, it, x, kilit)}</td>`).join("")}</tr>`).join("")}</tbody>
    <tfoot>
      ${sart("Tüm kalemler, nakliye dahil (vade etkisi hariç)", (x) => `<b class="num">${money(x.c.totalTRY, "TRY", 0)}</b>`)}
      ${sart("Nakliye ve masraf", (x) => (x.q.deliveryIncluded && !x.c.other ? "dahil" : money(x.c.ship + x.c.other, x.q.currency)))}
      ${sart("Ödeme", (x) => esc(payText(x.q)))}
      ${sart("Termin", (x) => terminMetni(x.q) ?? "–")}
      ${sart("Garanti", (x) => { const g = parseNum(x.q.warrantyMonths); return isNum(g) ? `${g} ay` : "–"; })}
      ${sart("Teklif geçerliliği", (x) => { const v = validity(x.q); return v === null ? "–" : v < 0 ? '<span class="flag bad">doldu</span>' : fmtDate(x.q.validUntil); })}
      ${sart("Geçmiş", (x) => { const st = sst[x.q.supplierId]; return st && st.deliveries ? `${st.deliveries} teslimat, ${pct(st.onTimeRate)} zamanında` : '<span class="faint">kayıt yok</span>'; })}
    </tfoot></table></div>`;
}
/** Seçilen en ucuz değilse en ucuzun adı ve fiyatı (telefon kartı). */
function enUcuzu(ev: Evaluation, it: RequestItem): string {
  const y = ev.elig.find((x) => enUcuzMu(ev, it, x));
  return y ? `<span class="xs muted sa-kr-eu-not">${ik("down", 12)} en ucuz ${esc(supName(y.q))} <span class="num">${money(itemCost(y, it))}</span></span>` : "";
}
/** Telefon ve dar tablet: kalem listesi; tedarikçi "Değiştir" penceresinde. */
function liste(r: PurchaseRequest, ev: Evaluation, t: Taslak, kilit: boolean): string {
  const satir = (it: RequestItem): string => {
    const dahil = t.dahil[it.id] !== false;
    const x = ev.elig.find((y) => y.q.id === t.atama[it.id]);
    const tutar = x ? itemLineCost(x, it) : null;
    const secim = !dahil ? '<span class="muted">bu kararda yok · yeni talebe ayrılır</span>'
      : x ? `${esc(supName(x.q))} · <span class="num">${money(itemCost(x, it))}</span>${enUcuzMu(ev, it, x) ? ` <span class="sa-kr-eu">${ik("down", 12)} en ucuz</span>` : enUcuzu(ev, it)}` : '<span class="muted">tedarikçi seçilmedi</span>';
    return `<li class="sa-kr-ls${dahil ? "" : " sa-kr-ayrik"}"><div class="row"><b>${esc(it.name)}</b><span class="spacer"></span><span class="num">${dahil && tutar !== null ? money(tutar, "TRY", 0) : ""}</span></div>
      <div class="small muted sub">${miktarMetni(it)}${it.spec ? ` · ${esc(it.spec)}` : ""}</div>${parcaAltSatiri(it)}<div class="small">${secim}</div>
      ${kilit ? "" : `<div class="row">${parcaliOlur(r) ? `<label class="sa-kr-dahil"><input type="checkbox" data-kr-dahil="${it.id}" ${dahil ? "checked" : ""}> Karara dahil</label>` : ""}<span class="spacer"></span><button class="btn" data-act="kr-degistir" data-item="${it.id}" aria-label="${esc(it.name)}: tedarikçiyi değiştir ya da böl">Değiştir</button></div>`}</li>`;
  };
  return `<ul class="sa-kr-liste">${(r.items ?? []).map(satir).join("")}</ul>
    <details class="sa-kr-tedler"><summary>${ik("sort", 14)} Tedarikçileri karşılaştır (${ev.ranking.length})</summary>
      ${ev.ranking.map((x) => `<div class="sa-kr-tsat"><div>${tedBaslik(r, ev, x, kilit)}</div></div>`).join("")}</details>`;
}
function agirlikSecimi(r: PurchaseRequest, ev: Evaluation): string {
  const tw = Object.values(ev.w).reduce((a, v) => a + (+v || 0), 0) || 1;
  const hazir = Object.entries(PRESETS).find(([, p]) => (Object.keys(p.w) as (keyof typeof p.w)[]).every((k) => Math.round((+ev.w[k] || 0) / tw * 100) === p.w[k]));
  const kilit = !canWrite() || !OPEN.includes(r.status);
  return `<label class="sa-kr-agirlik small"><span class="muted">Ağırlık</span><select data-kr-agirlik aria-label="Değerlendirme ağırlığı" ${kilit ? "disabled" : ""}>
    ${hazir ? "" : '<option value="" selected>Özel</option>'}${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}" title="${esc(p.d)}" ${hazir?.[0] === k ? "selected" : ""}>${esc(p.l)}</option>`).join("")}</select></label>`;
}
function ipucu(r: PurchaseRequest, ev: Evaluation, t: Taslak, kilit: boolean): string {
  if (t.onceki) return `<div class="sa-kr-ipucu" aria-live="polite">${ik("check")}<span>Seçimler en uygun dağılıma göre güncellendi.</span><span class="spacer"></span><button class="btn sm" data-act="kr-geri-al">Geri al</button></div>`;
  const sp = ev.split;
  if (kilit || !sp || !sp.suggested) return "";
  const ayni = (r.items ?? []).every((it) => !sp.plan.assign[it.id] || t.atama[it.id] === sp.plan.assign[it.id]);
  if (ayni) return "";
  const degisen = (r.items ?? []).filter((it) => sp.plan.assign[it.id] && t.atama[it.id] !== sp.plan.assign[it.id]).length;
  const metin = sp.best ? `${degisen} kalemin tedarikçisi değişir. Kalemleri ${sp.used.length} tedarikçiye bölerek alırsanız nakliye dahil <b class="num">${money(sp.saving, "TRY", 0)}</b> daha uygun; en uygun tek tedarikçi ${esc(supName(sp.best.q))}.`
    : `${degisen} kalemin tedarikçisi değişir. Hiçbir tedarikçi bütün kalemlere teklif vermedi; en uygun dağılım nakliye dahil <b class="num">${money(sp.total, "TRY", 0)}</b>.`;
  return `<div class="sa-kr-ipucu">${ik("route")}<span>${metin}</span><span class="spacer"></span><button class="btn sm" data-act="kr-uygula">Uygula</button></div>`;
}
function ayrilmaSeridi(r: PurchaseRequest, t: Taslak): string {
  const p: string[] = [];
  const kal = (r.items ?? []).filter((it) => t.dahil[it.id] === false);
  if (kal.length) p.push(`${ik("route")}<span><b>${kal.length} kalem bu karara girmiyor:</b> ${esc(kal.map((x) => x.name).join(", "))}. Onaya gönderince teklifleriyle birlikte yeni talebe ayrılır, Karar adımında bekler.</span>`);
  return p.length ? `<div class="sa-kr-serit" aria-label="Ayrılacak kalemler">${p.join("")}</div>` : "";
}
/** Talebin ayrıldığı ve ondan ayrılan talepler (tutarsız bağ, S9). */
export function ayrilmaBagi(r: PurchaseRequest): string {
  const a = r.ayrilma;
  if (!a) return "";
  const bag = (id: string, no: string) => `<button class="lnk num" data-act="open" data-id="${esc(id)}">${esc(no)}</button>`;
  const l: string[] = [];
  if (a.ayrildigi) l.push(`Bu talep ${bag(a.ayrildigi.id, a.ayrildigi.no)} talebinden ayrıldı.`);
  for (const x of a.ayrilanlar) l.push(`Kalan ${x.kalemSayisi} kalem ${bag(x.id, x.no)} talebinde.`);
  return l.length ? `<div class="sa-kr-bag small">${ik("route", 14)}<span>${l.join(" ")}</span></div>` : "";
}

/* ---------------- karar çubuğu ---------------- */
function cubuk(r: PurchaseRequest, ev: Evaluation, t: Taslak): string {
  const k = taslakKarari(r, ev);
  const n = (r.items ?? []).length;
  const ozet = !k.award ? "Kalemlere tedarikçi seçin" : k.award.mode === "single" ? `${k.secilen.length}/${n} kalem · ${esc(supName(r.quotes.find((q) => q.id === k.award!.quoteId)!))}` : `${k.secilen.length}/${n} kalem · ${k.kullanilan.length} tedarikçiye bölünmüş`;
  const alt = [k.kalan.length ? `İşaretsiz ${k.kalan.length} kalem teklifleriyle yeni talebe ayrılır` : "", k.kullanilan.length > 1 ? "onaydan sonra her tedarikçinin siparişi ayrı verilir" : ""].filter(Boolean).join(" · ");
  const ister = gerekceGerekir(r, ev, k);
  const tutar = k.award ? k.plan.total : null;
  // N1 b: kalan kalemler ayrılsa da basamak ailenin toplamından; kalan kalemin en düşük teklifi sayılır (sunucu aynı kuralı uygular).
  const kalanEnAz = k.kalan.reduce((a, it) => { const f = ev.elig.map((x) => itemLineCost(x, it)).filter(isNum); return a + (f.length ? Math.min(...f) : 0); }, 0);
  const ap = tutar !== null ? requiredApprover(tutar + kalanEnAz) : null;
  const neden = !k.award ? "Karara dahil her kaleme bir tedarikçi seçin." : ister && !t.gerekce.trim() ? "Önerilen seçim değiştirildi; gerekçe yazın." : "";
  const decided = !!r.award && OPEN.includes(r.status) && r.status !== "eval";
  const etiket = k.kalan.length ? `Seçilenleri onaya gönder (${k.secilen.length}/${n})` : approvalState(r).state === "rejected" ? "Yeniden onaya gönder" : decided ? "Kararı güncelle ve onaya gönder" : "Onaya gönder";
  return `<div class="sa-kr-cubuk" data-kr-cubuk>
    <div class="sa-kr-cozet"><b>${ozet}</b>${alt ? `<span class="small muted">${alt}</span>` : ""}${ap ? `<span class="small muted">${esc(ap.role)} onayı gerekir</span>` : ""}</div>
    <span class="num sa-kr-tutar">${tutar === null ? "–" : money(tutar, "TRY", 0)}</span>
    <label class="sa-kr-gerekce"><span class="sr-only">Gerekçe</span><textarea data-kr-gerekce rows="2" maxlength="2000" placeholder="${ister ? "Gerekçe (zorunlu): önerilen seçim değişti" : "Gerekçe (isteğe bağlı)"}">${esc(t.gerekce)}</textarea></label>
    <div class="row"><button class="btn" data-act="kr-form">${ik("file", 14)} Onay formu</button>
    <button class="btn primary" data-act="kr-gonder" ${neden ? `aria-disabled="true" title="${esc(neden)}"` : ""}>${ik("check", 14)} ${etiket}</button></div>
    ${neden ? `<span class="small muted sa-kr-neden" aria-live="polite">${esc(neden)}</span>` : ""}</div>`;
}

/** Karşılaştır adımının bütünü (teklif yoksa çağrılmaz). */
/** Onaylayanın ekranı: kararın kalem kalem dağılımı, karar sayfasındaki matrisle aynı çizimde, salt okunur. Seçim talepteki karardan gelir (taslağa dokunulmaz). */
export function onayDagilimiHTML(r: PurchaseRequest): string {
  const ev = evaluate(r);
  if (!ev.elig.length || !r.award) return "";
  const t: Taslak = { rid: r.id, atama: kalemAtamasi(r, ev), dahil: Object.fromEntries((r.items ?? []).map((it) => [it.id, true])), gerekce: "", onceki: null };
  return `<section class="panel sa-kr sa-kr-onay${ev.ranking.length >= 4 ? " sa-kr-cok" : ""}" data-sa-onay-dagilimi>
    <div class="panel-h"><h2>Kararın kalem kalem dağılımı</h2><span class="small muted sa-kr-ipucu-metin">Seçili hücre: kalemin verildiği tedarikçi</span></div>
    <div class="panel-b stack"><div class="sa-kr-genis">${matris(r, ev, t, true)}</div><div class="sa-kr-dar">${liste(r, ev, t, true)}</div></div></section>`;
}
export function kararSayfasiHTML(r: PurchaseRequest): string {
  const ev = evaluate(r, UI.wDraft && UI.wDraft.id === r.id ? UI.wDraft.w : null);
  if (!ev.elig.length) return "";
  const t = taslak(r, ev);
  const kilit = kilitli(r);
  const disarida = ev.all.filter((x) => !ev.elig.includes(x));
  const cok = ev.ranking.length >= 4 ? " sa-kr-cok" : "";
  return `${ayrilmaBagi(r)}${kilit ? "" : ayrilmaSeridi(r, t)}<section class="panel sa-kr${cok}" data-sa-karar-matrisi>
    <div class="panel-h"><h2>Teklif karşılaştırma</h2><span class="small muted sa-kr-ipucu-metin">Sütun başlığı: tek tedarikçi · hücre: kalemi o tedarikçiye ver · Böl: miktarı paylaştır</span><span class="spacer"></span>
      ${agirlikSecimi(r, ev)}${kilit || ev.elig.length < 2 ? "" : `<button class="btn sm" data-act="kr-deneme">${ik("lab", 14)} Paylaştırmayı dene</button>`}<button class="btn sm ghost sa-kr-ikon" data-act="csv" title="CSV indir" aria-label="CSV indir">${ik("download", 14)}</button></div>
    <div class="panel-b stack">${kilit && canWrite() && bolmeKapaliNedeni(r) ? `<p class="small muted" data-kr-kilit>${ik("lock", 14)} ${esc(bolmeKapaliNedeni(r)!)}</p>` : ""}${ipucu(r, ev, t, kilit)}
      <div class="sa-kr-genis">${matris(r, ev, t, kilit)}</div><div class="sa-kr-dar">${liste(r, ev, t, kilit)}</div>
      ${disarida.length ? `<p class="small muted">Değerlendirme dışı: ${disarida.map((x) => `${esc(supName(x.q))} (${x.q.compliant === false ? "teknik uygun değil" : "fiyat girilmemiş"})`).join(", ")}.</p>` : ""}
      ${faizUyarisi(ev.all.filter((x) => x.c.faizYok).map((x) => x.q.currency))}
      <p class="small muted">Tutarlar KDV hariç. Net maliyet vade etkisi dahil, ${OPEN.includes(r.status) ? "güncel" : "sipariş günü"} kurla TL. ${ik("lira", 12)} her tedarikçinin adım adım hesabını açar.</p></div>
  </section>${kilit ? "" : cubuk(r, ev, t)}`;
}

/* ---------------- eylemler ---------------- */
function guncelle(): void { render(); }
function degistirPenceresi(r: PurchaseRequest, it: RequestItem): void {
  const ev = evaluate(r), t = taslak(r, ev);
  const sira = ev.elig.filter((x) => itemCost(x, it) !== null).sort((a, b) => itemCost(a, it)! - itemCost(b, it)!);
  const bolNeden = bolunemezNedeni(it) ?? bolmeKapaliNedeni(r);
  openModal(`<div class="mh"><h2>${esc(it.name)}</h2><span class="spacer"></span><button class="btn ghost" data-act="close" aria-label="Kapat">${ik("x")}</button></div>
    <div class="mb stack"><p class="small muted">${isNum(it.qty) ? `${nf0.format(it.qty)} ${esc(it.unit)}` : ""}. Tedarikçiye basın: kalem o tedarikçiye verilir.</p>
    <ul class="sa-kr-liste">${sira.map((x) => `<li><button class="sa-kr-hucre sa-kr-sec${t.atama[it.id] === x.q.id ? " sec" : ""}" data-act="kr-ata" data-item="${it.id}" data-qid="${x.q.id}" aria-pressed="${t.atama[it.id] === x.q.id}" ${secilemezAlternatif(x.q.altResults?.[it.id]) ? "disabled" : ""}>
      <b>${esc(supName(x.q))}</b><span class="num">${money(itemCost(x, it))}</span><span class="num small muted">${money(itemLineCost(x, it), "TRY", 0)}</span>${enUcuzMu(ev, it, x) ? `<span class="sa-kr-eu small">${ik("down", 12)} en ucuz</span>` : ""}</button></li>`).join("")}</ul></div>
    <div class="mf">${bolNeden ? `<span class="small muted">${esc(bolNeden)}</span>` : `<button class="btn" data-act="kk-bol" data-item="${it.id}">${ik("route", 14)} Miktarı böl</button>`}<span class="spacer"></span><button class="btn primary" data-act="close">Tamam</button></div>`, true);
}
function gonderPenceresi(r: PurchaseRequest, k: ReturnType<typeof taslakKarari>): void {
  openModal(`<div class="mh"><h2>Seçilenleri onaya gönder</h2></div><div class="mb stack" data-kr-pencere>
    <p><b>${k.secilen.length} kalem</b> bu kararla onaya gider: ${esc(k.secilen.map((x) => x.name).join(", "))}.</p>
    <p><b>${k.kalan.length} kalem</b> teklif fiyatlarıyla birlikte yeni talebe ayrılır ve Karar adımında bekler: ${esc(k.kalan.map((x) => x.name).join(", "))}.</p>
    <p class="flag warn">Ayırma geri alınamaz.</p></div>
    <div class="mf"><button class="btn" data-act="close" data-kr-ilk>Vazgeç</button><span class="spacer"></span><button class="btn primary" data-act="kr-gonder-evet">Onaya gönder ve ayır</button></div>`, true, true);
  $<HTMLButtonElement>("[data-kr-ilk]")?.focus();
}
function gonder(r: PurchaseRequest, kesin: boolean): void {
  const ev = evaluate(r), t = taslak(r, ev), k = taslakKarari(r, ev);
  if (!k.award) { toast("Karara dahil her kaleme bir tedarikçi seçin."); return; }
  if (gerekceGerekir(r, ev, k) && !t.gerekce.trim()) { toast("Önerilen seçim değiştirildi; kısa bir gerekçe yazın."); $<HTMLTextAreaElement>("[data-kr-gerekce]")?.focus(); return; }
  const n: PurchaseRequest = JSON.parse(JSON.stringify(r)) as PurchaseRequest;
  const eski: Partial<Award> = r.award ?? {};
  const ayni = eski.mode === k.award.mode && eski.quoteId === k.award.quoteId && JSON.stringify(eski.splits ?? {}) === JSON.stringify(k.award.splits ?? {});
  n.award = ayni && eski.approvals?.length && approvalState(r).state !== "rejected" ? { ...k.award, approvals: eski.approvals } : k.award;
  const ad = (qid: string) => supName(r.quotes.find((q) => q.id === qid)!);
  const tt = (() => { const x = { ...n, items: k.secilen }; return awardTotals(x); })();
  if (k.kalan.length) {
    if (!kesin) { gonderPenceresi(r, k); return; }
    closeModal();
    void backend.parcaliOnayaGonder(r.id, k.kalan.map((x) => x.id), n).then((s) => {
      if (!s) return;
      taslagiBirak();
      toast(`${k.secilen.length} kalem onaya gönderildi; ${k.kalan.length} kalem ${s.ayrilanNo} talebine ayrıldı`);
    });
    return;
  }
  n.status = "approval";
  V.tab = "decision";
  taslagiBirak();
  saveRequest(n, k.award.mode === "split"
    ? `Kalem bazlı karar: ${k.kullanilan.map(ad).join(", ")}, ${tt ? money(tt.totalTRY, "TRY", 0) : ""}. Onaya gönderildi.`
    : `Karar: ${ad(k.award.quoteId!)}, ${tt ? money(tt.totalTRY, "TRY", 0) : ""}. Onaya gönderildi.`);
  toast("Karar kaydedildi, onay bekliyor");
}
/** Paylaştırma denemesinin "Karara aktar"ı: bölünen kalemler kaydedilir, atama taslağa yazılır; gönderme karar çubuğundandır. */
export function dagilimiTaslagaAktar(r: PurchaseRequest, atama: Record<string, string>): void {
  TASLAK.x = { rid: r.id, atama: { ...atama }, dahil: {}, gerekce: TASLAK.x?.rid === r.id ? TASLAK.x.gerekce : "", onceki: null };
}
/** Böl yalnız kalemi satırlara ayırır; öteki kalemlerin seçimi ve dahil işareti korunur. */
export function bolmeyiTaslagaIsle(r: PurchaseRequest, kalemId: string, yeni: Record<string, string>): void {
  if (TASLAK.x?.rid !== r.id) return;
  const t = TASLAK.x;
  const dahil = t.dahil[kalemId];
  delete t.atama[kalemId]; delete t.dahil[kalemId]; t.onceki = null;
  for (const [id, qid] of Object.entries(yeni)) { t.atama[id] = qid; if (dahil !== undefined) t.dahil[id] = dahil; }
}

document.addEventListener("click", (e) => {
  if (!kokIcinde(e)) return;
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act^='kr-']"); if (!el) return;
  const r = S.requests[V.id ?? ""]; if (!r) return;
  const act = el.dataset.act!;
  const ev = evaluate(r), t = taslak(r, ev);
  if (act === "kr-form") { formuGoster(r); return; }
  if (kilitli(r)) return;
  if (act === "kr-ata") { t.atama[el.dataset.item!] = el.dataset.qid!; t.onceki = null; if (el.closest("#modal-root")) closeModal(); guncelle(); }
  else if (act === "kr-tek") { for (const it of r.items ?? []) if (ev.elig.some((x) => x.q.id === el.dataset.qid && itemCost(x, it) !== null && !secilemezAlternatif(x.q.altResults?.[it.id]))) t.atama[it.id] = el.dataset.qid!; t.onceki = null; guncelle(); }
  else if (act === "kr-uygula" && ev.split) { t.onceki = { ...t.atama }; Object.assign(t.atama, ev.split.plan.assign); guncelle(); }
  else if (act === "kr-geri-al" && t.onceki) { t.atama = t.onceki; t.onceki = null; guncelle(); }
  else if (act === "kr-degistir") { const it = r.items?.find((x) => x.id === el.dataset.item); if (it) degistirPenceresi(r, it); }
  else if (act === "kr-deneme") openModal(`<div class="mh"><h2>Paylaştırma denemesi</h2><span class="spacer"></span><button class="btn ghost" data-act="close" aria-label="Kapat">${ik("x")}</button></div><div class="mb">${tabSim(r)}</div>`, "wide");
  else if (act === "kr-gonder") gonder(r, false);
  else if (act === "kr-gonder-evet") gonder(r, true);
});
document.addEventListener("change", (e) => {
  if (!kokIcinde(e)) return;
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const r = S.requests[V.id ?? ""]; if (!r || kilitli(r)) return;
  if (el.dataset.krDahil) { const t = taslak(r, evaluate(r)); t.dahil[el.dataset.krDahil] = (el as HTMLInputElement).checked; guncelle(); }
  else if ("krAgirlik" in el.dataset) {
    const p = PRESETS[el.value]; if (!p) return;
    UI.wDraft = null; const n: PurchaseRequest = { ...r, weights: { ...p.w } }; saveRequest(n, `Değerlendirme ağırlıkları: ${p.l}`);
  }
});
document.addEventListener("input", (e) => {
  if (!kokIcinde(e)) return;
  const el = e.target as HTMLTextAreaElement;
  if (!("krGerekce" in el.dataset)) return;
  const r = S.requests[V.id ?? ""]; if (!r) return;
  taslak(r, evaluate(r)).gerekce = el.value;
  const d = $<HTMLButtonElement>('[data-act="kr-gonder"]'), ev = evaluate(r), gerek = gerekceGerekir(r, ev, taslakKarari(r, ev));
  if (d && gerek) { if (el.value.trim()) { d.removeAttribute("aria-disabled"); d.removeAttribute("title"); } else { d.setAttribute("aria-disabled", "true"); d.title = "Önerilen seçim değiştirildi; gerekçe yazın."; } }
});

/** Onay formu: karar verilmişse kararın, değilse karar çubuğundaki taslağın önizlemesi (taslak yalnız seçilen kalemlerle). */
function formuGoster(r: PurchaseRequest): void {
  if (r.award && !OPEN.includes(r.status)) { eylemCalistir("approval-form"); return; }
  const ev = evaluate(r), k = taslakKarari(r, ev);
  if (!k.award) { toast("Onay formu için önce kalemlere tedarikçi seçin."); return; }
  ONIZLEME.talep = { ...r, items: k.secilen, award: k.award, kalanKalemSayisi: k.kalan.length };
  try { eylemCalistir("approval-form"); } finally { ONIZLEME.talep = null; }
}
/** Onay formu önizlemesinde kullanılan geçici talep (ui.ts approval-form okur). */
export const ONIZLEME: { talep: (PurchaseRequest & { kalanKalemSayisi?: number }) | null } = { talep: null };
