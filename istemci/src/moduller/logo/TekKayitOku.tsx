import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LogoTekKayitCevabi } from '#paylasilan/sozlesme/logo.ts';
import { Dugme, Girdi, Kart, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import './logo.css';

// Sınırlar sunucu sözleşmesindeki LOGO_TEK_KAYIT_EN_AZ ve LOGO_TEK_KAYIT_EN_COK ile aynıdır (istemci sözleşmeden yalnız tip ithal eder).
const LOGO_TEK_KAYIT_EN_AZ = 3;
const LOGO_TEK_KAYIT_EN_COK = 100;

// 3626: okuma akışında tek kaydı yeniden okuma. Önce Logo'dan alınır (GET), alınabildiyse aynaya yazılır (POST). Logo'da yoksa aynadaki kopya silinmez.
const AKISLAR = [
  { deger: 'malzeme-karti', baslik: 'Malzeme kartı (stok kodu)', etiket: 'Stok kodu', ipucu: "Logo'daki stok kodu." },
  { deger: 'fatura', baslik: 'Sipariş faturaları (sipariş numarası)', etiket: 'Sipariş numarası', ipucu: "Logo'ya giden satın alma siparişinin numarası; faturaları okunur." },
] as const;

export function TekKayitOku() {
  const oturum = useOturum();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [akis, akisYaz] = useState<(typeof AKISLAR)[number]['deger']>('malzeme-karti');
  const [kod, kodYaz] = useState('');
  const [sonuc, sonucYaz] = useState<LogoTekKayitCevabi | null>(null);
  const tanim = AKISLAR.find((a) => a.deger === akis) ?? AKISLAR[0];
  const yazabilir = oturum.data?.islemler.includes('ayarlar.yaz') === true;
  const gecerli = kod.trim().length >= LOGO_TEK_KAYIT_EN_AZ && kod.trim().length <= LOGO_TEK_KAYIT_EN_COK;
  const oku = useMutation({
    mutationFn: async (): Promise<LogoTekKayitCevabi> => {
      const k = kod.trim();
      const o = await api.get<LogoTekKayitCevabi>(`/logo/yonetim/akislar/${akis}/kayit?kod=${encodeURIComponent(k)}`);
      if (o.sonuc !== 'okundu') return o;
      return api.post<LogoTekKayitCevabi>(`/logo/yonetim/akislar/${akis}/kayit-yaz`, { kod: k }, { istekKimligi: yeniIstekKimligi() });
    },
    onSuccess: async (r) => {
      sonucYaz(r);
      bildir(r.sonuc === 'okundu' ? 'tamam' : 'bilgi', r.ileti);
      await istemci.invalidateQueries({ queryKey: ['entegrasyon', '/logo'] });
    },
    onError: (h) => { sonucYaz(null); bildir('hata', hataIletisi(h, 'Kayıt okunamadı.')); },
  });
  if (!yazabilir) return null;
  return (
    <Kart baslik="Tek kayıt oku" simge="search">
      <form className="tc-logo-tek" onSubmit={(e) => { e.preventDefault(); if (gecerli) oku.mutate(); }}>
        <p className="tc-logo-tek-not">Bir kaydı beklemeden Logo'dan yeniden okur ve kopyaya yazar. Akışın kendi okuması sürer; Logo'da bulunmayan kaydın kopyası silinmez.</p>
        <Secim etiket="Akış" value={akis} onChange={(e) => { akisYaz(e.target.value as typeof akis); sonucYaz(null); }}
          secenekler={AKISLAR.map((a) => ({ deger: a.deger, baslik: a.baslik }))} />
        <Girdi etiket={tanim.etiket} ipucu={tanim.ipucu} value={kod} maxLength={LOGO_TEK_KAYIT_EN_COK} onChange={(e) => { kodYaz(e.target.value); sonucYaz(null); }} />
        <div className="tc-logo-tek-dugme">
          <Dugme tur="birincil" simge="search" type="submit" disabled={!gecerli} yukleniyor={oku.isPending}>Logo'dan oku</Dugme>
        </div>
        {!gecerli && <p className="tc-logo-tek-not">{`En az ${String(LOGO_TEK_KAYIT_EN_AZ)} karakter yazın.`}</p>}
        {sonuc !== null && <p className="tc-logo-tek-not" role="status">{sonuc.ileti}</p>}
      </form>
    </Kart>
  );
}
