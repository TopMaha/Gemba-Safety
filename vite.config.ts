import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  /**
   * เสิร์ฟจาก root ของโดเมน (Cloudflare Pages) — ต้องเป็น '/' ไม่ใช่ './'
   * เพราะแอปใช้ client-side routing: ถ้าใช้ path แบบ relative แล้วเปิด deep link
   * เช่น /coaching/mgr_01 เบราว์เซอร์จะไปหา /coaching/assets/... แล้ว 404 จอขาว
   *
   * ถ้าต้องการไฟล์ที่ดับเบิลคลิกเปิดตรง ๆ ได้ (file://) ให้ใช้ `npm run build:file`
   * ซึ่งสั่ง --base=./ ทับค่านี้ (main.tsx จะสลับไปใช้ HashRouter ให้เองเมื่อเป็น file://)
   */
  base: '/',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 8080, host: true },
  preview: { port: 8080 },
});
