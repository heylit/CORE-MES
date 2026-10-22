package tmi.saat.cekirdek

import java.util.Locale

// Sunucunun saat sozlesmesi (paylasilan/sozlesme/saat.ts) ile ayni adlar. Olculemeyen deger null'dir; ekran "veri yok" yazar.

enum class IstasyonDurumu(val kod: String, val etiket: String) {
    ARIZA("ariza", "Arıza"),
    BAKIM("bakim", "Bakım"),
    DURDU("durdu", "Durdu"),
    DURAKLI("durakli", "Duraklı"),
    CALISIYOR("calisiyor", "Çalışıyor"),
    BEKLIYOR("bekliyor", "Bekliyor"),
    BOS("bos", "Boş");

    companion object {
        // Bilinmeyen durum (yeni sunucu, eski saat) bos sayilmaz: ekran onu ayri gosterir.
        fun coz(kod: String): IstasyonDurumu? = entries.firstOrNull { it.kod == kod }
    }
}

// Titresim dili ornek ekrandakiyle ayni: makine durdu (ariza ya da durus) uc uzun, kalite uc kisa, malzeme uzun ve iki kisa,
// emir tamamlandi kisa ve uzun, kalibrasyon ve bakim tek kisa. Milisaniye: bekle, titre, bekle...
object Titresim {
    val MAKINE_DURDU = longArrayOf(0, 400, 150, 400, 150, 400)
    val KALITE = longArrayOf(0, 80, 80, 80, 80, 80)
    val MALZEME = longArrayOf(0, 250, 120, 80, 120, 80)
    val TEK_KISA = longArrayOf(0, 80)
    val BITTI = longArrayOf(0, 60, 60, 300)

    fun desen(uyariTuru: String): LongArray? = when (uyariTuru) {
        "ariza", "durus" -> MAKINE_DURDU
        "kalite" -> KALITE
        "malzeme" -> MALZEME
        "bitti" -> BITTI
        "bakim", "kalibrasyon" -> TEK_KISA
        else -> null
    }

    // Ayarlar ekranindaki titresim dili listesi: ad ve desen.
    val dil: List<Pair<String, LongArray>> = listOf(
        "Makine durdu: üç uzun" to MAKINE_DURDU,
        "Kalite onayı: üç kısa" to KALITE,
        "Malzeme eksik: uzun ve iki kısa" to MALZEME,
        "Emir tamamlandı: kısa ve uzun" to BITTI,
        "Bakım, kalibrasyon: tek kısa" to TEK_KISA,
    )
}

object GeriSayim {
    // Parca geri sayimi tezgahta girilen son uretim sayimindan baslar (plandaki baslangictan degil). Gecen sure sunucu
    // saatiyle olculur (saat saati kaymis olabilir); calisirken sorgudan beri gecen sure eklenir, durunca sayim durur.
    // Duraklama son giristen sonra olduysa o sure de dusulur: duraklama anini sunucu vermez. Giris yoksa null.
    fun parcaKalan(birimSn: Int?, sonUretimMs: Long?, sunucuMs: Long?, sorgudanBeriSn: Long, calisiyor: Boolean): Long? {
        if (birimSn == null || sonUretimMs == null || sunucuMs == null) return null
        val gecen = maxOf(0L, (sunucuMs - sonUretimMs) / 1000) + if (calisiyor) sorgudanBeriSn else 0L
        return maxOf(0L, birimSn - gecen)
    }

    // Emir bitisine: bu parcanin kalani ve geri kalan parcalarin birim suresi.
    fun emirKalan(parcaKalanSn: Long?, birimSn: Int?, hedef: Int, saglam: Int?): Long? {
        if (parcaKalanSn == null || birimSn == null || saglam == null) return null
        if (saglam >= hedef) return 0L
        return parcaKalanSn + (hedef - saglam - 1).toLong() * birimSn
    }

    fun metin(sn: Long?): String {
        if (sn == null) return "veri yok"
        val sa = sn / 3600
        val dk = (sn % 3600) / 60
        val s = sn % 60
        return if (sa > 0) "%d sa %02d dk".format(sa, dk) else "%02d:%02d".format(dk, s)
    }
}

// Ornek ekrandaki durum suresi: saatte "1 sa 05 dk", altinda "12 dk". Bilinmiyorsa null.
object DurumSuresi {
    fun metin(sn: Long?): String? {
        if (sn == null) return null
        val sa = sn / 3600
        val dk = (sn % 3600) / 60
        return if (sa > 0) "%d sa %02d dk".format(sa, dk) else "%d dk".format(dk)
    }
}

object Zaman {
    // Sunucu zamani ISO 8601 (Z ya da ofsetli). Okunamazsa null: bozuk alan ekrani kapatmaz.
    fun ms(iso: String?): Long? = iso?.let { runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull() }

    fun saatDakika(iso: String?, bolge: java.time.ZoneId = java.time.ZoneId.systemDefault()): String? =
        ms(iso)?.let { java.time.Instant.ofEpochMilli(it).atZone(bolge).let { z -> "%02d:%02d".format(z.hour, z.minute) } }

    fun gecenSaniye(iso: String?, simdiMs: Long): Long? = ms(iso)?.let { maxOf(0L, (simdiMs - it) / 1000) }
}

// Vardiya bitisine geri sayim (karar 81 a: hedef verisi yok). Saatin saati kaymis olabilir: kalan sunucu anina gore olculur,
// sorgudan beri gecen eklenir.
object VardiyaSayaci {
    fun kalanSn(bitisMs: Long?, sunucuMs: Long?, sorgudanBeriSn: Long): Long? {
        if (bitisMs == null || sunucuMs == null) return null
        return maxOf(0L, (bitisMs - sunucuMs) / 1000 - sorgudanBeriSn)
    }

    // Kadrandaki sayac saatin kendi saatiyle sayar: sunucudaki bitis saatin saatine cevrilir.
    fun cihazdakiBitis(bitisMs: Long, sunucuMs: Long, cihazMs: Long): Long = bitisMs - sunucuMs + cihazMs

    // Vardiyanin gecen payi [0, 1]; bos ya da ters aralikta null.
    fun gecenOran(baslangicMs: Long?, bitisMs: Long?, simdiMs: Long?): Float? {
        if (baslangicMs == null || bitisMs == null || simdiMs == null || bitisMs <= baslangicMs) return null
        return ((simdiMs - baslangicMs).toFloat() / (bitisMs - baslangicMs)).coerceIn(0f, 1f)
    }
}

// Doner cerceve: ayrintida bir sonraki ya da onceki istasyona gecer. Kaydirma birikir; esik asilinca bir adim, uclarda durur.
object Cerceve {
    const val ESIK = 40f

    fun adim(birikim: Float): Int = when {
        birikim >= ESIK -> 1
        birikim <= -ESIK -> -1
        else -> 0
    }

    fun komsu(idler: List<Int>, simdiki: Int, yon: Int): Int? {
        val k = idler.indexOf(simdiki)
        if (k < 0 || yon == 0) return null
        return idler.getOrNull(k + yon)
    }
}

// Uyari kimligi: ayni istasyonda yeni baslayan durus yeni uyaridir. "Gordum" denen uyari bu anahtarla listeden duser.
object UyariKurali {
    // Kalibrasyon uyarisinin istasyonu yoktur; yeri aletin kimligi tutar.
    fun anahtar(tur: String, istasyonId: Int?, aletId: Int?, emirNo: String?, baslangic: String?): String =
        "$tur|${istasyonId ?: ""}|${aletId ?: ""}|${emirNo.orEmpty()}|${baslangic.orEmpty()}"

    // Molada (sessiz saat) yalniz makine durdu ekrana gelir ve titrer; digerleri sessizce listeye duser.
    fun ekranaGelir(tur: String, sessiz: Boolean): Boolean = !sessiz || tur == "ariza" || tur == "durus"

    // Onceki sorguda olmayan ve "Gordum" denmemis ilk uyari; ilk sorgu (once null) uyari degildir. Bir sorguda dusup
    // ayni anahtarla donen gorulmus uyari yeniden acilmaz.
    fun yeni(once: Set<String>?, simdi: List<String>, gorulen: Set<String> = emptySet()): String? =
        once?.let { o -> simdi.firstOrNull { it !in o && it !in gorulen } }
}

object Eslesme {
    // Saat onay sorusunu bu aralikla yineler; istek 10 dakika gecerlidir (sunucu kurali), en cok 40 soru.
    const val SORU_ARALIGI_MS = 15_000L

    // Kod saatte uc rakam, bosluk, uc rakam okunur (telefona yazarken kaybolmasin).
    fun kodMetni(kod: String): String = if (kod.length == 6) "${kod.substring(0, 3)} ${kod.substring(3)}" else kod
}

// Sunucu adresi saatte bir kez elle girilir; depoya ve derlemeye girmez. Yalniz https kabul edilir (uygulama sifresiz
// baglantiyi kapatir): sema yazilmazsa https eklenir, http reddedilir. Sonuc sondaki egik cizgisiz kok adrestir.
object SunucuAdresi {
    private val bicim = Regex("^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$")

    fun duzelt(girdi: String): String? {
        val temiz = girdi.trim().trimEnd('/')
        if (temiz.isEmpty() || temiz.startsWith("http://", ignoreCase = true)) return null
        val tam = if (temiz.contains("://")) temiz else "https://$temiz"
        if (!bicim.matches(tam)) return null
        val port = tam.substringAfterLast(':', "").toIntOrNull()
        if (tam.count { it == ':' } == 2 && (port == null || port !in 1..65535)) return null
        return tam
    }
}

// Baglanti hatasi turu, istisnanin neden zincirinden okunur. Sertifika once bakilir: OkHttp sertifika hatasini
// SSLHandshakeException icinde CertPathValidatorException olarak verir. Tek ileti "ulasilamiyor" sunucuya hic istek
// gitmeyen sertifika hatasini Wi-Fi sorunu gibi gosteriyordu.
enum class BaglantiHatasi(val ileti: String) {
    SERTIFIKA("Sunucu sertifikasına güvenilmiyor (TLS). Kurum kökünü ve sunucu adını denetleyin."),
    AD_COZULEMEDI("Sunucu adı çözülemedi. Adresi ve ağın DNS'ini denetleyin."),
    AGA_ULASILAMADI("Sunucuya ağdan ulaşılamıyor. Wi-Fi'ı, adresi ve portu denetleyin."),
    DIGER("Sunucuya ulaşılamıyor.");

    companion object {
        fun coz(hata: Throwable): BaglantiHatasi {
            val zincir = generateSequence(hata) { it.cause }.take(10).toList()
            return when {
                zincir.any { it is javax.net.ssl.SSLException || it is java.security.cert.CertificateException ||
                    it is java.security.cert.CertPathValidatorException } -> SERTIFIKA
                zincir.any { it is java.net.UnknownHostException } -> AD_COZULEMEDI
                zincir.any { it is java.net.ConnectException || it is java.net.NoRouteToHostException ||
                    it is java.net.SocketTimeoutException || it is java.net.PortUnreachableException } -> AGA_ULASILAMADI
                else -> DIGER
            }
        }
    }
}

// Istasyon NFC etiketi (297 a): etiket yalniz istasyon kodunu tasir; saat okur, yazmaz.
// Kabul edilen kayitlar: NDEF metin kaydi (TNF 1, tur "T") ve duz metin MIME kaydi (TNF 2, "text/plain").
object NfcEtiketi {
    private const val TNF_BILINEN: Short = 1
    private const val TNF_MIME: Short = 2
    private const val EN_UZUN_KOD = 64

    fun kod(tnf: Short, tur: ByteArray, yuk: ByteArray): String? {
        val metin = when {
            tnf == TNF_BILINEN && tur.contentEquals(byteArrayOf('T'.code.toByte())) -> metinKaydi(yuk)
            tnf == TNF_MIME && String(tur, Charsets.US_ASCII).equals("text/plain", ignoreCase = true) -> String(yuk, Charsets.UTF_8)
            else -> null
        } ?: return null
        val kod = metin.trim()
        return kod.takeIf { it.isNotEmpty() && it.length <= EN_UZUN_KOD && it.none(Char::isISOControl) }
    }

    // Ilk bayt: bit 7 UTF-16, alt 6 bit dil kodu uzunlugu; metin dil kodundan sonra baslar.
    private fun metinKaydi(yuk: ByteArray): String? {
        if (yuk.isEmpty()) return null
        val durum = yuk[0].toInt()
        val dil = durum and 0x3F
        if (1 + dil > yuk.size) return null
        val kodlama = if (durum and 0x80 != 0) Charsets.UTF_16 else Charsets.UTF_8
        return String(yuk, 1 + dil, yuk.size - 1 - dil, kodlama)
    }

    // Kod buyuk-kucuk harf ve bosluk farkiyla eslesir; kapsam disi istasyon listede olmadigi icin bulunmaz.
    fun <T> bul(istasyonlar: List<T>, kod: String, kodu: (T) -> String?): T? =
        istasyonlar.firstOrNull { kodu(it)?.trim()?.equals(kod, ignoreCase = true) == true }
}

// Vardiya devri ozeti (ornekteki "Vardiya devri"): gun basindan beri toplam durus. Hicbir istasyonda veri yoksa null.
// Penceredeki net sayim (sunucu: istasyon.bugun); saglam duzeltmeyle eksi olabilir.
data class Adet(val saglam: Int, val hurda: Int)

object VardiyaOzeti {
    fun toplamDurus(saniyeler: List<Int?>): Int? = saniyeler.filterNotNull().takeIf { it.isNotEmpty() }?.sum()

    // Sayimi olmayan istasyon sifir sayilmaz; hicbirinde sayim yoksa toplam da yoktur.
    fun toplamUretim(adetler: List<Adet?>): Adet? =
        adetler.filterNotNull().takeIf { it.isNotEmpty() }?.let { l -> Adet(l.sumOf { it.saglam }, l.sumOf { it.hurda }) }
}

// Yonetici ozeti yalniz okur; veriyi kisinin kapsamindaki istasyonlardan alir (sunucu suzer).
object YoneticiOzeti {
    // Bilinmeyen durum kodu (yeni sunucu, eski saat) null anahtarinda sayilir.
    fun durumSayilari(kodlar: List<String>): Map<IstasyonDurumu?, Int> = kodlar.groupingBy { IstasyonDurumu.coz(it) }.eachCount()

    // Duran istasyonlar en uzun durandan; baslangici bilinmeyen ya da okunamayan sona, kendi sirasiyla.
    fun duranSirasi(satirlar: List<Pair<Int, String?>>): List<Int> =
        satirlar.sortedWith(compareBy(nullsLast()) { Zaman.ms(it.second) }).map { it.first }
}

// Parca onizlemesi: Cizim Merkezi'nin urettigi aci kareleri; tac bir yone bir kare cevirir, uclarda basa sarar.
object OnizlemeKaresi {
    fun sonraki(kareler: List<Int>, simdiki: Int, yon: Int): Int? {
        if (kareler.isEmpty()) return null
        val k = kareler.indexOf(simdiki)
        if (k < 0) return kareler.first()
        return kareler[Math.floorMod(k + yon, kareler.size)]
    }
}

// Kadran: kucuk alanda en cok uc istasyon; once dikkat isteyen (ariza, durus), sonra bakim ve duraklama, sonra calisan.
// Halka, adeti bilinen emirlerin toplam saglam / toplam hedefidir; adet yoksa halka bos kalir, sifir uydurulmaz.
object Kadran {
    private fun oncelik(d: IstasyonDurumu?): Int = when (d) {
        IstasyonDurumu.ARIZA, IstasyonDurumu.DURDU -> 0
        IstasyonDurumu.BAKIM, IstasyonDurumu.DURAKLI -> 1
        IstasyonDurumu.CALISIYOR -> 2
        IstasyonDurumu.BEKLIYOR -> 3
        IstasyonDurumu.BOS, null -> 4
    }

    fun gosterilecek(durumlar: List<String>, enCok: Int = 3): List<Int> =
        durumlar.indices.sortedBy { oncelik(IstasyonDurumu.coz(durumlar[it])) }.take(enCok)

    // Kadranin istasyon kutucugu: baslik kac istasyonun dikkat istedigi, metin en cok uc tanesi ("Ad durum").
    // Dikkat isteyen yoksa calisan sayisi yazilir; istasyon yoksa uydurma sayi yazilmaz.
    fun ozet(istasyonlar: List<Pair<String, String>>, enCok: Int = 3): Pair<String, String> {
        if (istasyonlar.isEmpty()) return "İstasyonlar" to "İstasyon yok"
        val dikkat = istasyonlar.indices.filter { oncelik(IstasyonDurumu.coz(istasyonlar[it].second)) <= 1 }
        if (dikkat.isEmpty()) {
            val calisan = istasyonlar.count { IstasyonDurumu.coz(it.second) == IstasyonDurumu.CALISIYOR }
            return "İstasyonlar" to "$calisan/${istasyonlar.size} çalışıyor"
        }
        val sirali = dikkat.sortedBy { oncelik(IstasyonDurumu.coz(istasyonlar[it].second)) }.take(enCok)
        val metin = sirali.joinToString(", ") { k ->
            val (ad, durum) = istasyonlar[k]
            "$ad ${(IstasyonDurumu.coz(durum)?.etiket ?: durum).lowercase(Locale("tr"))}"
        }
        return "${dikkat.size} istasyon dikkat" to metin
    }

    // Kadranin durum cubugu: calisiyor / durus (durdu, duraklama, bakim) / ariza / bosta (bekliyor, bos, bilinmeyen) sayilari.
    // Istasyon yoksa null: bos cubuk "hepsi bosta" gibi okunmasin.
    fun dagilim(durumlar: List<String>): IntArray? {
        if (durumlar.isEmpty()) return null
        val sayi = IntArray(4)
        for (d in durumlar) {
            sayi[when (IstasyonDurumu.coz(d)) {
                IstasyonDurumu.CALISIYOR -> 0
                IstasyonDurumu.DURDU, IstasyonDurumu.DURAKLI, IstasyonDurumu.BAKIM -> 1
                IstasyonDurumu.ARIZA -> 2
                IstasyonDurumu.BEKLIYOR, IstasyonDurumu.BOS, null -> 3
            }]++
        }
        return sayi
    }

    fun toplamOran(adetler: List<Pair<Int?, Int>>): Float? {
        val bilinen = adetler.filter { it.first != null }
        val hedef = bilinen.sumOf { it.second }
        if (hedef <= 0) return null
        return (bilinen.sumOf { it.first!! }.toFloat() / hedef).coerceIn(0f, 1f)
    }
}
