import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KurFaizOzeti } from '#paylasilan/sozlesme/finans.ts';
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
const OZET_ANAHTARI = ['finans', 'kur-ozeti'] as const;

const sayi = (deger: string, basamak: number): string => Number(deger).toLocaleString('tr-TR', { maximumFractionDigits: basamak });
const girdiSayisi = (metin: string): number | null => {
  const t = metin.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
// Aylık bileşik faizin yıllık karşılığı; girişin yanında gösterilir, kaydedilen aylıktır.
export const yillikFaiz = (aylik: number): number => (Math.pow(1 + aylik / 100, 12) - 1) * 100;
const gunMetni = (tarih: string, bugun: string): string => (tarih === bugun ? 'bugün' : tarih.split('-').reverse().slice(0, 2).join('.'));
// Giriş anı tesis saatiyle; bugünse "bugün 09:44".
function girisMetni(iso: string, bugun: string): string {
  const an = new Date(iso);
  const gun = an.toLocaleDateString('sv-SE', { timeZone: TESIS_TZ });
  return `${gunMetni(gun, bugun)} ${an.toLocaleTimeString('tr-TR', { timeZone: TESIS_TZ, hour: '2-digit', minute: '2-digit' })}`;
}

// Ortak kur ve faiz şeridi (939, 952 a, 953 a): her sayfanın en üstünde durur; giriş yapan herkes okur, finans.kur-yaz taşıyan bugünün
// kurlarını ve bugünden geçerli faizi girer. Değerler finansın tablolarındadır; her giriş kişi ve saatle kaydedilir.
export function KurFaizSeridi() {
  const islemler = useOturum().data?.islemler ?? [];
  const yazabilir = islemler.includes('finans.kur-yaz');
  const [acik, acikYaz] = useState(false);
  const ozet = useQuery({ queryKey: OZET_ANAHTARI, queryFn: () => api.get<KurFaizOzeti>('/finans/kur-ozeti') });
  // Okunamayan ya da henüz gelmeyen özet şerit çizmez: her sayfanın üstünde boş ya da hatalı bir şerit durmasın.
  const o = ozet.data;
  if (!o) return null;
  const kur = (p: string) => o.kurlar.find((k) => k.paraBirimi === p);
  const faiz = (p: string) => o.faizler.find((f) => f.paraBirimi === p);
  const bugunEksik = KUR_BIRIMLERI.some((p) => kur(p)?.tarih !== o.bugun);
  return (
    <section className="tc-kfs" aria-label="Kur ve faiz">
      <div className="tc-kfs-satir">
        <button type="button" className="tc-kfs-ozet" aria-expanded={acik} onClick={() => acikYaz((a) => !a)} title="Kur ve faiz ayrıntısı">
          <Simge ad="rotate" boyut="k" />
          {KUR_BIRIMLERI.map((p) => {
            const k = kur(p);
            return (
              <span key={p} className="tc-kfs-kalem" data-kfs={`kur-${p}`}>
                <span className="tc-kfs-ad">{p}</span>
                <b className="mono">{k ? sayi(k.kur, 4) : 'yok'}</b>
                {k && k.tarih !== o.bugun && <span className="tc-kfs-eski">{gunMetni(k.tarih, o.bugun)}</span>}
              </span>
            );
          })}
          <span className="tc-kfs-ayrac" aria-hidden="true" />
          {FAIZ_BIRIMLERI.map((p) => {
            const f = faiz(p);
            return (
              <span key={p} className="tc-kfs-kalem" data-kfs={`faiz-${p}`}>
                <span className="tc-kfs-ad">{p} faiz</span>
                <b className="mono">{f ? `%${sayi(f.aylikYuzde, 2)}` : 'yok'}</b>
                <span className="tc-kfs-ad">/ay</span>
              </span>
            );
          })}
          {yazabilir && bugunEksik && <span className="tc-kfs-uyari"><span className="tc-kfs-isaret" aria-hidden="true" />Bugün girilmedi</span>}
          <span className="tc-kfs-son">
            {o.sonGiris ? `Son giriş: ${girisMetni(o.sonGiris.giris, o.bugun)}, ${o.sonGiris.girenAd ?? 'bilinmiyor'}` : 'Henüz kur ya da faiz girilmedi'}
          </span>
        </button>
        {yazabilir && (
          <button type="button" className="tc-kfs-guncelle" onClick={() => acikYaz(true)} aria-label="Kur ve faizi güncelle">
            <Simge ad="edit" boyut="k" /><span className="tc-kfs-guncelle-ad">Güncelle</span>
          </button>
        )}
      </div>
      {acik && <Panel o={o} yazabilir={yazabilir} kapat={() => acikYaz(false)} />}
    </section>
  );
}

function Panel({ o, yazabilir, kapat }: { o: KurFaizOzeti; yazabilir: boolean; kapat: () => void }) {
  return (
    <div className="tc-kfs-panel" role="region" aria-label="Kur ve faiz ayrıntısı">
      {yazabilir ? <KurFormu o={o} kapat={kapat} /> : (
        <div className="tc-kfs-blok">
          <h2 className="tc-kfs-baslik"><Simge ad="rotate" boyut="k" />Kur (TRY)</h2>
          <p className="tc-kfs-not">{KUR_BIRIMLERI.map((p) => { const k = o.kurlar.find((x) => x.paraBirimi === p); return `${p} ${k ? sayi(k.kur, 4) : 'yok'}`; }).join(' · ')}</p>
          <p className="tc-kfs-not">Kur ve faiz girişi finans ve satın almadadır.</p>
        </div>
      )}
      {yazabilir ? <FaizFormu o={o} kapat={kapat} /> : (
        <div className="tc-kfs-blok">
          <h2 className="tc-kfs-baslik"><Simge ad="chart" boyut="k" />Aylık faiz</h2>
          <p className="tc-kfs-not">{FAIZ_BIRIMLERI.map((p) => { const f = o.faizler.find((x) => x.paraBirimi === p); return `${p} ${f ? `%${sayi(f.aylikYuzde, 2)}` : 'yok'}`; }).join(' · ')}</p>
        </div>
      )}
      <div className="tc-kfs-blok tc-kfs-gecmis-blok">
        <h2 className="tc-kfs-baslik"><Simge ad="clock" boyut="k" />Son girişler</h2>
        {o.gecmis.length === 0 ? <p className="tc-kfs-not">Henüz giriş yok.</p> : (
          <ul className="tc-kfs-gecmis">
            {o.gecmis.map((g) => (
              <li key={`${g.tur}-${g.paraBirimi}-${g.tarih}-${g.giris}`}>
                <span className="tc-kfs-tur" data-tur={g.tur}>{g.tur}</span>
                <span className="tc-kfs-ne">
                  <span className="mono">{g.paraBirimi} {g.tur === 'kur' ? sayi(g.deger, 4) : `aylık %${sayi(g.deger, 2)}`}</span>
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

// Bugünün üç kuru birlikte girilir (953 a); bugün girilmiş kur düzeltilir (sürümüyle), girilmemiş olana yeni satır açılır.
// Boş bırakılan ya da değişmeyen para birimi gönderilmez. Geçmiş tarihli kur finansın Kurlar ekranındadır.
function KurFormu({ o, kapat }: { o: KurFaizOzeti; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const bugunku = (p: string) => o.kurlar.find((k) => k.paraBirimi === p && k.tarih === o.bugun);
  const [degerler, degerlerYaz] = useState<Record<string, string>>(() => Object.fromEntries(KUR_BIRIMLERI.map((p) => {
    const k = bugunku(p);
    return [p, k ? sayi(k.kur, 6).replace(/\./g, '') : ''];
  })));
  const [hata, hataYaz] = useState<string | null>(null);
  const yaz = useMutation({
    mutationFn: async (gidecek: { paraBirimi: string; kur: number }[]) => {
      for (const g of gidecek) {
        const k = bugunku(g.paraBirimi);
        if (k) await api.post('/finans/kurlar/guncelle', { paraBirimi: g.paraBirimi, tarih: o.bugun, kur: g.kur, surum: k.surum });
        else await api.post('/finans/kurlar/ekle', { paraBirimi: g.paraBirimi, tarih: o.bugun, kur: g.kur });
      }
    },
    onSuccess: async () => { bildir('tamam', 'Kurlar kaydedildi.'); kapat(); await istemci.invalidateQueries(); },
    onError: async (h) => { bildir('hata', hataIletisi(h, 'Kur kaydedilemedi.')); await istemci.invalidateQueries({ queryKey: OZET_ANAHTARI }); },
  });
  const gonder = (e: FormEvent) => {
    e.preventDefault();
    const gidecek: { paraBirimi: string; kur: number }[] = [];
    for (const p of KUR_BIRIMLERI) {
      const metin = degerler[p] ?? '';
      if (metin.trim() === '') continue;
      const n = girdiSayisi(metin);
      if (n === null || n <= 0) { hataYaz(`${p} kuru sıfırdan büyük bir sayı olmalı.`); return; }
      const k = bugunku(p);
      if (k && Number(k.kur) === n) continue;
      gidecek.push({ paraBirimi: p, kur: n });
    }
    hataYaz(null);
    if (gidecek.length === 0) { kapat(); return; }
    yaz.mutate(gidecek);
  };
  const herhangiBugun = KUR_BIRIMLERI.some((p) => bugunku(p));
  return (
    <form className="tc-kfs-blok" onSubmit={gonder} aria-label="Bugünün kuru">
      <h2 className="tc-kfs-baslik"><Simge ad="rotate" boyut="k" />Bugünün kuru (TRY)</h2>
      {KUR_BIRIMLERI.map((p) => (
        <Girdi key={p} etiket={`${p} kuru`} inputMode="decimal" className="mono" value={degerler[p] ?? ''}
          placeholder={(() => { const k = o.kurlar.find((x) => x.paraBirimi === p); return k ? sayi(k.kur, 4) : ''; })()}
          ipucu={bugunku(p) ? 'bugün girildi; değiştirirseniz düzeltilir' : 'bugün girilmedi'}
          onChange={(e) => degerlerYaz((d) => ({ ...d, [p]: e.target.value }))} />
      ))}
      {hata && <p className="tc-kfs-hata" role="alert">{hata}</p>}
      <div className="tc-kfs-eylem"><Dugme type="submit" tur="birincil" simge="check" yukleniyor={yaz.isPending}>Kurları kaydet</Dugme></div>
      <p className="tc-kfs-not">{herhangiBugun ? 'Bugün girilmiş kur düzeltilir; düzelten kişi ve saat kaydedilir.' : 'Bugün için yeni kur satırı açılır.'} Geçmiş tarih finansın Kurlar ekranından girilir.</p>
    </form>
  );
}

// Faiz para birimi başına aylık yüzdedir ve bugünden geçerli yeni satır olarak eklenir; eski oranlar silinmez. Değişmeyen gönderilmez.
// Sonucu bilinmeyen gönderimden sonra yeniden kaydet aynı kimlikle gider (faiz ikinci kez yazılmaz).
function FaizFormu({ o, kapat }: { o: KurFaizOzeti; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const mevcut = (p: string) => o.faizler.find((f) => f.paraBirimi === p);
  const [degerler, degerlerYaz] = useState<Record<string, string>>(() => Object.fromEntries(FAIZ_BIRIMLERI.map((p) => {
    const f = mevcut(p);
    return [p, f ? sayi(f.aylikYuzde, 4) : ''];
  })));
  const [hata, hataYaz] = useState<string | null>(null);
  const kimlikler = useRef<Record<string, string>>({});
  const kimlik = (p: string): string => (kimlikler.current[p] ??= yeniIstekKimligi());
  const yaz = useMutation({
    mutationFn: async (gidecek: { paraBirimi: string; aylikYuzde: number }[]) => {
      for (const g of gidecek) {
        const govde = { paraBirimi: g.paraBirimi, gecerlilikBaslangic: o.bugun, aylikYuzde: g.aylikYuzde };
        await tekrarKorumaliGonder(
          (d) => api.post('/finans/faizler/ekle', govde, { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) }),
          { istekKimligi: kimlik(g.paraBirimi) },
        );
        delete kimlikler.current[g.paraBirimi];
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
    const gidecek: { paraBirimi: string; aylikYuzde: number }[] = [];
    for (const p of FAIZ_BIRIMLERI) {
      const metin = degerler[p] ?? '';
      if (metin.trim() === '') continue;
      const n = girdiSayisi(metin);
      if (n === null || n < 0 || n > 100) { hataYaz(`${p} faizi 0 ile 100 arasında olmalı.`); return; }
      const f = mevcut(p);
      if (f && Number(f.aylikYuzde) === n) continue;
      gidecek.push({ paraBirimi: p, aylikYuzde: n });
    }
    hataYaz(null);
    if (gidecek.length === 0) { kapat(); return; }
    yaz.mutate(gidecek);
  };
  return (
    <form className="tc-kfs-blok" onSubmit={gonder} aria-label="Aylık faiz">
      <h2 className="tc-kfs-baslik"><Simge ad="chart" boyut="k" />Aylık faiz, bugünden geçerli</h2>
      {FAIZ_BIRIMLERI.map((p) => {
        const n = girdiSayisi(degerler[p] ?? '');
        return (
          <Girdi key={p} etiket={`${p} aylık faiz (%)`} inputMode="decimal" className="mono" value={degerler[p] ?? ''}
            ipucu={n === null ? 'finansta faiz yok' : `yıllık %${sayi(yillikFaiz(n).toFixed(1), 1)}`}
            onChange={(e) => degerlerYaz((d) => ({ ...d, [p]: e.target.value }))} />
        );
      })}
      {hata && <p className="tc-kfs-hata" role="alert">{hata}</p>}
      <div className="tc-kfs-eylem"><Dugme type="submit" tur="birincil" simge="check" yukleniyor={yaz.isPending}>Faizi kaydet</Dugme></div>
      <p className="tc-kfs-not">Yalnız değişen para birimi yazılır. Eski oranlar silinmez; teklif karşılaştırmaları yeni oranla hesaplanır.</p>
    </form>
  );
}
