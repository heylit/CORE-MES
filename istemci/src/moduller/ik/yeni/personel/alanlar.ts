import type { IkSabitleri } from '../motor.ts';
import type { Departman, Personel } from '../tipler.ts';

// Personel ve departman formlarının alanları (bugünkü uygulamanın SCHEMA.emp ve SCHEMA.dept'i): sıra, bölüm, etiket ve ipucu aynıdır.
// Sabit listeler (yaka, kademe, çıkış kodu, yemek ve yol yöntemi) motorun sabitlerindedir.

export type AlanTuru =
  | 'metin' | 'tarih' | 'sayi' | 'para' | 'secim' | 'cok' | 'isaret' | 'personel' | 'departman' | 'ismerkezi' | 'tmikisi'
  | 'tckn' | 'iban' | 'eposta' | 'tel' | 'tesvik' | 'primler';

export type PersonelBolumu = 'Kimlik' | 'İletişim' | 'İş' | 'Ücret' | 'Ayrılış';
export const YENI_PERSONEL_BOLUMLERI: readonly PersonelBolumu[] = ['Kimlik', 'İletişim', 'İş', 'Ücret'];

type SecenekKaynagi = readonly string[] | ((s: IkSabitleri) => readonly string[]);

export interface FormAlani<K extends string = string> {
  k: K;
  l: string;
  tur?: AlanTuru;
  bolum?: PersonelBolumu;
  secenekler?: SecenekKaynagi;
  zorunlu?: boolean;
  ipucu?: string;
  varsayilan?: string;
  genis?: boolean;
}

const SOZLESME = ['Belirsiz süreli', 'Belirli süreli', 'Kısmi süreli', 'Çağrı üzerine', 'Stajyer'] as const;
const CALISMA = ['Ofis', 'Hibrit', 'Uzaktan', 'Saha', 'Vardiyalı'] as const;
const EGITIM = ['İlköğretim', 'Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans', 'Doktora'] as const;
export const CINSIYET = ['Kadın', 'Erkek', 'Belirtilmemiş'] as const;
export const PERSONEL_SECENEKLERI = { cinsiyet: CINSIYET, sozlesmeTuru: SOZLESME, calismaSekli: CALISMA, egitim: EGITIM } as const;

export const PERSONEL_ALANLARI: readonly FormAlani<keyof Personel & string>[] = [
  { bolum: 'Kimlik', k: 'ad', l: 'Ad', zorunlu: true },
  { bolum: 'Kimlik', k: 'soyad', l: 'Soyad', zorunlu: true },
  { bolum: 'Kimlik', k: 'tckn', l: 'T.C. kimlik no', tur: 'tckn' },
  { bolum: 'Kimlik', k: 'dogumTarihi', l: 'Doğum tarihi', tur: 'tarih' },
  { bolum: 'Kimlik', k: 'dogumYeri', l: 'Doğum yeri' },
  { bolum: 'Kimlik', k: 'cinsiyet', l: 'Cinsiyet', tur: 'secim', secenekler: CINSIYET },
  { bolum: 'Kimlik', k: 'medeniDurum', l: 'Medeni durum', tur: 'secim', secenekler: ['Bekâr', 'Evli', 'Boşanmış', 'Dul'] },
  { bolum: 'Kimlik', k: 'cocukSayisi', l: 'Çocuk sayısı', tur: 'sayi' },
  { bolum: 'Kimlik', k: 'kanGrubu', l: 'Kan grubu', tur: 'secim', secenekler: ['A Rh+', 'A Rh-', 'B Rh+', 'B Rh-', 'AB Rh+', 'AB Rh-', '0 Rh+', '0 Rh-'] },
  { bolum: 'Kimlik', k: 'uyruk', l: 'Uyruk', varsayilan: 'T.C.' },
  { bolum: 'Kimlik', k: 'engelDurumu', l: 'Engellilik durumu', tur: 'secim', secenekler: ['Yok', '1. derece (%80 ve üzeri)', '2. derece (%60–79)', '3. derece (%40–59)'], varsayilan: 'Yok' },
  { bolum: 'Kimlik', k: 'askerlik', l: 'Askerlik durumu', tur: 'secim', secenekler: ['Yapıldı', 'Muaf', 'Tecilli', 'Yapılmadı', 'Uygulanmaz'] },
  { bolum: 'Kimlik', k: 'egitim', l: 'Eğitim düzeyi', tur: 'secim', secenekler: EGITIM },
  { bolum: 'Kimlik', k: 'okul', l: 'Okul ve bölüm' },
  { bolum: 'Kimlik', k: 'ehliyet', l: 'Sürücü belgesi sınıfı' },
  { bolum: 'Kimlik', k: 'yabanciDil', l: 'Yabancı diller' },
  { bolum: 'İletişim', k: 'telefon', l: 'Cep telefonu', tur: 'tel' },
  { bolum: 'İletişim', k: 'eposta', l: 'İş e-postası', tur: 'eposta' },
  { bolum: 'İletişim', k: 'kisiselEposta', l: 'Kişisel e-posta', tur: 'eposta' },
  { bolum: 'İletişim', k: 'il', l: 'İl' },
  { bolum: 'İletişim', k: 'ilce', l: 'İlçe' },
  { bolum: 'İletişim', k: 'adres', l: 'Adres', tur: 'cok' },
  { bolum: 'İletişim', k: 'acilKisi', l: 'Acil durumda aranacak kişi' },
  { bolum: 'İletişim', k: 'acilYakinlik', l: 'Yakınlık derecesi' },
  { bolum: 'İletişim', k: 'acilTelefon', l: 'Acil durum telefonu', tur: 'tel' },
  { bolum: 'İş', k: 'isMerkeziId', l: 'İş merkezi', tur: 'ismerkezi', zorunlu: true, ipucu: 'Kaydı yalnız bu iş merkezinde yetkili olanlar görür ve değiştirir.' },
  { bolum: 'İş', k: 'kisiId', l: 'TMI kullanıcısı', tur: 'tmikisi', ipucu: 'Bağlanan kullanıcı kendi izin ve bordrosunu görür; yöneticiyse ekibini.' },
  { bolum: 'İş', k: 'sicilNo', l: 'Sicil no' },
  { bolum: 'İş', k: 'departmanId', l: 'Departman', tur: 'departman' },
  { bolum: 'İş', k: 'pozisyon', l: 'Pozisyon', zorunlu: true },
  { bolum: 'İş', k: 'yakaTipi', l: 'Yaka tipi', tur: 'secim', secenekler: (s) => s.COLLARS, ipucu: 'Boş bırakırsanız pozisyon adından tahmin edilir.' },
  { bolum: 'İş', k: 'kademe', l: 'Rol kademesi', tur: 'secim', secenekler: (s) => s.LEVELS, ipucu: 'Boş bırakırsanız pozisyon adından tahmin edilir.' },
  { bolum: 'İş', k: 'yoneticiId', l: 'Bağlı olduğu yönetici', tur: 'personel' },
  { bolum: 'İş', k: 'iseGiris', l: 'İşe giriş tarihi', tur: 'tarih', zorunlu: true },
  { bolum: 'İş', k: 'denemeBitis', l: 'Deneme süresi bitişi', tur: 'tarih', ipucu: 'Boş bırakırsanız Ayarlar’daki varsayılan deneme süresi (2 ay) uygulanır.' },
  { bolum: 'İş', k: 'sozlesmeTuru', l: 'Sözleşme türü', tur: 'secim', secenekler: SOZLESME, varsayilan: 'Belirsiz süreli' },
  { bolum: 'İş', k: 'sozlesmeBitis', l: 'Sözleşme bitiş tarihi', tur: 'tarih', ipucu: 'Belirli süreli sözleşmeler için' },
  { bolum: 'İş', k: 'calismaSekli', l: 'Çalışma şekli', tur: 'secim', secenekler: CALISMA, varsayilan: 'Ofis' },
  { bolum: 'İş', k: 'lokasyon', l: 'Lokasyon / şube' },
  { bolum: 'İş', k: 'sgkNo', l: 'SGK sicil no' },
  { bolum: 'İş', k: 'durum', l: 'Durum', tur: 'secim', secenekler: ['Aktif', 'Ücretsiz izinde', 'Ayrıldı'], varsayilan: 'Aktif' },
  { bolum: 'Ücret', k: 'brutMaas', l: 'Aylık brüt ücret (₺)', tur: 'para' },
  { bolum: 'Ücret', k: 'yanHakTutar', l: 'Diğer düzenli yan haklar, aylık (₺)', tur: 'para', ipucu: 'Yemek, yol ve kıdeme dahil primler otomatik eklenir; buraya yalnızca bunların dışındaki düzenli ödemeleri (ör. kira yardımı) yazın.' },
  { bolum: 'Ücret', k: 'yemekYontem', l: 'Yemek yardımı', tur: 'secim', secenekler: (s) => ['Genel ayar', ...s.YEMEK_YONTEM], varsayilan: 'Genel ayar' },
  { bolum: 'Ücret', k: 'yemekHesap', l: 'Yemek hesap şekli', tur: 'secim', secenekler: (s) => s.HESAP_OPTS, ipucu: 'Boşsa genel ayar kullanılır.' },
  { bolum: 'Ücret', k: 'yemekDeger', l: 'Yemek tutarı veya oranı', tur: 'sayi', ipucu: 'Günlük ₺, aylık ₺ ya da % olarak; boşsa genel ayar.' },
  { bolum: 'Ücret', k: 'yolYontem', l: 'Yol yardımı', tur: 'secim', secenekler: (s) => ['Genel ayar', ...s.YOL_YONTEM], varsayilan: 'Genel ayar' },
  { bolum: 'Ücret', k: 'yolHesap', l: 'Yol hesap şekli', tur: 'secim', secenekler: (s) => s.HESAP_OPTS, ipucu: 'Boşsa genel ayar kullanılır.' },
  { bolum: 'Ücret', k: 'yolDeger', l: 'Yol tutarı veya oranı', tur: 'sayi', ipucu: 'Boşsa genel ayar.' },
  { bolum: 'Ücret', k: 'tesvikId', l: 'SGK teşviki', tur: 'tesvik' },
  { bolum: 'Ücret', k: 'primler', l: 'Prim ve ikramiyeler', tur: 'primler', genis: true },
  { bolum: 'Ücret', k: 'besKatilim', l: 'Otomatik BES kesintisi yapılsın', tur: 'isaret', genis: true, ipucu: '45 yaşını doldurmamış çalışanlar sisteme otomatik dahil edilir; cayma hakkını kullananlarda işareti kaldırın.' },
  { bolum: 'Ücret', k: 'banka', l: 'Banka' },
  { bolum: 'Ücret', k: 'iban', l: 'IBAN', tur: 'iban' },
  { bolum: 'Ücret', k: 'oncekiKullanim', l: 'Sistem öncesi kullanılan yıllık izin (gün)', tur: 'sayi', ipucu: 'İşe girişten bu yana, sisteme kaydetmediğiniz dönemde kullanılan toplam yıllık izin.' },
  { bolum: 'Ücret', k: 'yanHaklar', l: 'Yan haklar açıklaması', tur: 'cok' },
  { bolum: 'Ayrılış', k: 'cikisTarihi', l: 'İşten çıkış tarihi', tur: 'tarih' },
  { bolum: 'Ayrılış', k: 'cikisKodu', l: 'SGK çıkış nedeni', tur: 'secim', secenekler: (s) => s.EXIT_CODES },
  { bolum: 'Ayrılış', k: 'cikisNotu', l: 'Çıkış notu', tur: 'cok' },
];

export const DEPARTMAN_ALANLARI: readonly FormAlani<keyof Departman & string>[] = [
  { k: 'ad', l: 'Departman adı', zorunlu: true },
  { k: 'kod', l: 'Kısa kod' },
  { k: 'giderHesabi', l: 'Muhasebe gider hesabı', ipucu: 'Boşsa Ayarlar’daki genel gider hesabı (ör. 720 direkt işçilik, 760 pazarlama, 770 genel yönetim) kullanılır.' },
  { k: 'yoneticiId', l: 'Departman yöneticisi', tur: 'personel' },
  { k: 'butce', l: 'Yıllık personel bütçesi (₺)', tur: 'para' },
  { k: 'aciklama', l: 'Açıklama', tur: 'cok' },
];

export const bolumAlanlari = (bolumler: readonly PersonelBolumu[]) => PERSONEL_ALANLARI.filter((f) => f.bolum && bolumler.includes(f.bolum));
export const alanEtiketi = (k: string) => PERSONEL_ALANLARI.find((f) => f.k === k)?.l
  ?? ({ belgeler: 'Özlük belgeleri', notlar: 'Notlar', ucretGecmisi: 'Ücret geçmişi', cikisListesi: 'Çıkış kontrol listesi', hareketler: 'Görev geçmişi' } as Record<string, string>)[k]
  ?? k;
