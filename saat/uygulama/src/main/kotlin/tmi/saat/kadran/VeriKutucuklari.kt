package tmi.saat.kadran

import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.CountDownTimeReference
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.data.SmallImage
import androidx.wear.watchface.complications.data.SmallImageComplicationData
import androidx.wear.watchface.complications.data.SmallImageType
import androidx.wear.watchface.complications.data.TimeDifferenceComplicationText
import androidx.wear.watchface.complications.data.TimeDifferenceStyle
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import java.io.File
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import tmi.saat.AnaEtkinlik
import tmi.saat.Api
import tmi.saat.ApiHatasi
import tmi.saat.Depo
import tmi.saat.Istasyon
import tmi.saat.cekirdek.Kadran
import tmi.saat.cekirdek.VardiyaSayaci
import tmi.saat.cekirdek.Zaman

// Watch Face Format kadrani (ayri, kodsuz APK: saat/kadran) veri cekemez; veriyi bu kutucuklardan alir (375 a).
// Sistem kutucugu manifestteki surede bir ister (pil); ag hatasinda null doner ve kadran son degeri gostermeye devam eder.
// Kurum logosu gunde bir yenilenir; arada saatin onbelleginden verilir.
private const val LOGO_TAZELIK_MS = 24 * 60 * 60_000L
private const val ESLESMEDI = "TMI'ı açıp eşleştirin"

private fun metin(m: String) = PlainComplicationText.Builder(m).build()

// Askida kalan (suspend) taban sinif ayri -ktx paketindedir; onayli paket (375 a) yalniz dinleyicili olandir.
abstract class TmiKutucugu : ComplicationDataSourceService() {
    private val kapsam = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    protected val depo by lazy { Depo(this) }
    protected val api by lazy { Api({ depo.sunucu }) { depo.belirtec } }
    protected val eslesti get() = depo.sunucu != null && depo.belirtec != null

    // Her kutucuk kendi sayfasini acar (86, 6.4). Istek kodu sayfaya gore ayridir: ayni kodla FLAG_UPDATE_CURRENT oteki
    // kutucugun sayfasini ezerdi.
    protected abstract val sayfa: String

    protected fun dokunus(): PendingIntent = PendingIntent.getActivity(
        this,
        sayfa.hashCode(),
        Intent(this, AnaEtkinlik::class.java)
            .putExtra(AnaEtkinlik.ACILIS, sayfa)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    abstract suspend fun veri(request: ComplicationRequest): ComplicationData?

    override fun onComplicationRequest(request: ComplicationRequest, listener: ComplicationRequestListener) {
        kapsam.launch {
            val d = try {
                veri(request)
            } catch (_: RuntimeException) {
                // Beklenmeyen hata kutucugu bozmasin: null'da kadran son degeri gosterir.
                null
            }
            listener.onComplicationData(d)
        }
    }

    override fun onDestroy() {
        kapsam.cancel()
        super.onDestroy()
    }

    protected suspend fun istasyonlar(): List<Istasyon>? = try {
        api.istasyonlar()
    } catch (_: ApiHatasi) {
        null
    }
}

// Acik emirlerin toplam ilerlemesi; adeti bilinen emir yoksa halka bos kalir (sifir uydurulmaz). Dokununca yonetici ozeti
// (uretilen ve acik isler); saatte ayri emir listesi ekrani yok.
class EmirHalkasi : TmiKutucugu() {
    override val sayfa = AnaEtkinlik.OZET

    override suspend fun veri(request: ComplicationRequest): ComplicationData? {
        if (!eslesti) return NoDataComplicationData()
        val liste = istasyonlar() ?: return null
        val oran = Kadran.toplamOran(liste.mapNotNull { i -> i.emir?.let { it.saglam to it.hedef } }) ?: return NoDataComplicationData()
        return halka(oran)
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        if (type == ComplicationType.RANGED_VALUE) halka(0.62f) else null

    private fun halka(oran: Float): ComplicationData {
        val yuzde = Math.round(oran * 100)
        return RangedValueComplicationData.Builder(yuzde.toFloat(), 0f, 100f, metin("Açık emirler yüzde $yuzde"))
            .setText(metin("emirler %$yuzde"))
            .setTapAction(dokunus())
            .build()
    }
}

// Dikkat isteyen istasyonlar (ariza, durus, bakim, duraklama); yoksa calisan sayisi. Altinda durum dagilimi cubugu
// (gorsel): calisiyor / durus / ariza / bosta. Dokununca Istasyonlarim.
class IstasyonOzeti : TmiKutucugu() {
    override val sayfa = AnaEtkinlik.LISTE

    override suspend fun veri(request: ComplicationRequest): ComplicationData? {
        if (!eslesti) return uzun("TMI", ESLESMEDI, null)
        val liste = istasyonlar() ?: return null
        val (baslik, metin) = Kadran.ozet(liste.map { it.ad to it.durum })
        return uzun(baslik, metin, Kadran.dagilim(liste.map { it.durum }))
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        if (type == ComplicationType.LONG_TEXT) uzun("2 istasyon dikkat", "İstasyon 1 arıza, İstasyon 2 durdu", intArrayOf(5, 1, 1, 1)) else null

    private fun uzun(baslik: String, m: String, dagilim: IntArray?): ComplicationData =
        LongTextComplicationData.Builder(metin(m), metin("$baslik: $m"))
            .setTitle(metin(baslik))
            .apply { dagilim?.let { setSmallImage(SmallImage.Builder(Icon.createWithBitmap(cubuk(it)), SmallImageType.PHOTO).build()) } }
            .setTapAction(dokunus())
            .build()

    // Kadrandaki yer 240 x 8; iki kat cozunurlukte cizilir. Renkler uygulamadaki durum renkleriyle ayni.
    private fun cubuk(sayi: IntArray): Bitmap {
        val g = 480
        val y = 16
        val resim = Bitmap.createBitmap(g, y, Bitmap.Config.ARGB_8888)
        val tuval = Canvas(resim)
        val toplam = sayi.sum().coerceAtLeast(1)
        val boya = Paint(Paint.ANTI_ALIAS_FLAG)
        var x = 0f
        sayi.forEachIndexed { k, n ->
            if (n == 0) return@forEachIndexed
            val genislik = g * n.toFloat() / toplam
            boya.color = DAGILIM_RENKLERI[k]
            tuval.drawRect(x, 0f, x + genislik - 2f, y.toFloat(), boya)
            x += genislik
        }
        return resim
    }
}

// calisiyor, durus, ariza, bosta (Renkler.tamam, uyari, hata, sonuk).
private val DAGILIM_RENKLERI = intArrayOf(0xFF3CF0A8.toInt(), 0xFFFFA94D.toInt(), 0xFFFF5C7A.toInt(), 0xFF5D6675.toInt())

// Acik uyari sayisi (kadranin sol tusu). Deger sayi, en buyuk deger en az 1: kadran "> 0" ile rengi secer. Dokununca Uyarilar.
class UyariSayisi : TmiKutucugu() {
    override val sayfa = AnaEtkinlik.UYARILAR

    override suspend fun veri(request: ComplicationRequest): ComplicationData? {
        if (!eslesti) return NoDataComplicationData()
        val sayi = try {
            api.uyarilar().size
        } catch (_: ApiHatasi) {
            return null
        }
        return sayac(sayi)
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        if (type == ComplicationType.RANGED_VALUE) sayac(2) else null

    private fun sayac(sayi: Int): ComplicationData =
        RangedValueComplicationData.Builder(sayi.toFloat(), 0f, maxOf(1, sayi).toFloat(), metin("Açık uyarı $sayi"))
            .setText(metin(sayi.toString()))
            .setTapAction(dokunus())
            .build()
}

// Vardiya bitisine geri sayim (kadranin sag tusu, karar 81 a). Halka vardiyanin gecen payi; yazi sistemin kendi sayaci, her
// dakika ag istemeden azalir. Vardiya disinda ve takvimsiz kiside bos. Dokununca Vardiya devri.
class VardiyaKalan : TmiKutucugu() {
    override val sayfa = AnaEtkinlik.VARDIYA

    override suspend fun veri(request: ComplicationRequest): ComplicationData? {
        if (!eslesti) return NoDataComplicationData()
        val v = try {
            api.vardiya()
        } catch (_: ApiHatasi) {
            return null
        }
        val bilgi = v.vardiya ?: return NoDataComplicationData()
        val sunucu = Zaman.ms(v.zaman) ?: return null
        val bas = Zaman.ms(bilgi.baslangic) ?: return null
        val bit = Zaman.ms(bilgi.bitis) ?: return null
        val oran = VardiyaSayaci.gecenOran(bas, bit, sunucu) ?: return NoDataComplicationData()
        return kalan(oran, VardiyaSayaci.cihazdakiBitis(bit, sunucu, System.currentTimeMillis()))
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        if (type == ComplicationType.RANGED_VALUE) kalan(0.7f, System.currentTimeMillis() + 2 * 3_600_000L) else null

    private fun kalan(oran: Float, bitisMs: Long): ComplicationData {
        val sayac = TimeDifferenceComplicationText.Builder(TimeDifferenceStyle.SHORT_SINGLE_UNIT, CountDownTimeReference(Instant.ofEpochMilli(bitisMs)))
            .setMinimumTimeUnit(java.util.concurrent.TimeUnit.MINUTES)
            .build()
        return RangedValueComplicationData.Builder(oran * 100f, 0f, 100f, metin("Vardiya bitişine kalan"))
            .setText(sayac)
            .setTapAction(dokunus())
            .build()
    }
}

// Sistem Ayarlari'ndaki giris logosu; logo yoksa ya da eslesme yoksa "TMI" yazisi. Dokununca Tezgahlar 3B.
class KurumLogosu : TmiKutucugu() {
    override val sayfa = AnaEtkinlik.VITRIN

    override suspend fun veri(request: ComplicationRequest): ComplicationData? {
        if (!eslesti) return yazi()
        val dosya = File(cacheDir, "kurum-logosu")
        if (!dosya.isFile || System.currentTimeMillis() - dosya.lastModified() >= LOGO_TAZELIK_MS) {
            try {
                val b = api.kurumLogosu()
                if (b == null) dosya.delete() else dosya.writeBytes(b)
            } catch (_: ApiHatasi) {
                // Logo alinamazsa onbellekteki kalir.
            }
        }
        if (!dosya.isFile) return yazi()
        val logo: Bitmap = BitmapFactory.decodeFile(dosya.path) ?: return yazi()
        return SmallImageComplicationData.Builder(
            SmallImage.Builder(Icon.createWithBitmap(kutuya(logo)), SmallImageType.PHOTO).build(),
            metin("Kurum logosu"),
        ).setTapAction(dokunus()).build()
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        if (type == ComplicationType.SHORT_TEXT) yazi() else null

    private fun yazi(): ComplicationData =
        ShortTextComplicationData.Builder(metin("TMI"), metin("TMI")).setTapAction(dokunus()).build()

    // Kadrandaki logo yeri 8:5'tir; logo oranini koruyarak bu kutuya ortalanir, boylece kadran logoyu germez.
    private fun kutuya(logo: Bitmap): Bitmap {
        val kutu = Bitmap.createBitmap(160, 100, Bitmap.Config.ARGB_8888)
        val olcek = minOf(160f / logo.width, 100f / logo.height)
        val g = logo.width * olcek
        val y = logo.height * olcek
        Canvas(kutu).drawBitmap(logo, null, RectF((160 - g) / 2, (100 - y) / 2, (160 + g) / 2, (100 + y) / 2), Paint(Paint.FILTER_BITMAP_FLAG))
        return kutu
    }
}
