// Terminal kuyruğunun bir komutu en geç yeniden gönderebileceği süreden uzun olmalıdır: kısa kalırsa geç gelen
// yineleme taze sayılır ve komut ikinci kez uygulanır.
export const SAKLAMA_SAAT = 24;

// Temizlik komutun transaction'ında koşar; birikmiş eski satırların hepsini tek komuta ödetmemek için sınırlıdır.
export const TEMIZLIK_SINIRI = 100;

// Aynı kimlik hâlâ işlenirken gelen yineleme en çok bu kadar bekler, sonra 503 MESGUL alır. İstemcinin deneme
// süresinden (5000 ms) kısa olmalıdır: istemci beklemeyi bırakıp yeniden gönderirken eskisi bağlantı tutmayı
// sürdürürse tek takılı komutun yinelemeleri havuzu doldurur ve her uç veritabanına ulaşılamıyor cevabı verir.
export const ANAHTAR_BEKLEME_MS = 3000;
