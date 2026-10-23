import type { KmKoleksiyonu } from './tipler.ts';

// Uygulamanın başvuru listeleri olduğu gibi: kayıtlarda bu metinler saklanır, değiştirilirse eski kayıtlar eşleşmez.
export const KAYNAK = ['Giriş muayene', 'Proses muayene', 'Final muayene', 'FAI', 'Müşteri şikâyeti', 'Tedarikçi bildirimi', 'İç denetim', 'Kalibrasyon etki analizi'];
export const HATA = ['Boyutsal', 'Yüzey / görsel', 'Malzeme / sertifika', 'Montaj', 'Elektriksel / fonksiyonel test', 'Doküman / konfigürasyon', 'Sahte parça şüphesi', 'FOD',
  'Özel proses (ısıl işlem, kaplama, NDT)', 'Ambalaj / taşıma'];
export const MRB_KARAR_BEKLIYOR = 'Karar bekliyor';
export const MRB = [MRB_KARAR_BEKLIYOR, 'Olduğu gibi kullan (müşteri onaylı)', 'Tamir (müşteri onaylı)', 'Yeniden işle', 'Hurda', 'Tedarikçiye iade'];
export const KAPALI = 'Kapalı';
export const NCR_DURUM = ['Açık', 'MRB değerlendirmesinde', 'DÖF açıldı', KAPALI];
export const CIDDIYET = ['Kritik', 'Majör', 'Minör'];
export const DEV_TIP = ['Kumpas', 'Mikrometre', 'Komparatör', 'Mastar / tampon mastar', 'CMM', 'Yüzey pürüzlülük cihazı', 'Sertlik cihazı', 'Tork anahtarı', 'Multimetre',
  'Osiloskop', 'Güç kaynağı', 'Basınç / akış ölçer', 'Diğer'];
export const IZLEN = ['TÜRKAK akrediteli laboratuvar', 'TÜBİTAK UME', 'Üretici laboratuvarı', 'Dahili (referans standarda karşı)'];
export const SUP_KAT = ['Talaşlı imalat', 'Elektronik komponent', 'Özel proses (ısıl işlem, kaplama, NDT)', 'Kompozit', 'Kablo / harness', 'Distribütör', 'Döküm / dövme', 'Hizmet'];
export const SERTS = ['ISO 9001', 'AS9100', 'AQAP-2110', 'AS9120', 'NADCAP', 'AS6081', 'ISO/IEC 17025'];
export const D8 = ['Ekip kurma', 'Problem tanımı', 'Geçici önlem', 'Kök neden', 'Kalıcı çözüm seçimi', 'Uygulama ve doğrulama', 'Tekrarı önleme / yaygınlaştırma', 'Kapanış'];
export const INSP_TUR = ['Giriş', 'Proses', 'Final', 'FAI'];
export const GIRIS_CHK = ['Uygunluk sertifikası (CoC) mevcut', 'Malzeme / test sertifikası gereksinimle uyumlu', 'Kaynak yetkili üretici veya distribütör',
  'Ambalaj, ESD ve raf ömrü uygun', 'Parça revizyonu sipariş ile aynı'];
export const FAI_CHK = ['Form 1: Parça no ve alt montaj izlenebilirliği doğrulandı', 'Form 2: Malzeme, özel proses ve fonksiyonel test kayıtları doğrulandı',
  'Form 3: Tüm tasarım karakteristikleri balonlandı ve ölçüldü'];
export const FAI_NEDEN = ['Yeni parça / ilk üretim', 'Tasarım revizyonu', 'Üretim prosesi veya yeri değişikliği', 'Tedarikçi değişikliği', 'Takım / fikstür değişikliği',
  '2 yıldan uzun üretim arası'];
export const BELGE_TUR = ['Fotoğraf', 'Malzeme sertifikası', 'Uygunluk sertifikası (CoC)', 'Özel proses sertifikası', 'Test raporu', 'Kalibrasyon sertifikası',
  'Tedarikçi sistem sertifikası', 'Müşteri onayı', 'Diğer'];
export const EMIR_TIP = ['İş emri', 'Satınalma siparişi', 'Müşteri siparişi'];

// Değişiklik izinde ve ekranlarda kayıt türünün adı.
export const KOL_AD: Record<KmKoleksiyonu | 'kullanici' | 'settings' | 'oturum', string> = {
  ncr: 'NCR', capa: 'DÖF', insp: 'Muayene', dev: 'Cihaz', sup: 'Tedarikçi', frm: 'Form', lot: 'Lot kabul', tpl: 'Form şablonu', spc: 'Ölçüm serisi',
  cizim: 'Resim/model', parca: 'Parça', emir: 'İş emri / sipariş', belge: 'Belge', kullanici: 'Kullanıcı', settings: 'Ayar', oturum: 'Oturum', iz: 'İz',
  bayrak: 'Teknik kütüphane',
};

export const ALAN_AD: Record<string, string> = {
  durum: 'Durum', mrb: 'MRB kararı', mrbGerekce: 'Karar gerekçesi', ciddiyet: 'Ciddiyet', tanim: 'Tanım', sorumlu: 'Sorumlu', termin: 'Termin', adim: '8D adımı',
  kokNeden: 'Kök neden', aksiyon: 'Aksiyon', etkinlik: 'Etkinlik', sonuc: 'Sonuç', chars: 'Ölçümler', karar: 'Karar', bKr: 'Bulunan kritik', bMj: 'Bulunan majör',
  bMn: 'Bulunan minör', balonlar: 'Balonlar', onaylayan: 'Onaylayan', veri: 'Form verisi', liste: 'Kontrol maddeleri', nominal: 'Nominal', parcaNo: 'Parça no',
  rev: 'Revizyon', arsiv: 'Arşiv', sonKal: 'Son kalibrasyon', gecmis: 'Kalibrasyon geçmişi', pin: 'PIN', rol: 'Rol', aktif: 'Aktif',
};

// Modülün kendi formları (KF kodları); belge başlığındaki revizyon bunlarda ayarlardan gelir.
export const BAGLI_FORMLAR = ['KF-01', 'KF-02', 'KF-03', 'KF-04', 'KF-05', 'KF-06', 'KF-07', 'KF-12'];
