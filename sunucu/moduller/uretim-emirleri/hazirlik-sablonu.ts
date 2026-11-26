import type { Db } from '#cekirdek/db.ts';
import { cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { OpSablonFarki, OpSablonFarkiGovdesi, OpSablonFarkiKaldirGovdesi, HazirlikSablonuOzelCevabi, HazirlikSablonuOzelYazGovdesi, HazirlikSablonuCevabi, HazirlikSablonuYazCevabi, HazirlikSablonuYazGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { operasyonTipleri } from '../istasyonlar/disari.ts';
import { kisiAdlari, rolSecenekleri } from '../kisiler/disari.ts';
import { ADIM_KAPALI_EMIR, EMIR_YOK, IS_EMRI_EMIRDE_YOK, LISTE_ADIM_BITTI } from './kurallar.ts';
import { durduranMaddeKodlari, hazirlikMaddeTanimlari } from './hazirlik-maddeleri.ts';
import {
  OP_FARKI_YOK, OZEL_DURDURAN, SABLON_DEGISIKLIK_YOK, SABLON_DURDURAN_GEREKCE, SABLON_DURDURAN_YETKI, SABLON_DEGISTI, SABLON_MADDE_KAPALI, SABLON_TIP_YOK, durduranKapatmaIhlali, gecerliKapaliMaddeler, sablonIhlali, sablonKanonik, turTipi,
} from './hazirlik-sablonu-kurallari.ts';
import * as s from './sorgular.ts';

// 3688: hazırlık şablonu operasyon türüne göre Üretim Emirleri'ndedir. Yazma yetkisi bugünkü şablon işlemidir (karar: yeni işlem açılmaz).
// Faz 1: rol ve gün yalnız saklanır; Görevleri dağıt Projeler kalemlerini kullanmaya devam eder.
export const SABLON_YAZMA_YETKISI = 'projeler.sablon-yaz' as const;
export const sablonYazarMi = (k: Kullanici | null): boolean => k !== null && islemVarMi(k, SABLON_YAZMA_YETKISI);
// 3740: durduran maddeyi şablonda kapatmak müdürün işidir (264 a ile aynı işlem); sunucu kendisi denetler, istemci yalnız bu bayrağı görür.
export const DURDURAN_KAPATMA_YETKISI = 'uretim-emirleri.hazirlik-muaf' as const;
export const durduranKapatabilirMi = (k: Kullanici | null): boolean => k !== null && islemVarMi(k, DURDURAN_KAPATMA_YETKISI);

export async function hazirlikSablonu(db: Db, kullanici: Kullanici | null): Promise<HazirlikSablonuCevabi> {
  const surumler = await s.etkinSurumler(db);
  const satirlar = await s.surumSatirlari(db, surumler.map((x) => x.id));
  const roller = new Map((await rolSecenekleri(db)).map((r) => [r.id, r.ad]));
  const adlar = await kisiAdlari(db, [...new Set(surumler.map((x) => x.kisi_id))]);
  const tipler = await operasyonTipleri(db);
  const tur = (tipId: number | null, ad: string): HazirlikSablonuCevabi['turler'][number] => {
    const v = surumler.find((x) => x.operasyon_tipi_id === tipId);
    return {
      operasyonTipiId: tipId, ad, surum: v?.surum ?? null, kisiAdi: v === undefined ? null : adlar.get(v.kisi_id) ?? null, an: v?.an ?? null, gerekce: v?.gerekce ?? null,
      satirlar: v === undefined ? [] : satirlar.filter((x) => x.surum_id === v.id).map((x) => ({
        madde: x.madde, gerekli: x.gerekli, rolId: x.rol_id, gun: x.gun, rolAdi: x.rol_id === null ? null : roller.get(x.rol_id) ?? null,
      })),
    };
  };
  return { turler: [tur(null, 'Varsayılan (türü olmayan adım)'), ...tipler.map((t) => tur(t.id, t.ad))], yazar: sablonYazarMi(kullanici), durduranAcabilir: durduranKapatabilirMi(kullanici) };
}

export async function hazirlikSablonuYaz(db: Db, kullanici: Kullanici, tur: string, g: HazirlikSablonuYazGovdesi): Promise<HazirlikSablonuYazCevabi> {
  const tipId = turTipi(tur);
  if (tipId !== null && !(await operasyonTipleri(db, { pasiflerDahil: true })).some((t) => t.id === tipId)) throw dogrulama(SABLON_TIP_YOK, 'tur');
  const acik = new Set((await hazirlikMaddeTanimlari(db)).filter((m) => m.acik).map((m) => m.kod));
  const roller = new Set((await rolSecenekleri(db)).map((r) => r.id));
  const ihlal = sablonIhlali(g.satirlar, acik, roller);
  if (ihlal !== null) throw dogrulama(ihlal, 'satirlar');
  await s.turuKilitle(db, tipId);
  const son = await s.sonSurum(db, tipId);
  if (son !== g.beklenenSurum) throw cakisma(SABLON_DEGISTI);
  const eskiSurum = son === null ? undefined : (await s.etkinSurumler(db)).find((x) => x.operasyon_tipi_id === tipId);
  const eski = eskiSurum === undefined ? [] : await s.surumSatirlari(db, [eskiSurum.id]);
  const onceki = eski.map((x) => ({ madde: x.madde, gerekli: x.gerekli, rolId: x.rol_id, gun: x.gun }));
  // 3740: durduran madde varsayılan gerekli ve kilitlidir; yalnız müdür gerekçeyle kapatır (yetkiyi istemciye bırakmadan burada denetleriz).
  const durduranIhlali = durduranKapatmaIhlali({
    yeni: g.satirlar, onceki, durduran: await durduranMaddeKodlari(db), mudurMu: durduranKapatabilirMi(kullanici), gerekce: g.gerekce,
  });
  if (durduranIhlali === SABLON_DURDURAN_YETKI) throw yetkiYok(durduranIhlali);
  if (durduranIhlali === SABLON_DURDURAN_GEREKCE) throw dogrulama(durduranIhlali, 'gerekce');
  if (son !== null && sablonKanonik(onceki) === sablonKanonik(g.satirlar)) throw cakisma(SABLON_DEGISIKLIK_YOK);
  const surum = (son ?? 0) + 1;
  const id = await s.surumEkle(db, tipId, surum, kullanici.id, g.gerekce);
  for (const x of g.satirlar) await s.satirEkle(db, id, x);
  return { surum };
}

// Adım matrisi: tür şablonu "gerekli değil" dediği maddeler o adımda gerekmez sayılır (tür şablonu yoksa varsayılan şablon geçerli).
export async function sablonGerekmezMaddeleri(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, ReadonlySet<string>>> {
  const sonuc = new Map<number, ReadonlySet<string>>();
  if (isEmriIdleri.length === 0) return sonuc;
  // Etkin şablon sürümü olmasa da emir ve OP farkları geçerlidir (sürüm yoksa şablondan kapalı madde yok).
  const surumler = await s.etkinSurumler(db);
  const satirlar = await s.surumSatirlari(db, surumler.map((x) => x.id));
  const kapali = (surumId: string | undefined): ReadonlySet<string> => new Set(satirlar.filter((x) => x.surum_id === surumId && !x.gerekli).map((x) => x.madde));
  const varsayilan = kapali(surumler.find((x) => x.operasyon_tipi_id === null)?.id);
  const adimlar = await s.isEmirleriBul(db, isEmriIdleri);
  const farklar = await s.ozelFarklar(db, [...new Set(adimlar.map((i) => i.uretimEmriId))]);
  const durduran = await durduranMaddeKodlari(db);
  for (const i of adimlar) {
    const tur = surumler.find((x) => x.operasyon_tipi_id === i.operasyonTipiId);
    // 3740: şablonda müdürün gerekçeyle kapattığı durduran madde o türde gerekmez sayılır (kapıya da yansır); emre özel fark durduranı yine kapatamaz.
    // Emre özel fark şablonu, OP farkı ikisini geçer; durduran madde emirde ve OP'de kapatılamaz (3642 ile aynı kural, 3741).
    const m = gecerliKapaliMaddeler(
      tur === undefined ? varsayilan : kapali(tur.id),
      farklar.filter((x) => x.emri_id === i.uretimEmriId && x.is_emri_id === null),
      farklar.filter((x) => x.is_emri_id === i.id),
      durduran,
    );
    sonuc.set(i.id, m);
  }
  return sonuc;
}

// Emre özel fark: yazma yetkisi tür şablonuyla aynıdır (SABLON_YAZMA_YETKISI); yeni işlem yok.
async function ozelEmirMadde(db: Db, emirId: number, madde: string, kapatiyor: boolean): Promise<void> {
  if ((await s.ustEmirBul(db, emirId, true)) === null) throw bulunamadi('Üretim emri bulunamadı.');
  const tanim = (await hazirlikMaddeTanimlari(db)).find((m) => m.kod === madde);
  if (tanim === undefined || !(tanim.acik || tanim.durduran)) throw dogrulama(SABLON_MADDE_KAPALI, 'madde');
  if (kapatiyor && (await durduranMaddeKodlari(db)).has(madde)) throw dogrulama(OZEL_DURDURAN, 'madde');
}
export async function hazirlikSablonuOzel(db: Db, emirId: number): Promise<HazirlikSablonuOzelCevabi> {
  const f = (await s.ozelFarklar(db, [emirId])).filter((x) => x.is_emri_id === null);
  const adlar = await kisiAdlari(db, [...new Set(f.map((x) => x.kisi_id))]);
  return { farklar: f.map((x) => ({ madde: x.madde, gerekli: x.gerekli, kisiAdi: adlar.get(x.kisi_id) ?? null, an: x.an, gerekce: x.gerekce })) };
}
export async function hazirlikSablonuOzelYaz(db: Db, kullanici: Kullanici, emirId: number, madde: string, g: HazirlikSablonuOzelYazGovdesi): Promise<HazirlikSablonuOzelCevabi> {
  await ozelEmirMadde(db, emirId, madde, !g.gerekli);
  await s.ozelEkle(db, emirId, null, madde, 'yaz', kullanici.id, g.gerekli, g.gerekce);
  return hazirlikSablonuOzel(db, emirId);
}
export async function hazirlikSablonuOzelSil(db: Db, kullanici: Kullanici, emirId: number, madde: string): Promise<HazirlikSablonuOzelCevabi> {
  await ozelEmirMadde(db, emirId, madde, false);
  await s.ozelEkle(db, emirId, null, madde, 'sil', kullanici.id, null, null);
  return hazirlikSablonuOzel(db, emirId);
}

// 3741: operasyona (iş emrine) özel fark. Yazma yetkisi emre özel farkla aynıdır (SABLON_YAZMA_YETKISI); iz: kim, ne zaman, gerekçe.
// Yalnız o emrin o OP'sine yazılır; tür şablonu ve emir düzeyi fark değişmez. Kilit sırası emir, iş emri (Adım Durumu yazmalarıyla aynı).
async function opMaddeHazirla(db: Db, emirId: number, isEmriId: number, madde: string, kapatiyor: boolean): Promise<void> {
  const e = await s.ustEmirBul(db, emirId, true);
  if (e === null) throw bulunamadi(EMIR_YOK);
  if (e.durum === 'bitti' || e.durum === 'iptal') throw cakisma(ADIM_KAPALI_EMIR);
  if (!(await s.isEmriKilitle(db, isEmriId, emirId))) throw bulunamadi(IS_EMRI_EMIRDE_YOK);
  if ((await s.isEmirleriBul(db, [isEmriId]))[0]?.durum === 'tamam') throw cakisma(LISTE_ADIM_BITTI);
  await ozelEmirMadde(db, emirId, madde, kapatiyor);
}
export async function opSablonFarkiYaz(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: OpSablonFarkiGovdesi): Promise<void> {
  await opMaddeHazirla(db, emirId, isEmriId, g.madde, !g.gerekli);
  await s.ozelEkle(db, emirId, isEmriId, g.madde, 'yaz', kullanici.id, g.gerekli, g.gerekce);
}
// "Şablona dön": OP farkını kaldırır; farkı olmayan maddede yazılmaz.
export async function opSablonFarkiKaldir(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: OpSablonFarkiKaldirGovdesi): Promise<void> {
  await opMaddeHazirla(db, emirId, isEmriId, g.madde, false);
  const varMi = (await s.ozelFarklar(db, [emirId])).some((x) => x.is_emri_id === isEmriId && x.madde === g.madde);
  if (!varMi) throw bulunamadi(OP_FARKI_YOK);
  await s.ozelEkle(db, emirId, isEmriId, g.madde, 'sil', kullanici.id, null, null);
}
// Emrin bütün OP farkları, iş emri kimliğine göre (Adım Durumu okuması).
export async function opSablonFarklari(db: Db, emirId: number): Promise<Map<number, OpSablonFarki[]>> {
  const f = (await s.ozelFarklar(db, [emirId])).filter((x): x is typeof x & { is_emri_id: number } => x.is_emri_id !== null);
  const adlar = await kisiAdlari(db, [...new Set(f.map((x) => x.kisi_id))]);
  const sonuc = new Map<number, OpSablonFarki[]>();
  for (const x of f) sonuc.set(x.is_emri_id, [...(sonuc.get(x.is_emri_id) ?? []), { madde: x.madde, gerekli: x.gerekli, kisiAdi: adlar.get(x.kisi_id) ?? null, an: x.an, gerekce: x.gerekce }]);
  return sonuc;
}
