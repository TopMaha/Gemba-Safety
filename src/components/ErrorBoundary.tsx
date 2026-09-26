import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * กันจอขาว — ถ้ามีข้อผิดพลาดตอน render ให้แสดงข้อความและปุ่มแก้ไข
 * แทนที่จะเหลือหน้าจอว่างเปล่าโดยไม่บอกอะไรเลย
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Gemba] render error:', error, info.componentStack);
  }

  /**
   * ทางออกสุดท้ายเมื่อหน้าจอเปิดไม่ขึ้น — ล้างสำเนาในเครื่องแล้วเริ่มใหม่
   *
   * กวาดทุกคีย์ที่ขึ้นต้นด้วย gemba. แทนการไล่ลบทีละชื่อ เพราะเวอร์ชันของสำเนา
   * ในเครื่องเปลี่ยนได้เรื่อย ๆ (v1 → v2 → v3) ถ้าไล่ลบทีละชื่อแล้วลืมแก้ตาม
   * ปุ่มนี้จะไม่ล้างอะไรเลย แล้วผู้ใช้จะค้างอยู่กับหน้าจอที่พังตลอดไป
   *
   * ข้อมูลบนเซิร์ฟเวอร์ไม่ได้หายไปด้วย รอบซิงก์ถัดไปดึงกลับมาครบ
   */
  reset = () => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('gemba.')) localStorage.removeItem(key);
    }
    location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-5">
        <div className="panel overflow-hidden">
          <div className="brand-stripe h-[3px] w-full" />
          <div className="p-6">
            <h1 className="text-lg font-semibold">เปิดหน้าจอไม่สำเร็จ</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              ระบบพบข้อผิดพลาดระหว่างแสดงผล ลองกดโหลดใหม่ หากยังไม่หาย ให้ล้างข้อมูลในเครื่องแล้วเริ่มใหม่
            </p>
            <pre className="mt-3 max-h-40 overflow-auto rounded-md border bg-muted/50 p-3 text-[11px] leading-relaxed">
              {error.message}
            </pre>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => location.reload()}
                className="press focusable h-10 flex-1 rounded-md border bg-card text-sm font-medium"
              >
                โหลดใหม่
              </button>
              <button
                onClick={this.reset}
                className="press focusable h-10 flex-1 rounded-md bg-accent text-sm font-medium text-accent-foreground"
              >
                ล้างข้อมูลแล้วเริ่มใหม่
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
