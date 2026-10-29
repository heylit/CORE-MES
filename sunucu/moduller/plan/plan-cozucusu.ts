import vm from 'node:vm';
import type { Db } from '#cekirdek/db.ts';
import { cakisma } from '#cekirdek/hata.ts';
import { TESIS_SAAT_DILIMI } from '#paylasilan/zaman.ts';
import { hedefMotorAyari } from './motor-ayari.ts';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { planAni } from './planlama-kurallar.ts';
import { cozumGirdisi, type EkAdim } from './plan-girdisi.ts';
import { motorKodu, planCoz, type MotorDurumu } from './plan-motoru.ts';
import { planCozumKaynagi } from './planlama-servis.ts';
import type { PlanMotoruCozucusu, PlanMotoruIstegi } from './servis.ts';

// ADR 0018 karar 5: plan modülünün planMotoruCozucusu kaydının karşılığı. Girdiyi bu modül kurar (planlama sayfasının çalışması, Reçete ve
// Rota kaydı ve sunucunun güncel emir, rota ve kaynakları); motor aramasız sabit kipte, kuyruktaki tezgâh sırasını koruyarak dizer.
// Motorun yerleştiremediği iş yerlesmeyen'dedir, nedeni nedenler'de (981 a-1): plan onu yerleşmemiş bırakır, ötekiler yazılır. Vardiyası
// tanımsız tezgâhın işi vardiyasiz'dadır (168 b): plan onu uyarıyla boş bırakır, komutu durdurmaz.
export const sunucuPlanCozucusu: PlanMotoruCozucusu = async (db: Db, istek: PlanMotoruIstegi) => {
  const kaynak = await planCozumKaynagi(db);
  if (kaynak === null) throw cakisma('Sunucu plan motoru planlama sayfasının çalışma kaydı olmadan plan kuramaz. Planlama sayfasını açıp bir kez kaydedin.');
  // Girdi güncel motor ayarıyla gelir; taslak kendi sürümüyle dizilir (774 a).
  const { degerler } = await hedefMotorAyari(db, istek.taslakId);
  return coz({ ...kaynak, calisma: calismayaMotorAyari(kaynak.calisma, degerler) }, istek);
};

// 686 a: ek adım alanı plan modülünün isteğine ayrıca girer; çözücü alanı olan ve olmayan isteği aynı okur.
export async function coz(
  kaynak: { calisma: unknown; kayit: unknown; kaynak: Parameters<typeof cozumGirdisi>[0]['kaynak'] },
  istek: PlanMotoruIstegi & { ekAdimlar?: readonly EkAdim[] },
): Promise<Awaited<ReturnType<PlanMotoruCozucusu>> & { vardiyasiz: string[]; malzemeBekleyen: string[]; nedenler: Record<string, string> }> {
  const g = cozumGirdisi({
    ...kaynak,
    istek: {
      simdi: istek.simdi.toISOString(), kuyruklar: istek.kuyruklar, sabitler: istek.sabitler,
      calisanlar: istek.calisanlar.map((c) => ({ anahtar: c.anahtar, makineId: c.makineId, baslangic: c.baslangic, sayimAni: c.sayimAni, kalanVerimliDk: c.kalanVerimliDk })),
      ...(istek.ekMesai ? { ekMesai: istek.ekMesai.map((e) => ({ makineId: e.makineId, gun: e.gun, vardiyaId: e.vardiyaId })) } : {}),
      ...(istek.baglar ? { baglar: istek.baglar.map((x) => ({ anahtar: x.anahtar, oncul: x.oncul })) } : {}),
      ...(istek.ekAdimlar ? { ekAdimlar: istek.ekAdimlar.map((e) => ({ ...e })) } : {}),
      ...(istek.fasonBekleme ? { fasonBekleme: istek.fasonBekleme.map((x) => ({ anahtar: x.anahtar, gun: x.gun })) } : {}),
    },
  });
  if (g === null) throw cakisma('Sunucu plan motoru planlama sayfasının çalışma kaydı olmadan plan kuramaz. Planlama sayfasını açıp bir kez kaydedin.');
  const yerlesmeyen = [...g.yerlesmeyen];
  const nedenler: Record<string, string> = Object.fromEntries(g.yerlesmeyen.map((a) => [a, ROTADA_YOK]));
  const vardiyasiz = [...g.vardiyasiz];
  const malzemeBekleyen: string[] = [];
  if (g.sira.length === 0) return { yerlesimler: [], yerlesmeyen, vardiyasiz, malzemeBekleyen, nedenler };
  const plan = await planCoz({ durum: g.st, kip: 'sabit', taban: g.taban });
  const basarisiz = new Set((plan.fail ?? []).map(String));
  const gelmeyen = basarisiz.size > 0 ? malzemesiGelmeyenler(g.st) : new Set<string>();
  const yerlesimler: { anahtar: string; makineId: number; baslangic: string; bitis: string }[] = [];
  for (const id of g.sira) {
    const r = plan.ops[id];
    const anahtar = g.kimlik[id]!;
    const makineId = r === undefined ? NaN : Number(r.m);
    if (basarisiz.has(id) && gelmeyen.has(id.slice(0, id.lastIndexOf('.')))) { malzemeBekleyen.push(anahtar); continue; }
    if (r === undefined || basarisiz.has(id) || !Number.isInteger(makineId) || !Number.isFinite(r.S) || !Number.isFinite(r.C)) {
      yerlesmeyen.push(anahtar);
      nedenler[anahtar] = yerlesmemeNedeni(g, id, (p) => plan.ops[p] !== undefined && !basarisiz.has(p));
      continue;
    }
    yerlesimler.push({ anahtar, makineId, baslangic: planAni(g.baslangic, r.S), bitis: planAni(g.baslangic, r.C) });
  }
  return { yerlesimler, yerlesmeyen, vardiyasiz, malzemeBekleyen, nedenler };
}

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
// olma anını derlemede kurar (engine.betik matAlloc); aynı derleme burada tekrarlanır, yalnız yerleşmeyen iş varken.
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
