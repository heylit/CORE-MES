import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OnTalep } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Pencere, Rozet, Secim, Simge, useBildirim } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { SURE, anahtarlar, cagri, gunYaz } from './ortak.ts';
import './talep.css';

const NEDENLER = ['Atölyede yapılacak, fasona gitmeyecek', 'Başka talepte var', 'Stoktan ya da hazır parçadan karşılanacak', 'Diğer'] as const;
const GUN_MS = 86_400_000;

// Aciliyet: gereken gün eksi firmanın fason günü bugünü geçtiyse geç kalıyor, iki gün içindeyse bugün açılmalı. Tarihi ya da günü
// bilinmeyende rozet yoktur.
function aciliyet(o: OnTalep, bugun: Date): 'gec' | 'bugun' | null {
  if (o.gerekenTarih === null || o.terminGun === null) return null;
  const kalan = Math.round((new Date(`${o.gerekenTarih}T00:00:00`).getTime() - bugun.getTime()) / GUN_MS) - o.terminGun;
  return kalan < 0 ? 'gec' : kalan <= 2 ? 'bugun' : null;
}
const adimAdi = (o: { opNo: number; adim: string | null }) => `Op ${o.opNo}${o.adim ? ` ${o.adim}` : ''}`;

function Satir({ o, secili, sec, cevir, yoksay, bugun }: {
  o: OnTalep; secili: boolean; sec: (v: boolean) => void; cevir: () => void; yoksay: () => void; bugun: Date;
}) {
  const a = aciliyet(o, bugun);
  return (
    <li className={`sa-ot${secili ? ' sa-ot-secili' : ''}`}>
      <IsaretKutusu etiket={`${o.emirNo} ${adimAdi(o)} seç`} checked={secili} onChange={(e) => sec(e.target.checked)} className="sa-ot-sec" />
      <div className="sa-ot-govde">
        <div className="sa-talep-satir-ust">
          <Rozet ton="uyari" gorunum="cizgi">Fason adım</Rozet>
          <b>{o.adim ?? `Op ${o.opNo}`}</b>
          <span className="sa-talep-no">{o.miktar.toLocaleString('tr-TR')} {o.birim}</span>
          {o.gerekenTarih && <span className="sa-talep-not">gereken {gunYaz(o.gerekenTarih)}</span>}
          {a === 'gec' && <Rozet ton="hata">Geç kalıyor</Rozet>}
          {a === 'bugun' && <Rozet ton="uyari">Bugün açılmalı</Rozet>}
        </div>
        <div className="sa-ot-bilgi">
          <span><Simge ad="building" boyut="k" /> <span className="sa-talep-no">{o.emirNo}</span> · Op {o.opNo}</span>
          <span>Parça: {o.parca ? `${o.parca.kod} ${o.parca.ad}` : (o.urun ?? '—')}</span>
          <span>Firma: {o.firmaAdi ?? 'rotada yok'}</span>
          {o.terminGun !== null && <span>Firma süresi ~{o.terminGun} gün</span>}
        </div>
      </div>
      <div className="sa-ot-eylem">
        <Dugme simge="x" onClick={yoksay}>Yoksay</Dugme>
        <Dugme tur="birincil" simge="check" onClick={cevir}>Talebe çevir</Dugme>
      </div>
    </li>
  );
}

// 898 a: sistemin önerdiği ön talepler. Ön talep satın almaya gitmez; "Talebe çevir" formu dolu açar, gerekmeyen nedeniyle yoksayılır.
export function OnTalepler({ cevir }: { cevir: (l: readonly OnTalep[]) => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({ queryKey: anahtarlar.onTalepler, queryFn: () => cagri.get('/satin-alma-on-talepleri', SURE) });
  const [secili, seciliYaz] = useState<ReadonlySet<number>>(new Set());
  const [yoksayilan, yoksayilanYaz] = useState<OnTalep | null>(null);
  const [neden, nedenYaz] = useState<string>(NEDENLER[0]);
  const [not, notYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bugun] = useState(() => new Date(new Date().toDateString()));
  const yenile = () => void istemci.invalidateQueries({ queryKey: anahtarlar.onTalepler });
  const iletisi = (h: unknown) => (h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Kaydedilemedi; yeniden deneyin.');
  const yoksay = useMutation({
    mutationFn: (g: { isEmriId: number; neden: string }) => cagri.post('/satin-alma-on-talepleri/yoksay', { govde: { kaynak: 'fason', ...g }, ...SURE }),
    onSuccess: () => { bildir('tamam', 'Ön talep yoksayıldı.'); yoksayilanYaz(null); yenile(); },
    onError: (h) => hataYaz(iletisi(h)),
  });
  const geriAl = useMutation({
    mutationFn: (id: number) => cagri.post('/satin-alma-on-talepleri/geri-al', { govde: { id }, ...SURE }),
    onSuccess: yenile,
    onError: (h) => bildir('hata', iletisi(h)),
  });
  const ac = (o: OnTalep) => { yoksayilanYaz(o); nedenYaz(NEDENLER[0]); notYaz(''); hataYaz(null); };
  const kaydet = () => {
    if (yoksayilan === null) return;
    const metin = (neden === 'Diğer' ? not.trim() : [neden, not.trim()].filter(Boolean).join(': ')).slice(0, 200);
    if (metin === '') { hataYaz('Nedeni yazın.'); return; }
    yoksay.mutate({ isEmriId: yoksayilan.isEmriId, neden: metin });
  };

  const ontalepler = liste.data?.onTalepler ?? [];
  const secilenler = ontalepler.filter((o) => secili.has(o.isEmriId));
  const isaretle = (id: number, v: boolean) => seciliYaz((s) => { const y = new Set(s); if (v) y.add(id); else y.delete(id); return y; });
  const emirler = new Set(secilenler.map((o) => o.uretimEmriId));

  return (
    <Kart baslik="Ön talepler">
      <p className="sa-talep-not">
        Ön talep satın almaya gitmez. "Talebe çevir" deyince form dolu açılır; miktarı ve tarihi değiştirip gönderirsiniz. Gerekmeyeni nedeniyle yoksayın.
      </p>
      {liste.isPending ? <DurumKutusu durum="yukleniyor" />
        : liste.isError ? <DurumKutusu durum="hata" mesaj="Ön talepler okunamadı." yenile={() => void liste.refetch()} />
          : (
            <>
              <h3 className="sa-ot-grup"><Simge ad="wrench" boyut="k" /> Rotadaki fason adımlar <span className="sa-talep-not">siparişi ve talebi olmayan, firmaya gönderilmemiş</span></h3>
              {ontalepler.length === 0 ? <DurumKutusu durum="bos" mesaj="Bekleyen fason ön talep yok." />
                : (
                  <ul className="sa-talep-liste">
                    {ontalepler.map((o) => (
                      <Satir key={o.isEmriId} o={o} bugun={bugun} secili={secili.has(o.isEmriId)} sec={(v) => isaretle(o.isEmriId, v)}
                        cevir={() => cevir([o])} yoksay={() => ac(o)} />
                    ))}
                  </ul>
                )}
              {secilenler.length > 1 && (
                <div className="sa-ot-serit" role="region" aria-label="Seçili ön talepler">
                  <span>{secilenler.length} ön talep seçildi{emirler.size > 1 ? ' · farklı emirler, talep emre bağlanmaz' : ''}</span>
                  <span className="sa-ot-eylem">
                    <Dugme onClick={() => seciliYaz(new Set())}>Seçimi kaldır</Dugme>
                    <Dugme tur="birincil" simge="layers" onClick={() => cevir(secilenler)}>Tek talepte birleştir</Dugme>
                  </span>
                </div>
              )}
              {liste.data.yoksayilanlar.length > 0 && (
                <details className="sa-ot-yoksay">
                  <summary>Yoksayılanlar ({liste.data.yoksayilanlar.length})</summary>
                  <ul className="sa-talep-liste">
                    {liste.data.yoksayilanlar.map((y) => (
                      <li key={y.id} className="sa-ot">
                        <div className="sa-ot-govde">
                          <b>{y.baslik}</b>
                          <span className="sa-talep-not">{y.neden}{y.kisiAdi ? ` · ${y.kisiAdi}` : ''}</span>
                        </div>
                        <div className="sa-ot-eylem">
                          <Dugme simge="rotate" yukleniyor={geriAl.isPending && geriAl.variables === y.id} onClick={() => geriAl.mutate(y.id)}>Geri al</Dugme>
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
      <Pencere acik={yoksayilan !== null} kapat={() => yoksayilanYaz(null)} baslik={yoksayilan ? `Yoksay: ${yoksayilan.emirNo} ${adimAdi(yoksayilan)}` : 'Yoksay'}
        alt={<>
          <Dugme onClick={() => yoksayilanYaz(null)}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="x" yukleniyor={yoksay.isPending} onClick={kaydet}>Yoksay</Dugme>
        </>}>
        <div className="sa-talep">
          <p className="sa-talep-not">Ön talep listeden kalkar, "Yoksayılanlar"da kalır; geri alınabilir.</p>
          <Secim etiket="Neden" value={neden} onChange={(e) => nedenYaz(e.target.value)} secenekler={NEDENLER.map((n) => ({ deger: n, baslik: n }))} />
          <Girdi etiket={neden === 'Diğer' ? 'Neden (zorunlu)' : 'Not'} value={not} maxLength={150} onChange={(e) => notYaz(e.target.value)} />
          {hata && <p className="sa-talep-hata" role="alert">{hata}</p>}
        </div>
      </Pencere>
    </Kart>
  );
}
