import type { SiparisLogoOzeti } from "#paylasilan/sozlesme/logo.ts";
import type { OdemePlaniSatiri, SiparisTakibiCevabi } from "#paylasilan/sozlesme/satin-alma.ts";
import type { SiparisIrsaliyesi } from "#paylasilan/sozlesme/stok.ts";
import type { OrderInfo } from "./calc.ts";
import { siparisEtiketi, supName } from "./calc.ts";
import { backend, scheduleRender } from "./store.ts";
import { ApiHatasi } from "../../../ortak/veri/api.ts";
import { farkMetni, faturaOzeti, irsaliyeOzeti, logoOzetleriniOku, miktarMetni, type LogoOzetleri } from "./logo-ozeti.ts";
import { esc, fmtDate, money } from "./util.ts";

// Kart #1124: siparişin üzerinde iki satırlık takip (mal kabulün irsaliyesi, finansın faturası) ve ödeme planı. Plan finanstadır,
// irsaliye stokta. Talebin sürümü başına bir kez okunur: sipariş kaydı plan kurar, yeni sürümde yeniden okunur; sayfa yeniden
// açılınca (takibiUnut) da yeniden okunur.
export type SiparisTakibi = SiparisTakibiCevabi["siparisler"][number];
// logo: 3384 a Logo irsaliye ve fatura özeti; "Logo irsaliyelerini gör" yetkisi yoksa ya da okunamazsa null (panelde Logo satırı yok).
interface Durum { siparisler: SiparisTakibi[]; irsaliyeler: SiparisIrsaliyesi[] | null; logo: LogoOzetleri | null }
const durum = new Map<string, { surum: number | undefined; deger: Durum | null | "yukleniyor" }>();
export function takibiUnut(): void { durum.clear(); }
export function takipGuncelle(talepId: string, siparisler: SiparisTakibi[]): void {
  const d = durum.get(talepId);
  const eski = d && d.deger && d.deger !== "yukleniyor" ? d.deger : null;
  durum.set(talepId, { surum: d?.surum, deger: { siparisler, irsaliyeler: eski?.irsaliyeler ?? null, logo: eski?.logo ?? null } });
  scheduleRender();
}
export function siparisTakibi(talepId: string, teklifId: string): SiparisTakibi | null {
  const d = durum.get(talepId)?.deger;
  return d && d !== "yukleniyor" ? d.siparisler.find(x => x.teklifId === teklifId) ?? null : null;
}

// Yetkisiz (403) ya da okunamayan Logo özeti paneli bozmaz: Logo satırları çizilmez.
async function logoOku(nolar: string[]): Promise<LogoOzetleri | null> {
  if (nolar.length === 0) return null;
  try { return await logoOzetleriniOku(nolar); } catch (h) { if (h instanceof ApiHatasi) return null; throw h; }
}

async function yukle(talepId: string, surum: number | undefined, nolar: string[]): Promise<void> {
  const yaz = (deger: Durum | null) => { if (durum.get(talepId)?.surum === surum) { durum.set(talepId, { surum, deger }); scheduleRender(); } };
  // Takip yan paneldir: okunamazsa talep ekranı çalışmayı sürdürür, panel "okunamadı" der.
  try {
    const t = await backend.siparisTakibi(talepId);
    if (t === null) { yaz(null); return; }
    const satirlar = t.siparisler.flatMap(x => x.satirIdleri);
    const [irsaliyeler, logo] = await Promise.all([satirlar.length ? backend.siparisIrsaliyeleri(satirlar) : Promise.resolve([]), logoOku(nolar).catch(() => null)]);
    yaz({ siparisler: t.siparisler, irsaliyeler, logo });
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

// 3063 (3057 a): mal kabule eklenen irsaliye belgesi Stok'un okuma ucundan açılır; fiyat taşımaz.
const irsaliyeBaglantilari = (b: SiparisIrsaliyesi): string => b.belgeler.map(x =>
  ` <a href="/api/stok/mal-kabuller/${b.malKabulId}/irsaliyeler/${x.id}" target="_blank" rel="noopener" title="${esc(x.ad)}">Belgeyi aç</a>`).join("");

// 3384 a: Logo'daki irsaliye ve fatura satırları ve kalem kalem karşılaştırma (yalnız okuma; düzeltme Logo'da ya da Stok'ta yapılır).
const KAPALI_SIMGE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>';
const UYARI_SIMGE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l10 18H2zM12 10v5m0 3v.01"/></svg>';
const irsaliyeAdi = (x: SiparisLogoOzeti["irsaliyeler"][number]): string => `${esc(x.fisNo ?? x.belgeNo ?? `Kayıt ${x.kayitNo}`)}, ${fmtDate(x.tarih)}${x.iade ? " (iade)" : ""}`;
const KALEM_DURUMU: Record<SiparisLogoOzeti["kalemler"][number]["durum"], string> = {
  ayni: "Aynı", bekliyor: "İkisinde de yok", birim: "Birim tutmuyor", okunmadi: "Okunmadı", "logo-bagi-yok": "Logo'ya gitmedi", fark: "",
};
function logoSatirlari(o: OrderInfo, logo: LogoOzetleri): string {
  const ozet = logo.siparisler.get(o.orderNo);
  if (!logo.okuma.irsaliye && !logo.okuma.fatura) {
    return `<li class="muted" data-sa-takip="kapali" data-sa-logo-takip><span>${KAPALI_SIMGE} <b>Logo: irsaliye ve fatura</b></span><span class="small">Logo okuması kapalı. Yönetici Sistem Ayarları'ndan açar ("Logo: irsaliye okuması").</span></li>`;
  }
  if (!ozet || !ozet.logoda) return "";
  const irs = irsaliyeOzeti(ozet, logo.okuma);
  const fat = faturaOzeti(ozet);
  const irsSatiri = !logo.okuma.irsaliye
    ? `<li class="muted" data-sa-takip="kapali" data-sa-logo-takip><span>${KAPALI_SIMGE} <b>Logo: irsaliye</b></span><span class="small">Logo irsaliye okuması kapalı. Yönetici Sistem Ayarları'ndan açar.</span></li>`
    : ozet.irsaliyeler.length === 0
      ? `<li class="${irs?.fark ? "" : "muted"}" data-sa-takip="${irs?.fark ? "fark" : "bekliyor"}" data-sa-logo-takip><span>${irs?.fark ? UYARI_SIMGE : isaret(false)} <b>${irs?.fark ? `Logo: irsaliye yok, ${ozet.farkliKalem} kalemde fark` : "Logo: irsaliye bekleniyor"}</b></span><span class="small">Logo'da siparişe bağlı irsaliye girilince görünür</span></li>`
      : `<li data-sa-takip="${irs?.fark ? "fark" : "tamam"}" data-sa-logo-takip><span>${irs?.fark ? UYARI_SIMGE : isaret(true)} <b>${irs?.fark ? `Logo: irsaliye girildi, ${ozet.farkliKalem} kalemde fark` : "Logo: irsaliye girildi"}</b></span><span class="small">${ozet.irsaliyeler.map(irsaliyeAdi).join("<br>")}<br><a href="/logo-irsaliyeleri">Logo İrsaliyeleri'nde aç</a></span></li>`;
  // 3472 b: Logo'da iptal edilmiş fatura aynı satırın küçük metninde "İptal" rozetiyle; sipariş onunla faturalandı sayılmaz.
  const iptaller = ozet.iptalFaturalar.length
    ? `<br><span data-sa-logo-iptal-fatura>İptal edilen: ${ozet.iptalFaturalar.map(f => `Logo faturası <del>${esc(f)}</del> <span class="st cancelled">İptal</span>`).join(", ")}</span>` : "";
  const fatSatiri = fat === null ? "" : ozet.faturalar && ozet.faturalar.length
    ? `<li data-sa-takip="tamam" data-sa-logo-takip><span>${isaret(true)} <b>Logo: fatura var</b></span><span class="small">${ozet.faturalar.map(f => `Logo faturası ${esc(f)}`).join("<br>")} <span class="muted">(numara Logo'dan okundu; tutar ve fiyat okunmuyor)</span>${iptaller}</span></li>`
    : `<li class="muted" data-sa-takip="bekliyor" data-sa-logo-takip><span>${isaret(false)} <b>Logo: fatura yok</b></span><span class="small">Logo'da siparişe fatura girilince görünür${iptaller}</span></li>`;
  return irsSatiri + fatSatiri;
}
function logoKalemTablosu(o: OrderInfo, logo: LogoOzetleri | null): string {
  const ozet = logo?.okuma.irsaliye ? logo.siparisler.get(o.orderNo) : undefined;
  if (!ozet || !ozet.logoda || ozet.kalemler.every(k => k.durum === "okunmadi" || k.durum === "logo-bagi-yok")) return "";
  const farkHucre = (k: SiparisLogoOzeti["kalemler"][number]): string => k.durum === "fark" && k.fark !== null
    ? `<b class="sa-logo-fark">${esc(farkMetni(k.fark, k.birim))}</b>` : esc(KALEM_DURUMU[k.durum]);
  return `<details class="sa-logo-kalemler" data-sa-logo-kalemleri${ozet.farkliKalem > 0 ? " open" : ""}><summary>Kalem kalem karşılaştırma</summary>
    <div class="tw"><table class="rt"><thead><tr><th>Kalem</th><th class="r">Sipariş</th><th class="r">CORE mal kabul</th><th class="r">Logo irsaliye</th><th class="r">Fark (Logo - CORE)</th></tr></thead><tbody>${ozet.kalemler.map(k => `<tr data-sa-logo-kalem="${k.durum}">
      <td class="lead">${esc(k.kalemAdi)}</td><td class="num r" data-l="Sipariş">${esc(miktarMetni(k.siparisMiktari, k.birim))}</td><td class="num r" data-l="CORE mal kabul">${esc(miktarMetni(k.coreMiktari, k.birim))}</td>
      <td class="num r" data-l="Logo irsaliye">${esc(miktarMetni(k.logoMiktari, k.logoBirimi ?? k.birim))}</td><td class="r" data-l="Fark (Logo - CORE)">${farkHucre(k)}</td></tr>`).join("")}</tbody></table></div>
    <p class="small muted">Fark: aynı sipariş satırına bağlı Logo irsaliye miktarı (iade düşülmüş) ile CORE mal kabul miktarı. Düzeltme bu ekrandan yapılmaz; Logo'da ya da Stok'ta mal kabulde yapılır.</p></details>`;
}

function siparisHTML(o: OrderInfo, t: SiparisTakibi, irsaliyeler: SiparisIrsaliyesi[] | null, tekil: boolean, logo: LogoOzetleri | null): string {
  const benim = irsaliyeler?.filter(x => t.satirIdleri.includes(x.siparisSatirId)) ?? null;
  const belgeler = benim === null ? null : [...new Map(benim.map(x => [x.malKabulId, x])).values()];
  const irsaliye = belgeler === null ? satir(false, "Mal kabul: irsaliye", '<span class="muted">okunamadı</span>')
    : belgeler.length ? satir(true, "Mal kabul: irsaliye girildi", belgeler.map(b => `${b.irsaliyeNo ? `İrsaliye ${esc(b.irsaliyeNo)}` : "İrsaliye no girilmedi"}, ${zamanGunu(b.zaman)} <span class="muted">(${esc(b.malKabulNo)})</span>${irsaliyeBaglantilari(b)}`).join("<br>"))
    : satir(false, "Mal kabul: irsaliye bekleniyor", "Stokta mal kabul yapılınca görünür");
  const fatura = t.faturalar.length
    ? satir(true, "Finans: fatura girildi", t.faturalar.map(f => `Fatura ${f.belgeNo ? esc(f.belgeNo) : "(no yok)"}, ${fmtDate(f.belgeTarihi)}, vade ${fmtDate(f.vade)}`).join("<br>"))
    : satir(false, "Finans: fatura bekleniyor", "Fatura finansta girilip siparişe bağlanınca görünür");
  const plan = t.odemePlani.length
    ? `<div class="tw"><table class="rt"><thead><tr><th>Ödeme</th><th>Vade</th><th>Ödeme şekli</th><th class="r">Tutar</th></tr></thead><tbody>${t.odemePlani.map(p => `<tr>
        <td>${p.tur === "avans" ? "Avans" : "Vadeli"}</td><td class="num">${fmtDate(p.vade)}</td><td>${esc(ODEME_SEKLI[p.yontem])}</td><td class="num r">${money(Number(p.tutar), t.paraBirimi)}</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="small muted">Ödeme planı yok.</p>';
  const not = t.faturalar.length ? "Fatura geldi; borcun vadesi faturadadır." : "Finansa beklenen ödeme olarak düşer; tutarlar KDV dahil tahminidir.";
  return `<div class="stack" data-sa-siparis-takibi="${esc(o.qid)}">
    ${tekil ? "" : `<p><b>${esc(supName(o.q))}</b>${siparisEtiketi(o) ? `, ${esc(siparisEtiketi(o))}` : ""}</p>`}
    <ul class="todo" data-sa-takip-listesi>${irsaliye}${fatura}${logo ? logoSatirlari(o, logo) : ""}</ul>${logoKalemTablosu(o, logo)}
    <div class="row"><b>Ödeme planı</b><span class="small muted">${not}</span><span class="spacer"></span>${!t.faturalar.length ? `<button class="btn sm" data-act="odeme-plani" data-qid="${esc(o.qid)}">Ödeme planını düzenle</button>` : ""}</div>
    ${plan}</div>`;
}

export function siparisTakibiHTML(r: { id: string; version?: number }, orders: OrderInfo[]): string {
  const k = durum.get(r.id);
  if (k === undefined || k.surum !== r.version) {
    durum.set(r.id, { surum: r.version, deger: "yukleniyor" });
    void yukle(r.id, r.version, orders.filter(o => o.logo !== null && o.orderNo !== "").map(o => o.orderNo));
  }
  const d = k === undefined || k.surum !== r.version ? "yukleniyor" : k.deger;
  if (d === "yukleniyor") return '<p class="small muted">Takip yükleniyor…</p>';
  if (d === null) return '<p class="small muted">Takip okunamadı. Sayfayı yeniden açın.</p>';
  return orders.map(o => {
    const t = d.siparisler.find(x => x.teklifId === o.qid);
    return t ? siparisHTML(o, t, d.irsaliyeler, orders.length === 1, d.logo) : "";
  }).join("");
}
