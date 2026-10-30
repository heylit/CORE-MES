# GUVENLIK-DENETIMI: kaynak-izi (kart 1325)

Modül yalnız okur; yazma ucu, tablo ve göç yoktur (1304 a). Dört uç `uclar.ts`'te `uc({...})` ile tanımlı. Başka modülün verisi yalnız
sahiplerinin `disari.ts` işlevleriyle okunur (istasyonlar, kisiler, vardiya, ik, uretim-emirleri, oee, finans).
Her bölüm ayrıca sahibinin okuma işlemini ister (1322 a, `BOLUM_ISLEMLERI`); işlemi olmayana bölüm null döner ve sorgusu atılmaz.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /kaynak-izi/kaynaklar` | `sayfa.kaynak-izi` | metin en çok 60 harf, en çok 50 satır ve `dahaVar`; kişide yalnız ad ve sicil | KI-U2 | KI-U1 (403, 401) |
| `GET /kaynak-izi/istasyonlar/:id` | `sayfa.kaynak-izi` + bölüm işlemi | olmayan 404; tesis, OEE, maliyet bölümleri işleme bağlı | KI-U3, KI-U4, KI-U5 | KI-U1, KI-U3 (bölümler null) |
| `GET /kaynak-izi/makineler/:id` | `sayfa.kaynak-izi` + bölüm işlemi | olmayan 404; tesis bölümü işleme bağlı | KI-U3, KI-U4 | KI-U1, KI-U3 |
| `GET /kaynak-izi/kisiler/:id` | `sayfa.kaynak-izi` + bölüm işlemi | olmayan 404, geçersiz kimlik 400; izin yalnız bugün evet/hayır (tür ve gerekçe dönmez); maliyet yalnız `finans.maliyet-oku` | KI-U3, KI-U4, KI-U5 | KI-U1, KI-U3 |

Bölüm işlemleri (`paylasilan/sozlesme/kaynak-izi.ts` `BOLUM_ISLEMLERI`): tesis `sayfa.istasyonlar` ya da `istasyonlar.yaz`; vardiya `sayfa.vardiya`;
izin `ik.oku` ya da `ik.izin-oku`; işler `sayfa.uretim-emirleri`; OEE `oee.oku` (oee'nin kendi denetimi de çalışır); maliyet `finans.maliyet-oku`.
Yalnız ekranda kalan kural: yok (ekran gizli bölümü sunucunun null'undan bilir). Kullanıcı metni React ile kaçırılarak basılır.
Açık konu: sayfa işlemi Aşama 1'de yalnız yöneticidedir; hangi rollere verileceği bağlamada sorulur (UYUM-BORCU madde 3).
