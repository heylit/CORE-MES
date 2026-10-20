# Kart #48 Denetim okuma ekranı: yazım listesi (onay bekliyor)

Taban: main `7c20cef`. Dal: `48-denetim-okuma` (güncel ana daldan; onaydan önce açılmadı).
Göç sırası (37): son göç `20261008050300_kisiler_arkon_yansima_okuma.sql`. Bu iş göç eklemez.

## Verilen kararlar
1. K4 a: 3. turda yalnız okuma ekranı (`sunucu/moduller/denetim/UYUM-BORCU.md` madde 1). Eksik ya da çelişen yok.
2. Erişim: yönetici ve `denetim.oku` (işlem kayıtlı: `paylasilan/islemler/denetim.ts`; müdürde var: göç `20261006092612_kisiler_roller.sql` satır 78).

## Yazılacaklar
Sunucu (`sunucu/moduller/denetim/`)
- `GET /denetim-kayitlari`: sayfalı liste (`listeSorguAlanlari`, `sayfaliListe`), yeni üstte. Süzgeç: `kisi` (kimlik), `baslangic` ve `bitis` (tarih, iki uç dahil), `komut` (yöntem + yol). Satır: id, zaman, kişi kimliği ve adı (`kisiler/disari.ts` `kisiAdlari`; oturumsuz komutta null), yöntem, yol, parametre, gövde. Yetki `'denetim.oku'`.
- `GET /denetim-kayitlari/suzgecler`: deftere düşmüş kişiler (ad ile) ve komutlar listesi; seçim kutuları buradan dolar. Yetki aynı.
- Okumada `gizle` yeniden uygulanır: maskeleme kuralı sonradan genişlediyse eski satırdaki değer de ekrana çıkmaz.
- SQL `sorgular.ts`, akış `servis.ts`, uç `uclar.ts`; sözleşme `paylasilan/sozlesme/denetim.ts`.

İstemci (`istemci/src/moduller/denetim/`)
- Tek sayfa `/denetim` ("Denetim Kaydı", grup Yönetim): süzgeç satırı, tablo (zaman, kişi, komut), sayfalama; satır açılınca parametre ve gövde düz metin (kaçırılmış). Yazma düğmesi yok. 360/768/1280; yalnız tasarım değişkenleri.
- İkinci menü tek maddeyle (proje kuralı zorunlu kılıyor).

Paylaşılan: `paylasilan/sayfalar/denetim.ts` (sayfa `sayfa.denetim` ve ikinci menü). Toplayıcı `paylasilan/sayfalar.ts`'e yalnız kendi kaydı, ayrı commit.

Testler: izinli (yönetici; `denetim.oku` taşıyan müdür) 200, reddedilen (operatör) 403, oturumsuz 401; her süzgeç, sayfalama, yeni-üstte sıra; okumada maskeleme (gizli adlı alanı maskesiz eski satır); istemci ekran testi.
Belgeler: FARK.md, GUVENLIK-DENETIMI.md, KURAL-TEST.md, UYUM-BORCU.md (madde 1 kapanır), ORTAKLIK-denetim.md güncellemesi, CEKIRDEK-ISTEKLERI.md.

## Varsayımlar (geri alma maliyeti)
- V1 "İşlem" süzgeci = komut (yöntem + yol kalıbı, ör. `POST /kisiler/:id/pasif`). Kayıt yetki işlemini (`kisiler.yaz`) tutmuyor; onu süzmek çekirdekten uç-işlem eşlemesi ister. Ucuz: yalnız sözleşme ve ekran.
- V2 Tarih aralığı veritabanı oturumunun saat dilimine göre gün sınırıdır. Ucuz.
- V3 Uç yetkisi tek `denetim.oku`; `sayfa.denetim` okuma vermez (menü görünürlüğü yalnız). Ucuz.
- V4 Süzgeç seçenekleri tablodan `DISTINCT` ile; yeni dizin göçü yok. Kayıt büyürse dizin ayrı karar. Ucuz.

## Çekirdek isteği (CEKIRDEK-ISTEKLERI.md'ye yazılır, kod girmez)
- Müdüre `sayfa.denetim` (rol x işlem göçü). Verilmezse müdür veriyi okuyabilir ama menüde sayfayı görmez.
- Toplayıcı çakışması: `IKINCI_MENULER` satırı O1 işinde (dal `259-cekirdek-3`) satır başına tek kayda dönüyor; o birleşince bu dal yeniden tabanlanır, kendi satırı yeni biçimde eklenir.
