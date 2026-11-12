import { emirKuyrugu } from './emir-no.ts';

// Dar hücrede kod biçimli yazı (emir no, kalem kodu) ortadan kırpılır: baş kısım sığdığı kadar, ayırt eden kuyruk her zaman görünür.
// Boşluklu yazı (ad, cümle) olduğu gibi kalır; tamamı title'da.
export function OrtaKirpik({ metin }: { metin: string }) {
  const k = emirKuyrugu(metin);
  if (/\s/.test(metin) || k === metin) return <>{metin}</>;
  const son = k.slice(1);
  return (
    <span className="tc-py-ok" title={metin}>
      <span>{metin.slice(0, metin.length - son.length)}</span><span>{son}</span>
    </span>
  );
}
