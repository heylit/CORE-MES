/**
 * Satın Alma Merkezi'ni bir TMI sayfasının içerik alanına bağlar (kullanıcı kararı, sürüm 6). İkinci menüyü kabuk çizer (şartname);
 * hangi ekranın açılacağı ikinci menü maddesinin rotasından gelir. Durum modül düzeyinde tek kopyadır: ekran yeniden bağlanınca eldeki
 * hâl hemen çizilir, sonra sunucudan yenilenir; başka sayfada (ana sayfa, Taleplerim) açılan talep böylece satın almaya düşer. İçeride sayfa değişince adres o sayfanın madde yoluna güncellenir (kabuk etkin maddeyi adresten bulur).
 */
import "./styles.css";
import "./yerlesim.css";
import { setOnaylayabilir, setRole, type Role } from "./roles.ts";
import { UNDO, V, init, yenile, setRenderer, setToaster, setUndoUI, undoLast, type Page } from "./store.ts";
import { AYRINTI, bildirimYoluKur, bildirimYoluOku, go, registerUIHooks, toast, type BildirimYolu } from "./ui.ts";
import { onAfterRender, render } from "./views.ts";
import { setBasamakYazar, setRoller } from "./memory.ts";
import { api } from "../../../ortak/veri/api.ts";

// Prototipin sayfa iskeleti (index.html gövdesi) kendi menüsü olmadan; bildirim ve geri al ortak bildirimdedir.
// Pencere kökü ortak pencere gibi sayfanın gövdesine konur: kabuğun üst çubuğu ve şeritleri perdenin altında kalır. Kök
// prototipin stil kökünü (sa-kok) ve merkez işaretini taşır; içerideki tıklama ve tuşlar merkezin olay yollarından geçer.
const ISKELET = `<div class="app">
  <div class="mainwrap">
    <div class="topbar">
      <div class="gsearch">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" id="gsearch" placeholder="Talep, malzeme veya tedarikçi ara" aria-label="Satın almada ara" autocomplete="off">
        <div class="gres" id="gres" hidden></div>
      </div>
      <div class="market" id="market" aria-label="Kurlar ve faiz"></div>
      <span class="spacer"></span>
      <span class="flag warn" id="kayit-uyari" role="status" hidden></span>
    </div>
    <div id="sa-ekran"></div>
    <div id="main" class="sa-icerik"><p class="loading">Veriler yükleniyor…</p></div>
  </div>
</div>`;

export type MerkezSayfasi = Page;
// git: adresi değiştirir; yerine true ise tarayıcı geçmişine yeni kayıt eklemez.
export interface BaglamaSecenegi { rol: Role; sayfa: MerkezSayfasi; yol: string; git: (yol: string, yerine?: boolean) => void; onaylayabilir?: boolean; basamakYazar?: boolean; bildirim?: BildirimYolu }

// Prototip sayfası → ikinci menü yolu. Ayrıntı sayfası ait olduğu listenin yolundadır; talep ayrıntısı geldiği yolda kalır.
const YOLLAR: Partial<Record<Page, string>> = {
  requests: "/satin-alma/talepler", orders: "/satin-alma/siparisler", materials: "/satin-alma/malzemeler", material: "/satin-alma/malzemeler",
  suppliers: "/satin-alma/tedarikciler", supplier: "/satin-alma/tedarikciler", reports: "/satin-alma/raporlar", settings: "/ayarlar",
};
// Talep edenin ekranı şimdilik menüde yok (kullanıcı kararı); rol yine prototipte durur, iş kutusu yoluna düşer.
const ANA_YOL: Record<Role, string> = { buyer: "/satin-alma", requester: "/satin-alma", approver: "/satin-alma/onaylar" };
export const sayfaYolu = (sayfa: Page, rol: Role): string | null => (sayfa === "dash" ? ANA_YOL[rol] : YOLLAR[sayfa] ?? null);

// Talep ayrıntısı geldiği madde yolunda ?talep= ile durur (2412): tarayıcının geri tuşu ayrıntıdan listeye döner, ileri tuşu yeniden açar.
export function hedefAdres(sayfa: Page, id: string | null, rol: Role, yol: string): string | null {
  if (sayfa === "request" && id) return `${yol}?talep=${encodeURIComponent(id)}`;
  return sayfaYolu(sayfa, rol) ?? yol;
}
const simdikiAdres = (): string => window.location.pathname + window.location.search;

// Açık ekran başka kişinin (Taleplerim, ana sayfa) açtığı talebi görsün diye sunucudan yenilenir. Yenileme ekranı yeniden çizer;
// kullanıcı yazarken, pencere açıkken ya da geri al beklerken yapılmaz, girdisi silinmez.
export const YENILEME_MS = 30_000;
export function yenilenebilirMi(kok: HTMLElement): boolean {
  if (document.visibilityState === "hidden" || UNDO.pending) return false;
  if (document.getElementById("modal-root")?.childElementCount) return false;
  const odak = document.activeElement;
  return !(odak instanceof HTMLElement && kok.contains(odak) && odak.matches("input, textarea, select, [contenteditable]"));
}

let kancalar = false;
let ilkYukleme: Promise<void> | null = null;
let etkin: BaglamaSecenegi | null = null;
// Ayrıntıyı merkezin kendisi açtıysa (listeden, iş kutusundan) "geri" düğmesi tarayıcı geçmişinde bir adım döner; adresle gelindiyse listeye gider.
let icerdenAcilan: string | null = null;

function kancalariKur(): void {
  if (kancalar) return;
  kancalar = true;
  registerUIHooks();
  // İçeride sayfa değişince adres güncellenir: liste sayfası madde yoluna, talep ayrıntısı ?talep= ile. Aynı talebin adresi
  // (Ctrl K'nın bölümlü adresi) geçmişe yeni kayıt eklemeden düzeltilir.
  onAfterRender(() => {
    if (!etkin) return;
    const y = hedefAdres(V.page, V.id, etkin.rol, etkin.yol);
    const simdi = simdikiAdres();
    if (y === null || y === simdi) return;
    const oncekiTalep = new URLSearchParams(window.location.search).get("talep");
    const ayniTalep = V.page === "request" && oncekiTalep === V.id;
    // Talepten talebe geçişte geri tuşu önceki talebe değil listeye dönmeli: "Taleplere dön" yazıyor.
    if (V.page === "request" && !ayniTalep) icerdenAcilan = oncekiTalep === null ? V.id : null;
    etkin.git(y, ayniTalep);
  });
  // Yalnız modül sayfada bağlıyken çizilir: açılış verisi başka bir TMI sayfasındayken gelirse çizim atlanır.
  setRenderer(() => { if (document.querySelector("[data-sa-merkez]")) render(); });
  setToaster(toast);
  // Geri al, "Geri al" düğmeli ortak bildirimdir; bildirimin süresi bekletme süresiyle (UNDO_MS) aynıdır.
  let geriAlBildirimi: number | null = null;
  setUndoUI({
    show(label) {
      const yol = bildirimYoluOku();
      if (geriAlBildirimi !== null) yol?.kaldir(geriAlBildirimi);
      geriAlBildirimi = yol ? yol.bildir("tamam", label, { eylem: { etiket: "Geri al", yap: undoLast } }) : null;
    },
    hide() {
      if (geriAlBildirimi !== null) bildirimYoluOku()?.kaldir(geriAlBildirimi);
      geriAlBildirimi = null;
    },
  });
}

export function merkeziBagla(kok: HTMLElement, secenek: BaglamaSecenegi): () => void {
  kok.innerHTML = ISKELET;
  kok.dataset.saMerkez = "1";
  document.getElementById("modal-root")?.remove();
  const pencereKoku = document.createElement("div");
  pencereKoku.id = "modal-root";
  pencereKoku.className = "sa-kok sa-pencere-kok";
  pencereKoku.dataset.saMerkez = "1";
  document.body.append(pencereKoku);
  // Adreste talep varsa ayrıntı açılır (yenileme, geri ve ileri tuşu); yoksa içeriden gelinen ayrıntı (aynı madde yolunda) korunur,
  // değilse maddenin ekranı açılır.
  const adrestekiTalep = new URLSearchParams(window.location.search).get("talep");
  if (adrestekiTalep) { if (V.page !== "request" || V.id !== adrestekiTalep) { V.page = "request"; V.id = adrestekiTalep; V.tab = null; } }
  else if (sayfaYolu(V.page, secenek.rol) !== secenek.yol) { V.page = secenek.sayfa; V.id = null; V.tab = null; }
  setRole(secenek.rol);
  setOnaylayabilir(secenek.onaylayabilir ?? false);
  setBasamakYazar(secenek.basamakYazar ?? false);
  // Basamağa rol seçimi yalnız yöneticide; rol listesi kişilerin ucundan (yönetici kisiler.oku taşır). Gelmezse seçimde yalnız kayıtlı rol görünür.
  if (secenek.basamakYazar && secenek.sayfa === "settings") void api.get<{ roller: { id: number; ad: string }[] }>("/roller").then((c) => { setRoller(c.roller); render(); }).catch(() => undefined);
  etkin = secenek;
  AYRINTI.donus = secenek.sayfa;
  AYRINTI.geri = ayrintidanDon;
  bildirimYoluKur(secenek.bildirim ?? null);
  kancalariKur();
  if (!ilkYukleme) ilkYukleme = init(); else { render(); void yenile(); }
  const tazele = () => { if (yenilenebilirMi(kok)) void yenile(); };
  const zamanlayici = setInterval(tazele, YENILEME_MS);
  const gorunce = () => { if (document.visibilityState === "visible") tazele(); };
  document.addEventListener("visibilitychange", gorunce);
  return () => {
    clearInterval(zamanlayici);
    document.removeEventListener("visibilitychange", gorunce);
    if (etkin === secenek) { etkin = null; icerdenAcilan = null; bildirimYoluKur(null); } kok.innerHTML = ""; delete kok.dataset.saMerkez; pencereKoku.remove();
  };
}

// Ctrl K sonucu (1237) ekranı adresle açar: talep ayrıntısı (bölümüyle). Yeni talep merkezde açılmaz, Taleplerim'dedir (2405 a).
export interface MerkezAcilisi { talep: string; bolum: string | null }
export const ACILIS_BOLUMLERI = ["items", "quotes", "compare", "approval", "order", "delivery"] as const;

export function acilisOku(adres: URLSearchParams): MerkezAcilisi | null {
  const talep = adres.get("talep");
  const bolum = adres.get("bolum");
  if (!talep) return null;
  return { talep, bolum: bolum && (ACILIS_BOLUMLERI as readonly string[]).includes(bolum) ? bolum : null };
}

export function merkezAc(acilis: MerkezAcilisi): void {
  if (!etkin) return;
  if (V.page === "request" && V.id === acilis.talep && !acilis.bolum) return;
  go("request", acilis.talep, acilis.bolum);
}

// Adres değişti (tarayıcının geri ya da ileri tuşu): adreste talep yoksa açık ayrıntı kapanır, maddenin ekranına dönülür.
export function merkezAdresi(acilis: MerkezAcilisi | null): void {
  if (!etkin) return;
  if (acilis) { merkezAc(acilis); return; }
  if (V.page === "request") { icerdenAcilan = null; go(etkin.sayfa); }
}

// Ayrıntının "geri" düğmesi: içeriden açıldıysa tarayıcı geçmişinde geri (liste kaydırması ve süzgeci yerinde kalır), değilse listeye.
export function ayrintidanDon(): void {
  if (!etkin) return;
  if (icerdenAcilan !== null && icerdenAcilan === V.id) { icerdenAcilan = null; window.history.back(); return; }
  go(etkin.sayfa);
}
