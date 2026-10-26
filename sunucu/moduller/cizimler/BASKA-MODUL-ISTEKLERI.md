# Başka modül istekleri: cizimler (kart #708)

Hepsi `cizimler/disari.ts` ile yapılır; merkez bu modülleri ithal etmez.

- malzemeler (kart #300): malzeme kartında "Çizimler" bölümü: `kaydaBagliBelgeler(db, 'malzemeler', kartNo)` ile liste, `kayittakiBelgeDosyasi` ile görüntü; bağ merkezden kurulur (CM3).
- istasyonlar: makine dokümanı bölümü; bağ istasyon ekranından `kaydaBagla(db, kullanici, belgeId, 'istasyonlar', id)`.
- atolye (kart #769): salon krokisi merkezden okunur: `kaydaBagliBelgeler(db, 'atolye', salonId)` ve `kayittakiBelgeDosyasi`; hizalama
  atölyede kalır, `ozet` değişince yeniden hizalama istenir; seçici `yayindakiBelgeler({ tur: 'kroki' })`. Modeller (GLB) için önce C1.
- arkon (kart #769): hazırlık ve çizim stüdyosunda "Çizim Merkezi'nden ekle": Arkon kendi ucundan `yayindakiBelgeler` ile listeler,
  `yayindakiBelgeDosyasi` ile dosyayı alır, dosya kaydında belge kimliğini tutar; yayındaki `ozet` değişince yeni revizyon uyarısı.
- kalibrasyon (kart #301): sertifika dosyası `sertifika` türü belge olarak bağlanır (kalibrasyon NOTLAR'daki ertelenen dosya eki).
- malzemeler (kart #688): `disari.malzemeResimAnahtarlari(db, nolar)` -> `Map<no, { resimNo, revizyon }>` (dal 688-malzemeler-resim); kartta, sihirbazda ve listede `cizimler/disari.ts` `ResimPaneli`, `malzemeBelgesiYukle`, `useKucukResimler`, `KucukResimKutusu`.
- uretim-emirleri (kart #688, beklemede): liste ve ayrıntıda `useKucukResimler('malzemeler', kartNolar)` ve `KucukResimKutusu`; sunucu değişikliği gerekmez.
