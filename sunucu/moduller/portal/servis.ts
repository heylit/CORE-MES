import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { AZAMI_EK_BAYT } from '#paylasilan/sozlesme/portal.ts';
import { siparisDonusumGovdesi, siparisEkleGovdesi, teklifEkleGovdesi, teklifGuncelleGovdesi, teklifSurumuGovdesi } from '#paylasilan/sozlesme/siparisler.ts';
import type { BelgeCevabi, BenCevabi, BenHazirlaCevabi, EkCevabi, EkIcerikCevabi, Filtre, KilitCevabi, OdaCevabi, Sira, SorguCevabi, YazGovdesi } from '#paylasilan/sozlesme/portal.ts';
import { firmaNoKoddan } from '../musteri-tedarikci/disari.ts';
import { kisiGorevi, kisileriListele } from '../kisiler/disari.ts';
import { onayLimitleri } from '../satin-alma/disari.ts';
import { malzemeNoKoddan, malzemeOzeti } from '../malzemeler/disari.ts';
import { kabulEt, notluGecis, siparisDonustur, siparisEkle, surumVer, teklifAyrintisi, teklifDurumlari, teklifEkle, teklifGuncelle } from '../siparisler/disari.ts';
import {
  FIYAT_OKU, KURULUM_ISARETI, ONAY_AYAR_YOLU, ONAY_KOLEKSIYONU, onayAcilisReddi, onayBelgesiMi, onayEtkisiReddi, onayGeregi, onayKurallari, onaysizYaziReddi, onayGeregiKarsilaniyorMu, onayKarari, onayYazimiReddi, onayYolu, sonOnay, baslangicBelgeleri, esikleriBindir, bolumOkuyabilirMi, fiyatGizle, gizliAlanlariKoru, islemOkuyabilirMi, bolumYazabilirMi, canliEsler, eklenenKimlikler, kalemKodu, logoNiyetleri, portalKullaniciYolu, portalKullanicisi, portalRolu, portalUnvani, derinBirlestir,
  durumYamala, erisebilirMi, talepKimligi, teklifDurumuBindir, kilitAlinirMi, rolDegisiyorMu, satinAlmaTeslimiReddi, siparisDonusumu, siparisSatirlari, siparisTeklifi, sonParca, sorgula, sozlesmeSiparisi, talepDuzenlemesi, talepTeklifi, teklifAcilisi, teklifAdimlari, ustYolu,
} from './kurallar.ts';
import type { DepoBelgesi, OdaKaydi, OnayKurallari, PortalSatisTeklifi, PortalTeklifTalebi, TeklifAdimi, Veri } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Akış: yetkiyi uç verir; burada kişiye özel alan, sürüm denetimi ve birleştirme uygulanır.

const ISLEM_YAZ = 'portal.yaz';
const ISLEM_YONET = 'portal.yonet';
const SIPARIS_YAZ = 'siparisler.yaz';
// Onaya bağlı kayıtlar (prototipin AP_KIND koleksiyonları; IBAN yalnız onayla değişir, onayGeregi denetler).
const ONAYLI_KOLEKSIYONLAR = new Set(['orders', 'payments', 'contracts', 'priceReqs', 'requests']);

function erisimDenetle(kullanici: Kullanici, yol: string): void {
  if (!erisebilirMi(yol, kullanici.id)) throw yetkiYok('Bu kayıt başka bir kişiye özeldir.');
}

export async function sorgu(
  db: Db, kullanici: Kullanici, k: { koleksiyon: string; filtreler?: Filtre[] | undefined; sira?: Sira | undefined; sinir?: number | undefined },
): Promise<SorguCevabi> {
  erisimDenetle(kullanici, k.koleksiyon);
  // Bölümün okuyamadığı kayıt listeden düşer; 403 dönülmez: prototip her koleksiyonu açılışta okur ve biri hata verirse açılmaz.
  const izinler = portalRolu(kullanici.islemler).tmiIzinler;
  const ham = (await teklifDurumlariniBindir(db, await sorgular.koleksiyonBelgeleri(db, k.koleksiyon)))
    .filter((b) => bolumOkuyabilirMi(b.yol, izinler, b.veri) && islemOkuyabilirMi(b.yol, kullanici.islemler, b.veri));
  const limitler = ham.some((b) => b.yol === ONAY_AYAR_YOLU) ? await onayLimitleri(db) : [];
  // Gizleme süzgeçten önce: fiyatı görmeyen fiyata göre süzüp sıralayarak da gizli değeri çıkaramaz.
  const okunur = ham.map((b) => gizle(esikleriBindir(b, limitler), kullanici));
  const belgeler = sorgula(okunur, {
    ...(k.filtreler === undefined ? {} : { filtreler: k.filtreler }),
    ...(k.sira === undefined ? {} : { sira: k.sira }),
    ...(k.sinir === undefined ? {} : { sinir: k.sinir }),
  });
  return { belgeler, damga: await sorgular.damga(db) };
}

const gizle = (b: DepoBelgesi, kullanici: Kullanici): DepoBelgesi => ({ ...b, veri: fiyatGizle(b.yol, b.veri, kullanici.islemler) });

export async function belgeOku(db: Db, kullanici: Kullanici, yol: string): Promise<BelgeCevabi> {
  erisimDenetle(kullanici, yol);
  const ham = await sorgular.belgeGetir(db, yol);
  const belge = ham === null ? null : (await teklifDurumlariniBindir(db, [ham]))[0] ?? ham;
  if (!bolumOkuyabilirMi(yol, portalRolu(kullanici.islemler).tmiIzinler, belge?.veri ?? null)) {
    throw yetkiYok('Bu portal kaydını görmek için ilgili bölüm yetkiniz yok.');
  }
  if (!islemOkuyabilirMi(yol, kullanici.islemler, belge?.veri ?? null)) throw yetkiYok('Bu kaydı görmek için fiyat ya da finans yetkiniz yok.');
  if (belge === null) return { belge, damga: await sorgular.damga(db) };
  const okunur = belge.yol !== ONAY_AYAR_YOLU ? belge : esikleriBindir(belge, await onayLimitleri(db));
  return { belge: gizle(okunur, kullanici), damga: await sorgular.damga(db) };
}

// Portal kişiyi TMI oturumundan tanır: belgeye yeni yazılan "kim yaptı" değeri başka bir portal kullanıcısı olamaz.
// Firma kimlikleri (users/ altında belgesi olmayan değerler) serbesttir.
async function kimlikDenetle(db: Db, kullanici: Kullanici, eski: Veri | null, yeni: Veri): Promise<void> {
  const kendi = sonParca(portalKullaniciYolu(kullanici.id));
  const yabanci = eklenenKimlikler(eski, yeni).filter((d) => d !== kendi);
  if (yabanci.length === 0) return;
  if ((await sorgular.varOlanYollar(db, yabanci.map((d) => `users/${d}`))).length > 0) {
    throw yetkiYok('Başka bir kişi adına kayıt yazılamaz.');
  }
}

function rolDenetle(yol: string, eski: Veri | null, yeni: Veri): void {
  if (rolDegisiyorMu(yol, eski, yeni)) throw yetkiYok('Portal rolü TMI rolünden gelir; burada değiştirilemez.');
}

function teslimDenetle(yol: string, eski: Veri | null, yeni: Veri): void {
  const red = satinAlmaTeslimiReddi(yol, eski, yeni);
  if (red !== null) throw yetkiYok(red);
}

async function onayKurallariOku(db: Db): Promise<OnayKurallari> {
  return onayKurallari((await sorgular.belgeGetir(db, ONAY_AYAR_YOLU))?.veri ?? null, await onayLimitleri(db));
}

// Onay adımlarını prototip rol adıyla eşler; açanın rolü portal kullanıcısındadır (yalnız sunucu yazar, rolDegisiyorMu).
async function portalRolAdi(db: Db, kullaniciKimligi: unknown): Promise<string> {
  const rol = typeof kullaniciKimligi === 'string' ? (await sorgular.belgeGetir(db, `users/${kullaniciKimligi}`))?.veri['role'] : undefined;
  return typeof rol === 'string' ? rol : '';
}

// Onay kaydı ve onay bekleyen kayıt (kart #1583): karar onay ucundadır; genel yazma kararı taklit edemez. Adım zinciri sunucunun
// hesabıdır (B8): açılışta zincir, onaysız yazıda onay gereği, etkide kaydın bugünkü değeri denetlenir.
async function onayDenetle(db: Db, kullanici: Kullanici, yol: string, eski: Veri | null, yeni: Veri | null): Promise<void> {
  const red = onayYazimiReddi(yol, eski, yeni, sonParca(portalKullaniciYolu(kullanici.id)));
  if (red !== null) throw yetkiYok(red);
  if (yeni === null) return;
  const rol = portalRolu(kullanici.islemler).role;
  if (onayBelgesiMi(yol)) {
    if (eski !== null) return;
    const tur = yeni['kind'];
    const kayitYolu = tur === 'pricereq' ? `priceReqs/${String(yeni['refId'])}` : tur === 'contract' ? `contracts/${String(yeni['refId'])}` : null;
    const kayit = kayitYolu === null ? null : (await sorgular.belgeGetir(db, kayitYolu))?.veri ?? null;
    const acilisReddi = onayAcilisReddi(yeni, kayit, await onayKurallariOku(db), rol);
    if (acilisReddi !== null) throw yetkiYok(acilisReddi);
    return;
  }
  let kurallar: OnayKurallari | null = null;
  const kurallariAl = async (): Promise<OnayKurallari> => (kurallar ??= await onayKurallariOku(db));
  const gerek = onayGeregi(yol, eski, yeni);
  if (gerek === null) {
    if (!ONAYLI_KOLEKSIYONLAR.has(yol.split('/')[0] ?? '')) return;
    const onaysiz = onaysizYaziReddi(yol, eski, yeni, await kurallariAl(), rol);
    if (onaysiz !== null) throw yetkiYok(onaysiz);
    return;
  }
  if ('red' in gerek) throw yetkiYok(gerek.red);
  const onay = 'onayKimligi' in gerek
    ? (await sorgular.belgeGetir(db, onayYolu(gerek.onayKimligi)))?.veri ?? null
    : sonOnay((await sorgular.koleksiyonBelgeleri(db, ONAY_KOLEKSIYONU)).map((b) => b.veri), gerek.refCol, gerek.refId, gerek.tur);
  if (!onayGeregiKarsilaniyorMu(onay, gerek.sonuc)) throw yetkiYok('Onay bekleyen kaydın onay durumu yalnız onay kararıyla değişir.');
  if (onay === null) return;
  const etkiReddi = onayEtkisiReddi(yol, eski, yeni, onay, await kurallariAl(), await portalRolAdi(db, onay['requestedBy']));
  if (etkiReddi !== null) throw yetkiYok(etkiReddi);
}


function bolumDenetle(kullanici: Kullanici, yol: string, eski: Veri | null, yeni: Veri | null): void {
  if (!bolumYazabilirMi(yol, kullanici.id, portalRolu(kullanici.islemler).tmiIzinler, eski, yeni)) {
    throw yetkiYok('Bu portal kaydını değiştirmek için ilgili bölüm yetkiniz yok.');
  }
}

export async function belgeYaz(db: Db, kullanici: Kullanici, g: YazGovdesi): Promise<BelgeCevabi> {
  erisimDenetle(kullanici, g.yol);
  const mevcut = await sorgular.belgeKilitle(db, g.yol);
  if (g.beklenenSurum !== undefined && (mevcut?.surum ?? null) !== g.beklenenSurum) {
    throw cakisma('Kayıt siz açtıktan sonra değişti; sayfayı yenileyip yeniden deneyin.');
  }
  let veri: Veri = g.veri;
  if (g.kip === 'birlestir') {
    if (mevcut === null) throw bulunamadi('Güncellenecek kayıt yok.');
    veri = derinBirlestir(mevcut.veri, g.veri);
  }
  veri = gizliAlanlariKoru(g.yol, mevcut?.veri ?? null, veri, kullanici.islemler);
  await kimlikDenetle(db, kullanici, mevcut?.veri ?? null, veri);
  rolDenetle(g.yol, mevcut?.veri ?? null, veri);
  teslimDenetle(g.yol, mevcut?.veri ?? null, veri);
  bolumDenetle(kullanici, g.yol, mevcut?.veri ?? null, veri);
  await onayDenetle(db, kullanici, g.yol, mevcut?.veri ?? null, veri);
  const belge = await sorgular.belgeYaz(db, { yol: g.yol, ust: ustYolu(g.yol), kimlik: sonParca(g.yol), veri, kisiId: kullanici.id });
  await logoSirasinaEkle(db, g.yol, mevcut?.veri ?? null, veri);
  // Adımlar Siparişler'deki durumla karşılaştırılır: prototip okuduğu durumu geri yazınca Siparişler'e yeni geçiş gitmez.
  const siparisteki = mevcut === null ? null : ((await teklifDurumlariniBindir(db, [mevcut]))[0] ?? mevcut).veri;
  await siparislereAktar(db, kullanici, g.yol, siparisteki, veri);
  return { belge: gizle(belge, kullanici), damga: belge.surum };
}

// Bağlı talebin durumu Siparişler'den okunur (254 a); bağsız talep ve öteki belgeler olduğu gibi kalır.
async function teklifDurumlariniBindir(db: Db, belgeler: DepoBelgesi[]): Promise<DepoBelgesi[]> {
  const yollar = belgeler.filter((b) => talepKimligi(b.yol) !== null).map((b) => b.yol);
  if (yollar.length === 0) return belgeler;
  const baglar = await sorgular.siparisBaglari(db, yollar);
  const durumlar = await teklifDurumlari(db, [...new Set(baglar.values())]);
  return belgeler.map((b) => {
    const teklifId = baglar.get(b.yol);
    return teklifDurumuBindir(b, teklifId === undefined ? undefined : durumlar.get(teklifId));
  });
}

export async function belgeSil(db: Db, kullanici: Kullanici, yol: string): Promise<{ silindi: boolean; damga: number }> {
  erisimDenetle(kullanici, yol);
  const mevcut = (await sorgular.belgeKilitle(db, yol))?.veri ?? null;
  bolumDenetle(kullanici, yol, mevcut, null);
  await onayDenetle(db, kullanici, yol, mevcut, null);
  const silindi = await sorgular.belgeSil(db, yol);
  return { silindi, damga: await sorgular.damga(db) };
}

// Belge yoksa boş gövdeyle açılır; kilit verisi verildiyse belgeye birleşir.
export async function kilitle(db: Db, kullanici: Kullanici, g: { yol: string; sahip: string; sureMs: number; veri?: Veri | undefined }): Promise<KilitCevabi> {
  erisimDenetle(kullanici, g.yol);
  const mevcut = await sorgular.belgeKilitle(db, g.yol);
  bolumDenetle(kullanici, g.yol, mevcut?.veri ?? null, g.veri ?? null);
  const simdi = await sorgular.simdiMs(db);
  if (mevcut !== null && !kilitAlinirMi({ sahip: mevcut.kilitSahibi, bitis: mevcut.kilitBitis }, g.sahip, simdi)) {
    return { alindi: false, surum: null, bitis: await sorgular.kilitBitisi(db, g.yol) };
  }
  if (mevcut === null || g.veri !== undefined) {
    const veri = gizliAlanlariKoru(g.yol, mevcut?.veri ?? null, derinBirlestir(mevcut?.veri ?? {}, g.veri ?? {}), kullanici.islemler);
    await kimlikDenetle(db, kullanici, mevcut?.veri ?? null, veri);
    rolDenetle(g.yol, mevcut?.veri ?? null, veri);
    teslimDenetle(g.yol, mevcut?.veri ?? null, veri);
    await onayDenetle(db, kullanici, g.yol, mevcut?.veri ?? null, veri);
    await sorgular.belgeYaz(db, { yol: g.yol, ust: ustYolu(g.yol), kimlik: sonParca(g.yol), veri, kisiId: kullanici.id });
    await logoSirasinaEkle(db, g.yol, mevcut?.veri ?? null, veri);
    await siparislereAktar(db, kullanici, g.yol, mevcut?.veri ?? null, veri);
  }
  const kilit = await sorgular.kilitYaz(db, g.yol, g.sahip, g.sureMs);
  return { alindi: true, surum: kilit.surum, bitis: kilit.bitis };
}

// Onay kararı: kişi, zaman ve adım rolü sunucudan. Prototipin karar sonrası işleri (siparişin onay durumu gibi) genel yazmayla gelir
// ve onayDenetle bu kayda bakar.
export async function onayKarariVer(db: Db, kullanici: Kullanici, kimlik: string, g: { onay: boolean; not: string }): Promise<BelgeCevabi> {
  const yol = onayYolu(kimlik);
  const mevcut = await sorgular.belgeKilitle(db, yol);
  if (mevcut === null) throw bulunamadi('Onay kaydı bulunamadı.');
  const an = new Date(await sorgular.simdiMs(db)).toISOString();
  const sonuc = onayKarari(mevcut.veri, { ...g, kendi: sonParca(portalKullaniciYolu(kullanici.id)), rol: portalRolu(kullanici.islemler), an });
  if ('hata' in sonuc) {
    if (sonuc.hata === 'durum') throw cakisma(sonuc.ileti);
    if (sonuc.hata === 'yetki') throw yetkiYok(sonuc.ileti);
    throw dogrulama(sonuc.ileti, 'not');
  }
  const belge = await sorgular.belgeYaz(db, { yol, ust: ustYolu(yol), kimlik: sonParca(yol), veri: sonuc.veri, kisiId: kullanici.id });
  return { belge, damga: belge.surum };
}

export async function damga(db: Db): Promise<{ damga: number }> {
  return { damga: await sorgular.damga(db) };
}

export async function ben(db: Db, kullanici: Kullanici): Promise<BenCevabi> {
  const kurulumGerekli = KURULUM_ISARETI !== null && (await sorgular.varOlanYollar(db, [KURULUM_ISARETI])).length === 0;
  const portalKullanicisiVar = (await sorgular.varOlanYollar(db, [portalKullaniciYolu(kullanici.id)])).length > 0;
  return {
    kisi: { id: kullanici.id, ad: kullanici.ad },
    yazabilir: kullanici.islemler.includes(ISLEM_YAZ),
    yonetici: kullanici.islemler.includes(ISLEM_YONET),
    kurulumGerekli,
    portalKullanicisi: portalKullanicisiVar,
  };
}

// Yalnız kişinin kendi firma kullanıcısı. Yoksa kurulur; varsa yalnız rol ve izinleri TMI rolüne göre güncellenir
// (adı ya da prototipte değiştirilen tercihleri ezilmez). Her açılışta çağrılır: TMI'de rol değişince portal da izler.
export async function benHazirla(db: Db, kullanici: Kullanici): Promise<BenHazirlaCevabi> {
  if (!kullanici.islemler.some((i) => i === 'portal.oku' || i === ISLEM_YAZ)) throw yetkiYok();
  const rol = portalRolu(kullanici.islemler);
  const unvan = portalUnvani(await kisiGorevi(db, kullanici.id), rol);
  const yol = portalKullaniciYolu(kullanici.id);
  const mevcut = await sorgular.belgeKilitle(db, yol);
  if (mevcut === null) {
    const b = portalKullanicisi({ id: kullanici.id, ad: kullanici.ad }, await sorgular.simdiMs(db), rol, unvan);
    await sorgular.belgeYaz(db, { yol: b.yol, ust: ustYolu(b.yol), kimlik: sonParca(b.yol), veri: b.veri, kisiId: kullanici.id });
    return { kuruldu: true };
  }
  const guncel = { ...mevcut.veri, ...rol, unvan };
  if (rolDegisiyorMu(yol, mevcut.veri, guncel)) {
    await sorgular.belgeYaz(db, { yol, ust: ustYolu(yol), kimlik: sonParca(yol), veri: guncel, kisiId: kullanici.id });
  }
  return { kuruldu: false };
}

// Prototiplerin kişi seçimi ve adları için aktif kişiler; adı başka modülün (kisiler) tek kaynağından gelir.
export async function kisiler(db: Db): Promise<{ kisiler: { id: number; ad: string }[] }> {
  return { kisiler: (await kisileriListele(db)).filter((k) => k.aktif).map(({ id, ad }) => ({ id, ad })) };
}

// Yalnız işaret belgesi yokken; var olan belge üzerine yazılmaz.
export async function kurulum(db: Db, kullanici: Kullanici): Promise<{ kurulan: number }> {
  if (KURULUM_ISARETI === null || (await sorgular.varOlanYollar(db, [KURULUM_ISARETI])).length > 0) return { kurulan: 0 };
  const belgeler = baslangicBelgeleri({ id: kullanici.id, ad: kullanici.ad }, await sorgular.simdiMs(db), portalRolu(kullanici.islemler));
  const varOlan = new Set(await sorgular.varOlanYollar(db, belgeler.map((b) => b.yol)));
  let kurulan = 0;
  for (const b of belgeler) {
    if (varOlan.has(b.yol)) continue;
    await sorgular.belgeYaz(db, { yol: b.yol, ust: ustYolu(b.yol), kimlik: sonParca(b.yol), veri: b.veri, kisiId: kullanici.id });
    kurulan += 1;
  }
  return { kurulan };
}

// Oda kalıcı değildir: süreç belleğinde durur (TMI tek sunucudur). Okuma ucunda yazılır; veritabanına dokunmaz.
const oda = new Map<number, OdaKaydi>();

export function odaGuncelle(kullanici: Kullanici, yama: Veri | undefined, simdi = Date.now()): OdaCevabi {
  const eski = oda.get(kullanici.id);
  oda.set(kullanici.id, { durum: durumYamala(eski?.durum ?? {}, yama ?? {}), guncellendi: simdi });
  for (const [kisiId, k] of oda) if (simdi - k.guncellendi > 10 * 60_000) oda.delete(kisiId);
  return { esler: canliEsler(oda, simdi) };
}

export async function ekYukle(db: Db, kullanici: Kullanici, g: { ad: string; tur: string; veri: string }): Promise<EkCevabi> {
  const icerik = Buffer.from(g.veri, 'base64');
  if (icerik.length === 0) throw dogrulama('Dosya boş.', 'veri');
  if (icerik.length > AZAMI_EK_BAYT) throw dogrulama('Dosya bu modülde en çok 700 KB olabilir.', 'veri');
  return sorgular.ekEkle(db, { ad: g.ad, tur: g.tur, icerik, kisiId: kullanici.id });
}

export async function ekOku(db: Db, id: string): Promise<EkIcerikCevabi> {
  const ek = await sorgular.ekGetir(db, id);
  if (ek === null) throw bulunamadi('Dosya bulunamadı.');
  return { id: ek.id, ad: ek.ad, tur: ek.tur, boyut: ek.boyut, veri: ek.icerik.toString('base64') };
}

// ---- Logo satış bağı (kart #941). Sıra belgeyle aynı işlemde yazılır; Logo işi sırayı disari.ts işlevleriyle okur ve sonucu yazar.
// Tipler logo modülünün SatisKaynagi arayüzüyle yapısal olarak aynıdır (logo iç tipi ithal edilmez).

async function logoSirasinaEkle(db: Db, yol: string, eski: Veri | null, yeni: Veri): Promise<void> {
  for (const n of logoNiyetleri(yol, eski, yeni)) {
    if (n.tur === 'teklif') {
      await sorgular.logoSirasinaEkle(db, { tur: 'teklif', belgeYol: n.yol, teklifSurumu: n.surum, teklifId: null });
    } else if (n.tur === 'tekliften-siparis') {
      const teklifId = await sorgular.logoSirasinaEkle(db, { tur: 'teklif', belgeYol: n.talepYol, teklifSurumu: n.surum, teklifId: null });
      await sorgular.logoSirasinaEkle(db, { tur: 'siparis', belgeYol: n.siparisYol, teklifSurumu: null, teklifId });
    } else if (n.kaynakNo === null || !(await sorgular.talepNoVarMi(db, n.kaynakNo))) {
      // Tekliften açılan sipariş talebin "ordered" yazısıyla sıraya girer; burada yalnız tekliften gelmeyen sipariş.
      const teklifId = await sorgular.logoSirasinaEkle(db, { tur: 'teklif', belgeYol: n.yol, teklifSurumu: null, teklifId: null });
      await sorgular.logoSirasinaEkle(db, { tur: 'siparis', belgeYol: n.yol, teklifSurumu: null, teklifId });
    }
  }
}

// ---- Siparişler bağı (soru 148). Talep, sonraki sürüm, kabul, revizyon, red ve siparişe dönüşüm belgeyle aynı işlemde Siparişler'e
// yazılır; Siparişler reddederse belge de yazılmaz.
// Yetki burada denetlenir (Siparişler disari.ts denetlemez): Portal'da talebi açan Siparişler'e de yazar.

const SIPARISLER_YETKISI = 'Teklif talebi Siparişler\'dedir; Siparişler yazma yetkiniz yok.';

async function siparislereAktar(db: Db, kullanici: Kullanici, yol: string, eski: Veri | null, yeni: Veri): Promise<void> {
  await siparisAc(db, kullanici, yol, eski, yeni);
  await sozlesmeSiparisiAc(db, kullanici, yol, eski, yeni);
  const talep = teklifAcilisi(yol, eski, yeni);
  const duzenleme = talepDuzenlemesi(yol, eski, yeni);
  const adimlar = teklifAdimlari(yol, eski, yeni);
  if (talep === null && duzenleme === null && adimlar.length === 0) return;
  // Köprüden önce yazılmış talebin bağı yoktur; Portal'da kalır.
  const bag = talep === null ? await sorgular.siparisBagi(db, yol) : null;
  if (talep === null && bag === null) return;
  if (!kullanici.islemler.includes(SIPARIS_YAZ)) throw yetkiYok(SIPARISLER_YETKISI);
  const teklifId = talep === null ? bag?.teklifId ?? 0 : await teklifAc(db, kullanici, yol, talep);
  if (duzenleme !== null) await talebiGuncelle(db, kullanici, teklifId, duzenleme);
  for (const adim of adimlar) await teklifAdimiUygula(db, kullanici, teklifId, adim);
}

async function siparisAc(db: Db, kullanici: Kullanici, yol: string, eski: Veri | null, yeni: Veri): Promise<void> {
  const d = siparisDonusumu(yol, eski, yeni);
  if (d === null) return;
  const talepYol = await sorgular.talepYolu(db, d.talepNo);
  const bag = talepYol === null ? null : await sorgular.siparisBagi(db, talepYol);
  if (talepYol === null || bag === null) return;
  if (!kullanici.islemler.includes(SIPARIS_YAZ)) throw yetkiYok(SIPARISLER_YETKISI);
  const t = await teklifAyrintisi(db, bag.teklifId);
  const govde = siparisDonusumGovdesi.safeParse({ surum: t.surum, siparisTarihi: d.siparisTarihi, termin: d.termin, kdvOrani: d.kdvOrani });
  if (!govde.success) throw dogrulama(govde.error.issues[0]?.message ?? 'Sipariş Siparişler\'in kurallarına uymuyor.', 'promisedDate');
  const { siparisId } = await siparisDonustur(db, kullanici, bag.teklifId, govde.data);
  await sorgular.siparisBagla(db, talepYol, siparisId, yol);
}

// Sipariş satırı malzeme kartı ister; kodu kartta olmayan kalem Portal'da da sipariş açtırmaz. Fiyatı yalnız fiyat gören yazar (201 a).
async function sozlesmeSiparisiAc(db: Db, kullanici: Kullanici, yol: string, eski: Veri | null, yeni: Veri): Promise<void> {
  const s = sozlesmeSiparisi(yol, eski, yeni);
  if (s === null) return;
  if (!kullanici.islemler.includes(SIPARIS_YAZ)) throw yetkiYok(SIPARISLER_YETKISI);
  const firmaId = await firmaNo(db, s.firmaKimligi);
  if (firmaId === null) throw dogrulama('Müşteri kartı finans firmasına bağlı değil; sipariş açılamaz.', 'partyId');
  const fiyatYazar = kullanici.islemler.includes(FIYAT_OKU);
  const satirlar = [];
  for (const k of s.satirlar) {
    const malzemeNo = k.kod === null ? null : await malzemeNoKoddan(db, k.kod);
    if (malzemeNo === null) throw dogrulama(`"${k.tanim}" kaleminin kodu malzeme kartında yok; sipariş açılamaz.`, 'items');
    satirlar.push({ malzemeNo, miktar: k.miktar, birimFiyat: fiyatYazar ? k.birimFiyat : null });
  }
  const govde = siparisEkleGovdesi.safeParse({
    firmaId, musteriSiparisNo: s.sozlesmeNo, siparisTarihi: s.siparisTarihi, termin: s.termin, paraBirimi: s.paraBirimi,
    kdvOrani: s.kdvOrani, odemeKosulu: s.odemeKosulu, satirlar,
  });
  if (!govde.success) throw dogrulama(govde.error.issues[0]?.message ?? 'Sipariş Siparişler\'in kurallarına uymuyor.', 'items');
  await siparisEkle(db, kullanici, govde.data, fiyatYazar);
}

async function talepAlanlari(db: Db, talep: PortalTeklifTalebi) {
  const firmaId = await firmaNo(db, talep.firmaKimligi);
  if (firmaId === null) throw dogrulama('Müşteri kartı finans firmasına bağlı değil; teklif talebi açılamaz.', 'customerId');
  const satirlar = [];
  // Kod malzeme kartında yoksa kalem tanımla girer; kart Siparişler'de bağlanır.
  for (const s of talep.satirlar) satirlar.push({ malzemeNo: s.kod === null ? null : await malzemeNoKoddan(db, s.kod), tanim: s.tanim, miktar: s.miktar });
  return { firmaId, baslik: talep.baslik, paraBirimi: talep.paraBirimi, istenenTarih: talep.istenenTarih, aciklama: talep.aciklama, satirlar };
}

async function teklifAc(db: Db, kullanici: Kullanici, yol: string, talep: PortalTeklifTalebi): Promise<number> {
  const govde = teklifEkleGovdesi.safeParse(await talepAlanlari(db, talep));
  if (!govde.success) throw dogrulama(govde.error.issues[0]?.message ?? 'Teklif talebi Siparişler\'in kurallarına uymuyor.', 'items');
  const teklif = await teklifEkle(db, kullanici, govde.data);
  await sorgular.siparisBagiYaz(db, yol, teklif.id);
  return teklif.id;
}

async function talebiGuncelle(db: Db, kullanici: Kullanici, id: number, talep: PortalTeklifTalebi): Promise<void> {
  const t = await teklifAyrintisi(db, id);
  const govde = teklifGuncelleGovdesi.safeParse({ ...(await talepAlanlari(db, talep)), surum: t.surum });
  if (!govde.success) throw dogrulama(govde.error.issues[0]?.message ?? 'Teklif talebi Siparişler\'in kurallarına uymuyor.', 'items');
  await teklifGuncelle(db, kullanici, id, govde.data);
}

// Her adım teklifin o anki sürümüyle yazılır; Siparişler'in geçiş reddi (409) belgeyi de geri alır.
async function teklifAdimiUygula(db: Db, kullanici: Kullanici, id: number, adim: TeklifAdimi): Promise<void> {
  const t = await teklifAyrintisi(db, id);
  if (adim.tur === 'kabul') { await kabulEt(db, kullanici, id, { surum: t.surum, surumNo: adim.surumNo }); return; }
  if (adim.tur !== 'surum') { await notluGecis(db, kullanici, id, adim.tur, { surum: t.surum, not: adim.not }); return; }
  // Prototip fiyatı kalem sırasıyla tutar; talep satırları Siparişler'e aynı sırayla yazıldı.
  const govde = teklifSurumuGovdesi.safeParse({
    surum: t.surum, fiyatlar: t.satirlar.map((s, i) => ({ satirId: s.id, birimFiyat: adim.fiyatlar[i] ?? '' })), iskontoOrani: adim.iskontoOrani,
    teslimGun: adim.teslimGun, odemeKosulu: adim.odemeKosulu, gecerlilik: adim.gecerlilik, aciklama: adim.aciklama,
  });
  if (!govde.success) throw dogrulama(govde.error.issues[0]?.message ?? 'Teklif sürümü Siparişler\'in kurallarına uymuyor.', 'versions');
  await surumVer(db, kullanici, id, govde.data);
}

export interface PortalLogoTeklifi {
  id: number; no: string; tarih: string; gecerlilikBitis: string | null; paraBirimi: string; kur: string | null; firmaId: number | null;
  satirlar: { satirId: number; stokKodu: string | null; hizmet: boolean; miktar: string; birim: string; birimFiyat: string; iskontoYuzdesi: string | null; termin: string | null }[];
}
export interface PortalLogoSiparisi {
  id: number; no: string; tarih: string; teklifKayitNo: string | null;
  satirlar: { satirId: number; teklifSatirRef: string | null; miktar: string; termin: string | null }[];
}
export type PortalLogoSonucu = { kayitNo: string; satirlar: { satirId: number; logoSatirRef: string }[] } | { hata: string };

// Portal firma kartı finans firmasına firma koduyla bağlanır: kartın firmaKodu alanı, yoksa kart kimliği.
async function firmaNo(db: Db, firmaKimligi: string | null): Promise<number | null> {
  if (firmaKimligi === null) return null;
  const kart = await sorgular.belgeGetir(db, `parties/${firmaKimligi}`);
  const kod = typeof kart?.veri['firmaKodu'] === 'string' && kart.veri['firmaKodu'].trim() !== '' ? kart.veri['firmaKodu'] : firmaKimligi;
  return firmaNoKoddan(db, kod);
}

async function logoSatirlari(db: Db, t: PortalSatisTeklifi, katalog: Veri[]): Promise<PortalLogoTeklifi['satirlar']> {
  const satirlar: PortalLogoTeklifi['satirlar'] = [];
  for (const k of t.kalemler) {
    const kod = kalemKodu(k, t.firmaKimligi, katalog);
    const no = kod === null ? null : await malzemeNoKoddan(db, kod);
    const kart = no === null ? null : await malzemeOzeti(db, no);
    satirlar.push({
      satirId: k.satirId, stokKodu: kart?.kod ?? null, hizmet: kart?.tur === 'hizmet', miktar: k.miktar ?? '0', birim: kart?.birim ?? k.birim,
      birimFiyat: k.birimFiyat ?? '', iskontoYuzdesi: k.iskontoYuzdesi, termin: k.termin,
    });
  }
  return satirlar;
}

// Finans firmasına bağlanmamış firmanın teklifi ve silinmiş belge gönderilmez (logo isteği, madde 2); satır nedeniyle "hata" olur ve
// bekleyenlerin arkasına geçer, firma sonradan bağlanırsa yeniden denenir.
export async function logoyaGidecekSatisTeklifleri(db: Db, sinir: number): Promise<PortalLogoTeklifi[]> {
  const sonuc: PortalLogoTeklifi[] = [];
  let katalog: Veri[] | null = null;
  for (const s of await sorgular.logoyaGidecekTeklifSiralari(db, sinir)) {
    const belge = await sorgular.belgeGetir(db, s.belgeYol);
    const t = belge === null ? null : s.teklifSurumu === null ? siparisTeklifi(belge.veri) : talepTeklifi(belge.veri, s.teklifSurumu);
    if (t === null) { await sorgular.logoHatasiYaz(db, 'teklif', s.id, 'Portal belgesi silinmiş ya da teklif okunamadı.'); continue; }
    const firmaId = await firmaNo(db, t.firmaKimligi);
    if (firmaId === null) { await sorgular.logoHatasiYaz(db, 'teklif', s.id, 'Firma kartı finans firmasına bağlı değil.'); continue; }
    katalog ??= (await sorgular.koleksiyonBelgeleri(db, 'catalog')).map((b) => b.veri);
    sonuc.push({
      id: s.id, no: t.no, tarih: t.tarih ?? '', gecerlilikBitis: t.gecerlilikBitis, paraBirimi: t.paraBirimi, kur: null, firmaId,
      satirlar: await logoSatirlari(db, t, katalog),
    });
  }
  return sonuc;
}

export async function logoyaGidecekSatisSiparisleri(db: Db, sinir: number): Promise<PortalLogoSiparisi[]> {
  const sonuc: PortalLogoSiparisi[] = [];
  for (const s of await sorgular.logoyaGidecekSiparisSiralari(db, sinir)) {
    const belge = await sorgular.belgeGetir(db, s.belgeYol);
    const sp = belge === null ? null : siparisSatirlari(belge.veri, s.teklifRefleri);
    if (sp === null) { await sorgular.logoHatasiYaz(db, 'siparis', s.id, 'Portal siparişi silinmiş ya da okunamadı.'); continue; }
    sonuc.push({ id: s.id, no: sp.no, tarih: sp.tarih ?? '', teklifKayitNo: s.teklifKayitNo, satirlar: sp.satirlar });
  }
  return sonuc;
}

async function logoSonucuYaz(db: Db, tur: 'teklif' | 'siparis', id: number, sonuc: PortalLogoSonucu): Promise<void> {
  if ('hata' in sonuc) { await sorgular.logoHatasiYaz(db, tur, id, sonuc.hata); return; }
  const refler = Object.fromEntries(sonuc.satirlar.map((r) => [String(r.satirId), r.logoSatirRef]));
  if (!(await sorgular.logoBasarisiYaz(db, tur, id, sonuc.kayitNo, refler))) {
    throw gecersiz(`Portal Logo sırası ${String(id)} bulunamadı ya da başka bir Logo kaydıyla gönderilmiş.`);
  }
}

export const satisTeklifiLogoSonucu = (db: Db, id: number, sonuc: PortalLogoSonucu): Promise<void> => logoSonucuYaz(db, 'teklif', id, sonuc);
export const satisSiparisiLogoSonucu = (db: Db, id: number, sonuc: PortalLogoSonucu): Promise<void> => logoSonucuYaz(db, 'siparis', id, sonuc);
