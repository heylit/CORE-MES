# Başka modül istekleri: malzemeler

Aşama 1: yok (malzemeler yalnız `kisiler` ve `ayarlar`'ın `disari.ts`'ini çağırır).

## Aşama 2, bağlama tur 1 (kart #163): malzemelerin verdiği, sahiplerinin kullanması istenen
Malzemeler bu fonksiyonları verdi; çağıranı değiştirmek o modülün işidir (yazılmadı).
- stok: mal kabul ve listede `malzemeAra(db, { metin, sayfa })` ve `malzemeOzetleri(db, idler)`; ekranda özetteki `birim` (stok borç 2, 4, 5, 9, 21; C5, C13).
- satın alma: katalog kopyaları (`kod`, `ad`, `kategori`, `birim`) yerine `malzemeOzetleri` (C8, SA2 b); kalem birimi serbest metin yerine `olcuBirimleri` (OS4).
- rota (tur 2): `baglanti.ts` geçici `malzemeAra` yeni imzaya (`SayfaliListe` döner, öğede `toplam` yok); `malzemeBirimleri(db, nolar)` yerine `malzemeOzetleri`.

## Aşama 2, bağlama tur 1: hizmet türü (kart #163, MH1-MH5, 09.10.2026)
Malzemeler yazdı; aşağıdakileri yazmak o modülün işidir (yazılmadı).
- stok (öncelikli, derlemeyi tutar): `paylasilan/sozlesme/stok.ts` `MALZEME_TURLERI` beş tür; `malzemeOzeti.tur` artık `hizmet` de döner (`stok/servis.ts` 225, 240, 680 tip hatası,
  cevaptaki `z.enum` hizmet kartında düşer). Listeyi `KATALOG_TURLERI`'nden alın ya da `hizmet` ekleyin. Hizmet stoklanmaz: mal kabul ve arama hizmeti depoya giriş olarak yazmasın,
  yalnız teslim bilgisi (`malzemeAra` için `turler` süzgeci var). Sayfa metni "Malzeme Kartları" -> "Malzemeler ve Hizmetler" (`Ayarlar.tsx`, `Malzemeler.tsx`, `Arama.tsx`).
- satın alma: yalnız alınan hizmeti seçer (sunucuda ret, testli): `malzemeAra(db, { metin, sayfa, yalnizAktif: true, hizmetYonu: 'alinan' })` ya da özetteki `hizmetYonu`
  (hizmet olmayan kartta `null`). Kopya sütunlar (SA2 b) hizmet türü girdiği için artık düşürülebilir. Sayfa metni (`merkez/constants.ts`, `merkez/store.ts`).
- rota: hizmet reçete bileşeni olamaz; bileşen eklerken `malzemeOzeti.tur === 'hizmet'` reddi (malzemeler kart kaydında `bom[].ref` ve `ops[].sarf[].ref` için 422 veriyor).
  Sayfa metni (`MalzemelerEkrani.tsx`, `AdimPaneli.tsx`).
- Logo bağlantısı: `logoyaGidecekMalzemeler(db, sinir, { hizmetDahil: true })` hizmeti `tur: 'hizmet'` ve `hizmetYonu` ile verir; hizmette `tur_karsiligi` eksik sayılmaz,
  birim karşılığı yine gerekir. Bayraksız çağrı hizmeti döndürmez (bugünkü kod hizmeti malzeme olarak göndermesin). Hizmet gövdesi, yolu ve yön çevirisi (alınan 1, verilen 2) Logo'nun;
  sonuç `malzemeLogoSonucu` ile yazılır. "Logo gönderimi" sayfası Logo'nun ucuna bağlı değil: bekleyen hizmet kartı "Hizmet kartı bağlantısı bekliyor" rozetiyle görünür.
- ~~finans (kart #466): firma türünün "tedarikçi olabilir mi" kuralı dışa açık değil; malzemeler (`kurallar.ts` `tedarikciFirmaMi`) ve satın alma (`tedarikciOlabilir`) kopyasını tutuyor.
  İstek: `finans/disari.ts`'e `tedarikciOlabilirMi(tur: FirmaTuru): boolean` (tedarikci ya da ikisi); gelince iki kopya kalkar.~~ Geldi (#471); malzemeler kopyası kalktı.

## Ticari mal türü (kart #1218, 14.10.2026)
Malzemeler `ticari_mal` türünü ekledi (stok kodu TM, Logo kart türü 1). Aşağıdakileri yazmak o modülün işidir (yazılmadı).
- logo: `sunucu/moduller/logo/kurallar.ts` `LOGO_KART_TURLERI` (`[10, 11, 12, 13, 4]`) içine 1. Eklenmezse ticari mal kartı gönderimde "Geçersiz karşılık" ile reddedilir.
- satin-alma: `sunucu/moduller/satin-alma/kurallar.ts` `TALEPTE_SECILEN_TURLER` içine `ticari_mal`. Eklenmezse ticari mal talep edilemez (liste bilerek açık).
- recete-rota: ticari mal reçetede görünmez (kullanıcı kararı); bağlı durum çevirisinde ticari mal kartları süzülsün ya da geçici 'ham' eşlemesi kalksın (malzemeler UYUM-BORCU).
- arkon: `sunucu/moduller/arkon/servis.ts` `STOKLANAN_TURLER` değişmez (VARSAYIM: operatör isteğinde ticari mal yok; üretimde kullanılmaz).
- portal: satış satırı `malzemeOzeti` ile ticari malı alır; prototipteki ürün seçicinin türe göre süzüp süzmediği BİLMİYORUM.
