# ayarlar: uyum borcu (kart #259, Aşama 1 tur 2)

Durum `9b6582f` üstünde okundu. Her madde: kural / istisna / nerede / nasıl uyumlanır.

## Kullanımı tutan

Yok.

## Kullanımı etkileyen

Yok. Ayarları yalnız yönetici (bayraklı rol) okur ve değiştirir (karar #117); eşzamanlılık farkı aşağıda "Sonra".

## Sonra

1. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): K1 a kararıyla kalıcı istisna, iş gerektirmez. Tablo adı öneki (K1 a: istisna, yeniden adlandırma yok). Kural: tablo adı modül adıyla başlar. İstisna: `ayar`. Nerede:
   `20261006183341_ayarlar_tablo.sql`. Kalıcı istisna.
2. Sürüm denetimi yok. Kural: her yazma sürümle korunur. İstisna: `POST /ayarlar/:anahtar/degistir` sürüm almaz; istemci
   gördüğü değeri göndermez, ikinci yazan 409 almaz. Eşzamanlılık #420'de (KD-016) anahtar kilidiyle kapandı: değişiklik
   kayıtları sıralıdır ve her biri gerçek eski değeri taşır, ezilen değişiklik kayıtta görünür. Nerede: `servis.ts`,
   `sorgular.ts` `ayarKilitle`. Nasıl: istemcinin gördüğü değeri sınamak gerekirse gövdeye beklenen değer (göç istemez).
3. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): kalıcı istisna olarak kabul edildi, iş gerektirmez. `jsonb` değer. Kural: veri sütun ve kısıtla durur. İstisna: `ayar.deger` jsonb; türü tanımdan (`paylasilan/ayarlar/<modül>.ts`)
   serviste doğrulanır, tabloda yalnız `NOT NULL` (boş sayı ayarı JSON null olarak saklanır; `ayar_deger_dolu` bu yüzden
   `20261009050115_ayarlar_bos_deger.sql` ile kalktı). Nerede: `20261006183341_ayarlar_tablo.sql`. Nasıl: anahtar başına ayrı sütun
   ayar deposunun amacına aykırı; kalıcı istisna olarak durur.
4. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): karar #117 gereği uyumlu, yalnız not. Okuma ucu yazma işlemini ister (`GET /ayarlar`: `ayarlar.yaz`, karar #117). Ayrı okuma işlemi yok; başka modül değeri
   `sistemAyariOku` ile alır, o işlev yetki sormaz (yalnız okuma). Uyumlu; not olarak durur.
5. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): ek test gerekmediği dosyada karara bağlı. Belgeler: `KURAL-TEST.md` yazıldı (N9). Ayrı ret testi olmayan iki kural: yazılmamış ayarın varsayılanı (ret durumu yok)
   ve tablo korumalarının izinli yolu (öteki testlerde geçer). Nasıl: ek test gerekmez; not olarak durur.

## İkinci menü (tur 2'de yapılan)

`paylasilan/sayfalar/ayarlar.ts` `AYARLAR_IKINCI_MENU`: tek grup, tek madde (`/ayarlar`, işlem `ayarlar.yaz`). Ekran tek görünüm;
rota değişmedi. Toplayıcıya kayıt ayrı commit'te (dar istisna).

## Güncelleme kanalı (kart #870), sonra

1. Denetim kapsamı: kapandı. Parça ucu `govdesiz` (kullanıcı kararı 2026-10-12): gövde yerine boyut ve SHA-256 özeti yazılır.
2. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): paket ve sürüm silme uçları ve testi var (`uclar.ts` `/guncelleme/paketler/:commit/sil`, `/guncelleme/surumler/:commit/sil`; `guncelleme.test.ts` "eski paket ve sürüm silinir"). Paket silme ucu yok; eski paketler dizinde birikir. Uygulayıcı kartında saklama sayısıyla birlikte gelir.
3. Disk işi veritabanı işleminin dışında kalır: denetim kaydı yazılamazsa parça diskte kalır (zararsız; yükleme yeniden denenir).

## Yedek klasörü (kart #1205 eki), onaylı karar gereği açık

1. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): kullanıcı kararı "Her klasör", kalıcı. İzinli kök ya da yerel sürücü sınırı yok; ağ paylaşımı (`\\sunucu\pay`) dahil var olan ve yazılabilir her tam yol kabul edilir
   (ara inceleme bulgusu). Kullanıcı kararı "Her klasör"; kurulum belgesi yedeği ikinci diske ya da ağ paylaşımına önerir.
   Yalnız bayraklı yönetici değiştirir, her değişiklik denetim kaydında. Nerede: `yedek-dizini.ts` `klasoruDenetle`. Kalıcı.
