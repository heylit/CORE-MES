# Uyum borcu: projeler

## Bağlamada kapanacak
1. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): rol x işlem göçü `20261012153419_kisiler_projeler_islemleri.sql` ile girdi (kullanıcı onayı 12.10.2026, kart #852). Rol x işlem / rol dağılımı: sayfa ve işlemler yalnız yöneticide / CEKIRDEK-ISTEKLERI.md madde 1 / kullanıcı onayıyla ayrı göç.
2. Kalite merkezi NCR ve sapma formlarında "proje" serbest metin (jsonb) / `kalite-merkezi` / Aşama 2'de proje seçimine ve `projeler_proje.id`'ye bağlanır.
3. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): Logo bağlantı kodu kullanıcı isteyene kadar kapsam dışı. Logo proje kodu eşleşmesi / 24 karakter ve biçim doğrulanmadı / Logo köprüsü projeyi gönderirken sınır doğrulanır, gerekirse kısıt gevşetme göçü.

4. Proje altındaki üretim emirleri / istemci `GET /adimli-emirler?projeId=` (üretim emirleri ucu, kart #810) ile okur, sunucu döngüsü yok / bölüm emir okuma işlemlerinden birini isteyen kullanıcıya görünür; yetki listesi istemcide uçtaki küme ile elle eşlenmiş (`ProjeEmirleri.tsx` `EMIR_OKUMA_ISLEMLERI`), bağlamada ortak bir kaynağa alınır.
5. Siparişin projeleri Siparişler'de / `siparisler` sunucusu `projeler/disari.ts`'i ithal edemez (projeler siparişi okuduğu için döngü olur) / Siparişler ekranı `GET /projeler/siparis/:siparisId` ucunu istemciden çağırır (madde 4 kalıbı); uç `sayfa.projeler` ya da `projeler.oku` ister, siparişi okuyup projeyi okuyamayan rol bölümü görmez. Rol dağılımı kararı kullanıcıda.
6. KAPANDI (224, 19.10.2026): proje açılırken sipariş `siparisKilitliAyrinti` ile kilitli okunur. Eski metin: siparişten proje açılırken sipariş kilitlenmez / `siparisler/disari.ts`'te kilitli okuma yok / onaylı sipariş yalnız kapanır ya da iptal olur; aynı anda iptal edilen siparişe proje açılabilir. Siparişler kilitli okuma verirse ona geçilir.
7. Kilometre taşının üretim emrine, siparişe ya da satın almaya bağı ve tahmini tarihi yok (890 c, ilk sürüm) / `projeler` plan ve üretim emirlerini okuyamaz (ADR 0006) / bağ ve tahmin üst katmanda (proje-maliyet ya da plan) kurulur; o zamana kadar gerçekleşen tarih elle girilir.
8. Plan ve gerçekleşen zaman çizelgesi Projeler'de hesaplanmaz (908) / plan modülü proje süzgeçli salt okunur uç verir (933 a, 815 sonrası, ayrı dal) / Projeler'e salt okunur sekme API ile eklenir (madde 4 kalıbı).
9. Görev maliyeti görevde tutulmaz (911 b) / üretim dışı masrafın projeye bağı ve taban maliyet fotoğrafı ayrı dalda (934 sorusu açık) / Maliyet sekmesi o dalda genişler.
10. Statü penceresinde kapatılmış güncel statü seçili görünmez (liste yalnız etkin statüleri verir) / yalnız görünüm; geçmişte adıyla kalır.

## Sonra
- KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): kod tekilliği (`projeler_proje_kod_tekil`) çift kaydı önlüyor; yalnız bilgi notu. Kullanmadığı çekirdek kalıbı: tekrar koruması yok (açma komutu kod tekilliğiyle zaten çift kayıt açmaz). Veri kapsamı yok (proje iş merkezine bağlı değil).
