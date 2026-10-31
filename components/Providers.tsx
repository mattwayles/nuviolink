"use client";

import AuthGate from "./AuthGate";
import Footer from "./Footer";
import Navbar from "./Navbar";
import { ProfilesProvider, ProfilesBanner } from "./Profiles";
import { ToastProvider } from "./Toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <AuthGate>
          <ProfilesProvider>
            <Navbar />
            <ProfilesBanner />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 sm:px-6">{children}</main>
          </ProfilesProvider>
        </AuthGate>
        <Footer />
      </div>
    </ToastProvider>
  );
}
