import type { Db } from '#cekirdek/db.ts';
import type { KaynakTakvimi } from '#paylasilan/sozlesme/vardiya.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import { makineler, planAyarlari } from '../istasyonlar/disari.ts';
import { aralikAdetleri, isEmriPlanBilgileri, isEmriZamanlari } from '../uretim-emirleri/disari.ts';
import { calismaTakvimleri } from '../vardiya/disari.ts';
import type { Aralik, Kaynak } from './kurallar.ts';
import { sapmaOlcusu, type PlanYeri } from './sapma-kurallar.ts';
import { canliYerlesimleri, makinelerinCanliIsleri, planSurumu, tabanOku } from './sorgular.ts';

export interface PlanSapmasi {
  isEmriId: number;
  uretimEmriId: number;
  // Ölçünün karşılaştırıldığı canlı plan sürümü; adım canlıda yoksa boş.
  planSurumu: number | null;
  canli: { kaynak: Kaynak; baslangic: string; bitis: string } | null;
  taban: { kaynak: Kaynak; baslangic: string; bitis: string } | null;
  // Giriş: ayar başı varsa o, yoksa başlama (766 a).
  gercekBaslama: string | null;
  gercekBitis: string | null;
  // Kural, motor değil: kalan adet x birim süre / verim, şimdiden net vardiya aralıklarına yayılır. Yalnız çalışan işte; net aralık
  // okunamazsa boş.
  tahminiBitis: string | null;
  // Net çalışma dakikası, canlıya göre (bitiş yoksa tahmini bitiş); artı geç.
  bitisKaymasiDk: number | null;
  // Yalnız rapor: aynı ölçü taban plana göre.
  tabanBitisKaymasiDk: number | null;
  // Gerçek net süre / planlı net süre; yalnız bitmiş işte.
  sureOrani: number | null;
  // Bütün kullanım satırlarının makinesi canlı planlı makineyse true, biri farklıysa false; kullanım yoksa ya da planlı kaynak kişiyse boş.
  tezgahUyumu: boolean | null;
  // İlk çalışılan makinede canlı planda bundan önce başlayacak ve o an başlamamış iş varken bu iş başladıysa false; o makinede canlı plan
  // yoksa ya da adım canlıda değilse boş.
  siraUyumu: boolean | null;
}

const DK = 60_000;
// Tahmini bitiş şimdiden bu kadar gün içinde aranır; takvim tek okumada en çok AZAMI_TAKVIM_GUNU gün olduğundan daha eskisi okunmaz.
const TAHMIN_UFUK_GUN = 30;
const TAKVIM_EN_COK_GUN = 360;
const dakika = (iso: string | Date) => (typeof iso === 'string' ? Date.parse(iso) : iso.getTime()) / DK;
const iso = (dk: number) => new Date(dk * DK).toISOString();
const gunEkle = (tarih: string, gun: number) => new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * 86_400_000).toISOString().slice(0, 10);
const kaynakAnahtari = (k: Kaynak) => `${k.tur}:${k.id}`;

// Okunacak takvim günleri (tesis günü) ve net ölçünün güvenilir olduğu ilk dakika: okumanın ilk günü yalnız önceki günden taşan vardiya
// içindir, pencere ikinci günün tesisteki gece yarısında açılır. UTC gece yarısı alınırsa tesiste günün ilk saatleri dışarıda kalır.
export function takvimPenceresi(enErken: number, simdi: number): { baslangicGunu: string; bitisGunu: string; pencereBasi: number } {
  const bitisGunu = gunEkle(tesisGunu(simdi * DK), TAHMIN_UFUK_GUN);
  const baslangicGunu = [gunEkle(tesisGunu(enErken * DK), -1), gunEkle(bitisGunu, -TAKVIM_EN_COK_GUN)].sort().at(-1)!;
  return { baslangicGunu, bitisGunu, pencereBasi: tesisGunBasi(gunEkle(baslangicGunu, 1)) / DK };
}

// Plandan sapma (781 a, 782): istekte hesaplanır, günlük toplu hesap ve tablo yok. Plan Arkon'u okumaz (ADR 0006); Arkon bunu okuyup kendi
// eşiğiyle olaya çevirir. Bilinmeyen kimlik haritada yoktur.
export async function planSapmalari(db: Db, g: { isEmriIdleri: readonly number[]; simdi?: number }): Promise<Map<number, PlanSapmasi>> {
  const sonuc = new Map<number, PlanSapmasi>();
  const ids = [...new Set(g.isEmriIdleri)];
  if (ids.length === 0) return sonuc;
  const simdiMs = g.simdi ?? Date.now();
  const simdi = simdiMs / DK;
  const zamanlar = await isEmriZamanlari(db, ids);
  if (zamanlar.size === 0) return sonuc;
  const bilinen = [...zamanlar.keys()];
  const canli = new Map((await canliYerlesimleri(db, bilinen)).map((y) => [y.isEmriId, { kaynak: y.kaynak, baslangic: dakika(y.baslangic), bitis: dakika(y.bitis) }]));
  const taban = new Map((await tabanOku(db, { isEmriIdleri: bilinen })).map((t) => [t.isEmriId, { kaynak: t.kaynak, baslangic: dakika(t.baslangic), bitis: dakika(t.bitis) }]));
  const surum = canli.size > 0 ? await planSurumu(db) : null;
  const girisOf = (z: { ayarBasi: string | null; baslama: string | null }) => { const x = z.ayarBasi ?? z.baslama; return x === null ? null : dakika(x); };

  // Kalan süre yalnız çalışan işte: kalan adet x birim süre, makinenin istasyon verimiyle (plan servisindeki verimliSure ile aynı oran).
  const calisan = bilinen.filter((id) => zamanlar.get(id)!.durum === 'calisiyor');
  const bilgiler = await isEmriPlanBilgileri(db, calisan);
  const adetler = calisan.length === 0 ? new Map<number, { saglam: number }>() : await aralikAdetleri(db, 'is_emri', calisan, '-infinity', iso(simdi));
  const makineIstasyonu = new Map((await makineler(db, { pasiflerDahil: true })).map((m) => [m.id, m.istasyonId]));
  const verimler = new Map((await planAyarlari(db)).map((a) => [a.istasyonId, Number(a.verimYuzde) / 100]));
  const verimi = (makineId: number | null) => {
    const ist = makineId === null ? null : makineIstasyonu.get(makineId) ?? null;
    return ist === null ? 1 : verimler.get(ist) ?? 1;
  };

  // Net aralıklar ölçünün kaynağının takviminden: canlıdaki kaynak, yoksa ilk çalışılan makine.
  const kaynagi = new Map<number, Kaynak>();
  for (const id of bilinen) {
    const c = canli.get(id);
    const ilk = zamanlar.get(id)!.makineler[0]?.makineId ?? null;
    if (c) kaynagi.set(id, c.kaynak);
    else if (ilk !== null) kaynagi.set(id, { tur: 'makine', id: ilk });
  }
  const enErken = Math.min(simdi, ...bilinen.flatMap((id) => {
    const z = zamanlar.get(id)!;
    return [canli.get(id)?.baslangic, taban.get(id)?.baslangic, girisOf(z) ?? undefined].filter((x): x is number => x !== undefined);
  }));
  const { baslangicGunu, bitisGunu, pencereBasi } = takvimPenceresi(enErken, simdi);
  const tekilKaynak = [...new Map([...kaynagi.values()].map((k) => [kaynakAnahtari(k), k])).values()];
  const okunan = tekilKaynak.length === 0 ? new Map<string, KaynakTakvimi | null>() : await calismaTakvimleri(db, tekilKaynak, { baslangic: baslangicGunu, bitis: bitisGunu });
  const takvimler = new Map<string, Aralik[] | undefined>();
  for (const [anahtar, t] of okunan) {
    const tanimsiz = t === null || t.gunler.every((x) => x.dakika === 0);
    takvimler.set(anahtar, tanimsiz ? undefined : t.araliklar.map((a) => ({ baslangic: dakika(a.baslangic), bitis: dakika(a.bitis) })));
  }

  // Sıra uyumu: ilk çalışılan makinedeki canlı işler; girişleri ikinci okumada.
  const ilkMakine = new Map(bilinen.flatMap((id) => { const m = zamanlar.get(id)!.makineler[0]?.makineId ?? null; return m === null ? [] : [[id, m] as const]; }));
  const makineIsleri = new Map<number, Map<number, number>>();
  for (const r of await makinelerinCanliIsleri(db, [...new Set(ilkMakine.values())])) {
    const l = makineIsleri.get(r.makineId) ?? new Map<number, number>();
    l.set(r.isEmriId, Math.min(l.get(r.isEmriId) ?? Infinity, dakika(r.baslangic)));
    makineIsleri.set(r.makineId, l);
  }
  const oncekiKimlikleri = new Map<number, number[]>();
  for (const [id, m] of ilkMakine) {
    const c = canli.get(id), l = makineIsleri.get(m);
    if (!c || !l) continue;
    oncekiKimlikleri.set(id, [...l].filter(([x, bas]) => x !== id && bas < c.baslangic).map(([x]) => x));
  }
  const eksik = [...new Set([...oncekiKimlikleri.values()].flat())].filter((x) => !zamanlar.has(x));
  const digerZamanlar = await isEmriZamanlari(db, eksik);
  const girisi = (x: number) => { const z = zamanlar.get(x) ?? digerZamanlar.get(x); return z ? girisOf(z) : null; };

  for (const id of bilinen) {
    const z = zamanlar.get(id)!;
    const c = canli.get(id) ?? null, t = taban.get(id) ?? null;
    const giris = girisOf(z), bitis = z.bitis === null ? null : dakika(z.bitis);
    const k = kaynagi.get(id);
    const icinde = [c?.baslangic, t?.baslangic, giris ?? undefined].every((x) => x === undefined || x >= pencereBasi);
    const takvim = k === undefined || !icinde ? undefined : takvimler.get(kaynakAnahtari(k));
    let kalanDk: number | null = null;
    const b = bilgiler.get(id);
    if (z.durum === 'calisiyor' && b && b.birimSureDk !== null && Number.isFinite(Number(b.birimSureDk))) {
      const kalanAdet = Math.max(0, b.adet - (adetler.get(id)?.saglam ?? 0));
      kalanDk = (Number(b.birimSureDk) * kalanAdet) / verimi(z.makineler.at(-1)?.makineId ?? null);
    }
    const onceki = oncekiKimlikleri.get(id);
    const o = sapmaOlcusu({
      canli: c, taban: t, durum: z.durum, giris, bitis, makineler: z.makineler.map((m) => m.makineId), kalanDk, takvim, simdi,
      oncekiler: onceki === undefined ? undefined : onceki.map(girisi),
    });
    const disa = (p: PlanYeri | null) => (p === null ? null : { kaynak: p.kaynak, baslangic: iso(p.baslangic), bitis: iso(p.bitis) });
    sonuc.set(id, {
      isEmriId: id, uretimEmriId: z.uretimEmriId, planSurumu: c === null ? null : surum, canli: disa(c), taban: disa(t),
      gercekBaslama: giris === null ? null : iso(giris), gercekBitis: z.bitis === null ? null : iso(dakika(z.bitis)),
      tahminiBitis: o.tahminiBitis === null ? null : iso(o.tahminiBitis), bitisKaymasiDk: o.bitisKaymasiDk, tabanBitisKaymasiDk: o.tabanBitisKaymasiDk,
      sureOrani: o.sureOrani, tezgahUyumu: o.tezgahUyumu, siraUyumu: o.siraUyumu,
    });
  }
  return sonuc;
}
