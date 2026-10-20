# Kişiler notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.

- Karar (06.10.2026): yalnız yönetici bayraklıdır; müdür bayrak taşımaz. Depo rolü depo işini yapana ek rol olarak verilir.
- Karar (07.10.2026): role tek Arkon işlemi verilir, bakım rolü yalnız Arkon'u açar. KURAL: Arkon kullanan kişiye tek Arkon rollü TMI rolü verilir; iki Arkon rollü kişide roller birleşmez, Arkon'un öncelik sırasındaki ilk rol kalır ve ötekinin Arkon yetkisi düşer (operatör + bakım sayım yazamaz). Sunucu bunu engellemez; birleşme ayrı karardır.
- Rol anahtarı yerinde değiştirilir: yeni rol açıp eskisini bırakmak atamaları eski, işlemsiz rolde
  bırakır; kullanımdaki rol silinemediği için sonradan toplanması da ayrı göç ister.
- Matrisi baştan yazan göç önce var olan rol ve satırların önceki göçün yazdığıyla aynı olduğunu denetler; satır ekleyen göç yalnız kendi satırlarının
  çakışmasında durur (Arkon göçü ayrıca elle girilmiş her Arkon işleminde).
- Test: bir rolün işlemleri gerçek girişle, küme eşitliğiyle ölçülür; yalnız "almaz" diye bakan test
  boş listede de geçer.
- Rol alma: bayraklı rolde önce bayraklı rol satırları kilitlenir, sonra eylemi yapanın bayrağı ve kalan
  sayısı okunur; sıra bozulursa iki bayraklı kişi birbirinin rolünü aynı anda alıp sistemi bayraksız bırakır.
- "Son bayraklı kalır" (M4) eylemi yapan her zaman sayılan biri olduğundan uçtan tetiklenmez; yalnız
  eylemi yapan sayılmayan (pasif) biri olduğunda, servis çağrısında devreye girer. Sigorta olarak durur.
- Girişi olan kişinin son rolü kuralı ertelenmiş tetikleyicidir; alma sonrası hemen denetlenir ki ileti
  commit anında değil komutun hatası olarak dönsün.
- Matris göçü tabloları yazımı bekleten ama okumayı sürdüren kipte kilitler (yalnız anahtarı değişen role
  atama göç bitene dek bekler; yalnız adı güncellenen role atama beklemez): kilitsiz göç
  açık transaction'ın yazdığı satırı göremez; satır denetimden de silmeden de kaçıp göçten sonra kalır.
- `kisiler.parola-degistir` yolu kendi hesabını reddeder; yoksa eski parola sorusu atlatılırdı.
- Kendi parolasının akışı (bekleme, sayaç, öbür oturumları kapatma) `oturum` modülündedir; `kisiler` yalnız eski parolayı
  doğrulayıp yenisini yazar. Yön `oturum -> kisiler` kalır (yapı testi `araclar/harita.test.ts`).
- Pasife alma ve başkasının parola değişimi kişiye `oturumlar_gecersiz_once` yazar; kimlik çözümü oturumun açılışını bununla
  karşılaştırır. Yalnız pasifliğe bakmak yetmez: yeniden aktif yapılınca eski çerez geri çalışırdı.
- Bayraklı hedefe yalnız bayraklı aktör dokunur (pasife alma, aktif yapma, parola, hesap açma, kaydı düzenleme). Bayraklı
  kişi kendi kaydını düzenler (kullanıcı kararı); iletisi "başka kişi" demez, diğerlerininki der.
- `kisiler.rol-yonet` ve `kisiler.parola-degistir` bayraksız role verilirse iki yükseltme yolu açılır (hesabı açan parolayı bilir;
  parola değiştiren daha yetkili hesaba girer). Test bugün yalnız bayraklıda olduklarını pimler.
