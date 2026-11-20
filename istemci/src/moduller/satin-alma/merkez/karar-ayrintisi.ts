/**
 * Karar ve onay adımının ödeme, kur ve faiz karşılaştırması: her uygun teklif için tutar, kullanılan kur ve kaynağı, TL karşılığı,
 * ödeme yöntemi ve tahmini ödeme günleri, vadenin hesaplandığı aylık faiz, vade etkisi ve net maliyet.
 * Tutarlar karşılaştırmayla aynı hesaptan gelir (quoteCalc); burada yalnız ödeme günleri ve kaynak etiketleri türetilir.
 */
import type { PurchaseRequest, Quote } from "./tipler.ts";
import { OPEN } from "./constants.ts";
import { nameOf, settings } from "./store.ts";
import { approvalState, liveRate, payText, requiredApprover, supName, type EvalRow } from "./calc.ts";
import { ODEME_SEKLI } from "./takip.ts";
import { addDays, clamp, esc, fmtDate, fmtTs, isNum, money, nfx, parseNum, todayStr } from "./util.ts";

export type KurKaynagi = "tl" | "guncel" | "teklif" | "sabit";
export interface OdemeAyrintisi {
  qid: string;
  kur: number;
  kurKaynagi: KurKaynagi;
  /** Karar onaya gönderilince sunucunun sabitlediği kur; kilit yoksa ya da TL teklifte boş. */
  kararKuru: number | null;
  /** Avans: sipariş günü ödenir. Avans yoksa boş. */
  avans: { yuzde: number; tl: number; gun: string } | null;
  /** Vadeli kalan: tahmini teslim (ya da sipariş) günü + vade. Tam avansta boş; teslim günü bilinmiyorsa gün boş. */
  kalan: { tl: number; vadeGun: number; gun: string | null; baslangic: "teslim" | "siparis" } | null;
  yontem: string;
  /** Vadenin hesaplandığı aylık faiz (yüzde); finansta yoksa boş. */
  aylikFaiz: number | null;
  /** Karar anında sabitlenen aylık faiz; kilit yoksa boş. */
  kararFaizi: number | null;
}

/** Tahmini teslim: siparişin beklenen teslimi, yoksa sipariş (ya da bugün) + termin; termin yoksa ihtiyaç tarihi; o da yoksa boş. */
function tahminiTeslim(r: PurchaseRequest, q: Quote, siparisGunu: string): string | null {
  if (r.award?.expectedDate) return r.award.expectedDate;
  const t = parseNum(q.leadDays);
  if (t !== null) return addDays(siparisGunu, t);
  return r.needDate || null;
}

export function odemeAyrintisi(r: PurchaseRequest, x: EvalRow): OdemeAyrintisi {
  const q = x.q, c = x.c, a = r.award;
  const kilitli = !!a?.kurKilidi && q.currency !== "TRY";
  const kararKuru = kilitli && isNum(a.fx?.[q.currency]) ? a.fx[q.currency]! : null;
  const kararFaizi = a?.kurKilidi ? a.sabitFaiz?.[q.currency] ?? null : null;
  let kurKaynagi: KurKaynagi = "tl";
  if (q.currency !== "TRY") {
    if (OPEN.includes(r.status)) kurKaynagi = liveRate(q.currency, settings()) !== null ? "guncel" : "teklif";
    else kurKaynagi = isNum(a?.fx?.[q.currency]) ? "sabit" : "teklif";
  }
  const siparisGunu = a?.orderDate || todayStr();
  const adv = clamp((parseNum(q.advancePct) || 0) / 100, 0, 1);
  const vadeGun = parseNum(q.payDays) || 0;
  const baslangic = a?.vadeBaslangici === "siparis" ? "siparis" : "teslim";
  const kalanBaz = baslangic === "siparis" ? siparisGunu : tahminiTeslim(r, q, siparisGunu);
  return {
    qid: q.id, kur: c.rate, kurKaynagi, kararKuru,
    avans: adv > 0 ? { yuzde: adv * 100, tl: c.totalTRY * adv, gun: siparisGunu } : null,
    kalan: adv < 1 ? { tl: c.totalTRY * (1 - adv), vadeGun, gun: kalanBaz === null ? null : addDays(kalanBaz, vadeGun), baslangic } : null,
    yontem: q.payMethod ? ODEME_SEKLI[q.payMethod] : "Belirtilmedi",
    aylikFaiz: c.faizYok ? null : c.monthly * 100,
    kararFaizi,
  };
}

const KAYNAK: Record<KurKaynagi, string> = { tl: "", guncel: "güncel kur", teklif: "teklif günü kuru", sabit: "sipariş günü sabit kur" };

/** Karar ve onay adımındaki karşılaştırma tablosu; seçilen teklif başta ve işaretli. */
export function kararAyrintisiHTML(r: PurchaseRequest, satirlar: EvalRow[], secilen: Set<string>): string {
  if (!satirlar.length) return "";
  const cols = [...satirlar].sort((a, b) => Number(secilen.has(b.q.id)) - Number(secilen.has(a.q.id)));
  const d = cols.map(x => odemeAyrintisi(r, x));
  const satirlar2: { label: string; cells: string[]; cls: string }[] = [];
  const row = (label: string, cells: string[], cls = "") => { satirlar2.push({ label, cells, cls }); return ""; };
  const sub = (t: string) => `<span class="sub">${t}</span>`;
  const dovizVar = cols.some(x => x.q.currency !== "TRY");
  const baslik = (x: EvalRow) => `<span class="sn">${esc(supName(x.q))}</span>${secilen.has(x.q.id) ? '<span class="flag good">Karar</span> ' : ""}${esc(x.q.currency)}`;
  let h = "";
  h += row("Tutar (teklif para birimi)", cols.map(x => money(x.c.total, x.q.currency)));
  if (dovizVar) {
    h += row("Kur", cols.map((x, i) => {
      const o = d[i]!;
      if (x.q.currency === "TRY") return "–";
      const ek = [KAYNAK[o.kurKaynagi]];
      if (o.kararKuru !== null) ek.push(Math.abs(o.kararKuru - o.kur) > 1e-6 ? `karar anında ${nfx.format(o.kararKuru)}` : "karar anında sabitlendi");
      if (isNum(x.q.fxRate) && Math.abs(x.q.fxRate - o.kur) > 1e-6 && o.kurKaynagi !== "teklif") ek.push(`teklif günü ${nfx.format(x.q.fxRate)}`);
      return `${nfx.format(o.kur)}${sub(esc(ek.join(", ")))}`;
    }));
  }
  h += row("TL karşılığı", cols.map(x => money(x.c.totalTRY)), "key");
  h += row("Ödeme koşulu", cols.map(x => esc(payText(x.q))), "wrap");
  h += row("Ödeme yöntemi", cols.map((_, i) => esc(d[i]!.yontem)));
  h += row("Avans ödemesi", cols.map((_, i) => { const o = d[i]!.avans; return o ? `${money(o.tl, "TRY", 0)}${sub(`%${nfx.format(o.yuzde)}, ${fmtDate(o.gun)} (sipariş günü)`)}` : "–"; }));
  h += row("Vadeli ödeme", cols.map((_, i) => {
    const o = d[i]!.kalan;
    if (!o) return "–";
    const gun = o.gun === null ? "teslim günü bilinmiyor" : `${fmtDate(o.gun)} (tahmini; ${o.baslangic === "siparis" ? "siparişten" : "teslimden"} ${o.vadeGun} gün)`;
    return `${money(o.tl, "TRY", 0)}${sub(o.vadeGun ? gun : "teslimde")}`;
  }));
  h += row("Aylık faiz (vade hesabı)", cols.map((_, i) => {
    const o = d[i]!;
    const kar = o.kararFaizi !== null && (o.aylikFaiz === null || Math.abs(o.kararFaizi - o.aylikFaiz) > 1e-6) ? sub(`karar anında %${nfx.format(o.kararFaizi)}`) : "";
    return `${o.aylikFaiz === null ? "girilmedi" : "%" + nfx.format(o.aylikFaiz)}${kar}`;
  }));
  h += row("Vade etkisi", cols.map(x => (x.c.faizYok ? "hesaba katılmadı" : x.c.vadeGain > 0.5 ? `−${money(x.c.vadeGain, "TRY", 0)}` : "–")));
  h += row("Net bugünkü maliyet", cols.map(x => money(x.c.pvTRY, "TRY", 0)), "key");
  // Geniş kutuda sütun sütun tablo; dar kutuda (360) her teklif ayrı kart, satırlar ad ve değer (CSS hangisinin görüneceğini seçer).
  const tablo = `<div class="tw sa-ka-tablo"><table class="matrix sa-karar-ayrinti"><thead><tr><th class="rl">Şart</th>${cols.map(x => `<th class="r${secilen.has(x.q.id) ? " win" : ""}">${baslik(x)}</th>`).join("")}</tr></thead><tbody>${satirlar2.map(s => `<tr class="${s.cls}"><td class="rl">${s.label}</td>${s.cells.map(c => `<td class="r">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const kartlar = `<div class="sa-ka-kartlar">${cols.map((x, i) => `<section class="sa-ka-kart${secilen.has(x.q.id) ? " sec" : ""}"><h3>${baslik(x)}</h3><dl>${satirlar2.map(s => `<div class="${s.cls}"><dt>${s.label}</dt><dd>${s.cells[i]}</dd></div>`).join("")}</dl></section>`).join("")}</div>`;
  return h + tablo + kartlar;
}

/** Onaylayan: onaylandıysa ya da reddedildiyse karar veren ve zamanı, beklerken gereken basamak. Karar yoksa boş. */
export function onaylayanOzeti(r: PurchaseRequest, tutarTl: number | null): { baslik: string; ayrinti: string } | null {
  if (!r.award) return null;
  const aps = approvalState(r), son = aps.last;
  if ((aps.state === "approved" || aps.state === "rejected") && son) {
    return { baslik: son.name || nameOf(son.by), ayrinti: `${aps.state === "approved" ? "onayladı" : "reddetti"}, ${fmtTs(son.at)}` };
  }
  const ap = tutarTl === null ? null : requiredApprover(tutarTl);
  // "Gereken onay" kutusu onaylayabilecekleri zaten sayar; burada yalnız hangi basamağın beklendiği yazılır (Arayüz 3442-6 a).
  return { baslik: "Bekleniyor", ayrinti: ap ? `${ap.role} onayı bekleniyor` : "onay limiti tanımlı değil" };
}
