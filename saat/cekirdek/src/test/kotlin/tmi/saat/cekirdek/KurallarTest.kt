package tmi.saat.cekirdek

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class KurallarTest {
    @Test
    fun `durum kodlari sunucu sozlesmesiyle ayni, bilinmeyen null`() {
        assertEquals(
            listOf("ariza", "bakim", "durdu", "durakli", "calisiyor", "bekliyor", "bos"),
            IstasyonDurumu.entries.map { it.kod },
        )
        assertEquals(IstasyonDurumu.ARIZA, IstasyonDurumu.coz("ariza"))
        assertNull(IstasyonDurumu.coz("yeni-durum"))
    }

    @Test
    fun `parca geri sayimi tezgahtaki son uretim girisinden baslar`() {
        // Sunucu 10:00:40'ta sordu, son giris 10:00:00; sorgudan beri 10 sn: 90 - (40 + 10) = 40.
        val son = 1_000_000L
        assertEquals(40L, GeriSayim.parcaKalan(90, son, son + 40_000, 10, calisiyor = true))
        assertEquals(0L, GeriSayim.parcaKalan(90, son, son + 80_000, 30, calisiyor = true))
        // Calismiyorsa sorgudan beri gecen sure islemez: sayim sorgudaki degerde durur.
        assertEquals(50L, GeriSayim.parcaKalan(90, son, son + 40_000, 10, calisiyor = false))
        assertNull(GeriSayim.parcaKalan(90, null, son, 10, calisiyor = true))
        assertNull(GeriSayim.parcaKalan(null, son, son, 10, calisiyor = true))
        assertNull(GeriSayim.parcaKalan(90, son, null, 10, calisiyor = true))
    }

    @Test
    fun `emir geri sayimi bu parca ve kalan parcalarin birim suresi`() {
        assertEquals(40L + 7 * 90, GeriSayim.emirKalan(40, 90, hedef = 10, saglam = 2))
        assertEquals(40L, GeriSayim.emirKalan(40, 90, hedef = 10, saglam = 9))
        assertEquals(0L, GeriSayim.emirKalan(40, 90, hedef = 10, saglam = 10))
        assertNull(GeriSayim.emirKalan(null, 90, hedef = 10, saglam = 2))
        assertNull(GeriSayim.emirKalan(40, 90, hedef = 10, saglam = null))
    }

    @Test
    fun `sure metni`() {
        assertEquals("01:05", GeriSayim.metin(65))
        assertEquals("2 sa 05 dk", GeriSayim.metin(7500))
        assertEquals("veri yok", GeriSayim.metin(null))
    }

    @Test
    fun `kod uc rakam bosluk uc rakam gosterilir`() {
        assertEquals("042 719", Eslesme.kodMetni("042719"))
        assertEquals("12", Eslesme.kodMetni("12"))
    }

    @Test
    fun `sunucu adresi yalniz https kok adres olarak kabul edilir`() {
        assertEquals("https://tmi.ornek.local:8443", SunucuAdresi.duzelt(" tmi.ornek.local:8443/ "))
        assertEquals("https://10.0.0.5", SunucuAdresi.duzelt("https://10.0.0.5"))
        assertNull(SunucuAdresi.duzelt("http://10.0.0.5"))
        assertNull(SunucuAdresi.duzelt(""))
        assertNull(SunucuAdresi.duzelt("https://tmi.ornek.local/api"))
        assertNull(SunucuAdresi.duzelt("https://tmi.ornek.local:99999"))
        assertNull(SunucuAdresi.duzelt("ftp://tmi.ornek.local"))
    }

    @Test
    fun `titresim deseni uyari turune gore`() {
        assertArrayEquals(longArrayOf(0, 400, 150, 400, 150, 400), Titresim.desen("ariza"))
        assertArrayEquals(longArrayOf(0, 400, 150, 400, 150, 400), Titresim.desen("durus"))
        assertArrayEquals(longArrayOf(0, 80), Titresim.desen("bakim"))
        assertArrayEquals(longArrayOf(0, 80), Titresim.desen("kalibrasyon"))
        assertArrayEquals(longArrayOf(0, 80, 80, 80, 80, 80), Titresim.desen("kalite"))
        assertArrayEquals(longArrayOf(0, 250, 120, 80, 120, 80), Titresim.desen("malzeme"))
        assertArrayEquals(longArrayOf(0, 60, 60, 300), Titresim.desen("bitti"))
        assertEquals(Titresim.dil.size, Titresim.dil.map { it.second.toList() }.toSet().size)
        assertNull(Titresim.desen("bilinmeyen"))
    }

    @Test
    fun `sertifika hatasi el sikismanin icinde de sertifika sayilir`() {
        val sarili = javax.net.ssl.SSLHandshakeException("el sikisma").apply {
            initCause(java.security.cert.CertPathValidatorException("guvenilen kok yok"))
        }
        assertEquals(BaglantiHatasi.SERTIFIKA, BaglantiHatasi.coz(sarili))
        assertEquals(BaglantiHatasi.SERTIFIKA, BaglantiHatasi.coz(javax.net.ssl.SSLPeerUnverifiedException("ad uymuyor")))
        assertEquals(BaglantiHatasi.SERTIFIKA, BaglantiHatasi.coz(java.io.IOException("sarmal", sarili)))
    }

    @Test
    fun `ad cozulemedi ve aga ulasilamadi ayri, bilinmeyen genel ileti`() {
        assertEquals(BaglantiHatasi.AD_COZULEMEDI, BaglantiHatasi.coz(java.net.UnknownHostException("tmi.kurum.ic")))
        assertEquals(BaglantiHatasi.AGA_ULASILAMADI, BaglantiHatasi.coz(java.net.ConnectException("reddedildi")))
        assertEquals(BaglantiHatasi.AGA_ULASILAMADI, BaglantiHatasi.coz(java.net.NoRouteToHostException("yol yok")))
        assertEquals(BaglantiHatasi.AGA_ULASILAMADI, BaglantiHatasi.coz(java.net.SocketTimeoutException("zaman asimi")))
        assertEquals(BaglantiHatasi.DIGER, BaglantiHatasi.coz(java.io.IOException("baglanti koptu")))
        assertEquals(4, BaglantiHatasi.entries.map { it.ileti }.toSet().size)
    }

    @Test
    fun `durum suresi saat ve dakika, bilinmiyorsa null`() {
        assertEquals("12 dk", DurumSuresi.metin(12 * 60 + 59))
        assertEquals("1 sa 05 dk", DurumSuresi.metin(3600 + 5 * 60))
        assertNull(DurumSuresi.metin(null))
    }

    @Test
    fun `sunucu zamani cihaz saat diliminde, bozuk zaman null`() {
        val istanbul = java.time.ZoneId.of("Europe/Istanbul")
        assertEquals("12:05", Zaman.saatDakika("2026-10-20T09:05:00Z", istanbul))
        assertEquals("12:05", Zaman.saatDakika("2026-10-20T12:05:30+03:00", istanbul))
        assertNull(Zaman.saatDakika("dun", istanbul))
        assertNull(Zaman.saatDakika(null, istanbul))
        val bas = Zaman.ms("2026-10-20T09:00:00Z")!!
        assertEquals(90L, Zaman.gecenSaniye("2026-10-20T09:00:00Z", bas + 90_500))
        assertEquals(0L, Zaman.gecenSaniye("2026-10-20T09:00:00Z", bas - 5_000))
    }

    @Test
    fun `sessiz saatte yalniz makine durdu ekrana gelir`() {
        assertEquals(true, UyariKurali.ekranaGelir("bakim", sessiz = false))
        assertEquals(false, UyariKurali.ekranaGelir("bakim", sessiz = true))
        assertEquals(true, UyariKurali.ekranaGelir("ariza", sessiz = true))
        assertEquals(true, UyariKurali.ekranaGelir("durus", sessiz = true))
    }

    @Test
    fun `doner cerceve esikte bir istasyon gecer, uclarda durur`() {
        assertEquals(0, Cerceve.adim(39f))
        assertEquals(1, Cerceve.adim(40f))
        assertEquals(-1, Cerceve.adim(-55f))
        val idler = listOf(4, 9, 2)
        assertEquals(2, Cerceve.komsu(idler, 9, 1))
        assertEquals(4, Cerceve.komsu(idler, 9, -1))
        assertNull(Cerceve.komsu(idler, 2, 1))
        assertNull(Cerceve.komsu(idler, 7, 1))
        assertNull(Cerceve.komsu(idler, 9, 0))
    }

    @Test
    fun `yeni uyari onceki sorguda olmayandir, ilk sorgu yeni degildir`() {
        val a = UyariKurali.anahtar("durus", 1, null, "UE-1", "2026-10-20T09:00:00Z")
        val b = UyariKurali.anahtar("ariza", 2, null, null, null)
        assertEquals("ariza|2|||", b)
        assertEquals("kalibrasyon||7||", UyariKurali.anahtar("kalibrasyon", null, 7, null, null))
        assertNull(UyariKurali.yeni(null, listOf(a)))
        assertNull(UyariKurali.yeni(setOf(a), listOf(a)))
        assertEquals(b, UyariKurali.yeni(setOf(a), listOf(a, b)))
        assertNull(UyariKurali.yeni(emptySet(), listOf(b), gorulen = setOf(b)))
        assertEquals(a, UyariKurali.yeni(emptySet(), listOf(b, a), gorulen = setOf(b)))
    }

    private fun metinYuku(dil: String, metin: String): ByteArray =
        byteArrayOf(dil.length.toByte()) + dil.toByteArray(Charsets.US_ASCII) + metin.toByteArray(Charsets.UTF_8)

    @Test
    fun `nfc metin kaydindan istasyon kodu okunur, dil kodu atlanir`() {
        assertEquals("CNC-07", NfcEtiketi.kod(1, "T".toByteArray(), metinYuku("tr", " CNC-07\n")))
        assertEquals("CNC-07", NfcEtiketi.kod(2, "text/plain".toByteArray(), "CNC-07".toByteArray()))
    }

    @Test
    fun `nfc baska tur, bos, bozuk ya da asiri uzun kayit kod vermez`() {
        assertNull(NfcEtiketi.kod(1, "U".toByteArray(), metinYuku("tr", "CNC-07")))
        assertNull(NfcEtiketi.kod(4, "T".toByteArray(), metinYuku("tr", "CNC-07")))
        assertNull(NfcEtiketi.kod(1, "T".toByteArray(), metinYuku("tr", "   ")))
        assertNull(NfcEtiketi.kod(1, "T".toByteArray(), byteArrayOf()))
        assertNull(NfcEtiketi.kod(1, "T".toByteArray(), byteArrayOf(9, 't'.code.toByte())))
        assertNull(NfcEtiketi.kod(2, "text/plain".toByteArray(), "A".repeat(65).toByteArray()))
        assertNull(NfcEtiketi.kod(2, "text/plain".toByteArray(), "CNC\u000107".toByteArray()))
    }

    @Test
    fun `nfc kodu listede harf farki gozetmeden bulunur, yoksa null`() {
        val liste = listOf(1 to "CNC-07", 2 to null, 3 to "TOR-01")
        assertEquals(1, NfcEtiketi.bul(liste, "cnc-07") { it.second }?.first)
        assertNull(NfcEtiketi.bul(liste, "FRZ-09") { it.second })
    }

    @Test
    fun `vardiya toplam durusu yalniz bilinenlerden, hic yoksa null`() {
        assertEquals(900, VardiyaOzeti.toplamDurus(listOf(600, null, 300)))
        assertEquals(0, VardiyaOzeti.toplamDurus(listOf(0, null)))
        assertNull(VardiyaOzeti.toplamDurus(listOf(null, null)))
        assertNull(VardiyaOzeti.toplamDurus(emptyList()))
    }

    @Test
    fun `bugunku uretim yalniz sayimi olan istasyonlardan toplanir, hic yoksa null`() {
        assertEquals(Adet(9, 2), VardiyaOzeti.toplamUretim(listOf(Adet(4, 0), null, Adet(5, 2))))
        assertEquals(Adet(0, 0), VardiyaOzeti.toplamUretim(listOf(Adet(0, 0))))
        assertNull(VardiyaOzeti.toplamUretim(listOf(null, null)))
    }

    @Test
    fun `yonetici ozeti durum sayilari, bilinmeyen durum ayri`() {
        val s = YoneticiOzeti.durumSayilari(listOf("calisiyor", "ariza", "calisiyor", "yeni-durum", "durdu"))
        assertEquals(2, s[IstasyonDurumu.CALISIYOR])
        assertEquals(1, s[IstasyonDurumu.ARIZA])
        assertEquals(1, s[IstasyonDurumu.DURDU])
        assertEquals(1, s[null])
        assertNull(s[IstasyonDurumu.BAKIM])
    }

    @Test
    fun `yonetici ozetinde en uzun duran once gelir, baslangici bilinmeyen sona kalir`() {
        val sira = YoneticiOzeti.duranSirasi(
            listOf(1 to "2026-10-20T09:00:00Z", 2 to null, 3 to "2026-10-20T07:30:00Z", 4 to "bozuk"),
        )
        assertEquals(listOf(3, 1, 2, 4), sira)
    }

    @Test
    fun `onizleme karesi tacla doner, uclarda basa sarar, bos listede yoktur`() {
        val kareler = listOf(0, 1, 2, 5)
        assertEquals(1, OnizlemeKaresi.sonraki(kareler, 0, 1))
        assertEquals(0, OnizlemeKaresi.sonraki(kareler, 5, 1))
        assertEquals(5, OnizlemeKaresi.sonraki(kareler, 0, -1))
        assertEquals("listede olmayan kare ilk kareye doner", 0, OnizlemeKaresi.sonraki(kareler, 7, 1))
        assertEquals(2, OnizlemeKaresi.sonraki(kareler, 2, 0))
        assertNull(OnizlemeKaresi.sonraki(emptyList(), 0, 1))
    }

    @Test
    fun `kadran once dikkat isteyen istasyonlari gosterir, ayni durumda sira korunur`() {
        val durumlar = listOf("calisiyor", "bos", "durdu", "bakim", "calisiyor", "ariza", "yeni-durum")
        assertEquals(listOf(2, 5, 3), Kadran.gosterilecek(durumlar))
        assertEquals(listOf(2, 5, 3, 0, 4), Kadran.gosterilecek(durumlar, enCok = 5))
        assertEquals(emptyList<Int>(), Kadran.gosterilecek(emptyList()))
    }

    @Test
    fun `kadran halkasi bilinen adetlerin toplamidir, adet yoksa bos kalir`() {
        assertEquals(0.5f, Kadran.toplamOran(listOf(10 to 20, 5 to 10))!!, 0.0001f)
        assertEquals("adeti bilinmeyen emir toplama girmez", 0.5f, Kadran.toplamOran(listOf(10 to 20, null to 50))!!, 0.0001f)
        assertEquals("hedefi asan uretim halkayi tasirmaz", 1f, Kadran.toplamOran(listOf(30 to 20))!!, 0.0001f)
        assertNull(Kadran.toplamOran(listOf(null to 20)))
        assertNull("hedefi sifir emir orani uydurmaz", Kadran.toplamOran(listOf(0 to 0)))
        assertNull(Kadran.toplamOran(emptyList()))
    }

    @Test
    fun `kadran istasyon ozeti once ariza ve durani sayar, yoksa calisani yazar`() {
        val liste = listOf("A" to "calisiyor", "B" to "durakli", "C" to "durdu", "D" to "bakim", "E" to "ariza")
        assertEquals("4 istasyon dikkat" to "C durdu, E arıza, B duraklı", Kadran.ozet(liste))
        assertEquals("İstasyonlar" to "1/2 çalışıyor", Kadran.ozet(listOf("A" to "calisiyor", "B" to "bos")))
        assertEquals("bilinmeyen durum dikkat sayilmaz", "İstasyonlar" to "0/1 çalışıyor", Kadran.ozet(listOf("A" to "yeni-durum")))
        assertEquals("İstasyonlar" to "İstasyon yok", Kadran.ozet(emptyList()))
    }
}
