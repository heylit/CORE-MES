import type { AyarTanimi } from '../ayar-tanimi.ts';

const NUMARA_ACIKLAMASI = 'Yeni kaydın numarası; var olan numaralar değişmez. Sayaç ay ya da yıl kalıpta varsa o dönemde sıfırlanır.';

// 2432: hatırlatmalar (2432-1 a: hepsi varsayılan günlerle açık). Boş değer o hatırlatmayı kapatır; kapatılınca açık olanlar da kapanır.
// Tarih hatırlatmaları takvim günü, bekleme hatırlatmaları iş günü sayar (2432 V1: alıcının çalışma günleri).
const hatirlatma = (varsayilan: number, enAz: number, baslik: string, aciklama: string) => ({
  modul: 'satin-alma', tur: 'sayi', varsayilan, enAz, enCok: 90, ondalik: 0, baslik: `Hatırlatma: ${baslik}`,
  aciklama: `${aciklama} Boş bırakılırsa bu hatırlatma kapalıdır.`,
}) as const;

const SATIN_ALMA_HATIRLATMA_AYARLARI = {
  'satin-alma.hatirlatma-ihtiyac-yaklasiyor': hatirlatma(7, 0, 'ihtiyaç tarihi yaklaşıyor (gün)',
    'Sipariş verilmemiş talebin ihtiyaç tarihine bu kadar gün ya da daha az kaldığında satın almaya hatırlatılır.'),
  'satin-alma.hatirlatma-taslak-bekliyor': hatirlatma(2, 1, 'taslakta bekleyen talep (iş günü)',
    'Teklif istenmemiş taslak talep bu kadar iş günü beklediğinde satın almaya hatırlatılır.'),
  'satin-alma.hatirlatma-teklif-cevapsiz': hatirlatma(3, 1, 'cevapsız teklif isteği (iş günü)',
    'Teklif istenen tedarikçiden bu kadar iş günü teklif gelmediğinde satın almaya hatırlatılır.'),
  'satin-alma.hatirlatma-teklif-gecerlilik': hatirlatma(3, 0, 'teklif geçerliliği bitiyor (gün)',
    'Karar verilmemiş talepte teklifin geçerliliğinin bitmesine bu kadar gün ya da daha az kaldığında satın almaya hatırlatılır.'),
  'satin-alma.hatirlatma-degerlendirme-bekliyor': hatirlatma(3, 1, 'değerlendirmede bekleyen talep (iş günü)',
    'Değerlendirmedeki talep bu kadar iş günü beklediğinde satın almaya hatırlatılır.'),
  'satin-alma.hatirlatma-onay-bekliyor': hatirlatma(2, 1, 'onayda bekleyen talep (iş günü)',
    'Onaydaki talep bu kadar iş günü karar beklediğinde onaylayanlara hatırlatılır.'),
  'satin-alma.hatirlatma-siparis-bekliyor': hatirlatma(1, 0, 'onaylandı, sipariş verilmedi (gün)',
    'Onaylanan talebe bu kadar gün sipariş verilmediğinde ya da kur kilidinin bitmesine iki gün kaldığında satın almaya hatırlatılır.'),
  'satin-alma.hatirlatma-teslim-yaklasiyor': hatirlatma(3, 0, 'teslim yaklaşıyor (gün)',
    'Açık siparişin beklenen teslimine bu kadar gün ya da daha az kaldığında satın almaya hatırlatılır.'),
  'satin-alma.hatirlatma-teslim-gecikti': hatirlatma(0, 0, 'teslim gecikti (gün)',
    'Açık siparişin beklenen teslimi bu kadar gün geçtiğinde satın almaya hatırlatılır; 0 gecikmenin ilk günüdür.'),
  'satin-alma.hatirlatma-teslim-gecikti-yonetici': hatirlatma(3, 0, 'teslim gecikti, yöneticiye (gün)',
    'Açık siparişin beklenen teslimi bu kadar gün geçtiğinde satın alma yöneticisine (satın alma ayar yetkisi) hatırlatılır.'),
} as const satisfies Record<string, AyarTanimi>;

export const SATIN_ALMA_AYARLARI = {
  'satin-alma.dort-goz': {
    modul: 'satin-alma',
    tur: 'boolean',
    varsayilan: true,
    baslik: 'Satın alma kararlarında dört göz kuralı',
    aciklama: 'Açıkken kararı veren kişi o kararı, talebi açan ya da talep eden kişi o talebi onaylayamaz. Kapalıyken verilen onay kayıtta dört gözsüz olarak işaretlenir.',
  },
  'satin-alma.onay-kademesi': {
    modul: 'satin-alma',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Satın alma onay basamakları',
    aciklama: 'Açıkken karar tutarına düşen onay basamağının rolü (ya da üst basamağın rolü) olmayan kişi kararı onaylayamaz; reddetmek serbesttir. Basamağın rolü boşsa onaylama yetkisi yeter. Kapalıyken onaylama yetkisi olan herkes onaylar.',
  },
  'satin-alma.talep-no': {
    modul: 'satin-alma', tur: 'numara', varsayilan: 'ST-{YYYY}-{SAYAC:3}', alanlar: [], baslik: 'Satın alma talebi numarası',
    aciklama: NUMARA_ACIKLAMASI,
  },
  'satin-alma.siparis-no': {
    modul: 'satin-alma', tur: 'numara', varsayilan: 'SP-{YYYY}-{SAYAC:3}', alanlar: [], baslik: 'Satın alma siparişi numarası',
    aciklama: NUMARA_ACIKLAMASI,
  },
  ...SATIN_ALMA_HATIRLATMA_AYARLARI,
} as const satisfies Record<string, AyarTanimi>;
