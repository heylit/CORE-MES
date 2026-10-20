# İstasyonlar: üretim alanı işareti (SH5 b) - yazım listesi

Durum: liste. Kullanıcı "yaz" demeden ve göç onayı gelmeden dal açılmaz, commit atılmaz.
Kaynak: `/mnt/project-files/bagla/HAZIRLIK.md` SH5 (cevap b), stok `BASKA-MODUL-ISTEKLERI.md` 47-50, stok `UYUM-BORCU.md` 17 (main c73e2d4, okundu 09.10.2026).

## Kart ve dal
- Kart: koordinatörden istenecek (bu oturum kart açmaz). Öneri başlık: "İstasyonlar: üretim alanı işareti (SH5 b)".
- Dal: `<kart>-istasyonlar-uretim-alani`, güncel main'den. Tek çekme isteği, ayrı göç commit'i.

## Göç (dolu tablo: `istasyon`)
- `ALTER TABLE istasyon ADD COLUMN uretim_alani boolean NOT NULL DEFAULT false`.
- Göç başta satır sayısını sayar ve iletiyle yazar (`RAISE NOTICE 'istasyon: % satır; hepsi işaretsiz başlar'`). Satır silinmez, başka değer değişmez.
- Sabit varsayılanlı sütun PostgreSQL 11 ve sonrasında tabloyu yeniden yazmaz (VARSAYIM: belgeden biliniyor, bu depoda denenmedi; testte boş şemada denenir).
- Dizin yok (küçük tanım tablosu). Tip ile bağ kurulmaz: her tip işaretlenebilir (tip `depo` şartı yok, SH5 a seçilmedi).
- Geri alma: sütunu düşüren yeni göç; işaretli değerler kaybolur.

## Sözleşme ve sunucu (istasyonlar)
- `istasyonSemasi` ve `disari.ts` `Istasyon`: `uretimAlani: boolean`.
- `POST /istasyonlar`: `uretimAlani` isteğe bağlı, verilmezse false.
- `POST /istasyonlar/:id/guncelle`: gönderilmeyen `uretimAlani` DEĞİŞMEZ (#329'daki kural). Neden: rota Kaynaklar ekranı (`KaynaklarEkrani.tsx:174-181`) ve Arkon/plan test kurulumları bu alanı bilmeden güncelliyor; tam kayıt olsaydı işareti sessizce silerdi.
- Yeni `disari.ts`: `uretimAlanlari(db, { pasiflerDahil }?): Promise<Istasyon[]>` (koda göre sıralı; varsayılan yalnız aktif). Stok konum seçimi için.
- Var olanlar yeter: `istasyonGetir(db, id)` (varlık, aktiflik, `uretimAlani`), `istasyonAdlari(db, idler)`.
- Yetki: yazma `istasyonlar.yaz` (değişmez), yeni rol satırı yok.
- Testler: göç (var olan satır false, NULL reddi), uç (ekle, güncelle, gönderilmeyen alan korunur), `uretimAlanlari` (pasif süzgeci).

## Ekran (istasyonlar)
- İstasyon penceresine "Üretim alanı" işaret kutusu; listede işaretli istasyona simge ve süzgeç yok (en az dokunuş).

## Stoğa düşen istekler (stok yazar; istasyonlar yazmaz)
1. Göç: `stok_konum.istasyon_id int REFERENCES istasyon`, `stok_konum_tur_degeri`'ne `uretim_alani`, kısıt: `uretim_alani` ⇔ `istasyon_id` dolu.
2. Konum açarken `istasyonGetir`: istasyon var, aktif ve `uretimAlani` true olmalı; seçim listesi `uretimAlanlari`.
3. İşaret sonradan kaldırılırsa ya da istasyon pasife alınırsa var olan konum bozulmaz (yabancı anahtar istasyonun silinmesini zaten engeller); yeni konum açılmaz. Stok ekranı bunu nasıl gösterir: stokun kararı.
4. Stok `UYUM-BORCU` 17 ve `BASKA-MODUL-ISTEKLERI` 47-50 bu işle kapanır.
5. DEP-07: üretim alanı konumu öneriye ve otomatik düşüme kaynak olmaz (stokta zaten var).

## Diğer parçalar
- Rota, plan, Arkon: değişiklik gerekmez (alan isteğe bağlı, güncellemede korunur). Rota Kaynaklar ekranında işaret görünmez; istenirse rota isteği.
- Ortak arayüz ve çekirdek: istek yok.

## Aynı karta eklenen (koordinatör, ortak arayüz isteği, 09.10.2026)
- Kişi kısıtları bölümü (`KisiKisitlari.tsx:11`) kişi listesini `GET /kisiler`'den (`kisiler.oku`) okuyor; o işlemi olmayan rol hata alıyor (UYUM-BORCU 3).
  Çözüm: aynı modülün `GET /kisi-secenekleri` ucu (`istasyonlar.yaz`; id, ad, aktif). Sunucu değişmez; istemci ve testi değişir, UYUM-BORCU 3 kapanır.
