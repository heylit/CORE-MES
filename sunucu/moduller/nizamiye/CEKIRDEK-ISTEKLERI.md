# CEKIRDEK-ISTEKLERI: nizamiye

1. Rol x işlem göçü (182 a ve 174 a onaylı; Çekirdek yazar, 160 rol tablosuna girer):
   | İşlem | Roller |
   |---|---|
   | `sayfa.nizamiye` | guvenlik_gorevlisi, idari_isler, mudur |
   | `nizamiye.oku` | guvenlik_gorevlisi, idari_isler, mudur |
   | `nizamiye.yaz` | guvenlik_gorevlisi, idari_isler |
   | `nizamiye.kart-yonet` | idari_isler, mudur |
   Yönetici hepsini kendiliğinden alır.
2. Öneri §13'teki 18 simge (kapı, kart, kask, dizüstü ve diğerleri). Gelene kadar var olan simgeler kullanıldı; sayfa simgesi `scan` (ana menüde tekil olmalı, `building` müşteri-tedarikçide).
3. Zod taşımayan sözleşme sabitleri: istemci `NEDENLER`, `ATOLYE_NEDENLERI`, `KIMLIK_TURLERI`, `KART_TURLERI` değerlerini sözleşmeden ithal edemiyor (eslint `ZODSUZ` listesi). Şimdilik `istemci/src/moduller/nizamiye/gorunum.ts` içinde tipe bağlı kopya var; `paylasilan/sozlesme/nizamiye-sabitleri.ts` listeye eklenirse kopya kalkar.
4. Üst çubukta yer kalmayınca modül düğmeleri için taşma menüsü ("Diğer"): 768-1023 genişlikte Ziyaretçilerim düğmesi bu yüzden gizli.

5. Rol x işlem (259 a, yazılı onay): `insan_kaynaklari` rolüne `nizamiye.pdks-aktar`; sayfa işlemi gerekmez (düğme üst çubukta). Girdi: #1951.
