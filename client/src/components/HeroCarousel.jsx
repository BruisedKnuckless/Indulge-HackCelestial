import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Full-bleed promo carousel. The bottom of each slide fades into the page
 * background so the overlapping card row can sit on top of it.
 */
const SLIDES = [
  {
    id: 'banquet',
    eyebrow: 'Up to 35% off',
    title: 'Idle banquet space,\nfilled.',
    body: 'Halls and lawns from verified venues near you — bookable by the day.',
    to: '/s?category=banquet_space',
    bg: 'linear-gradient(105deg,#E8F0EE 0%,#DCE9E6 45%,#CFE0DC 100%)',
    image:
      'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=900&q=75',
  },
  {
    id: 'av',
    eyebrow: 'Min. 30% off',
    title: 'Monsoon AV Sale',
    body: 'Line arrays, LED walls and projector kits with crew included.',
    to: '/s?category=av_equipment',
    bg: 'linear-gradient(105deg,#FBE9DC 0%,#F7DCC8 50%,#F2CDB2 100%)',
    image:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=75',
  },
  {
    id: 'kitchen',
    eyebrow: 'Starting ₹1,800/hr',
    title: 'Kitchen capacity,\novernight.',
    body: 'FSSAI-licensed production kitchens available in off-peak hours.',
    to: '/s?category=kitchen_capacity',
    bg: 'linear-gradient(105deg,#E5ECF6 0%,#D8E3F2 50%,#C8D8EC 100%)',
    image:
      'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=900&q=75',
  },
  {
    id: 'furniture',
    eyebrow: 'Starting ₹45',
    title: 'Chairs, tables\n& more',
    body: 'Hire in lots of 25. Delivered, cleaned and collected.',
    to: '/s?category=furniture',
    bg: 'linear-gradient(105deg,#F3EDE3 0%,#EDE3D3 50%,#E4D6C0 100%)',
    image:
      'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=900&q=75',
  },
];

const Chevron = ({ dir }) => (
  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#6C7778" strokeWidth="2.5">
    <path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} strokeLinecap="round" />
  </svg>
);

export default function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const navigate = useNavigate();

  const go = useCallback((delta) => {
    setIndex((i) => (i + delta + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => go(1), 5000);
    return () => clearInterval(t);
  }, [go, paused]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative h-[240px] sm:h-[340px] lg:h-[420px] overflow-hidden">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => navigate(s.to)}
            aria-hidden={i !== index}
            tabIndex={i === index ? 0 : -1}
            className={`absolute inset-0 w-full text-left transition-opacity duration-500 ${
              i === index ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            style={{ background: s.bg }}
          >
            {/* Left padding clears the previous-slide chevron on wide screens. */}
            <div className="max-w-page mx-auto h-full px-6 sm:px-20 lg:px-24 flex items-center">
              <div className="max-w-[480px] pb-16">
                <p className="text-title sm:text-section font-bold text-ink mb-1">{s.eyebrow}</p>
                <h2 className="text-[26px] sm:text-[38px] lg:text-[46px] font-bold leading-[1.1] text-ink whitespace-pre-line mb-2">
                  {s.title}
                </h2>
                <p className="text-body sm:text-lead text-ink-soft max-w-[380px]">{s.body}</p>
              </div>

              <img
                src={s.image}
                alt=""
                className="hidden lg:block absolute right-[6%] bottom-[18%] w-[330px] h-[230px]
                           object-cover rounded shadow-card"
              />
            </div>
          </button>
        ))}

        {/* The fade that lets the card row overlap the hero. */}
        <div className="absolute inset-x-0 bottom-0 h-[120px] bg-gradient-to-b from-transparent to-ground pointer-events-none" />
      </div>

      {['left', 'right'].map((dir) => (
        <button
          key={dir}
          onClick={() => go(dir === 'left' ? -1 : 1)}
          aria-label={dir === 'left' ? 'Previous' : 'Next'}
          className={`absolute top-[35%] ${dir === 'left' ? 'left-2' : 'right-2'}
                      w-[52px] h-[74px] bg-white/85 hover:bg-white rounded
                      shadow-card hidden sm:flex items-center justify-center`}
        >
          <Chevron dir={dir} />
        </button>
      ))}

      <div className="absolute bottom-[104px] left-1/2 -translate-x-1/2 flex gap-1.5">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setIndex(i)}
            aria-label={`Slide ${i + 1}`}
            className={`h-[3px] rounded-full transition-all ${
              i === index ? 'w-6 bg-ink' : 'w-3 bg-ink/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
