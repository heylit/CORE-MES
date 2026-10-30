# Güvenlik denetimi: kisiler (uç başına; 3. tur durumu)

Zaman sunucudan (`kisi.olusturuldu` varsayılanı, `oturumlar_gecersiz_once` sunucu saatiyle). Eylemi yapan kişi oturumdan (`kullanici.id`).
Her yazma `uc()` üstünden geçer; denetim kaydını uç katmanı tutar, parola alanları maskelenir (denetim modülü).
Veri kapsamı yok (iş merkezine bağlı değil). `:id` alan yedi komut gövdede `surum` ister; eski sürüm 409 `eski-surum`, kişi yoksa 404,
her başarılı komut sürümü artırır (KS-1). `POST /kisiler` istek kimliği ister (KS-2).
"Bayraklı" = `rol.yonetici` bayrağı olan role sahip kişi.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /kisiler | `kisiler.oku` | parola ve PIN özeti cevapta yok; kullanıcı adı ve bayrak bilgisi yalnız `kisiler.rol-yonet` sahibine, ötekine null | `M8: kişi ve rol listesi kisiler.oku ister; ...` | aynı test (yetkisiz 403, oturumsuz 401) |
| GET /kisiler/eksik-bilgi-ozeti | `kisiler.oku` (listeyle aynı) | yalnız üç sayı (aktif kişide sicil no ya da görev boş); ad, kullanıcı adı, bayrak cevapta yok | `ana-sayfa-ozeti.test.ts` (liste ucundan hesaplananla aynı) | aynı dosya (oturumsuz 401, `kisiler.oku` olmayan 403) |
| GET /roller | `kisiler.oku` | "bütün işlemler" bayrağı yalnız `kisiler.rol-yonet` sahibine döner | `"bütün işlemler" bayrağı yalnız kisiler.rol-yonet sahibine döner; ...` | aynı test |
| GET /rol-islemleri | `kisiler.rol-yonet` | salt okunur; rol başına girişteki işlem kümesi (bayraklı rol bütün kayıtlı işlemler, kayıtsız satır yok); bütün yetkili rol ele verildiği için yalnız rol yönetene açık (kullanıcı kararı 11.10.2026) | `rol yöneten (yönetici) 200 alır: ...` | `kişileri okuyup rol yönetmeyen (planlama, müdür) 403; ...` |
| POST /roller/:id/islem-degistir | `kisiler.rol-yonet` | yalnız bayraklı aktör değiştirir (bayraksız rol yöneten kendi yetkisini büyütemez); bayraklı rolün satırı değişmez; kayıtsız işlem reddedilir; aynı komut ikinci kez sonucu değiştirmez; her komut denetime düşer | `yönetici rolün işlemini verir ve alır; ...` | `bayraklı rol ve kayıtsız işlem 422; ...`, `rol yöneten ama bayraksız kişi 403 alır ...` |
| GET /kisi-ek-islemleri | `kisiler.rol-yonet` | salt okunur; aktif ve girişli kişilerin rolden gelen ve ek işlemleri; kimin neye sahip olduğunu ele verdiği için yalnız rol yönetene açık | `KS-4: yönetici kişiye rolünde olmayan ...` | `KS-4: rol yöneten ama bayraksız ...` (rol yönetmeyen 403, oturumsuz 401) |
| POST /kisiler/:id/ek-islem-degistir | `kisiler.rol-yonet` | KS-4: yalnız bayraklı aktör verir ve alır (bayraksız rol yöneten kendine de başkasına da veremez); bayraklı kişiye, pasif ya da girişsiz kişiye verilmez (var olan satır pasifte korunur, alınabilir); kayıtsız işlem ve `kisiler.rol-yonet`, `kisiler.parola-degistir` verilmez (alınabilir); veren ve zaman sunucudan; aynı komut ikinci kez sonucu değiştirmez; her komut denetime düşer; açık oturumda hemen geçerli, uçlar aynı listeyle denetler | `KS-4: yönetici kişiye rolünde olmayan ...` (200, uç açılır ve kapanır) | `KS-4: bayraklı kişi, kayıtsız ...` (422, 404), `KS-4: rol yöneten ama bayraksız ...` (403, 401) |
| POST /kisiler | `kisiler.yaz` | ad kırpılır, boş olamaz; sicil tekil; kişi girişsiz doğar; istek kimliği zorunlu, aynı kimlik ikinci kişi açmaz | `kişi ekleme kisiler.yaz ister; girişsiz doğar, ...`, `KS-2: aynı istek kimliğiyle ...` (farklı kimlik ikinci kişi) | aynı test (yetkisiz 403, aynı sicil red); `şema: sicil ve görev boş, ...`; `KS-2` (aynı kimlik ikinci kişi açmaz, kimliksiz 400) |
| POST /kisiler/:id/duzenle | `kisiler.yaz` | bayraklı kişinin kaydını yalnız bayraklı aktör düzenler; başkasının sicili reddedilir; cevapta bayrak yalnız `rol-yonet` sahibine | `düzenleme: alanlar değişir, ...`, `bayraklı kişinin kaydını yalnız bayraklı aktör düzenler; ...` | `düzenleme: ... yetkisiz 403, kişi yoksa 404`, `düzenleme cevabı bayrak bilgisini kisiler.rol-yonet olmayana vermez` |
| POST /kisiler/:id/pasife-al | `kisiler.yaz` | kişi kendini alamaz; bayraklıyı yalnız bayraklı başkası alır; sayılan son bayraklı alınamaz; giriş ve açık oturum düşer; eşzamanlı iki komutta kilit | `pasife alma ve yeniden aktif yapma: ...`, `girişsiz personel de pasife alınır; ...` | `kişi kendini pasife alamaz`, `bayraklı kişiyi yalnız bayraklı başka kişi pasife alır`, `iki yönetici birbirini aynı anda pasife alamaz: ...`, `sigorta: sayılan son bayraklı pasife alınamaz; ...` |
| POST /kisiler/:id/aktif-yap | `kisiler.yaz` | pasif bayraklıyı yalnız bayraklı başkası aktif yapar; eski çerez geri çalışmaz | `pasife alma ve yeniden aktif yapma: ...` | `pasif bayraklı kişiyi yalnız bayraklı başka kişi yeniden aktif yapar`, `pasife alma sürerken açılan giriş: yeniden aktif yapılınca o çerez geri çalışmaz` |
| POST /kisiler/:id/hesap-ac | `kisiler.rol-yonet` | var olan hesap, kullanılan ad, kısa parola, biçimsiz ad reddedilir; bayraklı rolle ya da bayraklı hedefte yalnız bayraklı aktör | `hesap açma kisiler.rol-yonet ister; ...` | `hesap açma reddi hiçbir şey yazmaz: ...`, `bayraklı rolle hesap açmayı yalnız bayraklı kişi yapar`, `bayraklı rolü zaten olan girişsiz kişiye ...` |
| POST /kisiler/:id/parola-degistir | `kisiler.parola-degistir` | kendi parolası bu yoldan değişmez; bayraklının parolasını yalnız bayraklı başkası; girişsizde olmaz; hedefin açık oturumları düşer | `başkasının parolası kisiler.parola-degistir ister; ...`, `başkası parolayı değiştirince hedefin açık oturumları geçersiz olur` | `bayraklı kişinin parolasını yalnız bayraklı başka kişi değiştirir; ...`, `başkasının parolası değişirken açılan giriş: ...` |
| POST /kisiler/:id/rol-ata | `kisiler.rol-yonet` | aynı rol ikinci kez atanamaz; bayraklı rolü yalnız bayraklı aktör atar; başarılı atama denetime düşer | `M1: rol atama ve alma yalnız kisiler.rol-yonet ile; ...`, `M2: ...`, `RA1: pasif kişiye rol atanabilir` | `M1` (yetkisiz 403, durum değişmez), `P3: bayraksız ama kisiler.rol-yonet verilmiş kişi bayraklı rolü atayamaz ...`, `bulunamayan kişi ya da rol 404; ...` |
| POST /kisiler/:id/rol-al | `kisiler.rol-yonet` | girişi olan kişinin son rolü alınamaz (422); kişi kendi bayraklı rolünü alamaz; son bayraklı kalır; eşzamanlı almada biri reddedilir | `P2: girişi olmayan kişiye rol atanır ve son rolü de alınabilir`, `M5: rol değişikliği açık oturumda sonraki istekte geçerli olur; ...` | `M3: girişi olan kişinin son rolü alınamaz ...`, `P1: kişi kendi bayraklı rolünü alamaz ...`, `M4: son bayraklı kişinin rolü alınamaz; ...`, `eşzamanlı iki alma: ...` |

Sürüm satırları (yedi komut): izinli `KS-1: kişi komutları beklenen sürümü taşır; ...` (güncel sürüm 200, sürüm +1) ve `KS-1: rol komutu ...`;
reddeden aynı testler (eski sürüm 409, kayıt değişmez; sürümsüz 400; kişi yoksa 404) ve `KS-1: aynı sürümle gelen iki eşzamanlı düzenlemeden biri ...`.
Oturumdan kendi parolasını değiştirme sürümü artırır: `KS-1: kişinin kendi parolasını değiştirmesi sürümü artırır; ...`.

Yetki matrisini pimleyen test: `kisiler.rol-yonet ve kisiler.parola-degistir yalnız bayraklı rollerde: ...` (bayraksız role verilirse yükseltme yolu açılır).
Testler: `kisi-yonetimi.test.ts`, `rol-atama.test.ts`, `yaris.test.ts` (gerçek PostgreSQL, gerçek giriş); saf kurallar `kurallar.test.ts`, `rol-kurallari.test.ts`.

## Yalnız ekranda kalan kurallar

Yok. Ekrandaki düğme gizleme (`Personel.tsx`: `kisiler.yaz`, `kisiler.rol-yonet`, `kisiler.parola-degistir`) ve bayraklı role dokunurken
açılan onay penceresi yalnız kolaylıktır; aynı kurallar sunucuda tutulur (yukarıdaki reddeden testler).

## Dışa açık yazma işlevleri

`disari.ts` yalnız `rolAta` ve `rolAl` yazma işlevlerini açar; ikisi de eylemi yapanın `kisiler.rol-yonet` işlemini sunucuda denetler
(`servis.ts` `rolYonetimiDenetle`), pasif ya da yetkisiz aktörde `YETKI_YOK` (test `KS-3: ...`). `kendiParolasiniDegistir` (oturum)
eski parolayı doğrular; `yoneticiOlustur` yalnız araçtan çağrılır. `hesapAc`, `kisiEkle`, `kisiPasifeAl`, `kisiAktifYap` dışarıda değil.

`ozluguIkdenYaz` (kart 1311, 1302 a) dışarıdadır: İK'nın kendi yazma ucu (işlem ve sürümle) çağırır, yetkiyi o uç sorar. İşlev yine de
bayraklı kişiye bayraksız aktörün itmesini reddeder (KS-10) ve son bayraklı kullanıcıyı çıkışla pasife almaz; değişiklik kişi tablosunun
tetiğiyle değişiklik defterine yazma ucunun kişisiyle düşer. `ozlukBaginiKaldir` bayrağı indirir ve sicil noyu düşürür; ad, görev ve aktiflik değişmez.
Mevcut `duzenle` ucu İK'ya bağlı kişide alan değişikliğini (KS-8), `aktif-yap` ucu çıkışı geçmiş kişiyi (KS-9) 422 ile reddeder.
Günlük iş `kisiler-cikis-pasif` istek değildir; yalnız çıkış tarihi geçmiş aktif kişiyi pasife alır.

Dışa açık okuma `kisilerinIslemleri` (toplu işlem okuması) yetki sormaz; çağıran modül kendi ucunda yetkiyi sorar. Kapsamı oturum yüklemesiyle
aynıdır (pasif ve girişsiz kişi yok): `kisi-islemleri.test.ts`.
