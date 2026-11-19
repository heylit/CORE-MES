/**
 * tedarikçiye giden teklif isteme formu (yazdırılır, PDF olarak kaydedilir). Şablon Sistem Ayarları > Formlar'dadır;
 * pencerede basmadan önce değiştirilir, değişiklik saklanmaz. Değeri olmayan alanın geçtiği satır basılmaz (veri uydurulmaz).
 */
import type { TeklifIstekFormuCevabi, TeklifIstekFormuIcerigi } from "#paylasilan/sozlesme/satin-alma.ts";
import type { PurchaseRequest, Supplier } from "./tipler.ts";
import { teklifMetniSatirlari } from "./kalem-bagi.ts";
import { esc, fmtDate, numIn, parseNum } from "./util.ts";

export type IstekAlani = "TEDARIKCI" | "YETKILI" | "TALEP_NO" | "KONU" | "IHTIYAC" | "SON_TARIH" | "FIRMA";
export type IstekDegerleri = Partial<Record<IstekAlani, string>>;
type Kurum = TeklifIstekFormuCevabi["kurum"];

const ALAN_ADLARI: ReadonlySet<string> = new Set<IstekAlani>(["TEDARIKCI", "YETKILI", "TALEP_NO", "KONU", "IHTIYAC", "SON_TARIH", "FIRMA"]);
/** Yer tutucuları doldurur; değeri boş alanın geçtiği satır düşer. Tanınmayan yer tutucu olduğu gibi kalır (yazım hatası görünsün). */
export function istekMetniDoldur(metin: string, d: IstekDegerleri): string {
  return metin.split("\n").flatMap((satir) => {
    let eksik = false;
    const dolu = satir.replace(/\{([A-Z_]+)\}/g, (tam, ad: string) => {
      if (!ALAN_ADLARI.has(ad)) return tam;
      const v = (d[ad as IstekAlani] ?? "").trim();
      if (v === "") eksik = true;
      return v;
    });
    return eksik ? [] : [dolu];
  }).join("\n");
}

export function istekDegerleri(r: PurchaseRequest, s: Supplier | undefined, sonTarih: string, firma: string): IstekDegerleri {
  return {
    TEDARIKCI: s?.name ?? "", YETKILI: s?.contact || (s ? `${s.name} yetkilisi` : ""), TALEP_NO: r.no, KONU: r.title,
    IHTIYAC: r.needDate ? fmtDate(r.needDate) : "", SON_TARIH: sonTarih ? fmtDate(sonTarih) : "", FIRMA: firma,
  };
}

const satirlar = (metin: string) => metin.split("\n").map((x) => esc(x)).join("<br>");

/** Formun kağıdı: antet, tedarikçi ve talep kutusu, kalemler, istenen bilgiler, kapanış ve imzalar. Fiyat yoktur. */
export function istekFormuHTML(r: PurchaseRequest, s: Supplier | undefined, sonTarih: string, icerik: TeklifIstekFormuIcerigi, kurum: Kurum, firma: string, bugun: string): string {
  const d = istekDegerleri(r, s, sonTarih, kurum.unvan || firma);
  const giris = istekMetniDoldur(icerik.giris, d), kapanis = istekMetniDoldur(icerik.kapanis, d), alt = istekMetniDoldur(icerik.alt, d);
  const antet = [kurum.adres, [kurum.telefon, kurum.eposta].filter(Boolean).join(" · "), kurum.vergi].filter(Boolean);
  const kalemler = (r.items || []).map((it, i) => {
    const ek = teklifMetniSatirlari(it).map((t) => `<br><small>${esc(t)}</small>`).join("");
    const miktar = parseNum(it.qty);
    return `<tr><td class="r">${String(i + 1)}</td><td>${esc(it.name)}${it.spec ? `<br><small>${esc(it.spec)}</small>` : ""}${ek}</td><td class="r">${miktar === null ? "–" : `${numIn(miktar)} ${esc(it.unit)}`}</td><td class="doc-bos"></td><td class="doc-bos"></td></tr>`;
  }).join("");
  const imzalar = [icerik.imza1, icerik.imza2].filter((x) => x.trim() !== "");
  return `<div class="doc doc-istek">
    <div class="doc-h"><div><div class="doc-co">${esc(kurum.unvan || firma || "")}</div>${antet.map((x) => `<div class="doc-antet">${esc(x)}</div>`).join("")}<h2>${esc(icerik.baslik)}</h2></div>
      <table class="doc-meta"><tr><th>Talep no</th><td>${esc(r.no)}</td></tr><tr><th>Tarih</th><td>${fmtDate(bugun)}</td></tr>${sonTarih ? `<tr><th>Son cevap</th><td>${fmtDate(sonTarih)}</td></tr>` : ""}</table></div>
    <table class="doc-kv"><tr><th>Tedarikçi</th><td>${s ? esc(s.name) : ""}</td><th>Konu</th><td>${esc(r.title)}</td></tr>
      <tr><th>İlgili</th><td>${s?.contact ? esc(s.contact) : ""}</td><th>İhtiyaç tarihi</th><td>${r.needDate ? fmtDate(r.needDate) : "–"}</td></tr></table>
    ${giris ? `<p class="doc-metin">${satirlar(giris)}</p>` : ""}
    <h3>Teklif istenen kalemler</h3>
    <table class="doc-t"><thead><tr><th class="r">#</th><th>Kalem</th><th class="r">Miktar</th><th>Birim fiyat</th><th>Termin (gün)</th></tr></thead><tbody>${kalemler}</tbody></table>
    ${icerik.istenenler.length ? `<h3>Teklifte belirtilmesini istediklerimiz</h3><ul class="doc-liste">${icerik.istenenler.map((x) => `<li>${esc(istekMetniDoldur(x, d))}</li>`).join("")}</ul>` : ""}
    ${kapanis ? `<p class="doc-metin">${satirlar(kapanis)}</p>` : ""}
    ${imzalar.length ? `<div class="sigs">${imzalar.map((t) => `<div class="sig"><div class="sig-t">${esc(t)}</div><div class="sig-l">İmza / tarih</div></div>`).join("")}</div>` : ""}
    ${alt ? `<p class="doc-note">${satirlar(alt)}</p>` : ""}
  </div>`;
}

/** Antet boşsa kağıdın üstünde (basılmayan) uyarı; firma bilgisi siparişlerin teklif formundadır. */
export const antetBosMu = (k: Kurum): boolean => [k.unvan, k.adres, k.telefon, k.eposta, k.vergi].every((x) => x.trim() === "");

/** Kağıt A4 genişliğinde kalır; kutuya sığması için ölçek (en çok 1). Ölçü yoksa (gizli kutu) 1. */
export function kagidiOlcekle(kutu: HTMLElement): void {
  const kagit = kutu.querySelector<HTMLElement>(".doc-istek");
  if (!kagit) return;
  const ic = kutu.clientWidth - (parseFloat(getComputedStyle(kutu).paddingLeft) || 0) - (parseFloat(getComputedStyle(kutu).paddingRight) || 0);
  const olcek = ic > 0 ? Math.min(1, ic / 794) : 1;
  kutu.style.setProperty("--sa-kagit-olcek", String(Math.round(olcek * 1000) / 1000));
}
