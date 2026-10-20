import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { OperatorOzetiCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { SayiKarti } from '../../ortak/arayuz/SayiKarti.tsx';
import { Simge } from '../../ortak/arayuz/Simge.tsx';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import './operator-panosu.css';

// Operatörün ana sayfası Özetim'in kısasıdır: önce terminale geçiş, sonra bugünkü üretimi, mesaisi, izni ve istasyonları.
// Sayılar metin olarak verilir: panoda sıfır gösteren kart gizlenir, operatörün "bugün 0 parça"sı gizlenmemeli.

const saat = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

export function sureYazisi(sn: number | null): string {
  if (sn === null) return 'Veri yok';
  const dk = Math.round(sn / 60);
  const s = Math.floor(dk / 60);
  return s > 0 ? `${s} sa ${dk % 60} dk` : `${dk} dk`;
}

const sayiYazisi = (n: number | null | undefined, birim = '') =>
  n === null || n === undefined ? 'Veri yok' : `${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}${birim}`;

export function bugunkuMesai(o: OperatorOzetiCevabi): string {
  const g = o.mesailer?.find((m) => m.tarih === o.bitis);
  if (!g) return 'Veri yok';
  if (g.kapali) return g.kapali.ad ?? (g.kapali.tur === 'tatil' ? 'Tatil' : 'Çalışma yok');
  if (g.baslangic === null || g.bitis === null) return 'Çalışma yok';
  return `${saat(g.baslangic)} – ${saat(g.bitis)}`;
}

export function OperatorPanosu() {
  const o = useQuery({
    queryKey: [...anahtarlar.ben, 'operator-ozeti', 'gun'],
    queryFn: () => api.get<OperatorOzetiCevabi>('/arkon/operator-ozeti?donem=gun'),
  });
  const d = o.data;
  const metin = (f: (x: OperatorOzetiCevabi) => string) => (o.isError ? undefined : d ? f(d) : undefined);
  const istasyonlar = d?.yetkiler.istasyonlar.map((i) => i.kod) ?? [];
  return (
    <section className="tc-op-pano" aria-label="Özetim">
      <Link to="/uretim-terminali" className="tc-dugme tc-dugme-birincil tc-dugme-ana tc-op-pano-gec">
        <Simge ad="play" />
        Üretim Terminali&apos;ne geç
      </Link>
      <div className="tc-op-pano-izgara">
        <SayiKarti baslik="Bugün ürettiğim" simge="check" hata={o.isError}
          metin={metin((x) => sayiYazisi(x.saglam, ' adet'))}
          altMetin={d && d.hurda ? `Hurda ${d.hurda.toLocaleString('tr-TR')} adet` : undefined} />
        <SayiKarti baslik="Bugün çalıştığım" simge="clock" hata={o.isError} metin={metin((x) => sureYazisi(x.calismaSn))} />
        <SayiKarti baslik="Bugünkü mesaim" simge="sun" hata={o.isError} metin={metin(bugunkuMesai)} />
        <SayiKarti baslik="Bu ay fazla mesai" simge="bolt" hata={o.isError}
          metin={metin((x) => (x.fazlaMesai ? sayiYazisi(x.fazlaMesai.aySaat, ' saat') : 'Veri yok'))}
          altMetin={d?.fazlaMesai?.bekleyenSaat ? `Onay bekleyen ${sayiYazisi(d.fazlaMesai.bekleyenSaat, ' saat')}` : undefined} />
        <SayiKarti baslik="Kalan yıllık izin" simge="flag" hata={o.isError}
          metin={metin((x) => (x.izinler ? sayiYazisi(x.izinler.kalanGun, ' gün') : 'Veri yok'))}
          altMetin={d?.izinler?.yaklasan[0] ? `Sıradaki izin ${new Date(`${d.izinler.yaklasan[0].baslangic}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}` : undefined} />
        <SayiKarti baslik="Yetkili istasyonlarım" simge="cpu" hata={o.isError}
          metin={metin(() => (istasyonlar.length ? istasyonlar.join(', ') : 'Atama yok'))} />
      </div>
    </section>
  );
}
