import { createHash } from 'node:crypto';
import { islemMi } from '#paylasilan/islemler.ts';
import type { CihazProfili, Kullanici } from '#paylasilan/kullanici.ts';

export const CEREZ_ADI = 'tmiv2_oturum';
// Ortak cihaz belirteci (kart #739): oturumdan ayrı çerezdir, çıkışta silinmez; cihaz iptal edilene dek kalır. Tarayıcılar çerez
// ömrünü 400 günle sınırlar; bir yıl yeter, cihaz her bağlantıda tazelenir.
export const CIHAZ_CEREZI = 'tmiv2_cihaz';
export const CIHAZ_CEREZ_SN = 365 * 24 * 60 * 60;

// 2226-3 (kullanıcı 07.11): boşta 8 saat bir vardiyayı kesmez; en çok 7 gün, paylaşılan bilgisayarda açık kalan oturum haftayı geçmesin.
export const BOSTA_SN = 8 * 60 * 60;
export const AZAMI_SN = 7 * 24 * 60 * 60;
// Her istekte yazmamak için son görülme en sık bu aralıkla güncellenir.
export const GORULME_ARALIGI_SN = 60;

export const BEKLEME_AZAMI_SN = 60;
// 1373 a: geriye dönük "kim ne zaman girdi" sorusu bir yıl cevaplanır. Veritabanı koruması 30 günden genç satırın
// silinmesini ayrıca reddeder; bu süre ondan uzun olmalıdır.
export const DENEME_SAKLAMA_GUN = 365;
// 398 a: oturumdaki adres ve tarayıcı kişisel veridir; oturum kapandıktan bu kadar gün sonra boşaltılır, satır kalır.
export const CIHAZ_SAKLAMA_GUN = 30;

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

// Bekleme sırasında doğru sır da reddedilir; ileti bunu söyler, yoksa kişi doğru parolasının yanlış sayıldığını sanır.
export function beklemeIletisi(kalanSn: number): string {
  return `Çok sık deneme: hatalı denemeden sonra kısa bekleme kilidi var. ${kalanSn} sn sonra yeniden deneyin; bu sürede doğru PIN ya da parola da kabul edilmez.`;
}

// Yeni parola eskisiyle aynıysa değişim bir şey değiştirmez ama öbür oturumları kapatır ve "değişti" sanılır. İki değer de
// istekte gelir: karşılaştırma sırra bakmaz, deneme sayılmaz.
export const AYNI_PAROLA = 'Yeni parola eskisiyle aynı olamaz.';
export const ayniParolaMi = (eski: string, yeni: string): boolean => eski !== '' && eski === yeni;

// Ada bütün cihazlardan, son başarılı denemeden ve son kilidin başından beri gelen hatalı deneme sayısı eşiğe varınca
// ad kilitlenir (kullanıcı kararı, 14.10.2026). Cihaz başına bekleme dağıtık denemeyi yavaşlatmaz; kilit durdurur.
export const HESAP_KILIDI_ESIGI = 10;
export const HESAP_KILIDI_DK = 15;

export function hesapKilitlenirMi(ardArdaHatali: number): boolean {
  return ardArdaHatali >= HESAP_KILIDI_ESIGI;
}

// 2226-2 a: kilit büyür. Son 24 saatte aynı ada kurulmuş önceki kilit yoksa 15 dk, biri varsa 60 dk, iki ve fazlası varsa yönetici
// açana kadar. Parolayla giren hesapta büyümez: tek tam yetkili hesap kilitlenip sistem yöneticisiz kalmasın. Var olmayan ad PIN'li
// gibi büyür: büyüme hesabın varlığını ele vermesin. '#' ile başlayan makine adları (kart, saat) büyümez.
export const BUYUYEN_KILIT_PENCERESI_SAAT = 24;
export const IKINCI_KILIT_DK = 60;
// Tablo bitiş ister; on yıl "yönetici açana kadar" demektir (kalan saniye int sığmalı: yüz yıl taşar).
export const SURESIZ_KILIT_DK = 10 * 365 * 24 * 60;
const SURESIZ_SAYILAN_SN = 7 * 24 * 60 * 60;

export function kilitBuyurMu(ad: string, parolaHesabi: boolean): boolean {
  return !parolaHesabi && !ad.startsWith('#');
}

export function hesapKilidiSuresiDk(buyur: boolean, oncekiKilit: number): number {
  if (!buyur || oncekiKilit <= 0) return HESAP_KILIDI_DK;
  return oncekiKilit === 1 ? IKINCI_KILIT_DK : SURESIZ_KILIT_DK;
}

export const SURESIZ_KILIT_ILETISI = 'Çok sayıda hatalı deneme. Hesap kilitlendi; açılması için yöneticinize başvurun.';

export function hesapKilidiIletisi(kalanSn: number): string {
  if (kalanSn > SURESIZ_SAYILAN_SN) return SURESIZ_KILIT_ILETISI;
  return `Çok sayıda hatalı deneme. Giriş ${kilitKalanDk(kalanSn)} dk sonra yeniden denenebilir.`;
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

// 386 a: oturum girişteki tarayıcıyla saklanır. Başlık istemcinin elindedir: uzunluğu sınırlanır, boşu bilinmeyen sayılır.
export const TARAYICI_AZAMI = 300;
export function tarayiciMetni(baslik: string | null): string | null {
  const metin = (baslik ?? '').trim().slice(0, TARAYICI_AZAMI).trim();
  return metin === '' ? null : metin;
}

// Hesabım'daki açık oturum satırı için kısa ad: tam tarayıcı metni gösterilmez. Sıra önemlidir (Edge ve Opera "Chrome" da yazar,
// Android "Linux" da yazar).
export function tarayiciOzeti(baslik: string | null): string | null {
  if (baslik === null || baslik.trim() === '') return null;
  const tarayici = /Edg\//.test(baslik) ? 'Edge'
    : /OPR\//.test(baslik) ? 'Opera'
      : /Firefox\//.test(baslik) ? 'Firefox'
        : /Chrome\//.test(baslik) ? 'Chrome'
          : /Safari\//.test(baslik) ? 'Safari'
            : 'Diğer tarayıcı';
  const sistem = /Windows/.test(baslik) ? 'Windows'
    : /Android/.test(baslik) ? 'Android'
      : /iPhone|iPad/.test(baslik) ? 'iOS'
        : /Mac OS X|Macintosh/.test(baslik) ? 'macOS'
          : /Linux/.test(baslik) ? 'Linux'
            : null;
  return sistem === null ? tarayici : `${tarayici} · ${sistem}`;
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

// Kart girişi (kart #1326): kayıtsız kart ya da giriş hesabı olmayan kişinin kartı cihazın bu adına hatalı deneme sayılır; cihaz
// sınırı yine bütün adları birlikte sayar. Kayıtlı kartın denemesi kişinin kendi adına sayılır: kart ve kullanıcı adı yolu tek sayaçtır.
export function kartGirisAdi(ip: string): string {
  return `#kart-${ip}`;
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
// durdurmak; kart #86, 79 a: uyarıyı üstlenmek; yetkisi uçtaki işlemdir). Yol, istekteki ham adres değil ucun kayıtlı kalıbıdır; sorgu dizgisi ya da ../ ile
// başka uca kayamaz.
const SAAT_YOL_ONEKI = '/api/saat/';
const SAAT_YAZMA_KALIPLARI: ReadonlySet<string> = new Set(['/api/saat/emirler/:id/durdur', '/api/saat/uyarilar/ustlen']);

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

/* ---------------- cihaz profili (kart #1358) ---------------- */

// 2226-3 (kullanıcı 07.11 17:21Z; 1356 a'nın 15 dk'sının yerine): istasyondaki oturum kişinin vardiyası bitince devir payıyla düşer;
// operatör vardiya içinde yeniden girmez. Sıradaki kişi kart okutunca oturum ona geçer (1898 a). Vardiyası bulunamayan kişide kişisel
// cihazın boşta süresi geçer. Vardiyadan bir saat önce açılan oturum o vardiyanındır (erken gelen operatör).
export const ISTASYON_BOSTA_SN = BOSTA_SN;
export const VARDIYA_DEVIR_PAYI_SN = 30 * 60;
export const VARDIYA_ONCESI_GIRIS_SN = 60 * 60;

export interface VardiyaAraligi { baslangicMs: number; bitisMs: number }

// Oturumun açıldığı vardiyanın sonu + devir payı; açılış hiçbir vardiyaya düşmüyorsa null (vardiya sınırı yok).
export function istasyonOturumSonuMs(acilisMs: number, vardiyalar: readonly VardiyaAraligi[]): number | null {
  const v = vardiyalar.find((a) => a.baslangicMs - VARDIYA_ONCESI_GIRIS_SN * 1000 <= acilisMs && acilisMs < a.bitisMs);
  return v === undefined ? null : v.bitisMs + VARDIYA_DEVIR_PAYI_SN * 1000;
}

// Veritabanının timestamptz metni ("2026-11-07 17:22:32.123+00" ya da "+03:30") ISO'ya çevrilip okunur; okunamazsa NaN.
export function vtZamaniMs(metin: string): number {
  return Date.parse(metin.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
}

export interface ProfilSiniri {
  kod: CihazProfili;
  // null: sınır yok (Tam).
  sayfalar: readonly string[] | null;
}

// 1347 a: yetki rol ile profilin kesişimidir, yönetici dahil. Profil yalnız sayfa işlemlerini süzer: menü ve sayfa yetkili uçlar
// birlikte daralır. Veri işlemleri ve modül sınırı çekirdekteki kapıdadır.
export function profilUygula(kullanici: Kullanici, profil: ProfilSiniri): Kullanici {
  const { sayfalar } = profil;
  const islemler = sayfalar === null
    ? kullanici.islemler
    : kullanici.islemler.filter((islem) => !islem.startsWith('sayfa.') || sayfalar.includes(islem));
  return { ...kullanici, islemler, cihazProfili: profil.kod };
}

export function bostaSuresiSn(profil: CihazProfili): number {
  return profil === 'istasyon' ? ISTASYON_BOSTA_SN : BOSTA_SN;
}

/* ---------------- sınırlı hesap (kart 2158, 2158-5 a) ---------------- */

// Sınırlı hesabın oturumu kısadır: 30 dk boşta, en çok 8 saat. Kayıtlı (ortak) cihazda hiç açılmaz: dış kişinin oturumu kurumun
// paylaşılan ekranında kalmasın. Bitiş günü kişiler modülünde denetlenir (kullanıcı yüklenmez).
export const SINIRLI_BOSTA_SN = 30 * 60;
export const SINIRLI_AZAMI_SN = 8 * 60 * 60;
export const SINIRLI_ORTAK_CIHAZ = 'Sınırlı hesap kurumun ortak cihazında açılmaz; kendi cihazınızdan girin.';

export function sinirliOturumGecerMi(girdi: { bostaGecenSn: number; acikGecenSn: number; kayitliCihaz: boolean }): boolean {
  return !girdi.kayitliCihaz && girdi.bostaGecenSn < SINIRLI_BOSTA_SN && girdi.acikGecenSn < SINIRLI_AZAMI_SN;
}

// Çerez ömrü: sınırlı hesapta oturumun azami süresiyle aynı.
export const oturumCerezSn = (kullanici: Kullanici): number => (kullanici.sinirli === undefined ? AZAMI_SN : SINIRLI_AZAMI_SN);

// Profil, atama ve kayıtsız cihaz ayarı yalnız Tam profilli cihazdan değişir: telefondan giren yönetici kendi cihazını genişletemez.
// Profili olmayan kimlik (akıllı saat) de değiştiremez.
export function profilYonetebilirMi(kullanici: Kullanici): boolean {
  return kullanici.cihazProfili === 'tam';
}

// Profile yazılabilen sayfalar: kayıtlı sayfa işlemleri. Tekrar yazılmaz, sıra korunur.
export function profilSayfalariHatasi(sayfalar: readonly string[]): string | null {
  for (const sayfa of sayfalar) {
    if (!sayfa.startsWith('sayfa.') || !islemMi(sayfa)) return `Bilinmeyen sayfa: ${sayfa}`;
  }
  return new Set(sayfalar).size === sayfalar.length ? null : 'Aynı sayfa iki kez seçilmiş.';
}

// Cihaz nabzı (kart 1666, 1621 a): oturumlu istemci beş dakikada bir bildirir. Üç nabız kaçıran cihaz sessizdir.
export const NABIZ_ARALIGI_SN = 5 * 60;
// Bundan sık gelen nabız yazılmaz: sekme çoğalsa ya da istemci bozulsa da satır ve sayaç şişmez.
export const NABIZ_EN_SIK_SN = 60;
export const SESSIZ_ESIK_SN = 3 * NABIZ_ARALIGI_SN;
// Bu kadar kayıt gönderilmeden bekleyen cihaz "kuyruğu biriken" sayılır (VARSAYIM; kullanımda ayarlanır).
export const KUYRUK_BIRIKME_ESIGI = 20;
// 1619 a: cihaz nabzı 30 gün saklanır.
export const NABIZ_SAKLAMA_GUN = 30;
// Son eşitleme istemci saatiyle değil, "kaç saniye önce" diye gelir; zaman sunucuda hesaplanır. Saklama süresinden eskisi bilinmez sayılır.
export const NABIZ_ESITLEME_AZAMI_SN = NABIZ_SAKLAMA_GUN * 24 * 60 * 60;

export type NabizDurumu = 'sessiz' | 'kuyruk' | 'iyi';

// Sessizlik kuyruktan önce gelir: sessiz cihazın son bildirdiği kuyruk bayattır.
export function nabizDurumu(sonNabizdanBeriSn: number, kuyruk: number | null): NabizDurumu {
  if (sonNabizdanBeriSn >= SESSIZ_ESIK_SN) return 'sessiz';
  if (kuyruk !== null && kuyruk >= KUYRUK_BIRIKME_ESIGI) return 'kuyruk';
  return 'iyi';
}

// Saklama süresinden eski eşitleme bilinmez sayılır; negatif değer şemada reddedilir.
export function esitlemeSuresi(sn: number | null): number | null {
  return sn === null || sn > NABIZ_ESITLEME_AZAMI_SN ? null : sn;
}
