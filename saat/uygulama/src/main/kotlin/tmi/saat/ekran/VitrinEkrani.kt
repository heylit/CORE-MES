package tmi.saat.ekran

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import tmi.saat.Api
import tmi.saat.ApiHatasi
import tmi.saat.Istasyon
import tmi.saat.KareDeposu
import tmi.saat.getir
import tmi.saat.kareCoz
import tmi.saat.Onizleme
import tmi.saat.Pano
import tmi.saat.Renkler
import tmi.saat.cekirdek.Cerceve
import tmi.saat.cekirdek.IstasyonDurumu

// Tezgahlar 3B: her sayfada bir istasyon, tezgahin (yoksa islenen parcanin) ilk acisi, durum ve adet; doner cerceve komsu istasyona gecer,
// dokunma tezgah ile parca arasinda gecer (tek gorunum varsa istasyon ayrintisini acar). Kendi sorgusu yoktur: istasyonlar uygulamanin ortak yenilemesinden gelir; kare yalniz
// istasyon ekrana gelince ve saatte yoksa iner.
@Composable
fun VitrinEkrani(api: Api, pano: Yukleme<Pano>, oturumBitti: () -> Unit, geri: () -> Unit, istasyonAc: (Int) -> Unit) {
    when (pano) {
        is Yukleme.Bekliyor -> Ileti("Yükleniyor")
        is Yukleme.Hata -> Ileti(pano.ileti)
        is Yukleme.Geldi -> {
            val istasyonlar = pano.veri.istasyonlar
            if (istasyonlar.isEmpty()) {
                Ileti("İstasyon yok")
                return
            }
            var seciliId by remember { mutableStateOf(istasyonlar.first().id) }
            val secili = istasyonlar.firstOrNull { it.id == seciliId } ?: istasyonlar.first()
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
                            Cerceve.komsu(istasyonlar.map { it.id }, secili.id, yon)?.let { seciliId = it }
                        }
                        true
                    }
                    .focusRequester(odak)
                    .focusable()
                    .kaydirilir()
                    .padding(horizontal = 22.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                UstSatir("Tezgâhlar 3B", geri)
                IstasyonSayfasi(api, secili, oturumBitti) { istasyonAc(secili.id) }
                Text(
                    "${istasyonlar.indexOfFirst { it.id == secili.id } + 1} / ${istasyonlar.size} · taçı çevir",
                    color = Renkler.soluk,
                    fontSize = 10.sp,
                )
            }
        }
    }
}

// Once tezgahin kendi modeli (istasyona bagli); dokunma parcaya gecer, bir daha dokunma tezgaha doner. Tezgah modeli yoksa parca gosterilir.
@Composable
private fun IstasyonSayfasi(api: Api, i: Istasyon, oturumBitti: () -> Unit, ac: () -> Unit) {
    val renk = Renkler.durum(IstasyonDurumu.coz(i.durum))
    var parca by remember(i.id) { mutableStateOf(false) }
    var tezgahYok by remember(i.id) { mutableStateOf(false) }
    val emir = i.emir
    val parcaGoster = parca || tezgahYok
    Box(
        modifier = Modifier.fillMaxWidth(0.62f).aspectRatio(1f).clickable { if (tezgahYok || emir == null) ac() else parca = !parca },
        contentAlignment = Alignment.Center,
    ) {
        when {
            !parcaGoster -> IlkKare(
                anahtar = "tezgah-${i.id}",
                oku = { api.tezgahOnizlemesi(i.id) },
                kareOku = { api.tezgahKaresi(i.id, it) },
                yokMetni = "tezgâh modeli yok",
                aciklama = "Tezgâh görünümü",
                oturumBitti = oturumBitti,
                yok = { tezgahYok = true },
            )
            emir == null -> Text("açık emir yok", color = Renkler.soluk, fontSize = 11.sp)
            else -> IlkKare(
                anahtar = "emir-${emir.id}",
                oku = { api.onizleme(emir.id) },
                kareOku = { api.onizlemeKaresi(emir.id, it) },
                yokMetni = "3B önizleme yok",
                aciklama = "Tezgâhta işlenen parça",
                oturumBitti = oturumBitti,
            )
        }
    }
    if (!tezgahYok && emir != null) Text(if (parcaGoster) "parça · dokun: tezgâh" else "tezgâh · dokun: parça", color = Renkler.soluk, fontSize = 10.sp)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(Modifier.size(8.dp).background(renk, CircleShape))
        Text(i.ad, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
    }
    Text(
        (IstasyonDurumu.coz(i.durum)?.etiket ?: i.durum) + (i.emir?.let { e -> " · ${e.saglam ?: "-"}/${e.hedef}" } ?: ""),
        color = renk,
        fontFamily = FontFamily.Monospace,
        fontSize = 11.sp,
        textAlign = TextAlign.Center,
        maxLines = 1,
    )
}

private sealed interface KareDurumu {
    data object Bekliyor : KareDurumu
    data class Var(val resim: ImageBitmap) : KareDurumu
    data class Yok(val ileti: String) : KareDurumu
}

// Ilk aci: once saatteki onbellek (ayni revizyon), yoksa sunucudan bir kez. Revizyon sunucuda cozulur, saat yalniz anahtar olarak tutar.
@Composable
private fun IlkKare(
    anahtar: String,
    oku: suspend () -> Onizleme?,
    kareOku: suspend (Int) -> ByteArray,
    yokMetni: String,
    aciklama: String,
    oturumBitti: () -> Unit,
    yok: () -> Unit = {},
) {
    val depo = KareDeposu(LocalContext.current)
    val enCok = ekranPikseli()
    var durum by remember(anahtar) { mutableStateOf<KareDurumu>(KareDurumu.Bekliyor) }
    LaunchedEffect(anahtar) {
        durum = try {
            val o = oku()
            val kare = o?.kareler?.firstOrNull()
            if (o == null || kare == null) KareDurumu.Yok(yokMetni).also { yok() }
            else {
                val bayt = depo.getir(o.revizyonId, kare) { kareOku(kare) }
                kareCoz(bayt, enCok)?.let { KareDurumu.Var(it) } ?: KareDurumu.Yok("Kare okunamadı")
            }
        } catch (e: ApiHatasi.OturumYok) {
            oturumBitti()
            return@LaunchedEffect
        } catch (e: ApiHatasi) {
            KareDurumu.Yok(e.message ?: "Hata")
        }
    }
    when (val d = durum) {
        is KareDurumu.Bekliyor -> Text("Yükleniyor", color = Renkler.soluk, fontSize = 11.sp)
        is KareDurumu.Var -> Image(d.resim, contentDescription = aciklama, modifier = Modifier.fillMaxSize())
        is KareDurumu.Yok -> Text(d.ileti, color = Renkler.soluk, fontSize = 11.sp, textAlign = TextAlign.Center)
    }
}
