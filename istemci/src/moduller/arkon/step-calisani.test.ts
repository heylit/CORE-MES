import { describe, expect, it } from 'vitest';
import { CALISAN_ACILAMADI, calisanOkuyucu, type CalisanBenzeri } from '../../../../arkon/web/src/data/step-calisani.ts';

// Sahte çalışan: gelen mesajları kaydeder; cevabı test verir.
function sahteCalisan() {
  const giden: { veri: any; aktar: unknown[] }[] = [];
  let kapandi = false;
  const c: CalisanBenzeri = {
    onmessage: null, onerror: null,
    postMessage(veri, aktar = []) { giden.push({ veri, aktar }); },
    terminate() { kapandi = true; },
  };
  const cevapla = (veri: unknown) => c.onmessage?.({ data: veri } as MessageEvent);
  return { c, giden, cevapla, kapandi: () => kapandi };
}

describe('STEP okuyucu çalışanı sarmalayıcısı (TBw)', () => {
  it('izinli: wasm kurulumda aktarılır; STEP ve IGES istekleri ayarla gider, sonuç sırası numarayla eşlenir', async () => {
    const s = sahteCalisan();
    const wasm = new ArrayBuffer(8);
    const kurulum = calisanOkuyucu(s.c, wasm);
    expect(s.giden[0]?.veri).toMatchObject({ no: 1, tur: 'kur', wasm });
    expect(s.giden[0]?.aktar).toEqual([wasm]);
    s.cevapla({ no: 1, tamam: true, sonuc: null });
    const okuyucu = await kurulum;
    const bayt = new Uint8Array([1, 2]);
    const step = okuyucu.ReadStepFile(bayt, { linearUnit: 'millimeter' });
    const iges = okuyucu.ReadIgesFile(bayt, null);
    expect(s.giden[1]?.veri).toMatchObject({ no: 2, tur: 'step', bytes: bayt, ayar: { linearUnit: 'millimeter' } });
    expect(s.giden[1]?.aktar).toEqual([]);
    expect(s.giden[2]?.veri).toMatchObject({ no: 3, tur: 'iges' });
    s.cevapla({ no: 3, tamam: true, sonuc: { success: true, meshes: ['i'] } });
    s.cevapla({ no: 2, tamam: true, sonuc: { success: true, meshes: ['s'] } });
    expect(await step).toEqual({ success: true, meshes: ['s'] });
    expect(await iges).toEqual({ success: true, meshes: ['i'] });
  });

  it('ret: çalışanın hatası isteği hatayla bitirir; çalışan açılamazsa kurulum düşer ve çalışan kapanır', async () => {
    const s = sahteCalisan();
    const kurulum = calisanOkuyucu(s.c, new ArrayBuffer(1));
    s.cevapla({ no: 1, tamam: true, sonuc: null });
    const okuyucu = await kurulum;
    const step = okuyucu.ReadStepFile(new Uint8Array(1), {});
    s.cevapla({ no: 2, tamam: false, hata: 'okunamadı' });
    await expect(step).rejects.toThrow('okunamadı');

    const k = sahteCalisan();
    const dusen = calisanOkuyucu(k.c, new ArrayBuffer(1));
    k.c.onerror?.(new Event('error') as ErrorEvent);
    await expect(dusen).rejects.toThrow(CALISAN_ACILAMADI);
    expect(k.kapandi()).toBe(true);
  });
});
