using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace LogoYardimcisiSurum
{
    // derle.cmd derlemeden önce koşar: yardımcının kaynak özetini Surum.g.cs'e yazar; exe bu özeti /api/version ile bildirir.
    // CORE aynı özeti paketteki kaynaktan aynı kuralla hesaplar (sunucu/moduller/logo/yardimci-surumu.ts). Kural: Testler.cs, SahteLogo.cs,
    // SurumUret.cs ve Surum.g.cs dışındaki .cs dosyaları ad sırasıyla (sıralı, büyük-küçük harf duyarlı); her dosya için
    // "ad\n" ve satır sonları LF'ye çevrilmiş içerik, ardından "\n". SHA-256, küçük harf onaltılık.
    public static class Program
    {
        static readonly HashSet<string> Disarida = new HashSet<string>(StringComparer.Ordinal) { "Testler.cs", "SahteLogo.cs", "SurumUret.cs", "Surum.g.cs" };

        // Testler.cs sabit bir örnekle bu işlevi sunucudaki yardimciKaynakOzeti ile aynı beklenen değere bağlar (3314 Test T1).
        public static string Ozet(IEnumerable<KeyValuePair<string, string>> dosyalar)
        {
            var secili = new List<KeyValuePair<string, string>>();
            foreach (var d in dosyalar)
            {
                if (d.Key.EndsWith(".cs", StringComparison.Ordinal) && !Disarida.Contains(d.Key)) secili.Add(d);
            }
            secili.Sort((x, y) => string.CompareOrdinal(x.Key, y.Key));
            var tampon = new MemoryStream();
            foreach (var d in secili)
            {
                var icerik = (d.Value.Length > 0 && d.Value[0] == '\uFEFF' ? d.Value.Substring(1) : d.Value).Replace("\r\n", "\n");
                var b = new UTF8Encoding(false).GetBytes(d.Key + "\n" + icerik + "\n");
                tampon.Write(b, 0, b.Length);
            }
            using (var sha = SHA256.Create())
            {
                var h = sha.ComputeHash(tampon.ToArray());
                var sb = new StringBuilder();
                foreach (var x in h) sb.Append(x.ToString("x2", CultureInfo.InvariantCulture));
                return sb.ToString();
            }
        }

        public static int Main(string[] argumanlar)
        {
            var klasor = argumanlar.Length > 0 ? argumanlar[0] : ".";
            var dosyalar = new List<KeyValuePair<string, string>>();
            foreach (var yol in Directory.GetFiles(klasor, "*.cs"))
            {
                dosyalar.Add(new KeyValuePair<string, string>(Path.GetFileName(yol), File.ReadAllText(yol, Encoding.UTF8)));
            }
            var ozet = Ozet(dosyalar);
            var zaman = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
            File.WriteAllText(Path.Combine(klasor, "Surum.g.cs"),
                "namespace LogoYardimcisi\n{\n    // derle.cmd üretir; depoya girmez.\n    public static class Surum\n    {\n"
                + "        public const string KaynakOzeti = \"" + ozet + "\";\n"
                + "        public const string DerlemeZamani = \"" + zaman + "\";\n    }\n}\n", new UTF8Encoding(false));
            Console.WriteLine("Kaynak özeti: " + ozet);
            return 0;
        }
    }
}
