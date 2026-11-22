import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type GorevDurumu, type TopluGorevIptalCevabi, type TopluGorevIptalGovdesi,
} from '#paylasilan/sozlesme/projeler.ts';
import { CokSatir, Dugme, Pencere, Rozet } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { useIstekKimligi } from './komut.ts';
import './projeler.css';

// 3580: tekli ve toplu iptal aynı pencereyi kullanır. Pencere seçilenleri sayar: yalnız gerçekten iptal edilecekler başlıkta ve
// düğmede sayılır, bitmiş ya da iptal olanlar ayrı satırda "atlanacak" diye yazılır. Görev silinmez.
export interface IptalAdayi {
  id: number;
  ad: string;
  durum: GorevDurumu;
  surum: number;
  // Birden çok projeyi kapsayan listede (Benim görevlerim) aynı adlı görevler karışmasın.
  projeKod: string | null;
  hazirlik: boolean;
}
export interface IptalSonucu { id: number; tamam: boolean; ileti: string | null; yenidenDenenir: boolean }
export type IptalGonder = (gorevler: readonly { id: number; surum: number }[], gerekce: string, istekKimligi: string) => Promise<readonly IptalSonucu[]>;

// Sınırlar sunucu sözleşmesindeki (paylasilan/sozlesme/projeler.ts) değerlerdir; sunucu yine denetler.
const IPTAL_GEREKCE_EN_AZ = 3;
const IPTAL_GEREKCE_EN_COK = 500;
const TOPLU_IPTAL_EN_COK = 200;
const KAPALI: readonly GorevDurumu[] = ['bitti', 'iptal'];
export const iptalEdilebilir = (g: Pick<IptalAdayi, 'durum'>): boolean => !KAPALI.includes(g.durum);
const GORUNEN = 5;
const adMetni = (g: IptalAdayi): string => (g.projeKod === null ? g.ad : `${g.ad} · ${g.projeKod}`);
const adlar = (l: readonly IptalAdayi[]): string => `${l.slice(0, GORUNEN).map(adMetni).join(', ')}${l.length > GORUNEN ? ` +${String(l.length - GORUNEN)}` : ''}`;
const GEREKCE_IPUCU = `Gerekçe en az ${String(IPTAL_GEREKCE_EN_AZ)} karakter olmalı. Her göreve aynı gerekçe yazılır.`;

export function GorevIptalPenceresi({ adaylar, kapat, gonder }: {
  // Canlı liste: yeniden denemede sürüm buradan taze alınır.
  adaylar: readonly IptalAdayi[]; kapat: () => void; gonder: IptalGonder;
}) {
  const [gerekce, gerekceYaz] = useState('');
  const [bekliyor, bekliyorYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const [ilk, ilkYaz] = useState<readonly IptalAdayi[] | null>(null);
  const [sonuc, sonucYaz] = useState<{ tamam: number; basarisiz: readonly IptalSonucu[] } | null>(null);
  const kimlik = useIstekKimligi();

  const iptalEdilecek = adaylar.filter(iptalEdilebilir);
  const atlanacak = adaylar.filter((g) => !iptalEdilebilir(g));
  const kontrolde = iptalEdilecek.filter((g) => g.durum === 'kontrolde').length;
  const hazirlik = iptalEdilecek.filter((g) => g.hazirlik).length;
  const n = iptalEdilecek.length;
  const temiz = gerekce.trim();
  const asiri = n > TOPLU_IPTAL_EN_COK;
  const tekli = adaylar.length === 1;

  const yolla = async (liste: readonly IptalAdayi[]) => {
    bekliyorYaz(true);
    hataYaz(null);
    try {
      const s = await gonder(liste.map((g) => ({ id: g.id, surum: g.surum })), temiz, kimlik.al());
      kimlik.hataSonrasi(null);
      const basarisiz = s.filter((x) => !x.tamam);
      if (tekli && basarisiz.length === 0) { kapat(); return; }
      ilkYaz((o) => o ?? liste);
      sonucYaz((o) => ({ tamam: (o?.tamam ?? 0) + s.length - basarisiz.length, basarisiz }));
    } catch (h) {
      kimlik.hataSonrasi(h);
      hataYaz(hataIletisi(h, 'Görev iptal edilemedi'));
    } finally {
      bekliyorYaz(false);
    }
  };

  if (sonuc !== null) {
    const tum = ilk ?? [];
    const ad = (id: number): string => { const g = tum.find((x) => x.id === id) ?? adaylar.find((x) => x.id === id); return g === undefined ? `#${String(id)}` : adMetni(g); };
    // Yeniden deneme yalnız sürüm çakışmasında ve görev hâlâ açıksa; sürüm canlı listeden taze alınır.
    const yeniden = sonuc.basarisiz.flatMap((b) => {
      const g = adaylar.find((x) => x.id === b.id);
      return b.yenidenDenenir && g !== undefined && iptalEdilebilir(g) ? [g] : [];
    });
    return (
      <Pencere
        key="sonuc" acik kapat={kapat} baslik="İptal sonucu"
        alt={(
          <>
            <Dugme onClick={kapat} disabled={bekliyor} data-ilk-odak>Kapat</Dugme>
            {yeniden.length > 0 && (
              <Dugme tur="tehlike" yukleniyor={bekliyor} onClick={() => { void yolla(yeniden); }}>
                {yeniden.length === 1 ? '1 görevi yeniden iptal et' : `${String(yeniden.length)} görevi yeniden iptal et`}
              </Dugme>
            )}
          </>
        )}
      >
        <div className="tc-prj-icerik">
          <p role="status">
            <Rozet ton="tamam">{sonuc.tamam} iptal edildi</Rozet>
            {sonuc.basarisiz.length > 0 && <> <Rozet ton="uyari">{sonuc.basarisiz.length} iptal edilemedi</Rozet></>}
          </p>
          {sonuc.basarisiz.length > 0 && (
            <ul className="tc-prj-iptal-liste" aria-label="İptal edilemeyen görevler">
              {sonuc.basarisiz.map((b) => (
                <li key={b.id}><strong>{ad(b.id)}</strong> <span className="tc-prj-soluk">{b.ileti ?? ''}</span></li>
              ))}
            </ul>
          )}
          {yeniden.length > 0 && <p className="tc-prj-soluk">Gerekçe aynı kalır: “{temiz}”. Başkası değiştirdiği görevler yeni sürümle yeniden denenir.</p>}
          {hata !== null && <p className="tc-prj-hata" role="alert">{hata}</p>}
        </div>
      </Pencere>
    );
  }

  const gerekceHazir = temiz.length >= IPTAL_GEREKCE_EN_AZ;
  const engel = n === 0 ? 'İptal edilebilir görev yok: seçilenler bitmiş ya da zaten iptal edilmiş.'
    : asiri ? `Bir seferde en çok ${String(TOPLU_IPTAL_EN_COK)} görev iptal edilebilir; ${String(n)} seçili.` : null;
  return (
    <Pencere
      key="form" acik kapat={kapat} baslik={n === 0 ? 'İptal edilecek görev yok' : n === 1 ? 'Görevi iptal et' : `${String(n)} görev iptal edilecek`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={bekliyor}>Vazgeç</Dugme>
          <Dugme tur="tehlike" yukleniyor={bekliyor} disabled={engel !== null || !gerekceHazir} onClick={() => { void yolla(iptalEdilecek); }}>
            {n === 0 ? 'İptal et' : n === 1 ? 'Görevi iptal et' : `${String(n)} görevi iptal et`}
          </Dugme>
        </>
      )}
    >
      <div className="tc-prj-icerik">
        {engel !== null && <p className="tc-prj-hata" role="alert">{engel}</p>}
        {n > 0 && <p>{adlar(iptalEdilecek)}</p>}
        {atlanacak.length > 0 && (
          <p className="tc-prj-soluk">Atlanacak ({atlanacak.length}): bitmiş ya da zaten iptal edilmiş — {adlar(atlanacak)}</p>
        )}
        {kontrolde > 0 && <p className="tc-prj-soluk">Kontrolde bekleyen: {kontrolde}. İptal onay sayılmaz; görev bitmiş sayılmaz.</p>}
        {hazirlik > 0 && (
          <p className="tc-prj-dagit-serit" role="note">Emre bağlı {hazirlik} hazırlık görevi var; emir yeniden dağıtılırsa geri açılır.</p>
        )}
        <CokSatir
          etiket="Gerekçe" required value={gerekce} maxLength={IPTAL_GEREKCE_EN_COK} disabled={n === 0} data-ilk-odak
          ipucu={gerekceHazir ? `${String(temiz.length)}/${String(IPTAL_GEREKCE_EN_COK)} · Her göreve aynı gerekçe yazılır.` : GEREKCE_IPUCU}
          onChange={(e) => { gerekceYaz(e.target.value); }}
        />
        <p className="tc-prj-soluk">Görev silinmez; geçmişte kim, ne zaman, neden ile kalır.</p>
        {hata !== null && <p className="tc-prj-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}

// Liste ekranlarının ortak bağı: tablo toplu çubuğuna "İptal et" ekler (yalnız görev yazana) ve pencereyi açar. Seçim kimliklerle
// tutulur; pencere her çizimde canlı listeden sürümleri taze alır, sonuçtan sonra liste yenilenir.
export function useTopluIptal<S extends { id: number }>(tumu: readonly S[], aday: (s: S) => IptalAdayi, yazar: boolean) {
  const [idler, idlerYaz] = useState<readonly number[] | null>(null);
  const istemci = useQueryClient();
  const gonder: IptalGonder = async (gorevler, gerekce, istekKimligi) => {
    const govde: TopluGorevIptalGovdesi = { gorevler: gorevler.map((g) => ({ id: g.id, surum: g.surum })), gerekce };
    const c = await api.post<TopluGorevIptalCevabi>('/projeler/gorevler/toplu-iptal', govde, { istekKimligi });
    await istemci.invalidateQueries({ queryKey: anahtarlar.kok, predicate: (q) => q.queryKey[1] !== 'gorev' });
    return c.sonuclar;
  };
  const toplu = yazar
    ? {
      buyukSecim: true,
      eylemler: [{ anahtar: 'iptal', baslik: 'İptal et', simge: 'x' as const, ton: 'tehlike' as const, yap: (s: readonly S[]) => { idlerYaz(s.map((x) => x.id)); } }],
    }
    : undefined;
  const pencere = idler === null ? null : (
    <GorevIptalPenceresi adaylar={tumu.filter((x) => idler.includes(x.id)).map(aday)} kapat={() => { idlerYaz(null); }} gonder={gonder} />
  );
  return { toplu, pencere };
}
