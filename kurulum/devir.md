# Kurulum notu

Açık işler, kararlar ve iş kuralı taslakları GitHub kartlarındadır (`gh issue list`); bu dosyada
yalnız kurulum bilgisi durur. Kurallar `CLAUDE.md`, mimari kararlar `belgeler/adr/` altındadır.

## Makine

- Node 24 ve PostgreSQL (Actions'ta 18). Veritabanları: `tmiv2` (geliştirme) ve `tmiv2_test` (test).
- Sunucu 4100 (`npm run gelistir:sunucu`), istemci 4101 (`npm run gelistir:istemci`).
- Derlenmiş sürüm tek komutla: `npm run baslat` (Arkon ve istemci derlenir, sonra tek sunucu süreci açılır: API 4100'de, derlenmiş arayüz ve /api
  4101'de (`TMIV2_ARAYUZ_PORT`); 4101 yalnız `TMIV2_ONIZLEME_ADRESI` verilirse ağa açılır; Ctrl+C kapatır). Geliştirme sunucusu açıkken çalıştırılmaz: aynı portlar. Güncelleme klasörü tanımlıysa güncelleyiciyle
  açar ve ekrandan uygulanan paketi kurar (`kurulum/guncelleme.md`).
- Çökünce yeniden başlatma ve oturum açılınca kendiliğinden açılma (yöneticisiz): `npm run bekci`, `npm run otomatik-baslat -- kur`
  (`kurulum/servis.md`).
- `.env` yerelde durur, depoya girmez; değişken listesi `.env.ornek`. Varsayılan yoktur: eksik
  değişkende sunucu açılmaz. Worktree'ye `.env` kopyalanmaz; betikler ana çalışma ağacındakini okur.
- İki veritabanı kullanıcısı (ADR 0005): `tmiv2_uygulama` sunucu içindir, yalnız okur ve yazar;
  `tmiv2_goc` tabloların sahibidir, yalnız `npm run goc` ve testler kullanır. `.env`'de süper kullanıcı
  parolası durmaz. Yeni veritabanı: `psql -1 -U postgres -d <veritabanı> -f araclar/vt/kurulum.sql`
  (her veritabanı için bir kez), sonra iki rol için `\password`. Tek kullanıcılı eski kurulumdan
  geçiş `araclar/vt/tasima.sql`, geri dönüş `araclar/vt/geri-al.sql`; adımlar betik başlıklarında.
- Sunucu `npm run sunucu` (ya da `gelistir:sunucu`) ile başlatılır. Göç değişkenleri sürecin ortamında
  tanımlıysa sunucu açılmaz; servis kurulurken bu iki değişken servis ortamına konmaz.
- Betikler herkese açık bağlanma hakkını yalnız bağlı veritabanında alır. Aynı kümede başka
  veritabanı varsa rollerin oraya bağlanamadığı ayrıca doğrulanır (`has_database_privilege`).
- Göçler elle uygulanır: `npm run goc`. Bekleyen göç varken sunucu açılmaz.
- Veritabanı yedeği: sunucu her gece alır (`TMIV2_YEDEK_DIZINI`), şifreli (`TMIV2_YEDEK_ANAHTARI`, anahtar bilgi işlemde); kurulum ve geri yükleme `kurulum/yedek.md`.
- Zamanlanmış işler sunucu sürecinde koşar (ADR 0010); ayrı servis ya da görev zamanlayıcısı kurulmaz. Durumları Sistem durumu ekranında.
- İlk yönetici: `npm run yonetici -- <kullanici_adi> "<Ad Soyad>"`.
- Editör ve ajanlar için her makinede bir kez: `npm install --global typescript-language-server typescript`
  ve `claude plugin install typescript-lsp@claude-plugins-official --scope project`.
- `gh` kartlar ve Actions için gerekir; `npm run durum` gh yoksa kart bilgisini atlar.

## Denetim ve test

- `npm run kontrol` = tip + sınır + lint + test. Yerelde `CI=true npm run kontrol` koşulur
  (Actions ile aynı davranış; fark için kart #25).
- Testler gerçek PostgreSQL'de, koşuya özel şemada çalışır (`t_<onek>_<epoch sn>_<rastgele>`).
  Yarıda kesilen koşunun artığını sonraki koşu siler: yalnız test veritabanında, yalnız `t_` önekli,
  10 dakikadan eski şemalar.
- Deneme sunucusu kabukta arka plana atılınca Windows'ta yetim kalır; sunucuyu test içinden
  `uygulamaKur` + `inject` ile dene.
- Actions yalnız `main`'e gelen kod push'larında ve pull request'lerde koşar; belge commit'i koşu başlatmaz.

## Canlı kurulumdan önce (kart #1584)

- Canlı veritabanı boş kurulur; deneme veritabanı canlıya taşınmaz. Denetim defteri yalnız eklemelidir, satırı silinemez:
  denemede deftere girmiş bir değer ancak veritabanıyla birlikte geride kalır.
- Denemede PIN ya da parola kullanan herkes canlıda yeniden başlar: yönetici kişiye Kişiler ekranından geçici PIN verir (PIN ver),
  kişi ilk girişte kendi PIN'ini belirler. Denemedeki PIN ve parolalar canlıda kullanılmaz; ilk yönetici `npm run yonetici` ile yeni parolayla açılır.
- Sır taşıyan gövde alanı sözleşmede `gizli(...)` ile işaretlidir (`paylasilan/gizli.ts`); çekirdek o alanı deftere değeriyle yazmaz.
  Ad listesi (`sunucu/moduller/denetim/kurallar.ts`) ikinci katmandır. İşaretsiz sır adlı alan testte düşer (`uygulama.test.ts`).

## Depo dışındakiler

- Tema kaynağı: `Desktop\arkon-tema_1\arkon-tema` (şablon sayfası ve bileşen stilleri orada;
  değişkenler, yazı tipleri ve simgeler depoya alındı).
- Sevkiyat harita paketi (Ankara, OpenStreetMap verisi, ODbL) depodadır: `sunucu/moduller/sevkiyat/harita-paketi/`; ayar gerekmez.
  "Depoya yalnız kod girer" kuralının kullanıcı onaylı tek istisnasıdır; kural değişmedi.
  Başka bölge için `TMIV2_HARITA_DIZINI` paketin yerini alır; içinde `harita.json` ve `yol.json` zorunlu, `arama.json` isteğe bağlıdır.
  Dosya okunamazsa sevkiyat açılır; saat hesabı, dağıtma ve onay kapalıdır.
- Eski sistem ve yedeği bu deponun dışındadır; okunmaz, yazılmaz, bağlanılmaz (`CLAUDE.md`).

## İlk kapsam

Vardiya · günlük mesai · plan çizelgesi · plan matrisi · kuyruk · üretim emirleri · rota ·
istasyonlar · personel · terminal · stok merkezi. Modül sırası ve iş kuralı taslakları `tur: karar`
kartlarında (katman sırasıyla: istasyonlar ve personel, rota ve vardiya, üretim emirleri ve mesai,
stok, terminal, çizelge / kuyruk / matris).
