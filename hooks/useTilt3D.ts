import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

interface TiltState {
  rotateX: number;
  rotateY: number;
  mouseX: number; // 0-1 normalized
  mouseY: number; // 0-1 normalized
  isHovered: boolean;
}

const MAX_TILT = 5; // degrees

export function useTilt3D() {
  if (Platform.OS !== 'web') {
    return {
      tiltStyle: {},
      shineStyle: {},
      tiltHandlers: {},
      shadowOffset: { x: 0, y: 0 },
    };
  }

  const ref = useRef<HTMLElement | null>(null);
  const [tilt, setTilt] = useState<TiltState>({
    rotateX: 0,
    rotateY: 0,
    mouseX: 0.5,
    mouseY: 0.5,
    isHovered: false,
  });

  const onMouseMove = useCallback((e: any) => {
    const el = ref.current ?? (e.currentTarget as HTMLElement);
    if (!el) return;
    ref.current = el;

    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width; // 0..1
    const y = (e.clientY - rect.top) / rect.height; // 0..1

    const rotateY = (x - 0.5) * 2 * MAX_TILT;  // -5..5
    const rotateX = (0.5 - y) * 2 * MAX_TILT;   // -5..5 (inverted for natural feel)

    setTilt({ rotateX, rotateY, mouseX: x, mouseY: y, isHovered: true });
  }, []);

  const onMouseLeave = useCallback(() => {
    setTilt({ rotateX: 0, rotateY: 0, mouseX: 0.5, mouseY: 0.5, isHovered: false });
  }, []);

  const onMouseEnter = useCallback((e: any) => {
    const el = e.currentTarget as HTMLElement;
    ref.current = el;
  }, []);

  const tiltStyle = {
    transform: `perspective(800px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)${tilt.isHovered ? ' scale3d(1.012, 1.012, 1.012)' : ''}`,
    transitionDuration: tilt.isHovered ? '60ms' : '400ms',
    transitionTimingFunction: tilt.isHovered
      ? 'linear'
      : 'cubic-bezier(0.22, 1, 0.36, 1)',
    transitionProperty: 'transform',
    willChange: 'transform',
    transformStyle: 'preserve-3d' as const,
  };

  const shineStyle = tilt.isHovered
    ? {
        position: 'absolute' as const,
        inset: 0,
        borderRadius: 16,
        background: `radial-gradient(circle at ${tilt.mouseX * 100}% ${tilt.mouseY * 100}%, rgba(255,255,255,0.08) 0%, transparent 60%)`,
        pointerEvents: 'none' as const,
        zIndex: 5,
      }
    : { display: 'none' as const };

  // Shadow shifts opposite to tilt direction
  const shadowOffset = {
    x: -tilt.rotateY * 1.2, // opposite of tilt Y
    y: tilt.rotateX * 1.2,  // opposite of tilt X
  };

  const tiltHandlers = {
    onMouseMove,
    onMouseEnter,
    onMouseLeave,
  };

  return { tiltStyle, shineStyle, tiltHandlers, shadowOffset };
}
