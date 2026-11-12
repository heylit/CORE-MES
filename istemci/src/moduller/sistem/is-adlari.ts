import type { Ortam } from '#paylasilan/ortam.ts';

// Zamanlanmış işin kod adı (sunucudaki iş tanımı) yöneticinin okuyacağı ada çevrilir; kod adı ipucunda kalır (destek için).
// Listede olmayan yeni iş kod adıyla görünür: ad uydurulmaz.
const IS_ADLARI: Readonly<Record<string, string>> = {
  'arkon-yansima-yineleyici': 'Üretim Hazırlık: CORE yansımalarını yeniden deneme',
  'arkon-anomali-gunu': 'Üretim Hazırlık: günlük üretim anomalisi',
  'arkon-anomali-olaylari': 'Üretim Hazırlık: gecikme ve teslim riski olayları',
  'arkon-ileti-budama': 'Üretim Hazırlık: eski cihaz iletilerini silme',
  'arkon-km-karar-aynasi': 'Üretim Hazırlık: numune ve ilk parça kararı aktarımı',
  'ayarlar-gece-yedegi': 'Gece yedeği',
  'dosya-temizlik': 'Dosya temizliği',
  'finans-gunluk-skor': 'Finans: günlük sağlık skoru',
  'geometri-hesap': '3D model hesabı',
  'guvenlik-taramasi': 'Güvenlik taraması',
  'kisiler-cikis-pasif': 'İşten çıkan kişiyi pasife alma',
  'logo-malzeme-gonderimi': 'Logo: malzeme kartı gönderimi',
  'logo-satin-alma-gonderimi': 'Logo: satın alma gönderimi',
  'logo-satis-gonderimi': 'Logo: satış gönderimi',
  'logo-malzeme-fisi-gonderimi': 'Logo: malzeme fişi gönderimi',
  'logo-mal-kabul-okumasi': 'Logo: mal kabul okuması',
  'logo-liste-okumasi': 'Logo: liste okuması',
  'logo-fatura-okumasi': 'Logo: fatura okuması',
  'logo-malzeme-karti-okumasi': 'Logo: malzeme kartı okuması',
  'logo-stok-okumasi': 'Logo: stok okuması',
  'logo-kullanim-okumasi': 'Logo: malzeme kullanım okuması',
  'nizamiye-pdks-ham-temizlik': 'Kart okuyucu ham kayıt temizliği',
  'oturum-cihaz-temizligi': 'Eski oturum cihaz bilgisi temizliği',
  'proje-maliyet-defteri': 'Proje maliyet defteri',
  'rota-karttan-taslak': 'Onaylı karttan rota taslağı',
  'saglik-metrik': 'Sistem ölçümleri',
  'smartes-okuma-is-emri-durumu': 'SmartES: iş emri durumu okuması',
  'smartes-okuma-durus': 'SmartES: duruş okuması',
  'smartes-okuma-alarm': 'SmartES: alarm okuması',
  'smartes-okuma-red': 'SmartES: red okuması',
  'smartes-okuma-ambar': 'SmartES: ambar okuması',
  'smartes-okuma-kalite': 'SmartES: kalite okuması',
  'smartes-is-emri-gonderimi': 'SmartES: iş emri gönderimi',
  'smartes-tanim-gonderimi': 'SmartES: tanım gönderimi',
  'stok-yolda-suresi': 'Stok: süresi dolan yoldaki teslimler',
  'bildirim-yayin-dagit': 'Bildirim: ileri tarihli bildirimleri dağıtma',
  'bildirim-push-gonder': 'Bildirim: anlık bildirim gönderimi',
  'denetim-okuma-saklama': 'Denetim: süresi dolan okuma kayıtlarını silme',
  'logo-malzeme-kodu-okumasi': 'Logo: malzeme kodu okuması',
  'oturum-nabiz-temizligi': 'Eski cihaz nabzı temizliği',
  'stok-defter-karsilastirma': 'Stok: gece defter karşılaştırması',
};

export const isAdi = (kod: string): string => IS_ADLARI[kod] ?? kod;

const ORTAM_ADLARI: Readonly<Record<Ortam, string>> = { gelistirme: 'Geliştirme', test: 'Test', canli: 'Canlı' };

export const ortamAdi = (ortam: Ortam): string => ORTAM_ADLARI[ortam];
