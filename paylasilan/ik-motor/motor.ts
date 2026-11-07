// İK hesap motorunun tek kaynağıdır (211 a): bordro, izin, tazminat ve parametre dönemi hesaplarını ekran (tahmin) ve sunucu
// (kesinleştirme) aynı koddan yapar (kaynak: ik-modulu src/core). Ekranın kullandığı tipli yüz arayuz.ts'tedir.
/**
 * İK Modülü – hesap motoru.
 *
 * createEngine(db, hooks) veri kaynağına bağlı bir motor üretir. Tüm bordro, izin, tazminat,
 * yan hak, teşvik ve ilan hesapları buradadır; arayüz ve sunucu aynı motoru kullanır.
 *
 *   db    = { all(kind) => kayıt[], get(id) => kayıt|null, settings() => ayarlar }
 *   hooks = { draft(ym, empId) => taslak bordro girdisi|null, unlocked(ym) => boolean }  (isteğe bağlı)
 *
 * Kayıt türleri (kind): emp, dept, leave, att, pay, perf, train, job, cand, intv, asset.
 */
import * as F from './bicim.ts';
import * as C from './sabitler.ts';

// Kayıt ve ayar alanları ekrandan ve tablodan olduğu gibi gelir: sayı alanı metin, boş metin ya da eksik olabilir. Bu yüzden
// sayı alanları `unknown`dur ve hesapta `num` ile okunur; motor alanı yeniden biçimlendirmez.
export type Ayarlar = Readonly<Record<string, unknown>>;
export interface Kayit { id: string; kind: string; [alan: string]: unknown }
export interface UcretSatiri { tarih?: string; brut?: unknown }
export interface Personel extends Kayit {
  ad?: string; soyad?: string; pozisyon?: string; yakaTipi?: string; kademe?: string; durum?: string;
  iseGiris?: string; cikisTarihi?: string; dogumTarihi?: string; brutMaas?: unknown; ucretGecmisi?: UcretSatiri[];
  devredenIzin?: unknown; oncekiKullanim?: unknown; engelDurumu?: unknown; besKatilim?: unknown; tesvikId?: string;
  primler?: Readonly<Record<string, { aktif?: boolean; deger?: unknown } | undefined>>;
  belgeler?: Readonly<Record<string, { ok?: unknown } | undefined>>;
}
export interface Izin extends Kayit { empId?: string; tur?: string; durum?: string; baslangic?: string; bitis?: string; gun?: unknown }
export interface Puantaj extends Kayit { empId?: string; tarih?: string; tur?: string; saat?: unknown }
export interface BordroKaydi extends Kayit {
  donem?: string; snap?: Readonly<Record<string, unknown>>; paramAd?: unknown;
  brut?: unknown; gun?: unknown; ek?: unknown; mesaiSaat?: unknown; tatilSaat?: unknown; kesinti?: unknown;
}
export interface Ilan {
  [alan: string]: unknown;
  ilanKodu?: string; ilanBaslik?: string; baslik?: string; ozet?: string; durum?: string; sonBasvuru?: string; departmanId?: string;
  lokasyon?: string; calismaSekli?: string; calismaTuru?: string; basvuruEposta?: string; basvuruLink?: string;
}
export interface Kanal { id?: string; ad?: unknown; url?: string; kod?: string; aktif?: boolean }
export interface Donem { id: string; ad?: string; baslangic?: string; not?: string; params?: Readonly<Record<string, unknown>> }
export interface Prim { id: string; ad?: string; tur?: string; deger?: unknown; siklik?: string; aylar?: unknown; atama?: string; kidem?: unknown }
export interface Tesvik { id?: string; ad?: string; tur?: string; deger?: unknown }
// Bordro girdisi: kayıtlı, taslak ya da otomatik (`_src`); `emp`, `Y`, `M` varsa yan hak ve teşvik kişiden hesaplanır.
export interface Girdi {
  [alan: string]: unknown;
  brut?: unknown; gun?: unknown; ek?: unknown; mesaiSaat?: unknown; tatilSaat?: unknown; kesinti?: unknown;
  engelliInd?: unknown; bes?: unknown; primDetay?: unknown; emp?: Personel; Y?: number; M?: number; _src?: string;
}
export interface YanHakAyari { yontem: unknown; hesap: unknown; deger: number; kisisel?: boolean }
export interface YanHak { tutar: number; gvIst: number; sgkIst: number; ayni: boolean; yontem?: unknown; fg?: number; hizmet?: boolean }
export interface KidemGirdisi { giris?: string; cikis?: string; brut?: unknown; yanHak?: unknown; kod?: unknown; cum?: unknown; izinGun?: unknown }
export interface VeriKaynagi {
  all(kind: string): Kayit[] | null | undefined;
  get(id: string): Kayit | null | undefined;
  settings(): Ayarlar | null | undefined;
}
export interface Kancalar {
  draft?: (ym: string, empId: string) => Girdi | null;
  unlocked?: (ym: string) => boolean;
}

export function createEngine(db: VeriKaynagi, hooks: Kancalar = {}){
  const { esc, pad, num, lower, today, pd, ymd, addDays, addYears, diffDays, fullYears, durationParts, MONTHS, fmtDate, fmtDateShort, fmtMoney, fmtNum, lines, deep } = F;
  const { DEFAULT_SETTINGS, PERIOD_KEYS, KIDEM_CODES, PRIM_TUR, collarOf } = C;
  const all = (kind: string): Kayit[] => db.all(kind) || [];
  const get = (id: unknown): Kayit | null => id ? (db.get(id as string) || null) : null;
  // Türün kayıtları; tür alanları yukarıdaki arayüzlerdedir.
  const kayitlar = <T extends Kayit>(kind: string): T[] => all(kind) as T[];
  function pickParams(src: Ayarlar): Record<string, unknown> { const p: Record<string, unknown> = {}; PERIOD_KEYS.forEach(k => { if(src[k] !== undefined) p[k] = deep(src[k]); }); return p; }
  const _pc: { src: Ayarlar | null; base: Ayarlar; def: Donem[] | null; merged: Map<string, Ayarlar>; day: string; active: Ayarlar | null } = {src:null, base:{}, def:null, merged:new Map(), day:'', active:null};
  function _pcCheck(){ const raw = db.settings() || {}; if(_pc.src !== raw){ _pc.src = raw; _pc.base = {...DEFAULT_SETTINGS, ...raw}; _pc.def = null; _pc.merged = new Map(); _pc.active = null; } }
  function periods(): Donem[] {
    _pcCheck(); const d = _pc.base['donemler'];
    if(Array.isArray(d) && d.length) return (d as Donem[]).slice().sort((a, b) => (a.baslangic || '').localeCompare(b.baslangic || ''));
    if(!_pc.def){ const p = pickParams(_pc.base); _pc.def = [
      {id:'d2026a', ad:'2026 Ocak–Haziran', baslangic:'2026-01-01', not:'Kıdem tavanı 64.948,77 TL; nakit yemek SGK istisnası günlük 158 TL.', params:{...deep(p), kidemTavan:64948.77, yemekSgkNakit:158}},
      {id:'d2026b', ad:'2026 Temmuz–Aralık', baslangic:'2026-07-01', not:'Kıdem tavanı 73.729,84 TL; nakit yemek SGK istisnası günlük 300 TL (7577 sayılı Kanun).', params:deep(p)}]; }
    return _pc.def;
  }
  function periodAt(dateStr: string): Donem { const ps = periods(); let r = ps[0]!; for(const p of ps){ if((p.baslangic || '') <= dateStr) r = p; } return r; }
  function periodEnd(p: Donem): string | null { const ps = periods(); const i = ps.findIndex(x => x.id === p.id); const n = ps[i + 1]; return n ? ymd(addDays(pd(n.baslangic) as Date, -1)) : null; }
  function settingsFor(p: Donem | null | undefined): Ayarlar { _pcCheck(); if(!p) return _pc.base; let m = _pc.merged.get(p.id); if(!m){ m = {..._pc.base, ...deep(p.params || {})}; _pc.merged.set(p.id, m); } return m; }
  let _pctx: Ayarlar | null = null;
  function S(): Ayarlar { if(_pctx) return _pctx; _pcCheck(); const d = ymd(today()); if(_pc.day !== d || !_pc.active){ _pc.day = d; _pc.active = settingsFor(periodAt(d)); } return _pc.active; }
  function withPeriod<T>(dateStr: string | null | undefined, fn: () => T): T { const prev = _pctx; _pctx = settingsFor(periodAt(dateStr || ymd(today()))); try{ return fn(); } finally{ _pctx = prev; } }
  function periodStatus(p: Donem): { k: 'past' | 'future' | 'active'; l: string; lock: string } {
    const t = ymd(today()); const end = periodEnd(p);
    if(end && end < t) return {k:'past', l:'Geçmiş dönem', lock:'Bu dönem sona erdi. Geçmiş hesapların bozulmaması için parametreleri kilitlidir.'};
    const saved = kayitlar<BordroKaydi>('pay').filter(r => r.snap && r.donem && (r.donem + '-01') >= (p.baslangic as string) && (!end || (r.donem + '-01') <= end));
    if((p.baslangic as string) > t) return {k:'future', l:'Gelecek dönem', lock: saved.length ? 'Bu dönemde kesinleşmiş bordro var.' : ''};
    return {k:'active', l:'Geçerli dönem', lock: saved.length ? `Bu dönemde kesinleşmiş ${[...new Set(saved.map(r => r.donem))].length} aylık bordro var. Değişiklik geçmiş bordroları bozacağı için parametreler kilitli; değişikliği ileri tarihli yeni bir dönemle yapın.` : ''};
  }
  /* Ücret geçmişi */
  function salaryHist(e: Personel | null | undefined): UcretSatiri[] { return (e && Array.isArray(e.ucretGecmisi) ? e.ucretGecmisi : []).slice().sort((a, b) => (a.tarih || '').localeCompare(b.tarih || '')); }
  function salaryAt(e: Personel | null | undefined, dateStr: string): number { const h = salaryHist(e); if(!h.length) return num(e && e.brutMaas); let r = h[0]!; for(const x of h){ if((x.tarih as string) <= dateStr) r = x; } return num(r.brut); }
  const curBrut = (e: Personel | null | undefined): number => salaryAt(e, ymd(today()));
  function nextRaise(e: Personel | null | undefined): UcretSatiri | null { const t = ymd(today()); return salaryHist(e).find(x => (x.tarih as string) > t) || null; }
  const fullName = (e: Personel | null | undefined): string => e ? (`${e.ad||''} ${e.soyad||''}`.trim() || 'İsimsiz') : '—';
  const empName = (id: unknown): string => { const e = get(id); return e ? fullName(e) : '—'; };
  const deptName = (id: unknown): unknown => get(id)?.['ad'] || '—';
  function isActive(e: Personel | null | undefined, at: Date = today()): boolean {
    if(!e) return false; const g = pd(e.iseGiris); if(g && g > at) return false;
    const c = pd(e.cikisTarihi); if(c && c < at) return false;
    if(e.durum === 'Ayrıldı' && (!c || c < at)) return false;
    return true;
  }
  function employedInMonth(e: Personel, Y: number, M: number): boolean {
    const ms = new Date(Y, M-1, 1), me = new Date(Y, M, 0);
    const g = pd(e.iseGiris); if(g && g > me) return false;
    const c = pd(e.cikisTarihi); if(c && c < ms) return false;
    if(!c && e.durum === 'Ayrıldı') return false;
    return true;
  }
  const activeEmps = (): Personel[] => kayitlar<Personel>('emp').filter(e => isActive(e)).sort((a,b) => fullName(a).localeCompare(fullName(b), 'tr'));
  const sortedEmps = (): Personel[] => kayitlar<Personel>('emp').sort((a,b) => (Number(isActive(b)) - Number(isActive(a))) || fullName(a).localeCompare(fullName(b), 'tr'));
  const sortedDepts = (): Kayit[] => kayitlar<Kayit & { ad?: string }>('dept').sort((a,b) => (a.ad||'').localeCompare(b.ad||'', 'tr'));
  const docList = (): string[] => lines(S()['belgeler']);
  const criteria = (): string[] => lines(S()['perfKriterler']);

  let _hol: { key: unknown; full: Set<string>; md: Set<string> } = {key:null, full:new Set(), md:new Set()};
  function holidays(): { key: unknown; full: Set<string>; md: Set<string> } {
    const key = S()['tatiller']; if(_hol.key === key) return _hol;
    const full = new Set<string>(), md = new Set<string>();
    lines(key).forEach(l => { const m = l.match(/^(\d{4}-\d{2}-\d{2})/); if(m){ full.add(m[1]!); return; } const k = l.match(/^(\d{2}-\d{2})/); if(k) md.add(k[1]!); });
    _hol = {key, full, md}; return _hol;
  }
  function isHoliday(d: Date): boolean { const h = holidays(); const s = ymd(d); return h.full.has(s) || h.md.has(s.slice(5)); }
  function isWorkday(d: Date): boolean { const w = d.getDay(); if(w === 0) return false; if(w === 6 && !S()['cumartesiIsGunu']) return false; return !isHoliday(d); }
  function countDays(a: Date | null | undefined, b: Date | null | undefined, workOnly?: unknown): number {
    if(!a || !b || b < a) return 0; let n = 0;
    for(let d = new Date(a); d <= b; d = addDays(d, 1)){ if(!workOnly || isWorkday(d)) n++; if(n > 2000) break; }
    return n;
  }
  function annualBase(k: number): number { const s = S(); return k <= 5 ? (num(s['izin1']) || 14) : k < 15 ? (num(s['izin2']) || 20) : (num(s['izin3']) || 26); }
  const ageMin = (): number => num(S()['izinYasMin']) || 20;
  function leaveBalance(e: Personel, at: Date = today()){
    const g = pd(e.iseGiris); const rows: { k: number; ann: Date; d: number; note: string }[] = []; let hak = 0, n = 0;
    if(g){
      const c = pd(e.cikisTarihi); const end = c && c < at ? c : at; n = Math.max(0, fullYears(g, end)); const dob = pd(e.dogumTarihi);
      for(let k = 1; k <= n; k++){ const ann = addYears(g, k); let d = withPeriod(ymd(ann), () => annualBase(k)); let note = ''; if(dob){ const age = fullYears(dob, ann); if(age <= 18 || age >= 50){ if(d < ageMin()) note = age <= 18 ? '18 yaş ve altı' : '50 yaş ve üzeri'; d = Math.max(d, ageMin()); } } hak += d; rows.push({k, ann, d, note}); }
    }
    const mine = kayitlar<Izin>('leave').filter(l => l.empId === e.id && l.tur === 'Yıllık izin');
    const used = mine.filter(l => l.durum === 'Onaylandı').reduce((s,l) => s + num(l.gun), 0);
    const pending = mine.filter(l => l.durum === 'Beklemede').reduce((s,l) => s + num(l.gun), 0);
    const devir = num(e.devredenIzin); const onceki = num(e.oncekiKullanim);
    let next: Date | null = null, nextDays = 0;
    if(g && isActive(e, at)){ next = addYears(g, n+1); nextDays = withPeriod(ymd(next), () => annualBase(n+1)); const dob = pd(e.dogumTarihi); if(dob){ const age = fullYears(dob, next); if(age <= 18 || age >= 50) nextDays = Math.max(nextDays, ageMin()); } }
    return {hak, devir, onceki, used, pending, kalan: hak + devir - onceki - used, rows, next, nextDays, years:n};
  }
  function brackets(): [number, number][] {
    return lines(S()['dilimler']).map((l): [number, number] => { const [a,b] = l.split(':'); const lim = num(a); return [lim > 0 ? lim : Infinity, num(b)]; }).sort((x,y) => x[0]-y[0]);
  }
  function taxOn(x: number): number { let t = 0, prev = 0; for(const [lim, r] of brackets()){ if(x <= prev) break; const top = Math.min(x, lim); t += (top - prev) * r / 100; prev = lim; } return t; }
  function calcMonth(inp: Girdi, cum: number, m: number, aCumIn?: number){
    const s = S(); const aylik = num(inp.brut); const gun = inp.gun === undefined || inp.gun === null || inp.gun === '' ? 30 : Math.max(0, Math.min(30, num(inp.gun)));
    const brut = aylik / 30 * gun; const hourly = aylik / (num(s.aylikSaat) || 225);
    const mesaiUcret = num(inp.mesaiSaat) * hourly * (num(s.mesaiCarpan) || 1.5) + num(inp.tatilSaat) * hourly * (num(s.ubgtCarpan) || 1);
    const ek = num(inp.ek); const ucret = brut + ek + mesaiUcret;
    let yemek: YanHak | null = null, yol: YanHak | null = null;
    if(inp.emp){ const fg = fiiliGun(inp.emp, inp.Y as number, inp.M as number); yemek = benefitCalc('yemek', benefitCfg(inp.emp, 'yemek'), aylik, fg); yol = benefitCalc('yol', benefitCfg(inp.emp, 'yol'), aylik, fg); }
    const bx = (b: YanHak | null): YanHak => b || {tutar:0, gvIst:0, sgkIst:0, ayni:false};
    const Y1 = bx(yemek), Y2 = bx(yol);
    const yanTutar = Y1.tutar + Y2.tutar, yanSgkTabi = (Y1.tutar - Y1.sgkIst) + (Y2.tutar - Y2.sgkIst), yanGvTabi = (Y1.tutar - Y1.gvIst) + (Y2.tutar - Y2.gvIst);
    const toplam = ucret + yanTutar;
    const tavan = (num(s.sgkTavan) || Infinity) / 30 * gun; const sgkMatrah = Math.min(ucret + yanSgkTabi, tavan);
    const sgk = sgkMatrah * num(s.sgkIsciOran) / 100, iss = sgkMatrah * num(s.issizlikIsciOran) / 100;
    const ind = num(inp.engelliInd); const matrah = Math.max(0, ucret + yanGvTabi - sgk - iss - ind);
    const gvHam = taxOn(cum + matrah) - taxOn(cum);
    const aMatFull = num(s.asgariBrut) * (1 - (num(s.sgkIsciOran) + num(s.issizlikIsciOran)) / 100); const aMat = aMatFull / 30 * gun;
    const aCum = aCumIn === undefined ? aMatFull * (m - 1) : aCumIn;
    const gvIst = Math.min(gvHam, taxOn(aCum + aMat) - taxOn(aCum)); const gv = Math.max(0, gvHam - gvIst);
    const dvHam = (ucret + yanGvTabi) * num(s.damgaOran) / 100; const dvIst = Math.min(dvHam, num(s.asgariBrut) / 30 * gun * num(s.damgaOran) / 100); const dv = Math.max(0, dvHam - dvIst);
    const bes = inp.bes ? sgkMatrah * (num(s.besOran) || 0) / 100 : 0;
    const kesinti = num(inp.kesinti); const net = toplam - sgk - iss - gv - dv - bes - kesinti;
    const ayni = (Y1.ayni ? Y1.tutar : 0) + (Y2.ayni ? Y2.tutar : 0); const banka = net - ayni;
    const tv = inp.emp ? tesvikOf(inp.emp) : tesvikById(s['varsayilanTesvik']);
    const isvBrut = sgkMatrah * num(s.sgkIsverenOran) / 100; let tInd = 0;
    if(tv){ if(tv.tur === 'puan') tInd = sgkMatrah * num(tv.deger) / 100; else if(tv.tur === 'asgari') tInd = Math.min(isvBrut, num(s.asgariBrut) / 30 * gun * num(s.sgkIsverenOran) / 100); else if(tv.tur === 'sabit') tInd = Math.min(isvBrut, num(tv.deger)); }
    const isvSgk = isvBrut - tInd, isvIss = sgkMatrah * num(s.issizlikIsverenOran) / 100;
    return {aylik, gun, brut, ek, mesaiUcret, ucret, yemek, yol, yanTutar, toplam, sgkMatrah, sgk, iss, ind, matrah, cumOnce:cum, gvHam, gvIst, gv, dvHam, dvIst, dv, bes, kesinti, net, ayni, banka, isvBrut, tesvik: tv && tv.tur !== 'yok' ? tv : null, tInd, isvSgk, isvIss, maliyet: toplam + isvSgk + isvIss, aMat, primDetay: inp.primDetay || null};
  }
  function attHours(empId: unknown, ym: string, types: readonly string[]): number { return kayitlar<Puantaj>('att').filter(a => a.empId === empId && (a.tarih||'').slice(0,7) === ym && types.includes(a.tur as string)).reduce((s,a) => s + num(a.saat), 0); }
  function autoDaysInfo(e: Personel, Y: number, M: number): { gun: number; why: string[]; rapor?: number; ucretsiz?: number; eksik?: number } {
    const ms = new Date(Y, M - 1, 1), me = new Date(Y, M, 0); const g = pd(e.iseGiris), c = pd(e.cikisTarihi);
    const st = g && g > ms ? g : ms; const en = c && c < me ? c : me; if(en < st) return {gun:0, why:['Bu ay çalışmadı']};
    const full = +st === +ms && +en === +me; const cal = diffDays(st, en) + 1; const why: string[] = [];
    const base = full ? 30 : Math.min(30, cal); if(!full){ if(g && g > ms) why.push(`İşe giriş ${fmtDateShort(g)}`); if(c && c < me) why.push(`İşten çıkış ${fmtDateShort(c)}`); }
    const types = ['Ücretsiz izin'].concat(S()['raporKesinti'] === false ? [] : ['Hastalık / rapor']); let ek = 0, rapor = 0, ucretsiz = 0;
    kayitlar<Izin>('leave').filter(l => l.empId === e.id && l.durum === 'Onaylandı' && types.includes(l.tur as string)).forEach(l => { const a = pd(l.baslangic), b = pd(l.bitis); if(!a || !b) return; const x = a > st ? a : st, y = b < en ? b : en; if(y >= x){ const n = diffDays(x, y) + 1; ek += n; why.push(`${l.tur}: ${n} gün`); if(l.tur === 'Hastalık / rapor') rapor += n; else ucretsiz += n; } });
    if(ek >= cal) return {gun:0, why, rapor, ucretsiz, eksik:cal};
    const gun = Math.max(0, Math.min(30, base - ek)); return {gun, why, rapor, ucretsiz, eksik: full ? 30 - gun : 0};
  }
  function engelliIndirim(e: Personel | null | undefined): number { const d = String(e?.engelDurumu || ''); const s = S(); return d.startsWith('1.') ? num(s['engelliInd1']) : d.startsWith('2.') ? num(s['engelliInd2']) : d.startsWith('3.') ? num(s['engelliInd3']) : 0; }
  function payInputs(e: Personel, Y: number, M: number): Girdi | null {
    const ym = Y + '-' + pad(M); const draft = hooks.draft ? hooks.draft(ym, e.id) : null; const rec = get(`pay_${e.id}_${ym}`) as BordroKaydi | null;
    const fixed = {engelliInd: engelliIndirim(e), bes: !!e.besKatilim, emp:e, Y, M};
    if(draft) return {...draft, ...fixed, gun: draft.gun ?? autoDaysInfo(e, Y, M).gun, _src:'draft'};
    if(rec) return {brut:rec.brut, ek:rec.ek, mesaiSaat:rec.mesaiSaat, tatilSaat:rec.tatilSaat, kesinti:rec.kesinti, gun: rec.gun ?? autoDaysInfo(e, Y, M).gun, ...fixed, _src:'saved'};
    if(!employedInMonth(e, Y, M)) return null;
    const bAy = salaryAt(e, ym + '-01'); const pr = primFor(e, M, bAy);
    return {brut: bAy, gun: autoDaysInfo(e, Y, M).gun, ek: Math.round(pr.toplam * 100) / 100, primDetay: pr.items, mesaiSaat: attHours(e.id, ym, ['Fazla mesai','Hafta tatili çalışması']), tatilSaat: attHours(e.id, ym, ['Resmi tatil çalışması']), kesinti:0, ...fixed, _src:'auto'};
  }
  function payroll(e: Personel, ym: string): Record<string, unknown> | null {
    const [Y, M] = ym.split('-').map(Number) as [number, number]; let cum = 0, aCum = 0, res: Record<string, unknown> | null = null;
    for(let m = 1; m <= M; m++){
      const ymm = Y + '-' + pad(m); const rec = get(`pay_${e.id}_${ymm}`) as BordroKaydi | null; const draft = hooks.draft ? hooks.draft(ymm, e.id) : null;
      if(rec && rec.snap && !draft && !(hooks.unlocked && hooks.unlocked(ymm))){ const r = rec.snap; cum += num(r.matrah); aCum += num(r.aMat); if(m === M) res = {...r, inp:{brut:rec.brut, gun:rec.gun, ek:rec.ek, mesaiSaat:rec.mesaiSaat, tatilSaat:rec.tatilSaat, kesinti:rec.kesinti, _src:'locked'}, locked:true, paramAd: rec.paramAd}; continue; }
      const out = withPeriod(ymm + '-01', () => { const inp = payInputs(e, Y, m); if(!inp) return null; return {inp, r: calcMonth(inp, cum, m, aCum)}; });
      if(!out){ if(m === M) return null; continue; }
      cum += out.r.matrah; aCum += out.r.aMat; if(m === M) res = {...out.r, inp: out.inp, paramAd: periodAt(ymm + '-01').ad};
    }
    return res;
  }
  function missingDocs(e: Personel): string[] { const b = e.belgeler || {}; return docList().filter(d => !b[d]?.ok); }
  function fiiliGun(e: Personel, Y: number, M: number): number {
    const ms = new Date(Y, M - 1, 1), me = new Date(Y, M, 0); const g = pd(e.iseGiris), c = pd(e.cikisTarihi);
    const st = g && g > ms ? g : ms; const en = c && c < me ? c : me; if(en < st) return 0;
    const lv = kayitlar<Izin>('leave').filter(l => l.empId === e.id && l.durum === 'Onaylandı'); let n = 0;
    // Tarihi eksik izinde pd null döner; karşılaştırma null'ı 0 sayar (izin başlangıcı geçmiş, bitişi gelmemiş sayılmaz).
    for(let d = new Date(st); d <= en; d = addDays(d, 1)){ if(!isWorkday(d)) continue; if(lv.some(l => (pd(l.baslangic) as Date) <= d && (pd(l.bitis) as Date) >= d)) continue; n++; }
    return n;
  }
  function benefitCfg(e: Personel | null | undefined, kind: string): YanHakAyari {
    const s = S(); const own = e && e[kind + 'Yontem'] && e[kind + 'Yontem'] !== 'Genel ayar';
    const dv = e && e[kind + 'Deger'] !== '' && e[kind + 'Deger'] != null ? num(e[kind + 'Deger']) : num(s[kind + 'Deger']);
    return {yontem: own ? e![kind + 'Yontem'] : s[kind + 'Yontem'], hesap: (e && e[kind + 'Hesap']) || s[kind + 'Hesap'], deger: dv, kisisel: !!own};
  }
  function benefitCalc(kind: string, cfg: YanHakAyari, aylikBrut: number, fg: number): YanHak | null {
    const s = S(); const y = cfg.yontem; if(!y || y === 'Yok') return null;
    if(y === 'İşyerinde yemek' || y === 'Servis') return {tutar:0, gvIst:0, sgkIst:0, ayni:true, yontem:y, fg, hizmet:true};
    const tutar = cfg.hesap === 'Aylık sabit tutar' ? cfg.deger : cfg.hesap === 'Brüt ücretin yüzdesi' ? aylikBrut * cfg.deger / 100 : cfg.deger * fg;
    let gvLim = 0, sgkLim = 0;
    if(kind === 'yemek'){ if(y === 'Nakit'){ gvLim = num(s['yemekGvNakit']) * fg; sgkLim = num(s['yemekSgkNakit']) * fg; } else { gvLim = num(s['yemekGvKart']) * fg; sgkLim = s['yemekSgkKart'] === 'tamami' ? Infinity : num(s['yemekSgkLimit']) * fg; } }
    else if(y !== 'Nakit'){ gvLim = num(s['yolGvKart']) * fg; sgkLim = s['yolSgkKart'] === 'tamami' ? Infinity : s['yolSgkKart'] === 'limit' ? num(s['yolGvKart']) * fg : 0; }
    return {tutar, gvIst: Math.min(tutar, gvLim), sgkIst: Math.min(tutar, sgkLim), ayni: y !== 'Nakit', yontem:y, fg};
  }
  function benefitMonthly(e: Personel): number {
    const t = today(); const Y = t.getFullYear(), M = t.getMonth() + 1; const wd = countDays(new Date(Y, M - 1, 1), new Date(Y, M, 0), true);
    return ['yemek','yol'].reduce((sum, k) => { const b = benefitCalc(k, benefitCfg(e, k), curBrut(e), wd); return sum + (b ? b.tutar : 0); }, 0);
  }
  // Ayardaki liste (prim, teşvik, ilan kanalı); ayarda dizi yoksa motorun varsayılanı, o da yoksa undefined.
  const settingsList = <T = unknown>(k: string): T[] => (Array.isArray(S()[k]) ? S()[k] : (DEFAULT_SETTINGS as Ayarlar)[k]) as T[];
  function tesvikById(id: unknown): Tesvik | null { return settingsList<Tesvik>('tesvikler').find(t => t.id === id) || null; }
  function tesvikOf(e: Personel | null | undefined): Tesvik | null { return (e && e.tesvikId && tesvikById(e.tesvikId)) || tesvikById(S()['varsayilanTesvik']); }
  function primMonths(p: Prim): number[] { if(p.siklik === 'ceyrek') return [3,6,9,12]; if(p.siklik === 'yarim') return [6,12]; if(p.siklik === 'yillik') return [Math.min(12, Math.max(1, parseInt(p.aylar as string, 10) || 12))]; if(p.siklik === 'ozel') return String(p.aylar || '').split(/[,;\s]+/).map(x => parseInt(x, 10)).filter(x => x >= 1 && x <= 12); return [1,2,3,4,5,6,7,8,9,10,11,12]; }
  function primAmount(p: Prim, aylikBrut: number, override?: unknown): number { const v = override !== undefined && override !== null && override !== '' ? num(override) : num(p.deger); return p.tur === 'oran' ? aylikBrut * v / 100 : p.tur === 'maas' ? aylikBrut * v : v; }
  function primDefaultOn(p: Prim, e: Personel | null | undefined): boolean { return p.atama === 'herkes' || (p.atama === 'beyaz' && collarOf(e) === 'Beyaz yaka') || (p.atama === 'mavi' && collarOf(e) === 'Mavi yaka'); }
  function empPrims(e: Personel | null | undefined): { p: Prim; v: unknown }[] { const own = (e && e.primler) || {}; return settingsList<Prim>('primler').map(p => { const o = own[p.id]; const on = o && o.aktif !== undefined ? o.aktif : primDefaultOn(p, e); return on ? {p, v: o ? o.deger : undefined} : null; }).filter((x): x is { p: Prim; v: unknown } => Boolean(x)); }
  function primFor(e: Personel | null | undefined, M: number, aylikBrut: number): { items: { ad: string | undefined; tutar: number }[]; toplam: number } { const items = empPrims(e).filter(x => primMonths(x.p).includes(M)).map(x => ({ad:x.p.ad, tutar: primAmount(x.p, aylikBrut, x.v)})); return {items, toplam: items.reduce((a, x) => a + x.tutar, 0)}; }
  function primMonthlyKidem(e: Personel | null | undefined): number { return empPrims(e).filter(x => x.p.kidem).reduce((a, x) => a + primAmount(x.p, curBrut(e), x.v) * primMonths(x.p).length / 12, 0); }
  function primDesc(p: Prim): string { const t = PRIM_TUR.find(x => x[0] === p.tur)?.[0]; const val = t === 'oran' ? `brütün %${fmtNum(num(p.deger))}’i` : t === 'maas' ? `${fmtNum(num(p.deger))} maaş` : fmtMoney(num(p.deger), true); const ay = primMonths(p).map(m => MONTHS[m - 1]!.slice(0, 3)).join(', '); return `${val}; ${p.siklik === 'her' ? 'her ay' : ay}`; }
  const P = (k: string): number => num(S()[k]);
  function noticeWeeks(months: number, d=1): number { const w = [P('ihbar1') || 2, P('ihbar2') || 4, P('ihbar3') || 6, P('ihbar4') || 8] as const; const upTo = (x: number): boolean => months < x || (months === x && d === 0); return months < 6 ? w[0] : upTo(18) ? w[1] : upTo(36) ? w[2] : w[3]; }
  const sgkIsverenEtkin = (): number => { const t = tesvikById(S()['varsayilanTesvik']); return Math.max(0, P('sgkIsverenOran') - (t && t.tur === 'puan' ? num(t.deger) : 0)); };
  const exitCodeOf = (k: unknown): string => String(k || '').slice(0, 2);
  function noticeRule(code: string): { due: '' | 'isci' | 'isveren' | 'yok'; text: string } {
    if(code === '04') return {due:'isci', text:'İşveren haklı bir neden olmadan ve bildirim süresi tanımadan sözleşmeyi feshettiğinde ihbar tazminatını işçiye öder.'};
    if(code === '03') return {due:'isveren', text:'İşçi bildirim süresine uymadan istifa ederse ihbar tazminatını işverene öder. Süreye uyarak ayrılırsa ihbar tazminatı doğmaz.'};
    if(!code) return {due:'', text:'İhbar tazminatı, sözleşmeyi bildirim süresine uymadan fesheden tarafın karşı tarafa ödediği tazminattır.'};
    return {due:'yok', text:'Seçilen çıkış nedeninde (haklı fesih, sürenin bitmesi, emeklilik, ölüm vb.) genellikle ihbar tazminatı doğmaz.'};
  }
  function severance(inp: KidemGirdisi): ReturnType<typeof severanceCore> { return withPeriod(inp.cikis || ymd(today()), () => severanceCore(inp)); }
  function severanceCore(inp: KidemGirdisi){
    const g = pd(inp.giris), c = pd(inp.cikis); if(!g || !c || c < g) return null;
    const p = durationParts(g, addDays(c, 1)); const days = diffDays(g, c) + 1; const months = p.y * 12 + p.m;
    const brut = num(inp.brut), yan = num(inp.yanHak); const giy = brut + yan; const tavan = P('kidemTavan') || Infinity; const esas = Math.min(giy, tavan);
    const code = exitCodeOf(inp.kod); const codeOk = !code || KIDEM_CODES.includes(code); const yearOk = p.y >= 1;
    const kYil = esas * p.y, kAy = esas / 12 * p.m, kGun = esas / 365 * p.d; const kBrut = yearOk && codeOk ? kYil + kAy + kGun : 0;
    const dvR = P('damgaOran') / 100; const kDv = kBrut * dvR;
    const weeks = noticeWeeks(months, p.d); const nDays = weeks * 7; const daily = giy / 30; const nBrut = daily * nDays; const rule = noticeRule(code);
    const cum = inp.cum === '' || inp.cum == null ? Math.max(0, brut * (1 - (P('sgkIsciOran') + P('issizlikIsciOran')) / 100)) * c.getMonth() + brut * (1 - (P('sgkIsciOran') + P('issizlikIsciOran')) / 100) : num(inp.cum);
    const nGv = taxOn(cum + nBrut) - taxOn(cum); const nDv = nBrut * dvR;
    const izinGun = num(inp.izinGun); const izBrut = brut / 30 * izinGun; const izSgk = izBrut * (P('sgkIsciOran') + P('issizlikIsciOran')) / 100; const izMat = izBrut - izSgk;
    const izGv = taxOn(cum + nBrut + izMat) - taxOn(cum + nBrut); const izDv = izBrut * dvR; const izNet = izBrut - izSgk - izGv - izDv;
    return {g, c, p, days, months, brut, yan, giy, tavan, esas, code, codeOk, yearOk, kYil, kAy, kGun, kBrut, kDv, kNet:kBrut - kDv, weeks, nDays, daily, nBrut, nGv, nDv, nNet:nBrut - nGv - nDv, rule, cum, izinGun, izBrut, izSgk, izGv, izDv, izNet};
  }
  function brutNetMonths(brut: unknown): ReturnType<typeof calcMonth>[] { let cum = 0; const out: ReturnType<typeof calcMonth>[] = []; for(let m = 1; m <= 12; m++){ const r = calcMonth({brut}, cum, m); cum += r.matrah; out.push(r); } return out; }
  function netToBrut(target: number): ReturnType<typeof calcMonth>[] {
    let cum = 0; const out: ReturnType<typeof calcMonth>[] = [];
    for(let m = 1; m <= 12; m++){ let lo = 0, hi = Math.max(1, target) * 3; for(let k = 0; k < 60; k++){ const mid = (lo + hi) / 2; if(calcMonth({brut:mid}, cum, m).net < target) lo = mid; else hi = mid; } const r = calcMonth({brut:hi}, cum, m); cum += r.matrah; out.push(r); }
    return out;
  }
  const channels = (): Kanal[] => settingsList<Kanal>('ilanKanallari').filter(k => k.aktif !== false);
  function newJobCode(): string { const y = today().getFullYear(); const used = new Set(kayitlar<Kayit & Ilan>('job').map(j => j.ilanKodu)); let n = kayitlar<Kayit & Ilan>('job').filter(j => (j.ilanKodu || '').startsWith(`IK-${y}`)).length + 1; while(used.has(`IK-${y}-${String(n).padStart(3, '0')}`)) n++; return `IK-${y}-${String(n).padStart(3, '0')}`; }
  function trackLink(url: string | undefined, j: Ilan, k: Kanal | null | undefined): string { if(!url) return ''; if(!k) return url; const src = String(k.ad).replace(/İ/g, 'I').replace(/ı/g, 'i').toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); const q = `utm_source=${encodeURIComponent(src)}&utm_medium=ilan&utm_campaign=${encodeURIComponent(j.ilanKodu || 'ilan')}`; return url + (url.includes('?') ? '&' : '?') + q; }
  function autoPerks(): string[] {
    const s = S(); const out = lines(s['ilanYanHaklar']); if(out.length) return out;
    const p: string[] = [];
    if(s['yemekYontem'] === 'Yemek kartı / çeki') p.push('Yemek kartı'); else if(s['yemekYontem'] === 'İşyerinde yemek') p.push('İşyerinde yemek'); else if(s['yemekYontem'] === 'Nakit') p.push('Yemek ücreti');
    if(s['yolYontem'] === 'Servis') p.push('Servis'); else if(s['yolYontem'] === 'Toplu taşıma kartı / bilet') p.push('Ulaşım desteği');
    if(settingsList<Prim>('primler').some(x => x.atama !== 'yok')) p.push('Prim ve ikramiye sistemi');
    return p;
  }
  function postingParts(j: Ilan, k?: Kanal | null){
    const s = S(); const code = (j.ilanKodu || '') + (k && k.kod ? '-' + k.kod : '');
    const ucret = j.ucretGoster && (num(j.ucretMin) || num(j.ucretMax)) ? (num(j.ucretMin) && num(j.ucretMax) ? `${fmtMoney(num(j.ucretMin), true)} – ${fmtMoney(num(j.ucretMax), true)} brüt` : `${fmtMoney(num(j.ucretMin) || num(j.ucretMax), true)} brüt`) : '';
    const info = ([['Lokasyon', j.lokasyon || s['ilanLokasyon']], ['Çalışma şekli', j.calismaSekli], ['Çalışma türü', j.calismaTuru], ['Deneyim', j.deneyim], ['Eğitim', j.egitimSeviye], ['Departman', get(j.departmanId)?.ad], ['Alınacak kişi', num(j.adet) > 1 ? `${num(j.adet)} kişi` : ''], ['Ücret', ucret], ['Son başvuru', j.sonBasvuru ? fmtDate(j.sonBasvuru) : '']] as [string, unknown][]).filter(x => x[1]);
    const mail = (j.basvuruEposta || s['kariyerEposta']) as string | undefined; const link = trackLink((j.basvuruLink || s['kariyerSayfasi']) as string | undefined, j, k);
    const nitel = j.nitelikler === undefined ? lines(j.aciklama) : lines(j.nitelikler);
    return {code, title: j.ilanBaslik || j.baslik || 'Pozisyon', tanitim: (s['sirketTanitim'] || '') as string, ozet: j.ozet || '', sor: lines(j.sorumluluklar), nit: nitel, ter: lines(j.tercih), perks: lines(j.yanHaklar).length ? lines(j.yanHaklar) : autoPerks(), info, mail, link, kvkk: s['kvkkLink'] as string | undefined, sirket: (s['sirket'] || '') as string};
  }
  function postingText(j: Ilan, k?: Kanal | null): string {
    const p = postingParts(j, k); const L = [p.title.toLocaleUpperCase('tr')];
    const meta = [p.info.find(x => x[0] === 'Lokasyon')?.[1], j.calismaSekli, j.calismaTuru].filter(Boolean); if(meta.length) L.push(meta.join(' | '));
    if(p.tanitim) L.push('', p.tanitim);
    if(p.ozet) L.push('', 'Pozisyon hakkında', p.ozet);
    const sec = (h: string, arr: string[]): void => { if(arr.length) L.push('', h, ...arr.map(x => '• ' + x)); };
    sec('Sorumluluklar', p.sor); sec('Aranan nitelikler', p.nit); sec('Tercih sebebi', p.ter); sec('Sunduklarımız', p.perks);
    if(p.info.length) L.push('', 'Çalışma bilgileri', ...p.info.map(([a, b]) => `${a}: ${b}`));
    const how = []; if(p.link) how.push(`Başvuru: ${p.link}`); if(p.mail) how.push(`E-posta: ${p.mail} (konu: ${p.code} ${p.title})`);
    if(how.length) L.push('', 'Nasıl başvurulur?', ...how);
    L.push('', `İlan kodu: ${p.code}`);
    if(p.kvkk) L.push(`Kişisel verileriniz, aydınlatma metnimiz kapsamında yalnızca işe alım sürecinde işlenir: ${p.kvkk}`);
    return L.join('\n');
  }
  function postingShort(j: Ilan, k?: Kanal | null): string {
    const p = postingParts(j, k); const loc = (p.info.find(x => x[0] === 'Lokasyon')?.[1] || '') as string;
    const city = loc ? lower(loc.split(',').pop()!.trim()).replace(/[^a-zğüşıöç]/g, '') : '';
    const tags = ['işilanı', 'kariyer', city, lower(j.baslik || p.title).replace(/[^a-zğüşıöç0-9]/g, '')].filter(Boolean).map(t => '#' + t);
    const co = p.sirket && p.sirket !== DEFAULT_SETTINGS.sirket ? p.sirket : '';
    const head = `${co ? co + ' ekibine' : 'Ekibimize'} katılacak ${p.title} arıyoruz.`;
    const body = [p.ozet ? p.ozet.split(/(?<=\.)\s/)[0] : '', p.sor.slice(0, 3).map(x => '• ' + x).join('\n'), [loc, j.calismaSekli, j.calismaTuru].filter(Boolean).join(' | ')].filter(Boolean);
    const how = p.link ? `Başvuru: ${p.link}` : p.mail ? `Başvuru: ${p.mail} (${p.code})` : `İlan kodu: ${p.code}`;
    return [head, '', ...body, '', how, '', tags.join(' ')].join('\n');
  }
  function postingHTML(j: Ilan, k?: Kanal | null): string {
    const p = postingParts(j, k); const ul = (h: string, arr: string[]): string => arr.length ? `<h2>${esc(h)}</h2><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    return `<article class="job-posting"><h1>${esc(p.title)}</h1>${p.tanitim ? `<p>${esc(p.tanitim)}</p>` : ''}${p.ozet ? `<h2>Pozisyon hakkında</h2><p>${esc(p.ozet)}</p>` : ''}${ul('Sorumluluklar', p.sor)}${ul('Aranan nitelikler', p.nit)}${ul('Tercih sebebi', p.ter)}${ul('Sunduklarımız', p.perks)}${p.info.length ? `<h2>Çalışma bilgileri</h2><dl>${p.info.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>` : ''}<h2>Nasıl başvurulur?</h2><p>${p.link ? `<a href="${esc(p.link)}">Başvuru formu</a>` : ''}${p.link && p.mail ? ' veya ' : ''}${p.mail ? `<a href="mailto:${esc(p.mail)}?subject=${encodeURIComponent(p.code + ' ' + p.title)}">${esc(p.mail)}</a>` : ''}</p><p><small>İlan kodu: ${esc(p.code)}${p.kvkk ? ` · <a href="${esc(p.kvkk)}">KVKK aydınlatma metni</a>` : ''}</small></p></article>`;
  }
  function postingChecks(j: Ilan): [string, string][] {
    const txt = lower([j.ilanBaslik, j.baslik, j.ozet, j.sorumluluklar, j.nitelikler === undefined ? j.aciklama : j.nitelikler, j.tercih, j.yanHaklar, j.ozelMetin].join('\n')); const out: [string, string][] = [];
    const flag = (re: RegExp, msg: string): void => { const m = txt.match(re); if(m) out.push(['bad', `“${m[0].trim()}”: ${msg}`]); };
    flag(/\b(bayan|erkek|kadın)\s+(eleman|personel|aday|çalışan|işçi|operatör|şoför)/u, 'cinsiyete dayalı ifade; işin niteliği zorunlu kılmıyorsa çıkarın.');
    flag(/\b\d{2}\s*[-–]\s*\d{2}\s*yaş/u, 'yaş aralığı belirtmek ayrımcılık riski taşır.');
    flag(/yaş(ı|ında)?\s*(sınırı|aralığı|altında|üstünde|altı|üstü)/u, 'yaş sınırı ayrımcılık riski taşır.');
    flag(/\b(bekar|bekâr|evli)\b/u, 'medeni hâl şartı ayrımcılık riski taşır.');
    flag(/\b(güzel|alımlı|hoş görünümlü|fiziği düzgün|bakımlı)\b/u, 'dış görünüşe dayalı ifade uygun değildir.');
    flag(/\bfotoğraflı\b/u, 'fotoğraf istemek ayrımcılık riskini artırır.');
    flag(/\b(boy|kilo)\s*:?\s*\d/u, 'fiziksel ölçü şartı yalnızca işin gerektirdiği durumlarda konabilir.');
    flag(/\b(müslüman|sünni|alevi|hristiyan)\b/u, 'dini inanca dayalı ifade yasaktır.');
    const ask = txt.match(/askerlik(le)?\s*(ilişiği|görevini|hizmetini|yapmış|tamamlamış)/u); if(ask) out.push(['warn', `“${ask[0]}”: askerlik şartını yalnızca işin niteliği gerektiriyorsa koyun; “askerlikle ilişiği olmayan” ifadesi tercih edilir.`]);
    if(!lines(j.sorumluluklar).length) out.push(['warn', 'Sorumluluklar boş; adaylar işi anlamakta zorlanır.']);
    if(!(j.nitelikler === undefined ? lines(j.aciklama) : lines(j.nitelikler)).length) out.push(['warn', 'Aranan nitelikler boş.']);
    if(!j.basvuruEposta && !j.basvuruLink && !S()['kariyerEposta'] && !S()['kariyerSayfasi']) out.push(['warn', 'Başvuru yolu yok: başvuru e-postası veya bağlantısı girin.']);
    if(!j.sonBasvuru) out.push(['warn', 'Son başvuru tarihi yok; ilanların güncel kalması için tarih koyun.']);
    else if((pd(j.sonBasvuru) as Date) < today() && j.durum === 'Açık') out.push(['bad', 'Son başvuru tarihi geçmiş ama pozisyon açık.']);
    if(!S()['sirketTanitim']) out.push(['warn', 'Şirket tanıtım metni yok (Ayarlar > İlan ve kanallar).']);
    if(!j.ucretGoster) out.push(['info', 'Ücret aralığı ilanda gösterilmiyor. Ücret bilgisi verilen ilanlar genellikle daha fazla ve daha uygun başvuru alır.']);
    return out;
  }
  return { all, get, pickParams, periods, periodAt, periodEnd, settingsFor, S, withPeriod, periodStatus, salaryHist, salaryAt, curBrut, nextRaise, fullName, empName, deptName, isActive, employedInMonth, activeEmps, sortedEmps, sortedDepts, docList, criteria, holidays, isHoliday, isWorkday, countDays, annualBase, ageMin, leaveBalance, brackets, taxOn, calcMonth, attHours, autoDaysInfo, engelliIndirim, payInputs, payroll, missingDocs, fiiliGun, benefitCfg, benefitCalc, benefitMonthly, settingsList, tesvikById, tesvikOf, primMonths, primAmount, primDefaultOn, empPrims, primFor, primMonthlyKidem, primDesc, P, noticeWeeks, sgkIsverenEtkin, exitCodeOf, noticeRule, severance, severanceCore, brutNetMonths, netToBrut, channels, newJobCode, trackLink, autoPerks, postingParts, postingText, postingShort, postingHTML, postingChecks };
}

/** Bellek içi veri kaynağı: sunucu tarafında veya testlerde motoru beslemek için. */
export function createMemoryDb({ records = [], settings = {} }: { records?: readonly Kayit[]; settings?: Ayarlar } = {}){
  const map = new Map(records.map((r): [string, Kayit] => [r.id, r])); let st = settings;
  return {
    all: (kind: string): Kayit[] => { const out: Kayit[] = []; for(const r of map.values()) if(r.kind === kind) out.push(r); return out; },
    get: (id: string): Kayit | null => map.get(id) || null,
    settings: (): Ayarlar => st,
    upsert: (r: Kayit): void => { map.set(r.id, r); }, remove: (id: string): void => { map.delete(id); },
    setSettings: (s: Ayarlar): void => { st = s; }, records: (): Kayit[] => [...map.values()]
  };
}
