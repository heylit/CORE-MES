plugins {
    alias(libs.plugins.android.application)
}

// Release imzasi (kart #85): anahtar deposu ve parolalar depoda durmaz. Yol `-PimzaDeposu=<depo disi .jks>` ile verilir; parolalar
// derleyenin kendi ~/.gradle/gradle.properties dosyasindan okunur (saat/gradle.properties depodadir, oraya yazilmaz).
// Uygulama ve kadran ayni anahtarla imzalanir; anahtar degisirse saat ustune kurmaz.
val imzaDeposu: File? = providers.gradleProperty("imzaDeposu").orNull?.takeIf { it.isNotBlank() }
    ?.let { gradle.startParameter.currentDir.resolve(it) }

fun imzaDegeri(ad: String): String? = providers.gradleProperty(ad).orNull?.takeIf { it.isNotEmpty() }

if (imzaDeposu != null) {
    val depo = rootDir.parentFile.canonicalFile
    if (!imzaDeposu.isFile) throw GradleException("imzaDeposu dosyasi yok: ${imzaDeposu.path}")
    if (imzaDeposu.canonicalFile.startsWith(depo)) throw GradleException("imzaDeposu depo disinda olmali: ${imzaDeposu.path}")
}

// TMI kadrani Watch Face Format ile yazilir (375 a): Wear OS 6 kodla cizilen kadrani reddeder. Bu APK kod tasimaz
// (hasCode=false) ve bagimliligi yoktur; veri saat uygulamasinin (tmi.saat) kutucuklarindan gelir.
android {
    namespace = "tmi.saat.kadran"
    compileSdk = 34

    defaultConfig {
        applicationId = "tmi.saat.kadran"
        // Watch Face Format API 33 (Wear OS 4) ister.
        minSdk = 33
        targetSdk = 33
        versionCode = 1
        versionName = "0.1.0"
    }

    signingConfigs {
        if (imzaDeposu != null) {
            create("kurum") {
                val parola = imzaDegeri("imzaParolasi") ?: throw GradleException("imzaParolasi yok (~/.gradle/gradle.properties)")
                storeFile = imzaDeposu
                storePassword = parola
                keyAlias = imzaDegeri("imzaAnahtari") ?: throw GradleException("imzaAnahtari yok (~/.gradle/gradle.properties)")
                // PKCS12 deposunda anahtar parolasi depo parolasiyla aynidir; ayri verilmezse o kullanilir.
                keyPassword = imzaDegeri("imzaAnahtarParolasi") ?: parola
            }
        }
    }

    // R8 kullanilmayan R sinifini atar; boylece APK'da classes.dex kalmaz (kadran kod tasimamali). Kaynak budamasi yok:
    // watchface.xml kaynaklari adla anar, budama onlari kullanilmiyor sayabilir.
    buildTypes {
        debug {
            isMinifyEnabled = true
        }
        release {
            isMinifyEnabled = true
            signingConfig = signingConfigs.findByName("kurum")
        }
    }
}

// Imzasiz release saate kurulmaz: anahtar verilmeden release paketlenmez, sessizce imzasiz APK uretilmez.
tasks.matching { it.name == "packageRelease" }.configureEach {
    if (imzaDeposu == null) doFirst { throw GradleException("Release icin -PimzaDeposu=<depo disi .jks> gerekir (saat/README.md).") }
}

