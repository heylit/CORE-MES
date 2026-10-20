# FARK: profil (Profilim ve şikayet/istek/öneri kutusu) — dal `claude/project-thread-o7x8bt`, taban `main`

Yeni modül. Kart numarası görevde verilmedi (koordinatör kararı "Hemen yaz"); dal adı oturumun verdiği addır.
İstek: kullanıcı mesajının 1. ve 2. maddeleri (üst çubukta şikayet/istek/öneri düğmesi; herkese profil sayfası).

## Eklenen
- `sunucu/moduller/profil/`: `kurallar.ts` (PRF-1..PRF-4), `sorgular.ts`, `servis.ts`, `uclar.ts` (3 uç), testler, belgeler.
- `sunucu/gocler/20261014215300_profil_geri_bildirim.sql`: yeni boş tablo `profil_geri_bildirim` (yalnız ekleme).
- `paylasilan/sozlesme/profil.ts`, `paylasilan/islemler/profil.ts` (`profil.geri-bildirim-oku`).
- `istemci/src/moduller/profil/`: `/profil` (Profilim), `/profil/gelenler` (okuyanın listesi), üst çubuk düğmesi (`ust-eylem.tsx`), test.

## Başka yerde değişen (ayrı commit'ler)
- `sunucu/moduller/ik/` (sorgular, servis, disari): `kisininPersonelKarti` okuması eklendi; yalnız ekleme, var olan davranış değişmedi.
  Ücret, kimlik no, banka ve sağlık alanı dönmez.
- Toplayıcı: `paylasilan/islemler.ts` ve `paylasilan/islem-adlari.ts` içinde yalnız profil satırı.
- Ortak arayüz (`istemci/src/ortak`): üst çubuktaki ad `/profil`e götürür, telefondaki hesap menüsüne "Profilim" eklendi, sayfa başlığı
  "Profilim"; `UstEylem.islem` artık `'oturum'` da alır (giriş yapan herkes görür); `ParolaPenceresi` ortak dizinden dışa açıldı.

## Öneriyle ilerleyenler (itiraz edilirse değişir)
- Profil menü sayfası değildir: yeni `sayfa.*` işlemi ve rol satırı gerekmesin diye üst çubuktaki addan açılır (rotası herkese açık).
- Gönderilen kayıt adla tutulur (anonim değil) ve değişmez; durum (okundu, çözüldü) yok.
- Okuyan: yalnız `profil.geri-bildirim-oku`; yönetici (bayraklı), müdür ve İnsan Kaynakları (kullanıcı kararı 14.10.2026, göç `20261014215800_profil_geri_bildirim_okuyanlar.sql`).
- İzin talebi, iletişim güncellemesi ve ayrıntılı mesai İK İşlemlerim'de kalır; profil oraya bağlantı verir, kopyasını yazmaz.
- PIN değiştirme yok: kişinin kendi PIN'ini değiştirdiği uç oturum modülünde yok (çekirdek isteği).
