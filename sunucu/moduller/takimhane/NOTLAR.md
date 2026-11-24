# takimhane notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.

- Tek defter Stok'tadır (KURGU V1): bakiye, konum, teslim orada. Bu modül yalnız takıma özgü alanı (`takimhane_ozellik`) ve emrin
  takım listesini (`takimhane_emir_takimi`) tutar; çıkış ve iade `stok/disari.ts` işlevleriyle yapılır.
- Takım kartı = katalog kartı, stok kodu `TKM` ile başlayan sarf ya da demirbaş (VARSAYIM; kod deseni ve kategori onay bekler).
- Konum grupları: raf = raf gözü, tezgâh = istasyon, kişi = kişi konumu (zimmet), bileme = fason, ara = ara alan. Hurda toplama girmez.
- Konum toplamı null: o grupta hiç bakiye satırı yok (sıfır uydurulmaz). Sipariş noktası null kalem kritik sayılmaz, "tanımsız" ayrı sayılır.
- Bekleyen iade = kişilerin elindeki takım adedi (VARSAYIM).
- Emir takım listesi bu modülde tutulur (KURGU CNC kurulumda demişti; kurulum jsonb'una dokunulmadı). Durum: raf+tezgâh yeterliyse
  rafta/tezgahta, yetmezse eksik. "ayrıldı" (rezerve) henüz üretilmez.
- Başlangıç stoğu: yalnız ön izleme (saf kural); yazım ve katalog kartı açma sonraki iş. Aynı kod iki satırsa toplanmaz.
- "malzeme-cinsi-birlesti" bulgusu sözleşmede var, kural yok (BİLMİYORUM: örüntü verilmedi).
