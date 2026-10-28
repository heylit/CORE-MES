import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, eskiSurum } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { DIS_KAPANIS_MADDELERI, KAPANIS_MADDELERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  DisKapanisMaddesi, KapanisCevabi, KapanisGeriAcGovdesi, KapanisListeSatiri, KapanislarSorgusu, KapanisMaddeBilgisi, KapanisMaddesi,
  KapanisMuafGovdesi, KapanisOlayi, KapanisOnayGovdesi, KapanisOnayi, KapanisRetGovdesi, KapanisSonucu,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { emirBittiBildir, emirBittiDinle } from './emir-olaylari.ts';
import { hataliDurdu } from './hatali-parca.ts';
import { bekleyeniSil } from './is-emri-servis.ts';
import {
  EMIR_YOK, KAPANIS_YOK, KAPAT_DURMADI, gerekmeyenKapanisMaddeleri, kapanisAcikIhlali, kapanisAsamasi, kapanisGeriAcIhlali, kapanisMaddeHali,
  kapanisMuafIhlali, kapanisOnayIhlali, kapanisSonucu,
} from './kurallar.ts';
import { kararSayaclari } from './servis.ts';
import * as s from './sorgular.ts';
import type { KapanisEmirSatiri } from './sorgular.ts';

// Onaylı kapanış (1072 a, 1073 a): emir son adımda biter, kapanış onun üstünde ayrı kayıttır. Dış maddelerin sahipleri (Kalite Merkezi,
// Stok, Sevkiyat, Satın Alma) bu modülü okuduğu için çözücüler kablolama.ts'te kaydedilir (hazırlık kalıbı); kayıtsız ya da null dönen madde 'bilinmiyor'.
export type KapanisCozucusu = (db: Db, uretimEmriId: number) => Promise<KapanisMaddeBilgisi | null>;
const cozuculer = new Map<DisKapanisMaddesi, KapanisCozucusu>();
// Önceki çözücüyü döner: test kendi çözücüsünü koyup sonra geri yükler.
export function kapanisCozucusuKaydet(madde: DisKapanisMaddesi, cozucu: KapanisCozucusu | null): KapanisCozucusu | null {
  const onceki = cozuculer.get(madde) ?? null;
  if (cozucu) cozuculer.set(madde, cozucu); else cozuculer.delete(madde);
  return onceki;
}

// Emir bittiği işlemde kapanış açılır. İş emirsiz (istasyonlu) eski emir kapanışa girmez.
emirBittiDinle(async (db, olay) => {
  const e = await s.ustEmirBul(db, olay.uretimEmriId);
  if (e !== null && e.malzemeNo !== null) await s.kapanisAc(db, olay.uretimEmriId);
});

type Madde = KapanisCevabi['maddeler'][number];

// Kendi maddeleri: bütün iş emirleri ve parti kolları bitti, karar bekleyen parça yok, kararsız hatalı kaydı yok.
async function kendiMaddeleri(db: Db, id: number): Promise<Map<KapanisMaddesi, KapanisMaddeBilgisi>> {
  const adimlar = await s.isEmirleriGetir(db, [id]);
  const bitmemis = adimlar.filter((a) => a.durum !== 'tamam').length;
  const kol = await s.acikKolSayisi(db, id);
  const bekleyen = (await kararSayaclari(db, [id])).get(id)?.kararBekliyor ?? 0;
  const hatali = (await s.hataliKayitlariGetir(db, { acik: true, emirId: id })).length;
  const eksikse = (n: number, metin: string): KapanisMaddeBilgisi => (n > 0 ? { durum: 'eksik', ayrinti: metin } : { durum: 'tamam', ayrinti: null });
  return new Map<KapanisMaddesi, KapanisMaddeBilgisi>([
    ['is-emirleri', bitmemis + kol > 0
      ? { durum: 'eksik', ayrinti: [bitmemis > 0 ? `${String(bitmemis)} adım bitmedi` : null, kol > 0 ? `${String(kol)} parti kolu açık` : null].filter(Boolean).join(', ') }
      : { durum: 'tamam', ayrinti: `${String(adimlar.length)} / ${String(adimlar.length)} adım tamam` }],
    ['ilk-parca', eksikse(bekleyen, `${String(bekleyen)} parça kalite kararı bekliyor`)],
    ['hatali', eksikse(hatali, `${String(hatali)} hatalı parça kaydı kararsız`)],
  ]);
}

async function maddeler(db: Db, e: KapanisEmirSatiri): Promise<Madde[]> {
  const muaf = new Set((await s.kapanisMuafiyetleri(db, e.uretimEmriId, e.tur)).map((m) => m.madde));
  const adimlar = await s.isEmirleriGetir(db, [e.uretimEmriId]);
  const gerekmez = gerekmeyenKapanisMaddeleri({ saglamAdet: e.saglamAdet, emirTuru: e.emirTuru, fasonVar: adimlar.some((a) => a.fasonFirmaId !== null) });
  const bilgiler = await kendiMaddeleri(db, e.uretimEmriId);
  for (const m of DIS_KAPANIS_MADDELERI) {
    const c = cozuculer.get(m);
    const b = c && !gerekmez.has(m) ? await c(db, e.uretimEmriId) : null;
    if (b !== null) bilgiler.set(m, b);
  }
  return KAPANIS_MADDELERI.map((madde) => {
    if (gerekmez.has(madde)) return { madde, durum: 'gerekmez', ayrinti: null };
    const b = bilgiler.get(madde);
    return { madde, durum: kapanisMaddeHali(b, muaf.has(madde)), ayrinti: b?.ayrinti ?? null };
  });
}

const eksikSayisi = (l: readonly Madde[]): number => l.filter((m) => m.durum === 'eksik').length;

export async function kapanis(db: Db, id: number): Promise<KapanisCevabi> {
  const e = await s.kapanisEmriBul(db, id);
  if (e === null) throw bulunamadi(KAPANIS_YOK);
  const l = e.eski && e.durum === 'tamam' ? [] : await maddeler(db, e);
  const muaf = await s.kapanisMuafiyetleri(db, id, e.tur);
  const defter = await s.kapanisDefteri(db, id);
  const adlar = await kisiAdlari(db, [...new Set([e.kaliteKisiId, e.mudurKisiId, ...muaf.map((m) => m.kisiId), ...defter.map((d) => d.kisiId)]
    .filter((k): k is number => k !== null))]);
  const kz = (kisiId: number | null, zaman: string | null) => (kisiId === null || zaman === null ? null : { kisiId, kisiAdi: adlar.get(kisiId) ?? null, zaman });
  return {
    uretimEmriId: e.uretimEmriId, emirNo: e.emirNo, urun: { kod: e.parcaNo, ad: e.parcaAd }, emirTuru: e.emirTuru, adet: e.adet,
    saglamAdet: e.saglamAdet, bitis: e.bitis, asama: kapanisAsamasi(e.durum, l), sonuc: kapanisSonucu(e.durum, e.saglamAdet), eski: e.eski,
    maddeler: l,
    onaylar: { kalite: kz(e.kaliteKisiId, e.kaliteZamani), mudur: kz(e.mudurKisiId, e.mudurZamani) },
    muafiyetler: muaf.map((m) => ({ madde: m.madde as KapanisMaddesi, gerekce: m.gerekce, kisiId: m.kisiId, kisiAdi: adlar.get(m.kisiId) ?? null, zaman: m.zaman })),
    defter: defter.map((d) => ({
      olay: d.olay as KapanisOlayi, gerekce: d.gerekce, madde: d.madde as KapanisMaddesi | null, kisiId: d.kisiId, kisiAdi: adlar.get(d.kisiId) ?? null, zaman: d.zaman,
    })),
    surum: e.surum,
  };
}

function listeSatiri(e: KapanisEmirSatiri, l: readonly Madde[]): KapanisListeSatiri {
  const asama = kapanisAsamasi(e.durum, l);
  const bekleyen: KapanisOnayi[] = asama !== 'onay' ? [] : [...(e.kaliteKisiId === null ? ['kalite' as const] : []), ...(e.mudurKisiId === null ? ['mudur' as const] : [])];
  return {
    uretimEmriId: e.uretimEmriId, emirNo: e.emirNo, urun: { kod: e.parcaNo, ad: e.parcaAd }, adet: e.adet, saglamAdet: e.saglamAdet, bitis: e.bitis,
    asama, sonuc: kapanisSonucu(e.durum, e.saglamAdet), bekleyenOnaylar: bekleyen, eksikMadde: eksikSayisi(l),
  };
}

// Açık kapanışın aşaması maddelerden hesaplanır; bu yüzden açıklar bellekte süzülüp sayfalanır (VARSAYIM: açık kapanış sayısı yüzlerle sınırlı).
export async function kapanislar(db: Db, q: KapanislarSorgusu): Promise<SayfaliListe<KapanisListeSatiri>> {
  const ara = q.ara ?? null;
  if (q.asama === 'tamam') {
    return sayfaliListe(q, { say: () => s.tamamKapanisSay(db, ara), satirlar: async (d) => (await s.tamamKapanislar(db, ara, d)).map((e) => listeSatiri(e, [])) });
  }
  const satirlar: KapanisListeSatiri[] = [];
  for (const e of await s.acikKapanislar(db, ara)) {
    const r = listeSatiri(e, await maddeler(db, e));
    if (q.asama === undefined || r.asama === q.asama) satirlar.push(r);
  }
  return sayfaliListe(q, { say: () => Promise.resolve(satirlar.length), satirlar: (d) => Promise.resolve(satirlar.slice(d.atla, d.atla + d.sinir)) });
}

async function kilitli(db: Db, id: number, surum: number): Promise<KapanisEmirSatiri> {
  const k = await s.kapanisBul(db, id, true);
  if (k === null) throw bulunamadi(KAPANIS_YOK);
  if (k.surum !== surum) throw eskiSurum();
  const e = await s.kapanisEmriBul(db, id);
  if (e === null) throw bulunamadi(KAPANIS_YOK);
  return e;
}

const defter = (db: Db, id: number, olay: KapanisOlayi, kisiId: number, gerekce: string | null = null, madde: KapanisMaddesi | null = null) =>
  s.kapanisDefterineYaz(db, { id, olay, kisiId, gerekce, madde });

// UE-KP4: onay sırasızdır; ikinci onay kapanışı tamamlar ve emri kilitler (1080 a). Yetkiyi uç denetler (kapanis-kalite, kapanis-onay).
export async function kapanisOnayla(db: Db, kullanici: Kullanici, id: number, tur: KapanisOnayi, g: KapanisOnayGovdesi): Promise<KapanisCevabi> {
  const e = await kilitli(db, id, g.surum);
  const ihlal = kapanisOnayIhlali(e, tur, e.durum === 'acik' ? eksikSayisi(await maddeler(db, e)) : 0);
  if (ihlal !== null) throw cakisma(ihlal);
  if (!(await s.kapanisOnayYaz(db, id, g.surum, tur, kullanici.id))) throw eskiSurum();
  await defter(db, id, tur === 'kalite' ? 'kalite_onay' : 'mudur_onay', kullanici.id, g.not ?? null);
  if (await s.kapanisTamamla(db, id)) await defter(db, id, 'tamamlandi', kullanici.id);
  return kapanis(db, id);
}

// Ret verilmiş onayları düşürür; kapanış açık kalır, maddeler düzelince yeniden onaylanır.
export async function kapanisReddet(db: Db, kullanici: Kullanici, id: number, tur: KapanisOnayi, g: KapanisRetGovdesi): Promise<KapanisCevabi> {
  const e = await kilitli(db, id, g.surum);
  const ihlal = kapanisAcikIhlali(e.durum);
  if (ihlal !== null) throw cakisma(ihlal);
  if (!(await s.kapanisOnaylariniDusur(db, id, g.surum))) throw eskiSurum();
  await defter(db, id, tur === 'kalite' ? 'kalite_ret' : 'mudur_ret', kullanici.id, g.gerekce);
  return kapanis(db, id);
}

// 1076 a: yalnız müdür (kapanis-onay), yalnız eksik madde; tura bağlı, silinmez.
export async function kapanisMuafTut(db: Db, kullanici: Kullanici, id: number, g: KapanisMuafGovdesi): Promise<KapanisCevabi> {
  const e = await kilitli(db, id, g.surum);
  const hal = e.durum === 'acik' ? (await maddeler(db, e)).find((m) => m.madde === g.madde)?.durum ?? 'bilinmiyor' : 'tamam';
  const ihlal = kapanisMuafIhlali(e.durum, hal);
  if (ihlal !== null) throw cakisma(ihlal);
  if (!(await s.kapanisSurumuArtir(db, id, g.surum))) throw eskiSurum();
  await s.kapanisMuafiyetiEkle(db, { id, tur: e.tur, madde: g.madde, kisiId: kullanici.id, gerekce: g.gerekce });
  await defter(db, id, 'muaf', kullanici.id, g.gerekce, g.madde);
  return kapanis(db, id);
}

// 1080 a: yalnız müdür gerekçeyle geri açar; yeni turda iki onay yeniden gerekir.
export async function kapanisGeriAc(db: Db, kullanici: Kullanici, id: number, g: KapanisGeriAcGovdesi): Promise<KapanisCevabi> {
  const e = await kilitli(db, id, g.surum);
  const ihlal = kapanisGeriAcIhlali(e.durum);
  if (ihlal !== null) throw cakisma(ihlal);
  if (!(await s.kapanisGeriAc(db, id, g.surum))) throw eskiSurum();
  await defter(db, id, 'geri_acildi', kullanici.id, g.gerekce);
  return kapanis(db, id);
}

// Emir okumalarındaki kapanış sonucu: kapanış kaydı olmayan ya da açık emirde null.
export async function kapanisSonuclari(db: Db, idler: readonly number[]): Promise<Map<number, KapanisSonucu | null>> {
  return new Map((await s.kapanisDurumlari(db, idler)).map((k) => [k.uretimEmriId, kapanisSonucu(k.durum, k.saglamAdet)]));
}

// 1080 a: tamamlanan emrin kayıtları değişmez. Çağıran emri kilitlemiştir.
export async function kapanisKilitliMi(db: Db, id: number): Promise<boolean> {
  return (await s.kapanisBul(db, id))?.durum === 'tamam';
}

// 1064 ve 1079 a: duran emri planlama tek başına kapatmaz; bekleyen adımlar kalkar, emir sağlamsız biter ve kapanışa düşer.
export async function emirKapat(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<void> {
  const e = await s.ustEmirBul(db, id, true);
  if (e === null || e.malzemeNo === null) throw bulunamadi(EMIR_YOK);
  if (e.surum !== surum) throw eskiSurum();
  const adimlar = await s.isEmirleriGetir(db, [id]);
  if (!(await hataliDurdu(db, id, undefined, adimlar))) throw cakisma(KAPAT_DURMADI);
  for (const a of adimlar) if (a.durum === 'bekliyor') await bekleyeniSil(db, a.id);
  if (!(await s.saglamsizBitir(db, id))) throw cakisma(KAPAT_DURMADI);
  await emirBittiBildir(db, { uretimEmriId: id, saglamAdet: 0, kisiId: kullanici.id });
}
