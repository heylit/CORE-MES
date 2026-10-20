package tmi.saat.karo

import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

// TileService ListenableFuture ister; onayli paketler (soru 294) disinda futures kutuphanesi eklenmez, bu yuzden en kucuk
// tek kez tamamlanan sonuc burada. Iptal desteklenmez: karo istegi kisa surer, sonuc ya gelir ya hata metni gelir.
class Sonuc<T> : ListenableFuture<T> {
    private val bitti = CountDownLatch(1)
    private val dinleyiciler = mutableListOf<Pair<Runnable, Executor>>()
    @Volatile private var deger: T? = null

    fun tamamla(d: T) {
        val bekleyenler = synchronized(this) {
            if (bitti.count == 0L) return
            deger = d
            bitti.countDown()
            dinleyiciler.toList().also { dinleyiciler.clear() }
        }
        bekleyenler.forEach { (r, e) -> e.execute(r) }
    }

    override fun addListener(dinleyici: Runnable, yurutucu: Executor) {
        val hemen = synchronized(this) {
            if (bitti.count == 0L) true else { dinleyiciler += dinleyici to yurutucu; false }
        }
        if (hemen) yurutucu.execute(dinleyici)
    }

    override fun cancel(kesintiyle: Boolean): Boolean = false
    override fun isCancelled(): Boolean = false
    override fun isDone(): Boolean = bitti.count == 0L

    @Suppress("UNCHECKED_CAST")
    override fun get(): T {
        bitti.await()
        return deger as T
    }

    @Suppress("UNCHECKED_CAST")
    override fun get(sure: Long, birim: TimeUnit): T {
        if (!bitti.await(sure, birim)) throw TimeoutException()
        return deger as T
    }

    companion object {
        fun <T> hazir(d: T): Sonuc<T> = Sonuc<T>().also { it.tamamla(d) }
    }
}
