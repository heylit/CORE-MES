# Ön paket: ik v3 — İK İşlemlerim'e Mesailerim ve bordro onayı (İK yazarına istek)

Durum: kullanıcı kararları 12.10.2026 ("1-a, 2a"); kod yazılmadı. Taban: bu zip (ik v2 + oturtma: yalıtılmış çerçeve, "İK İşlemlerim"
sayfası, rol x işlem göçü). İş kuralları tek cümlelik maddelerdir; "VARSAYIM" yazanlar önerimdir, kullanıcı itiraz etmezse geçerlidir.

## Bağlam (DOĞRULANDI)
- Çalışan "İK İşlemlerim"de Benim sayfam, İzinlerim, Bordrolarım görür; izin onayı yetkisi olan ayrıca Onaylar, Ekip, İzin takvimi
  (`paylasilan/sayfalar/ik.ts` `IK_ISLEMLERIM_IKINCI_MENU`).
- Sunucu çalışana kendi devam ve mesai kayıtlarını (`att`) GÖNDERMİYOR; kendi bordrolarını (`pay`) gönderiyor
  (`sunucu/moduller/ik/servis.ts` `veriGetir`, `gorunur`: `case 'asset': case 'pay'` var, `att` yok).
- Bordro kesinleştirme yalnız İK'dadır (`ik.bordro-kesinlestir`); kesinleşen ay kilitlidir, kilidi `ik.bordro-kilit-ac` açar (IK-15, IK-16).

## 1. Mesailerim (karar 1-a: yalnız görme)
- IK-30: Çalışan "İK İşlemlerim > Mesailerim"de yalnız kendi devam ve fazla mesai kayıtlarını görür; ekleyemez, değiştiremez, silemez.
- IK-31: Sunucu çalışanın kendi `att` kayıtlarını okuma cevabına ekler (`veriGetir`, `gorunur`: `att` kendi kaydıysa döner); başkasınınki dönmez.
- IK-32: Liste aya göre süzülür; ay için toplam fazla mesai saati, tatil çalışması saati ve devamsızlık günü gösterilir.
- IK-33: Her kaydın onay durumu görünür; onaysız kaydın bordroya girmediği yazılır. VARSAYIM: bugünkü bordro kuralı budur; değilse kural neyse o yazılır.
- IK-34: Yıl içindeki toplam fazla mesai ve yasal sınıra (yılda 270 saat, 4857 md. 41) kalan saat gösterilir. VARSAYIM: personel kartındaki "Bu yıl fazla mesai" hesabıyla aynı kaynak.
- IK-35: Yöneticinin ekibinin mesailerini görmesi bu paketin kapsamı dışıdır (karar 1-a yalnız çalışanın kendisi).
- Menü (oturtmada TMI yapar): `IK_ISLEMLERIM_IKINCI_MENU` ilk gruba `{ anahtar: 'mesailerim', baslik: 'Mesailerim', yol: '/ik-islemlerim/mesailerim', simge: 'clock', islem: 'sayfa.ik-islemlerim' }`. Uygulamanın görünüm adı `mesailerim` olmalıdır.
- Yetki: yeni işlem yok (okuma tek uçtan, kişiye göre süzülür; IK-21).

## 2. Bordro onayı (karar 2-a: çalışan kendi bordrosunu "Gördüm, onaylıyorum" der)
- IK-40: Çalışan "Bordrolarım"da kesinleşmiş her aylık bordrosu için "Gördüm, onaylıyorum" düğmesini görür; taslak ayda düğme yoktur.
- IK-41: Onay yalnız kişinin kendi bordrosu için ve yalnız dönem kesinleştikten sonra verilir; sunucu denetler (başkasının bordrosu 403, taslak dönem 409).
- IK-42: Onay bir kez verilir ve geri alınmaz; onaylayan TMI kişisi ve zaman sunucuda yazılır (yalnız ekleme defteri).
- IK-43: Dönemin kilidi açılıp bordro yeniden kesinleşirse önceki onay o bordro için geçersiz sayılır ve çalışan yeniden onaylar. VARSAYIM: onaylanan belge değişti.
- IK-44: Onaylanan bordro satırında "Onaylandı: <tarih saat>" görünür.
- IK-45: İK, Bordro ekranında dönem için onaylayan ve onaylamayan sayısını ve listesini görür; onaylamayanlar Yapılacaklar'da hatırlatma olarak görünür.
- IK-46: Onay bordroyu, tutarları ve kesinleştirmeyi değiştirmez; yalnız "gördüm" kaydıdır.
- Veri (öneri): `ik_bordro_onayi` (no; bordro_no → ik_bordro; personel_no; kisi_id → kisi; kesinlestirme_sayisi int; zaman timestamptz);
  tekil (bordro_no, kesinlestirme_sayisi); `yalniz_ekleme()` tetikleyicisi. VARSAYIM: yeniden kesinleştirme sayısı bordro kaydında tutulur; tutulmuyorsa eklenir.
- Uç (öneri): `POST /ik/bordrolar/:kimlik/gordum` (komut), yetki yeni işlem `ik.bordro-gordum`; işlem "İK İşlemlerim" sayfasını alan her role
  rol x işlem göçüyle verilir (oturtmada TMI yapar; `kurulum/yetki-matrisi.md` ve matris testleri birlikte).
- Açık soru (cevap gelene kadar kapsam dışı): onaylamayan çalışana itiraz yolu (açıklama yazıp İK'ya gönderme) olsun mu? Öneri: ilk sürümde yok.

## Teslimde beklenen
Kural testi her madde için (IK-30..IK-46), gerçek PostgreSQL ile akış testi (başkasının bordrosuna onay 403, taslağa onay 409, yeniden
kesinleştirmede onayın düşmesi), `KURAL-TEST.md`, `FARK.md` (v2 oturtmasına göre), `CEKIRDEK-ISTEKLERI.md` (menü maddesi, işlem, rol göçü).
