# Çekirdek istekleri (rota)

1. İşlem toplayıcısı `paylasilan/islemler.ts`: `ROTA_ISLEMLERI` (`paylasilan/islemler/rota.ts`) eklenir.
2. Ayar toplayıcısı `paylasilan/ayarlar.ts`: `ROTA_AYARLARI` (`paylasilan/ayarlar/rota.ts`, `rota.dort-goz`) eklenir.
3. İkinci menü toplayıcısı `paylasilan/sayfalar.ts`: `IKINCI_MENULER` dizisine `ROTA_IKINCI_MENU` (`paylasilan/sayfalar/rota.ts`) eklenir
   (ithal satırı `ROTA_IKINCI_MENU, ROTA_SAYFALARI`).
4. Rol x işlem (kullanıcı onayıyla ayrı göç; teslimde yok). Önerilen satırlar:
   ```sql
   INSERT INTO rol_islemi (rol_id, islem)
   SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem FROM (VALUES
     ('planlama_proje', 'rota.yaz'), ('planlama_proje', 'rota.talimat-yaz'), ('planlama_proje', 'rota.emre-kopyala'),
     ('mudur', 'rota.onayla'), ('cam', 'rota.talimat-yaz')) AS m (kod, islem);
   ```
   Bu göç girince kilitli iki testin satırları güncellenir: `sunucu/moduller/kisiler/goc.test.ts` (planlama sonu listesi) ve
   `sunucu/moduller/oturum/oturum.test.ts` (müdür, CAM, planlama matrisi). Rota testleri bu satırları test kurulumunda kendisi yazar.
