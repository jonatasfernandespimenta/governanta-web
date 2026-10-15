import type { Metadata } from "next";
import { PerguntarView } from "@/components/screens/PerguntarView";

export const metadata: Metadata = { title: "Perguntar" };

export default function Page() {
  return <PerguntarView />;
}
