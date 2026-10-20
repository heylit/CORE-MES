import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi, bulunamadi, cokBuyuk, cokIstek, dogrulama } from '#cekirdek/hata.ts';
import type { DenetimSecimi, IkiliCevap } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { BagliDosya, DosyaParcasiGovdesi } from '#paylasilan/sozlesme/dosya.ts';
import {
  BAYAT_SERIT_GUN, DOSYA_MIME, DOSYA_SINIRI, ILETILER, SAHIPSIZ_GUN, TEMIZLIK_SINIRI, TEMIZLIK_TUR_SORGUSU, bagReddi, kotaHatasi,
  modulAdiBicimli, turBul,
} from './kurallar.ts';
import type { BagSiniri, DosyaSiniri } from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { BagSatiri, DosyaSatiri } from './sorgular.ts';

// Kişinin kendisinin yüklemediği özetler: dosya depoda olsa da içeriği göndermeyen onu bağlayamaz (DS6, bağlama kararı a).
export async function eksikDosyalar(db: Db, kullanici: Kullanici, ozetler: readonly string[]): Promise<string[]> {
  const olan = new Set(await sorgular.kendiYukledikleri(db, ozetler, kullanici.id));
  return [...new Set(ozetler)].filter((o) => !olan.has(o));
}

// Tutarsız, özeti tutmayan ya da sınırı aşan yüklemede kişinin kendi şeridi atılır; atma hata cevabında da kalıcıdır (yazilarKalir):
// bozuk şerit kotayı doldurmaya devam etmesin.
async function yuklemeyiReddet(db: Db, ozet: string, kisiId: number, hata: UygulamaHatasi): Promise<never> {
  await sorgular.yuklemeyiAt(db, ozet, kisiId);
  throw new UygulamaHatasi(hata.kod, hata.message, { ...(hata.alan === undefined ? {} : { alan: hata.alan }), yazilarKalir: true });
}

// Zamanlanmış işin turu (isler.ts); yükleme temizlik yapmaz. Sınırı dolduran silme sorgusu tur sınırına kadar yinelenir.
export async function temizle(db: Db): Promise<{ serit: number; dosya: number }> {
  const silinen = { serit: 0, dosya: 0 };
  for (let tur = 0; tur < TEMIZLIK_TUR_SORGUSU; tur += 1) {
    const n = await sorgular.bayatSeritleriSil(db, BAYAT_SERIT_GUN, TEMIZLIK_SINIRI.serit);
    silinen.serit += n;
    if (n < TEMIZLIK_SINIRI.serit) break;
  }
  for (let tur = 0; tur < TEMIZLIK_TUR_SORGUSU; tur += 1) {
    const n = await sorgular.sahipsizleriSil(db, SAHIPSIZ_GUN, TEMIZLIK_SINIRI.dosya);
    silinen.dosya += n;
    if (n < TEMIZLIK_SINIRI.dosya) break;
  }
  return silinen;
}

// Yükleme parçaları KİŞİ BAŞINA şerittir: kimse başkasının aynı özetli yüklemesini engelleyemez ya da ona yazamaz. Tamamlanan
// dosya özetle tekildir: ilk tamamlayan içeriği yazar. Aynı içeriği sonra yükleyen de bütün parçaları gönderir ve özeti doğrulanınca
// yalnız yükleyen olarak eklenir; "zaten var" kısayolu yalnız içeriği daha önce kendisi göndermiş kişiyedir.
export async function dosyaParcasi(
  db: Db, kullanici: Kullanici, ozet: string, g: DosyaParcasiGovdesi,
  // Sınırlar testte küçük verilebilsin diye enjekte edilir; uç varsayılanı kullanır.
  sinir: DosyaSiniri = DOSYA_SINIRI,
): Promise<boolean> {
  // Kilit sırası tek yönlüdür: önce kişi (şerit ve kota), özet kilidi yalnız tamamlama anında.
  await sorgular.kisiKilitle(db, kullanici.id);
  if (await sorgular.yukleyenMi(db, ozet, kullanici.id)) {
    await sorgular.yuklemeyiAt(db, ozet, kullanici.id);
    return true;
  }
  const parca = Buffer.from(g.veri, 'base64');
  if (parca.length === 0) throw dogrulama('Parça boş olamaz.', 'veri');
  const onceki = await sorgular.serit(db, ozet, kullanici.id);
  const ekleyecegi = parca.length - (onceki.adet > 0 ? await sorgular.parcaBoyutu(db, ozet, kullanici.id, g.sira) : 0);
  if (onceki.bayt + ekleyecegi > sinir.dosyaBayt) return yuklemeyiReddet(db, ozet, kullanici.id, cokBuyuk(ILETILER.dosyaBuyuk));
  // Kişi sınırı aşılınca yeni yükleme reddedilmez: kişinin en eski açık yüklemesi atılır. Depo doluysa başkasının yüklemesi atılmaz, ret.
  for (;;) {
    const acik = await sorgular.kisiAcikYuklemeleri(db, kullanici.id);
    const kota = kotaHatasi({
      kisiAdet: onceki.adet > 0 ? 0 : acik.adet, kisiBayt: acik.bayt, kisiBagsizBayt: await sorgular.kisiBagsizBayti(db, kullanici.id),
      depoBayt: await sorgular.depoBayti(db), yeniBayt: ekleyecegi,
    }, sinir);
    if (kota === null) break;
    // Açık yükleme atmak bağsız dosyayı ve depoyu boşaltmaz: o iki sınırda ret.
    const eski = kota === 'kotaDepo' || kota === 'kotaBagsiz' ? null : await sorgular.enEskiAcikYukleme(db, kullanici.id, ozet);
    if (eski === null) throw cokIstek(ILETILER[kota]);
    await sorgular.yuklemeyiAt(db, eski, kullanici.id);
  }
  await sorgular.parcaYaz(db, ozet, kullanici.id, g.sira, g.toplam, parca);
  const durum = await sorgular.serit(db, ozet, kullanici.id);
  if (durum.toplamlar > 1) return yuklemeyiReddet(db, ozet, kullanici.id, dogrulama(ILETILER.parcaUyusmuyor, 'toplam'));
  if (durum.adet < g.toplam) return false;
  return yuklemeyiTamamla(db, kullanici.id, ozet, g.toplam, durum.bayt);
}

async function yuklemeyiTamamla(db: Db, kisiId: number, ozet: string, toplam: number, boyut: number): Promise<true> {
  // Özet parça parça hesaplanır: dosya bütün halde belleğe alınmaz.
  const ozetci = createHash('sha256');
  let ilk: Buffer | null = null;
  for (let sira = 0; sira < toplam; sira += 1) {
    const parca = await sorgular.seritParcasi(db, ozet, kisiId, sira);
    if (parca === null) throw new Error(`Yükleme şeridinde parça eksik: ${ozet} ${sira}`);
    ilk ??= parca;
    ozetci.update(parca);
  }
  if (ozetci.digest('hex') !== ozet) return yuklemeyiReddet(db, ozet, kisiId, dogrulama(ILETILER.ozetTutmuyor, 'ozet'));
  const tur = ilk === null ? null : turBul(ilk, boyut);
  if (tur === null) return yuklemeyiReddet(db, ozet, kisiId, dogrulama(ILETILER.turYok, 'veri'));
  // Aynı özeti iki kişi birden tamamlarsa özet kilidi sıraya koyar; ikincisi dosyayı hazır bulur ve yalnız yükleyen olarak eklenir.
  await sorgular.ozetKilitle(db, ozet);
  if ((await sorgular.dosyaBul(db, ozet)) === null) {
    const kopyalanan = await sorgular.dosyaEkle(db, ozet, kisiId, boyut, tur);
    if (kopyalanan !== toplam) throw new Error(`Yükleme şeridi tamamlanırken eksildi: ${ozet} ${kopyalanan}/${toplam}`);
  } else {
    await sorgular.yukleyenEkle(db, ozet, kisiId);
  }
  await sorgular.yuklemeyiAt(db, ozet, kisiId);
  return true;
}

// İçerik okuma transaction'ının dışında, parça parça okunur (ikili cevap). Dosya özetle adreslenir ve değişmez; okuma sırasında
// silinirse (bağı yoktu ve süresi doldu) akış eksik kalır ve uç katmanı bağlantıyı keser.
async function* parcalar(db: Db, ozet: string): AsyncGenerator<Buffer> {
  for (let sira = 0; ; sira += 1) {
    const satir = await sorgular.icerikParcasi(db, ozet, sira);
    if (satir === null) return;
    yield satir.icerik;
  }
}

const ikili = (d: Pick<DosyaSatiri, 'ozet' | 'boyut' | 'tur'>, ad: string): IkiliCevap => ({
  tur: DOSYA_MIME[d.tur], ad, boyut: d.boyut, akis: (db) => parcalar(db, d.ozet),
});

// Bağı olmayan dosyayı yalnız onu yükleyenler okur (bağlamadan önce önizleme). Bağlanmış dosya bağlayan modülün ucundan okunur.
export async function kendiDosyam(db: Db, kullanici: Kullanici, ozet: string): Promise<IkiliCevap> {
  const dosya = await sorgular.kendiBagsizDosyasi(db, ozet, kullanici.id);
  if (dosya === null) throw bulunamadi('Dosya yok.');
  return ikili(dosya, `${ozet.slice(0, 12)}.${dosya.tur}`);
}

const bagliDosya = (s: BagSatiri): BagliDosya => ({
  ozet: s.ozet, ad: s.ad, boyut: s.boyut, tur: s.tur, belgeTuru: s.belge_turu, ekleyenId: s.ekleyen_id, zaman: s.zaman,
});

export interface BagGirdisi {
  ozet: string;
  kayit: string;
  ad: string;
  belgeTuru: string | null;
}

// Bağlayan, içeriği kendisi göndermiş olmalıdır (kullanıcı kararı: bağlama yetkisi a). Özeti bilmek yetmez: yoksa başka bir kayıtta
// gördüğü dosyayı yazabildiği bir kayda bağlayıp o kaydın okuyanlarına açabilirdi. Bilinmeyen dosya ile aynı ret: özet yoklanamaz.
async function dosyaBagla(db: Db, kullanici: Kullanici, modul: string, g: BagGirdisi, sinir: BagSiniri): Promise<BagliDosya> {
  if (!(await sorgular.yukleyenMi(db, g.ozet, kullanici.id))) throw dogrulama(ILETILER.yuklenmemis, 'ozet');
  const dosya = await sorgular.bagIcinAyir(db, g.ozet);
  if (dosya === null) throw dogrulama(ILETILER.yuklenmemis, 'ozet');
  const ret = bagReddi(dosya, sinir);
  if (ret === 'turIzinsiz') throw dogrulama(ILETILER.turIzinsiz, 'ozet');
  if (ret === 'dosyaBuyuk') throw cokBuyuk(ILETILER.dosyaBuyuk);
  await sorgular.bagYaz(db, { ...g, modul, ad: g.ad.trim(), ekleyenId: kullanici.id });
  const satir = await sorgular.bag(db, modul, g.kayit, g.ozet);
  if (satir === null) throw new Error(`Yazılan bağ okunamadı: ${modul} ${g.kayit} ${g.ozet}`);
  return bagliDosya(satir);
}

// Modül adı tutamakta sabittir: işlevler modül almaz, bir modülün tutamağı başka modülün bağını göremez ve kaldıramaz.
export interface DosyaTutamagi {
  readonly modul: string;
  dosyaBagla(db: Db, kullanici: Kullanici, g: BagGirdisi, sinir: BagSiniri): Promise<BagliDosya>;
  bagKaldir(db: Db, kayit: string, ozet: string | null): Promise<BagliDosya[]>;
  bagliDosyalar(db: Db, kayit: string): Promise<BagliDosya[]>;
  // Yalnız verilen kayda bağlı dosya akar: modül başka kaydın dosyasını kendi ucundan veremez.
  dosyaAkisi(db: Db, kayit: string, ozet: string): Promise<IkiliCevap | null>;
}

const MODUL_KLASORU = join(import.meta.dirname, '..');

function modulKlasoruMu(ad: string): boolean {
  try {
    return statSync(join(MODUL_KLASORU, ad)).isDirectory();
  } catch {
    return false;
  }
}

// Kullanan modül tutamağı yüklenirken alır: adı modül klasörü olmayan tutamak sunucu açılırken hata verir.
export function dosyaTutamagi(modul: string): DosyaTutamagi {
  if (!modulAdiBicimli(modul) || !modulKlasoruMu(modul)) throw new Error(`Dosya tutamağı için modül klasörü yok: ${JSON.stringify(modul)}`);
  return Object.freeze({
    modul,
    dosyaBagla: (db: Db, kullanici: Kullanici, g: BagGirdisi, sinir: BagSiniri) => dosyaBagla(db, kullanici, modul, g, sinir),
    bagKaldir: async (db: Db, kayit: string, ozet: string | null) => (await sorgular.bagSil(db, modul, kayit, ozet)).map(bagliDosya),
    bagliDosyalar: async (db: Db, kayit: string) => (await sorgular.baglar(db, modul, kayit)).map(bagliDosya),
    dosyaAkisi: async (db: Db, kayit: string, ozet: string) => {
      const satir = await sorgular.bag(db, modul, kayit, ozet);
      return satir === null ? null : ikili(satir, satir.ad);
    },
  });
}

// Bağlama ve kaldırma denetim kaydına içeriksiz girer (DS9 a): bağlayan uç `denetimEki` ile kendi kaydına ekler.
export function denetimSatiri(islem: 'bagla' | 'kaldir', d: BagliDosya): DenetimSecimi {
  return { islem, ozet: d.ozet, ad: d.ad, boyut: d.boyut, tur: d.tur };
}
