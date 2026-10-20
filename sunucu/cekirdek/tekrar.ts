import { createHash } from 'node:crypto';
import { ISTEK_KIMLIGI_BASLIGI, istekKimligiMi } from '#paylasilan/istek-kimligi.ts';
import type { Db } from './db.ts';
import { dogrulama } from './hata.ts';

export interface TekrarAnahtari {
  kisiId: number;
  istekKimligi: string;
}

export interface TekrarIstegi extends TekrarAnahtari {
  uc: string;
  govdeOzeti: string;
}

export interface SakliCevap {
  govdeOzeti: string;
  // Sonucu yazılmadan kalıcı olmuş satırda boştur; uç katmanı bunu saklı cevap saymaz.
  durumKodu: number | null;
  cevap: unknown;
}

// Çekirdek tablo sorgulamaz: depoyu tablonun sahibi modül verir. Üç çağrı da komutun transaction'ında koşar.
export interface TekrarDeposu {
  // Anahtarı bu isteğe ayırır: yeniyse null, daha önce ayrılmışsa o satır. Aynı anahtarı ayırmış, henüz bitmemiş
  // transaction varsa o bitene dek bekler.
  ayir(db: Db, istek: TekrarIstegi): Promise<SakliCevap | null>;
  sonucYaz(db: Db, anahtar: TekrarAnahtari, sonuc: { durumKodu: number; cevap: unknown }): Promise<void>;
  birak(db: Db, anahtar: TekrarAnahtari): Promise<void>;
}

function sirali(deger: unknown): unknown {
  if (Array.isArray(deger)) return deger.map(sirali);
  if (deger === null || typeof deger !== 'object') return deger;
  return Object.fromEntries(
    Object.entries(deger)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([anahtar, ic]) => [anahtar, sirali(ic)]),
  );
}

// Alan sırası özeti değiştirmesin: aynı isteği başka sırayla kuran istemci başka istek sayılmaz.
export function kararliJson(deger: unknown): string {
  const metin = JSON.stringify(deger);
  return metin === undefined ? 'null' : JSON.stringify(sirali(JSON.parse(metin)));
}

export interface OzetGirdisi {
  yontem: string;
  yol: string;
  parametre: unknown;
  sorgu: unknown;
  govde: unknown;
}

// Şemadan geçmiş değerlerin özeti: gövdenin kendisi (parola dahil) saklanmaz.
export function istekOzeti(girdi: OzetGirdisi): string {
  const { yontem, yol, parametre, sorgu, govde } = girdi;
  return createHash('sha256').update(kararliJson({ yontem, yol, parametre, sorgu, govde })).digest('hex');
}

// Kimliksiz istek reddedilir: sessizce korumasız koşsaydı yeniden denenen komut ikinci kez uygulanırdı.
export function baslikKimligi(basliklar: Record<string, unknown>): string {
  const deger = basliklar[ISTEK_KIMLIGI_BASLIGI];
  if (deger === undefined) throw dogrulama('Bu komut istek kimliği ister.', ISTEK_KIMLIGI_BASLIGI);
  if (!istekKimligiMi(deger)) throw dogrulama('İstek kimliği UUID biçiminde olmalı.', ISTEK_KIMLIGI_BASLIGI);
  return deger;
}
