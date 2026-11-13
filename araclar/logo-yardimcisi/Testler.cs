using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace LogoYardimcisi
{
    // Testler sahte Logo'yla (SahteLogo.cs) koşar; COM ve SQL Server gerekmez. Gerçek Logo denemesi --deneme kipidir.
    public static class Testler
    {
        static int gecen, kalan;

        public static int Main()
        {
            Gunluk.Cikti = TextWriter.Null;
            var testler = typeof(Testler).GetMethods(System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic)
                .Where(m => m.Name.StartsWith("T_")).OrderBy(m => m.Name).ToList();
            foreach (var t in testler)
            {
                try
                {
                    t.Invoke(null, null);
                    gecen++;
                    Console.WriteLine("ok - " + t.Name);
                }
                catch (Exception e)
                {
                    kalan++;
                    var ic = e.InnerException ?? e;
                    Console.WriteLine("not ok - " + t.Name + ": " + ic.Message);
                }
            }
            Console.WriteLine("# gecen " + gecen + ", kalan " + kalan);
            return kalan == 0 ? 0 : 1;
        }

        sealed class Basarisiz : Exception
        {
            public Basarisiz(string m) : base(m) { }
        }

        static void Dogru(bool kosul, string ileti) { if (!kosul) throw new Basarisiz(ileti); }
        static void Esit(object beklenen, object gercek, string ileti)
        {
            if (!Equals(beklenen, gercek)) throw new Basarisiz(ileti + ": beklenen '" + beklenen + "', gelen '" + gercek + "'");
        }
        static void Icerir(string metin, string parca) { Dogru(metin != null && metin.Contains(parca), "'" + parca + "' yok: " + metin); }
        static void Icermez(string metin, string parca) { Dogru(metin == null || !metin.Contains(parca), "'" + parca + "' olmamalı: " + metin); }

        const string Malzeme = "TMI-ERP-TEST-001";
        const string Satici = "SATICI-1";
        const string Alici = "ALICI-1";

        static Ayar TestAyari()
        {
            return Ayar.Coz("port=4190\nanahtar=0123456789abcdef0123\nlogo_kullanici=deneme\nlogo_parola=x\nfirma_no=1\ndonem_no=1\nsql_baglanti=x\n");
        }

        static SahteLogo Logo()
        {
            var s = new SahteLogo();
            s.KartEkle(Malzeme);
            s.KartEkle("TMI-ERP-TEST-002");
            s.HizmetEkle("HZM-1", 1);
            s.CariEkle(Satici, false);
            s.CariEkle(Alici, true);
            return s;
        }

        static Islemler Isl(SahteLogo s)
        {
            return new Islemler(s, s, TestAyari(), () => new DateTime(2026, 10, 21, 9, 5, 7));
        }

        static Cevap C(SahteLogo s, string yontem, string yol, object govde)
        {
            return C(s, yontem, yol, govde, new Dictionary<string, string>());
        }

        static Cevap C(SahteLogo s, string yontem, string yol, object govde, Dictionary<string, string> sorgu)
        {
            return C(Isl(s), yontem, yol, govde, sorgu);
        }

        static Cevap C(Islemler isl, string yontem, string yol, object govde, Dictionary<string, string> sorgu)
        {
            var c = isl.Isle(yontem, yol, sorgu, govde == null ? null : (govde as string ?? Json.Yaz(govde)));
            // Cevap TMI'ye JSON olarak gider: testler de JSON'dan geri okunmuş halini görür.
            return new Cevap(c.Durum, Json.Yeni().DeserializeObject(Json.Yaz(c.Govde)));
        }

        static Dictionary<string, object> Z(Cevap c) { return (Dictionary<string, object>)c.Govde; }
        static bool Basari(Cevap c) { return c.Durum == 200 && Equals(Z(c)["success"], true); }
        static string Hata(Cevap c) { return Convert.ToString(Z(c)["error"]); }
        static int Ref(Cevap c) { return (int)Z(c)["logicalRef"]; }

        static List<int> Satirlar(Cevap c, string kap)
        {
            return ((object[])((Dictionary<string, object>)Z(c)[kap])["lines"]).Select(o => (int)((Dictionary<string, object>)o)["logicalRef"]).ToList();
        }

        static Dictionary<string, object> N(params object[] ciftler)
        {
            var d = new Dictionary<string, object>();
            for (var i = 0; i < ciftler.Length; i += 2) d[(string)ciftler[i]] = ciftler[i + 1];
            return d;
        }

        static Dictionary<string, object> Kart(string kod)
        {
            return N("code", kod, "name", "Deneme kartı", "cardType", 10, "unitSetCode", "05", "auxilCode", "TMI", "name3", "P-1", "vat", 20, "sellVat", 20);
        }

        static Dictionary<string, object> SiparisSatiri(string kod, decimal miktar)
        {
            return N("type", 0, "masterCode", kod, "quantity", miktar, "price", 10.8m, "vatRate", 20, "unitCode", "ADET", "dueDate", "20.10.2026",
                "description", "(isk. %10)");
        }

        static Dictionary<string, object> Siparis(string no, params Dictionary<string, object>[] satirlar)
        {
            return N("number", no, "date", "05.10.2026", "arpCode", Satici, "orderStatus", 4, "lines", satirlar);
        }

        /* ---------------- Ayar ---------------- */

        static void T_ayar_dosyasi_cozulur_ve_eksik_ya_da_bilinmeyen_ad_reddedilir()
        {
            var a = TestAyari();
            Esit(4190, a.Port, "port");
            Esit(0, a.AmbarNo, "ambar varsayılanı");
            Esit(1, a.FirmaNo, "firma");
            Esit(null, a.DenemeHedefAmbar, "deneme hedef ambarı varsayılan yok");
            Esit(2, Ayar.Coz("port=4190\nanahtar=0123456789abcdef0123\nlogo_kullanici=x\nfirma_no=1\ndonem_no=1\nsql_baglanti=x\ndeneme_hedef_ambar=2").DenemeHedefAmbar,
                "deneme hedef ambarı");
            foreach (var bozuk in new[]
            {
                "port=4190\nlogo_kullanici=x\nfirma_no=1\ndonem_no=1\nsql_baglanti=x",
                "port=4190\nanahtar=kisa\nlogo_kullanici=x\nfirma_no=1\ndonem_no=1\nsql_baglanti=x",
                "port=4190\nanahtar=0123456789abcdef\nlogo_kullanici=x\nfirma_no=1\ndonem_no=1\nsql_baglanti=x\nadres=0.0.0.0",
                "port=80\nanahtar=0123456789abcdef\nlogo_kullanici=x\nfirma_no=1\ndonem_no=1\nsql_baglanti=x",
            })
            {
                var reddedildi = false;
                try { Ayar.Coz(bozuk); }
                catch (GecersizIstek) { reddedildi = true; }
                Dogru(reddedildi, "bozuk ayar kabul edildi: " + bozuk.Replace("\n", " "));
            }
        }

        /* ---------------- Malzeme kartı ---------------- */

        static void T_malzeme_karti_olculmus_etiketlerle_xml_ile_acilir_ve_sql_ile_dogrulanir()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/Material/AddRich", Kart("TMI-YENI-1"));
            Dogru(Basari(c), "başarı: " + Json.Yaz(c.Govde));
            Esit(s.MalzemeRef("TMI-YENI-1"), Ref(c), "logicalRef SQL'den");
            Icerir(s.SonXml, "encoding=\"ISO-8859-9\"");
            Icerir(s.SonXml, "<ITEM DBOP=\"INS\">");
            Icerir(s.SonXml, "<UNITSET_CODE>05</UNITSET_CODE>");
            Icerir(s.SonXml, "<AUXIL_CODE>TMI</AUXIL_CODE>");
            Icerir(s.SonXml, "<NAME3>P-1</NAME3>");
            Icerir(s.SonXml, "<SELVAT>20</SELVAT>");
            Icermez(s.SonXml, "UPD");
            Esit("P-1", s.Malzeme("TMI-YENI-1").Aciklama2, "Açıklama 2 NAME3'e");
        }

        static void T_aciklama_1_etiketi_olculmeden_kart_gonderilmez()
        {
            var s = Logo();
            var g = Kart("TMI-YENI-2");
            g["name2"] = "Açıklama 1";
            var c = C(s, "POST", "/api/Material/AddRich", g);
            Dogru(!Basari(c), "reddedilmeli");
            Icerir(Hata(c), "ölçülmedi");
            Esit(0, s.Cagrilar.Count, "Logo'ya gidilmemeli");
        }

        static void T_ayni_kodla_ikinci_kart_acilmaz_ve_gecersiz_birim_seti_logo_hatasiyla_doner()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/Material/AddRich", Kart(Malzeme));
            Dogru(!Basari(c), "var olan kod");
            Icerir(Hata(c), "zaten var");
            Esit(0, s.Cagrilar.Count, "Logo'ya gidilmemeli");
            var g = Kart("TMI-YENI-3");
            g["unitSetCode"] = "05 ADET";
            c = C(s, "POST", "/api/Material/AddRich", g);
            Dogru(!Basari(c), "ad verilen birim seti");
            Icerir(Hata(c), "[code=0]");
        }

        static void T_malzeme_turu_4_ve_eksik_alan_400_doner()
        {
            var s = Logo();
            var g = Kart("TMI-YENI-4");
            g["cardType"] = 4;
            Esit(400, C(s, "POST", "/api/Material/AddRich", g).Durum, "sabit kıymet");
            g = Kart("TMI-YENI-4");
            g.Remove("name");
            Esit(400, C(s, "POST", "/api/Material/AddRich", g).Durum, "ad yok");
            g = Kart("1234567890123456789012345");
            Esit(400, C(s, "POST", "/api/Material/AddRich", g).Durum, "kod 24'ü aşıyor");
            Esit(400, C(s, "POST", "/api/Material/AddRich", "{bozuk").Durum, "bozuk JSON");
        }

        static void T_malzeme_adi_read_modify_post_ile_guncellenir()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/Material/UpdateRich", N("code", Malzeme, "name", "Yeni ad"));
            Dogru(Basari(c), Json.Yaz(c.Govde));
            Esit("Yeni ad", s.Malzeme(Malzeme).Ad, "ad");
            Icerir(s.Cagrilar.Last(), "Guncelle 0");
            Dogru(!Basari(C(s, "POST", "/api/Material/UpdateRich", N("code", "YOK", "name", "x"))), "olmayan kart");
        }

        static void T_kart_kayit_numarasi_ve_koduyla_kullanim_disi_birakilir_silinmez()
        {
            var s = Logo();
            var r = s.MalzemeRef(Malzeme);
            var yol = "/api/Material/" + r + "/deactivate";
            Esit(400, C(s, "POST", yol, N()).Durum, "kod verilmedi");
            var c = C(s, "POST", yol, N("code", "TMI-ERP-TEST-002"));
            Dogru(!Basari(c) && Hata(c).Contains("kodu farklı"), "kayıttaki kod uyuşmazsa dokunulmaz: " + Json.Yaz(c.Govde));
            Dogru(!s.Malzeme(Malzeme).Pasif, "kart kullanımda");
            c = C(s, "POST", yol, N("code", Malzeme));
            Dogru(Basari(c), Json.Yaz(c.Govde));
            Esit(r, Ref(c), "kayıt numarası döner");
            Esit("Guncelle " + Nesne.Malzeme + " " + r + " ACTIVE=1", s.Cagrilar.Last(), "Logo Objects ACTIVE yazılır");
            Dogru(s.Malzeme(Malzeme) != null && s.Malzeme(Malzeme).Pasif, "kart duruyor, kullanım dışı");
            var sayi = s.Cagrilar.Count;
            Dogru(Basari(C(s, "POST", yol, N("code", Malzeme))), "zaten kullanım dışı: başarı");
            Dogru(!s.Cagrilar.Skip(sayi).Any(x => x.StartsWith("Guncelle ")), "ikinci istekte yazılmaz");
            Dogru(!s.Cagrilar.Any(x => x.StartsWith("Sil ")), "Delete hiç çağrılmaz");
            c = C(s, "POST", "/api/Material/999999/deactivate", N("code", Malzeme));
            Esit(404, c.Durum, "kayıt yok");
            Esit(Islemler.KartYok, Hata(c), "TMI'nin tanıdığı metin");
            Esit(400, C(s, "POST", "/api/Material/abc/deactivate", N("code", Malzeme)).Durum, "sayı olmayan kayıt");
        }

        static void T_hizmet_karti_yonuyle_kullanim_disi_birakilir()
        {
            var s = Logo();
            var r = s.Hizmet("HZM-1", 1).Ref;
            var c = C(s, "POST", "/api/SalesService/" + r + "/deactivate", N("code", "HZM-1"));
            Esit(404, c.Durum, "verilen hizmette yok");
            c = C(s, "POST", "/api/PurchaseService/" + r + "/deactivate", N("code", "HZM-1"));
            Dogru(Basari(c), Json.Yaz(c.Govde));
            Esit("Guncelle " + Nesne.AlinanHizmet + " " + r + " ACTIVE=1", s.Cagrilar.Last(), "alınan hizmet nesnesi");
            Dogru(s.Hizmet("HZM-1", 1) != null && s.Hizmet("HZM-1", 1).Pasif, "hizmet duruyor, kullanım dışı");
        }

        static void T_var_mi_okumasi_yoksa_0_doner()
        {
            var s = Logo();
            var c = C(s, "GET", "/api/Material/exists/" + Malzeme, null);
            Esit(s.MalzemeRef(Malzeme), Ref(c), "var");
            Esit(s.Malzeme(Malzeme).Ad, Convert.ToString(Z(c)["name"]), "Logo'daki ad");
            var yok = C(s, "GET", "/api/Material/exists/YOK", null);
            Esit(0, Ref(yok), "yok");
            Dogru(!Z(yok).ContainsKey("name"), "kart yoksa ad dönmez");
            var kodlar = (object[])C(s, "GET", "/api/Material/codes", null).Govde;
            Dogru(kodlar.Contains(Malzeme), "kod listesi Logo'daki kartı içerir");
            Esit(s.MalzemeKodlari().Count, kodlar.Length, "bütün kodlar");
        }

        /* ---------------- Hizmet kartı ---------------- */

        static void T_hizmet_karti_yonune_gore_acilir_ve_var_mi_ucu_turune_bakar()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/SalesService/AddRich", N("CODE", "HZM-2", "DESCRIPTION", "Verilen", "CARD_TYPE", 2, "UNITSET_CODE", "05", "VAT_PERC", 20,
                "AUXIL_CODE", "TMI"));
            Dogru(Basari(c), Json.Yaz(c.Govde));
            Icerir(s.SonXml, "<SALES_SERVICES>");
            Icerir(s.Cagrilar.Last(), "XmlEkle 85");
            Esit(Ref(c), Ref(C(s, "GET", "/api/SalesService/exists/HZM-2", null)), "verilen var");
            Esit(0, Ref(C(s, "GET", "/api/PurchaseService/exists/HZM-2", null)), "alınan yok");
            Esit(400, C(s, "POST", "/api/PurchaseService/AddRich", N("CODE", "HZM-3", "DESCRIPTION", "x", "CARD_TYPE", 2, "UNITSET_CODE", "05")).Durum, "tür uçla uyuşmuyor");
            Dogru(Basari(C(s, "POST", "/api/PurchaseService/UpdateRich", N("CODE", "HZM-1", "DESCRIPTION", "Yeni"))), "güncelleme");
            Esit("Yeni", s.Hizmet("HZM-1", 1).Ad, "hizmet adı");
        }

        /* ---------------- Satın alma siparişi ---------------- */

        static void T_siparis_tuzaklara_uygun_xml_ile_acilir_ve_satir_kayitlari_doner()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/PurchaseOrder/AddRich", Siparis("SP-2026-001", SiparisSatiri(Malzeme, 4), SiparisSatiri("TMI-ERP-TEST-002", 2)));
            Dogru(Basari(c), Json.Yaz(c.Govde));
            var satirlar = Satirlar(c, "order");
            Esit(2, satirlar.Count, "satır sayısı");
            Esit(s.SiparisSatirlari(Ref(c))[0].Ref, satirlar[0], "ilk satır kaydı");
            Esit("SP-2026-001", ((Dictionary<string, object>)Z(c)["order"])["number"], "numara");
            Icerir(s.SonXml, "<SOURCE_WH>0</SOURCE_WH>");
            Icerir(s.SonXml, "<DIVISION>0</DIVISION>");
            Icerir(s.SonXml, "<DUE_DATE>20.10.2026</DUE_DATE>");
            Icerir(s.SonXml, "<TRANS_DESCRIPTION>(isk. %10)</TRANS_DESCRIPTION>");
            Icerir(s.SonXml, "<TOTAL>43.2</TOTAL>");
            Icerir(s.SonXml, "<VAT_AMOUNT>8.64</VAT_AMOUNT>");
            foreach (var yasak in new[] { "DISCPER", "SOURCEINDEX", "BRANCH", "<CLOSED>", "UPD", "EDT_PRICE" }) Icermez(s.SonXml, yasak);
            // Kart 3066: eski satın alma programının çalışan XML gönderimindeki alanlar (TL sipariş).
            Icerir(s.SonXml, "<GL_CODE>" + Satici + "</GL_CODE>");
            Icerir(s.SonXml, "<CURRSEL_TOTAL>1</CURRSEL_TOTAL>");
            Icerir(s.SonXml, "<TOTAL_NET>43.2</TOTAL_NET>");
            Icerir(s.SonXml, "<ORG_QUANTITY>4</ORG_QUANTITY>");
            // Kart 3072: iskonto fiyata yedirili; fişin iskontolu toplamı brütüne eşit.
            var brut = System.Text.RegularExpressions.Regex.Match(s.SonXml, "<TOTAL_GROSS>([^<]+)</TOTAL_GROSS>").Groups[1].Value;
            Dogru(brut != "" && brut != "0", "fiş brütü yazıldı");
            Icerir(s.SonXml, "<TOTAL_DISCOUNTED>" + brut + "</TOTAL_DISCOUNTED>");
            foreach (var yasak in new[] { "EXCLINE_", "EXCHINFO_", "ORG_PRICE", "<CURRSEL_TOTAL>2" }) Icermez(s.SonXml, yasak);
        }

        static void T_dovizli_sipariste_fiyat_kurla_carpilir_kursuz_doviz_reddedilir()
        {
            var s = Logo();
            var g = Siparis("SP-2026-002", SiparisSatiri(Malzeme, 3));
            g["currencyCode"] = 1;
            g["rate"] = 40m;
            var c = C(s, "POST", "/api/PurchaseOrder/AddRich", g);
            Dogru(Basari(c), Json.Yaz(c.Govde));
            Icerir(s.SonXml, "<CURR_TRANSACTIN>1</CURR_TRANSACTIN>");
            Icerir(s.SonXml, "<EDT_PRICE>10.8</EDT_PRICE>");
            Icerir(s.SonXml, "<EDT_CURR>1</EDT_CURR>");
            Icerir(s.SonXml, "<PRICE>432</PRICE>");
            // Kart 3066: döviz kullanımı ve döviz cinsi satır/fiş tutarları; miktar 3, KDV %20: 3 x 10.8 = 32.4, KDV 6.48.
            Icerir(s.SonXml, "<CURRSEL_TOTAL>2</CURRSEL_TOTAL>");
            Icerir(s.SonXml, "<EXCLINE_PRICE>10.8</EXCLINE_PRICE>");
            Icerir(s.SonXml, "<ORG_PRICE>10.8</ORG_PRICE>");
            Icerir(s.SonXml, "<EXCLINE_TOTAL>32.4</EXCLINE_TOTAL>");
            Icerir(s.SonXml, "<EXCLINE_VAT_AMOUNT>6.48</EXCLINE_VAT_AMOUNT>");
            Icerir(s.SonXml, "<EXCLINE_VAT_MATRAH>32.4</EXCLINE_VAT_MATRAH>");
            Icerir(s.SonXml, "<EXCLINE_LINE_NET>32.4</EXCLINE_LINE_NET>");
            Icerir(s.SonXml, "<EXCHINFO_GROSS_TOTAL>32.4</EXCHINFO_GROSS_TOTAL>");
            Icerir(s.SonXml, "<EXCHINFO_TOTAL_DISCOUNTED>32.4</EXCHINFO_TOTAL_DISCOUNTED>");
            Icerir(s.SonXml, "<EXCHINFO_TOTAL_VAT>6.48</EXCHINFO_TOTAL_VAT>");
            Icerir(s.SonXml, "<TOTAL>1296</TOTAL>");
            Icerir(s.SonXml, "<TOTAL_NET>1296</TOTAL_NET>");
            Icerir(s.SonXml, "<TOTAL_GROSS>1296</TOTAL_GROSS>");
            Icerir(s.SonXml, "<TOTAL_DISCOUNTED>1296</TOTAL_DISCOUNTED>");
            g = Siparis("SP-2026-003", SiparisSatiri(Malzeme, 1));
            g["currencyCode"] = 20;
            Esit(400, C(s, "POST", "/api/PurchaseOrder/AddRich", g).Durum, "kursuz döviz");
        }

        static void T_ayni_numara_olmayan_cari_ve_olmayan_malzeme_logoya_gitmez()
        {
            var s = Logo();
            Dogru(Basari(C(s, "POST", "/api/PurchaseOrder/AddRich", Siparis("SP-1", SiparisSatiri(Malzeme, 1)))), "ilk");
            var once = s.Cagrilar.Count;
            Icerir(Hata(C(s, "POST", "/api/PurchaseOrder/AddRich", Siparis("SP-1", SiparisSatiri(Malzeme, 1)))), "zaten var");
            var g = Siparis("SP-2", SiparisSatiri(Malzeme, 1));
            g["arpCode"] = "YOK";
            Icerir(Hata(C(s, "POST", "/api/PurchaseOrder/AddRich", g)), "Logo'da yok");
            Icerir(Hata(C(s, "POST", "/api/PurchaseOrder/AddRich", Siparis("SP-3", SiparisSatiri("YOK", 1)))), "malzeme YOK");
            Esit(once, s.Cagrilar.Count, "Logo'ya gidilmemeli");
        }

        static void T_post_true_ama_satir_dusmusse_dogrulama_tutmaz()
        {
            var s = Logo();
            s.SatirlariDusur = true;
            var c = C(s, "POST", "/api/PurchaseOrder/AddRich", Siparis("SP-9", SiparisSatiri(Malzeme, 1)));
            Dogru(!Basari(c), "doğrulama tutmamalı");
            Icerir(Hata(c), "SQL doğrulaması tutmadı");
            Icerir(Hata(c), "satır sayısı");
        }

        static void T_siparis_duzenlemesi_degisen_satiri_yazar_eksik_satiri_kapatir_yeni_satir_ekler()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/PurchaseOrder/AddRich", Siparis("SP-4", SiparisSatiri(Malzeme, 4), SiparisSatiri(Malzeme, 2)));
            var kayit = Ref(c);
            var satirlar = Satirlar(c, "order");
            var degisen = SiparisSatiri(Malzeme, 5);
            degisen["logicalRef"] = satirlar[0];
            var g = Siparis("SP-4", degisen, SiparisSatiri("TMI-ERP-TEST-002", 1));
            g["logicalRef"] = kayit;
            var u = C(s, "POST", "/api/PurchaseOrder/UpdateRich", g);
            Dogru(Basari(u), Json.Yaz(u.Govde));
            var sonra = s.SiparisSatirlari(kayit);
            Esit(3, sonra.Count, "satır sayısı");
            Esit(5m, sonra[0].Miktar, "değişen miktar");
            Dogru(sonra[1].Kapali, "gövdede olmayan satır kapanmalı (ORDER_CLOSED)");
            Esit("TMI-ERP-TEST-002", sonra[2].Kod, "yeni satır");
            // Kart 3066: XML'e özgü ek alanlar Logo Objects satırına (AppendLine) yazılmaz; orada denenmediler.
            foreach (var ad in new[] { "TOTAL_NET", "ORG_QUANTITY", "EXCLINE_PRICE", "ORG_PRICE" }) Dogru(!s.SonYeniSatirlar[0].Var(ad), "eklenen satırda " + ad + " yok");
            g["arpCode"] = Alici;
            Icerir(Hata(C(s, "POST", "/api/PurchaseOrder/UpdateRich", g)), "Cari değişikliği");
        }

        /* ---------------- Kart 2987: satın alma siparişi içeriği ---------------- */

        static Cevap Icerik(SahteLogo s, string no, bool acik = true, string yontem = "GET")
        {
            var a = TestAyari();
            a.SiparisIcerigi = acik;
            return C(new Islemler(s, s, a, () => new DateTime(2026, 10, 21, 9, 5, 7)), yontem, "/api/PurchaseOrder/" + Uri.EscapeDataString(no) + "/content", null,
                new Dictionary<string, string>());
        }

        // Logo'da CORE MES dışında açılmış sipariş: yardımcı yazmadan, doğrudan Logo'ya girilmiş gibi.
        static SahteLogo.Fis DisSiparis(SahteLogo s, string no)
        {
            var f = new SahteLogo.Fis { Ref = 7001, Nesne = Nesne.SatinAlmaSiparisi, Trcode = 2, No = no, Cari = Satici, Durum = 4, DovizTuru = 1, Kur = 30m,
                Tarih = new DateTime(2026, 9, 30) };
            f.Satirlar.Add(new SahteLogo.Satir { Ref = 7002, Tur = 0, Kod = Malzeme, Miktar = 3m, Birim = "ADET", Fiyat = 300m, DovizFiyati = 10m, Kdv = 20m,
                Termin = new DateTime(2026, 10, 15), Aciklama = "Deneme açıklama", Ust = f });
            f.Satirlar.Add(new SahteLogo.Satir { Ref = 7003, Tur = 4, Kod = "HZM-1", Miktar = 1m, Birim = "ADET", Fiyat = 60m, DovizFiyati = 2m, Kdv = 20m, Kapali = true, Ust = f });
            s.Fisler.Add(f);
            return f;
        }

        static void T_2987_siparis_icerigi_ayar_kapaliyken_yok_ve_logoya_sorulmaz()
        {
            var s = Logo();
            DisSiparis(s, "LG-DIS-1");
            Esit(false, TestAyari().SiparisIcerigi, "varsayılan kapalı");
            var c = Icerik(s, "LG-DIS-1", false);
            Esit(404, c.Durum, "kapalıyken uç yok");
            Icermez(Json.Yaz(c.Govde), "300");
            Dogru(!s.Cagrilar.Any(x => x.StartsWith("SiparisIcerigi")), "kapalıyken Logo okunmaz");
            Esit(true, Ayar.Coz("port=4190\nanahtar=0123456789abcdef0123\nlogo_kullanici=x\nfirma_no=1\ndonem_no=1\nsql_baglanti=x\nsiparis_icerigi=acik").SiparisIcerigi, "açık");
            var red = false;
            try { Ayar.Coz("port=4190\nanahtar=0123456789abcdef0123\nlogo_kullanici=x\nfirma_no=1\ndonem_no=1\nsql_baglanti=x\nsiparis_icerigi=evet"); }
            catch (GecersizIstek) { red = true; }
            Dogru(red, "acik/kapali dışı değer reddedilir");
        }

        static void T_2987_logoda_acilmis_siparisin_basligi_ve_satirlari_okunur()
        {
            var s = Logo();
            DisSiparis(s, "LG-DIS-2");
            var c = Icerik(s, "LG-DIS-2");
            Esit(200, c.Durum, "okuma");
            var b = Z(c);
            Esit(7001, b["logicalRef"], "kayıt Logo'dan");
            Esit("LG-DIS-2", b["number"], "no");
            Esit("2026-09-30", b["date"], "tarih");
            Esit(Satici, b["arpCode"], "cari");
            Esit(1, b["currencyType"], "döviz");
            Esit(30, Convert.ToInt32(b["rate"]), "kur");
            Esit(4, b["status"], "durum");
            Esit(false, b["cancelled"], "iptal değil");
            var l = ((object[])b["lines"]).Cast<Dictionary<string, object>>().ToList();
            Esit(2, l.Count, "kapalı satır da gelir");
            Esit(7002, l[0]["logicalRef"], "satır kaydı");
            Esit(Malzeme, l[0]["code"], "kod");
            Esit(Malzeme, l[0]["name"], "malzeme adı karttan");
            Esit(3, Convert.ToInt32(l[0]["quantity"]), "miktar");
            Esit("ADET", l[0]["unitCode"], "birim");
            Esit(300, Convert.ToInt32(l[0]["price"]), "yerel fiyat");
            Esit(10, Convert.ToInt32(l[0]["currencyPrice"]), "döviz fiyatı");
            Esit(20, Convert.ToInt32(l[0]["vatRate"]), "KDV");
            Esit("2026-10-15", l[0]["dueDate"], "termin");
            Esit("Deneme açıklama", l[0]["description"], "açıklama");
            Esit(false, l[0]["closed"], "açık satır");
            Esit(4, l[1]["type"], "hizmet satırı");
            Esit("HZM-1", l[1]["name"], "hizmet adı hizmet kartından");
            Esit(null, l[1]["dueDate"], "terminsiz satır boş");
            Esit(true, l[1]["closed"], "kapalı satır");
        }

        static void T_2987_yalniz_satin_alma_siparisi_okunur_ve_yalniz_get()
        {
            var s = Logo();
            var satis = new SahteLogo.Fis { Ref = 7101, Nesne = Nesne.SatisSiparisi, Trcode = 1, No = "LG-SATIS-1", Cari = Alici };
            s.Fisler.Add(satis);
            var talep = new SahteLogo.Fis { Ref = 7102, Nesne = Nesne.TalepFisi, No = "LG-TALEP-1" };
            s.Fisler.Add(talep);
            Esit(404, Icerik(s, "LG-SATIS-1").Durum, "satış siparişi okunmaz");
            Esit(404, Icerik(s, "LG-TALEP-1").Durum, "talep fişi okunmaz");
            Esit(404, Icerik(s, "YOK-1").Durum, "olmayan sipariş");
            DisSiparis(s, "LG-DIS-3");
            Esit(404, Icerik(s, "LG-DIS-3", true, "POST").Durum, "yalnız GET");
            Esit(404, C(s, "GET", "/api/PurchaseOrder/LG-DIS-3/content/x", null).Durum, "alt yol yok");
            var once = s.Cagrilar.Count(x => !x.StartsWith("SiparisIcerigi"));
            Icerik(s, "LG-DIS-3");
            Esit(once, s.Cagrilar.Count(x => !x.StartsWith("SiparisIcerigi")), "okuma Logo'ya yazmaz");
        }

        static void T_2987_ayni_numarada_iki_satin_alma_siparisi_varsa_okuma_durur()
        {
            var s = Logo();
            DisSiparis(s, "LG-DIS-CIFT");
            var ikinci = DisSiparis(s, "LG-DIS-CIFT");
            ikinci.Ref = 7201;
            var c = Icerik(s, "LG-DIS-CIFT");
            Esit(409, c.Durum, "hangisi olduğu bilinmez");
            Icerir(Hata(c), "birden çok");
            Icermez(Json.Yaz(c.Govde), "300");
        }

        static void T_2987_core_mes_acilmis_ve_duzenlenmis_siparisin_icerigi_yazilanla_ayni()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/PurchaseOrder/AddRich", Siparis("SP-ICERIK-1", SiparisSatiri(Malzeme, 4)));
            Dogru(Basari(c), Json.Yaz(c.Govde));
            var l = ((object[])Z(Icerik(s, "SP-ICERIK-1"))["lines"]).Cast<Dictionary<string, object>>().ToList();
            Esit("2026-10-05", Z(Icerik(s, "SP-ICERIK-1"))["date"], "tarih");
            Esit(10.8m, Convert.ToDecimal(l[0]["price"]), "fiyat");
            Esit("2026-10-20", l[0]["dueDate"], "termin");
            Esit("(isk. %10)", l[0]["description"], "açıklama");
            Esit("ADET", l[0]["unitCode"], "birim");
            var satir = SiparisSatiri(Malzeme, 4);
            satir["logicalRef"] = Satirlar(c, "order")[0];
            satir["price"] = 9.5m;
            satir["dueDate"] = "25.10.2026";
            var g = Siparis("SP-ICERIK-1", satir);
            g["logicalRef"] = Ref(c);
            g["date"] = "06.10.2026";
            Dogru(Basari(C(s, "POST", "/api/PurchaseOrder/UpdateRich", g)), "düzenleme");
            var sonra = Z(Icerik(s, "SP-ICERIK-1"));
            var l2 = ((object[])sonra["lines"]).Cast<Dictionary<string, object>>().ToList();
            Esit("2026-10-06", sonra["date"], "düzenlenen tarih");
            Esit(9.5m, Convert.ToDecimal(l2[0]["price"]), "düzenlenen fiyat");
            Esit("2026-10-25", l2[0]["dueDate"], "düzenlenen termin");
        }

        // D7 A2: Logo'da açılmış siparişin düzenlemesi yalnız sözleşmedeki alanları yazar; proje, ambar, ödeme ve masraf merkezi gibi
        // gövdede olmayan alanlar Logo Objects'e hiç verilmez (Read+Modify+Post: verilmeyen alan Logo'daki değerini korur).
        static void T_d7_dis_siparis_duzenlemesi_gondermedigi_alanlari_logoya_vermez()
        {
            var s = Logo();
            var f = DisSiparis(s, "LG-DIS-A2");
            f.DovizTuru = 0;
            f.Kur = 0;
            var satir = SiparisSatiri(Malzeme, 5);
            satir["logicalRef"] = 7002;
            satir["price"] = 280m;
            satir.Remove("dueDate");
            satir.Remove("description");
            var g = Siparis("LG-DIS-A2", satir, SiparisSatiri("TMI-ERP-TEST-002", 1));
            g["logicalRef"] = 7001;
            g["date"] = "30.09.2026";
            g.Remove("orderStatus");
            g["externalOrder"] = true;
            var u = C(s, "POST", "/api/PurchaseOrder/UpdateRich", g);
            Dogru(Basari(u), Json.Yaz(u.Govde));
            var baslikCagrisi = s.Cagrilar.Last(x => x.StartsWith("Guncelle " + Nesne.SatinAlmaSiparisi));
            foreach (var yasak in new[] { "PROJECT_CODE", "SOURCE_WH", "PAYMENT_CODE", "OHP_CODE", "DOC_NUMBER", "ORDER_STATUS", "CANCELLED" })
                Icermez(baslikCagrisi, yasak);
            var izinli = new HashSet<string> { "TYPE", "MASTER_CODE", "QUANTITY", "PRICE", "VAT_RATE" };
            var degisen = s.SonGuncellenenSatirlar[7002];
            foreach (var a in degisen) Dogru(izinli.Contains(a.Key), "var olan satıra beklenmeyen alan: " + a.Key);
            Dogru(!s.SonGuncellenenSatirlar.ContainsKey(7003), "kapalı satıra dokunulmaz");
            var sonra = s.SatinAlmaSiparisiIcerigi("LG-DIS-A2");
            Esit(new DateTime(2026, 10, 15), sonra.Satirlar[0].Termin, "gönderilmeyen termin korunur");
            Esit("Deneme açıklama", sonra.Satirlar[0].Aciklama, "gönderilmeyen açıklama korunur");
            Esit(280m, sonra.Satirlar[0].Fiyat, "fiyat yazılır");
            Esit(5m, sonra.Satirlar[0].Miktar, "miktar yazılır");
            Esit(3, sonra.Satirlar.Count, "yeni satır eklenir");
            Dogru(s.SonYeniSatirlar[0].Var("SOURCE_WH"), "yeni satır ayarın ambarıyla açılır (bugünkü düzen)");
        }

        // Kart 3007 a: var olan satırda Logo'daki birim, çevrim ve ilk termin korunur.
        static Dictionary<string, object> DisDuzenleme(string no, Dictionary<string, object> satir)
        {
            satir["logicalRef"] = 7002;
            var g = Siparis(no, satir);
            g["logicalRef"] = 7001;
            g["currencyCode"] = 1;
            g["rate"] = 30m;
            g.Remove("orderStatus");
            g["externalOrder"] = true;
            return g;
        }

        static void T_3007_birim_degismedikce_birim_ve_cevrim_yazilmaz()
        {
            var s = Logo();
            DisSiparis(s, "LG-DIS-B1");
            var satir = SiparisSatiri(Malzeme, 4);
            satir["unitCode"] = " adet ";
            Dogru(Basari(C(s, "POST", "/api/PurchaseOrder/UpdateRich", DisDuzenleme("LG-DIS-B1", satir))), "düzenleme");
            var degisen = s.SonGuncellenenSatirlar[7002];
            foreach (var yasak in new[] { "UNIT_CODE", "UNIT_CONV1", "UNIT_CONV2" }) Dogru(!degisen.Var(yasak), "aynı birimde yazılmaz: " + yasak);
            Esit(4m, s.SatinAlmaSiparisiIcerigi("LG-DIS-B1").Satirlar[0].Miktar, "miktar yine yazılır");
        }

        static void T_3007_birim_degisince_birim_ve_cevrim_yazilir()
        {
            var s = Logo();
            DisSiparis(s, "LG-DIS-B2");
            var satir = SiparisSatiri(Malzeme, 4);
            satir["unitCode"] = "KG";
            Dogru(Basari(C(s, "POST", "/api/PurchaseOrder/UpdateRich", DisDuzenleme("LG-DIS-B2", satir))), "düzenleme");
            var degisen = s.SonGuncellenenSatirlar[7002];
            Esit("KG", degisen.Deger("UNIT_CODE"), "yeni birim");
            Esit(1, Convert.ToInt32(degisen.Deger("UNIT_CONV1")), "çevrim 1");
            Esit(1, Convert.ToInt32(degisen.Deger("UNIT_CONV2")), "çevrim 1");
        }

        static void T_3007_var_olan_satirda_ilk_termin_yazilmaz_yeni_satirda_yazilir()
        {
            var s = Logo();
            DisSiparis(s, "LG-DIS-B3");
            var g = DisDuzenleme("LG-DIS-B3", SiparisSatiri(Malzeme, 3));
            ((Dictionary<string, object>[])g["lines"])[0]["dueDate"] = "25.10.2026";
            g["lines"] = new[] { ((Dictionary<string, object>[])g["lines"])[0], SiparisSatiri("TMI-ERP-TEST-002", 1) };
            Dogru(Basari(C(s, "POST", "/api/PurchaseOrder/UpdateRich", g)), "düzenleme");
            var degisen = s.SonGuncellenenSatirlar[7002];
            Dogru(degisen.Var("DUE_DATE"), "termin değişir");
            Dogru(!degisen.Var("ORG_DUE_DATE"), "ilk termin var olan satırda yazılmaz");
            Dogru(s.SonYeniSatirlar[0].Var("ORG_DUE_DATE"), "yeni satırda ilk termin yazılır");
            Dogru(s.SonYeniSatirlar[0].Var("UNIT_CONV1"), "yeni satırda çevrim yazılır");
        }

        static void T_3007_logodaki_birim_okunamazsa_yazilmaz()
        {
            var s = Logo();
            var f = DisSiparis(s, "LG-DIS-B4");
            f.Satirlar[0].Birim = null;
            var once = s.Cagrilar.Count(x => x.StartsWith("Guncelle "));
            Icerir(Hata(C(s, "POST", "/api/PurchaseOrder/UpdateRich", DisDuzenleme("LG-DIS-B4", SiparisSatiri(Malzeme, 4)))), "Logo'ya yazılmadı");
            f.Satirlar[0].Birim = "";
            Icerir(Hata(C(s, "POST", "/api/PurchaseOrder/UpdateRich", DisDuzenleme("LG-DIS-B4", SiparisSatiri(Malzeme, 4)))), "Logo'ya yazılmadı");
            Esit(once, s.Cagrilar.Count(x => x.StartsWith("Guncelle ")), "Logo'ya yazma çağrısı yok");
            Esit(3m, f.Satirlar[0].Miktar, "satır değişmedi");
        }

        static void T_3007_core_siparisinde_birim_okunamazsa_birim_eskisi_gibi_yazilir()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/PurchaseOrder/AddRich", Siparis("SP-3007", SiparisSatiri(Malzeme, 4)));
            var satir = SiparisSatiri(Malzeme, 6);
            satir["logicalRef"] = Satirlar(c, "order")[0];
            var g = Siparis("SP-3007", satir);
            g["logicalRef"] = Ref(c);
            s.BirimOkumaHatasi = new InvalidOperationException("Invalid column name");
            Dogru(Basari(C(s, "POST", "/api/PurchaseOrder/UpdateRich", g)), "okuma hatası CORE düzenlemesini durdurmaz");
            Esit("ADET", s.SonGuncellenenSatirlar[(int)satir["logicalRef"]].Deger("UNIT_CODE"), "birim eskisi gibi yazılır");
            s.BirimOkumaHatasi = null;
            s.Fisler.Single(x => x.No == "SP-3007").Satirlar[0].Birim = null;
            satir["quantity"] = 7m;
            Dogru(Basari(C(s, "POST", "/api/PurchaseOrder/UpdateRich", g)), "birimi bilinmeyen satır CORE düzenlemesini durdurmaz");
            g["externalOrder"] = "evet";
            Esit(400, C(s, "POST", "/api/PurchaseOrder/UpdateRich", g).Durum, "externalOrder yalnız true/false");
        }

        static void T_3007_birim_okuma_hatasi_bilinen_ret_doner()
        {
            var s = Logo();
            DisSiparis(s, "LG-DIS-B5");
            s.BirimOkumaHatasi = new InvalidOperationException("Invalid column name");
            var c = C(s, "POST", "/api/PurchaseOrder/UpdateRich", DisDuzenleme("LG-DIS-B5", SiparisSatiri(Malzeme, 4)));
            Dogru(c.Durum != 500, "500 (işlendiği bilinmiyor) dönmez: " + c.Durum);
            Icerir(Hata(c), "Logo'ya yazılmadı");
            Dogru(!s.Cagrilar.Any(x => x.StartsWith("Guncelle ")), "Logo'ya yazma çağrısı yok");
        }

        static void T_d7_dis_siparis_duzenlemesi_cari_ve_dovizi_degistiremez()
        {
            var s = Logo();
            DisSiparis(s, "LG-DIS-A3");
            var satir = SiparisSatiri(Malzeme, 3);
            satir["logicalRef"] = 7002;
            var g = Siparis("LG-DIS-A3", satir);
            g["logicalRef"] = 7001;
            Icerir(Hata(C(s, "POST", "/api/PurchaseOrder/UpdateRich", g)), "Döviz türü değişikliği");
            g["currencyCode"] = 1;
            g["rate"] = 30m;
            g["arpCode"] = Alici;
            Icerir(Hata(C(s, "POST", "/api/PurchaseOrder/UpdateRich", g)), "Cari değişikliği");
        }

        static void T_siparis_duzenlemesi_durum_gelmezse_logodaki_durumu_korur()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/PurchaseOrder/AddRich", Siparis("SP-4D", SiparisSatiri(Malzeme, 4)));
            var kayit = Ref(c);
            var satir = SiparisSatiri(Malzeme, 6);
            satir["logicalRef"] = Satirlar(c, "order")[0];
            var g = Siparis("SP-4D", satir);
            g["logicalRef"] = kayit;
            g["orderStatus"] = 1;
            Dogru(Basari(C(s, "POST", "/api/PurchaseOrder/UpdateRich", g)), "durumlu düzenleme");
            Esit(1, s.Siparis("SP-4D", 2).Durum, "verilen durum yazılır");
            g.Remove("orderStatus");
            satir["quantity"] = 7;
            Dogru(Basari(C(s, "POST", "/api/PurchaseOrder/UpdateRich", g)), "durumsuz düzenleme");
            Dogru(!s.Cagrilar.Last().Contains("ORDER_STATUS"), "durum gelmeyince ORDER_STATUS yazılmaz: " + s.Cagrilar.Last());
            Esit(1, s.Siparis("SP-4D", 2).Durum, "Logo'daki durum korunur");
            Esit(7m, s.SiparisSatirlari(kayit)[0].Miktar, "satır yine yazılır");
            g["orderStatus"] = 2;
            Icerir(Hata(C(s, "POST", "/api/PurchaseOrder/UpdateRich", g)), "orderStatus geçersiz");
        }

        static void T_satir_kapatma_iptal_ve_yinelenen_iptal()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/PurchaseOrder/AddRich", Siparis("SP-5", SiparisSatiri(Malzeme, 4), SiparisSatiri(Malzeme, 2)));
            var satirlar = Satirlar(c, "order");
            Dogru(Basari(C(s, "POST", "/api/PurchaseOrder/SP-5/close", N("lineRefs", new[] { satirlar[1] }))), "kapatma");
            Dogru(s.SiparisSatirlari(Ref(c))[1].Kapali, "satır kapalı");
            Icerir(Hata(C(s, "POST", "/api/PurchaseOrder/SP-5/close", N("lineRefs", new[] { 999999 }))), "bu siparişte yok");
            Dogru(Basari(C(s, "POST", "/api/PurchaseOrder/SP-5/cancel", N())), "iptal");
            Icerir(s.Cagrilar.Last(), "CANCELLED=1");
            Dogru(s.Siparis("SP-5", 2).Iptal, "iptal görünür, fiş silinmez");
            var once = s.Cagrilar.Count;
            Dogru(Basari(C(s, "POST", "/api/PurchaseOrder/SP-5/cancel", N())), "yinelenen iptal zararsız");
            Esit(once, s.Cagrilar.Count, "ikinci iptal Logo'ya gitmez");
            Esit("Order not found", Hata(C(s, "POST", "/api/PurchaseOrder/YOK/cancel", N())), "olmayan sipariş");
        }

        static void T_bulma_satir_listesi_fatura_ve_mal_kabul_okumalari()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/PurchaseOrder/AddRich", Siparis("SP/6", SiparisSatiri(Malzeme, 1)));
            Esit(Ref(c), Ref(C(s, "GET", "/api/PurchaseOrder/find/SP%2F6", null)), "kodlanmış numarayla bulma");
            Esit(404, C(s, "GET", "/api/PurchaseOrder/find/YOK", null).Durum, "yok 404");
            var l = (object[])C(s, "GET", "/api/PurchaseOrder/SP%2F6/lines", null).Govde;
            Esit(1, l.Length, "satır listesi dizi");
            Esit(404, C(s, "GET", "/api/PurchaseOrder/YOK/invoices", null).Durum, "faturada olmayan sipariş 404");
            s.FaturaListesi[Ref(c)] = new List<FaturaOzeti> { new FaturaOzeti { Ref = 77, No = "F-1" } };
            var f = (object[])C(s, "GET", "/api/PurchaseOrder/SP%2F6/invoices", null).Govde;
            Esit("F-1", ((Dictionary<string, object>)f[0])["number"], "fatura no");
            s.MalKabulSatirlari.Add(new MalKabulSatiri { Ref = 10, SiparisSatirRef = 5, SiparisRef = 4, FisNo = "IR-1", MalzemeKodu = Malzeme, Miktar = 2.5m, Birim = "ADET" });
            s.MalKabulSatirlari.Add(new MalKabulSatiri { Ref = 20, SiparisSatirRef = 6, SiparisRef = 4, FisNo = "IR-2", MalzemeKodu = Malzeme, Miktar = 1, Birim = "ADET" });
            var m = (object[])C(s, "GET", "/api/PurchaseOrder/receipts", null, new Dictionary<string, string> { { "since", "10" } }).Govde;
            Esit(1, m.Length, "since'ten büyük");
            Esit(20, ((Dictionary<string, object>)m[0])["logicalRef"], "kayıt");
            Esit(400, C(s, "GET", "/api/PurchaseOrder/receipts", null, new Dictionary<string, string> { { "since", "x" } }).Durum, "since sayı değil");
            var b = (object[])C(s, "GET", "/api/Lookup/unitsets", null).Govde;
            Esit("05", ((Dictionary<string, object>)b[0])["code"], "birim seti kodu");
            var a = (object[])C(s, "GET", "/api/Lookup/warehouses", null).Govde;
            Esit("0", ((Dictionary<string, object>)a[0])["nr"], "ambar");
            Esit(404, C(s, "GET", "/api/Arp/find/YOK", null).Durum, "cari yok 404");
            Dogru(Basari(C(s, "GET", "/api/Arp/find/" + Satici, null)), "cari var");
        }

        /* ---------------- 2116 ve 2118: kart, stok ve cari okumaları ---------------- */

        static Dictionary<string, object> D(object o) { return (Dictionary<string, object>)o; }

        static void T_malzeme_hareketleri_imlecle_sayfalanir_olmayan_kart_404()
        {
            var s = Logo();
            var k1 = s.Kartlar[0];
            var k2 = s.Kartlar[1];
            s.Hareketler.Add(Tuple.Create(k1.Ref, new MalzemeHareketi { Ref = 501, Tarih = new DateTime(2026, 10, 1), FisTuru = 1, GirisCikis = 1, FisNo = "IRS-1", Miktar = 4.5m, AmbarNo = 0, Birim = "ADET" }));
            s.Hareketler.Add(Tuple.Create(k1.Ref, new MalzemeHareketi { Ref = 502, Tarih = new DateTime(2026, 10, 2), FisTuru = 12, GirisCikis = 4, Miktar = 1, AmbarNo = 1, Birim = "ADET" }));
            s.Hareketler.Add(Tuple.Create(k2.Ref, new MalzemeHareketi { Ref = 503, Tarih = new DateTime(2026, 10, 3), FisTuru = 1, GirisCikis = 1, Miktar = 9 }));
            var m = D(C(s, "GET", "/api/Material/" + k1.Kod + "/movements", null).Govde);
            var l = (object[])m["data"];
            Esit(2, l.Length, "yalnız bu kartın hareketleri");
            Esit("2026-10-01", D(l[0])["date"], "tarih ISO");
            Esit("IRS-1", D(l[0])["ficheNo"], "fiş no");
            Esit(4.5m, Convert.ToDecimal(D(l[0])["quantity"], System.Globalization.CultureInfo.InvariantCulture), "miktar");
            Esit(4, D(l[1])["ioCode"], "çıkış");
            Esit(null, m["next"], "son sayfa");
            var sonraki = (object[])D(C(s, "GET", "/api/Material/" + k1.Kod + "/movements", null, new Dictionary<string, string> { { "since", "501" } }).Govde)["data"];
            Esit(1, sonraki.Length, "imleçten sonrası");
            Esit(400, C(s, "GET", "/api/Material/" + k1.Kod + "/movements", null, new Dictionary<string, string> { { "since", "x" } }).Durum, "imleç sayı değil");
            Esit(404, C(s, "GET", "/api/Material/YOK-1/movements", null).Durum, "olmayan kart");
        }

        static void T_malzeme_hareketleri_en_yeniden_geriye_okunur()
        {
            var s = Logo();
            var k1 = s.Kartlar[0];
            for (var i = 1; i <= 25; i++)
                s.Hareketler.Add(Tuple.Create(k1.Ref, new MalzemeHareketi { Ref = 600 + i, Tarih = new DateTime(2026, 10, i), FisTuru = 1, GirisCikis = 1, Miktar = i }));
            s.Hareketler.Add(Tuple.Create(s.Kartlar[1].Ref, new MalzemeHareketi { Ref = 700, Tarih = new DateTime(2026, 10, 26), FisTuru = 1, GirisCikis = 1, Miktar = 1 }));
            var geri = new Dictionary<string, string> { { "order", "desc" } };
            var m = D(C(s, "GET", "/api/Material/" + k1.Kod + "/movements", null, geri).Govde);
            var l = (object[])m["data"];
            Esit(Islemler.HareketGeriSayfasi, l.Length, "ilk sayfa en çok yirmi");
            Esit(625, D(l[0])["logicalRef"], "en yeni önce; başka kartın hareketi yok");
            Esit(606, D(l[l.Length - 1])["logicalRef"], "sayfanın en eskisi");
            Esit("desc", m["order"], "zarf yönü söyler");
            Esit(606, m["next"], "dolu sayfada sonraki imleç en eski kayıt");
            var m2 = D(C(s, "GET", "/api/Material/" + k1.Kod + "/movements", null, new Dictionary<string, string> { { "order", "desc" }, { "before", "606" } }).Govde);
            var l2 = (object[])m2["data"];
            Esit(5, l2.Length, "kalan beş");
            Esit(605, D(l2[0])["logicalRef"], "imleçten eskiler");
            Esit(null, m2["next"], "son sayfa");
            Esit(false, D(C(s, "GET", "/api/Material/" + k1.Kod + "/movements", null).Govde).ContainsKey("order"), "eski biçim aynen");
            Esit(400, C(s, "GET", "/api/Material/" + k1.Kod + "/movements", null, new Dictionary<string, string> { { "order", "desc" }, { "before", "x" } }).Durum, "imleç sayı değil");
            Esit(400, C(s, "GET", "/api/Material/" + k1.Kod + "/movements", null, new Dictionary<string, string> { { "order", "yan" } }).Durum, "bilinmeyen yön");
            Esit(404, C(s, "GET", "/api/Material/YOK-1/movements", null, geri).Durum, "olmayan kart");
        }

        static void T_son_alis_fiyatlari_en_yeniden_en_cok_on_satir()
        {
            var s = Logo();
            var k1 = s.Kartlar[0];
            for (var i = 1; i <= 12; i++)
                s.AlisSatirlari.Add(Tuple.Create(k1.Ref, new AlisFiyati { Ref = 600 + i, Tarih = new DateTime(2026, 9, i), CariKod = Satici, FaturaNo = "FT-" + i, Miktar = i, Birim = "KG", Fiyat = 10 + i, DovizTuru = 20, DovizFiyati = 0.5m }));
            var l = (object[])C(s, "GET", "/api/Material/" + k1.Kod + "/lastPurchases", null).Govde;
            Esit(Islemler.SonAlisEnCok, l.Length, "en çok on satır");
            Esit("2026-09-12", D(l[0])["date"], "en yeni önce");
            Esit(Satici, D(l[0])["arpCode"], "cari");
            Esit(22m, Convert.ToDecimal(D(l[0])["price"], System.Globalization.CultureInfo.InvariantCulture), "fiyat");
            Esit(20, D(l[0])["currencyType"], "döviz türü");
            Esit(0, ((object[])C(s, "GET", "/api/Material/" + s.Kartlar[1].Kod + "/lastPurchases", null).Govde).Length, "alışı olmayan kart boş");
            Esit(404, C(s, "GET", "/api/Material/YOK-1/lastPurchases", null).Durum, "olmayan kart");
            Esit(404, C(s, "POST", "/api/Material/" + k1.Kod + "/lastPurchases", N()).Durum, "yalnız GET");
        }

        static void T_malzeme_listesi_ve_stok_toplamlari_imlecle_sayfalanir()
        {
            var s = Logo();
            var k1 = s.Kartlar[0];
            var k2 = s.Kartlar[1];
            k2.Pasif = true;
            s.Stoklar.Add(new StokToplami { MalzemeRef = k1.Ref, MalzemeKodu = k1.Kod, AmbarNo = 0, Miktar = 12.5m });
            s.Stoklar.Add(new StokToplami { MalzemeRef = k1.Ref, MalzemeKodu = k1.Kod, AmbarNo = 1, Miktar = 3 });
            var m = D(C(s, "GET", "/api/Material/list", null).Govde);
            var kartlar = (object[])m["data"];
            Esit(2, kartlar.Length, "iki kart");
            Esit(k1.Kod, D(kartlar[0])["code"], "kayıt sırası");
            Esit(false, D(kartlar[1])["active"], "pasif kart");
            Esit(null, m["next"], "son sayfa");
            var sonraki = (object[])D(C(s, "GET", "/api/Material/list", null, new Dictionary<string, string> { { "since", k1.Ref.ToString(System.Globalization.CultureInfo.InvariantCulture) } }).Govde)["data"];
            Esit(1, sonraki.Length, "imleçten sonrası");
            Esit(400, C(s, "GET", "/api/Material/list", null, new Dictionary<string, string> { { "since", "-1" } }).Durum, "imleç sayı değil");
            var t = (object[])D(C(s, "GET", "/api/Stock/totals", null).Govde)["data"];
            Esit(2, t.Length, "ambar başına satır");
            Esit(12.5m, Convert.ToDecimal(D(t[0])["onHand"], System.Globalization.CultureInfo.InvariantCulture), "miktar");
            Esit(1, D(t[1])["warehouseNr"], "ambar no");
        }

        static void T_malzeme_kullanimi_son_hareket_ve_acik_siparisi_kart_sirasiyla_doner()
        {
            var s = Logo();
            var k1 = s.Kartlar[0];
            var k2 = s.Kartlar[1];
            s.Hareketler.Add(Tuple.Create(k1.Ref, new MalzemeHareketi { Ref = 601, Tarih = new DateTime(2026, 3, 4), FisTuru = 1, GirisCikis = 1, Miktar = 2, Birim = "ADET" }));
            s.Hareketler.Add(Tuple.Create(k1.Ref, new MalzemeHareketi { Ref = 602, Tarih = new DateTime(2026, 9, 30), FisTuru = 12, GirisCikis = 4, Miktar = 1, Birim = "ADET" }));
            var acik = new SahteLogo.Fis { Ref = 7100, Nesne = Nesne.SatinAlmaSiparisi, Trcode = 2, No = "ORN-SP-1" };
            acik.Satirlar.Add(new SahteLogo.Satir { Ref = 7101, Tur = 0, Kod = k2.Kod, Miktar = 1, Ust = acik });
            s.Fisler.Add(acik);
            var oku = (Func<Dictionary<string, string>, object[]>)(q => (object[])D((q == null ? C(s, "GET", "/api/Material/usage", null) : C(s, "GET", "/api/Material/usage", null, q)).Govde)["data"]);
            var l = oku(null);
            Esit(2, l.Length, "her kart döner");
            Esit(k1.Kod, D(l[0])["itemCode"], "kayıt sırası");
            Esit("2026-09-30", D(l[0])["lastMovement"], "en son hareket");
            Esit(false, D(l[0])["openOrder"], "siparişi yok");
            Esit(null, D(l[1])["lastMovement"], "hareketsiz kartta tarih yok");
            Esit(true, D(l[1])["openOrder"], "açık sipariş");
            acik.Satirlar[0].Kapali = true;
            Esit(false, D(oku(null)[1])["openOrder"], "kapanan satır açık sayılmaz");
            acik.Satirlar[0].Kapali = false;
            acik.Iptal = true;
            Esit(false, D(oku(null)[1])["openOrder"], "iptal sipariş açık sayılmaz");
            Esit(1, oku(new Dictionary<string, string> { { "since", k1.Ref.ToString(System.Globalization.CultureInfo.InvariantCulture) } }).Length, "imleçten sonrası");
            Esit(400, C(s, "GET", "/api/Material/usage", null, new Dictionary<string, string> { { "since", "-1" } }).Durum, "imleç sayı değil");
            Esit(404, C(s, "POST", "/api/Material/usage", N()).Durum, "yalnız GET");
            Esit(0, s.Cagrilar.Count, "okuma Logo'ya yazmaz");
        }

        static void T_malzeme_aramasi_en_az_uc_karakter_kodda_ve_adda_kullanimdakini_bulur()
        {
            var s = Logo();
            var a = s.KartEkle("ORN-ARA-002");
            a.Ad = "Deneme Mil";
            var b = s.KartEkle("ORN-ARA-001");
            b.Ad = "Deneme Burc";
            s.KartEkle("ORN-ARA-003").Pasif = true;
            for (var i = 0; i < 25; i++) s.KartEkle("ORN-COK-" + i.ToString("00", System.Globalization.CultureInfo.InvariantCulture));
            Func<string, object[]> ara = q => (object[])C(s, "GET", "/api/Material/search", null, new Dictionary<string, string> { { "q", q } }).Govde;
            var l = ara("orn-ara");
            Esit(2, l.Length, "kodda, büyük/küçük harf duyarsız; kullanım dışı gelmez");
            Esit("ORN-ARA-001", D(l[0])["code"], "kod sırası");
            Esit(true, D(l[0])["active"], "kullanımda");
            Esit("05", D(l[0])["unitSetCode"], "birim seti");
            Esit(1, ara("mil").Length, "adda");
            Esit(20, ara("ORN-COK").Length, "en çok 20 sonuç");
            Esit(400, C(s, "GET", "/api/Material/search", null, new Dictionary<string, string> { { "q", "ab" } }).Durum, "iki karakter reddedilir");
            Esit(400, C(s, "GET", "/api/Material/search", null, new Dictionary<string, string> { { "q", new string('a', 101) } }).Durum, "101 karakter reddedilir");
            Esit(400, C(s, "GET", "/api/Material/search", null).Durum, "metinsiz istek reddedilir");
            Esit(0, s.Cagrilar.Count, "arama Logo'ya yazmaz");
        }

        static void T_cari_arama_en_az_uc_karakter_kod_unvan_ve_vergi_noyla_bulur()
        {
            var s = Logo();
            s.CariDetaylari.Add(new CariKaydi { Ref = 501, Kod = "120.01.001", Ad = "Ornek Metal Sanayi", KartTuru = 3, VergiNo = "1234567890", Il = "Il-1" });
            s.CariDetaylari.Add(new CariKaydi { Ref = 502, Kod = "320.01.002", Ad = "Deneme Tedarik", KartTuru = 2, VergiNo = "1111111111", Pasif = true });
            Func<string, object[]> ara = q => (object[])C(s, "GET", "/api/Arp/search", null, new Dictionary<string, string> { { "q", q } }).Govde;
            Esit(1, ara("metal").Length, "ünvanda büyük/küçük harf duyarsız");
            Esit(1, ara("120.01").Length, "kodda");
            Esit("120.01.001", D(ara("1234567890")[0])["code"], "vergi no tam");
            Esit(0, ara("1111111111").Length, "pasif cari aranmaz");
            Esit(400, C(s, "GET", "/api/Arp/search", null, new Dictionary<string, string> { { "q", "ab" } }).Durum, "iki karakter reddedilir");
            var c = D(C(s, "GET", "/api/Arp/card/120.01.001", null).Govde);
            Esit(501, c["logicalRef"], "tek cari");
            Esit("Il-1", c["city"], "il");
            Esit(404, C(s, "GET", "/api/Arp/card/YOK", null).Durum, "olmayan cari 404");
            Esit(0, s.Cagrilar.Count, "okumalar Logo'ya yazmaz");
        }

        /* ---------------- Talep fişi ve karşılama ---------------- */

        static Cevap Talep(SahteLogo s, string no, int durum)
        {
            return C(s, "POST", "/api/DemandFiche/AddRich", N("number", no, "date", "06.10.2026", "logoStatus", durum,
                "lines", new[] { N("itemCode", Malzeme, "amount", 6, "unitCode", "ADET", "procureDate", "20.10.2026") }));
        }

        static void T_talep_fisi_onayli_acilir_ve_satir_kayitlari_doner()
        {
            var s = Logo();
            var c = Talep(s, "TLP-1", 1);
            Dogru(Basari(c), Json.Yaz(c.Govde));
            Esit(1, Satirlar(c, "fiche").Count, "satır");
            Icerir(s.SonXml, "<STATUS>1</STATUS>");
            Icerir(s.SonXml, "<TIME>90507000</TIME>");
            Icerir(s.SonXml, "<MEET_AMOUNT>0</MEET_AMOUNT>");
            Icermez(s.SonXml, "DOC_NUMBER");
        }

        static void T_karsilama_yalniz_onayli_talebe_yazilir_ve_once_miktar_sifirlanip_sonra_silinir()
        {
            var s = Logo();
            var siparis = C(s, "POST", "/api/PurchaseOrder/AddRich", Siparis("SP-7", SiparisSatiri(Malzeme, 6)));
            var siparisSatiri = Satirlar(siparis, "order")[0];
            var oneri = Satirlar(Talep(s, "TLP-0", 0), "fiche")[0];
            var once = s.Cagrilar.Count;
            var r = C(s, "POST", "/api/DemandFiche/peg", N("demandLineRef", oneri, "orderLineRef", siparisSatiri, "amount", 6, "itemCode", Malzeme, "unitCode", "ADET",
                "arpCode", Satici));
            Icerir(Hata(r), "onaylı değil");
            Esit(once, s.Cagrilar.Count, "öneri fişe Logo'ya gidilmez");

            var talepSatiri = Satirlar(Talep(s, "TLP-2", 1), "fiche")[0];
            var k = C(s, "POST", "/api/DemandFiche/peg", N("demandLineRef", talepSatiri, "orderLineRef", siparisSatiri, "amount", 6, "itemCode", Malzeme,
                "unitCode", "ADET", "arpCode", Satici));
            Dogru(Basari(k), Json.Yaz(k.Govde));
            Esit("DEMAND_REFERENCE", s.SonBaslik[0].Key, "ilk alan");
            Esit(4, s.SonBaslik.Deger("LINE_TYPE"), "LINE_TYPE 4");
            Esit(1, s.SonBaslik.Deger("ORD_PERIOD"), "dönem ayardan");
            Esit(6m, s.TalepSatirlari(new List<int> { talepSatiri })[0].Karsilanan, "talep satırı karşılandı");
            var liste = (object[])C(s, "GET", "/api/DemandFiche/peg/byOrder/" + Ref(siparis), null).Govde;
            Esit(siparisSatiri, ((Dictionary<string, object>)liste[0])["orderLineRef"], "byOrder");

            var d = C(s, "DELETE", "/api/DemandFiche/peg/byOrder/" + Ref(siparis), null);
            Dogru(Basari(d), Json.Yaz(d.Govde));
            var sira = s.Cagrilar.Skip(s.Cagrilar.Count - 2).ToList();
            Icerir(sira[0], "Guncelle 88");
            Icerir(sira[0], "MEET_AMNT=0");
            Icerir(sira[1], "Sil 88");
            Esit(0m, s.TalepSatirlari(new List<int> { talepSatiri })[0].Karsilanan, "talep satırı geri alındı");
            Esit(1, s.TalepSatirlari(new List<int> { talepSatiri })[0].Durum, "talep satırı STATUS 1");
            Esit(404, C(s, "DELETE", "/api/DemandFiche/peg/byOrder/" + Ref(siparis), null).Durum, "kaldırılacak yok");
        }

        /* ---------------- Satış teklifi ve satış siparişi ---------------- */

        static Cevap Teklif(SahteLogo s, string no, string cari)
        {
            return C(s, "POST", "/api/SalesOffer/AddRich", N("number", no, "date", "25.09.2026", "arpCode", cari, "validUntil", "30.11.2026", "status", 1,
                "lines", new[] { N("type", 0, "masterCode", Malzeme, "quantity", 2, "price", 100, "discountRate", 10, "vatRate", 20, "unitCode", "ADET") }));
        }

        static void T_teklif_alan_sirasi_ve_tuzaklar()
        {
            var s = Logo();
            var c = Teklif(s, "TKL-1", Alici);
            Dogru(Basari(c), Json.Yaz(c.Govde));
            Esit("SLSCUSTCODE", s.SonBaslik[0].Key, "ilk alan SLSCUSTCODE");
            Esit("CRM-" + Alici, s.SonBaslik[0].Value, "CRM müşteri kodu");
            Esit(1, s.SonBaslik.Deger("TRCODE"), "TRCODE 1");
            Dogru(!s.SonBaslik.Var("ALTNR"), "ALTNR yazılmaz");
            Dogru(!s.SonBaslik.Var("LASTREVISION") && s.SonSon.Var("LASTREVISION"), "LASTREVISION satırlardan sonra");
            Dogru(!s.SonSatirlar[0].Var("STATUS"), "satıra STATUS yazılmaz");
            Esit(10m, s.SonSatirlar[0].Deger("DISCPER"), "teklifte iskonto DISCPER");
            Dogru(s.Teklif("TKL-1").NetToplam > 0, "toplam 0 kalmadı");
            var once = s.Cagrilar.Count;
            Icerir(Hata(Teklif(s, "TKL-2", Satici)), "4208");
            Esit(once, s.Cagrilar.Count, "CRM'siz cari Logo'ya gitmez");
            Esit(404, C(s, "GET", "/api/SalesOffer/customer/" + Satici, null).Durum, "CRM yok 404");
            Dogru(Basari(C(s, "GET", "/api/SalesOffer/customer/" + Alici, null)), "CRM var");
        }

        static void T_tekliften_siparis_bagi_satirda_kurulur_ve_tamami_donunce_teklif_onaylanir()
        {
            var s = Logo();
            var t = Teklif(s, "TKL-3", Alici);
            var okunan = C(s, "GET", "/api/SalesOffer/" + Ref(t), null);
            var teklifSatiri = Satirlar(okunan, "offer")[0];
            Esit(400, C(s, "POST", "/api/SalesOffer/" + Ref(t) + "/toOrder", N("number", "SS-1", "date", "26.09.2026", "orderStatus", 4)).Durum, "satırsız");
            Icerir(Hata(C(s, "POST", "/api/SalesOffer/" + Ref(t) + "/toOrder", N("number", "SS-1", "date", "26.09.2026", "orderStatus", 4,
                "lines", new[] { N("offerLineRef", teklifSatiri, "quantity", 3) }))), "kalan miktarı aşıyor");
            var c = C(s, "POST", "/api/SalesOffer/" + Ref(t) + "/toOrder", N("number", "SS-1", "date", "26.09.2026", "orderStatus", 4,
                "lines", new[] { N("offerLineRef", teklifSatiri, "quantity", 2, "dueDate", "30.10.2026") }));
            Dogru(Basari(c), Json.Yaz(c.Govde));
            Dogru(!s.SonBaslik.Var("OFFER_REFERENCE"), "başlıkta OFFER_REFERENCE yok");
            Esit(Ref(t), s.SonSatirlar[0].Deger("OFFERREF"), "OFFERREF satırda");
            Esit(teklifSatiri, s.SonSatirlar[0].Deger("OFFTRANSREF"), "OFFTRANSREF satırda");
            Esit(Alici, s.SonBaslik.Deger("ARP_CODE"), "cari tekliften");
            Esit(1, Satirlar(c, "order").Count, "satır");
            Icerir(s.Cagrilar.Last(), "Guncelle 135");
            Icerir(s.Cagrilar.Last(), "STATUS=4");
            Esit(404, C(s, "GET", "/api/SalesOffer/999999", null).Durum, "olmayan teklif");
        }

        static void T_teklifin_bir_kismi_siparise_donunce_teklif_durumu_degismez()
        {
            var s = Logo();
            var t = Teklif(s, "TKL-4", Alici);
            var teklifSatiri = Satirlar(C(s, "GET", "/api/SalesOffer/" + Ref(t), null), "offer")[0];
            Dogru(Basari(C(s, "POST", "/api/SalesOffer/" + Ref(t) + "/toOrder", N("number", "SS-2", "date", "26.09.2026", "orderStatus", 4,
                "lines", new[] { N("offerLineRef", teklifSatiri, "quantity", 1) }))), "kısmi");
            Esit("AlanlaEkle 3", s.Cagrilar.Last(), "STATUS 4 yazılmaz");
        }

        /* ---------------- Malzeme fişi ---------------- */

        static Dictionary<string, object> Fis(int tur, string no)
        {
            return N("TYPE", tur, "NUMBER", no, "DATE", "07.10.2026", "TIME", "14:05:09", "GROUP", 3, "CURRSEL_TOTALS", 1,
                "TRANSACTIONS", new[] { N("ITEM_CODE", Malzeme, "QUANTITY", 1.5m, "UNIT_CODE", "ADET", "UNIT_CONV1", 1, "UNIT_CONV2", 1, "LINE_TYPE", 0, "LINE_NUMBER", 1,
                    "DESCRIPTION", "Hurda") });
        }

        static void T_sarf_ve_uretimden_giris_fisi_acilir_saat_logo_bicimine_cevrilir()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/MaterialSlip/AddConsumption", Fis(12, "UE-2026-001"));
            Dogru(Basari(c), Json.Yaz(c.Govde));
            Icerir(s.SonXml, "<TIME>140509000</TIME>");
            Icerir(s.SonXml, "<TYPE>12</TYPE>");
            Icerir(s.SonXml, "<EU_VAT_STATUS>4</EU_VAT_STATUS>");
            Dogru(Basari(C(s, "POST", "/api/MaterialSlip/AddProductionEntry", Fis(13, "UE-2026-001"))), "aynı numara, öbür tür");
            Esit(400, C(s, "POST", "/api/MaterialSlip/AddProductionEntry", Fis(12, "UE-2026-002")).Durum, "TYPE uçla uyuşmuyor");
            Icerir(Hata(C(s, "POST", "/api/MaterialSlip/AddConsumption", Fis(12, "UE-2026-001"))), "zaten var");
            var g = Fis(12, "UE-2026-003");
            g["TIME"] = "25:00:00";
            Esit(400, C(s, "POST", "/api/MaterialSlip/AddConsumption", g).Durum, "geçersiz saat");
        }

        static void T_malzeme_fisi_numarayla_bulunur_silinir_ve_yeniden_acilir()
        {
            var s = Logo();
            Esit(404, C(s, "GET", "/api/MaterialSlip/Consumption/find/UE-2026-010", null).Durum, "açılmamış fiş yok");
            var c = C(s, "POST", "/api/MaterialSlip/AddConsumption", Fis(12, "UE-2026-010"));
            Dogru(Basari(c), Json.Yaz(c.Govde));
            Dogru(Basari(C(s, "GET", "/api/MaterialSlip/Consumption/find/UE-2026-010", null)), "açılan fiş bulunur");
            Esit(404, C(s, "GET", "/api/MaterialSlip/ProductionEntry/find/UE-2026-010", null).Durum, "öbür tür ayrı numaralanır");
            Esit(404, C(s, "DELETE", "/api/MaterialSlip/ProductionEntry/UE-2026-010", null).Durum, "öbür türün fişi silinmez");
            Dogru(Basari(C(s, "DELETE", "/api/MaterialSlip/Consumption/UE-2026-010", null)), "silinir");
            Dogru(s.Cagrilar.Last().StartsWith("Sil " + Nesne.MalzemeFisi + " "), "Logo Objects Delete");
            Esit(404, C(s, "GET", "/api/MaterialSlip/Consumption/find/UE-2026-010", null).Durum, "silinen fiş bulunmaz");
            Esit(404, C(s, "DELETE", "/api/MaterialSlip/Consumption/UE-2026-010", null).Durum, "ikinci silme yok sayılmaz, 404");
            Dogru(Basari(C(s, "POST", "/api/MaterialSlip/AddConsumption", Fis(12, "UE-2026-010"))), "aynı numarayla yeniden açılır");
            Esit(400, C(s, "DELETE", "/api/MaterialSlip/Consumption/" + new string('9', 17), null).Durum, "çok uzun numara");
        }

        static void T_fire_ve_sayim_fisleri_kendi_trcode_iyle_acilir_bulunur_silinir()
        {
            var s = Logo();
            foreach (var t in new[] { new KeyValuePair<string, int>("Scrap", 11), new KeyValuePair<string, int>("CountSurplus", 50), new KeyValuePair<string, int>("CountShortage", 51) })
            {
                var c = C(s, "POST", "/api/MaterialSlip/Add" + t.Key, Fis(t.Value, "SF-000001"));
                Dogru(Basari(c), t.Key + " " + Json.Yaz(c.Govde));
                Icerir(s.SonXml, "<TYPE>" + t.Value + "</TYPE>");
                Dogru(!s.SonXml.Contains("SOURCE_WH"), "ambar alanı yalnız ambar fişinde");
                Dogru(Basari(C(s, "GET", "/api/MaterialSlip/" + t.Key + "/find/SF-000001", null)), t.Key + " bulunur");
                Esit(400, C(s, "POST", "/api/MaterialSlip/Add" + t.Key, Fis(12, "SF-000002")).Durum, t.Key + " TYPE uçla uyuşmuyor");
            }
            Esit(404, C(s, "GET", "/api/MaterialSlip/Consumption/find/SF-000001", null).Durum, "türler ayrı numaralanır");
            Dogru(Basari(C(s, "DELETE", "/api/MaterialSlip/CountShortage/SF-000001", null)), "sayım eksiği silinir");
            Esit(404, C(s, "GET", "/api/MaterialSlip/CountShortage/find/SF-000001", null).Durum, "silinen bulunmaz");
            Dogru(Basari(C(s, "GET", "/api/MaterialSlip/CountSurplus/find/SF-000001", null)), "öbür tür durur");
            Esit(404, C(s, "POST", "/api/MaterialSlip/AddTransfer", Fis(25, "AF-000001")).Durum, "bilinmeyen tür ucu");
            var g = Fis(11, "SF-000003");
            g["SOURCE_WH"] = 1;
            g["DEST_WH"] = 2;
            Icerir(Hata(C(s, "POST", "/api/MaterialSlip/AddScrap", g)), "yalnız ambar fişinde");
        }

        static Dictionary<string, object> AmbarFisi(string no, int kaynak, int hedef)
        {
            var g = Fis(25, no);
            g["SOURCE_WH"] = kaynak;
            g["DEST_WH"] = hedef;
            var satir = ((Dictionary<string, object>[])g["TRANSACTIONS"])[0];
            satir["SOURCE_WH"] = kaynak;
            satir["DEST_WH"] = hedef;
            return g;
        }

        static void T_ambar_fisi_baslikta_ve_satirda_tek_ambar_cifti_tasir()
        {
            var s = Logo();
            var c = C(s, "POST", "/api/MaterialSlip/AddWarehouseTransfer", AmbarFisi("AF-000001", 1, 2));
            Dogru(Basari(c), Json.Yaz(c.Govde));
            Icerir(s.SonXml, "<TYPE>25</TYPE>");
            Icerir(s.SonXml, "<SOURCE_WH>1</SOURCE_WH>\n<DEST_WH>2</DEST_WH>\n<TRANSACTIONS>");
            Icerir(s.SonXml, "<SOURCE_WH>1</SOURCE_WH>\n<DEST_WH>2</DEST_WH>\n<EU_VAT_STATUS>");
            Dogru(Basari(C(s, "GET", "/api/MaterialSlip/WarehouseTransfer/find/AF-000001", null)), "bulunur");
            Dogru(Basari(C(s, "DELETE", "/api/MaterialSlip/WarehouseTransfer/AF-000001", null)), "silinir");
            Esit(400, C(s, "POST", "/api/MaterialSlip/AddWarehouseTransfer", Fis(25, "AF-000002")).Durum, "ambarsız ambar fişi");
            Icerir(Hata(C(s, "POST", "/api/MaterialSlip/AddWarehouseTransfer", AmbarFisi("AF-000003", 1, 1))), "aynı");
            Esit(400, C(s, "POST", "/api/MaterialSlip/AddWarehouseTransfer", AmbarFisi("AF-000004", -1, 2)).Durum, "eksi ambar");
            var g = AmbarFisi("AF-000005", 1, 2);
            ((Dictionary<string, object>[])g["TRANSACTIONS"])[0]["DEST_WH"] = 3;
            Icerir(Hata(C(s, "POST", "/api/MaterialSlip/AddWarehouseTransfer", g)), "başlıktakiyle aynı");
            Esit(404, C(s, "GET", "/api/MaterialSlip/WarehouseTransfer/find/AF-000005", null).Durum, "reddedilen fiş Logo'ya yazılmaz");
        }

        /* ---------------- Hata eşleme ---------------- */

        static void T_oturum_acilamazsa_503_koparsa_500_bilinmeyen_yol_404()
        {
            var s = Logo();
            s.BaglantiYok = true;
            Esit(503, C(s, "POST", "/api/Material/AddRich", Kart("TMI-YENI-5")).Durum, "oturum açılamadı");
            s.BaglantiYok = false;
            s.Kopsun = true;
            Esit(500, C(s, "POST", "/api/Material/AddRich", Kart("TMI-YENI-5")).Durum, "oturum koptu");
            Esit(404, C(s, "GET", "/api/Bilinmeyen", null).Durum, "bilinmeyen yol");
            Esit(404, C(s, "PUT", "/api/Material/AddRich", null).Durum, "bilinmeyen yöntem");
        }

        /* ---------------- SQL ---------------- */

        static void T_butun_sorgular_yalniz_select_ve_firma_donem_tablolarini_kullanir()
        {
            var q = new Sorgular(7, 3);
            var hepsi = q.Hepsi().ToList();
            Esit(37, hepsi.Count, "sorgu sayısı");
            Icerir(q.SiparisIcerikBasligi, "O.TRCODE = 2 AND O.FICHENO = @no");
            Icerir(q.SiparisIcerikBasligi, "LG_007_03_ORFICHE");
            Icerir(q.SiparisIcerikSatirlari, "LG_007_03_ORFLINE");
            Icermez(q.SiparisIcerikBasligi, "@tr");
            foreach (var m in hepsi) Sorgular.YalnizOkuma(string.Format(m, "@r0"));
            Icerir(q.MalzemeRef, "LG_007_ITEMS");
            Icerir(q.MalzemeKodlari, "SELECT CODE FROM LG_007_ITEMS");
            Icerir(q.Siparis, "LG_007_03_ORFICHE");
            Icerir(q.Siparis, "O.TRCODE = @tr");
            Icerir(q.StokToplamlari, "LG_007_03_GNTOTST");
            Icerir(q.MalzemeKullanimlari, "LG_007_03_STLINE");
            Icerir(q.MalzemeKullanimlari, "LG_007_03_ORFLINE");
            Icerir(q.MalzemeKullanimlari, "O.CANCELLED = 0");
            Icerir(q.MalzemeAra, "I.ACTIVE = 0");
            Icerir(q.MalzemeAra, "LG_007_ITEMS");
            Icerir(q.CariAra, "LG_007_CLCARD");
            Icerir(q.MalzemeRefIle, "I.ACTIVE");
            Icerir(q.HizmetRefIle, "LG_007_SRVCARD");
            Icerir(q.HizmetRefIle, "ACTIVE");
            Esit("%a\\%b\\_c\\[d\\\\%", SqlOkuma.Desen("a%b_c[d\\"), "LIKE deseni kaçırılır");
            foreach (var yazan in new[] { "UPDATE LG_007_ITEMS SET NAME = 'x'", "SELECT 1; DELETE FROM LG_007_ITEMS", "SELECT * INTO X FROM LG_007_ITEMS", "EXEC sp_who" })
            {
                var reddedildi = false;
                try { Sorgular.YalnizOkuma(yazan); }
                catch (InvalidOperationException) { reddedildi = true; }
                Dogru(reddedildi, "yazan sorgu kabul edildi: " + yazan);
            }
        }

        /* ---------------- HTTP ---------------- */

        static string Gonder(int port, string istek)
        {
            using (var c = new TcpClient("127.0.0.1", port))
            {
                var akis = c.GetStream();
                var b = Encoding.UTF8.GetBytes(istek);
                akis.Write(b, 0, b.Length);
                using (var r = new StreamReader(akis, Encoding.UTF8)) return r.ReadToEnd();
            }
        }

        static void T_http_yalniz_dogru_anahtar_ve_yerel_host_ile_cevap_verir()
        {
            var s = Logo();
            var ayar = TestAyari();
            var sunucu = new HttpSunucu(0, ayar.Anahtar, Isl(s).Isle);
            sunucu.Baslat();
            var is_ = new Thread(() => sunucu.Calis(5));
            is_.Start();
            try
            {
                var p = sunucu.Port;
                var h = "Host: 127.0.0.1:" + p + "\r\n";
                var k = "X-Api-Key: " + ayar.Anahtar + "\r\n";
                Icerir(Gonder(p, "GET /api/Lookup/unitsets HTTP/1.1\r\n" + h + "\r\n"), "HTTP/1.1 401");
                Icerir(Gonder(p, "GET /api/Lookup/unitsets HTTP/1.1\r\n" + h + "X-Api-Key: yanlis\r\n\r\n"), "HTTP/1.1 401");
                Icerir(Gonder(p, "GET /api/Lookup/unitsets HTTP/1.1\r\nHost: kotu.ornek:" + p + "\r\n" + k + "\r\n"), "HTTP/1.1 403");
                Icerir(Gonder(p, "GET /api/Lookup/unitsets HTTP/1.1\r\n" + h + k + "Origin: http://kotu.ornek\r\n\r\n"), "HTTP/1.1 403");
                var govde = Json.Yaz(Kart("TMI-HTTP-1"));
                var cevap = Gonder(p, "POST /api/Material/AddRich HTTP/1.1\r\n" + h + k + "Content-Type: application/json\r\nContent-Length: "
                    + Encoding.UTF8.GetByteCount(govde) + "\r\n\r\n" + govde);
                Icerir(cevap, "HTTP/1.1 200 OK");
                Icerir(cevap, "\"success\":true");
                Dogru(s.MalzemeRef("TMI-HTTP-1") > 0, "kart açıldı");
            }
            finally
            {
                sunucu.Durdur();
                is_.Join(5000);
            }
        }
    }
}
