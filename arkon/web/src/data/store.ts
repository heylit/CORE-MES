import type { BusMsg, HealthRes, PkgFile, Role, Session, User } from '@shared/model';
import type { AnomaliDonemi, AnomaliIstatistigi, Anomaliler } from './anomali';
import type { OzetDonemi, OperatorOzeti } from './ozetim';
import type { MerkezDurumu } from './cizim-merkezi';
import type { MakineAyrimlari } from './makine-secimi';
import type { RefakatKarti } from './refakat-karti';
import { cagriEkipleriniAl } from './cagri-ekiplerim';
import type { CagriEkiplerim } from './cagri-ekiplerim';
import { CAKISMA_ILETISI, CAKISMA_OLAYI, merge3 } from './cakisma';
import { BLOB_BELLEK_SINIRI, blobBellegi } from './blob-bellek';
import { depoOkunur } from './depo-okuma';
import { BUDANAN_DEPOLAR, budanacakAnahtarlar, yerelKayitBudanir } from './kayit-budama';
import { sunucuyaGonderilir } from './kayit-gonderimi';
import { KAYIT_REDDI_OLAYI, gonderimSonucu, iletiHataKarari } from './gonderim-hatasi';
import { baskasininKayitSayisi } from './bekleyen-kayit';
import { kuyrukGonderilir } from './kuyruk';
import { gecikmeliRet, logRetleri } from './biten-is';
import { oturumKisisi } from './oturum-kisisi';
import { yerelVeriyiTemizle } from './yerel-temizlik';
/* Belgeler bu katmanda biçimden bağımsız taşınır (IndexedDB ↔ sunucu); alan tipleri @shared/model'dedir.
   Uygulama tarafına dönen belge değerleri bilinçli olarak `any` bırakılır: sayfalar kendi tiplerini (Pkg, Result…) kullanır. */
type Doc = any;
type Key = IDBValidKey;
type Bytes = Uint8Array;
/** gelen anlık ileti: bilinen alanlar + sayfaya özgü alanlar */
export type BusIn = BusMsg & Record<string, any>;
export interface MerkezBelgesi { id: number; ad: string; tur: string; harf: string; tip: 'pdf' | 'model'; dosyaAdi: string; ozet: string }
export interface ApiOpts { timeout?: number; noAuth?: boolean; raw?: boolean }
export interface LogQuery { machine?: string | null; wc?: string | null; from?: number | null; to?: number | null; order?: string | null; pkg?: string | null; item?: number | string | null; limit?: number | null }
type OutboxItem = { at?: number; uid?: string } & ({ op: 'put'; store: string; id: string } | { op: 'del'; store: string; id: string; base?: number } | { op: 'log'; kind: string; row: Record<string, unknown> });
interface LocalUser { id: string; name: string; role: Role; wcs?: string[]; active?: boolean; pin: string }
export interface UserSave { id: string; name: string; role: Role; wcs?: string[]; active?: boolean; pin?: string }
/** sunucu / bağlantı hatası: offline = sunucuya ulaşılamadı (kuyruğa alınır), status = HTTP kodu, body = sunucunun yanıtı */
export interface TmiAdim { id: number; sira: number; ad: string; aciklama: string | null; tamam: boolean }
export class ApiError extends Error { offline?: boolean; status?: number; body?: any }
export interface Status { mode: 'server' | 'local'; base: string | null; online: boolean; pending: number; baskasi: number; user: User | null; err: string; memory: boolean }
/* Arkon — veri katmanı
   Yerel mod: her şey cihazdaki IndexedDB'de (tek dosya HTML / APK, sunucusuz).
   Sunucu modu: Arkon MES sunucusu (Node + PostgreSQL) ortak veridir; cihazdaki IndexedDB aynası ve gönderim kuyruğu
   sayesinde bağlantı koparsa çalışmaya devam edilir, bağlantı gelince kuyruk kendiliğinden gönderilir.
   Ayrıca: anlık iletim (BroadcastChannel + sunucu SSE), klasör eşitleme, .arkon paket dosyası, üretim kayıtları, giriş. */
  const LS = { get(k: string): any { try { return JSON.parse(localStorage.getItem('arkon:' + k) || 'null'); } catch (e: any) { return null; } }, set(k: string, v: unknown): void { try { if (v == null) localStorage.removeItem('arkon:' + k); else localStorage.setItem('arkon:' + k, JSON.stringify(v)); } catch (e: any) {} } };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));

  /* ── cihazdaki IndexedDB ── */
  const KEYPATH = ['pkgs', 'results', 'requests', 'draws', 'downs', 'maint', 'gauges', 'logi'], OUTKEY = ['kv', 'cache', 'blobs', 'surumler'], AUTO = ['outbox', 'log_events', 'log_counts', 'log_meas', 'log_calls', 'log_audit'];
  let dbp: Promise<IDBDatabase | null> | null = null, useMem = false; const mem: Record<string, Map<Key, Doc>> = {}; KEYPATH.concat(OUTKEY, AUTO).forEach(s => { mem[s] = new Map(); }); let memSeq = 0;
  function open(): Promise<IDBDatabase | null> {
    if (!dbp) dbp = new Promise<IDBDatabase | null>(res => {
      try {
        const r = indexedDB.open('arkon-mes', 7);
        r.onupgradeneeded = () => { const d = r.result, has = (n: string) => d.objectStoreNames.contains(n); KEYPATH.forEach(n => { if (!has(n)) d.createObjectStore(n, { keyPath: 'id' }); }); OUTKEY.forEach(n => { if (!has(n)) d.createObjectStore(n); }); AUTO.forEach(n => { if (!has(n)) d.createObjectStore(n, { autoIncrement: true }); }); };
        r.onsuccess = () => res(r.result); r.onerror = () => { useMem = true; res(null); setTimeout(() => emit(), 0); };
      } catch (e: any) { useMem = true; res(null); setTimeout(() => emit(), 0); }
    });
    return dbp;
  }
  async function tx(store: string, mode: IDBTransactionMode, fn: (o: IDBObjectStore) => unknown): Promise<any> {
    const d = await open();
    if (!d || useMem) return fn(null as unknown as IDBObjectStore);
    return new Promise((res, rej) => { const t = d.transaction(store, mode), s = t.objectStore(store); const r = fn(s); t.oncomplete = () => res(typeof IDBRequest !== 'undefined' && r instanceof IDBRequest ? r.result : r); t.onerror = () => rej(t.error); });
  }
  const isMem = async () => useMem || !(await open());
  const L = {
    async all(s: string): Promise<Doc[]> { if (await isMem()) return Array.from(mem[s].values()); return tx(s, 'readonly', o => o.getAll()); },
    async entries(s: string): Promise<[Key, Doc][]> { if (await isMem()) return Array.from(mem[s].entries()); const keys = await tx(s, 'readonly', o => o.getAllKeys()), vals = await tx(s, 'readonly', o => o.getAll()); return keys.map((k: Key, i: number) => [k, vals[i]]); },
    async get(s: string, k: Key): Promise<Doc> { if (await isMem()) return mem[s].get(k); return tx(s, 'readonly', o => o.get(k)); },
    async put(s: string, v: Doc, k?: Key): Promise<unknown> { if (await isMem()) { mem[s].set(k !== undefined ? k : v.id, v); return; } return tx(s, 'readwrite', o => k !== undefined ? o.put(v, k) : o.put(v)); },
    async add(s: string, v: Doc): Promise<unknown> { if (await isMem()) { mem[s].set(++memSeq, v); return memSeq; } return tx(s, 'readwrite', o => o.add(v)); },
    async del(s: string, k: Key): Promise<unknown> { if (await isMem()) { mem[s].delete(k); return; } return tx(s, 'readwrite', o => o.delete(k)); },
    async clear(s: string): Promise<unknown> { if (await isMem()) { mem[s].clear(); return; } return tx(s, 'readwrite', o => o.clear()); },
    async delMany(s: string, keys: Key[]): Promise<unknown> { if (!keys.length) return; if (await isMem()) { keys.forEach(k => mem[s].delete(k)); return; } return tx(s, 'readwrite', o => { keys.forEach(k => o.delete(k)); }); }
  };

  /* ── kodlama yardımcıları ── */
  const b64 = (u: Bytes): string => { let s = ''; const C = 0x8000; for (let i = 0; i < u.length; i += C) s += String.fromCharCode.apply(null, u.subarray(i, i + C) as unknown as number[]); return btoa(s); };
  const unb64 = (s: string): Bytes => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  interface TACtor { new (buf: ArrayBufferLike, off: number, len: number): ArrayBufferView; BYTES_PER_ELEMENT: number }
  const TA: Record<string, TACtor> = { f32: Float32Array, u32: Uint32Array, i32: Int32Array, u8: Uint8Array, u16: Uint16Array, f64: Float64Array };
  const taKind = (x: ArrayBufferView): string => Object.keys(TA).find(k => x instanceof TA[k]) || 'u8';
  const asBytes = (x: ArrayBufferView): Bytes => new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  const fromBytes = (u: Bytes, k: string): ArrayBufferView => { const C = TA[k] || Uint8Array; if (u.byteOffset % C.BYTES_PER_ELEMENT) u = u.slice(); return new C(u.buffer, u.byteOffset, u.byteLength / C.BYTES_PER_ELEMENT); };
  const encTA = (x: any): any => { if (ArrayBuffer.isView(x)) return { $ta: taKind(x), b: b64(asBytes(x)) }; if (Array.isArray(x)) return x.map(encTA); if (x && typeof x === 'object') { const o: Record<string, any> = {}; for (const k in x) o[k] = encTA(x[k]); return o; } return x; };
  const decTA = (x: any): any => { if (x && x.$ta) return fromBytes(unb64(x.b), x.$ta); if (Array.isArray(x)) return x.map(decTA); if (x && typeof x === 'object') { const o: Record<string, any> = {}; for (const k in x) o[k] = decTA(x[k]); return o; } return x; };

  /* SHA-256 (güvenli bağlam yoksa — http://sunucu-ip — tarayıcı crypto.subtle vermez; saf JS yedek) */
  const K256 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256js(data: Bytes): string {
    const l = data.length, nb = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(nb); m.set(data); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(nb - 4, (l * 8) >>> 0); dv.setUint32(nb - 8, Math.floor(l / 0x20000000));
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
    const r = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const a = W[i - 15], b = W[i - 2]; W[i] = (W[i - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + W[i - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10))) >>> 0; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) { const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + W[i]) >>> 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0; h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return Array.from(H, x => x.toString(16).padStart(8, '0')).join('');
  }
  async function sha256(u: Bytes): Promise<string> { try { if (crypto.subtle) return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', u as BufferSource)), b => b.toString(16).padStart(2, '0')).join(''); } catch (e: any) {} return sha256js(u); }

  /* ── sunucu bağlantısı ── */
  interface Srv { on: boolean; base: string | null; online: boolean; cid: string; pending: number; es: EventSource | null; lastErr: string }
  const SRV: Srv = { on: false, base: null, online: false, cid: uid(), pending: 0, es: null, lastErr: '' };
  let session: Session | null = LS.get('session'); // { token, user: { id, name, role }, srv }
  const statusSubs = new Set<(s: Status) => void>();
  const emit = () => statusSubs.forEach(f => { try { f(status()); } catch (e: any) {} });
  const status = (): Status => ({ mode: SRV.on ? 'server' : 'local', base: SRV.base, online: SRV.online, pending: SRV.pending, baskasi: baskasininKayitSayisi(kuyrukSahipleri, oturumSahibi()), user: session && session.user || null, err: SRV.lastErr, memory: useMem });
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('zaman aşımı')), ms))]);
  async function api(method: string, p: string, body?: unknown, opt: ApiOpts = {}): Promise<any> {
    if (!SRV.on) throw new Error('Sunucu modu kapalı');
    const h: Record<string, any> = {}, tok = session && session.token; if (tok) h.Authorization = 'Bearer ' + tok;
    let b = body as BodyInit | undefined; if (body !== undefined && !(body instanceof Uint8Array) && !(body instanceof Blob)) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
    let r: Response;
    try { r = await withTimeout(fetch(SRV.base + '/api' + p + (p.includes('?') ? '&' : '?') + 'c=' + SRV.cid, { method, headers: h, body: b }), opt.timeout || 20000); }
    catch (e: any) { if (SRV.online) { SRV.online = false; SRV.lastErr = 'Sunucuya ulaşılamıyor'; emit(); } const er = new ApiError('Sunucuya ulaşılamıyor'); er.offline = true; throw er; }
    if (!SRV.online) { SRV.online = true; SRV.lastErr = ''; emit(); setTimeout(flush, 50); }
    if (r.status === 401 && !opt.noAuth && tok && session && session.token === tok) { setSession(null); cikisTemizligi(); window.dispatchEvent(new Event('arkon-logout')); }
    if (opt.raw) { if (!r.ok) throw new Error('HTTP ' + r.status); return new Uint8Array(await r.arrayBuffer()); }
    const j = r.status === 204 ? null : await r.json().catch(() => null);
    if (!r.ok && r.status !== 404) { const er = new ApiError((j && j.error) || ('HTTP ' + r.status)); er.status = r.status; er.body = j; throw er; }
    return r.status === 404 ? undefined : j;
  }
  // Çıkışta cihazdaki veri silinir, gönderilmemiş kayıt kuyruğu kalır. Sunucusuz yerel kipte kaydın tek kopyası cihazdadır: silinmez.
  async function cikisTemizligi(): Promise<void> {
    if (!SRV.on) return;
    try { await yerelVeriyiTemizle(localStorage, typeof indexedDB === 'undefined' ? undefined : indexedDB); } catch (e: any) { console.warn('yerel veri temizlenemedi', e); }
  }
  function setSession(s: Session | null): void { session = s; LS.set('session', s); emit(); if (SRV.on) openBus(); }

  /* blob: büyük ikili veriler (PDF, STEP, 3B ağı) bir kez yüklenir, özetle anılır */
  const BLOB_MIN = 16384, blobMem = blobBellegi(BLOB_BELLEK_SINIRI); const known = new Set<string>();
  const memPutBlob = (h: string, u: Bytes): void => blobMem.koy(h, u);
  async function getBlob(h: string): Promise<Bytes> {
    const bellekte = blobMem.al(h);
    if (bellekte) return bellekte;
    let u = await L.get('blobs', h).catch(() => null);
    if (!u) { u = await api('GET', '/blob/' + h, undefined, { raw: true, timeout: 120000 }); await L.put('blobs', u, h).catch(() => {}); }
    known.add(h); memPutBlob(h, u); return u;
  }
  async function toWire(x: any, up: [string, Bytes][]): Promise<any> {
    if (ArrayBuffer.isView(x)) {
      const u = asBytes(x), k = taKind(x);
      if (u.length < BLOB_MIN) return { $ta: k, b: b64(u) };
      const h = await sha256(u); up.push([h, u]); memPutBlob(h, u); return { $blob: h, t: k, n: u.length };
    }
    if (Array.isArray(x)) { const o: any[] = []; for (const v of x) o.push(await toWire(v, up)); return o; }
    if (x && typeof x === 'object') { if (typeof FileSystemHandle !== 'undefined' && x instanceof FileSystemHandle) return null; const o: Record<string, any> = {}; for (const k in x) o[k] = await toWire(x[k], up); return o; }
    return x;
  }
  async function fromWire(x: any): Promise<any> {
    if (x && x.$blob) return fromBytes(await getBlob(x.$blob), x.t);
    if (x && x.$ta) return fromBytes(unb64(x.b), x.$ta);
    if (Array.isArray(x)) { const o: any[] = []; for (const v of x) o.push(await fromWire(v)); return o; }
    if (x && typeof x === 'object') { const o: Record<string, any> = {}; for (const k in x) o[k] = await fromWire(x[k]); return o; }
    return x;
  }
  async function uploadBlobs(up: [string, Bytes][]): Promise<void> {
    const need = up.filter(([h]) => !known.has(h)); if (!need.length) return;
    const miss = new Set(await api('POST', '/blob/missing', need.map(x => x[0])));
    for (const [h, u] of need) { if (miss.has(h)) await api('PUT', '/blob/' + h, u, { timeout: 300000 }); known.add(h); await L.put('blobs', u, h).catch(() => {}); }
  }

  /* gönderim kuyruğu: bağlantı yokken yapılan yazmalar sırayla saklanır */
  // Sahip istekten ÖNCE alınır: 401 cevabı oturumu siler, sonra okunursa öğe sahipsiz kalır ve sonra giren kişinin oturumuyla gider.
  const oturumSahibi = (): string | undefined => session && session.user ? session.user.id : undefined;
  // Sunucuya giden yazma isteği gitmeden önce kuyruğa yazılır, cevap gelince silinir: sekme istek sürerken kapanırsa kayıt kuyrukta kalır ve
  // sonraki açılışta gönderilir. Yolda olan öğeyi flush göndermez (aynı yazma iki kez gitmesin); bekleyen sayısına da girmez.
  const yolda = new Set<Key>();
  // Kuyruktaki öğelerin sahipleri (status().baskasi için): bekleyen sayısıyla birlikte tazelenir.
  let kuyrukSahipleri: (string | undefined)[] = [];
  const bekleyenSay = async (): Promise<number> => {
    const bekleyen = (await L.entries('outbox')).filter(([k]) => !yolda.has(k));
    kuyrukSahipleri = bekleyen.map(([, it]) => it && it.uid);
    return bekleyen.length;
  };
  // Reddedilen belge yazımı sessiz kalmaz: kayıt düşer, ekranlar KAYIT_REDDI_OLAYI ile iletiyi gösterir.
  function belgeRedBildir(store: string, id: string, e: any): void {
    console.warn('sunucu belge yazımını reddetti', store, id, e && e.message);
    try { window.dispatchEvent(new CustomEvent(KAYIT_REDDI_OLAYI, { detail: { store, id, msg: (e && e.message) || '' } })); } catch (x) {}
  }
  async function gonder(item: OutboxItem, uid: string | undefined, is: () => Promise<unknown>): Promise<void> {
    const k = await L.add('outbox', Object.assign({ at: Date.now(), uid }, item)).catch(() => null) as Key | null;
    // Kuyruk yazılamadıysa istek yine gider; bağlantı hatasında kayıt yalnız cihaz aynasında kalır.
    if (k === null) { await is(); return; }
    yolda.add(k);
    try { await is(); await L.del('outbox', k).catch(() => {}); }
    catch (e: any) {
      if (gonderimSonucu(e) === 'kuyruk') return;
      await L.del('outbox', k).catch(() => {});
      if (item.op === 'put') belgeRedBildir(item.store, item.id, e);
      throw e;
    } finally { yolda.delete(k); const n = await bekleyenSay(); if (n !== SRV.pending) { SRV.pending = n; emit(); } }
  }
  // Kayıt yazıldı ama TMI'ye işlenmedi: ret ekrana döner (sayım ise terminaldeki sayı geri alınır).
  function retleriBildir(kind: string | undefined, rows: any[], cevap: unknown): void {
    for (const { cid, ileti, tmiDurum } of logRetleri(cevap)) {
      try { window.dispatchEvent(new CustomEvent('arkon-rejected', { detail: { store: 'log_' + kind, kind, id: cid, cid, row: rows.find(x => x && x.cid === cid), msg: ileti, tmiDurum } })); } catch (x) {}
    }
  }
  let flushing = false;
  async function flush() {
    if (!SRV.on || flushing || !session) return; flushing = true;
    try {
      for (const [k, it] of await L.entries('outbox')) {
        // başka kişinin kuyruğa aldığı öğe: o kişi yeniden girene kadar bekler (sıra kişi başına korunur)
        if (yolda.has(k) || !kuyrukGonderilir(it, session && session.user ? session.user.id : null)) continue;
        try {
          if (it.op === 'put') { const v = it.store === 'kv' ? await L.get('kv', it.id) : await L.get(it.store, it.id); if (v !== undefined) await sirayla(tabanAnahtari(it.store, it.id), () => remotePut(it.store, it.id, v)); }
          else if (it.op === 'del') await remoteDel(it.store, it.id, it.base);
          else if (it.op === 'log') retleriBildir(it.kind, [it.row], await api('POST', '/log/' + it.kind, [it.row]));
        } catch (e: any) {
          // sunucu reddetti (yetki yok, geçersiz kayıt): kuyruğu tıkamasın, kaydı düşür ve bildir
          if (gonderimSonucu(e) === 'kuyruk') throw e;
          console.warn('sunucu kaydı reddetti', it, e.message);
          try { window.dispatchEvent(new CustomEvent('arkon-rejected', { detail: { store: it.store, id: it.id, kind: it.kind, row: it.row, msg: e.message } })); } catch (x) {}
          if (it.op === 'put') belgeRedBildir(it.store, it.id, e);
        }
        await L.del('outbox', k);
      }
    } catch (e: any) { /* bağlantı yine koptu: sonra */ }
    finally { SRV.pending = await bekleyenSay(); flushing = false; emit(); }
  }
  setInterval(() => { if (SRV.on && SRV.pending) flush(); else if (SRV.on && !SRV.online) api('GET', '/health', undefined, { timeout: 4000 }).catch(() => {}); }, 8000);

  /* ── belgeler: aynı arayüz, mod saydam ── */
  const SYNC = new Set(['pkgs', 'results', 'requests', 'kv', 'draws', 'downs', 'maint', 'gauges', 'logi']), LOCAL_KV = new Set(['folder', 'lastBackup']);
  const remoteOk = (s: string, k?: Key): boolean => !!(SRV.on && session && SYNC.has(s) && !(s === 'kv' && LOCAL_KV.has(String(k))));
  // Sunucunun bu role okutmadığı depo istenmez; tabletteki eski kopya da gösterilmez (paylaşılan tablette başka rolün aynası olabilir).
  const okunmaz = (s: string): boolean => !!(SRV.on && session && !depoOkunur(s, session.user && session.user.role));
  const memo: Record<string, Record<string, { u: number; doc: Doc }>> = {}; // store → id → { u, doc }
  // Son bilinen sürüm ve taban cihazda da tutulur (kablo hâliyle; dosyalar özetle anılır, iki kez saklanmaz): uygulama çevrimdışı yeniden
  // açılınca bellek boştur; taban 0 ile giden yazma 409 alır ve tabansız birleştirmede tabletin değiştirdiği alanları sunucu ezer.
  const tabanAnahtari = (s: string, id: string): string => s + '\u0000' + id;
  function tabanYaz(s: string, id: string, u: number, doc: Doc, d: unknown): void {
    (memo[s] = memo[s] || {})[id] = { u, doc };
    L.put('surumler', { u, d }, tabanAnahtari(s, id)).catch(() => {});
  }
  async function taban(s: string, id: string): Promise<{ u: number; doc: Doc } | undefined> {
    if (memo[s] && memo[s][id]) return memo[s][id];
    const r = await L.get('surumler', tabanAnahtari(s, id)).catch(() => undefined);
    if (!r) return undefined;
    const d = await fromWire(r.d);
    return (memo[s] = memo[s] || {})[id] = { u: r.u, doc: s === 'kv' ? d.v : d };
  }
  function tabanSil(s: string, id: string): void {
    if (memo[s]) delete memo[s][id];
    L.del('surumler', tabanAnahtari(s, id)).catch(() => {});
  }
  // Aynı belgeye bu tabletten giden yazmalar sırayla gider: üst üste giden ikinci yazma ilkinin sürümünü bilmeden gidip 409 alıyor ve tek
  // tablette "başka cihazda değişmişti" iletisi çıkıyordu (Akış A provası 2). Başka belgelerin yazması birbirini beklemez.
  const yazmaSirasi = new Map<string, Promise<unknown>>();
  function sirayla<T>(anahtar: string, is: () => Promise<T>): Promise<T> {
    const p = (yazmaSirasi.get(anahtar) || Promise.resolve()).then(is);
    const son = p.catch(() => {});
    yazmaSirasi.set(anahtar, son);
    son.then(() => { if (yazmaSirasi.get(anahtar) === son) yazmaSirasi.delete(anahtar); });
    return p;
  }
  /* Eşzamanlı yazma: sunucudaki sürüm (u) bizim bildiğimizden yeniyse 409 döner; üç yollu birleştirip (cakisma.ts) yeniden yazarız. */
  async function remotePut(s: string, id: string, v: Doc): Promise<Doc> {
    for (let i = 0; i < 4; i++) {
      const up: [string, Bytes][] = []; const w = await toWire(s === 'kv' ? { v } : v, up); await uploadBlobs(up);
      const t = await taban(s, id), base = t ? t.u : 0;
      try {
        const r = await api('PUT', '/doc/' + s + '/' + encodeURIComponent(id) + '?base=' + base, w);
        tabanYaz(s, id, r && r.u, v, w); return v;
      } catch (e: any) {
        if (e.status !== 409 || !e.body || !e.body.cur) throw e;
        const cur = e.body.cur, rd = await fromWire(cur.d), remote = s === 'kv' ? rd.v : rd;
        const { doc: merged, cakisan } = merge3(t ? t.doc : undefined, v, remote);
        tabanYaz(s, id, cur.u, remote, cur.d); v = merged;
        await L.put(s, merged, s === 'kv' ? id : undefined).catch(() => {});
        deliver({ type: '$merged', store: s, id });
        if (cakisan.length) try { window.dispatchEvent(new CustomEvent(CAKISMA_OLAYI, { detail: { store: s, id, alanlar: cakisan, msg: CAKISMA_ILETISI } })); } catch (x) {}
      }
    }
    throw Object.assign(new Error('Kayıt çakışması çözülemedi'), { status: 409 });
  }
  /* silme son bilinen sürümle gider: başka cihazda sonradan değişen belge silinmez (409); güncel hali aynaya geri yazılır ve ekran yenilenir */
  async function remoteDel(s: string, id: string, base: number | undefined): Promise<void> {
    try {
      await api('DELETE', '/doc/' + s + '/' + encodeURIComponent(id) + (base === undefined ? '' : '?base=' + base));
      tabanSil(s, id);
    } catch (e: any) {
      if (e.status === 409) {
        try {
          const r = await api('GET', '/doc/' + s + '/' + encodeURIComponent(id));
          if (r) { const d = await fromWire(r.d), doc = s === 'kv' ? d.v : d; tabanYaz(s, id, r.u, doc, r.d); await L.put(s, doc, s === 'kv' ? id : undefined).catch(() => {}); deliver({ type: '$merged', store: s, id }); }
        } catch (x) {}
      }
      throw e;
    }
  }
  const DB = {
    async all(s: string): Promise<Doc[]> {
      if (okunmaz(s)) return [];
      if (!remoteOk(s)) return s === 'kv' ? (await L.all(s)) : L.all(s);
      try {
        const rows = await api('GET', '/doc/' + s), m = memo[s] = memo[s] || {}, out: Doc[] = [], seen = new Set<Key>();
        for (const r of rows) {
          seen.add(r.id);
          if (!(m[r.id] && m[r.id].u === r.u)) { const d = await fromWire(r.d); tabanYaz(s, r.id, r.u, s === 'kv' ? d.v : d, r.d); L.put(s, m[r.id].doc, s === 'kv' ? r.id : undefined).catch(() => {}); }
          out.push(m[r.id].doc);
        }
        // başka cihazda silinenleri aynadan da sil (kuyrukta bekleyen yerel yazma yoksa)
        const pend = new Set<string>((await L.all('outbox')).filter((x: OutboxItem) => 'store' in x && x.store === s).map((x: { id: string }) => x.id));
        for (const [k] of await L.entries(s)) if (!seen.has(k) && !pend.has(String(k)) && !(s === 'kv' && LOCAL_KV.has(String(k)))) { L.del(s, k).catch(() => {}); tabanSil(s, String(k)); }
        for (const id of pend) if (!seen.has(id)) { const v = await L.get(s, id); if (v !== undefined) out.push(v); }
        return out;
      } catch (e: any) { if (e.offline) return L.all(s); throw e; }
    },
    async get(s: string, k: string): Promise<Doc> {
      if (okunmaz(s)) return undefined;
      if (!remoteOk(s, k)) return L.get(s, k);
      try {
        const pend = (await L.all('outbox')).some((x: OutboxItem) => 'store' in x && x.store === s && x.id === k); if (pend) return L.get(s, k);
        const r = await api('GET', '/doc/' + s + '/' + encodeURIComponent(k));
        if (r === undefined || r === null) return undefined;
        const m = memo[s] = memo[s] || {};
        if (!(m[k] && m[k].u === r.u)) { const d = await fromWire(r.d); tabanYaz(s, k, r.u, s === 'kv' ? d.v : d, r.d); L.put(s, m[k].doc, s === 'kv' ? k : undefined).catch(() => {}); }
        return m[k].doc;
      } catch (e: any) { if (e.offline) return L.get(s, k); throw e; }
    },
    async put(s: string, v: Doc, k?: string): Promise<void> {
      await L.put(s, v, k);
      const id = k !== undefined ? k : v && v.id;
      if (!remoteOk(s, id)) return;
      const sahip = oturumSahibi();
      await gonder({ op: 'put', store: s, id }, sahip, () => sirayla(tabanAnahtari(s, id), () => remotePut(s, id, v)));
    },
    async del(s: string, k: string): Promise<void> {
      const t = remoteOk(s, k) ? await taban(s, k) : undefined, base = t ? t.u : undefined;
      await L.del(s, k);
      if (!remoteOk(s, k)) return;
      const sahip = oturumSahibi();
      await gonder({ op: 'del', store: s, id: k, base }, sahip, () => remoteDel(s, k, base));
    },
    get memory() { return useMem; }
  };

  /* ── üretim kayıtları: durum değişimi, sayım, ölçüm (OEE, SPC, rapor) ── */
  const logSubs = new Set<(kind: string, row: any) => void>();
  const Log = {
    async add(kind: string, row: Record<string, unknown>): Promise<Record<string, any>> {
      const u = session && session.user;
      const r = Object.assign({ cid: uid(), at: Date.now(), userId: u ? u.id : null, userName: u ? u.name : (LS.get('opName') || null) }, row);
      await L.add('log_' + kind, r).catch(() => {});
      if (SRV.on && session && sunucuyaGonderilir(kind)) { try { await gonder({ op: 'log', kind, row: r }, u ? u.id : undefined, async () => retleriBildir(kind, [r], await api('POST', '/log/' + kind, [r]))); }
        catch (e: any) { console.warn('sunucu kaydı reddetti', kind, e.message); try { window.dispatchEvent(new CustomEvent('arkon-rejected', { detail: { store: 'log_' + kind, kind, id: r.cid, cid: r.cid, row: r, msg: e.message } })); } catch (x) {} }
      }
      logSubs.forEach(f => { try { f(kind, r); } catch (e: any) {} });
      return r;
    },
    async query(kind: string, f: LogQuery = {}): Promise<any[]> {
      if (SRV.on && session) {
        try { const qs = Object.entries({ machine: f.machine, wc: f.wc, from: f.from, to: f.to, order: f.order, pkg: f.pkg, item: f.item, limit: f.limit }).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(String(v))).join('&'); return await api('GET', '/log/' + kind + (qs ? '?' + qs : '')); }
        catch (e: any) { if (!e.offline) throw e; }
      }
      return (await L.all('log_' + kind)).filter((r: Record<string, any>) => (!f.machine || r.machine === f.machine) && (!f.wc || r.wc === f.wc) && (!f.from || r.at >= f.from) && (!f.to || r.at < f.to) && (!f.order || r.orderNo === f.order) && (!f.pkg || r.pkgId === f.pkg) && (f.item == null || f.item === '' || r.itemId === +f.item)).sort((a: { at: number }, b: { at: number }) => a.at - b.at).slice(-(f.limit || 5000));
    },
    on(fn: (kind: string, row: any) => void) { logSubs.add(fn); return () => { logSubs.delete(fn); }; }
  };

  /* ── giriş ── */
  async function localHash(pin: string, salt: string): Promise<string> { return 'l1:' + salt + ':' + (await sha256(new TextEncoder().encode(salt + ':' + pin))); }
  const Auth = {
    async required() { if (SRV.on) return true; const us: LocalUser[] | undefined = await L.get('kv', 'users'); return !!(us && us.some(u => u.active !== false)); },
    current(): User | null { return session && session.user || null; },
    async users(): Promise<User[]> { if (SRV.on) { try { const r = await api('GET', '/users/public', undefined, { noAuth: true }); LS.set('usersCache', r); return r; } catch (e: any) { return LS.get('usersCache') || []; } } return ((await L.get('kv', 'users')) as LocalUser[] || []).filter(u => u.active !== false).map(u => ({ id: u.id, name: u.name, role: u.role, wcs: u.wcs || [] })); },
    async login(id: string, pin: string): Promise<User> {
      if (SRV.on) { const r = await api('POST', '/login', { id, pin, device: navigator.userAgent.slice(0, 80) }, { noAuth: true }); if (!r || !r.token) throw new Error('PIN hatalı'); setSession({ token: r.token, user: r.user, srv: SRV.base || undefined }); flush(); return r.user; }
      const us: LocalUser[] = (await L.get('kv', 'users')) || [], u = us.find(x => x.id === id && x.active !== false);
      if (!u || (await localHash(pin, u.pin.split(':')[1])) !== u.pin) throw new Error('PIN hatalı');
      const user: User = { id: u.id, name: u.name, role: u.role, wcs: u.wcs || [] }; setSession({ user }); return user;
    },
    async logout() { if (SRV.on && session && session.token) await api('POST', '/logout').catch(() => {}); setSession(null); await cikisTemizligi(); },
    async list(): Promise<User[]> { if (SRV.on) return api('GET', '/users'); return ((await L.get('kv', 'users')) as LocalUser[] || []).map(u => ({ id: u.id, name: u.name, role: u.role, wcs: u.wcs || [], active: u.active !== false })); },
    async save(u: UserSave): Promise<void> {
      if (u.pin && !/^\d{4,8}$/.test(String(u.pin))) throw new Error('PIN 4–8 haneli rakam olmalı');
      if (SRV.on) return api('PUT', '/users/' + encodeURIComponent(u.id), { name: u.name, role: u.role, wcs: u.wcs || [], active: u.active !== false, pin: u.pin || undefined });
      const us: LocalUser[] = (await L.get('kv', 'users')) || [], i = us.findIndex(x => x.id === u.id);
      if (i < 0 && !u.pin) throw new Error('Yeni kullanıcı için PIN gerekli');
      const rec: LocalUser = Object.assign({ pin: '' }, us[i] || {}, { id: u.id, name: u.name, role: u.role, wcs: u.wcs || [], active: u.active !== false });
      if (u.pin) { const salt = uid().slice(0, 8); rec.pin = await localHash(u.pin, salt); }
      if (i < 0) us.push(rec); else us[i] = rec;
      if (!us.some(x => x.role === 'admin' && x.active !== false)) rec.role = 'admin';
      await L.put('kv', us, 'users');
    },
    async remove(id: string): Promise<void> { if (SRV.on) return api('DELETE', '/users/' + encodeURIComponent(id)); const us = ((await L.get('kv', 'users')) as LocalUser[] || []).filter(x => x.id !== id); await L.put('kv', us, 'users'); }
  };

  /* ── yedek ── */
  const Backup = {
    async list() { return SRV.on ? api('GET', '/backups') : []; },
    async create() { return api('POST', '/backups'); },
    async download(name: string): Promise<Bytes> { return api('GET', '/backups/' + encodeURIComponent(name), undefined, { raw: true, timeout: 300000 }); },
    async restore(bytes: Bytes): Promise<any> { return api('POST', '/restore', bytes, { timeout: 600000 }); },
    /* yerel mod: bütün cihaz verisi tek dosyaya */
    async exportLocal() {
      const out = { format: 'arkon-yedek-yerel', at: new Date().toISOString(), stores: {} as Record<string, any> };
      for (const s of ['pkgs', 'results', 'requests', 'draws', 'downs', 'maint', 'gauges', 'logi']) out.stores[s] = encTA(await L.all(s));
      out.stores.kv = encTA((await L.entries('kv')).filter(([k]) => !LOCAL_KV.has(String(k))));
      for (const s of ['log_events', 'log_counts', 'log_meas', 'log_calls', 'log_audit']) out.stores[s] = await L.all(s);
      const txt = new TextEncoder().encode(JSON.stringify(out));
      if (typeof CompressionStream === 'undefined') return txt;
      return new Uint8Array(await new Response(new Blob([txt as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    },
    async importLocal(bytes: Bytes): Promise<void> {
      let txt: string; try { txt = new TextDecoder().decode(new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())); } catch (e: any) { txt = new TextDecoder().decode(bytes); }
      const d = JSON.parse(txt); if (d.format !== 'arkon-yedek-yerel') throw new Error('Bu bir TMI CORE cihaz yedeği değil');
      for (const s of ['pkgs', 'results', 'requests', 'draws', 'downs', 'maint', 'gauges', 'logi']) { if (!d.stores[s]) continue; await L.clear(s); for (const v of decTA(d.stores[s] || [])) await L.put(s, v); }
      for (const [k, v] of decTA(d.stores.kv || [])) await L.put('kv', v, k);
      for (const s of ['log_events', 'log_counts', 'log_meas', 'log_calls', 'log_audit']) { if (!d.stores[s]) continue; await L.clear(s); for (const v of d.stores[s] || []) await L.add(s, v); }
    }
  };

  /* ── anlık iletim ── */
  const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('arkon-mes') : null;
  const subs = new Set<(m: BusIn) => void>(), seen: string[] = [];
  const deliver = (m: BusIn | null): void => { if (!m) return; if (m.mid) { if (seen.includes(m.mid)) return; seen.push(m.mid); if (seen.length > 300) seen.shift(); } subs.forEach(f => { try { f(m); } catch (e: any) { console.warn(e); } }); };
  if (ch) ch.onmessage = (e: MessageEvent) => deliver(e.data);
  window.addEventListener('storage', e => { if (e.key === 'arkon:ping' && e.newValue) { try { deliver(JSON.parse(e.newValue)); } catch (x) {} } });
  function openBus() {
    if (SRV.es) { SRV.es.close(); SRV.es = null; }
    if (!SRV.on || !session || !session.token || typeof EventSource === 'undefined') return;
    const es = new EventSource(SRV.base + '/api/bus?t=' + encodeURIComponent(session.token) + '&c=' + SRV.cid);
    es.onopen = () => { if (!SRV.online) { SRV.online = true; SRV.lastErr = ''; emit(); } flush(); };
    es.onerror = () => { if (SRV.online) { SRV.online = false; SRV.lastErr = 'Sunucuya ulaşılamıyor'; emit(); } };
    es.onmessage = (e: MessageEvent) => { try { const m = JSON.parse(e.data); if (m.type === '$log') logSubs.forEach(f => { try { f(m.kind, null); } catch (x) {} }); if (m.type === '$reload') location.reload(); const ret = gecikmeliRet(m, oturumSahibi()); if (ret) window.dispatchEvent(new CustomEvent('arkon-rejected', { detail: ret })); deliver(m); } catch (x) {} };
    SRV.es = es;
  }
  const Bus = {
    send(m0: BusMsg) {
      const msg = Object.assign({ at: Date.now(), mid: uid() }, m0);
      if (ch) ch.postMessage(msg); else try { localStorage.setItem('arkon:ping', JSON.stringify(msg)); } catch (e: any) {}
      const gonder = (denendi: boolean) => api('POST', '/bus', { msg, c: SRV.cid }).catch((e: any) => {
        const k = iletiHataKarari(e, denendi);
        if (k === 'tekrar') setTimeout(() => gonder(true), 2000);
        else if (k === 'uyar') try { window.dispatchEvent(new CustomEvent('arkon-ileti-gitmedi', { detail: { type: msg.type, msg: e.message } })); } catch (x) {}
      });
      if (SRV.on && session && SRV.online) gonder(false);
    },
    // Yalnız bu sekmenin dinleyicilerine: `send` gönderen sekmeye dönmez.
    yerel(m0: BusMsg) { deliver(Object.assign({ at: Date.now(), mid: uid() }, m0)); },
    on(f: (m: BusIn) => void) { subs.add(f); return () => { subs.delete(f); }; }
  };

  /* ── başlangıç: sunucu var mı? ── */
  async function probe(base: string, ms = 2500): Promise<HealthRes | null> { try { const r = await withTimeout(fetch(base.replace(/\/$/, '') + '/api/health', { cache: 'no-store' }), ms); const j = await r.json(); return j && j.app === 'arkon-mes' ? j : null; } catch (e: any) { return null; } }
  async function init() {
    const saved = LS.get('server');
    const cands: string[] = saved ? [saved] : (/^https?:$/.test(location.protocol) && location.hostname !== 'arkon.local' ? [location.origin] : []);
    // sayfa yüklenirken ana iş parçacığı meşgulse ilk yoklama gecikebilir: bir kez daha, daha uzun bekleyerek dene
    for (const b of cands) { const j = (await probe(b)) || (await probe(b, 6000)); if (j) { Object.assign(SRV, { on: true, base: b.replace(/\/$/, ''), online: true }); break; } }
    // yanıt yoksa: kayıtlı sunucu ya da oturumun açıldığı sunucu (sayfayı sunan) çevrimdışı kabul edilir; oturum kapatılmaz
    const fb: string | null = saved || (session && session.srv && cands.includes(session.srv) ? session.srv : null);
    if (!SRV.on && fb) Object.assign(SRV, { on: true, base: fb.replace(/\/$/, ''), online: false, lastErr: 'Sunucuya ulaşılamıyor · son kayıtlı veriyle çalışılıyor' });
    if (session && SRV.on && session.srv && session.srv !== SRV.base) setSession(null);
    if (session && !SRV.on && session.token) setSession(null);
    SRV.pending = await bekleyenSay().catch(() => 0);
    if (SRV.on && SRV.online && session && session.token) { try { const me = await api('GET', '/me'); if (me && me.id && session) { session = Object.assign({}, session as Session, { user: oturumKisisi(me) }); LS.set('session', session); } } catch (e: any) {} } // rol / iş merkezi değiştiyse tazele
    if (SRV.on) { openBus(); flush(); }
    if (yerelKayitBudanir(SRV) && !budamaSaati) { budamaSaati = setInterval(yerelKayitlariBuda, 6 * 3600e3); yerelKayitlariBuda(); }
    emit();
    return status();
  }
  let budamaSaati: ReturnType<typeof setInterval> | null = null;
  async function yerelKayitlariBuda(): Promise<void> {
    for (const s of BUDANAN_DEPOLAR) { try { await L.delMany(s, budanacakAnahtarlar(await L.entries(s), Date.now())); } catch (e: any) { console.warn('yerel kayıt budanamadı', s, e); } }
  }
  const Server = {
    async test(url: string) { return probe(url); },
    set(url: string | null) { LS.set('server', url ? url.replace(/\/$/, '') : null); LS.set('session', null); },
    get saved() { return LS.get('server'); },
    flush,
    /** sunuculu kipte malzeme isteği seçicisi: stoklanan aktif malzeme kartları */
    async materials(q: string): Promise<{ id: number; kod: string; ad: string | null; birim: string | null }[]> { return api('GET', '/materials?q=' + encodeURIComponent(q)); },
    /** Çizim Merkezi (kart #800): yayındaki belgeler; Arkon'dan yüklenen dosya merkeze gitmez, yalnız merkezden alınır */
    async merkezBelgeleri(q: string): Promise<MerkezBelgesi[]> { return api('GET', '/merkez/belgeler?q=' + encodeURIComponent(q)); },
    /** merkezdeki yayındaki dosyayı Arkon deposuna kopyalatır ve paket dosya kaydını (bayt dahil) döner */
    async merkezdenAl(belgeId: number): Promise<PkgFile & { bytes: Bytes }> {
      const r = await api('POST', '/merkez/belgeler/' + belgeId + '/al');
      return Object.assign({}, r.kayit, { bytes: await getBlob(r.ozet) });
    },
    async merkezKontrol(dosyalar: { belgeId: number; ozet: string }[]): Promise<MerkezDurumu[]> {
      return api('GET', '/merkez/kontrol?d=' + encodeURIComponent(dosyalar.map(x => x.belgeId + ':' + x.ozet).join(',')));
    },
    /** üretim anomalisi (kart #1149): TMI'de hesaplanır; yetkisi olmayan kişide sunucu 403 verir */
    async anomaliler(): Promise<Anomaliler> { return api('GET', '/anomaliler'); },
    /** gün, hafta, ay istatistiği (kart #1306): TMI'nin kaydettiği günlerden */
    async anomaliIstatistigi(donem: AnomaliDonemi, tarih: string): Promise<AnomaliIstatistigi> {
      return api('GET', '/anomali-istatistik?donem=' + encodeURIComponent(donem) + '&tarih=' + encodeURIComponent(tarih));
    },
    /** Operatör Özetim (kart #1295): kişinin kendi üretimi; başkasını yalnız amir, kendi iş merkezindekini ister */
    async operatorOzeti(donem: OzetDonemi, kisiId?: number | null): Promise<OperatorOzeti> { return api('GET', '/operator-ozeti?donem=' + donem + (kisiId ? '&kisiId=' + kisiId : '')); },
    /** 393 d: emrin istasyonundaki makinelerin ayrımı (başlatmayı reddettirecek olanlar); sunucunun başlatma denetimiyle aynı kural */
    async makineAyrimlari(emirId: number): Promise<MakineAyrimlari | undefined> { return api('GET', '/makine-ayrimlari?emirId=' + emirId); },
    /** refakat kartları (kart #156): istasyonun sıradaki işlerinin emirlerine ait açık kartlar, istasyonda satırı olup olmadığıyla */
    async refakatKartlari(istasyon: string, emirler: readonly number[]): Promise<RefakatKarti[]> {
      if (!emirler.length) return [];
      const c = await api('GET', '/refakat-kartlari?istasyon=' + encodeURIComponent(istasyon) + '&emirler=' + emirler.join(','));
      return (c && c.kartlar) || [];
    },
    /** çağrı bandı (298): oturumdaki kişinin aldığı ekip çağrıları; okunamazsa null (bant hepsini gösterir) */
    async cagriEkiplerim(): Promise<CagriEkiplerim> {
      try { return cagriEkipleriniAl(await api('GET', '/cagri-ekiplerim')); } catch { return null; }
    },
    /** TMI emrinin talimat adımları; işaret TMI'ye yazılır, dönen liste doğruluk kaynağıdır */
    async tmiAdimlari(emirId: number): Promise<TmiAdim[]> { return (await api('GET', '/tmi-adimlar/' + emirId)) || []; },
    async tmiAdimIsaretle(emirId: number, adimId: number, tamam: boolean): Promise<TmiAdim[]> { return api('POST', '/tmi-adimlar/' + emirId + '/' + adimId, { tamam }); },
    /** başlatmadan önce girdi istasyonda mı (kart #1289); eksikse TMI istek açar ve Malzeme · Teslim panelini açar */
    async uretimHazirligi(emirId: number, istasyon: string): Promise<{ hazir: boolean; metin?: string }> { return api('POST', '/uretim-hazirligi', { emirId, istasyon }); }
  };

  /* ── .arkon paket dosyası ve klasör eşitleme ── */
  const Pkg = {
    toFile(p: any): string { return JSON.stringify(Object.assign({}, p, { format: 'arkon-paket', derived: p.derived ? encTA(p.derived) : undefined, files: (p.files || []).map((f: { name: string; kind: string; bytes: Bytes }) => ({ name: f.name, kind: f.kind, size: f.bytes.length, b64: b64(f.bytes) })) })); },
    fromFile(text: string): any { const p = JSON.parse(text); if (p.format !== 'arkon-paket') throw new Error('Bu bir TMI CORE iş paketi değil'); p.files = (p.files || []).map((f: { name: string; kind: string; b64: string }) => ({ name: f.name, kind: f.kind, bytes: unb64(f.b64) })); if (p.derived) p.derived = decTA(p.derived); delete p.format; return p; },
    fileName(p: { no?: string; rev?: string }): string { return (p.no || 'paket').replace(/[^\wİıŞşĞğÜüÖöÇç.-]+/g, '_') + '_rev' + (p.rev || '-') + '.arkon'; }
  };
  const Folder = {
    supported: typeof window.showDirectoryPicker === 'function',
    async handle() { try { return await L.get('kv', 'folder'); } catch (e: any) { return null; } },
    async pick() { const h = await window.showDirectoryPicker!({ id: 'arkon-paketler', mode: 'readwrite' }); await L.put('kv', h, 'folder'); return h; },
    async ready(h: any, ask?: boolean): Promise<boolean> { if (!h) return false; const o = { mode: 'readwrite' }; if ((await h.queryPermission(o)) === 'granted') return true; if (ask) return (await h.requestPermission(o)) === 'granted'; return false; },
    async write(h: any, p: any): Promise<void> { const fh = await h.getFileHandle(Pkg.fileName(p), { create: true }); const w = await fh.createWritable(); await w.write(Pkg.toFile(p)); await w.close(); },
    async writeRaw(h: any, name: string, bytes: Bytes | string): Promise<void> { const fh = await h.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(bytes); await w.close(); },
    async scan(h: any): Promise<any[]> { const out: any[] = []; for await (const [name, e] of h.entries()) { if (e.kind === 'file' && /\.arkon$/i.test(name)) { try { const f = await e.getFile(); out.push(Object.assign(Pkg.fromFile(await f.text()), { _file: name, _mtime: f.lastModified })); } catch (x) {} } } return out; }
  };

  /* dönüşüm önbelleği (her zaman cihazda): PDF sayfa görüntüleri, STEP resim/3B ağları — en yeni 60 kayıt */
  const CMAX = 60;
  const Cache = {
    async get(k: string): Promise<any> { try { const r = await L.get('cache', k); if (!r) return null; r.at = Date.now(); L.put('cache', r, k).catch(() => {}); return r.v; } catch (e: any) { return null; } },
    async put(k: string, v: unknown): Promise<void> { try { await L.put('cache', { v, at: Date.now() }, k); Cache.prune(); } catch (e: any) { console.warn('önbellek yazılamadı', e); } },
    async prune() { try { if (useMem) return; const d = await open(); if (!d) return; const keys = await tx('cache', 'readonly', s => s.getAllKeys()); if (keys.length <= CMAX) return; const all: [Key, number][] = await Promise.all(keys.map(async (k: Key): Promise<[Key, number]> => [k, ((await L.get('cache', k)) || {}).at || 0])); all.sort((a, b) => a[1] - b[1]); for (const [k] of all.slice(0, all.length - CMAX)) await L.del('cache', k); } catch (e: any) {} },
    async clear() { try { await L.clear('cache'); } catch (e: any) {} },
    async stats() { try { const keys = await tx('cache', 'readonly', s => s.getAllKeys()); return { n: keys.length }; } catch (e: any) { return { n: 0 }; } }
  };

  // Arkon Planlama'dan TMI işinin sırası plan taslağına (A4); yalnız TMI'ye bağlıyken.
  const Plan = {
    sirala: (g: { kaynak: { tur: string; id: number }; onceki: number[]; yeni: number[]; planSurumu: number }) => api('POST', '/plan-sira', g),
    surum: (): Promise<{ planSurumu: number }> => api('GET', '/plan-sira'),
  };
  export const AKStore = { DB, Bus, Pkg, Folder, Cache, Log, Auth, Backup, Server, Plan, init, status, onStatus(f: (s: Status) => void) { statusSubs.add(f); return () => { statusSubs.delete(f); }; }, local: L, sha256, encTA, decTA, merge3 };
(window as any).AKStore = AKStore;
