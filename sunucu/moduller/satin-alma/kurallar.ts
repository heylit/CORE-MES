// Satın alma kuralları: saf fonksiyonlar ve sabitler; veritabanı ve saat yok.
import { PARA_BIRIMLERI } from '#paylasilan/sozlesme/satin-alma.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { KmTedarikciDurumu } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { FasonIsEmri } from '../uretim-emirleri/disari.ts';
import type { HizliKalem, Kalite, Karar, Onay, Talebim, Talep, TalepDurumu, TalepTuru, TalepYazimi, TeslimDurumu } from '#paylasilan/sozlesme/satin-alma.ts';
import { MALZEMELER_SAYFALARI } from '#paylasilan/sayfalar/malzemeler.ts';

export const ISLEM = {
  oku: 'satin-alma.oku', talepAc: 'satin-alma.talep-ac', yaz: 'satin-alma.yaz', onayla: 'satin-alma.onayla', ayar: 'satin-alma.ayar',
} as const;
export type SatinAlmaIslemi = (typeof ISLEM)[keyof typeof ISLEM];

// Limit tablosu hiç kaydedilmemişse geçerli olan varsayılan; ekranın `merkez/constants.ts` varsayılanıyla aynıdır (testle sabit).
export const VARSAYILAN_ONAY_LIMITLERI: readonly { azamiTutar: string | null; seviye: string }[] = [
  { azamiTutar: '50000', seviye: 'Satın alma uzmanı' },
  { azamiTutar: '250000', seviye: 'Satın alma müdürü' },
  { azamiTutar: '1000000', seviye: 'Genel müdür yardımcısı' },
  { azamiTutar: null, seviye: 'Genel müdür' },
];

// SAT-72: şirket adının esası satın alma ayarıdır; boş ad "yok" demektir, boş metin gösterilmez.
export const sirketAdiGorunumu = (sirket: string): string | null => (sirket.trim() === '' ? null : sirket.trim());

export const ILETILER = {
  talepYok: 'Talep bulunamadı.',
  emirKapali: 'Üretim emri açık değil: yalnız planlı ya da başlamış emir seçilir.',
  tedarikciYok: 'Tedarikçi bulunamadı.',
  terminMalzemesiYok: 'Malzeme kartı bulunamadı.',
  terminVar: 'Bu malzemenin termini başka biri tarafından girildi; sayfayı yenileyin.',
  katalogYok: 'Katalog kalemi bulunamadı.',
  yetkiYok: 'Bu değişiklik için yetkiniz yok.',
  gecisYok: 'Talep bu durumdan istenen duruma geçemez.',
  dortGoz: 'Kararı veren kişi o kararı onaylayamaz.',
  kisiYok: 'Talep eden kişi bulunamadı.',
  teslimMiktari: 'Teslim miktarı sıfırdan büyük olmalı.',
  teslimSiparisYok: 'Sipariş satırı bulunamadı.',
  teslimDurumu: 'Teslim yalnız siparişi verilmiş talebe yazılır.',
  teslimTekrar: 'Bu mal kabul satırının teslimi zaten yazılmış; önce geri alın.',
  teslimGeriAlinacakYok: 'Bu mal kabul satırının geri alınacak teslimi yok.',
  firmaPasif: 'Tedarikçi, finansta kayıtlı aktif bir tedarikçi firması olmalı.',
  // Sayfa adı malzemelerin sayfa tanımından okunur; ad değişince ileti de izler.
  kartYok: `Malzeme kartı bulunamadı; yeni kart "${MALZEMELER_SAYFALARI[0].baslik}" sayfasında açılır.`,
  kartAktifDegil: 'Kataloğa yalnız aktif malzeme kartı bağlanır.',
  kartBirimsiz: 'Malzeme kartının birimi yok; önce kartta birimi girin.',
  kurYok: (paraBirimi: string, tarih: string): string => `Finansta ${tarih} için ${paraBirimi} kuru yok; teklife o günün kurunu girin.`,
  firmaYok: 'Firma bulunamadı.',
  tedarikciVar: 'Bu firma zaten tedarikçi.',
  talepVar: 'Bu kimlikle bir talep zaten var.',
  yalnizTaslak: 'Talep eden yalnız taslak ya da teklif istenen hâlde talep açar.',
  bagliKayit: 'Kayıt kullanıldığı için silinemez.',
  acilisDurumu: 'Talep taslak, teklif istenen, değerlendirme ya da iptal durumuyla açılır.',
  onayDurumu: 'Onay ya da ret yalnız onaydaki ve kararı verilmiş talebe eklenir.',
  onaysizSiparis: 'Sipariş için kararın onaylanmış olması gerekir.',
  askidakiTedarikci: (adlar: readonly string[]): string => `Kalite Merkezi'nde onayı Aday ya da Askıda olan tedarikçiye sipariş verilmez: ${adlar.join(', ')}. Kalite Merkezi'nde durumunu değiştirin ya da başka teklife karar verin.`,
  onayliKararDegismez: 'Onaylanmış karar değişmez; değişmesi için önce reddedilmelidir.',
  kartsizSiparis: (adlar: readonly string[]): string => `Kart bekleyen kalemle sipariş verilmez; önce kalemi malzeme kartına bağlayın: ${adlar.join(', ')}. Malzemeler bölümünde kartı "Kataloğa ekle" ile ekleyin, sonra "Kataloğa bağla" ile kalemi seçin.`,
  siparisliKalem: (adlar: readonly string[]): string => `Siparişi verilmiş kalemin miktarı ve birimi kaydetle değişmez, kalem silinmez: ${adlar.join(', ')}. Siparişteki "Kalemi değiştir" ile gerekçe yazarak değiştirin (onay yetkisi gerekir).`,
  faturaSiparisDurumu: 'Fatura yalnız siparişi verilmiş talepte bağlanır.',
  planSiparisDurumu: 'Ödeme planı yalnız siparişi verilmiş talepte yazılır.',
  planSiparisYok: 'Bu teklifin siparişi yok.',
  planKayitsizTedarikci: 'Tedarikçi finansta kayıtlı değil; ödeme planı finansa yazılamaz.',
  faturaSiparisYok: 'Sipariş bulunamadı.',
  faturaKayitsizTedarikci: 'Kayıtlı olmayan tedarikçinin siparişine fatura bağlanmaz; tedarikçiyi finansta kaydedip teklife seçin.',
  faturaBaskaSipariste: 'Fatura başka bir siparişe bağlı; önce oradan kaldırın.',
  faturaBagliDegil: 'Fatura bu siparişe bağlı değil.',
  siparisDegisikligiDurumu: 'Kalem değişikliği yalnız siparişi verilmiş talepte yapılır.',
  siparisteKalemYok: 'Kalem siparişte yok.',
  siparisDegisikligiYok: 'Miktar ve birim aynı; değişiklik yok.',
  teslimliBirimDegismez: 'Teslim alınmış kalemin birimi değişmez.',
  kartBirimi: (ad: string, birim: string): string => `${ad}: birim malzeme kartının birimiyle girilir (${birim}); başka birimle sipariş verilmez.`,
  teslimdenAz: (teslim: string): string => `Miktar teslim alınandan (${teslim}) az olamaz.`,
  hizliKalemBos: 'Kalem için malzeme kartı seçin ya da adını yazın.',
  hizliKalemBirimsiz: 'Kartı olmayan kalemde birim zorunlu.',
  kartTuruTalepteYok: 'Bu tür kart talepte seçilemez.',
  birimYok: (ad: string): string => `Birim listede yok: ${ad}. Ayarlar'dan ekleyin ya da listeden seçin.`,
  logoyaGitmisSiparis: (nolar: readonly string[]): string => `Logo'ya gönderilmiş siparişin tedarikçisi ve para birimi değişmez, sipariş karardan çıkmaz; irsaliyesi gelmiş ya da kalanı kapatılmış siparişin satırı, miktarı, fiyatı ve termini de değişmez: ${nolar.join(', ')}.`,
  logoIptalliSiparis: 'Logo\'ya gönderilmiş sipariş iptalden geri alınmaz; yeni talep açın.',
  logoKayitsizTedarikci: 'Tedarikçi finansta kayıtlı değil; sipariş Logo\'ya gönderilemez.',
  kapaliSipariseTeslim: 'Siparişin kalanı kapatıldı; teslim yazılamaz.',
  kapatmaSiparisYok: 'Kapatılacak sipariş bu talepte yok.',
  kapatmaDurumu: 'Yalnız siparişi verilmiş talebin siparişi kapatılır.',
  kapatmaLogoda: 'Yalnız Logo\'ya gönderilmiş sipariş kapatılır; gönderilmemiş siparişi talepten çıkarın.',
  kapatmaVar: 'Siparişin kalanı zaten kapatıldı ya da sipariş iptal edildi.',
  kapatmaKalanYok: 'Siparişin bütün satırları teslim alındı; kapatılacak kalan yok.',
  numaraUzun: 'Numara kuralı çok uzun numara üretti; Sistem ayarlarındaki numara kuralını kısaltın.',
  bagYalnizHizmette: 'Uygulanan parça ve fason adım yalnız hizmet talebinde yazılır.',
  uygulananKartYok: 'Uygulanan parça ya da malzeme kartı bulunamadı.',
  uygulananHizmet: 'Uygulanan kart bir parça ya da malzeme olmalı; hizmet kartı seçilemez.',
  fasonOnTalepYok: 'Bu fason adım için ön talep yok: emir kapandı, adım bitti ya da talebi zaten açıldı. Sayfayı yenileyin.',
  fasonEmirFarkli: 'Fason adım seçilen üretim emrinin değil.',
  fasonTekrar: 'Aynı fason adım talepte iki kez var.',
  onTalepYoksayYok: 'Yoksayma kaydı bulunamadı; sayfayı yenileyin.',
} as const;

// SAT-07: durum geçişleri. Aynı durumda kalmak her zaman serbest. Yanlış iptal elle önceki duruma çevrilir (SAT-68).
// "Teslim alındı" istemciyle yazılmaz: stoktaki mal kabulden türetilir (SAT-38).
// Teklif isteniyor -> onayda: ekran karar kaydedilince talebi bulunduğu açık durumdan onaya gönderir; geçiş olmasa karar kaybolurdu.
export const GECISLER: Readonly<Record<TalepDurumu, readonly TalepDurumu[]>> = {
  taslak: ['teklif_isteniyor', 'degerlendirme', 'iptal'],
  teklif_isteniyor: ['taslak', 'degerlendirme', 'onayda', 'iptal'],
  degerlendirme: ['teklif_isteniyor', 'onayda', 'iptal'],
  onayda: ['degerlendirme', 'siparis_verildi', 'iptal'],
  siparis_verildi: ['onayda', 'iptal'],
  teslim_alindi: [],
  iptal: ['taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda', 'siparis_verildi'],
};
export const gecisVarMi = (eski: TalepDurumu, yeni: TalepDurumu): boolean => eski === yeni || GECISLER[eski].includes(yeni);

// Karşılaştırma alan sırasından bağımsızdır: sunucunun kurduğu ile istemciden ayrıştırılan nesne aynı alanları başka sırada taşır.
export function izi(deger: unknown): string {
  const sirala = (d: unknown): unknown => (Array.isArray(d) ? d.map(sirala)
    : d !== null && typeof d === 'object' ? Object.fromEntries(Object.keys(d).sort().map((k) => [k, sirala((d as Record<string, unknown>)[k])])) : d);
  return JSON.stringify(sirala(deger));
}

// Talebin kendisi (başlık, kalemler, notlar...): satın alma ya da kendi taslağında talep eden.
const govdeIzi = (t: TalepYazimi, durumHaric: boolean): string => {
  // Yalnız talebin kendi alanları; sunucunun verdiği salt okunur alanlar (no, ad, sürüm, tarihler) karşılaştırılmaz.
  const g = { baslik: t.baslik, birim: t.birim, talepEdenKisiId: t.talepEdenKisiId, oncelik: t.oncelik, ihtiyacTarihi: t.ihtiyacTarihi,
    notlar: t.notlar, iptalNedeni: t.iptalNedeni, kalemler: t.kalemler, uretimEmriId: t.uretimEmriId };
  return izi({ ...g, ...(durumHaric ? {} : { durum: t.durum }) });
};
// Satın almanın işi: teklif, istek, karar, senaryo, ağırlık. Siparişte yalnız satın almanın alanları (teslim bilgisi stoktan okunur).
// Küme niteliğindeki listeler (fiyat, bölünme, kur, sipariş, pay) sırasız karşılaştırılır; senaryonun kişi ve zamanı sunucunundur.
const sirali = <T>(l: readonly T[], anahtar: (x: T) => string): T[] => [...l].sort((a, b) => (anahtar(a) < anahtar(b) ? -1 : anahtar(a) > anahtar(b) ? 1 : 0));
const satinAlmaIzi = (t: TalepYazimi): string => {
  // Karar verenin adı sunucunun çıkışa kattığı salt okunur alandır; karşılaştırmaya girerse her onay kaydı satın alma işi sayılır.
  // Öbür alanlar tek tek sayılmaz: karara sonradan eklenen alan sayılmayı unutursa yetkisiz değiştirilebilir olurdu.
  const { kararVerenAdi: _salt, ...karar } = (t.karar ?? {}) as NonNullable<TalepYazimi['karar']> & { kararVerenAdi?: unknown };
  const k = t.karar === null ? null : {
    ...karar,
    bolunme: sirali(karar.bolunme, (b) => b.kalemId),
    sabitKurlar: sirali(t.karar.sabitKurlar, (s) => s.paraBirimi),
    siparisler: sirali(t.karar.siparisler.map((s) => ({ teklifId: s.teklifId, siparisNo: s.siparisNo, siparisTarihi: s.siparisTarihi, beklenenTeslim: s.beklenenTeslim })), (s) => s.teklifId),
  };
  return izi({
    teklifler: t.teklifler.map((q) => ({ ...q, fiyatlar: sirali(q.fiyatlar, (f) => f.kalemId) })),
    teklifIstekleri: sirali(t.teklifIstekleri, (r) => String(r.firmaId)),
    senaryolar: t.senaryolar.map((s) => ({ id: s.id, ad: s.ad, paylar: sirali(s.paylar, (p) => p.kalemId + p.teklifId), dengeler: sirali(s.dengeler, (d) => d.kalemId) })),
    agirliklar: t.agirliklar, karar: k,
  });
};

// B-001: kararın özü; kim ve ne zaman sunucunundur, sipariş, sabit kur ve öğrenilenler karardan sonra yazılır.
export function kararOzu(k: Pick<Karar, 'mod' | 'teklifId' | 'bolunme' | 'gerekce'> | null): string | null {
  return k === null ? null : izi({ mod: k.mod, teklifId: k.teklifId, bolunme: sirali(k.bolunme, (b) => b.kalemId + b.teklifId), gerekce: k.gerekce });
}
export const kararDegistiMi = (eski: Karar | null, yeni: Karar | null): boolean => kararOzu(eski) !== kararOzu(yeni);

// B-002: karar, son onay kaydı "onay" ise onaylıdır; sonradan gelen ret onayı geçersiz kılar.
export const kararOnayliMi = (onaylar: readonly Pick<Onay, 'sonuc'>[]): boolean => onaylar.at(-1)?.sonuc === 'onay';
// #205 S3 b: karar bu kayıtta onaylanınca talep fişi Logo'ya gider; iptal edilen talebin fişi gitmez.
export const talepFisiGiderMi = (eskiOnaylar: readonly Pick<Onay, 'sonuc'>[], yeniOnaylar: readonly Pick<Onay, 'sonuc'>[], durum: TalepDurumu): boolean =>
  durum !== 'iptal' && !kararOnayliMi(eskiOnaylar) && kararOnayliMi([...eskiOnaylar, ...yeniOnaylar]);

// B-002: sipariş durumuna girmek (taslaktan, onaydan ya da iptalden) onaylı karar ister; zaten siparişte olan talep serbesttir.
export function siparisReddi(eski: TalepDurumu, yeni: TalepDurumu, kararVar: boolean, onaylar: readonly Pick<Onay, 'sonuc'>[]): string | null {
  const siparis = (d: TalepDurumu) => d === 'siparis_verildi' || d === 'teslim_alindi';
  if (!siparis(yeni) || siparis(eski)) return null;
  return kararVar && kararOnayliMi(onaylar) ? null : ILETILER.onaysizSiparis;
}

export interface Degisiklik { onay: boolean; govde: boolean; satinAlma: boolean }

// SAT-64 / V-33: kaydedilen bütünün hangi işlemleri gerektirdiği. Onay eklenirken durum değişimi (ret: degerlendirme)
// onayın parçasıdır; gerisi gövde ya da satın almanın işidir. Teslim bu modülde yazılmaz.
export function degisiklikTuru(eski: TalepYazimi, yeni: TalepYazimi): Degisiklik {
  const eskiOnaylar = new Set(eski.onaylar.map((o) => o.id));
  const onay = yeni.onaylar.some((o) => !eskiOnaylar.has(o.id));
  const govde = govdeIzi(eski, onay) !== govdeIzi(yeni, onay);
  return { onay, govde, satinAlma: satinAlmaIzi(eski) !== satinAlmaIzi(yeni) };
}

// Gereken işlemleri kullanıcının işlemleriyle karşılaştırır. Kendi taslağını (ya da teklif istenen talebini) düzenleyen talep eden `talep-ac` ile yetinir.
export function degisiklikReddi(d: Degisiklik, islemler: readonly string[], kendiTaslagi: boolean): string | null {
  if (d.onay && !islemler.includes(ISLEM.onayla)) return ILETILER.yetkiYok;
  if (d.satinAlma && !islemler.includes(ISLEM.yaz)) return ILETILER.yetkiYok;
  if (d.govde && !islemler.includes(ISLEM.yaz) && !(kendiTaslagi && islemler.includes(ISLEM.talepAc))) return ILETILER.yetkiYok;
  return null;
}

// Talep eden yalnız taslak ya da teklif istenen talebi düzenler (prototip: talep eden talebi gönderir).
export const talepEdenDurumu = (d: TalepDurumu): boolean => d === 'taslak' || d === 'teklif_isteniyor';

// SAT-30: ayar açıkken kararı veren onaylayamaz; kapalıyken onay dört gözsüz işaretlenir.
export function dortGozSonucu(kisiId: number, kararVeren: number | null, acik: boolean): 'red' | 'dortGozsuz' | 'normal' {
  if (!acik) return 'dortGozsuz';
  return kararVeren !== null && kisiId === kararVeren ? 'red' : 'normal';
}

// SAT-53: talep eden yalnız kendi talebini görür. Kararda seçilen teklif açıktır; rakip teklifler sayılsın diye kalır ama adsız ve
// fiyatsızdır (tedarikçi, fiyat, tutar, not yok). Teklif istekleri ve senaryolar görünmez.
// #375: talep eden teklif, fiyat, tedarikçi ve kararı görmez (seçilen teklif dahil). Geçmiş metinleri ve onay notları tedarikçi adı
// ve fiyat taşıyabildiği için talep eden yalnız kendi yazdığı geçmişi görür; onayın sonucu görünür, notu görünmez.
export function talepEdenGorunumu<T extends TalepYazimi>(t: T, kisiId: number): T {
  return {
    ...t,
    teklifler: [], teklifIstekleri: [], senaryolar: [], karar: null,
    onaylar: t.onaylar.map((o) => ({ ...o, notlar: '' })),
    hareketler: t.hareketler.filter((h) => h.kisiId === kisiId),
  };
}

// Kullanıcı satın almanın tamamını görür mü (iş kutusu, bütün talepler, tedarikçiler)?
export const tamGorurMu = (islemler: readonly string[]): boolean =>
  islemler.includes(ISLEM.oku) || islemler.includes(ISLEM.yaz) || islemler.includes(ISLEM.onayla);

// S2 (07.10.2026): teklif fiyatı denetim kaydına ne tam gövdeyle ne gövdesiz girer; fiyatı değişen her teklif ve kalem için bir
// ek satırı yazılır. Serbest metin (not, tedarikçi adı) ve dosya eki girmez. Satır sayısı çekirdeğin ek sınırını aşarsa ilk
// satır kesildiğini ve toplamı söyler (denetim ekranında en üstte görünür), ardından ilk 99 değişiklik gelir.
export const FIYAT_IZI_SINIRI = 100;

export type FiyatIzi = Readonly<Record<string, string | number | boolean | null>>;

type TeklifFiyatlari = Pick<Talep, 'teklifler' | 'kalemler'>;

export function fiyatIzleri(eski: TeklifFiyatlari | null, yeni: TeklifFiyatlari): FiyatIzi[] {
  const satirlar: FiyatIzi[] = [];
  const eskiTeklifler = new Map((eski?.teklifler ?? []).map((q) => [q.id, q]));
  const yeniTeklifler = new Map(yeni.teklifler.map((q) => [q.id, q]));
  const miktarlar = new Map([...(eski?.kalemler ?? []), ...yeni.kalemler].map((k) => [k.id, k.miktar]));
  const teklifIdleri = [...new Set([...yeni.teklifler.map((q) => q.id), ...eskiTeklifler.keys()])];
  for (const teklifId of teklifIdleri) {
    const once = eskiTeklifler.get(teklifId);
    const sonra = yeniTeklifler.get(teklifId);
    const onceFiyat = new Map((once?.fiyatlar ?? []).map((f) => [f.kalemId, f.birimFiyat]));
    const sonraFiyat = new Map((sonra?.fiyatlar ?? []).map((f) => [f.kalemId, f.birimFiyat]));
    for (const kalemId of new Set([...sonraFiyat.keys(), ...onceFiyat.keys()])) {
      const onceki = onceFiyat.get(kalemId) ?? null;
      const yeniDeger = sonraFiyat.get(kalemId) ?? null;
      const paraBirimi = (sonra ?? once)!.paraBirimi;
      const birimDegisti = onceki !== null && yeniDeger !== null && once!.paraBirimi !== paraBirimi;
      if (onceki === yeniDeger && !birimDegisti) continue;
      satirlar.push({
        teklifId, firmaId: (sonra ?? once)!.firmaId, kalemId, miktar: miktarlar.get(kalemId) ?? null, paraBirimi,
        ...(birimDegisti ? { oncekiParaBirimi: once!.paraBirimi } : {}), onceki, yeni: yeniDeger,
      });
    }
  }
  if (satirlar.length <= FIYAT_IZI_SINIRI) return satirlar;
  return [{ kesildi: true, toplam: satirlar.length, yazilan: FIYAT_IZI_SINIRI - 1 }, ...satirlar.slice(0, FIYAT_IZI_SINIRI - 1)];
}
// Ondalık metinleri kayan noktaya düşmeden karşılaştırır (6 basamak ölçek; sözleşmedeki en çok 6 basamak).
const OLCEK = 6;
function tamSayiya(d: string): bigint {
  const eksi = d.startsWith('-');
  const [tam = '0', kesir = ''] = (eksi ? d.slice(1) : d).split('.');
  const v = BigInt(tam + kesir.padEnd(OLCEK, '0').slice(0, OLCEK));
  return eksi ? -v : v;
}
export const ondalikKiyas = (a: string, b: string): number => {
  const x = tamSayiya(a), y = tamSayiya(b);
  return x === y ? 0 : x < y ? -1 : 1;
};
function ondalikMetni(t: bigint): string {
  const eksi = t < 0n;
  const m = (eksi ? -t : t).toString().padStart(OLCEK + 1, '0');
  const sonuc = `${m.slice(0, -OLCEK)}.${m.slice(-OLCEK)}`.replace(/0+$/, '').replace(/\.$/, '');
  return eksi ? `-${sonuc}` : sonuc;
}
export const ondalikTopla = (l: readonly string[]): string => ondalikMetni(l.reduce((s, d) => s + tamSayiya(d), 0n));

// Kalanı aşan teslim reddedilmez (kullanıcı kararı, 09.10.2026); sipariş satırında fazlası görünür. Fazla yoksa boş.
export function fazlaTeslim(miktar: string, teslimAlinan: string | null): string | null {
  if (teslimAlinan === null) return null;
  const fark = tamSayiya(teslimAlinan) - tamSayiya(miktar);
  return fark > 0n ? ondalikMetni(fark) : null;
}

// SAT-38: siparişin teslim durumu satırların stoktaki kabul miktarından türetilir. Hiç kabul yoksa bekleniyor; her satır tam
// (kabul >= sipariş miktarı) ise tamam; arası kısmi. Siparişte satır yoksa bekleniyor.
export function teslimDurumu(satirlar: readonly { miktar: string; teslimAlinan: string | null }[]): TeslimDurumu {
  if (satirlar.length === 0 || satirlar.every((s) => s.teslimAlinan === null || ondalikKiyas(s.teslimAlinan, '0') <= 0)) return 'bekleniyor';
  return satirlar.every((s) => s.teslimAlinan !== null && ondalikKiyas(s.teslimAlinan, s.miktar) >= 0) ? 'tamam' : 'kismi';
}

// SAT-38: kalite GKK sonucundan türetilir (mal kabulden önceki rota adımı; kullanıcı kararı). Satır başına GKK sonucu:
// hepsi uygun → sorunsuz; hepsi ret → red/iade; karışık ya da şartlı kabul → kısmi sorun. Hiç sonuç yoksa boş.
export type GkkSonucu = 'uygun' | 'sartli_kabul' | 'ret';
export function gkkKalitesi(sonuclar: readonly GkkSonucu[]): Kalite | null {
  if (sonuclar.length === 0) return null;
  if (sonuclar.every((s) => s === 'uygun')) return 'sorunsuz';
  if (sonuclar.every((s) => s === 'ret')) return 'red_iade';
  return 'kismi_sorun';
}

// Kayıtlı durum "sipariş verildi" iken bütün siparişler tamam ise talep "teslim alındı" görünür (yazılmaz, türetilir).
export function gorunenDurum(kayitli: TalepDurumu, siparisDurumlari: readonly TeslimDurumu[]): TalepDurumu {
  return kayitli === 'siparis_verildi' && siparisDurumlari.length > 0 && siparisDurumlari.every((d) => d === 'tamam') ? 'teslim_alindi' : kayitli;
}


// SA3 a: ayarlar hiç kaydedilmediyse (yeni kurulumda yalnız TRY vardır) ya da finansa sonradan kur girildiyse, finansta kuru olan para birimi
// ayar listesinde de görünür; finansta kuru olmayan ve listede olmayan para birimi eklenmez.
export type ParaBirimi = (typeof PARA_BIRIMLERI)[number];
export function finanstanEklenenKurlar(listede: readonly string[], finanstaKuruOlan: ReadonlySet<string>): { paraBirimi: ParaBirimi }[] {
  return PARA_BIRIMLERI.filter((p) => !listede.includes(p) && finanstaKuruOlan.has(p)).map((paraBirimi) => ({ paraBirimi }));
}

// 937 b: faizin tek kaynağı finansın faiz tablosudur; finansta o para birimi için oran yoksa boş (sıfır uydurulmaz).
export function aylikFaiz(finansta: string | undefined): string | null {
  return finansta === undefined ? null : sadeOndalik(finansta) ?? null;
}

// SA3 a: teklifte ve sabit kurda geçen para birimleri (yalnız satın almanın listesindekiler); satırı yoksa yazmadan önce eklenir.
export function kullanilanParaBirimleri(t: Pick<TalepYazimi, 'teklifler' | 'karar'>): ParaBirimi[] {
  const gecen = new Set<string>([...t.teklifler.map((q) => q.paraBirimi), ...(t.karar?.sabitKurlar ?? []).map((s) => s.paraBirimi)]);
  return PARA_BIRIMLERI.filter((p) => gecen.has(p));
}

// SA3 a: döviz teklifi kendi gününün kurunu saklar; saklanan kur finansın kuru sonradan değişse de değişmez.
// Gelen kur varsa odur; yoksa aynı para birimi ve günle saklanmış olan; o da yoksa finansın o günkü kuru istenir.
type KurluTeklif = { paraBirimi: string; teklifTarihi: string; kur: string | null };
export type TeklifKuru = { tur: 'hazir'; kur: string | null } | { tur: 'finans'; paraBirimi: string; tarih: string };
export function teklifKuru(q: KurluTeklif, eski: KurluTeklif | undefined): TeklifKuru {
  if (q.paraBirimi === 'TRY' || q.kur !== null) return { tur: 'hazir', kur: q.kur };
  if (eski !== undefined && eski.kur !== null && eski.paraBirimi === q.paraBirimi && eski.teklifTarihi === q.teklifTarihi) return { tur: 'hazir', kur: eski.kur };
  return { tur: 'finans', paraBirimi: q.paraBirimi, tarih: q.teklifTarihi };
}

// SA2 b: katalog kalemi bir malzeme kartına bağlanır. Yeni bağ ya da kart değişikliği aktif ve birimli kart ister.
// Kopya sütunlar (ad, kategori, birim) son göçe kadar karttan doldurulur; okuma karttan yapılır.
type BaglanacakKart = { kod: string; ad: string | null; birim: string | null; onayDurumu: string; kategoriAdi: string | null };
export function katalogKartiReddi(kart: BaglanacakKart | undefined): string | null {
  if (kart === undefined) return ILETILER.kartYok;
  if (kart.onayDurumu !== 'aktif') return ILETILER.kartAktifDegil;
  if (kart.birim === null || kart.birim.trim() === '') return ILETILER.kartBirimsiz;
  return null;
}
// #375, SAT-75 (#1192): talepte seçilebilen kart türleri talep türüne göre ayrılır. Liste açıkça yazılıdır ki malzemelere yeni tür
// eklenince talebe kendiliğinden girmesin. Hizmet talebi yalnız alınan hizmeti seçer; verilen hizmet satıştır.
export const TALEPTE_SECILEN_TURLER = ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas', 'ticari_mal'] as const;
export const TALEP_TURU_KARTLARI = {
  malzeme: { turler: TALEPTE_SECILEN_TURLER, hizmetYonu: undefined },
  hizmet: { turler: ['hizmet'] as const, hizmetYonu: 'alinan' as const },
} satisfies Record<TalepTuru, { turler: readonly string[]; hizmetYonu: 'alinan' | undefined }>;
export function talepKartiReddi(
  kart: (BaglanacakKart & { tur: string; hizmetYonu?: string | null }) | undefined, talepTuru: TalepTuru = 'malzeme',
): string | null {
  const red = katalogKartiReddi(kart);
  if (red !== null || kart === undefined) return red;
  const izin = TALEP_TURU_KARTLARI[talepTuru];
  if (!(izin.turler as readonly string[]).includes(kart.tur)) return ILETILER.kartTuruTalepteYok;
  return izin.hizmetYonu === undefined || kart.hizmetYonu === izin.hizmetYonu ? null : ILETILER.kartTuruTalepteYok;
}
// SAT-75 (inceleme bulgusu): katalog ve tam talep uçlarında talep türü yoktur; kart iki türden birine uymalıdır
// (fiziksel kart ya da alınan hizmet). Verilen hizmet ve listede olmayan tür satın almaya girmez.
export function satinAlinabilirKartReddi(kart: Parameters<typeof talepKartiReddi>[0]): string | null {
  const malzeme = talepKartiReddi(kart, 'malzeme');
  return malzeme === null || talepKartiReddi(kart, 'hizmet') === null ? null : malzeme;
}
// #1192: kartsız kalemin kategorisi talep türünden gelir; kartlıda kategori karttandır.
export const KARTSIZ_KATEGORI: Record<TalepTuru, string> = { malzeme: '', hizmet: 'Hizmet' };
export function hizliKalemReddi(k: Pick<HizliKalem, 'malzemeNo' | 'ad' | 'birim'>): string | null {
  if (k.malzemeNo !== null) return null;
  if (k.ad === '') return ILETILER.hizliKalemBos;
  return k.birim === '' ? ILETILER.hizliKalemBirimsiz : null;
}
// Başlık talep edenden istenmez: ilk kalemin adı ve kalan kalem sayısı.
export function hizliBaslik(adlar: readonly string[]): string {
  const ilk = (adlar[0] ?? '').slice(0, 120);
  return adlar.length > 1 ? `${ilk} ve ${adlar.length - 1} kalem daha` : ilk;
}
// SAT-76 (karar 87): askıdaki tedarikçiye yeni sipariş verilmez. Yeni sipariş: talep siparişe girerken bütün siparişler, siparişteyken
// eklenen ya da teklifinin firması değişen sipariş. Var olan sipariş tedarikçi sonradan askıya alınsa da sürer ve düzenlenir.
type SiparisKiyasi = { durum: TalepDurumu; teklifler: readonly { id: string; firmaId: number | null }[]; karar: { siparisler: readonly { teklifId: string }[] } | null };
export function yeniSiparisFirmalari(eski: SiparisKiyasi, yeni: SiparisKiyasi): number[] {
  const siparis = (d: TalepDurumu) => d === 'siparis_verildi' || d === 'teslim_alindi';
  if (!siparis(yeni.durum)) return [];
  const firma = (t: SiparisKiyasi, teklifId: string) => t.teklifler.find((q) => q.id === teklifId)?.firmaId ?? null;
  const onceki = new Set(siparis(eski.durum) ? (eski.karar?.siparisler ?? []).map((x) => `${x.teklifId}|${firma(eski, x.teklifId)}`) : []);
  return [...new Set((yeni.karar?.siparisler ?? []).flatMap((x) => {
    const f = firma(yeni, x.teklifId);
    return f === null || onceki.has(`${x.teklifId}|${f}`) ? [] : [f];
  }))];
}
export const askidakiTedarikciReddi = (adlar: readonly string[]): string | null => (adlar.length === 0 ? null : ILETILER.askidakiTedarikci(adlar));
// 236 a: tedarikçi onay durumunun sahibi Kalite Merkezi'dir. Onayı "Aday" ya da "Askıda" olan tedarikçiye yeni sipariş verilmez;
// Kalite Merkezi'nde kaydı olmayan firma reddedilmez.
export const SIPARIS_REDDEDILEN_KALITE_DURUMLARI: readonly KmTedarikciDurumu[] = ['Aday', 'Askıda'];
export const kaliteSiparisReddi = (durum: KmTedarikciDurumu | null | undefined): boolean =>
  durum !== null && durum !== undefined && SIPARIS_REDDEDILEN_KALITE_DURUMLARI.includes(durum);
// #375: kalem kartsızsa "kart bekliyor"dur; kart bağlanmadan talep siparişe dönmez (SA2 b: kopya tutulmaz, kartsız alım
// stokta teslim alınamaz ve Logo'ya gidemez).
export function kartsizSiparisReddi(eski: TalepDurumu, yeni: TalepDurumu, kalemler: readonly { ad: string; katalogId: string | null }[]): string | null {
  const siparis = (d: TalepDurumu) => d === 'siparis_verildi' || d === 'teslim_alindi';
  if (!siparis(yeni) || siparis(eski)) return null;
  const kartsiz = kalemler.filter((k) => k.katalogId === null).map((k) => k.ad);
  return kartsiz.length === 0 ? null : ILETILER.kartsizSiparis(kartsiz);
}
// Borç 36: sipariş satırı kalemin miktar ve biriminden yazılır; sipariş verilmiş talepte ya da teslimi alınmış satırda kalem değişirse
// var olan satır aynı kimlikle değişir ve teslim hesabı bozulur. Siparişteyken siparişli kalem, her durumda teslimli kalem kilitlidir.
type KilitliKalem = { id: string; ad: string; miktar: string | null; birim: string };
export function siparisliKalemReddi(eski: { durum: TalepDurumu; kalemler: readonly KilitliKalem[]; karar: { siparisler: readonly { satirlar: readonly { kalemId: string; teslimAlinan: string | null }[] }[] } | null },
  yeniKalemler: readonly KilitliKalem[]): string | null {
  const siparisteMi = eski.durum === 'siparis_verildi' || eski.durum === 'teslim_alindi';
  const kilitli = new Set((eski.karar?.siparisler ?? []).flatMap((x) => x.satirlar)
    .filter((r) => siparisteMi || (r.teslimAlinan !== null && ondalikKiyas(r.teslimAlinan, '0') > 0)).map((r) => r.kalemId));
  const yeni = new Map(yeniKalemler.map((k) => [k.id, k]));
  const degisen = eski.kalemler.filter((k) => kilitli.has(k.id)).filter((k) => {
    const y = yeni.get(k.id);
    if (y === undefined || y.birim !== k.birim || (y.miktar === null) !== (k.miktar === null)) return true;
    return y.miktar !== null && k.miktar !== null && ondalikKiyas(y.miktar, k.miktar) !== 0;
  });
  return degisen.length === 0 ? null : ILETILER.siparisliKalem(degisen.map((k) => k.ad));
}
// Borç 36 (kullanıcı kararı: kayıtlı ve onaylı değişiklik): siparişteki kalem, onay yetkilisince gerekçeyle değişir. Miktar teslim
// alınandan aşağı inmez; teslimi olan kalemin birimi değişmez (teslim eski birimle sayıldı).
export function siparisKalemiDegisikligiReddi(eski: Pick<Talep, 'durum' | 'kalemler' | 'karar'>, g: { kalemId: string; miktar: string; birim: string }): string | null {
  if (eski.durum !== 'siparis_verildi' && eski.durum !== 'teslim_alindi') return ILETILER.siparisDegisikligiDurumu;
  const kalem = eski.kalemler.find((k) => k.id === g.kalemId);
  const siparisler = (eski.karar?.siparisler ?? []).filter((x) => x.satirlar.some((r) => r.kalemId === g.kalemId));
  const satirlar = siparisler.flatMap((x) => x.satirlar).filter((r) => r.kalemId === g.kalemId);
  if (kalem === undefined || satirlar.length === 0) return ILETILER.siparisteKalemYok;
  const kilitli = siparisler.filter((x) => logodaMi(x) && kilitliMi(x));
  if (kilitli.length > 0) return ILETILER.logoyaGitmisSiparis(kilitli.map((x) => x.no ?? x.teklifId));
  if (kalem.birim === g.birim && kalem.miktar !== null && ondalikKiyas(kalem.miktar, g.miktar) === 0) return ILETILER.siparisDegisikligiYok;
  const teslim = satirlar.map((r) => r.teslimAlinan ?? '0').reduce((a, b) => (ondalikKiyas(a, b) >= 0 ? a : b));
  if (ondalikKiyas(teslim, '0') > 0 && kalem.birim !== g.birim) return ILETILER.teslimliBirimDegismez;
  return ondalikKiyas(g.miktar, teslim) < 0 ? ILETILER.teslimdenAz(teslim) : null;
}
// #205 karar 1, S2 b: Logo'ya gitmiş siparişin değişikliği Logo'ya düzenleme olarak gider. Tedarikçi ve para birimi değişmez, sipariş
// karardan çıkmaz; irsaliye görmüş (teslimi olan) siparişin satırı, miktarı, birim fiyatı, iskontosu ve termini de değişmez.
type LogoKiyas = Pick<TalepYazimi, 'kalemler' | 'teklifler' | 'karar'>;
const sadeOndalik = (x: string | null | undefined): string | null => (x === null || x === undefined ? null : x.includes('.') ? x.replace(/0+$/, '').replace(/\.$/, '') : x);
// Logo'daki siparişin içeriği: iskonto, termin ve satırlar (kalem, miktar, birim, birim fiyat). Kapsam sipariş satırlarının kuralıyla aynı.
function logoIcerigi(t: LogoKiyas, teklifId: string): string {
  const q = t.teklifler.find((x) => x.id === teklifId);
  const k = t.karar;
  const kapsam = k === null ? [] : k.mod === 'tek' ? (q?.fiyatlar ?? []).map((f) => f.kalemId) : k.bolunme.filter((b) => b.teklifId === teklifId).map((b) => b.kalemId);
  const satirlar = t.kalemler.filter((x) => kapsam.includes(x.id) && x.miktar !== null)
    .map((x) => [x.id, sadeOndalik(x.miktar), x.birim, sadeOndalik(q?.fiyatlar.find((f) => f.kalemId === x.id)?.birimFiyat)])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const termin = k?.siparisler.find((x) => x.teklifId === teklifId)?.beklenenTeslim ?? null;
  return JSON.stringify([sadeOndalik(q?.iskontoYuzdesi), termin, satirlar]);
}
type LogoSiparisi = {
  teklifId: string; no: string | null; logo: { kayitNo: string | null; iptalDurumu: string | null; kapatmaDurumu?: string | null } | null;
  satirlar: readonly { miktar?: string; teslimAlinan: string | null }[];
};
const logodaMi = (x: LogoSiparisi) => (x.logo?.kayitNo ?? null) !== null;
const irsaliyeliMi = (x: LogoSiparisi) => x.satirlar.some((r) => r.teslimAlinan !== null && ondalikKiyas(r.teslimAlinan, '0') > 0);
// Kalanı kapatılmış sipariş irsaliyeli gibi kilitlidir: Logo'da kapanmış satır düzenlenmez.
const kilitliMi = (x: LogoSiparisi) => irsaliyeliMi(x) || (x.logo?.kapatmaDurumu ?? null) !== null;
export function logoSiparisDegisikligiReddi(eski: LogoKiyas & { karar: { siparisler: readonly LogoSiparisi[] } | null }, yeni: LogoKiyas): string | null {
  const degisen = (eski.karar?.siparisler ?? []).filter(logodaMi).filter((x) => {
    const eq = eski.teklifler.find((q) => q.id === x.teklifId);
    const yq = yeni.teklifler.find((q) => q.id === x.teklifId);
    if (eq === undefined || yq === undefined || !(yeni.karar?.siparisler ?? []).some((y) => y.teklifId === x.teklifId)) return true;
    if (eq.firmaId !== yq.firmaId || eq.paraBirimi !== yq.paraBirimi) return true;
    return kilitliMi(x) && logoIcerigi(eski, x.teklifId) !== logoIcerigi(yeni, x.teklifId);
  });
  return degisen.length === 0 ? null : ILETILER.logoyaGitmisSiparis(degisen.map((x) => x.no ?? x.teklifId));
}
// Kayıtta içeriği değişen, Logo'da kaydı olan ve iptali kuyrukta olmayan siparişler: Logo'ya düzenleme gider.
export function logoGuncellenecekSiparisler(eski: LogoKiyas & { karar: { siparisler: readonly LogoSiparisi[] } | null }, yeni: LogoKiyas): string[] {
  const siparisler: readonly LogoSiparisi[] = eski.karar?.siparisler ?? [];
  return siparisler.filter((x) => logodaMi(x) && (x.logo?.iptalDurumu ?? null) === null)
    .filter((x) => logoIcerigi(eski, x.teklifId) !== logoIcerigi(yeni, x.teklifId)).map((x) => x.teklifId);
}
// "Kalanı kapat" (#205 S2 b): siparişi verilmiş talebin Logo'daki, iptal ya da kapatılmamış, teslim alınmamış kalanı olan siparişi.
export function siparisKapatmaReddi(eski: Pick<Talep, 'durum'> & { karar: { siparisler: readonly LogoSiparisi[] } | null }, teklifId: string): string | null {
  if (eski.durum !== 'siparis_verildi' && eski.durum !== 'teslim_alindi') return ILETILER.kapatmaDurumu;
  const x = (eski.karar?.siparisler ?? []).find((y) => y.teklifId === teklifId);
  if (x === undefined) return ILETILER.kapatmaSiparisYok;
  if (!logodaMi(x)) return ILETILER.kapatmaLogoda;
  if ((x.logo?.iptalDurumu ?? null) !== null || (x.logo?.kapatmaDurumu ?? null) !== null) return ILETILER.kapatmaVar;
  const kalanVar = x.satirlar.some((r) => r.miktar === undefined || ondalikKiyas(r.teslimAlinan ?? '0', r.miktar) < 0);
  return kalanVar ? null : ILETILER.kapatmaKalanYok;
}
// Logo'da kaydı olan sipariş iptal edilince Logo'ya iptal gider; talep iptalden geri dönerse Logo'daki iptalle ayrışır.
export function logoIptalGeriAlmaReddi(eski: Pick<Talep, 'durum' | 'karar'>, yeniDurum: TalepDurumu): string | null {
  if (eski.durum !== 'iptal' || yeniDurum === 'iptal') return null;
  return (eski.karar?.siparisler ?? []).some((x) => (x.logo?.kayitNo ?? null) !== null) ? ILETILER.logoIptalliSiparis : null;
}
export function siparisDegisikligiMetni(kalem: { ad: string; miktar: string | null; birim: string }, g: { miktar: string; birim: string; gerekce: string }): string {
  return `Sipariş değişikliği: ${kalem.ad} ${kalem.miktar ?? '-'} ${kalem.birim} yerine ${g.miktar} ${g.birim}. Gerekçe: ${g.gerekce}`;
}
// Kart #1310: "biz alacağız" denen, siparişi verilmiş (henüz tamamı teslim alınmamış) talepte her kayıtlı tedarikçili sipariş bir alımdır;
// istenen gün siparişin beklenen teslimi, yoksa talebin ihtiyaç günüdür. Aynı firmaya iki sipariş tek alımdır (en erken gün).
export function talebinAlimlari(t: Pick<Talep, 'durum' | 'teslimYontemi' | 'teklifler' | 'karar' | 'ihtiyacTarihi'>): { firmaId: number; istenenTarih: string | null }[] {
  if (t.teslimYontemi !== 'biz_alacagiz' || t.durum !== 'siparis_verildi') return [];
  const alimlar = new Map<number, string | null>();
  for (const sip of t.karar?.siparisler ?? []) {
    const firmaId = t.teklifler.find((x) => x.id === sip.teklifId)?.firmaId ?? null;
    if (firmaId === null) continue;
    const gun = sip.beklenenTeslim ?? t.ihtiyacTarihi;
    const onceki = alimlar.get(firmaId);
    alimlar.set(firmaId, onceki === undefined || onceki === null ? gun : gun === null || onceki < gun ? onceki : gun);
  }
  return [...alimlar].map(([firmaId, istenenTarih]) => ({ firmaId, istenenTarih }));
}
// D6 b: faturanın bağlanacağı siparişin tedarikçisi (finans firması). Sipariş verilmiş talepte, var olan siparişte ve kayıtlı
// tedarikçide çalışır; ret iletisi ya da firma kimliği döner.
export function siparisFaturaFirmasi(t: Pick<Talep, 'durum' | 'teklifler' | 'karar'>, teklifId: string): { firmaId: number } | { red: string } {
  if (t.durum !== 'siparis_verildi' && t.durum !== 'teslim_alindi') return { red: ILETILER.faturaSiparisDurumu };
  if (!(t.karar?.siparisler ?? []).some((x) => x.teklifId === teklifId)) return { red: ILETILER.faturaSiparisYok };
  const firmaId = t.teklifler.find((x) => x.id === teklifId)?.firmaId ?? null;
  return firmaId === null ? { red: ILETILER.faturaKayitsizTedarikci } : { firmaId };
}
// SAT-73 (kart #1124): ödeme planı siparişi verilmiş talebin, finansta kayıtlı tedarikçili siparişine yazılır; firma ve para birimi
// siparişin teklifinden gelir, gövdede gelmez.
export function odemePlaniHedefi(t: Pick<Talep, 'durum' | 'teklifler' | 'karar'>, teklifId: string): { firmaId: number; paraBirimi: string } | { red: string } {
  if (t.durum !== 'siparis_verildi' && t.durum !== 'teslim_alindi') return { red: ILETILER.planSiparisDurumu };
  if (!(t.karar?.siparisler ?? []).some((x) => x.teklifId === teklifId)) return { red: ILETILER.planSiparisYok };
  const q = t.teklifler.find((x) => x.id === teklifId);
  return q?.firmaId == null ? { red: ILETILER.planKayitsizTedarikci } : { firmaId: q.firmaId, paraBirimi: q.paraBirimi };
}
// SAT-74 (kart #1124): siparişe çevrilirken plan tekliften kurulur: avans sipariş tarihinde, kalan beklenen teslimden (yoksa sipariş
// tarihinden) vade günü sonra; ödeme şekli banka havalesi. Tutarlar KDV hariç sipariş toplamıdır (fatura gerçeğini getirir).
export interface OdemeKosulu { toplam: string; avans: string; kalan: string; vadeGun: number; siparisTarihi: string | null; beklenenTeslim: string | null }
export function varsayilanOdemePlani(k: OdemeKosulu, bugun: string): { tur: 'avans' | 'vade'; vade: string; yontem: 'banka'; tutar: string }[] {
  const baslangic = k.siparisTarihi ?? bugun;
  const gunEkle = (tarih: string, gun: number) => new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_MS).toISOString().slice(0, 10);
  const plan: { tur: 'avans' | 'vade'; vade: string; yontem: 'banka'; tutar: string }[] = [];
  if (ondalikKiyas(k.avans, '0') > 0) plan.push({ tur: 'avans', vade: baslangic, yontem: 'banka', tutar: k.avans });
  if (ondalikKiyas(k.kalan, '0') > 0) plan.push({ tur: 'vade', vade: gunEkle(k.beklenenTeslim ?? baslangic, k.vadeGun), yontem: 'banka', tutar: k.kalan });
  return plan;
}
// Dış operasyon gecikmesi (kart #542; D3 b: dönüş ilk dönüştür). Termin yoksa bilinmez (null). Dönüş geldiyse termini
// aştığı gün, gelmediyse bugünün termini aştığı gün; zamanında olan 0. Günler İstanbul takvimiyle sayılır.
const GUN_MS = 86_400_000;
const istanbulGunu = (zaman: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(zaman));
export function gecikmeGunu(termin: string | null, ilkDonus: string | null, bugun: string): number | null {
  if (termin === null) return null;
  const son = ilkDonus === null ? bugun : istanbulGunu(ilkDonus);
  return Math.max(0, Math.round((Date.parse(son) - Date.parse(termin)) / GUN_MS));
}
// ---- Fason süresi tahmini ve termin uyumu (saf). Süre ilk gidişten son dönüşe takvim günüdür (ondalık).
export interface FasonSureOrnegi { malzemeNo: number | null; operasyonTipiId: number; firmaId: number; adet: number; sureGun: number }
export interface FasonSureSorgusu { malzemeNo: number; operasyonTipiId: number; firmaId: number; adet: number }
export interface FasonGecmisiSatiri { malzemeNo: number | null; operasyonTipiId: number; firmaId: number; adet: number; ilkGidis: string; sonDonus: string; terminGun: number | null }

// Süresi sıfır ya da eksi, adedi sıfır olan kayıt örnek değildir: yok sayılır, tahmine sıfır girmez.
export function fasonSureOrnekleri(gecmis: readonly FasonGecmisiSatiri[]): FasonSureOrnegi[] {
  return gecmis.flatMap((g) => {
    const sureGun = (Date.parse(g.sonDonus) - Date.parse(g.ilkGidis)) / GUN_MS;
    return Number.isFinite(sureGun) && sureGun > 0 && g.adet > 0 ? [{ malzemeNo: g.malzemeNo, operasyonTipiId: g.operasyonTipiId, firmaId: g.firmaId, adet: g.adet, sureGun }] : [];
  });
}

const ortalama = (l: readonly number[]): number => l.reduce((t, x) => t + x, 0) / l.length;

// Aynı malzeme, operasyon tipi ve firmanın geçmişinden: aynı adet varsa onların ortalaması; yoksa alt ve üst en yakın adetlerin
// ortalama süreleri arasında adede göre doğrusal ara değer; yalnız bir yan varsa en yakın adetin ortalama süresi (süre adetle orantılı büyümez, ölçeklenmez).
// Örnek yoksa ya da adet geçersizse null (sıfır uydurulmaz).
export function fasonSuresiTahmini(ornekler: readonly FasonSureOrnegi[], sorgu: FasonSureSorgusu): number | null {
  if (!(sorgu.adet > 0)) return null;
  const uygun = ornekler.filter((o) => o.malzemeNo === sorgu.malzemeNo && o.operasyonTipiId === sorgu.operasyonTipiId && o.firmaId === sorgu.firmaId);
  if (uygun.length === 0) return null;
  const adetteki = (adet: number): number => ortalama(uygun.filter((o) => o.adet === adet).map((o) => o.sureGun));
  if (uygun.some((o) => o.adet === sorgu.adet)) return adetteki(sorgu.adet);
  const altlar = uygun.filter((o) => o.adet < sorgu.adet).map((o) => o.adet);
  const ustler = uygun.filter((o) => o.adet > sorgu.adet).map((o) => o.adet);
  const alt = altlar.length === 0 ? null : Math.max(...altlar);
  const ust = ustler.length === 0 ? null : Math.min(...ustler);
  if (alt !== null && ust !== null) {
    const [s1, s2] = [adetteki(alt), adetteki(ust)];
    return s1 + ((s2 - s1) * (sorgu.adet - alt)) / (ust - alt);
  }
  return adetteki((alt ?? ust)!);
}

// Termin = ilk gidiş + termin günü; fark gerçek teslimden (son dönüş) terminin çıkarılmasıdır: artı geç, eksi erken (takvim günü, ondalık).
export function fasonTerminFarki(ilkGidis: string, terminGun: number, sonDonus: string): number {
  return (Date.parse(sonDonus) - (Date.parse(ilkGidis) + terminGun * GUN_MS)) / GUN_MS;
}

export interface FasonKirilimi { malzemeNo: number | null; operasyonTipiId: number; firmaId: number; adet: number; ornekSayisi: number; ortalamaSureGun: number }
// Gerçekleşen süreler malzeme, operasyon, firma ve adet kırılımında ortalanır; en uzun süre başta, eşitlikte anahtar sırası.
export function fasonKirilimlari(ornekler: readonly FasonSureOrnegi[]): FasonKirilimi[] {
  const gruplar = new Map<string, FasonSureOrnegi[]>();
  for (const o of ornekler) {
    const anahtar = `${o.malzemeNo ?? ''}|${o.operasyonTipiId}|${o.firmaId}|${o.adet}`;
    gruplar.set(anahtar, [...(gruplar.get(anahtar) ?? []), o]);
  }
  return [...gruplar.entries()]
    .map(([anahtar, l]) => ({ anahtar, k: { malzemeNo: l[0]!.malzemeNo, operasyonTipiId: l[0]!.operasyonTipiId, firmaId: l[0]!.firmaId, adet: l[0]!.adet, ornekSayisi: l.length, ortalamaSureGun: ortalama(l.map((o) => o.sureGun)) } }))
    .sort((a, b) => b.k.ortalamaSureGun - a.k.ortalamaSureGun || (a.anahtar < b.anahtar ? -1 : 1))
    .map((x) => x.k);
}

export interface FasonTerminUyumu { firmaId: number; ornekSayisi: number; gecKalanSayisi: number; ortalamaFarkGun: number }
// Termin günü olmayan kayıt dışarıda kalır; firma başına ortalama fark. Yalnız gösterilir, tahmine girmez.
export function fasonTerminUyumu(gecmis: readonly FasonGecmisiSatiri[]): FasonTerminUyumu[] {
  const firmalar = new Map<number, number[]>();
  for (const g of gecmis) {
    if (g.terminGun === null) continue;
    const fark = fasonTerminFarki(g.ilkGidis, g.terminGun, g.sonDonus);
    if (Number.isFinite(fark)) firmalar.set(g.firmaId, [...(firmalar.get(g.firmaId) ?? []), fark]);
  }
  return [...firmalar.entries()]
    .map(([firmaId, l]) => ({ firmaId, ornekSayisi: l.length, gecKalanSayisi: l.filter((f) => f > 0).length, ortalamaFarkGun: ortalama(l) }))
    .sort((a, b) => b.ortalamaFarkGun - a.ortalamaFarkGun || a.firmaId - b.firmaId);
}

// 898 a: kalemin bağları (uygulanan parça ve fason adım) ayrı okunur; tam talep görünümüne girmez. Bağı olmayan kalemde ikisi de null.
export interface KalemBagi { uygulanan: string | null; fasonAdim: string | null }
export function talebim(t: Talep, baglar: ReadonlyMap<string, KalemBagi> = new Map()): Talebim {
  const bag = (id: string): KalemBagi => baglar.get(id) ?? { uygulanan: null, fasonAdim: null };
  return {
    id: t.id, no: t.no, baslik: t.baslik, durum: t.durum, ihtiyacTarihi: t.ihtiyacTarihi, olusturma: t.olusturma,
    uretimEmriNo: t.uretimEmriNo,
    kaynak: t.kalemler.some((k) => bag(k.id).fasonAdim !== null) ? 'fason' : 'elle',
    kalemler: t.kalemler.map((k) => ({ ad: k.ad, miktar: k.miktar, birim: k.birim, kartBekliyor: k.katalogId === null, ...bag(k.id) })),
  };
}

// 898 a: fason ön talep. Bitmemiş fason iş emirlerinden siparişe ya da açık talebe bağlanmamış, yoksayılmamış ve henüz firmaya gönderilmemiş
// olanlar (gönderilmişse iş başlamıştır, ön talep geç kalmıştır). En erken gereken üstte; tarihsiz sonda.
export function fasonOnTalepAdaylari(
  adaylar: readonly FasonIsEmri[], bagli: ReadonlySet<number>, yoksayilan: ReadonlySet<number>,
): FasonIsEmri[] {
  return adaylar
    .filter((x) => !bagli.has(x.isEmriId) && !yoksayilan.has(x.isEmriId) && (x.gonderilen ?? 0) === 0)
    .sort((a, b) => (a.teslim ?? '9999').localeCompare(b.teslim ?? '9999') || a.emirNo.localeCompare(b.emirNo) || a.opNo - b.opNo);
}
// Uygulanan parça ve fason adım yalnız hizmet talebindedir; bir fason adım bir talepte bir kez geçer ve talebin emri seçiliyse o emrindir.
export function hizliBagReddi(
  tur: TalepTuru, kalemler: readonly HizliKalem[], emirId: number | null, fasonEmri: (isEmriId: number) => number | undefined,
): string | null {
  const bagli = kalemler.filter((k) => k.uygulananMalzemeNo !== null || k.isEmriId !== null);
  if (bagli.length > 0 && tur !== 'hizmet') return ILETILER.bagYalnizHizmette;
  const isler = kalemler.flatMap((k) => (k.isEmriId === null ? [] : [k.isEmriId]));
  if (new Set(isler).size !== isler.length) return ILETILER.fasonTekrar;
  for (const i of isler) {
    const emir = fasonEmri(i);
    if (emir === undefined) return ILETILER.fasonOnTalepYok;
    if (emirId !== null && emir !== emirId) return ILETILER.fasonEmirFarkli;
  }
  return null;
}
export function uygulananKartReddi(kart: { tur: string } | undefined): string | null {
  if (kart === undefined) return ILETILER.uygulananKartYok;
  return (TALEPTE_SECILEN_TURLER as readonly string[]).includes(kart.tur) ? null : ILETILER.uygulananHizmet;
}

// 257 a: kartlı kalem kartın birimiyle girilir, birim dönüşümü yoktur. Birimsiz kart ve kartsız kalem serbesttir; kartı ve birimi
// değişmeyen eski kalem denetlenmez (kural öncesi kayıt dokunulmadan kaydedilir).
type BirimliKalem = { id: string; katalogId: string | null; birim: string };
export function kartBirimiReddi(kalemler: readonly (BirimliKalem & { ad: string })[], eskiler: readonly BirimliKalem[], kartBirimi: ReadonlyMap<string, string>): string | null {
  const yalin = (x: string) => x.trim().toLocaleLowerCase('tr-TR');
  const eski = new Map(eskiler.map((x) => [x.id, x]));
  for (const k of kalemler) {
    const birim = (k.katalogId === null ? '' : kartBirimi.get(k.katalogId) ?? '').trim();
    const o = eski.get(k.id);
    if (birim === '' || (o !== undefined && o.katalogId === k.katalogId && o.birim === k.birim)) continue;
    if (yalin(k.birim) !== yalin(birim)) return ILETILER.kartBirimi(k.ad, birim);
  }
  return null;
}

export function kartKopyasi(kart: BaglanacakKart): { ad: string; kategori: string; birim: string } {
  return { ad: (kart.ad ?? kart.kod).trim().slice(0, 160).trim(), kategori: (kart.kategoriAdi ?? '').slice(0, 60), birim: (kart.birim ?? '').trim().slice(0, 20) };
}

// Talebe yeni bağlanan üretim emri açık olmalı (planlı ya da başlamış); olmayan emrin durumu yoktur (undefined) ve kapalı sayılır.
export const emirAcikMi = (durum: string | undefined): boolean => (ACIK_EMIR_DURUMLARI as readonly string[]).includes(durum ?? '');

// İki ondalık metnin çarpımı, 6 basamağa yarım yukarı yuvarlanır (kayan nokta yok).
export function ondalikCarp(a: string, b: string): string {
  const c = tamSayiya(a) * tamSayiya(b);
  const bolen = 10n ** BigInt(OLCEK);
  const yarim = (c < 0n ? -bolen : bolen) / 2n;
  return ondalikMetni((c + yarim) / bolen);
}

// SAT-77: kalite + forma uygulanan kg fiyatı: forma özel giriş varsa o, yoksa kalitenin formsuz (bütün formlar) girişi; ikisi de yoksa boş.
export function uygulananKgFiyati<T extends { kaliteKodu: string; form: string | null }>(fiyatlar: readonly T[], kaliteKodu: string, form: string | null): T | null {
  return (form === null ? undefined : fiyatlar.find((f) => f.kaliteKodu === kaliteKodu && f.form === form))
    ?? fiyatlar.find((f) => f.kaliteKodu === kaliteKodu && f.form === null) ?? null;
}

// Stok tutarı (SAT-77): stoklu kalemlerin miktar x TL birim fiyat toplamı, kuruşa yarım yukarı. Fiyatsız stoklu kalem tutara girmez,
// sayılır; hiç fiyatlı kalem yoksa tutar boştur (sıfır uydurulmaz).
export function stokTutari(kalemler: readonly { miktar: string; tryBirimFiyati: string | null }[]): { tutar: string | null; fiyatsizKalem: number } {
  let toplam = 0n, fiyatli = 0, fiyatsizKalem = 0;
  for (const k of kalemler) {
    const m = tamSayiya(k.miktar);
    if (m <= 0n) continue;
    if (k.tryBirimFiyati === null) { fiyatsizKalem += 1; continue; }
    fiyatli += 1;
    toplam += m * tamSayiya(k.tryBirimFiyati);
  }
  if (fiyatli === 0) return { tutar: null, fiyatsizKalem };
  const bolen = 10n ** BigInt(2 * OLCEK - 2);
  const kurus = (toplam + bolen / 2n) / bolen;
  return { tutar: `${kurus / 100n}.${(kurus % 100n).toString().padStart(2, '0')}`, fiyatsizKalem };
}

// Stok birimi başına fiyat: birim kg ise kg fiyatı; değilse kartın birim ağırlığıyla; ağırlık bilinmiyorsa boş (uydurulmaz).
export function birimFiyati(kgFiyati: string | null, stokBirimi: string | null, birimKg: number | null): string | null {
  if (kgFiyati === null) return null;
  if (stokBirimi !== null && stokBirimi.trim().toLocaleLowerCase('tr-TR') === 'kg') return kgFiyati;
  return birimKg === null || !(birimKg > 0) ? null : ondalikCarp(kgFiyati, birimKg.toFixed(OLCEK));
}
