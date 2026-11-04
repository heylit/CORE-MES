using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace LogoYardimcisi
{
    // TMI'nin logo modülü (sunucu/moduller/logo/kopru.ts) bu uçları çağırır; yollar ve JSON adları o dosyadaki sözleşmedir.
    // Her yazma: önce SQL ile ön denetim (kayıt zaten var mı, kod var mı), sonra Logo Objects ile yazma, sonra SQL ile doğrulama.
    // "Post true" yetmez (rehber §12): doğrulama tutmazsa cevap success:false olur ve Logo kaydının numarası iletide yazar.
    public sealed class Islemler
    {
        public const int StokKoduEnCok = 24;
        public const int FisNoEnCok = 16;
        public const int MalKabulEnCok = 500;
        // 4 (sabit kıymet) DEPREC_TYPE, REVAL_FLAG ister; değerleri ölçülmedi, gönderilmez.
        static readonly int[] KartTurleri = { 1, 10, 11, 12, 13 };
        const string OzelKod = "TMI";
        const string TalepKullanicisi = "TMI";

        readonly ILogoYazici yaz;
        readonly ILogoOkuma oku;
        readonly Ayar ayar;
        readonly Func<DateTime> saat;

        public Islemler(ILogoYazici yaz, ILogoOkuma oku, Ayar ayar, Func<DateTime> saat)
        {
            this.yaz = yaz;
            this.oku = oku;
            this.ayar = ayar;
            this.saat = saat;
        }

        static readonly Regex MalzemeVarMi = new Regex("^/api/Material/exists/([^/]+)$");
        static readonly Regex CariBul = new Regex("^/api/Arp/find/([^/]+)$");
        static readonly Regex HizmetVarMi = new Regex("^/api/(Purchase|Sales)Service/exists/([^/]+)$");
        static readonly Regex HizmetYaz = new Regex("^/api/(Purchase|Sales)Service/(AddRich|UpdateRich)$");
        static readonly Regex SiparisBul = new Regex("^/api/PurchaseOrder/find/([^/]+)$");
        static readonly Regex SiparisAlt = new Regex("^/api/PurchaseOrder/([^/]+)/(lines|invoices|cancel|close)$");
        static readonly Regex KarsilamaSiparis = new Regex("^/api/DemandFiche/peg/byOrder/([0-9]+)$");
        static readonly Regex SatisMusterisi = new Regex("^/api/SalesOffer/customer/([^/]+)$");
        static readonly Regex TeklifOku = new Regex("^/api/SalesOffer/([0-9]+)$");
        static readonly Regex TekliftenSiparis = new Regex("^/api/SalesOffer/([0-9]+)/toOrder$");
        const string FisTurAdlari = "Consumption|ProductionEntry|Scrap|WarehouseTransfer|CountSurplus|CountShortage";
        static readonly Regex MalzemeFisiYaz = new Regex("^/api/MaterialSlip/Add(" + FisTurAdlari + ")$");
        static readonly Regex MalzemeFisiBul = new Regex("^/api/MaterialSlip/(" + FisTurAdlari + ")/find/([^/]+)$");
        static readonly Regex MalzemeFisiKayit = new Regex("^/api/MaterialSlip/(" + FisTurAdlari + ")/([^/]+)$");
        // Uç adı -> STFICHE TRCODE; gerçek Logo'da denenmedi (kurulum/logo-yardimcisi.md). 11, 25, 50, 51 için TMI'de gönderim ayarı kapalı gelir.
        static readonly Dictionary<string, int> FisTrcode = new Dictionary<string, int>
        {
            { "Consumption", 12 }, { "ProductionEntry", 13 }, { "Scrap", 11 }, { "WarehouseTransfer", 25 }, { "CountSurplus", 50 }, { "CountShortage", 51 },
        };
        const int AmbarFisi = 25;

        public static int FisTrcodeAl(string ucAdi)
        {
            return FisTrcode[ucAdi];
        }

        // Oturum açılamadıysa istek Logo'ya gitmemiştir (503); çağrı sırasında koptuysa ya da beklenmeyen hata olduysa sonuç bilinmez (500).
        // Beklenmeyen hatanın iletisi (SQL sunucu adı taşıyabilir) cevaba girmez, yalnız günlüğe tür adıyla yazılır.
        public Cevap Isle(string yontem, string yol, Dictionary<string, string> sorgu, string govde)
        {
            try { return Yonlendir(yontem, yol, sorgu, govde); }
            catch (GecersizIstek e) { return Cevap.Hata(400, e.Message); }
            catch (LogoBaglanamadi e) { return Cevap.Hata(503, e.Message); }
            catch (LogoOturumKoptu e)
            {
                Gunluk.Yaz("Logo oturumu koptu: " + (e.InnerException == null ? "" : e.InnerException.GetType().Name));
                return Cevap.Hata(500, e.Message);
            }
            catch (Exception e)
            {
                Gunluk.Yaz(yontem + " " + yol + " beklenmeyen hata: " + e.GetType().Name + ": " + e.Message);
                return Cevap.Hata(500, "Yardımcıda beklenmeyen hata (" + e.GetType().Name + "); işlendiği bilinmiyor, yardımcı günlüğüne bakın.");
            }
        }

        Cevap Yonlendir(string yontem, string yol, Dictionary<string, string> sorgu, string govde)
        {
            Match m;
            if (yontem == "GET")
            {
                if ((m = MalzemeVarMi.Match(yol)).Success) return MalzemeVarMiOku(Coz(m, 1));
                if (yol == "/api/Lookup/unitsets") return BirimSetleri();
                if (yol == "/api/Lookup/warehouses") return Ambarlar();
                if (yol == "/api/Arp/list") return Cariler();
                if ((m = CariBul.Match(yol)).Success) return Bul(oku.CariRef(Coz(m, 1)), "Arp not found");
                if ((m = HizmetVarMi.Match(yol)).Success) return HizmetVarMiOku(m.Groups[1].Value == "Purchase", Coz(m, 2));
                if (yol == "/api/PurchaseOrder/receipts") return MalKabul(sorgu);
                if ((m = SiparisBul.Match(yol)).Success)
                {
                    var s = oku.Siparis(Coz(m, 1), 2);
                    return Bul(s == null ? 0 : s.Ref, "Order not found");
                }
                if ((m = SiparisAlt.Match(yol)).Success && m.Groups[2].Value == "lines") return SiparisSatirlari(Coz(m, 1));
                if (m.Success && m.Groups[2].Value == "invoices") return Faturalar(Coz(m, 1));
                if ((m = KarsilamaSiparis.Match(yol)).Success) return KarsilamalariOku(RefCoz(m));
                if ((m = SatisMusterisi.Match(yol)).Success) return SatisMusterisiOku(Coz(m, 1));
                if ((m = TeklifOku.Match(yol)).Success) return TeklifSatirlari(RefCoz(m));
                if ((m = MalzemeFisiBul.Match(yol)).Success)
                {
                    var f = oku.MalzemeFisi(Coz(m, 2), FisTuru(m));
                    return Bul(f == null ? 0 : f.Ref, "Slip not found");
                }
            }
            else if (yontem == "POST")
            {
                if (yol == "/api/Material/AddRich") return MalzemeEkle(Json.Nesne(govde));
                if (yol == "/api/Material/UpdateRich") return MalzemeGuncelle(Json.Nesne(govde));
                if ((m = HizmetYaz.Match(yol)).Success)
                {
                    var alinan = m.Groups[1].Value == "Purchase";
                    return m.Groups[2].Value == "AddRich" ? HizmetEkle(alinan, Json.Nesne(govde)) : HizmetGuncelle(alinan, Json.Nesne(govde));
                }
                if (yol == "/api/PurchaseOrder/AddRich") return SiparisEkle(Json.Nesne(govde));
                if (yol == "/api/PurchaseOrder/UpdateRich") return SiparisGuncelle(Json.Nesne(govde));
                if ((m = SiparisAlt.Match(yol)).Success && m.Groups[2].Value == "cancel") return SiparisIptal(Coz(m, 1));
                if (m.Success && m.Groups[2].Value == "close") return SiparisKapat(Coz(m, 1), Json.Nesne(govde));
                if (yol == "/api/DemandFiche/AddRich") return TalepEkle(Json.Nesne(govde));
                if (yol == "/api/DemandFiche/peg") return KarsilamaEkle(Json.Nesne(govde));
                if (yol == "/api/SalesOffer/AddRich") return TeklifEkle(Json.Nesne(govde));
                if ((m = TekliftenSiparis.Match(yol)).Success) return SatisSiparisiAc(RefCoz(m), Json.Nesne(govde));
                if ((m = MalzemeFisiYaz.Match(yol)).Success) return MalzemeFisiEkle(FisTuru(m), Json.Nesne(govde));
            }
            else if (yontem == "DELETE")
            {
                if ((m = KarsilamaSiparis.Match(yol)).Success) return KarsilamalariKaldir(RefCoz(m));
                if ((m = MalzemeFisiKayit.Match(yol)).Success) return MalzemeFisiSil(FisTuru(m), Coz(m, 2));
            }
            return Cevap.Hata(404, "Not found");
        }

        static string Coz(Match m, int grup)
        {
            string d;
            try { d = Uri.UnescapeDataString(m.Groups[grup].Value); }
            catch (Exception) { throw new GecersizIstek("Yol çözülemedi."); }
            if (d.Trim() == "") throw new GecersizIstek("Yolda boş değer.");
            return d;
        }

        static int RefCoz(Match m)
        {
            int r;
            if (!int.TryParse(m.Groups[1].Value, NumberStyles.None, CultureInfo.InvariantCulture, out r) || r <= 0) throw new GecersizIstek("Kayıt numarası geçersiz.");
            return r;
        }

        static int FisTuru(Match m)
        {
            return FisTrcode[m.Groups[1].Value];
        }

        static Cevap Bul(int kayit, string yokIletisi)
        {
            return kayit > 0 ? Cevap.Basari(kayit) : Cevap.Hata(404, yokIletisi);
        }

        static Cevap DogrulamaTutmadi(string belge, int kayit, List<string> farklar)
        {
            return Cevap.Ret(belge + " Logo'ya yazıldı (logicalRef " + kayit + ") ama SQL doğrulaması tutmadı: " + string.Join("; ", farklar.ToArray())
                + ". Kaydı Logo'da denetleyin.");
        }

        static void Esit(List<string> farklar, string ad, object beklenen, object okunan)
        {
            if (!Equals(beklenen, okunan)) farklar.Add(ad + " beklenen '" + beklenen + "', Logo'da '" + okunan + "'");
        }

        static string Kod(Dictionary<string, object> d, string ad, int enCok)
        {
            var k = Json.Metin(d, ad, true);
            if (k.Length > enCok) throw new GecersizIstek(ad + " en çok " + enCok + " karakter olmalı.");
            return k;
        }

        static decimal Pozitif(Dictionary<string, object> d, string ad)
        {
            var s = Json.Sayi(d, ad, true).Value;
            if (s <= 0) throw new GecersizIstek(ad + " sıfırdan büyük olmalı.");
            return s;
        }

        static decimal? Negatifsiz(Dictionary<string, object> d, string ad, bool zorunlu)
        {
            var s = Json.Sayi(d, ad, zorunlu);
            if (s != null && s.Value < 0) throw new GecersizIstek(ad + " eksi olamaz.");
            return s;
        }

        static int Secenek(Dictionary<string, object> d, string ad, int[] izinli)
        {
            var s = Json.Tam(d, ad, true).Value;
            if (Array.IndexOf(izinli, s) < 0) throw new GecersizIstek(ad + " geçersiz.");
            return s;
        }

        static List<Dictionary<string, object>> Satirlar(Dictionary<string, object> d, string ad)
        {
            var l = Json.Liste(d, ad, true);
            if (l.Count == 0) throw new GecersizIstek(ad + " boş.");
            return l;
        }

        static object SatirListesi(List<int> refler)
        {
            var l = new List<object>();
            for (var i = 0; i < refler.Count; i++)
            {
                var s = new Dictionary<string, object>();
                s["logicalRef"] = refler[i];
                s["lineNo"] = i + 1;
                l.Add(s);
            }
            return l;
        }

        static object Kap(int kayit, string no, List<int> satirRefleri)
        {
            var k = new Dictionary<string, object>();
            k["logicalRef"] = kayit;
            if (no != null) k["number"] = no;
            k["lines"] = SatirListesi(satirRefleri);
            return k;
        }

        /* ---------------- Malzeme kartı (rehber §3) ---------------- */

        Cevap MalzemeVarMiOku(string kod)
        {
            return Cevap.Basari(oku.MalzemeRef(kod));
        }

        Cevap BirimSetleri()
        {
            var l = new List<object>();
            foreach (var b in oku.BirimSetleri())
            {
                var s = new Dictionary<string, object>();
                s["code"] = b.Kod;
                s["name"] = b.Ad;
                l.Add(s);
            }
            return new Cevap(200, l);
        }

        Cevap Ambarlar()
        {
            var l = new List<object>();
            foreach (var b in oku.Ambarlar())
            {
                var s = new Dictionary<string, object>();
                s["nr"] = b.Kod;
                s["name"] = b.Ad;
                l.Add(s);
            }
            return new Cevap(200, l);
        }

        Cevap Cariler()
        {
            var l = new List<object>();
            foreach (var b in oku.Cariler())
            {
                var s = new Dictionary<string, object>();
                s["code"] = b.Kod;
                s["name"] = b.Ad;
                l.Add(s);
            }
            return new Cevap(200, l);
        }

        Cevap MalzemeEkle(Dictionary<string, object> g)
        {
            var kod = Kod(g, "code", StokKoduEnCok);
            var ad = Json.Metin(g, "name", true);
            var tur = Json.Tam(g, "cardType", true).Value;
            if (Array.IndexOf(KartTurleri, tur) < 0) throw new GecersizIstek("cardType 1, 10, 11, 12 ya da 13 olmalı (4 sabit kıymet ölçülmedi).");
            var birim = Json.Metin(g, "unitSetCode", true);
            var ozel = Json.Metin(g, "auxilCode", false) ?? OzelKod;
            var ad3 = Json.Metin(g, "name3", false);
            var ad4 = Json.Metin(g, "name4", false);
            var kdv = Negatifsiz(g, "vat", false);
            var satisKdv = Negatifsiz(g, "sellVat", false);
            // Açıklama 1'in Logo etiketi ölçülmedi (rehber yalnız NAME3 = Açıklama 2, NAME4 = Açıklama 3 diyor); tahminle yazılmaz.
            if (Json.Metin(g, "name2", false) != null)
                return Cevap.Ret("Açıklama 1'in Logo etiketi ölçülmedi; kart gönderilmedi. Ölçüm: logo-yardimcisi --olc malzeme <kod> (kurulum/logo-yardimcisi.md).");

            var varolan = oku.MalzemeRef(kod);
            if (varolan > 0) return Cevap.Ret("Bu kodla malzeme kartı zaten var (logicalRef " + varolan + ").");

            var x = new LogoXml("ITEMS", "ITEM");
            x.Alan("CARD_TYPE", tur).Alan("CODE", kod).Alan("NAME", ad).Alan("AUXIL_CODE", ozel);
            x.Alan("USEF_PURCHASING", 1).Alan("USEF_SALES", 1).Alan("USEF_MM", 1);
            if (kdv != null) x.Alan("VAT", kdv.Value);
            x.Alan("AUTOINCSL", 0).Alan("LOTS_DIVISIBLE", 0).Alan("DIST_LOT_UNITS", 0).Alan("COMB_LOT_UNITS", 0);
            x.Alan("UNITSET_CODE", birim);
            x.Ac("FACTORY_PARAMS").Ac("FACTORY_PARAM").Alan("INTERNAL_REFERENCE", 1).Alan("PROCURECLASS", 1).Kapat().Kapat();
            x.Bos("WH_PARAMS").Bos("CHARACTERISTICS").Bos("DOMINANT_CLASSES").Bos("UNITS").Bos("GL_LINKS").Bos("SUPPLIERS");
            if (satisKdv != null) x.Alan("SELVAT", satisKdv.Value);
            if (ad3 != null) x.Alan("NAME3", ad3);
            if (ad4 != null) x.Alan("NAME4", ad4);
            var h = yaz.XmlEkle(Nesne.Malzeme, "ITEMS", x.Bitir());
            if (h != null) return Cevap.Ret(h);

            var k = oku.Malzeme(kod);
            if (k == null) return Cevap.Hata(500, "Logo kaydı onayladı ama malzeme SQL'de bulunamadı; işlendiği bilinmiyor.");
            var f = new List<string>();
            Esit(f, "NAME", ad, k.Ad);
            Esit(f, "CARDTYPE", tur, k.KartTuru);
            Esit(f, "SPECODE", ozel, k.OzelKod);
            Esit(f, "UNITSET", birim, k.BirimSeti);
            Esit(f, "NAME3", ad3, k.Aciklama2);
            Esit(f, "NAME4", ad4, k.Aciklama3);
            return f.Count > 0 ? DogrulamaTutmadi("Malzeme kartı", k.Ref, f) : Cevap.Basari(k.Ref);
        }

        Cevap MalzemeGuncelle(Dictionary<string, object> g)
        {
            var kod = Kod(g, "code", StokKoduEnCok);
            var ad = Json.Metin(g, "name", true);
            var kayit = oku.MalzemeRef(kod);
            if (kayit == 0) return Cevap.Ret("Card not found");
            var h = yaz.Guncelle(Nesne.Malzeme, kayit, new AlanListesi().Ekle("NAME", ad), new Dictionary<int, AlanListesi>(), new List<AlanListesi>());
            if (h != null) return Cevap.Ret(h);
            var k = oku.Malzeme(kod);
            var f = new List<string>();
            Esit(f, "NAME", ad, k == null ? null : k.Ad);
            return f.Count > 0 ? DogrulamaTutmadi("Malzeme kartı adı", kayit, f) : Cevap.Basari(kayit);
        }

        /* ---------------- Hizmet kartı (rehber §4) ---------------- */

        // SRVCARD.CARDTYPE: alınan 1, verilen 2 (TMI'nin HIZMET_KART_TURU'yla aynı; VARSAYIM, --deneme ile denetlenir).
        static int HizmetKartTuru(bool alinan)
        {
            return alinan ? 1 : 2;
        }

        Cevap HizmetVarMiOku(bool alinan, string kod)
        {
            var k = oku.Hizmet(kod, HizmetKartTuru(alinan));
            return Cevap.Basari(k == null ? 0 : k.Ref);
        }

        Cevap HizmetEkle(bool alinan, Dictionary<string, object> g)
        {
            var kod = Kod(g, "CODE", StokKoduEnCok);
            var ad = Json.Metin(g, "DESCRIPTION", true);
            var tur = Json.Tam(g, "CARD_TYPE", true).Value;
            if (tur != HizmetKartTuru(alinan)) throw new GecersizIstek("CARD_TYPE uçla uyuşmuyor.");
            var birim = Json.Metin(g, "UNITSET_CODE", true);
            var kdv = Negatifsiz(g, "VAT_PERC", false);
            var ozel = Json.Metin(g, "AUXIL_CODE", false) ?? OzelKod;
            var varolan = oku.Hizmet(kod, tur);
            if (varolan != null) return Cevap.Ret("Bu kodla hizmet kartı zaten var (logicalRef " + varolan.Ref + ").");

            var kok = alinan ? "PURCHASE_SERVICES" : "SALES_SERVICES";
            var x = new LogoXml(kok, "SERVICE");
            x.Alan("CODE", kod).Alan("DESCRIPTION", ad).Alan("CARD_TYPE", tur).Alan("UNITSET_CODE", birim);
            if (kdv != null) x.Alan("VAT_PERC", kdv.Value);
            x.Alan("AUXIL_CODE", ozel);
            var h = yaz.XmlEkle(alinan ? Nesne.AlinanHizmet : Nesne.VerilenHizmet, kok, x.Bitir());
            if (h != null) return Cevap.Ret(h);

            var k = oku.Hizmet(kod, tur);
            if (k == null) return Cevap.Hata(500, "Logo kaydı onayladı ama hizmet kartı SQL'de bulunamadı; işlendiği bilinmiyor.");
            var f = new List<string>();
            Esit(f, "DEFINITION_", ad, k.Ad);
            return f.Count > 0 ? DogrulamaTutmadi("Hizmet kartı", k.Ref, f) : Cevap.Basari(k.Ref);
        }

        Cevap HizmetGuncelle(bool alinan, Dictionary<string, object> g)
        {
            var kod = Kod(g, "CODE", StokKoduEnCok);
            var ad = Json.Metin(g, "DESCRIPTION", true);
            var k = oku.Hizmet(kod, HizmetKartTuru(alinan));
            if (k == null) return Cevap.Ret("Card not found");
            var h = yaz.Guncelle(alinan ? Nesne.AlinanHizmet : Nesne.VerilenHizmet, k.Ref, new AlanListesi().Ekle("DESCRIPTION", ad),
                new Dictionary<int, AlanListesi>(), new List<AlanListesi>());
            if (h != null) return Cevap.Ret(h);
            var y = oku.Hizmet(kod, HizmetKartTuru(alinan));
            var f = new List<string>();
            Esit(f, "DEFINITION_", ad, y == null ? null : y.Ad);
            return f.Count > 0 ? DogrulamaTutmadi("Hizmet kartı adı", k.Ref, f) : Cevap.Basari(k.Ref);
        }

        /* ---------------- Satın alma siparişi (rehber §5) ---------------- */

        sealed class SiparisSatiri
        {
            public int? Ref;
            public int Tur;
            public string Kod;
            public decimal Miktar;
            public decimal Fiyat;
            public decimal? Kdv;
            public string Birim;
            public string Termin;
            public string Aciklama;
        }

        sealed class Doviz
        {
            public int Tur;
            public decimal Kur;
        }

        static Doviz DovizCoz(Dictionary<string, object> g)
        {
            var tur = Json.Tam(g, "currencyCode", false);
            if (tur == null || tur.Value == 0) return null;
            var kur = Json.Sayi(g, "rate", false);
            if (kur == null || kur.Value <= 0) throw new GecersizIstek("Dövizli belgede rate (kur) sıfırdan büyük olmalı.");
            var d = new Doviz();
            d.Tur = tur.Value;
            d.Kur = kur.Value;
            return d;
        }

        static SiparisSatiri SiparisSatiriCoz(Dictionary<string, object> s)
        {
            var x = new SiparisSatiri();
            x.Ref = Json.Tam(s, "logicalRef", false);
            x.Tur = Secenek(s, "type", new[] { 0, 4 });
            x.Kod = Kod(s, "masterCode", StokKoduEnCok);
            x.Miktar = Pozitif(s, "quantity");
            x.Fiyat = Negatifsiz(s, "price", true).Value;
            x.Kdv = Negatifsiz(s, "vatRate", false);
            x.Birim = Json.Metin(s, "unitCode", true);
            x.Termin = Bicim.TarihDenetle(Json.Metin(s, "dueDate", false), "dueDate");
            x.Aciklama = Json.Metin(s, "description", false);
            return x;
        }

        // Satır alanları (rehber §5). İskonto TMI'de fiyata yedirilmiştir: DISCPER yazılmaz (tuzak 3). Termin satırdadır (tuzak 4).
        // Dövizde PRICE = EDT_PRICE * kur. yeni: XML ya da AppendLine ile açılan satır (ambar ve tutarlar da yazılır).
        AlanListesi SiparisSatiriAlanlari(SiparisSatiri x, Doviz d, bool yeni)
        {
            var a = new AlanListesi();
            a.Ekle("TYPE", x.Tur).Ekle("MASTER_CODE", x.Kod).Ekle("QUANTITY", x.Miktar);
            var tlFiyat = d == null ? x.Fiyat : Bicim.Yuvarla(x.Fiyat * d.Kur, 6);
            a.Ekle("PRICE", tlFiyat);
            if (d != null) a.Ekle("EDT_PRICE", x.Fiyat).Ekle("EDT_CURR", d.Tur).Ekle("RC_XRATE", d.Kur);
            if (x.Kdv != null) a.Ekle("VAT_RATE", x.Kdv.Value);
            a.Ekle("UNIT_CODE", x.Birim).Ekle("UNIT_CONV1", 1).Ekle("UNIT_CONV2", 1);
            if (x.Termin != null) a.Ekle("DUE_DATE", x.Termin).Ekle("ORG_DUE_DATE", x.Termin);
            if (x.Aciklama != null) a.Ekle("TRANS_DESCRIPTION", x.Aciklama);
            if (yeni)
            {
                a.Ekle("SOURCE_WH", ayar.AmbarNo);
                var tutar = Bicim.Yuvarla(x.Miktar * tlFiyat, 2);
                a.Ekle("TOTAL", tutar).Ekle("VAT_BASE", tutar).Ekle("VAT_AMOUNT", Bicim.Yuvarla(tutar * (x.Kdv ?? 0) / 100, 2));
            }
            return a;
        }

        // Satırın kodu Logo'da var mı: malzeme satırı ITEMS, hizmet satırı alınan/verilen hizmet kartı.
        string KodYoksa(int tur, string kod, bool alinanHizmet, int sira)
        {
            if (tur == 0) return oku.MalzemeRef(kod) > 0 ? null : "Satır " + sira + ": malzeme " + kod + " Logo'da yok.";
            return oku.Hizmet(kod, HizmetKartTuru(alinanHizmet)) != null ? null : "Satır " + sira + ": hizmet " + kod + " Logo'da yok.";
        }

        Cevap SiparisEkle(Dictionary<string, object> g)
        {
            var no = Kod(g, "number", FisNoEnCok);
            var tarih = Bicim.TarihDenetle(Json.Metin(g, "date", true), "date");
            var cari = Json.Metin(g, "arpCode", true);
            var durum = Secenek(g, "orderStatus", new[] { 1, 4 });
            var d = DovizCoz(g);
            var satirlar = new List<SiparisSatiri>();
            foreach (var s in Satirlar(g, "lines")) satirlar.Add(SiparisSatiriCoz(s));

            var varolan = oku.Siparis(no, 2);
            if (varolan != null) return Cevap.Ret("Bu numarada satın alma siparişi zaten var (logicalRef " + varolan.Ref + ").");
            if (oku.CariRef(cari) == 0) return Cevap.Ret("Cari " + cari + " Logo'da yok.");
            for (var i = 0; i < satirlar.Count; i++)
            {
                var yok = KodYoksa(satirlar[i].Tur, satirlar[i].Kod, true, i + 1);
                if (yok != null) return Cevap.Ret(yok);
            }

            var x = new LogoXml("PURCHASE_ORDERS", "ORDER_SLIP");
            x.Alan("NUMBER", no).Alan("DATE", tarih).Alan("ARP_CODE", cari);
            // Ambar SOURCE_WH, işyeri DIVISION (SOURCEINDEX ve BRANCH etiket değil; tuzak 4).
            x.Alan("SOURCE_WH", ayar.AmbarNo).Alan("DIVISION", ayar.IsyeriNo).Alan("ORDER_STATUS", durum).Alan("CURRSEL_TOTAL", 1);
            if (d != null) x.Alan("CURRSEL_DETAILS", 2).Alan("CURR_TRANSACTIN", d.Tur).Alan("TC_RATE", d.Kur).Alan("RC_RATE", d.Kur);
            x.Ac("TRANSACTIONS");
            decimal brut = 0, kdvToplam = 0;
            foreach (var s in satirlar)
            {
                var a = SiparisSatiriAlanlari(s, d, true);
                brut += (decimal)a.Deger("TOTAL");
                kdvToplam += (decimal)a.Deger("VAT_AMOUNT");
                x.Ac("TRANSACTION").Alanlar(a).Kapat();
            }
            x.Kapat();
            x.Alan("TOTAL_GROSS", brut).Alan("TOTAL_DISCOUNTED", 0m).Alan("TOTAL_VAT", kdvToplam).Alan("TOTAL_NET", brut + kdvToplam);
            var h = yaz.XmlEkle(Nesne.SatinAlmaSiparisi, "PURCHASE_ORDERS", x.Bitir());
            if (h != null) return Cevap.Ret(h);

            var b = oku.Siparis(no, 2);
            if (b == null) return Cevap.Hata(500, "Logo kaydı onayladı ama sipariş SQL'de bulunamadı; işlendiği bilinmiyor.");
            var okunan = oku.SiparisSatirlari(b.Ref);
            var f = new List<string>();
            Esit(f, "CLIENT", cari, b.CariKod);
            Esit(f, "STATUS", durum, b.Durum);
            SatirlariKarsilastir(f, satirlar, okunan);
            if (brut > 0 && b.NetToplam <= 0) f.Add("NETTOTAL 0 kaldı");
            if (f.Count > 0) return DogrulamaTutmadi("Satın alma siparişi", b.Ref, f);
            return Cevap.Basari(b.Ref, "order", Kap(b.Ref, no, Refler(okunan)));
        }

        static void SatirlariKarsilastir(List<string> f, List<SiparisSatiri> beklenen, List<FisSatiri> okunan)
        {
            if (beklenen.Count != okunan.Count)
            {
                f.Add("satır sayısı beklenen " + beklenen.Count + ", Logo'da " + okunan.Count);
                return;
            }
            for (var i = 0; i < beklenen.Count; i++)
            {
                Esit(f, "satır " + (i + 1) + " LINETYPE", beklenen[i].Tur, okunan[i].SatirTuru);
                Esit(f, "satır " + (i + 1) + " kod", beklenen[i].Kod, okunan[i].Kod);
                Esit(f, "satır " + (i + 1) + " AMOUNT", beklenen[i].Miktar, okunan[i].Miktar);
            }
        }

        static List<int> Refler(List<FisSatiri> satirlar)
        {
            var l = new List<int>();
            foreach (var s in satirlar) l.Add(s.Ref);
            return l;
        }

        Cevap SiparisSatirlari(string no)
        {
            var b = oku.Siparis(no, 2);
            if (b == null) return Cevap.Hata(404, "Order not found");
            return new Cevap(200, SatirListesi(Refler(oku.SiparisSatirlari(b.Ref))));
        }

        // Read+Modify+Post (tuzak 2). Gövdede olmayan açık satır kapatılır (ORDER_CLOSED, tuzak 5); kayıtsız satır eklenir.
        // Ölçülen başlık alanları DATE ve ORDER_STATUS'tur; cari ve döviz türü değişikliği yazılmaz.
        Cevap SiparisGuncelle(Dictionary<string, object> g)
        {
            var kayit = Json.Tam(g, "logicalRef", true).Value;
            var no = Kod(g, "number", FisNoEnCok);
            var tarih = Bicim.TarihDenetle(Json.Metin(g, "date", true), "date");
            var cari = Json.Metin(g, "arpCode", true);
            var durum = Secenek(g, "orderStatus", new[] { 1, 4 });
            var d = DovizCoz(g);
            var satirlar = new List<SiparisSatiri>();
            foreach (var s in Satirlar(g, "lines")) satirlar.Add(SiparisSatiriCoz(s));

            var b = oku.SiparisRefIle(kayit, 2);
            if (b == null) return Cevap.Ret("Order not found");
            if (b.Iptal) return Cevap.Ret("Sipariş Logo'da iptal edilmiş; düzenlenmez.");
            if (b.No != no) return Cevap.Ret("Sipariş numarası Logo'dakiyle uyuşmuyor.");
            if (b.CariKod != cari) return Cevap.Ret("Cari değişikliği Logo'ya yazılmaz; Logo'da elle düzeltin.");
            if (b.DovizTuru != (d == null ? 0 : d.Tur)) return Cevap.Ret("Döviz türü değişikliği Logo'ya yazılmaz; Logo'da elle düzeltin.");
            var mevcut = oku.SiparisSatirlari(kayit);
            var mevcutRef = new Dictionary<int, FisSatiri>();
            foreach (var s in mevcut) mevcutRef[s.Ref] = s;

            var degisen = new Dictionary<int, AlanListesi>();
            var yeniler = new List<AlanListesi>();
            var yeniSatirlar = new List<SiparisSatiri>();
            var govdedeki = new HashSet<int>();
            for (var i = 0; i < satirlar.Count; i++)
            {
                var s = satirlar[i];
                var yok = KodYoksa(s.Tur, s.Kod, true, i + 1);
                if (yok != null) return Cevap.Ret(yok);
                if (s.Ref == null)
                {
                    yeniler.Add(SiparisSatiriAlanlari(s, d, true));
                    yeniSatirlar.Add(s);
                    continue;
                }
                FisSatiri m;
                if (!mevcutRef.TryGetValue(s.Ref.Value, out m)) return Cevap.Ret("Satır " + (i + 1) + ": Logo satırı " + s.Ref + " bu siparişte yok.");
                if (m.Kapali) return Cevap.Ret("Satır " + (i + 1) + ": Logo'da kapalı satır değiştirilmez.");
                if (!govdedeki.Add(s.Ref.Value)) return Cevap.Ret("Satır " + (i + 1) + ": aynı Logo satırı iki kez verilmiş.");
                degisen[s.Ref.Value] = SiparisSatiriAlanlari(s, d, false);
            }
            var kapanan = new List<int>();
            foreach (var m in mevcut)
            {
                if (govdedeki.Contains(m.Ref) || m.Kapali) continue;
                degisen[m.Ref] = new AlanListesi().Ekle("ORDER_CLOSED", 1);
                kapanan.Add(m.Ref);
            }
            var h = yaz.Guncelle(Nesne.SatinAlmaSiparisi, kayit, new AlanListesi().Ekle("DATE", tarih).Ekle("ORDER_STATUS", durum), degisen, yeniler);
            if (h != null) return Cevap.Ret(h);

            var sonra = oku.SiparisSatirlari(kayit);
            var sonraRef = new Dictionary<int, FisSatiri>();
            foreach (var s in sonra) sonraRef[s.Ref] = s;
            var f = new List<string>();
            Esit(f, "satır sayısı", mevcut.Count + yeniler.Count, sonra.Count);
            foreach (var s in satirlar)
            {
                if (s.Ref == null) continue;
                FisSatiri o;
                if (!sonraRef.TryGetValue(s.Ref.Value, out o)) { f.Add("satır " + s.Ref + " kayboldu"); continue; }
                Esit(f, "satır " + s.Ref + " kod", s.Kod, o.Kod);
                Esit(f, "satır " + s.Ref + " AMOUNT", s.Miktar, o.Miktar);
            }
            foreach (var r in kapanan)
            {
                FisSatiri o;
                if (!sonraRef.TryGetValue(r, out o) || !o.Kapali) f.Add("satır " + r + " kapanmadı");
            }
            var eklenen = new List<FisSatiri>();
            foreach (var s in sonra) if (!mevcutRef.ContainsKey(s.Ref)) eklenen.Add(s);
            if (eklenen.Count == yeniSatirlar.Count) SatirlariKarsilastir(f, yeniSatirlar, eklenen);
            return f.Count > 0 ? DogrulamaTutmadi("Sipariş düzenlemesi", kayit, f) : Cevap.Basari(kayit);
        }

        Cevap SiparisKapat(string no, Dictionary<string, object> g)
        {
            var refler = Json.TamListe(g, "lineRefs");
            if (refler.Count == 0) throw new GecersizIstek("lineRefs boş.");
            var b = oku.Siparis(no, 2);
            if (b == null) return Cevap.Ret("Order not found");
            var mevcut = new Dictionary<int, FisSatiri>();
            foreach (var s in oku.SiparisSatirlari(b.Ref)) mevcut[s.Ref] = s;
            var degisen = new Dictionary<int, AlanListesi>();
            foreach (var r in refler)
            {
                FisSatiri s;
                if (!mevcut.TryGetValue(r, out s)) return Cevap.Ret("Logo satırı " + r + " bu siparişte yok.");
                if (!s.Kapali) degisen[r] = new AlanListesi().Ekle("ORDER_CLOSED", 1);
            }
            if (degisen.Count > 0)
            {
                var h = yaz.Guncelle(Nesne.SatinAlmaSiparisi, b.Ref, new AlanListesi(), degisen, new List<AlanListesi>());
                if (h != null) return Cevap.Ret(h);
            }
            var f = new List<string>();
            var sonra = new Dictionary<int, FisSatiri>();
            foreach (var s in oku.SiparisSatirlari(b.Ref)) sonra[s.Ref] = s;
            foreach (var r in refler)
            {
                FisSatiri s;
                if (!sonra.TryGetValue(r, out s) || !s.Kapali) f.Add("satır " + r + " kapanmadı");
            }
            return f.Count > 0 ? DogrulamaTutmadi("Satır kapatma", b.Ref, f) : Cevap.Basari(b.Ref);
        }

        // İptal: Read + başlık CANCELLED=1 + Post; fiş silinmez (rehber §5). Yinelenen iptal zararsızdır.
        Cevap SiparisIptal(string no)
        {
            var b = oku.Siparis(no, 2);
            if (b == null) return Cevap.Ret("Order not found");
            if (b.Iptal) return Cevap.Basari(b.Ref);
            var h = yaz.Guncelle(Nesne.SatinAlmaSiparisi, b.Ref, new AlanListesi().Ekle("CANCELLED", 1), new Dictionary<int, AlanListesi>(), new List<AlanListesi>());
            if (h != null) return Cevap.Ret(h);
            var s = oku.Siparis(no, 2);
            return s != null && s.Iptal ? Cevap.Basari(b.Ref) : DogrulamaTutmadi("Sipariş iptali", b.Ref, new List<string> { "CANCELLED 1 olmadı" });
        }

        // Mal kabul: alış irsaliyesi satırları, STLINE.LOGICALREF > son görülen (rehber §10; tarihle değil).
        Cevap MalKabul(Dictionary<string, string> sorgu)
        {
            string m;
            var son = 0;
            if (sorgu.TryGetValue("since", out m) && m != "" && (!int.TryParse(m, NumberStyles.None, CultureInfo.InvariantCulture, out son)))
                throw new GecersizIstek("since tam sayı olmalı.");
            var l = new List<object>();
            foreach (var s in oku.MalKabul(son, MalKabulEnCok))
            {
                var o = new Dictionary<string, object>();
                o["logicalRef"] = s.Ref;
                o["orderLineRef"] = s.SiparisSatirRef;
                o["orderRef"] = s.SiparisRef;
                o["ficheNo"] = s.FisNo;
                o["itemCode"] = s.MalzemeKodu;
                o["quantity"] = s.Miktar;
                o["unitCode"] = s.Birim;
                l.Add(o);
            }
            return new Cevap(200, l);
        }

        Cevap Faturalar(string no)
        {
            var b = oku.Siparis(no, 2);
            if (b == null) return Cevap.Hata(404, "Order not found");
            var l = new List<object>();
            foreach (var x in oku.Faturalar(b.Ref))
            {
                var o = new Dictionary<string, object>();
                o["logicalRef"] = x.Ref;
                o["number"] = x.No;
                l.Add(o);
            }
            return new Cevap(200, l);
        }

        /* ---------------- Talep fişi ve karşılama (rehber §6) ---------------- */

        Cevap TalepEkle(Dictionary<string, object> g)
        {
            var no = Kod(g, "number", FisNoEnCok);
            var tarih = Bicim.TarihDenetle(Json.Metin(g, "date", true), "date");
            var durum = Secenek(g, "logoStatus", new[] { 0, 1 });
            var satirlar = Satirlar(g, "lines");
            var kalemler = new List<SiparisSatiri>();
            foreach (var s in satirlar)
            {
                var k = new SiparisSatiri();
                k.Kod = Kod(s, "itemCode", StokKoduEnCok);
                k.Miktar = Pozitif(s, "amount");
                k.Birim = Json.Metin(s, "unitCode", true);
                k.Termin = Bicim.TarihDenetle(Json.Metin(s, "procureDate", false), "procureDate");
                kalemler.Add(k);
            }
            var varolan = oku.Talep(no);
            if (varolan != null) return Cevap.Ret("Bu numarada talep fişi zaten var (logicalRef " + varolan.Ref + ").");
            for (var i = 0; i < kalemler.Count; i++)
            {
                var yok = KodYoksa(0, kalemler[i].Kod, true, i + 1);
                if (yok != null) return Cevap.Ret(yok);
            }

            var simdi = saat();
            var x = new LogoXml("DEMAND_FICHES", "DEMAND_VOUCHER");
            // Belge no etiketi talep fişinde DO_CODE'dur, DOC_NUMBER yok (tuzak 7); TMI belge no göndermez.
            x.Alan("NUMBER", no).Alan("DATE", tarih).Alan("TIME", Bicim.LogoSaati(simdi.Hour, simdi.Minute, simdi.Second)).Alan("STATUS", durum);
            x.Alan("LINE_CNT", kalemler.Count).Ac("TRANSACTIONS");
            for (var i = 0; i < kalemler.Count; i++)
            {
                var k = kalemler[i];
                x.Ac("TRANSACTION").Alan("ITEM_CODE", k.Kod).Alan("AMOUNT", k.Miktar).Alan("MEET_AMOUNT", 0m);
                x.Alan("UNIT_CODE", k.Birim).Alan("UNIT_CONV1", 1).Alan("UNIT_CONV2", 1).Alan("MEET_TYPE", 0);
                if (k.Termin != null) x.Alan("PROCURE_DATE", k.Termin);
                x.Alan("STATUS", durum).Alan("LINE_TYPE", 0).Alan("LINE_NO", i + 1).Alan("USER_NAME", TalepKullanicisi);
                x.Kapat();
            }
            var h = yaz.XmlEkle(Nesne.TalepFisi, "DEMAND_FICHES", x.Bitir());
            if (h != null) return Cevap.Ret(h);

            var b = oku.Talep(no);
            if (b == null) return Cevap.Hata(500, "Logo kaydı onayladı ama talep fişi SQL'de bulunamadı; işlendiği bilinmiyor.");
            var refler = yaz.SatirRefleri(Nesne.TalepFisi, b.Ref);
            if (refler == null) return DogrulamaTutmadi("Talep fişi", b.Ref, new List<string> { "satırlar okunamadı" });
            var okunan = oku.TalepSatirlari(refler);
            var f = new List<string>();
            Esit(f, "STATUS", durum, b.Durum);
            Esit(f, "satır sayısı", kalemler.Count, okunan.Count);
            if (okunan.Count == kalemler.Count)
                for (var i = 0; i < kalemler.Count; i++)
                {
                    Esit(f, "satır " + (i + 1) + " AMOUNT", kalemler[i].Miktar, okunan[i].Miktar);
                    Esit(f, "satır " + (i + 1) + " STATUS", durum, okunan[i].Durum);
                }
            if (f.Count > 0) return DogrulamaTutmadi("Talep fişi", b.Ref, f);
            return Cevap.Basari(b.Ref, "fiche", Kap(b.Ref, no, refler));
        }

        // doDemandPegging (rehber §6.2): yalnız onaylı (STATUS 1) talep fişine yazılır; öneri fişte Logo "[code=0] ''" ile reddeder.
        Cevap KarsilamaEkle(Dictionary<string, object> g)
        {
            var talepSatir = Json.Tam(g, "demandLineRef", true).Value;
            var siparisSatir = Json.Tam(g, "orderLineRef", true).Value;
            var miktar = Pozitif(g, "amount");
            var kod = Kod(g, "itemCode", StokKoduEnCok);
            var birim = Json.Metin(g, "unitCode", true);
            var cari = Json.Metin(g, "arpCode", true);
            if (talepSatir <= 0 || siparisSatir <= 0) throw new GecersizIstek("Satır kayıt numaraları sıfırdan büyük olmalı.");

            var talep = oku.TalepSatirlari(new List<int> { talepSatir });
            if (talep.Count == 0) return Cevap.Ret("Talep satırı " + talepSatir + " Logo'da yok.");
            if (talep[0].Durum != 1 && talep[0].Durum != 2) return Cevap.Ret("Talep fişi onaylı değil (STATUS 1 olmalı); karşılama yazılmaz.");
            var once = talep[0].Karsilanan;
            var varolan = oku.KarsilamaBul(talepSatir, siparisSatir);
            if (varolan != null) return Cevap.Ret("Bu talep ve sipariş satırı zaten bağlı (logicalRef " + varolan.Ref + ").");

            var a = new AlanListesi();
            a.Ekle("DEMAND_REFERENCE", talepSatir).Ekle("CHILD_TYPE", 0).Ekle("CHILD_REFERENCE", siparisSatir).Ekle("LINE_TYPE", 4).Ekle("FICHE_TYPE", 0);
            a.Ekle("MEET_AMNT", miktar).Ekle("MAIN_MEET_AMNT", miktar).Ekle("ORD_PERIOD", ayar.DonemNo);
            a.Ekle("ITEM_CODE", kod).Ekle("MAIN_ITEM_CODE", kod).Ekle("U_EDIT", birim).Ekle("MAIN_U_EDIT", birim).Ekle("ARP_CODE", cari);
            int yeniRef;
            var h = yaz.AlanlaEkle(Nesne.TalepKarsilama, a, new List<AlanListesi>(), new AlanListesi(), out yeniRef);
            if (h != null) return Cevap.Ret(h);

            var k = oku.KarsilamaBul(talepSatir, siparisSatir);
            if (k == null) return Cevap.Hata(500, "Logo kaydı onayladı ama karşılama SQL'de bulunamadı; işlendiği bilinmiyor.");
            var f = new List<string>();
            Esit(f, "MEETAMNT", miktar, k.Miktar);
            var sonra = oku.TalepSatirlari(new List<int> { talepSatir });
            if (sonra.Count == 0 || sonra[0].Karsilanan < once + miktar) f.Add("talep satırının MEETAMNT'ı artmadı");
            return f.Count > 0 ? DogrulamaTutmadi("Talep karşılaması", k.Ref, f) : Cevap.Basari(k.Ref);
        }

        Cevap KarsilamalariOku(int siparisRef)
        {
            var l = new List<object>();
            foreach (var k in oku.Karsilamalar(siparisRef))
            {
                var o = new Dictionary<string, object>();
                o["logicalRef"] = k.Ref;
                o["orderLineRef"] = k.SiparisSatirRef;
                o["demandLineRef"] = k.TalepSatirRef;
                o["amount"] = k.Miktar;
                l.Add(o);
            }
            return new Cevap(200, l);
        }

        // Geri alma: doğrudan Delete talep satırını geri almaz; önce MEET_AMNT=0 ve MAIN_MEET_AMNT=0 ile Post, sonra Delete (rehber §6.2).
        Cevap KarsilamalariKaldir(int siparisRef)
        {
            var liste = oku.Karsilamalar(siparisRef);
            if (liste.Count == 0) return Cevap.Hata(404, "No pegging");
            var talepRefleri = new List<int>();
            var dusecek = new Dictionary<int, decimal>();
            foreach (var k in liste)
            {
                if (!dusecek.ContainsKey(k.TalepSatirRef)) { dusecek[k.TalepSatirRef] = 0; talepRefleri.Add(k.TalepSatirRef); }
                dusecek[k.TalepSatirRef] += k.Miktar;
            }
            var once = new Dictionary<int, decimal>();
            foreach (var t in oku.TalepSatirlari(talepRefleri)) once[t.Ref] = t.Karsilanan;
            foreach (var k in liste)
            {
                var h = yaz.Guncelle(Nesne.TalepKarsilama, k.Ref, new AlanListesi().Ekle("MEET_AMNT", 0m).Ekle("MAIN_MEET_AMNT", 0m),
                    new Dictionary<int, AlanListesi>(), new List<AlanListesi>());
                if (h != null) return Cevap.Ret(h);
                h = yaz.Sil(Nesne.TalepKarsilama, k.Ref);
                if (h != null) return Cevap.Ret(h);
            }
            var kalan = oku.Karsilamalar(siparisRef);
            var f = new List<string>();
            if (kalan.Count > 0) f.Add(kalan.Count + " karşılama kaldı");
            foreach (var t in oku.TalepSatirlari(talepRefleri))
            {
                decimal o;
                if (once.TryGetValue(t.Ref, out o) && t.Karsilanan > o - dusecek[t.Ref]) f.Add("talep satırı " + t.Ref + " MEETAMNT geri alınmadı");
            }
            return f.Count > 0 ? DogrulamaTutmadi("Karşılama kaldırma", siparisRef, f) : Cevap.Basari(siparisRef);
        }

        /* ---------------- Satış teklifi ve tekliften satış siparişi (rehber §8, §9) ---------------- */

        Cevap SatisMusterisiOku(string cari)
        {
            if (oku.SatisMusterisiKodu(cari) == null) return Cevap.Hata(404, "Customer not found");
            return Cevap.Basari(oku.CariRef(cari));
        }

        // New() + FieldByName; alan adları tablo kolonu stilinde. TRCODE 1 zorunlu (New() varsayılanı 2 = alınan teklif), SLSCUSTCODE zorunlu (yoksa 4208).
        // ALTNR yazılmaz, satıra STATUS yazılmaz, LASTREVISION satırlardan SONRA yazılır (tuzak 9).
        Cevap TeklifEkle(Dictionary<string, object> g)
        {
            var no = Kod(g, "number", FisNoEnCok);
            var tarih = Bicim.TarihDenetle(Json.Metin(g, "date", true), "date");
            var cari = Json.Metin(g, "arpCode", true);
            var gecerlilik = Bicim.TarihDenetle(Json.Metin(g, "validUntil", false), "validUntil");
            var durum = Secenek(g, "status", new[] { 0, 1, 4 });
            var d = DovizCoz(g);
            var satirlar = new List<SiparisSatiri>();
            var iskontolar = new List<decimal?>();
            foreach (var s in Satirlar(g, "lines"))
            {
                var x = new SiparisSatiri();
                x.Tur = Secenek(s, "type", new[] { 0, 4 });
                x.Kod = Kod(s, "masterCode", StokKoduEnCok);
                x.Miktar = Pozitif(s, "quantity");
                x.Fiyat = Negatifsiz(s, "price", true).Value;
                x.Kdv = Negatifsiz(s, "vatRate", false);
                x.Birim = Json.Metin(s, "unitCode", true);
                x.Termin = Bicim.TarihDenetle(Json.Metin(s, "dueDate", false), "dueDate");
                var isk = Negatifsiz(s, "discountRate", false);
                if (isk != null && isk.Value > 100) throw new GecersizIstek("discountRate 0-100 olmalı.");
                satirlar.Add(x);
                iskontolar.Add(isk);
            }
            var varolan = oku.Teklif(no);
            if (varolan != null) return Cevap.Ret("Bu numarada satış teklifi zaten var (logicalRef " + varolan.Ref + ").");
            var musteri = oku.SatisMusterisiKodu(cari);
            if (musteri == null) return Cevap.Ret("Cari " + cari + " CRM satış müşterisi olarak tanımlı değil (Logo validate 4208).");
            for (var i = 0; i < satirlar.Count; i++)
            {
                var yok = KodYoksa(satirlar[i].Tur, satirlar[i].Kod, false, i + 1);
                if (yok != null) return Cevap.Ret(yok);
            }

            var b = new AlanListesi();
            b.Ekle("SLSCUSTCODE", musteri).Ekle("TRCODE", 1).Ekle("TYP", 1).Ekle("FICHENO", no).Ekle("DATE", tarih).Ekle("ARP_CODE", cari);
            b.Ekle("SOURCEINDEX", ayar.AmbarNo).Ekle("STATUS", durum).Ekle("POFFERBEGDT", tarih);
            if (gecerlilik != null) b.Ekle("POFFERENDDT", gecerlilik);
            if (d != null) b.Ekle("GENEXCTYP", 1).Ekle("LINEEXCTYP", 1).Ekle("TRCURR", d.Tur).Ekle("TRRATE", d.Kur).Ekle("REPORTRATE", d.Kur);
            var la = new List<AlanListesi>();
            decimal brut = 0;
            for (var i = 0; i < satirlar.Count; i++)
            {
                var x = satirlar[i];
                var l = new AlanListesi().Ekle("TYPE", x.Tur).Ekle("MASTER_CODE", x.Kod).Ekle("QUANTITY", x.Miktar);
                var tl = d == null ? x.Fiyat : Bicim.Yuvarla(x.Fiyat * d.Kur, 6);
                if (d != null) l.Ekle("EDT_CURR", d.Tur).Ekle("EDT_PRICE", x.Fiyat).Ekle("TRCURR", d.Tur).Ekle("TRRATE", d.Kur);
                l.Ekle("PRICE", tl);
                if (x.Kdv != null) l.Ekle("VAT", x.Kdv.Value);
                l.Ekle("UEDIT", x.Birim);
                if (x.Termin != null) l.Ekle("DUEDATE", x.Termin);
                if (iskontolar[i] != null && iskontolar[i].Value > 0) l.Ekle("DISCPER", iskontolar[i].Value);
                la.Add(l);
                brut += x.Miktar * tl;
            }
            int yeniRef;
            var h = yaz.AlanlaEkle(Nesne.SatisTeklifi, b, la, new AlanListesi().Ekle("LASTREVISION", 1), out yeniRef);
            if (h != null) return Cevap.Ret(h);

            var t = oku.Teklif(no);
            if (t == null) return Cevap.Hata(500, "Logo kaydı onayladı ama teklif SQL'de bulunamadı; işlendiği bilinmiyor.");
            var okunan = oku.TeklifSatirlari(t.Ref);
            var f = new List<string>();
            Esit(f, "satır sayısı", satirlar.Count, okunan.Count);
            Esit(f, "STATUS", durum, t.Durum);
            if (brut > 0 && t.NetToplam <= 0) f.Add("NETTOTAL 0 kaldı (ALTNR ya da satır STATUS tuzağı)");
            return f.Count > 0 ? DogrulamaTutmadi("Satış teklifi", t.Ref, f) : Cevap.Basari(t.Ref);
        }

        Cevap TeklifSatirlari(int kayit)
        {
            var t = oku.TeklifRefIle(kayit);
            if (t == null) return Cevap.Hata(404, "Offer not found");
            var refler = new List<int>();
            foreach (var s in oku.TeklifSatirlari(kayit)) refler.Add(s.Ref);
            return Cevap.Basari(kayit, "offer", Kap(kayit, null, refler));
        }

        // Teklif bağı satırdadır (OFFERREF, OFFTRANSREF); başlığa OFFER_REFERENCE yazılırsa Logo satırları sessizce atar (tuzak 10).
        // Bütün teklif satırları siparişe döndüyse teklifin STATUS'u 4 yazılır; Logo bunu kendisi yapmaz (rehber §9).
        Cevap SatisSiparisiAc(int teklifRef, Dictionary<string, object> g)
        {
            var no = Kod(g, "number", FisNoEnCok);
            var tarih = Bicim.TarihDenetle(Json.Metin(g, "date", true), "date");
            var durum = Secenek(g, "orderStatus", new[] { 1, 4 });
            var govdeSatirlari = Satirlar(g, "lines");
            var t = oku.TeklifRefIle(teklifRef);
            if (t == null) return Cevap.Ret("Offer not found");
            var varolan = oku.Siparis(no, 1);
            if (varolan != null) return Cevap.Ret("Bu numarada satış siparişi zaten var (logicalRef " + varolan.Ref + ").");
            var teklifSatirlari = new Dictionary<int, TeklifSatiri>();
            foreach (var s in oku.TeklifSatirlari(teklifRef)) teklifSatirlari[s.Ref] = s;

            var h0 = new AlanListesi();
            h0.Ekle("TYPE", 1).Ekle("NUMBER", no).Ekle("DATE", tarih).Ekle("ARP_CODE", t.CariKod).Ekle("SOURCE_WH", ayar.AmbarNo).Ekle("ORDER_STATUS", durum);
            var doviz = t.DovizTuru != 0;
            if (doviz) h0.Ekle("CURRSEL_TOTAL", 2).Ekle("CURRSEL_DETAILS", 2).Ekle("CURR_TRANSACTIN", t.DovizTuru).Ekle("TC_RATE", t.Kur).Ekle("RC_RATE", t.Kur);
            var la = new List<AlanListesi>();
            var bekleneRefler = new List<int>();
            var beklenenMiktar = new List<decimal>();
            var kullanilan = new HashSet<int>();
            for (var i = 0; i < govdeSatirlari.Count; i++)
            {
                var s = govdeSatirlari[i];
                var r = Json.Tam(s, "offerLineRef", true).Value;
                var miktar = Pozitif(s, "quantity");
                var termin = Bicim.TarihDenetle(Json.Metin(s, "dueDate", false), "dueDate");
                TeklifSatiri ts;
                if (!teklifSatirlari.TryGetValue(r, out ts)) return Cevap.Ret("Satır " + (i + 1) + ": teklif satırı " + r + " bu teklifte yok.");
                if (!kullanilan.Add(r)) return Cevap.Ret("Satır " + (i + 1) + ": aynı teklif satırı iki kez verilmiş.");
                if (miktar > ts.Miktar - ts.SipariseDonen) return Cevap.Ret("Satır " + (i + 1) + ": miktar teklifte kalan miktarı aşıyor.");
                var l = new AlanListesi().Ekle("TYPE", ts.SatirTuru).Ekle("MASTER_CODE", ts.Kod).Ekle("QUANTITY", miktar);
                if (doviz) l.Ekle("EDT_CURR", ts.DovizTuru).Ekle("CURR_TRANSACTIN", ts.DovizTuru).Ekle("EDT_PRICE", ts.DovizFiyati).Ekle("RC_XRATE", t.Kur);
                l.Ekle("PRICE", ts.Fiyat).Ekle("DISCOUNT_RATE", ts.Iskonto).Ekle("VAT_RATE", ts.Kdv).Ekle("UNIT_CODE", ts.Birim);
                if (termin != null) l.Ekle("DUE_DATE", termin).Ekle("ORG_DUE_DATE", termin);
                l.Ekle("OFFERREF", teklifRef).Ekle("OFFTRANSREF", r);
                la.Add(l);
                bekleneRefler.Add(r);
                beklenenMiktar.Add(miktar);
            }
            int yeniRef;
            var h = yaz.AlanlaEkle(Nesne.SatisSiparisi, h0, la, new AlanListesi(), out yeniRef);
            if (h != null) return Cevap.Ret(h);

            var b = oku.Siparis(no, 1);
            if (b == null) return Cevap.Hata(500, "Logo kaydı onayladı ama satış siparişi SQL'de bulunamadı; işlendiği bilinmiyor.");
            var okunan = oku.SiparisSatirlari(b.Ref);
            var teklifeGore = new Dictionary<int, FisSatiri>();
            foreach (var s in okunan) if (s.TeklifSatirRef > 0) teklifeGore[s.TeklifSatirRef] = s;
            var f = new List<string>();
            Esit(f, "satır sayısı", la.Count, okunan.Count);
            var refler = new List<int>();
            for (var i = 0; i < bekleneRefler.Count; i++)
            {
                FisSatiri o;
                if (!teklifeGore.TryGetValue(bekleneRefler[i], out o)) { f.Add("teklif satırı " + bekleneRefler[i] + " siparişe bağlanmadı"); continue; }
                Esit(f, "satır " + (i + 1) + " AMOUNT", beklenenMiktar[i], o.Miktar);
                refler.Add(o.Ref);
            }
            if (f.Count > 0) return DogrulamaTutmadi("Satış siparişi", b.Ref, f);

            var tamami = true;
            foreach (var s in oku.TeklifSatirlari(teklifRef)) if (s.SipariseDonen < s.Miktar) tamami = false;
            if (tamami && t.Durum != 4)
            {
                var hs = yaz.Guncelle(Nesne.SatisTeklifi, teklifRef, new AlanListesi().Ekle("STATUS", 4), new Dictionary<int, AlanListesi>(), new List<AlanListesi>());
                if (hs != null) Gunluk.Yaz("Teklif " + teklifRef + " STATUS 4 yazılamadı: " + hs);
            }
            return Cevap.Basari(b.Ref, "order", Kap(b.Ref, no, refler));
        }

        /* ---------------- Malzeme fişi: sarf 12, üretimden giriş 13, fire 11, ambar 25, sayım fazlası 50, sayım eksiği 51 (rehber §7) ---------------- */

        // Ambar fişi başlıkta tek kaynak ve hedef ambar taşır; satırdaki ambar başlıkla aynı olmalı (TMI fişi böler değil reddeder). Alan adları
        // SOURCE_WH ve DEST_WH gerçek Logo'da denenmedi. Öbür türlerde ambar alanı gelirse sessiz düşmesin diye reddedilir.
        static int[] FisAmbarlari(Dictionary<string, object> d, int tur, string yer)
        {
            if (tur != AmbarFisi)
            {
                if (d.ContainsKey("SOURCE_WH") || d.ContainsKey("DEST_WH")) throw new GecersizIstek(yer + "SOURCE_WH ve DEST_WH yalnız ambar fişinde.");
                return null;
            }
            var kaynak = Json.Tam(d, "SOURCE_WH", true).Value;
            var hedef = Json.Tam(d, "DEST_WH", true).Value;
            if (kaynak < 0 || hedef < 0) throw new GecersizIstek(yer + "ambar no eksi olamaz.");
            if (kaynak == hedef) throw new GecersizIstek(yer + "kaynak ve hedef ambar aynı.");
            return new[] { kaynak, hedef };
        }

        Cevap MalzemeFisiEkle(int tur, Dictionary<string, object> g)
        {
            if (Json.Tam(g, "TYPE", true).Value != tur) throw new GecersizIstek("TYPE uçla uyuşmuyor.");
            var no = Kod(g, "NUMBER", FisNoEnCok);
            var tarih = Bicim.TarihDenetle(Json.Metin(g, "DATE", true), "DATE");
            var saatMetni = Json.Metin(g, "TIME", false);
            var grup = Json.Tam(g, "GROUP", true).Value;
            var toplamlar = Json.Tam(g, "CURRSEL_TOTALS", true).Value;
            var proje = Json.Metin(g, "PROJECT_CODE", false);
            var ambarlar = FisAmbarlari(g, tur, "");
            var satirlar = new List<SiparisSatiri>();
            var satirAlanlari = new List<AlanListesi>();
            var ham = Satirlar(g, "TRANSACTIONS");
            for (var i = 0; i < ham.Count; i++)
            {
                var s = ham[i];
                var x = new SiparisSatiri();
                x.Kod = Kod(s, "ITEM_CODE", StokKoduEnCok);
                x.Miktar = Pozitif(s, "QUANTITY");
                x.Birim = Json.Metin(s, "UNIT_CODE", true);
                x.Aciklama = Json.Metin(s, "DESCRIPTION", false);
                var a = new AlanListesi().Ekle("ITEM_CODE", x.Kod).Ekle("QUANTITY", x.Miktar).Ekle("UNIT_CODE", x.Birim);
                a.Ekle("UNIT_CONV1", Pozitif(s, "UNIT_CONV1")).Ekle("UNIT_CONV2", Pozitif(s, "UNIT_CONV2"));
                a.Ekle("LINE_TYPE", Secenek(s, "LINE_TYPE", new[] { 0 })).Ekle("LINE_NUMBER", Json.Tam(s, "LINE_NUMBER", true).Value);
                if (x.Aciklama != null) a.Ekle("DESCRIPTION", x.Aciklama);
                var satirProje = Json.Metin(s, "PROJECT_CODE", false);
                if (satirProje != null) a.Ekle("PROJECT_CODE", satirProje);
                var satirAmbarlari = FisAmbarlari(s, tur, "Satır " + (i + 1) + ": ");
                if (satirAmbarlari != null)
                {
                    if (satirAmbarlari[0] != ambarlar[0] || satirAmbarlari[1] != ambarlar[1]) throw new GecersizIstek("Satır " + (i + 1) + ": ambarlar başlıktakiyle aynı olmalı.");
                    a.Ekle("SOURCE_WH", satirAmbarlari[0]).Ekle("DEST_WH", satirAmbarlari[1]);
                }
                a.Ekle("EU_VAT_STATUS", 4);
                satirlar.Add(x);
                satirAlanlari.Add(a);
            }
            var varolan = oku.MalzemeFisi(no, tur);
            if (varolan != null) return Cevap.Ret("Bu numarada malzeme fişi zaten var (logicalRef " + varolan.Ref + "); yeniden yazılmadı, Logo'da denetleyin.");
            for (var i = 0; i < satirlar.Count; i++)
            {
                var yok = KodYoksa(0, satirlar[i].Kod, true, i + 1);
                if (yok != null) return Cevap.Ret(yok);
            }

            var x0 = new LogoXml("MATERIAL_SLIPS", "SLIP");
            x0.Alan("TYPE", tur).Alan("NUMBER", no).Alan("DATE", tarih);
            if (saatMetni != null) x0.Alan("TIME", Bicim.LogoSaati(saatMetni, "TIME"));
            x0.Alan("GROUP", grup).Alan("CURRSEL_TOTALS", toplamlar);
            if (proje != null) x0.Alan("PROJECT_CODE", proje);
            if (ambarlar != null) x0.Alan("SOURCE_WH", ambarlar[0]).Alan("DEST_WH", ambarlar[1]);
            x0.Ac("TRANSACTIONS");
            foreach (var a in satirAlanlari) x0.Ac("TRANSACTION").Alanlar(a).Kapat();
            x0.Kapat();
            var h = yaz.XmlEkle(Nesne.MalzemeFisi, "MATERIAL_SLIPS", x0.Bitir());
            if (h != null) return Cevap.Ret(h);

            var b = oku.MalzemeFisi(no, tur);
            if (b == null) return Cevap.Hata(500, "Logo kaydı onayladı ama malzeme fişi SQL'de bulunamadı; işlendiği bilinmiyor.");
            var okunan = oku.MalzemeFisiSatirlari(b.Ref);
            var f = new List<string>();
            SatirlariKarsilastir(f, satirlar, okunan);
            return f.Count > 0 ? DogrulamaTutmadi("Malzeme fişi", b.Ref, f) : Cevap.Basari(b.Ref);
        }

        // 233: TMI fişi Logo'da silip aynı numarayla yeniden açar (Logo'da satır silme yok) ve miktar sıfıra inince siler.
        // Delete Logo Objects ile; sonra SQL'den fişin gittiği doğrulanır. Gerçek Logo'da denenmedi (kurulum/logo-yardimcisi.md).
        Cevap MalzemeFisiSil(int tur, string no)
        {
            if (no.Length > FisNoEnCok) throw new GecersizIstek("Fiş numarası çok uzun.");
            var b = oku.MalzemeFisi(no, tur);
            if (b == null) return Cevap.Hata(404, "Slip not found");
            var h = yaz.Sil(Nesne.MalzemeFisi, b.Ref);
            if (h != null) return Cevap.Ret(h);
            if (oku.MalzemeFisi(no, tur) != null) return Cevap.Hata(500, "Logo silmeyi onayladı ama malzeme fişi SQL'de duruyor; işlendiği bilinmiyor.");
            return Cevap.Basari(b.Ref);
        }
    }
}
