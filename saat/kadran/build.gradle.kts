plugins {
    alias(libs.plugins.android.application)
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

    // R8 kullanilmayan R sinifini atar; boylece APK'da classes.dex kalmaz (kadran kod tasimamali).
    buildTypes {
        debug {
            isMinifyEnabled = true
        }
        release {
            isMinifyEnabled = true
        }
    }
}
