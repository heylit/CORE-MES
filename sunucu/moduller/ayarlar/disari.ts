export { numaraAl, sistemAyariOku, type NumaraIstegi } from './servis.ts';
// Paket üretici (araclar/paket-yap.ts) biçimi buradan alır; doğrulayan kodla aynı kaynak.
export { AZAMI_DEGISIKLIK, AZAMI_DEGISIKLIK_METNI, PAKET_IMLECI, paketBasliginiCoz, ortakAnahtar } from './kurallar.ts';
// Güncelleyici (araclar/guncelleyici.ts) istek, sonuç ve çalışan sürüm dosyalarını ve geri gitme kuralını buradan alır (kart #1210).
export {
  CALISAN_SURUM_DOSYASI, GUNCELLEYICI_DOSYASI, SURUMLER_KLASORU, UYGULAMA_HATASI_EN_UZUN, UYGULAMA_ISTEGI_DOSYASI,
  UYGULAMA_GECMISI_DOSYASI, UYGULAMA_REDDI_ILETISI, UYGULAMA_SONUCU_DOSYASI, UYGULANIYOR_DOSYASI,
  calisanSurumSemasi, guncelleyiciSemasi, surumEtiketi, uygulamaIstegiSemasi, uygulamaReddi, uygulamaSonucuSemasi,
  type CalisanSurum, type GecmisKaydi, type UygulamaIstegi, type UygulamaReddi, type UygulamaSonucu,
} from './kurallar.ts';
export { saklananPaketiDogrula } from './guncelleme.ts';
// Güvenlik Merkezi koruma durumu güncelleme imzasının kurulu olup olmadığını buradan okur.
export { guncellemeKanaliDurumu } from './guncelleme.ts';
// Güncelleyici kurmadan önce aynı yedeği alır (kart #1205 kodu).
export { yedekAl, yedekOrtamiOku, yedekSifreliMi, yedekSifresiniCoz, yedekYeriniDenetle, type YedekOrtami } from './yedek.ts';
// Güncelleyici yedek klasörünü veritabanısız buradan okur (kart #1205 eki).
export { YEDEK_DIZINI_DOSYASI, yedekDizini } from './yedek-dizini.ts';
// Sağlık ayrıntısı yedek klasörünün boş yerini ölçer; geçerli klasör (ayar ya da ortam) tek yerden okunur.
export { yedekOrtaminiKur } from './yedek-dizini.ts';
// Sağlık uyarısı "yedek alınmadı"yı Sistem Ayarları'nın yedek listesiyle aynı kaynaktan okur.
export { yedekleriListele } from './yedek.ts';
// Komut satırı talimat medyasını aynalar ve aynadan geri yükler (1004 a, 1005 a).
export {
  MEDYA_AYNA_KLASORU, dosyasiOlmayanlar, medyaAynala, medyaDiziniOku, medyaGeriYukle, type MedyaAynaSonucu, type MedyaGeriYuklemeSonucu,
} from './medya-yedek.ts';
