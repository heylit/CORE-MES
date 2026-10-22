package tmi.saat.ekran

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
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
import tmi.saat.Api
import tmi.saat.Emir
import tmi.saat.Istasyon
import tmi.saat.Tezgah
import tmi.saat.Renkler
import tmi.saat.cekirdek.DurumSuresi
import tmi.saat.cekirdek.GeriSayim
import tmi.saat.cekirdek.IstasyonDurumu
import tmi.saat.cekirdek.Zaman

// Eski cagiranlar icin: an tek degerdir, okuyan bilesen saniyede bir yeniden kurulur. Yeni ekranlar simdiDurumu + Akan kullanir.
@Composable
fun simdiMs(): Long = simdiDurumu().value

// Emrin parca ve emir geri sayimi tezgahtaki son uretim girisinden; giris yoksa ikisi de null.
class Sayimlar(val parca: Long?, val emir: Long?)

fun sayimlar(e: Emir, alindiMs: Long, simdi: Long): Sayimlar {
    val parca = GeriSayim.parcaKalan(
        e.birimSaniye, Zaman.ms(e.sonUretimAni), Zaman.ms(e.zaman), maxOf(0L, (simdi - alindiMs) / 1000), e.calisma == "calisiyor",
    )
    return Sayimlar(parca, GeriSayim.emirKalan(parca, e.birimSaniye, e.hedef, e.saglam))
}

// Istasyon ayrintisi (82 a): ustte durum renginde serit, halkada emrin kalan suresi (dolu yay yapilan / hedef); asagi kaydirinca
// durum, emir, tezgah, son durus, bugunku durus ve ek satir; "Durdur", "3B", "Sureler". Doner cerceve komsu istasyona gecer.
// OEE ve takim omru henuz sunucuda yok: "veri eksik" ve "-" yazilir, sifir uydurulmaz. Operator saat sozlesmesinde yok, gosterilmez.
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
    val simdi = simdiDurumu()
    val ozet = istasyon.emir
    if (ozet == null) {
        AyrintiYerlesimi(istasyon.ad, renk, geri, komsuyaGec, halka = { m -> Halka(null, renk, "-", "açık emir yok", m) }) {
            Akan(simdi) { an -> DurumSatiri(durumu?.etiket ?: istasyon.durum, istasyon.durumBaslangic, an, renk) }
            Text(istasyon.tezgah?.let { tezgahMetni(it) } ?: "tezgah: veri yok", color = Renkler.soluk, fontSize = 11.sp, maxLines = 1)
            BugunDurus(istasyon.durusSaniye)
        }
        return
    }
    val durum by periyodikOku(oturumBitti, ozet.id) { api.emir(ozet.id) }
    when (val d = durum) {
        is Yukleme.Bekliyor -> Ileti("Yükleniyor")
        is Yukleme.Hata -> Ileti(d.ileti)
        is Yukleme.Geldi -> {
            val e = d.veri
            val oran = e.saglam?.let { it.toFloat() / e.hedef }
            val sureVar = e.birimSaniye != null && e.sonUretimAni != null
            AyrintiYerlesimi(
                istasyon.ad, renk, geri, komsuyaGec,
                halka = { m ->
                    Akan(simdi) { an ->
                        val s = sayimlar(e, d.alindiMs, an)
                        Halka(
                            oran, renk,
                            buyuk = if (sureVar) GeriSayim.metin(s.emir) else e.saglam?.toString() ?: "-",
                            kucuk = if (sureVar) "kalan · ${e.saglam ?: "-"}/${e.hedef}" else "/ ${e.hedef} adet",
                            modifier = m,
                        )
                    }
                },
            ) {
                BayatSatiri(d)
                Akan(simdi) { an -> DurumSatiri(durumu?.etiket ?: istasyon.durum, istasyon.durumBaslangic ?: e.durumBaslangic, an, renk) }
                Text(
                    e.op?.let { "OP${it.opNo} ${it.ad}" } ?: "${e.emirNo} · ${e.parcaAd}",
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 12.sp,
                    maxLines = 1,
                    textAlign = TextAlign.Center,
                )
                if (e.op != null) Text("${e.emirNo} · ${e.parcaAd}", color = Renkler.soluk, fontSize = 11.sp, maxLines = 1)
                Text((e.tezgah ?: istasyon.tezgah)?.let { tezgahMetni(it) } ?: "tezgah: veri yok", color = Renkler.soluk, fontSize = 11.sp, maxLines = 1)
                e.durusNedeni?.let { neden ->
                    val ne = Zaman.saatDakika(e.durusBaslangic)
                    Text("son duruş: $neden" + (ne?.let { " · $it" } ?: ""), color = Renkler.hata, fontSize = 11.sp, maxLines = 1)
                }
                BugunDurus(istasyon.durusSaniye)
                Akan(simdi) { an ->
                    val s = sayimlar(e, d.alindiMs, an)
                    EkSatir(
                        listOfNotNull(
                            "OEE" to "veri eksik",
                            "Takım" to "-",
                            "Parça" to (if (e.birimSaniye == null) "süre yok" else if (e.sonUretimAni == null) "giriş yok" else GeriSayim.metin(s.parca)),
                            e.hurda?.takeIf { it > 0 }?.let { "Fire" to it.toString() },
                        ),
                    )
                }
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
private fun DurumSatiri(etiket: String, baslangic: String?, an: Long, renk: Color) {
    Text(durumMetni(etiket, baslangic, an), color = renk, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
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
    geri: () -> Unit,
    komsuyaGec: (yon: Int) -> Unit,
    halka: @Composable (Modifier) -> Unit,
    bilgi: @Composable () -> Unit,
) {
    // Doner cerceve bir sonraki istasyona gecer (ornekteki gibi); kaydirma birikir, esikte bir adim.
    val odak = remember { FocusRequester() }
    var birikim by remember { mutableFloatStateOf(0f) }
    val serit by animateColorAsState(renk, tween(300), label = "durum seridi")
    LaunchedEffect(Unit) { odak.requestFocus() }
    Box(Modifier.fillMaxSize()) {
        // Ustte, yuvarlak camin kenarinda durum renginde serit: ekran acilir acilmaz durum okunur.
        Canvas(Modifier.fillMaxSize()) {
            val kalinlik = 6.dp.toPx()
            drawArc(
                serit, 235f, 70f, false,
                Offset(kalinlik, kalinlik), Size(size.width - kalinlik * 2, size.height - kalinlik * 2),
                style = Stroke(kalinlik, cap = StrokeCap.Round),
            )
        }
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
            halka(Modifier.fillMaxWidth(0.42f / 0.75f).padding(top = 2.dp))
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(1.dp)) { bilgi() }
        }
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
