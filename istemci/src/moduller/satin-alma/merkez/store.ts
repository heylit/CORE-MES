/**
 * Ortak durum katmanı: uygulama durumu, hesap önbelleği, iyimser kayıt ve geri alma.
 * Verinin nereye yazıldığını bilmez; bunu "./transport" modülü yapar:
 *   - transport.ts: PostgreSQL arkasındaki REST API (sunucu sürümü)
 *   - transport.artifact.ts: claude.ai önizlemesinin kendi veritabanı (önizleme derlemesinde bu dosya seçilir)
 */
import type { AppUser, ExportFile, LogEntry, MalzemeSecenegi, Material, SiparisFaturasi, PurchaseRequest, Settings, Supplier } from "./tipler.ts";
import type { SiparisBelgesi, SiparisBelgesiYazimi } from "#paylasilan/sozlesme/satin-alma.ts";
import type { SiparisIrsaliyesi, SonParti } from "#paylasilan/sozlesme/stok.ts";
import type { OdemePlaniSatiri, SiparisTakibiCevabi } from "#paylasilan/sozlesme/satin-alma.ts";
import { DEFAULT_SETTINGS } from "./constants.ts";
import { clone, uid } from "./util.ts";
import { transport } from "./tasiyici.ts";

/* ---------------- durum ---------------- */
export interface State {
  requests: Record<string, PurchaseRequest>;
  suppliers: Record<string, Supplier>;
  materials: Record<string, Material>;
  settings: Settings | null;
  users: Record<string, AppUser>;
  me: AppUser | null;
  ready: boolean;
  online: boolean;
  /** her veri değişikliğinde artar; hesap önbelleği buna bakar */
  ver: number;
}
// Henüz satın alma tedarikçisi olmayan aktif tedarikçi firma kartları; teklif seçicilerinde ayrı grupta çıkar.
export const FIRMA_KARTLARI: { id: string; ad: string }[] = [];
export const S: State = { requests: {}, suppliers: {}, materials: {}, settings: null, users: {}, me: null, ready: false, online: true, ver: 0 };

export type Page = "dash" | "requests" | "request" | "materials" | "material" | "suppliers" | "supplier" | "reports" | "settings";
export interface ViewState {
  page: Page; id: string | null; tab: string | null;
  q: string; status: string; view: "list" | "board"; prio: string; dept: string;
  mq: string; mcat: string; sq: string; period: "ytd" | "12m" | "all";
  sort: string; dir: 1 | -1;
}
export const V: ViewState = { page: "dash", id: null, tab: null, q: "", status: "open", view: "list", prio: "", dept: "", mq: "", mcat: "", sq: "", period: "12m", sort: "", dir: 1 };

export function settings(): Settings {
  const s = S.settings ?? DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...s, currencies: { ...DEFAULT_SETTINGS.currencies, ...s.currencies }, weights: { ...DEFAULT_SETTINGS.weights, ...s.weights } };
}

/* ---------------- olay kancaları (döngüsel içe aktarmayı önler) ---------------- */
let renderFn: () => void = () => undefined;
let toastFn: (m: string) => void = (m) => console.warn(m);
export function setRenderer(fn: () => void): void { renderFn = fn; }
export function setToaster(fn: (m: string) => void): void { toastFn = fn; }
export const notify = (m: string): void => toastFn(m);

let rq = false;
export function scheduleRender(): void {
  if (rq) return;
  rq = true;
  requestAnimationFrame(() => { rq = false; renderFn(); });
}

/* ---------------- hesap önbelleği ---------------- */
const MEMO: { ver: number; m: Map<string, unknown> } = { ver: -1, m: new Map() };
export function memo<T>(key: string, fn: () => T): T {
  if (MEMO.ver !== S.ver) { MEMO.ver = S.ver; MEMO.m.clear(); }
  if (!MEMO.m.has(key)) MEMO.m.set(key, fn());
  return MEMO.m.get(key) as T;
}
export function bump(): void { S.ver++; }

/* ---------------- kayıt ---------------- */
export type Coll = "requests" | "suppliers" | "materials";
export type Entity = PurchaseRequest | Supplier | Material;

/** Durumu yerelde günceller ve yeniden çizer (sunucudan ya da kullanıcıdan gelen değişiklik) */
export function applyLocal(coll: Coll | "settings", id: string, data: Entity | Settings | null): void {
  if (coll === "settings") S.settings = data as Settings;
  else if (data === null) delete S[coll][id];
  else (S[coll] as Record<string, Entity>)[id] = data as Entity;
  S.ver++;
  scheduleRender();
}

/** İyimser kayıt: ekran hemen güncellenir, taşıyıcı arka planda yazar */
export function persist(coll: "settings", id: "main", data: Settings): void;
export function persist(coll: Coll, id: string, data: Entity | null): void;
export function persist(coll: Coll | "settings", id: string, data: Entity | Settings | null): void {
  // aynı kayıtta bekleyen geri alınabilir değişiklik varsa: yeni yazım onu zaten içerir
  const u = UNDO.pending;
  if (u && u.coll === coll && u.id === id) { clearTimeout(u.timer); UNDO.pending = null; undoUI.hide(); }
  applyLocal(coll, id, data);
  transport.write(coll, id, data);
}

/* ---------------- geri al ----------------
   Silme ve benzeri işlemler ekrana hemen yansır; kalıcı yazım UNDO_MS kadar bekletilir.
   Geri alınırsa hiçbir şey yazılmaz (kayıt ve geçmişi bozulmadan kalır).
   Süre dolunca, başka bir geri alınabilir işlem yapılınca ya da sayfa kapanırken yazım gönderilir. */
export const UNDO_MS = 8000;
interface UndoEntry { coll: Coll; id: string; data: Entity | null; old: Entity | null; label: string; onUndo: (() => void) | null; timer: ReturnType<typeof setTimeout> }
export const UNDO: { pending: UndoEntry | null } = { pending: null };
let undoUI: { show: (label: string) => void; hide: () => void } = { show: () => undefined, hide: () => undefined };
export function setUndoUI(ui: { show: (label: string) => void; hide: () => void }): void { undoUI = ui; }

export function persistUndoable(coll: Coll, id: string, data: Entity | null, label: string, onUndo?: (() => void) | null): void {
  flushUndo();
  const cur = S[coll][id];
  const entry: UndoEntry = { coll, id, data, old: cur ? clone(cur) : null, label, onUndo: onUndo ?? null, timer: setTimeout(() => commitUndo(entry), UNDO_MS) };
  applyLocal(coll, id, data);
  UNDO.pending = entry;
  undoUI.show(label);
}
function commitUndo(u: UndoEntry): void {
  if (UNDO.pending !== u) return;
  UNDO.pending = null; undoUI.hide();
  transport.write(u.coll, u.id, u.data);
}
/** Bekleyen yazımı hemen gönderir; sayfa kapanırken taşıyıcı tarayıcının kesmeyeceği yolla gönderir */
export function flushUndo(unloading = false): void {
  const u = UNDO.pending;
  if (!u) return;
  clearTimeout(u.timer); UNDO.pending = null; undoUI.hide();
  if (unloading) transport.writeOnUnload(u.coll, u.id, u.data);
  else transport.write(u.coll, u.id, u.data);
}
export function undoLast(): void {
  const u = UNDO.pending;
  if (!u) return;
  clearTimeout(u.timer); UNDO.pending = null; undoUI.hide();
  applyLocal(u.coll, u.id, u.old); // hiç yazılmadı; yalnızca ekranı eski hâline döndür
  if (u.onUndo) u.onUndo();
  notify("Geri alındı");
}
window.addEventListener("pagehide", () => flushUndo(true));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushUndo(true); });

/* ---------------- kayıt yardımcıları ---------------- */
export function logTo(r: PurchaseRequest, t: string): void {
  r.log = r.log ?? [];
  const e: LogEntry = { id: uid(), at: Date.now(), by: S.me?.id ?? "", t };
  r.log.push(e);
}
export function saveRequest(r: PurchaseRequest, logText?: string): void {
  if (logText) logTo(r, logText);
  r.updatedAt = Date.now();
  persist("requests", r.id, r);
}
export function saveRequestUndoable(r: PurchaseRequest, logText: string, label: string): void {
  logTo(r, logText);
  r.updatedAt = Date.now();
  persistUndoable("requests", r.id, r, label);
}
export const saveSupplier = (s: Supplier): void => { s.updatedAt = Date.now(); persist("suppliers", s.id, s); };
export const saveMaterial = (m: Material): void => { m.updatedAt = Date.now(); persist("materials", m.id, m); };
export function canWrite(): boolean {
  if (transport.canWrite()) return true;
  notify("Salt okunur görünümdesiniz; değişiklik yapılamaz.");
  return false;
}

export function nameOf(id: string | undefined | null): string {
  if (!id) return "";
  if (S.me && id === S.me.id) return "Siz";
  return S.users[id]?.name || "Bir ekip üyesi";
}

/* ---------------- taşıyıcıya özgü işlemler ---------------- */
export interface ImportResult { materials: number; suppliers: number; requests: number; skipped: string[] }
export interface Backend {
  /** kenar çubuğunda bağlantı durumu */
  statusHTML(): string;
  /** TCMB kurları alınabiliyor mu (önizlemede dış siteye erişim yok) */
  tcmb: boolean;
  exportData(): Promise<void>;
  importData(d: ExportFile): Promise<ImportResult>;
  deleteSamples(): Promise<void>;
  fetchTcmb(): Promise<{ date: string; rates: Record<string, number> }>;
  /** TMI: tedarikçi eklerken finanstaki firma adla aranır (firma finansta açılır, burada seçilir) */
  firmaAra(metin: string): Promise<{ id: string; ad: string; tedarikci: boolean }[]>;
  /** Satın alma da firma açar: kart finansın ortak firma listesine tedarikçi olarak girer (kopya tutulmaz). Kimlik pencere başınadır. */
  firmaEkle(kimlik: string, g: { ad: string; vergiNo: string; il: string; telefon: string; ePosta: string }): Promise<{ id: string; ad: string }>;
  /** SA2: katalog kalemi eklerken malzeme kartı adla ya da kodla aranır (kart "Malzeme Kartları"nda açılır) */
  malzemeAra(metin: string): Promise<MalzemeSecenegi[]>;
  /** Borç 36: siparişteki kalem onay yetkisiyle, gerekçeyle değişir; sunucu hareket yazar. Başarısızsa ileti gösterilir, false döner. */
  siparisKalemiDegistir(talepId: string, kalemId: string, miktar: number, birim: string, gerekce: string): Promise<boolean>;
  /** #205 S2 b: Logo'daki siparişin kalanı gerekçeyle kapatılır; sunucu hareket yazar. Başarısızsa ileti gösterilir, false döner. */
  siparisKapat(talepId: string, teklifId: string, gerekce: string): Promise<boolean>;
  /** Kart #1310: teslim yöntemi; "biz alacağız" siparişi sevkiyatta alım olarak bekletir. Başarısızsa ileti gösterilir, false döner. */
  teslimYontemi(talepId: string, teslimYontemi: 'firma_getirir' | 'biz_alacagiz' | null): Promise<boolean>;
  /** D6 b: siparişin tedarikçisinin alış faturaları (fatura finansta girilir). Başarısızsa ileti gösterilir, null döner. */
  siparisFaturalari(talepId: string, teklifId: string): Promise<SiparisFaturasi[] | null>;
  /** D6 b: alış faturası siparişe bağlanır ya da bağı kaldırılır; sunucu geçmişe yazar. Güncel listeyi ya da null döner. */
  siparisFaturasiBagla(talepId: string, teklifId: string, belgeId: number, bagla: boolean): Promise<SiparisFaturasi[] | null>;
  /** Sipariş satırının sertifika ve raporları (belge Çizimler'de). Başarısızsa ileti gösterilir, null döner. */
  siparisBelgeleri(satirId: number): Promise<SiparisBelgesi[] | null>;
  /** Yüklenmiş dosya (özet) satıra sertifika ya da rapor olarak bağlanır; aynı kimlikle yinelenen yükleme ikinci belge açmaz. */
  siparisBelgesiEkle(satirId: number, kimlik: string, g: SiparisBelgesiYazimi): Promise<SiparisBelgesi[] | null>;
  siparisBelgesiKaldir(satirId: number, belgeId: number): Promise<SiparisBelgesi[] | null>;
  /** Hammadde sertifikası partidedir: malzemenin son tedarikçi partileri stoktan okunur. Başarısızsa ileti gösterilir, null döner. */
  malzemePartileri(malzemeNo: number): Promise<SonParti[] | null>;
  /** Kart #1124: siparişlerin ödeme planı ve bağlı faturaları. Başarısızsa ileti gösterilir, null döner. */
  siparisTakibi(talepId: string): Promise<SiparisTakibiCevabi | null>;
  /** Kart #1124: siparişin ödeme planı finansa yazılır; sunucu geçmişe yazar. Güncel takibi ya da null döner. */
  odemePlaniKaydet(talepId: string, teklifId: string, satirlar: OdemePlaniSatiri[]): Promise<SiparisTakibiCevabi | null>;
  /** Kart #1124: sipariş satırlarının stoktaki mal kabul irsaliyeleri. Başarısızsa ileti gösterilir, null döner. */
  siparisIrsaliyeleri(siparisSatirIdler: number[]): Promise<SiparisIrsaliyesi[] | null>;
}
export interface Transport {
  init(): Promise<void>;
  /** Ekran yeniden açılınca sunucudaki güncel hâl alınır; alınamazsa eldeki görünüm kalır. */
  yenile(): Promise<void>;
  write(coll: Coll | "settings", id: string, data: Entity | Settings | null): void;
  writeOnUnload(coll: Coll, id: string, data: Entity | null): void;
  canWrite(): boolean;
  backend: Backend;
}
export const backend: Backend = transport.backend;
export const init = (): Promise<void> => transport.init();
export const yenile = (): Promise<void> => transport.yenile();
