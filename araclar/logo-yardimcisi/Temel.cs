using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace LogoYardimcisi
{
    // Alan adı ve değeri; sıra korunur, çünkü Logo bazı alanların yazılış sırasına bakar (satış teklifinde LASTREVISION satırlardan sonra).
    public sealed class AlanListesi : List<KeyValuePair<string, object>>
    {
        public AlanListesi Ekle(string ad, object deger)
        {
            Add(new KeyValuePair<string, object>(ad, deger));
            return this;
        }

        public object Deger(string ad)
        {
            foreach (var a in this) if (a.Key == ad) return a.Value;
            return null;
        }

        public bool Var(string ad)
        {
            foreach (var a in this) if (a.Key == ad) return true;
            return false;
        }
    }

    // Post ya da ImportFromXmlStr false döndüğünde Logo'nun verdiği hata.
    public sealed class LogoHatasi
    {
        public int Kod;
        public string Metin;
        public List<string> Dogrulama = new List<string>();

        public LogoHatasi(int kod, string metin)
        {
            Kod = kod;
            Metin = metin ?? "";
        }

        public override string ToString()
        {
            var ek = Dogrulama.Count == 0 ? "" : " | " + string.Join(" | ", Dogrulama.ToArray());
            return "[code=" + Kod.ToString(CultureInfo.InvariantCulture) + "] " + Metin + ek;
        }
    }

    // Oturum açılamadı (lisans dolu, kimlik yanlış, Logo kurulu değil): istek Logo'ya hiç gitmedi.
    public sealed class LogoBaglanamadi : Exception
    {
        public LogoBaglanamadi(string ileti) : base(ileti) { }
    }

    // Çağrı sırasında oturum koptu: işlenip işlenmediği bilinmiyor.
    public sealed class LogoOturumKoptu : Exception
    {
        public LogoOturumKoptu(string ileti, Exception ic) : base(ileti, ic) { }
    }

    // İstek gövdesi ya da yolu kurala uymuyor; Logo'ya gidilmez.
    public sealed class GecersizIstek : Exception
    {
        public GecersizIstek(string ileti) : base(ileti) { }
    }

    public sealed class Cevap
    {
        public int Durum;
        public object Govde;

        public Cevap(int durum, object govde)
        {
            Durum = durum;
            Govde = govde;
        }

        public static Cevap Basari(int logicalRef)
        {
            return new Cevap(200, Zarf(true, logicalRef, null, null));
        }

        public static Cevap Basari(int logicalRef, string kap, object icerik)
        {
            var z = Zarf(true, logicalRef, null, null);
            z[kap] = icerik;
            return new Cevap(200, z);
        }

        public static Cevap Ret(string hata)
        {
            return new Cevap(200, Zarf(false, 0, hata, null));
        }

        public static Cevap Ret(LogoHatasi h)
        {
            return new Cevap(200, Zarf(false, 0, h.ToString(), h.Dogrulama.Count == 0 ? null : h.Dogrulama.ToArray()));
        }

        public static Cevap Hata(int durum, string hata)
        {
            return new Cevap(durum, Zarf(false, 0, hata, null));
        }

        public static Dictionary<string, object> Zarf(bool basari, int logicalRef, string hata, string[] dogrulama)
        {
            var z = new Dictionary<string, object>();
            z["success"] = basari;
            z["logicalRef"] = logicalRef;
            z["error"] = hata;
            z["validate"] = dogrulama;
            return z;
        }
    }

    public static class Json
    {
        public static JavaScriptSerializer Yeni()
        {
            var s = new JavaScriptSerializer();
            s.MaxJsonLength = 4 * 1024 * 1024;
            return s;
        }

        public static string Yaz(object o)
        {
            return Yeni().Serialize(o);
        }

        public static Dictionary<string, object> Nesne(string metin)
        {
            if (metin == null || metin.Trim() == "") throw new GecersizIstek("Gövde boş.");
            object o;
            try { o = Yeni().DeserializeObject(metin); }
            catch (Exception) { throw new GecersizIstek("Gövde JSON değil."); }
            var d = o as Dictionary<string, object>;
            if (d == null) throw new GecersizIstek("Gövde JSON nesnesi olmalı.");
            return d;
        }

        public static string Metin(Dictionary<string, object> d, string ad, bool zorunlu)
        {
            object o;
            if (!d.TryGetValue(ad, out o) || o == null)
            {
                if (zorunlu) throw new GecersizIstek(ad + " yok.");
                return null;
            }
            var m = o as string;
            if (m == null) throw new GecersizIstek(ad + " metin olmalı.");
            m = m.Trim();
            if (m == "" && zorunlu) throw new GecersizIstek(ad + " boş.");
            return m == "" ? null : m;
        }

        public static decimal? Sayi(Dictionary<string, object> d, string ad, bool zorunlu)
        {
            object o;
            if (!d.TryGetValue(ad, out o) || o == null)
            {
                if (zorunlu) throw new GecersizIstek(ad + " yok.");
                return null;
            }
            if (o is int) return (int)o;
            if (o is long) return (long)o;
            if (o is decimal) return (decimal)o;
            if (o is double) return (decimal)(double)o;
            throw new GecersizIstek(ad + " sayı olmalı.");
        }

        public static int? Tam(Dictionary<string, object> d, string ad, bool zorunlu)
        {
            var s = Sayi(d, ad, zorunlu);
            if (s == null) return null;
            if (s.Value != Math.Truncate(s.Value) || s.Value < int.MinValue || s.Value > int.MaxValue) throw new GecersizIstek(ad + " tam sayı olmalı.");
            return (int)s.Value;
        }

        public static List<Dictionary<string, object>> Liste(Dictionary<string, object> d, string ad, bool zorunlu)
        {
            object o;
            var sonuc = new List<Dictionary<string, object>>();
            if (!d.TryGetValue(ad, out o) || o == null)
            {
                if (zorunlu) throw new GecersizIstek(ad + " yok.");
                return sonuc;
            }
            var dizi = o as IList;
            if (dizi == null) throw new GecersizIstek(ad + " dizi olmalı.");
            foreach (var x in dizi)
            {
                var n = x as Dictionary<string, object>;
                if (n == null) throw new GecersizIstek(ad + " öğeleri nesne olmalı.");
                sonuc.Add(n);
            }
            return sonuc;
        }

        public static List<int> TamListe(Dictionary<string, object> d, string ad)
        {
            object o;
            if (!d.TryGetValue(ad, out o) || o == null) throw new GecersizIstek(ad + " yok.");
            var dizi = o as IList;
            if (dizi == null) throw new GecersizIstek(ad + " dizi olmalı.");
            var sonuc = new List<int>();
            foreach (var x in dizi)
            {
                if (!(x is int)) throw new GecersizIstek(ad + " öğeleri tam sayı olmalı.");
                sonuc.Add((int)x);
            }
            return sonuc;
        }
    }

    public static class Bicim
    {
        static readonly Regex Tarih = new Regex(@"^(\d{2})\.(\d{2})\.(\d{4})$");
        static readonly Regex Saat = new Regex(@"^(\d{2}):(\d{2}):(\d{2})$");

        public static string Sayi(decimal d)
        {
            return d.ToString("0.##########", CultureInfo.InvariantCulture);
        }

        public static string Tam(int d)
        {
            return d.ToString(CultureInfo.InvariantCulture);
        }

        // Logo tarihi dd.MM.yyyy (rehber §0 kural 8); geçerli takvim günü olmalı.
        public static string TarihDenetle(string deger, string ad)
        {
            if (deger == null) return null;
            DateTime t;
            if (!Tarih.IsMatch(deger) || !DateTime.TryParseExact(deger, "dd.MM.yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out t))
                throw new GecersizIstek(ad + " dd.MM.yyyy olmalı.");
            return deger;
        }

        // Saat alanları 9 haneli HHMMSSFFF tamsayı (rehber §0 kural 8).
        public static int LogoSaati(int saat, int dakika, int saniye)
        {
            return ((saat * 100 + dakika) * 100 + saniye) * 1000;
        }

        public static int LogoSaati(string hhmmss, string ad)
        {
            var m = Saat.Match(hhmmss);
            if (!m.Success) throw new GecersizIstek(ad + " HH:mm:ss olmalı.");
            int s = int.Parse(m.Groups[1].Value), d = int.Parse(m.Groups[2].Value), n = int.Parse(m.Groups[3].Value);
            if (s > 23 || d > 59 || n > 59) throw new GecersizIstek(ad + " geçersiz saat.");
            return LogoSaati(s, d, n);
        }

        public static decimal Yuvarla(decimal d, int basamak)
        {
            return Math.Round(d, basamak, MidpointRounding.AwayFromZero);
        }
    }
}
