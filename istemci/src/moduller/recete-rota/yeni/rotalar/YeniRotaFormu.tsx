import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { EMIR_TURLERI, EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import type { UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { Dugme, IsaretKutusu } from '../../../../ortak/arayuz/index.ts';
import { RR_ANAHTARI, RrHatasi } from '../veri.ts';
import { yururlukteki } from './kurallar.ts';
import type { RotaEkrani } from './ortak.tsx';

// Sahibinin sınırı (sozlesme/rota.ts ROTA_ADI_EN_COK); aşan adı sahibi 400 ile reddeder.
const ROTA_ADI_EN_COK = 60;

export type RotaTanimi = UrunRevizyonlariCevabi['rotalar'][number];
type EmirTuru = (typeof EMIR_TURLERI)[number];

// Emir formundaki "Rota" alanıyla aynı anahtar: sekmede yapılan değişiklik formda da görünür.
export const urunRotalariAnahtari = (urunId: string) => [...RR_ANAHTARI, 'urun-rotalari', Number(urunId)] as const;

// 3644: rota açmanın tek formu. Ürünün rotası varsa yalnız rotası olmayan türler açılır (her türde bir rota); rotası yoksa (ilk rota) Seri
// hazır gelir ve Seri'nin rotası Standart rotadır, adı ayar panelinden değişir. Seri dışı tür seçilirse sunucu önce Standart rotayı açar.
export function YeniRotaFormu({ r, urunId, rotalar, kapat }: { r: RotaEkrani; urunId: string; rotalar: readonly RotaTanimi[]; kapat: () => void }) {
  const { duzen } = r;
  const istemci = useQueryClient();
  const ilk = rotalar.length === 0;
  const standart = rotalar.find((x) => x.standart) ?? null;
  const kopyalanabilir = standart !== null && yururlukteki(duzen.rotaRevleri(urunId, null)) !== null;
  const [tur, setTur] = useState<EmirTuru | null>(ilk ? 'seri' : null);
  const [ad, setAd] = useState('');
  const [kopya, setKopya] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const kap = useRef<HTMLDivElement>(null);
  const adAlani = useRef<HTMLInputElement>(null);
  // Klavye ve ekran okuyucu kullanıcısı formun açıldığını bilsin: açılınca ilk seçilebilir tür, tür seçilince ad alanı odak alır.
  useEffect(() => { kap.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }, []);
  const turSec = (t: EmirTuru) => { setTur(t); if (t !== 'seri') window.setTimeout(() => { adAlani.current?.focus(); }, 0); };
  const turVar = (t: EmirTuru): boolean => (t === 'seri' ? !ilk : rotalar.some((x) => x.emirTurleri.includes(t)));
  const tumTurler: readonly (EmirTuru)[] = ['seri', ...EMIR_TURLERI.filter((t) => t !== 'seri')];
  const turAdi = (t: EmirTuru) => (t === 'seri' && !ilk ? `Seri · ${standart?.ad ?? 'Standart'}` : EMIR_TURU_ADLARI[t]);
  const adimEkle = () => { r.kokSec(urunId); r.sec({ tur: 'adimEkle', urunId, sonraId: null }); r.paletAc(); };

  const ac = async () => {
    if (tur === null) return;
    // İlk rota Seri ise yeni sunucu kaydı yoktur: Standart rota ilk revizyonla birlikte açılır, adım eklemeye geçilir.
    if (tur === 'seri') { kapat(); adimEkle(); return; }
    const onceki = new Set(rotalar.map((x) => x.id));
    setMesgul(true);
    setHata(null);
    try {
      const c = await api.post<UrunRevizyonlariCevabi>(`/rota/urunler/${encodeURIComponent(urunId)}/rotalar`,
        { emirTuru: tur, ...(ad.trim() ? { ad: ad.trim() } : {}) }, { istekKimligi: yeniIstekKimligi() });
      istemci.setQueryData(urunRotalariAnahtari(urunId), c);
      const yeni = c.rotalar.find((x) => !onceki.has(x.id) && !x.standart);
      if (!yeni || !duzen.rotaSec(urunId, String(yeni.id))) { setHata('Rota açıldı ama seçilemedi; sekmeden seç.'); return; }
      kapat();
      const kaynak = yururlukteki(duzen.rotaRevleri(urunId, null));
      if (kopya && kaynak) await duzen.yeniTaslak(urunId, kaynak);
      else adimEkle();
    } catch (h) {
      const k = h instanceof RrHatasi ? h : new RrHatasi(h);
      // Başkası araya girdiyse (eski sürüm ya da aynı tür/ad) ürün rotaları yeniden okunur ki tür listesi bayat kalmasın.
      if (k.eskiSurum || k.durum === 409) void istemci.invalidateQueries({ queryKey: urunRotalariAnahtari(urunId) });
      setHata(k.eskiSurum ? 'Rota bu arada başka biri tarafından değiştirildi; güncel hâli yüklendi, yeniden dene.' : k.message);
    } finally {
      setMesgul(false);
    }
  };

  return (
    <div className="tc-rr1-rv-panel" ref={kap}>
      <b>Hangi emir türü için rota açılsın?</b>
      <span className="tc-rr1-rv-row" role="group" aria-label="Yeni rotanın emir türü">
        {tumTurler.map((t) => {
          const var_ = turVar(t);
          return (
            <Dugme key={t} aria-pressed={tur === t} disabled={var_ || mesgul} title={var_ ? (t === 'seri' ? 'Seri rotası ürünün Standart rotasıdır; hep vardır' : 'Bu türün rotası var') : undefined}
              onClick={() => { turSec(t); }}>{var_ && !(t === 'seri') ? `${turAdi(t)} (var)` : turAdi(t)}</Dugme>
          );
        })}
      </span>
      {tur !== 'seri' && (
        <label className="tc-rr1-alan">
          <span>Rotanın adı</span>
          <input ref={adAlani} className="tc-rr1-metin" value={ad} aria-label="Yeni rotanın adı" maxLength={ROTA_ADI_EN_COK}
            placeholder={tur === null ? 'Boş kalırsa türün adı' : EMIR_TURU_ADLARI[tur]} onChange={(e) => { setAd(e.target.value); }} />
        </label>
      )}
      {tur !== null && tur !== 'seri' && standart !== null && kopyalanabilir && (
        <IsaretKutusu etiket={`${standart.ad} rotasının yürürlükteki revizyonundan başla`} checked={kopya}
          onChange={(e) => { setKopya(e.target.checked); }} />
      )}
      <p className="tc-rr1-ipucu">
        {tur === null ? 'Ad boş kalırsa türün adı olur; sonradan "Rotanın adı" ile değişir. Her türde bir rota, her rotada bir yürürlükte revizyon olur.'
          : tur === 'seri' ? 'Seri emirleri ve kendi rotası olmayan türler Standart rotayı kullanır; adı sonradan "Rotanın adı" ile değişir.'
          : ilk ? `Bu üründe henüz yürürlükte rota yok: ${EMIR_TURU_ADLARI[tur]} emirleri, Standart (Seri) rotayı kurup yürürlüğe alana kadar rota bulamaz.`
          : `${EMIR_TURU_ADLARI[tur]} emirleri, bu rota yürürlüğe girene kadar Standart rotayla açılmaya devam eder.`}
      </p>
      <span className="tc-rr1-rv-row">
        <Dugme tur="birincil" simge="check" disabled={mesgul || tur === null} onClick={() => { void ac(); }}>
          {tur === null ? 'Rotayı aç' : tur === 'seri' ? 'Adım eklemeye başla' : `${EMIR_TURU_ADLARI[tur]} rotasını aç`}
        </Dugme>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
      </span>
      {hata && <p className="tc-rr1-hata" role="alert">{hata}</p>}
    </div>
  );
}
