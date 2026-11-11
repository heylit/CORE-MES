using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Xml;

namespace LogoYardimcisi
{
    // YALNIZ TEST: bellekte Logo. Etiket ve alan listeleri rehberin ölçülmüş listeleridir (§3-§9); listede olmayan etiket ya da alan
    // "[code=14]" verir. Rehberin tuzakları taklit edilir: DBOP=UPD, öneri talep fişine karşılama, MEET_AMNT sıfırlanmadan silinen karşılama,
    // teklifte ALTNR / satır STATUS / satırlardan önce LASTREVISION (toplam 0), satış siparişi başlığında OFFER_REFERENCE (satırlar düşer).
    public sealed class SahteLogo : ILogoYazici, ILogoOkuma
    {
        static HashSet<string> K(params string[] a) { return new HashSet<string>(a); }

        static readonly Dictionary<string, HashSet<string>> XmlBaslik = new Dictionary<string, HashSet<string>>
        {
            { "ITEMS", K("CARD_TYPE", "CODE", "NAME", "AUXIL_CODE", "USEF_PURCHASING", "USEF_SALES", "USEF_MM", "VAT", "AUTOINCSL", "LOTS_DIVISIBLE", "DIST_LOT_UNITS",
                "COMB_LOT_UNITS", "UNITSET_CODE", "FACTORY_PARAMS", "WH_PARAMS", "CHARACTERISTICS", "DOMINANT_CLASSES", "UNITS", "GL_LINKS", "SUPPLIERS", "SELVAT",
                "RETURNVAT", "SELPRVAT", "RETURNPRVAT", "PROJECT_CODE", "NAME3", "NAME4", "GROUP_CODE", "PRODUCER_CODE", "DEPREC_TYPE", "REVAL_FLAG", "REVDEPREC_RFLAG",
                "PAYMENT_CODE") },
            { "PURCHASE_SERVICES", K("CODE", "DESCRIPTION", "DESCRIPTION2", "DESCRIPTION3", "CARD_TYPE", "UNITSET_CODE", "VAT_PERC", "AUXIL_CODE", "PROJECT_CODE",
                "PAYMENT_CODE", "UNITS") },
            { "SALES_SERVICES", K("CODE", "DESCRIPTION", "DESCRIPTION2", "DESCRIPTION3", "CARD_TYPE", "UNITSET_CODE", "VAT_PERC", "AUXIL_CODE", "PROJECT_CODE",
                "PAYMENT_CODE", "UNITS") },
            { "PURCHASE_ORDERS", K("NUMBER", "DATE", "DOC_NUMBER", "ARP_CODE", "GL_CODE", "PAYMENT_CODE", "PROJECT_CODE", "OHP_CODE", "SOURCE_WH", "DIVISION",
                "ORDER_STATUS", "CURRSEL_TOTAL", "CURRSEL_DETAILS", "CURR_TRANSACTIN", "TC_RATE", "RC_RATE", "TRANSACTIONS", "TOTAL_GROSS", "TOTAL_DISCOUNTED",
                "TOTAL_VAT", "TOTAL_NET", "SALESMAN_CODE", "EINVOICE", "AFFECT_RISK") },
            { "DEMAND_FICHES", K("NUMBER", "DATE", "TIME", "STATUS", "DO_CODE", "PROJECT_CODE", "LINE_CNT", "TRANSACTIONS", "FICHE_DATE", "MRP_HEAD_TYPE", "ORD_PEG_USE",
                "REAL_SRC_INDEX") },
            { "MATERIAL_SLIPS", K("TYPE", "NUMBER", "DATE", "TIME", "GROUP", "CURRSEL_TOTALS", "PROJECT_CODE", "SHIP_DATE", "SHIP_TIME", "DOC_DATE", "DOC_TIME", "RC_RATE",
                "SOURCE_WH", "DEST_WH", "TRANSACTIONS") },
        };

        static readonly Dictionary<string, HashSet<string>> XmlSatir = new Dictionary<string, HashSet<string>>
        {
            { "PURCHASE_ORDERS", K("TYPE", "MASTER_CODE", "QUANTITY", "PRICE", "VAT_RATE", "UNIT_CODE", "UNIT_CONV1", "UNIT_CONV2", "DUE_DATE", "ORG_DUE_DATE",
                "TRANS_DESCRIPTION", "PROJECT_CODE", "OHP_CODE1", "SOURCE_WH", "EDT_PRICE", "EDT_CURR", "RC_XRATE", "GL_CODE1", "TOTAL", "VAT_BASE", "VAT_AMOUNT",
                "ORG_PRICE", "ORG_QUANTITY", "DEM_PEGGED_AMNT") },
            { "DEMAND_FICHES", K("ITEM_CODE", "AMOUNT", "MEET_AMOUNT", "UNIT_CODE", "UNIT_CONV1", "UNIT_CONV2", "MEET_TYPE", "PROCURE_DATE", "STATUS", "LINE_TYPE",
                "LINE_NO", "USER_NAME", "PROJECT_CODE", "CARD_TYPE") },
            { "MATERIAL_SLIPS", K("ITEM_CODE", "QUANTITY", "UNIT_CODE", "UNIT_CONV1", "UNIT_CONV2", "LINE_TYPE", "LINE_NUMBER", "DESCRIPTION", "PROJECT_CODE",
                "EU_VAT_STATUS", "DEMPEGGED_AMNT", "EDT_CURR", "RC_XRATE", "SOURCE_WH", "DEST_WH") },
        };

        static readonly Dictionary<int, HashSet<string>> AlanBaslik = new Dictionary<int, HashSet<string>>
        {
            { Nesne.SatisTeklifi, K("SLSCUSTCODE", "TRCODE", "TYP", "FICHENO", "DATE", "DOCODE", "ARP_CODE", "CUSTORDNO", "PAYMENT_CODE", "PROJECT_CODE", "SALESMAN_CODE",
                "SOURCEINDEX", "STATUS", "POFFERBEGDT", "POFFERENDDT", "GENEXP1", "GENEXCTYP", "LINEEXCTYP", "TRCURR", "TRRATE", "REPORTRATE", "LASTREVISION", "ALTNR") },
            { Nesne.SatisSiparisi, K("TYPE", "NUMBER", "DATE", "ARP_CODE", "DOC_NUMBER", "CUST_ORD_NO", "PAYMENT_CODE", "PROJECT_CODE", "SOURCE_WH", "ORDER_STATUS",
                "NOTES1", "CURRSEL_TOTAL", "CURRSEL_DETAILS", "CURR_TRANSACTIN", "TC_RATE", "RC_RATE", "OFFER_REFERENCE", "OFFER_TYP", "OFFER_ALTNR") },
            { Nesne.TalepKarsilama, K("DEMAND_REFERENCE", "CHILD_TYPE", "CHILD_REFERENCE", "LINE_TYPE", "FICHE_TYPE", "MEET_AMNT", "MAIN_MEET_AMNT", "ORD_PERIOD",
                "ITEM_CODE", "MAIN_ITEM_CODE", "U_EDIT", "MAIN_U_EDIT", "ARP_CODE", "PARENTTYPE", "DET_LINE") },
            { Nesne.SatinAlmaSiparisi, K("DATE", "DOC_NUMBER", "PROJECT_CODE", "OHP_CODE", "PAYMENT_CODE", "SOURCE_WH", "ORDER_STATUS", "CANCELLED") },
            { Nesne.Malzeme, K("NAME", "NAME3", "NAME4", "ACTIVE") },
            { Nesne.AlinanHizmet, K("DESCRIPTION", "ACTIVE") },
            { Nesne.VerilenHizmet, K("DESCRIPTION", "ACTIVE") },
            { Nesne.TalepFisi, K("STATUS") },
        };

        static readonly Dictionary<int, HashSet<string>> AlanSatir = new Dictionary<int, HashSet<string>>
        {
            { Nesne.SatisTeklifi, K("TYPE", "MASTER_CODE", "QUANTITY", "PRICE", "EDT_CURR", "EDT_PRICE", "TRCURR", "TRRATE", "VAT", "UEDIT", "DUEDATE", "LINEEXP",
                "DISCPER", "PROJECT_CODE", "STATUS") },
            { Nesne.SatisSiparisi, K("TYPE", "MASTER_CODE", "QUANTITY", "PRICE", "EDT_CURR", "CURR_TRANSACTIN", "EDT_PRICE", "RC_XRATE", "DISCOUNT_RATE", "VAT_RATE",
                "UNIT_CODE", "DUE_DATE", "ORG_DUE_DATE", "TRANS_DESCRIPTION", "PROJECT_CODE", "OFFERREF", "OFFTRANSREF") },
            { Nesne.SatinAlmaSiparisi, K("TYPE", "MASTER_CODE", "QUANTITY", "PRICE", "EDT_PRICE", "EDT_CURR", "RC_XRATE", "VAT_RATE", "UNIT_CODE", "UNIT_CONV1",
                "UNIT_CONV2", "DUE_DATE", "ORG_DUE_DATE", "TRANS_DESCRIPTION", "PROJECT_CODE", "OHP_CODE1", "SOURCE_WH", "ORDER_CLOSED", "CANCELLED", "DEM_PEGGED_AMNT",
                "TOTAL", "VAT_BASE", "VAT_AMOUNT") },
            { Nesne.TalepFisi, K("STATUS") },
        };

        public sealed class Satir
        {
            public int Ref, Tur, Durum, TeklifSatirRef, DovizTuru;
            public string Kod, Birim, Aciklama;
            public decimal Miktar, Fiyat, Kdv, Iskonto, Karsilanan, SipariseDonen, DovizFiyati;
            public DateTime? Termin;
            public bool Kapali;
            public Fis Ust;
        }

        public sealed class Fis
        {
            public int Ref, Nesne, Trcode, Durum, DovizTuru;
            public string No, Cari;
            public bool Iptal;
            public decimal Net, Kur;
            public DateTime? Tarih;
            public List<Satir> Satirlar = new List<Satir>();
        }

        public List<MalzemeKaydi> Kartlar = new List<MalzemeKaydi>();
        public List<Tuple<HizmetKaydi, int>> Hizmetler = new List<Tuple<HizmetKaydi, int>>();
        public List<Fis> Fisler = new List<Fis>();
        public List<Karsilama> Pegler = new List<Karsilama>();
        public Dictionary<string, int> CariKartlari = new Dictionary<string, int>();
        public Dictionary<string, string> CrmMusterileri = new Dictionary<string, string>();
        public List<KodAd> Birimler = new List<KodAd>();
        public List<MalKabulSatiri> MalKabulSatirlari = new List<MalKabulSatiri>();
        public List<StokToplami> Stoklar = new List<StokToplami>();
        // 2961-D4: malzeme kaydına göre hareket ve alış satırları (Tuple: malzeme kaydı, satır).
        public List<Tuple<int, MalzemeHareketi>> Hareketler = new List<Tuple<int, MalzemeHareketi>>();
        public List<Tuple<int, AlisFiyati>> AlisSatirlari = new List<Tuple<int, AlisFiyati>>();
        public List<CariKaydi> CariDetaylari = new List<CariKaydi>();
        public Dictionary<int, List<FaturaOzeti>> FaturaListesi = new Dictionary<int, List<FaturaOzeti>>();

        public List<string> Cagrilar = new List<string>();
        public string SonXml;
        public AlanListesi SonBaslik, SonSon;
        public List<AlanListesi> SonSatirlar;
        public bool BaglantiYok, Kopsun, SatirlariDusur;
        int sonRef = 1000;

        public SahteLogo()
        {
            foreach (var b in new[] { "05", "06", "07" })
            {
                var k = new KodAd();
                k.Kod = b;
                k.Ad = b;
                Birimler.Add(k);
            }
        }

        int YeniRef() { return ++sonRef; }

        void Giris()
        {
            if (BaglantiYok) throw new LogoBaglanamadi("Logo UserLogin false: [code=-93] Kullanıcı sayısı limiti aşılmıştır");
            if (Kopsun) throw new LogoOturumKoptu("Logo çağrısı sırasında COM hatası; işlendiği bilinmiyor.", null);
        }

        public MalzemeKaydi KartEkle(string kod)
        {
            var k = new MalzemeKaydi();
            k.Ref = YeniRef();
            k.Kod = kod;
            k.Ad = kod;
            k.KartTuru = 10;
            k.BirimSeti = "05";
            Kartlar.Add(k);
            return k;
        }

        public void HizmetEkle(string kod, int tur)
        {
            var h = new HizmetKaydi();
            h.Ref = YeniRef();
            h.Kod = kod;
            h.Ad = kod;
            Hizmetler.Add(Tuple.Create(h, tur));
        }

        public void CariEkle(string kod, bool crm)
        {
            CariKartlari[kod] = YeniRef();
            if (crm) CrmMusterileri[kod] = "CRM-" + kod;
        }

        static decimal D(string m) { return decimal.Parse(m, NumberStyles.Number, CultureInfo.InvariantCulture); }
        static int I(string m) { return int.Parse(m, CultureInfo.InvariantCulture); }
        static decimal D(object o) { return Convert.ToDecimal(o, CultureInfo.InvariantCulture); }
        static int I(object o) { return Convert.ToInt32(o, CultureInfo.InvariantCulture); }
        static DateTime LogoTarihi(object o) { return DateTime.ParseExact(Convert.ToString(o, CultureInfo.InvariantCulture), "dd.MM.yyyy", CultureInfo.InvariantCulture); }

        // 2987: satın alma siparişi satırının okunan alanları (XML ya da Logo Objects alanı; gelmeyen alan değişmez).
        static void SiparisSatiriYaz(Satir x, Func<string, object> al)
        {
            object v;
            if ((v = al("PRICE")) != null) x.Fiyat = D(v);
            if ((v = al("EDT_PRICE")) != null) x.DovizFiyati = D(v);
            if ((v = al("VAT_RATE")) != null) x.Kdv = D(v);
            if ((v = al("UNIT_CODE")) != null) x.Birim = Convert.ToString(v, CultureInfo.InvariantCulture);
            if ((v = al("DUE_DATE")) != null) x.Termin = LogoTarihi(v);
            if ((v = al("TRANS_DESCRIPTION")) != null) x.Aciklama = Convert.ToString(v, CultureInfo.InvariantCulture);
        }

        static Func<string, object> Sozlukten(Dictionary<string, string> d) { return k => { string m; return d.TryGetValue(k, out m) ? m : null; }; }
        static Func<string, object> Alanlardan(AlanListesi a) { return k => a.Var(k) ? a.Deger(k) : null; }

        static Dictionary<string, string> Cocuklar(XmlElement e)
        {
            var d = new Dictionary<string, string>();
            foreach (XmlNode n in e.ChildNodes) if (n is XmlElement) d[n.Name] = n.InnerText;
            return d;
        }

        public LogoHatasi XmlEkle(int nesne, string kok, string xml)
        {
            Giris();
            SonXml = xml;
            Cagrilar.Add("XmlEkle " + nesne + " " + kok);
            var doc = new XmlDocument();
            doc.LoadXml(xml);
            if (doc.DocumentElement.Name != kok) return new LogoHatasi(14, "kök");
            var oge = (XmlElement)doc.DocumentElement.FirstChild;
            if (oge.GetAttribute("DBOP") != "INS") return new LogoHatasi(0, "duplicate key");
            foreach (XmlNode n in oge.ChildNodes)
            {
                if (!(n is XmlElement)) continue;
                if (!XmlBaslik[kok].Contains(n.Name)) return new LogoHatasi(14, "Bilinmeyen etiket " + n.Name);
                if (n.Name == "TRANSACTIONS")
                    foreach (XmlNode t in n.ChildNodes)
                        foreach (XmlNode a in t.ChildNodes)
                            if (a is XmlElement && !XmlSatir[kok].Contains(a.Name)) return new LogoHatasi(14, "Bilinmeyen etiket " + a.Name);
            }
            var b = Cocuklar(oge);
            var satirlar = new List<Dictionary<string, string>>();
            var tr = oge["TRANSACTIONS"];
            if (tr != null) foreach (XmlNode t in tr.ChildNodes) if (t is XmlElement) satirlar.Add(Cocuklar((XmlElement)t));

            if (kok == "ITEMS")
            {
                if (Kartlar.Any(x => x.Kod == b["CODE"])) return new LogoHatasi(0, "duplicate key");
                if (!Birimler.Any(x => x.Kod == b["UNITSET_CODE"])) return new LogoHatasi(0, "");
                var k = new MalzemeKaydi();
                k.Ref = YeniRef();
                k.Kod = b["CODE"];
                k.Ad = b["NAME"];
                k.KartTuru = I(b["CARD_TYPE"]);
                k.OzelKod = b["AUXIL_CODE"];
                k.BirimSeti = b["UNITSET_CODE"];
                string m;
                k.Aciklama2 = b.TryGetValue("NAME3", out m) ? m : null;
                k.Aciklama3 = b.TryGetValue("NAME4", out m) ? m : null;
                Kartlar.Add(k);
                return null;
            }
            if (kok == "PURCHASE_SERVICES" || kok == "SALES_SERVICES")
            {
                var h = new HizmetKaydi();
                h.Ref = YeniRef();
                h.Kod = b["CODE"];
                h.Ad = b["DESCRIPTION"];
                Hizmetler.Add(Tuple.Create(h, I(b["CARD_TYPE"])));
                return null;
            }
            var f = new Fis();
            f.Ref = YeniRef();
            f.Nesne = nesne;
            f.No = b["NUMBER"];
            if (kok == "PURCHASE_ORDERS")
            {
                if (Fisler.Any(x => x.Nesne == nesne && x.No == f.No)) return new LogoHatasi(0, "duplicate key");
                if (!CariKartlari.ContainsKey(b["ARP_CODE"])) return new LogoHatasi(0, "");
                f.Trcode = 2;
                f.Cari = b["ARP_CODE"];
                f.Durum = I(b["ORDER_STATUS"]);
                string c;
                f.DovizTuru = b.TryGetValue("CURR_TRANSACTIN", out c) ? I(c) : 0;
                f.Kur = b.TryGetValue("TC_RATE", out c) ? D(c) : 0;
                f.Tarih = LogoTarihi(b["DATE"]);
                foreach (var s in satirlar)
                {
                    var x = new Satir();
                    x.Ref = YeniRef();
                    x.Tur = I(s["TYPE"]);
                    x.Kod = s["MASTER_CODE"];
                    x.Miktar = D(s["QUANTITY"]);
                    SiparisSatiriYaz(x, Sozlukten(s));
                    x.Ust = f;
                    f.Net += x.Miktar * x.Fiyat;
                    f.Satirlar.Add(x);
                }
            }
            else if (kok == "DEMAND_FICHES")
            {
                f.Trcode = 0;
                f.Durum = I(b["STATUS"]);
                foreach (var s in satirlar)
                {
                    var x = new Satir();
                    x.Ref = YeniRef();
                    x.Kod = s["ITEM_CODE"];
                    x.Miktar = D(s["AMOUNT"]);
                    x.Durum = I(s["STATUS"]);
                    x.Ust = f;
                    f.Satirlar.Add(x);
                }
            }
            else if (kok == "MATERIAL_SLIPS")
            {
                f.Trcode = I(b["TYPE"]);
                foreach (var s in satirlar)
                {
                    var x = new Satir();
                    x.Ref = YeniRef();
                    x.Kod = s["ITEM_CODE"];
                    x.Miktar = D(s["QUANTITY"]);
                    x.Ust = f;
                    f.Satirlar.Add(x);
                }
            }
            if (SatirlariDusur) f.Satirlar.Clear();
            Fisler.Add(f);
            return null;
        }

        static LogoHatasi AlanDenetle(HashSet<string> izinli, AlanListesi a)
        {
            foreach (var x in a) if (!izinli.Contains(x.Key)) return new LogoHatasi(14, "Alan yok: " + x.Key + " (Post edilmedi)");
            return null;
        }

        public LogoHatasi AlanlaEkle(int nesne, AlanListesi baslik, List<AlanListesi> satirlar, AlanListesi son, out int yeniRef)
        {
            Giris();
            yeniRef = 0;
            SonBaslik = baslik;
            SonSatirlar = satirlar;
            SonSon = son;
            Cagrilar.Add("AlanlaEkle " + nesne);
            var h = AlanDenetle(AlanBaslik[nesne], baslik) ?? AlanDenetle(AlanBaslik[nesne], son);
            if (h != null) return h;
            if (satirlar.Count > 0)
                foreach (var s in satirlar)
                {
                    h = AlanDenetle(AlanSatir[nesne], s);
                    if (h != null) return h;
                }

            if (nesne == Nesne.TalepKarsilama)
            {
                var talep = TumSatirlar().FirstOrDefault(x => x.Ref == I(baslik.Deger("DEMAND_REFERENCE")) && x.Ust.Nesne == Nesne.TalepFisi);
                var siparis = TumSatirlar().FirstOrDefault(x => x.Ref == I(baslik.Deger("CHILD_REFERENCE")) && x.Ust.Nesne == Nesne.SatinAlmaSiparisi);
                if (talep == null || siparis == null || talep.Ust.Durum != 1) return new LogoHatasi(0, "");
                var p = new Karsilama();
                p.Ref = YeniRef();
                p.TalepSatirRef = talep.Ref;
                p.SiparisSatirRef = siparis.Ref;
                p.Miktar = D(baslik.Deger("MEET_AMNT"));
                Pegler.Add(p);
                talep.Karsilanan += p.Miktar;
                talep.Durum = talep.Karsilanan >= talep.Miktar ? 3 : 2;
                yeniRef = p.Ref;
                return null;
            }

            var f = new Fis();
            f.Ref = YeniRef();
            f.Nesne = nesne;
            var toplamSifir = false;
            if (nesne == Nesne.SatisTeklifi)
            {
                if (!baslik.Var("SLSCUSTCODE")) return new LogoHatasi(0, "validate 4208");
                f.Trcode = I(baslik.Deger("TRCODE"));
                f.No = (string)baslik.Deger("FICHENO");
                f.Cari = (string)baslik.Deger("ARP_CODE");
                f.Durum = I(baslik.Deger("STATUS"));
                f.DovizTuru = baslik.Var("TRCURR") ? I(baslik.Deger("TRCURR")) : 0;
                f.Kur = baslik.Var("TRRATE") ? D(baslik.Deger("TRRATE")) : 0;
                toplamSifir = baslik.Var("ALTNR") || baslik.Var("LASTREVISION") || satirlar.Any(s => s.Var("STATUS"));
                foreach (var s in satirlar)
                {
                    var x = new Satir();
                    x.Ref = YeniRef();
                    x.Tur = I(s.Deger("TYPE"));
                    x.Kod = (string)s.Deger("MASTER_CODE");
                    x.Miktar = D(s.Deger("QUANTITY"));
                    x.Fiyat = D(s.Deger("PRICE"));
                    x.Kdv = s.Var("VAT") ? D(s.Deger("VAT")) : 0;
                    x.Iskonto = s.Var("DISCPER") ? D(s.Deger("DISCPER")) : 0;
                    x.Birim = (string)s.Deger("UEDIT");
                    x.DovizTuru = s.Var("EDT_CURR") ? I(s.Deger("EDT_CURR")) : 0;
                    x.DovizFiyati = s.Var("EDT_PRICE") ? D(s.Deger("EDT_PRICE")) : 0;
                    x.Ust = f;
                    f.Satirlar.Add(x);
                    f.Net += x.Miktar * x.Fiyat * (100 - x.Iskonto) / 100;
                }
            }
            else if (nesne == Nesne.SatisSiparisi)
            {
                f.Trcode = 1;
                f.No = (string)baslik.Deger("NUMBER");
                f.Cari = (string)baslik.Deger("ARP_CODE");
                f.Durum = I(baslik.Deger("ORDER_STATUS"));
                var dusur = baslik.Var("OFFER_REFERENCE");
                if (!dusur)
                    foreach (var s in satirlar)
                    {
                        var x = new Satir();
                        x.Ref = YeniRef();
                        x.Tur = I(s.Deger("TYPE"));
                        x.Kod = (string)s.Deger("MASTER_CODE");
                        x.Miktar = D(s.Deger("QUANTITY"));
                        x.TeklifSatirRef = s.Var("OFFTRANSREF") ? I(s.Deger("OFFTRANSREF")) : 0;
                        x.Ust = f;
                        f.Satirlar.Add(x);
                        var ts = TumSatirlar().FirstOrDefault(y => y.Ref == x.TeklifSatirRef && y.Ust.Nesne == Nesne.SatisTeklifi);
                        if (ts != null) ts.SipariseDonen += x.Miktar;
                    }
            }
            if (toplamSifir) f.Net = 0;
            if (SatirlariDusur) f.Satirlar.Clear();
            Fisler.Add(f);
            yeniRef = f.Ref;
            return null;
        }

        IEnumerable<Satir> TumSatirlar()
        {
            return Fisler.SelectMany(x => x.Satirlar);
        }

        public LogoHatasi Guncelle(int nesne, int kayit, AlanListesi baslik, Dictionary<int, AlanListesi> satirlar, List<AlanListesi> yeniSatirlar)
        {
            Giris();
            Cagrilar.Add("Guncelle " + nesne + " " + kayit + " " + string.Join(",", baslik.Select(a => a.Key + "=" + Convert.ToString(a.Value, CultureInfo.InvariantCulture)).ToArray()));
            var h = AlanDenetle(AlanBaslik[nesne], baslik);
            if (h != null) return h;
            foreach (var s in satirlar.Values.Concat(yeniSatirlar))
            {
                h = AlanDenetle(AlanSatir[nesne], s);
                if (h != null) return h;
            }
            if (nesne == Nesne.Malzeme)
            {
                var k = Kartlar.FirstOrDefault(x => x.Ref == kayit);
                if (k == null) return new LogoHatasi(-1, "Read false");
                if (baslik.Var("NAME")) k.Ad = (string)baslik.Deger("NAME");
                if (baslik.Var("ACTIVE")) k.Pasif = I(baslik.Deger("ACTIVE")) == 1;
                return null;
            }
            if (nesne == Nesne.AlinanHizmet || nesne == Nesne.VerilenHizmet)
            {
                var tur = nesne == Nesne.AlinanHizmet ? 1 : 2;
                var k = Hizmetler.FirstOrDefault(x => x.Item1.Ref == kayit && x.Item2 == tur);
                if (k == null) return new LogoHatasi(-1, "Read false");
                if (baslik.Var("DESCRIPTION")) k.Item1.Ad = (string)baslik.Deger("DESCRIPTION");
                if (baslik.Var("ACTIVE")) k.Item1.Pasif = I(baslik.Deger("ACTIVE")) == 1;
                return null;
            }
            if (nesne == Nesne.TalepKarsilama)
            {
                var p = Pegler.FirstOrDefault(x => x.Ref == kayit);
                if (p == null) return new LogoHatasi(-1, "Read false");
                var yeni = D(baslik.Deger("MEET_AMNT"));
                var talep = TumSatirlar().First(x => x.Ref == p.TalepSatirRef && x.Ust.Nesne == Nesne.TalepFisi);
                talep.Karsilanan += yeni - p.Miktar;
                talep.Durum = talep.Karsilanan == 0 ? 1 : talep.Karsilanan >= talep.Miktar ? 3 : 2;
                p.Miktar = yeni;
                return null;
            }
            var f = Fisler.FirstOrDefault(x => x.Ref == kayit && x.Nesne == nesne);
            if (f == null) return new LogoHatasi(-1, "Read false");
            var eslenen = f.Satirlar.Count(x => satirlar.ContainsKey(x.Ref));
            if (eslenen != satirlar.Count) return new LogoHatasi(-1, "eşlenemedi");
            if (baslik.Var("ORDER_STATUS")) f.Durum = I(baslik.Deger("ORDER_STATUS"));
            if (baslik.Var("STATUS")) f.Durum = I(baslik.Deger("STATUS"));
            if (baslik.Var("CANCELLED")) f.Iptal = I(baslik.Deger("CANCELLED")) == 1;
            var siparis = nesne == Nesne.SatinAlmaSiparisi;
            if (siparis && baslik.Var("DATE")) f.Tarih = LogoTarihi(baslik.Deger("DATE"));
            foreach (var x in f.Satirlar)
            {
                AlanListesi a;
                if (!satirlar.TryGetValue(x.Ref, out a)) continue;
                if (a.Var("ORDER_CLOSED")) x.Kapali = I(a.Deger("ORDER_CLOSED")) == 1;
                if (a.Var("QUANTITY")) x.Miktar = D(a.Deger("QUANTITY"));
                if (a.Var("MASTER_CODE")) x.Kod = (string)a.Deger("MASTER_CODE");
                if (siparis) SiparisSatiriYaz(x, Alanlardan(a));
            }
            foreach (var a in yeniSatirlar)
            {
                var x = new Satir();
                x.Ref = YeniRef();
                x.Tur = I(a.Deger("TYPE"));
                x.Kod = (string)a.Deger("MASTER_CODE");
                x.Miktar = D(a.Deger("QUANTITY"));
                if (siparis) SiparisSatiriYaz(x, Alanlardan(a));
                x.Ust = f;
                f.Satirlar.Add(x);
            }
            return null;
        }

        public LogoHatasi Sil(int nesne, int kayit)
        {
            Giris();
            Cagrilar.Add("Sil " + nesne + " " + kayit);
            if (nesne == Nesne.TalepKarsilama)
            {
                // Tuzak: karşılamayı silmek talep satırını geri almaz (MEETAMNT kalır).
                return Pegler.RemoveAll(x => x.Ref == kayit) == 1 ? null : new LogoHatasi(-1, "Delete false");
            }
            if (nesne == Nesne.Malzeme) return Kartlar.RemoveAll(x => x.Ref == kayit) == 1 ? null : new LogoHatasi(-1, "Delete false");
            return Fisler.RemoveAll(x => x.Ref == kayit && x.Nesne == nesne) == 1 ? null : new LogoHatasi(-1, "Delete false");
        }

        public List<int> SatirRefleri(int nesne, int kayit)
        {
            Giris();
            var f = Fisler.FirstOrDefault(x => x.Ref == kayit && x.Nesne == nesne);
            return f == null ? null : f.Satirlar.Select(x => x.Ref).ToList();
        }

        public string DisaAktar(int nesne, int kayit, string kok) { return "<" + kok + "/>"; }
        public List<string> AlanDokumu(int nesne, int kayit) { return new List<string>(); }

        /* ---------------- ILogoOkuma ---------------- */

        public int MalzemeRef(string kod) { var k = Malzeme(kod); return k == null ? 0 : k.Ref; }
        public MalzemeKaydi Malzeme(string kod) { return Kartlar.FirstOrDefault(x => x.Kod == kod); }
        public MalzemeKaydi MalzemeRefIle(int kayit) { return Kartlar.FirstOrDefault(x => x.Ref == kayit); }

        public HizmetKaydi HizmetRefIle(int kayit, int kartTuru)
        {
            var h = Hizmetler.FirstOrDefault(x => x.Item1.Ref == kayit && x.Item2 == kartTuru);
            return h == null ? null : h.Item1;
        }

        public List<string> MalzemeKodlari() { return Kartlar.Select(x => x.Kod).OrderBy(x => x, StringComparer.Ordinal).ToList(); }
        public List<KodAd> BirimSetleri() { return Birimler; }

        public List<MalzemeKaydi> MalzemeKartlari(int sonGorulen, int enCok)
        {
            return Kartlar.Where(x => x.Ref > sonGorulen).OrderBy(x => x.Ref).Take(enCok).ToList();
        }

        public List<MalzemeHareketi> MalzemeHareketleri(int malzemeRef, int sonGorulen, int enCok)
        {
            return Hareketler.Where(x => x.Item1 == malzemeRef && x.Item2.Ref > sonGorulen).Select(x => x.Item2).OrderBy(x => x.Ref).Take(enCok).ToList();
        }

        public List<AlisFiyati> SonAlisFiyatlari(int malzemeRef, int enCok)
        {
            return AlisSatirlari.Where(x => x.Item1 == malzemeRef).Select(x => x.Item2).OrderByDescending(x => x.Tarih).ThenByDescending(x => x.Ref).Take(enCok).ToList();
        }

        public List<StokToplami> StokToplamlari(int sonGorulen, int enCok)
        {
            var refler = new HashSet<int>(MalzemeKartlari(sonGorulen, enCok).Select(x => x.Ref));
            return Stoklar.Where(x => refler.Contains(x.MalzemeRef) && x.AmbarNo >= 0).OrderBy(x => x.MalzemeRef).ThenBy(x => x.AmbarNo).ToList();
        }

        public List<CariKaydi> CariAra(string metin, int enCok)
        {
            Func<string, bool> icinde = a => a != null && a.IndexOf(metin, StringComparison.OrdinalIgnoreCase) >= 0;
            return CariDetaylari.Where(c => !c.Pasif && (icinde(c.Kod) || icinde(c.Ad) || c.VergiNo == metin || c.TcNo == metin))
                .OrderBy(c => c.Kod, StringComparer.Ordinal).Take(enCok).ToList();
        }

        public CariKaydi Cari(string kod) { return CariDetaylari.FirstOrDefault(c => c.Kod == kod); }

        public List<KodAd> Ambarlar()
        {
            var k = new KodAd();
            k.Kod = "0";
            k.Ad = "Merkez";
            return new List<KodAd> { k };
        }

        public List<KodAd> Cariler()
        {
            return CariKartlari.Keys.Select(x => { var k = new KodAd(); k.Kod = x; k.Ad = x; return k; }).ToList();
        }

        public int CariRef(string kod) { int r; return CariKartlari.TryGetValue(kod, out r) ? r : 0; }

        public HizmetKaydi Hizmet(string kod, int kartTuru)
        {
            var h = Hizmetler.FirstOrDefault(x => x.Item1.Kod == kod && x.Item2 == kartTuru);
            return h == null ? null : h.Item1;
        }

        static FisBasligi Baslik(Fis f)
        {
            if (f == null) return null;
            var b = new FisBasligi();
            b.Ref = f.Ref;
            b.No = f.No;
            b.Durum = f.Durum;
            b.Iptal = f.Iptal;
            b.CariKod = f.Cari;
            b.NetToplam = f.Net;
            b.DovizTuru = f.DovizTuru;
            b.Kur = f.Kur;
            return b;
        }

        static int SiparisNesnesi(int trcode) { return trcode == 2 ? Nesne.SatinAlmaSiparisi : Nesne.SatisSiparisi; }

        public FisBasligi Siparis(string no, int trcode) { return Baslik(Fisler.FirstOrDefault(x => x.Nesne == SiparisNesnesi(trcode) && x.No == no)); }
        public FisBasligi SiparisRefIle(int kayit, int trcode) { return Baslik(Fisler.FirstOrDefault(x => x.Nesne == SiparisNesnesi(trcode) && x.Ref == kayit)); }

        static FisSatiri Satiri(Satir s)
        {
            var x = new FisSatiri();
            x.Ref = s.Ref;
            x.SatirTuru = s.Tur;
            x.Kod = s.Kod;
            x.Miktar = s.Miktar;
            x.Kapali = s.Kapali;
            x.TeklifSatirRef = s.TeklifSatirRef;
            return x;
        }

        public List<FisSatiri> SiparisSatirlari(int fisRef)
        {
            var f = Fisler.FirstOrDefault(x => x.Ref == fisRef);
            return f == null ? new List<FisSatiri>() : f.Satirlar.Select(Satiri).ToList();
        }

        public SiparisIcerigi SatinAlmaSiparisiIcerigi(string no)
        {
            Cagrilar.Add("SiparisIcerigi " + no);
            var bulunan = Fisler.Where(x => x.Nesne == Nesne.SatinAlmaSiparisi && x.No == no).ToList();
            if (bulunan.Count == 0) return null;
            if (bulunan.Count > 1) throw new BirdenCokKayit(no);
            var f = bulunan[0];
            var b = new SiparisIcerigi();
            b.Ref = f.Ref;
            b.No = f.No;
            b.Tarih = f.Tarih;
            b.CariKod = f.Cari;
            b.DovizTuru = f.DovizTuru;
            b.Kur = f.Kur;
            b.Durum = f.Durum;
            b.Iptal = f.Iptal;
            foreach (var s in f.Satirlar)
            {
                var r = new SiparisIcerikSatiri();
                r.Ref = s.Ref;
                r.SatirTuru = s.Tur;
                r.Kod = s.Kod;
                if (s.Tur == 4)
                {
                    var h = Hizmetler.FirstOrDefault(x => x.Item1.Kod == s.Kod && x.Item2 == 1);
                    r.Ad = h == null ? null : h.Item1.Ad;
                }
                else
                {
                    var k = Kartlar.FirstOrDefault(x => x.Kod == s.Kod);
                    r.Ad = k == null ? null : k.Ad;
                }
                r.Miktar = s.Miktar;
                r.Birim = s.Birim;
                r.Fiyat = s.Fiyat;
                r.DovizFiyati = s.DovizFiyati;
                r.Kdv = s.Kdv;
                r.Termin = s.Termin;
                r.Aciklama = s.Aciklama;
                r.Kapali = s.Kapali;
                b.Satirlar.Add(r);
            }
            return b;
        }

        public List<MalKabulSatiri> MalKabul(int sonGorulen, int enCok)
        {
            return MalKabulSatirlari.Where(x => x.Ref > sonGorulen).OrderBy(x => x.Ref).Take(enCok).ToList();
        }

        public List<FaturaOzeti> Faturalar(int siparisRef)
        {
            List<FaturaOzeti> l;
            return FaturaListesi.TryGetValue(siparisRef, out l) ? l : new List<FaturaOzeti>();
        }

        public FisBasligi Talep(string no) { return Baslik(Fisler.FirstOrDefault(x => x.Nesne == Nesne.TalepFisi && x.No == no)); }

        public List<TalepSatiri> TalepSatirlari(List<int> satirRefleri)
        {
            var l = new List<TalepSatiri>();
            foreach (var r in satirRefleri)
            {
                var s = TumSatirlar().FirstOrDefault(x => x.Ref == r && x.Ust.Nesne == Nesne.TalepFisi);
                if (s == null) continue;
                var t = new TalepSatiri();
                t.Ref = s.Ref;
                t.Durum = s.Durum;
                t.Miktar = s.Miktar;
                t.Karsilanan = s.Karsilanan;
                l.Add(t);
            }
            return l;
        }

        public List<Karsilama> Karsilamalar(int siparisRef)
        {
            var f = Fisler.FirstOrDefault(x => x.Ref == siparisRef);
            if (f == null) return new List<Karsilama>();
            var satirlar = new HashSet<int>(f.Satirlar.Select(x => x.Ref));
            return Pegler.Where(x => satirlar.Contains(x.SiparisSatirRef)).ToList();
        }

        public Karsilama KarsilamaBul(int talepSatirRef, int siparisSatirRef)
        {
            return Pegler.FirstOrDefault(x => x.TalepSatirRef == talepSatirRef && x.SiparisSatirRef == siparisSatirRef);
        }

        public string SatisMusterisiKodu(string cariKod) { string k; return CrmMusterileri.TryGetValue(cariKod, out k) ? k : null; }
        public FisBasligi Teklif(string no) { return Baslik(Fisler.FirstOrDefault(x => x.Nesne == Nesne.SatisTeklifi && x.Trcode == 1 && x.No == no)); }
        public FisBasligi TeklifRefIle(int kayit) { return Baslik(Fisler.FirstOrDefault(x => x.Nesne == Nesne.SatisTeklifi && x.Trcode == 1 && x.Ref == kayit)); }

        public List<TeklifSatiri> TeklifSatirlari(int teklifRef)
        {
            var f = Fisler.FirstOrDefault(x => x.Nesne == Nesne.SatisTeklifi && x.Ref == teklifRef);
            if (f == null) return new List<TeklifSatiri>();
            return f.Satirlar.Select(s =>
            {
                var t = new TeklifSatiri();
                t.Ref = s.Ref;
                t.SatirTuru = s.Tur;
                t.Kod = s.Kod;
                t.Miktar = s.Miktar;
                t.Fiyat = s.Fiyat;
                t.Kdv = s.Kdv;
                t.Iskonto = s.Iskonto;
                t.Birim = s.Birim;
                t.SipariseDonen = s.SipariseDonen;
                t.DovizTuru = s.DovizTuru;
                t.DovizFiyati = s.DovizFiyati;
                return t;
            }).ToList();
        }

        public FisBasligi MalzemeFisi(string no, int trcode) { return Baslik(Fisler.FirstOrDefault(x => x.Nesne == Nesne.MalzemeFisi && x.Trcode == trcode && x.No == no)); }

        public List<FisSatiri> MalzemeFisiSatirlari(int fisRef) { return SiparisSatirlari(fisRef); }
    }
}
