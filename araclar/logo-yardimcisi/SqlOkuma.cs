using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using System.Text.RegularExpressions;

namespace LogoYardimcisi
{
    // Bütün SQL metni burada; yalnız SELECT (rehber §0 kural 1: Logo tablolarına SQL ile yazılmaz).
    // Tablo adı kalıbı firma bazlı LG_<firma>_<tablo>, dönem bazlı LG_<firma>_<dönem>_<tablo> (rehber §1.2); firma ve dönem ayardan gelir.
    // Kolon adları rehberin veri sözlüğündendir (§2); sözlükte olmayanlar Sorgular.Dogrulanmadi'da listelenir ve --deneme ile denetlenir.
    public sealed class Sorgular
    {
        public readonly string MalzemeRef, Malzeme, MalzemeRefIle, HizmetRefIle, MalzemeKodlari, MalzemeKartlari, StokToplamlari, CariAra, Cari, BirimSetleri, Ambarlar, Cariler, CariRef, Hizmet, Siparis, SiparisRefIle, SiparisSatirlari,
            MalKabul, Faturalar, Talep, TalepSatirlari, Karsilamalar, KarsilamaBul, SatisMusterisi, Teklif, TeklifRefIle, TeklifSatirlari,
            MalzemeFisi, MalzemeFisiSatirlari, MalzemeHareketleri, SonAlisFiyatlari;

        // Rehberde kolon olarak geçmeyen, Logo'nun genel adlandırmasından alınanlar (VARSAYIM).
        public static readonly string[] Dogrulanmadi =
        {
            "LG_<f>_SRVCARD.CARDTYPE (1 alınan, 2 verilen)", "LG_<f>_<d>_STLINE.IOCODE, LINETYPE, STOCKREF, UOMREF", "LG_<f>_<d>_DEMANDLINE.LOGICALREF ile satır okuma",
            "LG_<f>_PURCHOFFER.CLIENTREF, NETTOTAL, TRCURR, TRRATE", "LG_<f>_PURCHOFFERLN.STOCKREF, LINETYPE, AMOUNT, PRICE, UOMREF",
            "LG_<f>_ITEMS.ACTIVE (0 kullanımda)", "LG_<f>_<d>_GNTOTST.STOCKREF, INVENNO (-1 bütün ambarların toplamı), ONHAND",
            "LG_<f>_CLCARD.CARDTYPE, TAXNR, TCKNO, TAXOFFICE, ADDR1, ADDR2, TOWN, CITY, POSTCODE, TELNRS1, EMAILADDR",
            "LG_<f>_SRVCARD.ACTIVE (0 kullanımda) ve Logo Objects ACTIVE alanı (malzeme ve hizmet kartı) kart pasife almada",
            "LG_<f>_<d>_STLINE.DATE_, TRCODE (1 alış), IOCODE (1, 2 giriş; 3, 4 çıkış), CANCELLED, SOURCEINDEX, PRICE, PRCURR, PRPRICE, CLIENTREF (2961-D4 okumaları)",
        };

        public Sorgular(int firma, int donem)
        {
            Func<string, string> f = t => "LG_" + firma.ToString("000", CultureInfo.InvariantCulture) + "_" + t;
            Func<string, string> d = t => "LG_" + firma.ToString("000", CultureInfo.InvariantCulture) + "_" + donem.ToString("00", CultureInfo.InvariantCulture) + "_" + t;
            var satirKodu = "CASE WHEN L.LINETYPE = 4 THEN S.CODE ELSE I.CODE END";
            var kodBirlesimi = " LEFT JOIN " + f("ITEMS") + " I ON I.LOGICALREF = L.STOCKREF LEFT JOIN " + f("SRVCARD") + " S ON S.LOGICALREF = L.STOCKREF";

            MalzemeRef = "SELECT LOGICALREF FROM " + f("ITEMS") + " WHERE CODE = @kod";
            var malzemeAlanlari = "SELECT I.LOGICALREF, I.CODE, I.NAME, I.CARDTYPE, I.SPECODE, I.NAME3, I.NAME4, U.CODE, I.ACTIVE FROM " + f("ITEMS") + " I LEFT JOIN "
                + f("UNITSETF") + " U ON U.LOGICALREF = I.UNITSETREF WHERE ";
            Malzeme = malzemeAlanlari + "I.CODE = @kod";
            MalzemeRefIle = malzemeAlanlari + "I.LOGICALREF = @ref";
            MalzemeKodlari = "SELECT CODE FROM " + f("ITEMS") + " ORDER BY CODE";
            MalzemeKartlari = "SELECT TOP (@enCok) I.LOGICALREF, I.CODE, I.NAME, I.CARDTYPE, I.SPECODE, I.NAME3, I.NAME4, U.CODE, I.ACTIVE FROM " + f("ITEMS") + " I LEFT JOIN "
                + f("UNITSETF") + " U ON U.LOGICALREF = I.UNITSETREF WHERE I.LOGICALREF > @son ORDER BY I.LOGICALREF";
            StokToplamlari = "SELECT T.STOCKREF, I.CODE, T.INVENNO, T.ONHAND FROM " + d("GNTOTST") + " T JOIN " + f("ITEMS") + " I ON I.LOGICALREF = T.STOCKREF"
                + " WHERE T.INVENNO >= 0 AND T.STOCKREF IN (SELECT TOP (@enCok) LOGICALREF FROM " + f("ITEMS") + " WHERE LOGICALREF > @son ORDER BY LOGICALREF)"
                + " ORDER BY T.STOCKREF, T.INVENNO";
            var cariAlanlari = "SELECT TOP (@enCok) LOGICALREF, CODE, DEFINITION_, CARDTYPE, TAXNR, TCKNO, TAXOFFICE, ADDR1, ADDR2, TOWN, CITY, POSTCODE, TELNRS1, EMAILADDR, ACTIVE FROM "
                + f("CLCARD");
            // LIKE deseni parametredir; %, _ ve [ yardımcıda kaçırılır (SqlOkuma.Desen).
            CariAra = cariAlanlari + " WHERE ACTIVE = 0 AND (CODE LIKE @desen ESCAPE '\\' OR DEFINITION_ LIKE @desen ESCAPE '\\' OR TAXNR = @tam OR TCKNO = @tam) ORDER BY CODE";
            Cari = cariAlanlari + " WHERE CODE = @kod";
            BirimSetleri = "SELECT CODE, NAME FROM " + f("UNITSETF") + " ORDER BY CODE";
            Ambarlar = "SELECT NR, NAME FROM L_CAPIWHOUSE WHERE FIRMNR = @firma ORDER BY NR";
            Cariler = "SELECT CODE, DEFINITION_ FROM " + f("CLCARD") + " WHERE ACTIVE = 0 ORDER BY CODE";
            CariRef = "SELECT LOGICALREF FROM " + f("CLCARD") + " WHERE CODE = @kod";
            Hizmet = "SELECT LOGICALREF, CODE, DEFINITION_, ACTIVE FROM " + f("SRVCARD") + " WHERE CODE = @kod AND CARDTYPE = @tur";
            HizmetRefIle = "SELECT LOGICALREF, CODE, DEFINITION_, ACTIVE FROM " + f("SRVCARD") + " WHERE LOGICALREF = @ref AND CARDTYPE = @tur";
            var siparisBasligi = "SELECT O.LOGICALREF, O.FICHENO, O.STATUS, O.CANCELLED, C.CODE, O.NETTOTAL, O.TRCURR, O.TRRATE FROM " + d("ORFICHE")
                + " O LEFT JOIN " + f("CLCARD") + " C ON C.LOGICALREF = O.CLIENTREF WHERE O.TRCODE = @tr AND ";
            Siparis = siparisBasligi + "O.FICHENO = @no";
            SiparisRefIle = siparisBasligi + "O.LOGICALREF = @ref";
            SiparisSatirlari = "SELECT L.LOGICALREF, L.LINETYPE, " + satirKodu + ", L.AMOUNT, L.CLOSED, L.OFFTRANSREF FROM " + d("ORFLINE") + " L" + kodBirlesimi
                + " WHERE L.ORDFICHEREF = @ref ORDER BY L.LOGICALREF";
            MalKabul = "SELECT TOP (@enCok) L.LOGICALREF, L.ORDTRANSREF, L.ORDFICHEREF, F.FICHENO, I.CODE, L.AMOUNT, U.CODE FROM " + d("STLINE") + " L JOIN "
                + d("STFICHE") + " F ON F.LOGICALREF = L.STFICHEREF LEFT JOIN " + f("ITEMS") + " I ON I.LOGICALREF = L.STOCKREF LEFT JOIN " + f("UNITSETL")
                + " U ON U.LOGICALREF = L.UOMREF WHERE F.TRCODE = 1 AND L.IOCODE = 1 AND L.LINETYPE = 0 AND L.ORDTRANSREF > 0 AND L.LOGICALREF > @son ORDER BY L.LOGICALREF";
            Faturalar = "SELECT DISTINCT V.LOGICALREF, V.FICHENO FROM " + d("STLINE") + " L JOIN " + d("INVOICE")
                + " V ON V.LOGICALREF = L.INVOICEREF WHERE L.ORDFICHEREF = @ref AND L.INVOICEREF > 0 ORDER BY V.LOGICALREF";
            Talep = "SELECT LOGICALREF, FICHENO, STATUS FROM " + d("DEMANDFICHE") + " WHERE FICHENO = @no";
            TalepSatirlari = "SELECT LOGICALREF, STATUS, AMOUNT, MEETAMNT FROM " + d("DEMANDLINE") + " WHERE LOGICALREF IN ({0})";
            var karsilama = "SELECT P.LOGICALREF, P.CHILDREF, P.DEMANDLINEREF, P.MEETAMNT FROM " + d("DEMANDPEGGING") + " P ";
            Karsilamalar = karsilama + "JOIN " + d("ORFLINE") + " L ON L.LOGICALREF = P.CHILDREF WHERE P.LINETYPE = 4 AND L.ORDFICHEREF = @ref ORDER BY P.LOGICALREF";
            KarsilamaBul = karsilama + "WHERE P.LINETYPE = 4 AND P.DEMANDLINEREF = @talep AND P.CHILDREF = @siparis";
            SatisMusterisi = "SELECT TOP 1 S.CODE FROM LG_CVARPASG A JOIN LG_CSTVND S ON S.LOGICALREF = A.CSTVNDREF JOIN " + f("CLCARD")
                + " C ON C.LOGICALREF = A.ARPREF WHERE C.CODE = @kod AND A.FIRMNO = @firma";
            var teklifBasligi = "SELECT T.LOGICALREF, T.FICHENO, T.STATUS, C.CODE, T.NETTOTAL, T.TRCURR, T.TRRATE FROM " + f("PURCHOFFER") + " T LEFT JOIN "
                + f("CLCARD") + " C ON C.LOGICALREF = T.CLIENTREF WHERE T.TRCODE = 1 AND ";
            Teklif = teklifBasligi + "T.FICHENO = @no";
            TeklifRefIle = teklifBasligi + "T.LOGICALREF = @ref";
            TeklifSatirlari = "SELECT L.LOGICALREF, L.LINETYPE, " + satirKodu + ", L.AMOUNT, L.PRICE, L.VAT, L.DISCPER, U.CODE, L.ORDEREDAMOUNT, L.PRCURR, L.PRPRICE FROM "
                + f("PURCHOFFERLN") + " L" + kodBirlesimi + " LEFT JOIN " + f("UNITSETL") + " U ON U.LOGICALREF = L.UOMREF WHERE L.ORDFICHEREF = @ref ORDER BY L.LOGICALREF";
            MalzemeFisi = "SELECT LOGICALREF, FICHENO FROM " + d("STFICHE") + " WHERE FICHENO = @no AND TRCODE = @tr";
            // 2961-D4: iptal satır ve malzeme dışı satır (LINETYPE <> 0) gelmez; fişsiz satırın fiş numarası boş kalır.
            MalzemeHareketleri = "SELECT TOP (@enCok) L.LOGICALREF, L.DATE_, L.TRCODE, L.IOCODE, F.FICHENO, L.AMOUNT, L.SOURCEINDEX, U.CODE FROM " + d("STLINE") + " L LEFT JOIN "
                + d("STFICHE") + " F ON F.LOGICALREF = L.STFICHEREF LEFT JOIN " + f("UNITSETL") + " U ON U.LOGICALREF = L.UOMREF"
                + " WHERE L.STOCKREF = @malzeme AND L.LINETYPE = 0 AND L.CANCELLED = 0 AND L.LOGICALREF > @son ORDER BY L.LOGICALREF";
            SonAlisFiyatlari = "SELECT TOP (@enCok) L.LOGICALREF, L.DATE_, C.CODE, V.FICHENO, L.AMOUNT, U.CODE, L.PRICE, L.PRCURR, L.PRPRICE FROM " + d("STLINE") + " L JOIN "
                + d("INVOICE") + " V ON V.LOGICALREF = L.INVOICEREF LEFT JOIN " + f("CLCARD") + " C ON C.LOGICALREF = L.CLIENTREF LEFT JOIN " + f("UNITSETL")
                + " U ON U.LOGICALREF = L.UOMREF WHERE L.STOCKREF = @malzeme AND L.LINETYPE = 0 AND L.TRCODE = 1 AND L.CANCELLED = 0 AND L.INVOICEREF > 0"
                + " ORDER BY L.DATE_ DESC, L.LOGICALREF DESC";
            MalzemeFisiSatirlari = "SELECT L.LOGICALREF, L.LINETYPE, I.CODE, L.AMOUNT FROM " + d("STLINE") + " L LEFT JOIN " + f("ITEMS")
                + " I ON I.LOGICALREF = L.STOCKREF WHERE L.STFICHEREF = @ref ORDER BY L.LOGICALREF";
        }

        public IEnumerable<string> Hepsi()
        {
            foreach (var a in GetType().GetFields())
                if (a.FieldType == typeof(string) && !a.IsStatic) yield return (string)a.GetValue(this);
        }

        static readonly Regex Yazma = new Regex(@"\b(INSERT|UPDATE|DELETE|MERGE|EXEC|EXECUTE|DROP|ALTER|CREATE|TRUNCATE|INTO|GRANT|DENY|REVOKE|BACKUP|RESTORE|DBCC|OPENROWSET|OPENQUERY)\b",
            RegexOptions.IgnoreCase);

        // İkinci savunma: SELECT ile başlamayan, ';' taşıyan ya da yazma sözcüğü geçen metin çalıştırılmaz.
        public static void YalnizOkuma(string sql)
        {
            var m = sql.TrimStart();
            if (!m.StartsWith("SELECT ", StringComparison.OrdinalIgnoreCase) || m.IndexOf(';') >= 0 || Yazma.IsMatch(m))
                throw new InvalidOperationException("Yalnız SELECT çalıştırılır.");
        }
    }

    // Üçüncü savunma: her sorgu geri alınan bir transaction içinde koşar; yanlışlıkla yazan bir metin olsa bile kalıcı olmaz.
    // Ayrıca SQL kullanıcısına yalnız okuma yetkisi verilmesi önerilir (kurulum/logo-yardimcisi.md).
    public sealed class SqlOkuma : ILogoOkuma
    {
        const int SureSn = 30;
        readonly string baglanti;
        readonly Sorgular q;
        readonly int firma;

        public SqlOkuma(Ayar ayar)
        {
            baglanti = ayar.SqlBaglanti;
            q = new Sorgular(ayar.FirmaNo, ayar.DonemNo);
            firma = ayar.FirmaNo;
        }

        List<object[]> Sorgula(string sql, params SqlParameter[] p)
        {
            Sorgular.YalnizOkuma(sql);
            var sonuc = new List<object[]>();
            using (var c = new SqlConnection(baglanti))
            {
                c.Open();
                using (var t = c.BeginTransaction(IsolationLevel.ReadCommitted))
                {
                    using (var k = new SqlCommand(sql, c, t))
                    {
                        k.CommandTimeout = SureSn;
                        k.Parameters.AddRange(p);
                        using (var r = k.ExecuteReader())
                            while (r.Read())
                            {
                                var s = new object[r.FieldCount];
                                r.GetValues(s);
                                for (var i = 0; i < s.Length; i++) if (s[i] == DBNull.Value) s[i] = null;
                                sonuc.Add(s);
                            }
                    }
                    t.Rollback();
                }
            }
            return sonuc;
        }

        static SqlParameter P(string ad, object deger)
        {
            return new SqlParameter(ad, deger);
        }

        static string Metin(object o)
        {
            if (o == null) return null;
            var m = Convert.ToString(o, CultureInfo.InvariantCulture).Trim();
            return m == "" ? null : m;
        }

        static int Tam(object o)
        {
            return o == null ? 0 : Convert.ToInt32(o, CultureInfo.InvariantCulture);
        }

        // Logo miktar kolonları float'tır; Convert.ToDecimal(double) 15 anlamlı basamağa yuvarlar (0.1 -> 0.1).
        static decimal Ondalik(object o)
        {
            return o == null ? 0m : Convert.ToDecimal(o, CultureInfo.InvariantCulture);
        }

        int Ilk(string sql, params SqlParameter[] p)
        {
            var l = Sorgula(sql, p);
            return l.Count == 0 ? 0 : Tam(l[0][0]);
        }

        public int MalzemeRef(string kod)
        {
            return Ilk(q.MalzemeRef, P("@kod", kod));
        }

        public MalzemeKaydi Malzeme(string kod) { return MalzemeOku(Sorgula(q.Malzeme, P("@kod", kod))); }
        public MalzemeKaydi MalzemeRefIle(int kayit) { return MalzemeOku(Sorgula(q.MalzemeRefIle, P("@ref", kayit))); }

        static MalzemeKaydi MalzemeOku(List<object[]> l)
        {
            if (l.Count == 0) return null;
            var s = l[0];
            var k = new MalzemeKaydi();
            k.Ref = Tam(s[0]);
            k.Kod = Metin(s[1]);
            k.Ad = Metin(s[2]);
            k.KartTuru = Tam(s[3]);
            k.OzelKod = Metin(s[4]);
            k.Aciklama2 = Metin(s[5]);
            k.Aciklama3 = Metin(s[6]);
            k.BirimSeti = Metin(s[7]);
            k.Pasif = Bayrak(s[8]);
            return k;
        }

        List<KodAd> KodAdlar(string sql, params SqlParameter[] p)
        {
            var l = new List<KodAd>();
            foreach (var s in Sorgula(sql, p))
            {
                var k = new KodAd();
                k.Kod = Metin(s[0]);
                k.Ad = Metin(s[1]);
                if (k.Kod != null) l.Add(k);
            }
            return l;
        }

        public List<KodAd> BirimSetleri() { return KodAdlar(q.BirimSetleri); }

        static bool Bayrak(object o)
        {
            return o != null && Convert.ToInt32(o, CultureInfo.InvariantCulture) != 0;
        }

        public List<MalzemeKaydi> MalzemeKartlari(int sonGorulen, int enCok)
        {
            var l = new List<MalzemeKaydi>();
            foreach (var s in Sorgula(q.MalzemeKartlari, P("@son", sonGorulen), P("@enCok", enCok)))
            {
                var k = new MalzemeKaydi();
                k.Ref = Tam(s[0]);
                k.Kod = Metin(s[1]);
                k.Ad = Metin(s[2]);
                k.KartTuru = Tam(s[3]);
                k.OzelKod = Metin(s[4]);
                k.Aciklama2 = Metin(s[5]);
                k.Aciklama3 = Metin(s[6]);
                k.BirimSeti = Metin(s[7]);
                k.Pasif = Bayrak(s[8]);
                if (k.Kod != null) l.Add(k);
            }
            return l;
        }

        static DateTime Tarih(object o)
        {
            return o == null ? DateTime.MinValue : Convert.ToDateTime(o, CultureInfo.InvariantCulture);
        }

        public List<MalzemeHareketi> MalzemeHareketleri(int malzemeRef, int sonGorulen, int enCok)
        {
            var l = new List<MalzemeHareketi>();
            foreach (var s in Sorgula(q.MalzemeHareketleri, P("@malzeme", malzemeRef), P("@son", sonGorulen), P("@enCok", enCok)))
            {
                var x = new MalzemeHareketi();
                x.Ref = Tam(s[0]);
                x.Tarih = Tarih(s[1]);
                x.FisTuru = Tam(s[2]);
                x.GirisCikis = Tam(s[3]);
                x.FisNo = Metin(s[4]);
                x.Miktar = Ondalik(s[5]);
                x.AmbarNo = Tam(s[6]);
                x.Birim = Metin(s[7]);
                l.Add(x);
            }
            return l;
        }

        public List<AlisFiyati> SonAlisFiyatlari(int malzemeRef, int enCok)
        {
            var l = new List<AlisFiyati>();
            foreach (var s in Sorgula(q.SonAlisFiyatlari, P("@malzeme", malzemeRef), P("@enCok", enCok)))
            {
                var x = new AlisFiyati();
                x.Ref = Tam(s[0]);
                x.Tarih = Tarih(s[1]);
                x.CariKod = Metin(s[2]);
                x.FaturaNo = Metin(s[3]);
                x.Miktar = Ondalik(s[4]);
                x.Birim = Metin(s[5]);
                x.Fiyat = Ondalik(s[6]);
                x.DovizTuru = Tam(s[7]);
                x.DovizFiyati = Ondalik(s[8]);
                l.Add(x);
            }
            return l;
        }

        public List<StokToplami> StokToplamlari(int sonGorulen, int enCok)
        {
            var l = new List<StokToplami>();
            foreach (var s in Sorgula(q.StokToplamlari, P("@son", sonGorulen), P("@enCok", enCok)))
            {
                var x = new StokToplami();
                x.MalzemeRef = Tam(s[0]);
                x.MalzemeKodu = Metin(s[1]);
                x.AmbarNo = Tam(s[2]);
                x.Miktar = Ondalik(s[3]);
                if (x.MalzemeKodu != null) l.Add(x);
            }
            return l;
        }

        // LIKE'ın özel karakterleri kaçırılır: arama metni desen olarak yorumlanmaz.
        public static string Desen(string metin)
        {
            return "%" + metin.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_").Replace("[", "\\[") + "%";
        }

        static CariKaydi CariSatiri(object[] s)
        {
            var c = new CariKaydi();
            c.Ref = Tam(s[0]);
            c.Kod = Metin(s[1]);
            c.Ad = Metin(s[2]);
            c.KartTuru = Tam(s[3]);
            c.VergiNo = Metin(s[4]);
            c.TcNo = Metin(s[5]);
            c.VergiDairesi = Metin(s[6]);
            c.Adres1 = Metin(s[7]);
            c.Adres2 = Metin(s[8]);
            c.Ilce = Metin(s[9]);
            c.Il = Metin(s[10]);
            c.PostaKodu = Metin(s[11]);
            c.Telefon = Metin(s[12]);
            c.EPosta = Metin(s[13]);
            c.Pasif = Bayrak(s[14]);
            return c;
        }

        public List<CariKaydi> CariAra(string metin, int enCok)
        {
            var l = new List<CariKaydi>();
            foreach (var s in Sorgula(q.CariAra, P("@desen", Desen(metin)), P("@tam", metin), P("@enCok", enCok)))
            {
                var c = CariSatiri(s);
                if (c.Kod != null) l.Add(c);
            }
            return l;
        }

        public CariKaydi Cari(string kod)
        {
            var l = Sorgula(q.Cari, P("@kod", kod), P("@enCok", 1));
            return l.Count == 0 ? null : CariSatiri(l[0]);
        }

        public List<string> MalzemeKodlari()
        {
            var l = new List<string>();
            foreach (var s in Sorgula(q.MalzemeKodlari))
            {
                var k = Metin(s[0]);
                if (k != null) l.Add(k);
            }
            return l;
        }
        public List<KodAd> Ambarlar() { return KodAdlar(q.Ambarlar, P("@firma", firma)); }
        public List<KodAd> Cariler() { return KodAdlar(q.Cariler); }
        public int CariRef(string kod) { return Ilk(q.CariRef, P("@kod", kod)); }

        public HizmetKaydi Hizmet(string kod, int kartTuru) { return HizmetOku(Sorgula(q.Hizmet, P("@kod", kod), P("@tur", kartTuru))); }
        public HizmetKaydi HizmetRefIle(int kayit, int kartTuru) { return HizmetOku(Sorgula(q.HizmetRefIle, P("@ref", kayit), P("@tur", kartTuru))); }

        static HizmetKaydi HizmetOku(List<object[]> l)
        {
            if (l.Count == 0) return null;
            var k = new HizmetKaydi();
            k.Ref = Tam(l[0][0]);
            k.Kod = Metin(l[0][1]);
            k.Ad = Metin(l[0][2]);
            k.Pasif = Bayrak(l[0][3]);
            return k;
        }

        static FisBasligi SiparisBasligi(List<object[]> l)
        {
            if (l.Count == 0) return null;
            var s = l[0];
            var b = new FisBasligi();
            b.Ref = Tam(s[0]);
            b.No = Metin(s[1]);
            b.Durum = Tam(s[2]);
            b.Iptal = Tam(s[3]) != 0;
            b.CariKod = Metin(s[4]);
            b.NetToplam = Ondalik(s[5]);
            b.DovizTuru = Tam(s[6]);
            b.Kur = Ondalik(s[7]);
            return b;
        }

        public FisBasligi Siparis(string no, int trcode) { return SiparisBasligi(Sorgula(q.Siparis, P("@no", no), P("@tr", trcode))); }
        public FisBasligi SiparisRefIle(int kayit, int trcode) { return SiparisBasligi(Sorgula(q.SiparisRefIle, P("@ref", kayit), P("@tr", trcode))); }

        public List<FisSatiri> SiparisSatirlari(int fisRef)
        {
            var l = new List<FisSatiri>();
            foreach (var s in Sorgula(q.SiparisSatirlari, P("@ref", fisRef)))
            {
                var x = new FisSatiri();
                x.Ref = Tam(s[0]);
                x.SatirTuru = Tam(s[1]);
                x.Kod = Metin(s[2]);
                x.Miktar = Ondalik(s[3]);
                x.Kapali = Tam(s[4]) != 0;
                x.TeklifSatirRef = Tam(s[5]);
                l.Add(x);
            }
            return l;
        }

        public List<MalKabulSatiri> MalKabul(int sonGorulen, int enCok)
        {
            var l = new List<MalKabulSatiri>();
            foreach (var s in Sorgula(q.MalKabul, P("@son", sonGorulen), P("@enCok", enCok)))
            {
                var x = new MalKabulSatiri();
                x.Ref = Tam(s[0]);
                x.SiparisSatirRef = Tam(s[1]);
                x.SiparisRef = Tam(s[2]);
                x.FisNo = Metin(s[3]);
                x.MalzemeKodu = Metin(s[4]);
                x.Miktar = Ondalik(s[5]);
                x.Birim = Metin(s[6]);
                l.Add(x);
            }
            return l;
        }

        public List<FaturaOzeti> Faturalar(int siparisRef)
        {
            var l = new List<FaturaOzeti>();
            foreach (var s in Sorgula(q.Faturalar, P("@ref", siparisRef)))
            {
                var x = new FaturaOzeti();
                x.Ref = Tam(s[0]);
                x.No = Metin(s[1]);
                l.Add(x);
            }
            return l;
        }

        public FisBasligi Talep(string no)
        {
            var l = Sorgula(q.Talep, P("@no", no));
            if (l.Count == 0) return null;
            var b = new FisBasligi();
            b.Ref = Tam(l[0][0]);
            b.No = Metin(l[0][1]);
            b.Durum = Tam(l[0][2]);
            return b;
        }

        // Sonuç verilen sırayla döner; bulunmayan satır listede olmaz.
        public List<TalepSatiri> TalepSatirlari(List<int> satirRefleri)
        {
            var l = new List<TalepSatiri>();
            if (satirRefleri.Count == 0) return l;
            var adlar = new List<string>();
            var p = new List<SqlParameter>();
            for (var i = 0; i < satirRefleri.Count; i++)
            {
                adlar.Add("@r" + i);
                p.Add(P("@r" + i, satirRefleri[i]));
            }
            var bulunan = new Dictionary<int, TalepSatiri>();
            foreach (var s in Sorgula(string.Format(q.TalepSatirlari, string.Join(", ", adlar.ToArray())), p.ToArray()))
            {
                var x = new TalepSatiri();
                x.Ref = Tam(s[0]);
                x.Durum = Tam(s[1]);
                x.Miktar = Ondalik(s[2]);
                x.Karsilanan = Ondalik(s[3]);
                bulunan[x.Ref] = x;
            }
            foreach (var r in satirRefleri)
            {
                TalepSatiri x;
                if (bulunan.TryGetValue(r, out x)) l.Add(x);
            }
            return l;
        }

        static Karsilama KarsilamaSatiri(object[] s)
        {
            var k = new Karsilama();
            k.Ref = Tam(s[0]);
            k.SiparisSatirRef = Tam(s[1]);
            k.TalepSatirRef = Tam(s[2]);
            k.Miktar = Ondalik(s[3]);
            return k;
        }

        public List<Karsilama> Karsilamalar(int siparisRef)
        {
            var l = new List<Karsilama>();
            foreach (var s in Sorgula(q.Karsilamalar, P("@ref", siparisRef))) l.Add(KarsilamaSatiri(s));
            return l;
        }

        public Karsilama KarsilamaBul(int talepSatirRef, int siparisSatirRef)
        {
            var l = Sorgula(q.KarsilamaBul, P("@talep", talepSatirRef), P("@siparis", siparisSatirRef));
            return l.Count == 0 ? null : KarsilamaSatiri(l[0]);
        }

        public string SatisMusterisiKodu(string cariKod)
        {
            var l = Sorgula(q.SatisMusterisi, P("@kod", cariKod), P("@firma", firma));
            return l.Count == 0 ? null : Metin(l[0][0]);
        }

        static FisBasligi TeklifBasligi(List<object[]> l)
        {
            if (l.Count == 0) return null;
            var s = l[0];
            var b = new FisBasligi();
            b.Ref = Tam(s[0]);
            b.No = Metin(s[1]);
            b.Durum = Tam(s[2]);
            b.CariKod = Metin(s[3]);
            b.NetToplam = Ondalik(s[4]);
            b.DovizTuru = Tam(s[5]);
            b.Kur = Ondalik(s[6]);
            return b;
        }

        public FisBasligi Teklif(string no) { return TeklifBasligi(Sorgula(q.Teklif, P("@no", no))); }
        public FisBasligi TeklifRefIle(int kayit) { return TeklifBasligi(Sorgula(q.TeklifRefIle, P("@ref", kayit))); }

        public List<TeklifSatiri> TeklifSatirlari(int teklifRef)
        {
            var l = new List<TeklifSatiri>();
            foreach (var s in Sorgula(q.TeklifSatirlari, P("@ref", teklifRef)))
            {
                var x = new TeklifSatiri();
                x.Ref = Tam(s[0]);
                x.SatirTuru = Tam(s[1]);
                x.Kod = Metin(s[2]);
                x.Miktar = Ondalik(s[3]);
                x.Fiyat = Ondalik(s[4]);
                x.Kdv = Ondalik(s[5]);
                x.Iskonto = Ondalik(s[6]);
                x.Birim = Metin(s[7]);
                x.SipariseDonen = Ondalik(s[8]);
                x.DovizTuru = Tam(s[9]);
                x.DovizFiyati = Ondalik(s[10]);
                l.Add(x);
            }
            return l;
        }

        public FisBasligi MalzemeFisi(string no, int trcode)
        {
            var l = Sorgula(q.MalzemeFisi, P("@no", no), P("@tr", trcode));
            if (l.Count == 0) return null;
            var b = new FisBasligi();
            b.Ref = Tam(l[0][0]);
            b.No = Metin(l[0][1]);
            return b;
        }

        public List<FisSatiri> MalzemeFisiSatirlari(int fisRef)
        {
            var l = new List<FisSatiri>();
            foreach (var s in Sorgula(q.MalzemeFisiSatirlari, P("@ref", fisRef)))
            {
                var x = new FisSatiri();
                x.Ref = Tam(s[0]);
                x.SatirTuru = Tam(s[1]);
                x.Kod = Metin(s[2]);
                x.Miktar = Ondalik(s[3]);
                l.Add(x);
            }
            return l;
        }
    }
}
