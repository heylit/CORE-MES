using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace LogoYardimcisi
{
    public static class Gunluk
    {
        public static TextWriter Cikti = Console.Out;
        static readonly object Kilit = new object();

        // Günlüğe gövde, parola ve anahtar yazılmaz; yalnız yöntem, yol, durum ve süre.
        public static void Yaz(string ileti)
        {
            lock (Kilit) Cikti.WriteLine(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) + " " + ileti);
        }
    }

    public delegate Cevap IstekIsleyici(string yontem, string yol, Dictionary<string, string> sorgu, string govde);

    // Yalnız 127.0.0.1'i dinleyen en küçük HTTP/1.1 sunucusu (ağ kipi yok; ADR 0017). HttpListener yönetici olmayan kullanıcıda
    // URL kaydı (urlacl) isteyebildiği için TcpListener kullanılır. İstekler tek iş parçacığında, sırayla işlenir: Logo oturumu tek
    // STA iş parçacığında kalır (rehber §0 kural 2). Her bağlantı tek istek taşır (Connection: close).
    public sealed class HttpSunucu
    {
        const int BaslikEnCok = 16 * 1024;
        const int GovdeEnCok = 2 * 1024 * 1024;
        const int OkumaSuresiMs = 10000;

        readonly TcpListener dinleyici;
        readonly byte[] anahtar;
        readonly IstekIsleyici isle;
        public int Port { get; private set; }

        public HttpSunucu(int port, string anahtar, IstekIsleyici isle)
        {
            dinleyici = new TcpListener(IPAddress.Loopback, port);
            this.anahtar = Encoding.UTF8.GetBytes(anahtar);
            this.isle = isle;
        }

        public void Baslat()
        {
            dinleyici.Start();
            Port = ((IPEndPoint)dinleyici.LocalEndpoint).Port;
        }

        public void Durdur()
        {
            dinleyici.Stop();
        }

        // Durdur çağrılınca (AcceptTcpClient hata verince) döner. enCok verilirse o kadar bağlantıdan sonra döner (test).
        public void Calis(int enCok)
        {
            var sayac = 0;
            while (enCok <= 0 || sayac < enCok)
            {
                TcpClient c;
                try { c = dinleyici.AcceptTcpClient(); }
                catch (SocketException) { return; }
                catch (ObjectDisposedException) { return; }
                catch (InvalidOperationException) { return; }
                sayac++;
                using (c) Baglanti(c);
            }
        }

        void Baglanti(TcpClient c)
        {
            var baslangic = DateTime.UtcNow;
            string yontem = "?", yol = "?";
            int durum;
            try
            {
                c.ReceiveTimeout = OkumaSuresiMs;
                c.SendTimeout = OkumaSuresiMs;
                var akis = c.GetStream();
                Cevap cevap;
                Istek istek;
                try
                {
                    istek = Oku(akis);
                    yontem = istek.Yontem;
                    yol = istek.Yol;
                    cevap = Denetle(istek) ?? isle(istek.Yontem, istek.Yol, istek.Sorgu, istek.Govde);
                }
                catch (GecersizIstek e)
                {
                    cevap = Cevap.Hata(400, e.Message);
                }
                durum = cevap.Durum;
                Yaz(akis, cevap);
            }
            catch (Exception e)
            {
                Gunluk.Yaz(yontem + " " + yol + " bağlantı hatası: " + e.GetType().Name);
                return;
            }
            Gunluk.Yaz(yontem + " " + yol + " " + durum + " " + (int)(DateTime.UtcNow - baslangic).TotalMilliseconds + " ms");
        }

        sealed class Istek
        {
            public string Yontem;
            public string Yol;
            public Dictionary<string, string> Sorgu = new Dictionary<string, string>();
            public Dictionary<string, string> Basliklar = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            public string Govde;
        }

        Cevap Denetle(Istek i)
        {
            // Tarayıcıdan gelen istek (Origin taşır) kabul edilmez; TMI sunucusu Origin göndermez.
            if (i.Basliklar.ContainsKey("Origin")) return Cevap.Hata(403, "Forbidden");
            string host;
            if (!i.Basliklar.TryGetValue("Host", out host)) return Cevap.Hata(400, "Host yok.");
            var port = Port.ToString(CultureInfo.InvariantCulture);
            if (host != "127.0.0.1:" + port && host != "localhost:" + port) return Cevap.Hata(403, "Forbidden");
            string verilen;
            if (!i.Basliklar.TryGetValue("X-Api-Key", out verilen) || !SabitSureliEsit(Encoding.UTF8.GetBytes(verilen), anahtar))
                return Cevap.Hata(401, "Unauthorized");
            return null;
        }

        static bool SabitSureliEsit(byte[] a, byte[] b)
        {
            var fark = a.Length ^ b.Length;
            for (var i = 0; i < b.Length; i++) fark |= (i < a.Length ? a[i] : 0) ^ b[i];
            return fark == 0;
        }

        static Istek Oku(Stream akis)
        {
            var tampon = new MemoryStream();
            var b = new byte[4096];
            var son = -1;
            while (son < 0)
            {
                var n = akis.Read(b, 0, b.Length);
                if (n <= 0) throw new GecersizIstek("İstek yarım kaldı.");
                tampon.Write(b, 0, n);
                son = BaslikSonu(tampon.GetBuffer(), (int)tampon.Length);
                if (son < 0 && tampon.Length > BaslikEnCok) throw new GecersizIstek("Başlık çok uzun.");
            }
            var hepsi = tampon.ToArray();
            var basliklar = Encoding.ASCII.GetString(hepsi, 0, son).Split(new[] { "\r\n" }, StringSplitOptions.None);
            var ilk = basliklar[0].Split(' ');
            if (ilk.Length != 3 || !ilk[2].StartsWith("HTTP/1.")) throw new GecersizIstek("İstek satırı bozuk.");
            var i = new Istek();
            i.Yontem = ilk[0];
            var hedef = ilk[1];
            var soru = hedef.IndexOf('?');
            i.Yol = soru < 0 ? hedef : hedef.Substring(0, soru);
            if (soru >= 0)
                foreach (var parca in hedef.Substring(soru + 1).Split('&'))
                {
                    if (parca == "") continue;
                    var esit = parca.IndexOf('=');
                    var ad = Uri.UnescapeDataString(esit < 0 ? parca : parca.Substring(0, esit));
                    i.Sorgu[ad] = esit < 0 ? "" : Uri.UnescapeDataString(parca.Substring(esit + 1).Replace('+', ' '));
                }
            for (var k = 1; k < basliklar.Length; k++)
            {
                var iki = basliklar[k].IndexOf(':');
                if (iki <= 0) throw new GecersizIstek("Başlık bozuk.");
                i.Basliklar[basliklar[k].Substring(0, iki).Trim()] = basliklar[k].Substring(iki + 1).Trim();
            }
            if (i.Basliklar.ContainsKey("Transfer-Encoding")) throw new GecersizIstek("Transfer-Encoding desteklenmez; Content-Length verin.");
            var uzunluk = 0;
            string u;
            if (i.Basliklar.TryGetValue("Content-Length", out u) && (!int.TryParse(u, NumberStyles.None, CultureInfo.InvariantCulture, out uzunluk) || uzunluk > GovdeEnCok))
                throw new GecersizIstek("Content-Length geçersiz.");
            var govde = new byte[uzunluk];
            var elde = Math.Min(uzunluk, hepsi.Length - son - 4);
            Array.Copy(hepsi, son + 4, govde, 0, elde);
            while (elde < uzunluk)
            {
                var n = akis.Read(govde, elde, uzunluk - elde);
                if (n <= 0) throw new GecersizIstek("Gövde yarım kaldı.");
                elde += n;
            }
            i.Govde = Encoding.UTF8.GetString(govde);
            return i;
        }

        static int BaslikSonu(byte[] b, int uzunluk)
        {
            for (var i = 0; i + 3 < uzunluk; i++)
                if (b[i] == '\r' && b[i + 1] == '\n' && b[i + 2] == '\r' && b[i + 3] == '\n') return i;
            return -1;
        }

        static void Yaz(Stream akis, Cevap c)
        {
            var govde = Encoding.UTF8.GetBytes(Json.Yaz(c.Govde));
            var baslik = "HTTP/1.1 " + c.Durum.ToString(CultureInfo.InvariantCulture) + " " + Neden(c.Durum) + "\r\n"
                + "Content-Type: application/json; charset=utf-8\r\n"
                + "Content-Length: " + govde.Length.ToString(CultureInfo.InvariantCulture) + "\r\n"
                + "Connection: close\r\n\r\n";
            var b = Encoding.ASCII.GetBytes(baslik);
            akis.Write(b, 0, b.Length);
            akis.Write(govde, 0, govde.Length);
            akis.Flush();
        }

        static string Neden(int durum)
        {
            switch (durum)
            {
                case 200: return "OK";
                case 400: return "Bad Request";
                case 401: return "Unauthorized";
                case 403: return "Forbidden";
                case 404: return "Not Found";
                case 500: return "Internal Server Error";
                case 503: return "Service Unavailable";
                default: return "Status";
            }
        }
    }
}
