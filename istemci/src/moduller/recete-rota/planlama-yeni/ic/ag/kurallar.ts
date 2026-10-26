import { siparisRengi } from '../../motor/harita/kurallar.ts';
import { saatYaz, sayiYaz, type Derleme, type OkunanPlan, type PlanIslemi } from '../../motor/kurallar.ts';
import type { PlanVerisi } from '../../tipler.ts';
import { KARAR_DURUM, type EkipSonu } from '../hesap/kurallar.ts';

// Akış ağı (3B) (bugünkü sayfa: cerceve/planlama/parca/j-ag3b.betik, k-gorunum.betik agAtolye*): verinin kısıta, kısıtın çözücüye, çözücünün
// karara, kararın plana nasıl aktığı; planın zaman ağı ve atölye akışı. Kütüphane yok: noktalar elle döndürülür, perspektifle izdüşürülür.
// Sahneler saf hesaplardır; çizim ciz.ts'te, etkileşim index.tsx'te.

export type AgKipi = 'atolye' | 'uretim' | 'karar';
export const AG_KIPLERI = [['atolye', 'Atölye akışı', 'cube'], ['uretim', 'Zaman ağı', 'gantt'], ['karar', 'Karar akışı', 'layers']] as const;

export const AG_KATMAN = [
  ['veri', 'Veri', 'Tezgâh, rota, takvim, personel, malzeme ve sipariş verisi girilir. Her kısıt hangi veriden beslendiğini bilir; veri denetimi çözücüden önce koşar.'],
  ['kisit', 'Kısıtlar', 'On altı kısıt tek katalogda tanımlıdır. Her kısıt her çözücüde ya tam, ya yaklaşık, ya gevşek ya da hiç yoktur; çizginin kalınlığı bunu gösterir.'],
  ['cozucu', 'Çözücüler', 'Motor planı kurar ve hakemdir: bütün kısıtları tam uygular. HiGHS ek mesai önerir; HiGHS ayrıca alt sınırı hesaplar.'],
  ['karar', 'Kararlar', 'Her öneri motorun takviminde ölçülür. Planı iyileştiren alınır, iyileştirmeyen ya da bütçeyi aşan alınmaz; hepsi kayıtlıdır.'],
  ['plan', 'Plan ve siparişler', 'Alınan kararlar tek planda birleşir. Siparişin rengi termine göre durumunu, büyüklüğü gecikmesini gösterir.'],
] as const;

// Tek kısıt hattı (bugünkü sayfa KISITLAR): her kısıt bir kez tanımlıdır; veri yeri ve her çözücünün onu nasıl kullandığı.
// tam: aynen; yaklasik: değiştirilmiş hâliyle; gevsek: alt sınır geçerli kalsın diye bilerek küçültülmüş; karar: kullanıcı kararına bağlı; yok: modelde yok.
export type CozucuDurumu = 'tam' | 'yaklasik' | 'gevsek' | 'karar' | 'yok';
export interface HatKisiti { id: string; ad: string; veri: string; motor: CozucuDurumu; sinir: CozucuDurumu; cerceve: CozucuDurumu; not: string }
export const KDURUM: Record<CozucuDurumu, string> = { tam: 'tam', yaklasik: 'yaklaşık', gevsek: 'gevşek (sınır geçerli kalsın)', yok: 'yok', karar: 'karara bağlı' };
export const KISIT_HATTI: readonly HatKisiti[] = [
  { id: 'takvim', ad: 'Vardiya, tatil, tezgâh vardiyası, ek mesai', veri: 'vardiyalar, calismaGunleri, tatiller, tezgahlar[].vardiyalar, ekMesai', motor: 'tam', sinir: 'tam', cerceve: 'tam', not: 'CP-SAT takvimi motorun başla-bitir tablosundan okur.' },
  { id: 'ariza', ad: 'Arıza ve planlı bakım', veri: 'down (tezgâh, başlangıç, bitiş)', motor: 'tam', sinir: 'tam', cerceve: 'tam', not: 'Takvimden düşülür.' },
  { id: 'tezgah', ad: 'Alternatif tezgâh, verim, tek tezgâhta tek iş', veri: 'urunler[].rota[].tezgahlar, tezgahlar[].verim', motor: 'tam', sinir: 'tam', cerceve: 'yaklasik', not: 'Çerçeve tezgâh grubunu toplu sayar.' },
  { id: 'rota', ad: 'Rota sırası, örtüşmeli geçiş, taşıma süresi', veri: 'rota[].bag, ayarlar.tasimaSaat, transferOran', motor: 'tam', sinir: 'gevsek', cerceve: 'yaklasik', not: 'Alt sınır ve CP-SAT örtüşmede ilk partiyi ayarsız sayar.' },
  { id: 'ayar', ad: 'Sıraya bağlı ayar (aile matrisi, aynı aile kısalması)', veri: 'ayarMatrisi, rota[].aile, tezgahlar[].ayar, w.famK', motor: 'tam', sinir: 'gevsek', cerceve: 'gevsek', not: 'Alt sınır ve çerçeve en kısa ayarı alır. CP-SAT geçişi tezgâh sırasıyla hesaplar; geçişin uzattığı süreyi takvimsiz ekler.' },
  { id: 'fai', ad: 'İlk parça onayı', veri: 'rota[].fai, ayarlar.faiSaat', motor: 'tam', sinir: 'tam', cerceve: 'tam', not: '' },
  { id: 'ayarci', ad: 'Ayarcı sayısı', veri: 'personel[].ayar, devamsizlik, eksik', motor: 'tam', sinir: 'yok', cerceve: 'yok', not: 'CP-SAT ayarcıyı en kısa ayar süresince sayar.' },
  { id: 'personel', ad: 'Operatör sayısı ve yetkinlik grubu, ışıksız tezgâh', veri: 'personel[].vardiya/gruplar, tezgahlar[].opOran/isiksiz, devamsizlik, eksik', motor: 'tam', sinir: 'yok', cerceve: 'tam', not: 'CP-SAT ayar süresini de operatörlü sayar; ışıksız tezgâhı hiç saymaz.' },
  { id: 'aparat', ad: 'Aparat ve fikstür adedi', veri: 'aparatlar[].adet, rota[].aparat', motor: 'tam', sinir: 'yok', cerceve: 'yok', not: '' },
  { id: 'fason', ad: 'Fason çıkış günü, süre, kapasite', veri: 'fasoncular', motor: 'tam', sinir: 'yaklasik', cerceve: 'tam', not: 'Alt sınır fason kapasitesini saymaz.' },
  { id: 'program', ad: 'CNC programı hazır olmadan başlamaz', veri: 'rota[].program, ayarlar.programSaat', motor: 'tam', sinir: 'tam', cerceve: 'yok', not: '' },
  { id: 'serbest', ad: 'Siparişin serbest bırakılma zamanı', veri: 'siparisler[].serbest', motor: 'tam', sinir: 'tam', cerceve: 'tam', not: '' },
  { id: 'malzeme', ad: 'Malzeme (stok, satın alma, tedarikçi gecikmesi)', veri: 'malzemeler, satinalma, tedarikciler', motor: 'karar', sinir: 'karar', cerceve: 'karar', not: 'K3 kararı: eksik malzemede iş başlar, uyarı verilir; "sert" seçilirse hepsi başlangıç sınırı olarak alır.' },
  { id: 'sabit', ad: 'Başlamış, kilitli, dondurulmuş işler', veri: 'gercek, locks, dondurma', motor: 'tam', sinir: 'tam', cerceve: 'tam', not: 'Hakem değişmişse sayar ve reddeder.' },
  { id: 'amac', ad: 'Sıralı amaç: gecikme > değişiklik > ayar > maliyet', veri: 'w.amac, oncelik, termin', motor: 'tam', sinir: 'yaklasik', cerceve: 'yaklasik', not: 'Alt sınır ve çerçeve yalnız ağırlıklı gecikmeyi; CP-SAT gecikmeyi, sonra ayarı sayar. Değişikliği hakem ölçer.' },
  { id: 'butce', ad: 'Değişiklik ve haftalık mesai bütçesi', veri: 'w.degisimButce, mesaiButce', motor: 'tam', sinir: 'yok', cerceve: 'tam', not: 'Hakem uygular.' },
];
const AG_VERI: readonly [string, string, RegExp][] = [
  ['tezgah', 'Tezgâhlar', /tezgahlar|down/], ['rota', 'Ürün ve rota', /rota|urunler/], ['takvim', 'Takvim ve vardiya', /vardiya|tatil|calismaGun|ekMesai/],
  ['personel', 'Personel', /personel|devamsizlik|eksik/], ['ayarm', 'Ayar matrisi', /ayarMatrisi|famK/], ['aparat', 'Aparat', /aparat/],
  ['fason', 'Fason', /fason/], ['malzeme', 'Malzeme ve satın alma', /malzeme|satinalma|tedarik/], ['siparis', 'Siparişler', /siparisler|oncelik|termin|gercek|locks/],
  ['param', 'Parametreler ve bütçe', /ayarlar\.|w\.|Butce/],
];
const AG_COZ = [['motor', 'Motor (hakem)'], ['cerceve', 'HiGHS · ek mesai'], ['sinir', 'HiGHS · alt sınır']] as const;
const AG_X = [-1.1, -0.6, -0.1, 0.4, 1.1] as const;
const AG_GUC: Record<CozucuDurumu, number> = { tam: 1, yaklasik: 0.5, gevsek: 0.5, karar: 0.5, yok: 0 };

export type Nokta = [number, number, number];
export interface AgDugumu {
  id: string; katman: number; ad: string; alt: string; tur: string; boy: number; p: Nokta;
  // Zaman ağında işlemin başı ve sonu (x); atölyede tezgâh, grup ve fason.
  u?: [number, number]; renk?: number; job?: string; m?: string; grup?: string;
}
export interface AgBagi { a: string; b: string; g: number; tur: string; not?: string; n?: number; gecis?: [PlanIslemi, PlanIslemi][] }
export interface AtolyeBilgisi { now: number; t1: number; kuyruk: Record<string, PlanIslemi[]>; maxN: number }
export interface AgSahnesi {
  kip: AgKipi; N: AgDugumu[]; E: AgBagi[]; ix: Record<string, AgDugumu>; bos: boolean;
  say: { is: number; tez: number; sip: number } | null; at: AtolyeBilgisi | null;
}
const sahne = (kip: AgKipi, N: AgDugumu[], E: AgBagi[], ek: Partial<Pick<AgSahnesi, 'bos' | 'say' | 'at'>> = {}): AgSahnesi =>
  ({ kip, N, E, ix: Object.fromEntries(N.map((n) => [n.id, n])), bos: false, say: null, at: null, ...ek });
const sa = (x: number) => sayiYaz(x, 1);

// Karar kipi: beş katman x ekseninde; katman içinde düğümler y-z düzleminde bir ızgaraya dizilir.
export function kararSahnesi(son: EkipSonu | null, p: OkunanPlan | null): AgSahnesi {
  const N: AgDugumu[] = [], E: AgBagi[] = [];
  const ekle = (id: string, katman: number, ad: string, alt: string, tur: string, boy = 1) => { N.push({ id, katman, ad, alt, tur, boy, p: [0, 0, 0] }); };
  for (const [id, ad] of AG_VERI) ekle(`v:${id}`, 0, ad, 'Veri', 'veri');
  for (const k of KISIT_HATTI) ekle(`k:${k.id}`, 1, k.ad, k.not || 'Kısıt', 'kisit');
  for (const [id, ad] of AG_COZ) ekle(`c:${id}`, 2, ad, id === 'motor' ? 'Bütün kısıtları tam uygular' : 'Öneri getirir; hakemden geçer', 'cozucu', id === 'motor' ? 1.5 : 1.2);
  const kr = son ? [...son.kararlar].sort((a, b) => Number(b.durum === 'alindi') - Number(a.durum === 'alindi') || (b.dW ?? -1e9) - (a.dW ?? -1e9)).slice(0, 12) : [];
  for (const k of kr) ekle(`d:${k.id}`, 3, k.ad, `${KARAR_DURUM[k.durum][0]} · ${k.dW == null ? 'ölçülmedi' : `${k.dW >= 0 ? '−' : '+'}${sa(Math.abs(k.dW))} sa`}`, `karar:${k.durum}`);
  if (!kr.length) ekle('d:yok', 3, 'Ekip henüz çalışmadı', 'Ekip çözümü çalışınca kararlar burada belirir', 'karar:yok');
  ekle('p:plan', 4, 'Plan', son ? `Ağırlıklı gecikme ${sa(son.wT)} sa · alt sınır ${sa(son.lb)} sa` : p ? `Ağırlıklı gecikme ${sa(p.ozet.wT)} sa` : 'Plan yok', 'plan', 1.6);
  const J: Record<string, [number | null, number | null]> = son ? son.J : p ? Object.fromEntries(Object.entries(p.J).map(([j, x]) => [j, [null, x.T ?? 0]])) : {};
  const sl = Object.entries(J).sort((a, b) => (b[1][1] ?? 0) - (a[1][1] ?? 0)).slice(0, 15);
  for (const [j, [a, b]] of sl) {
    const T = b ?? 0;
    ekle(`s:${j}`, 4, j, `Gecikme ${a == null ? '' : `${sa(a)} → `}${sa(T)} sa`, T > 0.05 ? 'siparis:gec' : 'siparis:zaman', 0.8 + Math.min(1.2, T / 24));
  }
  const top = [0, 0, 0, 0, 0], say = [0, 0, 0, 0, 0];
  for (const n of N) top[n.katman] = (top[n.katman] ?? 0) + 1;
  for (const n of N) {
    if (n.id === 'p:plan') { n.p = [0.78, 0, 0]; continue; }
    const i = n.katman; const k = say[i] ?? 0; say[i] = k + 1;
    const adet = (top[i] ?? 1) - (i === 4 ? 1 : 0); const sut = Math.ceil(Math.sqrt(adet)), sat = Math.ceil(adet / sut);
    const a = k % sut, b = Math.floor(k / sut);
    n.p = [AG_X[i] ?? 0, sat > 1 ? -0.8 + (1.6 * b) / (sat - 1) : 0, sut > 1 ? -0.8 + (1.6 * a) / (sut - 1) : 0];
  }
  for (const k of KISIT_HATTI) {
    for (const [id, , re] of AG_VERI) if (re.test(k.veri)) E.push({ a: `v:${id}`, b: `k:${k.id}`, g: 0.6, tur: 'veri' });
    for (const [id] of AG_COZ) { const d = k[id]; const g = AG_GUC[d]; if (g) E.push({ a: `k:${k.id}`, b: `c:${id}`, g, tur: g === 1 ? 'tam' : 'yaklasik', not: KDURUM[d] }); }
  }
  for (const k of kr) {
    // CP-SAT bu ekipte yoktur; onun kararının öneri bağı çizilmez (bugünkü sayfada da düğümsüz kalırdı).
    if (k.tur !== 'cpsat') E.push({ a: `c:${k.tur === 'mesai' ? 'cerceve' : 'motor'}`, b: `d:${k.id}`, g: 0.8, tur: 'oneri' });
    if (k.tur !== 'motor') E.push({ a: 'c:motor', b: `d:${k.id}`, g: 0.5, tur: 'hakem' });
    if (k.durum === 'alindi') E.push({ a: `d:${k.id}`, b: 'p:plan', g: 1, tur: 'alindi' });
  }
  if (!kr.length) E.push({ a: 'c:motor', b: 'd:yok', g: 0.4, tur: 'hakem' });
  E.push({ a: 'c:sinir', b: 'p:plan', g: 0.5, tur: 'sinir' });
  for (const [j] of sl) E.push({ a: 'p:plan', b: `s:${j}`, g: 0.6, tur: 'plan' });
  return sahne('karar', N, E);
}

// Zaman ağı: x zaman, y tezgâh, z sipariş; her işlem bir çubuk, rota bağları ince çizgi. Fason ve saatsiz işlem düşer; en çok 700 işlem.
export function uretimSahnesi(D: PlanVerisi, p: OkunanPlan | null, cx: Derleme): AgSahnesi {
  const ops = p ? Object.values(p.ops).filter((o) => !o.fas && Number.isFinite(o.S) && Number.isFinite(o.C)).sort((a, b) => a.S - b.S).slice(0, 700) : [];
  if (!p || !ops.length) return sahne('uretim', [], [], { bos: true });
  const tz = [...new Set(ops.map((o) => o.m))].sort(), sp = [...new Set(ops.map((o) => o.job))];
  // Ufuk en geç işe değil yüzde 95'e göre ölçeklenir: tek uzun kuyruk bütün planı sola sıkıştırmasın.
  const Cs = ops.map((o) => o.C).sort((a, b) => a - b);
  const t0 = Math.min(...ops.map((o) => o.S)), t1 = Cs[Math.floor(Cs.length * 0.95)] ?? t0;
  const T = (t: number) => Math.min(1.15, -1 + (2 * (t - t0)) / Math.max(1, t1 - t0));
  const Y = (m: string) => (tz.length > 1 ? -0.9 + (1.8 * tz.indexOf(m)) / (tz.length - 1) : 0);
  const Z = (j: string) => (sp.length > 1 ? -0.9 + (1.8 * sp.indexOf(j)) / (sp.length - 1) : 0);
  const N: AgDugumu[] = ops.map((o) => {
    const g = p.J[o.job]?.T ?? 0;
    return {
      id: `o:${o.id}`, katman: 0, ad: o.id, alt: `${o.m} · ${saatYaz(D, o.S)} → ${saatYaz(D, o.C)}${g > 0.05 ? ` · sipariş ${sa(g)} sa gecikiyor` : ''}`,
      tur: 'is', renk: sp.indexOf(o.job) % 10, p: [(T(o.S) + T(o.C)) / 2, Y(o.m), Z(o.job)], u: [T(o.S), T(o.C)], boy: 0.7, job: o.job,
    };
  });
  const var_ = new Set(ops.map((o) => o.id)); const E: AgBagi[] = [];
  for (const o of ops) for (const [pid] of cx.byId[o.id]?.pr ?? []) if (var_.has(pid)) E.push({ a: `o:${pid}`, b: `o:${o.id}`, g: 0.5, tur: 'rota' });
  return sahne('uretim', N, E, { say: { is: N.length, tez: tz.length, sip: sp.length } });
}

// Atölye akışı: tezgâhlar zeminde rota sırasıyla dizilir (grup sırası rotadaki ortalama adım yeri), kuyruklar üstlerinde yığılır,
// parçalar tezgâhtan tezgâha akar. Yayın kalınlığı o yoldan geçen geçiş sayısıdır.
export function atolyeSahnesi(D: PlanVerisi, p: OkunanPlan | null, cx: Derleme): AgSahnesi {
  if (!p) return sahne('atolye', [], [], { bos: true });
  const grupOf = new Map(D.tezgahlar.map((t) => [t.id, t.grup ?? 'diger']));
  const sira: Record<string, number[]> = {};
  for (const u of D.urunler) {
    const r = u.rota ?? [];
    r.forEach((o, i) => {
      const gs = o.fason ? [`@${o.fason}`] : [...new Set((o.tezgahlar ?? []).map((t) => grupOf.get(t.id)).filter((g): g is string => !!g))];
      for (const g of gs) (sira[g] ??= []).push(i / Math.max(1, r.length - 1));
    });
  }
  const ort = (g: string) => { const l = sira[g] ?? [0.5]; return l.reduce((a, b) => a + b, 0) / l.length; };
  const gruplar = [...new Set(D.tezgahlar.map((t) => t.grup ?? 'diger'))];
  const kolon = [
    ...gruplar.map((g) => ({ g, l: D.tezgahlar.filter((t) => (t.grup ?? 'diger') === g).map((t) => ({ id: t.id, ad: t.ad ?? t.id, fas: false })) })),
    ...(D.fasoncular ?? []).filter((f) => sira[`@${f.id}`]).map((f) => ({ g: `@${f.id}`, l: [{ id: `@${f.id}`, ad: f.ad ?? f.id, fas: true }] })),
  ].sort((a, b) => ort(a.g) - ort(b.g));
  const N: AgDugumu[] = [];
  kolon.forEach((k, i) => {
    const x = kolon.length > 1 ? -1 + (2 * i) / (kolon.length - 1) : 0;
    k.l.forEach((m, j) => {
      const z = m.fas ? 0.95 : k.l.length > 1 ? -0.7 + (1.4 * j) / (k.l.length - 1) : -0.1;
      N.push({ id: `t:${m.id}`, katman: 0, m: m.id, ad: m.fas ? m.ad : m.id, alt: m.fas ? `Fason: ${m.ad}` : `${m.ad} · ${k.g}`, tur: m.fas ? 'fason' : 'tezgah', grup: k.g, p: [x, -0.3, z], boy: 1 });
    });
  });
  if (!N.length) return sahne('atolye', [], [], { bos: true });
  const var_ = new Set(N.map((n) => n.m));
  const akis: Record<string, AgBagi & { n: number; gecis: [PlanIslemi, PlanIslemi][] }> = {};
  for (const o of Object.values(cx.byId)) {
    for (const [pid] of o.pr) {
      const a = p.ops[pid], b = p.ops[o.id];
      if (!a || !b || a.m === b.m || !var_.has(a.m) || !var_.has(b.m)) continue;
      const k = `${a.m}>${b.m}`;
      const x = (akis[k] ??= { a: `t:${a.m}`, b: `t:${b.m}`, g: 0, tur: 'akis', n: 0, gecis: [] });
      x.n++; x.g = x.n; x.gecis.push([a, b]);
    }
  }
  const E = Object.values(akis);
  const now = cx.now; const Cs = Object.values(p.ops).map((r) => r.C).filter(Number.isFinite).sort((a, b) => a - b);
  const t1 = Cs.length ? (Cs[Math.floor(Cs.length * 0.97)] ?? now + 24) : now + 24;
  const kuyruk: Record<string, PlanIslemi[]> = {};
  for (const r of Object.values(p.ops)) if (Number.isFinite(r.C)) (kuyruk[r.m] ??= []).push(r);
  for (const l of Object.values(kuyruk)) l.sort((a, b) => a.S - b.S);
  return sahne('atolye', N, E, { at: { now, t1: Math.max(now + 24, t1), kuyruk, maxN: Math.max(1, ...E.map((e) => e.n)) } });
}

// Kamera: önce y ekseni etrafında, sonra x ekseni etrafında döndürülür; göz z=+D'de. Kendiliğinden dönüş tam tur değil, salınımdır.
export interface Kamera { rx: number; ry: number; ryBas: number; faz: number; uz: number }
export const ilkKamera = (kip: AgKipi): Kamera => (kip === 'atolye' ? { rx: -0.62, ry: 0, ryBas: 0, faz: 0, uz: 1.15 } : { rx: -0.22, ry: 0.3, ryBas: 0.3, faz: 0, uz: 1 });
// Atölye yukarıdan bakılınca okunur: salınım kapalı başlar.
export const ilkOto = (kip: AgKipi, az: boolean): boolean => kip !== 'atolye' && !az;
export const RX_SINIR = 1.45;
export const UZ_SINIR = [0.5, 3.5] as const;
export const sinirla = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

export type Izdusum = [number, number, number, number];
export function izdus(k: Kamera, p: Nokta, W: number, H: number): Izdusum {
  const cy = Math.cos(k.ry), sy = Math.sin(k.ry), cx = Math.cos(k.rx), sx = Math.sin(k.rx);
  const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
  const y2 = p[1] * cx - z1 * sx, z2 = p[1] * sx + z1 * cx;
  const D = 3.4, f = (Math.min(W, H) * 0.42 * k.uz * D) / (D - z2);
  return [W / 2 + x1 * f, H / 2 - y2 * f, z2, f];
}

// Ekrandaki konumu bilinen düğümlerden noktaya en yakını; eşit uzaklıkta öndeki (z büyük) kazanır.
export interface Konum { q: Izdusum; q0?: Izdusum; q1?: Izdusum; r: number }
export function bul(N: readonly AgDugumu[], yer: ReadonlyMap<string, Konum>, x: number, y: number): AgDugumu | null {
  let en: AgDugumu | null = null, ed = 1e9, ez = -1e9;
  for (const n of N) {
    const k = yer.get(n.id); if (!k) continue;
    let d: number;
    if (k.q0 && k.q1) {
      const [ax, ay] = k.q0, [bx, by] = k.q1; const vx = bx - ax, vy = by - ay;
      const t = sinirla(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
      d = Math.hypot(x - ax - t * vx, y - ay - t * vy);
    } else d = Math.hypot(x - k.q[0], y - k.q[1]);
    const lim = Math.max(10, k.r + 4);
    if (d < lim && (d < ed || k.q[2] > ez)) { ed = d; en = n; ez = k.q[2]; }
  }
  return en;
}

export function komsular(E: readonly AgBagi[], id: string | null): Set<string> {
  const s = new Set<string>(); if (!id) return s;
  for (const e of E) { if (e.a === id) s.add(e.b); if (e.b === id) s.add(e.a); }
  return s;
}
export function baglar(s: AgSahnesi, id: string): { gel: AgDugumu[]; git: AgDugumu[] } {
  const gel = s.E.filter((e) => e.b === id).map((e) => s.ix[e.a]).filter((x): x is AgDugumu => !!x);
  const git = s.E.filter((e) => e.a === id).map((e) => s.ix[e.b]).filter((x): x is AgDugumu => !!x);
  return { gel, git };
}

// Atölye yayı (ikinci derece Bézier): tezgâhların üstünden kavis çizer; u 0-1.
export function yay(a: AgDugumu, b: AgDugumu, u: number): Nokta {
  const yk = 0.25 + 0.35 * Math.min(1, Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]));
  const m: Nokta = [(a.p[0] + b.p[0]) / 2, a.p[1] + 0.15 + yk, (a.p[2] + b.p[2]) / 2];
  const q = 1 - u;
  return [q * q * a.p[0] + 2 * q * u * m[0] + u * u * b.p[0], q * q * (a.p[1] + 0.06) + 2 * q * u * m[1] + u * u * (b.p[1] + 0.06), q * q * a.p[2] + 2 * q * u * m[2] + u * u * b.p[2]];
}

// Atölyenin t anı: tezgâhta çalışan (ayarda ya da işlemede), sıradaki ilk yedi iş, yoldaki partiler ve özet sayıları.
export interface TezgahAni { simdi: PlanIslemi | null; ayarda: boolean; sira: PlanIslemi[]; fazla: number }
export function tezgahAni(at: AtolyeBilgisi, m: string, t: number): TezgahAni {
  const l = at.kuyruk[m] ?? []; const simdi = l.find((r) => r.S <= t && t < r.C) ?? null; const sonra = l.filter((r) => r.S > t);
  return { simdi, ayarda: !!simdi && simdi.Su !== null && t < simdi.Su, sira: sonra.slice(0, 7), fazla: Math.max(0, sonra.length - 7) };
}
export interface YoldakiParti { e: AgBagi; x: PlanIslemi; u: number }
export function yoldakiler(E: readonly AgBagi[], t: number): YoldakiParti[] {
  const l: YoldakiParti[] = [];
  for (const e of E) for (const [x, y] of e.gecis ?? []) if (x.C <= t && t < y.S) l.push({ e, x, u: Math.min(1, (t - x.C) / Math.max(0.5, y.S - x.C)) });
  return l;
}
export function atolyeOzeti(D: PlanVerisi, s: AgSahnesi, t: number): string {
  const at = s.at; if (!at) return '';
  let calisan = 0, bekleyen = 0;
  for (const n of s.N) {
    const l = at.kuyruk[n.m ?? ''] ?? [];
    if (l.some((r) => r.S <= t && t < r.C)) calisan++;
    bekleyen += l.filter((r) => r.S > t && r.S < t + 24).length;
  }
  return `${saatYaz(D, t)} · ${calisan} tezgâh çalışıyor · ${bekleyen} iş 24 saat içinde sırada · ${yoldakiler(s.E, t).length} parti tezgâhlar arasında`;
}
// Atölyede tezgâhın bu saatten sonraki ilk sekiz işi.
export const tezgahListesi = (at: AtolyeBilgisi, m: string, t: number): PlanIslemi[] => (at.kuyruk[m] ?? []).filter((r) => r.C > t).slice(0, 8);

// Sipariş rengi (bugünkü sayfa durumRenkHam): geciken sipariş kırmızı, öteki tahtadaki sırasıyla on renkli seriden.
export const siparisTonu = (D: PlanVerisi, p: OkunanPlan, j: string): number | 'gec' => ((p.J[j]?.T ?? 0) > 0.05 ? 'gec' : siparisRengi(D, j));
