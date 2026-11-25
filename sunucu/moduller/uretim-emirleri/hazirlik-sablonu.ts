import type { Db } from '#cekirdek/db.ts';
import { cakisma, dogrulama } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { HazirlikSablonuOzelCevabi, HazirlikSablonuOzelYazGovdesi, HazirlikSablonuCevabi, HazirlikSablonuYazCevabi, HazirlikSablonuYazGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { operasyonTipleri } from '../istasyonlar/disari.ts';
import { kisiAdlari, rolSecenekleri } from '../kisiler/disari.ts';
import { durduranMaddeKodlari, hazirlikMaddeTanimlari } from './hazirlik-maddeleri.ts';
import {
  OZEL_DURDURAN, SABLON_DEGISIKLIK_YOK, SABLON_DURDURAN, SABLON_DEGISTI, SABLON_MADDE_KAPALI, SABLON_TIP_YOK, sablonIhlali, sablonKanonik, turTipi,
} from './hazirlik-sablonu-kurallari.ts';
import * as s from './sorgular.ts';

// 3688: hazırlık şablonu operasyon türüne göre Üretim Emirleri'ndedir. Yazma yetkisi bugünkü şablon işlemidir (karar: yeni işlem açılmaz).
// Faz 1: rol ve gün yalnız saklanır; Görevleri dağıt Projeler kalemlerini kullanmaya devam eder.
export const SABLON_YAZMA_YETKISI = 'projeler.sablon-yaz' as const;
export const sablonYazarMi = (k: Kullanici | null): boolean => k !== null && islemVarMi(k, SABLON_YAZMA_YETKISI);

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
  return { turler: [tur(null, 'Varsayılan (türü olmayan adım)'), ...tipler.map((t) => tur(t.id, t.ad))], yazar: sablonYazarMi(kullanici) };
}

export async function hazirlikSablonuYaz(db: Db, kullanici: Kullanici, tur: string, g: HazirlikSablonuYazGovdesi): Promise<HazirlikSablonuYazCevabi> {
  const tipId = turTipi(tur);
  if (tipId !== null && !(await operasyonTipleri(db, { pasiflerDahil: true })).some((t) => t.id === tipId)) throw dogrulama(SABLON_TIP_YOK, 'tur');
  const acik = new Set((await hazirlikMaddeTanimlari(db)).filter((m) => m.acik).map((m) => m.kod));
  const roller = new Set((await rolSecenekleri(db)).map((r) => r.id));
  const ihlal = sablonIhlali(g.satirlar, acik, roller);
  if (ihlal !== null) throw dogrulama(ihlal, 'satirlar');
  // Başlatma kapısı şablondan bağımsızdır: durduran madde şablonda da kapatılamaz (emre özel kuralın aynısı).
  const durduran = await durduranMaddeKodlari(db);
  if (g.satirlar.some((x) => !x.gerekli && durduran.has(x.madde))) throw dogrulama(SABLON_DURDURAN, 'satirlar');
  await s.turuKilitle(db, tipId);
  const son = await s.sonSurum(db, tipId);
  if (son !== g.beklenenSurum) throw cakisma(SABLON_DEGISTI);
  if (son !== null) {
    const eskiSurum = (await s.etkinSurumler(db)).find((x) => x.operasyon_tipi_id === tipId);
    const eski = eskiSurum === undefined ? [] : await s.surumSatirlari(db, [eskiSurum.id]);
    if (sablonKanonik(eski.map((x) => ({ madde: x.madde, gerekli: x.gerekli, rolId: x.rol_id, gun: x.gun }))) === sablonKanonik(g.satirlar)) throw cakisma(SABLON_DEGISIKLIK_YOK);
  }
  const surum = (son ?? 0) + 1;
  const id = await s.surumEkle(db, tipId, surum, kullanici.id, g.gerekce);
  for (const x of g.satirlar) await s.satirEkle(db, id, x);
  return { surum };
}

// Adım matrisi: tür şablonu "gerekli değil" dediği maddeler o adımda gerekmez sayılır (tür şablonu yoksa varsayılan şablon geçerli).
export async function sablonGerekmezMaddeleri(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, ReadonlySet<string>>> {
  const sonuc = new Map<number, ReadonlySet<string>>();
  if (isEmriIdleri.length === 0) return sonuc;
  const surumler = await s.etkinSurumler(db);
  if (surumler.length === 0) return sonuc;
  const satirlar = await s.surumSatirlari(db, surumler.map((x) => x.id));
  const kapali = (surumId: string | undefined): ReadonlySet<string> => new Set(satirlar.filter((x) => x.surum_id === surumId && !x.gerekli).map((x) => x.madde));
  const varsayilan = kapali(surumler.find((x) => x.operasyon_tipi_id === null)?.id);
  const adimlar = await s.isEmirleriBul(db, isEmriIdleri);
  const farklar = await s.ozelFarklar(db, [...new Set(adimlar.map((i) => i.uretimEmriId))]);
  const durduran = await durduranMaddeKodlari(db);
  for (const i of adimlar) {
    const tur = surumler.find((x) => x.operasyon_tipi_id === i.operasyonTipiId);
    const m = new Set([...(tur === undefined ? varsayilan : kapali(tur.id))].filter((x) => !durduran.has(x)));
    // Emre özel fark şablonu geçer; durduran madde emre özel kapatılamaz (3642 ile aynı kural).
    for (const f of farklar.filter((x) => x.emri_id === i.uretimEmriId)) {
      if (f.gerekli) m.delete(f.madde); else if (!durduran.has(f.madde)) m.add(f.madde);
    }
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
  const f = await s.ozelFarklar(db, [emirId]);
  const adlar = await kisiAdlari(db, [...new Set(f.map((x) => x.kisi_id))]);
  return { farklar: f.map((x) => ({ madde: x.madde, gerekli: x.gerekli, kisiAdi: adlar.get(x.kisi_id) ?? null, an: x.an, gerekce: x.gerekce })) };
}
export async function hazirlikSablonuOzelYaz(db: Db, kullanici: Kullanici, emirId: number, madde: string, g: HazirlikSablonuOzelYazGovdesi): Promise<HazirlikSablonuOzelCevabi> {
  await ozelEmirMadde(db, emirId, madde, !g.gerekli);
  await s.ozelEkle(db, emirId, madde, 'yaz', kullanici.id, g.gerekli, g.gerekce);
  return hazirlikSablonuOzel(db, emirId);
}
export async function hazirlikSablonuOzelSil(db: Db, kullanici: Kullanici, emirId: number, madde: string): Promise<HazirlikSablonuOzelCevabi> {
  await ozelEmirMadde(db, emirId, madde, false);
  await s.ozelEkle(db, emirId, madde, 'sil', kullanici.id, null, null);
  return hazirlikSablonuOzel(db, emirId);
}
