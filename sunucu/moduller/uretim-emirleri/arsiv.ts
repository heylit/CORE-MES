import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, eskiSurum } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { ArsivOnizlemeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { emirIptalBildir } from './emir-olaylari.ts';
import { EMIR_YOK, acikEmirIhlali, arsivIhlali, arsivUyarilari } from './kurallar.ts';
import { kararSayaclari } from './servis.ts';
import * as s from './sorgular.ts';
import { acikCalismalar, enIleriSaglam, fasondaKalanlar } from './sorgular/arsiv/sorgular.ts';
import type { UstEmirSatiri } from './sorgular.ts';

// 2721 3/3: kim arşive alır; önizleme de aynı yetkiyle okunur.
export const ARSIV_YETKISI = 'uretim-emirleri.iptal' as const;

// 2721: başlamış emir silinmez, arşive alınır. Önizleme ile komut aynı durumu okur: ekranın gösterdiği engel komutun reddidir.
// 2731 b: kararsız hatalı kaydın açtığı kol engel değildir; emirle birlikte arşive gider, kararı arşivde verilir.
async function durum(db: Db, e: UstEmirSatiri) {
  const adimlar = await s.isEmirleriGetir(db, [e.id]);
  const hatalilar = await s.hataliKayitlariGetir(db, { acik: true, emirId: e.id });
  const acikKollar = (await s.altPartilerGetir(db, [e.id])).filter((k) => k.ustEmirId === e.id && acikEmirIhlali(k.durum, false) === null);
  const hataliKolu = new Set(hatalilar.filter((h) => h.uretimEmriId === e.id && h.hedefEmirId !== e.id).map((h) => h.hedefEmirId));
  const hataliKollari = acikKollar.filter((k) => hataliKolu.has(k.id)).map((k) => k.id);
  const acikKolVar = acikKollar.some((k) => !hataliKolu.has(k.id));
  const fasonda = await fasondaKalanlar(db, e.id);
  const fasondaAdet = fasonda.reduce((t, f) => t + f.adet, 0);
  const engel = arsivIhlali({ durum: e.durum, arsiv: e.arsiv, baslamisAdimVar: adimlar.some((a) => a.durum !== 'bekliyor'), acikKolVar });
  return { adimlar, fasonda, fasondaAdet, hataliAcik: hatalilar.length, hataliKollari, engel };
}

async function ustEmir(db: Db, id: number, kilit: boolean): Promise<UstEmirSatiri> {
  const e = await s.ustEmirBul(db, id, kilit);
  if (e === null || e.malzemeNo === null) throw bulunamadi(EMIR_YOK);
  return e;
}

export async function arsivOnizleme(db: Db, id: number): Promise<ArsivOnizlemeCevabi> {
  const e = await ustEmir(db, id, false);
  const { adimlar, fasonda, fasondaAdet, hataliAcik, engel } = await durum(db, e);
  const calismalar = await acikCalismalar(db, id);
  const adlar = await kisiAdlari(db, calismalar.flatMap((c) => c.kisiIdleri));
  const calisan = calismalar.map((c) => {
    const adim = adimlar.find((a) => a.id === c.isEmriId) ?? null;
    const kisiler = c.kisiIdleri.map((k) => adlar.get(k) ?? null).filter((x): x is string => x !== null);
    return { opNo: adim?.opNo ?? null, ad: adim?.ad ?? null, operator: kisiler.length === 0 ? null : kisiler.join(', ') };
  });
  const hurda = (await s.hurdaToplamlariGetir(db, [id]))[0]?.hurda ?? 0;
  const saglam = await enIleriSaglam(db, id);
  const kararBekleyen = (await kararSayaclari(db, [id])).get(id)?.kararBekliyor ?? 0;
  const fasondakiler = fasonda.map((f) => ({ opNo: f.opNo, adet: f.adet }));
  return {
    surum: e.surum, calisan, saglam: saglam?.adet ?? null, hurda, kararBekleyen, fasonda: fasondakiler, hataliAcik, engel,
    uyarilar: arsivUyarilari({ calisan: calisan.map((c) => ({ opNo: c.opNo, operator: c.operator })), saglam, hurda, kararBekleyen, fasondaAdet, hataliAcik }),
  };
}

// Tek transaction (uç): açık kullanım ve katılım "duraklat" ile kapanır (duruş sayılmaz, terminalden düşer), sayım ve tüketim kalır;
// emir iptal olur ve iptal olayı yayılır (stok rezerveyi kaldırır, açık depo isteklerini iptal eder); kapanış açılır.
export async function arsiveAl(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<void> {
  const e = await ustEmir(db, id, true);
  if (e.surum !== surum) throw eskiSurum();
  const { engel, hataliKollari } = await durum(db, e);
  if (engel !== null) throw cakisma(engel);
  const an = await s.anAl(db);
  for (const c of await acikCalismalar(db, id)) {
    await s.olayEkle(db, id, kullanici.id, c.istasyonId, 'duraklat', null, an, c.isEmriId);
  }
  await s.emrinKullanimlariniKapat(db, id, kullanici.id, an);
  await s.emrinKatilimlariniKapat(db, id, an);
  if ((await s.ustIptalYaz(db, id, e.surum)) === null) throw eskiSurum();
  await emirIptalBildir(db, { uretimEmriId: id, kisiId: kullanici.id });
  // Hatalı kolu yalnız kalite kararını bekler (adımı başlamamış): kökten sonra kilitlenir (küçük kimlik önce), kendi kapanışı açılmaz.
  for (const kolId of hataliKollari) {
    const kol = await s.ustEmirBul(db, kolId, true);
    if (kol === null || (await s.ustIptalYaz(db, kolId, kol.surum)) === null) throw eskiSurum();
    await emirIptalBildir(db, { uretimEmriId: kolId, kisiId: kullanici.id });
  }
  await s.kapanisAc(db, id);
}
