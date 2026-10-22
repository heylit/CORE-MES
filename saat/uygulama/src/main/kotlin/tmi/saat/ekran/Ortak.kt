package tmi.saat.ekran

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import tmi.saat.ApiHatasi
import tmi.saat.Renkler

// Ekran acikken 30 sn'de bir sorgu (ornekteki pil tahmininin "Sorgu 30" varsayimi). Ekran kapaninca dongu durur.
const val SORGU_ARALIGI_MS = 30_000L

sealed interface Yukleme<out T> {
    data object Bekliyor : Yukleme<Nothing>
    // bayatMs: son okuma basarisizsa son basarili okumanin ani; ekranda son veri "son guncelleme" satiriyla kalir.
    data class Geldi<T>(val veri: T, val alindiMs: Long, val bayatMs: Long? = null) : Yukleme<T>
    data class Hata(val ileti: String) : Yukleme<Nothing>
}

@Composable
// anahtar degisince (ornegin istasyonun emri) eski sonuc atilir ve okuma yeniden baslar.
fun <T> periyodikOku(oturumBitti: () -> Unit, anahtar: Any = Unit, oku: suspend () -> T): MutableState<Yukleme<T>> {
    val durum = remember(anahtar) { mutableStateOf<Yukleme<T>>(Yukleme.Bekliyor) }
    LaunchedEffect(anahtar) {
        var sonBasari = 0L
        while (true) {
            try {
                // Ag ve JSON ayristirma ana is parcaciginda kosmaz; cizim kaydirmada takilmaz.
                val yeni = withContext(Dispatchers.IO) { oku() }
                sonBasari = System.currentTimeMillis()
                val eski = durum.value
                // Degismeyen veri durumu yazmaz: her 30 sn'de butun ekran yeniden kurulmaz. Eski alindiMs kalir; geri sayimlar
                // o verinin sunucu anina gore akar.
                durum.value = when {
                    eski is Yukleme.Geldi && eski.veri == yeni -> if (eski.bayatMs == null) eski else eski.copy(bayatMs = null)
                    else -> Yukleme.Geldi(yeni, sonBasari)
                }
            } catch (e: ApiHatasi.OturumYok) {
                oturumBitti()
                return@LaunchedEffect
            } catch (e: ApiHatasi) {
                // Son gelen veri ekranda kalir; yalniz hic veri yoksa hata gosterilir.
                when (val eski = durum.value) {
                    is Yukleme.Geldi -> if (eski.bayatMs == null) durum.value = eski.copy(bayatMs = maxOf(sonBasari, eski.alindiMs))
                    else -> durum.value = Yukleme.Hata(e.message ?: "Hata")
                }
            }
            delay(SORGU_ARALIGI_MS)
        }
    }
    return durum
}

// Sabit (listesiz) ekranlar parmakla kaydirilir; alt bosluk son satiri yuvarlak camin kesilen kenarindan yukari tasir.
// Doner cerceve bu ekranlarda baska ise (komsu istasyon, aci) bagli kalir.
@Composable
fun Modifier.kaydirilir(): Modifier = verticalScroll(rememberScrollState()).padding(bottom = 36.dp)

// Saat ekraninin uzun kenari (piksel): onizleme kareleri bu boya kadar kucultulerek cozulur.
@Composable
fun ekranPikseli(): Int {
    val ayar = LocalConfiguration.current
    return with(LocalDensity.current) { maxOf(ayar.screenWidthDp, ayar.screenHeightDp).dp.roundToPx() }
}

// Saniyede bir ilerleyen an. Deger State olarak gecirilir ve yalniz onu gosteren kucuk bilesende okunur (Akan): sayac
// butun ekrani degil, yalniz sure metnini yeniden kurar.
@Composable
fun simdiDurumu(): State<Long> {
    val simdi = remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { delay(1_000); simdi.longValue = System.currentTimeMillis() } }
    return simdi
}

@Composable
fun Akan(simdi: State<Long>, icerik: @Composable (Long) -> Unit) {
    icerik(simdi.value)
}

// Yuklenirken bos donen gosterge yerine satir iskeleti: ekran ne gelecegini gosterir, yer degistirmez.
@Composable
fun IskeletSatiri() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(if (LocalEldiven.current) 52.dp else 42.dp)
            .clip(RoundedCornerShape(50))
            .background(Renkler.panel.copy(alpha = 0.6f)),
    )
}

// Ag hatasinda son veri kalir; bu satir verinin ne zamandan oldugunu soyler.
@Composable
fun BayatSatiri(durum: Yukleme<*>) {
    val ms = (durum as? Yukleme.Geldi<*>)?.bayatMs ?: return
    val z = java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault())
    Text("son güncelleme %02d:%02d".format(z.hour, z.minute), fontSize = 11.sp, color = Renkler.uyari, textAlign = TextAlign.Center)
}

// Ekran ilk acilinca satirlar kisa sirayla belirir (150 ms); sonra kaydirmada yeniden oynamaz. Saydamlik cizim asamasinda okunur.
@Composable
fun rememberAcilisAni(): Long = remember { System.currentTimeMillis() }

@Composable
fun Modifier.belirerek(acilis: Long, sira: Int): Modifier {
    val oynar = remember { System.currentTimeMillis() - acilis < 400 && sira < 8 }
    val saydamlik = remember { Animatable(if (oynar) 0f else 1f) }
    LaunchedEffect(Unit) {
        if (oynar) {
            delay(sira * 40L)
            saydamlik.animateTo(1f, tween(150))
        }
    }
    return graphicsLayer { alpha = saydamlik.value }
}

@Composable
fun Ileti(metin: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(metin, color = Renkler.soluk, textAlign = TextAlign.Center)
    }
}

// Eldiven modu: buyuk dokunma alani ve yazi (ornekteki "Eldiven modu"). Ayar ekrani degistirir, satir ve dugmeler okur.
val LocalEldiven = staticCompositionLocalOf { false }

// Ust satir: kok ekranda saat ve sari buyuk harfli baslik; alt ekranda "‹ baslik" geri dugmesi (kaydirarak geri de olur).
@Composable
fun UstSatir(baslik: String, geri: (() -> Unit)? = null) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (geri == null) {
            Text(saatMetni(), fontFamily = FontFamily.Monospace, fontSize = 15.sp, color = Renkler.yazi)
            Text(baslik.uppercase(Locale("tr")), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Renkler.vurgu, letterSpacing = 0.8.sp)
        } else {
            Text(
                "‹ $baslik",
                fontSize = 13.sp,
                color = Renkler.soluk,
                maxLines = 1,
                modifier = Modifier.clip(RoundedCornerShape(50)).clickable(onClick = geri).padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }
    }
}

// Dakika degisince yenilenen SS:DD.
@Composable
fun saatMetni(): String {
    var simdi by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000 - simdi % 60_000)
            simdi = System.currentTimeMillis()
        }
    }
    val z = java.time.Instant.ofEpochMilli(simdi).atZone(java.time.ZoneId.systemDefault())
    return "%02d:%02d".format(z.hour, z.minute)
}

// Ornekteki liste satiri: solda isikli durum noktasi, adin altinda soluk aciklama, sagda sure ya da sayi rozeti.
@Composable
fun Satir(
    renk: Color,
    baslik: String,
    alt: String? = null,
    sag: String? = null,
    rozet: String? = null,
    modifier: Modifier = Modifier,
    sagIcerik: (@Composable () -> Unit)? = null,
    onClick: () -> Unit,
) {
    val eldiven = LocalEldiven.current
    val dokunus = LocalHapticFeedback.current
    val nokta by animateColorAsState(renk, tween(300), label = "durum rengi")
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(50))
            .background(Renkler.panel)
            .clickable {
                dokunus.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .padding(horizontal = 12.dp, vertical = if (eldiven) 13.dp else 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(10.dp).shadow(6.dp, CircleShape, ambientColor = nokta, spotColor = nokta).background(nokta, CircleShape))
        Column(Modifier.weight(1f)) {
            Text(baslik, fontWeight = FontWeight.SemiBold, fontSize = if (eldiven) 16.sp else 14.sp, color = Renkler.yazi, maxLines = 1)
            alt?.let { Text(it, fontSize = if (eldiven) 13.sp else 11.sp, color = Renkler.soluk, maxLines = 2) }
        }
        sag?.let { Text(it, fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = renk) }
        sagIcerik?.invoke()
        rozet?.let {
            Text(
                it,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = Renkler.zemin,
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(min = 22.dp).background(renk, RoundedCornerShape(50)).padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
    }
}

// Ilerleme halkasi: koyu zemin halkasi uzerinde durum renginde dolu yay, icinde buyuk sayi ve alt yazi.
// oran null ise yay cizilmez: bos halka "hic yapilmadi" gibi okunur.
@Composable
fun Halka(oran: Float?, renk: Color, buyuk: String, kucuk: String, modifier: Modifier = Modifier) {
    // Deger ve renk degisince 300 ms yumusak gecis; oran null ise yay hic cizilmez (gecis de yok).
    val yay by animateFloatAsState((oran ?: 0f).coerceIn(0f, 1f), tween(300), label = "halka")
    val yayRengi by animateColorAsState(renk, tween(300), label = "halka rengi")
    Box(modifier.aspectRatio(1f), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val kalinlik = size.minDimension * 0.08f
            val ic = Size(size.width - kalinlik, size.height - kalinlik)
            val yer = Offset(kalinlik / 2, kalinlik / 2)
            drawArc(Renkler.halkaZemini, 0f, 360f, false, yer, ic, style = Stroke(kalinlik))
            if (oran != null) drawArc(yayRengi, -90f, 360f * yay, false, yer, ic, style = Stroke(kalinlik, cap = StrokeCap.Round))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(buyuk, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 26.sp, color = Renkler.yazi, maxLines = 1)
            Text(kucuk, fontSize = 11.sp, color = Renkler.soluk, maxLines = 1)
        }
    }
}

// Titresim deseni gorunur cizgi olarak: titresim dolu, bekleme bos.
@Composable
fun Desen(desen: LongArray, renk: Color = Renkler.yazi) {
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
        desen.drop(1).forEachIndexed { k, ms ->
            val genislik = maxOf(3f, ms / 25f).dp
            Box(Modifier.width(genislik).height(6.dp).background(if (k % 2 == 0) renk.copy(alpha = 0.75f) else Color.Transparent, RoundedCornerShape(3.dp)))
        }
    }
}

// Sari ana dugme ve koyu ikincil dugme (ornekteki .d ve .d.ana).
@Composable
fun Dugme(metin: String, ana: Boolean = false, buyuk: Boolean = false, onClick: () -> Unit) {
    val eldiven = LocalEldiven.current
    val dokunus = LocalHapticFeedback.current
    Text(
        metin,
        fontSize = if (buyuk) 15.sp else 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = if (ana) Renkler.vurguUstu else Renkler.yazi,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(if (ana) Renkler.vurgu else Renkler.panel)
            .clickable {
                dokunus.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .padding(horizontal = if (eldiven || buyuk) 16.dp else 11.dp, vertical = if (eldiven || buyuk) 12.dp else 7.dp),
    )
}
