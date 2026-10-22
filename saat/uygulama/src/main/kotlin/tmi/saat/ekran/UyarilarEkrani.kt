package tmi.saat.ekran

import android.view.WindowManager
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.itemsIndexed
import androidx.wear.compose.material.Text
import tmi.saat.Renkler
import tmi.saat.Uyari
import tmi.saat.cekirdek.Titresim
import tmi.saat.cekirdek.Zaman

internal val UYARI_TURU_ADI = mapOf(
    "ariza" to "Arıza",
    "bakim" to "Bakım",
    "durus" to "Makine durdu",
    "kalibrasyon" to "Kalibrasyon",
    "kalite" to "Kalite onayı",
    "malzeme" to "Malzeme eksik",
    "bitti" to "Emir tamamlandı",
)

// Uyarinin yeri: istasyon ya da (kalibrasyonda) aletin numarasi ve adi.
fun uyariYeri(u: Uyari): String = u.istasyonAd ?: u.alet?.let { "${it.no} · ${it.ad}" } ?: "-"

// Ornekteki uyari listesi: tur rengi nokta, baslik, istasyon ve aciklama, sagda baslangic saati. Dokununca tam ekran uyari.
@Composable
fun UyarilarEkrani(durum: Yukleme<List<Uyari>>, geri: () -> Unit, ac: (Uyari) -> Unit) {
    val acilis = rememberAcilisAni()
    when (durum) {
        is Yukleme.Bekliyor -> ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
            item { UstSatir("Uyarılar", geri) }
            items(3) { IskeletSatiri() }
        }
        is Yukleme.Hata -> Ileti(durum.ileti)
        is Yukleme.Geldi -> ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
            item { UstSatir("Uyarılar", geri) }
            item { BayatSatiri(durum) }
            if (durum.veri.isEmpty()) {
                item { Satir(renk = Renkler.bos, baslik = "Yeni uyarı yok", onClick = {}) }
            }
            itemsIndexed(durum.veri.reversed()) { sira, u ->
                Satir(
                    modifier = Modifier.belirerek(acilis, sira),
                    renk = Renkler.uyariTuru(u.tur),
                    baslik = UYARI_TURU_ADI[u.tur] ?: u.tur,
                    alt = uyariMetni(u),
                    sag = Zaman.saatDakika(u.baslangic),
                    onClick = { ac(u) },
                )
            }
        }
    }
}

fun uyariMetni(u: Uyari): String =
    listOfNotNull(uyariYeri(u), u.emirNo, u.aciklama ?: if (u.tur == "durus") "Duruş nedeni girilmedi." else null).joinToString(" · ")

// Tam ekran uyari (82 a): tur renginde merkezden kararan zemin, uclu isaret, istasyon, aciklama, titresim deseni ve iki buyuk
// dugme. "Sustur" uyariyi bu saatte listeden dusurur; istasyon adina dokununca istasyon acilir. Ekran 60 sn acik kalir (83 a):
// uygulama ici kisik mod yok, sure dolunca sistem ekrani kapatir.
@Composable
fun UyariEkrani(uyari: Uyari, flas: Boolean, bak: (() -> Unit)?, gordum: () -> Unit) {
    val renk = Renkler.uyariTuru(uyari.tur)
    EkranAcikTut(EKRAN_ACIK_MS)
    // Yanip sonerek uyar: gurultude titresim kacirilir; zemin uc kez tur rengiyle parlar.
    val parlama = remember { Animatable(0f) }
    LaunchedEffect(flas) {
        if (!flas) return@LaunchedEffect
        repeat(3) {
            parlama.animateTo(0.55f, tween(250))
            parlama.animateTo(0f, tween(250))
        }
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.radialGradient(0f to lerp(Color.Black, renk, 0.45f), 0.72f to Color.Black))
            .drawBehind { drawRect(renk.copy(alpha = parlama.value)) }
            .padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        UcgenIsaret(Modifier.size(44.dp))
        Text(
            uyariYeri(uyari),
            fontSize = 20.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Renkler.yazi,
            textAlign = TextAlign.Center,
            maxLines = 1,
            modifier = if (bak == null) Modifier else Modifier.clickable(onClick = bak),
        )
        Text(
            listOfNotNull(UYARI_TURU_ADI[uyari.tur] ?: uyari.tur, uyari.emirNo).joinToString(" · ") + ". " +
                (uyari.aciklama ?: if (uyari.tur == "durus") "Duruş nedeni girilmedi." else "Açıklama yok."),
            fontSize = 12.sp,
            color = Renkler.yazi.copy(alpha = 0.85f),
            textAlign = TextAlign.Center,
            maxLines = 3,
        )
        Titresim.desen(uyari.tur)?.let { Desen(it) }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
            if (bak != null) Dugme("Bak", buyuk = true, onClick = bak)
            Dugme("Sustur", ana = true, buyuk = true, onClick = gordum)
        }
    }
}

@Composable
private fun UcgenIsaret(modifier: Modifier) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val cizgi = Stroke(width = w * 0.08f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        val ucgen = Path().apply {
            moveTo(w * 0.5f, h * 0.08f)
            lineTo(w * 0.96f, h * 0.88f)
            lineTo(w * 0.04f, h * 0.88f)
            close()
        }
        drawPath(ucgen, Renkler.yazi, style = cizgi)
        drawLine(Renkler.yazi, Offset(w * 0.5f, h * 0.38f), Offset(w * 0.5f, h * 0.6f), w * 0.08f, StrokeCap.Round)
        drawLine(Renkler.yazi, Offset(w * 0.5f, h * 0.73f), Offset(w * 0.5f, h * 0.735f), w * 0.08f, StrokeCap.Round)
    }
}

const val EKRAN_ACIK_MS = 60_000L

// Uyari ekrani acikken ekran kapanmaz; sure dolunca ya da ekrandan cikinca bayrak kalkar (pil).
@Composable
fun EkranAcikTut(sureMs: Long) {
    val pencere = LocalContext.current.etkinlik()?.window
    DisposableEffect(pencere) {
        pencere?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { pencere?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }
    LaunchedEffect(pencere) {
        delay(sureMs)
        pencere?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
}
