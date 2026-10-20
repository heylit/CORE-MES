# KURAL-TEST: bildirim

| Kural | Nerede | Test |
|---|---|---|
| BIL-1 Mesaj ve e-posta kanalları bu aşamada kapalı; seçim saklanır | `kurallar.ts` `ACIK_KANALLAR` | `tercihler: yalnız alabileceği olaylar ...` (`kanallar` iki kanal da false) |
| BIL-2 Operatörde e-posta seçeneği çıkmaz | `kurallar.ts` `epostaSecilebilir` | `BIL-2: ...` (saf); `operatör e-posta seçemez ...` (akış) |
| BIL-3 Alıcı: olay türünün işlem sahibi ya da adıyla verilen etkin kişi; tetikleyen almaz | `kurallar.ts` `alicilariSec` | `BIL-3` üç saf test; `olay işlem sahiplerine gider ...`, `adıyla verilen kişi de alır ...` |
| BIL-4 Okunmamış aynı kaynak yeni satır açmaz, sayaç artar | `kurallar.ts` `tekilAnahtar`; dizin `bildirim_kaydi_tekil_okunmamis` | `BIL-4` (saf); `aynı kaynak okunmamışken ...` |
| BIL-5 Başlık boş olamaz, uzun metin kesilir | `kurallar.ts` `metniHazirla`; kısıt `bildirim_kaydi_baslik_gecerli` | `BIL-5` (saf); `geçersiz yol ve boş başlık olayı yazmaz` |
| BIL-6 Gönderilen yol türün ekranı ya da altıdır; alıcı roller o ekranı açar | `kurallar.ts` `yolTureUyar`; tür alanı `yol` | `BIL-6` (saf); `araclar/bildirim-yollari.test.ts` (rol x sayfa) |
| Kişi yalnız kendi satırını görür ve işaretler | `sorgular.ts` `kisi_id = $` | `başkasının bildirimi görünmez ...` |
