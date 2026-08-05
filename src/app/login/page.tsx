import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { checkPassword, isAuthenticated, startSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  if (await isAuthenticated()) redirect(next ?? "/");

  async function signIn(formData: FormData) {
    "use server";
    const password = String(formData.get("password") ?? "");
    const target = String(formData.get("next") ?? "/") || "/";
    if (!checkPassword(password)) {
      redirect(`/login?error=1${target !== "/" ? `&next=${encodeURIComponent(target)}` : ""}`);
    }
    await startSession();
    redirect(target);
  }

  return (
    <main className="shell" style={{ maxWidth: 420 }}>
      <div className="brandbar">
        <Logo height={30} />
      </div>
      <header className="masthead" style={{ display: "block" }}>
        <div className="eyebrow">AI knowledge operations</div>
        <h1 style={{ fontSize: 38 }}>The knowledge loop</h1>
      </header>

      <form action={signIn} style={{ marginTop: 28 }}>
        {error ? <div className="notice notice-bad">Incorrect password.</div> : null}
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoFocus autoComplete="current-password" />
        <input type="hidden" name="next" value={next ?? "/"} />
        <button className="btn" type="submit" style={{ marginTop: 16 }}>
          Sign in
        </button>
      </form>
    </main>
  );
}
