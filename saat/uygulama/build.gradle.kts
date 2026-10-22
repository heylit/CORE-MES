import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Kullanici CA'si yuklenemeyen saat (kart #2045): `-PkurumKok=<depo disi .crt>` verilirse sertifika build/ altinda
// uretilen kaynaga (raw/kurum_kok) kopyalanir ve ag ayarina system + user'in yanina ucuncu guven kaynagi olarak eklenir.
// Uretilen ayar src/main'deki ag_guvenligi.xml'den turetilir; boylece iki ayar ayrisamaz. Verilmezse hicbir sey uretilmez.
val kurumKok: File? = providers.gradleProperty("kurumKok").orNull?.takeIf { it.isNotBlank() }
    ?.let { gradle.startParameter.currentDir.resolve(it) }

abstract class KurumKokUret : DefaultTask() {
    @get:InputFile abstract val kok: RegularFileProperty
    @get:InputFile abstract val anaAyar: RegularFileProperty
    @get:OutputDirectory abstract val cikti: DirectoryProperty

    @TaskAction
    fun uret() {
        val kaynak = kok.get().asFile
        val sertifika = try {
            kaynak.inputStream().use { CertificateFactory.getInstance("X.509").generateCertificate(it) } as X509Certificate
        } catch (e: Exception) {
            throw GradleException("kurumKok okunamadi (X.509 PEM ya da DER bekleniyor): ${kaynak.path}", e)
        }
        sertifika.checkValidity()
        val ayar = anaAyar.get().asFile.readText()
        val capa = "</trust-anchors>"
        if (ayar.split(capa).size != 2) throw GradleException("ag_guvenligi.xml'de tek $capa bekleniyor")
        val kurumAyari = ayar.replace(capa, "    <certificates src=\"@raw/kurum_kok\" />\n        $capa")

        val kok = cikti.get().asFile
        kok.deleteRecursively()
        File(kok, "raw").mkdirs()
        File(kok, "xml").mkdirs()
        kaynak.copyTo(File(kok, "raw/kurum_kok.crt"))
        File(kok, "xml/ag_guvenligi_kurum.xml").writeText(kurumAyari)

        val parmakIzi = MessageDigest.getInstance("SHA-256").digest(sertifika.encoded).joinToString(":") { "%02X".format(it) }
        logger.lifecycle("Kurum koku eklendi: ${sertifika.subjectX500Principal.name}, gecerlilik sonu ${sertifika.notAfter}")
        logger.lifecycle("SHA-256: $parmakIzi")
        if (sertifika.basicConstraints < 0) logger.warn("Uyari: sertifika CA degil; yalniz bu sertifikanin kendisine guvenilir.")
    }
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

if (kurumKok != null) {
    // Kok depo icinde olamaz: kopya yalniz build/ altinda, asli depo disinda kalir.
    val depo = rootDir.parentFile.canonicalFile
    if (!kurumKok.isFile) throw GradleException("kurumKok dosyasi yok: ${kurumKok.path}")
    if (kurumKok.canonicalFile.startsWith(depo)) throw GradleException("kurumKok depo disinda olmali: ${kurumKok.path}")
}

android {
    namespace = "tmi.saat"
    compileSdk = 34

    defaultConfig {
        applicationId = "tmi.saat"
        // Wear OS 4 (Galaxy Watch6 Classic ile gelen surum) API 33'tur.
        minSdk = 30
        targetSdk = 33
        versionCode = 1
        versionName = "0.1.0"
        manifestPlaceholders["agGuvenligi"] = if (kurumKok == null) "@xml/ag_guvenligi" else "@xml/ag_guvenligi_kurum"
    }

    buildFeatures {
        compose = true
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

    // R8 ve kaynak budamasi yalniz release'te: debug derlemesi hizli kalir. Saatte olculen takilmanin buyugu debug derlemesindendi.
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.findByName("kurum")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

if (kurumKok != null) {
    val uret = tasks.register<KurumKokUret>("kurumKokUret") {
        kok.set(kurumKok)
        anaAyar.set(layout.projectDirectory.file("src/main/res/xml/ag_guvenligi.xml"))
        cikti.set(layout.buildDirectory.dir("generated/kurumKok/res"))
    }
    androidComponents {
        onVariants { varyant -> varyant.sources.res?.addGeneratedSourceDirectory(uret, KurumKokUret::cikti) }
    }
}

// Imzasiz release saate kurulmaz: anahtar verilmeden release paketlenmez, sessizce imzasiz APK uretilmez.
tasks.matching { it.name == "packageRelease" }.configureEach {
    if (imzaDeposu == null) doFirst { throw GradleException("Release icin -PimzaDeposu=<depo disi .jks> gerekir (saat/README.md).") }
}

dependencies {
    implementation(project(":cekirdek"))
    implementation(libs.activity.compose)
    implementation(libs.compose.ui)
    implementation(libs.wear.compose.material)
    implementation(libs.wear.compose.foundation)
    implementation(libs.wear.compose.navigation)
    implementation(libs.okhttp)
    implementation(libs.wear.tiles)
    implementation(libs.wear.protolayout)
    implementation(libs.wear.complications.data.source)
}
