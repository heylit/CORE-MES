import { useEffect, useRef, useState } from 'react';
import {
  Box3, Color, DirectionalLight, Group, HemisphereLight, LinearSRGBColorSpace, LineBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Scene, Sphere,
  SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { IKI_YUZ, sekilKur, type OlcuEtiketi } from './sekil.ts';

// 3215 c: föyde ve dar ekranda ölçüden çizilen küçük döner model. Model saklanmaz; ölçü değişince yeniden kurulur. Çizici ancak
// kutu görünür bir boyuttayken açılır (föy gizliyken WebGL bağlamı tutulmaz). Yavaş kendi kendine döner; sürükleyince durur.
function renk(ad: string): Color {
  const deger = getComputedStyle(document.documentElement).getPropertyValue(ad).trim();
  return new Color().setStyle(deger === '' ? 'gray' : deger, LinearSRGBColorSpace);
}

const AZ = -0.75, EL = 0.42;

export interface KucukModelOzellikleri { form: string; olcu: Record<string, number>; renkAdi: string }

export function KucukModel({ form, olcu, renkAdi }: KucukModelOzellikleri) {
  const kutu = useRef<HTMLDivElement>(null);
  const tuval = useRef<HTMLCanvasElement>(null);
  const etiketler = useRef<HTMLDivElement>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const [rozetler, rozetYaz] = useState<string[]>([]);
  const [metinler, metinYaz] = useState<string[]>([]);
  const durum = useRef<{
    cizer: WebGLRenderer | null; sahne: Scene; kam: PerspectiveCamera; kok: Group; olculer: OlcuEtiketi[]; hedef: Vector3; yaricap: number;
    az: number; el: number; oto: boolean; kirli: boolean;
  } | null>(null);
  const ciz = useRef<() => void>(() => undefined);

  // Sahne ve çizici bir kez; ölçü değişimi aşağıdaki etkide.
  useEffect(() => {
    const el = kutu.current, cv = tuval.current;
    if (!el || !cv) return undefined;
    const sahne = new Scene();
    sahne.add(new HemisphereLight(renk('--sahne3b-gok'), renk('--sahne3b-ortam'), 0.9));
    const g1 = new DirectionalLight(renk('--sahne3b-isik'), 1.0); g1.position.set(1, 2, 1.5); sahne.add(g1);
    const g2 = new DirectionalLight(renk('--sahne3b-isik'), 0.45); g2.position.set(-1.5, 0.5, -1); sahne.add(g2);
    const kok = new Group(); sahne.add(kok);
    const azalt = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const d = { cizer: null as WebGLRenderer | null, sahne, kam: new PerspectiveCamera(32, 1, 1, 1e6), kok, olculer: [] as OlcuEtiketi[], hedef: new Vector3(), yaricap: 100, az: AZ, el: EL, oto: !azalt, kirli: true };
    durum.current = d;
    let kare = 0, w = 0, h = 0;
    const ac = (): boolean => {
      if (d.cizer) return true;
      try { d.cizer = new WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch { hataYaz('Bu cihazda üç boyutlu görüntü açılamadı.'); return false; }
      d.cizer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); d.cizer.outputColorSpace = SRGBColorSpace;
      return true;
    };
    const cizim = (): void => {
      kare = 0;
      const cw = el.clientWidth, ch = el.clientHeight;
      if (cw === 0 || ch === 0 || !ac() || !d.cizer) return;
      if (cw !== w || ch !== h) { w = cw; h = ch; d.cizer.setSize(w, h, false); d.kirli = true; }
      if (d.oto) { d.az += 0.004; d.kirli = true; }
      if (d.kirli) {
        const uz = (d.yaricap / Math.sin((d.kam.fov * Math.PI) / 360)) * (w / h < 1 ? 0.9 / Math.sqrt(w / h) : 0.8);
        d.kam.aspect = w / h;
        d.kam.position.set(d.hedef.x + uz * Math.cos(d.el) * Math.sin(d.az), d.hedef.y + uz * Math.sin(d.el), d.hedef.z + uz * Math.cos(d.el) * Math.cos(d.az));
        d.kam.near = Math.max(0.1, uz - d.yaricap * 3); d.kam.far = uz + d.yaricap * 4;
        d.kam.lookAt(d.hedef); d.kam.updateProjectionMatrix();
        d.cizer.render(d.sahne, d.kam);
        // Ölçü yazıları HTML katmanında; çakışan yazı aşağı kaydırılır.
        const yerler: { x: number; y: number; g: number }[] = [];
        const ogeler = etiketler.current ? Array.from(etiketler.current.children) as HTMLElement[] : [];
        d.olculer.forEach((o, i) => {
          const e = ogeler[i]; if (!e) return;
          const m = o.a.clone().add(o.b).multiplyScalar(0.5).project(d.kam);
          // Yazı hiçbir dönüş açısında kutudan taşmaz: kenara kıstırılır.
          const eg = e.offsetWidth, eh = e.offsetHeight + 4, kis = (v: number, yari: number, sinir: number) => Math.min(Math.max(v, yari), Math.max(yari, sinir - yari));
          const x = kis(((m.x + 1) / 2) * w, eg / 2 + 4, w);
          let y = kis(((1 - m.y) / 2) * h, eh / 2, h);
          for (let k = 0; k < 6 && yerler.some((r) => Math.abs(r.x - x) < (r.g + eg) / 2 && Math.abs(r.y - y) < eh); k++) y = kis(y + eh, eh / 2, h);
          yerler.push({ x, y, g: eg });
          e.style.transform = `translate(${String(x)}px, ${String(y)}px) translate(-50%, -50%)`;
        });
        d.kirli = false;
      }
      if (d.oto) kare = requestAnimationFrame(cizim);
    };
    ciz.current = () => { if (!kare) kare = requestAnimationFrame(cizim); };
    // ResizeObserver olmayan ortamda (eski tarayıcı, test) yalnız ilk çizim yapılır.
    const izle = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { d.kirli = true; ciz.current(); });
    izle?.observe(el);
    let ilk: { x: number; y: number; az: number; el: number } | null = null;
    const bas = (e: PointerEvent): void => { if ((e.target as HTMLElement).closest('button')) return; ilk = { x: e.clientX, y: e.clientY, az: d.az, el: d.el }; d.oto = false; el.setPointerCapture(e.pointerId); };
    const kay = (e: PointerEvent): void => {
      if (!ilk) return;
      d.az = ilk.az - (e.clientX - ilk.x) * 0.008; d.el = Math.max(-1.3, Math.min(1.45, ilk.el + (e.clientY - ilk.y) * 0.008)); d.kirli = true; ciz.current();
    };
    const birak = (): void => { ilk = null; };
    el.addEventListener('pointerdown', bas); el.addEventListener('pointermove', kay); el.addEventListener('pointerup', birak); el.addEventListener('pointercancel', birak);
    return () => {
      cancelAnimationFrame(kare); izle?.disconnect();
      el.removeEventListener('pointerdown', bas); el.removeEventListener('pointermove', kay); el.removeEventListener('pointerup', birak); el.removeEventListener('pointercancel', birak);
      kok.traverse((x) => { (x as { geometry?: { dispose: () => void } }).geometry?.dispose(); });
      d.cizer?.dispose(); durum.current = null;
    };
  }, []);

  // Ölçü nesnesi her çizimde yenidir; etki içeriğine (metne) bağlanır.
  const olcuMetni = JSON.stringify(olcu);
  useEffect(() => {
    const d = durum.current; if (!d) return;
    const o = JSON.parse(olcuMetni) as Record<string, number>;
    while (d.kok.children.length) { const c = d.kok.children.pop(); c?.traverse((x) => { (x as { geometry?: { dispose: () => void } }).geometry?.dispose(); }); }
    const govde = new MeshStandardMaterial({ color: renk(renkAdi), metalness: 0.2, roughness: 0.45, side: IKI_YUZ });
    const ikinci = new MeshStandardMaterial({ color: renk(form === 'oring' ? '--sahne3b-kaucuk' : '--sahne3b-karton'), roughness: 0.8, side: IKI_YUZ });
    const s = sekilKur(form, o, { govde, ikinci, kenar: new LineBasicMaterial({ color: renk('--sahne3b-koyu'), transparent: true, opacity: 0.25 }) });
    d.olculer = s?.olculer ?? [];
    metinYaz(d.olculer.map((o) => o.metin));
    rozetYaz([...(s?.kisaltildi ? ['Kısaltılmış gösterim'] : []), ...(s?.temsili ? [s.temsili] : [])]);
    if (s) {
      d.kok.add(s.grup);
      const k = new Box3().setFromObject(d.kok), sf = new Sphere(); k.getBoundingSphere(sf);
      d.hedef.copy(sf.center); d.yaricap = sf.radius || 100;
    }
    d.kirli = true; ciz.current();
  }, [form, renkAdi, olcuMetni]);
  // Yazılar basıldıktan sonra genişlikleri bilinir; konumları yeniden hesaplanır.
  useEffect(() => { const d = durum.current; if (d) { d.kirli = true; ciz.current(); } }, [metinler]);

  const dondur = () => { const d = durum.current; if (!d) return; d.oto = !d.oto; d.kirli = true; ciz.current(); };
  const ortala = () => { const d = durum.current; if (!d) return; d.az = AZ; d.el = EL; d.kirli = true; ciz.current(); };
  return (
    <div className="tc-om-model" ref={kutu} aria-label={`Ölçüden çizilen 3B model (${form})`} role="img">
      <canvas ref={tuval} />
      <div className="tc-om-etiketler" ref={etiketler} aria-hidden="true">
        {metinler.map((m, i) => <span key={`${String(i)}-${m}`} className="tc-om-etiket">{m}</span>)}
      </div>
      {rozetler.length > 0 && <div className="tc-om-rozetler">{rozetler.map((r) => <span key={r} className="tc-om-rozet">{r}</span>)}</div>}
      {hata && <p className="tc-om-hata">{hata}</p>}
      <div className="tc-om-araclar">
        <Dugme simge="rotate" onClick={dondur}>Döndür</Dugme>
        <Dugme simge="fit" onClick={ortala}>Ortala</Dugme>
      </div>
    </div>
  );
}

