package tmi.saat.ekran

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.itemsIndexed
import androidx.wear.compose.material.Text
import tmi.saat.Pano
import tmi.saat.Renkler
import tmi.saat.cekirdek.DurumSuresi
import tmi.saat.cekirdek.IstasyonDurumu
import tmi.saat.cekirdek.Zaman

// Ornekteki "Istasyonlarim": durum noktasi, ad, altinda durum, sagda o durumda gecen sure. Sunucu baslangici bilmiyorsa
// (calismaya gecis ani kayitli degil) sure bos kalir. Saniyelik sayac yalniz sure metnini yeniden kurar, listeyi degil.
@Composable
fun ListeEkrani(durum: Yukleme<Pano>, istasyonSec: (istasyonId: Int) -> Unit) {
    val simdi = simdiDurumu()
    val acilis = rememberAcilisAni()
    ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
        item { UstSatir("İstasyonlarım") }
        when (durum) {
            is Yukleme.Bekliyor -> items(3) { IskeletSatiri() }
            is Yukleme.Hata -> item { Text(durum.ileti, color = Renkler.soluk) }
            is Yukleme.Geldi -> {
                item { BayatSatiri(durum) }
                if (durum.veri.istasyonlar.isEmpty()) item { Ileti("İstasyon yok") }
                itemsIndexed(durum.veri.istasyonlar, key = { _, i -> i.id }) { sira, i ->
                    val d = IstasyonDurumu.coz(i.durum)
                    val renk = Renkler.durum(d)
                    Satir(
                        renk = renk,
                        baslik = i.ad,
                        alt = d?.etiket ?: i.durum,
                        modifier = Modifier.belirerek(acilis, sira),
                        sagIcerik = { Akan(simdi) { an -> GecenSure(i.durumBaslangic, an, renk) } },
                        onClick = { istasyonSec(i.id) },
                    )
                }
            }
        }
    }
}

@Composable
fun GecenSure(baslangic: String?, an: Long, renk: Color) {
    DurumSuresi.metin(Zaman.gecenSaniye(baslangic, an))?.let {
        Text(it, fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = renk)
    }
}
