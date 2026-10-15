import type { Metadata } from "next";
import { PlanejarView } from "@/components/screens/PlanejarView";

export const metadata: Metadata = { title: "Planejar" };

export default function Page() {
  return <PlanejarView />;
}
