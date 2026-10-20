package tmi.saat

import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material.Colors
import tmi.saat.cekirdek.IstasyonDurumu

// Ornek ekranin (arastirma/akilli-saat/ornek) Arkon koyu renkleri tek yerde: siyah zemin, durum renkleri isikli.
object Renkler {
    val zemin = Color(0xFF000000)
    val panel = Color(0xFF12161D)
    val yazi = Color(0xFFF2F4F7)
    val soluk = Color(0xFF929CAB)
    val sonuk = Color(0xFF5D6675)
    val vurgu = Color(0xFFFFD23F)
    val vurguUstu = Color(0xFF161100)
    val tamam = Color(0xFF3CF0A8)
    val uyari = Color(0xFFFFA94D)
    val hata = Color(0xFFFF5C7A)
    val bilgi = Color(0xFF7FB2FF)
    val bos = Color(0xFF9AA4B2)
    val halkaZemini = Color(0xFF1D222A)

    val tema = Colors(primary = vurgu, onPrimary = vurguUstu, background = zemin, onBackground = yazi, surface = panel, onSurface = yazi, error = hata)

    fun durum(d: IstasyonDurumu?): Color = when (d) {
        IstasyonDurumu.ARIZA, IstasyonDurumu.DURDU -> hata
        IstasyonDurumu.BAKIM, IstasyonDurumu.DURAKLI -> uyari
        IstasyonDurumu.CALISIYOR -> tamam
        IstasyonDurumu.BEKLIYOR -> bos
        IstasyonDurumu.BOS, null -> sonuk
    }

    fun uyariTuru(tur: String): Color = when (tur) {
        "bakim", "malzeme" -> uyari
        "ariza", "durus" -> hata
        "kalite" -> vurgu
        "kalibrasyon" -> bilgi
        "bitti" -> tamam
        else -> bos
    }
}
