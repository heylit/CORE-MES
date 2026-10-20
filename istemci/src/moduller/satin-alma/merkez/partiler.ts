import type { SonParti } from "#paylasilan/sozlesme/stok.ts";
import { backend, scheduleRender } from "./store.ts";
import { esc } from "./util.ts";

// Hammadde sertifikası partidedir (mal kabulde girilir); malzeme sayfası son tedarikçi partilerini stoktan bir kez okur.
// Sayfa yeniden açılınca (partileriUnut) yeniden okunur; çizim her seferinde ağa gitmez.
const durum = new Map<number, SonParti[] | null | "yukleniyor">();
export function partileriUnut(): void { durum.clear(); }

const zaman = (z: string): string => new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(z));
const belgeBaglantisi = (b: SonParti["belgeler"][number]): string =>
  `<a href="/cizimler/belge/${b.id}" target="_blank" rel="noopener">${esc(b.ad)}${b.harf ? ` (${esc(b.harf)})` : ""}</a>`;

function tablo(liste: SonParti[]): string {
  if (!liste.length) return '<div class="panel-b small muted">Bu malzemenin stokta tedarikçi partisi yok. Sertifika mal kabulde partiye girilir.</div>';
  return `<div class="tw"><table class="rt"><thead><tr><th>Kabul</th><th>Lot no</th><th>Tedarikçi parti no</th><th>Döküm no</th><th>Sertifika no</th><th>Sertifika belgesi</th></tr></thead><tbody>${liste.map(p => `<tr>
    <td class="num">${zaman(p.kayitZamani)}</td><td class="num">${esc(p.lotNo)}</td><td class="num">${p.tedarikciPartiNo ? esc(p.tedarikciPartiNo) : "–"}</td><td class="num">${p.dokumNo ? esc(p.dokumNo) : "–"}</td>
    <td class="num">${p.sertifikaNo ? esc(p.sertifikaNo) : '<span class="flag warn">yok</span>'}</td>
    <td>${p.belgeler.length ? p.belgeler.map(belgeBaglantisi).join("<br>") : '<span class="muted">eklenmedi</span>'}</td></tr>`).join("")}</tbody></table></div>`;
}

export function partilerPaneli(malzemeNo: number | undefined): string {
  const baslik = '<div class="panel-h"><h2>Son partiler ve sertifikalar</h2><span class="sub">stoktaki tedarikçi partileri, yeniden eskiye</span></div>';
  if (malzemeNo === undefined) return `<section class="panel" data-sa-partiler>${baslik}<div class="panel-b small muted">Katalog kalemi malzeme kartına bağlı değil.</div></section>`;
  const d = durum.get(malzemeNo);
  if (d === undefined) {
    durum.set(malzemeNo, "yukleniyor");
    void backend.malzemePartileri(malzemeNo).then(l => { durum.set(malzemeNo, l); scheduleRender(); });
  }
  const govde = d === undefined || d === "yukleniyor" ? '<div class="panel-b small muted">Yükleniyor…</div>'
    : d === null ? '<div class="panel-b small muted">Partiler okunamadı. Sayfayı yeniden açın.</div>' : tablo(d);
  return `<section class="panel" data-sa-partiler>${baslik}${govde}</section>`;
}
