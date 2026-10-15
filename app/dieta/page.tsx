import type { Metadata } from "next";
import { DietaView } from "@/components/screens/DietaView";

export const metadata: Metadata = { title: "Dieta" };

export default function Page() {
  return <DietaView />;
}
