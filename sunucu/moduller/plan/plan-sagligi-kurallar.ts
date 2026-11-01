import { PLAN_SAGLIGI_HAFTA, PLAN_SAGLIGI_SATIR, type PlanSagligiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';

// Plan sağlığı (1478): saf hesap. Zamanlar ISO metin, `simdi` milisaniye. Ölçülemeyen değer boştur; sıfır uydurulmaz (kural 5).

const SAAT = 3_600_000;
const GUN = 86_400_000;
const HAFTA = 7 * GUN;
// Plan uyumu: bitişi canlıya (yoksa tabana) göre bu kadar net dakikadan çok kayan adım "kaydı" sayılır; motorun "değişen iş" ölçüsündeki
// 8 saatle aynı eşik.
export const UYUM_KAYMA_DK = 8 * 60;
// Tahmini bitiş bundan az oynadıysa söz değişmemiş sayılır: canlıya almalar arasında dakikalık yuvarlama farkı kayma değildir.
export const SOZ_ESIK_SAAT = 1;
// Süre doğruluğu: bundan az örneği olan istasyon listelenmez (motorun öğrenme alanıyla aynı alt sınır).
export const SURE_EN_AZ_ORNEK = 3;

export interface BitenEmir { uretimEmriId: number; emirNo: string; bitis: string; termin: string | null }
export interface OlculenAdim {
  isEmriId: number; emirNo: string; opNo: number; istasyonId: number | null; istasyonAdi: string; bitis: string;
  tezgahUyumu: boolean | null; siraUyumu: boolean | null; kaymaDk: number | null; sureOrani: number | null;
}
export interface Olcum {
  zaman: string; toplamIs: number; degisenIs: number; yakinDegisenIs: number; yerlesmeyenIs: number; vardiyasizIs: number; gelirsizEmir: number;
}
export interface EmirTahmini { olcumId: number; zaman: string; uretimEmriId: number; tahminiBitis: string | null; termin: string | null }

export interface PlanSagligiGirdisi {
  simdi: number;
  emirler: readonly BitenEmir[];
  adimlar: readonly OlculenAdim[];
  olcumler: readonly Olcum[];
  tahminler: readonly EmirTahmini[];
  emirNolari: ReadonlyMap<number, string>;
  veri: { eksikKonu: number; okunamayanKonu: number };
}

const yuvarla = (x: number, basamak: number) => { const k = 10 ** basamak; return Math.round(x * k) / k; };
const yuzdesi = (pay: number, payda: number) => (payda === 0 ? null : yuvarla((pay / payda) * 100, 1));
export function ortanca(dizi: readonly number[]): number | null {
  if (dizi.length === 0) return null;
  const s = [...dizi].sort((a, b) => a - b);
  const o = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[o]! : (s[o - 1]! + s[o]!) / 2;
}
const gunFarki = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / GUN);

// Haftalar şimdiden geriye yedişer günlük kayan pencerelerdir (en eski önce); takvim haftasına bağlanmaz ki son hafta hep tam olsun.
export function haftaSiniri(simdi: number): { pencereBasi: number; hafta: (ms: number) => number | null; haftalar: PlanSagligiCevabi['haftalar'] } {
  const pencereBasi = simdi - PLAN_SAGLIGI_HAFTA * HAFTA;
  const haftalar = Array.from({ length: PLAN_SAGLIGI_HAFTA }, (_, i) => {
    const bas = pencereBasi + i * HAFTA;
    return { baslangic: tesisGunu(bas), bitis: tesisGunu(bas + HAFTA - 1) };
  });
  const hafta = (ms: number) => (ms < pencereBasi || ms >= simdi ? null : Math.min(PLAN_SAGLIGI_HAFTA - 1, Math.floor((ms - pencereBasi) / HAFTA)));
  return { pencereBasi, hafta, haftalar };
}

function haftalik<T>(liste: readonly T[], zamani: (x: T) => number, hafta: (ms: number) => number | null): T[][] {
  const kovalar: T[][] = Array.from({ length: PLAN_SAGLIGI_HAFTA }, () => []);
  for (const x of liste) { const h = hafta(zamani(x)); if (h !== null) kovalar[h]!.push(x); }
  return kovalar;
}

// Termin: emrin üretimi bittiği tesis günü terminin günü ya da öncesiyse zamanında (1401 a: termin günün sonudur). Terminsiz emir sayılmaz.
function termin(g: PlanSagligiGirdisi, hafta: (ms: number) => number | null): PlanSagligiCevabi['termin'] {
  const olcu = (l: readonly BitenEmir[]) => {
    const terminli = l.filter((e) => e.termin !== null);
    const gecikme = terminli.map((e) => gunFarki(e.termin!, tesisGunu(Date.parse(e.bitis)))).filter((d) => d > 0);
    return { terminli: terminli.length, gecikme };
  };
  const icinde = g.emirler.filter((e) => hafta(Date.parse(e.bitis)) !== null);
  const t = olcu(icinde);
  const ort = ortanca(t.gecikme);
  return {
    yuzde: yuzdesi(t.terminli - t.gecikme.length, t.terminli), emir: t.terminli, gecKalan: t.gecikme.length,
    ortancaGecikmeGun: ort === null ? null : yuvarla(ort, 1),
    egilim: haftalik(icinde, (e) => Date.parse(e.bitis), hafta).map((l) => { const o = olcu(l); return yuzdesi(o.terminli - o.gecikme.length, o.terminli); }),
  };
}

interface EmirGecmisi { uretimEmriId: number; termin: string | null; gecmis: { zaman: string; tahminiBitis: string | null }[] }

const degisti = (a: string | null, b: string | null) =>
  (a === null) !== (b === null) || (a !== null && b !== null && Math.abs(Date.parse(b) - Date.parse(a)) >= SOZ_ESIK_SAAT * SAAT);

// Söz tutarlılığı: emrin tahmini bitişinin canlıya almalar boyunca seyri. Kayma, penceredeki ilk dolu tahminden son dolu tahmine
// (artı: geç); değişim, ardışık iki ölçüm arasında bir saatten çok oynama ya da yerleşip yerleşmeme farkı.
function soz(g: PlanSagligiGirdisi, hafta: (ms: number) => number | null): { kart: PlanSagligiCevabi['soz']; tablo: PlanSagligiCevabi['kayanEmirler'] } {
  const emirler = new Map<number, EmirGecmisi>();
  const sirali = [...g.tahminler].sort((a, b) => Date.parse(a.zaman) - Date.parse(b.zaman) || a.olcumId - b.olcumId);
  for (const t of sirali) {
    const e = emirler.get(t.uretimEmriId) ?? { uretimEmriId: t.uretimEmriId, termin: null, gecmis: [] };
    e.termin = t.termin;
    e.gecmis.push({ zaman: t.zaman, tahminiBitis: t.tahminiBitis });
    emirler.set(t.uretimEmriId, e);
  }
  const haftaFarklari: number[][] = Array.from({ length: PLAN_SAGLIGI_HAFTA }, () => []);
  const satirlar: (PlanSagligiCevabi['kayanEmirler'][number])[] = [];
  for (const e of emirler.values()) {
    if (e.gecmis.length < 2) continue;
    let degisim = 0;
    for (let i = 1; i < e.gecmis.length; i++) {
      const a = e.gecmis[i - 1]!.tahminiBitis, b = e.gecmis[i]!.tahminiBitis;
      if (degisti(a, b)) degisim++;
      const h = hafta(Date.parse(e.gecmis[i]!.zaman));
      if (h !== null && a !== null && b !== null) haftaFarklari[h]!.push(Math.abs(Date.parse(b) - Date.parse(a)) / SAAT);
    }
    const dolu = e.gecmis.map((x) => x.tahminiBitis).filter((x): x is string => x !== null);
    const ilk = dolu[0] ?? null, son = dolu.at(-1) ?? null;
    satirlar.push({
      uretimEmriId: e.uretimEmriId, emirNo: g.emirNolari.get(e.uretimEmriId) ?? `#${String(e.uretimEmriId)}`, termin: e.termin,
      ilkTahmin: ilk, sonTahmin: son, kaymaSaat: ilk === null || son === null ? null : yuvarla((Date.parse(son) - Date.parse(ilk)) / SAAT, 1),
      degisim, gecmis: e.gecmis,
    });
  }
  const kaymalar = satirlar.map((s) => s.kaymaSaat).filter((x): x is number => x !== null);
  const ort = ortanca(kaymalar);
  const kayan = satirlar.filter((s) => s.degisim > 0);
  const tablo = [...kayan].sort((a, b) => Math.abs(b.kaymaSaat ?? -1) - Math.abs(a.kaymaSaat ?? -1) || b.degisim - a.degisim || a.uretimEmriId - b.uretimEmriId)
    .slice(0, PLAN_SAGLIGI_SATIR);
  return {
    kart: {
      ortancaKaymaSaat: ort === null ? null : yuvarla(ort, 1), kayanEmir: kayan.length, izlenenEmir: satirlar.length,
      egilim: haftaFarklari.map((l) => { const o = ortanca(l); return o === null ? null : yuvarla(o, 1); }),
    },
    tablo,
  };
}

// Plan tutarlılığı: canlıya almalarda yeri değişen işlerin (tezgâh ya da 8 saatten çok başlangıç) bütün planlı işlere oranı, son 7 gün.
function tutarlilik(g: PlanSagligiGirdisi, hafta: (ms: number) => number | null): PlanSagligiCevabi['tutarlilik'] {
  const oran = (l: readonly Olcum[]) => yuzdesi(l.reduce((t, o) => t + o.degisenIs, 0), l.reduce((t, o) => t + o.toplamIs, 0));
  const kovalar = haftalik(g.olcumler, (o) => Date.parse(o.zaman), hafta);
  const son = kovalar.at(-1)!;
  return {
    yuzde: oran(son), yakinDegisen: son.length === 0 ? null : son.reduce((t, o) => t + o.yakinDegisenIs, 0), canliyaAlma: son.length,
    egilim: kovalar.map(oran),
  };
}

// Plan uyumu: biten adımın planlı tezgâhta, planlı sırada ve bitişi 8 saatten az kayarak bitmesi. Hiçbir ölçüsü olmayan adım (planda
// hiç yeri yok) sayılmaz; ölçüsü boş olan koşul bozulmuş sayılmaz.
const kaydi = (a: OlculenAdim) => a.kaymaDk !== null && Math.abs(a.kaymaDk) > UYUM_KAYMA_DK;
const uyumlu = (a: OlculenAdim) => a.tezgahUyumu !== false && a.siraUyumu !== false && !kaydi(a);
const olculen = (a: OlculenAdim) => a.tezgahUyumu !== null || a.siraUyumu !== null || a.kaymaDk !== null;
function uyum(g: PlanSagligiGirdisi, hafta: (ms: number) => number | null): PlanSagligiCevabi['uyum'] {
  const l = g.adimlar.filter((a) => olculen(a) && hafta(Date.parse(a.bitis)) !== null);
  const oran = (x: readonly OlculenAdim[]) => yuzdesi(x.filter(uyumlu).length, x.length);
  return {
    yuzde: oran(l), olculenAdim: l.length,
    tezgahDisi: l.filter((a) => a.tezgahUyumu === false).length, siraDisi: l.filter((a) => a.siraUyumu === false).length, kaymaDisi: l.filter(kaydi).length,
    egilim: haftalik(l, (a) => Date.parse(a.bitis), hafta).map(oran),
  };
}

// Süre doğruluğu: istasyon başına gerçek / planlı net süre oranının ortancası; bire en uzak olanlar önce.
function sapanSureler(g: PlanSagligiGirdisi): PlanSagligiCevabi['sapanSureler'] {
  const gruplar = new Map<string, OlculenAdim[]>();
  for (const a of g.adimlar) {
    if (a.sureOrani === null || !(a.sureOrani > 0)) continue;
    const k = String(a.istasyonId);
    gruplar.set(k, [...(gruplar.get(k) ?? []), a]);
  }
  const uzaklik = (oran: number) => Math.abs(Math.log(oran));
  return [...gruplar.values()].filter((l) => l.length >= SURE_EN_AZ_ORNEK).map((l) => {
    const enCok = l.reduce((m, a) => (uzaklik(a.sureOrani!) > uzaklik(m.sureOrani!) ? a : m));
    return {
      istasyonId: l[0]!.istasyonId, istasyonAdi: l[0]!.istasyonAdi, ornek: l.length, ortancaOran: yuvarla(ortanca(l.map((a) => a.sureOrani!))!, 3),
      enCok: { emirNo: enCok.emirNo, opNo: enCok.opNo, oran: yuvarla(enCok.sureOrani!, 3) },
    };
  }).sort((a, b) => uzaklik(b.ortancaOran) - uzaklik(a.ortancaOran) || b.ornek - a.ornek).slice(0, PLAN_SAGLIGI_SATIR);
}

export function planSagligi(g: PlanSagligiGirdisi): PlanSagligiCevabi {
  const { hafta, haftalar } = haftaSiniri(g.simdi);
  const s = soz(g, hafta);
  const sonOlcum = [...g.olcumler].sort((a, b) => Date.parse(a.zaman) - Date.parse(b.zaman)).at(-1) ?? null;
  return {
    hesaplanan: new Date(g.simdi).toISOString(), haftalar,
    termin: termin(g, hafta), soz: s.kart, tutarlilik: tutarlilik(g, hafta), uyum: uyum(g, hafta),
    veri: {
      eksikKonu: g.veri.eksikKonu, okunamayanKonu: g.veri.okunamayanKonu, sonOlcum: sonOlcum?.zaman ?? null,
      yerlesmeyenIs: sonOlcum?.yerlesmeyenIs ?? null, vardiyasizIs: sonOlcum?.vardiyasizIs ?? null, gelirsizEmir: sonOlcum?.gelirsizEmir ?? null,
    },
    kayanEmirler: s.tablo, sapanSureler: sapanSureler(g),
  };
}
