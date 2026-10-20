import type { AyarTanimi } from '../ayar-tanimi.ts';

// Kabuğun ayarları: değeri sunucuda ayarlar modülü verir, istemcide kabuk okur.
export const KABUK_AYARLARI = {
  // Kullanıcı kararı (kart #837): girişten sonra herkese karşılama, varsayılanı açık.
  'kabuk.karsilama': {
    modul: 'kabuk',
    tur: 'boolean',
    varsayilan: true,
    baslik: 'Açılışta karşılama mesajı',
    aciklama: 'Açıkken oturum açan herkes, oturumun ilk açılışında adıyla birlikte karşılama mesajını görür. Kapalıyken hiç çıkmaz.',
  },
  'kabuk.karsilama-metni': {
    modul: 'kabuk',
    tur: 'metin',
    varsayilan: 'Hoş geldin, iyi mesailer',
    enUzun: 120,
    baslik: 'Karşılama metni',
    aciklama: 'Karşılama mesajında kişinin adının üstünde görünen metin.',
  },
  // Kullanıcı isteği (2026-10-14): belli saatten sonra açanlar gece temalı karşılamayı görür; varsayılan gündüz 06-18, gece 18-06.
  'kabuk.karsilama-gece-metni': {
    modul: 'kabuk',
    tur: 'metin',
    varsayilan: 'İyi akşamlar, iyi mesailer',
    enUzun: 120,
    baslik: 'Gece karşılama metni',
    aciklama: 'Gece saatlerinde açanların karşılama mesajında, kişinin adının üstünde görünen metin.',
  },
  'kabuk.gunduz-baslangic': {
    modul: 'kabuk',
    tur: 'sayi',
    varsayilan: 6,
    enAz: 0,
    enCok: 23,
    ondalik: 0,
    baslik: 'Gündüz karşılamasının başladığı saat',
    aciklama: 'Bu saatten gece başlangıcına kadar açanlar güneşli karşılamayı görür (0-23, tesis saati). Boşsa 6 sayılır; gece başlangıcıyla aynıysa gece karşılaması hiç çıkmaz.',
  },
  'kabuk.gece-baslangic': {
    modul: 'kabuk',
    tur: 'sayi',
    varsayilan: 18,
    enAz: 0,
    enCok: 23,
    ondalik: 0,
    baslik: 'Gece karşılamasının başladığı saat',
    aciklama: 'Bu saatten gündüz başlangıcına kadar açanlar ay ve yıldızlı karşılamayı görür (0-23, tesis saati). Boşsa 18 sayılır.',
  },
  // Kullanıcı onayı (kart #880): modül başlıkları kurumun adını buradan okur; varsayılan sistemin kendi adıdır.
  'kabuk.kurum-adi': {
    modul: 'kabuk',
    tur: 'metin',
    varsayilan: 'TMI',
    enUzun: 80,
    baslik: 'Firma adı',
    aciklama: 'Modül başlıklarında ve belgelerde görünen kurum adı.',
  },
  // Kullanıcı kararı (2026-10-14): bütün hareket seviyeleri ve açılışlar ayardan seçilir; performansa göre kalıcısı sonra seçilir.
  'kabuk.hareket': {
    modul: 'kabuk',
    tur: 'secim',
    varsayilan: 'orta',
    secenekler: [
      { deger: 'kapali', etiket: 'Kapalı' },
      { deger: 'sade', etiket: 'Sade' },
      { deger: 'orta', etiket: 'Orta' },
      { deger: 'cesur', etiket: 'Cesur' },
      { deger: 'ultra', etiket: 'Ultra' },
    ],
    baslik: 'Hareket dili',
    aciklama: 'Sayfa geçişleri, paneller ve listelerin ne kadar hareketli olduğu. Kapalı hiçbir geçiş ve animasyon oynatmaz, açılış gösterisini de kapatır; sade en hafif hareketlidir; performans modu açık cihazda her zaman sade çalışır.',
  },
  'kabuk.acilis': {
    modul: 'kabuk',
    tur: 'secim',
    varsayilan: 'yok',
    secenekler: [
      { deger: 'yok', etiket: 'Kapalı' },
      { deger: 'tezgah', etiket: 'Tezgah kalkışı' },
      { deger: 'talas', etiket: 'Talaş montajı' },
      { deger: 'lazer', etiket: 'Lazer kesim' },
      { deger: 'cmm', etiket: 'Ölçüm (CMM)' },
      { deger: 'dokum', etiket: 'Döküm' },
      { deger: '3b', etiket: '3B ekstrüzyon' },
      { deger: 'rastgele', etiket: 'Rastgele' },
    ],
    baslik: 'Açılış gösterisi',
    aciklama: 'Her girişte ve her çıkışta kurum logosuyla oynayan kısa gösteri. Dokununca geçilir; performans modu açık cihazda oynamaz.',
  },
  'kabuk.acilis-suresi': {
    modul: 'kabuk',
    tur: 'sayi',
    varsayilan: 2,
    enAz: 0.5,
    enCok: 5,
    ondalik: 1,
    baslik: 'Açılış süresi (sn)',
    aciklama: 'Açılış gösterisinin saniye cinsinden süresi; gösteri bu süreye sığacak kadar hızlanır ya da yavaşlar.',
  },
  'kabuk.gecis-hizi': {
    modul: 'kabuk',
    tur: 'secim',
    varsayilan: 'normal',
    secenekler: [
      { deger: 'hizli', etiket: 'Hızlı' },
      { deger: 'normal', etiket: 'Normal' },
      { deger: 'yavas', etiket: 'Yavaş' },
    ],
    baslik: 'Geçiş hızı',
    aciklama: 'Sayfa geçişleri ve panellerin hızı; hareket dilinin sürelerini kısaltır ya da uzatır.',
  },
} as const satisfies Record<string, AyarTanimi>;
