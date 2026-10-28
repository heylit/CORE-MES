# Kural - test eşlemesi (takvim)

| Kural | Tanım | Test |
|---|---|---|
| TK-K1 | Okuma işlemi olmayan kaynak görünmez; bağlanmamış kaynak yetkisi varsa `bekleyenler`'de | kurallar.test.ts "TK-K1..."; takvim.test.ts "TK-02", "TK-03" |
| TK-K2 | Kayıtlar tarih, kaynak sırası, kimlik sırasıyla gelir | kurallar.test.ts "TK-K2..."; takvim.test.ts "TK-02" |
| TK-01 | takvim.oku yoksa 403; ters ya da 93 günden uzun aralık 400 | takvim.test.ts "TK-01" |
| TK-03 | Kaynak yetkisi verilince kaynak eklenir (1163 a) | takvim.test.ts "TK-03" |
| TK-K3 | İzin (1191 a): ik.oku ya da ik.izin-oku bütün izinleri, öteki kişi kendi iznini görür | kurallar.test.ts "TK-K3..."; takvim.test.ts "TK-04"; ik/disari.test.ts "takvim (891)..." |
