/**
 * 3574-1: Sipariş adımında "Sipariş satırları" tablosu (Kurgu A, tek tablo). Her kalemin altında bir ya da birden çok pay: firma,
 * miktar, birim fiyat, satır termini, not. "Pay ekle" kalemi ikinci firmaya böler; "Başka firma" teklifi olmayan tedarikçidir.
 * Tablonun altında firma başına sipariş başlığı. Kayıt tek komuttur (POST /siparis-ver); onaylı tutarı aşan ya da yeni firmaya
 * giden sipariş onaya düşer (S1 a), bunun kesin kararı sunucudadır; ekrandaki rozet tahmindir.
 */
import type { SiparisVerGovdesi } from "#paylasilan/sozlesme/satin-alma.ts";
import type { Currency, PurchaseRequest, Quote, RequestItem } from "./tipler.ts";
import { S } from "./store.ts";
import { awardTotals, matOf, supName } from "./calc.ts";
import { addDays, esc, fmtDate, isNum, money, numIn, parseNum, todayStr, uid } from "./util.ts";

export interface Pay { id: string; itemId: string; quoteId: string; qty: number | null; price: number | null; exp: string; note: string }
export interface YeniFirma { supplierId: string; name: string; currency: Currency; payDays: number }
export interface Baslik {
  quoteId: string; yeni?: YeniFirma; poNo: string; orderDate: string; expectedDate: string; teslimYeri: string; tedarikciNotu: string; icNot: string;
}
export interface Taslak {
  version: number | undefined; pays: Pay[]; heads: Baslik[]; gerekce: string;
  /** Kayıt denemesinden hemen sonraki çizim: hata listesi yalnız o çizimde ekran okuyucuya duyurulur (her çizimde değil). */
  duyur?: boolean;
}

const TASLAKLAR = new Map<string, Taslak>();
const SIMGE_HATA = '<span class="flag bad" aria-hidden="true">!</span>';
let varsayimSayaci = 0;

/** Onaylı kararın kapsadığı kalemler ve teklifleri (sunucudaki kararKapsami ile aynı kural). */
export function kapsam(r: PurchaseRequest): Map<string, string> {
  const a = r.award;
  if (!a) return new Map();
  if (a.mode === "split") return new Map(Object.entries(a.splits ?? {}));
  const q = r.quotes.find((x) => x.id === a.quoteId);
  if (!q) return new Map();
  return new Map(r.items.filter((it) => it.qty !== null && isNum(q.prices[it.id])).map((it) => [it.id, q.id]));
}

const terminOnerisi = (q: Quote | undefined, siparisTarihi: string): string => (q && isNum(q.leadDays) ? addDays(siparisTarihi, q.leadDays) : "");

/** Onaylı karardan ilk taslak: kalem başına tek pay (karardaki firma, kalem miktarı, teklif fiyatı); firma başına başlık. */
export function taslakKur(r: PurchaseRequest): Taslak {
  const k = kapsam(r);
  const bugun = todayStr();
  const pays: Pay[] = r.items.filter((it) => k.has(it.id)).map((it) => {
    const q = r.quotes.find((x) => x.id === k.get(it.id));
    return { id: uid(), itemId: it.id, quoteId: k.get(it.id)!, qty: it.qty, price: q && isNum(q.prices[it.id]) ? q.prices[it.id]! : null, exp: "", note: "" };
  });
  const heads = [...new Set(pays.map((p) => p.quoteId))].map((qid) => yeniBaslik(r, qid, bugun));
  return { version: r.version, pays, heads, gerekce: "" };
}
function yeniBaslik(r: PurchaseRequest, quoteId: string, bugun: string, yeni?: YeniFirma): Baslik {
  const q = r.quotes.find((x) => x.id === quoteId);
  return { quoteId, ...(yeni ? { yeni } : {}), poNo: "", orderDate: bugun, expectedDate: terminOnerisi(q, bugun), teslimYeri: "", tedarikciNotu: "", icNot: "" };
}

/** Talebin taslağı; talep sunucuda değişince (sürüm) yeniden kurulur. */
export function taslak(r: PurchaseRequest): Taslak {
  const t = TASLAKLAR.get(r.id);
  if (t && t.version === r.version) return t;
  const n = taslakKur(r);
  TASLAKLAR.set(r.id, n);
  return n;
}
export const taslagiBirak = (talepId: string): void => { TASLAKLAR.delete(talepId); };

/** Firma seçeneğinin değeri: "q:<teklif>" var olan teklif, "f:<tedarikçi>" başka firma. */
export function firmaSec(r: PurchaseRequest, t: Taslak, payId: string, deger: string): void {
  const p = t.pays.find((x) => x.id === payId);
  if (!p) return;
  if (deger.startsWith("q:")) {
    p.quoteId = deger.slice(2);
    const q = r.quotes.find((x) => x.id === p.quoteId);
    if (q && isNum(q.prices[p.itemId])) p.price = q.prices[p.itemId]!;
  } else if (deger.startsWith("f:")) {
    const sid = deger.slice(2);
    const mevcut = t.heads.find((h) => h.yeni?.supplierId === sid);
    const sup = S.suppliers[sid];
    if (mevcut) p.quoteId = mevcut.quoteId;
    else {
      const qid = uid();
      t.heads.push(yeniBaslik(r, qid, todayStr(), { supplierId: sid, name: sup?.name ?? "", currency: "TRY", payDays: 0 }));
      p.quoteId = qid;
    }
  }
  basliklariEsitle(r, t);
}
/** Kalemi ikinci bir firmaya böler: yeni pay, kalanı (talep miktarı - paylar) ile, karardaki ilk başka teklifle açılır. */
export function payEkle(r: PurchaseRequest, t: Taslak, itemId: string): boolean {
  const it = r.items.find((x) => x.id === itemId);
  const mevcut = t.pays.filter((p) => p.itemId === itemId);
  const kalan = isNum(it?.qty) ? Math.max(0, it.qty - mevcut.reduce((a, p) => a + (p.qty ?? 0), 0)) : null;
  const aday = r.quotes.find((q) => q.source !== "siparis" && !mevcut.some((p) => p.quoteId === q.id) && isNum(q.prices[itemId])) ?? r.quotes.find((q) => !mevcut.some((p) => p.quoteId === q.id));
  if (!aday) return false;
  t.pays.push({ id: uid(), itemId, quoteId: aday.id, qty: kalan && kalan > 0 ? kalan : null, price: isNum(aday.prices[itemId]) ? aday.prices[itemId]! : null, exp: "", note: "" });
  basliklariEsitle(r, t);
  return true;
}
export function paySil(r: PurchaseRequest, t: Taslak, payId: string): void {
  const p = t.pays.find((x) => x.id === payId);
  if (!p || t.pays.filter((x) => x.itemId === p.itemId).length < 2) return;
  t.pays = t.pays.filter((x) => x.id !== payId);
  basliklariEsitle(r, t);
}
/** Payı olmayan başlık düşer, payı olan firmaya başlık açılır (girilen başlık alanları korunur). */
function basliklariEsitle(r: PurchaseRequest, t: Taslak): void {
  const kullanilan = [...new Set(t.pays.map((p) => p.quoteId))];
  const bugun = todayStr();
  t.heads = kullanilan.map((qid) => t.heads.find((h) => h.quoteId === qid) ?? yeniBaslik(r, qid, bugun));
}

const firmaAdi = (r: PurchaseRequest, t: Taslak, quoteId: string): string => {
  const q = r.quotes.find((x) => x.id === quoteId);
  return q ? supName(q) : t.heads.find((h) => h.quoteId === quoteId)?.yeni?.name || "Başka firma";
};

/** Taslakla kurulan varsayım talebi: tutarı bugünkü karar hesabıyla (awardTotals) bulmak için; kaydedilmez. */
export function varsayimTalebi(r: PurchaseRequest, t: Taslak): PurchaseRequest {
  const k = kapsam(r);
  const items: RequestItem[] = [];
  const atama: Record<string, string> = {};
  const kopya = new Map<string, string>();
  const payOf = new Map<string, Pay>();
  for (const it of r.items) {
    const paylar = t.pays.filter((p) => p.itemId === it.id);
    if (!k.has(it.id) || paylar.length === 0) { items.push(it); continue; }
    paylar.forEach((p, i) => {
      const id = i === 0 ? it.id : p.id;
      if (i > 0) kopya.set(id, it.id);
      items.push({ ...it, id, qty: p.qty });
      atama[id] = p.quoteId;
      payOf.set(id, p);
    });
  }
  const quotes: Quote[] = r.quotes.map((q) => {
    const prices = { ...q.prices };
    for (const [yeni, kaynak] of kopya) if (isNum(prices[kaynak])) prices[yeni] = prices[kaynak]!;
    return { ...q, prices };
  });
  for (const h of t.heads) {
    if (!h.yeni) continue;
    quotes.push({
      id: h.quoteId, supplierId: h.yeni.supplierId, supplierName: h.yeni.name, date: todayStr(), validUntil: "", currency: h.yeni.currency, fxRate: null, prices: {},
      discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: "", deliveryIncluded: true, leadDays: null, payDays: h.yeni.payDays, advancePct: 0,
      warrantyMonths: null, compliant: true, note: "", source: "siparis",
    });
  }
  for (const [kalemId, qid] of Object.entries(atama)) {
    const p = payOf.get(kalemId);
    const q = quotes.find((x) => x.id === qid);
    if (q && p && isNum(p.price)) q.prices[kalemId] = p.price;
  }
  const a = r.award!;
  const tek = a.mode === "single" && new Set(Object.values(atama)).size === 1 && Object.values(atama)[0] === a.quoteId;
  return {
    ...r, items, quotes, updatedAt: -1 - ++varsayimSayaci,
    award: tek ? { ...a } : { ...a, mode: "split", quoteId: null, splits: atama },
  };
}

export interface SiparisOzeti {
  kalemler: { it: RequestItem; toplam: number; istenen: number | null }[];
  firmaTutari: Record<string, number | null>;
  onayliTutar: number | null; yeniTutar: number | null; yeniFirmalar: string[]; onayGerekir: boolean; hatalar: string[];
  /** Hatalı alanların kimlikleri (ekranda işaretlenir, ilkine odak gider). */
  hataAlanlari: string[];
}
const satirTutari = (q: Quote | undefined, currency: Currency, p: Pay, r: PurchaseRequest): number | null => {
  if (!isNum(p.qty) || !isNum(p.price)) return null;
  const kur = currency === "TRY" ? 1 : r.award?.fx?.[currency] ?? q?.fxRate ?? null;
  return isNum(kur) ? p.qty * p.price * kur : null;
};
export function siparisOzeti(r: PurchaseRequest, t: Taslak): SiparisOzeti {
  const k = kapsam(r);
  const kalemler = r.items.filter((it) => k.has(it.id)).map((it) => ({ it, toplam: t.pays.filter((p) => p.itemId === it.id).reduce((a, p) => a + (p.qty ?? 0), 0), istenen: it.qty }));
  const onayli = new Set(k.values());
  const yeniFirmalar = [...new Set(t.pays.map((p) => p.quoteId))].filter((q) => !onayli.has(q)).map((q) => firmaAdi(r, t, q));
  const firmaTutari: Record<string, number | null> = {};
  for (const h of t.heads) {
    const q = r.quotes.find((x) => x.id === h.quoteId);
    const l = t.pays.filter((p) => p.quoteId === h.quoteId).map((p) => satirTutari(q, q?.currency ?? h.yeni?.currency ?? "TRY", p, r));
    firmaTutari[h.quoteId] = l.some((x) => x === null) ? null : l.reduce<number>((a, b) => a + (b ?? 0), 0);
  }
  const hatalar: string[] = [];
  const hataAlanlari: string[] = [];
  for (const p of t.pays) {
    const ad = r.items.find((x) => x.id === p.itemId)?.name ?? "";
    if (!isNum(p.qty) || p.qty <= 0) { hatalar.push(`${ad}: miktar girin.`); hataAlanlari.push(`sp-${p.id}-qty`); }
    if (!isNum(p.price) || p.price < 0) { hatalar.push(`${ad}: birim fiyat girin.`); hataAlanlari.push(`sp-${p.id}-price`); }
  }
  for (const it of kalemler) {
    const firmalar = t.pays.filter((p) => p.itemId === it.it.id).map((p) => p.quoteId);
    if (new Set(firmalar).size !== firmalar.length) {
      hatalar.push(`${it.it.name}: aynı firmaya iki pay yazılmaz.`);
      hataAlanlari.push(...t.pays.filter((p) => p.itemId === it.it.id).map((p) => `sp-${p.id}-firma`));
    }
  }
  for (const h of t.heads) if (!h.expectedDate) { hatalar.push(`${firmaAdi(r, t, h.quoteId)}: beklenen teslim girin.`); hataAlanlari.push(`sp-${h.quoteId}-expectedDate`); }
  const onayliTutar = awardTotals(r)?.totalTRY ?? null;
  const yeniTutar = hatalar.length ? null : awardTotals(varsayimTalebi(r, t))?.totalTRY ?? null;
  const onayGerekir = yeniFirmalar.length > 0 || (onayliTutar !== null && yeniTutar !== null && yeniTutar > onayliTutar + 0.005);
  return { kalemler, firmaTutari, onayliTutar, yeniTutar, yeniFirmalar, onayGerekir, hatalar, hataAlanlari };
}

/** Komut gövdesi (sürüm taşıyıcıda eklenir). Kartı olmayan kalemin kataloğa eşleşmesi gönderilir (sipariş verilince kataloğa bağla). */
export function siparisGovdesi(r: PurchaseRequest, t: Taslak): Omit<SiparisVerGovdesi, "surum"> {
  const ond = (n: number) => String(Math.round(n * 1e6) / 1e6);
  return {
    siparisler: t.heads.map((h) => ({
      teklifId: h.quoteId,
      yeniFirma: h.yeni ? { firmaId: Number(h.yeni.supplierId), paraBirimi: h.yeni.currency, vadeGun: h.yeni.payDays, terminGun: null } : null,
      siparisNo: h.poNo.trim(), siparisTarihi: h.orderDate || todayStr(), beklenenTeslim: h.expectedDate, vadeBaslangici: r.award?.vadeBaslangici ?? "teslim",
      teslimYeri: h.teslimYeri.trim(), tedarikciNotu: h.tedarikciNotu.trim(), icNot: h.icNot.trim(),
    })),
    paylar: t.pays.map((p) => ({ kalemId: p.itemId, teklifId: p.quoteId, miktar: ond(p.qty ?? 0), birimFiyat: ond(p.price ?? 0), beklenenTeslim: p.exp || null, notlar: p.note.trim() })),
    gerekce: t.gerekce.trim(),
    kartBaglari: r.items.filter((it) => !it.materialId && it.name).flatMap((it) => { const m = matOf(it); return m ? [{ kalemId: it.id, katalogId: m }] : []; }),
  };
}

/** Ekrandaki alanlar taslağa okunur (her eylemden önce; tablo yeniden çizilince girilen değer kaybolmaz). */
export function taslagiOku(t: Taslak, kok: ParentNode): void {
  kok.querySelectorAll<HTMLInputElement>("[data-sp-pay]").forEach((el) => {
    const p = t.pays.find((x) => x.id === el.dataset.spPay);
    if (!p) return;
    const v = el.value;
    if (el.dataset.spAlan === "qty") p.qty = parseNum(v);
    else if (el.dataset.spAlan === "price") p.price = parseNum(v);
    else if (el.dataset.spAlan === "exp") p.exp = v;
    else if (el.dataset.spAlan === "note") p.note = v;
  });
  kok.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-sp-baslik]").forEach((el) => {
    const h = t.heads.find((x) => x.quoteId === el.dataset.spBaslik);
    const alan = el.dataset.spAlan as keyof Baslik | "currency" | "payDays" | undefined;
    if (!h || !alan) return;
    if (alan === "currency" && h.yeni) h.yeni.currency = el.value as Currency;
    else if (alan === "payDays" && h.yeni) h.yeni.payDays = Math.max(0, Math.round(parseNum(el.value) ?? 0));
    else if (alan === "poNo" || alan === "orderDate" || alan === "expectedDate" || alan === "teslimYeri" || alan === "tedarikciNotu" || alan === "icNot") h[alan] = el.value;
  });
  const g = kok.querySelector<HTMLTextAreaElement>("#sp-gerekce");
  if (g) t.gerekce = g.value;
}

function firmaSecenekleri(r: PurchaseRequest, t: Taslak, p: Pay): string {
  const teklifli = r.quotes.map((q) => `<option value="q:${esc(q.id)}"${q.id === p.quoteId ? " selected" : ""}>${esc(supName(q))}${q.source === "siparis" ? " (siparişte eklendi)" : isNum(q.prices[p.itemId]) ? " (teklif)" : " (bu kaleme teklif yok)"}</option>`).join("");
  const yeniler = t.heads.filter((h) => h.yeni).map((h) => `<option value="q:${esc(h.quoteId)}"${h.quoteId === p.quoteId ? " selected" : ""}>${esc(h.yeni!.name)} (başka firma)</option>`).join("");
  const tekliflerdeki = new Set([...r.quotes.map((q) => q.supplierId), ...t.heads.flatMap((h) => (h.yeni ? [h.yeni.supplierId] : []))]);
  const baska = Object.values(S.suppliers).filter((s) => !tekliflerdeki.has(s.id) && s.active !== false && s.status !== "suspended")
    .sort((a, b) => a.name.localeCompare(b.name, "tr")).map((s) => `<option value="f:${esc(s.id)}">${esc(s.name)}</option>`).join("");
  return `${teklifli}${yeniler}${baska ? `<optgroup label="Başka firma">${baska}</optgroup>` : ""}`;
}

/** Sipariş verilmeden önceki "Sipariş satırları" paneli (onaylı kararda). */
export function siparisSatirlariHTML(r: PurchaseRequest, t: Taslak): string {
  const oz = siparisOzeti(r, t);
  const hatali = new Set(oz.hataAlanlari);
  const gecersiz = (id: string) => (hatali.has(id) ? ' aria-invalid="true" aria-describedby="sp-hatalar"' : "");
  const birim = (it: RequestItem) => esc(it.unit);
  const satirlar = oz.kalemler.map(({ it, toplam, istenen }) => {
    const paylar = t.pays.filter((p) => p.itemId === it.id);
    const fark = isNum(istenen) ? toplam - istenen : 0;
    const rozet = !isNum(istenen) ? "" : Math.abs(fark) < 0.0005 ? "" : fark < 0
      ? ` <span class="flag warn">${numIn(-fark)} ${birim(it)} eksik</span>` : ` <span class="flag info">${numIn(fark)} ${birim(it)} fazla</span>`;
    const bolunemez = it.sabit ? ' <span class="flag mute">bölünmez</span> <span class="xs muted">kaleme bağlı kayıt var (fason, emir ya da satış)</span>' : "";
    const kalemSatiri = `<tr class="sp-kalem" data-sp-kalem="${esc(it.id)}"><td class="lead" colspan="7"><b>${esc(it.name)}</b>, ${numIn(istenen ?? 0)} ${birim(it)}<span class="sub">${numIn(toplam)} / ${numIn(istenen ?? 0)} paylaştırıldı${paylar.length > 1 ? `, ${paylar.length} firmaya bölündü` : ""}${rozet}${bolunemez}</span></td></tr>`;
    const payHTML = paylar.map((p) => {
      const q = r.quotes.find((x) => x.id === p.quoteId);
      const pb = q?.currency ?? t.heads.find((h) => h.quoteId === p.quoteId)?.yeni?.currency ?? "TRY";
      const teklifFiyati = q && isNum(q.prices[p.itemId]) ? q.prices[p.itemId]! : null;
      const teklifDisi = !q || q.source === "siparis" || teklifFiyati === null || (isNum(p.price) && Math.abs(p.price - teklifFiyati) > 0.00005);
      const tutar = satirTutari(q, pb, p, r);
      return `<tr data-sp-satir="${esc(p.id)}">
        <td class="lead" data-l="Firma"><select id="sp-${esc(p.id)}-firma" data-sp-sec="${esc(p.id)}" aria-label="${esc(it.name)} firması"${gecersiz(`sp-${p.id}-firma`)}>${firmaSecenekleri(r, t, p)}</select>${teklifDisi ? '<span class="sub"><span class="flag warn">teklif dışı</span></span>' : ""}</td>
        <td class="r" data-l="Miktar (${birim(it)})"><input class="qty" inputmode="decimal" id="sp-${esc(p.id)}-qty" data-sp-pay="${esc(p.id)}" data-sp-alan="qty" value="${esc(numIn(p.qty))}" aria-label="${esc(it.name)} miktarı"${gecersiz(`sp-${p.id}-qty`)}></td>
        <td class="r" data-l="Birim fiyat (${esc(pb)})"><input class="price" inputmode="decimal" id="sp-${esc(p.id)}-price" data-sp-pay="${esc(p.id)}" data-sp-alan="price" value="${esc(numIn(p.price))}" aria-label="${esc(it.name)} birim fiyatı (${esc(pb)})"${gecersiz(`sp-${p.id}-price`)}></td>
        <td data-l="Termin"><input type="date" id="sp-${esc(p.id)}-exp" data-sp-pay="${esc(p.id)}" data-sp-alan="exp" value="${esc(p.exp)}" aria-describedby="sp-termin-notu" aria-label="${esc(it.name)} satır termini"></td>
        <td data-l="Not"><input type="text" maxlength="500" id="sp-${esc(p.id)}-note" data-sp-pay="${esc(p.id)}" data-sp-alan="note" value="${esc(p.note)}" placeholder="Satır notu" aria-label="${esc(it.name)} satır notu"></td>
        <td class="r num" data-l="Tutar (TL)">${tutar === null ? "–" : money(tutar, "TRY", 0)}</td>
        <td class="acts">${paylar.length > 1 ? `<button class="btn sm ghost danger" data-act="sp-pay-sil" data-pay="${esc(p.id)}" aria-label="Payı kaldır">Kaldır</button>` : ""}</td></tr>`;
    }).join("");
    const ekle = it.sabit ? "" : `<tr class="sp-ekle"><td colspan="7"><button class="btn sm ghost" data-act="sp-pay-ekle" data-item="${esc(it.id)}">Pay ekle</button></td></tr>`;
    return kalemSatiri + payHTML + ekle;
  }).join("");
  const basliklar = t.heads.map((h) => {
    const q = r.quotes.find((x) => x.id === h.quoteId);
    const tutar = oz.firmaTutari[h.quoteId];
    const alan = (ad: string, etiket: string, deger: string, tur = "text", ek = "") =>
      `<label class="f"><span>${etiket}</span><input type="${tur}" id="sp-${esc(h.quoteId)}-${ad}" data-sp-baslik="${esc(h.quoteId)}" data-sp-alan="${ad}" value="${esc(deger)}"${ek}${gecersiz(`sp-${h.quoteId}-${ad}`)}></label>`;
    const yeni = h.yeni ? `<label class="f"><span>Para birimi</span><select id="sp-${esc(h.quoteId)}-currency" data-sp-baslik="${esc(h.quoteId)}" data-sp-alan="currency">${(["TRY", ...Object.keys(r.award?.fx ?? {})] as Currency[]).filter((c, i, l) => l.indexOf(c) === i).map((c) => `<option${c === h.yeni!.currency ? " selected" : ""}>${c}</option>`).join("")}</select></label>
      ${alan("payDays", "Vade (gün)", String(h.yeni.payDays), "number", ' min="0" max="3650"')}` : "";
    const odeme = q ? `<p class="xs muted span2">Ödeme şartı tekliften: ${q.advancePct ? `%${numIn(q.advancePct)} avans, ` : ""}${q.payDays ? `${q.payDays} gün vade` : "peşin"}</p>` : "";
    return `<section class="panel" data-sp-firma="${esc(h.quoteId)}"><div class="panel-h"><h3>${esc(firmaAdi(r, t, h.quoteId))}</h3>${h.yeni ? '<span class="flag warn">yeni firma</span>' : ""}<span class="spacer"></span><span class="num">${tutar === null || tutar === undefined ? "–" : money(tutar, "TRY", 0)}</span></div>
      <div class="panel-b"><div class="grid ${t.heads.length > 1 ? "g2" : "g4"}">
        ${alan("poNo", "Tedarikçi / dış sipariş no", h.poNo, "text", ' maxlength="40"')}
        ${alan("orderDate", "Sipariş tarihi", h.orderDate, "date")}
        ${alan("expectedDate", "Beklenen teslim <small>— zorunlu</small>", h.expectedDate, "date")}
        ${alan("teslimYeri", "Teslim yeri", h.teslimYeri, "text", ' maxlength="200"')}
        ${yeni}
        <label class="f span2"><span>Tedarikçiye not <small>— sipariş metnine girer</small></span><input type="text" maxlength="2000" data-sp-baslik="${esc(h.quoteId)}" data-sp-alan="tedarikciNotu" value="${esc(h.tedarikciNotu)}"></label>
        <label class="f span2"><span>İç not <small>— tedarikçi görmez</small></span><input type="text" maxlength="2000" data-sp-baslik="${esc(h.quoteId)}" data-sp-alan="icNot" value="${esc(h.icNot)}"></label>
        ${odeme}
      </div></div></section>`;
  }).join("");
  const onayRozeti = oz.onayGerekir
    ? `<span class="flag warn">onaya gider</span> <span class="small">${oz.yeniFirmalar.length ? `${esc(oz.yeniFirmalar.join(", "))} onaylı kararda yok` : "onaylı tutarı aşıyor"}</span>` : "";
  return `<div class="stack" data-sa-siparis-satirlari>
    <div class="tw"><table class="itbl rt sp-tablo"><thead><tr><th>Kalem / firma</th><th class="r">Miktar</th><th class="r">Birim fiyat</th><th>Termin</th><th>Not</th><th class="r">Tutar</th><th><span class="sr-only">Eylem</span></th></tr></thead>
      <tbody>${satirlar}</tbody></table></div>
    <h3 class="small">Siparişler (${t.heads.length} firma)</h3>
    <div class="grid ${t.heads.length > 1 ? "g2" : ""}">${basliklar}</div>
    <div class="row"><span class="small">Toplam <b class="num">${oz.yeniTutar === null ? "–" : money(oz.yeniTutar, "TRY", 0)}</b></span><span class="small">Onaylı <b class="num">${oz.onayliTutar === null ? "–" : money(oz.onayliTutar, "TRY", 0)}</b></span>${onayRozeti}</div>
    <label class="f"><span>Gerekçe <small>— onaya giden siparişte zorunlu</small></span><textarea id="sp-gerekce" maxlength="500" rows="2" placeholder="Örn. ikinci firma stoktan acil kısmı veriyor">${esc(t.gerekce)}</textarea></label>
    <ul class="small" id="sp-hatalar"${t.duyur ? ' role="alert"' : ""}>${oz.hatalar.map((h) => `<li>${SIMGE_HATA} ${esc(h)}</li>`).join("")}</ul>
    <p class="xs muted" id="sp-termin-notu">Satır termini boşsa firmanın beklenen teslimi geçer.</p>
    <p class="xs muted">Tutarlar TL, KDV hariç. Onaylı tutarı aşan ya da onaylı kararda olmayan firmaya giden sipariş onaya gider; kayıtta kesinleşir. Tutarı düşüren, termin ve not değişikliği onaysızdır.</p>
  </div>`;
}

/** Onay bekleyen siparişin kendisi, yalnız okunur: onaylayan miktar, fiyat, firma ve termini görerek onaylar (öneren de görür). */
export function siparisOnerisiSatirlariHTML(r: PurchaseRequest): string {
  const o = r.siparisOnerisi;
  if (!o || !o.paylar?.length) return "";
  const ad = (qid: string): string => {
    const q = r.quotes.find((x) => x.id === qid);
    if (q) return supName(q);
    const h = o.basliklar.find((x) => x.quoteId === qid);
    return (h?.yeniFirmaId ? S.suppliers[h.yeniFirmaId]?.name : undefined) ?? "Başka firma";
  };
  const pbOf = (qid: string): Currency => r.quotes.find((x) => x.id === qid)?.currency ?? o.basliklar.find((x) => x.quoteId === qid)?.currency ?? "TRY";
  const satirlar = r.items.filter((it) => o.paylar.some((p) => p.itemId === it.id)).map((it) => {
    const paylar = o.paylar.filter((p) => p.itemId === it.id);
    return `<tr class="sp-kalem"><td class="lead" colspan="6"><b>${esc(it.name)}</b>, ${numIn(it.qty ?? 0)} ${esc(it.unit)}${paylar.length > 1 ? `<span class="sub">${paylar.length} firmaya bölündü</span>` : ""}</td></tr>`
      + paylar.map((p) => {
        const q = r.quotes.find((x) => x.id === p.quoteId);
        const pb = pbOf(p.quoteId);
        const tutar = satirTutari(q, pb, { id: "", itemId: p.itemId, quoteId: p.quoteId, qty: p.qty, price: p.price, exp: p.exp, note: p.note }, r);
        const teklifDisi = !q || q.source === "siparis" || !isNum(q.prices[p.itemId]) || Math.abs(p.price - q.prices[p.itemId]!) > 0.00005;
        return `<tr><td class="lead" data-l="Firma">${esc(ad(p.quoteId))}${teklifDisi ? ' <span class="flag warn">teklif dışı</span>' : ""}</td>
          <td class="r num" data-l="Miktar (${esc(it.unit)})">${numIn(p.qty)}</td><td class="r num" data-l="Birim fiyat (${esc(pb)})">${money(p.price, pb)}</td>
          <td class="num" data-l="Termin">${p.exp ? fmtDate(p.exp) : '<span class="muted">siparişin</span>'}</td><td data-l="Not">${p.note ? esc(p.note) : "–"}</td>
          <td class="r num" data-l="Tutar (TL)">${tutar === null ? "–" : money(tutar, "TRY", 0)}</td></tr>`;
      }).join("");
  }).join("");
  const basliklar = o.basliklar.map((h) => `<li><b>${esc(ad(h.quoteId))}</b>${h.yeniFirmaId ? ' <span class="flag warn">yeni firma</span>' : ""}: beklenen teslim ${fmtDate(h.expectedDate)}${h.poNo ? `, no ${esc(h.poNo)}` : ""}${h.teslimYeri ? `, teslim yeri ${esc(h.teslimYeri)}` : ""}${h.tedarikciNotu ? `, tedarikçiye not: ${esc(h.tedarikciNotu)}` : ""}${h.icNot ? `, iç not: ${esc(h.icNot)}` : ""}</li>`).join("");
  return `<div class="stack" data-sa-siparis-onerisi-satirlari><div class="tw"><table class="itbl rt sp-tablo"><caption class="sr-only">Onay bekleyen sipariş satırları</caption><thead><tr><th>Kalem / firma</th><th class="r">Miktar</th><th class="r">Birim fiyat</th><th>Termin</th><th>Not</th><th class="r">Tutar</th></tr></thead>
    <tbody>${satirlar}</tbody></table></div><ul class="small">${basliklar}</ul></div>`;
}

/** Onay bekleyen sipariş bilgisi (bütün okuyuculara), onay yetkilisine Onayla / Reddet. */
export function siparisOnerisiHTML(r: PurchaseRequest, onaylayabilir: boolean, benimMi: boolean): string {
  const o = r.siparisOnerisi;
  if (!o) return "";
  return `<div class="callout stack" data-sa-siparis-onerisi><p><b>Sipariş onay bekliyor.</b> Öneren ${esc(o.onerenAdi)}. Tutar ${o.onayliTutar === null ? "–" : money(o.onayliTutar, "TRY", 0)} → ${o.yeniTutar === null ? "–" : money(o.yeniTutar, "TRY", 0)}${o.yeniFirmalar.length ? `; yeni firma: ${esc(o.yeniFirmalar.join(", "))}` : ""}. Gerekçe: ${esc(o.gerekce)}</p>
    ${siparisOnerisiSatirlariHTML(r)}
    ${onaylayabilir && !benimMi ? `<label class="f"><span>Not <small>— ret için zorunlu</small></span><input type="text" id="sp-oneri-not" maxlength="500" placeholder="Örn. fiyat yüksek, önce pazarlık"></label>
    <div class="row"><button class="btn good" data-act="sp-oneri-onayla">Onayla ve siparişi ver</button><button class="btn bad" data-act="sp-oneri-reddet">Reddet</button></div>`
      : `<p class="small muted">${benimMi ? "Onay, onay yetkisi olan başka bir kişide." : "Onay, onay yetkisi olan kişide."} Onaylanana kadar sipariş verilmemiş sayılır.</p>`}</div>`;
}
