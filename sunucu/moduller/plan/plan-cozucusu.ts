import vm from 'node:vm';
import type { Db } from '#cekirdek/db.ts';
import { cakisma } from '#cekirdek/hata.ts';
import { TESIS_SAAT_DILIMI } from '#paylasilan/zaman.ts';
import { hedefMotorAyari } from './motor-ayari.ts';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { planAni } from './planlama-kurallar.ts';
import { cozumGirdisi, type EkAdim, type PlanBenzetimi } from './plan-girdisi.ts';
import { motorKodu, planCoz, type MotorDurumu } from './plan-motoru.ts';
import { planCozumKaynagi } from './planlama-servis.ts';
import type { PlanMotoruCozucusu, PlanMotoruIstegi } from './servis.ts';

// ADR 0018 karar 5: plan modülünün planMotoruCozucusu kaydının karşılığı. Girdiyi bu modül kurar (planlama sayfasının çalışması, Reçete ve
// Rota kaydı ve sunucunun güncel emir, rota ve kaynakları); motor aramasız koşar: 'sabit' kuyruktaki tezgâh sırasını korur, 'yeni' sırayı ve
// tezgâhı kuraldan kurar (motor yerleşimi ve hızlı deneme; kuyruğun tezgâhı adaylara eklenir).
// Motorun yerleştiremediği iş yerlesmeyen'dedir, nedeni nedenler'de (981 a-1): plan onu yerleşmemiş bırakır, ötekiler yazılır. Vardiyası
// tanımsız tezgâhın işi vardiyasiz'dadır (168 b): plan onu uyarıyla boş bırakır, komutu durdurmaz.
export const sunucuPlanCozucusu: PlanMotoruCozucusu = async (db: Db, istek: PlanMotoruIstegi) => {
  const kaynak = await planCozumKaynagi(db, istek.simdi.getTime());
  // Girdi güncel motor ayarıyla gelir; taslak kendi sürümüyle dizilir (774 a).
  const { degerler } = await hedefMotorAyari(db, istek.taslakId);
  return coz({ ...kaynak, calisma: calismayaMotorAyari(kaynak.calisma, degerler) }, istek);
};

// 686 a: ek adım alanı plan modülünün isteğine ayrıca girer; çözücü alanı olan ve olmayan isteği aynı okur.
export async function coz(
  kaynak: { calisma: unknown; kayit: unknown; kaynak: Parameters<typeof cozumGirdisi>[0]['kaynak'] },
  istek: PlanMotoruIstegi & { ekAdimlar?: readonly EkAdim[] } & PlanBenzetimi,
): Promise<Awaited<ReturnType<PlanMotoruCozucusu>> & { vardiyasiz: string[]; malzemeBekleyen: string[]; nedenler: Record<string, string> }> {
  // 1952 iş 2b: paralel bölme yalnız motor önerisindedir ('yeni'); sabit kip kuyruğun tezgâh sırasını korur, pay oraya sığmaz.
  const calisma = istek.kip === 'yeni' ? kaynak.calisma : bolmesiz(kaynak.calisma);
  const g = cozumGirdisi({
    ...kaynak,
    calisma,
    kaynak: sanalAdimAdetleriyle(kaynak.kaynak, istek.sanalEmirler),
    istek: {
      simdi: istek.simdi.toISOString(), kuyruklar: istek.kuyruklar, sabitler: istek.sabitler,
      ...(istek.kisiKuyruklari?.length ? { kisiKuyruklari: istek.kisiKuyruklari.map((q) => ({ kisiId: q.kisiId, anahtarlar: [...q.anahtarlar] })) } : {}),
      ...(istek.kisiAdaylari?.length ? { kisiAdaylari: istek.kisiAdaylari.map((x) => ({ anahtar: x.anahtar, kisiIdler: [...x.kisiIdler] })) } : {}),
      ...(istek.kisiSabitleri?.length ? { kisiSabitleri: istek.kisiSabitleri.map((x) => ({ ...x })) } : {}),
      calisanlar: istek.calisanlar.map((c) => ({ anahtar: c.anahtar, makineId: c.makineId, baslangic: c.baslangic, sayimAni: c.sayimAni, kalanVerimliDk: c.kalanVerimliDk })),
      ...(istek.ekMesai ? { ekMesai: istek.ekMesai.map((e) => ({ makineId: e.makineId, gun: e.gun, vardiyaId: e.vardiyaId })) } : {}),
      ...(istek.baglar ? { baglar: istek.baglar.map((x) => ({ anahtar: x.anahtar, oncul: x.oncul })) } : {}),
      ...(istek.ekAdimlar ? { ekAdimlar: istek.ekAdimlar.map((e) => ({ ...e })) } : {}),
      ...(istek.fasonBekleme ? { fasonBekleme: istek.fasonBekleme.map((x) => ({ anahtar: x.anahtar, gun: x.gun })) } : {}),
      ...(istek.sanalEmirler ? { sanalEmirler: istek.sanalEmirler.map((x) => ({ ...x })) } : {}),
      ...(istek.emirDegisiklikleri ? { emirDegisiklikleri: istek.emirDegisiklikleri.map((x) => ({ ...x })) } : {}),
      ...(istek.kapaliMakineler ? { kapaliMakineler: [...istek.kapaliMakineler] } : {}),
      ...(istek.kapaliGunler ? { kapaliGunler: [...istek.kapaliGunler] } : {}),
    },
  });
  if (g === null) throw cakisma('Sunucu plan motoru planlama sayfasının çalışma kaydı olmadan plan kuramaz. Planlama sayfasını açıp bir kez kaydedin.');
  const yerlesmeyen = [...g.yerlesmeyen];
  const nedenler: Record<string, string> = Object.fromEntries(g.yerlesmeyen.map((a) => [a, ROTADA_YOK]));
  const vardiyasiz = [...g.vardiyasiz];
  const malzemeBekleyen: string[] = [];
  const kisiYerlesimleri: KisiYerlesimi[] = [];
  if (g.sira.length === 0) return { yerlesimler: [], yerlesmeyen, vardiyasiz, malzemeBekleyen, nedenler };
  const plan = await planCoz({ durum: g.st, kip: istek.kip, taban: g.taban });
  const basarisiz = new Set((plan.fail ?? []).map(String));
  const gelmeyen = basarisiz.size > 0 ? malzemesiGelmeyenler(g.st) : new Set<string>();
  const yerlesimler: { anahtar: string; makineId: number; baslangic: string; bitis: string }[] = [];
  const parcaliYerlesimler: ParcaliYerlesim[] = [];
  for (const id of g.sira) {
    const r = plan.ops[id];
    const anahtar = g.kimlik[id]!;
    const paylar = payKimlikleri(plan.ops, id);
    if (paylar.length > 1) {
      if (basarisiz.has(id) && gelmeyen.has(id.slice(0, id.lastIndexOf('.')))) { malzemeBekleyen.push(anahtar); continue; }
      const adetler = payAdetleri(g.st, id, paylar.length);
      const parcalar = paylar.map((p, n) => ({ p, n, r: plan.ops[p] })).flatMap(({ p, n, r: x }) => {
        if (x === undefined || basarisiz.has(p) || !Number.isFinite(x.S) || !Number.isFinite(x.C) || adetler === null) return [];
        const m = String(x.m), kisiId = m.startsWith(KISI_TEZGAHI) ? Number(m.slice(KISI_TEZGAHI.length)) : null, makineId = kisiId === null ? Number(m) : null;
        if (!Number.isInteger(kisiId ?? makineId)) return [];
        return [{ no: n + 1, adet: adetler[n]!, makineId, kisiId, baslangic: planAni(g.baslangic, x.S), bitis: planAni(g.baslangic, x.C) }];
      });
      if (parcalar.length !== paylar.length) {
        yerlesmeyen.push(anahtar);
        nedenler[anahtar] = yerlesmemeNedeni(g, id, (p) => plan.ops[p] !== undefined && !basarisiz.has(p));
        continue;
      }
      parcaliYerlesimler.push({ anahtar, parcalar });
      continue;
    }
    const kisiId = r !== undefined && String(r.m).startsWith(KISI_TEZGAHI) ? Number(String(r.m).slice(KISI_TEZGAHI.length)) : null;
    const makineId = r === undefined || kisiId !== null ? NaN : Number(r.m);
    if (basarisiz.has(id) && gelmeyen.has(id.slice(0, id.lastIndexOf('.')))) { malzemeBekleyen.push(anahtar); continue; }
    if (r === undefined || basarisiz.has(id) || !(Number.isInteger(makineId) || Number.isInteger(kisiId)) || !Number.isFinite(r.S) || !Number.isFinite(r.C)) {
      yerlesmeyen.push(anahtar);
      nedenler[anahtar] = yerlesmemeNedeni(g, id, (p) => plan.ops[p] !== undefined && !basarisiz.has(p));
      continue;
    }
    const yer = { anahtar, baslangic: planAni(g.baslangic, r.S), bitis: planAni(g.baslangic, r.C) };
    if (kisiId !== null) kisiYerlesimleri.push({ ...yer, kisiId });
    else yerlesimler.push({ ...yer, makineId });
  }
  // Kişi yeri yalnız varsa döner: kişi kuyruğu olmayan istek ve sonuç eskisi gibidir.
  return {
    yerlesimler, yerlesmeyen, vardiyasiz, malzemeBekleyen, nedenler, ...(kisiYerlesimleri.length > 0 ? { kisiYerlesimleri } : {}),
    ...(parcaliYerlesimler.length > 0 ? { parcaliYerlesimler } : {}),
  };
}

type ParcaliYerlesim = NonNullable<Awaited<ReturnType<PlanMotoruCozucusu>>['parcaliYerlesimler']>[number];
// Motorun paylarının kimliği: ilk pay adımın kimliği, ötekiler "~2", "~3" ekiyle (engine.js compile). Tek kimlik bölünmemiş adımdır.
function payKimlikleri(ops: Record<string, unknown>, id: string): string[] {
  const l = [id];
  while (ops[`${id}~${String(l.length + 1)}`] !== undefined) l.push(`${id}~${String(l.length + 1)}`);
  return l;
}
// Payın adedi motorun bölmesindeki gibidir: adımın adedi (opAdet, yoksa siparişin adedi) eşit bölünür, kalan ilk paylara. Adet okunamazsa null.
function payAdetleri(st: MotorDurumu, id: string, n: number): number[] | null {
  const D = st['D'] as { opAdet?: Record<string, unknown>; siparisler?: { id: unknown; adet: unknown }[] } | undefined;
  const sip = String(id.slice(0, id.lastIndexOf('.')));
  const ham = D?.opAdet?.[id] ?? D?.siparisler?.find((x) => String(x.id) === sip)?.adet;
  const adet = Number(ham);
  if (ham == null || !Number.isInteger(adet) || adet < n) return null;
  return Array.from({ length: n }, (_, p) => Math.floor(adet / n) + (p < adet % n ? 1 : 0));
}
// Çalışmanın bölme ayarı kapatılır; çağıranın nesnesi değişmez.
function bolmesiz(calisma: unknown): unknown {
  if (typeof calisma !== 'object' || calisma === null) return calisma;
  const c = calisma as { param?: Record<string, unknown> };
  return { ...c, param: { ...(c.param ?? {}), bolmeKip: 'kapali' } };
}

// 1527: sanal emrin (deneme emri) adım adetleri kaynak okumasının adimAdetleri'ne gerçek emirdeki anahtarla ("emir no|OP no") eklenir;
// motor dal adımını (1257 a) gerçek emirdeki gibi okur, çarpanı kendisi uygulamaz. Çağıranın nesnesi değişmez.
export function sanalAdimAdetleriyle<K extends { durum: unknown; ek: unknown } | null>(kaynak: K, sanalEmirler: PlanBenzetimi['sanalEmirler']): K {
  const ek = Object.fromEntries((sanalEmirler ?? []).flatMap((e) => Object.entries(e.adimAdetleri ?? {}).map(([op, n]) => [`${e.no}|${op}`, n])));
  if (kaynak === null || Object.keys(ek).length === 0 || typeof kaynak.durum !== 'object' || kaynak.durum === null) return kaynak;
  const durum = kaynak.durum as { adimAdetleri?: Record<string, number> | null };
  return { ...kaynak, durum: { ...durum, adimAdetleri: { ...(durum.adimAdetleri ?? {}), ...ek } } };
}

// 1888 b: kişinin el tezgâhı motorda bu önekle durur (motor/emirler.js kisiTezgahi).
const KISI_TEZGAHI = 'kisi-';
type KisiYerlesimi = NonNullable<Awaited<ReturnType<PlanMotoruCozucusu>>['kisiYerlesimleri']>[number];
// Motorda karşılığı olmayan kuyruk işi: adım ürünün yürürlükteki rotasında yok (983 b), emir ya da ürünü okunamadı.
const ROTADA_YOK = 'Adım ürünün yürürlükteki rotasında ya da emirlerde bulunamadı.';
// Öncülü yerleşmeyen iş bekler (981 a-1): öncül kuyrukta yerleşmedi ya da motorda tezgâhı yok (pasif makine, kişi kaynağı).
function yerlesmemeNedeni(g: { oncul: Record<string, string[]>; kimlik: Record<string, string> }, id: string, yerlesti: (p: string) => boolean): string {
  const p = (g.oncul[id] ?? []).find((x) => !yerlesti(x));
  if (p === undefined) return 'Sunucu motoru yerleştiremedi.';
  const a = g.kimlik[p];
  return a === undefined ? 'Önceki adım yerleşmedi.' : `Önceki adım (${a.replace('|', ' OP ')}) yerleşmedi.`;
}

// 525 4 a: katı malzeme kipinde (w.mat 'sert', K3) malzemesi stok ve satın almayla ufuk içinde karşılanmayan siparişin işleri motorda
// yerleşmez. Bu bir çözüm hatası değildir: vardiyasız iş gibi (168 b) ayrı listede döner, plan komutu durmaz. Motor sipariş başına hazır
// olma anını derlemede kurar (engine.js matAlloc); aynı derleme burada tekrarlanır, yalnız yerleşmeyen iş varken.
function malzemesiGelmeyenler(durum: MotorDurumu): Set<string> {
  if ((durum['w'] as { mat?: unknown } | undefined)?.mat !== 'sert') return new Set();
  const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI }); b['self'] = b;
  vm.runInContext(motorKodu(), b, { filename: 'plan-motoru.js' });
  b['durum'] = durum;
  const sonuc = vm.runInContext(`(() => {
    const cx = compile(stHazirla({ ...durum, w: { ...W0, ...(durum.w || {}) } }));
    return Object.entries(cx.mat.res).filter(([, r]) => !(r.ready < HDAYS * 24)).map(([j]) => j);
  })()`, b) as string[];
  return new Set(sonuc.map(String));
}
