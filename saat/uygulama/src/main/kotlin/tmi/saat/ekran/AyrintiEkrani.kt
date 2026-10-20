package tmi.saat.ekran

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.foundation.focusable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import tmi.saat.cekirdek.Cerceve
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay
import tmi.saat.Api
import tmi.saat.Emir
import tmi.saat.Istasyon
import tmi.saat.Tezgah
import tmi.saat.Renkler
import tmi.saat.cekirdek.DurumSuresi
import tmi.saat.cekirdek.GeriSayim
import tmi.saat.cekirdek.IstasyonDurumu
import tmi.saat.cekirdek.Zaman

// Saniyede bir yenilenen simdi; geri sayimlar ve durum suresi bununla akar.
@Composable
fun simdiMs(): Long {
    var simdi by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { delay(1_000); simdi = System.currentTimeMillis() } }
    return simdi
}

// Emrin parca ve emir geri sayimi tezgahtaki son uretim girisinden; giris yoksa ikisi de null.
class Sayimlar(val parca: Long?, val emir: Long?)

fun sayimlar(e: Emir, alindiMs: Long, simdi: Long): Sayimlar {
    val parca = GeriSayim.parcaKalan(
        e.birimSaniye, Zaman.ms(e.sonUretimAni), Zaman.ms(e.zaman), maxOf(0L, (simdi - alindiMs) / 1000), e.calisma == "calisiyor",
    )
    return Sayimlar(parca, GeriSayim.emirKalan(parca, e.birimSaniye, e.hedef, e.saglam))
}

// Ornekteki istasyon ayrintisi: halkada yapilan / hedef, altinda emir ve durum, OEE, takim, parca; "3B" (parca onizlemesi) ve "Sureler" dugmesi,
// calisan emirde "Durdur" (duruş nedeni secilir).
// OEE ve takim omru henuz sunucuda yok: ornekteki gibi "veri eksik" ve "-" yazilir, sifir uydurulmaz.
@Composable
fun AyrintiEkrani(
    api: Api,
    istasyon: Istasyon?,
    oturumBitti: () -> Unit,
    geri: () -> Unit,
    sureleriAc: (emirId: Int) -> Unit,
    modelAc: (emirId: Int) -> Unit,
    durdur: (emirId: Int) -> Unit,
    komsuyaGec: (yon: Int) -> Unit,
) {
    if (istasyon == null) {
        Ileti("İstasyon bulunamadı")
        return
    }
    val durumu = IstasyonDurumu.coz(istasyon.durum)
    val renk = Renkler.durum(durumu)
    val ozet = istasyon.emir
    if (ozet == null) {
        AyrintiYerlesimi(istasyon.ad, renk, null, "-", "açık emir yok", geri, komsuyaGec) {
            Text(istasyon.tezgah?.let { tezgahMetni(it) } ?: "tezgah: veri yok", color = Renkler.soluk, fontSize = 11.sp, maxLines = 1)
            Text(durumMetni(durumu?.etiket ?: istasyon.durum, istasyon.durumBaslangic, simdiMs()), color = renk, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            BugunDurus(istasyon.durusSaniye)
        }
        return
    }
    val durum by periyodikOku(oturumBitti, ozet.id) { api.emir(ozet.id) }
    val simdi = simdiMs()
    when (val d = durum) {
        is Yukleme.Bekliyor -> Ileti("Yükleniyor")
        is Yukleme.Hata -> Ileti(d.ileti)
        is Yukleme.Geldi -> {
            val e = d.veri
            val s = sayimlar(e, d.alindiMs, simdi)
            val oran = e.saglam?.let { it.toFloat() / e.hedef }
            AyrintiYerlesimi(istasyon.ad, renk, oran, e.saglam?.toString() ?: "-", "/ ${e.hedef} adet", geri, komsuyaGec) {
                Text((e.tezgah ?: istasyon.tezgah)?.let { tezgahMetni(it) } ?: "tezgah: veri yok", color = Renkler.soluk, fontSize = 11.sp, maxLines = 1)
                Text(
                    e.op?.let { "OP${it.opNo} ${it.ad}" } ?: "${e.emirNo} · ${e.parcaAd}",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 12.sp,
                    maxLines = 1,
                    textAlign = TextAlign.Center,
                )
                Text(
                    durumMetni(durumu?.etiket ?: istasyon.durum, istasyon.durumBaslangic ?: e.durumBaslangic, simdi),
                    color = renk,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.sp,
                )
                e.durusNedeni?.let { Text(it, color = Renkler.hata, fontSize = 11.sp, maxLines = 1) }
                BugunDurus(istasyon.durusSaniye)
                EkSatir(
                    listOfNotNull(
                        "OEE" to "veri eksik",
                        "Takım" to "-",
                        "Parça" to (if (e.birimSaniye == null) "süre yok" else if (e.sonUretimAni == null) "giriş yok" else GeriSayim.metin(s.parca)),
                        e.hurda?.takeIf { it > 0 }?.let { "Fire" to it.toString() },
                    ),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.padding(top = 4.dp)) {
                    if (durumu == IstasyonDurumu.CALISIYOR) Dugme("Durdur") { durdur(e.id) }
                    Dugme("3B") { modelAc(e.id) }
                    Dugme("Süreler", ana = true) { sureleriAc(e.id) }
                }
            }
        }
    }
}

@Composable
private fun BugunDurus(saniye: Int?) {
    Text("bugün duruş " + (DurumSuresi.metin(saniye?.toLong()) ?: "veri yok"), color = Renkler.soluk, fontSize = 10.sp, maxLines = 1)
}

fun tezgahMetni(t: Tezgah): String = listOfNotNull(t.ad, t.tur).joinToString(" · ")

fun durumMetni(etiket: String, baslangic: String?, simdi: Long): String =
    etiket + (DurumSuresi.metin(Zaman.gecenSaniye(baslangic, simdi))?.let { " · $it" } ?: "")

@Composable
private fun AyrintiYerlesimi(
    ad: String,
    renk: Color,
    oran: Float?,
    buyuk: String,
    kucuk: String,
    geri: () -> Unit,
    komsuyaGec: (yon: Int) -> Unit,
    bilgi: @Composable () -> Unit,
) {
    // Doner cerceve bir sonraki istasyona gecer (ornekteki gibi); kaydirma birikir, esikte bir adim.
    val odak = remember { FocusRequester() }
    var birikim by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) { odak.requestFocus() }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .onRotaryScrollEvent { olay ->
                birikim += olay.verticalScrollPixels
                val yon = Cerceve.adim(birikim)
                if (yon != 0) {
                    birikim = 0f
                    komsuyaGec(yon)
                }
                true
            }
            .focusRequester(odak)
            .focusable()
            .kaydirilir()
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(1.dp),
    ) {
        UstSatir(ad, geri)
        Halka(oran, renk, buyuk, kucuk, Modifier.fillMaxWidth(0.42f / 0.75f).padding(top = 2.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(1.dp)) { bilgi() }
    }
}

// Ornekteki kucuk ek satir: "OEE %72  Takim %12 kaldi  Parca 01:05", ad soluk, deger koyu.
@Composable
fun EkSatir(ogeler: List<Pair<String, String>>) {
    Text(
        buildAnnotatedString {
            ogeler.forEachIndexed { k, (ad, deger) ->
                if (k > 0) append("  ")
                withStyle(SpanStyle(color = Renkler.soluk)) { append("$ad ") }
                withStyle(SpanStyle(color = Renkler.yazi, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold)) { append(deger) }
            }
        },
        fontSize = 10.sp,
        textAlign = TextAlign.Center,
    )
}
