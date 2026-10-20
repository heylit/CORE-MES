# Kural -> test: logo (kart #207)

Kırmızı: kod testlerle aynı turda yazıldı; kırmızı her kural için kodu bozan mutasyonla görüldü (aşağıda "kırmızı").

| Kural | Test | Kırmızı |
|---|---|---|
| LGB-1 istek ancak "Logo bağlantısı" anahtarı açık VE iki değişken varken çıkar. Anahtar kapalı: istek ve yazma yok. Anahtar kapalı ya da değişken yokken iş `isBekliyor(neden)` döner; neden sağlık ayrıntısında. Anahtar değişikliği denetime yazılır. Biri eksik ya da geçersiz değişken açılışı durdurur, ileti değer taşımaz | `kurallar.test.ts` `LGB-1: ...` (3 test), `logo.test.ts` `LGB-1 anahtar kapalı ...`, `LGB-1 anahtar açık + değişken yok ...`, `LGB-1 anahtar açık + değişkenler var ...` | görüldü: anahtar denetimi kaldırılınca 1 test, isBekliyor dönüşü kaldırılınca 2 test kırmızı |
| LGB-2 yalnız kurum içi adres (ADR 0011) | `LGB-2: yalnız kurum içi adres; ...` | görüldü |
| LGB-3 success=false kesin ret, metin saklanır, sonraki deneme bekleme sonrası | `LGB-3: success=false ...`, `LGB-3: validate biçimi ...`, `logo.test.ts` `LGB-3 doğrulama hatası ...` | görüldü |
| LGB-4 401/403 yetkisiz; ulaşılamayan köprü; 5xx/zaman aşımı belirsiz; metin adres taşımaz | `LGB-4: 401/403 ...`, `LGB-4: bağlantı kurulamadıysa ...`, `logo.test.ts` `LGB-4 401 ...`, `LGB-4 köprüye ulaşılamaz ...` | görüldü |
| LGB-5 gövde: code, name, cardType (10/11/12/13/4), unitSetCode, auxilCode=TMI; kod en çok 24 | `LGB-5: gövde ...`, `LGB-5 (ret): ...`, `logo.test.ts` `LGB-8 kabul ...` (gövde birebir) | görüldü |
| LGB-6 aynı kart Logo'da iki kez açılmaz: "var mı" önce; kalıcı niyet; taze olmayan niyette ve belirsiz istekten sonra bekleme; süreç belleği | `LGB-6: ...` (3 saf test), `logo.test.ts` `LGB-6 kalkan ...`, `LGB-6 zaman aşımı ...`, `LGB-6 zaman aşımından sonra köprü kartı yine açarsa ...`, `LGB-6 istek ulaşır, cevap kaybolur ...`, `LGB-6 tur geri alınırsa ...`, `LGB-6 eşzamanlı iki işçi ...` | görüldü: M1 taze olmayan niyet beklemesiz gönderilirse 3 test, M2 "var mı" atlanırsa 4 test, M4 süreç belleği kaldırılırsa 1 test, M5 belirsizde niyet yenilenmezse 3 test kırmızı |
| LGB-7 art arda hatada bekleme 30 sn'den 30 dk'ya; zamanı gelmeyen kart beklenir | `LGB-7: ...` (2 test), `LGB-3 doğrulama hatası ...` | görüldü |
| LGB-8 uçtan uca: aktif -> bekliyor -> niyet -> gönderim -> gonderildi + kayıt no; yavaş cevap beklenir, tur "boşta transaction" kesmesine düşmez | `logo.test.ts` `LGB-8 kabul ...`, `LGB-8 yavaş cevap ...` | görüldü: M3 kesme uzatılmazsa yavaş cevap testi kırmızı |
| LGB-10 karşılık izinli listede değilse (tür 10/11/12/13/4 dışı, birim seti geçerli listede yok) niyet ve istek yok, kart "hata: Geçersiz karşılık" | `kurallar.test.ts` `LGB-10: ...`, `logo.test.ts` `LGB-10 geçersiz karşılık ...` | görüldü (geçerli liste yerine sabit küme verilince) |
| LGB-11 KDV oranı `logo.kdv-orani` ayarından (varsayılan 20); vat ve sellVat aynı değer (0 dahil); oran boşsa gövdede yok | `kurallar.test.ts` `LGB-11: ...`, `logo.test.ts` `LGB-11 KDV ayarı ...`, `LGB-8 kabul ...` (gövde birebir) | görüldü (işlev yokken; ayar okuması sabit 20 yapılınca uçtan uca test kırmızı) |
| LGB-12 geçerli birim seti: liste okunduysa yalnız köprü listesindeki, okunmadıysa elle girilen; eskiyen liste tek istekle okunur, başarısız okuma aralıkla yinelenir | `kurallar.test.ts` `LGB-12`, `LGB-13`, `logo.test.ts` `LGB-12 birim seti listesi ...` | görüldü (işlev yokken) |
| LGB-14 birim seti uçları: ekleme ve kaldırma yalnız `logo.birim-seti-yaz`; okuma `sayfa.malzemeler` ya da o işlem; kullanılan set kaldırılamaz; köprüden gelen set elle kaldırılamaz; yazma denetlenir | `logo.test.ts` `LGB-14 ...` | görüldü (malzemelerin kullanım işlevi atlanınca) |
| LGB-9 eksikli kart gönderilmez, giden kutusuna satır yazılmaz | `logo.test.ts` `LGB-9 eksikli kart gönderilmez ...` | görüldü değil (malzemelerin MKL-4 süzgecine dayanır; o kuralın kırmızısı `malzemeler/logo-hazirlik.test.ts`) |
| LGB-15 hizmet gövdesi: alan adları tek haritadan (`HIZMET_ALANLARI`, geçici XML etiketleri CODE, DESCRIPTION, CARD_TYPE, UNITSET_CODE, VAT_PERC, AUXIL_CODE; DOĞRULANMADI); yön kart türüne çevrilir (alınan 1, verilen 2); KDV tek alan, boşsa yok; yönsüz, 24'ü aşan, adsız, geçersiz birim setli kart gövde vermez | `kurallar.test.ts` `LGB-15: ...` (3 test) | görüldü: kart türü ters çevrilince LGB-15 ve LGB-19 kırmızı |
| LGB-16 hizmet kartı malzeme ucuyla gönderilmez | `kurallar.test.ts` `LGB-16: ...` | görüldü: `eklemeGovdesi` hizmet denetimi kaldırılınca kırmızı |
| LGB-17 alınan ve verilen hizmet gönderimi Sistem Ayarları'nda ayrı anahtar, kapalı gelir (kart #777) | `kurallar.test.ts` `LGB-17: ...`, `logo.test.ts` `LGB-21 ...` | görüldü: ayar yok sayılınca 3 test kırmızı |
| LGB-18 kapalı yöndeki hizmet kartına istek ve satır yok, kart bekler; malzeme kartı aynı kuyrukta gider | `logo.test.ts` `LGB-18 ...` | görüldü: yön süzgeci kaldırılınca LGB-18 ve LGB-19 kırmızı |
| LGB-19 açık yönde önce "var mı" (yol varsa), sonra yönün ucu (alınan PurchaseService, verilen SalesService); alınanı açmak verileni açmaz; Logo'da varsa açılmaz; "var mı" yolu yoksa yalnız taze niyetle açılır, sonucu bilinmeyen istek yinelenmez (yeni süreçte de), "Logo'da kontrol edin" | `logo.test.ts` `LGB-19 ...` (2 test) | görüldü: verilen yolu Purchase'a çevrilince ve bayat niyet denetimi kaldırılınca kırmızı |
| LGB-20 iki KDV ayarı boşaltılabilir: malzeme oranı doldurulup boşaltılınca vat ve sellVat gitmez; hizmet oranı boş gelir, doldurulup boşaltılınca VAT_PERC gitmez | `logo.test.ts` `LGB-20 ...` | görüldü değil (çekirdek boş değer izni ana dalda; test boşaltılabilmeyi ölçer) |
| LGS-1 sipariş gövdesi alan haritasından (`SIPARIS_ALANLARI`, DOĞRULANMADI); tarih dd.MM.yyyy, durum 4, satır türü 0/4, birim büyük harf, termin satırda | `siparis-kurallar.test.ts` `LGS-1`, `siparis.test.ts` `LGS-8 kabul` (gövde birebir) | görüldü değil (ilk yazım) |
| LGS-2 iskonto fiyata yedirilir (DISCPER yok), açıklamada "(isk. %n)"; kayan noktasız, 4 ondalık, yarım yukarı | `LGS-2` (2 test), `LGS-8 kabul` | görüldü: yedirme kaldırılınca saf ve akış testi kırmızı |
| LGS-3 döviz USD 1, EUR 20 ve kur; TL döviz alanı taşımaz; tanımsız para birimi gönderilmez | `LGS-3` | görüldü değil |
| LGS-4 numara 1-16, tarih, cari kodu, satır, karta bağlı kalem, 24 karakter, pozitif miktar, birim zorunlu; kuralı tutmayana istek yok | `LGS-4`, `siparis.test.ts` `LGS-10` | görüldü değil |
| LGS-5 KDV malzeme satırında `logo.kdv-orani`, hizmet satırında `logo.hizmet-kdv-orani`; boşsa yok | `LGS-5` | görüldü değil |
| LGS-6 satır kayıt numaraları satır sırasıyla eşlenir; sayı tutmazsa bağ yazılmaz, yeni sipariş açılmaz | `LGS-6` (2 test), `LGS-12` | görüldü değil |
| LGS-7 iki ayardan biri kapalıysa istek ve yazma yok; iş "bekliyor" | `LGS-7` | görüldü değil |
| LGS-8..11 kalkan: niyet, numarayla bulma, cari denetimi, açma; belirsizde 5 dk bekleme ve numarayla bulma | `LGS-8`, `LGS-9`, `LGS-10`, `LGS-11` | görüldü: bulma atlanınca 3, cari denetimi atlanınca 1, bekleme atlanınca 1 test kırmızı |
| LGS-13 Logo reddi metniyle TMI'ye yazılır; TMI kuralı reddederse tur düşmez | `LGS-13` | görüldü değil |
| LGS-14 iptal yalnız gönderim kuyruğu boşken, Logo'ya gitmiş siparişe; ret "hata" ve bekleme sonrası yinelenir | `LGS-14` | görüldü değil |
| LGS-15 talep fişi sipariş açmadan önce gider; niyet, sonra `logoStatus` 1 ile açılır; satır kayıtları kalemlere yazılır | `LGS-15` | görüldü değil (ilk yazım) |
| LGS-16 talep fişinde "var mı" yok: sonucu bilinmeyen açma yinelenmez (yeni süreçte de), "Logo'da kontrol edin" | `LGS-16` | görüldü: bayat niyet denetimi kaldırılınca kırmızı |
| LGS-17 düzenleme önce Logo satırlarını okur; kayıtlı satır logicalRef ile gider, eklenmiş ama bağlanmamış satır ikinci kez eklenmez; kaldırılan satır eşlemeye girmez | `LGS-17`, `siparis-kurallar.test.ts` | görüldü: ön okuma atlanınca kırmızı |
| LGS-18 kapatma `lineRefs` ile; satırsız ya da geçersiz kayıtta istek yok | `LGS-18` | görüldü değil |
| LGS-19 karşılama önce listeyi okur, varsa yazmaz; iptal önce karşılamayı kaldırır | `LGS-19` | görüldü: liste denetimi ve karşılama kaldırma atlanınca kırmızı |
| LGS-20 malzeme ve hizmet kartı adı UpdateRich ile (açma kuyruğu boşken); Logo'da olmayan kart "hata" | `LGS-20` | görüldü değil |
| LGS-21 niyet saati bir kez okunur; ilerleyen gerçek saatle talep ve sipariş bir sonraki turda beklemeden gider (KD-040) | `LGS-21` | görüldü değil |
| LGT-1..3 satış teklifi gövdesi: not 2.6 adları, iskonto ayrı alan, döviz, kurallar | `satis-kurallar.test.ts` `LGT-1..3` | görüldü değil (ilk yazım) |
| LGT-4..5 tekliften sipariş: satır bağı teklif satırı, teklifi Logo'da olmayan gönderilmez | `LGT-4`, `LGT-5`, `satis.test.ts` `LGT-10` | görüldü değil |
| LGT-6 "satış gönderimi" kapalıyken istek yok | `LGT-6` | görüldü: anahtar denetimi kaldırılınca kırmızı |
| LGT-7..8 teklif CRM satış müşterisi denetiminden sonra açılır; satırlar teklif kaydından okunur; sipariş tekliften | `LGT-7`, `LGT-8` | görüldü: müşteri denetimi ve satır okuması atlanınca kırmızı |
| LGT-9 teklifte sonucu bilinmeyen açma yinelenmez | `LGT-9` | görüldü: bayat niyet denetimi kaldırılınca kırmızı |
| LGS-7 "satın alma gönderimi" anahtarı kapalıyken istek yok | `LGS-7` | görüldü: anahtar denetimi kaldırılınca kırmızı |
| LOGO-H1 akış durumu: kodda yok / modül bağlanmadı / adres-anahtar eksik / anahtar kapalı / hazır, bu sırayla | `hazirlik.test.ts` `LOGO-H1` | görüldü değil (ilk yazım) |
| LOGO-H2 canlı deneme yalnız GET okur (ambar listesi, deneme malzemesi var mı, birim setleri); sıralı | `hazirlik.test.ts` `LOGO-H2` | görüldü değil |
| LOGO-H3 2xx ve `success:false` değilse tamam; 401/403 ve ağ hatasında sonraki adımlar atlanır; ileti adres ve anahtar taşımaz | `hazirlik.test.ts` `LOGO-H3` | görüldü değil |
| LOGO-O1 okuma ayıklayıcıları esnek: dizi ya da zarf; kayıt no tekil; kaydı olmayan atlanır ve sayılır; bağ yoksa sıfır uydurulmaz; okunamayan cevap null | `okuma-kurallar.test.ts` `LOGO-O1` | görüldü değil (ilk yazım) |
| LOGO-O2 malzeme fişi gövdesi: sarf TYPE 12, üretim girişi 13, GROUP 3, CURRSEL_TOTALS 1, tarih dd.MM.yyyy; kuralı tutmayan fiş gönderilmez | `okuma-kurallar.test.ts` `LOGO-O2` | görüldü değil |
| LOGO-O3 her akışın ayarı tanımlı, boolean ve varsayılan kapalı; okuma akışı logo -> TMI ve giden kutusuz | `okuma-kurallar.test.ts` `LOGO-O3` | görüldü değil |
| LOGO-O4..5 yeni dört ayar kapalıyken, "Logo bağlantısı" kapalıyken ve köprü değişkeni yokken istek ve yazma yok; iş "bekliyor" | `okuma.test.ts` `LOGO-O4`, `LOGO-O5` | görüldü değil |
| LOGO-O6..8 mal kabul: since imleci, yalnız GET, tekil satır kaydı (çift satır yok), imleç geri gitmez; zarf biçimi; okunamayan cevap yazmaz; 401 ve ağ hatasında tur düşmez, bekleme dolmadan yeniden istek yok | `LOGO-O6`, `LOGO-O7`, `LOGO-O8` | görüldü değil |
| LOGO-O9..10 cari ve ambar: saatte bir, turda tek istek, çift satır yok, silinen kod düşer, boş cevap önbelleği silmez; 401'de önbellek değişmez | `LOGO-O9`, `LOGO-O10` | görüldü değil |
| LOGO-O11..12 fatura: yalnız Logo'ya gitmiş ve numarası bilinen sipariş, sıralı, turda `FATURA_TUR_SINIRI`, 404 boş, tekrar okumada çift satır yok; 401'de ilk istekte durur | `LOGO-O11`, `LOGO-O12` | görüldü değil |
| LOGO-O13..15 malzeme fişi: kapalıyken istek yok; niyet, sonra doğru uç ve gövde; çift gönderim yok; sonucu bilinmeyen yinelenmez; 401 ve ağ hatasında tur düşmez, neden sahibine yazılır | `LOGO-O13`, `LOGO-O14`, `LOGO-O15` | görüldü değil |
| LOGO-O16 emir fişi (335): sarf net sarf; giriş sağlam + ayrı "Hurda" satırı; sıfır satır düşer; boş fiş null; kartsız ya da birimsiz satır fişi reddettirir | `okuma-kurallar.test.ts` `LOGO-O16` | görüldü değil |
| LOGO-O17 biten emir: anahtar kapalıyken kuyruğa girmez; açıkken iki fiş bir kez; satırlar sahiplerinden, boş fiş düşer; fiş bir kez gider | `okuma.test.ts` `LOGO-O17` | görüldü değil |
| LGB-5 (334 a) kartın Açıklama 1-3'ü `name2`-`name4` ile gider, boşsa alan yok | `kurallar.test.ts` `LGB-5 (334 a)` | görüldü değil |
| LGS-20 (genişledi) ad güncellemesi yalnız `logo.malzeme-guncelleme-gonderimi` açıkken; kapalıyken kuyruk okunmaz, istek yok | `siparis.test.ts` `LGS-20` | görüldü değil |

Testlerde gerçek ağ çağrısı yok: köprü `sahte-kopru.ts` (127.0.0.1), kapalı durumda `fetch` çağrılınca test düşer.
