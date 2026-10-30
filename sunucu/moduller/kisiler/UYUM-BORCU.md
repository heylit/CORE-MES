# kisiler: uyum borcu (kart #259, Aşama 1 tur 2 ve 3. tur)

Durum `9b6582f` üstünde okundu. Her madde: kural / istisna / nerede / nasıl uyumlanır.

## Kullanımı tutan

Yok. Testler yeşil; sayfayı gören her rol (`sayfa.personel`) `kisiler.oku` taşır (`kurulum/yetki-matrisi.md`).

## Başka modüle istek (kart #1233, ara inceleme)

- arkon: Arkon tek rol tanır ve rolü işlem listesinden sırayla çıkarır (`sunucu/moduller/arkon/kurallar.ts` `ROL_SIRASI`,
  `arkonRoluBul`). Kişiye ek verilen bir `arkon.*` işlemi (ör. operatöre `arkon.planlama`) kişinin Arkon rolünü değiştirir; operatör
  ekranı yerine planlama ekranı açılır. Aynı etki iki rolü olan kişide bugün de vardır. İstek Arkon'un sahibine: ek işlemin Arkon rolünü
  değiştirmesi istenmiyorsa rol, rolden gelen işlemlerden çıkarılır (`kisiler/disari.ts`'e "rolden gelen işlemler" fonksiyonu gerekir;
  kisiler verir). Karar kullanıcıda; o zamana kadar ekran `arkon.*` satırlarını öteki işlemler gibi gösterir.
  KAPANDI (17.10.2026, kullanıcı kararı: Arkon rolü yalnız rolden): `disari.ts` `kisilerinRolIslemleri` rolden gelen işlemleri verir; Arkon rolü buradan çözülür.

## Kapanan (3. tur, dal 259-temel-moduller-3)

1. Sürüm denetimi (K3 a): `kisi.surum` sütunu (`20261008075000_kisiler_kisi_surum.sql`); yedi komut sürüm ister, eski sürüm 409.
2. Tekrar koruması: `POST /kisiler` `tekrarKorumali: true`; ekran `tekrarKorumaliGonder` ile gönderir.
3. Dışa açık yazma komutları: `hesapAc`, `kisiEkle`, `kisiPasifeAl`, `kisiAktifYap` `disari.ts`'ten çıktı; `rolAta` ve `rolAl` kaldı ve
   `kisiler.rol-yonet` işlemini sunucuda denetler (T3r a).
8. Belgeler: `KURAL-TEST.md` yazıldı.

## Bağlamada kapanacak

4. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): `araclar/harita.ts` `goc-yazan` kaynağı `rol_islemi`'ni tanıyor (`:22` yorum, `:259`). `rol_islemi` sahipliği haritada görünmüyor (K2 a: sahibi kisiler). Nerede: tabloyu kuran göç
   `sunucu/gocler/20261006011806_yetki_islem_ve_giris.sql` modül adıyla başlamıyor ve hiçbir `sorgular.ts` tabloya yazmıyor;
   `araclar/harita.ts` sahibi "yazan tek modül, yoksa göç adındaki modül" diye bulduğu için tabloyu "belirsiz" sayıyor.
   Göç dosyasına dokunulmaz. Nasıl: kart #72, `araclar/` işi (ayrı dal `72-harita-rol-islemi`); araç K2 kararını tanır.
   Bu modülden yazılmaz.

## Sonra

5. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): K1 a kalıcı istisna; iş değil. Tablo adı öneki (K1 a: istisna, yeniden adlandırma yok). Kural: tablo adı modül adıyla başlar. İstisna: `kisi`, `kisi_rolu`,
   `rol`, `rol_islemi`. Nerede: `20261005120000_kisiler.sql`, `20261006011806_yetki_islem_ve_giris.sql`. Bütün modüller bu
   adlarla bağlanır; kalıcı istisna.
6. KAPANDI (19.10.2026, göç `20261019093500_kisiler_kisit_adlari.sql`): adlar `rol_kod_tek`, `rol_kod_bicimi`, `rol_ad_bos_degil`, `kisi_ad_bos_degil`, `kisi_kullanici_adi_bicimi`. Eski metin: Adsız kısıtlar. Kural: kısıtlar adlandırılır. İstisna: `rol.kod` UNIQUE ve CHECK, `rol.ad` CHECK, `kisi.ad` CHECK,
   `kisi.kullanici_adi` CHECK (adları PostgreSQL verir). Nerede: `20261005120000_kisiler.sql`. Nasıl: yeniden adlandırma göçü
   (veri değişmez); acele yok.
7. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): madde kendisi "uyumlu" diyor (ör. `20261017175647_kisiler_operator_cnc_hazirlik.sql`). Rol x işlem satırları. Kural: rol x işlem satırını çekirdek konusu yazar (K2 a). Durum: satırlar kisiler adlı göçlerle
   giriyor (`*_kisiler_*`); başka modülün işlemleri de bu göçlerde (vardiya, üretim emri, malzemeler, Arkon). Uyumlu; not olarak durur.

## İkinci menü (tur 2'de yapılan)

KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): `KISILER_IKINCI_MENU` `paylasilan/sayfalar/kisiler.ts:9`'da. `paylasilan/sayfalar/kisiler.ts` `KISILER_IKINCI_MENU`: tek grup, tek madde (`/personel`, işlem `kisiler.oku`). Ekran tek görünüm;
rota değişmedi. Toplayıcıya kayıt ayrı commit'te (dar istisna).

## Özlük İK'dan (kart 1311)

- İK tarafı (itme ve bağ kaldırma çağrısı) 1312 dalında; o girene kadar hiçbir kişi İK'ya bağlı işaretlenmez, davranış bugünkü gibidir.
- Canlı kurulumdan önce: İK'da çıkışı olup Kişiler'de aktif olan kişilerin listesi kullanıcıya gösterilir (1302 a okuması); 1312 DEVIR'de salt okunur sorgu.
- Ayarcıyı görev metninden okuyan plan (`plan/motor/girdi.betik`) 1303 a ile yetkinliğe geçer (1313 + plan dalı); görev metni İK pozisyonundan gelir.
