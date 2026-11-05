export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">BKH Assist</h1>
      <p>เซิร์ฟเวอร์ตรวจความครบถ้วนของการบันทึก HOSxP สำหรับ agent บนเครื่องผู้ใช้</p>
      <ul className="list-disc pl-6 font-mono text-sm">
        <li>GET /api/health</li>
        <li>POST /api/agent/check</li>
      </ul>
    </main>
  );
}
