import { useInRouterContext, useNavigate } from 'react-router-dom';
import type { KayitSecimi } from '#paylasilan/sozlesme/denetim.ts';
import { Dugme } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';

// 1384 b: kayıt ekranından o kaydın değişiklik geçmişine gidiş. Yalnız `denetim.oku` taşıyana görünür; liste ucu da onu ister.
// Sunucu en çok 50 çift kabul eder; çok iş emirli emirde fazlası düşer, ilk çiftler (kaydın kendisi) kalır.
export function gecmisAdresi(kayitlar: readonly KayitSecimi[]): string {
  return `/denetim?kayitlar=${encodeURIComponent(JSON.stringify(kayitlar.slice(0, 50)))}`;
}

// Yönlendiricisiz ağaçta (modüllerin kendi ekran testleri, gömülü önizleme) düğme çizilmez: gidecek yer yoktur.
export function GecmisDugmesi({ kayitlar }: { kayitlar: readonly KayitSecimi[] }) {
  const oturum = useOturum();
  const yonlendiriciVar = useInRouterContext();
  if (!yonlendiriciVar || !oturum.data?.islemler.includes('denetim.oku') || kayitlar.length === 0) return null;
  return <Gecis kayitlar={kayitlar} />;
}

function Gecis({ kayitlar }: { kayitlar: readonly KayitSecimi[] }) {
  const git = useNavigate();
  return <Dugme simge="clock" onClick={() => { void git(gecmisAdresi(kayitlar)); }}>Geçmiş</Dugme>;
}
