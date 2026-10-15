import type { Metadata } from "next";
import { DespensaView } from "@/components/screens/DespensaView";

export const metadata: Metadata = { title: "Despensa" };

export default function Page() {
  return <DespensaView />;
}
