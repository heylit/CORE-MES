import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EMIR_TURLERI, EMIR_TURU_ADLARI, ROTA_ACILABILEN_TURLER } from '#paylasilan/sozlesme/emir-turleri.ts';
import type { UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { Dugme, DurumKutusu, IsaretKutusu } from '../../../../ortak/arayuz/index.ts';
import { RR_ANAHTARI, RrHatasi } from '../veri.ts';
import { acikRevizyon, yururlukteki } from './kurallar.ts';
import type { RotaEkrani } from './ortak.tsx';

// Sahibinin sınırı (sozlesme/rota.ts ROTA_ADI_EN_COK); aşan adı sahibi 400 ile reddeder.
const ROTA_ADI_EN_COK = 60;

type RotaTanimi = UrunRevizyonlariCevabi['rotalar'][number];
type EmirTuru = (typeof EMIR_TURLERI)[number];
type Panel = 'yeni' | 'ayar' | null;

// Emir formundaki "Rota" alanıyla aynı anahtar: sekmede yapılan değişiklik formda da görünür.
export const urunRotalariAnahtari = (urunId: string) => [...RR_ANAHTARI, 'urun-rotalari', Number(urunId)] as const;

export function rotaTurMetni(rota: RotaTanimi, rotalar: readonly RotaTanimi[]): string {
  if (!rota.standart) return rota.emirTurleri.length === 0 ? 'Emir türü bağlı değil' : `Yalnız ${rota.emirTurleri.map((t) => EMIR_TURU_ADLARI[t]).join(', ')} emirleri`;
  return rotalar.some((x) => !x.standart && x.emirTurleri.length > 0) ? 'Seri ve kendi rotası olmayan türler' : 'Bütün türler';
}

// 3411 a: türüyle açılmış rota tek türlüdür ve türü değişmez; 3482-1 b: adı serbesttir, sonradan da değişir. Adla türü ayırt eden bir
// alan yok: tek türlü her Standart dışı rota tür rotası sayılır. 15.11'den kalan türsüz ya da çok türlü rotalarda türler de değişir.
export const turRotasiMi = (rota: RotaTanimi): boolean => !rota.standart && rota.emirTurleri.length === 1;

// satir: sekmeler; yeniAc ve ayarAc revizyon çubuğunun "⋯" menüsündedir (3295 a); rotaAdi revizyon satırının başlığıdır.
interface Parcalar { satir: ReactNode; yeniAc: (() => void) | null; ayarAc: (() => void) | null; panel: ReactNode; rotaAdi: string | null }
const BOS: Parcalar = { satir: null, yeniAc: null, ayarAc: null, panel: null, rotaAdi: null };

// 3247 a: ürünün rotaları revizyon çubuğunun üstünde sekme olur; altta seçili rotanın revizyonları durur. Parçalar ayrı döner ki
// "Adı ve türleri" onaylı ön izlemedeki gibi revizyon satırında dursun.
export function useRotaSekmeleri(r: RotaEkrani, urunId: string): Parcalar {
  const { duzen, yetki } = r;
  const istemci = useQueryClient();
  const [panel, setPanel] = useState<Panel>(null);
  const [ad, setAd] = useState('');
  const [yeniAd, setYeniAd] = useState('');
  const [standarttan, setStandarttan] = useState(true);
  const [yeniTur, setYeniTur] = useState<EmirTuru | null>(null);
  const [turler, setTurler] = useState<readonly EmirTuru[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const sorgu = useQuery({
    queryKey: urunRotalariAnahtari(urunId),
    queryFn: async () => {
      try { return await api.get<UrunRevizyonlariCevabi>(`/rota/urunler/${encodeURIComponent(urunId)}`); } catch (h) { throw new RrHatasi(h); }
    },
  });
  // Liste okunamazsa ekran tek rotalı ürün gibi görünmesin: sekme satırının yerinde hata ve yeniden dene durur. 404 rotasız üründür
  // (sahibi ürünü bulamadı); o zaman bugünkü gibi sekme satırı yoktur.
  if (sorgu.isError && !(sorgu.error instanceof RrHatasi && sorgu.error.durum === 404)) {
    return { ...BOS, satir: <DurumKutusu durum="hata" mesaj={`Ürünün rotaları alınamadı: ${sorgu.error.message}`} yenile={() => { void sorgu.refetch(); }} /> };
  }
  const rotalar = sorgu.data?.rotalar ?? [];
  const standart = rotalar.find((x) => x.standart) ?? null;
  // Tek rota varken ve rota açamayan kullanıcıya sekme satırı gösterilmez: ekran bugünkü gibi kalır.
  if (rotalar.length === 0 || (rotalar.length === 1 && !yetki.rotaTaslakAc)) return BOS;
  const aktifId = duzen.aktifRota(urunId);
  const aktif = rotalar.find((x) => (aktifId === null ? x.standart : String(x.id) === aktifId)) ?? standart;

  const sec = (rota: RotaTanimi) => {
    if (duzen.rotaSec(urunId, rota.standart ? null : String(rota.id))) { setPanel(null); setHata(null); }
  };
  const ac = (p: Panel) => {
    setPanel(panel === p ? null : p);
    setHata(null);
    setAd(p === 'ayar' ? aktif?.ad ?? '' : '');
    setTurler(p === 'ayar' ? aktif?.emirTurleri ?? [] : []);
    setYeniTur(null);
    setYeniAd('');
  };
  const yaz = async (is: () => Promise<UrunRevizyonlariCevabi>): Promise<UrunRevizyonlariCevabi | null> => {
    setMesgul(true);
    setHata(null);
    try {
      const c = await is();
      istemci.setQueryData(urunRotalariAnahtari(urunId), c);
      return c;
    } catch (h) {
      const k = h instanceof RrHatasi ? h : new RrHatasi(h);
      setHata(k.eskiSurum ? 'Rota bu arada başka biri tarafından değiştirildi; güncel hâli yüklendi, yeniden dene.' : k.message);
      if (k.eskiSurum) void sorgu.refetch();
      return null;
    } finally {
      setMesgul(false);
    }
  };
  // 3411 a: rota türüyle açılır, tür hemen bağlanır (rota yürürlüğe girene kadar o türün emirleri Seri rotasıyla açılır).
  const yeniRota = async () => {
    if (yeniTur === null) return;
    const onceki = new Set(rotalar.map((x) => x.id));
    const c = await yaz(() => api.post(`/rota/urunler/${encodeURIComponent(urunId)}/rotalar`, { emirTuru: yeniTur, ...(yeniAd.trim() ? { ad: yeniAd.trim() } : {}) }, { istekKimligi: yeniIstekKimligi() }));
    const yeni = c?.rotalar.find((x) => !onceki.has(x.id) && !x.standart);
    if (!yeni) return;
    if (!duzen.rotaSec(urunId, String(yeni.id))) return;
    setPanel(null);
    const kaynak = yururlukteki(duzen.rotaRevleri(urunId, null));
    if (standarttan && kaynak) await duzen.yeniTaslak(urunId, kaynak);
  };
  const ayarKaydet = async () => {
    if (!aktif) return;
    const yol = `/rota/urunler/${encodeURIComponent(urunId)}/rotalar/${String(aktif.id)}`;
    let surum = aktif.surum;
    if (ad.trim() !== aktif.ad) {
      const c = await yaz(() => api.post(`${yol}/ad`, { ad: ad.trim(), surum }));
      if (!c) return;
      surum = c.rotalar.find((x) => x.id === aktif.id)?.surum ?? surum;
    }
    const turDegisti = turler.length !== aktif.emirTurleri.length || turler.some((t) => !aktif.emirTurleri.includes(t));
    if (!aktif.standart && !turRotasiMi(aktif) && yetki.rotaOnayla && turDegisti && !(await yaz(() => api.post(`${yol}/turler`, { emirTurleri: turler, surum })))) return;
    setPanel(null);
  };
  // Başka rotaya bağlı tür bu rotaya işaretlenirse oradan taşınır; kullanıcı kaydetmeden önce görür.
  const tasinanlar = (panel === 'yeni' || (aktif && !aktif.standart))
    ? turler.flatMap((t) => { const o = rotalar.find((x) => (panel === 'yeni' || x.id !== aktif?.id) && x.emirTurleri.includes(t)); return o ? [`${EMIR_TURU_ADLARI[t]} (${o.ad})`] : []; })
    : [];
  const turSecimi = (
    <>
      <span className="tc-rr1-rv-row" role="group" aria-label="Bu rotayı kullanan emir türleri">
        {EMIR_TURLERI.map((t) => (
          <IsaretKutusu key={t} etiket={EMIR_TURU_ADLARI[t]} checked={turler.includes(t)}
            onChange={(e) => { setTurler(e.target.checked ? [...turler, t] : turler.filter((x) => x !== t)); }} />
        ))}
      </span>
      {tasinanlar.length > 0 && <p className="tc-rr1-ipucu">Kaydedince başka rotadan bu rotaya geçer: {tasinanlar.join(', ')}.</p>}
    </>
  );

  const satir = (
    <div className="tc-rr1-rv-row tc-rr1-rotalar">
      <span className="tc-rr1-rv-list" role="group" aria-label="Ürünün rotaları">
        {rotalar.map((x) => {
          const revs = duzen.rotaRevleri(urunId, x.standart ? null : String(x.id));
          const y = yururlukteki(revs);
          const acik = acikRevizyon(revs);
          const secili = x.id === aktif?.id;
          return (
            <button key={x.id} type="button" className={`tc-rr1-rvtab tc-rr1-rotasekme${secili ? ' tc-rr1-cur' : ''}`} aria-pressed={secili}
              onClick={() => { sec(x); }}>
              <b>{x.ad}</b>
              <small>{rotaTurMetni(x, rotalar)} · {y ? `Rev ${y.no}` : 'yürürlükte revizyon yok'}{acik ? ` · ${acik.status === 'onay' ? 'onayda' : 'taslak var'}` : ''}</small>
            </button>
          );
        })}
      </span>
    </div>
  );
  const yeniAc = yetki.rotaTaslakAc ? () => { ac('yeni'); } : null;
  const ayarAc = yetki.rotaTaslakAc && aktif && !aktif.standart ? () => { ac('ayar'); } : null;
  const panelNode = (
    <>
      {panel === 'yeni' && (
        <div className="tc-rr1-rv-panel">
          <b>Hangi emir türü için rota açılsın?</b>
          <span className="tc-rr1-rv-row" role="group" aria-label="Yeni rotanın emir türü">
            {ROTA_ACILABILEN_TURLER.map((t) => {
              const var_ = rotalar.some((x) => x.emirTurleri.includes(t));
              return (
                <Dugme key={t} aria-pressed={yeniTur === t} disabled={var_ || mesgul} title={var_ ? 'Bu türün rotası var' : undefined}
                  onClick={() => { setYeniTur(t); }}>{var_ ? `${EMIR_TURU_ADLARI[t]} (var)` : EMIR_TURU_ADLARI[t]}</Dugme>
              );
            })}
          </span>
          {standart && yururlukteki(duzen.rotaRevleri(urunId, null)) && (
            <IsaretKutusu etiket={`${standart.ad} rotasının yürürlükteki revizyonundan başla`} checked={standarttan}
              onChange={(e) => { setStandarttan(e.target.checked); }} />
          )}
          <label className="tc-rr1-alan">
            <span>Rotanın adı</span>
            <input className="tc-rr1-metin" value={yeniAd} aria-label="Yeni rotanın adı" maxLength={ROTA_ADI_EN_COK}
              placeholder={yeniTur === null ? 'Boş kalırsa türün adı' : EMIR_TURU_ADLARI[yeniTur]} onChange={(e) => { setYeniAd(e.target.value); }} />
          </label>
          <p className="tc-rr1-ipucu">
            {yeniTur === null ? 'Ad boş kalırsa türün adı olur; sonradan "Rotanın adı" ile değişir.' : `${EMIR_TURU_ADLARI[yeniTur]} emirleri, bu rota yürürlüğe girene kadar Seri rotasıyla açılmaya devam eder.`}
          </p>
          <span className="tc-rr1-rv-row">
            <Dugme tur="birincil" simge="check" disabled={mesgul || yeniTur === null} onClick={() => { void yeniRota(); }}>
              {yeniTur === null ? 'Rotayı aç' : `${EMIR_TURU_ADLARI[yeniTur]} rotasını aç`}
            </Dugme>
            <Dugme onClick={() => { setPanel(null); }}>Vazgeç</Dugme>
          </span>
          {hata && <p className="tc-rr1-hata" role="alert">{hata}</p>}
        </div>
      )}
      {panel === 'ayar' && aktif && (
        <div className="tc-rr1-rv-panel">
          <div className="tc-rr1-rv-row">
            <input className="tc-rr1-metin tc-rr1-grow" value={ad} aria-label="Rota adı" maxLength={ROTA_ADI_EN_COK} onChange={(e) => { setAd(e.target.value); }} />
            <Dugme tur="birincil" disabled={mesgul || ad.trim() === ''} onClick={() => { void ayarKaydet(); }}>Kaydet</Dugme>
          </div>
          {aktif.standart ? (
            <p className="tc-rr1-ipucu">Seri rotasına tür bağlanmaz; başka rotaya bağlanmayan her emir türü bu rotayı kullanır.</p>
          ) : turRotasiMi(aktif) ? (
            <p className="tc-rr1-ipucu">Emir türü: {rotaTurMetni(aktif, rotalar)}. Tür rotasının türü değişmez; başka tür için yeni rota açılır.</p>
          ) : yetki.rotaOnayla ? turSecimi : (
            <p className="tc-rr1-ipucu">Emir türleri: {rotaTurMetni(aktif, rotalar)}. Türleri rota onaylama yetkisi olan biri değiştirir.</p>
          )}
          {hata && <p className="tc-rr1-hata" role="alert">{hata}</p>}
        </div>
      )}
    </>
  );
  return { satir, yeniAc, ayarAc, panel: panelNode, rotaAdi: aktif?.ad ?? null };
}
