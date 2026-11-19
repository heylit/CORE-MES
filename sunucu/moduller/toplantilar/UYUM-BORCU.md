# Uyum borcu (toplantilar)

- Rol dağılımı kapandı (3448-5 a): `toplantilar.yaz` ve `sayfa.toplantilar` Genel Müdür, Genel Müdür Yardımcısı, Müdür, Planlama Müdürü, Üretim Müdürü, Satın Alma Müdürü, Planlama ve Proje'de; `toplantilar.oku` yalnız ilk üçünde.
- Ön izlemeden fark: katılımcıya rol ekleme (roldeki kişileri tek tek ekleme) yok; kişi tek tek eklenir. Kart 3452.
- Ön izlemeden fark: bağlı kayıt özetinde açık emir, açık görev ve gecikme sayıları yok; yalnız no, ad, durum ve teslim. Kart 3452.
- Ön izlemeden fark: e-posta tablosunda "Bağlı kayıt" yerine ortak "Kayıt no" satırı; değişiklik e-postasında önceki saat zaman satırında "(önceki: ...)" ile yazılır.
- Ön izlemeden fark: göreve çevrilen aksiyonda görev numarası değil "Görev açıldı" rozeti (görev no projeler'de üretilmiyor).
- Dilim 2-3 (kartta): aksiyon hatırlatması, tekrarlayan toplantı, projesiz aksiyonların Görevler'de "Toplantı görevleri" bölümü (3448-4 b, 3444 fark kartı).
- Risk N1 kapandı (3448-5 K1): göreve çevirme `projeler.gorev-yaz` da ister; yoksa 403 ve düğme kapalı (`izinler.gorevAc`).
- Risk N2: konu seçici (`konu-ara`) firma adlarını listeler; yalnız `toplantilar.yaz` görür.
- Risk N3: iptal edilmiş toplantıda aksiyon durumu (bitti, iptal) yazılabilir; karar ve yeni aksiyon yazılamaz.
