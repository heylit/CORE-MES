package tmi.saat.ekran

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import tmi.saat.Pano
import tmi.saat.Renkler
import tmi.saat.cekirdek.DurumSuresi
import tmi.saat.cekirdek.IstasyonDurumu
import tmi.saat.cekirdek.Zaman

// Ornekteki "Istasyonlarim": durum noktasi, ad, altinda durum, sagda o durumda gecen sure. Sunucu baslangici bilmiyorsa
// (calismaya gecis ani kayitli degil) sure bos kalir.
@Composable
fun ListeEkrani(durum: Yukleme<Pano>, istasyonSec: (istasyonId: Int) -> Unit) {
    val simdi = simdiMs()
    when (durum) {
        is Yukleme.Bekliyor -> Ileti("Yükleniyor")
        is Yukleme.Hata -> Ileti(durum.ileti)
        is Yukleme.Geldi -> ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
            item { UstSatir("İstasyonlarım") }
            if (durum.veri.istasyonlar.isEmpty()) item { Ileti("İstasyon yok") }
            items(durum.veri.istasyonlar, key = { it.id }) { i ->
                val d = IstasyonDurumu.coz(i.durum)
                Satir(
                    renk = Renkler.durum(d),
                    baslik = i.ad,
                    alt = d?.etiket ?: i.durum,
                    sag = DurumSuresi.metin(Zaman.gecenSaniye(i.durumBaslangic, simdi)),
                    onClick = { istasyonSec(i.id) },
                )
            }
        }
    }
}
