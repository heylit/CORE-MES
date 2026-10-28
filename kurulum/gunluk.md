# Sunucu günlüğü (1061 a)

## Nerede
- Sunucu her satırı konsolla birlikte `TMIV2-GUNLUK` klasörüne yazar. Klasör depo klasörünün yanındadır (depo `D:\TMIV2\CORE-MES` ise
  `D:\TMIV2\TMIV2-GUNLUK`), güncelleme ona dokunmaz. Bekçinin kendi günlüğü (`bekci.log`) aynı klasördedir.
- Her gün yeni dosya: `sunucu-YYYY-AA-GG.log` (sunucunun yerel tarihi). Satırlar JSON'dur (pino); çerez ve yetki başlığı `[gizli]` yazılır.
- 60 günden eski `sunucu-*.log` dosyaları gün dönerken silinir. Başka dosyaya dokunulmaz.
- Test ortamında günlük kapalıdır.

## Hata kodu
- Sunucu hatasında (5xx) ekranda "Hata kodu: 1a2b3c4d" görünür. Aynı kod günlük satırında `"reqId":"1a2b3c4d"` olarak durur:
  `findstr 1a2b3c4d D:\TMIV2\TMIV2-GUNLUK\sunucu-*.log`.
- Kod istemciden gelen başlıktan alınmaz; her isteğe sunucu verir.

## Windows olay günlüğü
- Hata ve ölümcül satırlar Uygulama günlüğüne de yazılır: kaynak `TMIV2`, olay kimliği 100, tür Hata. Windows'un kendi `eventcreate`
  aracı kullanılır, paket yoktur. Dakikada en çok bir olay yazılır; arada kalan hataların sayısı sonraki olayın metnindedir, hepsi dosyadadır.
- Kaynak ilk kez yönetici hesabıyla açılır (kurulumda bir kez, yönetici komut isteminde):
  `eventcreate /T INFORMATION /ID 1 /L APPLICATION /SO TMIV2 /D "TMIV2 olay kaynagi"`
  Doğrulanmadı: kaynağı yönetici olmayan hesabın ilk kez açıp açamadığı ve Görev Zamanlayıcı hesabının sonraki yazmalara izni.
  Yazma başarısızsa neden Güvenlik Merkezi > Durum > Sunucu durumu kartında görünür.
- İzleme aracı bu olaya bağlanabilir (Olay Görüntüleyici'de "Bu olaya görev ekle" ya da kurumun izleme aracı). E-posta uyarısı yoktur (1061 a).

## Vekil sertifikası
- HTTPS'i IIS bitirdiğinde sertifika uygulamadan görünmez. Süresinin Sunucu durumu kartında izlenmesi için IIS sertifikasının açık kısmı
  anahtarsız `.cer` olarak dışa verilir (Sertifikalar > Dışa aktar > "Özel anahtarı dışa aktarma", Base-64) ve yolu `.env`'e yazılır:
  `TMIV2_IZLENEN_SERTIFIKA=D:\TMIV2-SERTIFIKA\vekil.cer`. Sertifika yenilenince dosya da yenilenir.

## Sunucu durumu kartı
Güvenlik Merkezi'nin Durum sayfasındadır (`guvenlik.oku`): günlüğün son yazıldığı an ya da yazılamama nedeni, olay günlüğü durumu,
son sunucu hataları (zaman, ileti, hata kodu), son yedeğin yaşı, disk boş yeri, sertifika bitişi.
