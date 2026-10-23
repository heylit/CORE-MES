import type { IkTuru } from '#paylasilan/sozlesme/ik.ts';
import {
  ATT_TYPES, COLLARS, EXIT_CODES, HESAP_OPTS, INTV_STATES, INTV_TYPES, LEAVE_STATES, LEAVE_TYPES, LEVELS, RECS, REJECT_REASONS,
  STAGES, TRAIN_TYPES, YEMEK_YONTEM, YOL_YONTEM,
} from '#paylasilan/ik-motor/sabitler.ts';

/* İK kayıtlarının tablo karşılığı (kullanıcı kararı 08.10.2026: her alan bir sütun, iç içe listeler alt tabloda).
   Uygulamanın kaydı (`kind`, `id` ve alanlar) bu tanıma göre satırlara ayrılır ve satırlardan yeniden kurulur (eslesme.ts).
   Göç (20261012134600_ik_tablolar.sql) bu tanımdan üretilmiştir; ikisinin aynı kaldığını `sema.test.ts` veritabanında sınar. */

// Sütun tipleri: tutar kuruşa yuvarlanır; hesap (bordro ara sonucu) motorun kesirini korur; ay `GGGG-AA` metnini ayın ilk günü
// olarak tutar.
export type Tip = 'metin' | 'tarih' | 'ay' | 'tutar' | 'hesap' | 'sayi' | 'tamsayi' | 'mantik' | 'saat' | 'zaman';

export interface Alan {
  // Uygulamadaki alan adı.
  a: string;
  // Sütun adı.
  s: string;
  t: Tip;
  zorunlu?: boolean;
  // Seçenek listesi (CHECK kısıtı).
  secenek?: readonly string[];
  // Başka bir İK kaydına bağ: uygulamada metin kimlik, tabloda o tablonun sayı kimliği.
  bag?: IkTuru;
  // TMI tablolarına bağ (sayı kimliği; uygulamada da sayı).
  dis?: 'kisi' | 'is_merkezi';
  tekil?: boolean;
}

// Alt liste: dizi (sıralı nesneler), harita (anahtar -> nesne), deger (anahtar -> tek değer), kimlik (bağlı kayıt kimlikleri).
export interface Liste {
  a: string;
  tablo: string;
  bicim: 'dizi' | 'harita' | 'deger' | 'kimlik';
  // harita ve deger: anahtarın sütunu.
  anahtar?: string;
  // deger: değerin alanı (a: '' ile); kimlik: bağlanan tür.
  alanlar: readonly Alan[];
}

// İç içe nesne (bordro hesabının yemek, yol, teşvik parçaları): sütunları önekle ana tabloda durur; nesne yoksa `<onek>var` false.
export interface Nesne {
  a: string;
  onek: string;
  alanlar: readonly Alan[];
  bos?: boolean;
}

export interface TurTanimi {
  tur: IkTuru;
  tablo: string;
  // Alt tablolarda ana kaydın sütun adı (personel_no, pozisyon_no...).
  bagSutunu: string;
  alanlar: readonly Alan[];
  listeler: readonly Liste[];
  // Bordroda `snap` nesnesi: sütunları `h_` önekiyle; içindeki nesneler ve liste.
  ozet?: { a: string; onek: string; alanlar: readonly Alan[]; nesneler: readonly Nesne[]; listeler: readonly Liste[] };
}

const m = (a: string, s: string, ek: Partial<Alan> = {}): Alan => ({ a, s, t: 'metin', ...ek });
const tarih = (a: string, s: string, ek: Partial<Alan> = {}): Alan => ({ a, s, t: 'tarih', ...ek });
const tutar = (a: string, s: string, ek: Partial<Alan> = {}): Alan => ({ a, s, t: 'tutar', ...ek });
const sayi = (a: string, s: string, ek: Partial<Alan> = {}): Alan => ({ a, s, t: 'sayi', ...ek });
const tam = (a: string, s: string, ek: Partial<Alan> = {}): Alan => ({ a, s, t: 'tamsayi', ...ek });
const mantik = (a: string, s: string): Alan => ({ a, s, t: 'mantik' });
const hesap = (a: string, s: string): Alan => ({ a, s, t: 'hesap' });
const sec = (a: string, s: string, secenek: readonly string[], ek: Partial<Alan> = {}): Alan => ({ a, s, t: 'metin', secenek, ...ek });
const bag = (a: string, s: string, tur: IkTuru, ek: Partial<Alan> = {}): Alan => ({ a, s, t: 'tamsayi', bag: tur, ...ek });

const EGITIM = ['İlköğretim', 'Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans', 'Doktora'];
const CALISMA_SEKLI = ['Ofis', 'Hibrit', 'Uzaktan', 'Saha', 'Vardiyalı'];

const PERSONEL: TurTanimi = {
  tur: 'emp', tablo: 'ik_personel', bagSutunu: 'personel_no',
  alanlar: [
    m('ad', 'ad', { zorunlu: true }), m('soyad', 'soyad', { zorunlu: true }), m('tckn', 'tckn'), tarih('dogumTarihi', 'dogum_tarihi'),
    m('dogumYeri', 'dogum_yeri'), sec('cinsiyet', 'cinsiyet', ['Kadın', 'Erkek', 'Belirtilmemiş']),
    sec('medeniDurum', 'medeni_durum', ['Bekâr', 'Evli', 'Boşanmış', 'Dul']), tam('cocukSayisi', 'cocuk_sayisi'),
    sec('kanGrubu', 'kan_grubu', ['A Rh+', 'A Rh-', 'B Rh+', 'B Rh-', 'AB Rh+', 'AB Rh-', '0 Rh+', '0 Rh-']), m('uyruk', 'uyruk'),
    sec('engelDurumu', 'engel_durumu', ['Yok', '1. derece (%80 ve üzeri)', '2. derece (%60–79)', '3. derece (%40–59)']),
    sec('askerlik', 'askerlik', ['Yapıldı', 'Muaf', 'Tecilli', 'Yapılmadı', 'Uygulanmaz']), sec('egitim', 'egitim', EGITIM),
    m('okul', 'okul'), m('ehliyet', 'ehliyet'), m('yabanciDil', 'yabanci_dil'),
    m('telefon', 'telefon'), m('eposta', 'eposta'), m('kisiselEposta', 'kisisel_eposta'), m('il', 'il'), m('ilce', 'ilce'), m('adres', 'adres'),
    m('acilKisi', 'acil_kisi'), m('acilYakinlik', 'acil_yakinlik'), m('acilTelefon', 'acil_telefon'),
    m('sicilNo', 'sicil_no', { tekil: true }), bag('departmanId', 'departman_no', 'dept'), m('pozisyon', 'pozisyon'),
    sec('yakaTipi', 'yaka_tipi', COLLARS), sec('kademe', 'kademe', LEVELS), bag('yoneticiId', 'yonetici_no', 'emp'),
    tarih('iseGiris', 'ise_giris'), tarih('denemeBitis', 'deneme_bitis'),
    sec('sozlesmeTuru', 'sozlesme_turu', ['Belirsiz süreli', 'Belirli süreli', 'Kısmi süreli', 'Çağrı üzerine', 'Stajyer']),
    tarih('sozlesmeBitis', 'sozlesme_bitis'), sec('calismaSekli', 'calisma_sekli', CALISMA_SEKLI), m('lokasyon', 'lokasyon'),
    m('sgkNo', 'sgk_no'), sec('durum', 'durum', ['Aktif', 'Ücretsiz izinde', 'Ayrıldı']),
    tutar('brutMaas', 'brut_maas'), tutar('yanHakTutar', 'yan_hak_tutar'),
    sec('yemekYontem', 'yemek_yontem', ['Genel ayar', ...YEMEK_YONTEM]), sec('yemekHesap', 'yemek_hesap', HESAP_OPTS), sayi('yemekDeger', 'yemek_deger'),
    sec('yolYontem', 'yol_yontem', ['Genel ayar', ...YOL_YONTEM]), sec('yolHesap', 'yol_hesap', HESAP_OPTS), sayi('yolDeger', 'yol_deger'),
    m('tesvikId', 'tesvik_kodu'), mantik('besKatilim', 'bes_katilim'), m('banka', 'banka'), m('iban', 'iban'),
    sayi('oncekiKullanim', 'onceki_kullanilan_izin'), m('yanHaklar', 'yan_haklar'),
    tarih('cikisTarihi', 'cikis_tarihi'), sec('cikisKodu', 'cikis_kodu', EXIT_CODES), m('cikisNotu', 'cikis_notu'),
    // Kullanıcı kararları 2 ve 6 (08.10.2026): TMI kullanıcısı (bir kişi en çok bir personel) ve zorunlu iş merkezi.
    { a: 'kisiId', s: 'kisi_id', t: 'tamsayi', dis: 'kisi', tekil: true },
    { a: 'isMerkeziId', s: 'is_merkezi_id', t: 'tamsayi', dis: 'is_merkezi', zorunlu: true },
  ],
  listeler: [
    { a: 'ucretGecmisi', tablo: 'ik_personel_ucret', bicim: 'dizi', alanlar: [tarih('tarih', 'yururluk', { zorunlu: true }), tutar('brut', 'brut', { zorunlu: true }), m('neden', 'neden'), m('not', 'notu')] },
    { a: 'hareketler', tablo: 'ik_personel_hareket', bicim: 'dizi', alanlar: [{ a: 't', s: 'zaman', t: 'zaman' }, tarih('tarih', 'tarih'), m('alan', 'alan'), m('eski', 'eski'), m('yeni', 'yeni')] },
    { a: 'belgeler', tablo: 'ik_personel_belge', bicim: 'harita', anahtar: 'belge_adi', alanlar: [mantik('ok', 'tamam'), tarih('tarih', 'tarih')] },
    { a: 'notlar', tablo: 'ik_personel_notu', bicim: 'dizi', alanlar: [{ a: 't', s: 'zaman', t: 'zaman' }, m('m', 'metin', { zorunlu: true })] },
    { a: 'cikisListesi', tablo: 'ik_personel_cikis_adimi', bicim: 'deger', anahtar: 'adim', alanlar: [tarih('', 'tarih')] },
    { a: 'primler', tablo: 'ik_personel_primi', bicim: 'harita', anahtar: 'prim_kodu', alanlar: [mantik('aktif', 'aktif'), sayi('deger', 'deger')] },
  ],
};

const DEPARTMAN: TurTanimi = {
  tur: 'dept', tablo: 'ik_departman', bagSutunu: 'departman_no',
  alanlar: [m('ad', 'ad', { zorunlu: true }), m('kod', 'kod'), m('giderHesabi', 'gider_hesabi'), bag('yoneticiId', 'yonetici_no', 'emp'), tutar('butce', 'butce'), m('aciklama', 'aciklama')],
  listeler: [],
};

const IZIN: TurTanimi = {
  tur: 'leave', tablo: 'ik_izin', bagSutunu: 'izin_no',
  alanlar: [
    bag('empId', 'personel_no', 'emp', { zorunlu: true }), sec('tur', 'tur', LEAVE_TYPES, { zorunlu: true }),
    tarih('baslangic', 'baslangic', { zorunlu: true }), tarih('bitis', 'bitis', { zorunlu: true }), sayi('gun', 'gun'),
    sec('durum', 'durum', LEAVE_STATES, { zorunlu: true }), bag('vekil', 'vekil_no', 'emp'), m('aciklama', 'aciklama'),
    tarih('talepTarihi', 'talep_tarihi'), tarih('karar', 'karar_tarihi'), bag('onaylayanId', 'karar_veren_personel_no', 'emp'),
    sec('kaynak', 'kaynak', ['Çalışan']),
  ],
  listeler: [],
};

const DEVAM: TurTanimi = {
  tur: 'att', tablo: 'ik_devam', bagSutunu: 'devam_no',
  alanlar: [
    bag('empId', 'personel_no', 'emp', { zorunlu: true }), tarih('tarih', 'tarih', { zorunlu: true }), sec('tur', 'tur', ATT_TYPES, { zorunlu: true }),
    sayi('saat', 'saat'), sec('onay', 'onay', ['Onaylandı', 'Beklemede']), m('aciklama', 'aciklama'),
  ],
  listeler: [],
};

const PERFORMANS: TurTanimi = {
  tur: 'perf', tablo: 'ik_performans', bagSutunu: 'performans_no',
  alanlar: [
    bag('empId', 'personel_no', 'emp', { zorunlu: true }), m('donem', 'donem'), bag('degerlendirenId', 'degerlendiren_no', 'emp'), tarih('tarih', 'tarih'),
    m('hedefler', 'hedefler'), m('guclu', 'guclu'), m('gelisim', 'gelisim'), m('aksiyon', 'aksiyon'),
  ],
  listeler: [{ a: 'skorlar', tablo: 'ik_performans_puani', bicim: 'deger', anahtar: 'kriter', alanlar: [tam('', 'puan')] }],
};

const EGITIM_KAYDI: TurTanimi = {
  tur: 'train', tablo: 'ik_egitim', bagSutunu: 'egitim_no',
  alanlar: [
    m('ad', 'ad', { zorunlu: true }), sec('tur', 'tur', TRAIN_TYPES), m('kurum', 'kurum'), sec('durum', 'durum', ['Planlandı', 'Tamamlandı', 'İptal']),
    tarih('tarih', 'tarih'), sayi('sure', 'sure'), tutar('maliyet', 'maliyet'), tarih('gecerlilik', 'gecerlilik'), m('aciklama', 'aciklama'),
  ],
  listeler: [{ a: 'katilimcilar', tablo: 'ik_egitim_katilimcisi', bicim: 'kimlik', alanlar: [bag('', 'personel_no', 'emp')] }],
};

const POZISYON: TurTanimi = {
  tur: 'job', tablo: 'ik_pozisyon', bagSutunu: 'pozisyon_no',
  alanlar: [
    m('baslik', 'baslik', { zorunlu: true }), bag('departmanId', 'departman_no', 'dept'), tam('adet', 'adet'),
    sec('gerekce', 'gerekce', ['Yeni kadro', 'Ayrılan çalışanın yerine', 'Geçici / proje', 'Stajyer']),
    bag('yerineId', 'yerine_no', 'emp'), bag('talepEdenId', 'talep_eden_no', 'emp'), bag('sorumluId', 'sorumlu_no', 'emp'),
    sec('durum', 'durum', ['Taslak', 'Onay bekliyor', 'Açık', 'Beklemede', 'Kapandı']), tarih('acilis', 'acilis'), m('butce', 'butce_notu'),
    tutar('ucretMin', 'ucret_min'), tutar('ucretMax', 'ucret_max'), m('ilanBaslik', 'ilan_baslik'), m('lokasyon', 'lokasyon'),
    sec('calismaSekli', 'calisma_sekli', CALISMA_SEKLI), sec('calismaTuru', 'calisma_turu', ['Tam zamanlı', 'Yarı zamanlı', 'Dönemsel / proje', 'Stajyer', 'Serbest']),
    sec('deneyim', 'deneyim', ['Deneyimsiz', '1 yıl ve üzeri', '2–5 yıl', '5–10 yıl', '10 yıl ve üzeri', 'Belirtilmemiş']),
    sec('egitimSeviye', 'egitim_seviye', ['İlköğretim', 'Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans', 'Belirtilmemiş']),
    m('ozet', 'ozet'), m('sorumluluklar', 'sorumluluklar'), m('nitelikler', 'nitelikler'), m('tercih', 'tercih'), m('yanHaklar', 'yan_haklar'),
    mantik('ucretGoster', 'ucret_goster'), tarih('sonBasvuru', 'son_basvuru'), m('ilanKodu', 'ilan_kodu', { tekil: true }),
    m('basvuruEposta', 'basvuru_eposta'), m('basvuruLink', 'basvuru_baglanti'), m('mulakatSorulari', 'mulakat_sorulari'), m('aciklama', 'aciklama'),
    m('ozelMetin', 'ozel_metin'),
    // Kullanıcı kararı A (08.10.2026): pozisyonun iş merkezi; aday ve görüşme kapsamı buradan.
    { a: 'isMerkeziId', s: 'is_merkezi_id', t: 'tamsayi', dis: 'is_merkezi', zorunlu: true },
  ],
  listeler: [{
    a: 'yayinlar', tablo: 'ik_pozisyon_yayini', bicim: 'harita', anahtar: 'kanal_kodu',
    alanlar: [m('durum', 'durum'), tarih('tarih', 'yayin_tarihi'), tarih('bitis', 'bitis'), m('link', 'baglanti'), m('not', 'notu'), tarih('kapanis', 'kapanis')],
  }],
};

const ADAY: TurTanimi = {
  tur: 'cand', tablo: 'ik_aday', bagSutunu: 'aday_no',
  alanlar: [
    m('ad', 'ad', { zorunlu: true }), m('soyad', 'soyad'), m('eposta', 'eposta'), m('telefon', 'telefon'), bag('jobId', 'pozisyon_no', 'job'),
    m('il', 'il'), m('kaynak', 'kaynak'), bag('refEmpId', 'referans_no', 'emp'), tarih('basvuruTarihi', 'basvuru_tarihi'),
    sec('asama', 'asama', STAGES), mantik('kvkk', 'kvkk_onayi'), m('mevcutSirket', 'mevcut_sirket'), m('mevcutPozisyon', 'mevcut_pozisyon'),
    sayi('tecrubeYil', 'tecrube_yil'), sec('egitim', 'egitim', EGITIM), m('okul', 'okul'), m('yabanciDil', 'yabanci_dil'), m('cvLink', 'cv_baglanti'),
    m('ozet', 'ozet'), tutar('maasBeklentisi', 'maas_beklentisi'), tarih('baslayabilir', 'baslayabilir'), tutar('teklifUcret', 'teklif_ucret'),
    tarih('teklifTarihi', 'teklif_tarihi'), sec('teklifYanit', 'teklif_yanit', ['Bekleniyor', 'Kabul etti', 'Reddetti', 'Pazarlık sürüyor']),
    m('teklifNot', 'teklif_notu'), sec('redNedeni', 'red_nedeni', REJECT_REASONS), m('notlar', 'notlar'), bag('empId', 'personel_no', 'emp'),
    tarih('iseAlimTarihi', 'ise_alim_tarihi'), tarih('redTarihi', 'red_tarihi'),
  ],
  listeler: [],
};

const GORUSME: TurTanimi = {
  tur: 'intv', tablo: 'ik_gorusme', bagSutunu: 'gorusme_no',
  alanlar: [
    bag('candId', 'aday_no', 'cand', { zorunlu: true }), sec('tur', 'tur', INTV_TYPES), tarih('tarih', 'tarih'), { a: 'saat', s: 'saat', t: 'saat' },
    tam('sure', 'sure'), sec('sekil', 'sekil', ['Yüz yüze', 'Video görüşme', 'Telefon']), m('yer', 'yer'), sec('durum', 'durum', INTV_STATES),
    sec('oneri', 'oneri', RECS), m('guclu', 'guclu'), m('zayif', 'zayif'), m('notlar', 'notlar'), tarih('degerlendirmeTarihi', 'degerlendirme_tarihi'),
  ],
  listeler: [
    { a: 'gorusmeciler', tablo: 'ik_gorusmeci', bicim: 'kimlik', alanlar: [bag('', 'personel_no', 'emp')] },
    { a: 'skorlar', tablo: 'ik_gorusme_puani', bicim: 'deger', anahtar: 'kriter', alanlar: [tam('', 'puan')] },
  ],
};

const YAN_HAK = (a: string, onek: string): Nesne => ({
  a, onek,
  alanlar: [hesap('tutar', 'tutar'), hesap('gvIst', 'gv_istisnasi'), hesap('sgkIst', 'sgk_istisnasi'), mantik('ayni', 'ayni'), m('yontem', 'yontem'), sayi('fg', 'fiili_gun'), mantik('hizmet', 'hizmet')],
  bos: true,
});

const BORDRO: TurTanimi = {
  tur: 'pay', tablo: 'ik_bordro', bagSutunu: 'bordro_no',
  alanlar: [
    bag('empId', 'personel_no', 'emp', { zorunlu: true }), { a: 'donem', s: 'donem', t: 'ay', zorunlu: true },
    tutar('brut', 'girdi_brut'), tam('gun', 'gun'), tutar('ek', 'girdi_ek'), sayi('mesaiSaat', 'mesai_saat'), sayi('tatilSaat', 'tatil_saat'), tutar('kesinti', 'girdi_kesinti'),
    tutar('toplam', 'toplam'), tutar('net', 'net'), tutar('gv', 'gelir_vergisi'), tutar('dv', 'damga_vergisi'), tutar('sgk', 'sgk_isci'), tutar('iss', 'issizlik_isci'),
    tutar('maliyet', 'maliyet'), m('paramId', 'parametre_donemi_kodu'), m('paramAd', 'parametre_donemi_adi'), { a: 'kesinlesme', s: 'kesinlesme', t: 'zaman' },
  ],
  listeler: [],
  ozet: {
    a: 'snap', onek: 'h_',
    alanlar: [
      hesap('aylik', 'aylik'), tam('gun', 'gun'), hesap('brut', 'brut'), hesap('ek', 'ek'), hesap('mesaiUcret', 'mesai_ucreti'), hesap('ucret', 'ucret'),
      hesap('yanTutar', 'yan_hak'), hesap('toplam', 'toplam'), hesap('sgkMatrah', 'sgk_matrahi'), hesap('sgk', 'sgk_isci'), hesap('iss', 'issizlik_isci'),
      hesap('ind', 'engelli_indirimi'), hesap('matrah', 'gv_matrahi'), hesap('cumOnce', 'kumulatif_matrah_once'), hesap('gvHam', 'gv_hesaplanan'),
      hesap('gvIst', 'gv_istisnasi'), hesap('gv', 'gelir_vergisi'), hesap('dvHam', 'dv_hesaplanan'), hesap('dvIst', 'dv_istisnasi'), hesap('dv', 'damga_vergisi'),
      hesap('bes', 'bes'), hesap('kesinti', 'diger_kesinti'), hesap('net', 'net'), hesap('ayni', 'ayni_odeme'), hesap('banka', 'bankaya_odenecek'),
      hesap('isvBrut', 'isveren_brut'), hesap('tInd', 'tesvik_indirimi'), hesap('isvSgk', 'isveren_sgk'), hesap('isvIss', 'isveren_issizlik'),
      hesap('maliyet', 'maliyet'), hesap('aMat', 'asgari_matrah'), m('paramAd', 'parametre_donemi_adi'),
    ],
    nesneler: [
      YAN_HAK('yemek', 'yemek_'), YAN_HAK('yol', 'yol_'),
      { a: 'tesvik', onek: 'tesvik_', bos: true, alanlar: [m('id', 'kodu'), m('ad', 'adi'), m('tur', 'turu'), sayi('deger', 'degeri'), m('kanunNo', 'kanun_no')] },
    ],
    listeler: [{ a: 'primDetay', tablo: 'ik_bordro_primi', bicim: 'dizi', alanlar: [m('ad', 'ad', { zorunlu: true }), hesap('tutar', 'tutar')] }],
  },
};

export const TUR_TANIMLARI: Record<IkTuru, TurTanimi> = {
  emp: PERSONEL, dept: DEPARTMAN, leave: IZIN, att: DEVAM, perf: PERFORMANS, train: EGITIM_KAYDI,
  job: POZISYON, cand: ADAY, intv: GORUSME, pay: BORDRO,
};

// Uygulamanın kaydında olup tabloya yazılmayan alanlar: kimlik ve tür ayrı sütundadır, zamanı sunucu yazar, `demo` örnek veri
// işaretidir (TMI'de örnek veri kapalı).
export const ATLANAN_ALANLAR: readonly string[] = ['id', 'kind', 'createdAt', 'updatedAt', 'demo'];

// Ana tabloların ortak sütunları (göç ve sorgular).
export const ORTAK_SUTUNLAR = ['no', 'kimlik', 'surum', 'iptal', 'olusturan_kisi_id', 'olusturma', 'guncelleyen_kisi_id', 'guncelleme'] as const;

/* ---------------- ayarlar ---------------- */

// Şirket geneli ayarlar (tek satır).
export const GENEL_AYAR_ALANLARI: readonly Alan[] = [
  m('sirket', 'sirket'), mantik('cumartesiIsGunu', 'cumartesi_is_gunu'), tam('denemeAy', 'deneme_suresi_ay'), tam('engelliEsik', 'engelli_esik'),
  sayi('engelliOran', 'engelli_oran'), sayi('sgkTesvikPuan', 'sgk_tesvik_puan'), m('sirketTanitim', 'sirket_tanitim'), m('kariyerEposta', 'kariyer_eposta'),
  m('kariyerSayfasi', 'kariyer_sayfasi'), m('ilanLokasyon', 'ilan_lokasyon'), m('kvkkLink', 'kvkk_baglanti'), m('ilanYanHaklar', 'ilan_yan_haklari'),
  m('hesapPersonel', 'hesap_personel'), m('hesapSgk', 'hesap_sgk'), m('hesapVergi', 'hesap_vergi'), m('hesapGider', 'hesap_gider'), m('hesapDiger', 'hesap_diger'),
];

// Parametre döneminin tek değerli parametreleri; boş (null) parametre varsayılan değere düşer.
export const DONEM_ALANLARI: readonly Alan[] = [
  tutar('asgariBrut', 'asgari_brut'), tutar('sgkTavan', 'sgk_tavani'), sayi('sgkIsciOran', 'sgk_isci_orani'), sayi('issizlikIsciOran', 'issizlik_isci_orani'),
  sayi('sgkIsverenOran', 'sgk_isveren_orani'), sayi('issizlikIsverenOran', 'issizlik_isveren_orani'), sayi('damgaOran', 'damga_orani'),
  tutar('kidemTavan', 'kidem_tavani'), sayi('mesaiCarpan', 'mesai_katsayisi'), sayi('aylikSaat', 'aylik_saat'), sayi('yillikMesaiLimit', 'yillik_mesai_siniri'),
  sayi('fazlaSurelerCarpan', 'fazla_sure_katsayisi'), sayi('haftaTatiliCarpan', 'hafta_tatili_katsayisi'), sayi('ubgtCarpan', 'resmi_tatil_katsayisi'),
  sayi('haftalikSaat', 'haftalik_saat'), sayi('besOran', 'bes_orani'), mantik('raporKesinti', 'rapor_kesintisi'),
  tutar('engelliInd1', 'engelli_indirimi_1'), tutar('engelliInd2', 'engelli_indirimi_2'), tutar('engelliInd3', 'engelli_indirimi_3'),
  sec('yemekYontem', 'yemek_yontem', YEMEK_YONTEM), sec('yemekHesap', 'yemek_hesap', HESAP_OPTS), sayi('yemekDeger', 'yemek_deger'),
  tutar('yemekGvKart', 'yemek_gv_kart'), tutar('yemekGvNakit', 'yemek_gv_nakit'), sec('yemekSgkKart', 'yemek_sgk_kart', ['tamami', 'limit', 'tabi']),
  tutar('yemekSgkLimit', 'yemek_sgk_limit'), tutar('yemekSgkNakit', 'yemek_sgk_nakit'),
  sec('yolYontem', 'yol_yontem', YOL_YONTEM), sec('yolHesap', 'yol_hesap', HESAP_OPTS), sayi('yolDeger', 'yol_deger'), tutar('yolGvKart', 'yol_gv_kart'),
  sec('yolSgkKart', 'yol_sgk_kart', ['tamami', 'limit', 'tabi']), m('varsayilanTesvik', 'varsayilan_tesvik'),
  sayi('ihbar1', 'ihbar_1'), sayi('ihbar2', 'ihbar_2'), sayi('ihbar3', 'ihbar_3'), sayi('ihbar4', 'ihbar_4'),
  sayi('izin1', 'izin_1'), sayi('izin2', 'izin_2'), sayi('izin3', 'izin_3'), sayi('izinYasMin', 'izin_yas_alt_siniri'),
];

export const PRIM_ALANLARI: readonly Alan[] = [
  m('id', 'kod', { zorunlu: true }), m('ad', 'ad'), sec('tur', 'tur', ['sabit', 'oran', 'maas']), sayi('deger', 'deger'),
  sec('siklik', 'siklik', ['her', 'ceyrek', 'yarim', 'yillik', 'ozel']), m('aylar', 'aylar'), sec('atama', 'atama', ['yok', 'herkes', 'beyaz', 'mavi']),
  mantik('kidem', 'kideme_dahil'),
];
export const TESVIK_ALANLARI: readonly Alan[] = [
  m('id', 'kod', { zorunlu: true }), m('ad', 'ad'), sec('tur', 'tur', ['yok', 'puan', 'asgari', 'sabit']), sayi('deger', 'deger'), m('kanunNo', 'kanun_no'),
];
export const KANAL_ALANLARI: readonly Alan[] = [m('id', 'kod', { zorunlu: true }), m('ad', 'ad'), m('url', 'adres'), m('kod', 'ek_kod'), mantik('aktif', 'aktif')];
export const SORU_SETI_ALANLARI: readonly Alan[] = [m('id', 'kod', { zorunlu: true }), m('ad', 'ad'), m('kategori', 'kategori'), m('odak', 'odak')];
export const GOREV_ALANLARI: readonly Alan[] = [tarih('ertele', 'ertele'), mantik('gizle', 'gizli'), tarih('t', 'tarih')];
export const PLAN_ALANLARI: readonly Alan[] = [tam('yil', 'yil'), sayi('zam1', 'ocak_zammi'), sayi('zam2', 'temmuz_zammi'), mantik('acik', 'acik_pozisyon_dahil')];
export const PLAN_KADRO_ALANLARI: readonly Alan[] = [m('pozisyon', 'pozisyon'), bag('departmanId', 'departman_no', 'dept'), tutar('brut', 'brut'), tam('ay', 'ay'), tam('adet', 'adet')];
export const DONEM_UST_ALANLARI = ['id', 'ad', 'baslangic', 'not', 'params'] as const;

// Ayar gövdesinin bilinen anahtarları: dönem parametreleri üst düzeyde de gelir (uygulama varsayılanlarla birleştirir) ve yazılmaz;
// dönemdeki karşılıkları geçerlidir.
export const AYAR_LISTE_ANAHTARLARI = ['tatiller', 'belgeler', 'perfKriterler', 'mulakatKriterler', 'soruSetleri', 'ilanKanallari', 'gorevler', 'maliyetPlani', 'donemler'] as const;
