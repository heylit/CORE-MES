# Finans istekleri 6 ve 7: yalıtılmış çerçevede form izni ve görünüm köprüsü (liste, yazım yok)

Kaynak: dal `246-finans` (PR #321), `sunucu/moduller/finans/CEKIRDEK-ISTEKLERI.md` madde 6 ve 7, `FinansCercevesi.tsx`, `gorunum-koprusu.ts`.
Taban main 959c15a. Dal açılmadı, commit yok. Yazım kullanıcının "yaz"ından sonra, `istemci/src/ortak` şeridinde.

## Değişecek dosyalar (ortak)
1. `arayuz/YalitilmisCerceve.tsx`
   - `YalitimIzni` tipine `'allow-forms'` eklenir.
   - İzin istenirse bileşen sayfanın `<head>`'inin hemen ardına kendi politikasını koyar: `<meta http-equiv="Content-Security-Policy" content="form-action 'none'">`.
   - Sayfada `<head>` yoksa izin düşer ve çerçeve form izni olmadan çizilir.
   - `allow-same-origin` ve `allow-top-navigation*` tipte yine yok.
2. `rota/cerceve-gorunumu.ts`: finansın `gorunum-koprusu.ts` dosyasındaki `useYalitilmisGorunum(kok)` buraya taşınır, davranış aynı.
   - Dönen işlev, `YalitilmisCerceve`'nin süzüp ilettiği iletiyi alır; görünüm iletisiyse işler ve `true` döner, değilse modülün kendi kanalına bırakır.
   - `kabukKoprusuKur` (`cerceve-iletisi.ts`) değişmez.
3. `arayuz/index.ts` ve `rota` dışa aktarımı, testler, `FARK.md`, `NOTLAR.md` (bir satır: form izni ne açar, ne açmaz).

## İzni modül nasıl ister
- Modül `<YalitilmisCerceve izinler={[..., 'allow-forms']} />` yazar. Finansta bu tek satır modül işidir ve finans dalında yapılır.
- Görünüm için modül `useYalitilmisGorunum(KOK)`'u ortaktan alır ve `iletiGeldi` başında çağırır; finansın `gorunum-koprusu.ts` dosyası silinir (modül işi, UYUM-BORCU bağlamada 1 kapanır).
- Malzemeler ve Arkon değişmez: ikisi de form izni istemiyor, görünümü kendi kanallarıyla taşıyor.

## Güvenlik sınırı
- Form izni yalnız `submit` olayının çalışmasını sağlar; prototip olayı `preventDefault` ile kendisi işler ve veriyi köprüyle yollar.
- Gerçek gönderim (`action` adresine gezinme) her durumda kapalıdır, çünkü `form-action 'none'` ortak bileşen tarafından konur.
  - Modülün kendi politikası bunu gevşetemez: birden çok politika varsa tarayıcı hepsini ayrı ayrı uygular.
  - VARSAYIM: CSP3 belgesine göre, `form-action` meta içinde geçerli. Denemeyle doğrulanmadı; yazımda tarayıcıda sınanacak.
- Oturum erişimi yok:
  - Kök opak, `allow-same-origin` verilmiyor. Çerçevedeki kod çereze, `localStorage`'a ve üst sayfaya ulaşamaz.
  - Oturum çerezi `HttpOnly; SameSite=Strict` (`sunucu/cekirdek/cerez.ts:18`, DOĞRULANDI). Politika bir gün düşse bile opak kökenden TMI'ye giden form isteğinde çerez gitmemeli. Bu, tarayıcıda doğrulanacak.
- `target="_top"` ya da `_blank` ile gönderim yasak: sandbox `allow-top-navigation` ve `allow-popups` vermiyor; `form-action` de kapatıyor.
- Programla `form.submit()`: `submit` olayı atlanır ama politika yine uygulanır.

## Testler
Birim (izinli):
- `allow-forms` istenince sandbox'ta bulunur. Politika satırı `<head>`'in ilk öğesi olur ve modülün kendi meta'sından önce gelir.
- `useYalitilmisGorunum`: hazır iletisinde adresteki görünüm gider; içerideki geçiş adresi değiştirir. Bu, finansın testinin taşınmış hali.

Birim (reddedilen):
- İzin istenmezse sandbox'ta yok ve politika eklenmez (malzemeler ve Arkon aynı kalır).
- `<head>`'siz sayfada izin düşer.
- `'allow-same-origin'` ve `'allow-top-navigation'` tipte yok (`@ts-expect-error`).
- Menüde olmayan görünüm adresi değiştirmez. Görünüm kanalı dışındaki ileti `false` döner ve modülün işleyicisine gider.

Tarayıcı (Playwright depo dışı, finans sayfası):
- Kayıt formu kaydeder: köprü isteği gider ve liste yenilenir.
- Çerçeveye konan `action="https://ornek.invalid"` ve `action="/api/oturum"` formları gönderilince:
  - ağ isteği çıkmaz;
  - çerçeve adresi değişmez;
  - konsolda politika ihlali görünür.
- Politikanın düştüğü sahte durumda bile `/api` isteğinde çerez başlığı yok (SameSite sınaması).

## Sıra
Önce bu ortak iş birleşir. Sonra finans dalı tek satır izni ekler, ortak hook'a geçer ve `gorunum-koprusu.ts`'i siler. Finansta dosya sahibi finans konusudur.
