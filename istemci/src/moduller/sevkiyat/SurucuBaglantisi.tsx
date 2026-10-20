// Sürücünün telefonunda açılacak rota bağlantıları (sefer başına) ve aynı seferin rota hesaplayıcıda açılması.
// Bağlantıyı sunucu üretir; sunucu dış servise bağlanmaz, yalnız sürücünün telefonu bağlantıyı açar.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Amac, Arac, Nokta, RotaHesabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, Pencere } from '../../ortak/arayuz/index.ts';
import { saatMetni } from './bicim.ts';

// aracId ve kaynak yalnız ekran içindir (hangi araç ve hangi seferden açıldığı); hesap araç türüyle yapılır.
export function tekRotaAdresi(g: {
  tarih: string; cikis: number; arac: Arac['tur']; amac: Amac; noktaIdleri: readonly number[]; durakSureleri?: readonly number[]; siraKorunur: boolean;
  aracId?: number; kaynak?: string;
}) {
  const duraklar = g.noktaIdleri.map((id, i) => (g.durakSureleri ? `${id}s${Math.round(g.durakSureleri[i] ?? 0)}` : String(id))).join(',');
  const sorgu = new URLSearchParams({ tarih: g.tarih, cikis: saatMetni(g.cikis), arac: g.arac, amac: g.amac, fabrikayaDon: '1', siraKorunur: g.siraKorunur ? '1' : '0', duraklar });
  if (g.aracId !== undefined) sorgu.set('aracId', String(g.aracId));
  if (g.kaynak) sorgu.set('kaynak', g.kaynak);
  return `/sevkiyat/tek-rota?${sorgu.toString()}`;
}

export function BaglantiKutusu({ google, yandex, etiket }: { google: string; yandex: string; etiket: string }) {
  const [kopyalanan, setKopyalanan] = useState<'google' | 'yandex' | 'elle' | null>(null);
  const kopyala = (hangisi: 'google' | 'yandex') => {
    const adres = hangisi === 'google' ? google : yandex;
    void (navigator.clipboard?.writeText(adres) ?? Promise.reject(new Error('pano yok'))).then(() => setKopyalanan(hangisi), () => setKopyalanan('elle'));
  };
  return (
    <div className="tc-sevkiyat-baglanti" role="group" aria-label={etiket}>
      {/* Bağlantı düğme değildir (yeni sekmede açılır); ortak düğmenin görünüşünü modül sınıfı verir. */}
      <a className="tc-sevkiyat-bag" data-ana="" href={google} target="_blank" rel="noopener noreferrer">Google Haritalar'da aç</a>
      <a className="tc-sevkiyat-bag" href={yandex} target="_blank" rel="noopener noreferrer">Yandex'te aç</a>
      <Dugme onClick={() => kopyala('google')}>{kopyalanan === 'google' ? 'Kopyalandı' : 'Google bağlantısını kopyala'}</Dugme>
      <Dugme onClick={() => kopyala('yandex')}>{kopyalanan === 'yandex' ? 'Kopyalandı' : 'Yandex bağlantısını kopyala'}</Dugme>
      {kopyalanan === 'elle' && <input className="tc-sevkiyat-kutu" readOnly value={google} aria-label="Bağlantı (elle kopyalayın)" onFocus={(e) => e.target.select()} />}
    </div>
  );
}

// Araç rotasının seferleri pencerede: telefonda açılacak bağlantılar ve aynı seferin rota hesaplayıcıda açılması.
export function SurucuBaglantisi({ arac, seferler, noktalar, tarih, amac }: {
  arac: Arac; seferler: RotaHesabi['seferler']; noktalar: ReadonlyMap<number, Nokta>; tarih: string; amac: Amac;
}) {
  const [acik, setAcik] = useState(false);
  return (
    <>
      <Dugme simge="next" onClick={() => setAcik(true)} title="Rotayı sürücünün telefonunda Google Haritalar ya da Yandex'te açtıracak bağlantılar">Sürücüye gönder</Dugme>
      <Pencere acik={acik} kapat={() => setAcik(false)} baslik={`${arac.ad} · sürücüye gönder`}>
        <p className="tc-sevkiyat-not">Bağlantıyı sürücüye iletin; rota telefonundaki harita uygulamasında açılır, güncel trafik ve sesli yönlendirme oradan gelir.</p>
        {seferler.map((s, i) => (
          <div key={i} className="tc-sevkiyat-sefer">
            <p>
              {seferler.length > 1 && <b>{i + 1}. sefer · </b>}
              {saatMetni(s.cikis)} → {saatMetni(s.bitis)} · {s.noktaIdleri.map((id) => noktalar.get(id)?.ad ?? '?').join(' → ')}
            </p>
            <BaglantiKutusu google={s.google} yandex={s.yandex} etiket={`${arac.ad} ${i + 1}. sefer bağlantıları`} />
            <Link className="tc-sevkiyat-baglanti-yazisi" to={tekRotaAdresi({ tarih, cikis: s.cikis, arac: arac.tur, amac, noktaIdleri: s.noktaIdleri, durakSureleri: s.durakSureleri, siraKorunur: true, aracId: arac.id, kaynak: `${arac.ad}${seferler.length > 1 ? ` · ${i + 1}. sefer` : ''}` })}>
              Rota hesaplayıcıda aç: çıkış saatine göre süre ve güzergâh
            </Link>
          </div>
        ))}
      </Pencere>
    </>
  );
}
