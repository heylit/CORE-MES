package tmi.saat.ekran

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import tmi.saat.Api
import tmi.saat.Istasyon
import tmi.saat.Renkler
import tmi.saat.cekirdek.GeriSayim
import tmi.saat.cekirdek.IstasyonDurumu

// Ornekteki "Sureler": halkada bu parcanin geri sayimi, altinda emir bitisine kalan, kalan parca ve siradaki is.
// Birim sure girilmemis adimda sure hesaplanmaz; malzeme ihtiyaci bilinmiyorsa "veri yok".
@Composable
fun SurelerEkrani(api: Api, istasyon: Istasyon?, emirId: Int, oturumBitti: () -> Unit, geri: () -> Unit) {
    val durumu = istasyon?.let { IstasyonDurumu.coz(it.durum) }
    val renk = Renkler.durum(durumu)
    val durum by periyodikOku(oturumBitti, emirId) { api.emir(emirId) }
    val simdi = simdiDurumu()
    when (val d = durum) {
        is Yukleme.Bekliyor -> Ileti("Yükleniyor")
        is Yukleme.Hata -> Ileti(d.ileti)
        is Yukleme.Geldi -> {
            val e = d.veri
            val girisYok = e.sonUretimAni == null
            val birim = e.birimSaniye
            val kalanParca = e.saglam?.let { maxOf(0, e.hedef - it) }
            val durumAdi = durumu?.etiket ?: istasyon?.durum ?: "durum bilinmiyor"
            Column(
                modifier = Modifier.fillMaxSize().kaydirilir().padding(horizontal = 26.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                UstSatir("${istasyon?.ad ?: e.istasyonAd} · Süreler", geri)
                BayatSatiri(d)
                // Saniyelik sayac yalniz halkayi ve emir satirini yeniden kurar.
                Akan(simdi) { an ->
                    val s = sayimlar(e, d.alindiMs, an)
                    Halka(
                        oran = if (birim == null || s.parca == null) null else s.parca.toFloat() / birim,
                        renk = renk,
                        buyuk = if (birim == null || girisYok) "-" else GeriSayim.metin(s.parca),
                        kucuk = if (birim == null) "süre girilmemiş" else if (girisYok) "ilk üretim girilince başlar" else "bu parça · birim ${GeriSayim.metin(birim.toLong())}",
                        modifier = Modifier.fillMaxWidth(0.46f / 0.73f),
                    )
                }
                Akan(simdi) { an ->
                    val s = sayimlar(e, d.alindiMs, an)
                    SureSatiri("Emir bitişine ", if (birim == null) "hesaplanamaz" else if (girisYok) "ilk girişten sonra" else if (s.emir == 0L) "süre doldu" else GeriSayim.metin(s.emir))
                }
                Text(
                    if (birim == null) "rota adımına birim süre girilmeli"
                    else "${kalanParca ?: "-"} parça kaldı" + if (durumu != IstasyonDurumu.CALISIYOR) " · ${durumAdi.lowercase()}, süre ilerlemiyor" else "",
                    fontSize = 11.sp,
                    color = Renkler.soluk,
                )
                SureSatiri("Sıradaki: ", e.siradaki?.let { "OP${it.opNo} ${it.ad} · ${it.adet} adet" } ?: "veri yok")
                Text(
                    when (e.malzemeHazir) {
                        true -> "malzeme hazır"
                        false -> "malzeme eksik"
                        null -> "malzeme: veri yok"
                    },
                    fontSize = 11.sp,
                    color = when (e.malzemeHazir) {
                        true -> Renkler.tamam
                        false -> Renkler.hata
                        null -> Renkler.soluk
                    },
                )
            }
        }
    }
}

@Composable
private fun SureSatiri(ad: String, deger: String) {
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(color = Renkler.soluk)) { append(ad) }
            withStyle(SpanStyle(color = Renkler.yazi, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold)) { append(deger) }
        },
        fontSize = 11.sp,
    )
}
