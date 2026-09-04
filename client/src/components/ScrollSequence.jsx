import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Scroll-driven image sequence for the landing page.
 *
 * A tall spacer section drives the scroll while a sticky canvas paints one
 * frame per scroll position, so the animation is scrubbed by the wheel rather
 * than played on a timer — the viewer controls the pace and can stop anywhere.
 *
 * Frames are drawn to a canvas instead of swapped as <img> src because
 * swapping sources at scroll speed causes visible flashes on decode; a canvas
 * blits an already-decoded bitmap.
 */

const FRAME_COUNT = 265;
const framePath = (i) => `/landing/Indulge_landing00216${String(i).padStart(3, '0')}.jpg`;

// How much scroll distance the whole sequence occupies. 700vh leaves ~600vh of
// travel across 265 frames (~20px per frame at a typical viewport), which is
// slow enough that every frame gets its moment rather than being skipped.
const SECTION_VH = 700;

// Parallel image requests. Enough to saturate a local server without opening so
// many sockets that the first frames are delayed behind the last ones.
const CONCURRENCY = 12;

// Height of the sticky site header (h-16). The section is pulled up by this
// much so the intro is genuinely full-bleed from the first frame, rather than
// starting below the header and only covering it once stuck.
const HEADER_H = 64;

export default function ScrollSequence() {
  const sectionRef = useRef(null);
  const canvasRef = useRef(null);
  const imagesRef = useRef([]);
  const frameRef = useRef(-1);
  const rafRef = useRef(0);

  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);

  /** Paint a frame, scaled to cover the viewport without distortion. */
  const draw = useCallback((index) => {
    const canvas = canvasRef.current;
    const img = imagesRef.current[index];
    if (!canvas || !img?.complete || !img.naturalWidth) return;

    const ctx = canvas.getContext('2d');
    const { width: cw, height: ch } = canvas;

    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;

    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }, []);

  /** Size the backing store to the device pixel ratio so frames stay sharp. */
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    if (frameRef.current >= 0) draw(frameRef.current);
  }, [draw]);

  // ---- preload -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let done = 0;
    let next = 0;

    imagesRef.current = new Array(FRAME_COUNT);

    const startOne = () => {
      if (cancelled || next >= FRAME_COUNT) return;

      const index = next++;
      const img = new Image();
      img.src = framePath(index);
      imagesRef.current[index] = img;

      const settle = () => {
        if (cancelled) return;
        done += 1;
        setLoaded(done);

        // Paint the opening frame the instant it lands so the section is never
        // an empty box while the rest streams in.
        if (index === 0) {
          frameRef.current = 0;
          draw(0);
        }
        if (done === FRAME_COUNT) setReady(true);
        startOne();
      };

      img.onload = settle;
      img.onerror = settle; // a missing frame must not stall the whole sequence
    };

    for (let i = 0; i < CONCURRENCY; i++) startOne();

    return () => {
      cancelled = true;
    };
  }, [draw]);

  // ---- scroll scrubbing --------------------------------------------------
  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);

    const onScroll = () => {
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;

        const section = sectionRef.current;
        if (!section) return;

        const travel = section.offsetHeight - window.innerHeight;
        const scrolled = -section.getBoundingClientRect().top;
        const pct = travel > 0 ? Math.min(1, Math.max(0, scrolled / travel)) : 0;

        setProgress(pct);

        const index = Math.min(FRAME_COUNT - 1, Math.round(pct * (FRAME_COUNT - 1)));
        if (index !== frameRef.current) {
          frameRef.current = index;
          draw(index);
        }
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Must clear the handle, not just cancel it: the ref doubles as the
      // "already scheduled" guard, so a stale non-zero value would make every
      // future scroll event return early and freeze the sequence.
      rafRef.current = 0;
    };
  }, [draw, resize]);

  const skip = () => {
    const section = sectionRef.current;
    if (!section) return;
    window.scrollTo({
      top: section.offsetTop + section.offsetHeight - window.innerHeight,
      behavior: 'smooth',
    });
  };

  const pctLoaded = Math.round((loaded / FRAME_COUNT) * 100);

  return (
    <section
      ref={sectionRef}
      style={{ height: `${SECTION_VH}vh`, marginTop: `-${HEADER_H}px` }}
      className="relative"
    >
      {/* z-50 sits above the sticky site header (z-40), so the sequence plays
          full-bleed and the header is revealed as the section scrolls away. */}
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-black z-50">
        <canvas ref={canvasRef} className="block w-full h-full" />

        {/* Loading veil — covers the canvas until every frame is decoded, so
            scrubbing never lands on a frame that has not arrived. */}
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-black">
            <div className="text-center px-6">
              <p className="wordmark text-white text-2xl mb-2">indulge.</p>
              <p className="text-white/50 text-sm mb-6">Preparing your experience…</p>

              <div className="w-[220px] h-[2px] bg-white/15 overflow-hidden mx-auto">
                <div
                  className="h-full bg-white transition-[width] duration-150"
                  style={{ width: `${pctLoaded}%` }}
                />
              </div>
              <p className="text-white/40 text-xs mt-2 tabular-nums">{pctLoaded}%</p>
            </div>
          </div>
        )}

        {ready && (
          <>
            {/* Scroll affordance, retired once the viewer starts moving. */}
            <div
              data-scroll-hint
              className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-2 pointer-events-none transition-opacity duration-500"
              style={{ opacity: progress > 0.02 ? 0 : 1 }}
            >
              {/* Dark on the frames' mid-grey backdrop, which white washes out
                  against — and it matches the wordmark the sequence resolves to. */}
              <span className="text-ink/70 text-xs tracking-[0.2em] uppercase">Scroll</span>
              <span className="w-[22px] h-[36px] rounded-full border border-ink/40 relative">
                <span className="absolute left-1/2 top-2 -translate-x-1/2 w-[3px] h-[6px] rounded-full bg-ink/70 animate-bounce" />
              </span>
            </div>

            <button
              onClick={skip}
              className="absolute top-5 right-5 text-ink/60 hover:text-ink text-xs tracking-wide border border-ink/25 hover:border-ink/60 rounded-full px-3 py-1.5 transition-colors"
            >
              Skip intro
            </button>

            {/* Sequence progress, mirroring the scrub position. */}
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-ink/10">
              <div className="h-full bg-ink" style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
