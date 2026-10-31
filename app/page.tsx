import { Suspense } from "react";
import Browse from "@/components/Browse";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <Browse />
    </Suspense>
  );
}
