import type { Metadata, Viewport } from "next";
import "material-symbols/outlined.css";
import { KioskProvider } from "@/components/shell/KioskProvider";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Governanta", template: "%s · Governanta" },
  description: "Lista de compras, previsões e notas da casa.",
  applicationName: "Governanta",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Governanta", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b1916",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>
        <KioskProvider>{children}</KioskProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
