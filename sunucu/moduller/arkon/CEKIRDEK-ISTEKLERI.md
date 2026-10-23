# Arkon'un çekirdek ve ortak istekleri

1. **`arkon.yansima-oku` rol satırları (#243).** İşlem ve sayfa kaydı bu dalda: `paylasilan/islemler/arkon.ts` ve
   `paylasilan/sayfalar/arkon.ts`, Takip grubu, "TMI'ye yazılamayanlar". Bu işlemi hiçbir rol taşımıyor.
   İstek: `mudur` ve `planlama_proje` rollerine versin. Kullanıcı kararı "rollere açılmadan önce"; yönetici şu an görüyor.
2. **224 rol göçüyle uyum (R1).** 224 göçünde `ri.islem LIKE 'arkon.%'` biçiminde elle girilmiş bir denetim var.
   `arkon.yansima-oku` bir Arkon rolü değil, rapor okuma işlemi. Göç bu işlemi "Arkon rolü" sayıp takılmasın:
   ya yalnız 7 rol işlemini denetlesin ya da yansıma-oku satırını o denetimden sonra versin.
   Bu takılma VARSAYIM; 224 dalı bu dalla birlikte koşulmadı.
3. **`sinir` aracı üst düzey `arkon/` klasörünü tanımıyor.** `npm run sinir -- --modul arkon` yol denetiminde
   `arkon/web/src/data/kuyruk.ts` ve `store.ts` için 2 ihlal veriyor. `arkon/` Arkon modülünün klasörüdür
   (ayrı derleme, `derle:arkon`). İstek: modül klasörleri listesine `arkon/` eklensin.
4. **`test:modul` Linux'ta 0 sunucu testi koşuyor ve 0 ile çıkıyor.** Glob tırnaklı geçiyor ve kabuk olmadığı için
   genişlemiyor (DOĞRULANDI: `npm run test:modul -- arkon` çıktısında `ℹ tests 0`). Doğrudan çağrı çalışıyor:
   `node --import ./araclar/ortam-yukle-goc.ts --test "sunucu/moduller/arkon/**/*.test.ts"`.
   Araç hatası, düzeltilmedi; dalın testleri bu komutla koşuldu.
5. **Arka plan yeniden deneyicisi. KAPANDI (#298 kalıbı, #299):** Arkon süpürmesi çekirdek zamanlayıcısına `isler.ts` ile bağlandı.
6. **#223 ince işlemler.** Paket yayınlama, onay, bakım planı ve sonuç sayımı TMI işlemi olsun. Bu daldaki rol
   listeleri (`kurallar.ts` `PLAN_YAZARLARI`, `YAYIN_ROLLERI`, `SAYIM_ROLLERI`) geçicidir ve o işlemlerden türeyecek.
7. **`arkon.yansima-yeniden` rol satırları (#243, 3. tur N2).** İşlem bu dalda: `paylasilan/islemler/arkon.ts`.
   Kullanıcı kararı: `mudur` ve `planlama_proje` rollerine verilsin; A2 (bu dal) birleştikten sonra çekirdeğin bekleyen
   rol isteğiyle girer. Bu işlem de Arkon rolü değildir (`arkonRoluBul` sırasına girmez); 1. ve 2. maddedeki uyarı geçerli.
8. **Çağrı bannerı için "hangi ekip çağrılarını alırım" okuması (298). KARŞILANDI:** uç bildirim modülünde, banner onu okur (UYUM-BORCU çağrı bannerı).
   Önceki kayıt: Ekip çağrısının alıcısı TMI'de bildirim modülünün ekip eşlemesindedir
   (`bildirim_cagri_alicisi`); Arkon'un tarayıcıdaki bannerı ise `giris-ayarlar-spc.ts` `CALL_ROLES` kopyasıyla süzüyor (iki kaynak). Eşleme ucu
   (`GET /bildirimler/cagri-yonlendirme`) `ayarlar.yaz` ister, operatör ve Arkon rollü kişi okuyamaz. İstek: `GET /bildirimler/cagri-yonlendirme/benim`,
   yetki oturum, yalnız oturumdaki kişinin rollerinden çıkan ekip listesi (`{ ekipler: CagriEkibi[] }`). Gelince banner `CALL_ROLES` yerine bunu okur
   ve kopya kalkar. O zamana dek ayarcı `lead` (vardiya amiri) eşlemesiyle görünür (UYUM-BORCU).
