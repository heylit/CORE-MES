package tmi.saat

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import tmi.saat.cekirdek.Adet
import tmi.saat.cekirdek.BaglantiHatasi

// Sunucunun saat sozlesmesi: paylasilan/sozlesme/saat.ts ve oturum.ts (saat eslesmesi). Alan yoksa ya da null ise deger null'dir.

data class EmirOzeti(val id: Int, val emirNo: String, val saglam: Int?, val hedef: Int)
data class Tezgah(val ad: String, val tur: String?)
// durusSaniye: gun basindan beri durus (duraklatma haric); sunucuda kayit yoksa null.
data class Istasyon(
    val id: Int,
    val kod: String?,
    val ad: String,
    val durum: String,
    val durumBaslangic: String?,
    val tezgah: Tezgah?,
    val emir: EmirOzeti?,
    val durusSaniye: Int? = null,
    val bugun: Adet? = null,
)
data class Alet(val id: Int, val no: String, val ad: String, val vade: String?)
// Kalibrasyon uyarisinda istasyon yoktur (null), alet vardir; obur turlerde tersi.
data class Uyari(
    val tur: String,
    val istasyonId: Int?,
    val istasyonAd: String?,
    val alet: Alet?,
    val emirNo: String?,
    val aciklama: String?,
    val baslangic: String?,
)
data class Op(val opNo: Int, val ad: String)
data class Siradaki(val opNo: Int, val ad: String, val adet: Int)
data class Emir(
    val id: Int,
    val emirNo: String,
    val parcaAd: String,
    val istasyonAd: String,
    val calisma: String?,
    val saglam: Int?,
    val hurda: Int?,
    val hedef: Int,
    val birimSaniye: Int?,
    val kalanSaniye: Int?,
    val durusNedeni: String?,
    val durusBaslangic: String?,
    val op: Op?,
    val tezgah: Tezgah?,
    val siradaki: Siradaki?,
    val malzemeHazir: Boolean?,
    val durumBaslangic: String?,
    val zaman: String?,
    val sonUretimAni: String?,
)
data class DurusNedeni(val id: Int, val ad: String)
// revizyonId yalniz onbellek anahtaridir; kare sunucuda emrin kaydiyla bulunur.
data class Onizleme(val revizyonId: Int, val kareler: List<Int>)
data class Pano(val istasyonlar: List<Istasyon>, val uyarilar: List<Uyari>)
// Kisinin o anki vardiyasi (takvimi yoksa ya da vardiya disindaysa null), bugunku uretim ve son sekiz saatin saglam sayimi.
data class Vardiya(val ad: String?, val baslangic: String, val bitis: String)
data class VardiyaDurumu(val zaman: String, val vardiya: Vardiya?, val bugun: Adet?, val saatlik: List<Int?>)
// Istasyonun canli planinda siradaki is (karar 84 a: yalniz plan okuyan rol).
data class PlanSiradaki(val emirNo: String, val opNo: Int, val ad: String, val adet: Int, val baslangic: String, val tezgah: String?)
data class EslesmeIstegi(val istek: String, val kod: String, val son: String)
data class Eslesme(val belirtec: String, val son: String, val kisiAd: String)

sealed interface IstekDurumu {
    data object Bekliyor : IstekDurumu
    data class Onaylandi(val eslesme: Eslesme) : IstekDurumu
}

sealed class ApiHatasi(mesaj: String) : Exception(mesaj) {
    // Belirtec ya da eslesme istegi gecersiz ya da suresi doldu: saat yeniden eslestirilir.
    class OturumYok : ApiHatasi("Eşleşme bitti. Profil'den yeni kod alın.")
    class Yetki : ApiHatasi("Bu bilgileri görme yetkiniz yok.")
    class CokSik : ApiHatasi("Biraz bekleyip yeniden deneyin.")
    class AdresYok : ApiHatasi("Sunucu adresi girilmedi.")
    class Sunucu(mesaj: String) : ApiHatasi(mesaj)
    class Baglanti(val tur: BaglantiHatasi) : ApiHatasi(tur.ileti)
}

private fun JSONObject.metinYaDaNull(ad: String): String? = if (isNull(ad) || !has(ad)) null else getString(ad)
private fun JSONObject.sayiYaDaNull(ad: String): Int? = if (isNull(ad) || !has(ad)) null else getInt(ad)
private fun JSONObject.nesneYaDaNull(ad: String): JSONObject? = if (isNull(ad) || !has(ad)) null else getJSONObject(ad)
private fun JSONObject.mantikYaDaNull(ad: String): Boolean? = if (isNull(ad) || !has(ad)) null else getBoolean(ad)
private fun tezgahOku(o: JSONObject?): Tezgah? = o?.let { Tezgah(it.getString("ad"), it.metinYaDaNull("tur")) }

// Tek okunamayan oge (yeni sunucunun bilinmeyen sekli) butun listeyi dusurmez; o oge atlanir.
private fun <T : Any> JSONArray.esleOkunanlari(donustur: (JSONObject) -> T): List<T> =
    (0 until length()).mapNotNull { k -> try { donustur(getJSONObject(k)) } catch (e: JSONException) { null } }

private fun <T> JSONArray.esle(donustur: (JSONObject) -> T): List<T> = (0 until length()).map { donustur(getJSONObject(it)) }

// Wi-Fi giris sayfasi ya da vekil 200 ile HTML donebilir, sunucu alan adi degisebilir: okunamayan cevap uygulamayi kapatmaz.
private inline fun <T> okunur(ayristir: () -> T): T = try {
    ayristir()
} catch (e: JSONException) {
    throw ApiHatasi.Sunucu("Sunucu cevabı okunamadı.")
}

class Api(private val sunucu: () -> String?, private val belirtec: () -> String?) {
    private val istemci = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    private suspend fun istek(yontem: String, yol: String, govde: JSONObject? = null, basliklar: Map<String, String> = emptyMap()): JSONObject = withContext(Dispatchers.IO) {
        val kok = sunucu() ?: throw ApiHatasi.AdresYok()
        val kurucu = Request.Builder().url("$kok/api$yol")
        belirtec()?.let { kurucu.header("Authorization", "Bearer $it") }
        basliklar.forEach { (ad, deger) -> kurucu.header(ad, deger) }
        if (yontem == "POST") {
            kurucu.post((govde ?: JSONObject()).toString().toRequestBody("application/json".toMediaType()))
        }
        try {
            istemci.newCall(kurucu.build()).execute().use { cevap ->
                val metin = cevap.body?.string().orEmpty()
                if (cevap.code in 200..299) okunur { JSONObject(metin) } else throw hata(cevap.code, metin)
            }
        } catch (e: IOException) {
            throw ApiHatasi.Baglanti(BaglantiHatasi.coz(e))
        }
    }

    private fun hata(kod: Int, metin: String): ApiHatasi = when (kod) {
        401 -> ApiHatasi.OturumYok()
        403 -> ApiHatasi.Yetki()
        429 -> ApiHatasi.CokSik()
        else -> ApiHatasi.Sunucu(runCatching { JSONObject(metin).getString("mesaj") }.getOrDefault("Sunucu hatası."))
    }

    // Ikili cevap (onizleme karesi PNG): JSON degil, bayt olarak okunur.
    private suspend fun bayt(yol: String): ByteArray = withContext(Dispatchers.IO) {
        val kok = sunucu() ?: throw ApiHatasi.AdresYok()
        val kurucu = Request.Builder().url("$kok/api$yol")
        belirtec()?.let { kurucu.header("Authorization", "Bearer $it") }
        try {
            istemci.newCall(kurucu.build()).execute().use { cevap ->
                if (cevap.code in 200..299) cevap.body?.bytes() ?: ByteArray(0) else throw hata(cevap.code, cevap.body?.string().orEmpty())
            }
        } catch (e: IOException) {
            throw ApiHatasi.Baglanti(BaglantiHatasi.coz(e))
        }
    }

    // Kurum logosu (Sistem Ayarlari'ndaki gorsel kopyasi) oturumsuz okunur; belirtec gonderilmez. Logo yoksa 204, null doner.
    suspend fun kurumLogosu(): ByteArray? = withContext(Dispatchers.IO) {
        val kok = sunucu() ?: throw ApiHatasi.AdresYok()
        try {
            istemci.newCall(Request.Builder().url("$kok/api/giris-logosu").build()).execute().use { cevap ->
                when {
                    cevap.code == 204 -> null
                    cevap.code in 200..299 -> cevap.body?.bytes()
                    else -> throw hata(cevap.code, cevap.body?.string().orEmpty())
                }
            }
        } catch (e: IOException) {
            throw ApiHatasi.Baglanti(BaglantiHatasi.coz(e))
        }
    }

    // Saat eslesme istegi acar; gizli anahtar yalniz saatte kalir, kod ekranda gosterilir.
    suspend fun istekAc(): EslesmeIstegi {
        val c = istek("POST", "/oturum/saat-istegi")
        return okunur { EslesmeIstegi(c.getString("istek"), c.getString("kod"), c.getString("son")) }
    }

    suspend fun istekSor(istek: String): IstekDurumu {
        val c = istek("POST", "/oturum/saat-istegi/sor", JSONObject().put("istek", istek))
        return okunur {
            when (c.getString("durum")) {
                "onaylandi" -> IstekDurumu.Onaylandi(Eslesme(c.getString("belirtec"), c.getString("son"), c.getJSONObject("kisi").getString("ad")))
                else -> IstekDurumu.Bekliyor
            }
        }
    }

    suspend fun istasyonlar(): List<Istasyon> {
        val c = istek("GET", "/saat/istasyonlar")
        return okunur { c.getJSONArray("istasyonlar").esle(::istasyonOku) }
    }

    private fun istasyonOku(i: JSONObject): Istasyon {
        val e = if (i.isNull("emir")) null else i.getJSONObject("emir")
        return Istasyon(
            id = i.getInt("id"),
            kod = i.metinYaDaNull("kod"),
            ad = i.getString("ad"),
            durum = i.getString("durum"),
            durumBaslangic = i.metinYaDaNull("durumBaslangic"),
            tezgah = tezgahOku(i.nesneYaDaNull("tezgah")),
            emir = e?.let { EmirOzeti(it.getInt("id"), it.getString("emirNo"), it.sayiYaDaNull("saglam"), it.getInt("hedef")) },
            durusSaniye = i.sayiYaDaNull("durusSaniye"),
            bugun = i.nesneYaDaNull("bugun")?.let { Adet(it.getInt("saglam"), it.getInt("hurda")) },
        )
    }

    suspend fun uyarilar(): List<Uyari> {
        val c = istek("GET", "/saat/uyarilar")
        return okunur { c.getJSONArray("uyarilar").esleOkunanlari(::uyariOku) }
    }

    private fun uyariOku(u: JSONObject): Uyari = Uyari(
        tur = u.getString("tur"),
        istasyonId = u.nesneYaDaNull("istasyon")?.getInt("id"),
        istasyonAd = u.nesneYaDaNull("istasyon")?.getString("ad"),
        alet = u.nesneYaDaNull("alet")?.let { Alet(it.getInt("id"), it.getString("no"), it.getString("ad"), it.metinYaDaNull("vade")) },
        emirNo = u.metinYaDaNull("emirNo"),
        aciklama = u.metinYaDaNull("aciklama"),
        baslangic = u.metinYaDaNull("baslangic"),
    )

    suspend fun emir(id: Int): Emir {
        val e = istek("GET", "/saat/emirler/$id")
        return okunur { emirOku(e) }
    }

    suspend fun onizleme(emirId: Int): Onizleme? {
        val c = istek("GET", "/saat/emirler/$emirId/onizleme")
        return okunur {
            c.nesneYaDaNull("onizleme")?.let { o ->
                val k = o.getJSONArray("kareler")
                Onizleme(o.getInt("revizyonId"), (0 until k.length()).map { k.getInt(it) })
            }
        }
    }

    suspend fun onizlemeKaresi(emirId: Int, kare: Int): ByteArray = bayt("/saat/emirler/$emirId/onizleme/$kare")

    // Tezgahin kendi modeli: Cizim Merkezi'nde istasyona baglanan 3B model (parca modelinden ayri).
    suspend fun tezgahOnizlemesi(istasyonId: Int): Onizleme? {
        val c = istek("GET", "/saat/istasyonlar/$istasyonId/onizleme")
        return okunur {
            c.nesneYaDaNull("onizleme")?.let { o ->
                val k = o.getJSONArray("kareler")
                Onizleme(o.getInt("revizyonId"), (0 until k.length()).map { k.getInt(it) })
            }
        }
    }

    suspend fun tezgahKaresi(istasyonId: Int, kare: Int): ByteArray = bayt("/saat/istasyonlar/$istasyonId/onizleme/$kare")

    suspend fun vardiya(): VardiyaDurumu {
        val c = istek("GET", "/saat/vardiya")
        return okunur {
            VardiyaDurumu(
                zaman = c.getString("zaman"),
                vardiya = c.nesneYaDaNull("vardiya")?.let { Vardiya(it.metinYaDaNull("ad"), it.getString("baslangic"), it.getString("bitis")) },
                bugun = c.nesneYaDaNull("bugun")?.let { Adet(it.getInt("saglam"), it.getInt("hurda")) },
                saatlik = c.getJSONArray("saatlik").esle { it.sayiYaDaNull("saglam") },
            )
        }
    }

    suspend fun istasyonSiradaki(istasyonId: Int): PlanSiradaki? {
        val c = istek("GET", "/saat/istasyonlar/$istasyonId/siradaki")
        return okunur {
            c.nesneYaDaNull("siradaki")?.let {
                PlanSiradaki(it.getString("emirNo"), it.getInt("opNo"), it.getString("ad"), it.getInt("adet"), it.getString("baslangic"), it.metinYaDaNull("tezgah"))
            }
        }
    }

    suspend fun durusNedenleri(): List<DurusNedeni> {
        val c = istek("GET", "/saat/durus-nedenleri")
        return okunur { c.getJSONArray("nedenler").esleOkunanlari { DurusNedeni(it.getInt("id"), it.getString("ad")) } }
    }

    // istekKimligi bir dokunusun kimligidir: Wi-Fi koparken ayni dokunus yeniden giderse sunucu ikinci kez durdurmaz.
    suspend fun emirDurdur(id: Int, durusNedeniId: Int, istekKimligi: String): Emir {
        val e = istek("POST", "/saat/emirler/$id/durdur", JSONObject().put("durusNedeniId", durusNedeniId), mapOf("istek-kimligi" to istekKimligi))
        return okunur { emirOku(e) }
    }

    private fun emirOku(e: JSONObject): Emir =
        Emir(
            id = e.getInt("id"),
            emirNo = e.getString("emirNo"),
            parcaAd = e.getString("parcaAd"),
            istasyonAd = e.getJSONObject("istasyon").getString("ad"),
            calisma = e.metinYaDaNull("calisma"),
            saglam = e.sayiYaDaNull("saglam"),
            hurda = e.sayiYaDaNull("hurda"),
            hedef = e.getInt("hedef"),
            birimSaniye = e.sayiYaDaNull("birimSaniye"),
            kalanSaniye = e.sayiYaDaNull("kalanSaniye"),
            durusNedeni = e.metinYaDaNull("durusNedeni"),
            durusBaslangic = e.metinYaDaNull("durusBaslangic"),
            op = e.nesneYaDaNull("op")?.let { Op(it.getInt("opNo"), it.getString("ad")) },
            tezgah = tezgahOku(e.nesneYaDaNull("tezgah")),
            siradaki = e.nesneYaDaNull("siradaki")?.let { Siradaki(it.getInt("opNo"), it.getString("ad"), it.getInt("adet")) },
            malzemeHazir = e.mantikYaDaNull("malzemeHazir"),
            durumBaslangic = e.metinYaDaNull("durumBaslangic"),
            zaman = e.metinYaDaNull("zaman"),
            sonUretimAni = e.metinYaDaNull("sonUretimAni"),
        )
}
