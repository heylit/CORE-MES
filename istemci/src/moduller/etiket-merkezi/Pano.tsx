import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { BaskilarCevabi, BekleyenlerCevabi, SablonlarCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { tesisGunu, tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Kart, Rozet, SayiKarti, Simge as ArayuzSimge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { cihazYazicilari } from './cihaz-yazicisi.ts';
import { basAdresi, KAYIT_SIMGESI } from './EtiketMerkezi.tsx';
import { KAYIT_BASLIKLARI, KAYIT_TURLERI, kayitSablonTuru } from './kayit-secimi.ts';
import { OTOMATIK_ISLER } from './otomatik-isler.ts';
import { Simge } from './Onizleme.tsx';
import { sablonAdi, SONUC_ADLARI, SONUC_TONLARI } from './Baskilar.tsx';
import './etiket-merkezi.css';

// 2992 a: modülün ilk sekmesi Pano. Veri var olan uçlardandır (bekleyenler, baskılar); yeni uç yok. Okuması olmayan yalnız hızlı basışı görür.
export function Pano() {
  const oturum = useOturum();
  const okur = oturum.data?.islemler.includes('etiket-merkezi.oku') ?? false;
  const bekleyen = useQuery({ queryKey: anahtarlar.bekleyenler, queryFn: () => api.get<BekleyenlerCevabi>('/etiket-merkezi/bekleyenler'), enabled: okur });
  const baskilar = useQuery({ queryKey: anahtarlar.baskilar, queryFn: () => api.get<BaskilarCevabi>('/etiket-merkezi/baskilar'), enabled: okur });
  const sablonlar = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonlarCevabi>('/etiket-merkezi/sablonlar') });
  const cihaz = cihazYazicilari();
  const bugun = tesisGunu(new Date());
  const bugunku = (baskilar.data?.baskilar ?? []).filter((b) => tesisGunu(new Date(b.zaman)) === bugun);
  const sayi = <T,>(q: { data?: T; isError: boolean }, f: (d: T) => number) => (q.isError ? null : q.data === undefined ? undefined : f(q.data));
  const tekDokunus = OTOMATIK_ISLER.filter((i) => i.tekDokunus !== 'hayir' && cihaz[kayitSablonTuru(i.tur)]).length;
  const yazicilar = [...new Set(Object.values(cihaz).map((v) => v.yaziciAd))];
  const bekleyenler = bekleyen.data?.bekleyenler ?? [];
  const turSayisi = (t: (typeof KAYIT_TURLERI)[number]) => bekleyenler.filter((b) => b.tur === t).length;
  return (
    <div className="tc-etk-pano">
      <div className="tc-etk-sayilar">
        {okur && <SayiKarti baslik="Basılacak etiket" simge="tag" ton="uyari" sayi={sayi(bekleyen, (d) => d.bekleyenler.reduce((n, b) => n + b.etiketSayisi, 0))}
          altMetin={`${String(bekleyenler.length)} kayıt`} yol="/etiket-merkezi/etiketler" />}
        {okur && <SayiKarti baslik="Bugün basılan" simge="printer" sayi={sayi(baskilar, () => bugunku.filter((b) => b.sonuc !== 'hata').reduce((n, b) => n + b.adet * Math.max(1, b.kayitSayisi), 0))}
          altMetin={`${String(bugunku.length)} baskı`} yol="/etiket-merkezi/baskilar" />}
        {okur && <SayiKarti baslik="Hatalı baskı (bugün)" simge="alert" ton="hata" sayi={sayi(baskilar, () => bugunku.filter((b) => b.sonuc === 'hata').length)}
          altMetin="yazıcıya ulaşmadı" yol="/etiket-merkezi/baskilar?sonuc=hata" />}
        <SayiKarti baslik="Tek dokunuşla basan iş" simge="bolt" sayi={tekDokunus} altMetin={yazicilar.length > 0 ? `bu cihazda · ${yazicilar.join(', ')}` : 'bu cihazda yazıcı atanmadı'} yol="/etiket-merkezi/otomatik" />
      </div>

      <Kart baslik="Hızlı bas" sag={<Link to="/etiket-merkezi/bas"><Dugme simge="printer" tur="birincil">Etiket bas</Dugme></Link>}>
        <ul className="tc-etk-turler" aria-label="Etiket türü">
          {KAYIT_TURLERI.map((t) => (
            <li key={t}>
              <Link className="tc-etk-tur-karti" to={basAdresi(t)}>
                <svg className="tc-etk-tur-simge" viewBox="0 0 48 48" aria-hidden="true"><Simge ad={KAYIT_SIMGESI[t]} karo="siyah" /></svg>
                <span className="tc-etk-tur-ad">{KAYIT_BASLIKLARI[t]}</span>
                {turSayisi(t) > 0 && <Rozet ton="uyari">{turSayisi(t)}</Rozet>}
                {cihaz[kayitSablonTuru(t)] && <span className="tc-etk-simgecik" title={`Tek dokunuş: ${cihaz[kayitSablonTuru(t)]?.yaziciAd ?? ''}`} aria-label="Tek dokunuş açık"><ArayuzSimge ad="bolt" /></span>}
              </Link>
            </li>
          ))}
        </ul>
      </Kart>

      {okur && (
        <div className="tc-etk-pano-alt">
          <Kart baslik="Basılacaklar" sag={<Link className="tc-etk-baglanti" to="/etiket-merkezi/etiketler">Tümü</Link>}>
            {bekleyen.isPending ? <DurumKutusu durum="yukleniyor" /> : bekleyenler.length === 0 ? <DurumKutusu durum="bos" mesaj="Basılmayı bekleyen etiket yok." /> : (
              <ul className="tc-etk-kisa-liste">
                {bekleyenler.slice(0, 6).map((b) => (
                  <li key={`${b.tur}-${String(b.id)}`} className="tc-etk-kisa-satir">
                    <svg className="tc-etk-tur-simge" viewBox="0 0 48 48" aria-hidden="true"><Simge ad={KAYIT_SIMGESI[b.tur]} karo="siyah" /></svg>
                    <span className="tc-etk-kisa-govde"><strong>{b.baslik}</strong><span className="tc-etk-not">{KAYIT_BASLIKLARI[b.tur]} · {b.ayrinti}</span></span>
                    <Link to={basAdresi(b.tur, [b.id])} aria-label={`${b.baslik} bas`}><Dugme simge="printer">Bas</Dugme></Link>
                  </li>
                ))}
              </ul>
            )}
          </Kart>
          <Kart baslik="Son baskılar" sag={<Link className="tc-etk-baglanti" to="/etiket-merkezi/baskilar">Geçmiş</Link>}>
            {baskilar.isPending ? <DurumKutusu durum="yukleniyor" /> : (baskilar.data?.baskilar ?? []).length === 0 ? <DurumKutusu durum="bos" mesaj="Henüz baskı yok." /> : (
              <ul className="tc-etk-kisa-liste">
                {(baskilar.data?.baskilar ?? []).slice(0, 6).map((b) => (
                  <li key={b.id} className="tc-etk-kisa-satir">
                    <Rozet ton={SONUC_TONLARI[b.sonuc]}>{SONUC_ADLARI[b.sonuc]}</Rozet>
                    <span className="tc-etk-kisa-govde">
                      <strong>{sablonAdi(sablonlar.data, b.sablonAnahtar)}</strong>
                      <span className="tc-etk-not">{tesisSaati(new Date(b.zaman))} · {b.yazici ?? 'Bu bilgisayar'} · {b.kayitSayisi === 0 ? 'deneme' : `${String(b.kayitSayisi)} kayıt x ${String(b.adet)}`}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Kart>
        </div>
      )}
    </div>
  );
}
