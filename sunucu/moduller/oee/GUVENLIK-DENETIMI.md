# Güvenlik denetimi (oee)

Yazma ucu yok. Tek okuma ucu; kişi ve kapsam sunucudan. Testler `oee.test.ts`.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /oee | oee.oku | aralık 1-92 gün, bitiş başlangıçtan önce değil; iş merkezi kapsamı; tutarlar yalnız `finans.maliyet-oku` ile | yönetici ve ek işlemli izleyici okur; kısıtlı kişi yalnız kendi merkezi | operatör 403; ters ve uzun aralık 400; maliyet yetkisi olmayana tutar null |

Kişi adı ve kişi başı değer dönmez; işçilik yalnız makine toplamı olarak görünür.
