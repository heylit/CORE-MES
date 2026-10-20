# FARK: nizamiye (yeni modül)

Kurgu: /mnt/project-files/arastirma/idari-guvenlik/2026-10-19-idari-isler-ve-nizamiye-onerisi.md §10, §13 (proje klasörü, depoda değil).
Ekran başvurusu: onaylı taslak https://claude.ai/artifact/6iQfgx682k9GfBgbLLd2vH (kapı konsolu 1280, habersiz ziyaretçi 768, acil durum A4).
Dayanak: 165 a (güvenlik görevlisi rolü), 166 a (kimlikten yalnız son dört hane), 174 a ve 182 a (rol x işlem), kullanıcı "başla".

1. PR (Nizamiye 1):
- Göç `20261019101000_nizamiye_ziyaret`: iki boş yeni tablo (`nizamiye_kart`, `nizamiye_ziyaret`). Dolu tabloya dokunmaz.
- İşlemler `nizamiye.oku`, `nizamiye.yaz`, `nizamiye.kart-yonet`; sayfa `/nizamiye` (`sayfa.nizamiye`), ikinci menü (Kapı, Kart rafı, Geçmiş, Acil durum listesi); numara ayarı `nizamiye.ziyaret-no` (`ZY-{SAYAC:6}`).
- Uçlar: kapı listesi, habersiz ziyaretçi (kayıt ve giriş tek komut, tekrar korumalı), giriş, çıkış, iptal, geri al (10 dk), kart rafı (ekle, sorun bildir, rafa al), geçmiş, acil durum listesi, ev sahibi seçimi, önceki ziyaret önerisi, menü sayacı.
- İstemci: kapı konsolu (sayaçlar, ACİL DURUM, kart okutma, EVET/HAYIR kontrolleri, "Eksik:", geri al şeridi), habersiz ziyaretçi (dört adım), kart rafı, geçmiş, yazdırılabilir acil durum listesi.
- Rol satırları bu PR'da yok: Çekirdek yazar (CEKIRDEK-ISTEKLERI.md). Satır girene kadar yalnız yönetici görür.

2. PR (217 a): "Ziyaretçilerim": her çalışan kendi ziyaretçisini ön kayda alır, yalnız kendininkini görür ve gelmeden iptal eder.
- Uçlar `GET /ziyaretcilerim`, `POST /ziyaretcilerim/on-kayit` (tekrar korumalı), `POST /ziyaretcilerim/:id/iptal`; yetki oturum, ev sahibi oturumdan. Göç yok.
- İstemci: üst çubukta "Ziyaretçi" düğmesi (her oturum), yan pencerede liste ve ön kayıt formu. Nizamiye sayfası açılmaz.
- Ev sahibine kimlik ve telefon dönmez; başkasının kaydı 404.

3. PR: İdari İşler yemek hesabı için `disari.ts` → `yemegeKalanZiyaretci(db, tarih): Promise<number>`.
- Sayılan: o tesis gününde beklenen ya da giren, öğle yemeği işaretli ziyaretler. İptal sayılmaz; çıkan sayılır (gün içinde sayı düşmesin). Gün `COALESCE(giris, beklenen_zaman)`. Göç yok.

4. PR (243 a): PDKS dosya aktarımı; acil durum listesinde içerideki personel.
- Göç `20261019107000_nizamiye_pdks.sql`: iki yeni boş tablo `nizamiye_pdks_aktarim`, `nizamiye_pdks_hareket` (yalnız eklenir; kişi, zaman, yön tek).
- Uç `POST /nizamiye/pdks/aktar` (`nizamiye.yaz`, tekrar korumalı): tarayıcıda okunan dosya metni gelir; sicil no etkin kişiyle eşleşir; okunamayan ve eşleşmeyen satır raporlanır, kalanı alınır.
- Dosya biçimi yalnız `kurallar.ts` `PDKS_BICIMI` ve `pdksSatiriniCoz` içinde; gerçek biçim bilgi işlemden gelince yalnız orası değişir.
- Acil durum cevabına `personel` ve `pdksSonAktarim` eklendi; ekranda personel tablosu ve "PDKS aktar" düğmesi (yazana).

5. PR (259 a): PDKS aktarımı yalnız insan kaynakları. Yeni işlem `nizamiye.pdks-aktar` (uç bu işleme bağlı); düğme acil durum sayfasından üst çubuğa taşındı ("PDKS", işlemi olana görünür; Nizamiye sayfası İK'ya açılmaz). Rol satırı #1951 ile girdi.

6. PR (289 b, ADR 0016): kart okuyucu PDKS hareketini oturumsuz uçla gönderir; elle aktarım yedek kalır.
- Göç `20261019125500_nizamiye_pdks_cihaz.sql` (damga birleştirmede): dört yeni boş tablo `nizamiye_pdks_cihaz`, `nizamiye_pdks_gonderim`, `nizamiye_pdks_gonderim_ham`, `nizamiye_pdks_cihaz_hareket`. Dosya aktarımının tabloları değişmedi.
- Uç `POST /nizamiye/pdks/cihaz-hareketi` (oturumsuz): ağ aralığı `TMIV2_PDKS_CIHAZ_AGI`, cihazın kayıtlı adresi ve anahtarı, oran sınırı, ham gövde saklanır; ayar `nizamiye.pdks-cihaz-girisi` varsayılan kapalı.
- Cihaz kaydı uçları `GET/POST /nizamiye/pdks/cihazlar`, `/:id/anahtar`, `/:id/durum` (`nizamiye.pdks-aktar`). Ekranı üst çubuktaki PDKS penceresinde "Kart okuyucular" sekmesi (sonraki PR): ekle, anahtarı yenile (önce sorar), durdur/etkinleştir; anahtar bir kez gösterilir.
- İş `nizamiye-pdks-ham-temizlik`: ham gövde `TMIV2_PDKS_HAM_SAKLAMA_GUN` (varsayılan 365) dolunca silinir.
- Acil durum listesi ve "son aktarım" iki kaynağı birlikte okur.
7. PR (341 a): PDKS üst çubuk düğmesi kalktı. Kart okuyucu kaydı Sistem Ayarları > Bağlantılar > "Kart okuyucu" alt sekmesinde (`ayar-ekranlari.tsx`, işlem `nizamiye.pdks-aktar`; "Kart okuyucudan PDKS kaydı" ayarı ekranın başında). PDKS dosya aktarımı `disari.ts` `PdksDosyaAktar` ile İK sayfasının menüsünde (rota İK'nın). Yetki değişmedi.
