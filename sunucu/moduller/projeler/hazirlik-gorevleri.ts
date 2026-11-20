import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { HazirlikAtaGovdesi } from '#paylasilan/sozlesme/projeler.ts';
import { sablonTarihleri } from './kurallar.ts';
import { YONETIM_KISITLARI, atamaBildir, projeKilitle, secilenSablon } from './servis.ts';
import * as sorgular from './sorgular.ts';
import type { HazirlikGoreviSatiri } from './sorgular.ts';

// 3396 a: şablonun hazırlık kalemi, projeye bağlı üretim emri için emir ya da iş emri başına bir görev doğurur. Hangi maddenin
// iş emri düzeyinde olduğu ve açık olup olmadığı Üretim Emirleri'nindir; çağıran verir. Kalem projeye uygulanmış (donmuş) şablondan
// okunur: şablon sonradan değişse de proje uygulandığı hâli izler.

export interface HazirlikHedefi { emriId: number; emirNo: string; isEmirleri: readonly { id: number; opNo: number }[] }
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
});

export const SABLON_DAGITILMADI = 'Bu şablon projede dağıtılmadı: önce Projeler > Görevleri dağıt ekranında dağıt.';

// Açılan hazırlık görevine kalemin adımları eklenir; tekil dizine takılıp açılmayan görev (null) atlanır.
async function gorevVeAdimlar(db: Db, adimlar: readonly string[], id: number | null): Promise<boolean> {
  if (id === null) return false;
  await sorgular.adimlariEkle(db, id, adimlar);
  return true;
}

// Denemede hiçbir şey yazılmaz: şablon uygulanmaz, görev açılmaz, bildirim gitmez; yalnız açılacak görevler (var olan hariç) döner.
export async function hazirlikGorevleriAc(
  db: Db, kisiId: number, v: HazirlikGorevleriAcVerisi, deneme = false,
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
  for (const k of kalemler) {
    const madde = v.maddeler.get(k.hazirlikMaddesi);
    if (madde === undefined) continue;
    const t = sablonTarihleri({ dayanak: k.dayanak, gun: k.gun, sureGun: k.sureGun }, dayanak, bugun);
    for (const h of v.hedefler) {
      const yerler = madde.isEmriDuzeyi && h.isEmirleri.length > 0
        ? h.isEmirleri.map((ie) => ({ isEmriId: ie.id, ek: `${h.emirNo} / ${String(ie.opNo)}` }))
        : [{ isEmriId: null, ek: h.emirNo }];
      for (const y of yerler) {
        const anahtar = `${String(h.emriId)}:${String(y.isEmriId ?? 0)}:${k.hazirlikMaddesi}`;
        const acilir = deneme
          ? !denenen.has(anahtar) && !(await sorgular.hazirlikGoreviVarMi(db, h.emriId, y.isEmriId, k.hazirlikMaddesi))
          : await gorevVeAdimlar(db, k.adimlar ?? [], await kisitKorumali(HAZIRLIK_KISITLARI, () => sorgular.hazirlikGoreviEkle(db, v.projeId, {
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
  if (!deneme && plan.length > 0) await atamaBildir(db, v.projeId, plan.map((x) => ({ sorumluKisiId: x.yapanKisiId, yapanRolId: x.yapanRolId })), kisiId);
  return { eklenen: deneme ? 0 : plan.length, plan };
}

export interface HazirlikGorevi {
  id: number; projeId: number; ad: string; durum: string; madde: string; emriId: number; isEmriId: number | null;
  sorumluKisiId: number | null; yapanRolId: number | null; kontrolKisiId: number | null; kontrolRolId: number | null;
  planBitis: string; ilerleme: number; onaylandi: boolean; surum: number; gecikmeGun: number | null; kademe: number | null;
}
const gorev = (x: HazirlikGoreviSatiri): HazirlikGorevi => ({
  id: x.id, projeId: x.proje_id, ad: x.ad, durum: x.durum, madde: x.hazirlik_maddesi, emriId: x.hazirlik_emri_id, isEmriId: x.hazirlik_is_emri_id,
  sorumluKisiId: x.sorumlu_kisi_id, yapanRolId: x.yapan_rol_id, kontrolKisiId: x.kontrol_kisi_id, kontrolRolId: x.kontrol_rol_id,
  planBitis: x.plan_bitis, ilerleme: x.ilerleme, onaylandi: x.onaylandi, surum: x.surum, gecikmeGun: x.gecikme_gun, kademe: x.kademe,
});
export async function hazirlikGorevleri(db: Db, emirIdleri: readonly number[]): Promise<HazirlikGorevi[]> {
  return (await sorgular.hazirlikGorevleri(db, emirIdleri)).map(gorev);
}
export async function projeninHazirlikGorevleri(db: Db, projeId: number): Promise<HazirlikGorevi[]> {
  return (await sorgular.projeninHazirlikGorevleri(db, projeId)).map(gorev);
}

// Etkin şablonlar ve her birinin hazırlık kalemlerinin maddeleri (emir penceresi kaç görev doğacağını hesaplar).
export async function hazirlikSablonlari(db: Db): Promise<{ id: number; ad: string; varsayilan: boolean; maddeler: string[] }[]> {
  const satirlar = await sorgular.sablonlar(db, true);
  const kalemler = await sorgular.sablonKalemleri(db, satirlar.map((x) => x.id));
  return satirlar.map((x) => ({
    id: x.id, ad: x.ad, varsayilan: x.varsayilan,
    maddeler: kalemler.flatMap((k) => (k.sablon_id === x.id && k.hazirlik_maddesi !== null ? [k.hazirlik_maddesi] : [])),
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
  await atamaBildir(db, s.proje_id, [atama], kullanici.id);
  return { id: s.id, surum: s.surum };
}
