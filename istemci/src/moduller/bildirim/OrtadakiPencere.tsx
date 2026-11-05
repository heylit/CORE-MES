import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Bildirim, BildirimOnayCevabi, OrtadakiBildirim, OrtadakiBildirimlerCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { Dugme, Pencere, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ONEM_ADI, SAYAC_YOKLAMA_MS, YAYIN_TURU, gecenZaman, modulAdi, modulSimgesi, ortadaBekletilirMi } from './gorunum.ts';

const bosVer = (): void => undefined;

// Başka bir kipli pencere (karşılama, açılış gösterisi, açık form) varken ortadaki bekler, o kapanınca çıkar: ikisi üst üste binmez.
const baskaKatmanVar = (): boolean =>
  [...document.querySelectorAll('[aria-modal="true"]')].some((e) => e.querySelector('[data-bildirim-orta]') === null);
function useBaskaKatman(izle: boolean): boolean {
  const [var_, yaz] = useState(false);
  useEffect(() => {
    if (!izle) return undefined;
    const bak = () => { yaz(baskaKatmanVar()); };
    const gozcu = new MutationObserver(bak);
    gozcu.observe(document.body, { childList: true, subtree: true });
    bak();
    return () => { gozcu.disconnect(); };
  }, [izle]);
  return izle && var_;
}

export const gorselAdresi = (yayinId: number): string => `/api/bildirimler/yayinlar/${String(yayinId)}/gorsel`;

function ust(b: OrtadakiBildirim): { tur: string; simge: ReturnType<typeof modulSimgesi>; ton: string } {
  if (b.yayinTuru === null) return { tur: ONEM_ADI[b.onem], simge: modulSimgesi(b.kaynakModul), ton: b.onem };
  const t = YAYIN_TURU[b.yayinTuru];
  return { tur: t.ad, simge: b.simge ?? t.simge, ton: t.ton };
}

// Ekran ortası (2147-3 a): kişinin bekleyen bildirimleri sırayla, eskiden yeniye. Onay isteyen "Okudum, anladım" demeden
// kapanmaz (perde, Esc ve kapatma yok; Arkon hazırlık uyarısıyla aynı); onaysız olan Kapat ile kapanır ve okundu sayılır.
// Zil düğmesiyle birlikte her sayfada çizilir; yoklama zille aynı aralıktadır.
export function OrtadakiPencere() {
  const yer = useLocation();
  const git = useNavigate();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const bekle = ortadaBekletilirMi(yer.pathname);
  const sorgu = useQuery({
    queryKey: anahtarlar.ortada,
    queryFn: () => api.get<OrtadakiBildirimlerCevabi>('/bildirimler/ortada'),
    refetchInterval: SAYAC_YOKLAMA_MS,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: !bekle,
  });
  const yenile = () => istemci.invalidateQueries({ queryKey: anahtarlar.kok });
  const hata = (h: unknown) => bildir('hata', hataIletisi(h, 'İşlem yapılamadı.'));
  const onayla = useMutation({ mutationFn: (id: number) => api.post<BildirimOnayCevabi>(`/bildirimler/${id}/onayla`), onSettled: yenile, onError: hata });
  const okundu = useMutation({ mutationFn: (id: number) => api.post<Bildirim>(`/bildirimler/${id}/okundu`), onSettled: yenile, onError: hata });

  const satirlar = sorgu.data?.satirlar ?? [];
  const b = satirlar[0];
  const engel = useBaskaKatman(!bekle && b !== undefined);
  if (bekle || b === undefined || engel) return null;
  const u = ust(b);
  const bekliyor = onayla.isPending || okundu.isPending;
  const kapat = () => { okundu.mutate(b.id); };
  const ac = () => {
    okundu.mutate(b.id);
    if (b.yol !== null) void git(b.yol);
  };
  const kunye = [b.gonderen ?? modulAdi(b.kaynakModul), gecenZaman(b.olusturuldu, new Date())].join(' · ');
  return (
    <Pencere
      acik
      kapat={b.onayIstenir ? bosVer : kapat}
      baslik={b.baslik}
      ust={(
        <header className="tc-bildirim-orta-ust" data-ton={u.ton}>
          <span className={`tc-bildirim-simge tc-bildirim-${u.ton}`}><Simge ad={u.simge} boyut="b" /></span>
          <div>
            <span className="tc-bildirim-orta-tur">{u.tur}{satirlar.length > 1 ? ` · 1 / ${String(satirlar.length)}` : ''}</span>
            <h2>{b.baslik}</h2>
          </div>
        </header>
      )}
      alt={(
        <div className="tc-bildirim-orta-alt">
          {b.onayIstenir
            ? <Dugme tur="birincil" boyut="ana" simge="check" onClick={() => onayla.mutate(b.id)} yukleniyor={onayla.isPending} disabled={bekliyor}>Okudum, anladım</Dugme>
            : <Dugme tur="birincil" boyut="ana" simge="check" onClick={kapat} yukleniyor={okundu.isPending} disabled={bekliyor}>Kapat</Dugme>}
          {b.yol !== null && !b.onayIstenir && <Dugme simge="eye" onClick={ac} disabled={bekliyor}>Kaydı aç</Dugme>}
        </div>
      )}
    >
      <div className="tc-bildirim-orta" role="alert" data-bildirim-orta="">
        {b.gorselVar && b.yayinId !== null && <img className="tc-bildirim-orta-gorsel" src={gorselAdresi(b.yayinId)} alt="" />}
        {b.metin !== null && <p className="tc-bildirim-orta-metin">{b.metin}</p>}
        <p className="tc-bildirim-kaynak">{kunye}</p>
        {b.onayIstenir && <p className="tc-bildirim-not">Onayınız adınız ve saatiyle kaydedilir.</p>}
      </div>
    </Pencere>
  );
}
