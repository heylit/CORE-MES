import type { AyarTanimi } from '../ayar-tanimi.ts';
import { EPOSTA_KIPLERI, EPOSTA_KIP_ADLARI } from '../sozlesme/eposta-sabitleri.ts';

// E-posta kanalı (ADR 0015 md 5, 3397): gönderim yalnız ortam değişkeni tanımlıyken VE bu ayar açıkken çıkar; kapalıyken kuyruk birikir.
// Sunucu adresi, alan adları, gönderen adres ve parola burada değil ortam değişkenindedir.
export const BILDIRIM_AYARLARI = {
  'bildirim.eposta': {
    modul: 'bildirim',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'E-posta gönderimi',
    aciklama: 'Açıkken bildirimler seçili posta sunucusundan e-postayla da gider. Kapalıyken e-postalar kuyrukta birikir, gönderilmez. Sunucu adresi ortam değişkeninde yoksa açık olsa da gönderilmez.',
  },
  'bildirim.eposta-kipi': {
    modul: 'bildirim',
    tur: 'secim',
    varsayilan: 'dis-servis',
    secenekler: EPOSTA_KIPLERI.map((k) => ({ deger: k, etiket: EPOSTA_KIP_ADLARI[k] })),
    baslik: 'Posta sunucusu türü',
    aciklama: 'Kurum içi sunucu ve yerel aktarıcı TMIV2_POSTA_SUNUCUSU adresini (kurum içi IP), dış posta servisi TMIV2_POSTA_DIS_SUNUCUSU adresini kullanır. Adresler sunucunun ortam ayarındadır; seçili türün adresi yoksa e-posta gönderilmez. Dış serviste TLS ve kullanıcı/parola zorunludur.',
  },
  'bildirim.eposta-gonderen-adi': {
    modul: 'bildirim',
    tur: 'metin',
    varsayilan: 'CORE MES',
    enUzun: 60,
    baslik: 'E-posta gönderen adı',
    aciklama: 'Alıcının posta programında "Kimden" olarak gördüğü ad. Gönderen adres sunucunun ortam ayarındadır.',
  },
  'bildirim.eposta-gunluk-en-cok': {
    modul: 'bildirim',
    tur: 'sayi',
    varsayilan: 40,
    enAz: 1,
    enCok: 500,
    ondalik: 0,
    baslik: 'Kişi başına günde en çok e-posta',
    aciklama: 'Sınırı aşan e-postalar o gün gönderilmez, ertesi sabahın özetine katılır. Boş bırakılırsa sınır yoktur.',
  },
  'bildirim.eposta-sessiz-baslangic': {
    modul: 'bildirim',
    tur: 'sayi',
    varsayilan: 22,
    enAz: 0,
    enCok: 23,
    ondalik: 0,
    baslik: 'Sessiz saatler başlangıcı',
    aciklama: 'Bu saatten bitiş saatine kadar e-posta bekletilir; acil önemdeki olaylar beklemez. Başlangıç ya da bitiş boşsa sessiz saat yoktur.',
  },
  'bildirim.eposta-sessiz-bitis': {
    modul: 'bildirim',
    tur: 'sayi',
    varsayilan: 7,
    enAz: 0,
    enCok: 23,
    ondalik: 0,
    baslik: 'Sessiz saatler bitişi',
    aciklama: 'Sessiz saatlerin bittiği saat (tesis saatiyle).',
  },
  'bildirim.eposta-ozet-saati': {
    modul: 'bildirim',
    tur: 'sayi',
    varsayilan: 7,
    enAz: 0,
    enCok: 23,
    ondalik: 0,
    baslik: 'Günlük özet saati',
    aciklama: 'Tetikleyicisi "Günlük özet" olan olaylar ve günlük sınırı aşanlar her gün bu saatte tek e-postada toplanır (tesis saatiyle).',
  },
  'bildirim.eposta-uygulama-adresi': {
    modul: 'bildirim',
    tur: 'metin',
    varsayilan: '',
    enUzun: 200,
    bosOlabilir: true,
    baslik: 'Uygulama adresi',
    aciklama: 'E-postadaki "Kayda git" bağlantısının başı (örneğin http://10.0.0.40:4100). Boşsa e-postada bağlantı olmaz.',
  },
} as const satisfies Record<string, AyarTanimi>;
