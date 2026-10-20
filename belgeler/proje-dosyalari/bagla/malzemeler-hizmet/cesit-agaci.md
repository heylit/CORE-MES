# Hizmet kartı: grup, çeşit, standart ve isterler (öneri, kart #163)

Durum: öneri; kullanıcı "yaz" deyince yazılır. Düzeltmek için bu dosyadaki satırı değiştirin ya da mesajla söyleyin.
Kalıp: malzemedeki sarf kategorisi gibi. Grup kartla seçilir; "Hizmet tanımı" adımında önce çeşit seçilir, sonra çeşide özgü alanlar açılır.
Standart alanı serbest metindir; çeşidin önerileri altında çıkar. Bütün standart numaraları genel bilgiden, sizin listenizle karşılaştırılmadı: VARSAYIM.
Her grupta "Diğer" çeşidi vardır; adı elle yazılır.

## Kod
Stok kodu çeşide göre: HZ-ALD-00001 (malzemede sınıfa göre olduğu gibi). "Diğer" çeşitte grup kodu: HZ-YZY-00001. VARSAYIM.

## Ad
Ad, çeşit + standart + tip/sınıf ile önerilir (ör. "Alodin MIL-DTL-5541 Tip II Sınıf 3"); kullanıcı değiştirebilir. VARSAYIM.

## Mükerrer kontrolü
Yön + çeşit + standart + isterler aynıysa "bu kart zaten var" uyarısı çıkar (malzemedeki gibi gerekçeyle geçilebilir). VARSAYIM.

## Ağaç
Yeni gruplar: Yüzey işlem ve kaplama (YZY), Isıl işlem (ISL), Muayene ve test (MYT). Var olanlar korunur.

### Yüzey işlem ve kaplama (YZY)
| Çeşit | Kod | Standart önerisi | İsterler |
|---|---|---|---|
| Kromat dönüşüm (Alodin) | ALD | MIL-DTL-5541 | Tip (I altı değerlikli krom / II krom(VI)'sız), Sınıf (1A / 3), Renk (renksiz / sarı) |
| Eloksal | ELK | MIL-PRF-8625, ISO 7599 | Tip (I kromik / II sülfürik / III sert), Sınıf (1 boyasız / 2 boyalı), Renk, Kalınlık µm, Sızdırmazlık (var / yok) |
| Boya | BYA | MIL-PRF-23377 (astar), MIL-PRF-85285 (son kat), ISO 12944 | Boya türü (yaş / toz / epoksi astar / poliüretan son kat), Renk kodu (RAL ya da FED-STD-595), Kat sayısı, Kuru film kalınlığı µm, Parlaklık (mat / ipek mat / parlak), Maskeleme (var / yok) |
| Kadmiyum kaplama | KDM | AMS-QQ-P-416 | Tip, Sınıf, Kalınlık µm |
| Çinko-nikel kaplama | ZNN | AMS 2417 | Tip, Kalınlık µm |
| Nikel kaplama (akımlı / akımsız) | NKL | AMS 2404 (akımsız), QQ-N-290 | Yöntem, Kalınlık µm, Fosfor oranı (akımsızda) |
| Pasivasyon | PSV | AMS 2700, ASTM A967 | Yöntem (nitrik / sitrik) |
| Kumlama | KUM | | Aşındırıcı türü, Pürüzlülük Ra µm |
| Diğer | YZY | | |

### Isıl işlem (ISL)
| Çeşit | Kod | Standart önerisi | İsterler |
|---|---|---|---|
| Hidrojen gevrekliği giderme | HGG | AMS 2759/9, ISO 9588, ASTM B850 | Sıcaklık °C, Süre saat, Kaplamadan sonra en geç (saat), Fırın kaydı istenir (evet / hayır) |
| Su verme ve temperleme | STM | AMS 2759/1 | Hedef sertlik |
| Gerilim giderme | GRG | | Sıcaklık °C, Süre saat |
| Sementasyon / nitrürleme | SMN | AMS 2759/7 | Sertlik derinliği mm, Yüzey sertliği |
| Çözeltiye alma ve yaşlandırma (alüminyum) | YSL | AMS 2770 | Hedef temper (ör. T6) |
| Diğer | ISL | | |

### Muayene ve test (MYT)
| Çeşit | Kod | Standart önerisi | İsterler |
|---|---|---|---|
| Penetrant muayene | PNT | ASTM E1417 | Tip, Yöntem, Hassasiyet seviyesi |
| Manyetik parçacık muayene | MPT | ASTM E1444 | Yöntem |
| Sertlik ölçümü | SRT | | Ölçek (HRC / HB / HV) |
| Diğer | MYT | | |

### Var olan gruplar (çeşit eklenir)
| Grup | Çeşitler |
|---|---|
| Fason işçilik (FSN) | Talaşlı imalat (TLS), Taşlama (TSL), Tel erozyon (TEL), Kaynak (KYK), Lazer kesim (LZR), Diğer (FSN) |
| Bakım ve onarım (BKM) | Makine bakımı (MKB), Kalibrasyon (KLB), Onarım (ONR), Diğer (BKM) |
| Nakliye (NAK) | Yurt içi (YIC), Yurt dışı (YDS), Kurye (KRY), Diğer (NAK) |
| Danışmanlık (DNS) | Eğitim (EGT), Belgelendirme denetimi (BLG), Mühendislik (MHN), Diğer (DNS) |
| Diğer hizmet (DGR) | Diğer (DGR) |

## Dokunulacak dosyalar
- `istemci/src/moduller/malzemeler/katalog/katalog.html`: HZ_KAT'a yeni gruplar, çeşitler ve alanlar; kod grubu, ad önerisi, mükerrer anahtarı.
- `sunucu/gocler/<yeni>_malzemeler_hizmet_cesit.sql`: üç yeni grup satırı (malzeme_kategorisi). Önce sayar; aynı anahtar varsa durur. Var olan satır değişmez.
- `sunucu/moduller/malzemeler/logo-goc.test.ts` (ya da yeni göç testi): göç dolu tabloda.
- Belgeler: `FARK.md`, `UYUM-BORCU.md`, `ORTAKLIK-malzemeler.md`, `KURAL-TEST.md`.
- Sunucu kodu ve sözleşme değişmez (çeşit kartın içinde durur; özet ve arama çeşidi taşımaz). VARSAYIM; rota ya da satın alma çeşide göre süzmek isterse ayrıca eklenir.
