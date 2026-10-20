import type { Db } from '#cekirdek/db.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { AZAMI_SN, BOSTA_SN } from './kurallar.ts';
import { hesapKilidiniAc, hesapKilitleri, istektekiOturumOzeti } from './servis.ts';
import {
  acikOturumSatirlari, acikOturumSayilari, denemeOzetiBul, denemeSatirlari, denemeSay, etkinKilitSay, oturumKimlikleKapat, saatlikDenemeBul,
  sonKilitOzeti,
} from './sorgular.ts';
import type {
  AcikOturumSatiri, DenemeOzetiSatiri, DenemeSatiri, DenemeSonucu, HesapKilidiSatiri, KilitOzetiSatiri, SaatlikDenemeSatiri,
} from './sorgular.ts';

export { kimlikCozucu } from './servis.ts';
export type {
  AcikOturumSatiri as AcikOturum, DenemeOzetiSatiri as DenemeOzeti, DenemeSatiri as GirisDenemesi, HesapKilidiSatiri as EtkinHesapKilidi,
  KilitOzetiSatiri as KilitOzeti, SaatlikDenemeSatiri as SaatlikDeneme,
};

// Aşağıdakiler güvenlik izlemesi içindir. Yetki denetlemez: çağıran modül kendi ucunda denetler.
const SURE = { bostaSn: BOSTA_SN, azamiSn: AZAMI_SN };
type CerezliIstek = { cerez(ad: string): string | null };

// Son sonSn saniyedeki denemeler, kullanıcı adı ve cihaz çiftine göre. Bekleme sırasında reddedilen deneme kaydedilmediği
// için burada yoktur.
export function girisDenemeleriniOzetle(db: Db, aralik: { sonSn: number }): Promise<DenemeOzetiSatiri[]> {
  return denemeOzetiBul(db, aralik.sonSn);
}

export function saatlikGirisDenemeleri(db: Db, saatSayisi: number): Promise<SaatlikDenemeSatiri[]> {
  return saatlikDenemeBul(db, saatSayisi);
}

export function girisDenemeleriListesi(
  db: Db,
  sorgu: { sayfa: number; sayfaBoyu?: number | undefined; sonuc?: DenemeSonucu | undefined; ara?: string | undefined },
): Promise<SayfaliListe<DenemeSatiri>> {
  const ara = sorgu.ara?.trim() ?? '';
  const suzgec = { sonuc: sorgu.sonuc ?? null, ara: ara === '' ? null : ara };
  return sayfaliListe(sorgu, { say: () => denemeSay(db, suzgec), satirlar: (dilim) => denemeSatirlari(db, suzgec, dilim) });
}

// Kişi başına geçerli (kapanmamış, süresi dolmamış) oturum sayısı; oturumu olmayan kişi listede yoktur.
export function acikOturumlariSay(db: Db): Promise<{ kisiId: number; acikOturum: number }[]> {
  return acikOturumSayilari(db, SURE);
}

// Geçerli oturumlar, son görülene göre; isteği yapanın oturumu işaretlidir. Anahtar ve özeti dönmez.
export function acikOturumlar(db: Db, istek: CerezliIstek): Promise<AcikOturumSatiri[]> {
  return acikOturumSatirlari(db, SURE, istektekiOturumOzeti(istek));
}

// Tek oturumu kapatır. İsteği yapanın kendi oturumu bu yoldan kapanmaz ('kendi'); açık olmayan oturum 'yok'.
export function oturumuKapat(db: Db, oturumId: number, istek: CerezliIstek): Promise<'kapandi' | 'yok' | 'kendi'> {
  return oturumKimlikleKapat(db, oturumId, istektekiOturumOzeti(istek));
}

// Etkin (açılmamış, süresi dolmamış) hesap kilitleri; oturum ucuyla aynı liste.
export function etkinHesapKilitleri(db: Db, sorgu: { sayfa: number; sayfaBoyu?: number | undefined }): Promise<SayfaliListe<HesapKilidiSatiri>> {
  return hesapKilitleri(db, sorgu);
}

export function etkinHesapKilidiSay(db: Db): Promise<number> {
  return etkinKilitSay(db, null);
}

// Son sonSn saniyede kurulan kilitler, ada göre (kilit olayı; açılmış ya da süresi dolmuş olan da sayılır).
export function sonHesapKilitleri(db: Db, aralik: { sonSn: number }): Promise<KilitOzetiSatiri[]> {
  return sonKilitOzeti(db, aralik.sonSn);
}

// Kilidin adındaki etkin kilitleri açar; açan kişi ve an sunucudan. Etkin kilit yoksa 404 (oturum ucuyla aynı).
export function hesapKilidiniKaldir(db: Db, id: number, acanKisiId: number): Promise<{ acilan: number }> {
  return hesapKilidiniAc(db, id, acanKisiId);
}
