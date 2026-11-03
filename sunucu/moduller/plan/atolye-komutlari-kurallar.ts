import type { AtolyeOlayi, IsTasiGovdesi } from '#paylasilan/sozlesme/planlama-atolye.ts';

// Atölye komutlarının saf kuralı (1982 a): kayıtlı çalışmaya tek bir değişiklik uygulanır. Değişiklik sayfanın kendi yazmasıyla aynı izi
// bırakır (istemci kayit.ts degistir): veri sürümü artar (plan bayatlar), plan varken bekleyen değişiklik satırı ve geri dönüş farkı yazılır,
// değişiklik izine satır düşer. Böylece atölye değişikliği bekleyen listesinde görür, uygular ya da reddeder.

type Nesne = Record<string, unknown>;
const nesne = (x: unknown): x is Nesne => typeof x === 'object' && x !== null && !Array.isArray(x);
const dizi = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const esit = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const kopya = <T>(x: T): T => structuredClone(x);

// Sayfanın değişiklik izi sınırı ve açılış saati (istemci kayit.ts IZ_SINIRI, motor/kurallar.ts BASLANGIC_SAATI).
export const IZ_SINIRI = 400;
export const BASLANGIC_SAATI = 7;

export interface KomutKisisi { kim: string; sayfa: string; t: number }
export type KomutHatasi = { tur: 'dogrulama'; ileti: string; alan: string } | { tur: 'cakisma'; ileti: string };
export type KomutSonucu = { deger: Nesne; degisti: boolean } | { hata: KomutHatasi };

interface GeriYama { yol: string[]; id?: string; once?: unknown }
interface Bekleyen { id: string; ne: string; ayrinti: string; kim: string; t: number; isler: string[]; geri: GeriYama[] | null }

const ESKI_DEGISIKLIK = 'eski';
const bekleyenMi = (x: unknown): x is Bekleyen =>
  nesne(x) && typeof x.id === 'string' && typeof x.ne === 'string' && typeof x.t === 'number' && Array.isArray(x.isler) && (x.geri === null || Array.isArray(x.geri));

const dogrulama = (ileti: string, alan: string): KomutSonucu => ({ hata: { tur: 'dogrulama', ileti, alan } });
const cakisma = (ileti: string): KomutSonucu => ({ hata: { tur: 'cakisma', ileti } });

export function simdiSaati(c: Nesne): number {
  const s = c.simdi;
  return typeof s === 'number' && Number.isFinite(s) && s >= 0 ? s : BASLANGIC_SAATI;
}

const planOf = (c: Nesne): Nesne | null => (nesne(c.plan) ? c.plan : null);
const veriOf = (c: Nesne): Nesne => (nesne(c.D) ? c.D : {});
const kimligiVar = (l: unknown, alan: 'id' | 'kod', deger: string): boolean => dizi(l).some((x) => nesne(x) && String(x[alan]) === deger);

// Değişikliği çalışmanın yeni hâline işler: plan varken bekleyen satırı (plan bu özellikten önce bayatladıysa önce eski satır, 787 a),
// veri sürümü ve iz. `yeni` önceden kopyalanmış ve değiştirilmiştir.
function isle(once: Nesne, yeni: Nesne, s: { ne: string; ayrinti: string; isler: string[]; geri: GeriYama[] }, k: KomutKisisi): Nesne {
  const dataVer = typeof once.dataVer === 'number' ? once.dataVer : 0;
  const plan = planOf(once);
  if (plan !== null) {
    const l = dizi(once.bekleyen).filter(bekleyenMi);
    if (l.length === 0 && plan.dataVer !== dataVer) {
      l.push({ id: ESKI_DEGISIKLIK, ne: 'Kaydı olmayan önceki değişiklikler', ayrinti: 'Ayrıntısı tutulmadı; yalnız uygulanabilir.', kim: '',
        t: typeof plan.zaman === 'number' ? plan.zaman : 0, isler: ['*'], geri: null });
    }
    l.push({ id: `${String(k.t)}-${String(dataVer)}`, ne: s.ne, ayrinti: s.ayrinti, kim: k.kim, t: k.t, isler: s.isler, geri: s.geri });
    yeni.bekleyen = l;
  }
  yeni.dataVer = dataVer + 1;
  yeni.iz = [{ t: k.t, kim: k.kim, rol: '', sayfa: k.sayfa, ne: s.ne, ayrinti: s.ayrinti }, ...dizi(once.iz)].slice(0, IZ_SINIRI);
  return yeni;
}

// İş, verilen tezgâhta verilen saatte başlamak üzere kilitlenir (motor kilitYeri: {m, S}). Başlamış, biten ve fason iş taşınmaz; geçmişe
// konan kilidi motor yok sayardı, burada reddedilir. Tezgâhın işe uygunluğunu motor kurar: uygun değilse kilit yerleşmez, motor uyarır.
export function isTasi(deger: unknown, g: Omit<IsTasiGovdesi, 'calismaSurumu'>, k: KomutKisisi): KomutSonucu {
  if (!nesne(deger)) return cakisma('Çalışma kaydı okunamadı; sayfayı yenileyin.');
  const plan = planOf(deger);
  const ops = plan !== null && nesne(plan.ops) ? plan.ops : null;
  if (ops === null) return cakisma('Çalışmada plan yok; önce planı kurun.');
  const r = ops[g.isId];
  if (!nesne(r)) return cakisma('İş planda bulunamadı; plan değişmiş olabilir, sayfayı yenileyin.');
  if (r.done) return cakisma('Biten iş taşınamaz.');
  if (r.act) return cakisma('Başlamış iş taşınamaz.');
  if (r.fas) return cakisma('Fason iş tezgâha taşınamaz.');
  if (!kimligiVar(veriOf(deger).tezgahlar, 'id', g.tezgah)) return dogrulama('Tezgâh çalışmada yok.', 'tezgah');
  if (g.baslangic < simdiSaati(deger) - 1e-9) return dogrulama('İş geçmiş bir saate taşınamaz.', 'baslangic');
  const locks = nesne(deger.locks) ? deger.locks : {};
  const kilit = { m: g.tezgah, S: g.baslangic };
  if (esit(locks[g.isId], kilit)) return { deger, degisti: false };
  const yeni = kopya(deger);
  yeni.locks = { ...locks, [g.isId]: kilit };
  const ayniTezgah = String(r.m) === g.tezgah;
  const ne = ayniTezgah ? 'İş saati kaydırıldı' : 'İş başka tezgâha taşındı';
  const geri: GeriYama = locks[g.isId] === undefined ? { yol: ['locks'], id: g.isId } : { yol: ['locks'], id: g.isId, once: locks[g.isId] };
  const isler = typeof r.job === 'string' ? [r.job] : ['*'];
  return { deger: isle(deger, yeni, { ne, ayrinti: `${g.isId} → ${g.tezgah}`, isler, geri: [geri] }, k), degisti: true };
}

const OLAY_ADI: Record<AtolyeOlayi['tip'], string> = {
  ariza: 'Arıza olayı eklendi', acil: 'Acil sipariş olayı eklendi', malzeme: 'Malzeme gecikmesi olayı eklendi',
  eksik: 'Personel eksikliği olayı eklendi', fason: 'Fason gecikmesi olayı eklendi',
};

// Olayın gösterdiği kayıt çalışmada olmalıdır; yoksa motor olayı sessizce boşa uygulardı.
function olayDenetimi(D: Nesne, o: AtolyeOlayi, simdi: number): KomutSonucu | null {
  switch (o.tip) {
    case 'ariza':
      if (!kimligiVar(D.tezgahlar, 'id', o.m)) return dogrulama('Tezgâh çalışmada yok.', 'olay.m');
      if (o.bas + o.saat < simdi) return dogrulama('Arıza geçmişte bitiyor; planı etkilemez.', 'olay.bas');
      return null;
    case 'acil': return kimligiVar(D.urunler, 'id', o.urun) ? null : dogrulama('Ürün çalışmada yok.', 'olay.urun');
    case 'malzeme': return kimligiVar(D.malzemeler, 'kod', o.kod) ? null : dogrulama('Malzeme çalışmada yok.', 'olay.kod');
    case 'eksik': {
      if (!kimligiVar(D.vardiyalar, 'id', o.vardiya)) return dogrulama('Vardiya çalışmada yok.', 'olay.vardiya');
      const gruplar = new Set(dizi(D.tezgahlar).flatMap((m) => (nesne(m) && typeof m.grup === 'string' ? [m.grup] : [])));
      return o.grup === 'ayar' || gruplar.has(o.grup) ? null : dogrulama('Tezgâh grubu çalışmada yok.', 'olay.grup');
    }
    case 'fason': return kimligiVar(D.fasoncular, 'id', o.f) ? null : dogrulama('Fasoncu çalışmada yok.', 'olay.f');
  }
}

// Olay çalışmanın olay listesine eklenir; motor planı kurarken uygular (girdi.betik stKur). Etkilenen işler motorda hesaplanır: bekleyen
// satırı bütün işleri işaretler (istemci etkilenenIsler olaylar için de '*').
export function olayEkle(deger: unknown, olay: AtolyeOlayi, k: KomutKisisi): KomutSonucu {
  if (!nesne(deger)) return cakisma('Çalışma kaydı okunamadı; sayfayı yenileyin.');
  const h = olayDenetimi(veriOf(deger), olay, simdiSaati(deger));
  if (h !== null) return h;
  const olaylar = dizi(deger.olaylar);
  const yeni = kopya(deger);
  yeni.olaylar = [...olaylar, olay];
  return { deger: isle(deger, yeni, { ne: OLAY_ADI[olay.tip], ayrinti: olay.tip, isler: ['*'], geri: [{ yol: ['olaylar'], once: olaylar }] }, k), degisti: true };
}
