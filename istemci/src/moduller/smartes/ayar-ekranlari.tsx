import { useState } from 'react';
import { Sekmeler, type Sekme } from '../../ortak/arayuz/index.ts';
import type { AyarEkrani } from '../../ortak/rota/ayar-ekranlari.ts';
import { BaglantiDurumu } from './BaglantiDurumu.tsx';
import { Eslemeler } from './Eslemeler.tsx';
import { Alarmlar, Duruslar, Giden, UretimSayilari } from './Listeler.tsx';

// SmartES Sistem Ayarları'ndan açılır (kullanıcı isteği 13.10.2026); ana menüde yoktur. Bölümler /smartes altındaki
// ekranların aynısıdır: aynı uçlar, aynı yetki.
type Bolum = 'durum' | 'eslemeler' | 'uretim' | 'durus' | 'alarm' | 'giden';

const BOLUMLER: readonly Sekme<Bolum>[] = [
  { anahtar: 'durum', baslik: 'Bağlantı durumu', simge: 'gauge' },
  { anahtar: 'eslemeler', baslik: 'Kod eşlemeleri', simge: 'layers' },
  { anahtar: 'uretim', baslik: 'Üretim sayıları', simge: 'chart' },
  { anahtar: 'durus', baslik: 'Duruşlar', simge: 'pause' },
  { anahtar: 'alarm', baslik: 'Alarmlar', simge: 'alert' },
  { anahtar: 'giden', baslik: 'İş emri gönderimi', simge: 'upload' },
];

export function SmartesAyarlari() {
  const [bolum, bolumYaz] = useState<Bolum>('durum');
  return (
    <div className="tc-smartes">
      <Sekmeler etiket="SmartES bölümleri" sekmeler={BOLUMLER} secili={bolum} sec={bolumYaz} />
      {bolum === 'durum' && <BaglantiDurumu />}
      {bolum === 'eslemeler' && <Eslemeler />}
      {bolum === 'uretim' && <UretimSayilari />}
      {bolum === 'durus' && <Duruslar />}
      {bolum === 'alarm' && <Alarmlar />}
      {bolum === 'giden' && <Giden />}
    </div>
  );
}

export const ayarEkranlari: AyarEkrani[] = [
  { anahtar: 'smartes', baslik: 'SmartES', simge: 'bolt', sira: 60, islem: 'sayfa.smartes', ekran: SmartesAyarlari, bolum: 'baglanti' },
];
