// 3696: onaylayan kararı değiştirmez; kalem başına karşı teklif seçip gerekçesiyle geri gönderir (ret kaydı + öneri), talep değerlendirmeye döner.
import { evaluate, itemCost, supName } from "./calc.ts";
import type { Approval, PurchaseRequest } from "./tipler.ts";
import { kalemAtamasi } from "./kalem-kalem.ts";
import { esc, money } from "./util.ts";

/** Değerlendirmedeki talepte, son kararın reddi öneri taşıyorsa o kayıt. */
export function sonOneri(r: PurchaseRequest): Approval | null {
  const son = (r.award?.approvals ?? []).at(-1);
  return r.status === "eval" && son?.decision === "rejected" && son.oneri ? son : null;
}

/** Karşı öneri penceresi: her kalem için seçili teklif (bugünkü karar önseçili) ve zorunlu gerekçe. */
export function oneriPenceresiHTML(r: PurchaseRequest): string {
  const ev = evaluate(r), atama = kalemAtamasi(r, ev);
  const satirlar = (r.items ?? []).map((it) => {
    const secenek = ev.elig.filter((x) => itemCost(x, it) !== null);
    return `<tr><td class="lead"><b>${esc(it.name)}</b></td><td data-l="Teklif"><select data-oneri-kalem="${it.id}" aria-label="${esc(it.name)} için önerilen teklif">${secenek.map((x) => `<option value="${x.q.id}"${atama[it.id] === x.q.id ? " selected" : ""}>${esc(supName(x.q))}, ${money(itemCost(x, it))}</option>`).join("")}</select></td></tr>`;
  });
  return `<div class="mh"><h2>Öneriyle geri gönder</h2></div><div class="mb stack"><p class="small muted">${esc(r.no)}. Karar değişmez; seçtiğiniz teklifler satın almaya öneri olarak gider, talep değerlendirmeye döner ve tüm onaylar sıfırlanır.</p>
    <div class="tw"><table class="itbl rt"><thead><tr><th>Kalem</th><th>Önerilen teklif</th></tr></thead><tbody>${satirlar.join("")}</tbody></table></div>
    <label class="f"><span>Gerekçe <small>— zorunlu</small></span><textarea id="oy-oneri-gerekce" rows="3" maxlength="2000" placeholder="Örn. ikinci tedarikçi vade ve termin olarak daha uygun"></textarea></label></div>
    <div class="mf"><button class="btn" data-act="close">Vazgeç</button><button class="btn bad" data-act="oneri-gonder">Öneriyle geri gönder</button></div>`;
}

/** Karar ekranının üstündeki "Onaylayanın önerisi" şeridi. */
export function oneriSeridiHTML(r: PurchaseRequest, gizli: ReadonlySet<string>): string {
  const o = sonOneri(r);
  if (!o?.oneri || gizli.has(o.id)) return "";
  const satirlar = Object.entries(o.oneri.atama).flatMap(([kalemId, teklifId]) => {
    const it = (r.items ?? []).find((x) => x.id === kalemId), q = r.quotes.find((x) => x.id === teklifId);
    return it && q ? [`<li><b>${esc(it.name)}</b>: ${esc(supName(q))}</li>`] : [];
  });
  return `<section class="callout sa-oy-oneri" data-sa-onay-onerisi><div class="row"><b>Onaylayanın önerisi</b><span class="small muted">${esc(o.name || "Onaylayan")}</span></div>
    <p>${esc(o.oneri.gerekce)}</p><ul>${satirlar.join("")}</ul>
    <div class="row"><button class="btn sm primary" data-act="kr-oneri-uygula" data-oneri="${o.id}">Öneriyi uygula</button><button class="btn sm ghost" data-act="kr-oneri-yok" data-oneri="${o.id}">Yok say</button><span class="xs muted">Uygulama matrisi doldurur; göndermek sizin kararınızdır.</span></div></section>`;
}
