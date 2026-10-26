# Başka modül istekleri (kalite-merkezi)

Dosya modülünden yok. Kullanılan dışa açık fonksiyonlar var olanlardır (DOĞRULANDI: `sunucu/moduller/dosya/disari.ts`): `dosyaBagla`, `bagKaldir`,
`bagliDosyalar`, `dosyaAkisi`, `denetimSatiri`. İçerik yüklemesi ortak `/dosyalar/:ozet/parca` ucuyla yapılır.

## cizimler: alınan revizyonun dosyası (stüdyo, 597 a)
- İstek: `cizimler/disari.ts` belge kimliği ve revizyon özetiyle o revizyonun dosyasını versin (ör. `revizyonDosyasiOzetle(db, belgeId, ozet)`,
  revizyon yayından kalkmış olsa da; okuma yetkisi çağıranın ucunda).
- Neden: Kalite Merkezi resmi belge merkezinden içerik kopyalamadan alır (belge kimliği ve özet). Bugün yalnız `yayindakiBelgeDosyasi` var;
  belge yeni revizyona geçince eski revizyonun balonlu resmi ve geçmiş ölçümlerin resmi açılamaz (uç 409 döner, KM-S11).
- Geçici karşılık: yalnız yayındaki revizyon verilir. Kopyalama yolu (Arkon gibi) seçilmedi: ortak depoda bağ, yükleyenin kendisi olmasını ister (`dosyaBagla`).
