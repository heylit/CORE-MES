import type { OdemePlaniSatiri, SiparisTakibiCevabi } from "#paylasilan/sozlesme/satin-alma.ts";
import type { SiparisIrsaliyesi } from "#paylasilan/sozlesme/stok.ts";
import type { OrderInfo } from "./calc.ts";
import { siparisEtiketi, supName } from "./calc.ts";
import { backend, scheduleRender } from "./store.ts";
import { esc, fmtDate, money } from "./util.ts";

// Kart #1124: siparişin üzerinde iki satırlık takip (mal kabulün irsaliyesi, finansın faturası) ve ödeme planı. Plan finanstadır,
// irsaliye stokta. Talebin sürümü başına bir kez okunur: sipariş kaydı plan kurar, yeni sürümde yeniden okunur; sayfa yeniden
// açılınca (takibiUnut) da yeniden okunur.
export type SiparisTakibi = SiparisTakibiCevabi["siparisler"][number];
interface Durum { siparisler: SiparisTakibi[]; irsaliyeler: SiparisIrsaliyesi[] | null }
const durum = new Map<string, { surum: number | undefined; deger: Durum | null | "yukleniyor" }>();
export function takibiUnut(): void { durum.clear(); }
export function takipGuncelle(talepId: string, siparisler: SiparisTakibi[]): void {
  const d = durum.get(talepId);
  const irsaliyeler = d && d.deger && d.deger !== "yukleniyor" ? d.deger.irsaliyeler : null;
  durum.set(talepId, { surum: d?.surum, deger: { siparisler, irsaliyeler } });
  scheduleRender();
}
export function siparisTakibi(talepId: string, teklifId: string): SiparisTakibi | null {
  const d = durum.get(talepId)?.deger;
  return d && d !== "yukleniyor" ? d.siparisler.find(x => x.teklifId === teklifId) ?? null : null;
}

async function yukle(talepId: string, surum: number | undefined): Promise<void> {
  const yaz = (deger: Durum | null) => { if (durum.get(talepId)?.surum === surum) { durum.set(talepId, { surum, deger }); scheduleRender(); } };
  // Takip yan paneldir: okunamazsa talep ekranı çalışmayı sürdürür, panel "okunamadı" der.
  try {
    const t = await backend.siparisTakibi(talepId);
    if (t === null) { yaz(null); return; }
    const satirlar = t.siparisler.flatMap(x => x.satirIdleri);
    yaz({ siparisler: t.siparisler, irsaliyeler: satirlar.length ? await backend.siparisIrsaliyeleri(satirlar) : [] });
  } catch { yaz(null); }
}

export const ODEME_SEKLI: Record<OdemePlaniSatiri["yontem"], string> = { banka: "Banka havalesi", nakit: "Nakit", kredi_karti: "Kredi kartı", cek: "Çek", senet: "Senet" };
const zamanGunu = (z: string): string => new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(z));
const isaret = (tamam: boolean): string => tamam
  ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/></svg>'
  : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>';
function satir(tamam: boolean, baslik: string, ayrinti: string): string {
  return `<li class="${tamam ? "" : "muted"}" data-sa-takip="${tamam ? "tamam" : "bekliyor"}"><span>${isaret(tamam)} <b>${esc(baslik)}</b></span><span class="small">${ayrinti}</span></li>`;
}

function siparisHTML(o: OrderInfo, t: SiparisTakibi, irsaliyeler: SiparisIrsaliyesi[] | null, tekil: boolean): string {
  const benim = irsaliyeler?.filter(x => t.satirIdleri.includes(x.siparisSatirId)) ?? null;
  const belgeler = benim === null ? null : [...new Map(benim.map(x => [x.malKabulId, x])).values()];
  const irsaliye = belgeler === null ? satir(false, "Mal kabul: irsaliye", '<span class="muted">okunamadı</span>')
    : belgeler.length ? satir(true, "Mal kabul: irsaliye girildi", belgeler.map(b => `${b.irsaliyeNo ? `İrsaliye ${esc(b.irsaliyeNo)}` : "İrsaliye no girilmedi"}, ${zamanGunu(b.zaman)} <span class="muted">(${esc(b.malKabulNo)})</span>`).join("<br>"))
    : satir(false, "Mal kabul: irsaliye bekleniyor", "Stokta mal kabul yapılınca görünür");
  const fatura = t.faturalar.length
    ? satir(true, "Finans: fatura girildi", t.faturalar.map(f => `Fatura ${f.belgeNo ? esc(f.belgeNo) : "(no yok)"}, ${fmtDate(f.belgeTarihi)}, vade ${fmtDate(f.vade)}`).join("<br>"))
    : satir(false, "Finans: fatura bekleniyor", "Fatura finansta girilip siparişe bağlanınca görünür");
  const plan = t.odemePlani.length
    ? `<div class="tw"><table class="rt"><thead><tr><th>Ödeme</th><th>Vade</th><th>Ödeme şekli</th><th class="r">Tutar</th></tr></thead><tbody>${t.odemePlani.map(p => `<tr>
        <td>${p.tur === "avans" ? "Avans" : "Vadeli"}</td><td class="num">${fmtDate(p.vade)}</td><td>${esc(ODEME_SEKLI[p.yontem])}</td><td class="num r">${money(Number(p.tutar), t.paraBirimi)}</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="small muted">Ödeme planı yok.</p>';
  const not = t.faturalar.length ? "Fatura geldi; borcun vadesi faturadadır." : "Finansa beklenen ödeme olarak düşer; tutarlar KDV hariç tahminidir.";
  return `<div class="stack" data-sa-siparis-takibi="${esc(o.qid)}">
    ${tekil ? "" : `<p><b>${esc(supName(o.q))}</b>${siparisEtiketi(o) ? `, ${esc(siparisEtiketi(o))}` : ""}</p>`}
    <ul class="todo">${irsaliye}${fatura}</ul>
    <div class="row"><b>Ödeme planı</b><span class="small muted">${not}</span><span class="spacer"></span>${!t.faturalar.length ? `<button class="btn sm" data-act="odeme-plani" data-qid="${esc(o.qid)}">Ödeme planını düzenle</button>` : ""}</div>
    ${plan}</div>`;
}

export function siparisTakibiHTML(r: { id: string; version?: number }, orders: OrderInfo[]): string {
  const k = durum.get(r.id);
  if (k === undefined || k.surum !== r.version) { durum.set(r.id, { surum: r.version, deger: "yukleniyor" }); void yukle(r.id, r.version); }
  const d = k === undefined || k.surum !== r.version ? "yukleniyor" : k.deger;
  if (d === "yukleniyor") return '<p class="small muted">Takip yükleniyor…</p>';
  if (d === null) return '<p class="small muted">Takip okunamadı. Sayfayı yeniden açın.</p>';
  return orders.map(o => {
    const t = d.siparisler.find(x => x.teklifId === o.qid);
    return t ? siparisHTML(o, t, d.irsaliyeler, orders.length === 1) : "";
  }).join("");
}
