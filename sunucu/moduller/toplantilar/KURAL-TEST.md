# Kural - test eşlemesi (toplantilar)

| Kural | Tanım | Test |
|---|---|---|
| TOP-1 | Toplantı tek günlüktür (tesis saati); en çok 24 saat veritabanı kısıtı | kurallar.test.ts "TOP-1"; toplantilar.test.ts "toplantı tek günlüktür" (açma ve değiştirme) |
| TOP-2 | Yalnız planlanan toplantı değişir, iptal edilir, yapıldı işaretlenir | kurallar.test.ts "TOP-2, TOP-3"; toplantilar.test.ts "yapıldı ...", "iptal ..." |
| TOP-3 | "Yapıldı" başlangıçtan sonra; sonra karar ve aksiyon yazılır | kurallar.test.ts "TOP-2, TOP-3"; toplantilar.test.ts "yapıldı başlamadan işaretlenmez" |
| TOP-4 | İptal edilen toplantıya karar ve aksiyon yazılmaz | toplantilar.test.ts "iptal nedenle olur" |
| TOP-5 | Aksiyon yalnız projeli toplantıda, açıkken, görevi yokken göreve çevrilir; eşzamanlı iki çevirmeden biri geçer | kurallar.test.ts "TOP-5"; toplantilar.test.ts "projeli toplantının aksiyonu ... eşzamanlı" |
| TOP-6 | Düzenleyen ve katılımcı kendi toplantısını, `toplantilar.oku` hepsini görür; başkası 403; yazmada da (`toplantilar.yaz` göremediğine yazamaz) | kurallar.test.ts "TOP-6"; toplantilar.test.ts "açılan toplantıyı katılımcı görür", "toplantilar.yaz göremediği toplantıya yazamaz", "değişiklik ..." (çıkarılan kişi 403), "takvim ..." |
| TOP-7 | Konu bağı tek sütundur | kurallar.test.ts "TOP-7" |
| TOP-8, TOP-9 | E-posta zaman aralığı tesis saatiyle; saat değişince önceki aralık yazılır | kurallar.test.ts "TOP-8, TOP-9" |
| TOP-10 | Davet eklenene, değişiklik kalana, iptal çıkana; yapan almaz | kurallar.test.ts "TOP-10"; toplantilar.test.ts "açılan toplantıyı ...", "değişiklik ..." |
| TOP-11 | Görev planı bugünden son tarihe | kurallar.test.ts "TOP-11"; toplantilar.test.ts "projeli toplantının aksiyonu" |
| Yetki | Okuma oturum (süzme serviste), bütün yazma `toplantilar.yaz` | uc-yetkisi.test.ts |
