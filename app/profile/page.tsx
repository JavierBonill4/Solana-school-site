import type { Metadata } from "next";
import { ProfileForm } from "@/components/ProfileForm";

export const metadata: Metadata = { title: "Profile · Solana Summer" };

export default function ProfilePage() {
  return (
    <>
      <header className="page-head">
        <div className="eyebrow">
          <span className="rule" />
          <span className="lbl">Profile</span>
        </div>
        <h1>Who you are here.</h1>
        <p className="deck">
          Your wallet is your account. Everything on this page is optional —
          it only changes how you appear and how a roster finds you.
        </p>
      </header>

      <section className="block">
        <ProfileForm />
      </section>
    </>
  );
}
