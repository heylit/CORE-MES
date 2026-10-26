import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { gecMetin } from '../../motor/harita/kurallar.ts';
import {
  gecikmeKaynaklari, isAgirligi, kisitAdi, ONCELIK_AD, saatYaz, sayiYaz, veriDenetimi, type Derleme, type OkunanPlan, type PlanIslemi, type SorunEylemi,
} from '../../motor/kurallar.ts';
import type { Metin } from '../../motor/ozet/veri.ts';
import type { PlanlamaCalismasi, Siparis } from '../../tipler.ts';
import { alanYaz } from '../hesap/kurallar.ts';

// Bugünün kararları (u-bugun.betik): planlamacının günlük akışı. Hesap motorun kayıttaki planından; ekran yalnız sırayı ve dili değiştirir:
// önce gelenler, sonra karar bekleyenler, sonra bu oturumda yapılanların dökümü, en son yayın.

export type BugunAdimi = 'gelen' | 'karar' | 'gozden' | 'yayin';
export const BUGUN_ADIMLARI: readonly [BugunAdimi, string, SimgeAdi][] = [['gelen', 'Gelenler', 'box'], ['karar', 'Kararlar', 'flag'], ['gozden', 'Gözden geçir', 'eye'], ['yayin', 'Yayınla', 'check']];
export const BUGUN_YARDIM: Record<BugunAdimi, string> = {
  gelen: 'Plana henüz girmemiş siparişler, arızalar ve veri uyarıları. Önce bunlar plana alınır ya da kapatılır.',
  karar: 'Termine yetişmeyen siparişler. Her kart bir öneri sunar; öneri hemen denenir, beğenmezseniz geri alırsınız.',
  gozden: 'Bu oturumda planda neyin nereye gittiği; sipariş başına tezgâh ve saat farkı.',
  yayin: 'Atölyenin göreceği plan. Yayından sonra yapılan değişiklikler yeniden yayınlanana kadar taslakta kalır.',
};

// Kartın eylemi: motor isteyenler (plana al, söz tarihi) `motor`, siparişi gün planında göstermek `goster`, gecikmeyi kabul `kabul`; öteki
// Yapılacaklar'ın eylemidir (eylem.ts).
export type BugunEylemTuru = SorunEylemi | 'motor' | 'goster' | 'kabul';
export interface BugunEylemi { ad: string; tur: BugunEylemTuru; v: string; birincil: boolean }
export type BugunTonu = 'hata' | 'uyari' | 'bilgi';
export interface BugunKarti { id: string; job: string | null; ton: BugunTonu; simge: SimgeAdi; baslik: string; metin: Metin; eylemler: BugunEylemi[]; kabul: boolean }

const eylem = (ad: string, tur: BugunEylemTuru, v = '', birincil = false): BugunEylemi => ({ ad, tur, v, birincil });
const nesne = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const tezAd = (m: string | null | undefined): string => (m ? (m.startsWith('@') ? `${m.slice(1)} (fason)` : m) : '—');
const urunAd = (c: PlanlamaCalismasi, s: Siparis): string => c.D.urunler.find((u) => u.id === s.urun)?.ad ?? (s.urun || '—');
const terminKisa = (s: Siparis): string => (s.termin ?? '—').slice(5);

// Gecikmesi kabul edilen siparişler (bgKarar): kayıt çalışmanın `bkKarar`ındadır ve yalnız yazıldığı veri sürümünde geçerlidir.
export function kabulEdilenler(c: PlanlamaCalismasi): Set<string> {
  const k = c.bkKarar;
  if (!nesne(k) || k.dv !== c.dataVer || !nesne(k.m)) return new Set();
  return new Set(Object.entries(k.m).filter(([, v]) => v === 'kabul').map(([j]) => j));
}
export function kabulYaz(t: PlanlamaCalismasi, j: string, kabul: boolean): void {
  const l = kabulEdilenler(t); if (kabul) l.add(j); else l.delete(j);
  alanYaz(t, 'bkKarar', { dv: t.dataVer, m: Object.fromEntries([...l].map((x) => [x, 'kabul'])) });
}

export function gelenler(c: PlanlamaCalismasi, cx: Derleme, guncel: boolean, now: number): BugunKarti[] {
  const D = c.D; const out: BugunKarti[] = [];
  const ekle = (k: Omit<BugunKarti, 'kabul' | 'job'> & { job?: string }) => out.push({ job: null, ...k, kabul: false });
  if (!guncel) {
    ekle({ id: 'eski', ton: 'uyari', simge: 'alert', baslik: 'Veri değişti, plan eski', metin: ['Plan kurulduktan sonra veri ya da olay değişti. Saatler gerçeği yansıtmayabilir.'], eylemler: [eylem('Planı güncelle', 'ekip', '', true)] });
  }
  for (const s of D.siparisler.filter((x) => x.havuz)) {
    ekle({
      id: `h${s.id}`, job: s.id, ton: 'bilgi', simge: 'box', baslik: `${s.id} plana alınmadı`,
      metin: [`${urunAd(c, s)}, ${sayiYaz(Number(s.adet) || 0)} adet, termin ${terminKisa(s)}. Plana almadan önce söz tarihine bakabilirsiniz.`],
      eylemler: [eylem('Plana al', 'motor', s.id, true), eylem('Söz tarihi', 'motor', s.id), eylem('Planda göster', 'goster', s.id)],
    });
  }
  c.down.forEach((d, i) => {
    const a = typeof d.from === 'number' ? d.from : null, b = typeof d.to === 'number' ? d.to : null;
    if (b === null || b <= now) return;
    ekle({
      id: `d${i}`, ton: 'bilgi', simge: 'wrench', baslik: `${tezAd(typeof d.m === 'string' ? d.m : null)} duruşta`,
      metin: [`${saatYaz(D, a)} → ${saatYaz(D, b)}. Plan bunu hesaba kattı; yakındaki işler başka saate ya da tezgâha kaydı.`],
      eylemler: [eylem('Duruşu kaldır', 'durus-kaldir', String(i))],
    });
  });
  if (c.kapali.length) {
    ekle({ id: 'kapali', ton: 'hata', simge: 'alert', baslik: `${c.kapali.length} kural kapalı`, metin: [`${c.kapali.map(kisitAdi).join(', ')}. Plan bu kuralları saymadan kuruldu.`], eylemler: [eylem('Hepsini aç', 'kisit-hepsi', '', true)] });
  }
  const den = veriDenetimi(c, cx);
  if (den.length) {
    ekle({ id: 'den', ton: 'uyari', simge: 'search', baslik: `${den.length} eksik ya da çelişkili veri`, metin: ['Süre, tezgâh ya da rota bilgisi eksikse plan o işi tahminle yerleştirir.'], eylemler: [eylem('Veriyi gör', 'git', 'denetim')] });
  }
  return out;
}

// Termine yetişmeyen siparişler, gecikme × öncelik ağırlığıyla en ağırdan; planlanamayan en ağır sayılır.
export function kararlar(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme): BugunKarti[] {
  const D = c.D; const kay = gecikmeKaynaklari(c, p, cx); const km = kabulEdilenler(c); const out: BugunKarti[] = [];
  const gec = D.siparisler.filter((s) => !s.havuz).map((s) => ({ s, j: p.J[s.id] }))
    .filter((x): x is { s: Siparis; j: NonNullable<typeof x.j> } => !!x.j && (x.j.T == null || x.j.T > 0.05))
    .sort((a, b) => (b.j.T ?? 1e4) * isAgirligi(b.s) - (a.j.T ?? 1e4) * isAgirligi(a.s));
  for (const { s, j } of gec) {
    const en = kay.is[s.id];
    const metin: Metin = [`${urunAd(c, s)}, ${sayiYaz(Number(s.adet) || 0)} adet, ${ONCELIK_AD[Number(s.oncelik)] ?? ''} öncelik. Termin ${terminKisa(s)}, planda bitiş ${j.C != null ? saatYaz(D, j.C) : '—'}.`];
    if (en) metin.push(' En çok ', { b: en.ad }, ` yüzünden bekliyor (${gecMetin(en.v)}).`);
    out.push({
      id: s.id, job: s.id, ton: 'hata', simge: 'flag', kabul: km.has(s.id), metin,
      baslik: j.T == null ? `${s.id} planlanamadı` : `${s.id} termine ${gecMetin(j.T)} geç kalıyor`,
      eylemler: [eylem('Öne almayı dene', 'one-al', s.id, true), eylem('Gecikmeyi kabul et', 'kabul', s.id), eylem('Planda göster', 'goster', s.id)],
    });
  }
  const ilk = (l: string[], n: number) => `${l.slice(0, n).join(', ')}${l.length > n ? '…' : ''}`;
  if (p.fail.length) {
    out.push({ id: 'fail', job: null, ton: 'hata', simge: 'alert', kabul: false, baslik: `${p.fail.length} iş yerleştirilemedi`, metin: [`${ilk(p.fail, 3)}. Uygun tezgâh, süre ya da önceki adım eksik olabilir.`], eylemler: [eylem('Veriyi gör', 'git', 'denetim')] });
  }
  const mal = [...new Set(p.warn.filter((w) => w.t === 'malzeme').map((w) => w.j ?? ''))].filter(Boolean);
  if (mal.length) {
    out.push({ id: 'mal', job: null, ton: 'uyari', simge: 'box', kabul: false, baslik: `${mal.length} siparişin malzemesi gelmemiş`, metin: [`${ilk(mal, 4)}. İş planda başlar; malzeme gelmezse kayar.`], eylemler: [eylem('Malzeme', 'git', 'malzeme')] });
  }
  return out;
}

export function durumCumlesi(c: PlanlamaCalismasi, p: OkunanPlan, bekleyen: number): string {
  const o = p.ozet;
  const ilk = c.D.siparisler.filter((s) => !s.havuz).map((s) => ({ s, T: p.J[s.id]?.T ?? null })).filter((x): x is { s: Siparis; T: number } => x.T != null && x.T > 0.05).sort((a, b) => b.T - a.T)[0];
  const plan = o.late ? `Plan ${o.n} siparişin ${o.late} tanesinde terminin gerisinde${ilk ? `; en çok ${ilk.s.id}, ${gecMetin(ilk.T)}` : ''}.` : 'Bütün siparişler termine yetişiyor.';
  return `${plan} ${bekleyen ? `${bekleyen} karar bekliyor.` : 'Bekleyen karar yok.'}`;
}

// Siparişi gün planında göstermek için ilk planlı işinin günü (bg-goster U.agGun), bugünden sayılır; planlı işi yoksa null.
export function gosterGunu(p: OkunanPlan, j: string, now: number): number | null {
  const r = Object.values(p.ops).filter((x) => x.job === j && Number.isFinite(x.S)).sort((a, b) => a.S - b.S)[0];
  return r ? Math.max(0, Math.floor(r.S / 24) - Math.floor(now / 24)) : null;
}

// Döküm (bgDokum): oturumun başındaki plana göre yeri değişen işler; tezgâhı değişen ya da başlangıcı çeyrek saatten çok kayan, sipariş başına.
export interface DokumAdimi { id: string; ad: string; e: PlanIslemi | null; r: PlanIslemi }
export interface DokumSatiri { job: string; T0: number; T1: number; l: DokumAdimi[] }
export function dokum(a: OkunanPlan | null, b: OkunanPlan, cx: Derleme): DokumSatiri[] {
  if (!a) return [];
  const isler: Record<string, DokumAdimi[]> = {};
  for (const [id, r] of Object.entries(b.ops)) {
    const e = a.ops[id] ?? null; if (!Number.isFinite(r.C)) continue;
    if (e && e.m === r.m && Math.abs(e.S - r.S) < 0.25) continue;
    (isler[r.job] ??= []).push({ id, ad: cx.byId[id]?.ad ?? id.split('.').pop() ?? id, e, r });
  }
  return Object.entries(isler).map(([job, l]) => ({ job, T0: a.J[job]?.T ?? 0, T1: b.J[job]?.T ?? 0, l: l.sort((x, y) => x.r.S - y.r.S) }))
    .sort((x, y) => Math.abs(y.T1 - y.T0) - Math.abs(x.T1 - x.T0) || x.job.localeCompare(y.job));
}
export const terminEtkili = (d: DokumSatiri): boolean => Math.abs(d.T1 - d.T0) > 0.05;
export function dokumOzeti(dok: DokumSatiri[]): { bas: string; metin: string } {
  const iyi = dok.filter((d) => d.T0 - d.T1 > 0.05).length, kotu = dok.filter((d) => d.T1 - d.T0 > 0.05).length;
  return {
    bas: `${dok.length} siparişin işleri yer değiştirdi.`,
    metin: `${iyi ? `${iyi} sipariş daha erken bitiyor` : 'Hiçbiri daha erken bitmiyor'}${kotu ? `, ${kotu} sipariş daha geç bitiyor` : ''}; geri kalanların yalnız saati kaydı, termini etkilenmedi.`,
  };
}
export function dokumEtkisi(d: DokumSatiri): { ton: 'tamam' | 'uyari' | 'pasif'; m: string } {
  if (d.T0 - d.T1 > 0.05) return { ton: 'tamam', m: d.T1 > 0.05 ? `${gecMetin(d.T0 - d.T1)} erken` : 'artık yetişiyor' };
  if (d.T1 - d.T0 > 0.05) return { ton: 'uyari', m: `${gecMetin(d.T1 - d.T0)} geç` };
  return { ton: 'pasif', m: 'termin etkisi yok' };
}
