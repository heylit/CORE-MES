import type { IkSabitleri } from '../motor.ts';

// P4 formlarının alanları (bugünkü uygulamanın SCHEMA.perf, train, job, cand, intv'si): sıra, bölüm, etiket, ipucu ve varsayılan aynıdır.
// Sabit listeler (eğitim türü, aşama, görüşme türü ve durumu, öneri, ret nedeni) motorun sabitlerindedir.

export type AlanTuru =
  | 'metin' | 'tarih' | 'saat' | 'sayi' | 'para' | 'secim' | 'cok' | 'isaret' | 'eposta' | 'tel'
  | 'personel' | 'personeller' | 'departman' | 'ismerkezi' | 'pozisyon' | 'aday' | 'kanal' | 'puanlar' | 'soruSeti';

type SecenekKaynagi = readonly string[] | ((s: IkSabitleri) => readonly string[]);

export interface FormAlani {
  k: string;
  l: string;
  tur?: AlanTuru;
  bolum?: string;
  secenekler?: SecenekKaynagi;
  zorunlu?: boolean;
  ipucu?: string;
  // '@bugun', '@yil Yıllık' bugünden; öbürleri olduğu gibi.
  varsayilan?: string | number;
  genis?: boolean;
  // Puan alanı: performans kriterleri ya da mülakat kriterleri.
  kriter?: 'performans' | 'mulakat';
}

const EGITIM_SEVIYE = ['İlköğretim', 'Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans', 'Belirtilmemiş'] as const;
const EGITIM_DUZEY = ['İlköğretim', 'Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans', 'Doktora'] as const;
const PUAN_ETIKETI = 'Yetkinlik puanları (1 = çok zayıf, 5 = mükemmel)';

export const PERFORMANS_ALANLARI: readonly FormAlani[] = [
  { k: 'empId', l: 'Çalışan', tur: 'personel', zorunlu: true },
  { k: 'donem', l: 'Dönem', zorunlu: true, varsayilan: '@yil Yıllık' },
  { k: 'degerlendirenId', l: 'Değerlendiren', tur: 'personel' },
  { k: 'tarih', l: 'Değerlendirme tarihi', tur: 'tarih', varsayilan: '@bugun' },
  { k: 'skorlar', l: PUAN_ETIKETI, tur: 'puanlar', kriter: 'performans', genis: true },
  { k: 'hedefler', l: 'Dönem hedefleri ve gerçekleşme', tur: 'cok' },
  { k: 'guclu', l: 'Güçlü yönler', tur: 'cok' },
  { k: 'gelisim', l: 'Gelişim alanları', tur: 'cok' },
  { k: 'aksiyon', l: 'Aksiyon planı', tur: 'cok' },
];

export const EGITIM_ALANLARI: readonly FormAlani[] = [
  { k: 'ad', l: 'Eğitim adı', zorunlu: true },
  { k: 'tur', l: 'Tür', tur: 'secim', secenekler: (s) => s.TRAIN_TYPES, varsayilan: 'Teknik' },
  { k: 'kurum', l: 'Eğitmen / kurum' },
  { k: 'durum', l: 'Durum', tur: 'secim', secenekler: ['Planlandı', 'Tamamlandı', 'İptal'], varsayilan: 'Planlandı' },
  { k: 'tarih', l: 'Tarih', tur: 'tarih', zorunlu: true },
  { k: 'sure', l: 'Süre (saat)', tur: 'sayi' },
  { k: 'maliyet', l: 'Toplam maliyet (₺)', tur: 'para' },
  { k: 'gecerlilik', l: 'Sertifika geçerlilik bitişi', tur: 'tarih' },
  { k: 'katilimcilar', l: 'Katılımcılar', tur: 'personeller', genis: true },
  { k: 'aciklama', l: 'Açıklama', tur: 'cok' },
];

export const POZISYON_BOLUMLERI = ['Kadro', 'İlan', 'Başvuru', 'Mülakat'] as const;
export const POZISYON_ALANLARI: readonly FormAlani[] = [
  { bolum: 'Kadro', k: 'baslik', l: 'Pozisyon adı', zorunlu: true, ipucu: 'Şirket içindeki unvan.' },
  { bolum: 'Kadro', k: 'departmanId', l: 'Departman', tur: 'departman' },
  { bolum: 'Kadro', k: 'isMerkeziId', l: 'İş merkezi', tur: 'ismerkezi', zorunlu: true, ipucu: 'Adaylar ve görüşmeler de bu iş merkezinin kapsamındadır.' },
  { bolum: 'Kadro', k: 'adet', l: 'Alınacak kişi sayısı', tur: 'sayi', varsayilan: 1 },
  { bolum: 'Kadro', k: 'gerekce', l: 'Talep nedeni', tur: 'secim', secenekler: ['Yeni kadro', 'Ayrılan çalışanın yerine', 'Geçici / proje', 'Stajyer'], varsayilan: 'Yeni kadro' },
  { bolum: 'Kadro', k: 'yerineId', l: 'Yerine alınacak çalışan', tur: 'personel' },
  { bolum: 'Kadro', k: 'talepEdenId', l: 'Talep eden yönetici', tur: 'personel' },
  { bolum: 'Kadro', k: 'sorumluId', l: 'İşe alım sorumlusu', tur: 'personel' },
  { bolum: 'Kadro', k: 'durum', l: 'Durum', tur: 'secim', secenekler: ['Taslak', 'Onay bekliyor', 'Açık', 'Beklemede', 'Kapandı'], varsayilan: 'Taslak' },
  { bolum: 'Kadro', k: 'acilis', l: 'Açılış tarihi', tur: 'tarih', varsayilan: '@bugun' },
  { bolum: 'Kadro', k: 'butce', l: 'Bütçe notu (iç)' },
  { bolum: 'Kadro', k: 'ucretMin', l: 'Ücret aralığı, en az (brüt)', tur: 'para' },
  { bolum: 'Kadro', k: 'ucretMax', l: 'Ücret aralığı, en çok (brüt)', tur: 'para' },
  { bolum: 'İlan', k: 'ilanBaslik', l: 'İlan başlığı', ipucu: 'Adayların arayacağı yaygın unvan. Boşsa pozisyon adı kullanılır.' },
  { bolum: 'İlan', k: 'lokasyon', l: 'Lokasyon', ipucu: 'Boşsa Ayarlar’daki varsayılan lokasyon.' },
  { bolum: 'İlan', k: 'calismaSekli', l: 'Çalışma şekli', tur: 'secim', secenekler: ['Ofis', 'Hibrit', 'Uzaktan', 'Saha', 'Vardiyalı'], varsayilan: 'Ofis' },
  { bolum: 'İlan', k: 'calismaTuru', l: 'Çalışma türü', tur: 'secim', secenekler: ['Tam zamanlı', 'Yarı zamanlı', 'Dönemsel / proje', 'Stajyer', 'Serbest'], varsayilan: 'Tam zamanlı' },
  { bolum: 'İlan', k: 'deneyim', l: 'Deneyim', tur: 'secim', secenekler: ['Deneyimsiz', '1 yıl ve üzeri', '2–5 yıl', '5–10 yıl', '10 yıl ve üzeri', 'Belirtilmemiş'] },
  { bolum: 'İlan', k: 'egitimSeviye', l: 'Eğitim seviyesi', tur: 'secim', secenekler: EGITIM_SEVIYE },
  { bolum: 'İlan', k: 'ozet', l: 'Pozisyon hakkında', tur: 'cok', ipucu: '2–3 cümlelik kısa tanım.' },
  { bolum: 'İlan', k: 'sorumluluklar', l: 'Sorumluluklar', tur: 'cok', ipucu: 'Her satıra bir madde.' },
  { bolum: 'İlan', k: 'nitelikler', l: 'Aranan nitelikler', tur: 'cok', ipucu: 'Her satıra bir madde; yalnızca olmazsa olmazlar.' },
  { bolum: 'İlan', k: 'tercih', l: 'Tercih sebebi', tur: 'cok', ipucu: 'Şart olmayan ama artı sayılan özellikler.' },
  { bolum: 'İlan', k: 'yanHaklar', l: 'Sunduklarımız', tur: 'cok', ipucu: 'Boşsa Ayarlar’daki varsayılan yan haklar kullanılır.' },
  { bolum: 'İlan', k: 'ucretGoster', l: 'Ücret aralığını ilanda göster', tur: 'isaret', genis: true },
  { bolum: 'Başvuru', k: 'sonBasvuru', l: 'Son başvuru tarihi', tur: 'tarih' },
  { bolum: 'Başvuru', k: 'ilanKodu', l: 'İlan kodu', ipucu: 'Boşsa otomatik verilir; kanal ekiyle başvuru kaynağını izlemeye yarar.' },
  { bolum: 'Başvuru', k: 'basvuruEposta', l: 'Başvuru e-postası', tur: 'eposta', ipucu: 'Boşsa Ayarlar’daki kariyer e-postası.' },
  { bolum: 'Başvuru', k: 'basvuruLink', l: 'Başvuru bağlantısı', ipucu: 'Boşsa kariyer sayfası adresi.' },
  { bolum: 'Mülakat', k: '_soruSeti', l: 'Soru bankasından ekle', tur: 'soruSeti', genis: true },
  { bolum: 'Mülakat', k: 'mulakatSorulari', l: 'Mülakat soru seti', tur: 'cok', ipucu: 'Her satıra bir soru. Görüşme değerlendirme formunda görüşmeciye gösterilir.' },
  { bolum: 'Mülakat', k: 'aciklama', l: 'İç notlar', tur: 'cok' },
];

export const ADAY_BOLUMLERI = ['Aday', 'Profil', 'Teklif', 'Karar'] as const;
export type AdayBolumu = (typeof ADAY_BOLUMLERI)[number];
export const ADAY_ALANLARI: readonly FormAlani[] = [
  { bolum: 'Aday', k: 'ad', l: 'Ad', zorunlu: true },
  { bolum: 'Aday', k: 'soyad', l: 'Soyad', zorunlu: true },
  { bolum: 'Aday', k: 'eposta', l: 'E-posta', tur: 'eposta' },
  { bolum: 'Aday', k: 'telefon', l: 'Telefon', tur: 'tel' },
  { bolum: 'Aday', k: 'jobId', l: 'Başvurduğu pozisyon', tur: 'pozisyon', zorunlu: true },
  { bolum: 'Aday', k: 'il', l: 'Yaşadığı il' },
  { bolum: 'Aday', k: 'kaynak', l: 'Başvuru kaynağı', tur: 'kanal' },
  { bolum: 'Aday', k: 'refEmpId', l: 'Öneren çalışan', tur: 'personel' },
  { bolum: 'Aday', k: 'basvuruTarihi', l: 'Başvuru tarihi', tur: 'tarih', varsayilan: '@bugun' },
  { bolum: 'Aday', k: 'asama', l: 'Aşama', tur: 'secim', secenekler: (s) => s.STAGES, varsayilan: 'Başvuru' },
  { bolum: 'Aday', k: 'kvkk', l: 'Aday KVKK aydınlatma metnini onayladı', tur: 'isaret', genis: true },
  { bolum: 'Profil', k: 'mevcutSirket', l: 'Mevcut / son şirket' },
  { bolum: 'Profil', k: 'mevcutPozisyon', l: 'Mevcut / son pozisyon' },
  { bolum: 'Profil', k: 'tecrubeYil', l: 'Toplam deneyim (yıl)', tur: 'sayi' },
  { bolum: 'Profil', k: 'egitim', l: 'Eğitim düzeyi', tur: 'secim', secenekler: EGITIM_DUZEY },
  { bolum: 'Profil', k: 'okul', l: 'Okul ve bölüm' },
  { bolum: 'Profil', k: 'yabanciDil', l: 'Yabancı diller' },
  { bolum: 'Profil', k: 'cvLink', l: 'Özgeçmiş veya LinkedIn bağlantısı', genis: true },
  { bolum: 'Profil', k: 'ozet', l: 'Özgeçmiş özeti', tur: 'cok' },
  { bolum: 'Teklif', k: 'maasBeklentisi', l: 'Ücret beklentisi (brüt ₺)', tur: 'para' },
  { bolum: 'Teklif', k: 'baslayabilir', l: 'En erken başlama tarihi', tur: 'tarih' },
  { bolum: 'Teklif', k: 'teklifUcret', l: 'Teklif edilen brüt ücret (₺)', tur: 'para' },
  { bolum: 'Teklif', k: 'teklifTarihi', l: 'Teklif tarihi', tur: 'tarih' },
  { bolum: 'Teklif', k: 'teklifYanit', l: 'Teklif yanıtı', tur: 'secim', secenekler: ['Bekleniyor', 'Kabul etti', 'Reddetti', 'Pazarlık sürüyor'] },
  { bolum: 'Teklif', k: 'teklifNot', l: 'Teklif detayları (yan haklar, koşullar)', tur: 'cok' },
  { bolum: 'Karar', k: 'redNedeni', l: 'Ret nedeni', tur: 'secim', secenekler: (s) => s.REJECT_REASONS },
  { bolum: 'Karar', k: 'notlar', l: 'Genel notlar', tur: 'cok' },
];

export const GORUSME_BOLUMLERI = ['Planlama', 'Değerlendirme'] as const;
export type GorusmeBolumu = (typeof GORUSME_BOLUMLERI)[number];
export const GORUSME_ALANLARI: readonly FormAlani[] = [
  { bolum: 'Planlama', k: 'candId', l: 'Aday', tur: 'aday', zorunlu: true },
  { bolum: 'Planlama', k: 'tur', l: 'Görüşme türü', tur: 'secim', secenekler: (s) => s.INTV_TYPES, zorunlu: true, varsayilan: 'İK mülakatı' },
  { bolum: 'Planlama', k: 'tarih', l: 'Tarih', tur: 'tarih', zorunlu: true, varsayilan: '@bugun' },
  { bolum: 'Planlama', k: 'saat', l: 'Saat', tur: 'saat', varsayilan: '10:00' },
  { bolum: 'Planlama', k: 'sure', l: 'Süre (dakika)', tur: 'sayi', varsayilan: 45 },
  { bolum: 'Planlama', k: 'sekil', l: 'Görüşme şekli', tur: 'secim', secenekler: ['Yüz yüze', 'Video görüşme', 'Telefon'], varsayilan: 'Yüz yüze' },
  { bolum: 'Planlama', k: 'yer', l: 'Yer veya görüşme bağlantısı' },
  { bolum: 'Planlama', k: 'durum', l: 'Durum', tur: 'secim', secenekler: (s) => s.INTV_STATES, varsayilan: 'Planlandı' },
  { bolum: 'Planlama', k: 'gorusmeciler', l: 'Görüşmeciler', tur: 'personeller', genis: true },
  { bolum: 'Değerlendirme', k: 'skorlar', l: PUAN_ETIKETI, tur: 'puanlar', kriter: 'mulakat', genis: true },
  { bolum: 'Değerlendirme', k: 'oneri', l: 'Görüşmeci önerisi', tur: 'secim', secenekler: (s) => s.RECS, genis: true },
  { bolum: 'Değerlendirme', k: 'guclu', l: 'Güçlü yönler', tur: 'cok' },
  { bolum: 'Değerlendirme', k: 'zayif', l: 'Gelişime açık yönler / riskler', tur: 'cok' },
  { bolum: 'Değerlendirme', k: 'notlar', l: 'Görüşme notları', tur: 'cok' },
];

export const bolumAlanlari = (alanlar: readonly FormAlani[], bolumler: readonly string[] | null): FormAlani[] =>
  alanlar.filter((f) => bolumler === null || (f.bolum !== undefined && bolumler.includes(f.bolum)));

// Varsayılanın bugünkü değeri.
export function varsayilanDeger(f: FormAlani, bugun: string): unknown {
  if (f.varsayilan === undefined) return f.tur === 'isaret' ? false : f.tur === 'personeller' ? [] : f.tur === 'puanlar' ? {} : '';
  if (f.varsayilan === '@bugun') return bugun;
  if (typeof f.varsayilan === 'string' && f.varsayilan.startsWith('@yil')) return f.varsayilan.replace('@yil', bugun.slice(0, 4));
  return f.varsayilan;
}
