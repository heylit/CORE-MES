# Çekirdek istekleri: ortak-dosyalar (kart 2067)

1. `istemci/src/ortak/tasarim/simgeler.ts`'e klasör simgesi (`folder`, `folder-plus`). Bugün `layers` kullanılıyor (UYUM-BORCU 5).
2. `istemci/src/ortak/tasarim/simgeler.ts`'e bağlantı simgesi (`link`): kayda bağlı klasör işareti (Arayüz ön bakışı 2067, 1). Bugün `pin` (UYUM-BORCU 9).
3. KAPANDI (kart 3288-2): `istemci/src/ortak/arayuz/KlasorBaglantisi.tsx`. Firma, sipariş ve proje ekranları Ortak Dosyalar'ı ithal
   edemez (istemci katmanı, ADR 0006); bağlantı ortak arayüzdedir ve yalnız `GET /ortak-dosyalar/kayit/:tur/:id` ucuna dayanır.
