import { useEffect, useRef, useState } from 'react';
import type { KartsizIzin } from '#paylasilan/sozlesme/kartsiz-izin.ts';
import { Dugme, Rozet, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, api } from '../../../../ortak/veri/api.ts';
import './yetkili-cagir.css';

// 3771 a: kartı olmayan operatör yetkiliyi çağırır; yetkili telefondan gerekçeyle izin verir ya da reddeder. Ekran cevabı kendiliğinden
// okur; izin gelince iş burada izinle başlar (izin tek iş ve tek kişi içindir, sunucu bir kez kullandırır). Operatörün yetkisi değişmez.
export const IZIN_SORMA_MS = 3000;
type Hal = KartsizIzin['durum'];
const ROZET: Readonly<Record<Hal, { ad: string; ton: RozetTonu }>> = {
  bekliyor: { ad: 'Bekliyor', ton: 'bilgi' }, izin: { ad: 'İzin verildi', ton: 'tamam' }, ret: { ad: 'Reddedildi', ton: 'hata' },
  iptal: { ad: 'İptal edildi', ton: 'pasif' }, kullanildi: { ad: 'İzin verildi', ton: 'tamam' }, 'sure-doldu': { ad: 'Süre doldu', ton: 'pasif' },
};
const saatMetni = (an: string | null): string => (an === null ? '' : new Date(an).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));

export function izinMetni(z: KartsizIzin): string {
  switch (z.durum) {
    case 'bekliyor': return `Yetkiliye bildirim gitti · ${saatMetni(z.gecerlilikBitis)}'e kadar cevap gelmezse istek düşer`;
    case 'izin': case 'kullanildi': return `${z.kararVeren ?? 'Yetkili'} izin verdi: "${z.kararGerekce ?? ''}" · İş başlıyor`;
    case 'ret': return `${z.kararVeren ?? 'Yetkili'}: "${z.kararGerekce ?? ''}" · Kartla başlatın`;
    case 'iptal': return 'İstek iptal edildi';
    case 'sure-doldu': return 'Cevap gelmedi · Yeniden çağırabilirsiniz';
  }
}

export function YetkiliCagir({ emirId, isEmriId, izinle }: { emirId: number; isEmriId: number | null; izinle: (izinId: number) => void }) {
  const [z, zYaz] = useState<KartsizIzin | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const [gonderiyor, gonderiyorYaz] = useState(false);
  const kullanilan = useRef<number | null>(null);
  const izinleRef = useRef(izinle);
  izinleRef.current = izinle;
  const id = z?.id ?? null;
  const bekliyor = z?.durum === 'bekliyor';

  useEffect(() => {
    if (id === null || !bekliyor) return;
    const t = setInterval(() => {
      api.get<KartsizIzin>(`/uretim-emirleri/kartsiz-izinler/${String(id)}`).then((c) => { zYaz(c); hataYaz(null); }, () => { /* son bilinen kalır */ });
    }, IZIN_SORMA_MS);
    return () => { clearInterval(t); };
  }, [id, bekliyor]);

  useEffect(() => {
    if (z?.durum === 'izin' && kullanilan.current !== z.id) { kullanilan.current = z.id; izinleRef.current(z.id); }
  }, [z]);

  const cagir = () => {
    gonderiyorYaz(true);
    hataYaz(null);
    api.post<KartsizIzin>(`/uretim-emirleri/${String(emirId)}/kartsiz-izin-iste`, isEmriId === null ? {} : { isEmriId })
      .then((c) => { zYaz(c); }, (h: unknown) => { hataYaz(h instanceof ApiHatasi ? h.message : 'Yetkili çağrılamadı; bağlantıyı denetleyin.'); })
      .finally(() => { gonderiyorYaz(false); });
  };
  const iptal = () => {
    if (id === null) return;
    api.post<KartsizIzin>(`/uretim-emirleri/kartsiz-izinler/${String(id)}/iptal`).then((c) => { zYaz(c); }, () => { hataYaz('İstek iptal edilemedi.'); });
  };

  if (z === null) {
    return (
      <div className="tc-ay1-yetkili-cagir" data-yetkili-cagir="">
        <p>Kart yok mu? <span className="tc-ay1-soluk">Kartsız başlatma yetkisi olanlara bildirim gider; izin gelince iş burada başlar.</span></p>
        <Dugme tur="ikincil" simge="bell" yukleniyor={gonderiyor} onClick={cagir}>Yetkiliyi çağır</Dugme>
        {hata === null ? null : <p role="alert" className="tc-ay1-soluk">{hata}</p>}
      </div>
    );
  }
  const r = ROZET[z.durum];
  return (
    <div className="tc-ay1-yetkili-cagir" data-yetkili-cagir="" data-durum={z.durum}>
      <p role="status"><Rozet ton={r.ton}>{r.ad}</Rozet> {izinMetni(z)}</p>
      {z.durum === 'bekliyor' ? (
        <div className="tc-ay1-yetkili-cagir-dugmeler">
          <Dugme tur="ikincil" simge="bell" yukleniyor={gonderiyor} onClick={cagir}>Yeniden çağır</Dugme>
          <Dugme tur="ikincil" simge="x" onClick={iptal}>İsteği iptal et</Dugme>
        </div>
      ) : z.durum === 'ret' || z.durum === 'iptal' || z.durum === 'sure-doldu' ? (
        <div className="tc-ay1-yetkili-cagir-dugmeler"><Dugme tur="ikincil" simge="bell" yukleniyor={gonderiyor} onClick={cagir}>Yeniden çağır</Dugme></div>
      ) : null}
      {hata === null ? null : <p role="alert" className="tc-ay1-soluk">{hata}</p>}
    </div>
  );
}
