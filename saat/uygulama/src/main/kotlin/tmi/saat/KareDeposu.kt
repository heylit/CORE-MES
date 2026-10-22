package tmi.saat

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// Onizleme kareleri saatin onbellek klasorunde saklanir: ayni revizyonun karesi bir kez iner (pil ve ag).
// Anahtar sunucunun verdigi revizyon kimligidir; yeni revizyon yeni dosyadir, eskiler sistem yer isteyince silinir.
class KareDeposu(baglam: Context) {
    private val klasor = File(baglam.cacheDir, "onizleme").apply { mkdirs() }

    private fun dosya(revizyonId: Int, kare: Int) = File(klasor, "${revizyonId}_$kare.png")

    fun oku(revizyonId: Int, kare: Int): ByteArray? = dosya(revizyonId, kare).takeIf { it.isFile }?.readBytes()

    fun yaz(revizyonId: Int, kare: Int, bayt: ByteArray) {
        val gecici = File(klasor, "${revizyonId}_$kare.tmp")
        gecici.writeBytes(bayt)
        gecici.renameTo(dosya(revizyonId, kare))
    }
}

// Kare once saatteki onbellekten, yoksa sunucudan bir kez; dosya islemleri ana is parcaciginda kosmaz.
suspend fun KareDeposu.getir(revizyonId: Int, kare: Int, indir: suspend () -> ByteArray): ByteArray =
    withContext(Dispatchers.IO) { oku(revizyonId, kare) } ?: indir().also { b -> withContext(Dispatchers.IO) { yaz(revizyonId, kare, b) } }

// PNG cozumu ana is parcaciginda kosmaz (kaydirma takilir). Kare ekrandan buyukse ikinin kuvvetiyle kucultulerek cozulur:
// bellek ve cozum suresi kare boyuna degil ekran boyuna gore olur.
suspend fun kareCoz(bayt: ByteArray, enCokPiksel: Int): ImageBitmap? = withContext(Dispatchers.Default) {
    val boyut = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bayt, 0, bayt.size, boyut)
    var kucultme = 1
    while (enCokPiksel > 0 && maxOf(boyut.outWidth, boyut.outHeight) / (kucultme * 2) >= enCokPiksel) kucultme *= 2
    BitmapFactory.decodeByteArray(bayt, 0, bayt.size, BitmapFactory.Options().apply { inSampleSize = kucultme })?.asImageBitmap()
}
