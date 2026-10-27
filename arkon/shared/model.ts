/* Arkon MES · ortak veri modeli
   Arayüz (web/) ve sunucu (server/) aynı tipleri kullanır. Zaman alanları epoch milisaniyedir (number). */

export type Ms = number;
export type Id = string;

/* ── roller ve yetkiler ── */
export type Role = 'admin' | 'plan' | 'prep' | 'quality' | 'lead' | 'maint' | 'operator';
export type Perm =
  | 'page.op' | 'page.board' | 'page.plan' | 'page.prep' | 'page.quality' | 'page.maint' | 'page.report' | 'page.draw'
  | 'prod.run' | 'prod.fix' | 'prod.station' | 'prod.ack' | 'logi.req' | 'logi.handle'
  | 'plan.edit' | 'down.edit'
  | 'pkg.edit' | 'pkg.publish' | 'pkg.del' | 'pkg.approve'
  | 'q.meas' | 'q.decide' | 'q.report' | 'gauge.edit'
  | 'maint.work' | 'maint.plan'
  | 'adm.users' | 'adm.plant' | 'adm.shifts' | 'adm.backup' | 'adm.demo' | 'adm.reasons' | 'adm.audit';
/** rol → izin verilen işlemler · `_known`: matris kaydedildiğinde var olan işlemler (sonradan eklenenler varsayılandan gelir) */
export type PermMatrix = Partial<Record<Exclude<Role, 'admin'>, Perm[]>> & { _known?: Perm[] };

export interface User { id: Id; name: string; role: Role; wcs?: Id[]; st?: Id | null; sts?: Id[]; active?: boolean; created_at?: string }
export interface Session { token?: string; user: User; srv?: string }

/* ── tesis yapısı: İş merkezi › İstasyon › Makine ── */
export type OpType = 'cnc' | 'kalite' | 'depo' | 'mark' | 'boya' | 'montaj';
export type MachineConn = '' | 'focas' | 'opcua' | 'mtc' | 'modbus' | 'io';
export interface WorkCenter { id: Id; name: string; note?: string; active?: boolean }
/** tmi: TMI'deki sayısal istasyon kimliği (sunucu kipinde; 3B model küçük resmi bununla okunur) */
export interface Station { id: Id; name: string; wc: Id; t: OpType; active?: boolean; tmi?: number }
export interface Machine { id: Id; name: string; kind?: string; make?: string; serial?: string; st: Id; conn?: MachineConn; addr?: string; active?: boolean }
export interface Plant { wcs: WorkCenter[]; sts: Station[]; mcs: Machine[] }

/* ── çalışma düzeni ── */
export interface ShiftBreak { at: string; min: number }
export interface Shift { name: string; start: string; end: string; breaks: ShiftBreak[] }
export interface Policy { shiftLogout: boolean; idleLock: number; callEsc: number; approval: boolean; autoCall: boolean; scrapAsk: boolean; /** değişiklikte ara onay sor (Terminal kural 1/5) */ fpRestart?: boolean }
export type CallTeam = 'bakim' | 'kalite' | 'malzeme' | 'amir' | 'ayarci';
/** duruş nedeni · cat: 'u' plansız (OEE kaybı) · 'p' planlı (planlı süreden düşülür) */
export interface Reason { code: string; l: string; i?: string; cat: 'u' | 'p'; team?: CallTeam; after?: number; active?: boolean; c?: string }
export interface ScrapReason { code: string; l: string; active?: boolean }
export interface AppMode { demo: boolean }

/* ── iş paketi (iş emri + proses paketi) ── */
export type PkgStatus = 'draft' | 'published' | 'review' | 'done';
/** merkez: Çizim Merkezi belge no, merkezOzet: alındığı andaki yayındaki dosyanın özeti (kart #800); yerel yüklemede ikisi de yok */
export interface PkgFile { kind: 'pdf' | 'model' | 'img' | string; name: string; bytes?: Uint8Array; size?: number; key?: string; page?: number; merkez?: number; merkezOzet?: string; [k: string]: unknown }
/** kontrol planı satırı (balon) */
export interface PlanItem {
  id: number; nom: string; tol?: string; min: number; max: number; tool?: string; freq?: string; crit?: boolean;
  m?: 'cmm' | 'man'; gauge?: boolean; kind?: string; x?: number; y?: number; page?: number; file?: string; ar?: number; [k: string]: unknown;
}
export interface Step { id: string; t: string; d?: string; r?: number; on?: number; [k: string]: unknown }
export interface SampleRule { when: 'first' | 'every' | 'time' | 'shift' | 'last'; n?: number; who: ('q' | 'op')[]; items: 'all' | 'crit' | number[]; gate?: boolean }
export interface Approval { ok: boolean; by: string; at: Ms; note?: string; version?: number }
export interface PublishHistory { v: number; rev: string; at: Ms; by: string; ap?: string | null; st?: Id }
export interface Pkg {
  id: Id; no: string; opType: OpType; st: Record<string, any>; partNo: string; part: string; /** emrin projesinin adı (TMI yazar; projesizde ve Arkon paketinde boş) */ proje?: string; rev: string; op: string;
  /** istasyon kodu (eski adıyla "machine") */ machine: Id; /** belirli makine */ mc?: Id;
  target: number; cycle: number; due: string; priority: 'normal' | 'urgent'; material: string; note: string;
  files: PkgFile[]; primary: string | null; plan: PlanItem[]; steps: Step[]; rules?: any; samp?: SampleRule[]; readCfg?: any; derived?: any;
  status: PkgStatus; version: number; dirty: boolean; createdAt: Ms; updatedAt: Ms; publishedAt?: Ms; by: string;
  seq?: number; approval?: Approval | null; apReq?: { at: Ms; by: string; version?: number } | null; history?: PublishHistory[];
  /** TMI emrinden gelen pakette ürünün malzeme kartı numarası; adımsız eski emirde null */ malzemeNo?: number | null;
  /** ayar süresi (dk); rotalı TMI emrinin iş emri paketinde rotadan */ setup?: number | null;
  /** rotalı TMI emrinin iş emri paketinde bağ (sunucu yazar) */ tmi?: { emirId: number; isEmriId: number; opNo: number; /** kol adımı: rework, tamir ya da ek (rota adımında yok) */ tur?: string; ekAciklama?: string; plan?: { canli: boolean; sira: number | null; eslesiyor: boolean; kaynak?: { tur: 'makine' | 'kisi'; id: number } | null } };
  /** ara onay kararı (Terminal kural 1/5); by, at ve once sunucudan */ fpRe?: { on: boolean; key: string; why: 'red' | 'revizyon' | 'degisiklik'; by?: string; at?: Ms; once?: string[] } | null;
  /** son yayındaki içerik imzası (arkon/web/src/data/ara-onay.ts) */ yayinImza?: Record<string, string> | null;
  /** karar 732 a: kayıtsız TMI taslağına malzemenin Çizimler'deki yayında belgeleri (sunucu önerir, Hazırlık merkezden alır) */
  malzemeCizimleri?: { belgeId: number; ad: string; tip: 'pdf' | 'model' }[];
  imported?: Ms; from?: string; [k: string]: unknown;
}

/* ── operatör sonuçları (paket başına) ── */
export type OrderState = 'queued' | 'setup' | 'running' | 'paused' | 'stopped' | 'done';
export interface Meas { v: number | string; ok: boolean; cnt?: number; who?: 'op' | 'q'; by?: string; at?: Ms; dev?: boolean; [k: string]: unknown }
export interface Pin { id: string; by: string; at: Ms; status: 'open' | 'done'; text?: string; reply?: string; [k: string]: unknown }
export interface Result {
  id: Id; no: string; rev?: string; version?: number; state: OrderState; good: number; scrap: number; baseGood?: number;
  meas: Record<string, Meas>; pins: Pin[]; acks?: Record<string, any>; toolsAt?: Record<string, number>; sr?: Record<string, any>; at: Ms; [k: string]: unknown;
}
/** operatör ekranındaki iş emri (paket + sonuç + ekran durumu) */
export interface Order {
  no: string; part: string; op: string; due: string; state: OrderState; target: number; good: number; scrap: number; cycle: number;
  urgent?: boolean; baseGood?: number; meas?: Record<string, Meas>; pins?: Pin[]; acks?: Record<string, any>; toolsAt?: Record<string, number>; sr?: Record<string, any>;
  pkg?: Pkg; fresh?: boolean; empty?: boolean; startedAt?: Ms; pendingReq?: string | null; pendingItems?: number[] | null; pendingAt?: Ms;
  lastDecision?: { status: string; bad?: string; note?: string; at: Ms; ack?: boolean } | null; toolEvt?: any; ready?: any;
  /** "Aç" ile seçilen refakat kartı (kart #156); sayım satırına refakatPartisiId olarak gider */
  kart?: number | null; [k: string]: unknown;
}
export interface SampleRequest {
  id: Id; pkgId: Id; no: string; part: string; rev: string; machine: Id; by: string; at: Ms; reason: string; items: number[]; crit: boolean; cnt: number;
  status: 'waiting' | 'measuring' | 'approved' | 'rejected' | 'deviation'; results: Record<string, Meas>; note?: string; decidedAt?: Ms; decidedBy?: string;
}

/* ── planlı duruş, bakım, kalibrasyon, lojistik ── */
export interface PlannedDown { id: Id; title: string; reason: string; scope: 'all' | 'wc' | 'st'; target: Id; from: Ms; to: Ms; rep: 'none' | 'daily' | 'weekly'; days?: number[]; until?: Ms | null; note?: string; by?: string; at?: Ms; active?: boolean }
export type Maint =
  | { id: Id; type: 'ariza'; st: Id; mc?: Id | null; wc?: Id | null; title: string; openedAt: Ms; openedBy?: string; ackAt?: Ms; ackBy?: string; status: 'open' | 'work' | 'done'; closedAt?: Ms; closedBy?: string; cause?: string; action?: string; parts?: string; repairMs?: number; callId?: string; orderNo?: string | null }
  | { id: Id; type: 'plan'; mc: Id; st?: Id; title: string; everyDays: number; durMin?: number; lastAt?: Ms; note?: string; active?: boolean }
  | { id: Id; type: 'pm'; planId: Id; mc: Id; st?: Id; title: string; at: Ms; by: string; note?: string };
export interface Calibration { at: Ms; by: string; res: 'ok' | 'nok'; cert?: string; note?: string }
export interface Gauge { id: Id; no: string; type: string; name?: string; range?: string; loc?: string; interval: number; last?: Ms; status: 'ok' | 'out'; cals?: Calibration[] }
export interface Logi { id: Id; kind: 'req' | 'out'; st: Id; wc?: Id | null; to?: Id; orderNo?: string | null; pkgId?: Id | null; part?: string | null; item?: string; qty?: string | number; note?: string; status: 'open' | 'prep' | 'sent' | 'done' | 'cancel'; by: string; at: Ms; handledBy?: string; handledAt?: Ms; doneBy?: string; doneAt?: Ms }

/* ── üretim kayıtları (yalnız eklenir) ── */
interface LogBase { cid: string; at: Ms; userId?: string | null; userName?: string | null; machine?: Id | null; wc?: Id | null }
export interface LogEvent extends LogBase { mc?: Id | null; orderNo?: string | null; pkgId?: Id | null; state: OrderState | 'none'; reason?: string | null; planned?: boolean | null; src?: 'op' | 'auto' | null }
export interface LogCount extends LogBase { mc?: Id | null; orderNo?: string | null; pkgId?: Id | null; kind: 'good' | 'scrap'; delta: number; cycleMs?: number | null; planMs?: number | null; reason?: string | null; src?: 'op' | 'auto' | null; refakatPartisiId?: number | null }
export interface LogMeas extends LogBase { pkgId: Id; orderNo?: string | null; itemId: number; nom: string; lsl: number; usl: number; value: number | null; attr?: string | null; ok: boolean; src?: 'op' | 'quality' | 'cmm'; partCnt?: number | null; reqId?: string | null }
export interface LogCall extends LogBase { mc?: Id | null; callId: string; team: CallTeam; phase: 'open' | 'ack' | 'esc' | 'done' | 'cancel'; note?: string | null }
export interface LogAudit extends LogBase { area: string; action: string; target: string; detail?: string | null }
export interface LogKinds { events: LogEvent; counts: LogCount; meas: LogMeas; calls: LogCall; audit: LogAudit }
export type LogKind = keyof LogKinds;

/* ── belge depoları (sunucu: /api/doc/:store) ── */
export interface DocStores { pkgs: Pkg; results: Result; requests: SampleRequest; draws: any; downs: PlannedDown; maint: Maint; gauges: Gauge; logi: Logi }
export type DocStore = keyof DocStores | 'kv';
/** kv deposundaki ortak ayarlar */
export interface KvValues { plant: Plant; shifts: Shift[]; perms: PermMatrix; policy: Policy; reasons: Reason[]; scraps: ScrapReason[]; mode: AppMode; [k: string]: unknown }

/* ── API ── */
export interface HealthRes { ok: true; app: 'arkon-mes'; version: string; db: boolean; time: Ms; /** uygulanmış son şema geçişi */ schema?: number }
export interface LoginReq { id: Id; pin: string; device?: string }
export interface LoginRes { token: string; user: User }
/** GET /api/doc/:store/:id · u: sunucudaki sürüm (updated_at, ms) */
export interface DocRes<T = unknown> { u: Ms; d: T }
export interface ConflictRes<T = unknown> { error: string; cur: DocRes<T> }
export interface BusMsg { type: string; mid?: string; at?: Ms; [k: string]: unknown }
