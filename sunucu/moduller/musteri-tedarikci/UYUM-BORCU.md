# Uyum borcu: musteri-tedarikci

## Bağlamada kapanacak
2. Finans çerçevesindeki "Firmalar" görünümü firma kartını hâlâ kendi içinde düzenler; bağlamada cari (bakiye) görünümüne inip kart düzenlemesi bu sayfaya yönlenmeli (BASKA-MODUL-ISTEKLERI 2).
3. Satın alma ve finans firma seçicileri ek adresleri (fatura, teslim) seçtirmez; belge yalnız firmaya bağlanır (BASKA-MODUL-ISTEKLERI 3).
4. Ana menü simgesi geçici olarak `dash`; firma için uygun simge sette yok (CEKIRDEK-ISTEKLERI 1).
5. Rol ve yetki: beş rol aynı hakla taşındı (S6); ortak yetki matrisinde ayrıca gözden geçirilmedi.
6. Logo'dan cari (2118): `logoCariCozuculeriKaydet` sunucu/kablolama.ts'te logonun `logodaCariAra` ve `logodanCariOku`'suna bağlanacak (2116 F). Bağlanana kadar arama "bağlı değil" der. VARSAYIM: Logo kart türü 1 alıcı, 2 satıcı, 3 ikisi; ülke TR; Türkiye biçimine uymayan vergi no önerilmez; okuma belleği tek sunucu süreç belleğidir (sunucu yeniden başlarsa yeniden aranır).
7. Değerlendirme matrisi (2456): Kalite onay durumu rozeti ve sertifika matriste ve karnede yok (kalite-merkezi bu modülü ithal ettiği için buradan okunamaz; 2409 ile bağlanır). D sınıfında Kalite'ye "onayı gözden geçir" bildirimi ve fiyat/kalite maliyeti bilgi alanı önizlemedeydi, yazılmadı (bildirim türü çekirdek konusu; fiyat satın alma verisi). PPM ve teklife yanıt bileşenleri olay gelene kadar null (BASKA-MODUL-ISTEKLERI 4, 6). Kategori kırılımı kategori ağacıyla (2459 a, 2461) gelir.
