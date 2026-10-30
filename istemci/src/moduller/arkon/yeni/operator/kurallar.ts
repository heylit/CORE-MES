import { tmiBitti } from '../../../../../../arkon/web/src/data/biten-is.ts';
import { ILK_PARCA_KARAR_BEKLIYOR_ILETISI, KALITE_MERKEZI_RET_UYARISI, ilkParcaKarari, kararBekleyenEki, yenidenIlkParcaAcik } from '../../../../../../arkon/web/src/data/ilk-parca.ts';
import { kalanAdet } from '../../../../../../arkon/web/src/data/sayac-halkasi.ts';
import { TEKRAR_OLCUM } from '../../../../../../arkon/web/src/data/otomatik-numune.ts';
import { anlikPencereler } from '../../../../../../arkon/web/src/data/vardiya-gunu.ts';
import { yuzdeMetni } from '../../../../../../arkon/web/src/data/yuzde.ts';
import type { MakineDurumu } from '../../../../ortak/arayuz/index.ts';
import { oeeHesapla, type DurumOlayi, type OeeOrtami, type OeeSonucu, type SayimKaydi } from '../cekirdek/oee.ts';
import type { AnlikVardiya } from '../cekirdek/vardiya.ts';
import { istasyonPaketleri, planOnce } from '../../../../../../arkon/web/src/data/tmi-plan.ts';
import { SIMGELER, type SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { sayi, sure } from '../cekirdek/bicim.ts';
import type { IstasyonSatiri } from '../cekirdek/tesis.ts';
import { araNumuneSikligi, isKurallari, istasyonAyari, isTuru, numuneEtiketi, numuneOlculeri, numunePlani, siradakiOlcen } from '../hazirlik/index.tsx';
import type { SeritAraligi } from '../../../../../../arkon/web/src/data/numune-seridi.ts';
import type { Uyari } from '../hazirlik/tipler.ts';
import type {
  Gorev, GorevEylemi, IlkParcaDurumu, Is, KaliteNumunesi, KontrolTakvimi, LotKarari, LotSinifi, Meas, Olcen, Pkg, PlanItem, Result, SiradakiKontrol, Ton,
} from './tipler.ts';

// Operatör ekranının saf hesapları (operator.ts, operator-parcalar.ts, bilesenler.ts). Eski ekranda bileşenin içindeydi ya da modül
// değişkenini (vardiya, kurallar) okuyordu; burada girdi olarak verilir. Eskisiyle eşliği esitlik.test.ts gerçek modülle sınar.

// Eski renk değişkeni -> ton adı (veri modüllerinden gelen görev kartı eski biçimde renk taşır).
export function tonAdi(c: string | null | undefined): Ton {
  const m = /--(run|hold|stop|done|hazard|idle)\b/.exec(c ?? '');
  return (m?.[1] as Ton | undefined) ?? 'idle';
}
// Kayıttaki simge adı ortak sette yoksa yakın karşılığı; o da yoksa yedek.
const SIMGE_KARSILIGI: Readonly<Record<string, SimgeAdi>> = { thermo: 'thermometer', qr: 'scan', hex: 'cube', calendar: 'gantt' };
export function simgeSec(ad: string | null | undefined, yedek: SimgeAdi = 'alert'): SimgeAdi {
  if (ad && Object.hasOwn(SIMGELER, ad)) return ad as SimgeAdi;
  return (ad && SIMGE_KARSILIGI[ad]) || yedek;
}

// İstasyona atanmış iş yokken ekrandaki boş iş (istasyonlar.ts EMPTY_ORDER): hedefi yoktur, sayaç `sayacGosterimi` ile "—" gösterir.
export const bosIs = (ist: Pick<IstasyonSatiri, 'l'>): Is =>
  ({ no: '—', part: 'Bu istasyona atanmış iş yok', op: ist.l, state: 'queued', good: 0, scrap: 0, target: 0, cycle: 0, due: '—', baseGood: 0, meas: {}, pins: [], empty: true });

const sonucAlanlari = (r: Result) => ({
  state: r.state || 'queued', good: r.good || 0, scrap: r.scrap || 0, meas: r.meas || {}, pins: r.pins || [], baseGood: r.baseGood ?? 0,
  acks: r.acks || {}, toolsAt: r.toolsAt || {}, sr: r.sr || {}, kart: (r['kart'] as number | null | undefined) ?? null,
});

// İstasyonun paketleri ekrandaki işlerle birleşir (operator.ts mergePkgs). Önizlemede yalnız önizlenen paket görünür, sonuç okunmaz.
export function paketleriBirlestir(liste: readonly Is[], paketler: readonly Pkg[], sonuclar: Readonly<Record<string, Result>> | null, istasyon: string, onizleme: string | null): Is[] {
  const benim = onizleme ? paketler.filter((p) => p.id === onizleme) : istasyonPaketleri(paketler, istasyon);
  let cikti: Is[] = liste.filter((x) => !x.pkg || benim.some((p) => p.id === x.pkg?.id));
  for (const p of [...benim].sort((a, b) => (a.publishedAt || 0) - (b.publishedAt || 0))) {
    const i = cikti.findIndex((x) => (x.pkg && x.pkg.id === p.id) || (!x.pkg && x.no === p.no));
    const taban = { no: p.no, part: p.part, op: p.op, due: p.due || '—', urgent: p.priority === 'urgent', target: p.target, cycle: p.cycle, pkg: p };
    const r = !onizleme && sonuclar ? sonuclar[p.id] : undefined;
    if (i >= 0) {
      const once = cikti[i]!;
      cikti[i] = {
        ...once, ...taban,
        fresh: onizleme ? false : once.pkg ? (once.pkg.version !== p.version || !!once.fresh) : true,
        baseGood: once.pkg ? once.baseGood : once.good,
        ...(r && !once.pkg ? { ...sonucAlanlari(r), state: r.state || once.state, good: r.good, scrap: r.scrap } : null),
        ...(r && once.pkg ? { pins: r.pins || once.pins || [] } : null),
      } as Is;
    } else {
      cikti = [{ state: 'queued', good: 0, scrap: 0, meas: {}, pins: [], fresh: !r && !onizleme, baseGood: 0, ...(r ? sonucAlanlari(r) : null), ...taban } as Is, ...cikti];
    }
  }
  // TMI'de biten emrin işi terminalde de biter (kart #1194): sayaç kapanır, iş biten işlere geçer.
  cikti = cikti.map((x) => (tmiBitti(x.pkg as { tmi?: { bitti?: unknown } } | undefined) && x.state !== 'done' ? { ...x, state: 'done' } : x));
  // Sıra: canlı plandaki TMI işleri plan sırasıyla, öteki işler Planlama'daki sırayla (pkg.seq).
  return cikti.map((x, i): [Is, number] => [x, x.pkg && x.pkg.seq != null ? x.pkg.seq : 1e9 + i])
    .sort((a, b) => planOnce(a[0].pkg, b[0].pkg) || a[1] - b[1]).map((x) => x[0]);
}

/* ── numune planı ve kontrol takvimi (operator-parcalar.ts) ── */

// İlk parça kapısının ölçüleri; kapının açık olup olmadığını ölçüm değil Kalite Merkezi kararı belirler (denetim #12).
export const ilkParcaKalemleri = (o: Pick<Is, 'pkg'>): PlanItem[] =>
  (o.pkg && isTuru(o.pkg) === 'cnc' ? numunePlani(o.pkg).filter((r) => r.when === 'first' && r.gate).flatMap((r) => numuneOlculeri(o.pkg!, r)) : []);
const gecti = (m: Meas | undefined): boolean => !!(m && (m.ok || m.dev));
export const ilkParcaKapisi = (o: Pick<Is, 'pkg' | 'meas'>): PlanItem[] => ilkParcaKalemleri(o).filter((b) => !gecti((o.meas || {})[b.id]));

// Numune çizgisi (664): sayıyla tekrarlanan kuralda aralığın başından bu yana sayılan parça ve sıradaki numunenin parça sırası, süreli
// kuralda geçen dakika. Hesap kontrolTakvimi ile aynıdır (taban: işe dönüşte sayılmış parçalar); ilk, son ve vardiya kuralında çizgi yok.
// Sıklık kalan adedi aşınca (700 a) tek ara numune vardır; alındıktan sonra çizgi yok.
export function numuneAraligi(
  r: ReturnType<typeof numunePlani>[number], o: Pick<Is, 'good' | 'baseGood' | 'startedAt'> & Partial<Pick<Is, 'target'>>, simdi: number,
): SeritAraligi | null {
  if (r.when === 'every') {
    const taban = o.baseGood ?? 0;
    const a = araNumuneSikligi(r.n, (o.target || 0) - taban);
    const N = a.n;
    const c = Math.max(0, o.good - taban);
    if (a.tek && c >= N) return null;
    return { n: N, birim: 'parça', gecen: c % N, hedef: taban + (Math.floor(c / N) + 1) * N };
  }
  if (r.when === 'time') {
    if (!o.startedAt) return null;
    const M = Math.max(1, r.n || 60);
    return { n: M, birim: 'dk', gecen: Math.floor(((simdi - o.startedAt) / 60000) % M), hedef: null };
  }
  return null;
}

type TakvimIsi = Pick<Is, 'pkg' | 'meas' | 'state' | 'pendingItems' | 'baseGood' | 'good' | 'cycle' | 'startedAt' | 'target'>;

// Hangi kontrollerin zamanı geldi, kim ölçecek (dueControls). `vardiyaBasi` şimdiki vardiyanın başlangıcıdır.
export function kontrolTakvimi(o: TakvimIsi | null | undefined, simdi: number, vardiyaBasi: number): KontrolTakvimi {
  if (!o || !o.pkg || !o.pkg.plan) return { due: [], next: null, who: {}, why: {} };
  const pkg = o.pkg;
  const meas = o.meas || {};
  const aktifIs = o.state === 'running' || o.state === 'setup' || o.state === 'paused';
  const calisiyor = o.state === 'running';
  const bekleyen = new Set(o.pendingItems || []);
  const due = new Map<number, PlanItem>();
  const who: Record<number, Olcen> = {};
  const why: Record<number, string> = {};
  let next: SiradakiKontrol | null = null;
  const ekle = (b: PlanItem, w: Olcen, l: string) => {
    if (bekleyen.has(b.id)) return;
    if (!due.has(b.id)) { due.set(b.id, b); who[b.id] = w; why[b.id] = l; } else if (w === 'q' && why[b.id] !== TEKRAR_OLCUM) who[b.id] = 'q';
  };
  const dakikasi = (x: SiradakiKontrol) => (x.u === 'parça' ? x.v * (o.cycle || 30) / 60 : x.v);
  const dusun = (kalan: SiradakiKontrol) => { if (!next || dakikasi(kalan) < dakikasi(next)) next = kalan; };
  // Reddedilen ölçü düzeltilip yeniden ölçülene kadar sırada kalır.
  for (const b of pkg.plan) { const m = meas[b.id]; if (m && m.ok === false && !m.dev && aktifIs) ekle(b, m.who === 'op' ? 'op' : 'q', TEKRAR_OLCUM); }
  // 521 1 a: ilk parça kararı Kalite Merkezi'nindir; emir onaylıysa ilk parça ölçüsü terminalde ölçülmemiş olsa da yeniden istenmez.
  const ilkOnayli = ilkParcaKarari(pkg) === 'onay' && !yenidenIlkParcaAcik(pkg);
  for (const r of numunePlani(pkg)) {
    const olculer = numuneOlculeri(pkg, r);
    const L = numuneEtiketi(r);
    if (r.when === 'first') { if (aktifIs && !ilkOnayli) olculer.forEach((b) => { if (!gecti(meas[b.id])) ekle(b, siradakiOlcen(r, 0), L); }); continue; }
    if (r.when === 'every') {
      const taban = o.baseGood ?? 0;
      // 700 a: sıklık kalan adedi aşarsa ara numune kalanın ortasında bir kez istenir.
      const a = araNumuneSikligi(r.n, (o.target || 0) - taban);
      const N = a.n;
      const c = o.good - taban;
      const k = a.tek ? Math.min(1, Math.floor(c / N)) : Math.floor(c / N);
      const acik = k >= 1 ? olculer.filter((b) => { const m = meas[b.id]; return !(m && (m.cnt ?? -1) >= taban + k * N); }) : [];
      if (acik.length && calisiyor) acik.forEach((b) => ekle(b, siradakiOlcen(r, k - 1), `${L} · ${k}. numune`));
      else if (olculer.length && !(a.tek && k >= 1)) dusun({ v: N - (c % N), u: 'parça', b: olculer[0]!, who: siradakiOlcen(r, k) });
      continue;
    }
    if (r.when === 'time') {
      const M = Math.max(1, r.n || 60) * 60e3;
      const t0 = o.startedAt;
      if (!t0) continue;
      const k = Math.floor((simdi - t0) / M);
      const tetik = t0 + k * M;
      const acik = k >= 1 ? olculer.filter((b) => { const m = meas[b.id]; return !(m && (m.at ?? -Infinity) >= tetik); }) : [];
      if (acik.length && calisiyor) acik.forEach((b) => ekle(b, siradakiOlcen(r, k - 1), L));
      else if (olculer.length) dusun({ v: Math.max(0, Math.ceil((t0 + (k + 1) * M - simdi) / 60000)), u: 'dk', b: olculer[0]!, who: siradakiOlcen(r, k) });
      continue;
    }
    if (r.when === 'shift') {
      const k = Math.floor(vardiyaBasi / 288e5);
      if (aktifIs) olculer.forEach((b) => { const m = meas[b.id]; if (!(m && (m.at ?? -Infinity) >= vardiyaBasi)) ekle(b, siradakiOlcen(r, k), L); });
      continue;
    }
    if (r.when === 'last') {
      if (aktifIs && o.target - o.good <= 1) olculer.forEach((b) => { const m = meas[b.id]; if (!(m && (m.cnt ?? -1) >= o.target - 1)) ekle(b, siradakiOlcen(r, 0), L); });
      else if (olculer.length) dusun({ v: Math.max(0, o.target - 1 - o.good), u: 'parça', b: olculer[0]!, who: siradakiOlcen(r, 0) });
    }
  }
  const liste = Array.from(due.values()).sort((a, b) => (b.crit ? 1 : 0) - (a.crit ? 1 : 0));
  return { due: liste, next, who, why };
}

/* ── sonraki işe hazırlık (operator-parcalar.ts READY) ── */
export const HAZIRLIK_MADDELERI: readonly { k: string; l: string; d: string; simge: SimgeAdi }[] = [
  { k: 'mat', l: 'Malzeme hazır', d: 'Ham madde ve kasa makine yanında', simge: 'truck' },
  { k: 'tool', l: 'Takımlar hazır', d: 'Takım listesi ve ofsetler', simge: 'tool' },
  { k: 'prog', l: 'Program yüklendi', d: 'Program no iş paketi ile aynı', simge: 'cpu' },
  { k: 'draw', l: 'Resim incelendi', d: 'Revizyon ve kritik ölçüler', simge: 'ruler' },
];
export const hazirlikSayisi = (o: Pick<Is, 'ready'>): number => HAZIRLIK_MADDELERI.filter((r) => (o.ready || {})[r.k]).length;

/* ── "Şimdi" kartı (nextTask) ── */
type GorevIsi = Is & { _skip?: boolean };

export function siradakiGorev(o: GorevIsi | null | undefined, D: KontrolTakvimi, siradaki: Is | null | undefined, ilk: IlkParcaDurumu | undefined, simdi: number): Gorev | null {
  if (!o) return null;
  if (o.empty) return { tone: 'idle', icon: 'layers', t: 'Bu istasyonda iş yok', d: 'Hazırlıktan bu istasyona paket gönderilince burada görünür · istasyonu değiştirmek için üst çubuktaki adına dokun', quiet: true };
  const RL = isKurallari(o.pkg);
  const tur = isTuru(o.pkg);
  const sr = (o.sr || {}) as { rack?: { stage?: string; t0: number; n: number }; insp?: { ok: boolean }[] };
  const ayar = istasyonAyari(o.pkg);
  if (o.state === 'running' || o.state === 'setup' || o.state === 'paused') {
    if (tur === 'boya' && sr.rack && sr.rack.stage === 'oven' && simdi - sr.rack.t0 >= ayar.cureMin * 60000) return { tone: 'hazard', icon: 'thermometer', t: 'Fırın süresi doldu', d: `${sr.rack.n} parçalık askıyı çıkar`, act: 'st', btn: 'Boya paneli', pulse: true };
    if (tur === 'depo' && (ayar.items || []).length && o.good >= ayar.items.length) return { tone: 'run', icon: 'check', t: 'Toplama tamamlandı', d: 'Kiti teslim et ve işi bitir', act: 'finish', btn: 'Bitir' };
    if (tur === 'kalite' && (sr.insp || []).length >= ayar.n) {
      const red = (sr.insp || []).filter((r) => !r.ok).length;
      const kabul = red <= ayar.ac;
      return { tone: kabul ? 'run' : 'stop', icon: kabul ? 'check' : 'x', t: `Lot kararı: ${kabul ? 'KABUL' : 'RED'}`, d: `${red} red / ${(sr.insp || []).length} numune · işi bitir`, act: 'finish', btn: 'Bitir' };
    }
  }
  const ilkKapi = ilkParcaKapisi(o);
  const asinan = RL.prod.tools.find((t) => o.good - ((o.toolsAt || {})[t.id] || 0) >= t.life);
  const karar = o.lastDecision;
  if (karar && karar.status === 'rejected' && karar.km && !karar.ack) return { tone: 'hazard', icon: 'alert', t: karar.note ?? '', d: KALITE_MERKEZI_RET_UYARISI, act: 'ack', btn: 'Anladım', key: 'kmret' };
  if (karar && karar.status === 'rejected' && !karar.ack) return { tone: 'stop', icon: 'x', t: `Kalite RED · ${karar.bad}`, d: `${karar.note ? `${karar.note} · ` : ''}Makineyi durdur, düzelt ve yeni numune gönder`, act: 'stop', btn: 'Durdur', act2: 'ack', btn2: 'Anladım', pulse: true, key: 'rej' };
  if (o.pendingReq) {
    const ek = ilk && ilk.acik
      ? (ilk.yeniden ? ' · üretim uyarıyla sürer, karar gelene kadar sağlam sayılmaz' : ` · üretim sürer, sağlam parçalar Kalite Merkezi kararını bekler${kararBekleyenEki(ilk)}`)
      : ' · üretim devam edebilir';
    return { tone: 'done', icon: 'target', t: `Numune kalitede · ${(o.pendingItems || []).length} ölçü`, d: `Bekleme ${sure((simdi - (o.pendingAt ?? simdi)) / 1000).slice(3)}${ek}`, act: null, quiet: true, key: 'pend' };
  }
  // İlk parça Başlat'tan sonra üretilir, önce sağlam sayılır sonra kaliteye gider: numune stoktan teslim edilir.
  if (ilk && ilk.acik && ilkKapi.length && o.state === 'setup') return { tone: 'hazard', icon: 'wrench', t: 'Hazırlık yapılıyor', d: 'Hazırlık bitince başlat · ilk parçayı say ve kaliteye gönder', act: 'start', btn: 'Başlat' };
  if (ilk && ilk.acik && ilk.sayilan < 1 && o.state === 'running') return { tone: 'hazard', icon: 'plus', t: 'İlk parçayı say', d: 'İlk parça bitince İyi +1 · sonra kaliteye gönder', act: null, quiet: true, key: 'ilk' };
  const kalanDk = kalanAdet(o.target, o.good, o.scrap) * (o.cycle || 30) / 60;
  const nx = D.next ? `Sıradaki kontrol: ${D.next.b.nom} · ${D.next.v} ${D.next.u} sonra${D.next.who ? ` · ${D.next.who === 'op' ? 'sen ölçeceksin' : 'kaliteye'}` : ''}` : null;
  if (o.state === 'done') return { tone: 'done', icon: 'next', t: 'Sıradaki işe geç', d: siradaki ? `${siradaki.no} · ${siradaki.part} · hazırlık ${hazirlikSayisi(siradaki)}/4` : 'Kuyrukta iş yok', act: 'next', btn: 'Geç' };
  if (o.state === 'stopped') return { tone: 'stop', icon: 'rotate', t: 'Makine duruşta', d: 'Sorun giderildiyse yeniden başlat · yardım gerekiyorsa çağrı aç', act: 'restart', btn: 'Yeniden başlat', act2: 'call', btn2: 'Çağrı' };
  if (asinan && o.state !== 'queued') return { tone: 'stop', icon: 'tool', t: `Takım ömrü doldu · ${asinan.name}`, d: `${sayi(asinan.life)} parça işlendi · takımı değiştir, ofseti doğrula`, act: 'tool', btn: 'Değiştirildi', toolId: asinan.id, key: `tool:${asinan.id}:${(o.toolsAt || {})[asinan.id] || 0}` };
  const qd = D.due.filter((b) => D.who[b.id] !== 'op');
  const od = D.due.filter((b) => D.who[b.id] === 'op');
  const ilkUc = (l: PlanItem[]) => l.map((x) => x.nom).slice(0, 3).join(', ') + (l.length > 3 ? '…' : '');
  if (!qd.length && od.length) {
    const kritik = od.some((x) => x.crit);
    return { tone: kritik ? 'stop' : 'run', icon: 'ruler', t: `Ölçüm sırası sende · ${ilkUc(od)}`, d: `${kritik ? 'KRİTİK · ' : ''}${D.why[od[0]!.id] || ''} · resimde balona dokun, değeri gir · ${od.length} ölçü`, act: 'measure', btn: 'Ölç', id: od[0]!.id, pulse: true, key: 'opdue' };
  }
  if (D.due.length) {
    const b = qd[0]!;
    const kritik = qd.some((x) => x.crit);
    return { tone: kritik ? 'stop' : 'hazard', icon: 'target', t: `${ilkKapi.some((x) => x.id === b.id) ? 'İlk parça numunesi · ' : 'Numune zamanı · '}${ilkUc(qd)}`, d: `${kritik ? 'KRİTİK · ' : ''}Parçayı al, kaliteye gönder · ${qd.length} ölçü`, act: 'sample', btn: 'Kaliteye gönder', pulse: true, key: 'due' };
  }
  if (ilk && ilk.acik && !ilk.yeniden && ilk.sayilan > 1 && o.state === 'running') return { tone: 'hazard', icon: 'target', t: ILK_PARCA_KARAR_BEKLIYOR_ILETISI, d: `Üretim sürer · kalite kararıyla sağlama ya da redde geçer${kararBekleyenEki(ilk)}`, act: null, quiet: true, key: 'kb' };
  if (o.state === 'paused') return { tone: 'hold', icon: 'play', t: 'İş duraklatıldı', d: `Hazır olduğunda devam et${nx ? ` · ${nx}` : ''}`, act: 'resume', btn: 'Devam et' };
  if (o.state === 'queued') {
    return ilkKapi.length
      ? { tone: 'hazard', icon: 'wrench', t: 'Hazırlığa başla', d: `İlk parça Başlat'tan sonra kaliteye gider · ${ilkKapi.length} ölçü`, act: 'setup', btn: 'Hazırlığa geç' }
      : { tone: 'run', icon: 'play', t: 'İşi başlat', d: o.pkg ? `Paket hazır · Rev ${o.pkg.rev}` : 'Hazır olduğunda başlat', act: 'start', btn: 'Başlat' };
  }
  if (o.state === 'setup') {
    return ilkKapi.length
      ? { tone: 'hazard', icon: 'wrench', t: 'Hazırlık yapılıyor', d: 'İlk parçayı işle, sonra kaliteye gönder', act: 'sample', btn: 'İlk parçayı gönder' }
      : { tone: 'run', icon: 'check', t: 'İlk parça onaylandı', d: 'Kalite onayı geldi · üretime geçebilirsin', act: 'start', btn: 'Üretime geç' };
  }
  if (siradaki && kalanDk < 45) return { tone: 'done', icon: 'layers', t: 'Sıradaki işe hazırlan', d: `${siradaki.no} · ${siradaki.part} · ${Math.round(kalanDk)} dk sonra · hazırlık ${hazirlikSayisi(siradaki)}/4`, act: 'prepnext', btn: 'Hazırla', dismiss: true, key: 'prep' };
  return { tone: 'run', icon: 'gauge', t: 'Üretim sürüyor', d: nx || 'Planlı kontrol yok', act: siradaki ? 'prepnext' : null, btn: siradaki ? 'Sonraki iş' : null, quiet: true };
}

/* ── uyarılar (operator.ts wKey, dueWarns) ── */
export const uyariAnahtari = (w: Pick<Uyari, 'when' | 'n'>, x: Pick<Is, 'good'>): number => (w.when === 'every' && (w.n ?? 0) > 0 ? Math.floor(x.good / w.n!) : 0);

export function zamaniGelenUyarilar(uyarilar: readonly Uyari[], o: Is, simdi: number, since: number, vardiyaBasi: number): Uyari[] {
  return uyarilar.filter((w) => {
    if (!w.t || !w.t.trim()) return false;
    const a = (o.acks || {})[w.id];
    const calisiyor = o.state === 'running';
    const n = w.n ?? 0;
    if (w.when === 'every') return calisiyor && n > 0 && o.good >= n && (!a || uyariAnahtari(w, o) > (a.k || 0));
    if (w.when === 'interval') return calisiyor && n > 0 && simdi - (a ? a.at : (o.startedAt || since)) >= n * 60000;
    if (w.when === 'shift') return (calisiyor || o.state === 'setup') && (!a || a.at < vardiyaBasi);
    if (w.when === 'tool') return !!o.toolEvt && (!a || a.at < o.toolEvt);
    return false;
  });
}
// Başlamadan önce okunacak uyarılar: bu paket sürümünde onaylanmamış olanlar.
export const baslangicUyarilari = (uyarilar: readonly Uyari[], o: Is): Uyari[] =>
  uyarilar.filter((w) => w.t && w.t.trim() && w.when === 'start' && !((o.acks || {})[w.id] && (o.acks || {})[w.id]!.v === (o.pkg && o.pkg.version)));

/* ── takım ömrü ── */
// Ömrünün uyarı eşiğini geçen takımlar (henüz söylenmemiş olanları ekran ayıklar).
export function takimUyarilari(o: Pick<Is, 'good' | 'toolsAt' | 'no'>, takimlar: readonly { id: string; name: string; life: number; warnPct: number }[]): { anahtar: string; metin: string }[] {
  const cikti: { anahtar: string; metin: string }[] = [];
  for (const t of takimlar) {
    const taban = (o.toolsAt || {})[t.id] || 0;
    const kullanilan = o.good - taban;
    const yuzde = kullanilan / t.life * 100;
    if (yuzde >= t.warnPct && yuzde < 100) cikti.push({ anahtar: `${o.no}:${t.id}:${taban}w`, metin: `${t.name} ömrünün %${Math.round(yuzde)}’inde · ${t.life - kullanilan} parça kaldı` });
  }
  return cikti;
}
// Sayacı olmayan takımlar işin şimdiki sayısının ömre göre tabanıyla başlar.
export const eksikTakimTabanlari = (o: Pick<Is, 'good' | 'toolsAt'>, takimlar: readonly { id: string; life: number }[]): Record<string, number> | null => {
  const eksik = takimlar.filter((t) => (o.toolsAt || {})[t.id] == null);
  return eksik.length ? { ...o.toolsAt, ...Object.fromEntries(eksik.map((t) => [t.id, o.good - (o.good % t.life)])) } : null;
};

/* ── duruş nedeni önerileri (reasonSuggest) ── */
export interface OneriGirdisi {
  o: Is; D: KontrolTakvimi; takimlar: readonly { id: string; name: string; life: number }[];
  planliDurus: { reason?: string; title?: string } | null; molada: boolean;
  sonDurusNedeni: string | null; siradaki: Is | null | undefined;
}
export function durusOnerileri(g: OneriGirdisi): { code: string; why: string }[] {
  const { o, D } = g;
  const cikti: { code: string; why: string }[] = [];
  if ((o.pkg && o.pkg.plan.some((b) => (b.freq || 'İlk parça') === 'İlk parça' && !(o.meas || {})[b.id])) || D.due.length) cikti.push({ code: 'D-05', why: 'Bekleyen kalite kontrolü var' });
  for (const t of g.takimlar) {
    const kalan = t.life - (o.good - ((o.toolsAt || {})[t.id] || 0));
    if (kalan < t.life * 0.12) cikti.push({ code: 'D-04', why: `${t.name} ömrü: ${Math.max(0, kalan)} parça kaldı` });
  }
  if (g.planliDurus && g.planliDurus.reason) cikti.unshift({ code: g.planliDurus.reason, why: `Takvimde planlı: ${g.planliDurus.title || ''}` });
  if (g.molada) cikti.push({ code: 'D-08', why: 'Mola saati' });
  if (g.sonDurusNedeni) cikti.push({ code: g.sonDurusNedeni, why: 'Son duruş nedeni' });
  if (g.siradaki && hazirlikSayisi(g.siradaki) < 2 && Math.max(0, o.target - o.good) < 30) cikti.push({ code: 'D-01', why: 'Sıradaki iş için malzeme hazır değil' });
  return cikti;
}

/* ── durum düğmeleri (bilesenler.ts Orbs) ── */
export interface DurumDugmesi { key: string; eylem: GorevEylemi; simge: SimgeAdi; etiket: string; ton: Ton; ana?: boolean; tut?: boolean }
export function durumDugmeleri(durum: string): DurumDugmesi[] {
  if (durum === 'queued') return [
    { key: 'su', eylem: 'setup', simge: 'wrench', etiket: 'Hazırlık', ton: 'hazard' },
    { key: 's', eylem: 'start', simge: 'play', etiket: 'İşi Başlat', ton: 'run', ana: true },
    { key: 'd', eylem: 'drawing', simge: 'ruler', etiket: 'Resim', ton: 'done' },
  ];
  if (durum === 'setup') return [{ key: 's', eylem: 'start', simge: 'play', etiket: 'Üretime Geç', ton: 'run', ana: true }];
  if (durum === 'running') return [
    { key: 'x', eylem: 'stop', simge: 'stop', etiket: 'Durdur', ton: 'stop', tut: true },
    { key: 'p', eylem: 'pause', simge: 'pause', etiket: 'Duraklat', ton: 'hold', ana: true },
    { key: 'f', eylem: 'finish', simge: 'flag', etiket: 'Bitir', ton: 'done', tut: true },
  ];
  if (durum === 'paused') return [
    { key: 'x', eylem: 'stop', simge: 'stop', etiket: 'Durdur', ton: 'stop', tut: true },
    { key: 'r', eylem: 'resume', simge: 'play', etiket: 'Devam Et', ton: 'run', ana: true },
    { key: 'f', eylem: 'finish', simge: 'flag', etiket: 'Bitir', ton: 'done', tut: true },
  ];
  if (durum === 'stopped') return [
    { key: 'r', eylem: 'restart', simge: 'rotate', etiket: 'Yeniden Başlat', ton: 'run', ana: true },
    { key: 'f', eylem: 'finish', simge: 'flag', etiket: 'Bitir', ton: 'done', tut: true },
  ];
  return [{ key: 'n', eylem: 'next', simge: 'next', etiket: 'Sıradaki İş', ton: 'hazard', ana: true }];
}
// Telefonun alt eylem çubuğu (618, 615-1 b): durumun ana eylemi ve Durdur. Durdur dokunuşla duruş nedeni penceresini açar, orada onaylanır;
// basılı tutulan Bitir ve ikincil eylemler (Hazırlık, Resim) aşağıdaki düğme grubunda kalır.
export function cubukDugmeleri(durum: string): DurumDugmesi[] {
  return durumDugmeleri(durum).filter((d) => d.ana || d.eylem === 'stop').map(({ tut: _tut, ...d }) => d);
}
// Durum düğmesinin geri alınabilir iletisi ve simgesi (act içindeki sözlükler).
export const DURUM_ILETISI: Readonly<Record<string, string>> = { start: 'Üretim başladı', resume: 'Üretime devam', restart: 'Yeniden başlatıldı', pause: 'İş duraklatıldı', setup: 'Hazırlık süresi başladı' };
export const DURUM_SIMGESI: Readonly<Record<string, SimgeAdi>> = { pause: 'pause', setup: 'wrench' };
export const EYLEM_DURUMU: Readonly<Record<string, 'running' | 'paused' | 'setup'>> = { start: 'running', resume: 'running', restart: 'running', pause: 'paused', setup: 'setup' };
export const URETIM_EYLEMLERI: readonly string[] = ['start', 'resume', 'restart', 'pause', 'setup', 'stop', 'finish'];

/* ── sekmeler (operator.ts tabs, MV) ── */
export interface EkranSekmesi { id: 'st' | 'draw' | 'steps' | 'ana' | 'ozet' | 'prod' | 'queue'; l: string; simge: SimgeAdi; n?: number | null }
// 1354 a (kart #1358): Telefon profilinde sunucu çizim dosyası vermez; Resim sekmesi çizimsiz ölçü listesine döner. Sekme dosyaya değil
// kontrol planına bağlıdır: dosyası olup planı boş işte telefonda açılacak bir şey yoktur.
const resimSekmesiVar = (o: Is, panelVar: boolean, telefon: boolean): boolean => (telefon
  ? !!(o.pkg && o.pkg.plan.length)
  : !panelVar || !!(o.pkg && o.pkg.files && o.pkg.files.length));
export function isSekmeleri(o: Is, panelVar: boolean, panelSekmesi: string, panelSimgesi: SimgeAdi, D: KontrolTakvimi, telefon = false): EkranSekmesi[] {
  const l: EkranSekmesi[] = [];
  if (panelVar) l.push({ id: 'st', l: panelSekmesi, simge: panelSimgesi });
  if (resimSekmesiVar(o, panelVar, telefon)) l.push({ id: 'draw', l: telefon ? 'Ölçüler' : panelVar ? 'Resim' : 'Teknik Resim', simge: 'ruler', n: D.due.length || null });
  l.push({ id: 'steps', l: 'Adımlar', simge: 'list', n: o.pkg ? o.pkg.steps.filter((x) => x.r).length : null });
  l.push({ id: 'ana', l: 'Analiz', simge: 'chart' });
  return l;
}
export function mobilGorunumler(
  o: Is, ozetVar: boolean, panelVar: boolean, panelKisa: string, panelSimgesi: SimgeAdi, D: KontrolTakvimi, yeniSayisi: number, telefon = false,
): EkranSekmesi[] {
  const l: EkranSekmesi[] = [];
  if (ozetVar) l.push({ id: 'ozet', l: 'Özetim', simge: 'user' });
  l.push({ id: 'prod', l: 'Üretim', simge: 'gauge' });
  if (panelVar) l.push({ id: 'st', l: panelKisa, simge: panelSimgesi });
  if (resimSekmesiVar(o, panelVar, telefon)) l.push({ id: 'draw', l: telefon ? 'Ölçüler' : 'Resim', simge: 'ruler', n: D.due.length || null });
  l.push({ id: 'queue', l: 'İşler', simge: 'list', n: yeniSayisi || null });
  l.push({ id: 'steps', l: 'Adımlar', simge: 'check' });
  if (!panelVar) l.push({ id: 'ana', l: 'Analiz', simge: 'chart' });
  return l;
}

// Telefondaki ölçü listesi: operatörün ölçtüğü noktalar önce, onların içinde sırası gelenler (kontrol takvimi) önce; kalitenin ölçtüğü
// noktalar salt okunur görünür. Sıra kontrol planı numarasıyla bozulmaz.
export interface OlcuSatiri { b: PlanItem; operator: boolean; sirada: boolean; olcum: Meas | null }
export function olcuSatirlari(plan: readonly PlanItem[], operatorOlcer: readonly number[], siradaki: readonly number[], olcumler: Readonly<Record<string, Meas>>): OlcuSatiri[] {
  const op = new Set(operatorOlcer), sira = new Set(siradaki);
  const derece = (x: OlcuSatiri) => (x.operator ? 0 : 2) + (x.sirada ? 0 : 1);
  return plan
    .map((b) => ({ b, operator: op.has(b.id), sirada: sira.has(b.id), olcum: olcumler[b.id] ?? null }))
    .sort((a, c) => derece(a) - derece(c) || a.b.id - c.b.id);
}

/* ── kalite kararı (onSampleResult) ── */
interface NumuneSonucu { items: number[]; results: Record<string, Meas>; status: string }
export function kararOzeti(rq: NumuneSonucu, plan: readonly PlanItem[]): { kotuMetni: string; olcumler: Record<string, Meas> } {
  const kotu = rq.items.map((id) => ({ id, r: rq.results[id] })).filter((x) => x.r && !x.r.ok);
  const kotuMetni = kotu.map((x) => { const b = plan.find((q) => q.id === x.id); return `${b ? b.nom : `#${x.id}`} = ${x.r!.v}`; }).join(', ');
  const olcumler: Record<string, Meas> = {};
  for (const id of rq.items) if (rq.results[id]) olcumler[id] = { ...rq.results[id]!, ...(rq.status === 'deviation' ? { dev: true } : null) };
  return { kotuMetni, olcumler };
}

/* ── hurda uyarısı (doScrap) ── */
export function hurdaUyarisi(o: Pick<Is, 'good' | 'scrap'>, kurallar: { scrapPct: number; scrapMin: number }, sonHurdalar: readonly number[]): { tur: 'oran'; oran: number } | { tur: 'artis'; adet: number } | null {
  const toplam = o.good + o.scrap + 1;
  const oran = (o.scrap + 1) / toplam * 100;
  if (kurallar.scrapPct > 0 && toplam >= kurallar.scrapMin && oran >= kurallar.scrapPct) return { tur: 'oran', oran };
  const yakin = sonHurdalar.filter((c) => o.good - c <= 20);
  return yakin.length >= 3 ? { tur: 'artis', adet: yakin.length } : null;
}

// Sonuç belgesi (saveResult): işin tabletteki son durumu paket başına yazılır.
export const sonucBelgesi = (x: Is): Result & { kart: number | null } => ({
  id: x.pkg!.id, no: x.no, rev: x.pkg!.rev, version: x.pkg!.version, state: x.state, good: x.good, scrap: x.scrap, baseGood: x.baseGood ?? 0,
  meas: x.meas || {}, pins: x.pins || [], acks: x.acks || {}, toolsAt: x.toolsAt || {}, sr: x.sr || {}, kart: x.kart ?? null, at: Date.now(),
});

// Toplu ve tek sayımda dokunulmayan iyi parça oranı (DoneOv).
export const kaliteYuzdesi = (o: Pick<Is, 'good' | 'scrap'>): string => (100 * o.good / (o.good + o.scrap || 1)).toFixed(1);


// Ton adı -> ortak arayüzün durum adı (renk data-durum ile seçilir).
const TON_DURUMU: Readonly<Record<Ton, MakineDurumu>> = { run: 'calisiyor', hold: 'durakli', stop: 'durdu', done: 'bitti', hazard: 'ayar', idle: 'sirada' };
export const tonDurumu = (t: Ton): MakineDurumu => TON_DURUMU[t];

// Çağrı ekibinin rengi (temel.ts CALLS): ayarcının eski rengi (cmm) tasarımda yoktur, bekleyen rengiyle çizilir.
const CAGRI_TONU: Readonly<Record<string, Ton>> = { bakim: 'stop', kalite: 'done', malzeme: 'hold', amir: 'hazard', ayarci: 'idle' };
export const cagriTonu = (k: string): Ton => CAGRI_TONU[k] ?? 'idle';
export const CAGRI_ASAMALARI = ['Çağrıldı', 'Alındı', 'Yolda', 'Geldi'] as const;
export const HIZLI_YANITLAR: readonly { t: string; r: string | null; close?: boolean }[] = [
  { t: 'Tamam, bekliyorum', r: null }, { t: 'Acil · makine durdu', r: 'Anlaşıldı, hızlanıyorum. 2 dakikaya oradayım.' },
  { t: 'Malzeme / parça getir', r: 'Getiriyorum.' }, { t: 'Gerek kalmadı, çözüldü', r: 'Tamam, çağrıyı kapatıyorum.', close: true },
];

/* ── vardiya hesabı (shiftCalc): kullanılabilirlik, performans, kalite ── */
export interface VardiyaVerisi { ev: readonly DurumOlayi[]; cn: readonly SayimKaydi[]; sh: AnlikVardiya }
export type VardiyaHesabi = OeeSonucu & { sh: AnlikVardiya; plannedCycle: number | null; expected: number | null };
export function vardiyaHesabi(d: VardiyaVerisi, simdi: number, ortam: OeeOrtami): VardiyaHesabi {
  const sh = d.sh;
  const son = Math.max(sh.s + 1, Math.min(simdi, sh.e));
  const c = oeeHesapla({ ev: d.ev, cn: d.cn, from: sh.s, to: son, windows: anlikPencereler(sh) }, ortam);
  const planli = d.cn.find((x) => x.planMs);
  const plannedCycle = planli ? planli.planMs ?? null : null;
  return { ...c, sh, plannedCycle, expected: plannedCycle && !sh.tanimsiz ? Math.floor(c.planned / plannedCycle) : null };
}
export const yuzde = yuzdeMetni;

// Vardiya özeti penceresinin sayıları (shiftStats). Ölçüm ve hatalı sayıları bu açılıştaki ekrandan, gerisi vardiyanın kayıtlarındandır.
// 1190: TMI işinde Hatalı girişi hurda sayımına yazılmaz (1188), bu yüzden hatalı adedi ayrı gelir; TMI dışı işte alan yoktur.
export interface VardiyaOzetGirdisi {
  kisi: string; istasyon: string; cevrim: number; olcumUygun: number; olcumRed: number;
  cagriSureleri: readonly number[]; cagriAcik: boolean; nedenAdi: (kod: string) => string; hatali?: number;
}
export interface VardiyaOzeti {
  title: string; machine: string; good: number; scrap: number; best: number | string; std: number | string; mOk: number; mNok: number;
  stopMin: number; stops: number; topReason: string | null; calls: number; callAvg: string; goal: number; headline: string; hatali?: number;
}
export function vardiyaOzeti(c: VardiyaHesabi, g: VardiyaOzetGirdisi): VardiyaOzeti {
  const good = c.good;
  const ort = g.cagriSureleri.length ? `${Math.round(g.cagriSureleri.reduce((a, x) => a + x, 0) / g.cagriSureleri.length / 1000)} sn` : '';
  const headline = c.sh.tanimsiz ? 'Vardiya tanımsız; OEE hesaplanmadı.'
    : !c.has ? 'Bu vardiyada henüz üretim kaydı yok.'
    : c.oee != null ? `OEE ${yuzde(c.oee)} · kullanılabilirlik ${yuzde(c.A)}, performans ${yuzde(c.P && Math.min(1, c.P))}, kalite ${yuzde(c.Q)}.`
    : 'Kayıtlar toplanıyor.';
  return {
    title: `Vardiya özeti · ${g.kisi.split(' ')[0] ?? ''}`, machine: g.istasyon, good, scrap: c.scrap, best: c.best ? Math.round(c.best / 1000) : '—',
    std: g.cevrim || '—', mOk: g.olcumUygun, mNok: g.olcumRed, stopMin: Math.round(c.stopMs / 60000), stops: c.stops,
    topReason: c.topReason ? g.nedenAdi(c.topReason) : null, calls: g.cagriSureleri.length + (g.cagriAcik ? 1 : 0), callAvg: ort,
    goal: c.expected || Math.max(1, good), headline, ...(g.hatali === undefined ? {} : { hatali: g.hatali }),
  };
}

// Kadranın yanındaki "kalan süre" (dur(remain * cycle)) ve uzak moddaki kalan süre.
export const kalanSure = (adet: number, cevrimSn: number): string => sure(Math.max(0, adet) * cevrimSn);

export type { GorevEylemi };

// 564 1 b, 600 a: kalite istasyonu terminali yalnız kendisine gönderilen açık numuneleri listeler (eskiden yeniye).
export const kaliteIstasyonuNumuneleri = (liste: readonly KaliteNumunesi[], istasyon: string): KaliteNumunesi[] =>
  liste.filter((r) => r.kaliteIstasyonu === istasyon && (r.status === 'waiting' || r.status === 'measuring')).sort((a, b) => a.at - b.at);

// 564 6 a, 600 a: lot kararının eksiği (sunucu da aynısını denetler). Boş sınıf sayılmamıştır (null), sıfır yazılmaz.
export const LOT_SINIFLARI: readonly LotSinifi[] = ['Kritik', 'Majör', 'Minör'];
export function lotSayisi(metin: string): number | null | 'hata' {
  const t = metin.trim();
  if (t === '') return null;
  return /^\d{1,6}$/.test(t) ? Number(t) : 'hata';
}
export function lotKarariEksigi(karar: LotKarari['karar'], bulunan: Record<LotSinifi, number | null | 'hata'>, not: string): string | null {
  const sayilar = LOT_SINIFLARI.map((s) => bulunan[s]);
  if (sayilar.includes('hata')) return 'Kusurlu sayısı tam sayı olmalı.';
  if (sayilar.every((x) => x === null)) return 'Muayenede bulunan kusurlu sayılarını girin (yoksa 0).';
  if (karar === 'ret' && !sayilar.some((x) => typeof x === 'number' && x > 0)) return 'Red için en az bir kusurlu sayısı girin.';
  if (karar === 'ret' && not.trim() === '') return 'Red için gerekçe yazın.';
  return null;
}
export function lotKarariOku(sonuc: unknown): LotKarari | null {
  const lk = sonuc && typeof sonuc === 'object' ? (sonuc as { lotKarari?: unknown }).lotKarari : undefined;
  if (!lk || typeof lk !== 'object') return null;
  const k = lk as Partial<LotKarari>;
  return (k.karar === 'kabul' || k.karar === 'ret') && k.bulunan && typeof k.at === 'number' ? k as LotKarari : null;
}
