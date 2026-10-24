using System;
using System.Collections.Generic;
using System.Globalization;

namespace LogoYardimcisi
{
    // Canlı deneme (rehber §12): gerçek Logo'da yalnız test kayıtlarıyla bütün yazma akışlarını uçtan uca dener, sonra açtıklarını siler.
    // Malzeme TMI-ERP-TEST-001 (kalıcı, açılmaz, silinmez); fiş numaraları TMI-ERP- önekli. Silinen yalnız bu koşuda açılan ve numarası
    // önekle başlayan kayıttır; gerçek kayıt silinmez. Cari kodları ayar dosyasından gelir (deneme_satici, deneme_alici).
    public sealed class Deneme
    {
        public const string TestMalzemesi = "TMI-ERP-TEST-001";
        public const string Onek = "TMI-ERP-";
        const string Birim = "ADET";

        readonly ILogoYazici logo;
        readonly ILogoOkuma oku;
        readonly Ayar ayar;
        readonly Islemler islemler;
        readonly List<KeyValuePair<string, Action>> temizlik = new List<KeyValuePair<string, Action>>();
        int hata;

        public Deneme(ILogoYazici logo, ILogoOkuma oku, Ayar ayar)
        {
            this.logo = logo;
            this.oku = oku;
            this.ayar = ayar;
            islemler = new Islemler(logo, oku, ayar, () => DateTime.Now);
        }

        static Dictionary<string, object> N(params object[] ciftler)
        {
            var d = new Dictionary<string, object>();
            for (var i = 0; i < ciftler.Length; i += 2) d[(string)ciftler[i]] = ciftler[i + 1];
            return d;
        }

        Dictionary<string, object> Adim(string ad, string yontem, string yol, object govde)
        {
            var c = islemler.Isle(yontem, yol, new Dictionary<string, string>(), govde == null ? null : Json.Yaz(govde));
            var z = c.Govde as Dictionary<string, object>;
            var basari = c.Durum == 200 && (z == null || Equals(z["success"], true));
            if (!basari) hata++;
            Console.WriteLine((basari ? "TAMAM " : "HATA  ") + ad + (basari ? "" : " (" + c.Durum + ") " + Json.Yaz(c.Govde)));
            return basari ? (z ?? new Dictionary<string, object>()) : null;
        }

        static int Ref(Dictionary<string, object> z)
        {
            return z == null ? 0 : Convert.ToInt32(z["logicalRef"], CultureInfo.InvariantCulture);
        }

        static List<int> SatirRefleri(Dictionary<string, object> z, string kap)
        {
            var l = new List<int>();
            var k = z[kap] as Dictionary<string, object>;
            foreach (var o in (System.Collections.IList)k["lines"]) l.Add(Convert.ToInt32(((Dictionary<string, object>)o)["logicalRef"], CultureInfo.InvariantCulture));
            return l;
        }

        // Silmeden önce kayıt SQL'den yeniden okunur: numarası önekle başlamıyorsa ya da numarası tutmuyorsa silinmez.
        void SilmeyiKaydet(string ad, int nesne, int kayit, Func<FisBasligi> oku_)
        {
            temizlik.Add(new KeyValuePair<string, Action>(ad, () =>
            {
                var b = oku_();
                if (b == null || b.Ref != kayit || b.No == null || !b.No.StartsWith(Onek, StringComparison.Ordinal))
                {
                    Console.WriteLine("ATLANDI silme " + ad + ": kayıt önekli test kaydı olarak doğrulanamadı.");
                    return;
                }
                var h = logo.Sil(nesne, kayit);
                Console.WriteLine((h == null ? "SİLİNDİ " : "SİLİNEMEDİ ") + ad + (h == null ? "" : " " + h));
                if (h != null) hata++;
            }));
        }

        public int Calistir()
        {
            if (ayar.DenemeSatici == null) { Console.Error.WriteLine("Ayar eksik: deneme_satici (Logo'daki test satıcı cari kodu)."); return 1; }
            var ek = DateTime.Now.ToString("HHmmss", CultureInfo.InvariantCulture);
            var bugun = DateTime.Now.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture);
            try
            {
                var m = Adim("Malzeme var mı (" + TestMalzemesi + ")", "GET", "/api/Material/exists/" + TestMalzemesi, null);
                if (Ref(m) == 0) { Console.WriteLine("DURDU: test malzemesi Logo'da yok; Logo'da elle açın."); return 1; }
                Adim("Birim setleri", "GET", "/api/Lookup/unitsets", null);
                Adim("Ambarlar", "GET", "/api/Lookup/warehouses", null);
                Adim("Mal kabul okuma", "GET", "/api/PurchaseOrder/receipts", null);

                var no = Onek + "P" + ek;
                var satir = N("type", 0, "masterCode", TestMalzemesi, "quantity", 2, "price", 10.5m, "vatRate", 20, "unitCode", Birim, "dueDate", bugun,
                    "description", "TMI deneme (isk. %10)");
                var s = Adim("Satın alma siparişi aç", "POST", "/api/PurchaseOrder/AddRich",
                    N("number", no, "date", bugun, "arpCode", ayar.DenemeSatici, "orderStatus", 1, "lines", new[] { satir }));
                if (s != null)
                {
                    var sref = Ref(s);
                    SilmeyiKaydet("satın alma siparişi " + no, Nesne.SatinAlmaSiparisi, sref, () => oku.Siparis(no, 2));
                    var satirlar = SatirRefleri(s, "order");
                    var degisen = N("logicalRef", satirlar[0], "type", 0, "masterCode", TestMalzemesi, "quantity", 3, "price", 10.5m, "vatRate", 20, "unitCode", Birim);
                    var yeni = N("type", 0, "masterCode", TestMalzemesi, "quantity", 1, "price", 4, "vatRate", 20, "unitCode", Birim);
                    Adim("Sipariş düzenle (miktar, yeni satır)", "POST", "/api/PurchaseOrder/UpdateRich",
                        N("logicalRef", sref, "number", no, "date", bugun, "arpCode", ayar.DenemeSatici, "orderStatus", 1, "lines", new[] { degisen, yeni }));
                    var tumu = oku.SiparisSatirlari(sref);
                    if (tumu.Count == 2) Adim("Satır kapat", "POST", "/api/PurchaseOrder/" + no + "/close", N("lineRefs", new[] { tumu[1].Ref }));

                    var tno = Onek + "T" + ek;
                    var t = Adim("Talep fişi aç (onaylı)", "POST", "/api/DemandFiche/AddRich",
                        N("number", tno, "date", bugun, "logoStatus", 1, "lines", new[] { N("itemCode", TestMalzemesi, "amount", 3, "unitCode", Birim, "procureDate", bugun) }));
                    if (t != null)
                    {
                        SilmeyiKaydet("talep fişi " + tno, Nesne.TalepFisi, Ref(t), () => oku.Talep(tno));
                        var talepSatiri = SatirRefleri(t, "fiche")[0];
                        var k = Adim("Karşılama yaz", "POST", "/api/DemandFiche/peg", N("demandLineRef", talepSatiri, "orderLineRef", satirlar[0], "amount", 3,
                            "itemCode", TestMalzemesi, "unitCode", Birim, "arpCode", ayar.DenemeSatici));
                        if (k != null)
                        {
                            Adim("Karşılama oku", "GET", "/api/DemandFiche/peg/byOrder/" + sref, null);
                            Adim("Karşılama kaldır (önce MEET_AMNT 0)", "DELETE", "/api/DemandFiche/peg/byOrder/" + sref, null);
                        }
                    }
                    Adim("Sipariş iptal", "POST", "/api/PurchaseOrder/" + no + "/cancel", N());
                    Adim("Sipariş faturaları (boş)", "GET", "/api/PurchaseOrder/" + no + "/invoices", null);
                }

                // Giriş önce açılır ki sarf, fire ve sayım eksiği test malzemesinde stok bulsun. Ambar fişi yalnız deneme_hedef_ambar verilmişse.
                var fisler = new[]
                {
                    new KeyValuePair<string, string>("ProductionEntry", "U"), new KeyValuePair<string, string>("Consumption", "S"),
                    new KeyValuePair<string, string>("Scrap", "F"), new KeyValuePair<string, string>("CountSurplus", "Y"),
                    new KeyValuePair<string, string>("CountShortage", "E"), new KeyValuePair<string, string>("WarehouseTransfer", "A"),
                };
                foreach (var fis in fisler)
                {
                    var tur = Islemler.FisTrcodeAl(fis.Key);
                    var ambar = tur == 25;
                    if (ambar && ayar.DenemeHedefAmbar == null)
                    {
                        Console.WriteLine("ATLANDI ambar fişi: deneme_hedef_ambar ayarı yok.");
                        continue;
                    }
                    var fno = Onek + fis.Value + ek;
                    var fisSatiri = N("ITEM_CODE", TestMalzemesi, "QUANTITY", 1, "UNIT_CODE", Birim, "UNIT_CONV1", 1, "UNIT_CONV2", 1, "LINE_TYPE", 0,
                        "LINE_NUMBER", 1, "DESCRIPTION", "TMI deneme");
                    var govde = N("TYPE", tur, "NUMBER", fno, "DATE", bugun, "TIME", DateTime.Now.ToString("HH:mm:ss", CultureInfo.InvariantCulture), "GROUP", 3,
                        "CURRSEL_TOTALS", 1, "TRANSACTIONS", new[] { fisSatiri });
                    if (ambar)
                    {
                        govde["SOURCE_WH"] = ayar.AmbarNo; govde["DEST_WH"] = ayar.DenemeHedefAmbar.Value;
                        fisSatiri["SOURCE_WH"] = ayar.AmbarNo; fisSatiri["DEST_WH"] = ayar.DenemeHedefAmbar.Value;
                    }
                    var f = Adim("Malzeme fişi (TRCODE " + tur + ") aç", "POST", "/api/MaterialSlip/Add" + fis.Key, govde);
                    if (f != null)
                    {
                        Adim("Malzeme fişi (TRCODE " + tur + ") numarayla bul", "GET", "/api/MaterialSlip/" + fis.Key + "/find/" + Uri.EscapeDataString(fno), null);
                        SilmeyiKaydet("malzeme fişi " + fno, Nesne.MalzemeFisi, Ref(f), () => oku.MalzemeFisi(fno, tur));
                    }
                }

                if (ayar.DenemeAlici == null) Console.WriteLine("ATLANDI satış teklifi ve siparişi: deneme_alici ayarı yok.");
                else
                {
                    Adim("CRM satış müşterisi", "GET", "/api/SalesOffer/customer/" + Uri.EscapeDataString(ayar.DenemeAlici), null);
                    var kno = Onek + "K" + ek;
                    var k = Adim("Satış teklifi aç", "POST", "/api/SalesOffer/AddRich", N("number", kno, "date", bugun, "arpCode", ayar.DenemeAlici, "status", 1,
                        "lines", new[] { N("type", 0, "masterCode", TestMalzemesi, "quantity", 2, "price", 100, "discountRate", 10, "vatRate", 20, "unitCode", Birim) }));
                    if (k != null)
                    {
                        var kref = Ref(k);
                        SilmeyiKaydet("satış teklifi " + kno, Nesne.SatisTeklifi, kref, () => oku.Teklif(kno));
                        var ks = Adim("Teklif satırları", "GET", "/api/SalesOffer/" + kref, null);
                        if (ks != null)
                        {
                            var ono = Onek + "O" + ek;
                            var o = Adim("Tekliften satış siparişi", "POST", "/api/SalesOffer/" + kref + "/toOrder", N("number", ono, "date", bugun, "orderStatus", 1,
                                "lines", new[] { N("offerLineRef", SatirRefleri(ks, "offer")[0], "quantity", 2) }));
                            if (o != null) SilmeyiKaydet("satış siparişi " + ono, Nesne.SatisSiparisi, Ref(o), () => oku.Siparis(ono, 1));
                        }
                    }
                }
            }
            catch (LogoBaglanamadi e)
            {
                hata++;
                Console.WriteLine("DURDU: " + e.Message);
            }
            finally
            {
                for (var i = temizlik.Count - 1; i >= 0; i--)
                {
                    try { temizlik[i].Value(); }
                    catch (Exception e)
                    {
                        hata++;
                        Console.WriteLine("SİLİNEMEDİ " + temizlik[i].Key + ": " + e.GetType().Name);
                    }
                }
            }
            Console.WriteLine(hata == 0 ? "Deneme bitti: bütün adımlar tamam." : "Deneme bitti: " + hata + " hata.");
            return hata == 0 ? 0 : 1;
        }
    }
}
