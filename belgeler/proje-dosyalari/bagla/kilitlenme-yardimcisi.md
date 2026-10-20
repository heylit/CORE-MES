# Kart #370: kilitlenme hatasında yeniden deneme yardımcısı (liste, kod yok)

Kaynak: origin/main 6e04d3e. Yazım kullanıcı "yaz" deyince başlar; dal `370-kilitlenme-yineleme`.

## Bugün (DOĞRULANDI)

- Her yazma ucu tek transaction'da koşar (`sunucu/cekirdek/uc.ts`, `calistir`). Kilitlenme (40P01) ya da serileştirme (40001) olursa transaction geri alınır ve hata genel işleyiciye düşer. `uygulama.ts` `hatayiCevir` bunu tanımaz: kullanıcı 500 "Beklenmeyen bir hata oluştu" görür, günlüğe beklenmeyen hata yazılır.
- Çekirdekte süre aşımı (`vtSureDoldu`: 57014, 55P03) ve ulaşılamama (`vtUlasilamadi`) için yardımcı var, kilitlenme ve serileştirme için yok. Arkon kendi listesini tutuyor (`arkon/servis.ts:462` `GECICI_SQLSTATE`).
- Uygulama yazma transaction'ı READ COMMITTED; 40001 bugün yalnız daha sıkı düzeyde ya da okuma transaction'ında (REPEATABLE READ, salt okunur) çıkabilir (`cekirdek/surum.ts:13`, `db.ts:53`).

## Yapılacaklar

| # | Parça | Ne | Etki |
|---|---|---|---|
| Y1 | `cekirdek/db.ts` | `vtGeciciCakisma(hata)`: 40P01 ve 40001'i tanır (`vtSureDoldu` yanında, aynı biçim) | yalnız sınıflayıcı |
| Y2 | `cekirdek/uygulama.ts` | Yinelemeden sonra hâlâ kilitlenme varsa 500 yerine 503 "Sistem şu an meşgul, yeniden deneyin" (`mesgul()`, var olan ileti) | bütün uçlar; kullanıcı "beklenmeyen hata" yerine yeniden dene iletisi görür |
| Y3 | `cekirdek/uc.ts` | Uç tanımına seçimli `kilitlenmedeYinele: true`. İşaretli yazma ucunda bütün transaction (işleyici, denetim, tekrar koruması dahil) en çok 3 kez, kısa ve rastgele aralıkla (10-50 ms) yeniden koşar. Yalnız Y1'in tanıdığı hatada; iş kuralı reddi (`UygulamaHatasi`), kısıt ihlali, süre aşımı yeniden denenmez | yalnız işaretli uçlar |
| Y4 | `cekirdek/db.ts` ya da ayrı dosya | Arka plan işleri ve servis içi için aynı kural: `kilitlenmedeYinele(vt, is)` (transaction'ı kendisi açar; açık transaction içinde çağrılamaz, çünkü kilitlenen transaction kullanılamaz) | yalnız çağıran |
| Y5 | testler | Gerçek PostgreSQL'de iki bağlantıyla üretilmiş kilitlenme: yinelenince geçer; iş kuralı reddi bir kez koşar; 3 denemeden sonra 503; işaretsiz uç bir kez koşar. Mutasyon: sınıflayıcı, deneme sınırı, işaret | |
| Y6 | belge | `sunucu/cekirdek/FARK.md` ve `yapi-kaliplari` notu: hangi uca işaret konur | |

## Kullananlar (her biri sahibine istek)

- Arkon: `GECICI_SQLSTATE` yerine `vtGeciciCakisma` (kendi yinelemesi kalır: satır `bekliyor` kalıp sonra denenir). Arkon klasörüne bu dal dokunmaz.
- İlk işaretli uç bu dalda yok. VARSAYIM: kilitlenme bugün yalnız birden çok satırı farklı sırayla kilitleyen yazmalarda olası (stok hareketi, üretim emri ve Arkon kaydı). Her modül işaretini kendi dalında, testiyle koyar.

## Öneriyle ilerlenenler (VARSAYIM, geri alma ucuz)

- Deneme sayısı 3, aralık 10-50 ms: kilitlenmede PostgreSQL bir tarafı hemen düşürür, kısa bekleme yeter.
- Varsayılan kapalı (seçimli işaret): yeniden koşan işleyici yan etkisiz olmalı. Bugün dış çağrı yok, çerezler deneme başına sıfırlanır.
- Y2 bütün uçlara uygulanır; bugün 500 dönen durum 503 olur, istemci zaten 503'ü "yeniden dene" diye gösteriyor (VARSAYIM: `istemci/src/ortak/veri` 503 iletisi, yazımda doğrulanacak).

## Sorulacak

Yok (teknik ayrıntı). Yeni bağımlılık, şema, yetki değişikliği yok.
