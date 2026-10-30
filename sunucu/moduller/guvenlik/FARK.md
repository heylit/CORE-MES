# guvenlik: fark (ilk teslim, 2026-10-14)

Yeni modül: Güvenlik Merkezi. Giriş denemesi ve açık oturum sinyallerinden alarm defteri, zamanlanmış tarama, izleme ekranları.
İşlevsel tarif `ON-PAKET-GUVENLIK-2.md` (G-01 .. G-20); ekran düzeni ve akışı prototipten, yapı kabuk ve ortak parçalarla.

## Commit'ler

1. oturum `disari.ts`: giriş denemesi özeti, saatlik sayı, sayfalı deneme listesi, açık oturum listesi ve sayısı, oturumu kimlikle kapatma (ayrı commit; ardından özete son hatalı deneme zamanı).
2. Toplayıcılara kayıt (ayrı commit): `sayfa.guvenlik`, `guvenlik.oku`, `guvenlik.yonet`; sayfa `/guvenlik` (grup Yönetim, simge `lock`); ikinci menü yedi madde.
3. Sunucu: göç `20261014222000_guvenlik_alarm.sql`, kurallar, sorgular, servis, uçlar, `isler.ts` (tarama işi).
4. İstemci: yedi bölüm ekranı ve ekran testleri.
5. Yetki matrisi (ayrı commit): üç işlem "Yalnız yöneticide" bölümüne yazıldı.

## Kullanıcı kararları (2026-10-14)

- Yalnız yönetici görür ve yönetir. Onay: proje sohbeti mesajı `cmsg_01QjAUiG4rcfxWaDhbu1Pm2uLn3azRHFL5dcfY31rZPw5X` (22:12),
  "Güvenlik Merkezi sayfasını yalnız yönetici görsün ve yönetsin (sayfa.guvenlik, guvenlik.oku, guvenlik.yonet)." Mesaj koordinatör
  ajan üzerinden aktarıldı; bu oturum kaynağını okumadı.
- Rol x işlem göçü YAZILMADI: bayraklı yönetici rolü kayıtlı her işlemi kendiliğinden alır ve satır taşıyamaz
  (DOĞRULANDI: `araclar/yetki-matrisi.test.ts` "Bayraklı rol satır taşımaz" `satirlar: []`; `oturum.test.ts` "bütün işlemler bayraklı rol").
  `INSERT ... ON CONFLICT DO NOTHING` bu testi kırardı. Onay, matris belgesi ve iki testin "yalnız yöneticide" listesiyle uygulandı.
- Dış erişim VPN ile; mesai dışı uyarı yalnız uygulama içinde (e-posta, SMS yok).
- Durum A: tarama zamanlanmış iştir (60 sn); `POST /guvenlik/tara` ve `guvenlik.tara` yoktur.

## Ek teslim: hesap kilidi, devredilmezlik, VPN aralığı (2026-10-14)

Hesap kilidi (PR #1363) main'e girdi; boş kilit durumu gerçek listeyle değişti. Kararlar koordinatör üzerinden aktarıldı.

- Hesap kilidi: `GET /guvenlik/kilitler` (`guvenlik.oku`) ve `POST /guvenlik/kilitler/:id/ac` (`guvenlik.yonet`) oturum `disari.ts`
  üzerinden okur ve açar; oturumun kendi uçları `kisiler.rol-yonet` olarak kalır. Durum kartı etkin kilit sayısını gösterir, kilitli
  hesap genel durumu "dikkat" yapar. Koruma "Hesap kilidi" maddesi `acik` ve etkin kilit sayısıyla gelir (artık bilinmiyor değil).
- Yöneticiye bildirim: tarama her yeni kilitte `hesap-kilidi` alarmı açar (orta). Son 24 saatte kurulan kilitlere bakılır; kapanmış
  alarmın son gördüğü kilitten sonra kilit yoksa alarm yeniden açılmaz. Sinyal kendi göçümüzde CHECK'e eklendi (göç main'de değil).
  VARSAYIM: önem orta, pencere 24 saat; geri alma ucuz (`kurallar.ts`).
- Devredilmezlik: kullanıcı kararı 23:02 "Verilemesin"; `guvenlik.oku` ve `guvenlik.yonet` kisiler `DEVREDILMEZ_ISLEMLER`'de.
  `sayfa.guvenlik` listeye girmedi (liste sayfa işlemi taşımıyor; veri uçları zaten reddeder). VARSAYIM.
- VPN adres aralığı: ayar `guvenlik.vpn-adres-araligi`, varsayılan boş (kullanıcı 23:03 VPN adreslemesini bilmiyor). Yardım metni:
  bilgi işleme sorun; VPN herkese aynı adresi veriyorsa aralığı yazın. Doluyken aralıktaki cihazdan gelen deneme G-03 ve G-20'de
  sayılmaz; G-02 sürer. Aralık sunucuda ve ekranda aynı ortak çözücüyle doğrulanır (IPv4 ve IPv6, ağ adresi olmayan aralık reddedilir).
  Kurallar bölümü doluyken muafiyeti gösterir.
- Çekirdek değişikliği (ayrı commit): metin ayarına `bosOlabilir` ve `bicim: 'ag-araligi'`; yeni `paylasilan/ag-araligi.ts`;
  Sistem Ayarları metin satırı boş değere ve biçim hatasına uydu; `eslint.config.js` zod'suz listesine `ag-araligi` eklendi.

## Tariften ayrılanlar

- `tetikleyen_kisi_id` sütunu yok: Durum A'da taramayı hep zamanlayıcı başlatır, sütun hep boş kalırdı.
- G-15 "uçtan geldiyse 409" yok: uç yok; kilidi alamayan tur yalnız `null` döner.
- Tarama sayaç güncellemesi (gözlenen, tekrar, son görülme) `surum` artırmaz: artırsaydı açık ekrandaki her onay dakikada bir 409 alırdı.
  Sürüm yalnız insan kararıyla (onay, kapanış) artar. VARSAYIM; geri alma ucuz (tek sorgu).
- Liste süzgeci tarifteki çoklu `durum` yerine tek `gorunum` (etkin, acik, onaylandi, kapandi, hepsi); varsayılan etkin (G-18).

## Varsayımlar (eşikler, geri alma ucuz: `kurallar.ts` sabitleri)

- G-02: aynı ad + cihazdan 15 dakikada 10 hatalı deneme, orta.
- G-03: bir cihazdan 60 dakikada 3 farklı adla hatalı deneme, yüksek.
- G-20: bir ada 60 dakikada 3 farklı cihazdan hatalı deneme, yüksek.
- G-05: bir kişinin 4 ya da daha çok geçerli oturumu, orta.
- Kapanan alarm ve tarama defteri 400 gün saklanır; silme taramanın içinde koşar.
- G-17: son tarama 5 dakikadan eskiyse "tarama durdu".
- Durum ekranı 30 sn'de bir yenilenir.

## Güvenlik Merkezi Aşama 1, sunucu okumaları (384 a, dal `guvenlik-asama-1`)
- Koruma durumunun beş "bilinmiyor" maddesi kaynağından okunur: yedek (sağlık uyarısıyla aynı kaynak ve eşik, `saglik/disari.ts`), güncelleme imzası
  (`ayarlar/disari.ts guncellemeKanaliDurumu`), HTTPS ve sertifika bitişi (`#cekirdek/https-durumu.ts`, açılıştaki iki değişkenden), denetim kaydı
  (`denetim/disari.ts denetimDurumu`). Kaynak okunamazsa madde yine "bilinmiyor"dur. Kurallar G-23 - G-27.
- Sağlık ayrıntısına bellek, olay döngüsü gecikmesi ve veritabanı bağlantı sayısı eklendi (isteğe bağlı alanlar; ekran değişmedi).
- Göç, yeni paket, yeni işlem ve rol satırı yok.

## Güvenlik Merkezi Aşama 1, başlıklar ve belge
- Sunucu günlüğünde oturum çerezi ve yetki başlığı gizlenir (`#cekirdek/uygulama.ts gunlukSecenegi`; paket zaten var).
- Arayüz kapısındaki her dosyaya `Referrer-Policy: same-origin` ve `Permissions-Policy: camera=(self), microphone=(self)`
  (`istemci/src/ortak/pwa/icerik-ilkesi.ts EK_GUVENLIK_BASLIKLARI`; geliştirme ve önizleme sunucusunda da).
- `kurulum/canli.md`: PostgreSQL yalnız yerelden dinler; yedek, kopyası ve anahtarı ayrı yerde.

## Adım 1: reddedilen istek kaydı ve kritik alarm duyurusu (1369; 1362 a, 1363 a, 1365 a, 1367 a teyit, 1368 a, 1370 a teyit)
- Çekirdek (ayrı yama) 401, 403 ve var olmayan API adresini nedeniyle bellek tamponuna yazar; tarama her tur tamponu `guvenlik_red_olayi`
  tablosuna boşaltır (90 gün, yalnız eklenir). Göç `20261030164000`; aynı göç alarm defterine iki sinyal ekler, kayıtlar değişmez.
- Yeni sinyaller: `yetki-reddi-serisi` (yüksek; bir kişi 15 dk'da 5 farklı uçta red ya da 10 kapsam reddi; cihaz ve dosya türü reddi sayılmaz)
  ve `adres-taramasi` (kritik; bir cihazdan 15 dk'da 5 farklı var olmayan adres). Eşikler VARSAYIM; geri alma ucuz (`kurallar.ts`).
- Kritik alarm: yöneticilere `guvenlik.kritik-alarm` bildirimi ve Windows olay günlüğü (kimlik 200). Otomatik engel yok.
- Ana menüde açık alarm sayısı (kabuk yaması, `anaMenuSayaci`).
- Takip altında "Reddedilen istekler" listesi, Girişler düzeninde; `GET /guvenlik/reddedilen-istekler` (`guvenlik.oku`).
- Yeni işlem, rol satırı ve paket yok. Oturumsuz red (401) bu adımda alarm açmaz, yalnız listelenir (oturumu biten ekran yanlış alarm üretirdi).
