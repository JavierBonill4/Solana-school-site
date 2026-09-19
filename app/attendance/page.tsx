import type { Metadata } from "next";
import { AttendanceList } from "@/components/AttendanceList";

export const metadata: Metadata = {
  title: "Attendance · Solana Summer",
};

export default function AttendancePage() {
  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Attendance</span>
        </div>
        <h1>Which sessions you were in.</h1>
        <p className="deck">
          Rosters are exported from Google Meet and matched against the Meet
          name on your profile. If a session is missing and you were there, it
          is almost always a spelling difference — fix the name and it will
          appear.
        </p>
      </header>

      <section className="block">
        <AttendanceList />
      </section>
    </>
  );
}
