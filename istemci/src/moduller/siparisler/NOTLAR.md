# Notlar: siparisler (istemci)

- Kullanıcı kararı 148: iki taraflı; kök sayfa Satış siparişleri (asıl sahip), Teklifler ikinci maddedir. Düzen ve akış Portal prototipindeki "Satış siparişleri" ve teklif föyündendir.
- Malzeme seçici `/siparisler/malzeme-secenekleri` ucunu çağırır; satılan tür (mamul, yarı mamul, ticari mal) ve aktiflik süzgeci sunucudadır.
- Firma seçici `musteri-tedarikci.oku` ister (`/musteri-tedarikci/firmalar/secim`, müşteri ve iki yönlü firmalar). Yalnız `siparisler.yaz` olan rolün seçici boş kalmasın diye rol dağılımında bu işlem de verilmelidir.
- Formlarda canlı toplam yok: tutarlar sunucu kuralıdır (SIP-06), istemcide yeniden hesaplanmaz; kayıttan sonra ayrıntıda görünür.
- VARSAYIM: sürümün `toplam` değeri iskontolu ve KDV hariç sayılır (KDV yalnız siparişe dönüşürken girilir). KDV varsayılanı %20, prototipteki sabittir.
- Teklif listesinde son sürüm tutarı yok (liste cevabında alan yok); yalnız sürüm numarası yazılır.
- Düğmeler yalnız işlem yetkisi ve kaydın durumuna göre görünür; geçiş kuralını sunucu verir, reddi pencerede yazılır.
- Sevk ilerlemesi, faturalama, tahsilat, fotoğraf ve mesaj prototipte var, sunucuda karşılığı yok; ekranda yoktur.
