using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace LogoYardimcisi
{
    // Ayar dosyası depo dışındadır (ADR 0017): Logo kullanıcısı, parolası, firma numarası ve SQL bağlantısı yalnız burada.
    // Biçim: her satır "ad=deger"; '#' ile başlayan satır ve boş satır yok sayılır. Bilinmeyen ad hatadır (yazım yanlışı sessiz kalmasın).
    public sealed class Ayar
    {
        public int Port;
        public string Anahtar;
        public string LogoKullanici;
        public string LogoParola;
        public int FirmaNo;
        public int DonemNo;
        public string SqlBaglanti;
        public int AmbarNo;
        public int IsyeriNo;
        // Yalnız --deneme: Logo'daki deneme satıcı ve alıcı cari kodları.
        public string DenemeSatici;
        public string DenemeAlici;

        static readonly string[] Adlar =
        {
            "port", "anahtar", "logo_kullanici", "logo_parola", "firma_no", "donem_no", "sql_baglanti", "ambar_no", "isyeri_no",
            "deneme_satici", "deneme_alici",
        };

        public static Ayar DosyadanOku(string yol)
        {
            if (!File.Exists(yol)) throw new GecersizIstek("Ayar dosyası yok: " + yol);
            return Coz(File.ReadAllText(yol, Encoding.UTF8));
        }

        public static Ayar Coz(string metin)
        {
            var d = new Dictionary<string, string>();
            var satirNo = 0;
            foreach (var hamSatir in metin.Replace("\r\n", "\n").Split('\n'))
            {
                satirNo++;
                var satir = hamSatir.Trim();
                if (satir == "" || satir.StartsWith("#")) continue;
                var esit = satir.IndexOf('=');
                if (esit <= 0) throw new GecersizIstek("Ayar satırı " + satirNo + ": 'ad=deger' olmalı.");
                var ad = satir.Substring(0, esit).Trim();
                if (Array.IndexOf(Adlar, ad) < 0) throw new GecersizIstek("Ayar satırı " + satirNo + ": bilinmeyen ad '" + ad + "'.");
                if (d.ContainsKey(ad)) throw new GecersizIstek("Ayar satırı " + satirNo + ": '" + ad + "' iki kez verilmiş.");
                d[ad] = satir.Substring(esit + 1).Trim();
            }
            var a = new Ayar();
            a.Port = Tam(d, "port", 1024, 65535, null);
            a.Anahtar = Metin(d, "anahtar", true);
            if (a.Anahtar.Length < 16) throw new GecersizIstek("Ayar: anahtar en az 16 karakter olmalı.");
            a.LogoKullanici = Metin(d, "logo_kullanici", true);
            a.LogoParola = Metin(d, "logo_parola", false) ?? "";
            a.FirmaNo = Tam(d, "firma_no", 1, 999, null);
            a.DonemNo = Tam(d, "donem_no", 1, 99, null);
            a.SqlBaglanti = Metin(d, "sql_baglanti", true);
            a.AmbarNo = Tam(d, "ambar_no", 0, 9999, 0);
            a.IsyeriNo = Tam(d, "isyeri_no", 0, 9999, 0);
            a.DenemeSatici = Metin(d, "deneme_satici", false);
            a.DenemeAlici = Metin(d, "deneme_alici", false);
            return a;
        }

        static string Metin(Dictionary<string, string> d, string ad, bool zorunlu)
        {
            string m;
            if (!d.TryGetValue(ad, out m) || m == "")
            {
                if (zorunlu) throw new GecersizIstek("Ayar eksik: " + ad);
                return null;
            }
            return m;
        }

        static int Tam(Dictionary<string, string> d, string ad, int enAz, int enCok, int? varsayilan)
        {
            string m;
            if (!d.TryGetValue(ad, out m) || m == "")
            {
                if (varsayilan == null) throw new GecersizIstek("Ayar eksik: " + ad);
                return varsayilan.Value;
            }
            int s;
            if (!int.TryParse(m, NumberStyles.None, CultureInfo.InvariantCulture, out s) || s < enAz || s > enCok)
                throw new GecersizIstek("Ayar geçersiz: " + ad + " " + enAz + "-" + enCok + " arası tam sayı olmalı.");
            return s;
        }
    }
}
