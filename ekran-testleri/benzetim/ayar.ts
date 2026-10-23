import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { MODEL_KIPLERI } from './sozlesme.ts';
import type { ModelKipi } from './sozlesme.ts';

// Robotun bütün ayarı TMIV2_* ortam değişkenlerinden gelir. Dil modeli varsayılan olarak kapalıdır (ADR 0019).
export interface RobotAyari {
  sonucKlasoru: string;
  tohum: number;
  gunSayisi: number;
  esZamanli: number;
  model: {
    kip: ModelKipi;
    ustSinir: number;
    anahtar: string | null;
    ad: string;
    claudeKomutu: string;
  };
}

type Ortamlar = Record<string, string | undefined>;

export const VARSAYILAN_MODEL = 'claude-opus-5-5';

function tamSayiOku(env: Ortamlar, ad: string, varsayilan: number, enAz: number, enCok: number): number {
  const ham = env[ad]?.trim();
  if (ham === undefined || ham === '') return varsayilan;
  if (!/^\d+$/.test(ham)) throw new Error(`${ad} tam sayı olmalı: "${ham}"`);
  const sayi = Number(ham);
  if (sayi < enAz || sayi > enCok) throw new Error(`${ad} ${String(enAz)} ile ${String(enCok)} arasında olmalı: ${String(sayi)}`);
  return sayi;
}

// Sonuç klasörü depo içinde olamaz: ekran görüntüsü ve model yorumu depoya girmez.
function sonucKlasoruOku(env: Ortamlar, depoKoku: string): string {
  const ham = env['TMIV2_ROBOT_SONUC']?.trim();
  const klasor = resolve(ham === undefined || ham === '' ? join(tmpdir(), 'tmiv2-robot') : ham);
  const goreli = relative(resolve(depoKoku), klasor);
  if (goreli === '' || (!goreli.startsWith('..') && !isAbsolute(goreli))) throw new Error(`TMIV2_ROBOT_SONUC depo içinde olamaz: ${klasor}`);
  return klasor;
}

export function robotAyariOku(env: Ortamlar, depoKoku: string): RobotAyari {
  const ortam = env['TMIV2_ORTAM']?.trim();
  if (ortam === undefined || ortam === '' || ortam === 'canli') {
    throw new Error('Test robotu yalnız canlı olmayan ortamda koşar (TMIV2_ORTAM gelistirme ya da test olmalı).');
  }
  const kipHam = env['TMIV2_ROBOT_MODEL']?.trim() || 'kapali';
  const kip = MODEL_KIPLERI.find((k) => k === kipHam);
  if (kip === undefined) throw new Error(`TMIV2_ROBOT_MODEL geçersiz: "${kipHam}" (${MODEL_KIPLERI.join(' | ')})`);
  const anahtar = env['TMIV2_ROBOT_MODEL_ANAHTARI']?.trim() || null;
  if (kip === 'api' && anahtar === null) throw new Error('TMIV2_ROBOT_MODEL=api için TMIV2_ROBOT_MODEL_ANAHTARI gerekir.');
  return {
    sonucKlasoru: sonucKlasoruOku(env, depoKoku),
    tohum: tamSayiOku(env, 'TMIV2_ROBOT_TOHUM', 1, 0, 2 ** 31 - 1),
    gunSayisi: tamSayiOku(env, 'TMIV2_ROBOT_GUN', 22, 1, 366),
    esZamanli: tamSayiOku(env, 'TMIV2_ROBOT_ESZAMANLI', 4, 1, 32),
    model: {
      kip,
      ustSinir: tamSayiOku(env, 'TMIV2_ROBOT_MODEL_UST_SINIR', 30, 0, 1000),
      anahtar: kip === 'api' ? anahtar : null,
      ad: env['TMIV2_ROBOT_MODEL_ADI']?.trim() || VARSAYILAN_MODEL,
      claudeKomutu: env['TMIV2_ROBOT_CLAUDE_KOMUTU']?.trim() || 'claude',
    },
  };
}
