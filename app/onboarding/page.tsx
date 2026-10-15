import type { Metadata } from "next";
import { OnboardingView } from "@/components/screens/OnboardingView";

export const metadata: Metadata = { title: "Configuração inicial" };

export default function Page() {
  return <OnboardingView />;
}
