import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  GeriGonderGovdesi, GorevAyrintisiCevabi, GorevKomutuGovdesi, GorevOlayi, KisiSecenekleriCevabi, RolSecenekleriCevabi,
} from '#paylasilan/sozlesme/projeler.ts';
import { CokSatir, Dugme, DurumKutusu, Pencere, Rozet, Secim, type Secenek } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GOREV_DURUM_TONU, atamaMetni, gorevDurumMetni, tarihMetni } from './gosterim.ts';

// 3269: yapan, kontrol eden ve yedeği kişi ya da roldür. Seçici tek alanda ikisini verir: "k:<id>" kişi, "r:<id>" rol.
export interface Atama { kisiId: number | null; rolId: number | null }
export const atamaDegeri = (a: Atama): string => (a.kisiId !== null ? `k:${a.kisiId}` : a.rolId !== null ? `r:${a.rolId}` : '');
export function atamaCoz(deger: string): Atama {
  const [tur, id] = deger.split(':');
  if (id === undefined || id === '') return { kisiId: null, rolId: null };
  return tur === 'k' ? { kisiId: Number(id), rolId: null } : { kisiId: null, rolId: Number(id) };
}

export function useAtamaSecenekleri(): { secenekler: Secenek[]; hata: string | undefined } {
  const kisiler = useQuery({ queryKey: anahtarlar.sorumlular, queryFn: () => api.get<KisiSecenekleriCevabi>('/projeler/sorumlu-secenekleri') });
  const roller = useQuery({ queryKey: anahtarlar.roller, queryFn: () => api.get<RolSecenekleriCevabi>('/projeler/rol-secenekleri') });
  const secenekler = [
    ...(roller.data?.roller ?? []).map((r) => ({ deger: `r:${r.id}`, baslik: `Rol: ${r.ad}` })),
    ...(kisiler.data?.kisiler ?? []).map((k) => ({ deger: `k:${k.id}`, baslik: k.ad })),
  ];
  const hata = kisiler.isError || roller.isError ? hataIletisi(kisiler.error ?? roller.error, 'Kişi ve roller alınamadı') : undefined;
  return { secenekler, hata };
}

// Seçili atama listede yoksa (pasif kişi gibi) adıyla eklenir; seçim kaybolmaz.
export function AtamaSecimi({ etiket, deger, ad, secenekler, hata, bos, ipucu, kilitli = false, degistir }: {
  etiket: string; deger: string; ad: string | null; secenekler: readonly Secenek[]; hata: string | undefined; bos: string; ipucu?: string;
  kilitli?: boolean; degistir: (deger: string) => void;
}) {
  const liste = deger !== '' && !secenekler.some((s) => s.deger === deger) ? [{ deger, baslik: ad ?? deger }, ...secenekler] : secenekler;
  return (
    <Secim
      etiket={etiket} value={deger} bosSecenek={bos} secenekler={liste} hata={hata} disabled={kilitli} {...(ipucu === undefined ? {} : { ipucu })}
      onChange={(e) => { degistir(e.target.value); }}
    />
  );
}

const OLAY_METNI: Record<GorevOlayi['olay'], string> = {
  ustlen: 'üstlendi', basla: 'başladı', bitti: 'bitirdi', onay: 'onayladı', geri: 'geri gönderdi',
};
const anMetni = (an: string): string => `${tarihMetni(an.slice(0, 10))} ${an.slice(11, 16)}`;

type Komut = 'ustlen' | 'basla' | 'bitir' | 'onayla' | 'geri-gonder' | 'iptal';

// Görevin yan paneli: bilgiler, kişinin yapabileceği adımlar ve geçmiş. Düğmeleri sunucunun verdiği izinler açar; yazma aynı
// kuralla sunucuda yeniden denetlenir. İptal (3303-1 c) yalnız görev yazana verilir; görev silinmez, listede İptal olarak kalır.
export function GorevPaneli({ gorevId, kapat, duzenle, iptalEdebilir = false }: {
  gorevId: number; kapat: () => void; duzenle?: (() => void) | undefined; iptalEdebilir?: boolean;
}) {
  const istemci = useQueryClient();
  const [geri, geriYaz] = useState<string | null>(null);
  const [iptalSor, iptalSorYaz] = useState(false);
  const [geriHatasi, geriHatasiYaz] = useState<string | undefined>(undefined);
  const a = useQuery({
    queryKey: anahtarlar.gorevAyrinti(gorevId),
    queryFn: () => api.get<GorevAyrintisiCevabi>(`/projeler/gorevler/${gorevId}/ayrinti`),
  });
  const komut = useMutation({
    mutationFn: ({ ad, govde }: { ad: Komut; govde: GorevKomutuGovdesi | GeriGonderGovdesi }) =>
      api.post<GorevAyrintisiCevabi>(`/projeler/gorevler/${gorevId}/${ad}`, govde),
    onSuccess: async (cevap) => {
      istemci.setQueryData(anahtarlar.gorevAyrinti(gorevId), cevap);
      geriYaz(null);
      iptalSorYaz(false);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok, predicate: (q) => q.queryKey[1] !== 'gorev' });
    },
  });
  const g = a.data?.gorev;
  const izin = a.data?.izinler;
  const gonder = (ad: Komut) => { if (g) komut.mutate({ ad, govde: { surum: g.surum } }); };
  const geriGonder = () => {
    if (!g || geri === null) return;
    if (geri.trim() === '') { geriHatasiYaz('Neden geri gönderiyorsun? Gerekçe zorunlu.'); return; }
    komut.mutate({ ad: 'geri-gonder', govde: { gerekce: geri.trim(), surum: g.surum } });
  };

  const iptalAcik = iptalEdebilir && g !== undefined && g.durum !== 'bitti' && g.durum !== 'iptal';

  return (
    <Pencere
      acik
      kapat={kapat}
      tur="yan"
      baslik={g === undefined ? 'Görev' : g.ad}
      alt={(
        <>
          {iptalAcik && !iptalSor && <Dugme simge="x" onClick={() => { iptalSorYaz(true); }}>İptal et</Dugme>}
          {duzenle !== undefined && <Dugme simge="edit" onClick={duzenle}>Düzenle</Dugme>}
          <Dugme onClick={kapat}>Kapat</Dugme>
        </>
      )}
    >
      {a.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(a.error, 'Görev alınamadı')} yenile={() => { void a.refetch(); }} />}
      {g !== undefined && izin !== undefined && a.data !== undefined && (
        <div className="tc-prj-icerik">
          <div className="tc-prj-bas">
            <Rozet ton={GOREV_DURUM_TONU[g.durum]}>{gorevDurumMetni(g)}</Rozet>
            <span className="tc-prj-soluk">{a.data.proje.kod}{g.asama !== null && ` · ${g.asama}`}</span>
          </div>
          <dl className="tc-prj-bilgi">
            <dt>Yapan</dt><dd>{atamaMetni(g.sorumluAd, g.yapanRolAd, 'Atanmadı')}</dd>
            <dt>Kontrol eden</dt>
            <dd>
              {atamaMetni(g.kontrolKisiAd, g.kontrolRolAd, 'Yok')}
              {(g.yedekKontrolKisiAd !== null || g.yedekKontrolRolAd !== null) && (
                <span className="tc-prj-soluk"> · yedek: {atamaMetni(g.yedekKontrolKisiAd, g.yedekKontrolRolAd)}</span>
              )}
            </dd>
            <dt>Plan</dt><dd>{tarihMetni(g.planBaslangic)} – {tarihMetni(g.planBitis)}</dd>
            {g.aciklama !== null && <><dt>Açıklama</dt><dd>{g.aciklama}</dd></>}
          </dl>
          {(izin.ustlenebilir || izin.baslayabilir || izin.bitirebilir || izin.onaylayabilir) && (
            <div className="tc-prj-gorunum" role="group" aria-label="Görev adımları">
              {izin.ustlenebilir && <Dugme tur="birincil" simge="user-plus" yukleniyor={komut.isPending} onClick={() => { gonder('ustlen'); }}>Üstlen</Dugme>}
              {izin.baslayabilir && <Dugme simge="play" yukleniyor={komut.isPending} onClick={() => { gonder('basla'); }}>Başla</Dugme>}
              {izin.bitirebilir && <Dugme tur="birincil" simge="check" yukleniyor={komut.isPending} onClick={() => { gonder('bitir'); }}>Bitti</Dugme>}
              {izin.onaylayabilir && <Dugme tur="birincil" simge="check" yukleniyor={komut.isPending} onClick={() => { gonder('onayla'); }}>Onayla</Dugme>}
              {izin.onaylayabilir && geri === null && <Dugme simge="back" onClick={() => { geriYaz(''); geriHatasiYaz(undefined); }}>Geri gönder</Dugme>}
            </div>
          )}
          {g.durum === 'kontrolde' && !izin.onaylayabilir && (
            <p className="tc-prj-soluk">Kontrol edenin onayını bekliyor. İşi yapan kendi işini onaylayamaz.</p>
          )}
          {geri !== null && (
            <div className="tc-prj-icerik">
              <CokSatir
                etiket="Geri gönderme gerekçesi" required value={geri} maxLength={500} hata={geriHatasi}
                onChange={(e) => { geriYaz(e.target.value); geriHatasiYaz(undefined); }}
              />
              <div className="tc-prj-gorunum">
                <Dugme onClick={() => { geriYaz(null); }} disabled={komut.isPending}>Vazgeç</Dugme>
                <Dugme tur="birincil" simge="back" yukleniyor={komut.isPending} onClick={geriGonder}>Geri gönder</Dugme>
              </div>
            </div>
          )}
          {iptalAcik && iptalSor && (
            <div className="tc-prj-icerik" role="group" aria-label="Görevi iptal et">
              <p>Görev iptal edilsin mi? Görev silinmez; listede İptal olarak kalır ve proje ilerlemesine sayılmaz.</p>
              <div className="tc-prj-gorunum">
                <Dugme onClick={() => { iptalSorYaz(false); }} disabled={komut.isPending}>Vazgeç</Dugme>
                <Dugme tur="tehlike" simge="x" yukleniyor={komut.isPending} onClick={() => { gonder('iptal'); }}>Görevi iptal et</Dugme>
              </div>
            </div>
          )}
          {komut.isError && <p className="tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Görev işlenemedi')}</p>}
          {a.data.olaylar.length > 0 && (
            <ul className="tc-prj-liste" aria-label="Görev geçmişi">
              {a.data.olaylar.map((o, i) => (
                <li key={`${o.an}-${i}`}>
                  <span className="tc-prj-soluk tc-prj-tarih">{anMetni(o.an)}</span>
                  <span>{o.kisiAd ?? 'Bilinmeyen kişi'} {OLAY_METNI[o.olay]}{o.gerekce !== null && `: "${o.gerekce}"`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Pencere>
  );
}
