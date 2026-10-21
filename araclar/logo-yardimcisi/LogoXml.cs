using System;
using System.Collections.Generic;
using System.Security;
using System.Text;

namespace LogoYardimcisi
{
    // Logo Objects ImportFromXmlStr metni. Kodlama ISO-8859-9 bildirilir (rehber §0 kural 8); metin .NET dizesi olarak gider.
    // Yalnız DBOP="INS" yazılır: DBOP="UPD" bu sürümde INSERT'e zorlayıp "duplicate key" verir (rehber tuzak 2), güncelleme Read+Modify+Post'tur.
    public sealed class LogoXml
    {
        readonly StringBuilder sb = new StringBuilder();
        readonly string kok;
        readonly Stack<string> acik = new Stack<string>();

        public LogoXml(string kok, string oge)
        {
            this.kok = kok;
            sb.Append("<?xml version=\"1.0\" encoding=\"ISO-8859-9\"?>\n<").Append(kok).Append(">\n<").Append(oge).Append(" DBOP=\"INS\">\n");
            acik.Push(oge);
        }

        public LogoXml Ac(string ad)
        {
            sb.Append('<').Append(ad).Append(">\n");
            acik.Push(ad);
            return this;
        }

        public LogoXml Kapat()
        {
            sb.Append("</").Append(acik.Pop()).Append(">\n");
            return this;
        }

        public LogoXml Bos(string ad)
        {
            sb.Append('<').Append(ad).Append("></").Append(ad).Append(">\n");
            return this;
        }

        public LogoXml Alan(string ad, object deger)
        {
            sb.Append('<').Append(ad).Append('>').Append(Metin(deger)).Append("</").Append(ad).Append(">\n");
            return this;
        }

        public LogoXml Alanlar(AlanListesi alanlar)
        {
            foreach (var a in alanlar) Alan(a.Key, a.Value);
            return this;
        }

        public string Bitir()
        {
            while (acik.Count > 0) Kapat();
            sb.Append("</").Append(kok).Append(">\n");
            return sb.ToString();
        }

        static string Metin(object deger)
        {
            if (deger == null) return "";
            if (deger is decimal) return Bicim.Sayi((decimal)deger);
            if (deger is int) return Bicim.Tam((int)deger);
            var m = deger as string;
            if (m != null) return SecurityElement.Escape(m);
            throw new ArgumentException("XML alanı yalnız metin, int ya da decimal olur.");
        }
    }
}
