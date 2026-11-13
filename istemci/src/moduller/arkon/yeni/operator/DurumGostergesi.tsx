import { Simge, type MakineDurumu } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { sayacGosterimi } from '../../../../../../arkon/web/src/data/sayac-halkasi.ts';
import { sayi } from '../cekirdek/bicim.ts';
import { GecenSure } from './DurumSuresi.tsx';
import type { Is } from './tipler.ts';

// 3126: terminalin durumu bir bakışta. Renk, simge ve kelime birlikte; hiçbiri tek başına değil.
export interface DurumOzeti { durum: MakineDurumu; simge: SimgeAdi; kelime: string; neden: string | null; adim: string | null; adimKisa: string | null }

export function durumOzeti(o: Is, bekletme: string | null, durusNedeni: string | null): DurumOzeti {
  const adim = o.empty ? null : o.op || null;
  const adimKisa = adim ? adim.split(' · ')[0] ?? adim : null;
  if (o.empty) return { durum: 'sirada', simge: 'box', kelime: 'İş yok', neden: 'İşler’den seç', adim, adimKisa };
  if (bekletme && o.state !== 'running') return { durum: 'durakli', simge: 'clock', kelime: 'Beklemede', neden: bekletme, adim, adimKisa };
  switch (o.state) {
    case 'running': return { durum: 'calisiyor', simge: 'play', kelime: 'Çalışıyor', neden: null, adim, adimKisa };
    case 'paused': return { durum: 'ayar', simge: 'pause', kelime: 'Duraklatıldı', neden: null, adim, adimKisa };
    case 'stopped': return { durum: 'durdu', simge: 'stop', kelime: 'Duruş', neden: durusNedeni ?? 'neden girilmedi', adim, adimKisa };
    case 'setup': return { durum: 'bitti', simge: 'wrench', kelime: 'Ayar', neden: null, adim, adimKisa };
    case 'done': return { durum: 'calisiyor', simge: 'check', kelime: 'Tamamlandı', neden: null, adim, adimKisa };
    case 'queued': return { durum: 'sirada', simge: 'clock', kelime: 'Başlamadı', neden: 'sırada', adim, adimKisa };
  }
}

function adetMetni(o: Is): { adet: string; kalan: string } {
  const { hedef, kalan } = sayacGosterimi(o);
  const hurda = o.scrap > 0 ? ` · ${sayi(o.scrap)} hurda` : '';
  return { adet: `${sayi(o.good)} / ${hedef === null ? '—' : sayi(hedef)}`, kalan: `${kalan === null ? '—' : sayi(kalan)} kaldı${hurda}` };
}

// Rota okunamadığında ya da iş yokken rotanın yerinde tam genişlik renkli durum şeridi (3136 a: rota varken durum rotadaki bu adımda yazar).
export function DurumSeridi({ oz, is, since, uyari }: { oz: DurumOzeti; is: Is; since: number | null; uyari: (() => void) | null }) {
  const a = adetMetni(is);
  return (
    <div className="tc-ay1-ds" data-durum={oz.durum} role="status" aria-label={[oz.kelime, oz.neden, oz.adim, is.empty ? null : a.adet].filter(Boolean).join(' · ')}>
      <span className="tc-ay1-ds-durum">
        <Simge ad={oz.simge} /><b>{oz.kelime}</b>
        <span className="tc-ay1-ds-alt">
          {oz.neden ? <small>{oz.neden}</small> : null}
          {is.empty ? null : <GecenSure since={since} />}
          {oz.adim ? <span className="tc-ay1-ds-adim"><span data-uzun="">{oz.adim}</span><span data-kisa="">{oz.adimKisa}</span></span> : null}
        </span>
      </span>
      {is.empty ? null : <span className="tc-ay1-ds-adet"><b>{a.adet}</b><small>{a.kalan}</small></span>}
      {uyari ? <button type="button" className="tc-ay1-ds-unlem" onClick={uyari} aria-label="Uyarı var · Bilgiler'i aç" title="Uyarı var"><Simge ad="alert" boyut="k" /></button> : null}
    </div>
  );
}

// Durum, süre ve uyarı tek satırda; rotada bu adımın kartında ve başlığında çizilir.
export function AnlikDurum({ oz, since, uyari }: { oz: DurumOzeti; since: number | null; uyari: boolean }) {
  return (
    <span className="tc-ay1-kd" data-durum={oz.durum}>
      <Simge ad={oz.simge} boyut="k" /><b>{oz.kelime}</b>{oz.kelime === 'İş yok' ? null : <GecenSure since={since} />}
      {uyari ? <em className="tc-ay1-ds-unlem" title="Uyarı var"><Simge ad="alert" boyut="k" /></em> : null}
    </span>
  );
}
