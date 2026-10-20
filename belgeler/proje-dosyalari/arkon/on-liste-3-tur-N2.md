# Arkon 3. tur, N2: hatalı yansımayı yeniden kuyruğa alma (ön liste, kod yazılmadı)

Dal: `243-arkon-yeniden-dene`, güncel ana daldan (N1 birleşmiş, f74ed30). Kart #243. uretim-emirleri'ne yazım yok. Şema değişmez, göç ve paket yok.

## Bugün (DOĞRULANDI: `sorgular.ts:282`, `servis.ts:427`, göç `20261007223000_arkon_tmi_yansima.sql`)
Geçici olmayan bilinmeyen hata 5 denemeden sonra yansımayı `hatali` yapar; bir daha denenmez, kuyruğa almanın yolu yok. `hatali` satırın `emir_id`si doludur (bekliyordan gelir).

## Değişiklik
1. **İşlem:** yeni TMI işlemi `arkon.yansima-yeniden` (`paylasilan/islemler/arkon.ts`). Arkon rolü değildir (`arkonRoluBul` sırasına girmez).
   Rol satırı çekirdek isteği olur (`CEKIRDEK-ISTEKLERI.md`): öneri **mudur** ve **planlama_proje**. Çekirdek yazana dek yalnız bayraklı yönetici kullanır.
2. **Uç:** `POST /arkon/tmi-yansimalari/:id/yeniden-dene`, yetki `arkon.yansima-yeniden`. Komut: satırı `bekliyor` yapar, `deneme` 0, `son_hata` ve `neden` boş,
   aynı istekte o emrin bekleyenlerini işler (kayıt sırasıyla) ve satırın yeni sonucunu döner.
3. **Kurallar:**
   - Yalnız `hatali` satır yeniden kuyruğa alınır; `yazildi`, `reddedildi`, `eslenemedi`, `bekliyor` 409 (durum değişmez).
   - Veri kapsamı listedekiyle aynı: kişinin göremediği satır 404 (var olduğu söylenmez).
   - Sıra koruması (VARSAYIM, geri alması ucuz): durum kaydı (`events`) yalnız aynı emrin kendinden sonraki durum kayıtlarından hiçbiri TMI'ye yazılmamışsa yeniden kuyruğa alınır.
     Neden: eski bir "duraklat" sonradan gelen "başlat"ın üstüne yazılıp emri yanlış duruma sokar. Sonrası yazılmışsa 409 ve neden metni ("Bu emirde sonraki durum kayıtları yazıldı").
     Sayım (`counts`) toplamaya eklenir, sıra koruması gerekmez.
   - TMI komutunu yapan kişi bugünkü gibi kayıt anındaki kişidir (güncel yetkisiyle); yeniden kuyruğa alan kişi yalnız denetim kaydına girer (uç denetimi).
4. **Ekran (TMI'nin kendi listesi, `TmiYansimalari.tsx`; Arkon ekranına dokunulmaz):** `Hatalı` satırda "Yeniden dene" düğmesi (simgeli), yalnız işlemi olana görünür.
   Basınca satırın yeni durumu listede görünür; 409'da ileti.
5. **Testler (izinli ve ret):**
   - İzinli: işlemi olan kişi `hatali` sayımı yeniden kuyruğa alır, TMI'de sayım yazılır, satır `yazildi`.
   - Ret: işlemsiz kişi 403 (operatör, cam); `reddedildi` satır 409; sonraki durumu yazılmış eski durum kaydı 409 ve emir değişmez; kapsam dışı satır 404.
   - İstemci: düğme yalnız `hatali` satırda ve işlemle görünür.
6. **Belgeler:** UYUM-BORCU (#243 `hatali` kalıcı maddesi kapanır), KURAL-TEST, GUVENLIK-DENETIMI (uç satırı), CEKIRDEK-ISTEKLERI (rol satırı), FARK.

## Bu modül şunları varsayacak
1. Yeniden kuyruğa alma aynı istekte bir kez dener; yine geçici olmayan hata olursa satır yeniden 5 denemelik sayaçla başlar (her kayıt isteğinde denenir).
2. Sıra koruması yalnız durum kayıtlarına uygulanır.
3. Yeniden kuyruğa alan kişi TMI komutunu yapan kişi olmaz.
