import { useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import type { FaizTuru, OranOzeti } from '#paylasilan/sozlesme/finans.ts';
import { FAIZ_TURLERI, ORAN_ESKIME_GUNU } from '#paylasilan/sozlesme/finansman.ts';
import { Dugme, Girdi, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { KurFaizYukleme } from './KurFaizYukleme.tsx';
import { KurGrafigi } from './KurGrafigi.tsx';
import './kur-faiz-seridi.css';

const TESIS_TZ = 'Europe/Istanbul';
const KUR_BIRIMLERI = ['USD', 'EUR', 'GBP'] as const;
const FAIZ_BIRIMLERI = ['TRY', 'USD', 'EUR'] as const;
const OZET_ANAHTARI = ['finans', 'oran-ozeti'] as const;
// 2238-2 a: faiz yalnız yıllık yüzde olarak girilir ve gösterilir.
export const FAIZ_ADI: Record<FaizTuru, string> = { kredi: 'Kredi', mevduat: 'Mevduat', politika: 'Politika' };
const TUR_ADI = { kur: 'kur', kredi: 'kredi', mevduat: 'mevduat', politika: 'politika' } as const;

const sayi = (deger: string, basamak: number): string => Number(deger).toLocaleString('tr-TR', { maximumFractionDigits: basamak });
const gecmisDegeri = (g: OranOzeti['gecmis'][number]): string => (g.tur === 'kur'
  ? `${sayi(g.deger, 4)} / ${g.ikinciDeger === null ? '-' : sayi(g.ikinciDeger, 4)}`
  : `yıllık %${sayi(g.deger, 2)}`);
const girdiSayisi = (metin: string): number | null => {
  const t = metin.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const gunFarki = (eski: string, yeni: string): number => Math.round((Date.parse(`${yeni}T00:00:00Z`) - Date.parse(`${eski}T00:00:00Z`)) / 86_400_000);
// Faiz oranı ORAN_ESKIME_GUNU günden eskiyse hesap sürer ama şerit ve ayarlar uyarır.
export const oranEskiMi = (gecerlilikBaslangic: string, bugun: string): boolean => gunFarki(gecerlilikBaslangic, bugun) > ORAN_ESKIME_GUNU;
// 2083: değerin yanında bir önceki tarihli değere göre artış/azalış işareti; önceki yoksa ya da eşitse işaret yok.
type Yon = 'artti' | 'azaldi';
const yonu = (simdi: string, onceki: string | null): Yon | null => {
  if (onceki === null) return null;
  const fark = Number(simdi) - Number(onceki);
  return fark > 0 ? 'artti' : fark < 0 ? 'azaldi' : null;
};
function YonIsareti({ simdi, onceki, basamak }: { simdi: string; onceki: string | null; basamak: number }) {
  const yon = yonu(simdi, onceki);
  if (!yon || onceki === null) return null;
  const metin = `${yon === 'artti' ? 'arttı' : 'azaldı'}, önceki ${sayi(onceki, basamak)}`;
  return (
    <span className="tc-kfs-yon" data-yon={yon} title={metin}>
      <Simge ad={yon === 'artti' ? 'up' : 'down'} boyut="k" /><span className="tc-kfs-gizli">{metin}</span>
    </span>
  );
}
const gunMetni = (tarih: string, bugun: string): string => (tarih === bugun ? 'bugün' : tarih.split('-').reverse().slice(0, 2).join('.'));
// Giriş anı tesis saatiyle; bugünse "bugün 09:44".
function girisMetni(iso: string, bugun: string): string {
  const an = new Date(iso);
  const gun = an.toLocaleDateString('sv-SE', { timeZone: TESIS_TZ });
  return `${gunMetni(gun, bugun)} ${an.toLocaleTimeString('tr-TR', { timeZone: TESIS_TZ, hour: '2-digit', minute: '2-digit' })}`;
}

// Ortak kur ve faiz şeridi (939, 952 a, 953 a; 2238): her sayfanın en üstünde durur; giriş yapan herkes okur, finans.kur-yaz taşıyan
// bugünün alış ve satış kurunu ve bugünden geçerli yıllık faizleri girer. Her giriş kişi ve saatle kaydedilir.
// 2667 b: telefonda şerit yalnız ana sayfada ve Finans sayfalarında; öteki sayfalarda hiç çizilmez (kabuk sarmalamaz, boş satır kalmaz).
// Sınır kur-faiz-seridi.css'teki telefon sınırıyla aynıdır; 768 ve üstünde her sayfada kalır (952 a).
const TELEFON = '(max-width: 767px)';
export const telefondaGorunurMu = (yol: string): boolean => yol === '/' || yol === '/finans' || yol.startsWith('/finans/');
function telefonMu(): boolean {
  try { return window.matchMedia(TELEFON).matches; } catch { return false; }
}
function telefonuIzle(degisti: () => void): () => void {
  try {
    const m = window.matchMedia(TELEFON);
    m.addEventListener('change', degisti);
    return () => m.removeEventListener('change', degisti);
  } catch { return () => undefined; }
}

export function KurFaizSeridi() {
  const telefon = useSyncExternalStore(telefonuIzle, telefonMu, () => false);
  const { pathname } = useLocation();
  const islemler = useOturum().data?.islemler ?? [];
  const yazabilir = islemler.includes('finans.kur-yaz');
  const [acik, acikYaz] = useState(false);
  const gizli = telefon && !telefondaGorunurMu(pathname);
  const ozet = useQuery({ queryKey: OZET_ANAHTARI, queryFn: () => api.get<OranOzeti>('/finans/oran-ozeti'), enabled: !gizli });
  // Okunamayan ya da henüz gelmeyen özet şerit çizmez: her sayfanın üstünde boş ya da hatalı bir şerit durmasın.
  const o = ozet.data;
  if (!o || gizli) return null;
  const kur = (p: string) => o.kurlar.find((k) => k.paraBirimi === p);
  const faiz = (t: FaizTuru) => o.faizler.find((f) => f.tur === t && f.paraBirimi === 'TRY');
  const bugunEksik = KUR_BIRIMLERI.some((p) => kur(p)?.tarih !== o.bugun);
  // 2996 a: hiç kur ve faiz girilmemişken altı "yok" yerine tek satır; kur girebilene giriş bağlantısı. Şerit herkese görünmeye devam eder (952 a).
  const hicGirilmedi = KUR_BIRIMLERI.every((p) => !kur(p)) && FAIZ_TURLERI.every((t) => !faiz(t));
  const sonGiris = o.sonGiris
    ? `Son ${TUR_ADI[o.sonGiris.tur]} girişi: ${girisMetni(o.sonGiris.giris, o.bugun)}, ${o.sonGiris.girenAd ?? 'bilinmiyor'}`
    : 'Kur ve faiz ayrıntısı';
  return (
    <section className="tc-kfs" aria-label="Kur ve faiz">
      <div className="tc-kfs-satir">
        {/* Şeridin tek eylemi kendisidir: yazabilene panel formla açılır, ayrı düğme renk ve yer kalabalığı yapar (2344).
            Son giriş ipucunda ve paneldeki "Son girişler"dedir. */}
        {hicGirilmedi ? (
          <button type="button" className="tc-kfs-ozet" aria-expanded={acik} onClick={() => acikYaz((a) => !a)}>
            <Simge ad="rotate" boyut="k" />
            <span className="tc-kfs-bos">Bugünün kuru girilmedi</span>
            {yazabilir && <span className="tc-kfs-gir">Kur gir</span>}
          </button>
        ) : (
        <button type="button" className="tc-kfs-ozet" aria-expanded={acik} onClick={() => acikYaz((a) => !a)} title={sonGiris}>
          <Simge ad="rotate" boyut="k" />
          {KUR_BIRIMLERI.map((p) => {
            const k = kur(p);
            return (
              <span key={p} className="tc-kfs-kalem" data-kfs={`kur-${p}`} title={k ? `${p} alış / satış` : undefined}>
                <span className="tc-kfs-ad">{p}</span>
                <b className="mono">{k ? `${sayi(k.alis, 4)} / ${sayi(k.satis, 4)}` : 'yok'}</b>
                {k && <YonIsareti simdi={k.alis} onceki={k.oncekiAlis} basamak={4} />}
                {k && k.tarih !== o.bugun && <span className="tc-kfs-eski">{gunMetni(k.tarih, o.bugun)}</span>}
              </span>
            );
          })}
          <span className="tc-kfs-ayrac" aria-hidden="true" />
          {FAIZ_TURLERI.map((t) => {
            const f = faiz(t);
            return (
              <span key={t} className="tc-kfs-kalem" data-kfs={`faiz-${t}`} title={`TRY ${FAIZ_ADI[t].toLocaleLowerCase('tr')} faizi, yıllık`}>
                <span className="tc-kfs-ad">{FAIZ_ADI[t]}</span>
                <b className="mono">{f ? `%${sayi(f.yillikYuzde, 2)}` : 'yok'}</b>
                {f && <YonIsareti simdi={f.yillikYuzde} onceki={f.oncekiYillikYuzde} basamak={2} />}
                {f && oranEskiMi(f.gecerlilikBaslangic, o.bugun) && <span className="tc-kfs-eski">{gunMetni(f.gecerlilikBaslangic, o.bugun)}</span>}
              </span>
            );
          })}
          {yazabilir && bugunEksik && <span className="tc-kfs-uyari"><span className="tc-kfs-isaret" aria-hidden="true" />Bugün girilmedi</span>}
        </button>
        )}
      </div>
      {acik && <Panel o={o} yazabilir={yazabilir} kapat={() => acikYaz(false)} />}
    </section>
  );
}

function Panel({ o, yazabilir, kapat }: { o: OranOzeti; yazabilir: boolean; kapat: () => void }) {
  const faizMetni = (t: FaizTuru) => FAIZ_BIRIMLERI.map((p) => {
    const f = o.faizler.find((x) => x.tur === t && x.paraBirimi === p);
    return `${p} ${f ? `%${sayi(f.yillikYuzde, 2)}` : 'yok'}`;
  }).join(' · ');
  return (
    <div className="tc-kfs-panel" role="region" aria-label="Kur ve faiz ayrıntısı">
      {yazabilir ? <KurFormu o={o} kapat={kapat} /> : (
        <div className="tc-kfs-blok">
          <h2 className="tc-kfs-baslik"><Simge ad="rotate" boyut="k" />Kur alış / satış (TL)</h2>
          <p className="tc-kfs-not">{KUR_BIRIMLERI.map((p) => { const k = o.kurlar.find((x) => x.paraBirimi === p); return `${p} ${k ? `${sayi(k.alis, 4)} / ${sayi(k.satis, 4)}` : 'yok'}`; }).join(' · ')}</p>
          <p className="tc-kfs-not">Kur ve faiz girişi finans ve satın almadadır.</p>
        </div>
      )}
      {yazabilir ? <FaizFormu o={o} kapat={kapat} /> : (
        <div className="tc-kfs-blok">
          <h2 className="tc-kfs-baslik"><Simge ad="chart" boyut="k" />Yıllık faiz</h2>
          {FAIZ_TURLERI.map((t) => <p key={t} className="tc-kfs-not">{FAIZ_ADI[t]}: {faizMetni(t)}</p>)}
        </div>
      )}
      <div className="tc-kfs-blok tc-kfs-gecmis-blok">
        <h2 className="tc-kfs-baslik"><Simge ad="clock" boyut="k" />Son girişler</h2>
        {o.gecmis.length === 0 ? <p className="tc-kfs-not">Henüz giriş yok.</p> : (
          <ul className="tc-kfs-gecmis">
            {o.gecmis.map((g) => (
              <li key={`${g.tur}-${g.paraBirimi}-${g.tarih}-${g.giris}`}>
                <span className="tc-kfs-tur" data-tur={g.tur}>{TUR_ADI[g.tur]}</span>
                <span className="tc-kfs-ne">
                  <span className="mono">{g.paraBirimi} {gecmisDegeri(g)}</span>
                  {g.duzeltme && <span className="tc-kfs-not"> düzeltme</span>}
                  <br /><span className="tc-kfs-not">{g.girenAd ?? 'bilinmiyor'}</span>
                </span>
                <span className="tc-kfs-not mono">{girisMetni(g.giris, o.bugun)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="tc-kfs-blok tc-kfs-genis">
        <h2 className="tc-kfs-baslik"><Simge ad="chart" boyut="k" />Kur ve faiz grafiği</h2>
        <KurGrafigi bugun={o.bugun} />
      </div>
      {yazabilir && (
        <div className="tc-kfs-blok tc-kfs-genis">
          <h2 className="tc-kfs-baslik"><Simge ad="upload" boyut="k" />Toplu yükleme</h2>
          <KurFaizYukleme bugun={o.bugun} />
        </div>
      )}
    </div>
  );
}

type KurGirdisi = { alis: string; satis: string };
// Bugünün kurları alış ve satış olarak birlikte girilir (2238-1 c); bugün girilmiş çift düzeltilir (sürümüyle), girilmemiş olana yeni satır
// açılır. İkisi de boş para birimi gönderilmez; yalnız biri dolu ise hata verilir. Geçmiş tarihli kur toplu yükleme ya da Ayarlar'dandır.
function KurFormu({ o, kapat }: { o: OranOzeti; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const bugunku = (p: string) => o.kurlar.find((k) => k.paraBirimi === p && k.tarih === o.bugun);
  const sonu = (p: string) => o.kurlar.find((k) => k.paraBirimi === p);
  const [degerler, degerlerYaz] = useState<Record<string, KurGirdisi>>(() => Object.fromEntries(KUR_BIRIMLERI.map((p) => {
    const k = bugunku(p);
    return [p, { alis: k ? sayi(k.alis, 6).replace(/\./g, '') : '', satis: k ? sayi(k.satis, 6).replace(/\./g, '') : '' }];
  })));
  const [hata, hataYaz] = useState<string | null>(null);
  // Kur çifti uçları tekrar korumalıdır: sonucu bilinmeyen gönderim aynı kimlikle yinelenir.
  const kimlikler = useRef<Record<string, string>>({});
  const kimlik = (p: string): string => (kimlikler.current[p] ??= yeniIstekKimligi());
  const yaz = useMutation({
    mutationFn: async (gidecek: { paraBirimi: string; alis: number; satis: number }[]) => {
      for (const g of gidecek) {
        const k = bugunku(g.paraBirimi);
        const [yol, govde] = k
          ? ['/finans/kur-ciftleri/guncelle', { ...g, tarih: o.bugun, surum: k.surum }] as const
          : ['/finans/kur-ciftleri/ekle', { ...g, tarih: o.bugun }] as const;
        await tekrarKorumaliGonder(
          (d) => api.post(yol, govde, { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) }),
          { istekKimligi: kimlik(g.paraBirimi) },
        );
        delete kimlikler.current[g.paraBirimi];
      }
    },
    onSuccess: async () => { bildir('tamam', 'Kurlar kaydedildi.'); kapat(); await istemci.invalidateQueries(); },
    onError: async (h) => {
      if (!yenidenDenenebilirMi(h)) kimlikler.current = {};
      bildir('hata', hataIletisi(h, 'Kur kaydedilemedi.'));
      await istemci.invalidateQueries({ queryKey: OZET_ANAHTARI });
    },
  });
  const gonder = (e: FormEvent) => {
    e.preventDefault();
    const gidecek: { paraBirimi: string; alis: number; satis: number }[] = [];
    for (const p of KUR_BIRIMLERI) {
      const d = degerler[p] ?? { alis: '', satis: '' };
      if (d.alis.trim() === '' && d.satis.trim() === '') continue;
      const alis = girdiSayisi(d.alis);
      const satis = girdiSayisi(d.satis);
      if (alis === null || alis <= 0 || satis === null || satis <= 0) { hataYaz(`${p} için alış ve satış ikisi de sıfırdan büyük olmalı.`); return; }
      if (satis < alis) { hataYaz(`${p} satış kuru alıştan küçük olamaz.`); return; }
      const k = bugunku(p);
      if (k && Number(k.alis) === alis && Number(k.satis) === satis) continue;
      gidecek.push({ paraBirimi: p, alis, satis });
    }
    hataYaz(null);
    if (gidecek.length === 0) { kapat(); return; }
    yaz.mutate(gidecek);
  };
  const herhangiBugun = KUR_BIRIMLERI.some((p) => bugunku(p));
  const degistir = (p: string, alan: keyof KurGirdisi, deger: string) => degerlerYaz((d) => ({ ...d, [p]: { ...(d[p] ?? { alis: '', satis: '' }), [alan]: deger } }));
  return (
    <form className="tc-kfs-blok" onSubmit={gonder} aria-label="Bugünün kuru">
      <h2 className="tc-kfs-baslik"><Simge ad="rotate" boyut="k" />Bugünün kuru (TL), alış / satış</h2>
      {KUR_BIRIMLERI.map((p) => {
        const s = sonu(p);
        const ipucu = bugunku(p) ? 'bugün girildi; değiştirirseniz düzeltilir' : 'bugün girilmedi';
        return (
          <div key={p} className="tc-kfs-cift">
            <Girdi etiket={`${p} alış`} inputMode="decimal" className="mono" value={degerler[p]?.alis ?? ''} placeholder={s ? sayi(s.alis, 4) : ''}
              ipucu={ipucu} onChange={(e) => degistir(p, 'alis', e.target.value)} />
            <Girdi etiket={`${p} satış`} inputMode="decimal" className="mono" value={degerler[p]?.satis ?? ''} placeholder={s ? sayi(s.satis, 4) : ''}
              onChange={(e) => degistir(p, 'satis', e.target.value)} />
          </div>
        );
      })}
      {hata && <p className="tc-kfs-hata" role="alert">{hata}</p>}
      <div className="tc-kfs-eylem"><Dugme type="submit" tur="birincil" simge="check" yukleniyor={yaz.isPending}>Kurları kaydet</Dugme></div>
      <p className="tc-kfs-not">{herhangiBugun ? 'Bugün girilmiş kur düzeltilir; düzelten kişi ve saat kaydedilir.' : 'Bugün için yeni kur satırı açılır.'} Muhasebe alışı, satın alma maliyeti satışı kullanır.</p>
    </form>
  );
}

const faizAnahtari = (t: FaizTuru, p: string) => `${t}|${p}`;
// Faiz tür ve para birimi başına yıllık yüzdedir ve bugünden geçerli yeni satır olarak eklenir; eski oranlar silinmez. Değişmeyen gönderilmez.
// Sonucu bilinmeyen gönderimden sonra yeniden kaydet aynı kimlikle gider (oran ikinci kez yazılmaz).
function FaizFormu({ o, kapat }: { o: OranOzeti; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const mevcut = (t: FaizTuru, p: string) => o.faizler.find((f) => f.tur === t && f.paraBirimi === p);
  const [degerler, degerlerYaz] = useState<Record<string, string>>(() => Object.fromEntries(FAIZ_TURLERI.flatMap((t) => FAIZ_BIRIMLERI.map((p) => {
    const f = mevcut(t, p);
    return [faizAnahtari(t, p), f ? sayi(f.yillikYuzde, 4) : ''];
  }))));
  const [hata, hataYaz] = useState<string | null>(null);
  const kimlikler = useRef<Record<string, string>>({});
  const kimlik = (a: string): string => (kimlikler.current[a] ??= yeniIstekKimligi());
  const yaz = useMutation({
    mutationFn: async (gidecek: { tur: FaizTuru; paraBirimi: string; yillikYuzde: number }[]) => {
      for (const g of gidecek) {
        const a = faizAnahtari(g.tur, g.paraBirimi);
        const govde = { ...g, gecerlilikBaslangic: o.bugun, not: null };
        await tekrarKorumaliGonder(
          (d) => api.post('/finans/oranlar/ekle', govde, { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) }),
          { istekKimligi: kimlik(a) },
        );
        delete kimlikler.current[a];
      }
    },
    onSuccess: async () => { bildir('tamam', 'Faiz kaydedildi.'); kapat(); await istemci.invalidateQueries(); },
    onError: async (h) => {
      if (!yenidenDenenebilirMi(h)) kimlikler.current = {};
      bildir('hata', hataIletisi(h, 'Faiz kaydedilemedi.'));
      await istemci.invalidateQueries({ queryKey: OZET_ANAHTARI });
    },
  });
  const gonder = (e: FormEvent) => {
    e.preventDefault();
    const gidecek: { tur: FaizTuru; paraBirimi: string; yillikYuzde: number }[] = [];
    for (const t of FAIZ_TURLERI) {
      for (const p of FAIZ_BIRIMLERI) {
        const metin = degerler[faizAnahtari(t, p)] ?? '';
        if (metin.trim() === '') continue;
        const n = girdiSayisi(metin);
        if (n === null || n < 0 || n > 1000) { hataYaz(`${p} ${FAIZ_ADI[t].toLocaleLowerCase('tr')} faizi 0 ile 1000 arasında olmalı.`); return; }
        const f = mevcut(t, p);
        if (f && Number(f.yillikYuzde) === n) continue;
        gidecek.push({ tur: t, paraBirimi: p, yillikYuzde: n });
      }
    }
    hataYaz(null);
    if (gidecek.length === 0) { kapat(); return; }
    yaz.mutate(gidecek);
  };
  return (
    <form className="tc-kfs-blok" onSubmit={gonder} aria-label="Yıllık faiz">
      <h2 className="tc-kfs-baslik"><Simge ad="chart" boyut="k" />Yıllık faiz %, bugünden geçerli</h2>
      {FAIZ_TURLERI.map((t) => (
        <fieldset key={t} className="tc-kfs-faiz">
          <legend className="tc-kfs-not">{FAIZ_ADI[t]}{t === 'mevduat' ? ' (stopaj sonrası)' : ''}</legend>
          {FAIZ_BIRIMLERI.map((p) => {
            const f = mevcut(t, p);
            return (
              <Girdi key={p} etiket={`${p} ${FAIZ_ADI[t].toLocaleLowerCase('tr')} %`} inputMode="decimal" className="mono" value={degerler[faizAnahtari(t, p)] ?? ''}
                ipucu={f ? `${gunMetni(f.gecerlilikBaslangic, o.bugun)}${oranEskiMi(f.gecerlilikBaslangic, o.bugun) ? ', eski' : ''}` : 'girilmedi'}
                onChange={(e) => degerlerYaz((d) => ({ ...d, [faizAnahtari(t, p)]: e.target.value }))} />
            );
          })}
        </fieldset>
      ))}
      {hata && <p className="tc-kfs-hata" role="alert">{hata}</p>}
      <div className="tc-kfs-eylem"><Dugme type="submit" tur="birincil" simge="check" yukleniyor={yaz.isPending}>Faizi kaydet</Dugme></div>
      <p className="tc-kfs-not">Yalnız değişen oran yazılır; eski oranlar silinmez. Günlük karşılık yıllık / 365 ile hesaplanır.</p>
    </form>
  );
}
