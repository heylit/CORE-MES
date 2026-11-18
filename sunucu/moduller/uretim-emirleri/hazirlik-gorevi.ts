import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ADIMLI_OKUMA_ISLEMLERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  HazirlikCevabi, HazirlikDagitCevabi, HazirlikDagitGovdesi, HazirlikMatrisiCevabi, HazirlikProjesiGovdesi, HazirlikProjesiCevabi, HazirlikProjesiSecenekleri,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { kisiAdlari, rolSecenekleri, rollerdekiKisiler } from '../kisiler/disari.ts';
import {
  hazirlikGorevleri, hazirlikGorevleriAc, hazirlikSablonlari, projeGetir, projeninHazirlikGorevleri, projeSecenekleri,
} from '../projeler/disari.ts';
import type { HazirlikMaddeBilgisi, HazirlikPlani } from '../projeler/disari.ts';
import { hazirliklar } from './hazirlik.ts';
import { hazirlikMaddeTanimlari } from './hazirlik-maddeleri.ts';
import { acikEmirIhlali, gorevinSistemHali } from './kurallar.ts';
import * as s from './sorgular.ts';

// 3396 a: emrin hazırlık görevleri projede açılır. Proje emrin projesi olabileceği gibi başka bir aktif proje de olabilir (emrin
// numarasına giren proje değişmez); görev emre ve iş emrine bağlıdır. Kapalı madde görev doğurmaz.
const EMIR_YOK = 'Üretim emri bulunamadı.';

async function acikMaddeler(db: Db): Promise<Map<string, HazirlikMaddeBilgisi>> {
  return new Map((await hazirlikMaddeTanimlari(db)).filter((m) => m.acik || m.durduran).map((m) => [m.kod, { ad: m.ad, isEmriDuzeyi: m.isEmriDuzeyi }]));
}

export async function emrinHazirlikGorevleriniAc(db: Db, kisiId: number, emirId: number, projeId: number, sablonId: number | null): Promise<number> {
  const e = await s.ustEmirBul(db, emirId, true);
  if (e === null) throw bulunamadi(EMIR_YOK);
  const ihlal = acikEmirIhlali(e.durum, e.arsiv);
  if (ihlal !== null) throw cakisma(ihlal);
  const isEmirleri = (await s.isEmirleriGetir(db, [emirId])).map((i) => ({ id: i.id, opNo: i.opNo }));
  const r = await hazirlikGorevleriAc(db, kisiId, {
    projeId, sablonId, hedefler: [{ emriId: emirId, emirNo: e.emirNo, isEmirleri }], maddeler: await acikMaddeler(db),
    tarih: { baslangic: e.baslangic, bitis: e.teslim },
  });
  return r.eklenen;
}

export async function hazirlikProjesiKur(db: Db, kullanici: Kullanici, emirId: number, g: HazirlikProjesiGovdesi): Promise<HazirlikProjesiCevabi> {
  return { eklenen: await emrinHazirlikGorevleriniAc(db, kullanici.id, emirId, g.projeId, g.sablonId) };
}

export async function hazirlikProjesiSecenekleri(db: Db, emirId: number): Promise<HazirlikProjesiSecenekleri> {
  const e = await s.ustEmirBul(db, emirId, false);
  if (e === null) throw bulunamadi(EMIR_YOK);
  const isEmriSayisi = (await s.isEmirleriGetir(db, [emirId])).length;
  const maddeler = await acikMaddeler(db);
  const sablonlar = (await hazirlikSablonlari(db)).map((x) => {
    const acik = x.maddeler.flatMap((m) => { const b = maddeler.get(m); return b === undefined ? [] : [{ kod: m, ...b }]; });
    const tek = acik.filter((m) => !m.isEmriDuzeyi || isEmriSayisi === 0);
    const ie = acik.filter((m) => m.isEmriDuzeyi && isEmriSayisi > 0);
    const parcalar = [
      ...(ie.length > 0 ? [`${String(isEmriSayisi)} iş emri × (${ie.map((m) => m.ad).join(', ')})`] : []),
      ...(tek.length > 0 ? [`emir başına ${tek.map((m) => m.ad).join(', ')}`] : []),
    ];
    return { id: x.id, ad: x.ad, varsayilan: x.varsayilan, dogacak: tek.length + ie.length * isEmriSayisi, ozet: parcalar.join(' ve ') };
  });
  return {
    emirNo: e.emirNo, emirProjeId: e.projeId, baslangic: e.baslangic, teslim: e.teslim,
    acikGorev: (await hazirlikGorevleri(db, [emirId])).length,
    projeler: (await projeSecenekleri(db)).map((p) => ({ id: p.id, kod: p.kod, ad: p.ad })),
    sablonlar,
  };
}

// --- Proje > Hazırlık (A) ---

const PROJE_YOK = 'Proje bulunamadı.';
type Atanan = { tur: 'kisi' | 'rol'; id: number; ad: string; kisiSayisi: number };

// Kişi ya da rol adları ve rolde kaç kişi olduğu (alıcı sayısı görünür; Risk K9).
async function atananCozucu(db: Db, kisiIdleri: readonly number[], rolIdleri: readonly number[]) {
  const kisiler = await kisiAdlari(db, [...new Set(kisiIdleri)]);
  const roller = new Map((await rolSecenekleri(db)).map((r) => [r.id, r.ad]));
  const sayilar = new Map<number, number>();
  for (const r of new Set(rolIdleri)) sayilar.set(r, (await rollerdekiKisiler(db, [r])).length);
  return (kisiId: number | null, rolId: number | null): Atanan | null => {
    if (kisiId !== null) return { tur: 'kisi', id: kisiId, ad: kisiler.get(kisiId) ?? 'Bilinmeyen kişi', kisiSayisi: 1 };
    if (rolId !== null) return { tur: 'rol', id: rolId, ad: roller.get(rolId) ?? 'Bilinmeyen rol', kisiSayisi: sayilar.get(rolId) ?? 0 };
    return null;
  };
}

export async function hazirlikMatrisi(db: Db, kullanici: Kullanici, projeId: number): Promise<HazirlikMatrisiCevabi> {
  const proje = await projeGetir(db, projeId);
  if (proje === null) throw bulunamadi(PROJE_YOK);
  const gorevler = await projeninHazirlikGorevleri(db, projeId);
  const projeninEmirleri = await s.ustEmirler(db, false, projeId);
  const bilinen = new Set(projeninEmirleri.map((e) => e.id));
  const disaridan = [...new Set(gorevler.map((g) => g.emriId))].filter((id) => !bilinen.has(id));
  const emirler = [...projeninEmirleri.reverse(), ...await s.ustEmirlerBul(db, disaridan)];
  const isEmirleri = await s.isEmirleriGetir(db, emirler.map((e) => e.id));
  const tanimlar = await hazirlikMaddeTanimlari(db);
  const kullanilan = new Set(gorevler.map((g) => g.madde));
  const atanan = await atananCozucu(
    db,
    gorevler.flatMap((g) => [g.sorumluKisiId, g.kontrolKisiId]).filter((x): x is number => x !== null),
    gorevler.flatMap((g) => [g.yapanRolId, g.kontrolRolId]).filter((x): x is number => x !== null),
  );
  // Yalnız görevi olan emirlerin hazırlığı okunur: görevsiz emirde hücre yoktur. Emrin hazırlığı emir tarafında yalnız adımlı emri okuyana
  // açıktır (Risk 3430 K1); uç projeler.oku ister, bu yüzden emri okuyamayana sistem hâli gitmez.
  const emirOkur = ADIMLI_OKUMA_ISLEMLERI.some((i) => islemVarMi(kullanici, i));
  const sistem = emirOkur ? await hazirliklar(db, [...new Set(gorevler.map((g) => g.emriId))]) : new Map<number, HazirlikCevabi>();
  return {
    proje: { id: proje.id, kod: proje.kod, ad: proje.ad, durum: proje.durum },
    dagitir: islemVarMi(kullanici, 'projeler.hazirlik-dagit') && proje.durum === 'aktif',
    maddeler: tanimlar.filter((m) => kullanilan.has(m.kod)).map((m) => ({ kod: m.kod, ad: m.ad, kisa: m.kisa, durduran: m.durduran, isEmriDuzeyi: m.isEmriDuzeyi })),
    emirler: emirler.map((e) => ({
      id: e.id, emirNo: e.emirNo, parcaNo: e.parcaNo, adet: e.adet, acik: acikEmirIhlali(e.durum, e.arsiv) === null,
      isEmirleri: isEmirleri.filter((i) => i.uretimEmriId === e.id).map((i) => ({ id: i.id, opNo: i.opNo, ad: i.ad })),
    })),
    gorevler: gorevler.map((g) => ({
      id: g.id, madde: g.madde, emriId: g.emriId, isEmriId: g.isEmriId, ad: g.ad, durum: g.durum, onaylandi: g.onaylandi, planBitis: g.planBitis,
      gecikmeGun: g.gecikmeGun, yapan: atanan(g.sorumluKisiId, g.yapanRolId), kontrol: atanan(g.kontrolKisiId, g.kontrolRolId), surum: g.surum, kademe: g.kademe,
      sistem: gorevinSistemHali(sistem.get(g.emriId), g.madde, g.isEmriId),
    })),
  };
}

// Projenin açık emirlerine dağıtır. Alıcılar kişi ya da rol başına toplanır; toplam kişi rollerin üyeleriyle tekilleşir.
export async function hazirlikDagit(db: Db, kullanici: Kullanici, g: HazirlikDagitGovdesi): Promise<HazirlikDagitCevabi> {
  const proje = await projeGetir(db, g.projeId);
  if (proje === null) throw bulunamadi(PROJE_YOK);
  if (proje.durum !== 'aktif') throw dogrulama('Kapalı projede görev dağıtılmaz.', 'projeId');
  const emirler = (await s.ustEmirler(db, false, g.projeId)).reverse().filter((e) => acikEmirIhlali(e.durum, e.arsiv) === null);
  const isEmirleri = await s.isEmirleriGetir(db, emirler.map((e) => e.id));
  const maddeler = await acikMaddeler(db);
  const plan: HazirlikPlani[] = [];
  let eklenen = 0;
  for (const e of emirler) {
    const r = await hazirlikGorevleriAc(db, kullanici.id, {
      projeId: g.projeId, sablonId: g.sablonId, maddeler, tarih: { baslangic: e.baslangic, bitis: e.teslim },
      hedefler: [{ emriId: e.id, emirNo: e.emirNo, isEmirleri: isEmirleri.filter((i) => i.uretimEmriId === e.id).map((i) => ({ id: i.id, opNo: i.opNo })) }],
    }, g.deneme);
    plan.push(...r.plan);
    eklenen += r.eklenen;
  }
  const atanan = await atananCozucu(db, plan.flatMap((p) => (p.yapanKisiId === null ? [] : [p.yapanKisiId])), plan.flatMap((p) => (p.yapanRolId === null ? [] : [p.yapanRolId])));
  const alicilar = new Map<string, Atanan & { gorevler: Map<string, number> }>();
  for (const p of plan) {
    const a = atanan(p.yapanKisiId, p.yapanRolId);
    if (a === null) continue;
    const anahtar = `${a.tur}:${String(a.id)}`;
    const k = alicilar.get(anahtar) ?? { ...a, gorevler: new Map<string, number>() };
    k.gorevler.set(p.madde, (k.gorevler.get(p.madde) ?? 0) + 1);
    alicilar.set(anahtar, k);
  }
  const kisiler = new Set([
    ...plan.flatMap((p) => (p.yapanKisiId === null ? [] : [p.yapanKisiId])),
    ...await rollerdekiKisiler(db, [...new Set(plan.flatMap((p) => (p.yapanRolId === null || p.yapanKisiId !== null ? [] : [p.yapanRolId])))]),
  ]);
  return {
    eklenen, gorevSayisi: plan.length, toplamKisi: kisiler.size,
    atanmamis: plan.filter((p) => p.yapanKisiId === null && p.yapanRolId === null).length,
    alicilar: [...alicilar.values()].map((a) => ({
      tur: a.tur, id: a.id, ad: a.ad, kisiSayisi: a.kisiSayisi,
      gorevler: [...a.gorevler].map(([madde, sayi]) => ({ madde, ad: maddeler.get(madde)?.ad ?? madde, sayi })),
    })),
  };
}
