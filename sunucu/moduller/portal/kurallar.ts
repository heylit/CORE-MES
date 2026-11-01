import { AZAMI_SINIR } from '#paylasilan/sozlesme/portal.ts';
import type { Filtre, Sira } from '#paylasilan/sozlesme/portal.ts';
import type { TeklifDurumu } from '#paylasilan/sozlesme/siparisler.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';

// Belge deposunun kuralları: yol, kişiye özel alan, birleştirme, sorgu, kilit, oda. Saf; veritabanı ve saat yok.

export type Veri = Record<string, unknown>;
export interface DepoBelgesi { yol: string; kimlik: string; veri: Veri; surum: number }

export const parcalar = (yol: string): string[] => yol.split('/');
export const ustYolu = (yol: string): string => parcalar(yol).slice(0, -1).join('/');
export const sonParca = (yol: string): string => parcalar(yol).at(-1) ?? '';

// Kişiye özel alan: `data/users/<kişi>/...` yalnız o kişiye açıktır (prototiplerin sözleşmesi). `data/users`un kendisi
// kimseye açık değildir: kişiler birbirinin kimliğini oradan listeleyemez.
export function erisebilirMi(yol: string, kisiId: number): boolean {
  const p = parcalar(yol);
  if (p[0] !== 'data' || p.length < 2 || p[1] !== 'users') return true;
  return p.length >= 3 && p[2] === String(kisiId);
}

const duzNesneMi = (d: unknown): d is Veri => d !== null && typeof d === 'object' && !Array.isArray(d);

// İç içe nesneler birleşir; dizi ve öteki her değer alanı olduğu gibi değiştirir. Girdiler değişmez.
export function derinBirlestir(hedef: Veri, yama: Veri): Veri {
  const sonuc: Veri = { ...hedef };
  for (const [anahtar, deger] of Object.entries(yama)) {
    const eski = sonuc[anahtar];
    sonuc[anahtar] = duzNesneMi(deger) && duzNesneMi(eski) ? derinBirlestir(eski, deger) : deger;
  }
  return sonuc;
}

// Tür sırası: null < mantıksal < sayı < metin < dizi < nesne. Aynı türde doğal sıra; dizi ve nesne metniyle.
function turSirasi(d: unknown): number {
  if (d === null) return 0;
  if (typeof d === 'boolean') return 1;
  if (typeof d === 'number') return 2;
  if (typeof d === 'string') return 3;
  if (Array.isArray(d)) return 4;
  return 5;
}

export function karsilastir(a: unknown, b: unknown): number {
  const ta = turSirasi(a);
  const tb = turSirasi(b);
  if (ta !== tb) return ta - tb;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  return ja < jb ? -1 : ja > jb ? 1 : 0;
}

const esitMi = (a: unknown, b: unknown): boolean => turSirasi(a) === turSirasi(b) && karsilastir(a, b) === 0;

// Alanı olmayan belge hiçbir koşula uymaz (eşit değil koşulu dahil).
export function uyarMi(veri: Veri, f: Filtre): boolean {
  if (!Object.hasOwn(veri, f.alan)) return false;
  const d = veri[f.alan];
  switch (f.islec) {
    case '==': return esitMi(d, f.deger);
    case '!=': return !esitMi(d, f.deger);
    case '<': return turSirasi(d) === turSirasi(f.deger) && karsilastir(d, f.deger) < 0;
    case '<=': return turSirasi(d) === turSirasi(f.deger) && karsilastir(d, f.deger) <= 0;
    case '>': return turSirasi(d) === turSirasi(f.deger) && karsilastir(d, f.deger) > 0;
    case '>=': return turSirasi(d) === turSirasi(f.deger) && karsilastir(d, f.deger) >= 0;
    case 'in': return Array.isArray(f.deger) && f.deger.some((x) => esitMi(d, x));
    case 'not-in': return Array.isArray(f.deger) && !f.deger.some((x) => esitMi(d, x));
    case 'array-contains': return Array.isArray(d) && d.some((x) => esitMi(x, f.deger));
  }
}

export interface SorguKosulu { filtreler?: readonly Filtre[]; sira?: Sira; sinir?: number }

// Sırasız sorgu kimliğe göre artan döner. Sıralama alanı olmayan belge sona düşer; eşitlikte kimlik belirler.
export function sorgula<T extends DepoBelgesi>(belgeler: readonly T[], kosul: SorguKosulu): T[] {
  const uyan = belgeler.filter((b) => (kosul.filtreler ?? []).every((f) => uyarMi(b.veri, f)));
  const kimlikle = (a: T, b: T): number => (a.kimlik < b.kimlik ? -1 : a.kimlik > b.kimlik ? 1 : 0);
  const sira = kosul.sira;
  const sirali = [...uyan].sort((a, b) => {
    if (sira === undefined) return kimlikle(a, b);
    const varA = Object.hasOwn(a.veri, sira.alan);
    const varB = Object.hasOwn(b.veri, sira.alan);
    if (varA !== varB) return varA ? -1 : 1;
    const fark = varA ? karsilastir(a.veri[sira.alan], b.veri[sira.alan]) : 0;
    return (sira.yon === 'desc' ? -fark : fark) || kimlikle(a, b);
  });
  return sirali.slice(0, Math.min(kosul.sinir ?? AZAMI_SINIR, AZAMI_SINIR));
}

// Kilit kısa süreli ve işbirliğine dayalıdır: süresi geçmiş ya da aynı sahibin kilidi yeniden alınır.
export function kilitAlinirMi(mevcut: { sahip: string | null; bitis: number | null }, sahip: string, simdi: number): boolean {
  return mevcut.sahip === null || mevcut.bitis === null || mevcut.bitis <= simdi || mevcut.sahip === sahip;
}

// Oda: sayfası o an açık olanlar. Durum yaması birleşir; null değer alanı siler. Son görülmeden bu yana süre geçen düşer.
export const ODA_SURESI_MS = 45_000;
export interface OdaKaydi { durum: Veri; guncellendi: number }

export function durumYamala(eski: Veri, yama: Veri): Veri {
  const yeni: Veri = { ...eski };
  for (const [anahtar, deger] of Object.entries(yama)) {
    if (deger === null) delete yeni[anahtar];
    else yeni[anahtar] = deger;
  }
  return yeni;
}

export function canliEsler(oda: ReadonlyMap<number, OdaKaydi>, simdi: number): { kisiId: number; durum: Veri; guncellendi: number }[] {
  return [...oda.entries()]
    .filter(([, k]) => simdi - k.guncellendi < ODA_SURESI_MS)
    .map(([kisiId, k]) => ({ kisiId, durum: k.durum, guncellendi: k.guncellendi }))
    .sort((a, b) => a.kisiId - b.kisiId);
}

// Boş depoda prototipin açılabilmesi için gereken yapısal belgeler (gerçek veri değil, prototipin varsayılanları).
export interface BaslangicBelgesi { yol: string; veri: Veri }
export interface KurucuKisi { id: number; ad: string }
// Prototip ayar belgesi ve firma kullanıcısı olmadan açılmaz (giriş ekranında kalır). Değerler prototipin kendi
// varsayılanlarıdır; kurucu kişi firma kullanıcısı olarak eklenir. Endeks serisi boş başlar (örnek değer girilmez).
// Sipariş onay eşikleri satın alma limit tablosundan gelir (1. basamak müdür, 2. basamak genel müdür eşiği; üstü kuralı).
// Okunan belgeye bindirilir, belgede saklanan eski değer geçmez; tanımsız eşik alan olarak yok olur (ekran onay adımını ister).
export const ONAY_AYAR_YOLU = 'settings/main';
export function siparisEsikleri(limitler: readonly { azamiTutar: string | null }[]): { poMgr?: number; poGM?: number } {
  const esik = (i: number): number | undefined => {
    const t = limitler[i]?.azamiTutar;
    return t === null || t === undefined || !Number.isFinite(Number(t)) ? undefined : Number(t);
  };
  const mudur = esik(0);
  const genelMudur = esik(1);
  return { ...(mudur === undefined ? {} : { poMgr: mudur }), ...(genelMudur === undefined ? {} : { poGM: genelMudur }) };
}
export function esikleriBindir<T extends DepoBelgesi>(belge: T, limitler: readonly { azamiTutar: string | null }[]): T {
  if (belge.yol !== ONAY_AYAR_YOLU) return belge;
  const { poMgr: _m, poGM: _g, ...digerleri } = (belge.veri['rules'] !== null && typeof belge.veri['rules'] === 'object' ? belge.veri['rules'] : {}) as Record<string, unknown>;
  return { ...belge, veri: { ...belge.veri, rules: { ...digerleri, ...siparisEsikleri(limitler) } } };
}

export const KURULUM_ISARETI: string | null = 'settings/main';

// TMI kişisinin prototipteki firma kullanıcısı. Çerçeve bu kullanıcıyla açılır: TMI oturumu varken prototipin kendi
// kullanıcı seçimi (şifresiz demo girişi) gösterilmez. Prototip rolü yalnız ekrandaki menüyü belirler; yazma yetkisi
// sunucudaki portal.yaz işlemidir.
export const portalKullaniciYolu = (kisiId: number): string => `users/tmi-${String(kisiId)}`;

// Prototipin "kim yaptı" alanları: geçmiş satırı, onay adımı ve kayıt sahibi. Değerleri portal kullanıcı kimliği ya da firma kimliğidir.
const KIMLIK_ALANLARI = new Set(['u', 'createdBy', 'doneBy', 'receivedBy', 'requestedBy']);

function kimlikSayaci(veri: unknown, sayac = new Map<string, number>()): Map<string, number> {
  if (Array.isArray(veri)) { for (const o of veri) kimlikSayaci(o, sayac); return sayac; }
  if (veri === null || typeof veri !== 'object') return sayac;
  for (const [anahtar, deger] of Object.entries(veri)) {
    if (KIMLIK_ALANLARI.has(anahtar) && typeof deger === 'string') sayac.set(deger, (sayac.get(deger) ?? 0) + 1);
    else kimlikSayaci(deger, sayac);
  }
  return sayac;
}

// Yeni sürümde eskisinden fazla geçen kimlik değerleri: yazan kişinin bu yazışla eklediği "kim yaptı" kayıtları.
// Var olan kayıtlar (başkasının eski geçmiş satırı) korunarak yeniden yazılabilir.
export function eklenenKimlikler(eski: unknown, yeni: unknown): string[] {
  const once = kimlikSayaci(eski);
  return [...kimlikSayaci(yeni)].filter(([deger, adet]) => adet > (once.get(deger) ?? 0)).map(([deger]) => deger);
}

// Portal rolü TMI rolünden gelir (kart #931): kişinin TMI işlemleri prototipin izinlerine çevrilir. Prototip rolü
// onay adımlarını adla eşleştirdiği için en yetkili bölümün rol adı verilir; izinler bütün bölümlerin birleşimidir.
const BOLUM_YETKILERI = [
  // Satın alma da teslim alma izni almaz (238, H1): mal kabul stok hareketi, parti ve giriş muayenesiyle Stok > Mal kabul'dedir.
  { islem: 'portal.satinalma', rol: 'Satın alma müdürü', izinler: ['purchase', 'partners', 'contracts', 'reports', 'approve'] },
  { islem: 'portal.finans', rol: 'Finans müdürü', izinler: ['finance', 'partners', 'reports', 'approve', 'contracts'] },
  { islem: 'portal.satis', rol: 'Satış müdürü', izinler: ['sales', 'partners', 'contracts', 'reports', 'approve'] },
  // Kalite de teslim alma izni almaz (kart #1162): izinle satın alma siparişleri menüde açılırdı.
  { islem: 'portal.kalite', rol: 'Kalite mühendisi', izinler: ['quality', 'partners', 'docs'] },
] as const;
// Satın alma siparişini yalnız satın almada onay yetkisi olan onaylar (kullanıcı kararı 16.10.2026): onay yetkisi olmayan satın
// almacı prototipin "Satın alma uzmanı" rolünü alır; onay adımı rol adıyla eşleştiği için müdür adımını onaylayamaz.
const SATIN_ALMA_ONAYI = 'satin-alma.onayla';
const SATIN_ALMA_UZMANI = { islem: 'portal.satinalma', rol: 'Satın alma uzmanı', izinler: ['purchase', 'partners', 'contracts', 'reports'] } as const;
export const TAM_YETKI_ISLEMI = 'portal.yonet';
export const TAM_YETKILI_ROL = 'Genel müdür';
const BOLUMSUZ_ROL = 'Gözlemci';
const COK_BOLUMLU_ROL = 'Müdür';

// tmiRoller: kişinin onay verebildiği adım rolleri (her bölümün müdür rolü). Birden çok bölümü olan kişinin unvanı "Müdür"dür ve
// her bölümün onayını verir; genel müdür adımını yalnız tam yetki verir (kullanıcı kararı, kart #1007).
export interface PortalRolu { role: string; tmiIzinler: string[]; tmiRoller: string[] }

export function portalRolu(islemler: readonly string[]): PortalRolu {
  if (islemler.includes(TAM_YETKI_ISLEMI)) return { role: TAM_YETKILI_ROL, tmiIzinler: ['*'], tmiRoller: [TAM_YETKILI_ROL] };
  const onaylar = islemler.includes(SATIN_ALMA_ONAYI);
  const bolumler = BOLUM_YETKILERI.filter((b) => islemler.includes(b.islem))
    .map((b) => (b.islem === SATIN_ALMA_UZMANI.islem && !onaylar ? SATIN_ALMA_UZMANI : b));
  const izinler = [...new Set(bolumler.flatMap((b) => b.izinler))].sort();
  const roller = bolumler.map((b) => b.rol);
  return { role: roller.length > 1 ? COK_BOLUMLU_ROL : roller[0] ?? BOLUMSUZ_ROL, tmiIzinler: izinler, tmiRoller: roller };
}

// Ekranda görünen unvan kişi kartındaki görevdir (kullanıcı kararı, kart #1163); görev yoksa portal rolü. Rol adı onay adımlarını
// eşleştirdiği için unvan ayrı alandır.
export function portalUnvani(gorev: string | null, rol: PortalRolu): string {
  const g = gorev?.trim() ?? '';
  return g === '' ? rol.role : g;
}

const TMI_KULLANICI = /^users\/tmi-\d+$/;

// TMI kişisinin portal kullanıcısında rol, izinler ve firma (partyId, 1021 b) yalnız sunucu yazar (portalRolu); prototipten gelen yazı bunları
// değiştiremez. Kişi böylece kendi rolünü düşürüp yönetim ekranlarını kaybedemez.
export function rolDegisiyorMu(yol: string, eski: Veri | null, yeni: Veri): boolean {
  if (!TMI_KULLANICI.test(yol)) return false;
  const alanlar = (v: Veri | null) => JSON.stringify([v?.['role'] ?? null, v?.['tmiIzinler'] ?? null, v?.['tmiRoller'] ?? null, v?.['unvan'] ?? null, v?.['partyId'] ?? null]);
  return alanlar(eski) !== alanlar(yeni);
}

// Bölüm izni sunucuda (KD-063, kart #970): koleksiyona yalnız prototipin o koleksiyonu değiştiren işlemlerinin izinlerinden biri
// yazar (portal.html ACT_PERM ve SUBMIT_PERM). Sipariş belgesi sevk, kabul ve faturayı da taşır; onay kaydı bölüm işleminin yan etkisidir.
// Listede olmayan koleksiyon (bildirim, mesaj, etkinlik, dosya) ve kişiye özel alan yalnız portal.yaz ister. Boş liste yalnız tam yetki.
const KOLEKSIYON_IZINLERI: Readonly<Record<string, readonly string[]>> = {
  requests: ['sales'],
  rfqs: ['purchase'], bids: ['purchase'], priceReqs: ['purchase'],
  orders: ['sales', 'purchase', 'finance'],
  catalog: ['sales', 'purchase'],
  ncrs: ['quality'],
  payments: ['finance'], cheques: ['finance'], recons: ['finance'],
  contracts: ['contracts', 'sales', 'purchase'],
  parties: ['partners', 'purchase'],
  docs: ['docs', 'partners', 'quality'],
  approvals: ['approve', 'partners'],
  settings: [],
};

// Firma kullanıcısını (partyId 'firm') yalnız tam yetki yazar; kişi kendi kullanıcısını (tercihleri) yazar; dış firma
// kişisini firma kartıyla birlikte firmalar izni açar.
export function bolumYazabilirMi(yol: string, kisiId: number, izinler: readonly string[], eski: Veri | null, yeni: Veri | null): boolean {
  if (izinler.includes('*')) return true;
  const [koleksiyon] = parcalar(yol);
  if (koleksiyon === 'users') {
    if (yol === portalKullaniciYolu(kisiId)) return true;
    if (eski?.['partyId'] === 'firm' || yeni?.['partyId'] === 'firm') return false;
    return izinler.includes('partners');
  }
  // Siparişi yalnız türünün bölümü açar ya da türünü değiştirir (finans var olan siparişe fatura yazar).
  if (koleksiyon === 'orders' && (eski === null || eski['type'] !== yeni?.['type'])) {
    const tur = yeni?.['type'] ?? eski?.['type'];
    return izinler.includes(tur === 'sales' ? 'sales' : 'purchase');
  }
  // Var olan siparişe türünün bölümü yazar: satışa sevk ve fatura, satın almaya fatura (kart #1162); satın alma teslimi
  // portalda alınmaz (satinAlmaTeslimiReddi).
  if (koleksiyon === 'orders' && parcalar(yol).length === 2) return SIPARIS_YAZMA[siparisTuru(eski)].some((i) => izinler.includes(i));
  const gerekli = koleksiyon === undefined ? undefined : KOLEKSIYON_IZINLERI[koleksiyon];
  return gerekli === undefined || gerekli.some((i) => izinler.includes(i));
}

type SiparisTuru = 'sales' | 'purchase';
const siparisTuru = (veri: Veri | null): SiparisTuru => (veri?.['type'] === 'sales' ? 'sales' : 'purchase');
const SIPARIS_YAZMA: Readonly<Record<SiparisTuru, readonly string[]>> = { sales: ['sales', 'finance'], purchase: ['purchase', 'finance'] };

// Bölüm okuma izni sunucuda (kart #1162): satış ve satın alma kayıtlarını yalnız o bölüm, finans ve raporlar okur. Satın alma
// siparişini kalite de okur (uygunsuzluk kaydı teslim alınmış siparişe açılır). Listede olmayan koleksiyon okuma işlemiyle açıktır.
const KOLEKSIYON_OKUMA: Readonly<Record<string, readonly string[]>> = {
  requests: ['sales', 'finance', 'reports'],
  rfqs: ['purchase', 'finance', 'reports'], bids: ['purchase', 'finance', 'reports'], priceReqs: ['purchase', 'finance', 'reports'],
  catalog: ['sales', 'purchase', 'finance', 'reports'],
};
const SIPARIS_OKUMA: Readonly<Record<SiparisTuru, readonly string[]>> = {
  sales: ['sales', 'finance', 'reports'],
  purchase: ['purchase', 'finance', 'reports', 'quality'],
};

// veri null ise (belge yok ya da alt belge) sipariş için iki türden birinin izni yeter.
export function bolumOkuyabilirMi(yol: string, izinler: readonly string[], veri: Veri | null): boolean {
  if (izinler.includes('*')) return true;
  const p = parcalar(yol);
  const biri = (liste: readonly string[]) => liste.some((i) => izinler.includes(i));
  if (p[0] === 'orders') {
    if (p.length === 2 && veri !== null) return biri(SIPARIS_OKUMA[siparisTuru(veri)]);
    return biri(SIPARIS_OKUMA.sales) || biri(SIPARIS_OKUMA.purchase);
  }
  const gerekli = p[0] === undefined ? undefined : KOLEKSIYON_OKUMA[p[0]];
  return gerekli === undefined || biri(gerekli);
}

// ---- Firma görünürlüğü (UYUM-BORCU, 1019 a): prototipin visible() kuralı (portal.html, ikinci tanım) sunucuda. Firma içi
// izleyici her kaydı görür (üstüne bölüm ve işlem süzgeci biner); müşteri ve tedarikçi yalnız kendi firmasının kaydını görür.
// İzleyici kişinin portal kullanıcısındaki firmadan çıkar: TMI kişisine müşteri ya da tedarikçi firması atanabilir (1021 b).
export type Izleyici = { tur: 'firma' } | { tur: 'kapali' } | { tur: 'musteri' | 'tedarikci'; firma: string };
export const FIRMA_ICI: Izleyici = { tur: 'firma' };
export const FIRMA_ICI_KIMLIGI = 'firm';
const FIRMA_TURLERI: Readonly<Record<string, 'musteri' | 'tedarikci'>> = { customer: 'musteri', supplier: 'tedarikci' };

export const atanabilirFirmaMi = (firma: Veri | null): boolean => typeof firma?.['type'] === 'string' && firma['type'] in FIRMA_TURLERI;

// Firma kartı silinmiş ya da türü değişmişse kişi dışarıda kalır ve hiçbir kaydı görmez: firma içine yalnız atamanın kaldırılması alır.
export function izleyiciCikar(kullanici: Veri | null, firma: Veri | null): Izleyici {
  const kimlik = kullanici?.['partyId'];
  if (kimlik === undefined || kimlik === null || kimlik === FIRMA_ICI_KIMLIGI) return FIRMA_ICI;
  const tur = typeof firma?.['type'] === 'string' ? FIRMA_TURLERI[firma['type']] : undefined;
  return typeof kimlik === 'string' && tur !== undefined ? { tur, firma: kimlik } : { tur: 'kapali' };
}

// Dış izleyici (1224 a): firma içi olmayan her izleyici. Firma kartına bakılmaz; kartı silinmiş firmaya atanan kişi de dışarıdadır.
export const disIzleyiciMi = (kullanici: Veri | null): boolean => izleyiciCikar(kullanici, null).tur !== 'firma';

// İlk aşama salt okunur (1013 a): firma kişisi yalnız kendi portal kullanıcısını (tercihler) ve kişiye özel alanını yazar.
export function disYazmaReddi(iz: Izleyici, yol: string, kisiId: number): string | null {
  if (iz.tur === 'firma') return null;
  const p = parcalar(yol);
  if (yol === portalKullaniciYolu(kisiId) || (p[0] === 'data' && p[1] === 'users' && p[2] === String(kisiId))) return null;
  return 'Firma kişisi portalda yalnız okuyabilir.';
}

// Kurala bağlanmamış koleksiyon, alt belge ve kişiye özel alan dış izleyiciye kapalıdır (prototipte de default false).
export function izleyiciGorebilirMi(yol: string, veri: Veri | null, iz: Izleyici): boolean {
  if (iz.tur === 'firma') return true;
  if (iz.tur === 'kapali') return false;
  const p = parcalar(yol);
  if (p.length !== 2 || veri === null) return false;
  const musteri = iz.tur === 'musteri';
  const kendi = veri['partyId'] === iz.firma;
  switch (p[0]) {
    case 'requests': return musteri && veri['customerId'] === iz.firma;
    case 'orders': return kendi && veri['type'] === (musteri ? 'sales' : 'purchase')
      && veri['approvalState'] !== 'pending' && veri['approvalState'] !== 'rejected';
    case 'ncrs': return kendi && veri['kind'] === (musteri ? 'customer' : 'supplier');
    case 'payments': return kendi && veri['direction'] === (musteri ? 'in' : 'out') && veri['status'] !== 'awaiting';
    case 'priceReqs': return !musteri && kendi;
    case 'catalog': return kendi;
    case 'rfqs': return !musteri && Array.isArray(veri['invited']) && veri['invited'].includes(iz.firma);
    case 'bids': return !musteri && veri['supplierId'] === iz.firma;
    case 'contracts': return kendi && veri['approval'] === 'approved';
    case 'docs': case 'recons': case 'users': return kendi;
    case 'parties': return p[1] === iz.firma;
    case undefined:
    default: return false;
  }
}

// Satın alma siparişinin sevkiyatı portalda teslim alınmaz (238, H1): portal belgesindeki "teslim alındı" stok hareketi, parti ve
// giriş muayenesi açmaz; mal kabul Stok > Mal kabul'dedir. Tam yetki de geçemez. Önceden teslim alınmış sevkiyat olduğu gibi kalır.
export const SATIN_ALMA_TESLIMI_REDDI = 'Satın alma teslimi portalda alınmaz; Stok > Mal kabul ekranında alın.';

export function satinAlmaTeslimiReddi(yol: string, eski: Veri | null, yeni: Veri | null): string | null {
  const p = parcalar(yol);
  if (p[0] !== 'orders' || p.length !== 2 || yeni === null || siparisTuru(yeni) !== 'purchase') return null;
  const teslimler = (v: Veri | null): Veri[] => {
    const liste = v?.['deliveries'];
    return Array.isArray(liste) ? liste.filter((d): d is Veri => duzNesneMi(d) && d['status'] === 'received') : [];
  };
  const once = new Set(teslimler(eski).map((d) => JSON.stringify(d['id'] ?? null)));
  return teslimler(yeni).some((d) => !once.has(JSON.stringify(d['id'] ?? null))) ? SATIN_ALMA_TESLIMI_REDDI : null;
}

export function portalKullanicisi(kisi: KurucuKisi, simdiMs: number, rol: PortalRolu, unvan: string = rol.role): BaslangicBelgesi {
  return {
    yol: portalKullaniciYolu(kisi.id),
    veri: {
      partyId: 'firm', name: kisi.ad, role: rol.role, tmiIzinler: rol.tmiIzinler, tmiRoller: rol.tmiRoller, unvan, email: '', active: true, createdAt: new Date(simdiMs).toISOString(),
      prefs: { email: true, whatsapp: false, sms: 'urgent', digest: 'instant', quietFrom: '20:00', quietTo: '08:00', mute: {} },
    },
  };
}

export function baslangicBelgeleri(kisi: KurucuKisi, simdiMs: number, rol: PortalRolu): BaslangicBelgesi[] {
  return [
    {
      yol: 'settings/main',
      veri: {
        rules: { payFin: 150000, discMgr: 10, priceMgr: 5, contractGM: 2000000, priceTol: 1 },
        indexes: {},
        notify: { remindH: 24, escalateH: 48, supplierConfirmH: 24, dueDays: 3, docDays: 30 },
      },
    },
    portalKullanicisi(kisi, simdiMs, rol),
  ];
}

// Örnek veri: finansın örnek firmalarının portaldaki kartı (firmanın sahibi finans; ad ve tür oradan gelir).
// Belge kimliği finanstaki firma kodudur; alanlar prototipin kendi firma kaydının biçimindedir.
export interface OrnekFirma { kod: string; ad: string; tur: 'customer' | 'supplier'; il: string | null; adres: string | null; vadeGunu: number | null }

export const ornekFirmaYolu = (kod: string): string => `parties/${kod}`;

export function ornekFirmaBelgesi(f: OrnekFirma, simdiMs: number): BaslangicBelgesi {
  const an = new Date(simdiMs).toISOString();
  const eposta = `${f.kod.toLowerCase()}@ornek.invalid`;
  const musteri = f.tur === 'customer';
  return {
    yol: ornekFirmaYolu(f.kod),
    veri: {
      id: f.kod, type: f.tur, name: f.ad, city: f.il ?? '', contact: 'Örnek Yetkili', email: eposta, createdAt: an, status: 'active', term: f.vadeGunu ?? 30,
      contacts: [{
        id: 'k1', name: 'Örnek Yetkili', title: musteri ? 'Satın alma müdürü' : 'Satış müdürü', email: eposta, phone: '',
        area: musteri ? 'Satın alma' : 'Satış', primary: true,
      }],
      addresses: f.adres === null ? [] : [{ type: 'Fatura', text: [f.adres, f.il].filter(Boolean).join(', ') }],
      history: [{ at: an, by: 'firm', text: 'Örnek firma kaydı oluşturuldu' }],
    },
  };
}

// ---- Logo satış bağı (kart #941). Teklif müşteriye gönderilince Logo'ya gider; müşterinin kabulü sipariş açmaz, bizim
// "Satış siparişine dönüştür" onayımız açar (kullanıcı kararı). Tekliften gelmeyen satış siparişi önce kendi alanlarıyla teklif olur.

export type LogoNiyeti =
  | { tur: 'teklif'; yol: string; surum: number }
  | { tur: 'tekliften-siparis'; talepYol: string; surum: number; siparisYol: string }
  | { tur: 'siparis'; yol: string; kaynakNo: string | null };

const metin = (d: unknown): string | null => (typeof d === 'string' && d.trim() !== '' ? d : null);
const tamSayi = (d: unknown): number | null => (typeof d === 'number' && Number.isSafeInteger(d) && d > 0 ? d : null);
const dizi = (d: unknown): Veri[] => (Array.isArray(d) ? d.filter(duzNesneMi) : []);

function surumNolari(talep: Veri | null): Set<number> {
  return new Set(dizi(talep?.['versions']).map((v) => tamSayi(v['v'])).filter((v): v is number => v !== null));
}

// Yazılan belgenin Logo sırasına eklettiği işler: talepte yeni sürüm, talebin siparişe dönmesi, yeni satış siparişi.
export function logoNiyetleri(yol: string, eski: Veri | null, yeni: Veri): LogoNiyeti[] {
  const [koleksiyon, kimlik, ...fazla] = parcalar(yol);
  if (kimlik === undefined || fazla.length > 0) return [];
  if (koleksiyon === 'requests') {
    const onceki = surumNolari(eski);
    const niyetler: LogoNiyeti[] = [...surumNolari(yeni)].filter((v) => !onceki.has(v)).sort((a, b) => a - b).map((surum) => ({ tur: 'teklif', yol, surum }));
    const siparis = metin(yeni['orderId']);
    const surum = tamSayi(yeni['acceptedVersion']);
    if (yeni['status'] === 'ordered' && eski?.['status'] !== 'ordered' && siparis !== null && surum !== null) {
      niyetler.push({ tur: 'tekliften-siparis', talepYol: yol, surum, siparisYol: `orders/${siparis}` });
    }
    return niyetler;
  }
  if (koleksiyon === 'orders' && eski === null && yeni['type'] === 'sales') return [{ tur: 'siparis', yol, kaynakNo: metin(yeni['sourceNo']) }];
  return [];
}

// Prototip sayıyı JSON sayısı tutar; Logo ondalık metin ister. Negatif ve sayı olmayan değer null.
export function ondalikMetni(d: unknown): string | null {
  if (typeof d !== 'number' || !Number.isFinite(d) || d < 0) return null;
  const s = String(Number(d.toFixed(4)));
  return /^\d+(\.\d+)?$/.test(s) ? s : null;
}

const gun = (d: unknown): string | null => {
  const m = metin(d);
  if (m === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(m)) return m;
  const an = Date.parse(m);
  return Number.isNaN(an) ? null : tesisGunu(an);
};

function gunEkle(tarih: string, gunSayisi: number): string {
  const [y, a, g] = tarih.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (a ?? 1) - 1, (g ?? 1) + gunSayisi)).toISOString().slice(0, 10);
}

export interface PortalSatisKalemi {
  satirId: number; kod: string | null; ad: string; miktar: string | null; birim: string; birimFiyat: string | null; iskontoYuzdesi: string | null; termin: string | null;
}
export interface PortalSatisTeklifi {
  no: string; tarih: string | null; gecerlilikBitis: string | null; paraBirimi: string; firmaKimligi: string | null; kalemler: PortalSatisKalemi[];
}

// Talebin bir sürümü. İlk sürüm talep numarasıyla, sonrakiler "-R<n>" ekiyle gider (her sürüm Logo'da ayrı teklif; VARSAYIM, kart #941).
export function talepTeklifi(talep: Veri, surum: number): PortalSatisTeklifi | null {
  const v = dizi(talep['versions']).find((x) => x['v'] === surum);
  const no = metin(talep['no']);
  if (v === undefined || no === null) return null;
  const tarih = gun(v['createdAt']);
  const teslimGunu = tamSayi(v['deliveryDays']);
  const fiyatlar = Array.isArray(v['prices']) ? v['prices'] : [];
  const iskonto = ondalikMetni(v['discount'] ?? 0);
  return {
    no: surum === 1 ? no : `${no}-R${String(surum)}`, tarih, gecerlilikBitis: gun(v['validUntil']), paraBirimi: metin(talep['currency']) ?? 'TRY',
    firmaKimligi: metin(talep['customerId']),
    kalemler: dizi(talep['items']).map((k, i) => ({
      satirId: i + 1, kod: metin(k['code']), ad: metin(k['name']) ?? '', miktar: ondalikMetni(k['qty']), birim: metin(k['unit']) ?? '',
      birimFiyat: ondalikMetni(fiyatlar[i]), iskontoYuzdesi: iskonto === '0' ? null : iskonto,
      termin: tarih !== null && teslimGunu !== null ? gunEkle(tarih, teslimGunu) : null,
    })),
  };
}

// Tekliften gelmeyen satış siparişinin teklifi: siparişin kendi numarası, kalemleri ve fiyatlarıyla.
export function siparisTeklifi(siparis: Veri): PortalSatisTeklifi | null {
  const no = metin(siparis['no']);
  if (no === null) return null;
  const termin = gun(siparis['promisedDate']);
  return {
    no, tarih: gun(siparis['createdAt']), gecerlilikBitis: null, paraBirimi: metin(siparis['currency']) ?? 'TRY', firmaKimligi: metin(siparis['partyId']),
    kalemler: dizi(siparis['items']).map((k, i) => ({
      satirId: i + 1, kod: metin(k['code']), ad: metin(k['name']) ?? '', miktar: ondalikMetni(k['qty']), birim: metin(k['unit']) ?? '',
      birimFiyat: ondalikMetni(k['price']), iskontoYuzdesi: null, termin,
    })),
  };
}

// Siparişin satırları teklif satırlarına sırayla bağlanır ("Siparişe dönüştür" kalemleri tekliften sırasıyla kopyalar).
export function siparisSatirlari(siparis: Veri, teklifRefleri: Readonly<Record<string, unknown>>):
  { no: string; tarih: string | null; satirlar: { satirId: number; teklifSatirRef: string | null; miktar: string; termin: string | null }[] } | null {
  const no = metin(siparis['no']);
  if (no === null) return null;
  const termin = gun(siparis['promisedDate']);
  return {
    no, tarih: gun(siparis['createdAt']),
    satirlar: dizi(siparis['items']).map((k, i) => ({
      satirId: i + 1, teklifSatirRef: metin(teklifRefleri[String(i + 1)]), miktar: ondalikMetni(k['qty']) ?? '0', termin,
    })),
  };
}

// Kalemin kodu yoksa o müşterinin satış fiyat listesinde aynı adlı kalemin kodu alınır.
export function kalemKodu(kalem: PortalSatisKalemi, firmaKimligi: string | null, katalog: readonly Veri[]): string | null {
  if (kalem.kod !== null) return kalem.kod;
  const ad = kalem.ad.trim().toLocaleLowerCase('tr-TR');
  if (ad === '') return null;
  const uyan = katalog.filter((c) => c['side'] === 'sales' && c['partyId'] === firmaKimligi && metin(c['name'])?.trim().toLocaleLowerCase('tr-TR') === ad);
  return uyan.length === 1 ? metin(uyan[0]?.['code']) : null;
}

// ---- Onay kaydı (kart #1583). Onay kararı yalnız onay ucundan verilir; kişi, zaman ve adım rolü sunucudan gelir. Genel yazma onay
// kaydının karar alanlarını değiştiremez ve bekleyen onaya bağlı kaydın onay durumunu onay kararı olmadan değiştiremez.

export const ONAY_KOLEKSIYONU = 'approvals';
export const onayYolu = (kimlik: string): string => `${ONAY_KOLEKSIYONU}/${kimlik}`;
export const onayBelgesiMi = (yol: string): boolean => { const p = parcalar(yol); return p.length === 2 && p[0] === ONAY_KOLEKSIYONU; };

// Kararla değişen ya da onayın neyi onayladığını belirleyen alanlar; açıldıktan sonra genel yazmayla değişmez.
const ONAY_KORUNAN_ALANLAR = ['kind', 'refCol', 'refId', 'amount', 'payload', 'requestedBy', 'at', 'no', 'steps', 'status'] as const;

// Genel yazmanın onay kaydına uygunluğu: hata iletisi ya da null. Yeni onay bekler durumda, kararsız adımlarla ve yazan adına açılır.
export function onayYazimiReddi(yol: string, eski: Veri | null, yeni: Veri | null, kendi: string): string | null {
  if (!onayBelgesiMi(yol)) return null;
  if (yeni === null) return 'Onay kaydı silinemez.';
  if (eski === null) {
    const adimlar = yeni['steps'];
    const kararsiz = Array.isArray(adimlar) && adimlar.length > 0
      && adimlar.every((a) => duzNesneMi(a) && a['status'] === 'pending' && a['u'] === undefined && a['at'] === undefined && a['note'] === undefined);
    if (yeni['status'] !== 'pending' || !kararsiz) return 'Onay kaydı bekler durumda ve kararsız adımlarla açılır; karar onay ucundan verilir.';
    if (yeni['requestedBy'] !== kendi) return 'Onay kaydı yalnız açan kişi adına açılır.';
    return null;
  }
  const degisen = ONAY_KORUNAN_ALANLAR.some((a) => JSON.stringify(eski[a] ?? null) !== JSON.stringify(yeni[a] ?? null));
  return degisen ? 'Onay kararı yalnız onay ucundan verilir.' : null;
}

export interface OnayKarari { onay: boolean; not: string; kendi: string; rol: PortalRolu; an: string }
export type OnayKarariSonucu = { veri: Veri } | { hata: 'durum' | 'yetki' | 'dogrulama'; ileti: string };

// Prototipin apDecide kuralı sunucuda: sıradaki adım kişinin rollerinden biriyse (genel müdür her adımı) kişi o adımı karara bağlar.
// Onayı açan ve önceki bir adımı veren aynı onayın adımını veremez. Ret gerekçe ister.
export function onayKarari(veri: Veri, k: OnayKarari): OnayKarariSonucu {
  if (veri['status'] !== 'pending') return { hata: 'durum', ileti: 'Bu onay artık bekler durumda değil.' };
  const adimlar = Array.isArray(veri['steps']) ? veri['steps'] : [];
  const sira = adimlar.findIndex((a) => duzNesneMi(a) && a['status'] === 'pending');
  const adim = adimlar[sira];
  if (!duzNesneMi(adim)) return { hata: 'durum', ileti: 'Bu onayda bekleyen adım yok.' };
  if (veri['requestedBy'] === k.kendi) return { hata: 'yetki', ileti: 'Kendi açtığınız onayı veremezsiniz.' };
  if (adimlar.some((a) => duzNesneMi(a) && a['u'] === k.kendi)) return { hata: 'yetki', ileti: 'Bu onayın bir adımını zaten verdiniz.' };
  const rol = typeof adim['role'] === 'string' ? adim['role'] : '';
  if (!k.rol.tmiRoller.includes(rol) && k.rol.role !== TAM_YETKILI_ROL) return { hata: 'yetki', ileti: `Bu adımı yalnız ${rol} onaylar.` };
  const not = k.not.trim();
  if (!k.onay && not === '') return { hata: 'dogrulama', ileti: 'Ret için gerekçe yazın.' };
  const yeniAdimlar = adimlar.map((a, i) => (i === sira ? { ...adim, status: k.onay ? 'approved' : 'rejected', u: k.kendi, at: k.an, note: not } : a));
  const bitti = k.onay && !yeniAdimlar.some((a) => duzNesneMi(a) && a['status'] === 'pending');
  const metin = `${k.onay ? 'Onaylandı' : 'Reddedildi'} (${k.rol.role})${not === '' ? '' : `: ${not}`}`;
  const gecmis = Array.isArray(veri['history']) ? veri['history'] : [];
  return {
    veri: {
      ...veri, steps: yeniAdimlar, status: !k.onay ? 'rejected' : bitti ? 'approved' : 'pending',
      history: [...gecmis, { at: k.an, by: 'firm', u: k.kendi, text: metin }],
    },
  };
}

// Bekleyen onaya bağlı kaydın onay durumunu değiştiren yazı: hangi onayın hangi sonuçla verilmiş olması gerektiği. Onay kaydının
// kimliği belgede yoksa (sipariş, ödeme, sözleşme, IBAN) kayda bağlı son onay aranır. null: yazı onay durumuna dokunmuyor.
export type OnayGeregi =
  | { onayKimligi: string; sonuc: 'approved' | 'rejected' | 'karar' }
  | { refCol: string; refId: string; tur: string; sonuc: 'approved' | 'rejected' }
  | { red: string };

const KARARLAR = new Set(['approved', 'rejected']);
const ONAY_DURUMU_RED = { red: 'Onay bekleyen kaydın onay durumu yalnız onay kararıyla değişir.' };

export function onayGeregi(yol: string, eski: Veri | null, yeni: Veri): OnayGeregi | null {
  const [koleksiyon, kimlik, ...fazla] = parcalar(yol);
  if (eski === null || kimlik === undefined || fazla.length > 0) return null;
  const bagli = (tur: string, once: unknown, sonra: unknown): OnayGeregi | null => {
    if (once !== 'pending' || sonra === 'pending') return null;
    return typeof sonra === 'string' && KARARLAR.has(sonra) ? { refCol: koleksiyon ?? '', refId: kimlik, tur, sonuc: sonra as 'approved' | 'rejected' } : ONAY_DURUMU_RED;
  };
  if (koleksiyon === 'orders') return bagli('po', eski['approvalState'], yeni['approvalState']);
  if (koleksiyon === 'contracts') return bagli('contract', eski['approval'], yeni['approval']);
  if (koleksiyon === 'parties') {
    const durum = (v: Veri): unknown => (duzNesneMi(v['bankChange']) ? v['bankChange']['status'] : undefined);
    return bagli('iban', durum(eski), durum(yeni));
  }
  // Ödeme onayda 'awaiting' bekler; onaylanınca 'sent', reddedilince 'rejected' olur. Başka geçişler (iptal gibi) onaya bağlı değildir.
  if (koleksiyon === 'payments' && eski['status'] === 'awaiting' && (yeni['status'] === 'sent' || yeni['status'] === 'rejected')) {
    return { refCol: koleksiyon, refId: kimlik, tur: 'payment', sonuc: yeni['status'] === 'sent' ? 'approved' : 'rejected' };
  }
  // İskonto ve fiyat artışı onay kaydının kimliğini taşır: kimlik kalkarsa onay karara bağlanmış olmalı; fiyat artışı onaylanmış sayılırsa onay verilmiş olmalı.
  if (koleksiyon === 'requests' || koleksiyon === 'priceReqs') {
    const bekleyen = metin(eski['pendingApproval']);
    if (bekleyen === null) return null;
    if (koleksiyon === 'priceReqs' && yeni['status'] === 'approved' && eski['status'] !== 'approved') return { onayKimligi: bekleyen, sonuc: 'approved' };
    return yeni['pendingApproval'] === bekleyen ? null : { onayKimligi: bekleyen, sonuc: 'karar' };
  }
  return null;
}

// Kayda bağlı onaylardan en son açılanı (prototipin apFor kuralı).
export function sonOnay(onaylar: readonly Veri[], refCol: string, refId: string, tur: string): Veri | null {
  return onaylar.filter((o) => o['refCol'] === refCol && o['refId'] === refId && o['kind'] === tur)
    .sort((a, b) => String(b['at'] ?? '').localeCompare(String(a['at'] ?? '')))[0] ?? null;
}

export function onayGeregiKarsilaniyorMu(onay: Veri | null, sonuc: 'approved' | 'rejected' | 'karar'): boolean {
  const durum = onay?.['status'];
  return sonuc === 'karar' ? typeof durum === 'string' && KARARLAR.has(durum) : durum === sonuc;
}

// ---- Onay adımları (B8). Prototipin stepsFor ve autoSkip kuralları sunucuda: tarayıcının yazdığı adım zinciri sunucunun hesabıyla
// karşılaştırılır, onay gerektiren kayıt onaysız yazılamaz. Limitler portal ayar belgesinde kalır (soru 156 b); sipariş eşikleri
// satın alma limit tablosundan bindirilir (esikleriBindir).

export const ONAY_VARSAYILANLARI: Readonly<Record<string, number>> = { payFin: 150000, discMgr: 10, priceMgr: 5, contractGM: 2000000, priceTol: 1 };
export type OnayKurallari = Readonly<Record<string, unknown>>;
export interface OnayGirdisi { tutar?: number; iskonto?: number; fark?: number; sozlesmeTuru?: unknown }

// Prototipin rules() birleşimi: varsayılan, belgede saklanan, üstüne limit tablosunun eşikleri (tanımsız eşik alan olarak yoktur).
export function onayKurallari(ayar: Veri | null, limitler: readonly { azamiTutar: string | null }[]): OnayKurallari {
  const kurallar = ayar !== null && duzNesneMi(ayar['rules']) ? ayar['rules'] : {};
  const { poMgr: _m, poGM: _g, ...digerleri } = kurallar;
  return { ...ONAY_VARSAYILANLARI, ...digerleri, ...siparisEsikleri(limitler) };
}

// Karşılaştırmalar prototiptekiyle aynı JavaScript dönüşümüyle: tanımsız eşik NaN olur; "<= değil" adımı ister, ">" istemez.
const esik = (R: OnayKurallari, ad: string): number => Number(R[ad]);
const SATIN_ALMA_MUDURU = 'Satın alma müdürü';

export function onayAdimlari(tur: string, g: OnayGirdisi, R: OnayKurallari): string[] {
  const tutar = g.tutar ?? Number.NaN;
  if (tur === 'po') return [...(tutar <= esik(R, 'poMgr') ? [] : [SATIN_ALMA_MUDURU]), ...(tutar <= esik(R, 'poGM') ? [] : [TAM_YETKILI_ROL])];
  if (tur === 'payment') return tutar > esik(R, 'payFin') ? ['Finans müdürü'] : [];
  if (tur === 'iban') return ['Muhasebe', 'Finans müdürü'];
  if (tur === 'discount') return (g.iskonto ?? 0) > esik(R, 'discMgr') ? ['Satış müdürü'] : [];
  if (tur === 'pricereq') return (g.fark ?? Number.NaN) > esik(R, 'priceMgr') ? [SATIN_ALMA_MUDURU] : [];
  if (tur === 'contract') return [g.sozlesmeTuru === 'sales' ? 'Satış müdürü' : SATIN_ALMA_MUDURU, ...(tutar > esik(R, 'contractGM') ? [TAM_YETKILI_ROL] : [])];
  return [];
}

// autoSkip: açanın kendi rolündeki adım düşer, genel müdür hiç onaya göndermez; IBAN değişikliği her zaman iki adımdır.
export function acaninAdimlari(tur: string, g: OnayGirdisi, R: OnayKurallari, rol: string): string[] {
  const adimlar = onayAdimlari(tur, g, R);
  if (tur === 'iban') return adimlar;
  return rol === TAM_YETKILI_ROL ? [] : adimlar.filter((a) => a !== rol);
}

const sayi = (v: unknown): number => (v === null || v === undefined ? Number.NaN : Number(v));
const toplam = (satirlar: unknown, fiyat: (s: Veri) => number): number =>
  (Array.isArray(satirlar) ? satirlar : []).reduce<number>((t, s) => t + (duzNesneMi(s) ? Number(s['qty']) * fiyat(s) : Number.NaN), 0);
// oNet ve cValue: fiyatı boş kalem tutarı NaN yapar (prototipte de sipariş onaya gider).
export const siparisTutari = (v: Veri): number => toplam(v['items'], (s) => sayi(s['price']));
export const sozlesmeTutari = (v: Veri): number => toplam(v['lines'], (s) => Number(s['price']));
const fiyatFarki = (v: Veri): number => ((Number(v['newPrice']) - Number(v['oldPrice'])) / Number(v['oldPrice'])) * 100;
const sonSurum = (v: Veri | null): Veri | null => {
  const s = Array.isArray(v?.['versions']) ? v['versions'] : [];
  const son: unknown = s[s.length - 1];
  return duzNesneMi(son) ? son : null;
};
const surumSayisi = (v: Veri | null): number => (Array.isArray(v?.['versions']) ? v['versions'].length : 0);
const nesne = (v: unknown): Veri | null => (duzNesneMi(v) ? v : null);
const iskonto = (surum: Veri | null): number => Number(surum?.['discount']) || 0;
export const adimRolleri = (onay: Veri): string[] =>
  (Array.isArray(onay['steps']) ? onay['steps'] : []).map((a) => (duzNesneMi(a) && typeof a['role'] === 'string' ? a['role'] : ''));
const ayniZincir = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((r, i) => r === b[i]);

// Açılış: zincir, onayın kendi alanlarından (tutar, iskonto) ve bağlı kayıttan (fiyat farkı, sözleşme türü) hesaplanır. Sözleşme kaydı
// onayla aynı anda yazıldığı için henüz yoksa iki türden birine uyması yeter; tür, onayın etkisi yazılırken kayıttan denetlenir.
export function onayAcilisReddi(onay: Veri, kayit: Veri | null, R: OnayKurallari, rol: string): string | null {
  const tur = String(onay['kind'] ?? '');
  const tutar = sayi(onay['amount']);
  const girdi: OnayGirdisi = { tutar, iskonto: iskonto(nesne(nesne(onay['payload'])?.['version'])) };
  if (tur === 'pricereq' && kayit !== null) girdi.fark = fiyatFarki(kayit);
  const adaylar = tur === 'contract' && kayit === null
    ? [acaninAdimlari(tur, { tutar, sozlesmeTuru: 'sales' }, R, rol), acaninAdimlari(tur, { tutar, sozlesmeTuru: 'purchase' }, R, rol)]
    : [acaninAdimlari(tur, tur === 'contract' ? { tutar, sozlesmeTuru: kayit?.['type'] } : girdi, R, rol)];
  const roller = adimRolleri(onay);
  if (adaylar.some((a) => ayniZincir(a, roller))) return null;
  const beklenen = adaylar[0] ?? [];
  return beklenen.length === 0
    ? 'Bu kayıt onay kuralına göre onay gerektirmiyor.'
    : `Onay adımları onay kuralına uymuyor; beklenen: ${beklenen.join(' → ')}.`;
}

// Onay gerektiren kayıt onaysız yazılamaz (prototipin beforePut ve sözleşme, fiyat artışı ve iskonto akışları). Onay bekleyen
// kaydın geçişi onayGeregi ile denetlenir; burada yalnız onay hiç açılmadan yapılan yazılar.
export function onaysizYaziReddi(yol: string, eski: Veri | null, yeni: Veri, R: OnayKurallari, rol: string): string | null {
  const [koleksiyon, kimlik, ...fazla] = parcalar(yol);
  if (kimlik === undefined || fazla.length > 0) return null;
  const gerekir = (tur: string, g: OnayGirdisi): boolean => acaninAdimlari(tur, g, R, rol).length > 0;
  if (koleksiyon === 'orders' && eski === null && yeni['type'] === 'purchase' && yeni['approvalState'] !== 'pending'
    && gerekir('po', { tutar: siparisTutari(yeni) })) return 'Sipariş tutarı onay limitini aşıyor; sipariş onaya gönderilmeden kaydedilemez.';
  if (koleksiyon === 'payments' && eski === null && yeni['direction'] === 'out' && yeni['status'] === 'sent'
    && gerekir('payment', { tutar: sayi(yeni['amount']) })) return 'Ödeme tutarı onay limitini aşıyor; ödeme onaya gönderilmeden gönderilemez.';
  if (koleksiyon === 'contracts' && yeni['approval'] === 'approved' && eski?.['approval'] !== 'approved' && eski?.['approval'] !== 'pending'
    && gerekir('contract', { tutar: sozlesmeTutari(yeni), sozlesmeTuru: yeni['type'] })) return 'Sözleşme iç onaydan geçmeden onaylı sayılamaz.';
  if (koleksiyon === 'priceReqs' && yeni['status'] === 'approved' && eski?.['status'] !== 'approved' && metin(eski?.['pendingApproval']) === null
    && gerekir('pricereq', { fark: fiyatFarki(yeni) })) return 'Fiyat artışı onay sınırını aşıyor; onaya gönderilmeden onaylanamaz.';
  // Bekleyen onayı karara bağlayan yazı (bekleyen kimlik kalkar) onayEtkisiReddi ile denetlenir; öteki her yeni sürüm burada.
  const bekleyen = eski === null ? null : metin(eski['pendingApproval']);
  if (koleksiyon === 'requests' && eski !== null && surumSayisi(yeni) > surumSayisi(eski) && (bekleyen === null || yeni['pendingApproval'] === bekleyen)
    && gerekir('discount', { iskonto: iskonto(sonSurum(yeni)) })) return 'İskonto onay sınırını aşıyor; sürüm onaya gönderilmeden müşteriye gidemez.';
  return null;
}

// Onayın etkisi (onaylı sipariş, gönderilen ödeme, imzalanan sözleşme, uygulanan fiyat, iskontolu sürüm) yazılırken kaydın bugünkü
// değerinin istediği adımlar onayda verilmiş olmalı: onay düşük tutarla açılıp kayıt büyütülemez. Açanın rolü onu kaydında.
// null: denetlenecek etki yok.
export function onayEtkisiReddi(yol: string, eski: Veri | null, yeni: Veri, onay: Veri, R: OnayKurallari, acanRolu: string): string | null {
  const [koleksiyon] = parcalar(yol);
  const tur = String(onay['kind'] ?? '');
  let girdi: OnayGirdisi | null = null;
  if (koleksiyon === 'orders' && yeni['approvalState'] === 'approved') girdi = { tutar: siparisTutari(yeni) };
  else if (koleksiyon === 'payments' && yeni['status'] === 'sent') girdi = { tutar: sayi(yeni['amount']) };
  else if (koleksiyon === 'contracts' && yeni['approval'] === 'approved') girdi = { tutar: sozlesmeTutari(yeni), sozlesmeTuru: yeni['type'] };
  else if (koleksiyon === 'priceReqs' && yeni['status'] === 'approved') girdi = { fark: fiyatFarki(yeni) };
  else if (koleksiyon === 'requests' && surumSayisi(yeni) > surumSayisi(eski)) {
    if (onay['status'] !== 'approved') return 'İskonto onayı reddedildi; sürüm müşteriye gidemez.';
    girdi = { iskonto: iskonto(sonSurum(yeni)) };
  }
  if (girdi === null) return null;
  const roller = adimRolleri(onay);
  const eksik = acaninAdimlari(tur, girdi, R, acanRolu).filter((r) => !roller.includes(r));
  return eksik.length === 0 ? null : `Kaydın bugünkü değeri ${eksik.join(', ')} onayını da istiyor; kaydı yeniden onaya gönderin.`;
}

// ---- Siparişler bağı (soru 148, 162). Teklif ve siparişin sahibi Siparişler'dir; Portal talebi açılırken orada teklif olur. Firma
// müşteri kartının kimliğinden, kalem katalog kodundan çözülür; adla eşlenmez. Kodsuz kalem tanımla girer, kartı siparişe dönüşmeden
// Siparişler'de bağlanır (TKL-06).

export interface PortalTeklifTalebi {
  firmaKimligi: string | null; baslik: string; paraBirimi: string; istenenTarih: string | null; aciklama: string | null;
  satirlar: { kod: string | null; tanim: string; miktar: string }[];
}

// Yalnız yeni açılan talep: köprüden önce yazılmış talep Siparişler'e taşınmaz, Portal'da kalır.
export function teklifAcilisi(yol: string, eski: Veri | null, yeni: Veri): PortalTeklifTalebi | null {
  const [koleksiyon, kimlik, ...fazla] = parcalar(yol);
  if (koleksiyon !== 'requests' || kimlik === undefined || fazla.length > 0 || eski !== null) return null;
  return talepBilgisi(yeni);
}

// Siparişler talebi yalnız ilk sürümden önce düzenletir (TKL-03); sürüm fiyatları talep satırlarına sırayla eşlendiği için o ana kadarki
// değişiklik oraya da yazılmalıdır. Sürüm taşıyan yazı (ilk sürümü getiren dahil) talebi Siparişler'de değiştirmez.
export function talepDuzenlemesi(yol: string, eski: Veri | null, yeni: Veri): PortalTeklifTalebi | null {
  const [koleksiyon, kimlik, ...fazla] = parcalar(yol);
  if (koleksiyon !== 'requests' || kimlik === undefined || fazla.length > 0 || eski === null) return null;
  if (surumNolari(eski).size > 0 || surumNolari(yeni).size > 0) return null;
  const talep = talepBilgisi(yeni);
  return JSON.stringify(talep) === JSON.stringify(talepBilgisi(eski)) ? null : talep;
}

function talepBilgisi(yeni: Veri): PortalTeklifTalebi {
  return {
    firmaKimligi: metin(yeni['customerId']), baslik: metin(yeni['title']) ?? metin(yeni['no']) ?? '',
    paraBirimi: metin(yeni['currency']) ?? 'TRY', istenenTarih: gun(yeni['neededBy']), aciklama: metin(yeni['note']),
    satirlar: dizi(yeni['items']).map((k) => {
      const ad = metin(k['name'])?.trim() ?? '';
      const ozellik = metin(k['spec'])?.trim();
      return { kod: metin(k['code']), tanim: ozellik === undefined ? ad : `${ad} · ${ozellik}`, miktar: ondalikMetni(k['qty']) ?? '' };
    }),
  };
}

// Talep yazısının teklif adımları, Siparişler'e uygulanacak sırayla: önce yeni sürümler, sonra durum geçişi. Yeni açılan talebin
// taşıdığı sürüm ve durum da adımdır.
// Siparişler reddi ve revizyonu notla ister; Portal'da not isteğe bağlı olan red için not yoksa Portal'ın kendi iletisi yazılır.
export type TeklifAdimi =
  | { tur: 'surum'; fiyatlar: string[]; iskontoOrani: string; teslimGun: number | null; odemeKosulu: string | null; gecerlilik: string | null; aciklama: string | null }
  | { tur: 'revizyon' | 'red'; not: string }
  | { tur: 'kabul'; surumNo: number };

export function teklifAdimlari(yol: string, eski: Veri | null, yeni: Veri): TeklifAdimi[] {
  const [koleksiyon, kimlik, ...fazla] = parcalar(yol);
  if (koleksiyon !== 'requests' || kimlik === undefined || fazla.length > 0) return [];
  const onceki = surumNolari(eski);
  const adimlar: TeklifAdimi[] = dizi(yeni['versions'])
    .filter((v) => { const no = tamSayi(v['v']); return no !== null && !onceki.has(no); })
    .sort((a, b) => Number(a['v']) - Number(b['v']))
    .map((v) => ({
      tur: 'surum',
      fiyatlar: (Array.isArray(v['prices']) ? v['prices'] : []).map((f) => ondalikMetni(f) ?? ''),
      iskontoOrani: ondalikMetni(v['discount'] ?? 0) ?? '',
      teslimGun: tamSayi(v['deliveryDays']), odemeKosulu: metin(v['payment']), gecerlilik: gun(v['validUntil']), aciklama: metin(v['note']),
    }));
  if (yeni['status'] === eski?.['status']) return adimlar;
  if (yeni['status'] === 'revision') adimlar.push({ tur: 'revizyon', not: metin(yeni['revisionNote']) ?? 'Portal\'da revizyon istendi.' });
  if (yeni['status'] === 'rejected') adimlar.push({ tur: 'red', not: metin(yeni['rejectNote']) ?? 'Portal\'da reddedildi.' });
  const kabul = tamSayi(yeni['acceptedVersion']);
  if (yeni['status'] === 'accepted' && kabul !== null) adimlar.push({ tur: 'kabul', surumNo: kabul });
  return adimlar;
}

// Teklif durumu Siparişler'dedir (254 a): bağlı talebin durumu okurken oradan gelir; fiyat ve kalem Portal'ın kopyasından kalır.
const PORTAL_TALEP_DURUMU: Record<TeklifDurumu, string> = {
  yeni: 'new', 'onay-bekliyor': 'new', verildi: 'quoted', revizyon: 'revision', kabul: 'accepted', red: 'rejected', siparis: 'ordered',
};

export const talepKimligi = (yol: string): string | null => {
  const [koleksiyon, kimlik, ...fazla] = parcalar(yol);
  return koleksiyon === 'requests' && kimlik !== undefined && fazla.length === 0 ? kimlik : null;
};

export function teklifDurumuBindir(belge: DepoBelgesi, durum: TeklifDurumu | undefined): DepoBelgesi {
  if (durum === undefined || talepKimligi(belge.yol) === null) return belge;
  return { ...belge, veri: { ...belge.veri, status: PORTAL_TALEP_DURUMU[durum] } };
}

// "Siparişe dönüştür": prototip önce satış siparişini talebin numarasıyla (sourceNo), sonra talebi "ordered" yazar. Dönüşüm sipariş
// belgesi yazılırken yapılır; Siparişler reddederse (kabul yok, kartsız satır) Portal'da sipariş de açılmaz.
export interface PortalSiparisDonusumu { talepNo: string; siparisTarihi: string | null; termin: string | null; kdvOrani: string | null }

export function siparisDonusumu(yol: string, eski: Veri | null, yeni: Veri): PortalSiparisDonusumu | null {
  const [koleksiyon, kimlik, ...fazla] = parcalar(yol);
  if (koleksiyon !== 'orders' || kimlik === undefined || fazla.length > 0 || eski !== null || yeni['type'] !== 'sales') return null;
  const talepNo = metin(yeni['sourceNo']);
  if (talepNo === null) return null;
  const kdv = yeni['vat'];
  return {
    talepNo, siparisTarihi: gun(yeni['createdAt']), termin: gun(yeni['promisedDate']),
    kdvOrani: typeof kdv === 'number' ? ondalikMetni(kdv * 100) : null,
  };
}

// Sözleşmeden açılan satış siparişi (karar 255 a): prototip çağrı siparişini sözleşme kimliği ve numarasıyla (contractId, sourceNo)
// yazar. Siparişler'e teklifsiz sipariş olarak, sözleşme numarası müşteri sipariş numarasında gider.
export interface PortalSozlesmeSiparisi {
  sozlesmeNo: string; firmaKimligi: string | null; siparisTarihi: string | null; termin: string | null; paraBirimi: string;
  kdvOrani: string | null; odemeKosulu: string | null; satirlar: { kod: string | null; tanim: string; miktar: string; birimFiyat: string | null }[];
}

export function sozlesmeSiparisi(yol: string, eski: Veri | null, yeni: Veri): PortalSozlesmeSiparisi | null {
  const [koleksiyon, kimlik, ...fazla] = parcalar(yol);
  if (koleksiyon !== 'orders' || kimlik === undefined || fazla.length > 0 || eski !== null || yeni['type'] !== 'sales') return null;
  const sozlesmeNo = metin(yeni['sourceNo']);
  if (metin(yeni['contractId']) === null || sozlesmeNo === null) return null;
  const kdv = yeni['vat'];
  return {
    sozlesmeNo, firmaKimligi: metin(yeni['partyId']), siparisTarihi: gun(yeni['createdAt']), termin: gun(yeni['promisedDate']),
    paraBirimi: metin(yeni['currency']) ?? 'TRY', kdvOrani: typeof kdv === 'number' ? ondalikMetni(kdv * 100) : null, odemeKosulu: metin(yeni['payment']),
    satirlar: dizi(yeni['items']).map((k) => ({
      kod: metin(k['code']), tanim: metin(k['name'])?.trim() ?? '', miktar: ondalikMetni(k['qty']) ?? '', birimFiyat: ondalikMetni(k['price']),
    })),
  };
}

// ---- Fiyat ve maliyet görünürlüğü (karar 180: yalnız yönetici ve müdür). Bölüm izninin üstüne TMI işlemi aranır: fiyat
// siparisler.fiyat-oku, fatura, ödeme ve ceza tutarı finans.oku. Satın alma kataloğu ve satın alma siparişi bu kuralın dışında.
export const FIYAT_OKU = 'siparisler.fiyat-oku';
export const FINANS_OKU = 'finans.oku';
const KOLEKSIYON_ISLEMI: Readonly<Record<string, string>> = { contracts: FIYAT_OKU, payments: FINANS_OKU, cheques: FINANS_OKU, recons: FINANS_OKU };

export function islemOkuyabilirMi(yol: string, islemler: readonly string[], veri: Veri | null): boolean {
  const [koleksiyon] = parcalar(yol);
  if (koleksiyon === 'catalog') return veri?.['side'] !== 'sales' || islemler.includes(FIYAT_OKU);
  const gerekli = koleksiyon === undefined ? undefined : KOLEKSIYON_ISLEMI[koleksiyon];
  return gerekli === undefined || islemler.includes(gerekli);
}

const satisSiparisiMi = (yol: string, veri: Veri | null): boolean => {
  const p = parcalar(yol);
  return p.length === 2 && p[0] === 'orders' && veri?.['type'] === 'sales';
};

const teklifTalebiMi = (yol: string): boolean => { const p = parcalar(yol); return p.length === 2 && p[0] === 'requests'; };

// Geçmiş metni ve teklif notu serbest yazıdır; içindeki tutar (prototipin para biçimi ya da elle yazılmış "12 TL") alanın
// kendisi kadar gizlidir. Tutar dışındaki yazı kalır ki kişi ne olduğunu görsün.
const TUTAR = [/-?[₺€$£]\s?\d[\d.,]*(?:\s?(?:bin|mn)(?!\p{L}))?/gu, /-?\d[\d.,]*\s?(?:TL|TRY|USD|EUR|GBP|[₺€$£])(?!\p{L})/gu];
export const tutarlariGizle = (metin: string): string => TUTAR.reduce((m, desen) => m.replace(desen, '—'), metin);

function gecmisiGizle(veri: Veri): Veri {
  if (!Array.isArray(veri['history'])) return { ...veri };
  return {
    ...veri,
    history: veri['history'].map((h: unknown) => (duzNesneMi(h) && typeof h['text'] === 'string' ? { ...h, text: tutarlariGizle(h['text']) } : h)),
  };
}

// Geçmiş yalnız sonuna eklenir; gizli okuyanın yazısında var olan satırlar eski belgeden geri konur, yeni satır yazandan gelir.
function gecmisiGeriKoy(eski: Veri, yeni: Veri): Veri {
  if (!Array.isArray(yeni['history'])) return { ...yeni };
  const onceki = dizi(eski['history']);
  return { ...yeni, history: yeni['history'].map((h: unknown, i) => onceki[i] ?? h) };
}

// Teklif talebinin sürüm fiyatları satış fiyatıdır (karar 180); fiyatı görmeyene boş gider, yazısında var olan sürümün fiyatı
// ve notu geri konur. Fiyatı görmeyenin açtığı yeni sürümün fiyatı yazandan gelir.
function surumFiyatlariniBosalt(veri: Veri): Veri {
  if (!Array.isArray(veri['versions'])) return veri;
  return {
    ...veri,
    versions: veri['versions'].map((v: unknown) => {
      if (!duzNesneMi(v)) return v;
      const sonuc: Veri = Array.isArray(v['prices']) ? { ...v, prices: v['prices'].map(() => null) } : { ...v };
      if (typeof v['note'] === 'string') sonuc['note'] = tutarlariGizle(v['note']);
      return sonuc;
    }),
  };
}

function surumFiyatlariniGeriKoy(eski: Veri, yeni: Veri): Veri {
  if (!Array.isArray(yeni['versions'])) return yeni;
  const onceki = new Map(dizi(eski['versions']).map((v) => [v['v'], v]));
  return {
    ...yeni,
    versions: yeni['versions'].map((v: unknown) => {
      const e = duzNesneMi(v) ? onceki.get(v['v']) : undefined;
      if (!duzNesneMi(v) || e === undefined) return v;
      const sonuc: Veri = { ...v, prices: e['prices'] };
      if ('note' in e) sonuc['note'] = e['note'];
      return sonuc;
    }),
  };
}

// Satış siparişinde fiyatı görmeyene kalem fiyatı boş, finansı görmeyene fatura ve ceza listesi boş gider; alan silinmez ki
// ekran kalem ve teslim satırlarını yine çizebilsin. Geçmiş metnindeki tutar da iki işlemi birden taşımayana gizlenir.
export function fiyatGizle(yol: string, veri: Veri, islemler: readonly string[]): Veri {
  if (teklifTalebiMi(yol)) return islemler.includes(FIYAT_OKU) ? veri : gecmisiGizle(surumFiyatlariniBosalt(veri));
  if (!satisSiparisiMi(yol, veri)) return veri;
  const sonuc: Veri = islemler.includes(FIYAT_OKU) && islemler.includes(FINANS_OKU) ? { ...veri } : gecmisiGizle(veri);
  if (!islemler.includes(FIYAT_OKU) && Array.isArray(veri['items'])) {
    sonuc['items'] = veri['items'].map((k: unknown) => (duzNesneMi(k) ? { ...k, price: null } : k));
  }
  if (!islemler.includes(FINANS_OKU)) {
    if ('invoices' in veri) sonuc['invoices'] = [];
    if ('penalties' in veri) sonuc['penalties'] = [];
  }
  return sonuc;
}

// Gizli alanı görmeyen kişi belgeyi bütün yeniden yazar (prototip tam yazar); gizli değerler var olan belgeden geri konur.
// Kalem fiyatı sırayla geri konur; eski belgede karşılığı olmayan yeni kalemin fiyatı yazandan gelir.
export function gizliAlanlariKoru(yol: string, eski: Veri | null, yeni: Veri, islemler: readonly string[]): Veri {
  if (eski !== null && teklifTalebiMi(yol)) return islemler.includes(FIYAT_OKU) ? yeni : gecmisiGeriKoy(eski, surumFiyatlariniGeriKoy(eski, yeni));
  if (eski === null || !satisSiparisiMi(yol, eski)) return yeni;
  const sonuc: Veri = islemler.includes(FIYAT_OKU) && islemler.includes(FINANS_OKU) ? { ...yeni } : gecmisiGeriKoy(eski, yeni);
  if (!islemler.includes(FIYAT_OKU) && Array.isArray(yeni['items'])) {
    const eskiKalemler = dizi(eski['items']);
    sonuc['items'] = yeni['items'].map((k: unknown, i) => {
      const onceki = eskiKalemler[i];
      return duzNesneMi(k) && onceki !== undefined ? { ...k, price: onceki['price'] } : k;
    });
  }
  if (!islemler.includes(FINANS_OKU)) {
    for (const alan of ['invoices', 'penalties']) {
      if (alan in eski) sonuc[alan] = eski[alan];
      else delete sonuc[alan];
    }
  }
  return sonuc;
}
