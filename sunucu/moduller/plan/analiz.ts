import type { Db } from '#cekirdek/db.ts';
import type { PlanAnaliziCevabi } from '#paylasilan/sozlesme/plan-analiz.ts';
import { istasyonAdlari, makineler } from '../istasyonlar/disari.ts';
import { makineKullanimAraliklari } from '../uretim-emirleri/disari.ts';
import { calismaTakvimleri } from '../vardiya/disari.ts';
import { darbogaz, ewmaEgilimi, haftaPenceresi, istasyonHucreleri, pencereSuresi, type MakineGirdisi, type Ms } from './analiz-kurallar.ts';
import { olcumler, yerlesimler } from './sorgular.ts';

const GUN = 86_400_000;
// Eğilim son bir yılın canlıya almalarından çizilir.
const EGILIM_GUN = 365;
const gunEkle = (tarih: string, gun: number): string => new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN).toISOString().slice(0, 10);
const ms = (x: string | Date): number => (typeof x === 'string' ? Date.parse(x) : x.getTime());

// Planlama analizi (2151): istekte hesaplanır, tablo yazmaz. Kapasite tezgâhın çalışma takviminden (planlı duruş düşülmüş), geçmiş yük gerçek
// makine kullanımından, ileri yük canlı plandan; bölünmüş işte parçalar sayılır. Yetkiyi uç denetler.
export async function planAnalizi(db: Db, simdi = Date.now()): Promise<PlanAnaliziCevabi> {
  const haftalar = haftaPenceresi(simdi);
  const ilk = haftalar[0]!, son = haftalar.at(-1)!;
  const tezgahlar = (await makineler(db, { pasiflerDahil: false })).filter((m): m is typeof m & { istasyonId: number } => m.istasyonId !== null);
  const ids = tezgahlar.map((m) => m.id);

  // Takvim günü, önceki günden taşan vardiya için bir gün önceden okunur.
  const takvimler = ids.length === 0 ? new Map() : await calismaTakvimleri(db, ids.map((id) => ({ tur: 'makine' as const, id })),
    { baslangic: gunEkle(ilk.baslangic, -1), bitis: gunEkle(son.bitis, 1) });
  const kullanim = await makineKullanimAraliklari(db, ids, new Date(ilk.bas).toISOString(), new Date(Math.min(simdi, haftalar.find((h) => h.ileri)!.bas)).toISOString());

  const plan = new Map<number, Ms[]>();
  const kisiPlani: Ms[] = [];
  for (const y of await yerlesimler(db, null)) {
    for (const p of y.parcalar?.length ? y.parcalar : [y]) {
      const a: Ms = [ms(p.baslangic), ms(p.bitis)];
      if (p.kaynak.tur === 'makine') plan.set(p.kaynak.id, [...(plan.get(p.kaynak.id) ?? []), a]);
      else kisiPlani.push(a);
    }
  }

  const girdiler: MakineGirdisi[] = tezgahlar.map((m) => {
    const t = takvimler.get(`makine:${m.id}`) ?? null;
    const tanimsiz = t === null || t.gunler.every((g: { dakika: number }) => g.dakika === 0);
    return {
      istasyonId: m.istasyonId,
      takvim: tanimsiz ? null : t.araliklar.map((a: { baslangic: string; bitis: string }) => [ms(a.baslangic), ms(a.bitis)] as const),
      kullanim: (kullanim.get(m.id) ?? []).map((a) => [ms(a.baslangic), ms(a.bitis)] as const),
      plan: plan.get(m.id) ?? [],
    };
  });
  const hucreler = istasyonHucreleri(girdiler, haftalar);
  const adlar = await istasyonAdlari(db, [...hucreler.keys()]);
  const istasyonlar = [...hucreler].map(([istasyonId, s]) => ({
    istasyonId, ad: adlar.get(istasyonId) ?? `İstasyon ${String(istasyonId)}`, makine: s.makine, takvimsizMakine: s.takvimsiz, hucreler: s.hucreler,
  })).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

  const ileriBas = haftalar.find((h) => h.ileri)!.bas;
  return {
    hesaplanan: new Date(simdi).toISOString(),
    haftalar: haftalar.map(({ baslangic, bitis, ileri }) => ({ baslangic, bitis, ileri })),
    istasyonlar,
    darbogaz: darbogaz(istasyonlar, haftalar),
    kisiYukuDk: Math.round(pencereSuresi(kisiPlani, ileriBas, son.bit) / 60_000),
    zamaninda: ewmaEgilimi((await olcumler(db, new Date(simdi - EGILIM_GUN * GUN))).map((o) => ({ zaman: o.zaman, yuzde: o.zamanindaYuzde }))),
  };
}
