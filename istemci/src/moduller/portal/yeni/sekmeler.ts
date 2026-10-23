import type { ComponentType } from 'react';
import { gorunumler as belgeler } from './belgeler/index.tsx';
import { gorunumler as fiyat } from './fiyat/index.tsx';
import { IsMerkezi } from './is-merkezi/IsMerkezi.tsx';
import { gorunumler as onaylar } from './onaylar/index.tsx';
import { gorunumler as teklif } from './teklif/index.tsx';

// Görünüm kaydı: her parça kendi klasöründe yazılır ve yalnız kendi index.tsx'inde görünüm adı -> ekran bildirir
// (PARCA-SOZLESMESI.md). Adlar prototipin görünüm adlarıdır; adres /portal/yeni/<ad>?id=<kayıt>.

export interface GorunumOzellikleri {
  // Ayrıntı görünümünde kayıt kimliği; liste ve yeni kayıt görünümünde null.
  id: string | null;
}

export type GorunumEkrani = ComponentType<GorunumOzellikleri>;
export type Gorunumler = Readonly<Record<string, GorunumEkrani>>;

export const PARCALAR: Readonly<Record<string, Gorunumler>> = { teklif, belgeler, onaylar, fiyat };

// İki parça aynı adı bildirirse hangisinin açılacağı sıraya kalırdı; test bunu yakalar (sekmeler.test.ts).
export function cakisanAdlar(parcalar: Readonly<Record<string, Gorunumler>>): string[] {
  const goruldu = new Set<string>(['home']);
  const cakisan: string[] = [];
  for (const g of Object.values(parcalar)) {
    for (const ad of Object.keys(g)) {
      if (goruldu.has(ad)) cakisan.push(ad);
      goruldu.add(ad);
    }
  }
  return cakisan;
}

export const GORUNUMLER: Gorunumler = Object.assign({ home: IsMerkezi }, ...Object.values(PARCALAR)) as Gorunumler;

// Kaydı olmayan görünüm "hazırlanıyor" gösterir; null döner.
export const gorunumEkrani = (ad: string): GorunumEkrani | null => GORUNUMLER[ad] ?? null;
