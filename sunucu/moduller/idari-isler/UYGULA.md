# Uygulama notu: idari-isler

Dal `claude/idari-isler-1-nksisc`. İki commit: toplayıcı satırları (ayrı), modül.
Uygulama: `npm run goc` (yeni boş tablolar; dolu tabloya dokunmaz). Damga 101500 (koordinatör verdi).
2. parça: göç 102000 (yeni boş tablolar).
Rol göçü (Çekirdek 101700) girene kadar ekranı yalnız yönetici görür.
3. parça: göç 104000 (yeni boş tablo). Yeni işlem `idari-isler.yemek-yaz`; rol satırı Çekirdek göçüyle, o gelene kadar yalnız yönetici bildirir.
4. parça: göç 106000 (yeni boş tablo). Yeni işlem `idari-isler.filo-yaz`; rol satırı Çekirdek göçüyle, o gelene kadar yalnız yönetici yazar.
5. parça: göç 106500 (yeni boş tablo). Yeni işlem `idari-isler.arac-talebi-ac` (247 a, bütün roller); rol satırı Çekirdek göçüyle.

6. parça: göç 109500 (yeni boş tablo). Yeni işlem yok; filo-yaz ve oku kullanılır.
7. parça: göç 110000 (yeni boş tablolar ve kopya işlevi) ve 110500 (İK zimmet kopyası; dolu tablo göçü, 244 a; önce `npm run yedek`).
Yeni işlem `idari-isler.zimmet-yaz`; rol satırı Çekirdek göçü 20261019115000 ile yalnız `idari_isler` (256 a), aynı göç `ik.zimmet-yaz`'ı
rollerden alır. İK'nın kaldırma göçü aynı işlevle arada İK'da yazılanları alır.
