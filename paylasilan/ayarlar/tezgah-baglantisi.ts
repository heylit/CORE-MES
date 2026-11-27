import type { AyarTanimi } from '../ayar-tanimi.ts';
import { LSV2_LISTESI_EN_UZUN } from '../lsv2-makineleri.ts';

// Deneme (kart 3373, ADR 0033): kapalıyken ya da TMIV2_TEZGAH_MTCONNECT_ADRESI yokken hiçbir istek atılmaz.
export const TEZGAH_BAGLANTISI_AYARLARI = {
  'tezgah-baglantisi.okuma': {
    modul: 'tezgah-baglantisi',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Tezgâh bağlantısı okuması (deneme)',
    aciklama: 'Açıkken tezgahların ortak MTConnect servisinden anlık değerler her okuma aralığında (varsayılan 5 saniye), yalnız okunarak alınır ve Tezgâh bağlantısı (deneme) ekranında SmartES değerleriyle yan yana gösterilir. Tezgaha komut gitmez; üretim kaydına, sayıma ve stoğa hiçbir şey işlenmez. Servis adresi sunucunun ortam değişkeninde yoksa açık olsa da istek atılmaz.',
  },
  // Servis başka sistemleri de besleyebilir: kod değiştirmeden yavaşlatılabilsin (kart 3659). Art arda hatada aralık kendiliğinden uzar.
  'tezgah-baglantisi.okuma-araligi': {
    modul: 'tezgah-baglantisi',
    tur: 'sayi',
    varsayilan: 5,
    enAz: 5,
    enCok: 60,
    ondalik: 0,
    baslik: 'Tezgâh bağlantısı okuma aralığı (saniye)',
    aciklama: 'Tezgâh servisinin iki okuma turu arasındaki süre. Servis başka sistemleri de besliyorsa yükseltin. Art arda hatada aralık 60 saniyeye kadar ikiye katlanarak uzar, başarılı turda bu değere döner. Okuma kapalıyken etkisizdir.',
  },
  // Kart 3680: değer geçmişi tablosunun üst sınırı; aşılınca temizlikte en eski satırlar silinir ve veri boşluğu kaydı yazılır.
  'tezgah-baglantisi.satir-siniri': {
    modul: 'tezgah-baglantisi',
    tur: 'sayi',
    varsayilan: 2_000_000,
    // Yanlışlıkla düşük değer son 24 saati siler: alt sınır 100.000.
    enAz: 100_000,
    enCok: 100_000_000,
    ondalik: 0,
    baslik: 'Tezgâh değer geçmişi satır sınırı',
    aciklama: 'Tezgâh değer geçmişi tablosunun en çok satır sayısı. Temizlikte önce 24 saatten eski satırlar silinir; sınır yine aşılıyorsa en eski satırlar silinir ve zaman çizelgesine "satır sınırı" veri boşluğu yazılır. Doluluk, Tezgâh bağlantısı (deneme) ekranının üstünde görünür. Okuma kapalıyken etkisizdir.',
  },
  // Kart 3753: Heidenhain kumandalarını LSV2 ile doğrudan okur. Makine listesi ortam değişkenindedir; liste boşken açık olsa da bağlantı açılmaz.
  'tezgah-baglantisi.lsv2-okuma': {
    modul: 'tezgah-baglantisi',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Heidenhain okuması',
    aciklama: 'Açıkken Heidenhain kontrollü tezgâhlar LSV2 ile (TCP 19000) okuma aralığında, yalnız okunarak sorgulanır: durum, program ve tümce numarası, oranlar, alarm, iş milindeki takım, eksen konumları, kumanda sürümü ve ayarda adresi verilmişse parça sayacı. Makineye komut, dosya ya da PLC yazması gitmez; parola gönderilmez. Makine bağlantıyı reddederse (kapalı ya da SmartES tutuyor) zorlanmaz, sonra yeniden denenir. "Heidenhain makineleri" listesi boşsa açık olsa da bağlantı açılmaz.',
  },
  // Kart 3753 (kullanıcı kararı: PLCDEBUG, koşullu): sayaç için kumandaya PLCDEBUG girişi yapılır; bu düzey PLC yazmayı da açar.
  'tezgah-baglantisi.lsv2-plc-sayaci': {
    modul: 'tezgah-baglantisi',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'PLC sayacı okuması',
    aciklama: 'Dikkat: bu okuma kumandada yazma yetkisi de açan PLCDEBUG giriş düzeyini kullanır; CORE yalnız ayardaki sayaç adresini okuyabilir, yazma ve kontrol komutu gönderemez. Açıkken, makine listesinde sayaç adresi verilmiş makinelerde parça sayacı PLC belleğinden okunur: parolasız giriş yalnız sayaç okunurken açıktır, okunduktan hemen sonra çıkılır. Kapalıyken giriş hiç yapılmaz, sayaç boş kalır. "Heidenhain okuması" anahtarından bağımsızdır; o kapalıyken etkisizdir. İlk açılış deneme kurulumunda tek makinede yapılır.',
  },
  // Kart 3757: makine listesi ortam değişkeni yerine burada; yalnız yönetici değiştirir, değişiklik denetim kaydına yazılır.
  'tezgah-baglantisi.lsv2-makineleri': {
    modul: 'tezgah-baglantisi',
    tur: 'metin',
    varsayilan: '',
    enUzun: LSV2_LISTESI_EN_UZUN,
    bosOlabilir: true,
    bicim: 'lsv2-makineleri',
    baslik: 'Heidenhain makineleri',
    aciklama: 'Makine kodu SmartES\'tekiyle aynı olmalı. Yalnız kurum içi IP; kapı her zaman 19000. Sayaç adresi isteğe bağlı (D ve 4\'ün katı). Kaydedince sonraki okumada geçerli olur; değişiklik denetim kaydına yazılır. Liste boşsa bağlantı açılmaz.',
  },
  // Kart 3790: takım tablosu FILE giriş düzeyi ister; bu düzey kumandada yazmayı da açtığı için ayrı anahtar, varsayılan kapalı.
  'tezgah-baglantisi.lsv2-seyrek-okuma': {
    modul: 'tezgah-baglantisi',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Heidenhain seyrek okuma (takım tablosu)',
    aciklama: 'Dikkat: bu okuma kumandada dosya yazmayı da açan FILE giriş düzeyini kullanır; CORE yalnız takım tablosunu (TOOL.T) okuyabilir, dosya yükleyemez, silemez, NC programı okumaz. Açıkken takım tablosu seyrek okuma aralığında okunur: parolasız giriş yalnız tablo okunurken açıktır, okunduktan hemen sonra çıkılır. Geçmişe yalnız ömür ve kilit değişikliği yazılır. Kapalıyken giriş hiç yapılmaz. "Heidenhain okuması" kapalıyken etkisizdir.',
  },
  'tezgah-baglantisi.lsv2-seyrek-aralik-dk': {
    modul: 'tezgah-baglantisi',
    tur: 'sayi',
    varsayilan: 10,
    enAz: 2,
    enCok: 240,
    ondalik: 0,
    baslik: 'Heidenhain seyrek okuma aralığı (dakika)',
    aciklama: 'Takım tablosunun iki okuması arasındaki süre. Seyrek okuma kapalıyken etkisizdir.',
  },
} as const satisfies Record<string, AyarTanimi>;
