import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { kayitYoluMu } from '#paylasilan/sayfa-tanimi.ts';
import type { CagriEkibi } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import {
  ALICI_AYARLI_TURLER, BILDIRIM_TUR_ANAHTARLARI, EK_ALICI_GORME_ISLEMLERI, ekAliciTuruMu, BILDIRIM_TURLERI, CAGRI_EKIP_ADLARI, type Bildirim, type BildirimAliciDegistirGovdesi, type BildirimAlicilariCevabi, type BildirimGosterimDegistirGovdesi, type BildirimGosterimleriCevabi, type CagriEkiplerimCevabi, type CagriYonlendirmeCevabi, type CagriYonlendirmeDegistirGovdesi, type BildirimListeDurumu, type BildirimSayacCevabi,
  type BildirimTuru, type BildirimTuruTanimi, type TumunuOkunduCevabi, type YayinSimgesi, type YayinTuru, anahtarliTurMu, turSinifi,
  type BildirimPushAbonelikGovdesi,  type BildirimPushDurumuCevabi, type BildirimPushTurDegistirGovdesi, type BildirimPushTurleriCevabi, turPushVarsayilani,
} from '#paylasilan/sozlesme/bildirim.ts';
import { kuralliTurMu } from '#paylasilan/sozlesme/bildirim-kural.ts';
import { kisiAdlari, kisiSecenekleri, kisilerinIslemleri, rolSecenekleri, rollerdekiKisiler } from '../kisiler/disari.ts';
import {
  ONAY_ILETILERI, alicilariSec, ekAlicilariEkle, kaynakModulu, kuralDegerleriniAyikla, metniHazirla, olayYazimi, olmayanKimlikler, otomatikGosterim, tekilAnahtar, varsayilanGosterim, varsayilanMi, yolTureUyar,
} from './kurallar.ts';
import { epostaKuyrugaAl, kuralEpostasiKuyrugaAl, type EpostaEki } from './eposta.ts';
import { grupKazanir, grupKisileri, kuralHedefleri, kurallariUygula } from './kural.ts';
import { izinliUcNoktaMi, ortamPushAyari } from './push.ts';
import * as s from './sorgular.ts';
import * as so from './sorgular/olay/sorgular.ts';

const BULUNAMADI = 'Bildirim bulunamadı.';

interface BildirimOlayiTemeli {
  tur: BildirimTuru;
  baslik: string;
  metin?: string | null;
  // Bildirime basınca açılacak uygulama içi adres.
  yol?: `/${string}` | null;
  // Kaynak kaydın kimliği (talep no gibi): okunmamışken aynı olay yinelenirse yeni satır açılmaz.
  kaynakKimlik?: string | null;
  // Olay türünün işlem sahiplerine ek olarak alacak kişiler (kayda bağlı kişi).
  kisiler?: readonly number[];
  // Olayı tetikleyen kişi: kendi eylemi için bildirim almaz.
  haric?: number | null;
  // E-postanın bilgi tablosu için isteğe bağlı alanlar (3397); metin ve serbest alan e-postaya girmez.
  eposta?: EpostaEki;
  // 3405: kademeli uyarı e-postayı kaynağın ayarıyla verir; e-posta yok bu olayda e-posta açmaz.
  epostaYok?: boolean;
  // 3478-3: kural koşulunun baktığı olay alanları (KURAL_ALANLARI[tur]); listede olmayan ad ve tipi tutmayan değer atılır.
  alanlar?: Readonly<Record<string, unknown>>;
}
// 2453: yalnizKisiler true iken alıcı yalnız `kisiler` içinden türü alanlardır (liste yalnız daraltır); kişi listesi zorunludur.
export type BildirimOlayi =
  | (BildirimOlayiTemeli & { yalnizKisiler?: false })
  | (BildirimOlayiTemeli & { yalnizKisiler: true; kisiler: readonly number[] });

// Çağıranın transaction'ında yazar (ADR 0006): olayı doğuran yazma geri alınırsa bildirim de kalmaz. Yazılan alıcı sayısını döner.
// BIL-10: türde alıcı seçimi varsa seçilen rollerdeki etkin girişli kişiler ve seçilen kişiler; seçim yoksa null (işlem kuralı).
// Kayda bağlı türde (alıcı listesi dışı) eski bir kayıtlı seçim okunmaz: alıcıyı çağıran verir, ekrandan düzeltilemeyen kayıt onu susturmaz.
// 3597 a: ek alıcılı türde seçim kayıttaki kişinin yerine geçmez; `ekAlicilariEkle` ona ekler.
async function ayarliAlicilar(db: Db, tur: BildirimTuru): Promise<number[] | null> {
  if (!(ALICI_AYARLI_TURLER as readonly string[]).includes(tur)) return null;
  const ayar = await s.turAyari(db, tur);
  if (ayar === null) return null;
  return [...await rollerdekiKisiler(db, ayar.rolIdleri), ...ayar.kisiIdleri];
}

export async function bildirimGonder(db: Db, olay: BildirimOlayi): Promise<number> {
  const tanim = BILDIRIM_TURLERI[olay.tur];
  if (olay.yol !== undefined && olay.yol !== null && !kayitYoluMu(olay.yol)) throw new Error(`Bildirim yolu geçersiz: ${olay.yol}`);
  if (!yolTureUyar(olay.tur, olay.yol)) throw new Error(`Bildirim yolu türün ekranında değil: ${olay.tur} ${olay.yol}`);
  const anahtarli = anahtarliTurMu(olay.tur);
  const yazim = olayYazimi({ anahtarli, acik: anahtarli && await so.turAcikMi(db, olay.tur), sinif: turSinifi(olay.tur), onayIstenir: (tanim as BildirimTuruTanimi).onayIstenir === true });
  if (yazim === 'yok') return 0;
  const { baslik, metin } = metniHazirla(olay.baslik, olay.metin);
  const islemler = await kisilerinIslemleri(db);
  const ayarli = await ayarliAlicilar(db, olay.tur);
  const tur = olay.tur;
  const gorme = ekAliciTuruMu(tur) ? EK_ALICI_GORME_ISLEMLERI[tur] : null;
  const asil = alicilariSec(olay.tur, islemler, {
    kisiler: olay.kisiler, haric: olay.haric, ayarli: gorme === null ? ayarli : null, yalnizKisiler: olay.yalnizKisiler,
  });
  const ekliAlicilar = gorme !== null && ayarli !== null ? ekAlicilariEkle(asil, ayarli, islemler, gorme, olay.haric) : asil;
  // 3639: alıcı grubu varsa grubun kişisi ana bildirimi almaz, grubun metniyle alır (grup, 3597 ek alıcısından önce gelir).
  const kuralDegerleri = kuralliTurMu(olay.tur) ? kuralDegerleriniAyikla(olay.tur, olay.alanlar) : {};
  const hedefler = yazim === 'tam' ? await kuralHedefleri(db, { tur: olay.tur, haric: olay.haric, degerler: kuralDegerleri }, islemler) : [];
  const grup = grupKazanir(olay.tur) ? grupKisileri(hedefler) : new Set<number>();
  const alicilar = ekliAlicilar.filter((k) => !grup.has(k));
  const anahtar = tekilAnahtar(olay.tur, olay.kaynakKimlik);
  const gosterim = otomatikGosterim(tanim, alicilar.length === 0 ? null : await s.turGosterimi(db, olay.tur));
  const yazilan: { kisiId: number; id: number; yeni: boolean }[] = [];
  for (const kisiId of alicilar) {
    yazilan.push({ kisiId, ...await s.bildirimYaz(db, {
      kisiId, tur: olay.tur, onem: tanim.onem, baslik, metin, yol: olay.yol ?? null, kaynakModul: kaynakModulu(olay.tur), tekilAnahtar: anahtar,
      ortada: yazim === 'tam' && gosterim.ortada, onayIstenir: gosterim.onayIstenir, sinif: turSinifi(olay.tur),
    }) });
  }
  if (yazim !== 'tam') return alicilar.length;
  await epostaKuyrugaAl(db, { tur: olay.tur, baslik, yol: olay.yol ?? null, eposta: olay.eposta, epostaYok: olay.epostaYok }, yazilan, islemler);
  if (alicilar.length > 0 && await pushTuruAcik(db, olay.tur)) await s.pushKuyrugaIsaretle(db, alicilar);
  if (kuralliTurMu(olay.tur)) {
    const kural = await kurallariUygula(db, {
      tur: olay.tur, baslik, yol: olay.yol ?? null, kaynakKimlik: olay.kaynakKimlik, haric: olay.haric, degerler: kuralDegerleri,
    }, new Set(alicilar), hedefler);
    for (const k of kural.filter((x) => x.eposta)) {
      await kuralEpostasiKuyrugaAl(db, { tur: olay.tur, baslik: k.baslik, yol: olay.yol ?? null, eposta: olay.eposta, sablonId: k.epostaSablonId }, [k], islemler);
    }
    const telefon = kural.filter((x) => x.telefon && x.yeni).map((x) => x.kisiId);
    if (telefon.length > 0 && ortamPushAyari() !== null) await s.pushKuyrugaIsaretle(db, telefon);
  }
  return alicilar.length;
}

// 3588: bu türü gerçekten alacak kişiler (verilen listeyle türü alanların kesişimi). Kademe motoru alıcı kümesini göndermeden önce bununla süzer:
// kaynağı okuyamayan alıcı bildirim almaz, boş kalan küme bir üst kademeye düşer.
export async function yalnizKisilerAlicilari(db: Db, tur: BildirimTuru, kisiler: readonly number[]): Promise<number[]> {
  if (kisiler.length === 0) return [];
  return alicilariSec(tur, await kisilerinIslemleri(db), { kisiler, ayarli: await ayarliAlicilar(db, tur), yalnizKisiler: true });
}

export interface BildirimKapanisi {
  tur: BildirimTuru;
  // `bildirimGonder`'e verilen kaynak kimliğinin aynısı; kimliksiz açılan bildirim kaynağa bağlanamaz, kapatılamaz.
  kaynakKimlik: string;
}

// "Onay bekliyor" türü bildirim, karar verilince (onay, ret, iptal) kendiliğinden kapanır: kararı yazan modül kendi
// transaction'ında çağırır, karar geri alınırsa kapanış da kalmaz. Kapatılan satır sayısını döner.
export async function bildirimKapat(db: Db, k: BildirimKapanisi): Promise<number> {
  const anahtar = tekilAnahtar(k.tur, k.kaynakKimlik);
  if (anahtar === null) throw new Error(`Bildirim kapatmak için kaynak kimliği gerekir: ${k.tur}`);
  return s.kaynaktanOkunduIsaretle(db, anahtar);
}

// Elle yayının künyesi (tür, simge, gönderen, görsel, geri çekilme) satıra eklenir; otomatik satırda null.
async function kunyeEkle(db: Db, satirlar: readonly s.BildirimSatiri[]): Promise<Bildirim[]> {
  const kunyeler = await s.yayinKunyeleri(db, satirlar.flatMap((r) => (r.yayinId === null ? [] : [r.yayinId])));
  const adlar = await kisiAdlari(db, kunyeler.map((k) => k.yazanKisiId));
  const yayinlar = new Map(kunyeler.map((k) => [k.id, k]));
  return satirlar.map(({ yayinId, ...r }) => {
    const k = yayinId === null ? undefined : yayinlar.get(yayinId);
    return {
      ...r,
      yayin: k === undefined ? null : {
        id: k.id, tur: k.tur as YayinTuru, simge: k.simge as YayinSimgesi, gonderen: adlar.get(k.yazanKisiId) ?? null,
        gorselVar: k.gorselVar, geriCekildi: k.geriCekildi,
      },
    };
  });
}

async function tekKunye(db: Db, satir: s.BildirimSatiri | null): Promise<Bildirim | null> {
  return satir === null ? null : (await kunyeEkle(db, [satir]))[0] ?? null;
}

export function bildirimListesi(
  db: Db, kullanici: Kullanici, sorgu: { sayfa: number; sayfaBoyu?: number | undefined; durum: BildirimListeDurumu },
): Promise<SayfaliListe<Bildirim>> {
  return sayfaliListe(sorgu, {
    say: () => s.kisininBildirimSayisi(db, kullanici.id, sorgu.durum),
    satirlar: async (dilim) => kunyeEkle(db, await s.kisininBildirimleri(db, kullanici.id, sorgu.durum, dilim)),
  });
}

export function bildirimSayaci(db: Db, kullanici: Kullanici): Promise<BildirimSayacCevabi> {
  return s.kisininSayaci(db, kullanici.id);
}

export async function okundu(db: Db, kullanici: Kullanici, id: number): Promise<Bildirim> {
  const b = await tekKunye(db, await s.okunduIsaretle(db, kullanici.id, id));
  if (b === null) throw bulunamadi(BULUNAMADI);
  return b;
}

export async function tumunuOkundu(db: Db, kullanici: Kullanici): Promise<TumunuOkunduCevabi> {
  return { isaretlenen: await s.tumunuOkunduIsaretle(db, kullanici.id) };
}

// BIL-15: onay bekleyen satır arşive kaldırılamaz; başkasının satırı yine "bulunamadı".
export async function arsivle(db: Db, kullanici: Kullanici, id: number): Promise<Bildirim> {
  const b = await tekKunye(db, await s.arsivle(db, kullanici.id, id));
  if (b !== null) return b;
  if ((await s.onayBekliyorMu(db, kullanici.id, id))?.bekliyor === true) throw dogrulama(ONAY_ILETILERI.onaysizArsiv);
  throw bulunamadi(BULUNAMADI);
}

// Ekip çağrısı yönlendirmesi (298 a). Değiştiren kişi ve zaman sunucudan yazılır; ad kisiler modülünden eklenir.
export async function cagriYonlendirmesi(db: Db): Promise<CagriYonlendirmeCevabi> {
  const satirlar = await s.cagriEkipleri(db);
  const adlar = await kisiAdlari(db, satirlar.flatMap((r) => (r.degistirenKisiId === null ? [] : [r.degistirenKisiId])));
  return {
    satirlar: satirlar.map(({ degistirenKisiId, ...r }) => ({
      ...r, ekip: r.ekip as CagriEkibi,
      degistiren: degistirenKisiId === null ? null : { id: degistirenKisiId, ad: adlar.get(degistirenKisiId) ?? null },
    })),
    roller: await rolSecenekleri(db),
  };
}

export async function cagriYonlendirmesiYaz(
  db: Db, kullanici: Kullanici, ekip: CagriEkibi, govde: CagriYonlendirmeDegistirGovdesi,
): Promise<CagriYonlendirmeCevabi> {
  const olmayan = olmayanKimlikler(govde.rolIdleri, (await rolSecenekleri(db)).map((r) => r.id));
  if (olmayan.length > 0) throw dogrulama(`Rol bulunamadı: ${olmayan.join(', ')}`, 'rolIdleri');
  if (!(await s.cagriEkibiYaz(db, ekip, govde.rolIdleri, govde.surum, kullanici.id))) throw eskiSurum();
  return cagriYonlendirmesi(db);
}

// Bildirim alıcıları (760 c, 761 b). Seçilebilir kişi etkin ve girişli olandır: bildirim yalnız onlara yazılır.
async function secilebilirKisiler(db: Db): Promise<{ id: number; ad: string }[]> {
  const girisli = await kisilerinIslemleri(db);
  return (await kisiSecenekleri(db)).filter((k) => girisli.has(k.id)).map(({ id, ad }) => ({ id, ad }));
}

export async function bildirimAlicilari(db: Db): Promise<BildirimAlicilariCevabi> {
  const ayarlar = new Map((await s.turAyarlari(db)).map((a) => [a.tur, a]));
  const adlar = await kisiAdlari(db, [...ayarlar.values()].flatMap((a) => (a.degistirenKisiId === null ? [] : [a.degistirenKisiId])));
  return {
    satirlar: ALICI_AYARLI_TURLER.map((tur) => {
      const t = BILDIRIM_TURLERI[tur];
      const a = ayarlar.get(tur);
      return {
        tur, baslik: t.baslik, onem: t.onem, kaynakModul: kaynakModulu(tur),
        // Ek alıcılı türde seçimsiz hâl yalnız kayıttaki kişidir; türün alan işlemi (proje görevinde) yalnız daraltır, alıcı seçmez.
        varsayilanIslemler: ekAliciTuruMu(tur) ? [] : [...t.alanIslemler],
        kip: ekAliciTuruMu(tur) ? 'ek' as const : 'yerine' as const, gormeIslemi: ekAliciTuruMu(tur) ? EK_ALICI_GORME_ISLEMLERI[tur] : null,
        rolIdleri: a?.rolIdleri ?? [], kisiIdleri: a?.kisiIdleri ?? [], surum: a?.surum ?? null,
        degistiren: a === undefined || a.degistirenKisiId === null ? null : { id: a.degistirenKisiId, ad: adlar.get(a.degistirenKisiId) ?? null },
        degistirildi: a?.degistirildi ?? null,
      };
    }),
    roller: await rolSecenekleri(db),
    kisiler: await secilebilirKisiler(db),
  };
}

// Otomatik türlerin gösterimi (2147 Y4): bütün türler, ayarlanmamışta varsayılanla.
export async function bildirimGosterimleri(db: Db): Promise<BildirimGosterimleriCevabi> {
  const ayarlar = new Map((await s.turGosterimleri(db)).map((a) => [a.tur, a]));
  const adlar = await kisiAdlari(db, [...ayarlar.values()].flatMap((a) => (a.degistirenKisiId === null ? [] : [a.degistirenKisiId])));
  return {
    satirlar: BILDIRIM_TUR_ANAHTARLARI.map((tur) => {
      const t = BILDIRIM_TURLERI[tur];
      const a = ayarlar.get(tur);
      const g = a ?? varsayilanGosterim(t);
      return {
        tur, baslik: t.baslik, onem: t.onem, kaynakModul: kaynakModulu(tur), ortada: g.ortada, onayIstenir: g.onayIstenir, surum: a?.surum ?? null,
        degistiren: a === undefined || a.degistirenKisiId === null ? null : { id: a.degistirenKisiId, ad: adlar.get(a.degistirenKisiId) ?? null },
        degistirildi: a?.degistirildi ?? null,
      };
    }),
  };
}

export async function bildirimGosterimiYaz(
  db: Db, kullanici: Kullanici, tur: BildirimTuru, govde: BildirimGosterimDegistirGovdesi,
): Promise<BildirimGosterimleriCevabi> {
  const varsayilan = varsayilanMi(BILDIRIM_TURLERI[tur], govde);
  if (!(await s.turGosterimiYaz(db, tur, { ...govde, surum: govde.surum ?? null, varsayilan }, kullanici.id))) throw eskiSurum();
  return bildirimGosterimleri(db);
}

export async function bildirimAlicilariYaz(
  db: Db, kullanici: Kullanici, tur: BildirimTuru, govde: BildirimAliciDegistirGovdesi,
): Promise<BildirimAlicilariCevabi> {
  const olmayanRol = olmayanKimlikler(govde.rolIdleri, (await rolSecenekleri(db)).map((r) => r.id));
  if (olmayanRol.length > 0) throw dogrulama(`Rol bulunamadı: ${olmayanRol.join(', ')}`, 'rolIdleri');
  const olmayanKisi = olmayanKimlikler(govde.kisiIdleri, (await secilebilirKisiler(db)).map((k) => k.id));
  if (olmayanKisi.length > 0) throw dogrulama(`Kişi bulunamadı ya da girişi yok: ${olmayanKisi.join(', ')}`, 'kisiIdleri');
  if (!(await s.turAyariYaz(db, tur, govde, kullanici.id))) throw eskiSurum();
  return bildirimAlicilari(db);
}

// Kişinin alıcısı olduğu ekipler: çağrı gidecek kişiler ekipCagrisiBildir ile aynı yoldan seçilir, iki kaynak oluşmaz.
export async function cagriEkiplerim(db: Db, kullanici: Kullanici): Promise<CagriEkiplerimCevabi> {
  const ekipler: CagriEkibi[] = [];
  for (const satir of await s.cagriEkipleri(db)) {
    if ((await rollerdekiKisiler(db, satir.rolIdleri)).includes(kullanici.id)) ekipler.push(satir.ekip as CagriEkibi);
  }
  return { ekipler };
}

export interface EkipCagrisi {
  ekip: CagriEkibi;
  // Çağrının açıldığı istasyon ya da makine kodu; ekranda başlıkta görünür.
  yer: string;
  not?: string | null;
  // Çağrının kimliği: okunmamışken aynı çağrı yinelenirse yeni satır açılmaz.
  cagriKimligi: string;
  // Çağrıyı açan kişi: kendi çağrısını almaz.
  haric?: number | null;
}

// BIL-7: çağıranın transaction'ında yazar; alıcı ekibin yönlendirmesindeki rollerden gelir, açan kendi çağrısını almaz. Yazılan alıcı sayısını döner.
export async function ekipCagrisiBildir(db: Db, c: EkipCagrisi): Promise<number> {
  const kisiler = await rollerdekiKisiler(db, await s.cagriEkibiRolleri(db, c.ekip));
  if (kisiler.length === 0) return 0;
  return bildirimGonder(db, {
    tur: 'arkon.ekip-cagrisi', baslik: `${CAGRI_EKIP_ADLARI[c.ekip]} çağrısı: ${c.yer}`, metin: c.not ?? null, yol: null,
    kaynakKimlik: c.cagriKimligi, kisiler, haric: c.haric ?? null,
  });
}

// Web Push (ADR 0031): kuyruğa işaret çağıranın transaction'ındadır; istek zamanlanmış işte, transaction dışında atılır.
async function pushTuruAcik(db: Db, tur: BildirimTuru): Promise<boolean> {
  if (ortamPushAyari() === null) return false;
  return (await s.pushTurAcikMi(db, tur)) ?? turPushVarsayilani(tur);
}

export async function pushDurumu(db: Db, kullanici: Kullanici): Promise<BildirimPushDurumuCevabi> {
  const ayar = ortamPushAyari();
  return { acik: ayar !== null, acikAnahtar: ayar?.acikAnahtar ?? null, cihazSayisi: await s.pushCihazSayisi(db, kullanici.id) };
}

const PUSH_KAPALI = 'Uygulama kapalıyken bildirim bu sunucuda açık değil.';

// Kişi yalnız kendi cihazını açar. Uç noktayı bilen cihazın kendisidir (push servisinin verdiği tahmin edilemez adres): aynı cihazda
// başka kişi oturum açıp abone olursa abonelik ona geçer, önceki kişi o cihazdan sinyal almaz. Adres izin listesindeki push servislerinden biri değilse reddedilir.
export async function pushAboneOl(db: Db, kullanici: Kullanici, govde: BildirimPushAbonelikGovdesi): Promise<BildirimPushDurumuCevabi> {
  if (ortamPushAyari() === null) throw dogrulama(PUSH_KAPALI);
  if (!izinliUcNoktaMi(govde.ucNokta)) throw dogrulama('Bu tarayıcının bildirim servisi desteklenmiyor.');
  await s.pushAboneligiYaz(db, kullanici.id, govde.ucNokta);
  return pushDurumu(db, kullanici);
}

export async function pushAbonelikSil(db: Db, kullanici: Kullanici, govde: BildirimPushAbonelikGovdesi): Promise<BildirimPushDurumuCevabi> {
  if (!await s.pushAboneligiSil(db, kullanici.id, govde.ucNokta)) throw bulunamadi('Bu cihazın aboneliği bulunamadı.');
  return pushDurumu(db, kullanici);
}

export async function pushTurleri(db: Db): Promise<BildirimPushTurleriCevabi> {
  const ayarli = new Map((await s.pushTurAyarlari(db)).map((a) => [a.tur, a.acik]));
  return {
    satirlar: BILDIRIM_TUR_ANAHTARLARI.map((tur) => {
      const t = BILDIRIM_TURLERI[tur];
      const varsayilan = turPushVarsayilani(tur);
      const acik = ayarli.get(tur) ?? varsayilan;
      return { tur, baslik: t.baslik, onem: t.onem, kaynakModul: kaynakModulu(tur), acik, varsayilan: acik === varsayilan };
    }),
  };
}

export async function pushTuruYaz(db: Db, kullanici: Kullanici, tur: BildirimTuru, govde: BildirimPushTurDegistirGovdesi): Promise<BildirimPushTurleriCevabi> {
  await s.pushTurYaz(db, tur, govde.acik, turPushVarsayilani(tur), kullanici.id);
  return pushTurleri(db);
}
