import type { AtolyeOlayi, EkMesaiEkleGovdesi, IsTasiGovdesi, PlanaAlGovdesi } from '#paylasilan/sozlesme/planlama-atolye.ts';
import { planSaati } from './planlama-kurallar.ts';
import type { PlanaAlSonucu } from './plana-al-kurallar.ts';
import type { TasimaSonucu } from './tasima-kurallar.ts';

// Atölye komutlarının saf kuralı (1982 a): kayıtlı çalışmaya tek bir değişiklik uygulanır. Değişiklik sayfanın kendi yazmasıyla aynı izi
// bırakır (istemci kayit.ts degistir): veri sürümü artar (plan bayatlar), plan varken bekleyen değişiklik satırı ve geri dönüş farkı yazılır,
// değişiklik izine satır düşer. Böylece atölye değişikliği bekleyen listesinde görür, uygular ya da reddeder.

type Nesne = Record<string, unknown>;
const nesne = (x: unknown): x is Nesne => typeof x === 'object' && x !== null && !Array.isArray(x);
const dizi = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const esit = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const kopya = <T>(x: T): T => structuredClone(x);

// Sayfanın değişiklik izi sınırı (istemci kayit.ts IZ_SINIRI).
export const IZ_SINIRI = 400;

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

// 2506 a: şimdi her yerde gerçek saattir: komutun anı planın ekseninde (D.meta.baslangic, tesis günü 00:00'dan saat). Kayıttaki
// `simdi` ve 07:00 varsayımı kullanılmaz (B-2500-3: arıza geçmişe yazılıyordu). Ekseni olmayan çalışmada şimdi bilinmez (null).
export function simdiSaati(c: Nesne, an: number): number | null {
  const meta = veriOf(c).meta;
  const b = nesne(meta) ? meta.baslangic : undefined;
  return typeof b === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b) ? planSaati(b, an) : null;
}
const EKSENSIZ = 'Çalışmada başlangıç günü yok; sayfada planı kurup kaydedin.';

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

// Taşınabilirlik: başlamış, biten ve fason iş taşınmaz; geçmişe konan kilidi motor yok sayardı, burada reddedilir. Geçerse çalışma ve
// planın ekseninde şimdi döner. Önizleme de aynı denetimden geçer.
export function tasimaDenetimi(deger: unknown, g: Omit<IsTasiGovdesi, 'calismaSurumu'>, an: number): { hata: KomutHatasi } | { deger: Nesne; simdi: number } {
  const h = (r: KomutSonucu): { hata: KomutHatasi } => r as { hata: KomutHatasi };
  if (!nesne(deger)) return h(cakisma('Çalışma kaydı okunamadı; sayfayı yenileyin.'));
  const plan = planOf(deger);
  const ops = plan !== null && nesne(plan.ops) ? plan.ops : null;
  if (ops === null) return h(cakisma('Çalışmada plan yok; önce planı kurun.'));
  const r = ops[g.isId];
  if (!nesne(r)) return h(cakisma('İş planda bulunamadı; plan değişmiş olabilir, sayfayı yenileyin.'));
  if (r.done) return h(cakisma('Biten iş taşınamaz.'));
  if (r.act) return h(cakisma('Başlamış iş taşınamaz.'));
  if (r.fas) return h(cakisma('Fason iş tezgâha taşınamaz.'));
  if (!kimligiVar(veriOf(deger).tezgahlar, 'id', g.tezgah)) return h(dogrulama('Tezgâh çalışmada yok.', 'tezgah'));
  const simdi = simdiSaati(deger, an);
  if (simdi === null) return h(cakisma(EKSENSIZ));
  if (g.baslangic < simdi - 1e-9) return h(dogrulama('İş geçmiş bir saate taşınamaz.', 'baslangic'));
  return { deger, simdi };
}

// 2790 a, 2794: taşınan iş verilen tezgâhta kilitlenir; aynı emrin adımları rotadaki bağ türüne göre itilir ya da geri çekilir ve onlar da
// yeni yerlerinde kilitlenir (motor kilitYeri: {m, S}). Hepsi tek değişikliktir: bekleyen satırı, iz ve geri alma birlikte; itme geçersizse
// (başlamış adım, ufuk) hiçbiri yazılmaz. Hesap motorun takvimiyle dışarıda yapılır (tasima.ts), kural saf kalır.
export function isTasi(deger: unknown, g: Omit<IsTasiGovdesi, 'calismaSurumu'>, k: KomutKisisi, itme: (d: Nesne, simdi: number, g: Omit<IsTasiGovdesi, 'calismaSurumu'>) => TasimaSonucu): KomutSonucu & { ileti?: string | null } {
  const d = tasimaDenetimi(deger, g, k.t);
  if ('hata' in d) return d;
  const sonuc = itme(d.deger, d.simdi, g);
  if (!sonuc.gecerli) return dogrulama(sonuc.ileti, 'baslangic');
  const locks = nesne(d.deger.locks) ? d.deger.locks : {};
  const yeniKilit = Object.fromEntries(sonuc.isler.map((x) => [x.isId, { m: x.tezgah, S: x.S }]));
  const degisen = Object.keys(yeniKilit).filter((id) => !esit(locks[id], yeniKilit[id]));
  if (degisen.length === 0) return { deger: d.deger, degisti: false, ileti: sonuc.ileti };
  const yeni = kopya(d.deger);
  yeni.locks = { ...locks, ...yeniKilit };
  const r = (planOf(d.deger)!.ops as Nesne)[g.isId] as Nesne;
  const ne = String(r.m) === g.tezgah ? 'İş saati kaydırıldı' : 'İş başka tezgâha taşındı';
  const geri: GeriYama[] = degisen.map((id) => (locks[id] === undefined ? { yol: ['locks'], id } : { yol: ['locks'], id, once: locks[id] }));
  const isler = typeof r.job === 'string' ? [r.job] : ['*'];
  const ayrinti = `${g.isId} → ${g.tezgah}${sonuc.ileti === null ? '' : `; ${sonuc.ileti}`}`;
  return { deger: isle(d.deger, yeni, { ne, ayrinti, isler, geri }, k), degisti: true, ileti: sonuc.ileti };
}

// Plana alınabilirlik (3151): emir çalışmada olmalı, iptal ya da havuzda olmamalı ve planda hiçbir adımı bulunmamalı (planda olan emir
// tahtadan taşınır). Geçerse çalışma ve planın ekseninde şimdi döner. Önizleme de aynı denetimden geçer.
type PlanaAl = Omit<PlanaAlGovdesi, 'calismaSurumu'>;
export function planaAlDenetimi(deger: unknown, g: PlanaAl, an: number): { hata: KomutHatasi } | { deger: Nesne; simdi: number } {
  const h = (r: KomutSonucu): { hata: KomutHatasi } => r as { hata: KomutHatasi };
  if (!nesne(deger)) return h(cakisma('Çalışma kaydı okunamadı; sayfayı yenileyin.'));
  const plan = planOf(deger);
  const ops = plan !== null && nesne(plan.ops) ? plan.ops : null;
  if (ops === null) return h(cakisma('Çalışmada plan yok; önce planı kurun.'));
  const D = veriOf(deger);
  const s = dizi(D.siparisler).find((x) => nesne(x) && String(x.id) === g.emirId);
  if (!nesne(s)) return h(dogrulama('Emir çalışmada yok.', 'emirId'));
  if (s.iptal === true || s.havuz === true) return h(cakisma('Emir plan dışında (iptal ya da havuzda); plana alınamaz.'));
  if (Object.values(ops).some((r) => nesne(r) && String(r.job) === g.emirId)) return h(cakisma('Emir zaten planda; yerini tahtadan değiştirin.'));
  if (!kimligiVar(D.tezgahlar, 'id', g.tezgah)) return h(dogrulama('Tezgâh çalışmada yok.', 'tezgah'));
  const simdi = simdiSaati(deger, an);
  if (simdi === null) return h(cakisma(EKSENSIZ));
  if (g.baslangic < simdi - 1e-9) return h(dogrulama('Emir geçmiş bir saate alınamaz.', 'baslangic'));
  return { deger, simdi };
}

// İlk adım ve kullanıcının seçtiği adımlar kilitlenir (motor kilitYeri: {m, S}); emrin öteki adımlarını plan yeniden dizilirken motor
// yerleştirir. Kaç kilit yazılırsa yazılsın tek değişikliktir: bekleyen satırı, iz ve geri alma (kilitler kalkar, emir yine plansız olur).
export function planaAl(deger: unknown, g: PlanaAl, k: KomutKisisi, hesap: (d: Nesne, simdi: number, g: PlanaAl) => PlanaAlSonucu): KomutSonucu & { ileti?: string | null } {
  const d = planaAlDenetimi(deger, g, k.t);
  if ('hata' in d) return d;
  const sonuc = hesap(d.deger, d.simdi, g);
  if (!sonuc.gecerli) return dogrulama(sonuc.ileti, sonuc.alan);
  const kilitlenen = sonuc.kilit.flatMap((id) => sonuc.isler.find((i) => i.isId === id) ?? []);
  if (kilitlenen.length === 0 || kilitlenen.length !== sonuc.kilit.length) return cakisma('Emrin yeri hesaplanamadı; sayfayı yenileyin.');
  const locks = nesne(d.deger.locks) ? d.deger.locks : {};
  const kilitler = Object.fromEntries(kilitlenen.map((i) => [i.isId, { m: i.tezgah, S: i.S }]));
  if (kilitlenen.every((i) => esit(locks[i.isId], kilitler[i.isId]))) return { deger: d.deger, degisti: false, ileti: sonuc.ileti };
  const yeni = kopya(d.deger);
  yeni.locks = { ...locks, ...kilitler };
  const geri: GeriYama[] = kilitlenen.map((i) => (locks[i.isId] === undefined ? { yol: ['locks'], id: i.isId } : { yol: ['locks'], id: i.isId, once: locks[i.isId] }));
  const ayrinti = `${g.emirId} → ${kilitlenen.map((i) => i.tezgah).join(', ')}${sonuc.ileti === null ? '' : `; ${sonuc.ileti}`}`;
  return { deger: isle(d.deger, yeni, { ne: 'Emir plana alındı', ayrinti, isler: [g.emirId], geri }, k), degisti: true, ileti: sonuc.ileti };
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
  const simdi = simdiSaati(deger, k.t);
  if (simdi === null) return cakisma(EKSENSIZ);
  const h = olayDenetimi(veriOf(deger), olay, simdi);
  if (h !== null) return h;
  const olaylar = dizi(deger.olaylar);
  const yeni = kopya(deger);
  yeni.olaylar = [...olaylar, olay];
  return { deger: isle(deger, yeni, { ne: OLAY_ADI[olay.tip], ayrinti: olay.tip, isler: ['*'], geri: [{ yol: ['olaylar'], once: olaylar }] }, k), degisti: true };
}

// Ek mesai (2053): tezgâha gün ve vardiya eklenir; motor o vardiyayı tezgâhın açık saatine katar (girdi.betik ekMesai). Geçmiş gün ve aynı
// satırın ikincisi eklenmez. Bekleyen satırı o tezgâhta planlı işlerin siparişlerini işaretler (istemci etkilenenIsler).
export function ekMesaiEkle(deger: unknown, g: Omit<EkMesaiEkleGovdesi, 'calismaSurumu'>, k: KomutKisisi): KomutSonucu {
  if (!nesne(deger)) return cakisma('Çalışma kaydı okunamadı; sayfayı yenileyin.');
  const D = veriOf(deger);
  if (!kimligiVar(D.tezgahlar, 'id', g.tezgah)) return dogrulama('Tezgâh çalışmada yok.', 'tezgah');
  if (!kimligiVar(D.vardiyalar, 'id', g.vardiya)) return dogrulama('Vardiya çalışmada yok.', 'vardiya');
  const simdi = simdiSaati(deger, k.t);
  if (simdi === null) return cakisma(EKSENSIZ);
  if (g.gun < Math.floor(simdi / 24)) return dogrulama('Geçmiş güne ek mesai eklenemez.', 'gun');
  const satir = { m: g.tezgah, gun: g.gun, vardiya: g.vardiya };
  const eski = dizi(deger.ekMesai);
  if (eski.some((x) => nesne(x) && String(x.m) === g.tezgah && x.gun === g.gun && String(x.vardiya) === g.vardiya)) return { deger, degisti: false };
  const yeni = kopya(deger);
  yeni.ekMesai = [...eski, satir];
  const plan = planOf(deger);
  const ops = plan !== null && nesne(plan.ops) ? Object.values(plan.ops) : [];
  const isler = [...new Set(ops.flatMap((r) => (nesne(r) && String(r.m) === g.tezgah && typeof r.job === 'string' ? [r.job] : [])))].sort();
  return { deger: isle(deger, yeni, { ne: 'Ek mesai eklendi', ayrinti: `${g.tezgah} · ${String(g.gun)}. gün · ${g.vardiya}`, isler, geri: [{ yol: ['ekMesai'], once: eski }] }, k), degisti: true };
}
