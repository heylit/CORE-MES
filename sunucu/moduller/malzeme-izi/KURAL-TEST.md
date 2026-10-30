# Kural -> test (malzeme-izi)

Testler: `kurallar.test.ts` (saf), `malzeme-izi.test.ts` (gerçek PostgreSQL), `istemci/src/moduller/malzeme-izi/Malzeme360.test.tsx`. Kısıt yok (modülün tablosu yok).

| Kural | Test |
|---|---|
| MIZ-1 Bakiye satırının hâli (1278 a), öncelikle: hurda konumu; karar bekliyor; red ya da karantina; şartlı; kabul; fason, yolda, sevkiyat; statülü ya da istasyonda üretimde; emre ayrılmış rezerve; kalan serbest | `raftaki serbest satır serbest; emre ayrılmışsa rezerve`; `kalite kararı konumdan önce gelir...`; `hurda konumu her şeyden önce...`; `statülü ya da istasyondaki parça üretimde, rezerveden önce` |
| MIZ-2 Stok grupları sabit sırayla; sıfır grup yazılmaz | `sabit sırayla, sıfır grup yazılmaz, aynı grup toplanır` |
| MIZ-U1 Uç sayfa işlemiyle açılır; bakiyesiz kartta stok null, sıfır uydurulmaz | `MIZ-U1 ...` |
| MIZ-U2 Olmayan ve hizmet kartı 404; arama hizmet listelemez | `MIZ-U2 ...` |
| MIZ-U3 Fiyat yalnız finans.oku ile | `MIZ-U3 ...`; ekranda `fiyat yoksa "—", sıfır yazılmaz; finans yetkisi yoksa fiyat bölümü yerine not` |
