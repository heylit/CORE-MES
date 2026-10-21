# Çekirdek istekleri: logo (kart #207)

1. Ayar: `TMIV2_LOGO_KOPRU_ADRESI`, `TMIV2_LOGO_KOPRU_ANAHTARI` okuması `sunucu/cekirdek/ayar.ts`'e (`Ayar.logo: LogoAyari | null`) taşınsın ve işe verilsin.
   Neden: bugün modül `process.env` okuyor (`baglanti.ts`, UYUM-BORCU 1). Önerilen imza: `IsTanimi.calis(db, baglam: { ayar: Ayar })`. Denetim kuralları
   `sunucu/moduller/logo/ayar.ts` `logoAyariOku` ve `yerelMi`'dekiyle aynı kalır (ADR 0017: yalnız 127.0.0.1).
2. Zamanlanmış iş: transaction dışında bekleyen adım. Neden: tur köprüyü beklerken bağlantı ve transaction tutuyor, "boşta transaction"
   kesmesi uzatılıyor (UYUM-BORCU 2). Önerilen: `isTanimi({ ..., calis: async (vt) => ... })` ya da `vt.tx` ile işin kendisinin açtığı kısa transaction'lar;
   tur kilidi oturum düzeyinde (`pg_try_advisory_lock`) alınır. Kapandı: çekirdek `IsTanimi.txDisi` getirdi (cekirdek-is-tx-disi); Logo işleri
   ona geçti (borç 258, UYUM-BORCU 2).
3. Kapandı: `CLAUDE.md` kırmızı çizgi satırı ADR 0017 ile değişti (kullanıcı kararı 344 a).
4. Yeni işlem `logo.birim-seti-yaz` (kullanıcı kararı LB11 a, yalnız yönetici). Kayıt satırı `paylasilan/islemler.ts`'te (dar istisna, ayrı commit).
   Rol satırı ve göç YOK: bayraklı yönetici rolü her işlemi kendiliğinden taşır. Öneri (onayla girer): `kurulum/yetki-matrisi.md` "Yalnız yöneticide"
   listesine `logo.birim-seti-yaz` eklenir ve `araclar/yetki-matrisi.test.ts` beklentisi aynı commit'te güncellenir. Bu iş o dosyalara dokunmadı.
5. Ayar kaydı `logo.baglanti` (boolean, varsayılan kapalı): `paylasilan/ayarlar.ts`'e tek satır (dar istisna, ayrı commit).
6. Ayar türü `sayi`: #344 ile geldi; tip kırığı (ilk sayı ayarında `gecerliDeger`) #352 ile kapandı. `logo.kdv-orani` kayıtlı (varsayılan 20, 0-100, 2 ondalık).
   Boş değer gerekmedi: kullanıcı varsayılanı 20 yaptı (08.10.2026), bu yüzden `ayar_deger_dolu` kısıtını gevşetme isteği geri çekildi. Kapandı.
7. Zamanlanmış iş durumunda neden metni: #347 ile geldi; logo işi `isBekliyor` ile "kapalı" ve "ortam değişkeni yok" nedenlerini döner. Kapandı.
