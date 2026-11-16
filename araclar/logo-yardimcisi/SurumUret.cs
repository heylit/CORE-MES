using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace LogoYardimcisiSurum
{
    // derle.cmd derlemeden önce koşar: yardımcının kaynak özetini Surum.g.cs'e yazar; exe bu özeti /api/version ile bildirir.
    // CORE aynı özeti paketteki kaynaktan aynı kuralla hesaplar (sunucu/moduller/logo/surum.ts). Kural: Testler.cs, SahteLogo.cs,
    // SurumUret.cs ve Surum.g.cs dışındaki .cs dosyaları ad sırasıyla (sıralı, büyük-küçük harf duyarlı); her dosya için
    // "ad\n" ve satır sonları LF'ye çevrilmiş içerik, ardından "\n". SHA-256, küçük harf onaltılık.
    public static class Program
    {
        static readonly HashSet<string> Disarida = new HashSet<string>(StringComparer.Ordinal) { "Testler.cs", "SahteLogo.cs", "SurumUret.cs", "Surum.g.cs" };

        public static int Main(string[] argumanlar)
        {
            var klasor = argumanlar.Length > 0 ? argumanlar[0] : ".";
            var adlar = new List<string>();
            foreach (var yol in Directory.GetFiles(klasor, "*.cs"))
            {
                var ad = Path.GetFileName(yol);
                if (!Disarida.Contains(ad)) adlar.Add(ad);
            }
            adlar.Sort(StringComparer.Ordinal);
            var tampon = new MemoryStream();
            foreach (var ad in adlar)
            {
                var icerik = File.ReadAllText(Path.Combine(klasor, ad), Encoding.UTF8).Replace("\r\n", "\n");
                var b = new UTF8Encoding(false).GetBytes(ad + "\n" + icerik + "\n");
                tampon.Write(b, 0, b.Length);
            }
            string ozet;
            using (var sha = SHA256.Create())
            {
                var h = sha.ComputeHash(tampon.ToArray());
                var sb = new StringBuilder();
                foreach (var x in h) sb.Append(x.ToString("x2", CultureInfo.InvariantCulture));
                ozet = sb.ToString();
            }
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
