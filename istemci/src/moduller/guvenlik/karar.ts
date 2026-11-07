import type { Alarm, AyarDenetimiCevabi, KorumaCevabi, KorumaDurumu, OzetCevabi, Sinyal } from '#paylasilan/sozlesme/guvenlik.ts';
import type { SaglikKarari } from '../sistem/disari.ts';
import { DURUM_ADI, NE_YAPILIR, ONEM_ADI, kaynakMetni, saatMetni, zamanMetni } from './gorunum.ts';

// Sistem ve Güvenlik sayfasının kararları (2231): her konu üç soruya cevap verir (ne oldu, ne demek, ne yapmalı), en önemlisi
// üstte. Alarm, koruma ve sağlık uyarısı sunucudandır; burada yalnız yöneticinin diline çevrilir, yeni kural yoktur.
export interface Karar extends SaglikKarari {
  alan: 'Sistem' | 'Güvenlik';
  // Alarmdan gelen kararda alarmın kendisi: düğme ayrıntıyı (onayla, kapat) açar.
  alarm: Alarm | null;
}

const SUNUCUNUN_KENDISI = new Set(['127.0.0.1', '::1']);

interface SinyalMetni { baslik: (a: Alarm) => string; anlam: string; git: Karar['git'] }

const kim = (a: Alarm): string => a.kisiAdi ?? a.kullaniciAdi ?? 'Bir kullanıcı';
const GIRISLER = { yol: '/guvenlik/girisler', metin: 'Girişleri gör', simge: 'login' } as const;
const OTURUMLAR = { yol: '/guvenlik/oturumlar', metin: 'Oturumları gör', simge: 'users' } as const;
const ISTEKLER = { yol: '/guvenlik/reddedilen', metin: 'İstekleri gör', simge: 'eye' } as const;

const SINYAL_METNI: Record<Sinyal, SinyalMetni> = {
  'hatali-giris-serisi': {
    baslik: (a) => `${kim(a)} art arda yanlış parola girdi`,
    anlam: 'Kişi parolasını ya da PIN\'ini unutmuş olabilir; ya da biri bu hesabın parolasını tahmin etmeye çalışıyor.', git: GIRISLER,
  },
  'yayilan-deneme': {
    baslik: () => 'Bir cihaz birçok hesabı deniyor',
    anlam: 'Tek cihazdan farklı adlarla giriş denenmesi, parola tahmin eden bir programın izidir.', git: GIRISLER,
  },
  'hedefli-hesap': {
    baslik: (a) => `${kim(a)} hesabına birçok cihazdan giriş deneniyor`,
    anlam: 'Bir hesaba farklı cihazlardan giriş denenmesi, hesabın hedef alındığını gösterebilir.', git: GIRISLER,
  },
  'cok-oturum': {
    baslik: (a) => `${kim(a)} aynı anda ${a.gozlenenSayi} yerde açık`,
    anlam: 'Telefon ve bilgisayar birlikte 2-3 oturum normaldir. Fazlası kapatılmamış eski tarayıcılar ya da hesabın başkasıyla paylaşılması olabilir.',
    git: OTURUMLAR,
  },
  'hesap-kilidi': {
    baslik: (a) => `${kim(a)} hesabı kilitlendi`,
    anlam: 'Art arda yanlış girişten sonra hesap bir süre kilitlendi; kişi o sürede giremez.', git: OTURUMLAR,
  },
  'yetki-reddi-serisi': {
    baslik: (a) => `${kim(a)} yetkisi olmayan işlemleri deniyor`,
    anlam: 'Kişi yetkisi olmayan ekranları ya da işlemleri tekrar tekrar açmaya çalıştı; yanlış bağlantı da olabilir, bilinçli deneme de.', git: ISTEKLER,
  },
  'adres-taramasi': {
    baslik: () => 'Biri sistemde olmayan sayfaları yokluyor',
    anlam: 'Bir program ya da kişi sistemde açık kapı arıyor olabilir.', git: ISTEKLER,
  },
};

export function alarmKarari(a: Alarm): Karar {
  const m = SINYAL_METNI[a.sinyal];
  const ayniAn = a.ilkGoruldu === a.sonGoruldu;
  const zaman = ayniAn ? zamanMetni(a.sonGoruldu) : `${zamanMetni(a.ilkGoruldu)} ile ${saatMetni(a.sonGoruldu)} arasında`;
  const kendisi = a.ip !== null && SUNUCUNUN_KENDISI.has(a.ip);
  return {
    anahtar: `alarm:${a.id}`,
    alan: 'Güvenlik',
    ton: a.onem === 'orta' ? 'uyari' : 'hata',
    onem: a.onem === 'kritik' ? 'Kritik' : a.onem === 'yuksek' ? 'Önemli' : 'Orta',
    baslik: m.baslik(a),
    ne: `${kaynakMetni(a)} · ${zaman} ${a.gozlenenSayi} kez.${a.durum === 'onaylandi' ? ` ${DURUM_ADI.onaylandi}; kapatılmayı bekliyor.` : ''}`,
    // Sunucunun kendi adresi dışarıdan saldırı değildir; çoğu zaman sunucuda çalışan bir araçtır. Yönetici bunu bilmeden karar veremez.
    anlam: kendisi
      ? 'İstek sunucunun kendisinden geliyor; genelde sunucuda çalışan bir bakım ya da test aracıdır, dışarıdan saldırı değildir.'
      : m.anlam,
    oneri: NE_YAPILIR[a.sinyal].slice(0, 2).join(' '),
    git: m.git,
    alarm: a,
  };
}

// Koruma maddelerinden yalnız kapatılması yöneticinin elinde olanlar karar olur: şifreli bağlantı, sertifika, duran tarama.
// Yedek sağlık uyarısından gelir (iki kez yazılmaz).
export function korumaKararlari(k: KorumaCevabi): Karar[] {
  const bul = (anahtar: string) => k.maddeler.find((m) => m.anahtar === anahtar);
  const sonuc: Karar[] = [];
  const https = bul('https');
  if (https?.durum === 'kapali') {
    sonuc.push({
      anahtar: 'koruma:https', alan: 'Güvenlik', ton: 'uyari', onem: 'Önemli', alarm: null, git: null,
      baslik: 'Bağlantı şifrelenmiyor (HTTPS kapalı)', ne: https.aciklama,
      anlam: 'Aynı ağdaki biri giriş parolalarını ve ekrandaki verileri okuyabilir. Telefonlarda "uygulama olarak yükle" de çalışmaz.',
      oneri: 'Bilgi işlemle sunucuya sertifika kurun; adımlar kurulum/https.md belgesinde.',
    });
  }
  const sertifika = bul('sertifika');
  if (https?.durum !== 'kapali' && (sertifika?.durum === 'uyari' || sertifika?.durum === 'kapali')) {
    sonuc.push({
      anahtar: 'koruma:sertifika', alan: 'Güvenlik', ton: sertifika.durum === 'kapali' ? 'hata' : 'uyari', onem: 'Önemli', alarm: null, git: null,
      baslik: 'Sertifikanın süresi doluyor', ne: sertifika.aciklama,
      anlam: 'Süresi dolunca tarayıcılar bağlantıyı güvensiz sayar ve kullanıcılar uyarı ekranında kalır.',
      oneri: 'Bilgi işlemden sertifikayı süresi dolmadan yenilemesini isteyin.',
    });
  }
  const tarama = bul('tarama');
  if (tarama !== undefined && tarama.durum !== 'acik' && tarama.durum !== 'bilinmiyor') {
    sonuc.push({
      anahtar: 'koruma:tarama', alan: 'Güvenlik', ton: 'hata', onem: 'Kritik', alarm: null,
      baslik: 'Güvenlik taraması durdu', ne: tarama.aciklama,
      anlam: 'Tarama durunca yeni parola denemeleri ve şüpheli istekler alarm açmaz.',
      oneri: 'Bilgi işleme iletin; sunucunun son hataları Koruma durumu sayfasında.',
      git: { yol: '/guvenlik/koruma', metin: 'Koruma durumu', simge: 'check' },
    });
  }
  return sonuc;
}

const ONEM_SIRASI: Record<Karar['onem'], number> = { Kritik: 0, Önemli: 1, Orta: 2 };
const TON_SIRASI: Record<Karar['ton'], number> = { hata: 0, uyari: 1 };

export const kararSirasi = (k: readonly Karar[]): Karar[] =>
  [...k].sort((a, b) => ONEM_SIRASI[a.onem] - ONEM_SIRASI[b.onem] || TON_SIRASI[a.ton] - TON_SIRASI[b.ton]);

export interface KorumaSatiri { anahtar: string; ad: string; ne: string; durum: KorumaDurumu; ayrinti: string }

// Her koruma tek cümleyle neyden koruduğunu söyler; sunucunun açıklaması (neden kapalı) ayrıntıda kalır.
const KORUMA_METNI: Readonly<Record<string, { ad: string; ne: string }>> = {
  tarama: { ad: 'Güvenlik taraması', ne: 'Giriş ve oturumlar dakikada bir denetlenir.' },
  'hesap-kilidi': { ad: 'Hesap kilidi', ne: 'Art arda yanlış parola girilince ad bir süre kilitlenir.' },
  denetim: { ad: 'Değişiklik kaydı', ne: 'Kim neyi ne zaman değiştirdi, silinemez biçimde tutulur.' },
  yedek: { ad: 'Yedek', ne: 'Veriler her gece başka bir diske kopyalanır.' },
  'geri-yukleme': { ad: 'Yedekten geri dönme denemesi', ne: 'Yedeğin gerçekten açıldığı denenir.' },
  https: { ad: 'Şifreli bağlantı', ne: 'Parolalar ve ekrandaki veriler ağda şifreli gider.' },
  sertifika: { ad: 'Sertifika süresi', ne: 'Şifreli bağlantının sertifikası süresi dolmadan yenilenir.' },
  'guncelleme-imzasi': { ad: 'İmzalı güncelleme', ne: 'Yalnız imzası doğrulanan güncelleme paketi yüklenir.' },
};

const AYAR_KORUMASI: Record<AyarDenetimiCevabi['maddeler'][number]['durum'], KorumaDurumu> = {
  uygun: 'acik', uyari: 'uyari', hata: 'kapali', bilgi: 'bilinmiyor', bilinmiyor: 'bilinmiyor',
};

// Açık olanlar üstte değil, kapalılar üstte: yönetici önce eksik korumayı görür.
const KORUMA_SIRASI: Record<KorumaDurumu, number> = { kapali: 0, uyari: 1, bilinmiyor: 2, acik: 3 };

export function korumaListesi(k: KorumaCevabi | null, ayar: AyarDenetimiCevabi | null): KorumaSatiri[] {
  const satirlar: KorumaSatiri[] = (k?.maddeler ?? []).map((m) => ({
    anahtar: m.anahtar, ad: KORUMA_METNI[m.anahtar]?.ad ?? m.baslik, ne: KORUMA_METNI[m.anahtar]?.ne ?? m.aciklama, durum: m.durum, ayrinti: m.aciklama,
  }));
  const deneme = ayar?.maddeler.find((m) => m.anahtar === 'geri-yukleme');
  if (deneme !== undefined) {
    const metin = KORUMA_METNI['geri-yukleme'];
    satirlar.push({ anahtar: 'geri-yukleme', ad: metin?.ad ?? deneme.baslik, ne: metin?.ne ?? deneme.aciklama, durum: AYAR_KORUMASI[deneme.durum], ayrinti: deneme.aciklama });
  }
  return satirlar.sort((a, b) => KORUMA_SIRASI[a.durum] - KORUMA_SIRASI[b.durum]);
}

export interface Olay { anahtar: string; zaman: string | null; ton: 'tamam' | 'uyari' | 'hata' | 'pasif'; baslik: string; alt: string }

const GUN_MS = 86_400_000;

// Son 24 saat: alarmlar, sunucunun açılışı ve girişlerin özeti. Zamanı olan en yeniden eskiye, özet en sonda.
export function olayAkisi(o: OzetCevabi, calismaSuresiSn: number | null, simdi: Date): Olay[] {
  const olaylar: Olay[] = o.sonAlarmlar
    .filter((a) => simdi.getTime() - new Date(a.sonGoruldu).getTime() <= GUN_MS)
    .map((a) => ({
      anahtar: `alarm:${a.id}`, zaman: a.sonGoruldu, ton: a.durum === 'kapandi' ? 'pasif' : a.onem === 'orta' ? 'uyari' : 'hata',
      baslik: SINYAL_METNI[a.sinyal].baslik(a), alt: `${ONEM_ADI[a.onem]} alarm · ${DURUM_ADI[a.durum]}`,
    }));
  if (calismaSuresiSn !== null && calismaSuresiSn * 1000 <= GUN_MS) {
    olaylar.push({
      anahtar: 'acilis', zaman: new Date(simdi.getTime() - calismaSuresiSn * 1000).toISOString(), ton: 'pasif',
      baslik: 'Sunucu yeniden açıldı', alt: 'Kapanma nedeni sunucu günlüğündedir.',
    });
  }
  olaylar.sort((a, b) => (b.zaman ?? '').localeCompare(a.zaman ?? ''));
  const g = o.girisler;
  olaylar.push({
    anahtar: 'girisler', zaman: null, ton: g.hatali > 0 ? 'uyari' : 'tamam',
    baslik: `${g.basarili} başarılı, ${g.hatali} hatalı giriş`, alt: `${g.kullaniciAdi} ad, ${g.cihaz} cihaz`,
  });
  return olaylar;
}
