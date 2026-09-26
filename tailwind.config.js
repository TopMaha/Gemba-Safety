/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        brand: 'hsl(var(--brand))',
        ok: 'hsl(var(--ok))',
        warn: 'hsl(var(--warn))',
        bad: 'hsl(var(--bad))',
        steel: 'hsl(var(--steel))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: { lg: '10px', md: '7px', sm: '4px' },
      boxShadow: {
        panel: '0 1px 2px hsl(var(--shadow)/0.10), 0 8px 24px -14px hsl(var(--shadow)/0.35)',
        lift: '0 2px 4px hsl(var(--shadow)/0.10), 0 18px 40px -20px hsl(var(--shadow)/0.45)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { opacity: '0', transform: 'translateY(12px) scale(.99)' }, to: { opacity: '1', transform: 'none' } },
        // กล่องโต้ตอบบนเดสก์ท็อปถูกจัดกลางจอด้วย translate(-50%,-50%)
        // จึงใช้ slide-in ร่วมกับมือถือไม่ได้ เพราะคีย์เฟรมสุดท้ายของตัวนั้นคือ transform: none
        // ซึ่งจะล้างการจัดกลางทิ้งเมื่อแอนิเมชันจบ (fill-mode both) แล้วกล่องจะไหลลงมุมขวาล่าง
        'dialog-in': {
          from: { opacity: '0', transform: 'translate(-50%, calc(-50% + 12px)) scale(.99)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%)' },
        },
        'bar-grow': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-up': 'fade-up .38s cubic-bezier(.2,.7,.3,1) both',
        'slide-in': 'slide-in .28s cubic-bezier(.2,.7,.3,1) both',
        'dialog-in': 'dialog-in .28s cubic-bezier(.2,.7,.3,1) both',
        'bar-grow': 'bar-grow .7s cubic-bezier(.2,.7,.3,1) both',
      },
    },
  },
  plugins: [],
};
