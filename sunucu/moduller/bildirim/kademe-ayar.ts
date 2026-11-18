import type { Db } from '#cekirdek/db.ts';
import { KADEME_KAYNAKLARI, KADEME_KAYNAK_ANAHTARLARI, kademeTuru, kaynakKademeleri, type KademeKaynagi, type KademeKaynagiTanimi } from '#paylasilan/sozlesme/bildirim-kademe.ts';
import * as sk from './sorgular/kademe/sorgular.ts';

// 3405: kademeli uyarının geçerli ayarı (satırı olmayan kaynakta katalog varsayılanı). Motor ve tercih ekranı aynı okumayı kullanır.
export interface GecerliAyar {
  acik: boolean; k2Gun: number | null; k3Gun: number | null; k4Gun: number | null; k5Gun: number | null; epostaKademe: number; serit: boolean;
  kapatilamaz: boolean; yoneticiRolId: number | null; surum: number; degistirenId: number | null; degisti: string | null; varsayilan: boolean;
}

export async function gecerliAyarlar(db: Db): Promise<Map<KademeKaynagi, GecerliAyar>> {
  const satirlar = new Map((await sk.ayarSatirlari(db)).map((r) => [r.kaynak, r]));
  const m = new Map<KademeKaynagi, GecerliAyar>();
  for (const kaynak of KADEME_KAYNAK_ANAHTARLARI) {
    const r = satirlar.get(kaynak);
    const v = (KADEME_KAYNAKLARI[kaynak] as KademeKaynagiTanimi).varsayilan;
    m.set(kaynak, r === undefined
      ? { ...v, yoneticiRolId: null, surum: 1, degistirenId: null, degisti: null, varsayilan: true }
      : {
          acik: r.acik, k2Gun: r.k2_gun, k3Gun: r.k3_gun, k4Gun: r.k4_gun, k5Gun: r.k5_gun, epostaKademe: r.eposta_kademe, serit: r.serit, kapatilamaz: r.kapatilamaz,
          yoneticiRolId: r.yonetici_rol_id, surum: r.surum, degistirenId: r.degistiren_id, degisti: r.degisti, varsayilan: false,
        });
  }
  return m;
}

// Kişi tercihinde e-postası kapatılamayan kademe türleri (3405-2 a): kaynağın ayarı açıksa K3 ve sonrası.
export async function kapatilamazKademeTurleri(db: Db): Promise<Map<string, boolean>> {
  const m = new Map<string, boolean>();
  for (const [kaynak, a] of await gecerliAyarlar(db)) {
    for (const k of kaynakKademeleri(kaynak)) m.set(kademeTuru(kaynak, k), a.kapatilamaz && k >= 3);
  }
  return m;
}
