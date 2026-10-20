# Çekirdek istekleri (ik v3)

Oturtma durumu (kart #740): madde 1 bu dalda ayrı commit olarak girdi. Madde 2 (kisiler) ve 3 (rol göçleri, kullanıcı kararı 1-evet)
bugünkü main'e tutmuyor; çekirdek konusuna istek olarak gitti. Madde 3 girerken `ik.test.ts` ve `bordro-onayi.test.ts`'ten çıkarılan
iki "rol x işlem göçü" testi de onunla gelir. Göç damgaları `20261012134610`'den sonra olmalı.

Teslimdeki kod bunlar girmeden derlenmez. Üç yama dosyası taban 640bebf'e `git apply` ile uygulanır; temiz ağaçta denendi:
modül dosyaları + üç yama, sınanan ağaçla birebir aynı (`diff -r` boş). Elle uygulamak için içerikleri aşağıda özetlendi.

## 1. Toplayıcılar ve işlem adları: `cekirdek-1-toplayicilar.diff`
- `paylasilan/islemler.ts`: `import { IK_ISLEMLERI } from './islemler/ik.ts';` ve `VERI_ISLEMLERI` içine `...IK_ISLEMLERI,`
- `paylasilan/sayfalar.ts`: `import { IK_IKINCI_MENU, IK_ISLEMLERIM_IKINCI_MENU, IK_SAYFALARI } from './sayfalar/ik.ts';`,
  `SAYFALAR` içine `...IK_SAYFALARI,`, `IKINCI_MENULER` içine `IK_IKINCI_MENU,` ve `IK_ISLEMLERIM_IKINCI_MENU,`
- `paylasilan/ayarlar.ts`: `import { IK_AYARLARI } from './ayarlar/ik.ts';` ve `AYAR_TANIMLARI` içine `...IK_AYARLARI,`
- `paylasilan/islem-adlari.ts`: 16 `ik.*` işlem adı (v3: `'ik.bordro-gordum': 'Kendi bordrosunu onaylama'`), `MODUL_ADLARI`
  içine `ik: 'İnsan kaynakları'`, `SAYFA_GRUBU` içine `'sayfa.ik-islemlerim': 'ik'`.

Menü maddesi (v3): "Mesailerim" modülün kendi dosyasında (`paylasilan/sayfalar/ik.ts`, `IK_ISLEMLERIM_IKINCI_MENU` ilk grup,
Bordrolarım'dan sonra): `{ anahtar: 'mesailerim', baslik: 'Mesailerim', yol: '/ik-islemlerim/mesailerim', simge: 'clock', islem: 'sayfa.ik-islemlerim' }`.
Çekirdekte ayrıca satır gerekmez.

## 2. kisiler: `cekirdek-2-kisiler.diff`
v2'deki istek (BASKA-MODUL-ISTEKLERI.md): `sorgular.ts etkinKisiSecenekleri`, `disari.ts kisiSecenekleri`. Değişmedi.

## 3. Rol x işlem göçleri: `cekirdek-3-rol-gocu.diff`
Göç, `kurulum/yetki-matrisi.md` ve matrisi sabitleyen beş test (oturum, sağlık, kisiler göç, rol atama, rol dağılımı) birlikte değişir.
- `sunucu/gocler/20261012082718_kisiler_ik_islemleri.sql`: v2 dağılımı (içerik aynı, yeni damga).
- `sunucu/gocler/20261012083010_kisiler_ik_bordro_gordum.sql` (v3): `ik.bordro-gordum` şu rollere: insan_kaynaklari, mudur,
  planlama_proje, operator, kalite, satin_alma, muhasebe_finans, idari_isler, cam, depo ("İK İşlemlerim" sayfasını alan her rol).
- `sunucu/gocler/20261012083020_kisiler_ik_bakim_sevkiyat.sql` (v3, kullanıcı kararı 12.10.2026 "1-a"): `bakim` ve `sevkiyat` rolleri de
  `sayfa.ik-islemlerim`, `ik.izin-talep`, `ik.bordro-gordum` alır. Böylece yönetici dışındaki her rol İK İşlemlerim'i açar.
- Testlerde v3 eki: bütün rollerin beklenen işlem listelerine `ik.bordro-gordum`; bakım ve sevkiyatta ayrıca İK İşlemlerim ve izin talebi.

## 4. Bağımlılık
Yeni npm paketi yok.

## Karar 88 a (19.10.2026): `ik.ozel-veri-oku`
- Rol x işlem göçü: `ik.ozel-veri-oku` yalnız `insan_kaynaklari` rolüne (yönetici bayrağı bütün işlemleri zaten taşır). Göçle birlikte
  `sunucu/moduller/ik/ik.test.ts` "rol x işlem göçü" testindeki insan_kaynaklari listesine `ik.ozel-veri-oku` eklenir.
  KARŞILANDI: göç `20261019070000_kisiler_ik_ozel_veri_oku.sql`, işlem ve ad kaydı ile test listesi Çekirdek çekme isteği #1754'le main'de.

