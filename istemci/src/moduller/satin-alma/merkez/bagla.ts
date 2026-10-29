/**
 * Satın Alma Merkezi'ni bir TMI sayfasının içerik alanına bağlar (kullanıcı kararı, sürüm 6). İkinci menüyü kabuk çizer (şartname);
 * hangi ekranın açılacağı ikinci menü maddesinin rotasından gelir. Durum modül düzeyinde tek kopyadır: ekran yeniden bağlanınca eldeki
 * hâl hemen çizilir, sonra sunucudan yenilenir; başka sayfada (ana sayfa, Taleplerim) açılan talep böylece satın almaya düşer. İçeride sayfa değişince adres o sayfanın madde yoluna güncellenir (kabuk etkin maddeyi adresten bulur).
 */
import "./styles.css";
import "./yerlesim.css";
import { setRole, type Role } from "./roles.ts";
import { UNDO, V, canWrite, init, yenile, setRenderer, setToaster, setUndoUI, UNDO_MS, type Page } from "./store.ts";
import { go, registerUIHooks, requestModal, toast } from "./ui.ts";
import { esc } from "./util.ts";
import { onAfterRender, render } from "./views.ts";

// Prototipin sayfa iskeleti (index.html gövdesi) kendi menüsü olmadan; pencere, bildirim ve geri al alanları da kökün içinde.
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
      <button class="btn primary" data-act="new-request">Yeni talep</button>
    </div>
    <div id="main" class="sa-icerik"><p class="loading">Veriler yükleniyor…</p></div>
  </div>
</div>
<div id="modal-root"></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="undo" id="undo" role="status" aria-live="polite" hidden></div>`;

export type MerkezSayfasi = Page;
export interface BaglamaSecenegi { rol: Role; sayfa: MerkezSayfasi; yol: string; git: (yol: string) => void }

// Prototip sayfası → ikinci menü yolu. Ayrıntı sayfası ait olduğu listenin yolundadır; talep ayrıntısı geldiği yolda kalır.
const YOLLAR: Partial<Record<Page, string>> = {
  requests: "/satin-alma/talepler", materials: "/satin-alma/malzemeler", material: "/satin-alma/malzemeler",
  suppliers: "/satin-alma/tedarikciler", supplier: "/satin-alma/tedarikciler", reports: "/satin-alma/raporlar", settings: "/ayarlar",
};
// Talep edenin ekranı şimdilik menüde yok (kullanıcı kararı); rol yine prototipte durur, iş kutusu yoluna düşer.
const ANA_YOL: Record<Role, string> = { buyer: "/satin-alma", requester: "/satin-alma", approver: "/satin-alma/onaylar" };
export const sayfaYolu = (sayfa: Page, rol: Role): string | null => (sayfa === "dash" ? ANA_YOL[rol] : YOLLAR[sayfa] ?? null);

// Açık ekran başka kişinin (Taleplerim, ana sayfa) açtığı talebi görsün diye sunucudan yenilenir. Yenileme ekranı yeniden çizer;
// kullanıcı yazarken, pencere açıkken ya da geri al beklerken yapılmaz, girdisi silinmez.
export const YENILEME_MS = 30_000;
export function yenilenebilirMi(kok: HTMLElement): boolean {
  if (document.visibilityState === "hidden" || UNDO.pending) return false;
  if (kok.querySelector("#modal-root")?.childElementCount) return false;
  const odak = document.activeElement;
  return !(odak instanceof HTMLElement && kok.contains(odak) && odak.matches("input, textarea, select, [contenteditable]"));
}

let kancalar = false;
let ilkYukleme: Promise<void> | null = null;
let etkin: BaglamaSecenegi | null = null;

function kancalariKur(): void {
  if (kancalar) return;
  kancalar = true;
  registerUIHooks();
  // İçeride sayfa değişince adres madde yoluna güncellenir; madde yolu olmayan sayfa (talep ayrıntısı) adresi değiştirmez.
  onAfterRender(() => {
    if (!etkin) return;
    const y = sayfaYolu(V.page, etkin.rol);
    if (y !== null && y !== etkin.yol) etkin.git(y);
  });
  // Yalnız modül sayfada bağlıyken çizilir: açılış verisi başka bir TMI sayfasındayken gelirse çizim atlanır.
  setRenderer(() => { if (document.querySelector("[data-sa-merkez]")) render(); });
  setToaster(toast);
  setUndoUI({
    show(label) {
      const el = document.getElementById("undo");
      if (!el) return;
      el.innerHTML = `<span>${esc(label)}</span><button class="undo-btn" data-act="undo">Geri al</button><i class="ubar" style="animation-duration:${UNDO_MS}ms"></i>`;
      el.hidden = false;
    },
    hide() {
      const el = document.getElementById("undo");
      if (el) { el.hidden = true; el.innerHTML = ""; }
    },
  });
}

export function merkeziBagla(kok: HTMLElement, secenek: BaglamaSecenegi): () => void {
  kok.innerHTML = ISKELET;
  kok.dataset.saMerkez = "1";
  // İçeriden gelinen ayrıntı sayfası (aynı madde yolunda) korunur; değilse maddenin ekranı açılır.
  if (sayfaYolu(V.page, secenek.rol) !== secenek.yol) { V.page = secenek.sayfa; V.id = null; V.tab = null; }
  setRole(secenek.rol);
  etkin = secenek;
  kancalariKur();
  if (!ilkYukleme) ilkYukleme = init(); else { render(); void yenile(); }
  const tazele = () => { if (yenilenebilirMi(kok)) void yenile(); };
  const zamanlayici = setInterval(tazele, YENILEME_MS);
  const gorunce = () => { if (document.visibilityState === "visible") tazele(); };
  document.addEventListener("visibilitychange", gorunce);
  return () => {
    clearInterval(zamanlayici);
    document.removeEventListener("visibilitychange", gorunce);
    if (etkin === secenek) etkin = null; kok.innerHTML = ""; delete kok.dataset.saMerkez;
  };
}

// Ctrl K sonucu ya da komutu (1237) ekranı adresle açar: talep ayrıntısı (bölümüyle) ya da boş yeni talep penceresi.
// Yazma pencerenin kendi ucundadır; açılış yetki vermez, yazamayan kişide pencere açılmaz.
export interface MerkezAcilisi { talep: string | null; bolum: string | null; yeniTalep: boolean }
export const ACILIS_BOLUMLERI = ["items", "quotes", "compare", "approval", "order", "delivery"] as const;

export function acilisOku(adres: URLSearchParams): MerkezAcilisi | null {
  const talep = adres.get("talep");
  const bolum = adres.get("bolum");
  const yeniTalep = adres.get("yeni") === "talep";
  if (!talep && !yeniTalep) return null;
  return { talep: talep || null, bolum: bolum && (ACILIS_BOLUMLERI as readonly string[]).includes(bolum) ? bolum : null, yeniTalep };
}

export function merkezAc(acilis: MerkezAcilisi): void {
  const secenek = etkin;
  if (!secenek) return;
  if (acilis.talep) go("request", acilis.talep, acilis.bolum);
  if (acilis.yeniTalep) void (ilkYukleme ?? Promise.resolve()).then(() => { if (etkin === secenek && canWrite()) requestModal(null); }, () => {});
}
