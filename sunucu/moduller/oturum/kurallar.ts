import { createHash } from 'node:crypto';

export const CEREZ_ADI = 'tmiv2_oturum';

export const BOSTA_SN = 12 * 60 * 60;
export const AZAMI_SN = 30 * 24 * 60 * 60;
// Her istekte yazmamak için son görülme en sık bu aralıkla güncellenir.
export const GORULME_ARALIGI_SN = 60;

export const BEKLEME_AZAMI_SN = 60;
export const DENEME_SAKLAMA_GUN = 30;

// ardArdaHatali: aynı kullanıcı adı ve cihazdan, son başarılı girişten beri gelen hatalı deneme sayısı.
// Her hatalı denemede bekleme ikiye katlanır, üst sınırda kalır; hesap kilidi bundan ayrıdır (cihazdan bağımsız sayılır).
export function beklemeSn(ardArdaHatali: number): number {
  if (ardArdaHatali <= 0) return 0;
  return Math.min(BEKLEME_AZAMI_SN, 2 ** (ardArdaHatali - 1));
}

// sonHatalidanBeriSn: son hatalı denemeden beri geçen tam saniye; hatalı deneme yoksa null.
export function kalanBeklemeSn(ardArdaHatali: number, sonHatalidanBeriSn: number | null): number {
  if (sonHatalidanBeriSn === null) return 0;
  return Math.max(0, beklemeSn(ardArdaHatali) - Math.max(0, sonHatalidanBeriSn));
}

// Ada bütün cihazlardan, son başarılı denemeden ve son kilidin başından beri gelen hatalı deneme sayısı eşiğe varınca
// ad kilitlenir (kullanıcı kararı, 14.10.2026). Cihaz başına bekleme dağıtık denemeyi yavaşlatmaz; kilit durdurur.
export const HESAP_KILIDI_ESIGI = 10;
export const HESAP_KILIDI_DK = 15;

export function hesapKilitlenirMi(ardArdaHatali: number): boolean {
  return ardArdaHatali >= HESAP_KILIDI_ESIGI;
}

// Bir cihazdan bütün adlara pencere içinde gelen hatalı deneme sınıra varınca o cihaz, pencerenin en eski denemesi
// düşene kadar giriş yapamaz (kullanıcı kararı, soru 66; sayılar varsayım). Hesap kilidi adı korur; bu, ortak tabletten
// adları sırayla deneyeni durdurur. Başarılı giriş sayacı sıfırlamaz: kendi hesabıyla giren sayacı temizleyemez.
export const CIHAZ_SINIRI = 20;
export const CIHAZ_PENCERESI_DK = 15;

// Kalan süre yukarı yuvarlanır: "0 dk" ya da erken söylenen süre kullanıcıyı boşa denetir.
export function kilitKalanDk(kalanSn: number): number {
  return Math.max(1, Math.ceil(kalanSn / 60));
}

// Giriş denemesi kilidinin anahtarı cihazdır: cihaz sınırı o cihazdan bütün adlara gelen denemeleri sayar, ada göre
// kilitlenseydi farklı adlara eşzamanlı denemeler sayımı birlikte görüp sınırı aşardı. 64 bit, kriptografik özetten:
// hesaplanabilir ya da kısa özetle başka cihaz aynı anahtara düşüp bu cihazın girişini reddettirebilirdi.
export function denemeKilitAnahtari(ip: string): string {
  const ozet = createHash('sha256').update(JSON.stringify(['giris-cihazi', ip])).digest();
  return ozet.readBigInt64BE(0).toString();
}

// Veritabanını okuyan biri oturum çalamasın diye anahtarın yalnız özeti saklanır.
export function anahtarOzeti(anahtar: string): string {
  return createHash('sha256').update(anahtar).digest('hex');
}

// Akıllı saat (kart #1632). Kodu saat gösterir, oturumu açık kişi TMI'da girer. Kodu tahmin eden kimseye bir şey geçmez: onay,
// saati onaylayanın hesabına bağlar; belirteci yalnız isteğin gizli anahtarını tutan saat alır. Bu yüzden oturumsuz uçta kilit
// yoktur (kilit, hesabı olmayan birinin herkesin eşleşmesini kapatmasına yol açardı).
export const SAAT_ISTEGI_SN = 10 * 60;
// Belirteç bir vardiya sürer; sınır göçteki kısıtla da korunur.
export const SAAT_BELIRTECI_SN = 12 * 60 * 60;
// Bekleyen istek sınırı: bir cihaz en çok 3, hepsi en çok 200 açık istek tutar; aşan istek 429 alır (tablo şişmesin).
export const SAAT_ISTEGI_IP_SINIRI = 3;
export const SAAT_ISTEGI_GENEL_SINIR = 200;

// Onay denemesi kişinin kendi adına sayılır: giriş beklemesi ve 10 hatalı denemede 15 dk kilit yalnız o kişinin onayını kapatır.
// Başarılı onay seriyi sıfırlamaz: kişi kendi saat isteğiyle sayacı temizleyip tahmine devam edemesin. Kullanıcı adları
// ^[a-z0-9._-] ile sınırlı olduğu için bu ad gerçek bir adla çakışmaz.
export function saatOnayAdi(kisiId: number): string {
  return `#saat-onay-${kisiId}`;
}

// Bilinmeyen anahtarla soru cihazın kendi adına hatalı deneme sayılır ve denetim kaydına girmez: ağdaki biri rastgele
// anahtarla sınırsız soru sorup yalnız eklenen denetim tablosunu büyütemez. Kilit cihaz başınadır, başka saati durdurmaz.
export function saatSoruAdi(ip: string): string {
  return `#saat-sor-${ip}`;
}

// Bekleyen istek bu aralıktan sık sorulamaz (saat 15 sn'de bir sorar); her soru bir denetim satırıdır, istek başına satır sınırlı kalır.
export const SAAT_SORU_ARALIGI_SN = 10;

export function saatKoduUret(rastgele: (ust: number) => number): string {
  return String(rastgele(1_000_000)).padStart(6, '0');
}

// Belirteç saat okuma uçlarını açar: GET ve /api/saat/ altı. Yazma yalnız adı tek tek sayılan saat uçlarındadır (296 a: emri
// durdurmak; yetkisi uçtaki işlemdir). Yol, istekteki ham adres değil ucun kayıtlı kalıbıdır; sorgu dizgisi ya da ../ ile
// başka uca kayamaz.
const SAAT_YOL_ONEKI = '/api/saat/';
const SAAT_YAZMA_KALIPLARI: ReadonlySet<string> = new Set(['/api/saat/emirler/:id/durdur']);

export function saatBelirteciGecerMi(yontem: string, rotaKalibi: string | undefined): boolean {
  if (rotaKalibi === undefined) return false;
  if (yontem === 'POST') return SAAT_YAZMA_KALIPLARI.has(rotaKalibi);
  return yontem === 'GET' && rotaKalibi.startsWith(SAAT_YOL_ONEKI);
}

// "Authorization: Bearer <belirteç>"; başka biçim yok sayılır.
export function belirtecOku(baslik: string | undefined): string | null {
  if (baslik === undefined) return null;
  const eslesme = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(baslik);
  return eslesme?.[1] ?? null;
}
