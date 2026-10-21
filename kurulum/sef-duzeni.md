# Şef ve ajan düzeni

Bu kurallar yalnız ana oturum (şef) içindir; CLAUDE.md'den buraya taşındı ki yazar konular kendilerine uymayan kuralı okumasın.
Yazar konular `kurulum/proje-talimati.md`'yi izler. CLAUDE.md'nin geri kalanı (temel kural, kırmızı çizgiler, yapı kuralları) herkes içindir.

## Dış modüller (kart #158, madde 7)
- Boş ajan yeri kullanılır: ana oturum yalnız dağıtır ve birleştirir; hazır kart kuyruğundan iş verir.

## Ajanlar
- Kod yazımı Claude projesinde (dışarıda, GitHub bağlı) yapılır; dış yazarlar proje talimatını izler.
- Bu oturumun işi yalnız gelen çekme isteğini incelemek ve birleştirmek, tam testi koşmak ve modülleri bağlamaktır; `sunucu/cekirdek`, `paylasilan`, `istemci/src/ortak` ve modül klasörlerine yazılmaz, kod yazımı için kart ya da ajan açılmaz.
- Kartsız iş yok: her iş bir GitHub kartıdır; dal adı kart numarasıyla başlar (`23-kisa-ad`), son commit `Closes #n` taşır.
  Kullanıcı kararı uygulanmadan önce karta yorum yazılır. İşe `npm run durum` ve `npm run harita` ile başla.
- `kesif` yer bulur ve sayar (küçük istekte keşif turu yok; bulgu dosya yolu + metin çapasıyla, yazar yeniden aramaz);
  tek modül işi ve teslim oturtma `modul-yazari`; çekirdek, ortak, var olan göç ve yetki `cekirdek-yazari`. İki çekirdek şeridi vardır: sunucu çekirdeği ile `paylasilan` bir şerit,
  `istemci/src/ortak` ayrı şerit; iki `cekirdek-yazari` ayrı şeritlerde aynı anda çalışabilir, aynı şeritte tek.
- Görev tarifi şablonu (eksikse görev verilmez): kart numarası; başvuru ya da teslim yolu; dokunulacak klasörler; dokunulmayacaklar; kabul ölçütü; raporda istenenler.
- İki yol. Hafif yol (tanım ve liste modülleri, küçük hata, belge): kart, yazar, `denetci` tek tur. Tam yol (üretim kaydı, stok hareketi, yetki, oturum, çekirdek): `denetci`, sonra dar ikinci tur.
  Bulgu düzeltilir, mutasyonla çürütülür ya da ertelenir (karta girer). Ayrı denetim commit'i yok: `Audit:` tek cümle, iş commit'inde. Küçük düzeltmeler tek kartta toplanabilir.
- Tek oturum, tek şef. Ajan düzeni dosyaları (`.claude/`, `CLAUDE.md`) şefin işidir; yalnız belge commit'iyle. `NOTLAR.md` yalnız gerçek sürprizde yazılır (koddan okunamayan karar, şaşırtan davranış).
- Katman düzeni: önce `paylasilan`'daki sözleşme ve işlemler (`cekirdek-yazari`, tek commit), sonra sunucu, sonra istemci;
  taraflar ayrı ajandaysa `sinir -- --modul <ad> --taraf sunucu|istemci`.
- Paralel: sıradaki modüllerin sözleşme, sayfa, işlem, rol ve ortak parça istekleri modüller başlamadan tek çekirdek turunda girer ve push edilir; sonra modül sunucu ve istemci olarak
  ayrı `modul-yazari`'lara bölünür (`--taraf`). En çok 4 modül ajanı + şerit başına 1 çekirdek ajanı; okuyan `kesif` sınırsız. 5-6 ajana çıkmadan önce üç ağaçta eşzamanlı tam koşu 3 tur ölçülür.
- Test yükü: ajan yerelde yalnız `test:modul`, `tip`, `sinir`, `lint` koşar. Tam `kontrol` dalın çekme isteğinde GitHub'da koşar; yerelde aynı anda en çok 2 tam koşu, şef sıraya koyar.
- Yazar her anlamlı adımda commit atar; yarıda kalan işte mesaja `Yapıldı:` ve `Sıradaki:` yazar. Dal yarım günden uzun açık kalmaz; biten dal bekletilmeden birleşir.
- Birleştirme tek tek, bitiş sırasıyla: dal güncel ana dala rebase edilir; tam `kontrol` (çekme isteğinde ya da yerelde) ve `npm run sinir -- --modul <ad>` yeşil
  (göç damgası dahil), `Audit:` var; sonra ileri sarma, worktree ve dal silinir. Kırmızı o dalın ajanına döner.
- İş kuralları tek cümlelik maddelerle, modül başına toplu onaylatılır (`tur: karar` kartı). Bir ajana tek küçük iş; devamında
  öncekini sürdür. Bağlam dolunca `/compact`. Yeni süreç parçası eklemeden önce neyin kaldırılacağını söyle.
