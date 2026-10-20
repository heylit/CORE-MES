# Eski kurallar: okuma kılavuzu

Bu klasör, eski TMI sisteminin iş kurallarını yeni sistemi sıfırdan yazarken başvuru olsun diye konu konu toplar. Her kural tek cümledir ve kullanıcıdan "kalsın, gitsin ya da değişsin" kararı bekler; eski sistemde birçok kuralın değişmiş olması beklenir. Teknik ayrıntı, arayüz ve tarihçe bilerek dışarıda bırakılmıştır, yalnız işin kuralı kalmıştır. Hiçbir kural kendiliğinden geçerli değildir: onay verilene kadar hepsi önerilmiş sayılır.

## Sınıf değerleri

| Sınıf | Anlamı |
|---|---|
| Tanım | Bir kavramın ne olduğu. |
| Değişmez | Asla bozulmaması gereken kural. |
| Akış | Kim neyi hangi sırayla yapar. |
| Hesap | Formül ya da türetme. |
| Sınır | Bilinçle yapılmayan şey. |
| Açık soru | Kaynakta çelişkili ya da karara bağlı madde; kullanıcıya sorulur. |

## Durum değeri

Bütün satırlar `onay bekliyor` durumundadır. Kullanıcı karar verdikçe durum kalsın, gitsin ya da değişsin olarak güncellenir.

## Dosyalar

| Dosya | Konu | Kural kodu |
|---|---|---|
| 01-uretim-emri-ve-adim.md | Üretim emri, iş emri adımı, durum ve aşama | UE |
| 02-rota.md | Parça rotası ve reçete | ROTA |
| 03-plan-cizelge-matris-kuyruk.md | Plan, çizelge, yayın ve kuyruk | PLAN |
| 04-vardiya-ve-mesai.md | Vardiya, takvim, kapasite ve ek mesai | VAR |
| 05-istasyon-kaynak-personel.md | İstasyon, kaynak ve personel | KAY |
| 06-terminal.md | Üretim girişi, duruş ve verimlilik | TER |
| 07-stok.md | Stok bakiyesi, teslim ve hammadde partisi | STK |
| 08-yetki-ve-denetim.md | Yetki, oturum, denetim kaydı ve yedek | YTK |
| 09-kapsam-disi.md | İlk kapsamda olmayan modüllerin listesi | yok |

## Bu klasörün sonu

Onaylanan kural testlere ve veri tabanı kısıtlarına dönüşür; sonra bu klasör silinir.
