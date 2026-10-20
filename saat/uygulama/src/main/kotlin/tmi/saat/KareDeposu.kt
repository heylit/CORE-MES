package tmi.saat

import android.content.Context
import java.io.File

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
