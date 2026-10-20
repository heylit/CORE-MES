import type { PurchaseRequest, Quote, RequestItem, Settings } from "./tipler.ts";
import { CRIT, KART_SAYFASI, OPEN, SUP_STATUS } from "./constants.ts";
import { S, V, nameOf, settings } from "./store.ts";
import {
  budgetUse, isCommitted, matOf, matStats, payText, perfScore, quoteCalc, savingsOf, spendLines,
  supplierStats, EMPTY_STATS, type QuoteCalc,
} from "./calc.ts";
import {
  addDays, dayDiff, deltaHTML, esc, fmtDate, isNum, money, MONTHS, nf0, nf1, nf2, nfx, norm, numIn, pad, parseNum, pct,
  short, sum, todayStr, toCSV, tsDate, SYM,
} from "./util.ts";
import { partilerPaneli } from "./partiler.ts";
import { empty, hbars, matLink, priceChart, reqTable, stars, supLink, vbars, type BarDatum } from "./views.ts";
import { CURRENCIES as CURS } from "./tipler.ts";
/* ================= malzemeler ================= */
export function unlinkedItems(): { r: PurchaseRequest; it: RequestItem }[] {
  const out: { r: PurchaseRequest; it: RequestItem }[] = [];
  Object.values(S.requests).forEach(r => (r.items || []).forEach(it => { if (!matOf(it) && it.name) out.push({ r, it }); }));
  return out;
}
export function viewMaterials(): string {
  const set = settings();
  let list = Object.values(S.materials);
  const q = norm(V.mq);
  if (q) list = list.filter(m => norm([m.code, m.name, m.category, m.spec, ...(m.aliases || [])].join(" ")).includes(q));
  if (V.mcat) list = list.filter(m => (m.category || "") === V.mcat);
  const rows = list.map(m => ({ m, st: matStats(m.id) })).sort((a, b) => (b.st.quotes - a.st.quotes) || a.m.name.localeCompare(b.m.name, "tr"));
  const cats = [...new Set([...(set.categories || []), ...Object.values(S.materials).map(m => m.category).filter(Boolean)])] as string[];
  const un = unlinkedItems();
  return `<div class="phead"><div><h1>Malzemeler</h1><p class="lead">Satın aldığınız her kalemin fiyat geçmişi, teklif veren tedarikçileri ve önceki alımlardan notları burada birikir. Talepte bir kalem yazdığınızda katalog otomatik eşleşir. Katalog kalemi bir malzeme kartına bağlıdır; yeni kart ${KART_SAYFASI} sayfasında açılır.</p></div><span class="spacer"></span><button class="btn primary" data-act="new-material">Kataloğa ekle</button></div>
  ${un.length ? `<div class="callout" data-sa-y="1"><div class="row"><span>Taleplerde katalogla eşleşmemiş <b>${un.length}</b> kalem var. Karta bağlayınca fiyat geçmişine katılırlar.</span><span class="spacer"></span><button class="btn sm" data-act="link-items">Kataloğa bağla</button></div></div>` : ""}
  <div class="row" data-sa-y="2">
    <div data-sa-y="3"><input id="mat-search" type="search" placeholder="Kod, ad, kategori" value="${esc(V.mq)}" data-in="mat-search" aria-label="Malzeme ara"></div>
    <div data-sa-y="4"><select data-ch="mcat" aria-label="Kategori"><option value="">Tüm kategoriler</option>${cats.map(c => `<option ${V.mcat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
  </div>
  <div class="panel">${Object.keys(S.materials).length ? (rows.length ? `<div class="tw"><table class="rt"><thead><tr><th>Kod</th><th>Malzeme</th><th>Kategori</th><th class="r">Alım</th><th class="r">Son alış (birim)</th><th class="r">İlk alışa göre</th><th class="r">Teklif veren</th><th>Risk</th></tr></thead><tbody>
  ${rows.map(({ m, st }) => { const ns = st.suppliers.length; return `<tr class="click" data-act="open-mat" data-id="${m.id}"><td class="num muted">${esc(m.code || "")}</td><td class="lead"><b>${esc(m.name)}</b>${m.spec ? `<span class="sub">${esc(m.spec)}</span>` : ""}</td><td>${esc(m.category || "–")}</td><td class="r num">${st.count}${st.qty ? `<span class="sub">${numIn(st.qty)} ${esc(m.unit || "")}</span>` : ""}</td><td class="r num">${st.last ? `${money(st.last.unitTRY)}<span class="sub">${esc(st.last.supplier)}, ${fmtDate(st.last.date)}</span>` : '<span class="faint">alım yok</span>'}</td><td class="r">${deltaHTML(st.change) || '<span class="faint">–</span>'}</td><td class="r num">${ns}</td><td>${st.count >= 1 && ns <= 1 ? '<span class="flag warn">tek kaynak</span>' : ""}</td></tr>`; }).join("")}
  </tbody></table></div>` : `<div class="empty">Bu filtreye uyan malzeme yok.</div>`)
  : empty("Katalog boş", "Sık aldığınız malzemelerin kartlarını kataloğa ekleyin; talepte yazılınca fiyat geçmişi burada birikir.", '<button class="btn primary" data-act="new-material">Kataloğa ekle</button>' + (un.length ? '<button class="btn" data-act="link-items">Talep kalemlerini bağla</button>' : ""))}</div>`;
}
export function viewMaterial(): string {
  const m = S.materials[V.id!];
  if (!m) return `<div class="panel">${empty("Malzeme bulunamadı", "Silinmiş olabilir.", '<button class="btn" data-act="go" data-page="materials">Malzemelere dön</button>')}</div>`;
  const st = matStats(m.id);
  const reqs = Object.values(S.requests).filter(r => (r.items || []).some(it => matOf(it) === m.id));
  const lessons = reqs.filter(r => r.award && r.award.lessons).map(r => ({ r, t: r.award!.lessons! }));
  const openReqs = reqs.filter(r => OPEN.includes(r.status));
  return `<div class="crumb"><button data-act="go" data-page="materials">Malzemeler</button> / <span class="num">${esc(m.code || "")}</span></div>
  <div class="phead"><div class="ttl"><h1>${esc(m.name)}</h1><p class="small muted" data-sa-y="5">${[m.category, m.unit && "Birim: " + m.unit, m.spec].filter(Boolean).map(esc).join("&ensp;&ensp;")}</p></div>
    <div class="row"><button class="btn" data-act="edit-material">Düzenle</button><button class="btn primary" data-act="req-from-mat">Bu malzeme için talep aç</button></div></div>
  <div class="kv" data-sa-y="6">
    <div><div class="k">Son alış</div><div class="v">${st.last ? money(st.last.unitTRY) : "–"}</div><div class="d">${st.last ? esc(st.last.supplier) + ", " + fmtDate(st.last.date) : "henüz alınmadı"}</div></div>
    <div><div class="k">İlk alışa göre</div><div class="v">${isNum(st.change) ? deltaHTML(st.change) : "–"}</div><div class="d">${st.first && st.first !== st.last ? "ilk " + money(st.first.unitTRY) + ", " + fmtDate(st.first.date) : "karşılaştırma için 2 alım gerekir"}</div></div>
    <div><div class="k">12 ay ortalama teklif</div><div class="v">${isNum(st.avgTRY) ? money(st.avgTRY) : "–"}</div><div class="d">en düşük görülen ${isNum(st.minTRY) ? money(st.minTRY) : "–"}</div></div>
    <div><div class="k">Toplam alım</div><div class="v">${st.count} kez</div><div class="d">${st.qty ? numIn(st.qty) + " " + esc(m.unit || "") : ""}</div></div>
    <div><div class="k">Teklif veren</div><div class="v">${st.suppliers.length}</div><div class="d">${st.quotes} teklif kaydı</div></div>
  </div>
  <section class="panel" data-sa-y="6"><div class="panel-h"><h2>Birim fiyat geçmişi</h2><span class="sub">TL, iskonto sonrası, KDV hariç</span></div><div class="panel-b">${priceChart(m.id)}</div></section>
  ${partilerPaneli(m.malzemeNo)}
  <div class="cols" data-sa-y="6">
    <section class="panel"><div class="panel-h"><h2>Tedarikçi kıyası</h2></div>${st.suppliers.length ? `<div class="tw"><table class="rt"><thead><tr><th>Tedarikçi</th><th class="r">Ort. birim</th><th class="r">Teklif</th><th class="r">Seçildi</th><th>Son teklif</th></tr></thead><tbody>${st.suppliers.map((s, i) => `<tr><td class="lead">${supLink(s.supplierId, s.name)}${i === 0 && st.suppliers.length > 1 ? ' <span class="flag good">en uygun</span>' : ""}</td><td class="r num">${money(s.avgTRY)}</td><td class="r num">${s.n}</td><td class="r num">${s.wins}</td><td class="num">${fmtDate(s.last.date)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="panel-b small muted">Bu malzeme için henüz teklif kaydı yok.</div>`}</section>
    <section class="stack">
      <div class="panel"><div class="panel-h"><h2>Notlar ve öğrenilenler</h2></div><div class="panel-b stack" data-sa-y="7">
        ${m.notes ? `<div class="note">${esc(m.notes)}</div>` : ""}
        ${lessons.length ? lessons.map(l => `<div class="note"><span class="xs muted">${esc(l.r.no)}, ${fmtDate(l.r.award!.deliveredDate || l.r.award!.decidedAt)}</span><br>${esc(l.t)}</div>`).join("") : (m.notes ? "" : '<p class="small muted">Teslimat sonrası "öğrenilenler" notları ve malzeme notları burada toplanır.</p>')}
      </div></div>
    </section>
  </div>
  <div class="stack">
    <section class="panel"><div class="panel-h"><h2>Tüm teklif kayıtları</h2><span class="sub">${st.h.length} kayıt</span></div>${st.h.length ? `<div class="tw"><table class="rt"><thead><tr><th>Tarih</th><th>Talep</th><th>Tedarikçi</th><th class="r">Birim</th><th class="r">TL</th><th></th></tr></thead><tbody>${st.h.slice().reverse().map(e => `<tr class="click" data-act="open" data-id="${e.reqId}"><td class="num">${fmtDate(e.date)}</td><td class="num muted">${esc(e.no)}</td><td class="lead">${esc(e.supplier)}<span class="sub">${esc(e.payText)}${isNum(e.leadDays) ? ", " + e.leadDays + " gün" : ""}</span></td><td class="r num">${money(e.unit, e.currency)}</td><td class="r num">${money(e.unitTRY)}</td><td>${e.won ? '<span class="flag good">alındı</span>' : ""}</td></tr>`).join("")}</tbody></table></div>` : `<div class="panel-b small muted">Kayıt yok.</div>`}</section>
    ${openReqs.length ? `<div class="panel"><div class="panel-h"><h2>Açık talepler</h2></div>${reqTable(openReqs)}</div>` : ""}
  </div>`;
}

/* ================= tedarikçiler ================= */
export function viewSuppliers(): string {
  const sst = supplierStats();
  let base = Object.values(S.suppliers);
  const q = norm(V.sq);
  if (q) base = base.filter(s => norm([s.name, (s.categories || []).join(" "), s.contact, s.city].join(" ")).includes(q));
  const list = base.map(s => ({ s, st: sst[s.id] || EMPTY_STATS, p: perfScore(s.id) })).sort((a, b) => (b.st.spendTRY - a.st.spendTRY) || (b.st.quotes - a.st.quotes) || a.s.name.localeCompare(b.s.name, "tr"));
  return `<div class="phead"><div><h1>Tedarikçiler</h1><p class="lead">Her tedarikçinin karnesi kendi geçmişinden hesaplanır: teklif isteklerine cevap oranı, en iyi teklife uzaklığı, zamanında teslim ve kalite. Karşılaştırmadaki "tedarikçi performansı" puanı buradan gelir.</p></div><span class="spacer"></span><button class="btn primary" data-act="new-supplier">Tedarikçi ekle</button></div>
  <div class="row" data-sa-y="2"><div data-sa-y="8"><input id="sup-search" type="search" placeholder="Firma, kategori, şehir" value="${esc(V.sq)}" data-in="sup-search" aria-label="Tedarikçi ara"></div></div>
  <div class="panel">${Object.keys(S.suppliers).length ? `<div class="tw"><table class="rt"><thead><tr><th>Tedarikçi</th><th>Performans</th><th class="r">Teklif / seçildi</th><th class="r">Cevap oranı</th><th class="r">En iyiye uzaklık</th><th class="r">Zamanında</th><th class="r">Kalite</th><th class="r">Harcama</th></tr></thead><tbody>
  ${list.map(({ s, st, p }) => `<tr class="click" data-act="open-sup" data-id="${s.id}"><td class="lead"><b>${esc(s.name)}</b> ${s.status && s.status !== "approved" ? `<span class="flag ${s.status === "suspended" ? "bad" : "info"}">${SUP_STATUS[s.status]}</span>` : ""}<span class="sub">${esc([(s.categories || []).join(", "), s.city].filter(Boolean).join(", ") || "–")}</span></td>
    <td data-sa-y="9"><div class="row" data-sa-y="10"><div class="bar" data-sa-y="11"><span class="k1" style="width:${p.toFixed(0)}%"></span></div><span class="num small">${nf0.format(p)}</span></div><span class="sub">${stars(s.rating)}</span></td>
    <td class="r num">${st.quotes} / ${st.wins}</td><td class="r num">${st.asked ? pct(st.responseRate) : "–"}${isNum(st.avgResp) ? `<span class="sub">ort. ${nf1.format(st.avgResp)} gün</span>` : ""}</td>
    <td class="r num">${isNum(st.avgGap) ? (st.avgGap < 0.5 ? '<span class="flag good">genelde en iyi</span>' : "+" + pct(st.avgGap, 1)) : "–"}</td>
    <td class="r num">${st.deliveries ? pct(st.onTimeRate) + `<span class="sub">${st.onTime}/${st.deliveries}</span>` : "–"}</td><td class="r num">${st.qualityN ? pct(st.qualityRate) : "–"}</td><td class="r num">${st.spendTRY ? short(st.spendTRY) : "–"}</td></tr>`).join("")}
  </tbody></table></div>` : empty("Tedarikçi listesi boş", "Sık çalıştığınız firmaları kaydedin. Firma, Müşteriler ve Tedarikçiler sayfasındaki kayıttan seçilir.", '<button class="btn primary" data-act="new-supplier">Tedarikçi ekle</button>')}</div>`;
}
export function viewSupplier(): string {
  const s = S.suppliers[V.id!];
  if (!s) return `<div class="panel">${empty("Tedarikçi bulunamadı", "Silinmiş olabilir.", '<button class="btn" data-act="go" data-page="suppliers">Tedarikçilere dön</button>')}</div>`;
  const st = supplierStats()[s.id] || EMPTY_STATS, p = perfScore(s.id);
  const hist: { r: PurchaseRequest; q: Quote; c: QuoteCalc; won: boolean }[] = [];
  Object.values(S.requests).forEach(r => (r.quotes || []).forEach(q => {
    if (q.supplierId !== s.id) return;
    const c = quoteCalc(r, q); const won = !!r.award && isCommitted(r) && (r.award.mode === "split" ? Object.values(r.award.splits || {}).includes(q.id) : r.award.quoteId === q.id);
    hist.push({ r, q, c, won });
  }));
  hist.sort((a, b) => (b.q.date || "") > (a.q.date || "") ? 1 : -1);
  const mats: Record<string, { mid: string | null; name: string; n: number; last: { unitTRY: number; date: string } }> = {};
  hist.forEach(h => (h.r.items || []).forEach(it => { if (!h.q.prices || !isNum(h.q.prices[it.id])) return; const mid = matOf(it); const key = mid || norm(it.name); const o = mats[key] || (mats[key] = { mid, name: it.name, n: 0, last: { unitTRY: 0, date: "" } }); o.n++; o.last = { unitTRY: h.q.prices[it.id]! * h.c.unitTRY, date: h.q.date }; }));
  const lessons = hist.filter(h => h.won && h.r.award && h.r.award.lessons);
  const evals = (s.evals || []).slice().reverse();
  return `<div class="crumb"><button data-act="go" data-page="suppliers">Tedarikçiler</button> / ${esc(s.name)}</div>
  <div class="phead"><div class="ttl"><h1>${esc(s.name)} ${s.status && s.status !== "approved" ? `<span class="flag ${s.status === "suspended" ? "bad" : "info"}" data-sa-y="12">${SUP_STATUS[s.status]}</span>` : ""}</h1>
    <p class="small muted" data-sa-y="13">${[(s.categories || []).join(", "), s.city, s.contact, s.phone, s.email, s.taxNo && "VKN " + s.taxNo].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}</p></div>
    <div class="row"><button class="btn" data-act="edit-supplier" data-sid="${s.id}">Düzenle</button><button class="btn primary" data-act="add-eval">Değerlendirme ekle</button></div></div>
  <div class="kv" data-sa-y="6">
    <div><div class="k">Performans puanı</div><div class="v">${nf0.format(p)}</div><div class="d">puanınız ${parseNum(s.rating) || 3}/5 + teslim + kalite</div></div>
    <div><div class="k">Cevap oranı</div><div class="v">${st.asked ? pct(st.responseRate) : "–"}</div><div class="d">${st.asked ? `${st.answered}/${st.asked} istek${isNum(st.avgResp) ? ", ort. " + nf1.format(st.avgResp) + " gün" : ""}` : "teklif isteği kaydı yok"}</div></div>
    <div><div class="k">Seçilme oranı</div><div class="v">${st.quotes ? pct(st.winRate) : "–"}</div><div class="d">${st.wins} / ${st.quotes} teklif</div></div>
    <div><div class="k">En iyi teklife uzaklık</div><div class="v">${isNum(st.avgGap) ? "+" + pct(st.avgGap, 1) : "–"}</div><div class="d">${st.evaluated ? st.evaluated + " karşılaştırmada ortalama" : "karşılaştırma yok"}</div></div>
    <div><div class="k">Zamanında teslim</div><div class="v">${st.deliveries ? pct(st.onTimeRate) : "–"}</div><div class="d">${st.deliveries ? `${st.onTime}/${st.deliveries}${st.lateDays.length ? ", gecikme ort. " + nf1.format(sum(st.lateDays) / st.lateDays.length) + " gün" : ""}` : "teslimat ölçülmedi"}</div></div>
    <div><div class="k">Kalite</div><div class="v">${st.qualityN ? pct(st.qualityRate) : "–"}</div><div class="d">${st.qualityN ? st.qualityOk + "/" + st.qualityN + " sorunsuz" : "kayıt yok"}</div></div>
    <div><div class="k">Toplam harcama</div><div class="v">${st.spendTRY ? short(st.spendTRY) : "–"}</div><div class="d">${isNum(st.avgLead) ? "ort. termin " + nf0.format(st.avgLead) + " gün" : ""}</div></div>
  </div>
  <div class="cols" data-sa-y="6">
    <section class="panel"><div class="panel-h"><h2>Teklif geçmişi</h2><span class="sub">${hist.length} teklif</span></div>${hist.length ? `<div class="tw"><table class="rt"><thead><tr><th>Tarih</th><th>Talep</th><th class="r">Tutar</th><th>Şartlar</th><th></th></tr></thead><tbody>${hist.slice(0, 30).map(h => `<tr class="click" data-act="open" data-id="${h.r.id}"><td class="num">${fmtDate(h.q.date)}</td><td class="lead"><span class="num muted xs">${esc(h.r.no)}</span><br>${esc(h.r.title)}</td><td class="r num">${money(h.c.totalTRY, "TRY", 0)}</td><td class="small">${payText(h.q)}${isNum(parseNum(h.q.leadDays)) ? ", " + parseNum(h.q.leadDays) + " gün" : ""}</td><td>${h.won ? '<span class="flag good">seçildi</span>' : h.r.award && isCommitted(h.r) ? '<span class="flag mute">kaybetti</span>' : ""}</td></tr>`).join("")}</tbody></table></div>` : `<div class="panel-b small muted">Henüz teklif vermedi.</div>`}</section>
    <section class="panel"><div class="panel-h"><h2>Teklif verdiği malzemeler</h2></div>${Object.keys(mats).length ? `<div class="tw"><table class="rt"><thead><tr><th>Malzeme</th><th class="r">Teklif</th><th class="r">Son birim fiyat</th></tr></thead><tbody>${Object.values(mats).sort((a, b) => b.n - a.n).map(x => `<tr><td class="lead">${x.mid ? matLink(x.mid, x.name) : esc(x.name)}</td><td class="r num">${x.n}</td><td class="r num">${money(x.last.unitTRY)}<span class="sub">${fmtDate(x.last.date)}</span></td></tr>`).join("")}</tbody></table></div>` : `<div class="panel-b small muted">Kayıt yok.</div>`}</section>
  </div>
  <div class="cols">
    <section class="panel"><div class="panel-h"><h2>Değerlendirmeler</h2><span class="spacer"></span><button class="btn sm" data-act="add-eval">Ekle</button></div><div class="panel-b">${evals.length ? `<ul class="log">${evals.map(e => `<li><time>${fmtDate(e.date)}</time><span>${stars(e.rating)} ${esc(e.text || "")}<span class="by"> ${esc(e.name || nameOf(e.by))}</span></span></li>`).join("")}</ul>` : '<p class="small muted">Görüşme, ziyaret veya sorun sonrası kısa notlar ekleyin; puan ortalaması karneye yansır.</p>'}</div></section>
    <section class="panel"><div class="panel-h"><h2>Alımlardan öğrenilenler</h2></div><div class="panel-b stack" data-sa-y="7">${s.notes ? `<div class="note">${esc(s.notes)}</div>` : ""}${lessons.length ? lessons.map(h => `<div class="note"><span class="xs muted">${esc(h.r.no)}, ${esc(h.r.title)}</span><br>${esc(h.r.award!.lessons)}</div>`).join("") : '<p class="small muted">Teslim sonrası yazılan notlar burada birikir.</p>'}</div></section>
  </div>`;
}

/* ================= raporlar ================= */
function periodStart(): string {
  const t = todayStr();
  if (V.period === "ytd") return t.slice(0, 4) + "-01-01";
  if (V.period === "12m") return addDays(t, -365);
  return "0000-00-00";
}
export function viewReports(): string {
  const from = periodStart();
  const sl = spendLines().filter(l => l.date >= from);
  const total = sum(sl.map(l => l.amount));
  const reqIds = new Set(sl.map(l => l.reqId));
  const reqs = [...reqIds].map(id => S.requests[id]).filter((r): r is PurchaseRequest => r !== undefined);
  let sAvg = 0, sNeg = 0; reqs.forEach(r => { const s = savingsOf(r); sAvg += s.avg; sNeg += s.neg; });
  const cycles = reqs.filter(r => r.award && r.award.orderDate && r.createdAt).map(r => dayDiff(tsDate(r.createdAt), r.award!.orderDate!)).filter(d => d >= 0);
  const qcount = reqs.map(r => (r.quotes || []).length);
  const sst = supplierStats();
  const dl = sum(Object.values(sst).map(s => s.deliveries)), ot = sum(Object.values(sst).map(s => s.onTime));
  // aylık
  const months: string[] = []; const now = new Date(); const n = 12;
  for (let i = n - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(d.getFullYear() + "-" + pad(d.getMonth() + 1)); }
  const mv = months.map(m => ({ label: MONTHS[+m.slice(5) - 1] ?? "", value: sum(sl.filter(l => l.month === m).map(l => l.amount)), cur: m === todayStr().slice(0, 7) }));
  const group = (key: "category" | "supplierId", name?: (k: string) => string): BarDatum[] => { const o: Record<string, number> = {}; sl.forEach(l => { const k = l[key] || "–"; o[k] = (o[k] || 0) + l.amount; }); return Object.entries(o).map(([k, v]) => ({ k, label: name ? name(k) : k, value: v })).sort((a, b) => b.value - a.value); };
  const byCat = group("category");
  const bySup = group("supplierId", k => (S.suppliers[k] || {}).name || "Bilinmeyen");
  const top1 = bySup[0]; const conc = total && top1 ? top1.value / total * 100 : null;
  const top3 = total ? sum(bySup.slice(0, 3).map(x => x.value)) / total * 100 : null;
  const year = todayStr().slice(0, 4);
  const depts = (settings().departments || []).map(d => ({ d, u: budgetUse(d.name, year) })).filter(x => x.u.budget || x.u.used);
  const priceRows = Object.values(S.materials).map(m => ({ m, st: matStats(m.id) })).filter(x => x.st.count >= 2 && isNum(x.st.change)).sort((a, b) => (b.st.change ?? 0) - (a.st.change ?? 0));
  const single = Object.values(S.materials).map(m => ({ m, st: matStats(m.id) })).filter(x => x.st.count >= 1 && x.st.suppliers.length <= 1);
  const supRank = Object.values(S.suppliers).map(s => ({ s, st: sst[s.id] || EMPTY_STATS, p: perfScore(s.id) })).filter(x => x.st.quotes).sort((a, b) => b.p - a.p);
  const pl = { ytd: "bu yıl", "12m": "son 12 ay", all: "tüm zamanlar" }[V.period];
  return `<div class="phead"><div><h1>Raporlar</h1><p class="lead">Siparişe dönmüş alımlardan hesaplanır (KDV hariç, sipariş günündeki kurla). Veri biriktikçe harcama dağılımı, fiyat değişimi ve tedarik riskleri netleşir.</p></div><span class="spacer"></span>
    <div class="seg" role="group" aria-label="Dönem">${[["ytd", "Bu yıl"], ["12m", "Son 12 ay"], ["all", "Tümü"]].map(([k, l]) => `<button data-act="period" data-v="${k}" aria-pressed="${V.period === k}">${l}</button>`).join("")}</div>
    <button class="btn" data-act="export-report">Raporu indir (CSV)</button></div>
  <div class="strip">
    <div><div class="v">${short(total)}</div><div class="k">Sipariş hacmi</div><div class="d">${reqs.length} sipariş, ${pl}</div></div>
    <div><div class="v">${short(sAvg + sNeg)}</div><div class="k">Tasarruf</div><div class="d">${short(sAvg)} seçim + ${short(sNeg)} pazarlık</div></div>
    <div><div class="v">${cycles.length ? nf0.format(sum(cycles) / cycles.length) + " gün" : "–"}</div><div class="k">Talepten siparişe</div><div class="d">ortalama süre</div></div>
    <div><div class="v">${qcount.length ? nf1.format(sum(qcount) / qcount.length) : "–"}</div><div class="k">Talep başına teklif</div><div class="d">hedef en az ${settings().minQuotes}</div></div>
    <div><div class="v">${dl ? pct(ot / dl * 100) : "–"}</div><div class="k">Zamanında teslim</div><div class="d">${dl} teslimat</div></div>
  </div>
  <div class="stack">
    <section class="panel"><div class="panel-h"><h2>Aylık sipariş hacmi</h2><span class="sub">son 12 ay</span></div><div class="panel-b">${vbars(mv)}</div></section>
    <div class="cols">
      <section class="panel"><div class="panel-h"><h2>Kategoriye göre</h2></div><div class="panel-b">${hbars(byCat.slice(0, 10), { empty: "Bu dönemde sipariş yok." })}</div></section>
      <section class="panel"><div class="panel-h"><h2>Tedarikçiye göre</h2>${isNum(conc) ? `<span class="sub">en büyük tedarikçi ${pct(conc)}, ilk üç ${pct(top3)}</span>` : ""}</div><div class="panel-b">${hbars(bySup.slice(0, 10).map(x => Object.assign(x, { html: S.suppliers[x.k!] ? supLink(x.k, x.label) : esc(x.label) })), { empty: "Bu dönemde sipariş yok." })}${isNum(conc) && conc > 40 ? '<p class="small" data-sa-y="14"><span class="flag warn">yoğunlaşma</span> Harcamanın büyük kısmı tek tedarikçide; alternatif kaynak geliştirmeyi düşünün.</p>' : ""}</div></section>
    </div>
    <div class="cols">
      <section class="panel"><div class="panel-h"><h2>Bütçe kullanımı</h2><span class="sub">${year}</span></div><div class="panel-b">${hbars(depts.map(x => ({ label: x.d.name, value: x.u.used, max: Math.max(x.u.budget, x.u.used), over: !!x.u.budget && x.u.used > x.u.budget, text: x.u.budget ? `${short(x.u.used)} / ${short(x.u.budget)} (${pct(x.u.used / x.u.budget * 100)})` : short(x.u.used) + ", bütçe yok" })), { empty: "Birim bütçesi Sistem Ayarları'nda tanımlanır." })}</div></section>
      <section class="panel"><div class="panel-h"><h2>Tedarikçi sıralaması</h2><span class="sub">performans puanına göre</span></div>${supRank.length ? `<div class="tw"><table class="rt"><thead><tr><th>Tedarikçi</th><th class="r">Puan</th><th class="r">Seçildi</th><th class="r">Zamanında</th><th class="r">En iyiye uzaklık</th></tr></thead><tbody>${supRank.slice(0, 10).map(x => `<tr class="click" data-act="open-sup" data-id="${x.s.id}"><td class="lead">${esc(x.s.name)}</td><td class="r num">${nf0.format(x.p)}</td><td class="r num">${x.st.wins}/${x.st.quotes}</td><td class="r num">${x.st.deliveries ? pct(x.st.onTimeRate) : "–"}</td><td class="r num">${isNum(x.st.avgGap) ? "+" + pct(x.st.avgGap, 1) : "–"}</td></tr>`).join("")}</tbody></table></div>` : '<div class="panel-b small muted">Teklif kaydı oluştukça dolar.</div>'}</section>
    </div>
    <div class="cols">
      <section class="panel"><div class="panel-h"><h2>Fiyat değişimi</h2><span class="sub">en az iki kez alınan malzemeler, ilk ve son alış</span></div>${priceRows.length ? `<div class="tw"><table class="rt"><thead><tr><th>Malzeme</th><th class="r">İlk</th><th class="r">Son</th><th class="r">Değişim</th></tr></thead><tbody>${priceRows.slice(0, 15).map(x => `<tr class="click" data-act="open-mat" data-id="${x.m.id}"><td class="lead">${esc(x.m.name)}<span class="sub">${fmtDate(x.st.first!.date)} → ${fmtDate(x.st.last!.date)}</span></td><td class="r num">${money(x.st.first!.unitTRY)}</td><td class="r num">${money(x.st.last!.unitTRY)}</td><td class="r">${deltaHTML(x.st.change)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="panel-b small muted">Aynı malzeme ikinci kez alındığında burada görünür.</div>'}</section>
      <section class="panel"><div class="panel-h"><h2>Tek kaynak riski</h2><span class="sub">hiç alternatif teklif alınmamış malzemeler</span></div>${single.length ? `<div class="tw"><table class="rt"><thead><tr><th>Malzeme</th><th>Tek tedarikçi</th><th class="r">Alım</th></tr></thead><tbody>${single.slice(0, 15).map(x => `<tr class="click" data-act="open-mat" data-id="${x.m.id}"><td class="lead">${esc(x.m.name)}</td><td>${esc(x.st.suppliers[0] ? x.st.suppliers[0].name : "–")}</td><td class="r num">${x.st.count}</td></tr>`).join("")}</tbody></table></div>` : '<div class="panel-b small muted">Tek kaynağa bağlı malzeme yok.</div>'}</section>
    </div>
  </div>`;
}
export function reportCSV(): string {
  const from = periodStart();
  const rows: (string | number)[][] = [["Tarih", "Talep", "Birim", "Kategori", "Malzeme", "Tedarikçi", "Tutar TL"]];
  spendLines().filter(l => l.date >= from).forEach(l => rows.push([fmtDate(l.date), l.no, l.department, l.category, (l.materialId ? S.materials[l.materialId]?.name ?? "" : ""), (S.suppliers[l.supplierId] || {}).name || "", nf2.format(l.amount)]));
  return toCSV(rows);
}

/* ================= ayarlar ================= */
export function viewSettings(draft?: Settings | null): string {
  const s = draft ?? settings();
  return `<div class="phead"><div><h1>Ayarlar</h1><p class="lead">Kurlar ve fırsat maliyeti tüm karşılaştırmaları, onay limitleri ve bütçeler karar ekranını etkiler.</p></div><span class="spacer"></span><button class="btn primary" data-act="save-settings">Ayarları kaydet</button></div>
  <div class="stack" id="settings-form">
  <section class="panel"><div class="panel-h"><h2>Kurlar ve vade maliyeti</h2>${s.ratesDate ? `<span class="sub">kurlar finanstan, ${fmtDate(s.ratesDate)}</span>` : '<span class="flag warn">finansta kur yok</span>'}</div>
    <div class="panel-b"><div class="tw"><table class="rt"><thead><tr><th>Para birimi</th><th>TL kuru</th><th>Aylık fırsat maliyeti (%)</th></tr></thead><tbody>
    ${CURS.map(c => `<tr><td class="lead"><b>${c}</b> ${SYM[c]}</td><td class="num">${c === "TRY" ? "1" : isNum(s.currencies[c].rate) ? nfx.format(s.currencies[c].rate!) : '<span class="muted">finansta kur yok</span>'}</td><td><input type="text" inputmode="decimal" data-set="monthly" data-cur="${c}" value="${numIn(parseNum(s.currencies[c].monthly))}" data-sa-y="15"></td></tr>`).join("")}
    </tbody></table></div>
    <p class="small muted" data-sa-y="16">Kurlar finansın kur tablosundan okunur; burada değiştirilmez. Teklif kendi günündeki kurla saklanır ve sonradan değişmez; finansta o günün kuru yoksa teklifte girilir. Fırsat maliyeti için şirketinizin kredi faizini ya da mevduat getirisini girin. Şu anki ayarla 90 gün vadeli 100.000 ₺ bugün yaklaşık ${money(100000 / Math.pow(1 + (parseNum(s.currencies.TRY.monthly) || 0) / 100, 3), "TRY", 0)} değerinde.</p></div></section>
  <section class="panel"><div class="panel-h"><h2>Değerlendirme varsayılanları</h2></div><div class="panel-b grid g4">
    ${CRIT.map(c => `<label class="f"><span>${c.l} ağırlığı</span><input type="number" min="0" max="100" data-set="w" data-k="${c.k}" value="${+s.weights[c.k] || 0}"></label>`).join("")}
    <label class="f"><span>Teklif geçerliliği (gün)</span><input type="number" min="1" data-set="validityDays" value="${s.validityDays}"></label>
    <label class="f"><span>Önerilen en az teklif</span><input type="number" min="1" data-set="minQuotes" value="${s.minQuotes}"></label>
    <label class="f"><span>Fiyat artış uyarısı (%)</span><input type="number" min="1" data-set="priceAlertPct" value="${s.priceAlertPct}"></label>
    <label class="f"><span>Şirket adı <small>— teklif isteğinde, siparişte ve Finans'ta</small></span><input type="text" maxlength="120" data-set="company" value="${esc(s.company)}"></label>
  </div></section>
  <div class="cols">
    <section class="panel"><div class="panel-h"><h2>Onay limitleri</h2><span class="sub">tutar (KDV hariç TL) bu değere kadar</span></div><div class="panel-b">
      <table class="itbl rt"><thead><tr><th>Üst limit</th><th>Onaylayan</th><th></th></tr></thead><tbody id="ap-rows">${(s.approvalLimits || []).map((l, i) => `<tr data-ap="${i}"><td><input type="text" inputmode="decimal" data-apk="max" value="${l.max === null || l.max === undefined ? "" : numIn(l.max)}" placeholder="limitsiz"></td><td><input type="text" data-apk="role" value="${esc(l.role)}"></td><td class="acts"><button class="btn sm ghost danger" data-act="rm-ap" data-i="${i}">Kaldır</button></td></tr>`).join("")}</tbody></table>
      <div class="row" data-sa-y="5"><button class="btn sm" data-act="add-ap">Seviye ekle</button><span class="small muted">Boş limit en üst seviyedir.</span></div></div></section>
    <section class="panel"><div class="panel-h"><h2>Birimler ve yıllık bütçe</h2></div><div class="panel-b">
      <table class="itbl rt"><thead><tr><th>Birim</th><th>Yıllık bütçe (TL)</th><th></th></tr></thead><tbody id="dep-rows">${(s.departments || []).map((d, i) => `<tr data-dep="${i}"><td><input type="text" data-dk="name" value="${esc(d.name)}"></td><td><input type="text" inputmode="decimal" data-dk="budget" value="${numIn(parseNum(d.budget))}" placeholder="tanımsız"></td><td class="acts"><button class="btn sm ghost danger" data-act="rm-dep" data-i="${i}">Kaldır</button></td></tr>`).join("")}</tbody></table>
      <div class="row" data-sa-y="5"><button class="btn sm" data-act="add-dep">Birim ekle</button></div></div></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Malzeme kategorileri</h2><span class="sub">her satıra bir kategori</span></div><div class="panel-b"><textarea id="set-cats" data-sa-y="17">${esc((s.categories || []).join("\n"))}</textarea></div></section>
  <section class="panel"><div class="panel-h"><h2>Veriler</h2></div><div class="panel-b stack" data-sa-y="18">
    <p class="small muted">Veriler TMI sunucusunda tutulur; yedeği TMI alır. ${Object.keys(S.requests).length} talep, ${Object.keys(S.materials).length} malzeme, ${Object.keys(S.suppliers).length} tedarikçi kayıtlı.</p>
  </div></section>
  <div class="row"><button class="btn primary" data-act="save-settings">Ayarları kaydet</button></div>
  </div>`;
}
export function hasSampleData(): boolean { return (["requests", "suppliers", "materials"] as const).some(c => Object.values(S[c]).some(x => x.sample)); }
