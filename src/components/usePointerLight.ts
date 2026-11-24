import { useEffect } from 'react';

/** Un único frame por movimiento, sin actualizar el estado de React. Ilumina también el borde cercano. */
export default function usePointerLight() {
  useEffect(() => {
    let frame = 0, x = 0, y = 0;
    const clear = () => { cancelAnimationFrame(frame); frame = 0; document.querySelectorAll('[data-lit]').forEach(el => el.removeAttribute('data-lit')); };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      x = event.clientX; y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        document.querySelectorAll<HTMLElement>('.glass, [data-glow]').forEach(surface => {
          const rect = surface.getBoundingClientRect();
          const nearby = x >= rect.left - 160 && x <= rect.right + 160 && y >= rect.top - 160 && y <= rect.bottom + 160;
          if (!nearby) { surface.removeAttribute('data-lit'); return; }
          surface.style.setProperty('--pointer-x', `${x - rect.left}px`);
          surface.style.setProperty('--pointer-y', `${y - rect.top}px`);
          surface.setAttribute('data-lit', '');
        });
      });
    };
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) clear(); };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerout', leave);
    window.addEventListener('blur', clear);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerout', leave); window.removeEventListener('blur', clear); clear(); };
  }, []);
}
