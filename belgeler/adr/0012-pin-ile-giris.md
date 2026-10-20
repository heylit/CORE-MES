# ADR 0012 — PIN ile giriş

Durum: kabul edildi (11.10.2026, kart #484). ADR 0002'nin 3. maddesini değiştirir: herkes parolayla girmez.

## Bağlam

Atölyede ortak tabletten giren kişi için uzun parola yavaştır ve yazılıp kenara asılır. Kullanıcı kararı (kart #484):
giriş kullanıcı adı + PIN (1a); bayraklı yönetici parolada kalır (2a); `kisi` tablosuna boş olabilen PIN sütunu eklenir,
var olan satırlara dokunulmaz (3a); PIN'i yönetici geçici olarak verir, kişi ilk girişte kendi PIN'ini belirler (4b).

## Karar

1. **Yöntemi sunucu seçer.** Bayraklı rolü olan kişi her zaman parolayla girer. Öteki kişi PIN'i verildiyse yalnız PIN'le,
   verilmediyse parolayla girer. Yöntemi dışındaki sır (PIN'li kişinin parolası, yöneticinin PIN alanına yazdığı parola) aynı
   maliyetle reddedilir; cevap tektir: "Kullanıcı adı, PIN ya da parola hatalı."
2. **PIN altı rakamdır.** Tek rakamın tekrarı ve art arda artan ya da azalan dizi kabul edilmez. Özet parola gibi scrypt'tir
   (yeni bağımlılık yok). Bir milyon olasılık ADR 0003'teki artan bekleme ile yavaşlar; hesap kilidi yine yoktur.
3. **Yöneticinin verdiği PIN geçicidir.** `POST /kisiler/:id/pin-ver` (`kisiler.parola-degistir`) PIN'i yazar, kişiyi
   "PIN belirlenecek" işaretler ve açık oturumlarını kapatır. Kendine ve bayraklı kişiye PIN verilmez. Geçici PIN'le giriş
   oturum açmaz (`{ kullanici: null, pinBelirlenecek: true }`); kişi `POST /oturum/pin-belirle` ile kendi PIN'ini yazar ve oturum
   o zaman açılır. Bu yol girişle aynı bekleme ve sayacı kullanır; geçici PIN'i olmayan kişinin doğru PIN'i de hatalı deneme sayılır.
   Yeni PIN'in kuralı geçici PIN'e bakılmadan sınanır: sonradan gelen ret geçici PIN'in doğruluğunu sayaçsız söylerdi.
4. **Parola sütunu kalır.** PIN verilen kişinin parolası silinmez ama giriş açmaz; kişi sonradan bayraklı rol alırsa parolayla
   girer. Parola sütununu PIN'li kişilerde boşaltmak ayrı kullanıcı kararıdır.
5. **Göç** `20261011014600_kisiler_pin.sql`: `pin_ozeti text`, `pin_belirlenecek boolean NOT NULL DEFAULT false`; kısıtlar
   `kisi_pin_giris_ister` (PIN yalnız girişi olan kişide) ve `kisi_pin_belirlenecek_pin_ister`.

## Sonuçlar

- Bugünkü kullanıcılar PIN verilene dek parolayla girer; giriş ekranı PIN'le açılır, "Parola ile gir" bağlantısı vardır ve seçim
  tarayıcıda hatırlanır.
- Kişinin kendi PIN'ini isteğe bağlı değiştirmesi bu kararda yoktur: unutulan ya da değişecek PIN için yönetici yenisini verir.
- Denetim kaydı `pin`, `geciciPin`, `yeniPin` alanlarını var olan kuralla maskeler.
