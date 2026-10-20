package tmi.saat

import android.content.Context

// Belirtec uygulamanin ozel deposunda durur; yedekleme kapalidir (AndroidManifest). Belirtec yalniz okur ve en cok 12 saat
// gecerlidir: saat kaybolursa kisi ya da yonetici TMI'dan baglantiyi keser.
class Depo(baglam: Context) {
    private val tercihler = baglam.getSharedPreferences("tmi-saat", Context.MODE_PRIVATE)

    var belirtec: String?
        get() = tercihler.getString(BELIRTEC, null)
        set(deger) { tercihler.edit().apply { if (deger == null) remove(BELIRTEC) else putString(BELIRTEC, deger) }.apply() }

    var kisiAd: String?
        get() = tercihler.getString(KISI, null)
        set(deger) { tercihler.edit().apply { if (deger == null) remove(KISI) else putString(KISI, deger) }.apply() }

    // Sunucu adresi saatte girilir (depoya ve derlemeye yazilmaz). Adres degisince eslesme de biter: belirtec o sunucunundur.
    var sunucu: String?
        get() = tercihler.getString(SUNUCU, null)
        set(deger) {
            tercihler.edit().apply {
                if (deger == null) remove(SUNUCU) else putString(SUNUCU, deger)
                remove(BELIRTEC)
                remove(KISI)
            }.apply()
        }

    // Ilk acilista adres sorulur; "Sonra" denince bir daha kendiliginden sorulmaz, ayardan girilir.
    var adresSoruldu: Boolean
        get() = tercihler.getBoolean(SORULDU, false)
        set(deger) { tercihler.edit().putBoolean(SORULDU, deger).apply() }

    // Saat ayarlari (ornekteki "Saat ayarlari"): yalniz bu saatte durur, sunucuya gitmez.
    var eldiven: Boolean
        get() = tercihler.getBoolean(ELDIVEN, false)
        set(deger) { tercihler.edit().putBoolean(ELDIVEN, deger).apply() }

    var flas: Boolean
        get() = tercihler.getBoolean(FLAS, false)
        set(deger) { tercihler.edit().putBoolean(FLAS, deger).apply() }

    var sessiz: Boolean
        get() = tercihler.getBoolean(SESSIZ, false)
        set(deger) { tercihler.edit().putBoolean(SESSIZ, deger).apply() }

    // Eslesme biter; sunucu adresi kalir.
    fun temizle() {
        tercihler.edit().remove(BELIRTEC).remove(KISI).apply()
    }

    private companion object {
        const val BELIRTEC = "belirtec"
        const val KISI = "kisi"
        const val SUNUCU = "sunucu"
        const val SORULDU = "adres-soruldu"
        const val ELDIVEN = "eldiven"
        const val FLAS = "flas"
        const val SESSIZ = "sessiz"
    }
}
