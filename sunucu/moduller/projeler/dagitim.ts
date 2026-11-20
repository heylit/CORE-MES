import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { DagitCevabi, DagitilmamisCevabi, DagitimCevabi, DagitimSatiri, DagitVerisi } from '#paylasilan/sozlesme/projeler.ts';
import { hazirlikGorevleriAc } from './hazirlik-gorevleri.ts';
import type { HazirlikHedefi, HazirlikMaddeBilgisi } from './hazirlik-gorevleri.ts';
import { PROJE_YOK, sablonTarihleri } from './kurallar.ts';
import { YONETIM_KISITLARI, atamaBildir, projeKilitle, sablonUygula, secilenSablon } from './servis.ts';
import type { SatirDuzeni } from './servis.ts';
import * as sorgular from './sorgular.ts';

// 3458 (dilim 2, karar 3458-2 a): iş başlangıcında görevler Görevleri dağıt ekranında dağıtılır. Proje görevi hemen açılır; hazırlık
// satırı projeye bağlı açık emirler için açılır ve dağıtılan hâliyle donar, sonra gelen emirde de o atamayla doğar (Risk K2).

// Projeye bağlı açık emirler ve açık maddeler Üretim Emirleri'nindir; kablolama bağlar. Bağ yoksa hazırlık satırı emir gelince açılır.
export interface HazirlikHedefleri {
  hedefler: readonly { hedef: HazirlikHedefi; tarih: { baslangic: string | null; bitis: string | null } }[];
  maddeler: ReadonlyMap<string, HazirlikMaddeBilgisi>;
}
export type HazirlikHedefCozucusu = (db: Db, projeId: number) => Promise<HazirlikHedefleri>;
let hedefCozucusu: HazirlikHedefCozucusu | null = null;
export const hazirlikHedefCozucusuKaydet = (c: HazirlikHedefCozucusu | null): void => { hedefCozucusu = c; };

export const DAGITILACAK_YOK = 'Dağıtılacak görev yok: şablon seç ya da bu işe özel görev ekle.';
export const SABLON_DAGITILDI = 'Bu şablon bu projede zaten dağıtıldı.';
export const SATIR_SABLONDA_YOK = 'Satır seçilen şablonda yok; sayfayı yenile.';

// Hazırlık kaleminde kaç görev doğacağı: açık her emir için emir başına, iş emri düzeyindeki maddede iş emri başına; açık olan sayılmaz.
async function dogacakSayisi(db: Db, madde: string, h: HazirlikHedefleri): Promise<number> {
  const bilgi = h.maddeler.get(madde);
  if (bilgi === undefined) return 0;
  let sayi = 0;
  for (const { hedef } of h.hedefler) {
    const yerler = bilgi.isEmriDuzeyi && hedef.isEmirleri.length > 0 ? hedef.isEmirleri.map((i) => i.id) : [null];
    for (const ie of yerler) if (!(await sorgular.hazirlikGoreviVarMi(db, hedef.emriId, ie, madde))) sayi += 1;
  }
  return sayi;
}

export async function dagitimOnizleme(db: Db, projeId: number, sablonId: number | undefined): Promise<DagitimCevabi> {
  const proje = await sorgular.projeGetir(db, projeId);
  if (proje === null) throw bulunamadi(PROJE_YOK);
  const sablonlar = await sorgular.sablonlar(db, true);
  const dagitilan = new Set((await sorgular.dagitilanSablonlar(db, projeId)).map((x) => x.sablon_id));
  // Seçilmediyse varsayılan (dağıtılmadıysa) önerilir; kullanıcı ekranda değiştirir.
  const secili = sablonId ?? sablonlar.find((x) => x.varsayilan && !dagitilan.has(x.id))?.id ?? null;
  const hedefler = hedefCozucusu === null ? null : await hedefCozucusu(db, projeId);
  const bugun = await sorgular.bugun(db);
  const kalemler = secili === null ? [] : await sorgular.sablonKalemleri(db, [secili]);
  const satirlar: DagitimSatiri[] = [];
  for (const k of kalemler) {
    const t = sablonTarihleri({ dayanak: k.dayanak, gun: k.gun, sureGun: k.sure_gun }, proje, bugun);
    const madde = k.hazirlik_maddesi;
    satirlar.push({
      kalemId: k.id, ad: k.ad, aciklama: k.aciklama, asama: k.asama, hazirlikMaddesi: madde,
      hazirlikAd: madde === null ? null : hedefler?.maddeler.get(madde)?.ad ?? madde,
      yapanKisiId: k.yapan_kisi_id, yapanRolId: k.yapan_rol_id, kontrolKisiId: k.kontrol_kisi_id, kontrolRolId: k.kontrol_rol_id,
      planBaslangic: t.planBaslangic, planBitis: t.planBitis, kanitZorunlu: k.kanit_zorunlu, adimlar: k.adimlar,
      dogacak: madde === null ? 1 : hedefler === null ? null : await dogacakSayisi(db, madde, hedefler),
    });
  }
  return {
    proje: { id: proje.id, kod: proje.kod, ad: proje.ad, aktif: proje.durum === 'aktif' },
    sablonlar: sablonlar.map((x) => ({ id: x.id, ad: x.ad, varsayilan: x.varsayilan, dagitildi: dagitilan.has(x.id) })),
    sablonId: secili,
    dagitildi: await sorgular.dagitildiMi(db, projeId),
    emirSayisi: hedefler === null ? null : hedefler.hedefler.length,
    satirlar,
  };
}

export async function dagit(db: Db, kisiId: number, projeId: number, g: DagitVerisi): Promise<DagitCevabi> {
  await projeKilitle(db, projeId, true);
  if (g.sablonId === null && g.ozel.length === 0) throw dogrulama(DAGITILACAK_YOK);
  let projeGorevi = 0;
  const atamalar: { sorumluKisiId: number | null; yapanRolId: number | null }[] = [];
  let hazirlikGorevi = 0;
  if (g.sablonId !== null) {
    const sablon = await secilenSablon(db, g.sablonId);
    if (await sorgular.sablonUygulandiMi(db, projeId, sablon.id)) throw cakisma(SABLON_DAGITILDI);
    const kalemIdleri = new Set((await sorgular.sablonKalemleri(db, [sablon.id])).map((k) => k.id));
    const duzen = new Map<number, SatirDuzeni>();
    for (const s of g.satirlar ?? []) {
      if (!kalemIdleri.has(s.kalemId)) throw dogrulama(SATIR_SABLONDA_YOK, 'satirlar');
      duzen.set(s.kalemId, s);
    }
    if (duzen.size > 0 && [...kalemIdleri].every((id) => duzen.get(id)?.dahil === false) && g.ozel.length === 0) throw dogrulama(DAGITILACAK_YOK);
    projeGorevi += await sablonUygula(db, kisiId, projeId, sablon, duzen);
    // Donan hazırlık kalemleri projeye bağlı açık emirlerde açılır (emir bazında son gün emrin tarihlerine göre).
    if (hedefCozucusu !== null) {
      const h = await hedefCozucusu(db, projeId);
      for (const { hedef, tarih } of h.hedefler) {
        hazirlikGorevi += (await hazirlikGorevleriAc(db, kisiId, { projeId, sablonId: null, hedefler: [hedef], maddeler: h.maddeler, tarih })).eklenen;
      }
    }
  }
  // Bu işe özel görev bugün başlar; geçmiş bitiş verilirse tek gündür.
  const bugun = g.ozel.length === 0 ? '' : await sorgular.bugun(db);
  for (const o of g.ozel) {
    const id = await kisitKorumali(YONETIM_KISITLARI, () => sorgular.gorevEkle(db, projeId, {
      kilometreTasiId: null, ad: o.ad, aciklama: null, sorumluKisiId: o.yapanKisiId, planBaslangic: bugun < o.planBitis ? bugun : o.planBitis, planBitis: o.planBitis,
      oncekiGorevId: null, asama: null, yapanRolId: o.yapanRolId, kontrolKisiId: o.kontrolKisiId, kontrolRolId: o.kontrolRolId,
      yedekKontrolKisiId: null, yedekKontrolRolId: null, kanitZorunlu: o.kanitZorunlu,
    }, kisiId));
    if (id > 0) projeGorevi += 1;
    atamalar.push({ sorumluKisiId: o.yapanKisiId, yapanRolId: o.yapanRolId });
  }
  await atamaBildir(db, projeId, atamalar, kisiId);
  return { projeGorevi, hazirlikGorevi };
}

export async function dagitilmamisProjeler(db: Db): Promise<DagitilmamisCevabi> {
  return { projeler: await sorgular.dagitilmamisProjeler(db) };
}
