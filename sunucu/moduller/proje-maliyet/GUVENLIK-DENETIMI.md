# Güvenlik denetimi (proje-maliyet)

Yazma ucu yok (236 a): defteri sunucu işi yazar, yalnız ekleme; zaman sunucudan, donduran boş. Testler `proje-maliyet.test.ts`.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /proje-maliyet/:projeId | finans.maliyet-oku | tutar, gelir, katkı, sapma, kâr riski, ceza ve sapan iş emirleri yalnız `siparisler.fiyat-oku` ile | yönetici okur (PM-13); fiyat yetkilisi tutarı görür (PM-14) | operatör 403, girişsiz 401, olmayan proje 404, sayı olmayan kimlik 400; fiyat yetkisi olmayana tutarlar null (PM-14) |

Gövde yok; istek kimliği gerekmez (tekrar zararsız: tekil kısıt ikinci yazımı yutar).

PM-14 bugün servis düzeyinde sınanır: `siparisler.fiyat-oku` Çekirdek'in göçüyle gelince gerçek girişle sınanacak (UYUM-BORCU PM-B5).
Proje kapsamı (iş merkezi) yok: proje iş merkezine bağlı değildir.
