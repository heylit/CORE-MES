# Arkon 2. tur: on liste (kod yazilmadi)

Dal: 199-arkon-2, guncel ana daldan (0561064). Kart #199, #243. Uretim-emirleri dosyalarina yazim yok.

1. #243 listesi, veri kapsami ve donen alanlar (role verilmeden once sart)
   - Kapsam: kayit listesindeki kuralin aynisi. Kisitli kisi yalniz Arkon kaydinin is merkezi ya da makine kodu kendi
     kapsamindaki satirlari gorur. Konumu olmayan kayit kisitli kisiye gorunmez; kapsamsiz kisi hepsini gorur.
     Sayfa sayisi da suzulmus sayidir.
   - Donmeyecek alanlar: `kisi` (id ve ad) cikar; `sonHata` (ic hata ozeti: SQLSTATE, tablo adi) cikar.
   - "Bekliyor" satirlarinda neden olarak kullanici metni doner: "Emir baslamadi: baslama kaydi bekleniyor." ya da
     "Gecici hata, yeniden denenecek."
   - Testler: izinli (kapsamdaki satir gorunur), reddedilen (kapsam disi satir yok, sayi da yok; alanlar govdede yok).
   - VARSAYIM: kapsam Arkon kaydinin konumundan cozulur, TMI emrinin istasyonundan degil; uretim_emri okunmadan SQL'de suzulur.

2. Emir baslamadan gelen sayim ve ardindan gelen olaylarin birikmesi
   - Bugun ertelenen sayim emrin kuyrugunun basinda kalir. Ardindan gelen duraklat, durdur ve bitir de onun arkasinda
     bekler; baslama hic gelmezse hepsi "bekliyor"da birikir (DOGRULANDI: servis.ts emrinBekleyenleriniIsle, ilk
     ertelenen satirda donuyor).
   - Degisiklik: emir planliyken sayimlar bekler, ama sayim disi olaylar sayimlari atlayip sirayla islenir. Baslama
     gelince bekleyen sayimlar yazilir. Planli emre duraklat ya da durdur TMI'de reddedilir ve listede "Reddedildi"
     olarak gorunur, kuyrugu tikamaz.
   - Emir bitti ya da iptal olunca bekleyen sayim "reddedildi" olur (TMI kurali).
   - Testler: baslamadan once sayim, sonra duraklat: duraklat islenir, sayim bekler; sonra baslat gelince sayim yazilir.
   - VARSAYIM: bekleyen sayima sure siniri yok; listede gorunur kalir.

3. queued -> duraklat
   - #241 sonrasi duraklamis emir istasyonu kilitlemiyor (DOGRULANDI: uretim-emirleri/kurallar.ts:34).
     `queued`, `emirDuraklat`'a eslenir.
   - Emir calismiyorsa (duraklamis ya da durmus) TMI "Yalniz calisan is duraklatilir" der; Arkon bunu "eslenemedi:
     emir calismiyordu, degisiklik yok" olarak saklar, kuyruk tikanmaz.
   - Bilinen sinir: durmus emir kuyruga alininca TMI'de istasyon kilitli kalir.
   - Uretim-emirleri'nden istek (BASKA-MODUL-ISTEKLERI.md): `emirOzeti`'ne calisma durumu (calisiyor, durakli, durdu)
     alani. O gelince duraklamis emir icin kayit "yazildi, degisiklik yok" olur.
   - Testler: calisan emirde queued -> duraklamis ve ayni istasyonda yeni emir baslar; duraklamis emirde queued -> eslenemedi.

4. Guvenlik kalanlari
   a. Dolu `results` yazimi: numune isteginde operator ve amir bos olcum alanini doldurabilir. Dolu bir olcum degerini
      degistirmek ya da silmek yalniz kalite ve yoneticide; ret 403.
      Testler: operator bos alani yazar (200), dolu alani degistirir (403, belge degismez); kalite degistirir (200).
   b. Silmede surum: kopru silmede tabletin son okudugu surumu gonderir (store.ts del ve baglanti.ts, ikisi de Arkon
      klasorunde). Sunucu surumsuz silmeyi 400 ile reddeder; eslesmeyen 409 (bugunku gibi).
      Testler: surumlu silme 200, surumsuz 400, eski surum 409; kopru testi surumu gonderir.
      VARSAYIM: Arkon bir belgeyi silmeden once okumustur (ekranda gorunen belge silinir).
   c. Arizada `openedBy`: cagridan acilan arizada (callId var) acani sunucu cozer. Kaynak, ayni callId'li "open" asamali
      `calls` kaydinin kisisi; yoksa yazan kisi.
      Testler: operator cagri acar, bakimci ustlenir; arizada openedBy operator, ackBy bakimci; istemcinin yazdigi ad yok sayilir.

5. Istasyonlarin surum istegi: zaten main'de (PR #269, commit 8658d7f; guvenlik.test.ts'te iki makine guncellemesi
   `surum: 1` gonderiyor). 1. konudan baska bir dosya gelirse eklenir.

Her madde ayri commit; her birinde izinli ve reddedilen test. Sema degismez, yeni goc ve paket yok.
