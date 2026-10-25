import type { Db } from '#cekirdek/db.ts';
import { cakisma } from '#cekirdek/hata.ts';
import type { PlanMotoruCozucusu, PlanMotoruIstegi } from '../plan/disari.ts';
import { planAni } from './kurallar.ts';
import { cozumGirdisi } from './plan-girdisi.ts';
import { planCoz } from './plan-motoru.ts';
import { planCozumKaynagi } from './servis.ts';

// ADR 0018 karar 5: plan modülünün planMotoruCozucusu kaydının karşılığı. Girdiyi bu modül kurar (planlama sayfasının çalışması, Reçete ve
// Rota kaydı ve sunucunun güncel emir, rota ve kaynakları); motor aramasız sabit kipte, kuyruktaki tezgâh sırasını koruyarak dizer.
// Motorun yerleştiremediği iş yerlesmeyen'dedir; plan modülü o komutu reddeder (başka tezgâha konan işi de). Vardiyası tanımsız tezgâhın
// işi vardiyasiz'dadır (168 b): plan onu uyarıyla boş bırakır, komutu durdurmaz.
export const sunucuPlanCozucusu: PlanMotoruCozucusu = async (db: Db, istek: PlanMotoruIstegi) => {
  const kaynak = await planCozumKaynagi(db);
  if (kaynak === null) throw cakisma('Sunucu plan motoru planlama sayfasının çalışma kaydı olmadan plan kuramaz. Planlama sayfasını açıp bir kez kaydedin.');
  return coz(kaynak, istek);
};

export async function coz(
  kaynak: { calisma: unknown; kayit: unknown; kaynak: Parameters<typeof cozumGirdisi>[0]['kaynak'] },
  istek: PlanMotoruIstegi,
): Promise<Awaited<ReturnType<PlanMotoruCozucusu>> & { vardiyasiz: string[] }> {
  const g = cozumGirdisi({
    ...kaynak,
    istek: {
      simdi: istek.simdi.toISOString(), kuyruklar: istek.kuyruklar, sabitler: istek.sabitler,
      calisanlar: istek.calisanlar.map((c) => ({ anahtar: c.anahtar, makineId: c.makineId, baslangic: c.baslangic, sayimAni: c.sayimAni, kalanVerimliDk: c.kalanVerimliDk })),
      ...(istek.ekMesai ? { ekMesai: istek.ekMesai.map((e) => ({ makineId: e.makineId, gun: e.gun, vardiyaId: e.vardiyaId })) } : {}),
    },
  });
  if (g === null) throw cakisma('Sunucu plan motoru planlama sayfasının çalışma kaydı olmadan plan kuramaz. Planlama sayfasını açıp bir kez kaydedin.');
  const yerlesmeyen = [...g.yerlesmeyen];
  const vardiyasiz = [...g.vardiyasiz];
  if (g.sira.length === 0) return { yerlesimler: [], yerlesmeyen, vardiyasiz };
  const plan = await planCoz({ durum: g.st, kip: 'sabit', taban: g.taban });
  const basarisiz = new Set((plan.fail ?? []).map(String));
  const yerlesimler: { anahtar: string; makineId: number; baslangic: string; bitis: string }[] = [];
  for (const id of g.sira) {
    const r = plan.ops[id];
    const anahtar = g.kimlik[id]!;
    const makineId = r === undefined ? NaN : Number(r.m);
    if (r === undefined || basarisiz.has(id) || !Number.isInteger(makineId) || !Number.isFinite(r.S) || !Number.isFinite(r.C)) { yerlesmeyen.push(anahtar); continue; }
    yerlesimler.push({ anahtar, makineId, baslangic: planAni(g.baslangic, r.S), bitis: planAni(g.baslangic, r.C) });
  }
  return { yerlesimler, yerlesmeyen, vardiyasiz };
}
