# ON-PAKET: vardiya (kart #410)

Sorular tek turda soruldu ve cevaplandı (2026-10-09 23:24, proje konusu "Vardiya ve mesai").

| No | Soru | Cevap |
|---|---|---|
| VQ1 | Modül adı ve kapsamı: `vardiya`; Günlük Mesai sayfası bu turda yok | a (kabul) |
| VQ2 | Personel kartındaki "Vardiya" alanının sahibi: vardiya modülü mü, istasyonlar mı | a: vardiya modülü, kendi ucuyla |

Önceki kararlar: kart #410 yorumu (2026-10-09 16:28, vardiya bu depoda yazılır); sabit kimlik (vardiya personel-vardiya sahipliğinde; Arkon'daki kopya bağlamada kalkar).

## Öneriyle ilerlenenler (VARSAYIM, geri alma maliyetiyle)
1. Kişinin iş merkezi en büyük yüzdeli istasyon atamasından türer (eşitlikte küçük istasyon no). Plan ile aynı seçim (P-B4). Ucuz: tek fonksiyon.
2. Tesis geneli takvim (vardiya tanımı, tatil, haftayı uygula, temizle) yalnız iş merkezi kısıtı olmayan kişide. Ucuz: tek denetim.
3. Haftayı uygula yalnız aktif iş merkezlerine yazar; pasif merkezin düzeni kalır. Ucuz.
4. Temizle geçmiş tarihli günleri yalnız `vardiya.gecmis-yaz` ile siler; yoksa onlar kalır. Ucuz.
5. Okuma uçları süzülmez (takvim tesis bilgisidir); kişi adları dönen `/vardiya-personeli` yalnız sayfayı görene ya da yazana açık. Ucuz.
6. Bağlanamayan kaynağın takvimi `null`: sürekli çalışma uydurulmaz; plan ne yapacağına kendi karar verir. Ucuz.
