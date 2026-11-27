/**
 * 3574-2a: "Siparişi değiştir" penceresi (3574 ekran D), değişiklik geçmişi ve onay bekleyen değişikliğin yalnız okunur görünümü.
 * Pencere siparişin bütün satırlarını son hâliyle gönderir (POST /siparis-degistir). Onaysız / onaya gider ayrımı burada tahmindir;
 * kesin karar sunucudadır (S1 a, S2 a). Tutar tahmini siparişin kendi para birimindedir, KDV hariç.
 */
import type { SiparisDegisikligi, SiparisDegisikligiOgesi, SiparisDegistirGovdesi } from "#paylasilan/sozlesme/satin-alma.ts";
import type { Currency, PurchaseRequest } from "./tipler.ts";
import { awardOrders, orderDue, siparisEtiketi, supName } from "./calc.ts";
import { esc, fmtDate, isNum, money, numIn, parseNum } from "./util.ts";

export interface DSatir {
  itemId: string; name: string; qty: number; unit: string; price: number | null; exp: string; note: string; received: number; iptal: boolean;
  /** 3802: satırın kayıtlı termini boştu (siparişinki geçiyordu); pencere siparişin terminiyle doldurur, değişmezse boş gönderir. */
  terminSiparisin: boolean;
  ilk: { qty: number; unit: string; price: number | null; exp: string; note: string };
}
export interface DBaslik { payDays: number; kdv: string; teslimYeri: string; tedarikciNotu: string; icNot: string }
export interface DTaslak {
  talepId: string; quoteId: string; etiket: string; firma: string; currency: Currency; no: number; siparisTarihi: string;
  satirlar: DSatir[]; baslik: DBaslik; ilkBaslik: DBaslik; gerekce: string; teyitKisi: string; teyitTarihi: string;
  /** Logo'da irsaliyeli: miktar, fiyat, termin, iptal, vade ve KDV kilitli; notlar ve teslim yeri açık. */
  irsaliyeli: boolean;
  /** Kapatılmış ya da iptal kuyruğundaki sipariş: pencere salt okunur, neden yazılır. */
  kapali: string | null;
  hata: string;
  gonderiliyor: boolean;
}
export interface DOge { alan: SiparisDegisikligiOgesi["alan"]; ad: string | null; once: string | null; sonra: string | null; onayaDusurur: boolean }
export interface DTahmin { ogeler: DOge[]; nedenler: string[]; once: number | null; sonra: number | null }

export const ALAN_ADLARI: Record<SiparisDegisikligiOgesi["alan"], string> = {
  miktar: "Miktar", birim: "Birim", birimFiyat: "Birim fiyat", termin: "Termin", not: "Satır notu", iptal: "Satır iptali",
  vadeGun: "Ödeme şartı (vade gün)", kdvOrani: "KDV oranı", teslimYeri: "Teslim yeri", tedarikciNotu: "Tedarikçiye not", icNot: "İç not",
};
const KAPALI_SIPARIS = "Kalanı kapatılmış ya da iptal kuyruğundaki sipariş değişmez.";

/** Değiştirilebilecek siparişler (verilmiş talepte, satırı olan). */
export function degisecekSiparisler(r: PurchaseRequest): { quoteId: string; etiket: string; firma: string }[] {
  return awardOrders(r).filter((o) => (r.award?.lines ?? []).some((l) => l.quoteId === o.qid))
    .map((o) => ({ quoteId: o.qid, etiket: siparisEtiketi(o) || "Sipariş", firma: supName(o.q) }));
}

export function degisiklikTaslagiKur(r: PurchaseRequest, quoteId: string): DTaslak | null {
  const o = awardOrders(r).find((x) => x.qid === quoteId);
  if (!o) return null;
  const a = r.award!;
  const ord = a.mode === "split" ? a.orders?.[quoteId] ?? {} : a;
  const g = r.siparisGecmisi?.[quoteId];
  const satirlar = (a.lines ?? []).filter((l) => l.quoteId === quoteId).map((l): DSatir => {
    const it = r.items.find((x) => x.id === l.itemId);
    const qty = l.qty ?? it?.qty ?? 0;
    const unit = l.unit ?? it?.unit ?? "";
    const price = isNum(o.q.prices[l.itemId]) ? o.q.prices[l.itemId]! : null;
    // 3802: termin zorunlu; kayıtlı satır termini yoksa siparişin termini görünür ve denetlenir.
    const exp = l.expectedDate || orderDue(o);
    const note = l.note ?? "";
    return { itemId: l.itemId, name: it?.name ?? "Kalem", qty, unit, price, exp, note, received: l.received ?? 0, iptal: false, terminSiparisin: !l.expectedDate, ilk: { qty, unit, price, exp, note } };
  });
  const baslik: DBaslik = { payDays: o.q.payDays ?? 0, kdv: g?.kdvOrani ?? "", teslimYeri: ord.teslimYeri ?? "", tedarikciNotu: ord.tedarikciNotu ?? "", icNot: ord.icNot ?? "" };
  const logo = o.logo;
  return {
    talepId: r.id, quoteId, etiket: siparisEtiketi(o) || "Sipariş", firma: supName(o.q), currency: o.q.currency, no: g?.no ?? 0, siparisTarihi: o.orderDate,
    satirlar, baslik, ilkBaslik: { ...baslik }, gerekce: "", teyitKisi: "", teyitTarihi: "",
    irsaliyeli: !!logo?.kayitNo && satirlar.some((x) => x.received > 0),
    kapali: logo && (logo.iptalDurumu || logo.kapatmaDurumu) ? KAPALI_SIPARIS : null,
    hata: "", gonderiliyor: false,
  };
}

const ayni = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 0.00005);
const tutarOf = (satirlar: readonly { qty: number; price: number | null }[]): number | null =>
  (satirlar.some((x) => x.price === null) ? null : satirlar.reduce((t, x) => t + x.qty * x.price!, 0));

/** Ekranın tahmini: sunucudaki sınıflama ile aynı kural (siparis-kurallar `siparisDegisikligiKur`, `degisiklikOnayNedenleri`). */
export function degisiklikTahmini(t: DTaslak): DTahmin {
  const ogeler: DOge[] = [];
  const nedenler: string[] = [];
  const sonraSatirlar: { qty: number; price: number | null }[] = [];
  for (const s of t.satirlar) {
    if (s.iptal) {
      ogeler.push({ alan: "iptal", ad: s.name, once: numIn(s.ilk.qty), sonra: s.received > 0 ? numIn(s.received) : null, onayaDusurur: false });
      if (s.received > 0) sonraSatirlar.push({ qty: s.received, price: s.ilk.price });
      continue;
    }
    if (!ayni(s.qty, s.ilk.qty)) {
      const artis = s.qty > s.ilk.qty;
      ogeler.push({ alan: "miktar", ad: s.name, once: numIn(s.ilk.qty), sonra: numIn(s.qty), onayaDusurur: artis });
      if (artis) nedenler.push(`Miktar artışı: ${s.name} ${numIn(s.ilk.qty)} → ${numIn(s.qty)}`);
    }
    if (!ayni(s.price, s.ilk.price)) ogeler.push({ alan: "birimFiyat", ad: s.name, once: s.ilk.price === null ? null : numIn(s.ilk.price), sonra: s.price === null ? null : numIn(s.price), onayaDusurur: false });
    if (s.exp !== s.ilk.exp) ogeler.push({ alan: "termin", ad: s.name, once: s.ilk.exp || null, sonra: s.exp || null, onayaDusurur: false });
    if (s.note !== s.ilk.note) ogeler.push({ alan: "not", ad: s.name, once: s.ilk.note, sonra: s.note, onayaDusurur: false });
    sonraSatirlar.push({ qty: s.qty, price: s.price });
  }
  const b = t.baslik, i = t.ilkBaslik;
  if (b.payDays !== i.payDays) { ogeler.push({ alan: "vadeGun", ad: null, once: String(i.payDays), sonra: String(b.payDays), onayaDusurur: true }); nedenler.push(`Ödeme şartı: vade ${i.payDays} → ${b.payDays} gün`); }
  if (b.kdv !== i.kdv) ogeler.push({ alan: "kdvOrani", ad: null, once: i.kdv || null, sonra: b.kdv || null, onayaDusurur: false });
  if (b.teslimYeri !== i.teslimYeri) ogeler.push({ alan: "teslimYeri", ad: null, once: i.teslimYeri, sonra: b.teslimYeri, onayaDusurur: false });
  if (b.tedarikciNotu !== i.tedarikciNotu) ogeler.push({ alan: "tedarikciNotu", ad: null, once: i.tedarikciNotu, sonra: b.tedarikciNotu, onayaDusurur: false });
  if (b.icNot !== i.icNot) ogeler.push({ alan: "icNot", ad: null, once: i.icNot, sonra: b.icNot, onayaDusurur: false });
  const once = tutarOf(t.satirlar.map((s) => ({ qty: s.ilk.qty, price: s.ilk.price })));
  const sonra = tutarOf(sonraSatirlar);
  const para = ogeler.some((x) => x.alan === "miktar" || x.alan === "birimFiyat" || x.alan === "iptal");
  if (para && (once === null || sonra === null)) nedenler.push("Tutar hesaplanamadı");
  else if (para && sonra! > once! + 0.005) nedenler.push("Tutar artışı");
  return { ogeler, nedenler, once, sonra };
}

/** Kayıt öncesi ekran denetimi: alan kimliği ve ileti (ilk hataya odak gider). */
export function degisiklikHatalari(t: DTaslak): { alan: string; ileti: string }[] {
  const h: { alan: string; ileti: string }[] = [];
  t.satirlar.forEach((s, i) => {
    if (s.iptal) return;
    if (!isNum(s.qty) || s.qty <= 0) h.push({ alan: `sd-m-${i}`, ileti: `${s.name}: miktar sıfırdan büyük olur.` });
    else if (s.qty < s.received - 0.00005) h.push({ alan: `sd-m-${i}`, ileti: `${s.name}: miktar teslim alınan ${numIn(s.received)} altına inmez.` });
    if (s.price === null || s.price < 0) h.push({ alan: `sd-p-${i}`, ileti: `${s.name}: birim fiyat yazın.` });
    if (t.irsaliyeli) return;
    if (!s.exp) h.push({ alan: `sd-t-${i}`, ileti: `${s.name}: termin girin.` });
    else if (t.siparisTarihi && s.exp < t.siparisTarihi) h.push({ alan: `sd-t-${i}`, ileti: `${s.name}: termin sipariş tarihinden (${fmtDate(t.siparisTarihi)}) önce olamaz.` });
  });
  if (t.satirlar.every((s) => s.iptal)) h.push({ alan: "sd-m-0", ileti: "Siparişin bütün satırları iptal edilemez; siparişin tamamı talep iptaliyle kalkar." });
  if (t.baslik.kdv && !/^\d{1,3}(\.\d{1,2})?$/.test(t.baslik.kdv.replace(",", "."))) h.push({ alan: "sd-kdv", ileti: "KDV oranı geçersiz (örn. 20)." });
  if (!t.gerekce.trim()) h.push({ alan: "sd-gerekce", ileti: "Gerekçe zorunlu." });
  return h;
}

const ond = (n: number): string => String(Math.round(n * 10000) / 10000);
export function degisiklikGovdesi(t: DTaslak): Omit<SiparisDegistirGovdesi, "surum"> {
  return {
    teklifId: t.quoteId,
    satirlar: t.satirlar.map((s) => ({
      kalemId: s.itemId, miktar: ond(s.qty), birim: s.unit, birimFiyat: ond(s.price ?? 0), beklenenTeslim: s.terminSiparisin && s.exp === s.ilk.exp ? null : s.exp || null, notlar: s.note, iptal: s.iptal,
    })),
    baslik: { vadeGun: t.baslik.payDays, kdvOrani: t.baslik.kdv ? t.baslik.kdv.replace(",", ".") : null, teslimYeri: t.baslik.teslimYeri, tedarikciNotu: t.baslik.tedarikciNotu, icNot: t.baslik.icNot },
    gerekce: t.gerekce.trim(), teyitKisi: t.teyitKisi.trim(), teyitTarihi: t.teyitTarihi || null,
  };
}

/** Penceredeki alanlar taslağa okunur (çizimden önce; girilen kaybolmasın). */
export function degisiklikTaslaginiOku(t: DTaslak, kok: ParentNode): void {
  const v = (id: string): string | null => kok.querySelector<HTMLInputElement>(`#${id}`)?.value ?? null;
  t.satirlar.forEach((s, i) => {
    const m = v(`sd-m-${i}`); if (m !== null) s.qty = parseNum(m) ?? NaN;
    const p = v(`sd-p-${i}`); if (p !== null) s.price = parseNum(p);
    const e = v(`sd-t-${i}`); if (e !== null) s.exp = e;
    const n = v(`sd-n-${i}`); if (n !== null) s.note = n;
  });
  const vade = v("sd-vade"); if (vade !== null) t.baslik.payDays = Math.max(0, Math.round(parseNum(vade) ?? t.baslik.payDays));
  const kdv = v("sd-kdv"); if (kdv !== null) t.baslik.kdv = kdv.trim();
  const ty = v("sd-yer"); if (ty !== null) t.baslik.teslimYeri = ty;
  const tn = v("sd-tnot"); if (tn !== null) t.baslik.tedarikciNotu = tn;
  const icn = v("sd-inot"); if (icn !== null) t.baslik.icNot = icn;
  const g = v("sd-gerekce"); if (g !== null) t.gerekce = g;
  const tk = v("sd-teyit"); if (tk !== null) t.teyitKisi = tk;
  const tt = v("sd-teyit-tarihi"); if (tt !== null) t.teyitTarihi = tt;
}

const KILIT = (neden: string) => `<span class="sub" data-sd-kilit>kilitli: ${esc(neden)}</span>`;
/** Önce / sonra: görünen ok ve ekran okuyucuya "önce", "sonra" (Arayüz Y1); renk yalnız ek ipucudur. */
export function onceSonra(once: string | null, sonra: string | null): string {
  const o = once === null || once === "" ? "boş" : once;
  const s = sonra === null || sonra === "" ? "boş" : sonra;
  return `<span class="sr-only">önce </span><del>${esc(o)}</del> <span aria-hidden="true">→</span><span class="sr-only">, sonra </span> <b>${esc(s)}</b>`;
}
const degerMetni = (alan: SiparisDegisikligiOgesi["alan"], x: string | null): string | null =>
  (x === null ? null : alan === "termin" ? fmtDate(x) : alan === "kdvOrani" ? `%${x}` : x);

/** Canlı özet şeritleri (onay tahmini, etki, tutar). aria-live: sınıf değişince duyulur (Arayüz Y2). */
export function degisiklikSeridiHTML(t: DTaslak, x: DTahmin, ortam: { onayli: boolean; dortGoz: boolean }): string {
  const onayaGider = x.nedenler.length > 0;
  const dogrudan = onayaGider && ortam.onayli && !ortam.dortGoz;
  const sinif = !onayaGider
    ? `<b>Tahmini: onaysız, geçmişe yazılır.</b> Kayıtla sipariş R${t.no + 1} olur.`
    : dogrudan ? `<b>Dört göz kapalı: doğrudan uygulanır.</b> Geçmişe "dört gözsüz" yazılır. Nedenler: ${esc(x.nedenler.join("; "))}.`
    : `<b>Tahmini: onaya gider.</b> ${esc(x.nedenler.join("; "))}.${ortam.onayli ? " Onay yetkiniz olsa da ikinci bir kişi onaylar (dört göz)." : ""} Onaylanana kadar sipariş R${t.no} hâliyle geçerli.`;
  const kalan = t.satirlar.filter((s) => !s.iptal && s.qty - s.received > 0.00005).map((s) => `${s.name} ${numIn(s.qty - s.received)} ${s.unit}`);
  const terminKayan = t.satirlar.some((s) => !s.iptal && s.exp !== s.ilk.exp);
  const fark = x.once !== null && x.sonra !== null ? x.sonra - x.once : null;
  return `<div class="stack" data-sa-sd-serit aria-live="polite">
    <div class="callout small" data-sd-sinif="${onayaGider ? (dogrudan ? "dogrudan" : "onay") : "onaysiz"}"><span class="flag ${onayaGider ? "warn" : "good"}">${onayaGider ? (dogrudan ? "dört gözsüz" : "onaya gider") : "onaysız, izli"}</span> ${sinif} <span class="muted">Kesin sınıfı sunucu verir.</span></div>
    <div class="small"><b>Etki${onayaGider && !dogrudan ? " (onaydan sonra)" : ""}:</b> mal kabulde kalan ${kalan.length ? esc(kalan.join(", ")) : "yok"}${terminKayan ? "; plan termini değişen satırlarda yeniden hesaplanır" : ""}${t.satirlar.some((s) => s.iptal) ? `; ${t.satirlar.filter((s) => s.iptal).length} satır iptal edilecek` : ""}.</div>
    <div class="small" data-sd-tutar><b>Tutar (KDV hariç, ${esc(t.currency)}):</b> ${x.once === null || x.sonra === null ? "hesaplanamadı" : `${money(x.once, t.currency)} → ${money(x.sonra, t.currency)}${fark !== null && Math.abs(fark) > 0.005 ? ` <b>${fark > 0 ? "+" : "−"}${money(Math.abs(fark), t.currency)}</b>` : ""}`}</div>
  </div>`;
}

/** Pencerenin gövdesi ve alt şeridi (3574 ekran D). */
export function siparisDegistirHTML(t: DTaslak, secenekler: { quoteId: string; etiket: string; firma: string }[], ortam: { onayli: boolean; dortGoz: boolean }): string {
  const ro = t.kapali !== null;
  const kilitli = t.irsaliyeli || ro;
  const dis = (k: boolean) => (k ? " disabled" : "");
  const x = degisiklikTahmini(t);
  const hatalar = degisiklikHatalari(t);
  const hataliMi = (id: string) => (t.hata && hatalar.some((h) => h.alan === id) ? ' aria-invalid="true"' : "");
  const satir = (s: DSatir, i: number) => {
    const ad = esc(s.name);
    const iptalRozet = s.iptal ? ` <span class="flag bad">${s.received > 0 ? `iptal: teslim alınana iner` : "iptal edilecek"}</span>` : "";
    const eski = (deg: boolean, metin: string) => (deg ? `<span class="sub"><span class="sr-only">önceki değer </span><del>${esc(metin)}</del></span>` : "");
    return `<tr${s.iptal ? ' class="off"' : ""} data-sd-satir="${i}"><td class="lead" data-l="Kalem">${ad}${iptalRozet}${s.received > 0 ? `<span class="sub">kısmi teslim</span>` : ""}</td>
      <td class="r num" data-l="Teslim alınan">${numIn(s.received)} ${esc(s.unit)}</td>
      <td class="r" data-l="Miktar (${esc(s.unit)})">${eski(!ayni(s.qty, s.ilk.qty) && !s.iptal, numIn(s.ilk.qty))}<input class="num" type="text" inputmode="decimal" id="sd-m-${i}" value="${numIn(s.qty)}" aria-label="${ad} miktar"${hataliMi(`sd-m-${i}`)}${dis(kilitli || s.iptal)}>${s.received > 0 && !kilitli ? `<span class="sub">en az ${numIn(s.received)}</span>` : ""}${t.irsaliyeli ? KILIT("irsaliyeli") : ""}</td>
      <td class="r" data-l="Birim fiyat (${esc(t.currency)})">${eski(!ayni(s.price, s.ilk.price) && !s.iptal, s.ilk.price === null ? "–" : numIn(s.ilk.price))}<input class="num" type="text" inputmode="decimal" id="sd-p-${i}" value="${s.price === null ? "" : numIn(s.price)}" aria-label="${ad} birim fiyat"${hataliMi(`sd-p-${i}`)}${dis(kilitli || s.iptal)}>${t.irsaliyeli ? KILIT("irsaliyeli") : ""}</td>
      <td data-l="Termin">${eski(s.exp !== s.ilk.exp && !s.iptal, s.ilk.exp ? fmtDate(s.ilk.exp) : "siparişin")}<input type="date" required id="sd-t-${i}" value="${esc(s.exp)}" aria-label="${ad} termin"${hataliMi(`sd-t-${i}`)}${dis(kilitli || s.iptal)}>${t.irsaliyeli ? KILIT("irsaliyeli") : ""}</td>
      <td data-l="Not"><input type="text" id="sd-n-${i}" value="${esc(s.note)}" maxlength="500" aria-label="${ad} satır notu"${dis(ro || s.iptal)}></td>
      <td data-l="">${kilitli ? "" : s.iptal ? `<button class="btn sm ghost" data-act="sd-iptal" data-i="${i}" aria-label="${ad} iptalini geri al">Geri al</button>`
        : `<button class="btn sm ghost danger" data-act="sd-iptal" data-i="${i}" aria-label="${ad} satırını iptal et">Satırı iptal et</button>`}</td></tr>`;
  };
  const secici = secenekler.length > 1 ? `<label class="f"><span>Sipariş</span><select id="sd-siparis" data-act-change="sd-siparis">${secenekler.map((o) => `<option value="${o.quoteId}"${o.quoteId === t.quoteId ? " selected" : ""}>${esc(o.etiket)}, ${esc(o.firma)}</option>`).join("")}</select></label>` : "";
  const hataListesi = t.hata ? `<div class="callout small" role="alert" data-sd-hata><b>Kaydedilmedi.</b> ${esc(t.hata)}${hatalar.length ? `<ul>${hatalar.map((h) => `<li>${esc(h.ileti)}</li>`).join("")}</ul>` : ""}</div>` : "";
  return `<div class="mh"><h2>Siparişi değiştir: ${esc(t.etiket)}</h2></div><div class="mb stack" data-sa-siparis-degistir data-quote="${t.quoteId}">
    <div class="row small"><span class="flag mute">${esc(t.firma)}</span><span class="flag info">şu an R${t.no}</span>${t.irsaliyeli ? '<span class="flag bad">Logo\'da irsaliyeli</span>' : ""}${ro ? '<span class="flag bad">salt okunur</span>' : ""}</div>
    ${secici}
    ${ro ? `<p class="callout small">${esc(t.kapali!)}</p>` : t.irsaliyeli ? '<p class="callout small">Bu siparişin Logo\'da irsaliyesi var. Miktar, fiyat, termin, satır iptali, vade ve KDV değişmez; yalnız notlar ve teslim yeri. Kalan için "Kalanı kapat".</p>' : ""}
    ${hataListesi}
    <div class="tw"><table class="itbl rt sp-tablo"><caption class="sr-only">Sipariş satırları</caption><thead><tr><th>Kalem</th><th class="r">Teslim alınan</th><th class="r">Miktar</th><th class="r">Birim fiyat</th><th>Termin</th><th>Not</th><th><span class="sr-only">Satır eylemi</span></th></tr></thead>
      <tbody>${t.satirlar.map(satir).join("")}</tbody></table></div>
    <div class="grid g2">
      <label class="f"><span>Ödeme şartı (vade gün)${t.baslik.payDays !== t.ilkBaslik.payDays ? ` <small><span class="sr-only">önceki </span><del>${t.ilkBaslik.payDays}</del></small>` : ""}</span><input type="text" inputmode="numeric" id="sd-vade" value="${t.baslik.payDays}"${dis(kilitli)}>${t.irsaliyeli ? KILIT("irsaliyeli") : ""}</label>
      <label class="f"><span>KDV oranı (%) <small>boş: genel oran</small></span><input type="text" inputmode="decimal" id="sd-kdv" value="${esc(t.baslik.kdv)}"${hataliMi("sd-kdv")}${dis(kilitli)}>${t.irsaliyeli ? KILIT("irsaliyeli") : ""}</label>
      <label class="f"><span>Teslim yeri</span><input type="text" id="sd-yer" maxlength="200" value="${esc(t.baslik.teslimYeri)}"${dis(ro)}></label>
      <label class="f"><span>Tedarikçiye not <small>sipariş metnine girer</small></span><textarea id="sd-tnot" rows="2" maxlength="2000"${dis(ro)}>${esc(t.baslik.tedarikciNotu)}</textarea></label>
      <label class="f"><span>İç not <small>tedarikçi görmez</small></span><textarea id="sd-inot" rows="2" maxlength="2000"${dis(ro)}>${esc(t.baslik.icNot)}</textarea></label>
    </div>
    <div class="grid g2">
      <label class="f"><span>Gerekçe <small>zorunlu</small></span><textarea id="sd-gerekce" rows="2" maxlength="500" placeholder="Örn. tedarikçi kalan miktarı iki haftada verebiliyor"${hataliMi("sd-gerekce")}${dis(ro)}>${esc(t.gerekce)}</textarea></label>
      <label class="f"><span>Tedarikçi teyidi <small>isteğe bağlı: kim, nasıl</small></span><input type="text" id="sd-teyit" maxlength="200" value="${esc(t.teyitKisi)}" placeholder="Örn. telefon, satış temsilcisi"${dis(ro)}></label>
      <label class="f"><span>Teyit tarihi</span><input type="date" id="sd-teyit-tarihi" value="${esc(t.teyitTarihi)}"${dis(ro)}></label>
    </div>
    ${x.ogeler.length ? degisiklikSeridiHTML(t, x, ortam) : '<p class="small muted" data-sa-sd-serit aria-live="polite">Henüz değişiklik yok.</p>'}
  </div><div class="mf"><button class="btn ghost" data-act="close">Vazgeç</button>${ro ? "" : `<button class="btn primary" data-act="sd-kaydet"${t.gonderiliyor ? ' disabled aria-busy="true"' : ""}>${t.gonderiliyor ? "Kaydediliyor…" : "Kaydet"}</button>`}</div>`;
}

const SONUC_ROZETI: Record<SiparisDegisikligi["sonuc"], string> = {
  onaysiz: '<span class="flag good">onaysız, izli</span>', onaylandi: '<span class="flag good">onaylandı</span>',
  reddedildi: '<span class="flag bad">reddedildi</span>', "geri-alindi": '<span class="flag mute">geri alındı</span>',
};
export function ogeMetni(o: SiparisDegisikligiOgesi): string {
  const ad = o.kalemAdi ? `${esc(o.kalemAdi)} ` : "";
  return `${ad}${esc(ALAN_ADLARI[o.alan].toLocaleLowerCase("tr"))}: ${onceSonra(degerMetni(o.alan, o.once), degerMetni(o.alan, o.sonra))}`;
}
const tutarMetni = (once: string | null, sonra: string | null): string => {
  if (once === null || sonra === null) return "";
  const f = Number(sonra) - Number(once);
  return ` Tutar ${money(Number(once), "TRY", 0)} → ${money(Number(sonra), "TRY", 0)}${Math.abs(f) > 0.005 ? ` (${f > 0 ? "+" : "−"}${money(Math.abs(f), "TRY", 0)})` : ""}, KDV hariç.`;
};

/** Siparişin değişiklik geçmişi (en yeni üstte); bekleyen değişiklik "R{n}?" ile, reddedilen ve geri alınan numarasız. */
export function degisiklikGecmisiHTML(r: PurchaseRequest, quoteId: string): string {
  const g = r.siparisGecmisi?.[quoteId];
  if (!g || g.degisiklikler === null) return "";
  const o = r.siparisOnerisi?.tur === "siparis-degistir" && r.siparisOnerisi.degisiklik?.teklifId === quoteId ? r.siparisOnerisi : null;
  const bekleyen = o ? `<li data-sd-gecmis="bekliyor"><span class="flag warn">R${o.degisiklik!.degisiklikNo}?</span> <b>onay bekliyor</b>: ${o.degisiklik!.ozet.map(ogeMetni).join("; ")}.${tutarMetni(o.onayliTutar === null ? null : String(o.onayliTutar), o.yeniTutar === null ? null : String(o.yeniTutar))}
    <span class="sub">${esc(o.onerenAdi)}, ${new Date(o.zaman).toLocaleString("tr-TR")}. Gerekçe: ${esc(o.gerekce)}</span></li>` : "";
  const satirlar = g.degisiklikler.map((d) => `<li data-sd-gecmis="${d.sonuc}"><span class="flag ${d.degisiklikNo === null ? "mute" : "info"}">${d.degisiklikNo === null ? "—" : `R${d.degisiklikNo}`}</span> ${SONUC_ROZETI[d.sonuc]}${d.dortGozsuz ? ' <span class="flag warn">dört gözsüz</span>' : ""}: ${d.ozet.map(ogeMetni).join("; ")}.${tutarMetni(d.onceTutar, d.sonraTutar)}
    <span class="sub">${esc(d.yapanAdi ?? "")}, ${new Date(d.zaman).toLocaleString("tr-TR")}. Gerekçe: ${esc(d.gerekce)}${d.teyitKisi ? `. Teyit: ${esc(d.teyitKisi)}${d.teyitTarihi ? `, ${fmtDate(d.teyitTarihi)}` : ""}` : ""}${d.onaylayanAdi && d.sonuc !== "onaysiz" ? `. ${d.sonuc === "reddedildi" ? "Reddeden" : "Onaylayan"} ${esc(d.onaylayanAdi)}` : ""}${d.kararNotu ? `: ${esc(d.kararNotu)}` : ""}</span></li>`).join("");
  const sip = degisecekSiparisler(r).find((x) => x.quoteId === quoteId);
  return `<div class="stack" data-sa-sd-gecmis="${quoteId}"><h3 class="small">Değişiklik geçmişi${sip ? `: ${esc(sip.etiket)}` : ""} <span class="flag info">geçerli R${g.no}</span></h3>
    <ul class="log">${bekleyen}${satirlar}<li data-sd-gecmis="r0"><span class="flag mute">R0</span> Sipariş verildi.</li></ul></div>`;
}

/** Onay bekleyen sipariş değişikliği: onaylayana yalnız okunur önce / sonra ve Onayla / Reddet; önerene neden ve "Öneriyi geri al"
 *  (Arayüz Y3, Y4). Paketteki her değişiklik listelenir; onaya düşürenler rozetlidir. */
export function degisiklikOnerisiHTML(r: PurchaseRequest, onaylayabilir: boolean, benimMi: boolean): string {
  const o = r.siparisOnerisi;
  if (!o || o.tur !== "siparis-degistir" || !o.degisiklik) return "";
  const d = o.degisiklik;
  const sip = degisecekSiparisler(r).find((x) => x.quoteId === d.teklifId);
  const satirlar = d.ozet.map((x) => `<tr><td class="lead" data-l="Kalem">${x.kalemAdi ? esc(x.kalemAdi) : "Sipariş başlığı"}</td><td data-l="Alan">${esc(ALAN_ADLARI[x.alan])}</td>
    <td data-l="Önce → sonra">${onceSonra(degerMetni(x.alan, x.once), degerMetni(x.alan, x.sonra))}</td>
    <td data-l="Onay">${x.onayaDusurur ? '<span class="flag warn">onaya düşürür</span>' : '<span class="flag mute">izli, onay gerekmez</span>'}</td></tr>`).join("");
  const farkMetni = o.onayliTutar !== null && o.yeniTutar !== null ? `${o.yeniTutar >= o.onayliTutar ? "+" : "−"}${money(Math.abs(o.yeniTutar - o.onayliTutar), "TRY", 0)}` : null;
  const tutar = farkMetni !== null ? `${money(o.onayliTutar!, "TRY", 0)} → ${money(o.yeniTutar!, "TRY", 0)} (${farkMetni}), KDV hariç` : "hesaplanamadı";
  const eylem = onaylayabilir && !benimMi
    ? `<label class="f"><span>Not <small>reddederken zorunlu</small></span><textarea id="sd-oneri-not" rows="2" maxlength="500" aria-describedby="sd-oneri-not-hata"></textarea><span class="sub" id="sd-oneri-not-hata"></span></label>
    <p class="small muted">Onayda sunucu yeniden doğrular: arada teslim girdiyse ya da tutar önerideki tutarı aşıyorsa onay reddedilir ve nedeni yazılır.</p>
    <div class="row"><button class="btn bad" data-act="sp-oneri-reddet">Reddet</button><span class="spacer"></span><button class="btn good" data-act="sp-oneri-onayla">Onayla, ${farkMetni ?? "tutar hesaplanamadı"}</button></div>`
    : benimMi ? `<div class="row"><span class="small muted">Bu değişikliği siz önerdiniz; onayı başka bir yetkili verir.</span><span class="spacer"></span><button class="btn" data-act="sd-geri-al">Öneriyi geri al</button></div>`
    : '<p class="small muted">Onay, onay yetkisi olan kişide.</p>';
  return `<div class="callout stack" data-sa-siparis-degisikligi-onerisi><p><b>Sipariş değişikliği onay bekliyor${sip ? `: ${esc(sip.etiket)}, ${esc(sip.firma)}` : ""}.</b> R${d.degisiklikNo - 1} → R${d.degisiklikNo}. Öneren ${esc(o.onerenAdi)}. Onaylanana kadar sipariş eski hâliyle geçerli.</p>
    <p class="small"><b>Neden onayda:</b> ${esc(d.onayNedenleri.join("; "))}. <b>Tutar:</b> ${tutar}.</p>
    <div class="tw"><table class="itbl rt"><caption class="sr-only">Bekleyen değişiklikler</caption><thead><tr><th>Kalem</th><th>Alan</th><th>Önce → sonra</th><th>Onay</th></tr></thead><tbody>${satirlar}</tbody></table></div>
    <p class="small"><b>Gerekçe:</b> ${esc(o.gerekce)}${d.teyitKisi ? `. <b>Tedarikçi teyidi:</b> ${esc(d.teyitKisi)}${d.teyitTarihi ? `, ${fmtDate(d.teyitTarihi)}` : ""}` : ""}</p>
    ${eylem}</div>`;
}

/** Sipariş adımındaki giriş düğmesi; bekleyen değişiklik varken kapalı ve nedeni okunur (R4). */
export function siparisDegistirDugmesi(r: PurchaseRequest): string {
  return r.siparisOnerisi
    ? '<button class="btn" data-act="order-change" aria-disabled="true" aria-describedby="sd-bekleyen-neden">Siparişi değiştir</button><span class="small muted" id="sd-bekleyen-neden">Önce bekleyen değişiklik sonuçlansın.</span>'
    : '<button class="btn" data-act="order-change">Siparişi değiştir</button>';
}
