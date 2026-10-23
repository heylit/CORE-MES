# Test robotu

ADR 0019. Rol senaryolarını gün döngüsüyle, aynı anda koşturur; sonucu depo dışındaki koşu klasörüne yazar. Canlıda koşmaz.

## Koşmak
1. Boş test veritabanı (`TMIV2_PG_DATABASE`), `TMIV2_ORTAM=gelistirme` ya da `test`.
2. `npm run goc`, `npm run ekran:hazirla`, `npm run derle:istemci`.
3. `npm run robot`. Koşu klasörü ekrana yazılır.

Ayarlar: `TMIV2_ROBOT_SONUC` (koşu klasörlerinin kökü, depo dışı), `TMIV2_ROBOT_TOHUM`, `TMIV2_ROBOT_GUN` (varsayılan 22),
`TMIV2_ROBOT_ESZAMANLI` (aynı anda iş, varsayılan 4), `TMIV2_ROBOT_SENARYO` (virgüllü ad süzgeci),
`TMIV2_ROBOT_MODEL` (`kapali` | `claude-kod` | `api`), `TMIV2_ROBOT_MODEL_UST_SINIR`, `TMIV2_ROBOT_MODEL_ADI`,
`TMIV2_ROBOT_MODEL_ANAHTARI` (yalnız `api`), `TMIV2_ROBOT_CLAUDE_KOMUTU` (varsayılan `claude`).

## Koşu klasörü (`sozlesme.ts`)
- `ozet.json`: koşu, gün, sayaç, model çağrısı; koşu sürerken güncellenir.
- `adimlar.jsonl`: her adım bir satır (gün, rol, senaryo, adım, sonuç, süre, istek, beklenen/gelen, ileti, ek).
- `yorum.md`: model açıksa koşu sonu yorumu. `ekler/`: ekran görüntüsü ve iz.

Sonuçlar: `gecti`, `dustu`, `ara-sira` (yan etkisiz adım ilk denemede düştü, ikincisinde geçti), `baglanmamis` (Aşama 2'de bağlanacak; hata değil).

## Senaryo yazmak
- `senaryolar/<ad>.ts`, `export default senaryo({ ad, roller, kopya, kos })`. Liste yoktur; dosya bulunur.
- Uçlar kara kutudur: yol ve gövde `npm run harita -- --modul <ad>` çıktısından okunur. SQL yazılmaz, sunucu kodu ithal edilmez.
- Veri `b.rastgele.kod('firma')` gibi BNZ- önekli üretilir; gerçek ad, parça no, firma yazılmaz.
- Yazma adımı yeniden denenmez; tekrarlanabilir olan yalnız okumadır.
- Bağlanmamış adım `b.baglanmamis(rol, ad, '<borç maddesi>')` ile işaretlenir.
