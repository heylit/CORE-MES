import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { HazirlikAtaGovdesi } from '#paylasilan/sozlesme/projeler.ts';
import { ADIM_EN_COK, adimIlerlemesi, hedefYerleri, sablonTarihleri } from './kurallar.ts';
import { operasyonTipiUyar } from './kurallar.ts';
import type { HedefYeri, HedefIsEmri, KalemSuzgeci } from './kurallar.ts';
import { YONETIM_KISITLARI, atamaBildir, projeKilitle, secilenSablon } from './servis.ts';
import * as sorgular from './sorgular.ts';
import type { HazirlikGoreviSatiri } from './sorgular.ts';

// 3396 a: şablonun hazırlık kalemi, projeye bağlı üretim emri için emir ya da iş emri başına bir görev doğurur. Hangi maddenin
// iş emri düzeyinde olduğu ve açık olup olmadığı Üretim Emirleri'nindir; çağıran verir. Kalem projeye uygulanmış (donmuş) şablondan
// okunur: şablon sonradan değişse de proje uygulandığı hâli izler.

// emirTuru ve operasyonTipiId kalemin 3611-1 süzgeci içindir; verilmezse süzgeç o emirde işlemez.
export interface HazirlikHedefi { emriId: number; emirNo: string; emirTuru?: string | undefined; isEmirleri: readonly HedefIsEmri[] }
export interface HazirlikMaddeBilgisi { ad: string; isEmriDuzeyi: boolean }
export interface HazirlikGorevleriAcVerisi {
  projeId: number;
  // 3458 Risk K2: şablon projeye yalnız Görevleri dağıt ile uygulanır. Dağıtılmamış şablon denemede önizlenir, açmada reddedilir.
  sablonId: number | null;
  hedefler: readonly HazirlikHedefi[];
  // Yalnız açık maddeler verilir; listede olmayan maddenin kalemi görev doğurmaz.
  maddeler: ReadonlyMap<string, HazirlikMaddeBilgisi>;
  // Son günler emrin plan başlangıcı ve teslimine göre; yoksa projenin tarihlerine göre.
  tarih: { baslangic: string | null; bitis: string | null };
}

interface DonmusKalem {
  ad: string; aciklama: string | null; asama: string | null; dayanak: 'baslangic' | 'termin'; gun: number; sureGun: number;
  yapanKisiId: number | null; yapanRolId: number | null; kontrolKisiId: number | null; kontrolRolId: number | null;
  yedekKontrolKisiId: number | null; yedekKontrolRolId: number | null; hazirlikMaddesi: string | null;
  // 3458 öncesi donan kalemde yoktur: adımsız ve kanıtsız sayılır.
  adimlar?: readonly string[]; kanitZorunlu?: boolean;
  // 3611-1: öncesinde donan kalemde yoktur: süzgeçsiz (hepsi) sayılır.
  emirTurleri?: readonly string[]; operasyonTipleri?: readonly number[];
}
const hazirlikKalemi = (k: unknown): k is DonmusKalem & { hazirlikMaddesi: string } =>
  typeof k === 'object' && k !== null && typeof (k as { hazirlikMaddesi?: unknown }).hazirlikMaddesi === 'string';

const HAZIRLIK_KISITLARI = {
  ...YONETIM_KISITLARI,
  projeler_gorev_hazirlik_madde_bicim: { ileti: 'Hazırlık maddesi geçersiz.', alan: 'hazirlikMaddesi' },
} as const;

export interface HazirlikPlani { madde: string; yapanKisiId: number | null; yapanRolId: number | null }

const kalemdenDonmus = (k: sorgular.SablonKalemiSatiri): DonmusKalem => ({
  ad: k.ad, aciklama: k.aciklama, asama: k.asama, dayanak: k.dayanak, gun: k.gun, sureGun: k.sure_gun, yapanKisiId: k.yapan_kisi_id, yapanRolId: k.yapan_rol_id,
  kontrolKisiId: k.kontrol_kisi_id, kontrolRolId: k.kontrol_rol_id, yedekKontrolKisiId: k.yedek_kontrol_kisi_id, yedekKontrolRolId: k.yedek_kontrol_rol_id,
  hazirlikMaddesi: k.hazirlik_maddesi, adimlar: k.adimlar, kanitZorunlu: k.kanit_zorunlu,
  emirTurleri: k.emir_turleri, operasyonTipleri: k.operasyon_tipleri,
});

// Kalemin bir emirde açacağı yerler (var olan görev olan yer hariç). Yeni biçimde (iş emirleri adım) emirde maddenin herhangi bir görevi
// varsa, eski biçim görevler dahil, yenisi açılmaz (3611 Risk K1); eski biçimde var olan yalnız aynı iş emrinin görevidir.
export async function acilacakYerler(db: Db, hedef: HazirlikHedefi, madde: HazirlikMaddeBilgisi, maddeKodu: string, kalemAdimli: boolean, suzgec?: KalemSuzgeci): Promise<HedefYeri[]> {
  const acilacak: HedefYeri[] = [];
  for (const y of hedefYerleri(hedef, madde.isEmriDuzeyi, kalemAdimli, suzgec)) {
    const var_ = y.adimlar.length > 0
      ? await sorgular.hazirlikMaddesiGoreviVarMi(db, hedef.emriId, maddeKodu)
      : await sorgular.hazirlikGoreviVarMi(db, hedef.emriId, y.isEmriId, maddeKodu);
    if (!var_) acilacak.push(y);
  }
  return acilacak;
}

export const SABLON_DAGITILMADI = 'Bu şablon projede dağıtılmadı: önce Projeler > Görevleri dağıt ekranında dağıt.';

// Açılan hazırlık görevine kalemin adımları eklenir; tekil dizine takılıp açılmayan görev (null) atlanır.
async function gorevVeAdimlar(db: Db, adimlar: readonly string[], isEmriAdimlari: HedefYeri['adimlar'], id: number | null): Promise<boolean> {
  if (id === null) return false;
  await sorgular.adimlariEkle(db, id, adimlar);
  await sorgular.hazirlikAdimlariniEkle(db, id, isEmriAdimlari);
  return true;
}

// Denemede hiçbir şey yazılmaz: şablon uygulanmaz, görev açılmaz, bildirim gitmez; yalnız açılacak görevler (var olan hariç) döner.
// `bildir` false ise atama bildirimini çağıran toplar (dağıtım tek zil, 3478).
export async function hazirlikGorevleriAc(
  db: Db, kisiId: number, v: HazirlikGorevleriAcVerisi, deneme = false, bildir = true,
): Promise<{ eklenen: number; plan: HazirlikPlani[] }> {
  const bos = { eklenen: 0, plan: [] };
  // Hazırlık kalemi yoksa proje kilitlenmez: her emir açılışı projeyi beklemesin.
  if (v.sablonId === null && !(await sorgular.uygulananKalemler(db, v.projeId)).some(hazirlikKalemi)) return bos;
  if (!deneme) await projeKilitle(db, v.projeId, true);
  const yeniSablon = v.sablonId !== null && !(await sorgular.sablonUygulandiMi(db, v.projeId, v.sablonId)) ? v.sablonId : null;
  let ekKalemler: DonmusKalem[] = [];
  if (yeniSablon !== null) {
    const sablon = await secilenSablon(db, yeniSablon);
    if (!deneme) throw dogrulama(SABLON_DAGITILMADI, 'sablonId');
    ekKalemler = (await sorgular.sablonKalemleri(db, [sablon.id])).map(kalemdenDonmus);
  }
  const kalemler = [...(await sorgular.uygulananKalemler(db, v.projeId)), ...ekKalemler].filter(hazirlikKalemi);
  if (kalemler.length === 0 || v.hedefler.length === 0) return bos;
  const proje = await sorgular.projeGetir(db, v.projeId);
  if (proje === null) return bos;
  const bugun = await sorgular.bugun(db);
  const dayanak = { baslangic: v.tarih.baslangic ?? proje.baslangic, bitis: v.tarih.bitis ?? proje.bitis };
  const plan: HazirlikPlani[] = [];
  const denenen = new Set<string>();
  // 3642: "Bu emirde gerekmez" işaretli (emir, madde) görev doğurmaz; denemede de sayılmaz.
  const gerekmez = new Set((await sorgular.hazirlikGerekmezleri(db, v.hedefler.map((h) => h.emriId))).map((x) => `${String(x.emri_id)}:${x.madde}`));
  for (const k of kalemler) {
    const madde = v.maddeler.get(k.hazirlikMaddesi);
    if (madde === undefined) continue;
    const t = sablonTarihleri({ dayanak: k.dayanak, gun: k.gun, sureGun: k.sureGun }, dayanak, bugun);
    for (const h of v.hedefler) {
      if (gerekmez.has(`${String(h.emriId)}:${k.hazirlikMaddesi}`)) continue;
      // Yazarken işaretle aynı kilitle sıralanır: eşzamanlı işaret varsa o işlemin bitmesi beklenir ve işaret yeniden okunur (Risk N1).
      if (!deneme) {
        await sorgular.hazirlikGerekmezKilitle(db, h.emriId, k.hazirlikMaddesi);
        if ((await sorgular.hazirlikGerekmezleri(db, [h.emriId])).some((x) => x.madde === k.hazirlikMaddesi)) continue;
      }
      const yerler = await acilacakYerler(db, h, madde, k.hazirlikMaddesi, (k.adimlar?.length ?? 0) > 0, k);
      for (const y of yerler) {
        const anahtar = `${String(h.emriId)}:${String(y.isEmriId ?? 0)}:${k.hazirlikMaddesi}`;
        const acilir = deneme
          ? !denenen.has(anahtar)
          : await gorevVeAdimlar(db, k.adimlar ?? [], y.adimlar, await kisitKorumali(HAZIRLIK_KISITLARI, () => sorgular.hazirlikGoreviEkle(db, v.projeId, {
            kilometreTasiId: null, ad: `${k.ad} · ${y.ek}`.slice(0, 200).trimEnd(), aciklama: k.aciklama, sorumluKisiId: k.yapanKisiId,
            planBaslangic: t.planBaslangic, planBitis: t.planBitis, oncekiGorevId: null, asama: k.asama ?? madde.ad, yapanRolId: k.yapanRolId,
            kontrolKisiId: k.kontrolKisiId, kontrolRolId: k.kontrolRolId, yedekKontrolKisiId: k.yedekKontrolKisiId, yedekKontrolRolId: k.yedekKontrolRolId,
            hazirlikMaddesi: k.hazirlikMaddesi, emriId: h.emriId, isEmriId: y.isEmriId, kanitZorunlu: k.kanitZorunlu ?? false,
          }, kisiId)));
        denenen.add(anahtar);
        if (acilir) plan.push({ madde: k.hazirlikMaddesi, yapanKisiId: k.yapanKisiId, yapanRolId: k.yapanRolId });
      }
    }
  }
  if (!deneme && bildir && plan.length > 0) await atamaBildir(db, v.projeId, plan.map((x) => ({ sorumluKisiId: x.yapanKisiId, yapanRolId: x.yapanRolId })), kisiId);
  return { eklenen: deneme ? 0 : plan.length, plan };
}

export interface HazirlikGorevi {
  id: number; projeId: number; ad: string; durum: string; madde: string; emriId: number; isEmriId: number | null;
  sorumluKisiId: number | null; yapanRolId: number | null; kontrolKisiId: number | null; kontrolRolId: number | null;
  planBitis: string; ilerleme: number; onaylandi: boolean; surum: number; gecikmeGun: number | null; kademe: number | null;
  // 3611: yeni biçimde iş emirleri görevin adımıdır (isEmriId null); eski biçimde boş.
  adimlar: { isEmriId: number; yapildi: boolean }[];
}
const gorev = (x: HazirlikGoreviSatiri): HazirlikGorevi => ({
  id: x.id, projeId: x.proje_id, ad: x.ad, durum: x.durum, madde: x.hazirlik_maddesi, emriId: x.hazirlik_emri_id, isEmriId: x.hazirlik_is_emri_id,
  sorumluKisiId: x.sorumlu_kisi_id, yapanRolId: x.yapan_rol_id, kontrolKisiId: x.kontrol_kisi_id, kontrolRolId: x.kontrol_rol_id,
  planBitis: x.plan_bitis, ilerleme: x.ilerleme, onaylandi: x.onaylandi, surum: x.surum, gecikmeGun: x.gecikme_gun, kademe: x.kademe, adimlar: [],
});
async function adimlariylaOku(db: Db, satirlar: HazirlikGoreviSatiri[]): Promise<HazirlikGorevi[]> {
  const adimlar = await sorgular.hazirlikAdimlari(db, satirlar.map((x) => x.id));
  return satirlar.map((x) => ({ ...gorev(x), adimlar: adimlar.filter((a) => a.gorev_id === x.id).map((a) => ({ isEmriId: a.is_emri_id, yapildi: a.yapildi })) }));
}
export async function hazirlikGorevleri(db: Db, emirIdleri: readonly number[]): Promise<HazirlikGorevi[]> {
  return adimlariylaOku(db, await sorgular.hazirlikGorevleri(db, emirIdleri));
}
export async function projeninHazirlikGorevleri(db: Db, projeId: number): Promise<HazirlikGorevi[]> {
  return adimlariylaOku(db, await sorgular.projeninHazirlikGorevleri(db, projeId));
}

// Etkin şablonlar ve her birinin hazırlık kalemlerinin maddeleri (emir penceresi kaç görev doğacağını hesaplar).
export interface HazirlikSablonKalemi extends KalemSuzgeci { madde: string }
export async function hazirlikSablonlari(db: Db): Promise<{ id: number; ad: string; varsayilan: boolean; kalemler: HazirlikSablonKalemi[] }[]> {
  const satirlar = await sorgular.sablonlar(db, true);
  const kalemler = await sorgular.sablonKalemleri(db, satirlar.map((x) => x.id));
  return satirlar.map((x) => ({
    id: x.id, ad: x.ad, varsayilan: x.varsayilan,
    kalemler: kalemler.flatMap((k) => (k.sablon_id === x.id && k.hazirlik_maddesi !== null
      ? [{ madde: k.hazirlik_maddesi, emirTurleri: k.emir_turleri, operasyonTipleri: k.operasyon_tipleri }] : [])),
  }));
}

const HAZIRLIK_GOREVI_YOK = 'Hazırlık görevi bulunamadı.';
export async function hazirlikGoreviAta(db: Db, kullanici: Kullanici, gorevId: number, g: HazirlikAtaGovdesi): Promise<{ id: number; surum: number }> {
  const mevcut = await sorgular.hazirlikGoreviDurumu(db, gorevId);
  if (mevcut === null || mevcut.hazirlik_maddesi === null) throw bulunamadi(HAZIRLIK_GOREVI_YOK);
  await projeKilitle(db, mevcut.proje_id, true);
  if (!['yapilacak', 'suruyor', 'bekliyor'].includes(mevcut.durum)) throw dogrulama('Kontrolde, bitmiş ya da iptal görev yeniden atanmaz.');
  const atama = { sorumluKisiId: g.sorumluKisiId ?? null, yapanRolId: g.yapanRolId ?? null };
  const s = await kisitKorumali(HAZIRLIK_KISITLARI, () => sorgular.hazirlikGoreviAta(db, gorevId, atama, g.surum, kullanici.id));
  if (s === null) throw eskiSurum();
  await atamaBildir(db, s.proje_id, [atama], kullanici.id, gorevId);
  return { id: s.id, surum: s.surum };
}

// 3611 Risk K3: emre sonradan iş emri eklenince yeni biçimli açık görev (yapılacak, sürüyor, bekliyor) onu adım olarak alır. Görev kontrolde ya da
// bitmişse, ya da adım sınırı dolmuşsa o iş emri için eski biçim tek görev açılır (aynı kalemin alanlarıyla). Bildirim gitmez: görev atandığı kişiye
// zaten düşmüştü. Dönen sayı adım olarak eklenen ve eski biçimde açılan görevlerin toplamıdır.
const ACIK_DURUMLAR = new Set(['yapilacak', 'suruyor', 'bekliyor']);
export async function hazirlikIsEmriEklendi(
  db: Db, kisiId: number, v: { emriId: number; emirNo: string; isEmriId: number; opNo: number; operasyonTipiId?: number | undefined },
): Promise<number> {
  const ad = `${v.emirNo} / ${String(v.opNo)}`;
  let islenen = 0;
  const gorevler = await sorgular.yeniBicimGorevleri(db, v.emriId);
  const donmus = new Map<number, DonmusKalem[]>();
  for (const g of gorevler) {
    // 3611-1: kalemin operasyon süzgeci iş emrinin tipini içermiyorsa görev o iş emrini adım ya da yeni görev olarak almaz.
    if (!donmus.has(g.proje_id)) donmus.set(g.proje_id, (await sorgular.uygulananKalemler(db, g.proje_id)).filter(hazirlikKalemi));
    const kalem = donmus.get(g.proje_id)?.find((k) => k.hazirlikMaddesi === g.hazirlik_maddesi);
    if (!operasyonTipiUyar(kalem, v.operasyonTipiId)) continue;
    if (ACIK_DURUMLAR.has(g.durum) && g.adim_toplam < ADIM_EN_COK) {
      if (!(await sorgular.hazirlikAdimiEkle(db, g.id, v.isEmriId, ad))) continue;
      await sorgular.ilerlemeYaz(db, g.id, adimIlerlemesi(g.adim_toplam + 1, g.adim_yapilan, g.ilerleme), kisiId);
      islenen += 1;
      continue;
    }
    const sonek = ` · ${v.emirNo}`;
    const kalemAdi = g.ad.endsWith(sonek) ? g.ad.slice(0, -sonek.length) : g.ad;
    const yeni = await sorgular.hazirlikGoreviEkle(db, g.proje_id, {
      kilometreTasiId: null, ad: `${kalemAdi} · ${ad}`.slice(0, 200).trimEnd(), aciklama: g.aciklama, sorumluKisiId: g.sorumlu_kisi_id,
      planBaslangic: g.plan_baslangic, planBitis: g.plan_bitis, oncekiGorevId: null, asama: g.asama, yapanRolId: g.yapan_rol_id,
      kontrolKisiId: g.kontrol_kisi_id, kontrolRolId: g.kontrol_rol_id, yedekKontrolKisiId: g.yedek_kontrol_kisi_id, yedekKontrolRolId: g.yedek_kontrol_rol_id,
      hazirlikMaddesi: g.hazirlik_maddesi, emriId: v.emriId, isEmriId: v.isEmriId, kanitZorunlu: g.kanit_zorunlu,
    }, kisiId);
    if (yeni !== null) islenen += 1;
  }
  return islenen;
}
