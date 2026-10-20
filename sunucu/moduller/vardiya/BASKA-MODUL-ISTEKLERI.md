# Başka modül istekleri (vardiya)

## rota (Kaynaklar > Vardiyalar ve Personel; T4)
1. `istemci/src/moduller/rota/beklenen/vardiya.ts` kalkar; tipler `#paylasilan/sozlesme/vardiya.ts`'ten.
2. Vardiya güncelleme gövdesine `surum: v.surum` eklenir (yoksa 400); `POST /vardiyalar` `tekrarKorumaliGonder` ile istek kimliğiyle gider (yoksa 400). Daha kısası: sekme kendi kopyası yerine `istemci/src/moduller/vardiya/disari.ts` `VardiyaDuzeni` ve `useVardiyaYaz` kullanır.
3. Personel kartının "Vardiya" alanı `POST /kisi-vardiyalari/:kisiId/belirle { vardiyaId | null }` ile yazılır; değer `GET /vardiya-takvimi` `kisiVardiyalari`'dan okunur.

## plan (P-B3, P-B16, P-B20)
- Takvim: `calismaTakvimleri(db, kaynaklar: { tur: 'makine' | 'kisi' | 'istasyon' | 'is-merkezi'; id }[], { baslangic, bitis }: tarih)` ->
  `Map<'tur:id', KaynakTakvimi | null>`. `KaynakTakvimi.araliklar` saat dilimli anlardır: plan ekseni için `(Date.parse(a.baslangic) - simdi) / 60000`.
  `null` kaynağın iş merkezine bağlanamadığıdır; sürekli çalışma sayılıp sayılmayacağı planın kararıdır. Tek kaynak için `calismaTakvimi`.
- Kapalı gün (stüdyo canlıya alma): `gunYaz(db, kullanici, { tarih, tur: 'kapali', ad })`; VR-03 ve VR-09 çağıran kişiye göre denetlenir.

## istasyonlar
- İş merkezi silme, vardiya matrisinde satırı olan merkezde `vardiya_matrisi_is_merkezi_fk` ile 409 alır; `sil` iletisinde bu yabancı anahtar için yedek ileti (`BAGIMLI_KAYIT`) önerilir.
- Personel kartı (T2, #409) kişinin iş merkezini ayrıca tutacaksa `kisininIsMerkezi(db, kisiId)` dışa açılsın; vardiya VR-08 türetimini bırakır.

## arkon
- Vardiya (`shifts`) ve vardiya devri bağlamada vardiya modülünden okunur; Arkon'un kopyası kalkar (sabit kimlik).

