# Güvenlik denetimi (takvim)

Yazma ucu yok (1161 a). Tek okuma ucu; kaynaklar yalnız kaynak modülün `disari.ts` okumasıdır. Testler `takvim.test.ts`, `kurallar.test.ts`.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /takvim | takvim.oku | aralık 1-93 gün, bitiş başlangıçtan önce değil; her kaynak kendi okuma işlemini ister (1163 a), işlemi olmayan kaynak okunmaz ve cevapta adı da geçmez; izin `ik.oku`/`ik.izin-oku` yoksa yalnız kişinin kendi izni (1191 a) | yönetici bütün bağlı kaynakları okur; yalnız takvim.oku olan planlı duruşu görür, finans.oku verilince vergi eklenir; ik.izin-oku verilince bütün izinler | operatör 403; ters ve uzun aralık 400; İK yetkisiz kişi başkasının iznini görmez |

Başkasının adı yalnız izin kaynağında ve yalnız `ik.oku` ya da `ik.izin-oku` olana döner.
