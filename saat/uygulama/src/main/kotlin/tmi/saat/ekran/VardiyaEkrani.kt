package tmi.saat.ekran

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import tmi.saat.Pano
import tmi.saat.VardiyaDurumu
import tmi.saat.Renkler
import tmi.saat.cekirdek.DurumSuresi
import tmi.saat.cekirdek.IstasyonDurumu
import tmi.saat.cekirdek.VardiyaOzeti
import tmi.saat.cekirdek.VardiyaSayaci
import tmi.saat.cekirdek.Zaman

// Ornekteki "Vardiya devri": duran istasyon, acik is emri, toplam durus, sonra duran istasyonlar ve nedenleri.
// Pencere gun basindan simdiye (sunucu). Uretilen, istasyonlarin pencere ici sayimlarinin toplamidir; sayim yoksa "veri yok".
// Ustte kisinin vardiyasi ve bitisine geri sayim (karar 81 a); vardiya okunamazsa satir gorunmez, ekranin geri kalani calisir.
@Composable
fun VardiyaEkrani(durum: Yukleme<Pano>, vardiya: Yukleme<VardiyaDurumu>, geri: () -> Unit) {
    val simdi = simdiDurumu()
    when (durum) {
        is Yukleme.Bekliyor -> ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
            item { UstSatir("Vardiya devri", geri) }
            items(3) { IskeletSatiri() }
        }
        is Yukleme.Hata -> Ileti(durum.ileti)
        is Yukleme.Geldi -> {
            val istasyonlar = durum.veri.istasyonlar
            val duran = istasyonlar.filter { IstasyonDurumu.coz(it.durum).let { d -> d == IstasyonDurumu.ARIZA || d == IstasyonDurumu.DURDU } }
            val acik = istasyonlar.count { it.emir != null }
            val toplam = VardiyaOzeti.toplamDurus(istasyonlar.map { it.durusSaniye })
            val uretilen = VardiyaOzeti.toplamUretim(istasyonlar.map { it.bugun })
            val nedenler = durum.veri.uyarilar.filter { it.tur == "durus" || it.tur == "ariza" }.associateBy { it.istasyonId }
            ScalingLazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
                item { UstSatir("Vardiya devri", geri) }
                item { BayatSatiri(durum) }
                (vardiya as? Yukleme.Geldi)?.let { v -> item { VardiyaSatiri(v, simdi) } }
                item { Satir(renk = if (duran.isEmpty()) Renkler.tamam else Renkler.hata, baslik = "${duran.size} istasyon duruşta", onClick = {}) }
                item { Satir(renk = Renkler.vurgu, baslik = "$acik açık iş emri", onClick = {}) }
                item {
                    Satir(
                        renk = Renkler.uyari,
                        baslik = "Toplam duruş",
                        alt = "bugün, gün başından beri",
                        sag = DurumSuresi.metin(toplam?.toLong()) ?: "veri yok",
                        onClick = {},
                    )
                }
                item { UretilenSatiri(uretilen) }
                items(duran, key = { it.id }) { i ->
                    Satir(
                        renk = Renkler.hata,
                        baslik = i.ad,
                        alt = nedenler[i.id]?.aciklama ?: "duruş nedeni girilmedi",
                        sag = DurumSuresi.metin(i.durusSaniye?.toLong()),
                        onClick = {},
                    )
                }
            }
        }
    }
}

@Composable
private fun VardiyaSatiri(v: Yukleme.Geldi<VardiyaDurumu>, simdi: State<Long>) {
    val bilgi = v.veri.vardiya
    if (bilgi == null) {
        Satir(renk = Renkler.bos, baslik = "Vardiya dışı", alt = "takvimde şu an çalışma yok", onClick = {})
        return
    }
    Satir(
        renk = Renkler.vurgu,
        baslik = bilgi.ad ?: "Vardiya",
        alt = "${Zaman.saatDakika(bilgi.baslangic) ?: "-"} - ${Zaman.saatDakika(bilgi.bitis) ?: "-"} · bitişe",
        sagIcerik = {
            Akan(simdi) { an ->
                val kalan = VardiyaSayaci.kalanSn(Zaman.ms(bilgi.bitis), Zaman.ms(v.veri.zaman), maxOf(0L, (an - v.alindiMs) / 1000))
                Text(DurumSuresi.metin(kalan) ?: "-", fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = Renkler.vurgu)
            }
        },
        onClick = {},
    )
}
