// Satın alma kuralları: saf fonksiyonlar ve sabitler; veritabanı ve saat yok.
import { KUR_KILIDI, ONCELIKLER, PARA_BIRIMLERI } from '#paylasilan/sozlesme/satin-alma.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { KmTedarikciDurumu } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { FasonIsEmri } from '../uretim-emirleri/disari.ts';
import type { AlimTasimasi } from './alim-olayi.ts';
import type { HizliKalem, KartAyrintisi, Kalite, Karar, Onay, Talebim, Talep, TalepDurumu, TalepTuru, TalepYazimi, TedarikTermini, TerminDurumu, TerminTakipSatiri, TeslimDurumu } from '#paylasilan/sozlesme/satin-alma.ts';
import { MALZEMELER_SAYFALARI } from '#paylasilan/sayfalar/malzemeler.ts';
import { gerceklesenPay, gerceklesenSiparisDegeri } from './hesap-kurallar.ts';

export const ISLEM = {
  oku: 'satin-alma.oku', talepAc: 'satin-alma.talep-ac', yaz: 'satin-alma.yaz', onayla: 'satin-alma.onayla', ayar: 'satin-alma.ayar',
  // Fatura-sipariş bağını satın almayı yazmadan kurar (modul-test K8 a, 2077-3 a): muhasebe başka satın alma kaydı yazmaz.
  faturaBagla: 'satin-alma.fatura-bagla',
} as const;
export type SatinAlmaIslemi = (typeof ISLEM)[keyof typeof ISLEM];

// Limit tablosu hiç kaydedilmemişse geçerli olan varsayılan; ekranın `merkez/constants.ts` varsayılanıyla aynıdır (testle sabit).
export const VARSAYILAN_ONAY_LIMITLERI: readonly { azamiTutar: string | null; seviye: string }[] = [
  { azamiTutar: '50000', seviye: 'Satın alma uzmanı' },
  { azamiTutar: '250000', seviye: 'Satın alma müdürü' },
  { azamiTutar: '1000000', seviye: 'Genel müdür yardımcısı' },
  { azamiTutar: null, seviye: 'Genel müdür' },
];

// 2397 b: ayar açıkken kararı onaylayan, tutarın düştüğü basamağın ya da bir üst basamağın rolünü taşımalı. Basamağın rolü boşsa
// onaylama yetkisi yeter (varsayılan basamakların rolü yoktur); yönetici rolü her basamağı onaylar. Tutar bilinmiyorsa (kur eksik) en üst basamak gerekir (temkinli).
// Ret serbesttir (dört gözle aynı gerekçe: talebi durdurur, harcama açmaz).
export function onayKademesiReddi(
  acik: boolean, sonuc: 'onay' | 'ret', tutar: number | null, limitler: readonly { azamiTutar: string | null; seviye: string; rolId: number | null }[],
  roller: readonly { id: number; yonetici: boolean }[],
): string | null {
  if (!acik || sonuc !== 'onay' || limitler.length === 0) return null;
  const sirali = [...limitler].sort((a, b) => azamiSirasi(a) - azamiSirasi(b));
  const j = tutar === null ? -1 : sirali.findIndex((l) => l.azamiTutar === null || tutar <= Number(l.azamiTutar));
  const i = j === -1 ? sirali.length - 1 : j;
  const basamak = sirali[i]!;
  if (basamak.rolId === null || roller.some((r) => r.yonetici)) return null;
  const yetkili = new Set(sirali.slice(i).flatMap((l) => (l.rolId === null ? [] : [l.rolId])));
  return roller.some((r) => yetkili.has(r.id)) ? null : `${ILETILER.onayKademesi} Gereken basamak: ${basamak.seviye}.`;
}

type OnayLimiti = { azamiTutar: string | null; seviye: string; rolId: number | null };
const azamiSirasi = (l: { azamiTutar: string | null }) => (l.azamiTutar === null ? Infinity : Number(l.azamiTutar));

// 2397 b: rolü göndermeyen basamak rolünü aynı adlı eski basamaktan, yoksa aynı sıradaki eski basamaktan alır. Ekran rolü
// göndermeden kaydeder; basamak adı değişince rol düşüp basamak denetimsiz kalmasın.
export function onayLimitRolleri(
  eski: readonly { seviye: string; rolId: number | null }[], yeni: readonly { azamiTutar: string | null; seviye: string; rolId?: number | null | undefined }[],
): OnayLimiti[] {
  return yeni.map((l, i) => ({
    azamiTutar: l.azamiTutar, seviye: l.seviye,
    rolId: l.rolId !== undefined ? l.rolId : (eski.find((e) => e.seviye === l.seviye) ?? eski[i])?.rolId ?? null,
  }));
}

// Basamak, eşik ya da rol değişti mi (sırayla; tutar sayı olarak karşılaştırılır).
export function onayLimitleriDegistiMi(eski: readonly OnayLimiti[], yeni: readonly OnayLimiti[]): boolean {
  return eski.length !== yeni.length || eski.some((e, i) => {
    const y = yeni[i]!;
    return e.seviye !== y.seviye || e.rolId !== y.rolId || (e.azamiTutar === null ? y.azamiTutar !== null : y.azamiTutar === null || Number(e.azamiTutar) !== Number(y.azamiTutar));
  });
}

// Rolsüz basamak rollü basamağın üstünde olamaz: yoksa büyük tutar küçük tutardan gevşek denetlenir.
export function onayLimitiReddi(limitler: readonly OnayLimiti[]): string | null {
  const sirali = [...limitler].sort((a, b) => azamiSirasi(a) - azamiSirasi(b));
  const ilkRollu = sirali.findIndex((l) => l.rolId !== null);
  return ilkRollu !== -1 && sirali.slice(ilkRollu).some((l) => l.rolId === null) ? ILETILER.rolsuzUstBasamak : null;
}

export const ILETILER = {
  talepYok: 'Talep bulunamadı.',
  kgBilinmeyen: (sira: readonly number[]) => `Kalite ve form kartlarda yok (satır ${sira.slice(0, 20).join(', ')}${sira.length > 20 ? ', ...' : ''}); hiçbir fiyat kaydedilmedi.`,
  kgFiyatiYok: 'Kg fiyatı girişi bulunamadı.',
  kgIptalSatiri: 'İptal kaydı iptal edilemez.',
  kgZatenIptal: 'Bu kg fiyatı girişi zaten iptal edildi.',
  yalnizTaslakSilinir: 'Yalnız taslak talep silinir; ilerlemiş talep iptal edilir.',
  emirKapali: 'Üretim emri açık değil: yalnız planlı ya da başlamış emir seçilir.',
  projeEmirli: 'Emre bağlı talebin projesi emirden gelir; proje ayrıca seçilmez.',
  eslemeTekrar: 'Aynı sipariş satırı listede iki kez var.',
  eslemeBaskaSiparis: 'Satır bu faturanın siparişine ait değil.',
  eslemeTutar: 'Tutar sıfırdan büyük olmalı ve en çok iki ondalık taşımalı.',
  eslemeAsim: 'Eşlenen toplam fatura tutarını (KDV hariç) aşıyor.',
  eslemeSiparissiz: 'Bu fatura bir siparişe bağlı değil ya da bulunamadı.',
  eslemeIptal: 'İptal edilmiş fatura eşlenemez.',
  eslemeSurum: 'Bu fatura başka biri tarafından değiştirildi, yeniden yükleyin.',
  eslemeliSatir: 'Bu satır bir faturayla eşlendi (kaldırılmış eşleme dahil); siparişten çıkarılamaz.',
  projeAktifDegil: 'Proje aktif değil: yalnız aktif proje seçilir.',
  birlesmeProjesi: 'Talepler farklı projelere bağlı; aynı projenin talepleri birleştirilir.',
  idariCevrildi: (no: string) => `Bu idari talep daha önce ${no} satın alma talebine çevrildi.`,
  tedarikciYok: 'Tedarikçi bulunamadı.',
  terminMalzemesiYok: 'Malzeme kartı bulunamadı.',
  terminVar: 'Bu malzemenin termini başka biri tarafından girildi; sayfayı yenileyin.',
  katalogYok: 'Katalog kalemi bulunamadı.',
  yetkiYok: 'Bu değişiklik için yetkiniz yok.',
  gecisYok: 'Talep bu durumdan istenen duruma geçemez.',
  talebimSahibiDegil: 'Yalnız kendi açtığınız ya da adınıza açılan talebi düzenleyebilirsiniz.',
  talebimDuzenlenmez: 'Talep teklif istendikten sonra düzenlenemez; teklif toplanırken güncelleme talebi açın, sonrasında değişikliği satın almaya iletin.',
  guncellemeAsamasi: 'Güncelleme talebi yalnız teklif toplanırken (teklif isteniyor ya da değerlendirmede) açılır; taslağı düzenleyin, sonrası için satın almaya iletin.',
  guncellemeBirlesik: 'Birleştirilmiş talep için güncelleme talebi açılmaz; değişikliği satın almaya iletin.',
  guncellemeBagli: 'Fason adıma ya da parçaya bağlı kalemi olan talep için güncelleme talebi açılmaz; değişikliği satın almaya iletin.',
  guncellemesiOlanSilinmez: 'Bu talebe bağlı güncelleme talebi var; silinemez, gerekirse iptal edin.',
  grupSipariste: (nolar: readonly string[]): string => `Uyarı: güncelleme grubunda ${nolar.join(', ')} siparişte; aynı ihtiyaç için ikinci alım olabilir.`,
  guncellemeIptali: (no: string): string => `Güncellemeyle karşılandı: ${no} siparişe geçti.`,
  talebimKalemYok: 'Düzenlenen kalem bu talepte yok.',
  talebimBagliKalem: 'Fason adıma ya da parçaya bağlı kalem buradan değişmez; değişikliği satın almaya iletin.',
  iptalDegil: 'Yalnız iptal edilmiş talebin iptali geri alınır.',
  birlesmis: (no: string): string => `Bu talep ${no} talebine birleştirildi; değişiklik birleşik talepte yapılır.`,
  birlesikSilinmez: 'Birleşik talep kaynakları ayrılmadan silinemez; önce kaynakları ayırın.',
  kaynakKalemiSilinmez: 'Birleştirilen talebin kalemi birleşik talepten silinemez; kalemi ayırarak kaynağına döndürün.',
  kalemsizGeriAlinmaz: 'Kalemsiz talebin iptali geri alınamaz.',
  birlesikDegil: 'Bu talep birleşik talep değil.',
  kaynakDegil: 'Seçilen talep bu birleşik talebin kaynağı değil.',
  ayirmaTeklifli: 'Teklifi ya da kararı olan birleşik talep ayrılamaz.',
  birlesmeKalemSiniri: 'Birleşik talep en çok 200 kalem taşır.',
  dortGoz: 'Kararı veren kişi o kararı onaylayamaz.',
  onayKademesi: 'Bu tutardaki kararı onaylama basamağınız yetmiyor.',
  rolsuzUstBasamak: 'Rolü boş basamak, rolü olan basamağın üstünde olamaz: üst basamağa da rol verin.',
  onayLimitiYonetici: 'Onay basamaklarını, eşiklerini ve rollerini yalnız yönetici değiştirir.',
  dortGozTalepEden: 'Talebi açan ya da talep eden kişi o talebi onaylayamaz.',
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
  terminsizSiparis: 'Siparişin beklenen teslim tarihini girin: teslim tarihi olmayan sipariş oluşturulmaz.',
  kurKilidiEski: (gun: number): string => `Onay ${gun} günden eski: kur ve faiz yeniden sabitlensin diye talebi değerlendirmeye alıp yeniden onaya gönderin.`,
  kurKaydi: (paraBirimi: string, yuzde: string): string => `${paraBirimi} kuru onaydan bu yana %${yuzde} değişti: talebi değerlendirmeye alıp yeniden onaya gönderin.`,
  kilittenOnceOnay: 'Karar yeniden onaya gönderildi; sipariş için yeni onay gerekir.',
  askidakiTedarikci: (adlar: readonly string[]): string => `Kalite Merkezi'nde onayı Aday ya da Askıda olan tedarikçiye sipariş verilmez: ${adlar.join(', ')}. Kalite Merkezi'nde durumunu değiştirin ya da başka teklife karar verin.`,
  onayliKararDegismez: 'Onaylanmış karar değişmez; değişmesi için önce reddedilmelidir.',
  kartsizSiparis: (adlar: readonly string[]): string => `Kart bekleyen kalemle sipariş verilmez; önce kalemi malzeme kartına bağlayın: ${adlar.join(', ')}. Malzemeler bölümünde kartı "Kataloğa ekle" ile ekleyin, sonra "Kataloğa bağla" ile kalemi seçin.`,
  siparisliKalem: (adlar: readonly string[]): string => `Siparişi verilmiş kalemin miktarı ve birimi kaydetle değişmez, kalem silinmez: ${adlar.join(', ')}. Siparişteki "Kalemi değiştir" ile gerekçe yazarak değiştirin (onay yetkisi gerekir).`,
  faturaSiparisDurumu: 'Fatura yalnız siparişi verilmiş talepte bağlanır.',
  planSiparisDurumu: 'Ödeme planı yalnız siparişi verilmiş talepte yazılır.',
  planSiparisYok: 'Bu teklifin siparişi yok.',
  planKayitsizTedarikci: 'Tedarikçi finansta kayıtlı değil; ödeme planı finansa yazılamaz.',
  planKdvGecersiz: 'Bu KDV oranı sipariş gününde geçerli değil (Finans > Ayarlar > KDV oranları).',
  faturaSiparisYok: 'Sipariş bulunamadı.',
  faturaKayitsizTedarikci: 'Kayıtlı olmayan tedarikçinin siparişine fatura bağlanmaz; tedarikçiyi finansta kaydedip teklife seçin.',
  faturaBaskaSipariste: 'Fatura başka bir siparişe bağlı; önce oradan kaldırın.',
  eslesmeFazlaTeslim: 'Teslim alınan miktar sipariş miktarını aşıyor.',
  eslesmeEksikTeslim: 'Siparişin tamamı henüz teslim alınmadı.',
  eslesmeParaBirimi: 'Faturanın para birimi siparişinkinden farklı.',
  eslesmeTutarFazla: 'Fatura tutarı (KDV hariç) sipariş toplamından fazla.',
  eslesmeTutarEksik: 'Fatura tutarı (KDV hariç) sipariş toplamından az.',
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
  bagYalnizHizmette: 'Uygulanan parça ve fason adım yalnız hizmet ve fason talebinde yazılır.',
  partiYalnizFasonda: 'Stoktaki parti yalnız fason talebinde seçilir.',
  fasonKaynakTek: 'Fason kalemi ya üretim emrinin fason adımını ya da stoktaki partiyi taşır; ikisinden biri seçilmeli.',
  fasonIslemYok: 'Stoktaki parti için yapılacak işlem (hizmet kartı) seçilmeli.',
  fasonParcaYok: 'Stoktaki parti için işlem uygulanacak parça seçilmeli.',
  fasonAdetTam: 'Stoktaki partinin fason adedi pozitif tam sayı olmalı.',
  uygulananKartYok: 'Uygulanan parça ya da malzeme kartı bulunamadı.',
  uygulananHizmet: 'Uygulanan kart bir parça ya da malzeme olmalı; hizmet kartı seçilemez.',
  fasonOnTalepYok: 'Bu fason adım için ön talep yok: emir kapandı, adım bitti ya da talebi zaten açıldı. Sayfayı yenileyin.',
  fasonEmirFarkli: 'Fason adım seçilen üretim emrinin değil.',
  fasonTekrar: 'Aynı fason adım talepte iki kez var.',
  onTalepYoksayYok: 'Yoksayma kaydı bulunamadı; sayfayı yenileyin.',
  planOnTalepYok: 'Bu malzeme için plan ön talebi yok: ihtiyaç karşılandı ya da plan değişti. Sayfayı yenileyin.',
  planIhtiyaciTekrar: 'Aynı malzeme plan ihtiyacı listesinde iki kez var.',
} as const;

// SAT-07: durum geçişleri. Aynı durumda kalmak her zaman serbest. Yalnız akışın ürettiği geçişler vardır (2413 a; SAT-68 daraltıldı):
// teklif isteği ve teklif girişi, karar ve onaya gönderme, ret ve kararı kaldırma, sipariş, iptal. İptalden dönüş yalnız gerekçeli
// "İptali geri al" komutuyladır (iptaliGeriAl); genel kayıt iptalden çıkamaz.
// "Teslim alındı" istemciyle yazılmaz: stoktaki mal kabulden türetilir (SAT-38).
// Teklif isteniyor -> onayda: ekran karar kaydedilince talebi bulunduğu açık durumdan onaya gönderir; geçiş olmasa karar kaybolurdu.
export const GECISLER: Readonly<Record<TalepDurumu, readonly TalepDurumu[]>> = {
  taslak: ['teklif_isteniyor', 'degerlendirme', 'iptal'],
  teklif_isteniyor: ['degerlendirme', 'onayda', 'iptal'],
  degerlendirme: ['onayda', 'iptal'],
  onayda: ['degerlendirme', 'siparis_verildi', 'iptal'],
  siparis_verildi: ['iptal'],
  teslim_alindi: [],
  iptal: [],
};

// 2413 a: iptalden önceki durum kayıtlı değilse (2413'ten önceki iptaller) veriden türetilir. Ret kararı silmez, talebi değerlendirmeye
// döndürür: son onay kaydı ret olan karar değerlendirmeye, onay kaydı olmayan karar onaya döner.
export function iptalOncesiTuret(t: Pick<Talep, 'karar' | 'onaylar' | 'teklifler' | 'teklifIstekleri'>): TalepDurumu {
  if (t.karar !== null && t.karar.siparisler.length > 0) return 'siparis_verildi';
  if (t.karar !== null) {
    const son = t.onaylar.at(-1)?.sonuc;
    return son === 'ret' ? 'degerlendirme' : 'onayda';
  }
  if (t.teklifler.length > 0) return 'degerlendirme';
  if (t.teklifIstekleri.length > 0) return 'teklif_isteniyor';
  return 'taslak';
}
export const iptalGeriAlmaHareketi = (iptalNedeni: string, gerekce: string, turetildi: boolean): string =>
  `İptal geri alındı${iptalNedeni === '' ? '' : ` (iptal nedeni: ${iptalNedeni})`}${turetildi ? ', önceki durum veriden türetildi' : ''}: ${gerekce}`.slice(0, 1000);
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
    notlar: t.notlar, iptalNedeni: t.iptalNedeni, kalemler: t.kalemler, uretimEmriId: t.uretimEmriId,
    projeId: t.projeId ?? null };
  return izi({ ...g, ...(durumHaric ? {} : { durum: t.durum }) });
};
// Satın almanın işi: teklif, istek, karar, senaryo, ağırlık. Siparişte yalnız satın almanın alanları (teslim bilgisi stoktan okunur).
// Küme niteliğindeki listeler (fiyat, bölünme, kur, sipariş, pay) sırasız karşılaştırılır; senaryonun kişi ve zamanı sunucunundur.
const sirali = <T>(l: readonly T[], anahtar: (x: T) => string): T[] => [...l].sort((a, b) => (anahtar(a) < anahtar(b) ? -1 : anahtar(a) > anahtar(b) ? 1 : 0));
const satinAlmaIzi = (t: TalepYazimi): string => {
  // Karar verenin adı sunucunun çıkışa kattığı salt okunur alandır; karşılaştırmaya girerse her onay kaydı satın alma işi sayılır.
  // Öbür alanlar tek tek sayılmaz: karara sonradan eklenen alan sayılmayı unutursa yetkisiz değiştirilebilir olurdu.
  // Sabit kur, faiz ve kur kilidi de sunucunundur (1096 a): istemcinin değeri yok sayılır, karşılaştırmaya girmez.
  const { kararVerenAdi: _salt, kurKilidi: _kilit, sabitKurlar: _kur, ...karar } = (t.karar ?? {}) as NonNullable<TalepYazimi['karar']> & { kararVerenAdi?: unknown };
  const k = t.karar === null ? null : {
    ...karar,
    bolunme: sirali(karar.bolunme, (b) => b.kalemId),
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

// 2433-4 a, 2433-6 a: teslim tarihi girilmemiş sipariş oluşmaz; siparişin tarihi de boşaltılamaz. Bugün tarihsiz kayıtlı eski
// sipariş (veritabanı değişmez) tarihsiz kalarak yeniden kaydedilir, iptalden geri de alınır; ekranda uyarıyla görünür.
type SiparisTermini = { teklifId: string; beklenenTeslim: string | null };
export function terminsizSiparisReddi(
  eski: { karar: { siparisler: readonly SiparisTermini[] } | null }, yeni: { karar: { siparisler: readonly SiparisTermini[] } | null },
): string | null {
  const eskiler = eski.karar?.siparisler ?? [];
  const tarihsiz = (yeni.karar?.siparisler ?? []).some((s) => s.beklenenTeslim === null
    && !eskiler.some((e) => e.teklifId === s.teklifId && e.beklenenTeslim === null));
  return tarihsiz ? ILETILER.terminsizSiparis : null;
}

// 1096 a: aşılan kilitte talep değerlendirmeye alınıp yeniden onaya gönderilir (yeni kilit, yeni onay). Sınırlar sözleşmede.
export { KUR_KILIDI };

// Onayın açtığı durumlar: bu durumlara karar onaydan geçmeden girilmez; dışındakilerde kilit yoktur.
export const kilitliDurum = (d: TalepDurumu): boolean => d === 'onayda' || d === 'siparis_verildi' || d === 'teslim_alindi';
export type KurKilidiIsi = 'kilitle' | 'sipariste-sabitle' | 'koru' | 'kaldir';
// Kilit onaya girerken kurulur; siparişten onaya dönüş ya da iptal eski kilidi korur. Kilitsiz eski karar siparişe girerken
// o anın kuru sabitlenir (göçten önceki akış), onay denetimi değişmez.
export function kurKilidiIsi(eski: TalepDurumu | null, yeni: TalepDurumu, eskiKilit: string | null): KurKilidiIsi {
  if (yeni === 'iptal') return 'koru';
  if (!kilitliDurum(yeni)) return 'kaldir';
  if (yeni === 'onayda' && (eski === null || (!kilitliDurum(eski) && eski !== 'iptal'))) return 'kilitle';
  if (yeni !== 'onayda' && eski === 'onayda' && eskiKilit === null) return 'sipariste-sabitle';
  return 'koru';
}

export function kurKilidiReddi(
  kilit: string | null, sabit: readonly { paraBirimi: string; kur: string }[], guncel: ReadonlyMap<string, string | null>, simdiMs: number,
): string | null {
  if (kilit === null) return null;
  if (simdiMs - Date.parse(kilit) > KUR_KILIDI.gun * GUN_MS) return ILETILER.kurKilidiEski(KUR_KILIDI.gun);
  for (const s of sabit) {
    const g = guncel.get(s.paraBirimi);
    if (s.paraBirimi === 'TRY' || g === null || g === undefined) continue;
    const kayma = Math.abs(Number(g) / Number(s.kur) - 1) * 100;
    if (kayma > KUR_KILIDI.kaymaYuzdesi) return ILETILER.kurKaydi(s.paraBirimi, kayma.toFixed(1).replace('.', ','));
  }
  return null;
}

// Kilitten önceki onay yeni kilidi onaylamaz: siparişe kilitten sonra verilen onay (ya da bu kayıtta eklenen) gerekir.
export function kilittenSonraOnayliMi(kilit: string | null, onaylar: readonly Pick<Onay, 'sonuc' | 'zaman'>[], yeniler: readonly Pick<Onay, 'sonuc'>[]): boolean {
  if (kilit === null) return true;
  const sinir = Date.parse(kilit);
  return kararOnayliMi([...onaylar.filter((o) => Date.parse(o.zaman) >= sinir), ...yeniler]);
}

// 1099 a: satır ayrıntısını (iskonto, termin, en az miktar) bilmeyen ekran o alanları göndermez; gönderilmeyen alan saklananı korur.
type FiyatAyrintisi = Pick<TalepYazimi['teklifler'][number]['fiyatlar'][number], 'iskontoYuzdesi' | 'terminGun' | 'enAzMiktar'>;
export function kalemAyrintisiniKoru<T extends Pick<TalepYazimi, 'teklifler'>>(eski: Pick<TalepYazimi, 'teklifler'> | null, yeni: T): T {
  const eskiler = new Map((eski?.teklifler ?? []).flatMap((q) => q.fiyatlar.map((f) => [`${q.id}/${f.kalemId}`, f] as const)));
  const al = <K extends keyof FiyatAyrintisi>(gelen: FiyatAyrintisi[K], onceki: FiyatAyrintisi | undefined, k: K): NonNullable<FiyatAyrintisi[K]> | null =>
    (gelen !== undefined ? gelen : onceki?.[k] ?? null) as NonNullable<FiyatAyrintisi[K]> | null;
  return {
    ...yeni,
    teklifler: yeni.teklifler.map((q) => ({
      ...q,
      fiyatlar: q.fiyatlar.map((f) => {
        const o = eskiler.get(`${q.id}/${f.kalemId}`);
        return { ...f, iskontoYuzdesi: al(f.iskontoYuzdesi, o, 'iskontoYuzdesi'), terminGun: al(f.terminGun, o, 'terminGun'), enAzMiktar: al(f.enAzMiktar, o, 'enAzMiktar') };
      }),
    })),
  };
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

// Gereken işlemleri kullanıcının işlemleriyle karşılaştırır. Kendi taslağını düzenleyen talep eden `talep-ac` ile yetinir (SAT-82: yalnız taslak).
export function degisiklikReddi(d: Degisiklik, islemler: readonly string[], kendiTaslagi: boolean): string | null {
  if (d.onay && !islemler.includes(ISLEM.onayla)) return ILETILER.yetkiYok;
  if (d.satinAlma && !islemler.includes(ISLEM.yaz)) return ILETILER.yetkiYok;
  if (d.govde && !islemler.includes(ISLEM.yaz) && !(kendiTaslagi && islemler.includes(ISLEM.talepAc))) return ILETILER.yetkiYok;
  return null;
}

// Talep eden taslak ya da teklif istenen talebi açar (prototip: talep eden talebi gönderir).
export const talepEdenDurumu = (d: TalepDurumu): boolean => d === 'taslak' || d === 'teklif_isteniyor';
// SAT-82 (2883; 2871-1 a): talep eden talebin kendisini yalnız teklif istenmeden önce (taslak) değiştirir, teklif istemeye de taslaktan gönderir.
// Teklif toplanırken asıl talep bozulmaz; değişiklik güncelleme talebiyle gelir (2876).
export const talepEdenGovdeDurumu = (eski: TalepDurumu, yeni: TalepDurumu): boolean => eski === 'taslak' && talepEdenDurumu(yeni);

// SAT-30: ayar açıkken kararı veren onaylayamaz; kapalıyken onay dört gözsüz işaretlenir.
// 2398 a: ayar açıkken talebi açan ya da talep eden de onaylayamaz (görevler ayrılığı). Ret serbesttir: talebi durdurur, harcama açmaz.
export function dortGozSonucu(
  kisiId: number, kararVeren: number | null, acik: boolean, talepEdenler: readonly number[], sonuc: 'onay' | 'ret',
): 'red' | 'talepEdenRed' | 'dortGozsuz' | 'normal' {
  if (!acik) return 'dortGozsuz';
  if (kararVeren !== null && kisiId === kararVeren) return 'red';
  return sonuc === 'onay' && talepEdenler.includes(kisiId) ? 'talepEdenRed' : 'normal';
}

// SAT-53: talep eden yalnız kendi talebini görür. Kararda seçilen teklif açıktır; rakip teklifler sayılsın diye kalır ama adsız ve
// fiyatsızdır (tedarikçi, fiyat, tutar, not yok). Teklif istekleri ve senaryolar görünmez.
// #375: talep eden teklif, fiyat, tedarikçi ve kararı görmez (seçilen teklif dahil). Geçmiş metinleri ve onay notları tedarikçi adı
// ve fiyat taşıyabildiği için talep eden yalnız kendi yazdığı geçmişi görür; onayın sonucu görünür, notu görünmez.
// 2429-ekran b (kullanıcı 09.11): 375'in tedarikçi kısmı kalktı. Tedarikçi bilgisi (teklif istenen firmalar, kalem bağındaki fason
// firması, kararın seçtiği tedarikçiler) talep edene açıktır; teklif, fiyat ve karar (tutar, gerekçe, sabit kur) kapalı kalır.
// 2414 a (K3, K4): birleştirilmiş kaynak talepte kalemler birleşik talepten, kaynağın kalemleriyle süzülerek gelir; seçilen tedarikçiler
// yalnız bu kalemleri kapsayan karar ve tekliflerdendir. Başka kaynağın kalemi ve talep edeni görünmez; birleşik talebin kaynak listesi düşer.
export function talepEdenGorunumu<T extends TalepYazimi>(t: T, kisiId: number, birlesen?: Talep): T {
  const kendi = birlesen === undefined ? null : new Set(birlesen.kaynaklar?.find((x) => x.talepId === t.id)?.kalemIdleri ?? []);
  const kalemler = kendi === null ? t.kalemler : birlesen!.kalemler.filter((k) => kendi.has(k.id));
  const teklifler = kendi === null ? t.teklifler : birlesen!.teklifler.filter((q) => q.fiyatlar.some((f) => kendi.has(f.kalemId)));
  const karar = kendi === null ? t.karar : birlesen!.karar;
  const secilenIdler = karar === null ? [] : karar.mod === 'tek' ? [karar.teklifId]
    : karar.bolunme.filter((b) => kendi === null || kendi.has(b.kalemId)).map((b) => b.teklifId);
  const secilenTedarikciler = [...new Set(secilenIdler)].flatMap((id) => {
    const q = teklifler.find((x) => x.id === id);
    return q === undefined ? [] : [{ firmaId: q.firmaId, ad: q.tedarikciAdi }];
  });
  const { kaynaklar: _k, ...geri } = t as T & { kaynaklar?: unknown };
  const baglar = (x: unknown) => ((x as { kalemBaglari?: { kalemId: string }[] }).kalemBaglari ?? []);
  return {
    ...(geri as T),
    ...(kendi === null ? {} : {
      kalemler, teklifIstekleri: birlesen!.teklifIstekleri, kalemBaglari: baglar(birlesen).filter((b) => kendi.has(b.kalemId)),
    }),
    secilenTedarikciler,
    teklifler: [], senaryolar: [], karar: null,
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
  fason: { turler: ['hizmet'] as const, hizmetYonu: 'alinan' as const },
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
export const KARTSIZ_KATEGORI: Record<TalepTuru, string> = { malzeme: '', hizmet: 'Hizmet', fason: 'Fason' };
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
// Kart #1310, 959 b: teslim yöntemi seçilmiş, siparişi verilmiş (henüz tamamı teslim alınmamış) talepte her kayıtlı tedarikçili sipariş bir
// alımdır; taşımayı yöntem verir. İstenen gün siparişin beklenen teslimi, yoksa talebin ihtiyaç günüdür. Aynı firmaya iki sipariş tek alımdır
// (en erken gün). Yöntemi seçilmemiş talep sevkiyata alım düşürmez.
export function talebinAlimlari(
  t: Pick<Talep, 'durum' | 'teslimYontemi' | 'teklifler' | 'karar' | 'ihtiyacTarihi'>,
): { firmaId: number; istenenTarih: string | null; tasima: AlimTasimasi }[] {
  if (t.teslimYontemi === null || t.durum !== 'siparis_verildi') return [];
  const tasima: AlimTasimasi = t.teslimYontemi === 'biz_alacagiz' ? 'biz' : 'firma';
  const alimlar = new Map<number, string | null>();
  for (const sip of t.karar?.siparisler ?? []) {
    const firmaId = t.teklifler.find((x) => x.id === sip.teklifId)?.firmaId ?? null;
    if (firmaId === null) continue;
    const gun = sip.beklenenTeslim ?? t.ihtiyacTarihi;
    const onceki = alimlar.get(firmaId);
    alimlar.set(firmaId, onceki === undefined || onceki === null ? gun : gun === null || onceki < gun ? onceki : gun);
  }
  return [...alimlar].map(([firmaId, istenenTarih]) => ({ firmaId, istenenTarih, tasima }));
}
// D6 b: faturanın bağlanacağı siparişin tedarikçisi (finans firması). Sipariş verilmiş talepte, var olan siparişte ve kayıtlı
// tedarikçide çalışır; ret iletisi ya da firma kimliği döner.
export function siparisFaturaFirmasi(t: Pick<Talep, 'durum' | 'teklifler' | 'karar'>, teklifId: string): { firmaId: number } | { red: string } {
  if (t.durum !== 'siparis_verildi' && t.durum !== 'teslim_alindi') return { red: ILETILER.faturaSiparisDurumu };
  if (!(t.karar?.siparisler ?? []).some((x) => x.teklifId === teklifId)) return { red: ILETILER.faturaSiparisYok };
  const firmaId = t.teklifler.find((x) => x.id === teklifId)?.firmaId ?? null;
  return firmaId === null ? { red: ILETILER.faturaKayitsizTedarikci } : { firmaId };
}
// 1839 (karar 1839 a): üç yollu eşleşme; fatura bağlanırken sipariş, teslim ve fatura karşılaştırılır. Bağ reddedilmez, uyarı
// döner: fatura kısmi teslimde ya da toplu faturada da bağlanabilir. Uyarı rakam taşımaz; fatura tutarı finans rakamıdır (FNS-48).
// Fatura tutarı okunamazsa (null) tutar karşılaştırılmaz.
export function faturaEslesmeUyarilari(
  siparis: { toplam: string | null; paraBirimi: string; satirlar: readonly { miktar: string; teslimAlinan: string | null }[]; kapali?: boolean },
  fatura: { tutar: string; paraBirimi: string } | null,
): string[] {
  const uyarilar: string[] = [];
  const s = siparis.satirlar;
  // 2480: kalanı kapatılmış siparişte eksik teslim bilerek kapatılmıştır, uyarı değildir; toplam çağıranın verdiği gerçekleşen değerdir.
  if (s.some((x) => ondalikKiyas(x.teslimAlinan ?? '0', x.miktar) > 0)) uyarilar.push(ILETILER.eslesmeFazlaTeslim);
  else if (siparis.kapali !== true && s.some((x) => ondalikKiyas(x.teslimAlinan ?? '0', x.miktar) < 0)) uyarilar.push(ILETILER.eslesmeEksikTeslim);
  if (fatura !== null && siparis.toplam !== null) {
    if (fatura.paraBirimi.trim() !== siparis.paraBirimi.trim()) uyarilar.push(ILETILER.eslesmeParaBirimi);
    else {
      const k = ondalikKiyas(fatura.tutar, siparis.toplam);
      if (k > 0) uyarilar.push(ILETILER.eslesmeTutarFazla);
      else if (k < 0) uyarilar.push(ILETILER.eslesmeTutarEksik);
    }
  }
  return uyarilar;
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
// tarihinden) vade günü sonra; ödeme şekli banka havalesi. 2132-2 a: tutarlar KDV dahildir (ödenecek para faturanın toplamıdır);
// oran siparişte elle seçilen, yoksa finansın genel oranı (2132-7). Oran bilinmiyorsa KDV hariç kalır (sıfır uydurulmaz, KDV eklenmez).
// Avans ve toplam ayrı ayrı kuruşa yuvarlanır, kalan farktır: satırların toplamı KDV dahil toplama eşittir.
// 2132-6 a: vadeli satır mal kabul günü varsa ondan, yoksa beklenen teslimden sayılır.
// 2417: vade teslimattan sayılıyorsa her mal kabul günü kendi payıyla ayrı vadeli satırdır (gün + vade); teslim edilmemiş pay beklenen
// teslimden (yoksa sipariş tarihinden) sayılır. Siparişten sayılıyorsa tek satır: sipariş tarihi + vade. Pay toplamı 1'i aşmaz (fazla
// teslim kalanı büyütmez); kuruş farkı son satıra düşer. Aynı güne düşen satırlar birleşir.
export interface OdemeKosulu {
  toplam: string; avans: string; kalan: string; vadeGun: number; siparisTarihi: string | null; beklenenTeslim: string | null; malKabul?: string | null;
  vadeBaslangici?: 'teslim' | 'siparis'; partiler?: readonly { gun: string; oran: string }[]; tamTeslim?: boolean;
  kapali?: boolean; satirlar?: readonly { mal: string; miktar: string; teslim: string }[]; masraf?: string;
}
// 2463 a, 2472: kalanı kapatılmış siparişin planı gerçekleşen teslim değerine iner (bütçe kullanımıyla aynı tanım, gerceklesenPay).
// Toplam gerçekleşen değerdir; avans siparişin avansı olarak kalır (önceden ödenir), kalan farktır: avans aşarsa kalan eksidir ve vadeli
// satır yazılmaz (2480-1 a: plandaki avans gerçekleşen değere iner). Partiler gerçekleşen teslime oranlanır (payların toplamı 1); kapatılan kalan için dilim yoktur. Açık sipariş değişmez.
export function gerceklesenKosul<T extends OdemeKosulu>(k: T): T {
  if (k.kapali !== true || k.satirlar === undefined) return k;
  const deger = gerceklesenSiparisDegeri(k.satirlar.map((s) => ({ mal: Number(s.mal), miktar: Number(s.miktar), teslim: Number(s.teslim) })), Number(k.masraf ?? '0'));
  const toplam = (Math.round(deger * 100) / 100).toFixed(2);
  const net = (k.partiler ?? []).reduce((t, p) => t + Number(p.oran), 0);
  const partiler = net > 0 ? (k.partiler ?? []).map((p) => ({ gun: p.gun, oran: String(Number(p.oran) / net) })) : [];
  return { ...k, toplam, kalan: ondalikMetni(tamSayiya(toplam) - tamSayiya(k.avans)), partiler, tamTeslim: true };
}
// 2472 M2: avans gerçekleşen değeri aşıyorsa fark (KDV dahil, sipariş dövizinde); aşmıyorsa ya da sipariş açıksa null.
export function avansAsimi(k: OdemeKosulu, kdvOrani: string | null): string | null {
  if (k.kapali !== true) return null;
  const g = gerceklesenKosul(k);
  const kdvli = (x: string) => (kdvOrani === null ? x : kdvEkle(x, kdvOrani));
  const fark = tamSayiya(kdvli(g.avans)) - tamSayiya(kdvli(g.toplam));
  return fark > 0n ? ondalikMetni(fark) : null;
}
// 2472 (2132-6 a): elle ya da faturalı plan değişmez; kapanışta plan toplamının gerçekleşen değerden (KDV dahil) farkı, yoksa null.
export function planGerceklesenFarki(k: OdemeKosulu, kdvOrani: string | null, planTutarlari: readonly string[]): string | null {
  if (k.kapali !== true || planTutarlari.length === 0) return null;
  const g = gerceklesenKosul(k);
  const hedef = kdvOrani === null ? g.toplam : kdvEkle(g.toplam, kdvOrani);
  const fark = planTutarlari.reduce((t, x) => t + tamSayiya(x), 0n) - tamSayiya(hedef);
  return fark === 0n ? null : ondalikMetni(fark);
}
export function vadeDilimleri(k: Pick<OdemeKosulu, 'siparisTarihi' | 'beklenenTeslim' | 'vadeBaslangici' | 'partiler' | 'tamTeslim'>, bugun: string): { gun: string; pay: number }[] {
  const baslangic = k.siparisTarihi ?? bugun;
  if (k.vadeBaslangici === 'siparis') return [{ gun: baslangic, pay: 1 }];
  const dilimler: { gun: string; pay: number }[] = [];
  let kalan = 1;
  for (const p of k.partiler ?? []) {
    let pay = Number(p.oran);
    // Geri alınan teslim son partilerden düşer (mal geri gitti, o payın vadesi yok).
    while (pay < 0 && dilimler.length > 0) {
      const son = dilimler[dilimler.length - 1]!;
      const dus = Math.min(son.pay, -pay);
      son.pay -= dus; kalan += dus; pay += dus;
      if (son.pay <= 1e-9) dilimler.pop();
    }
    pay = Math.min(pay, kalan);
    if (!(pay > 0)) continue;
    dilimler.push({ gun: p.gun, pay });
    kalan -= pay;
  }
  // Teslimi bitmiş siparişte beklenen teslim yoktur: oran yuvarlamasından kalan pay son partiye eklenir (hayali satır yazılmaz).
  if (k.tamTeslim === true && dilimler.length > 0) { dilimler[dilimler.length - 1]!.pay += kalan; kalan = 0; }
  if (kalan > 1e-9) dilimler.push({ gun: k.beklenenTeslim ?? baslangic, pay: kalan });
  return dilimler;
}
export function kdvEkle(tutar: string, oran: string): string {
  const kurus = tamSayiya(tutar) / 10n ** BigInt(OLCEK - 2);
  const c = kurus * (10_000n + tamSayiya(oran) / 10n ** BigInt(OLCEK - 2));
  const k = (c + 5_000n) / 10_000n;
  return `${k / 100n}.${(k % 100n).toString().padStart(2, '0')}`;
}
export function varsayilanOdemePlani(kosul: OdemeKosulu, bugun: string, kdvOrani: string | null): { tur: 'avans' | 'vade'; vade: string; yontem: 'banka'; tutar: string }[] {
  const k = gerceklesenKosul(kosul);
  const baslangic = k.siparisTarihi ?? bugun;
  const gunEkle = (tarih: string, gun: number) => new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_MS).toISOString().slice(0, 10);
  const tamAvans = kdvOrani === null ? k.avans : kdvEkle(k.avans, kdvOrani);
  const kdvliToplam = kdvOrani === null ? k.toplam : kdvEkle(k.toplam, kdvOrani);
  // 2480-1 a: kapalı siparişte plandaki avans gerçekleşen değeri aşmaz (KDV dahil, sipariş dövizinde); aşan kısım geçmiş notundadır.
  const avans = k.kapali === true && ondalikKiyas(tamAvans, kdvliToplam) > 0 ? kdvliToplam : tamAvans;
  const kalan = kdvOrani === null && k.kapali !== true ? k.kalan : ondalikMetni(tamSayiya(kdvliToplam) - tamSayiya(avans));
  const plan: { tur: 'avans' | 'vade'; vade: string; yontem: 'banka'; tutar: string }[] = [];
  if (ondalikKiyas(avans, '0') > 0) plan.push({ tur: 'avans', vade: baslangic, yontem: 'banka', tutar: avans });
  if (ondalikKiyas(kalan, '0') <= 0) return plan;
  // Parti bilgisi gelmeyen çağıran (eski kurgu) son mal kabul gününü tek satır kullanır.
  const dilimler = k.partiler === undefined && k.vadeBaslangici === undefined
    ? [{ gun: k.malKabul ?? k.beklenenTeslim ?? baslangic, pay: 1 }]
    : vadeDilimleri(k, bugun);
  const kalanKurus = tamSayiya(kalan) / 10n ** BigInt(OLCEK - 2);
  const gunler = new Map<string, bigint>();
  let dagitilan = 0n;
  dilimler.forEach((d, i) => {
    const kurus = i === dilimler.length - 1 ? kalanKurus - dagitilan : BigInt(Math.round(Number(kalanKurus) * d.pay));
    dagitilan += kurus;
    const vade = gunEkle(d.gun, k.vadeGun);
    gunler.set(vade, (gunler.get(vade) ?? 0n) + kurus);
  });
  for (const [vade, kurus] of [...gunler].sort(([a], [b]) => a.localeCompare(b))) {
    if (kurus > 0n) plan.push({ tur: 'vade', vade, yontem: 'banka', tutar: ondalikMetni(kurus * 10n ** BigInt(OLCEK - 2)) });
  }
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
// 2424-a c: parçalı dönüşte iki ölçü. Kalan: gönderilen (gönderilmemişse emir adedi) eksi dönen ve hurda; kalan varsa iş bitmemiştir.
export function fasonKalani(adet: number, gonderilen: number | null, donen: number | null, hurda: number | null): number {
  return Math.max(0, Math.max(adet, gonderilen ?? 0) - (donen ?? 0) - (hurda ?? 0));
}
const asim = (termin: string, gun: string): number => Math.max(0, Math.round((Date.parse(gun) - Date.parse(termin)) / GUN_MS));
export function sonDonusGecikmesi(termin: string | null, sonDonus: string | null, kalan: number, bugun: string): number | null {
  if (termin === null) return null;
  return asim(termin, kalan > 0 || sonDonus === null ? bugun : istanbulGunu(sonDonus));
}
export function agirlikliGecikme(termin: string | null, donusler: readonly { gun: string; adet: number; hurda: number }[], kalan: number, bugun: string): number | null {
  if (termin === null) return null;
  const parcalar = [...donusler.map((d) => ({ gun: d.gun, adet: d.adet + d.hurda })), ...(kalan > 0 ? [{ gun: bugun, adet: kalan }] : [])].filter((p) => p.adet > 0);
  const toplam = parcalar.reduce((t, p) => t + p.adet, 0);
  if (toplam === 0) return null;
  return Math.round((parcalar.reduce((t, p) => t + asim(termin, p.gun) * p.adet, 0) / toplam) * 10) / 10;
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
export function talebim(t: Talep, baglar: ReadonlyMap<string, KalemBagi> = new Map(), karsiliklar: ReadonlyMap<string, BirimKarsiligi> = new Map()): Talebim {
  const bag = (id: string): KalemBagi => baglar.get(id) ?? { uygulanan: null, fasonAdim: null };
  return {
    id: t.id, no: t.no, baslik: t.baslik, durum: t.durum, ihtiyacTarihi: t.ihtiyacTarihi, olusturma: t.olusturma,
    uretimEmriNo: t.uretimEmriNo, birlesme: t.birlesme ?? null,
    surum: t.surum, aciklama: t.notlar, duzenlenebilir: talebimDuzenlenirMi(t),
    guncellenebilir: guncellemeReddi(t, t.kalemler.some((k) => bag(k.id).uygulanan !== null || bag(k.id).fasonAdim !== null)) === null,
    ...(t.guncellemeGrubu === undefined ? {} : { guncellemeGrubu: t.guncellemeGrubu }),
    kaynak: t.kalemler.some((k) => bag(k.id).fasonAdim !== null) ? 'fason' : 'elle',
    kalemler: t.kalemler.map((k) => ({ id: k.id, aciklama: k.ozellik, ad: k.ad, miktar: k.miktar, birim: k.birim, kartBekliyor: k.katalogId === null, ...bag(k.id), karsilik: karsiliklar.get(k.id) ?? null })),
  };
}

// SAT-79 (2871-1 a): talep eden kendi talebini yalnız teklif istenmeden önce (taslak) düzenler; birleştirilmiş kaynak talep düzenlenmez
// (kalemleri birleşik taleptedir). Sahiplik servis denetler. Teklif toplanırken güncelleme ayrı talep olarak açılır (kart 2876).
export const talebimDuzenlenirMi = (t: Pick<Talep, 'durum' | 'birlesme'>): boolean => t.durum === 'taslak' && t.birlesme == null;
// SAT-80 (2876, 2871-1 b): teklif toplanırken (teklif isteniyor, değerlendirme) sahibi asıl talebi bozmadan güncelleme talebi açar.
// Birleştirilmiş ya da birleşik talepte ve bağlı (fason adım, uygulanan parça) kalemi olan talepte açılmaz: bağ ikinci kez kurulmasın.
// Sahiplik servis denetler.
export function guncellemeReddi(t: Pick<Talep, 'durum' | 'birlesme' | 'kaynaklar'>, bagliKalemVar: boolean): string | null {
  if (t.durum !== 'teklif_isteniyor' && t.durum !== 'degerlendirme') return ILETILER.guncellemeAsamasi;
  if (t.birlesme != null || (t.kaynaklar ?? []).length > 0) return ILETILER.guncellemeBirlesik;
  return bagliKalemVar ? ILETILER.guncellemeBagli : null;
}
// SAT-81 (2871-2 a): gruptaki bir talep siparişe geçince öteki açık talepler (siparişte ya da iptal olmayan) kendiliğinden iptal olur;
// iptal geri alınabilir. Siparişteki talep iptal edilmez (satın alma bilerek ikinci alımı yapmıştır).
export function guncellemeIptalleri<T extends { id: string; durum: string }>(grup: readonly T[], siparisteki: string): T[] {
  return grup.filter((x) => x.id !== siparisteki && !['siparis_verildi', 'teslim_alindi', 'iptal'].includes(x.durum));
}
// Gelen kalemler: kimlikli olan var olan kalemdir (tekrarsız); bağlı kalem (fason adım, uygulanan parça) çıkarılamaz, miktarı değişmez.
export function talebimKalemReddi(
  eski: readonly { id: string; miktar: string | null; bagli: boolean }[], gelen: readonly { id: string | null; miktar: string }[],
): string | null {
  const ids = gelen.flatMap((x) => (x.id === null ? [] : [x.id]));
  if (new Set(ids).size !== ids.length || ids.some((id) => !eski.some((e) => e.id === id))) return ILETILER.talebimKalemYok;
  for (const e of eski.filter((x) => x.bagli)) {
    const g = gelen.find((x) => x.id === e.id);
    if (g === undefined || e.miktar === null || ondalikKiyas(g.miktar, e.miktar) !== 0) return ILETILER.talebimBagliKalem;
  }
  return null;
}

// SAT-78 (2871): kalemin kg ile kartın stok birimi arasındaki karşılığı. Kartın birim ağırlığı bütün parça ya da ambalaj başına kg'dır
// (yalnız hammaddede; çubuk, bobin, rulo). Kalem kg ise stok birimine, stok biriminde ise kg'a çevrilir; başka birimde, ağırlık bilinmiyorsa,
// stok birimi kg ya da uzunluk/alan birimiyse karşılık yoktur (uydurulmaz): metre ağırlığı sunucuda yoktur.
// İstemci talep/ortak.ts aynı listeyi taşır (istemci paylaşılan sözleşmeden değer ithal etmez).
export const OLCULU_STOK_BIRIMLERI: readonly string[] = ['mm', 'cm', 'm', 'mt', 'metre', 'mm2', 'mm²', 'cm2', 'cm²', 'm2', 'm²', 'metrekare'];
export interface BirimKarsiligi { miktar: string; birim: string }
const birimAdi = (b: string | null): string => (b ?? '').trim().toLocaleLowerCase('tr-TR');
export function birimKarsiligi(miktar: string | null, birim: string, kart: { stokBirimi: string | null; birimKg: number | null } | undefined): BirimKarsiligi | null {
  if (miktar === null || kart === undefined || kart.birimKg === null || !(kart.birimKg > 0)) return null;
  const stok = birimAdi(kart.stokBirimi);
  if (stok === '' || stok === 'kg' || OLCULU_STOK_BIRIMLERI.includes(stok)) return null;
  const kg = kart.birimKg.toFixed(OLCEK);
  if (birimAdi(birim) === 'kg') {
    const m = ondalikBol(miktar, kg);
    return m === null ? null : { miktar: m, birim: kart.stokBirimi!.trim() };
  }
  return birimAdi(birim) === stok ? { miktar: ondalikCarp(miktar, kg), birim: 'kg' } : null;
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
// 898 a, Dal 2: plan ön talebi. Planın stokla karşılanamayan eksiğinden açık siparişin kalanı ve sipariş verilmemiş açık talep (kartın stok
// biriminde olanlar; başka birimdeki satır çevrilmeden düşülmez) çıkar; yoksayma o anki kalanı saklar, kalan onu aşarsa fark yeniden düşer.
export interface PlanOnTalepGirdisi {
  ihtiyaclar: readonly { malzemeNo: number; miktar: string; gerekenTarih: string; emirler: readonly string[]; stokBilinmiyor: boolean }[];
  birimler: ReadonlyMap<number, string | null>;
  siparisler: readonly { malzemeNo: number; birim: string; miktar: string }[];
  talepler: readonly { malzemeNo: number; birim: string; miktar: string }[];
  yoksaylar: ReadonlyMap<number, string>;
}
export interface PlanOnTalepAdayi {
  malzemeNo: number; miktar: number; gerekenTarih: string; emirler: string[]; stokBilinmiyor: boolean;
  // Yoksaymadan önceki kalan; yoksayma bunu saklar.
  kalan: number;
  hesap: { eksik: number; siparis: number; talep: number; yoksayilan: number };
}
const dortHane = (n: number): number => Math.round(n * 10_000) / 10_000;
export function planOnTalepAdaylari(g: PlanOnTalepGirdisi): PlanOnTalepAdayi[] {
  const topla = (l: PlanOnTalepGirdisi['siparisler'], no: number) => {
    const birim = g.birimler.get(no) ?? null;
    return l.filter((x) => x.malzemeNo === no && birim !== null && x.birim === birim).reduce((t, x) => t + (Number(x.miktar) || 0), 0);
  };
  return g.ihtiyaclar.flatMap((i) => {
    const eksik = Number(i.miktar) || 0;
    const siparis = topla(g.siparisler, i.malzemeNo);
    const talep = topla(g.talepler, i.malzemeNo);
    const kalan = dortHane(eksik - siparis - talep);
    const yoksayilan = Number(g.yoksaylar.get(i.malzemeNo) ?? 0) || 0;
    const miktar = dortHane(kalan - yoksayilan);
    if (miktar <= 0) return [];
    return [{
      malzemeNo: i.malzemeNo, miktar, kalan, gerekenTarih: i.gerekenTarih, emirler: [...i.emirler], stokBilinmiyor: i.stokBilinmiyor,
      hesap: { eksik, siparis: dortHane(siparis), talep: dortHane(talep), yoksayilan },
    }];
  });
}
// Uygulanan parça ve fason adım yalnız hizmet ve fason talebindedir; bir fason adım bir talepte bir kez geçer ve talebin emri seçiliyse o emrindir.
export function hizliBagReddi(
  tur: TalepTuru, kalemler: readonly HizliKalem[], emirId: number | null, fasonEmri: (isEmriId: number) => number | undefined,
): string | null {
  const bagli = kalemler.filter((k) => k.uygulananMalzemeNo !== null || k.isEmriId !== null);
  if (bagli.length > 0 && tur === 'malzeme') return ILETILER.bagYalnizHizmette;
  const isler = kalemler.flatMap((k) => (k.isEmriId === null ? [] : [k.isEmriId]));
  if (new Set(isler).size !== isler.length) return ILETILER.fasonTekrar;
  for (const i of isler) {
    const emir = fasonEmri(i);
    if (emir === undefined) return ILETILER.fasonOnTalepYok;
    if (emirId !== null && emir !== emirId) return ILETILER.fasonEmirFarkli;
  }
  return null;
}
// SA-FAS-1 (2428): fason kalemi tek kaynak taşır: emrin fason adımı ya da stoktaki parti. Partide işlem (hizmet kartı), uygulanan parça
// ve tam sayı adet zorunludur; parti ve konum yalnız fason talebindedir. Partinin stokta varlığını gidişte stok denetler (katman sırası).
export function fasonKalemReddi(tur: TalepTuru, kalemler: readonly HizliKalem[]): { ileti: string; sira: number } | null {
  for (const [sira, k] of kalemler.entries()) {
    if (tur !== 'fason') {
      if (k.partiId !== null || k.konumId !== null) return { ileti: ILETILER.partiYalnizFasonda, sira };
      continue;
    }
    if ((k.isEmriId === null) === (k.partiId === null)) return { ileti: ILETILER.fasonKaynakTek, sira };
    if (k.partiId === null) {
      if (k.konumId !== null) return { ileti: ILETILER.partiYalnizFasonda, sira };
      continue;
    }
    if (k.malzemeNo === null) return { ileti: ILETILER.fasonIslemYok, sira };
    if (k.uygulananMalzemeNo === null) return { ileti: ILETILER.fasonParcaYok, sira };
    const adet = Number(k.miktar);
    if (!Number.isInteger(adet) || adet <= 0 || adet > 2147483647) return { ileti: ILETILER.fasonAdetTam, sira };
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

// 2455-A: kg fiyatı girişinin denetimi ve izlenmesi. Bölme yarım yukarı yuvarlanır; bölen sıfırsa boş.
export function ondalikBol(a: string, b: string): string | null {
  const y = tamSayiya(b);
  if (y === 0n) return null;
  const pay = tamSayiya(a) * 10n ** BigInt(OLCEK);
  const eksi = (pay < 0n) !== (y < 0n);
  const mp = pay < 0n ? -pay : pay, my = y < 0n ? -y : y;
  const t = (2n * mp + my) / (2n * my);
  return ondalikMetni(eksi ? -t : t);
}
// 2455-2 a: girilen kalite + form katalogda kullanılan bir çift olmalı. Formsuz satır kalitenin herhangi bir formuyla eşleşir.
export function kgFiyatiKartta(kaliteKodu: string, form: string | null, kullanilan: readonly { kaliteKodu: string; form: string | null }[]): boolean {
  return kullanilan.some((k) => k.kaliteKodu === kaliteKodu && (form === null || k.form === form));
}
// Bilinmeyen satırların 1'den başlayan sıra numaraları; boşsa hepsi geçerlidir.
export function bilinmeyenKgSatirlari(satirlar: readonly { kaliteKodu: string; form: string | null }[], kullanilan: readonly { kaliteKodu: string; form: string | null }[]): number[] {
  return satirlar.flatMap((s, i) => (kgFiyatiKartta(s.kaliteKodu, s.form, kullanilan) ? [] : [i + 1]));
}
// V2: yaş geçerlilik başlangıcından bugüne takvim günüdür (ileri tarihli giriş güncel listede yoktur).
export function kgFiyatiYasi(gecerlilik: string, bugun: string): number {
  return Math.max(0, gunFarki(gecerlilik, bugun));
}
// 2455-3 a: eşik boşsa eskime izlenmez.
export function kgFiyatiEskiMi(yasGun: number, esikGun: number | null): boolean {
  return esikGun !== null && yasGun >= esikGun;
}
// F-4: son alışın kg fiyatı, siparişin kendi para biriminde: stok birimi kg ise birim fiyat; değilse birim fiyat / kartın birim ağırlığı.
export function sonAlisKgFiyati(birimFiyat: string, stokBirimi: string | null, birimKg: number | null): string | null {
  if (stokBirimi !== null && stokBirimi.trim().toLocaleLowerCase('tr-TR') === 'kg') return birimFiyat;
  return birimKg === null || !(birimKg > 0) ? null : ondalikBol(birimFiyat, birimKg.toFixed(OLCEK));
}
// Fiyat satırı başına son alış: her kartın son alışı, kartın kalite + formuna uygulanan güncel satıra yazılır (uygulananKgFiyati);
// satır başına en son alış kazanır. Kg karşılığı çıkmayan alış atlanır, bir öncekine düşülmez (en son alışın fiyatı bilinmiyor demektir).
export interface KartSonAlisi {
  kaliteKodu: string; form: string | null; stokBirimi: string | null; birimKg: number | null;
  sonAlis: { birimFiyat: string; paraBirimi: string; zaman: string } | null;
}
export function kgSonAlislari<T extends { kaliteKodu: string; form: string | null }>(
  fiyatlar: readonly T[], kartlar: readonly KartSonAlisi[],
): Map<T, { kgFiyati: string | null; paraBirimi: string; zaman: string }> {
  const sonuc = new Map<T, { kgFiyati: string | null; paraBirimi: string; zaman: string }>();
  for (const k of kartlar) {
    if (k.sonAlis === null) continue;
    const f = uygulananKgFiyati(fiyatlar, k.kaliteKodu, k.form);
    if (f === null) continue;
    const onceki = sonuc.get(f);
    if (onceki !== undefined && onceki.zaman >= k.sonAlis.zaman) continue;
    sonuc.set(f, { kgFiyati: sonAlisKgFiyati(k.sonAlis.birimFiyat, k.stokBirimi, k.birimKg), paraBirimi: k.sonAlis.paraBirimi, zaman: k.sonAlis.zaman });
  }
  return sonuc;
}
// F6, G1 (V6): sapma = son alış / liste fiyatı - 1, yüzde, iki ondalık. Aynı kurla ölçülür: para birimleri aynıysa doğrudan, farklıysa
// ikisinin de bugünkü TL karşılığıyla. Biri boşsa (kur yok, ağırlık yok) boş.
export function kgSapmasi(g: {
  kgFiyati: string; paraBirimi: string; tryKgFiyati: string | null;
  sonAlisKgFiyatiDoviz: string | null; sonAlisParaBirimi: string | null; sonAlisKgFiyati: string | null;
}): string | null {
  const ayni = g.sonAlisParaBirimi === g.paraBirimi;
  const pay = ayni ? g.sonAlisKgFiyatiDoviz : g.sonAlisKgFiyati;
  const payda = ayni ? g.kgFiyati : g.tryKgFiyati;
  if (pay === null || payda === null) return null;
  const oran = ondalikBol(pay, payda);
  if (oran === null) return null;
  const yuzde = ondalikCarp(ondalikTopla([oran, '-1']), '100');
  const t = tamSayiya(yuzde), birim = 10n ** BigInt(OLCEK - 2);
  const yuvarlak = ((t < 0n ? -t : t) + birim / 2n) / birim * birim;
  return ondalikMetni(t < 0n ? -yuvarlak : yuvarlak);
}
// 2455-13 a: iki yönde |sapma| >= eşik; sapma ya da eşik boşsa sapmıyor sayılır.
export function kgSapanMi(sapmaYuzde: string | null, esikYuzde: number | null): boolean {
  if (sapmaYuzde === null || esikYuzde === null) return false;
  const t = tamSayiya(sapmaYuzde);
  return (t < 0n ? -t : t) >= tamSayiya(String(esikYuzde));
}
// 2455-6 (2432 onuncu madde): kartlarda kullanılan kalite + formun güncel girişi eşik kadar yaşlandıysa hatırlatılır. Dönem son girişin
// kimliğidir: yeni giriş (ya da iptal) eski hatırlatmayı kapatır. VARSAYIM: kartta olmayan çift hatırlatılmaz (fiyatı kullanan yok).
export function kgEskimeHatirlatmalari(
  fiyatlar: readonly { id: number; kaliteKodu: string; form: string | null; gecerlilik: string; kartta: boolean }[], esikGun: number | null, bugun: string,
): HatirlatmaOlayi[] {
  if (esikGun === null) return [];
  return fiyatlar.flatMap((f) => {
    const yas = kgFiyatiYasi(f.gecerlilik, bugun);
    if (!f.kartta || !kgFiyatiEskiMi(yas, esikGun)) return [];
    const ad = f.form === null ? f.kaliteKodu : `${f.kaliteKodu} ${f.form}`;
    return [{ tur: 'satin-alma.hatirlatma-kg-fiyati-eskidi' as const, kaynakKimlik: `kg:${f.id}`, talepId: null, baslik: `${ad}: kg fiyatı ${yas} gündür güncellenmedi`, yol: '/satin-alma/kg-fiyatlari' as const }];
  });
}

// 1104 a: teklif isteğinde ve siparişte tedarikçiye giden kart alanları, ekrandaki sırayla. Fiyat, en az sipariş, tercih edilen
// tedarikçi ve kart notu bizimdir, gitmez. Kart yoksa liste boştur.
export function tedarikciyeGidenAyrinti(a: KartAyrintisi | null): { ad: string; deger: string }[] {
  if (a === null) return [];
  const satirlar: [string, string | null][] = [
    ['Kalite', a.kaliteAdi], ['Form', a.formAdi], ['Açıklama', a.aciklamalar.join(', ') || null], ['Standart', a.standartlar.join(', ') || null],
    ['Tolerans', a.tolerans], ['Durum / ısıl işlem', a.durum], ['Yüzey', a.yuzey], ['Üretici ürün kodu', a.ureticiUrunKodu], ['Menşei', a.mensei],
    ['İstenen sertifikalar', a.sertifikalar.join(', ') || null],
  ];
  return satirlar.flatMap(([ad, deger]) => (deger === null ? [] : [{ ad, deger }]));
}

// Kart 1474: karneye gidecek teslim olayı (saf). Termin, firma ya da artı teslim yoksa ya da net teslim sıfır ya da eksiyse olay yoktur
// (null; yoksa sıfır uydurulmuş olur). Net teslim sipariş miktarına ulaşınca tamdır; fazla teslim de tamdır.
export function karneTeslimOlayi(b: { firmaId: number | null; termin: string | null; miktar: string; net: string; sonZaman: string | null }):
  { firmaId: number; termin: string; zaman: string; tam: boolean } | null {
  if (b.firmaId === null || b.termin === null || b.sonZaman === null || ondalikKiyas(b.net, '0') <= 0) return null;
  return { firmaId: b.firmaId, termin: b.termin, zaman: b.sonZaman, tam: ondalikKiyas(b.net, b.miktar) >= 0 };
}

// 2433: termin takibi. Satır ihtiyaç kalemidir; durum tek kuralla burada verilir (ekran ve plan hesaplamaz).
export interface TerminKalemi {
  kaynak: 'talep' | 'siparis';
  talepId: string; talepNo: string; talepDurumu: TalepDurumu; ihtiyacTarihi: string | null;
  kalemId: string; ad: string; birim: string; miktar: string | null; malzemeNo: number | null; isEmriId: number | null;
  teklifId: string | null; siparisNo: string | null; beklenenTeslim: string | null;
}
export interface TerminTakipGirdisi {
  bugun: string;
  planlar: readonly { malzemeNo: number; miktar: string; gerekenTarih: string; emirler: readonly string[] }[];
  elleTerminler: readonly TedarikTermini[];
  kalemler: readonly TerminKalemi[];
  kartlar: ReadonlyMap<number, { kod: string; ad: string | null; birim: string | null; tur: string }>;
  isEmirleri: ReadonlyMap<number, string>;
}

// Sıra önemlidir: önce tarih sorunları, sonra miktar, sonra bilgi.
export function terminDurumu(g: {
  bugun: string; gerekenTarih: string | null; ihtiyacVar: boolean; eksik: string | null;
  siparisTarihleri: readonly (string | null)[]; talepVar: boolean; elleTermin: string | null; karsilayanTarih: string | null;
}): TerminDurumu {
  const siparisVar = g.siparisTarihleri.length > 0;
  if (g.gerekenTarih !== null && g.gerekenTarih < g.bugun) return 'gecikti';
  if (g.siparisTarihleri.some((t) => t !== null && t < g.bugun)) return 'gecikti';
  if (g.siparisTarihleri.some((t) => t === null)) return 'teslim_tarihi_yok';
  if (g.gerekenTarih !== null && g.karsilayanTarih !== null && g.karsilayanTarih > g.gerekenTarih) return 'gec_kaliyor';
  if (g.ihtiyacVar && !siparisVar && !g.talepVar && g.elleTermin === null) return 'termin_bekleniyor';
  if (g.eksik !== null && ondalikKiyas(g.eksik, '0') > 0) return 'eksik';
  if (!siparisVar && g.talepVar) return 'talep_yolda';
  if (!g.ihtiyacVar) return 'plan_istemiyor';
  return 'zamaninda';
}

export function terminTakibi(g: TerminTakipGirdisi): TerminTakipSatiri[] {
  const planlar = new Map(g.planlar.map((p) => [p.malzemeNo, p]));
  const elleler = new Map(g.elleTerminler.filter((t) => t.termin !== null).map((t) => [t.malzemeNo, t]));
  const turu = (k: TerminKalemi): TerminTakipSatiri['tur'] =>
    k.isEmriId !== null ? 'fason' : k.malzemeNo !== null && g.kartlar.get(k.malzemeNo)?.tur === 'hizmet' ? 'hizmet' : 'malzeme';
  const gruplar = new Map<string, { tur: TerminTakipSatiri['tur']; malzemeNo: number | null; kalemler: TerminKalemi[] }>();
  const grup = (anahtar: string, tur: TerminTakipSatiri['tur'], malzemeNo: number | null) => {
    if (!gruplar.has(anahtar)) gruplar.set(anahtar, { tur, malzemeNo, kalemler: [] });
    return gruplar.get(anahtar)!;
  };
  for (const k of g.kalemler) {
    const tur = turu(k);
    const malzemeSatiri = tur === 'malzeme' && k.malzemeNo !== null;
    grup(malzemeSatiri ? `malzeme:${k.malzemeNo}` : `kalem:${k.talepId}:${k.kalemId}`, tur, k.malzemeNo).kalemler.push(k);
  }
  for (const no of [...planlar.keys(), ...elleler.keys()]) grup(`malzeme:${no}`, 'malzeme', no);

  const satirlar = [...gruplar.entries()].map(([anahtar, x]): TerminTakipSatiri => {
    const kart = x.malzemeNo === null ? undefined : g.kartlar.get(x.malzemeNo);
    const plan = x.tur === 'malzeme' && x.malzemeNo !== null ? planlar.get(x.malzemeNo) : undefined;
    const ilk = x.kalemler[0];
    const birim = kart?.birim ?? ilk?.birim ?? null;
    const talepTarihleri = x.kalemler.flatMap((k) => (k.ihtiyacTarihi === null ? [] : [k.ihtiyacTarihi])).sort();
    const tekKalem = x.tur !== 'malzeme' || x.malzemeNo === null;
    const ihtiyacMiktari = plan ? plan.miktar : tekKalem ? (ilk?.miktar ?? null) : null;
    const gerekenTarih = plan ? plan.gerekenTarih : (talepTarihleri[0] ?? null);
    const siparisler = x.kalemler.filter((k) => k.kaynak === 'siparis');
    const talepler = x.kalemler.filter((k) => k.kaynak === 'talep');
    const elle = x.tur === 'malzeme' && x.malzemeNo !== null && siparisler.length === 0 ? (elleler.get(x.malzemeNo) ?? null) : null;
    const karsilanan = ihtiyacMiktari === null ? null
      : ondalikTopla(x.kalemler.filter((k) => k.miktar !== null && k.birim === (birim ?? k.birim)).map((k) => k.miktar!));
    const eksikFark = ihtiyacMiktari === null || karsilanan === null ? null : ondalikTopla([ihtiyacMiktari, `-${karsilanan}`]);
    const eksik = eksikFark === null ? null : ondalikKiyas(eksikFark, '0') > 0 ? eksikFark : '0';
    const siparisTarihleri = siparisler.map((k) => k.beklenenTeslim);
    const tarihli = siparisTarihleri.filter((t): t is string => t !== null).sort();
    const karsilayanTarih = siparisler.length > 0 ? (tarihli.at(-1) ?? null) : (elle?.termin ?? null);
    const emirler = plan ? [...plan.emirler]
      : [...new Set(x.kalemler.flatMap((k) => (k.isEmriId === null ? [] : [g.isEmirleri.get(k.isEmriId) ?? `#${k.isEmriId}`])))];
    return {
      anahtar, tur: x.tur, malzemeNo: x.malzemeNo, kod: kart?.kod ?? null, ad: kart?.ad ?? ilk?.ad ?? '', birim,
      ihtiyacMiktari, gerekenTarih, emirler,
      karsilayanlar: x.kalemler.map((k) => ({
        tur: k.kaynak, talepId: k.talepId, talepNo: k.talepNo, talepDurumu: k.talepDurumu, teklifId: k.teklifId, siparisNo: k.siparisNo,
        tarih: k.kaynak === 'siparis' ? k.beklenenTeslim : k.ihtiyacTarihi, miktar: k.miktar, birim: k.birim,
      })),
      karsilanan, eksik, karsilayanTarih, elleTermin: elle,
      durum: terminDurumu({
        bugun: g.bugun, gerekenTarih, ihtiyacVar: plan !== undefined || gerekenTarih !== null, eksik, siparisTarihleri,
        talepVar: talepler.length > 0, elleTermin: elle?.termin ?? null, karsilayanTarih,
      }),
    };
  });
  return satirlar.sort((a, b) => Number(b.durum === 'gecikti') - Number(a.durum === 'gecikti')
    || (a.gerekenTarih ?? '9999-12-31').localeCompare(b.gerekenTarih ?? '9999-12-31') || a.ad.localeCompare(b.ad, 'tr') || a.anahtar.localeCompare(b.anahtar));
}

// 2432: hatırlatmalar. Tarih maddeleri takvim günü, bekleme maddeleri iş günü sayar. Her hatırlatmanın kaynak kimliği dönemi taşır
// (ihtiyaç tarihi, durumun başladığı an, teklif, beklenen teslim): koşul kalkınca kapanır, yeni dönem yeni hatırlatma açar.
export const HATIRLATMA_ADLARI = [
  'ihtiyac-yaklasiyor', 'taslak-bekliyor', 'teklif-cevapsiz', 'teklif-gecerlilik', 'degerlendirme-bekliyor', 'onay-bekliyor',
  'siparis-bekliyor', 'teslim-yaklasiyor', 'teslim-gecikti', 'teslim-gecikti-yonetici',
] as const;
export type HatirlatmaAdi = (typeof HATIRLATMA_ADLARI)[number];
// Kg fiyatı eskimesi talebe bağlı değildir ve kendi ayarını (satin-alma.kg-fiyati-eskime-gun) okur; bu yüzden listede yoktur.
export type HatirlatmaTuru = `satin-alma.hatirlatma-${HatirlatmaAdi}` | 'satin-alma.hatirlatma-kg-fiyati-eskidi';
// Boş değer o hatırlatmayı kapatır.
export type HatirlatmaAyarlari = Readonly<Record<HatirlatmaAdi, number | null>>;
// Kur kilidinin bitmesine bu kadar gün kala onaylı ama siparişsiz talep hatırlatılır (danışman maddesi 7).
export const KUR_KILIDI_UYARI_GUNU = 2;

export interface HatirlatmaTalebi {
  talepId: string;
  no: string;
  durum: TalepDurumu;
  ihtiyacTarihi: string | null;
  // Durumun başladığı an (ISO) ve tesis günü.
  durumAni: string;
  durumGunu: string;
  teklifIstegiVar: boolean;
  kararVar: boolean;
  kararOnayli: boolean;
  sonOnay: { id: string; gun: string } | null;
  // Kur kilidinin bittiği tesis günü; kilit yoksa null.
  kurKilidiBitisi: string | null;
  istekler: readonly { firmaId: number; tedarikci: string; gonderim: string; teklifVar: boolean }[];
  teklifler: readonly { teklifId: string; tedarikci: string; gecerlilik: string | null }[];
  // Yalnız açık (teslimi tamamlanmamış, kapatılmamış) siparişler.
  siparisler: readonly { teklifId: string; siparisNo: string | null; beklenenTeslim: string | null }[];
}

export interface HatirlatmaOlayi {
  tur: HatirlatmaTuru;
  kaynakKimlik: string;
  talepId: string | null;
  baslik: string;
  yol: '/satin-alma/talepler' | '/satin-alma/onaylar' | '/satin-alma/kg-fiyatlari';
}

const gunSayisi = (tarih: string): number => Date.UTC(Number(tarih.slice(0, 4)), Number(tarih.slice(5, 7)) - 1, Number(tarih.slice(8, 10))) / GUN_MS;
// b - a, takvim günü.
export const gunFarki = (a: string, b: string): number => gunSayisi(b) - gunSayisi(a);
// Başlangıç gününden sonra bugüne kadar (bugün dahil) geçen iş günleri.
export function isGunuFarki(baslangic: string, bugun: string, isGunleri: ReadonlySet<string>): number {
  let n = 0;
  for (const g of isGunleri) if (g > baslangic && g <= bugun) n += 1;
  return n;
}

const ACIK_SIPARIS_ONCESI: readonly TalepDurumu[] = ['taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda'];

export function hatirlatmalar(
  talepler: readonly HatirlatmaTalebi[], ayar: HatirlatmaAyarlari, bugun: string, isGunleri: ReadonlySet<string>,
): HatirlatmaOlayi[] {
  const sonuc: HatirlatmaOlayi[] = [];
  const ekle = (ad: HatirlatmaAdi, t: HatirlatmaTalebi, donem: string, baslik: string, yol: HatirlatmaOlayi['yol'] = '/satin-alma/talepler') => {
    sonuc.push({ tur: `satin-alma.hatirlatma-${ad}`, kaynakKimlik: `${t.talepId}:${donem}`, talepId: t.talepId, baslik: `${t.no}: ${baslik}`, yol });
  };
  const bekledi = (t: HatirlatmaTalebi, n: number | null) => n !== null && isGunuFarki(t.durumGunu, bugun, isGunleri) >= n;
  for (const t of talepler) {
    const n = ayar['ihtiyac-yaklasiyor'];
    if (n !== null && ACIK_SIPARIS_ONCESI.includes(t.durum) && t.ihtiyacTarihi !== null) {
      const kalan = gunFarki(bugun, t.ihtiyacTarihi);
      if (kalan <= n) ekle('ihtiyac-yaklasiyor', t, t.ihtiyacTarihi, kalan < 0 ? `ihtiyaç tarihi ${-kalan} gün geçti, sipariş yok` : `ihtiyaç tarihine ${kalan} gün kaldı, sipariş yok`);
    }
    if (t.durum === 'taslak' && !t.teklifIstegiVar && bekledi(t, ayar['taslak-bekliyor'])) ekle('taslak-bekliyor', t, t.durumAni, 'taslakta bekliyor, teklif istenmedi');
    if (t.durum === 'teklif_isteniyor' || t.durum === 'degerlendirme') {
      const ni = ayar['teklif-cevapsiz'];
      if (ni !== null) {
        for (const r of t.istekler) {
          if (!r.teklifVar && isGunuFarki(r.gonderim, bugun, isGunleri) >= ni) ekle('teklif-cevapsiz', t, `${r.firmaId}:${r.gonderim}`, `${r.tedarikci} teklif vermedi`);
        }
      }
      const ng = ayar['teklif-gecerlilik'];
      if (ng !== null && !t.kararVar) {
        for (const q of t.teklifler) {
          if (q.gecerlilik === null) continue;
          const kalan = gunFarki(bugun, q.gecerlilik);
          if (kalan <= ng) ekle('teklif-gecerlilik', t, `${q.teklifId}:${q.gecerlilik}`, kalan < 0 ? `${q.tedarikci} teklifinin geçerliliği bitti, karar yok` : `${q.tedarikci} teklifinin geçerliliğine ${kalan} gün kaldı, karar yok`);
        }
      }
    }
    if (t.durum === 'degerlendirme' && bekledi(t, ayar['degerlendirme-bekliyor'])) ekle('degerlendirme-bekliyor', t, t.durumAni, 'değerlendirmede bekliyor');
    if (t.durum === 'onayda' && !t.kararOnayli && bekledi(t, ayar['onay-bekliyor'])) ekle('onay-bekliyor', t, t.durumAni, 'onay bekliyor', '/satin-alma/onaylar');
    const ns = ayar['siparis-bekliyor'];
    if (ns !== null && t.durum === 'onayda' && t.kararOnayli && t.sonOnay !== null) {
      const kilitKalan = t.kurKilidiBitisi === null ? null : gunFarki(bugun, t.kurKilidiBitisi);
      if (gunFarki(t.sonOnay.gun, bugun) >= ns || (kilitKalan !== null && kilitKalan <= KUR_KILIDI_UYARI_GUNU)) {
        ekle('siparis-bekliyor', t, t.sonOnay.id, kilitKalan !== null && kilitKalan <= KUR_KILIDI_UYARI_GUNU
          ? `onaylandı, sipariş verilmedi; kur kilidi ${kilitKalan < 0 ? 'bitti' : `${kilitKalan} gün sonra bitiyor`}` : 'onaylandı, sipariş verilmedi');
      }
    }
    if (t.durum !== 'siparis_verildi') continue;
    for (const p of t.siparisler) {
      if (p.beklenenTeslim === null) continue;
      const kalan = gunFarki(bugun, p.beklenenTeslim);
      const ad = p.siparisNo ?? 'sipariş';
      const donem = `${p.teklifId}:${p.beklenenTeslim}`;
      const ny = ayar['teslim-yaklasiyor'];
      if (ny !== null && kalan >= 0 && kalan <= ny) ekle('teslim-yaklasiyor', t, donem, kalan === 0 ? `${ad} bugün teslim bekleniyor` : `${ad} teslimine ${kalan} gün kaldı`);
      // 0 gecikmenin ilk günüdür: gecikme en az bir gündür.
      const gecikme = -kalan;
      for (const adi of ['teslim-gecikti', 'teslim-gecikti-yonetici'] as const) {
        const ng = ayar[adi];
        if (ng !== null && gecikme > 0 && gecikme >= ng) ekle(adi, t, donem, `${ad} teslimi ${gecikme} gün gecikti`);
      }
    }
  }
  return sonuc;
}

export const hatirlatmaAnahtari = (o: Pick<HatirlatmaOlayi, 'tur' | 'kaynakKimlik'>): string => `${o.tur}:${o.kaynakKimlik}`;

// Açılacaklar: istenen ama tabloda hiç olmayanlar (kapanmış anahtar yeniden açılmaz). Kapanacaklar: açık ama artık istenmeyenler.
export function hatirlatmaFarki(
  istenen: readonly HatirlatmaOlayi[], kayitli: ReadonlySet<string>, acik: readonly { anahtar: string; tur: string }[],
): { acilacak: HatirlatmaOlayi[]; kapanacak: { anahtar: string; tur: string; kaynakKimlik: string }[] } {
  const istenenler = new Map(istenen.map((o) => [hatirlatmaAnahtari(o), o]));
  return {
    acilacak: [...istenenler].filter(([a]) => !kayitli.has(a)).map(([, o]) => o),
    kapanacak: acik.filter((r) => !istenenler.has(r.anahtar)).map((r) => ({ ...r, kaynakKimlik: r.anahtar.slice(r.tur.length + 1) })),
  };
}

// 2432 V1 geçici karşılığı (2452 vardiya takvimi gelene kadar): Pazartesi-Cuma, resmî tatiller hariç.
export function haftaIciGunleri(baslangic: string, bitis: string, tatiller: ReadonlySet<string>): Set<string> {
  const gunler = new Set<string>();
  for (let g = gunSayisi(baslangic); g <= gunSayisi(bitis); g += 1) {
    const d = new Date(g * GUN_MS);
    const gun = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !tatiller.has(gun)) gunler.add(gun);
  }
  return gunler;
}

// 2414 a, V2 a: birleştirilecek talep taslak ya da teklif isteniyor durumundadır; teklifi, teklif isteği, kararı yoktur, başka birleşmede
// değildir, kendisi birleşik talep değildir ve kalemi vardır. Teklif satırı ve karar kalemi kalem anahtarına bağlı olduğu için taşınamaz.
export function birlestirmeReddi(t: Pick<Talep, 'no' | 'durum' | 'teklifler' | 'teklifIstekleri' | 'karar' | 'kalemler' | 'birlesme' | 'kaynaklar'>): string | null {
  if (t.birlesme != null) return ILETILER.birlesmis(t.birlesme.no);
  if ((t.kaynaklar ?? []).length > 0) return `${t.no} birleşik talep; birleşik talep yeniden birleştirilmez.`;
  if (t.durum !== 'taslak' && t.durum !== 'teklif_isteniyor') return `${t.no} taslak ya da teklif isteniyor durumunda değil; birleştirilemez.`;
  if (t.teklifler.length > 0 || t.teklifIstekleri.length > 0 || t.karar !== null) return `${t.no} talebinin teklifi ya da kararı var; birleştirilemez.`;
  if (t.kalemler.length === 0) return `${t.no} talebinin kalemi yok; birleştirilemez.`;
  return null;
}
export const BIRLESIK_KALEM_SINIRI = 200;

// 2414 a madde 4: birleşik talebin alanları kaynaklardan türetilir. İhtiyaç tarihi en erken, öncelik en yüksek olandır; birim boştur
// (V4 a: harcama kalemin kaynak birimine yazılır). Üretim emri yalnız bütün kaynaklar aynı emre bağlıysa taşınır.
// 2611 a (Veri 2): kaynaklar aynı projeye bağlıdır (hepsi projesiz de olabilir); birleşik talep ortak projeyi taşır.
export function birlesmeProjesiReddi(kaynaklar: readonly Partial<Pick<Talep, 'proje'>>[]): string | null {
  return new Set(kaynaklar.map((t) => t.proje?.id ?? null)).size > 1 ? ILETILER.birlesmeProjesi : null;
}
export function birlesikTalep(id: string, kaynaklar: readonly (Pick<Talep, 'no' | 'ihtiyacTarihi' | 'oncelik' | 'uretimEmriId'> & Partial<Pick<Talep, 'proje'>>)[]): TalepYazimi {
  const tarihler = kaynaklar.flatMap((t) => (t.ihtiyacTarihi === null ? [] : [t.ihtiyacTarihi])).sort();
  const oncelik = ONCELIKLER[Math.max(...kaynaklar.map((t) => ONCELIKLER.indexOf(t.oncelik)))]!;
  const emirler = new Set(kaynaklar.map((t) => t.uretimEmriId));
  const baslik = `Birleşik talep: ${kaynaklar.map((t) => t.no).join(', ')}`;
  return {
    id, baslik: baslik.length > 160 ? `${baslik.slice(0, 159)}…` : baslik, birim: null, talepEdenKisiId: null, oncelik,
    ihtiyacTarihi: tarihler[0] ?? null, notlar: '', durum: 'taslak', iptalNedeni: '',
    uretimEmriId: emirler.size === 1 ? [...emirler][0]! : null, projeId: kaynaklar[0]?.proje?.id ?? null, agirliklar: null,
    kalemler: [], teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [],
  };
}

// Ayırma yalnız birleşik talepte ve teklif ve karar yokken (V2 a); verilen her talep bu birleşmenin kaynağıdır.
export function ayirmaReddi(t: Pick<Talep, 'kaynaklar' | 'teklifler' | 'karar'>, talepIdleri: readonly string[] | undefined): string | null {
  const kaynaklar = new Set((t.kaynaklar ?? []).map((x) => x.talepId));
  if (kaynaklar.size === 0) return ILETILER.birlesikDegil;
  if (t.teklifler.length > 0 || t.karar !== null) return ILETILER.ayirmaTeklifli;
  if ((talepIdleri ?? []).some((id) => !kaynaklar.has(id))) return ILETILER.kaynakDegil;
  return null;
}

// Birleşik talepte kaynaktan gelen kalem genel kayıtla silinmez; ayırmayla kaynağına döner.
export function kaynakKalemiReddi(eski: Pick<Talep, 'kaynaklar'>, yeniKalemler: readonly { id: string }[]): string | null {
  const kalan = new Set(yeniKalemler.map((k) => k.id));
  return (eski.kaynaklar ?? []).some((x) => x.kalemIdleri.some((id) => !kalan.has(id))) ? ILETILER.kaynakKalemiSilinmez : null;
}

// 2611 a: proje yalnız emre bağlı olmayan talepte seçilir; yeni seçilen proje aktiftir (değişmeyen eski proje durumu değişse de kalır).
export function projeReddi(t: Pick<TalepYazimi, 'projeId' | 'uretimEmriId'>, eskiProjeId: number | null, projeAktif: boolean): string | null {
  if (t.projeId == null) return null;
  if (t.uretimEmriId !== null) return ILETILER.projeEmirli;
  if (t.projeId !== eskiProjeId && !projeAktif) return ILETILER.projeAktifDegil;
  return null;
}
export const projeHareketi = (eski: string | null, yeni: string | null): string => `Proje: ${eski ?? 'yok'} -> ${yeni ?? 'yok'}`;
export const emirHareketi = (eski: string | null, yeni: string | null): string => `Üretim emri: ${eski ?? 'yok'} -> ${yeni ?? 'yok'}`;

// 2637 a, 2638, 2611 a: sipariş satırının maliyet yolu; her satır tek yoldadır, hiçbiri iki kez sayılmaz ya da kaybolmaz. Sıra:
// fason (iş emrine, isEmriFasonTutarlari), stok (stoğa girer, sarfla emre), emir (kalemin emri, 2624 KALEM_EMRI; Maliyet C1: yalnız
// emrin projesi varsa), proje (talebin projesi), genel gider (kalan hizmet ve kartsız satır). Kartı bulunamayan satırın yolu bilinmiyor:
// stok varsayılmaz (Maliyet, Mimar N2).
export type SatirYolu = 'fason' | 'bilinmiyor' | 'stok' | 'emir' | 'proje' | 'genel_gider';
export interface YolGirdisi { fason: boolean; kartTuru: string | null; kartBulunamadi?: boolean; emirId: number | null; emirProjeli: boolean; projeId: number | null }
export function satirYolu(r: YolGirdisi): SatirYolu {
  if (r.fason) return 'fason';
  if (r.kartBulunamadi === true) return 'bilinmiyor';
  if (r.kartTuru !== null && r.kartTuru !== 'hizmet') return 'stok';
  if (r.emirId !== null && r.emirProjeli) return 'emir';
  if (r.projeId !== null) return 'proje';
  return 'genel_gider';
}

// Bir siparişin dağılımı. Emir ve proje yolunda değer gerçekleşen değerdir: hizmet teslim oranıyla (gerceklesenPay), kartsız satır teslim
// kaydı olamadığı için sipariş tutarıyla (2611 varsayım 7). Masraf satırın sipariş malı payı kadardır ve o hedefte değer varsa girer
// (2611 N2). Genel gider oranı (genelGiderOrani) Finans'ın belge tutarıyla çarptığı orandır. Mal 0 ise oran tanımsızdır: null (Veri 1); yolu
// bilinmeyen satır varsa oran bilinemez: null. Stok yolunun masraf payı hiçbir hedefe verilmez (Maliyet N4, ayrı iş).
export interface DagilimSatiri extends YolGirdisi { mal: number; miktar: number; teslim: number }
export interface SiparisDagilimi { hedefler: { yol: 'emir' | 'proje'; hedefId: number; deger: number }[]; genelGiderOrani: number | null }
export function siparisDagilimi(satirlar: readonly DagilimSatiri[], masraf: number): SiparisDagilimi {
  const teslimVar = satirlar.some((x) => x.teslim > 0);
  const tumMal = satirlar.reduce((t, x) => t + x.mal, 0);
  const hedefler = new Map<string, { yol: 'emir' | 'proje'; hedefId: number; deger: number; pay: number }>();
  for (const x of satirlar) {
    const yol = satirYolu(x);
    if (yol !== 'emir' && yol !== 'proje') continue;
    const hedefId = yol === 'emir' ? x.emirId! : x.projeId!;
    const a = `${yol}/${hedefId}`;
    const h = hedefler.get(a) ?? { yol, hedefId, deger: 0, pay: 0 };
    h.deger += x.kartTuru === null ? x.mal : gerceklesenPay(x.mal, 0, x.miktar > 0 ? x.teslim / x.miktar : 0, teslimVar);
    h.pay += tumMal > 0 ? masraf * x.mal / tumMal : 0;
    hedefler.set(a, h);
  }
  return {
    hedefler: [...hedefler.values()].filter((h) => h.deger > 0).map((h) => ({ yol: h.yol, hedefId: h.hedefId, deger: h.deger + h.pay })),
    genelGiderOrani: genelGiderOrani(satirlar, masraf, new Set()),
  };
}

// 2637 a, 2600 3/3 b: siparişin (ya da belgede eşlenmemiş kısmının, 2642 b Maliyet C1) genel gidere giren oranı. Finans oranı belge
// tutarıyla (mal + masraf varsayılır) çarpar. Pay: eşlenmemiş genel yol malı + masrafın genel ve fason yolundaki mal payı; fason malın
// kendisi emre gider (isEmriFasonTutarlari), masrafı emre yazılmadığı için genel gidere girer. Payda: eşlenmemiş mal + masraf. Masraf
// payı siparişin bütün malına oranlanır. Bütün malı 0, yolu bilinmeyen satırı olan ya da paydası 0 olan sipariş: null.
export function genelGiderOrani(satirlar: readonly DagilimSatiri[], masraf: number, eslenen: ReadonlySet<number>): number | null {
  const yollar = satirlar.map(satirYolu);
  const tumMal = satirlar.reduce((t, x) => t + x.mal, 0);
  if (tumMal <= 0 || yollar.includes('bilinmiyor')) return null;
  const masrafli = satirlar.reduce((t, x, i) => t + (yollar[i] === 'genel_gider' || yollar[i] === 'fason' ? x.mal : 0), 0);
  const kalan = satirlar.filter((_, i) => !eslenen.has(i));
  const kalanMal = kalan.reduce((t, x) => t + x.mal, 0);
  const kalanGenel = satirlar.reduce((t, x, i) => t + (!eslenen.has(i) && yollar[i] === 'genel_gider' ? x.mal : 0), 0);
  const payda = kalanMal + masraf;
  if (payda <= 0) return null;
  return Math.round((kalanGenel + masraf * masrafli / tumMal) / payda * 1e6) / 1e6;
}

// 2642 b, 2646 a: belgenin genel gidere giren oranı. B belgenin KDV hariç tutarı, E sayılan eşlemelerin toplamı, G genel gider yolundaki
// eşlenen tutar, S siparişin eşlenmemiş kısmının oranı (genelGiderOrani, eşlenen satırlar dışarıda; Maliyet C1: kalan çoğunlukla masraftır,
// siparişin bütün oranıyla çarpılırsa fason masrafı kaybolur). Eşleme belgenin güncel siparişinde değilse (yol null, bayat) sayılmaz (Veri 1).
// Sayılan eşleme yoksa S; varsa (G + (B - E) x S) / B. E > B, yolu bilinmeyen eşlenmiş satır ya da kalan varken S null ise oran null.
// Tutarlar kuruşla toplanır (iki ondalık), kayan nokta birikmez.
export type EslemeDurumu = 'yok' | 'kismi' | 'tam';
export interface BelgeOranGirdisi { belgeTutari: string; kalanOrani: number | null; eslemeler: readonly { tutar: string; yol: SatirYolu | null }[] }
export function belgeGenelGiderOrani(g: BelgeOranGirdisi): { oran: number | null; esleme: EslemeDurumu } {
  const kurus = (x: string): number => Math.round(Number(x) * 100);
  const sayilan = g.eslemeler.filter((x) => x.yol !== null);
  if (sayilan.length === 0) return { oran: g.kalanOrani, esleme: 'yok' };
  const b = kurus(g.belgeTutari);
  const e = sayilan.reduce((t, x) => t + kurus(x.tutar), 0);
  const kalan = b - e;
  const esleme: EslemeDurumu = kalan > 0 ? 'kismi' : 'tam';
  if (b <= 0 || kalan < 0 || sayilan.some((x) => x.yol === 'bilinmiyor') || (kalan > 0 && g.kalanOrani === null)) return { oran: null, esleme };
  const genel = sayilan.filter((x) => x.yol === 'genel_gider').reduce((t, x) => t + kurus(x.tutar), 0);
  return { oran: Math.round((genel + kalan * (g.kalanOrani ?? 0)) / b * 1e6) / 1e6, esleme };
}

// 2642 b: eşleme sürümü; kayıt silinmez, kaldırma bir kez yazılır, bu yüzden yalnız artar (Mimar notu).
export const eslemeSurumu = (l: readonly { kaldirilma: string | null }[]): number => l.length + l.filter((x) => x.kaldirilma !== null).length;

// 2642 b: kaydedilecek tam listenin denetimi (sunucu). Satır belgenin siparişinde olmalı, tekrar etmemeli, tutar pozitif ve iki ondalık;
// toplam belge tutarını aşamaz. Hata iletisi ya da null.
export function eslemeListesiHatasi(liste: readonly { siparisSatiriId: number; tutar: string }[], siparisSatirlari: ReadonlySet<number>, belgeTutari: string): string | null {
  if (new Set(liste.map((x) => x.siparisSatiriId)).size !== liste.length) return ILETILER.eslemeTekrar;
  if (liste.some((x) => !siparisSatirlari.has(x.siparisSatiriId))) return ILETILER.eslemeBaskaSiparis;
  if (liste.some((x) => !/^\d+(\.\d{1,2})?$/.test(x.tutar) || Number(x.tutar) <= 0)) return ILETILER.eslemeTutar;
  const toplam = liste.reduce((t, x) => t + Math.round(Number(x.tutar) * 100), 0);
  return toplam > Math.round(Number(belgeTutari) * 100) ? ILETILER.eslemeAsim : null;
}
